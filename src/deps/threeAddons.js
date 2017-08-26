var THREE = require('three');

/*!
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 // "use strict";

 /*globals THREE*/

// Pincushion distortion function which maps from position on real screen to
// virtual screen (i.e. texture) relative to optical center:
//
//    p' = p (1 + K1 r^2 + K2 r^4 + ... + Kn r^(2n))
//
// where r is the distance in tan-angle units from the optical center,
// p the input point, and p' the output point.  Tan-angle units can be
// computed as distance on the screen divided by distance from the
// virtual eye to the screen.

THREE.CardboardBarrelDistortion = {
  uniforms: {
    "tDiffuse":   { type: "t", value: null },
    "distortion": { type: "v2", value: new THREE.Vector2(0.441, 0.156) },
    "projectionLeft":    { type: "v4", value: new THREE.Vector4(1.0, 1.0, -0.5, -0.5) },
    "unprojectionLeft":  { type: "v4", value: new THREE.Vector4(1.0, 1.0, -0.5, -0.5) },
    "backgroundColor": { type: "v4", value: new THREE.Vector4(0.0, 0.0, 0.0, 1.0) },
    "showCenter": { type: "i", value: 0},
    "dividerColor": { type: "v4", value: new THREE.Vector4(0.5, 0.5, 0.5, 1.0) },
  },

  vertexShader: [
    "varying vec2 vUV;",

    "void main() {",
    "vUV = uv;",
    "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}"
  ].join("\n"),

  // TODO: use min/max/saturate instead of conditionals
  fragmentShader: [
    "uniform sampler2D tDiffuse;",

    "uniform vec2 distortion;",
    "uniform vec4 backgroundColor;",
    "uniform vec4 projectionLeft;",
    "uniform vec4 unprojectionLeft;",
    "uniform int showCenter;",
    "uniform vec4 dividerColor;",

    // right projections are shifted and vertically mirrored relative to left
    "vec4 projectionRight = ",
    "(projectionLeft + vec4(0.0, 0.0, 1.0, 0.0)) * vec4(1.0, 1.0, -1.0, 1.0);",
    "vec4 unprojectionRight = ",
    "(unprojectionLeft + vec4(0.0, 0.0, 1.0, 0.0)) * vec4(1.0, 1.0, -1.0, 1.0);",

    "varying vec2 vUV;",

    "float poly(float val) {",
      "return (showCenter == 1 && val < 0.00005) ? ",
      "10000.0 : 1.0 + (distortion.x + distortion.y * val) * val;",
    "}",

    "vec2 barrel(vec2 v, vec4 projection, vec4 unprojection) {",
      "vec2 w = (v + unprojection.zw) / unprojection.xy;",
      "return projection.xy * (poly(dot(w, w)) * w) - projection.zw;",
    "}",

    "void main() {",
      "vec2 a = (vUV.x < 0.5) ? ",
      "barrel(vec2(vUV.x / 0.5, vUV.y), projectionLeft, unprojectionLeft) : ",
      "barrel(vec2((vUV.x - 0.5) / 0.5, vUV.y), projectionRight, unprojectionRight);",

      "if (dividerColor.w > 0.0 && abs(vUV.x - 0.5) < .001) {",
        "gl_FragColor = dividerColor;",
      "} else if (a.x < 0.0 || a.x > 1.0 || a.y < 0.0 || a.y > 1.0) {",
        "gl_FragColor = backgroundColor;",
      "} else {",
        "gl_FragColor = texture2D(tDiffuse, vec2(a.x * 0.5 + (vUV.x < 0.5 ? 0.0 : 0.5), a.y));",
      "}",
    "}"
  ].join("\n")
};


THREE.StereoEffect = function(renderer, scene, camera) {
  this.eyeSeparation = 7;
  this.focalLength = 500;  // Distance to the non-parallax or projection plane

  this.enabled = true;

  var _position = new THREE.Vector3();
  var _quaternion = new THREE.Quaternion();
  var _scale = new THREE.Vector3();

  var _cameraL = new THREE.PerspectiveCamera();
  var _cameraR = new THREE.PerspectiveCamera();

  var _fov;
  var _outer, _inner, _top, _bottom;
  var _ndfl, _halfFocalWidth, _halfFocalHeight;
  var _innerFactor, _outerFactor;

  // initialization
  renderer.autoClear = false;

  var _width;
  var _height;

  this.setSize = function(width, height) {
    _width = width / 2;
    _height = height;

    // renderer.setSize(width, height);
  };

  // this.render = function(scene, camera) {
  this.render = function (renderer, writeBuffer, readBuffer, delta) {
    scene.updateMatrixWorld();

    // var _width = readBuffer.width  / 2;
    // var _height = readBuffer.height;

    if(!camera.parent) camera.updateMatrixWorld();

    camera.matrixWorld.decompose(_position, _quaternion, _scale);

    // Effective fov of the camera
    _fov = THREE.Math.radToDeg(2 * Math.atan(Math.tan(THREE.Math.degToRad(camera.fov) * 0.5) / camera.zoom));

    _ndfl = camera.near / this.focalLength;
    _halfFocalHeight = Math.tan(THREE.Math.degToRad(_fov) * 0.5) * this.focalLength;
    _halfFocalWidth = _halfFocalHeight * 0.5 * camera.aspect;

    _top = _halfFocalHeight * _ndfl;
    _bottom = - _top;
    _innerFactor = (_halfFocalWidth + this.eyeSeparation / 2.0) / (_halfFocalWidth * 2.0);
    _outerFactor = 1.0 - _innerFactor;

    _outer = _halfFocalWidth * 2.0 * _ndfl * _outerFactor;
    _inner = _halfFocalWidth * 2.0 * _ndfl * _innerFactor;

    // left
    _cameraL.projectionMatrix.makeFrustum(
      - _outer,
      _inner,
      _bottom,
      _top,
      camera.near,
      camera.far
    );

    _cameraL.position.copy(_position);
    _cameraL.quaternion.copy(_quaternion);
    _cameraL.translateX(- this.eyeSeparation / 2.0);

    // right
    _cameraR.projectionMatrix.makeFrustum(
      - _inner,
      _outer,
      _bottom,
      _top,
      camera.near,
      camera.far
    );

    _cameraR.position.copy(_position);
    _cameraR.quaternion.copy(_quaternion);
    _cameraR.translateX(this.eyeSeparation / 2.0);

    //
    renderer.clear();
    renderer.enableScissorTest(true);

    renderer.setRenderTarget(readBuffer);

    renderer.setScissor(0, 0, _width, _height);
    renderer.setViewport(0, 0, _width, _height);
    renderer.render(scene, _cameraL, readBuffer, true);

    renderer.setScissor(_width, 0, _width, _height);
    renderer.setViewport(_width, 0, _width, _height);
    renderer.render(scene, _cameraR, readBuffer, true);

    renderer.setViewport(0, 0, 2 * _width, _height);

    renderer.enableScissorTest(false);
  };
};

//  THREE.CardboardStereoEffect = function (
//   cardboard_view, scene, camera, overrideMaterial, clearColor, clearAlpha ) {

//   this.cardboard_view = cardboard_view;
//   this.scene = scene;
//   this.camera = camera;

//   this.overrideMaterial = overrideMaterial;

//   this.clearColor = clearColor;
//   this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 1;

//   this.oldClearColor = new THREE.Color();
//   this.oldClearAlpha = 1;

//   this.enabled = true;
//   this.clear = true;
//   this.needsSwap = false;

//   // Stereo
//   var scope = this;

//   this.eyeSeparation = cardboard_view.device.inter_lens_distance;

//   Object.defineProperties( this, {
//     separation: {
//       get: function () {
//         return scope.eyeSeparation;
//       },
//       set: function ( value ) {
//         console.warn( 'THREE.StereoEffect: .separation is now .eyeSeparation.' );
//         scope.eyeSeparation = value;
//       }
//     },
//     targetDistance: {
//       get: function () {
//         return scope.focalLength;
//       },
//       set: function ( value ) {
//         console.warn( 'THREE.StereoEffect: .targetDistance is now .focalLength.' );
//         scope.focalLength = value;
//       }
//     }
//   } );

//   // internals

//   var _position = new THREE.Vector3();
//   var _quaternion = new THREE.Quaternion();
//   var _scale = new THREE.Vector3();

//   var _cameraL = new THREE.PerspectiveCamera();
//   var _cameraR = new THREE.PerspectiveCamera();

//   // initialization
//   renderer.autoClear = false;

//   this.render = function (renderer, writeBuffer, readBuffer, delta) {
//     var _width = readBuffer.width  / 2;
//     var _height = readBuffer.height;

//     this.scene.overrideMaterial = this.overrideMaterial;

//     if ( this.clearColor ) {
//       this.oldClearColor.copy( renderer.getClearColor() );
//       this.oldClearAlpha = renderer.getClearAlpha();

//       renderer.setClearColor(this.clearColor, this.clearAlpha);
//     }

//     // begin StereoEffect
//     scene.updateMatrixWorld();

//     if ( camera.parent === undefined ) {
//       camera.updateMatrixWorld();
//     }

//     camera.matrixWorld.decompose( _position, _quaternion, _scale );

//     this.eyeSeparation = this.cardboard_view.device.inter_lens_distance;

//     var projections = CARDBOARD.getProjectionMatrixPair(
//       this.cardboard_view.getLeftEyeFov(), camera.near, camera.far);

//     // left
//     _cameraL.projectionMatrix.copy(projections.left);
//     _cameraL.position.copy( _position );
//     _cameraL.quaternion.copy( _quaternion );
//     _cameraL.translateX( - this.eyeSeparation / 2.0 );

//     // right
//     _cameraR.projectionMatrix.copy(projections.right);
//     _cameraR.position.copy( _position );
//     _cameraR.quaternion.copy( _quaternion );
//     _cameraR.translateX( this.eyeSeparation / 2.0 );

//     renderer.clear();
//     renderer.enableScissorTest( true );

//     // Viewport can be changed during setRenderTarget call
//     // (which gets called from render() function).  Bug?
//     renderer.setRenderTarget(readBuffer);

//     renderer.setScissor( 0, 0, _width, _height);
//     renderer.setViewport( 0, 0, _width, _height);
//     renderer.render( scene, _cameraL, readBuffer, this.clear );

//     renderer.setScissor( _width, 0, _width, _height );
//     renderer.setViewport( _width, 0, _width, _height );
//     renderer.render( scene, _cameraR, readBuffer, this.clear );

//     renderer.setViewport(0, 0, 2 * _width, _height);

//     renderer.enableScissorTest( false );
//     // end StereoEffect

//     if ( this.clearColor ) {
//       renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
//     }

//     this.scene.overrideMaterial = null;
//   };
// };

//  CARDBOARD.CardboardView = function(screen_params, device_params) {
//   this.screen = screen_params;
//   this.device = device_params;
// };

// CARDBOARD.CardboardView.prototype = {

//   getLeftEyeFov: function() {
//     var screen = this.screen;
//     var cdp = this.device;
//     var distortion = this.distortion;

//     // The screen-to-lens distance can be used as a rough approximation
//     // of the virtual-eye-to-screen distance.
//     var eyeToScreenDist = cdp.screen_to_lens_distance;

//     var outerDist = (screen.width_meters - cdp.inter_lens_distance) / 2;
//     var innerDist =  cdp.inter_lens_distance / 2;
//     var bottomDist = CARDBOARD.getYEyeOffsetMeters(screen, cdp);
//     var topDist = screen.height_meters - bottomDist;

//     var outerAngle = THREE.Math.radToDeg(Math.atan(
//         distortion.distort(outerDist / eyeToScreenDist)));
//     var innerAngle = THREE.Math.radToDeg(Math.atan(
//         distortion.distort(innerDist / eyeToScreenDist)));
//     var bottomAngle = THREE.Math.radToDeg(Math.atan(
//         distortion.distort(bottomDist / eyeToScreenDist)));
//     var topAngle = THREE.Math.radToDeg(Math.atan(
//         distortion.distort(topDist / eyeToScreenDist)));

//     var maxFov = cdp.left_eye_field_of_view_angles;  // L, R, T, B

//     return {
//       left:     Math.min(outerAngle, maxFov[0]),
//       right:    Math.min(innerAngle, maxFov[1]),
//       bottom:   Math.min(bottomAngle, maxFov[3]),
//       top:      Math.min(topAngle, maxFov[2]),
//     };
//   },

//   getLeftEyeFovAndViewportNoDistortionCorrection: function() {
//     var screen = this.screen;
//     var cdp = this.device;
//     var distortion = this.distortion;

//     // The screen-to-lens distance can be used as a rough approximation
//     // of the virtual-eye-to-screen distance.
//     var eyeToScreenDist = cdp.screen_to_lens_distance;
//     var halfLensDistance = cdp.inter_lens_distance / 2 / eyeToScreenDist;
//     var screenWidth = screen.width_meters / eyeToScreenDist;
//     var screenHeight = screen.height_meters / eyeToScreenDist;
//     var xPxPerTanAngle = screen.width / screenWidth;
//     var yPxPerTanAngle = screen.height / screenHeight;

//     var eyePosX = screenWidth / 2 - halfLensDistance;
//     var eyePosY = CARDBOARD.getYEyeOffsetMeters(screen, cdp) / eyeToScreenDist;

//     var maxFov = cdp.left_eye_field_of_view_angles;  // L, R, T, B
//     var outerDist = Math.min(eyePosX, distortion.distortInverse(
//       Math.tan(THREE.Math.degToRad(maxFov[0]))));
//     var innerDist = Math.min(halfLensDistance, distortion.distortInverse(
//       Math.tan(THREE.Math.degToRad(maxFov[1]))));
//     var bottomDist = Math.min(eyePosY, distortion.distortInverse(
//       Math.tan(THREE.Math.degToRad(maxFov[3]))));
//     var topDist = Math.min(screenHeight - eyePosY, distortion.distortInverse(
//       Math.tan(THREE.Math.degToRad(maxFov[2]))));

//     var result = { fov: {}, viewport: {} };

//     result.fov.left = THREE.Math.radToDeg(Math.atan(outerDist));
//     result.fov.right = THREE.Math.radToDeg(Math.atan(innerDist));
//     result.fov.bottom = THREE.Math.radToDeg(Math.atan(bottomDist));
//     result.fov.top = THREE.Math.radToDeg(Math.atan(topDist));

//     result.viewport.x = Math.round((eyePosX - outerDist) * xPxPerTanAngle);
//     result.viewport.width = Math.round((eyePosX + innerDist) * xPxPerTanAngle)
//     - result.viewport.x;
//     result.viewport.y = Math.round((eyePosY - bottomDist) * yPxPerTanAngle);
//     result.viewport.height = Math.round((eyePosY + topDist) * yPxPerTanAngle)
//     - result.viewport.y;

//     return result;
//   },
// };

// Object.defineProperties(CARDBOARD.CardboardView.prototype, {
//   device: {
//     get: function() {
//       return this._device;
//     },
//     set: function(value) {
//       this._device = value;
//       this.distortion = new CARDBOARD.DistortionParams(
//         value.distortion_coefficients);
//     },
//   },
// });

// var METERS_PER_INCH = 0.0254;

// CARDBOARD.ScreenParams = function(width, height, dpi, border_size_meters) {
//   this.width = width;
//   this.height = height;
//   this.dpi = dpi;
//   this.border_size_meters = border_size_meters;
// };

// Object.defineProperties(CARDBOARD.ScreenParams.prototype, {
//   width_meters: {
//     get: function () {
//       return this.width / this.dpi * METERS_PER_INCH;
//     },
//   },
//   height_meters: {
//     get: function () {
//       return this.height / this.dpi * METERS_PER_INCH;
//     },
//   }
// });

// // Returns Y offset from bottom of given physical screen to lens center.
// CARDBOARD.getYEyeOffsetMeters = function(screen_params, device_params) {
//   var VerticalAlignmentType =
//   CARDBOARD.DeviceParams.VerticalAlignmentType;
//   switch (device_params.vertical_alignment) {
//     case VerticalAlignmentType.BOTTOM:
//       return device_params.tray_to_lens_distance - screen_params.border_size_meters;
//     case VerticalAlignmentType.TOP:
//       return screen_params.height_meters -
//         (device_params.tray_to_lens_distance - screen_params.border_size_meters);
//     default:  // VerticalAlignmentType.CENTER
//       return screen_params.height_meters / 2;
//   }
// };

// CARDBOARD.DistortionParams = function(coefficients) {
//   this.coefficients = coefficients;
// };

// CARDBOARD.DistortionParams.prototype = {

//   _distortionFactor: function(radius) {
//     var result = 1.0;
//     var rFactor = 1.0;
//     var rSquared = radius * radius;
//     this.coefficients.forEach(function (ki) {
//       rFactor *= rSquared;
//       result += ki * rFactor;
//     });
//     return result;
//   },

//   distort: function(radius) {
//     return radius * this._distortionFactor(radius);
//   },

//   distortInverse: function(radius) {
//     var r0 = radius / 0.9;
//     var r1 = radius * 0.9;
//     var r2;
//     var dr0 = radius - this.distort(r0);
//     var dr1;
//     while (Math.abs(r1 - r0) > 0.0001) {
//       dr1 = radius - this.distort(r1);
//       r2 = r1 - dr1 * ((r1 - r0) / (dr1 - dr0));
//       r0 = r1;
//       r1 = r2;
//       dr0 = dr1;
//     }
//     return r1;
//   },
// };

// CARDBOARD.getProjectionMatrixPair = function(left_fov_angles, near, far) {
//   var outer = Math.tan( THREE.Math.degToRad( left_fov_angles.left )) * near;
//   var inner = Math.tan( THREE.Math.degToRad( left_fov_angles.right )) * near;
//   var bottom = Math.tan( THREE.Math.degToRad( left_fov_angles.bottom )) * near;
//   var top = Math.tan( THREE.Math.degToRad( left_fov_angles.top )) * near;

//   return {
//     left:
//     new THREE.Matrix4().makeFrustum(-outer, inner, -bottom, top, near, far),
//     right:
//     new THREE.Matrix4().makeFrustum(-inner, outer, -bottom, top, near, far),
//   };
// };

// // Set barrel_distortion parameters given CardboardView.
// CARDBOARD.updateBarrelDistortion = function(barrel_distortion, cardboard_view,
//   camera_near, camera_far, show_center) {
//   var coefficients = cardboard_view.device.distortion_coefficients;
//   // Shader params include parts of the projection matrices needed to
//   // convert texture coordinates between distorted and undistorted
//   // frustums.  The projections are adjusted to include transform between
//   // texture space [0..1] and NDC [-1..1] as well as accounting for the
//   // viewport on the screen.
//   // TODO: have explicit viewport transform in shader for simplicity
//   var projections = CARDBOARD.getProjectionMatrixPair(
//     cardboard_view.getLeftEyeFov(), camera_near, camera_far);
//   barrel_distortion.uniforms.distortion.value
//   .set(coefficients[0], coefficients[1]);
//   var elements = projections.left.elements;
//   barrel_distortion.uniforms.projectionLeft.value
//   .set(elements[4*0 + 0], elements[4*1 + 1],
//    elements[4*2 + 0] - 1, elements[4*2 + 1] - 1)
//   .divideScalar(2);
//   var no_lens_view = cardboard_view.getLeftEyeFovAndViewportNoDistortionCorrection();
//   var viewport = no_lens_view.viewport;
//   var unprojections = CARDBOARD.getProjectionMatrixPair(
//     no_lens_view.fov, camera_near, camera_far);
//   elements = unprojections.left.elements;
//   var x_scale = viewport.width / (cardboard_view.screen.width / 2);
//   var y_scale = viewport.height / cardboard_view.screen.height;
//   var x_trans = 2 * (viewport.x + viewport.width / 2) /
//   (cardboard_view.screen.width / 2) - 1;
//   var y_trans = 2 * (viewport.y + viewport.height / 2) /
//   cardboard_view.screen.height - 1;
//   barrel_distortion.uniforms.unprojectionLeft.value
//   .set(elements[4*0 + 0] * x_scale, elements[4*1 + 1] * y_scale,
//    elements[4*2 + 0] - 1 - x_trans, elements[4*2 + 1] - 1 - y_trans)
//   .divideScalar(2);
//   barrel_distortion.uniforms.showCenter.value = show_center ? 1 : 0;
// };

// // Manually maintained map from WURFL.js device name to screen PPI
// // (assuming square pixels).  An optional match regex can be provided,
// // otherwise the key is expected to match exactly.
// CARDBOARD.SCREEN_PPI_BY_DEVICE = {
//   // Device name                [ PPI, (/Regex/) ]
//   'Apple iPhone 6':             [ 326 ],
//   'Apple iPhone 6 Plus':        [ 401 ],
//   'Google Nexus 5':             [ 445 ],
//   'Google Nexus 6':             [ 493 ],
//   'Motorola Moto X':            [ 312, / XT10(52|53|55|56|58|60) / ],
//   'Samsung Galaxy S III':       [ 306, /\(Galaxy S III\)/ ],
//   'Samsung Galaxy S4':          [ 441, /\(Galaxy S4\)/ ],
//   'Samsung Galaxy S5':          [ 432, /\(Galaxy S5\)/ ],
// };

// function _createCookie(path, name, value, days) {
//   var date = new Date();
//   date.setTime(date.getTime()+(days*24*60*60*1000));
//   document.cookie = name+"="+value+
//   "; expires="+date.toGMTString()+
//   "; path="+path;
// }

// function _readCookie(name) {
//   var nameEQ = name + "=";
//   var ca = document.cookie.split(';');
//   var i, c;
//   for (i=0; i < ca.length; i++) {
//     c = ca[i];
//     while (c.charAt(0) === ' ') {
//       c = c.substring(1, c.length);
//     }
//     if (c.indexOf(nameEQ) === 0) {
//       return c.substring(nameEQ.length, c.length);
//     }
//   }
//   return null;
// }

// // Plan for deducing display properties:
// //   * use map from vendor/model to database of resolution + density
// //   * otherwise prompt user for info and store in cookie
// // TODO: move fallback / cookie access out of this library
// CARDBOARD.findScreenParams = function() {
//   var ppi, device_name;
//   var ppi_entry = CARDBOARD.SCREEN_PPI_BY_DEVICE[WURFL.complete_device_name];
//   if (ppi_entry) {
//     ppi = ppi_entry[0];
//     console.log('Detected', WURFL.complete_device_name);
//   } else {
//     // try regex match
//     for (device_name in CARDBOARD.SCREEN_PPI_BY_DEVICE) {
//       ppi_entry = CARDBOARD.SCREEN_PPI_BY_DEVICE[device_name];
//       if (ppi_entry.length > 1 &&
//         WURFL.complete_device_name.match(ppi_entry[1])) {
//         ppi = ppi_entry[0];
//         console.log('Detected', device_name);
//         break;
//       }
//     }
//   }
//   if (WURFL.is_mobile) {
//     if (!ppi) {
//       console.log('Mobile device display properties unknown:',
//         WURFL.complete_device_name);
//       ppi = Number(_readCookie('ppi'));
//       if (ppi > 0) {
//         console.log('PPI from cookie:', ppi);
//       } else {
//         ppi = Number(window.prompt("Mobile device display properties " +
//           "unknown. Enter pixels per inch (PPI) value of your device:"));
//         if (ppi > 0) {
//           _createCookie(window.location.pathname, 'ppi', ppi, 9999);
//         } else {
//           ppi = 300;
//         }
//       }
//     }
//     var screen_width = Math.max(window.screen.width, window.screen.height) *
//     window.devicePixelRatio;
//     var screen_height = Math.min(window.screen.width, window.screen.height) *
//     window.devicePixelRatio;
//     return new CARDBOARD.ScreenParams(screen_width, screen_height, ppi,
//       0.003 /*bezel height*/);
//   }
//   // generic values for desktop
//   return new CARDBOARD.ScreenParams(1920, 1080, 445, 0);
// };


THREE.EffectComposer = function ( renderer, renderTarget ) {

  this.renderer = renderer;

  if ( renderTarget === undefined ) {

    var pixelRatio = renderer.getPixelRatio();

    var width  = Math.floor( renderer.context.canvas.width  / pixelRatio ) || 1;
    var height = Math.floor( renderer.context.canvas.height / pixelRatio ) || 1;
    var parameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };

    renderTarget = new THREE.WebGLRenderTarget( width, height, parameters );

  }

  this.renderTarget1 = renderTarget;
  this.renderTarget2 = renderTarget.clone();

  this.writeBuffer = this.renderTarget1;
  this.readBuffer = this.renderTarget2;

  this.passes = [];

  if ( THREE.CopyShader === undefined )
    console.error( "THREE.EffectComposer relies on THREE.CopyShader" );

  this.copyPass = new THREE.ShaderPass( THREE.CopyShader );

};

THREE.EffectComposer.prototype = {

  swapBuffers: function() {

    var tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;

  },

  addPass: function ( pass ) {

    this.passes.push( pass );

  },

  insertPass: function ( pass, index ) {

    this.passes.splice( index, 0, pass );

  },

  render: function ( delta ) {

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    var maskActive = false;

    var pass, i, il = this.passes.length;

    for ( i = 0; i < il; i ++ ) {

      pass = this.passes[ i ];

      if ( ! pass.enabled ) continue;

      pass.render( this.renderer, this.writeBuffer, this.readBuffer, delta, maskActive );

      if ( pass.needsSwap ) {

        if ( maskActive ) {

          var context = this.renderer.context;

          context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );

          this.copyPass.render( this.renderer, this.writeBuffer, this.readBuffer, delta );

          context.stencilFunc( context.EQUAL, 1, 0xffffffff );

        }

        this.swapBuffers();

      }

      if ( pass instanceof THREE.MaskPass ) {

        maskActive = true;

      } else if ( pass instanceof THREE.ClearMaskPass ) {

        maskActive = false;

      }

    }

  },

  reset: function ( renderTarget ) {

    if ( renderTarget === undefined ) {

      renderTarget = this.renderTarget1.clone();

      var pixelRatio = this.renderer.getPixelRatio();

      renderTarget.width  = Math.floor( this.renderer.context.canvas.width  / pixelRatio );
      renderTarget.height = Math.floor( this.renderer.context.canvas.height / pixelRatio );

    }

    this.renderTarget1.dispose();
    this.renderTarget1 = renderTarget;
    this.renderTarget2.dispose();
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

  },

  setSize: function ( width, height ) {

    this.renderTarget1.setSize( width, height );
    this.renderTarget2.setSize( width, height );

  }

};

/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Full-screen textured quad shader
 */

THREE.CopyShader = {

  uniforms: {

    "tDiffuse": { type: "t", value: null },
    "opacity":  { type: "f", value: 1.0 }

  },

  vertexShader: [

    "varying vec2 vUv;",

    "void main() {",

      "vUv = uv;",
      "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

    "}"

  ].join( "\n" ),

  fragmentShader: [

    "uniform float opacity;",

    "uniform sampler2D tDiffuse;",

    "varying vec2 vUv;",

    "void main() {",

      "vec4 texel = texture2D( tDiffuse, vUv );",
      "gl_FragColor = opacity * texel;",

    "}"

  ].join( "\n" )

};

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.ShaderPass = function ( shader, textureID ) {

  this.textureID = ( textureID !== undefined ) ? textureID : "tDiffuse";

  this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

  this.material = new THREE.ShaderMaterial( {

    defines: shader.defines || {},
    uniforms: this.uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader

  } );

  this.renderToScreen = false;

  this.enabled = true;
  this.needsSwap = true;
  this.clear = false;


  this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
  this.scene  = new THREE.Scene();

  this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
  this.scene.add( this.quad );

};

THREE.ShaderPass.prototype = {

  render: function ( renderer, writeBuffer, readBuffer, delta ) {

    if ( this.uniforms[ this.textureID ] ) {

      this.uniforms[ this.textureID ].value = readBuffer;

    }

    this.quad.material = this.material;

    if ( this.renderToScreen ) {

      renderer.render( this.scene, this.camera );

    } else {

      renderer.render( this.scene, this.camera, writeBuffer, this.clear );

    }

  }

};

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.RenderPass = function ( scene, camera, overrideMaterial, clearColor, clearAlpha ) {

  this.scene = scene;
  this.camera = camera;

  this.overrideMaterial = overrideMaterial;

  this.clearColor = clearColor;
  this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 1;

  this.oldClearColor = new THREE.Color();
  this.oldClearAlpha = 1;

  this.enabled = true;
  this.clear = true;
  this.needsSwap = false;

};

THREE.RenderPass.prototype = {

  render: function ( renderer, writeBuffer, readBuffer, delta ) {

    this.scene.overrideMaterial = this.overrideMaterial;

    if ( this.clearColor ) {

      this.oldClearColor.copy( renderer.getClearColor() );
      this.oldClearAlpha = renderer.getClearAlpha();

      renderer.setClearColor( this.clearColor, this.clearAlpha );

    }

    renderer.render( this.scene, this.camera, readBuffer, this.clear );

    if ( this.clearColor ) {

      renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );

    }

    this.scene.overrideMaterial = null;

  }

};

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.MaskPass = function ( scene, camera ) {

  this.scene = scene;
  this.camera = camera;

  this.enabled = true;
  this.clear = true;
  this.needsSwap = false;

  this.inverse = false;

};

THREE.MaskPass.prototype = {

  render: function ( renderer, writeBuffer, readBuffer, delta ) {

    var context = renderer.context;

    // don't update color or depth

    context.colorMask( false, false, false, false );
    context.depthMask( false );

    // set up stencil

    var writeValue, clearValue;

    if ( this.inverse ) {

      writeValue = 0;
      clearValue = 1;

    } else {

      writeValue = 1;
      clearValue = 0;

    }

    context.enable( context.STENCIL_TEST );
    context.stencilOp( context.REPLACE, context.REPLACE, context.REPLACE );
    context.stencilFunc( context.ALWAYS, writeValue, 0xffffffff );
    context.clearStencil( clearValue );

    // draw into the stencil buffer

    renderer.render( this.scene, this.camera, readBuffer, this.clear );
    renderer.render( this.scene, this.camera, writeBuffer, this.clear );

    // re-enable update of color and depth

    context.colorMask( true, true, true, true );
    context.depthMask( true );

    // only render where stencil is set to 1

    context.stencilFunc( context.EQUAL, 1, 0xffffffff );  // draw if == 1
    context.stencilOp( context.KEEP, context.KEEP, context.KEEP );

  }

};


THREE.ClearMaskPass = function () {

  this.enabled = true;

};

THREE.ClearMaskPass.prototype = {

  render: function ( renderer, writeBuffer, readBuffer, delta ) {

    var context = renderer.context;

    context.disable( context.STENCIL_TEST );

  }

};


module.exports = THREE;

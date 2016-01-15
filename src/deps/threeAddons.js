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

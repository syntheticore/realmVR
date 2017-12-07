var _ = require('eakwell');

var THREE = require('./deps/threeAddons.js');


var Renderer = function(scene, camera, device, renderPasses) {
  var self = this;

  self.renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true
  });

  var composer = new THREE.EffectComposer(self.renderer);

  // Mono pass
  var monoPass = new THREE.RenderPass(scene, camera);
  monoPass.enabled = false;

  // Stereo pass
  var stereoEffect = new THREE.StereoEffect(self.renderer, scene, camera);

  // Barrel Distortion
  var barrelDistortion = new THREE.ShaderPass(THREE.CardboardBarrelDistortion);
  barrelDistortion.uniforms.backgroundColor.value = new THREE.Vector4(0, 0, 0, 1);
  barrelDistortion.uniforms.dividerColor.value = new THREE.Vector4(0.2, 0.2, 0.2, 1.0);

  // Show result
  var blit = new THREE.ShaderPass(THREE.CopyShader);
  blit.renderToScreen = true;

  // Build Pipeline
  composer.addPass(monoPass);
  composer.addPass(stereoEffect);
  _.each(renderPasses, function(pass) { composer.addPass(pass) });
  composer.addPass(barrelDistortion);
  composer.addPass(blit);

  self.setStereo = function(stereo) {
    monoPass.enabled = !stereo;
    stereoEffect.enabled = stereo;
    barrelDistortion.enabled = stereo;
  };

  self.resize = function(width, height) {
    var dpr = (window.devicePixelRatio || 1);
    var overdraw = (dpr > 1 ? 1 : 2);
    var pixelRatio = dpr * overdraw;
    camera.fov = device.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    self.renderer.setPixelRatio(pixelRatio);
    self.renderer.setSize(width, height);
    stereoEffect.setSize(width, height);
    composer.setSize(width * pixelRatio, height * pixelRatio);
  };

  self.render = function(delta) {
    stereoEffect.eyeSeparation = device.eyeSeparation;
    var phoneHeight = 8.712;
    var offset = -(phoneHeight - device.eyeSeparation) / phoneHeight * 1.3;
    barrelDistortion.uniforms.projectionLeft.value = new THREE.Vector4(1.0, 1.0, offset, -0.5);
    barrelDistortion.uniforms.unprojectionLeft.value = new THREE.Vector4(1.0, 1.0, offset, -0.5);
    composer.render(delta || 1);
  };
};

module.exports = Renderer;

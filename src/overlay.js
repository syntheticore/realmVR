var _ = require('eakwell');
var THREE = require('three');

var Overlay = function(width, height, bounds, display) {
  var self = this;

  var fenceHeight = 2.2;
  var minFenceDistance = 0.2;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(80, width / height, 0.1, 10000);

  var renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  renderer.setSize(width, height);
  // renderer.setPixelRatio(window.devicePixelRatio);
  renderer.vr.enabled = true;
  renderer.vr.standing = true;
  renderer.vr.setDevice(display);

  self.canvas = renderer.domElement;

  // Prevent infinite recursion when rendering
  display = _.clone(display);
  display.submitFrame = _.noop;

  var getBounds = function() {
    var bounds = {
      front: 0, //XXX Calculate front
      back:  -2,  //device.bounds[0].z,
      right: 1,  //device.bounds[1].x,
      left:  -1  //device.bounds[2].x
    };
    bounds.width = Math.abs(bounds.right - bounds.left);
    bounds.length = Math.abs(bounds.back - bounds.front);
    bounds.center = new THREE.Vector3((bounds.right + bounds.left) / 2, 0, (bounds.back + bounds.front) / 2);
    return bounds;
  };

  var makeBoundingBox = function(bounds) {
    var cubeGeometry = new THREE.BoxGeometry(bounds.width, fenceHeight, bounds.length, 4, 4, 4);
    cubeGeometry.translate(0, bounds.height / 2, 0);
    var cube = new THREE.Mesh(cubeGeometry, new THREE.MeshBasicMaterial({
      flatShading: true,
      side: THREE.DoubleSide,
      color: 0x2194ce,
      transparent: true,
      opacity: 0.5,
      wireframe: true,
      depthWrite: false,
      wireframeLinewidth: 1
    }));
    cube.position.setX(bounds.center.x);
    cube.position.setZ(bounds.center.z);
    // cube.rotation.reorder('YXZ');
    // cube.renderOrder = 2;
    return cube;
  };

  var render = function() {
    renderer.render(scene, camera);
  };

  var boundingBox = makeBoundingBox(getBounds());
  var home = new THREE.AxesHelper(150);
  scene.add(home);
  scene.add(boundingBox);

  self.update = function(frameData) {
    var pos = (new THREE.Vector3()).fromArray(frameData.pose.position);
    var bounds = getBounds();
    var boundsRadius = bounds.width / 2;
    var centerDist = bounds.center.distanceTo(pos.clone().setY(0));
    var wallDist = boundsRadius - centerDist;
    boundingBox.material.opacity = Math.max(0, 1 - (wallDist / minFenceDistance));
    render();
  };
};

module.exports = Overlay;

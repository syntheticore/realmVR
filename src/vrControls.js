var _ = require('eakwell');
var THREE = require('three');

var Receiver = require('./receiver.js');
var SpaceManager = require('./spaceManager.js')

var RealmVRControls = function(scene, camera, handLeft, handRight, reticle, uuid) {
  var self = this;
  _.eventHandling(self);

  self.enabled = true;

  self.deviceHeadDistance = 4;

  var lastLeftActive = false;
  var lastRightActive = false;

  var receiver = new Receiver(uuid);
  var manager = new SpaceManager(receiver, self.deviceHeadDistance);
  var raycaster = new THREE.Raycaster();

  manager.once('playspaceFinished', function() {
    self.boundingBox = manager.boundingBox;
    self.emit('playspaceFinished');
  });

  camera.rotation.reorder('YXZ');
  handLeft.rotation.reorder('YXZ');
  handRight.rotation.reorder('YXZ');
  reticle.rotation.reorder('YXZ');

  var reticleDepth = 400;
  var counter = 0;
  var hit;

  receiver.on('configuration', function(config) {
    self.emit('configuration', [config]);
  });

  self.connect = function() {
    self.enabled = true;
  };

  self.disconnect = function() {
    self.enabled = false;
  };

  self.update = function(delta) {
    if(!self.enabled) return;
    var body = manager.update(delta);
    
    // Calculate view vector
    var viewVector = new THREE.Vector3(0, 0, -self.deviceHeadDistance / 2);
    viewVector.applyQuaternion(body.head.orientation);
    
    var upVector = new THREE.Vector3(0, 1, 0);
    upVector.applyQuaternion(body.head.orientation);

    // Move camera forward to make players head the center of rotation
    camera.position.copy(body.head.position).add(viewVector);
    camera.quaternion.copy(body.head.orientation);

    // Update hand postitions
    handLeft.position.copy(body.left.position);
    handRight.position.copy(body.right.position);
    
    // Orient hands towards camera
    handLeft.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
    handRight.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);

    // Position reticle
    if(counter++ % 30 == 0 && false) {
      raycaster.setFromCamera(new THREE.Vector2(), camera);
      hit = raycaster.intersectObjects(scene.children)[0];
    }
    if(hit) {
      if(hit.distance < reticleDepth) {
        reticleDepth = reticleDepth * 0.9 + hit.distance * 0.1;
      } else {
        reticleDepth = reticleDepth * 0.99 + hit.distance * 0.01;
      }
      reticleDepth = Math.min(reticleDepth, 500);
    }
    reticle.position.copy(camera.position).add(viewVector.normalize().multiplyScalar(reticleDepth * 0.95));
    reticle.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);

    // Move bounding box
    if(self.boundingBox) {
      self.boundingBox.position.copy(body.origin.position);
      self.boundingBox.quaternion.copy(body.origin.orientation);
    }

    // Watch hand triggers for changes
    if(body.left.active && !lastLeftActive) {
      self.emit('triggerLeft');
      self.emit('trigger', ['left']);
    } else if(!body.left.active && lastLeftActive) {
      self.emit('triggerEndLeft');
      self.emit('triggerEnd', ['left']);
    }
    if(body.right.active && !lastRightActive) {
      self.emit('triggerRight');
      self.emit('trigger', ['right']);
    } else if(!body.right.active && lastRightActive) {
      self.emit('triggerEndRight');
      self.emit('triggerEnd', ['right']);
    }
    lastLeftActive = body.left.active;
    lastRightActive = body.right.active;

    return {
      position: body.head.position,
      viewVector: viewVector.normalize(),
      upVector: upVector
    }
  };

  self.calibrate = function() {
    manager.calibrate();
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

var _ = require('eakwell');
var THREE = require('three');

var SpaceManager = require('./spaceManager.js')

var RealmVRControls = function(camera, handLeft, handRight, uuid, deviceHeadDistance) {
  var self = this;
  _.eventHandling(self);

  self.enabled = true;

  var lastLeftActive = false;
  var lastRightActive = false;

  var manager = new SpaceManager(uuid, deviceHeadDistance);

  camera.rotation.reorder('YXZ');
  handLeft.rotation.reorder('YXZ');
  handRight.rotation.reorder('YXZ');

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
    var viewVector = new THREE.Vector3(0, 0, -deviceHeadDistance / 2);
    viewVector.applyQuaternion(body.head.orientation);
    
    var upVector = new THREE.Vector3(0, 1, 0);
    upVector.applyQuaternion(body.head.orientation);

    // Move camera forward to make players head the center of rotation
    camera.position.copy(body.head.position).add(viewVector);
    camera.quaternion.copy(body.head.orientation);

    // Update hand postitions
    handLeft.position.copy(body.left.position);
    handRight.position.copy(body.right.position);
    
    // Orient hand towards camera
    handLeft.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
    handRight.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);

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

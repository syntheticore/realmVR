var THREE = require('three');

var RealmVRControls = function(object, manager, deviceHeadDistance) {
  var self = this;
  _.eventHandling(self);

  self.object = object;
  self.object.rotation.reorder('YXZ');

  self.enabled = true;

  var lastLeftActive = false;
  var lastRightActive = false;

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
    self.object.position.copy(body.head.position).add(viewVector);
    self.object.quaternion.copy(body.head.orientation);

    // Watch hand triggers for changes
    if(body.left.active && !lastLeftActive) {
      self.emit('triggerLeft');
    } else if(!body.left.active && lastLeftActive) {
      self.emit('triggerEndLeft');
    }
    if(body.right.active && !lastRightActive) {
      self.emit('triggerRight');
    } else if(!body.right.active && lastRightActive) {
      self.emit('triggerEndRight');
    }
    lastLeftActive = body.left.active;
    lastRightActive = body.right.active;

    return {
      position: body.head.position,
      viewVector: viewVector.normalize(),
      upVector: upVector
    }
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

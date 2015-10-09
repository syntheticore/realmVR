var THREE = require('three');

var RealmVRControls = function(object, manager) {
  var self = this;

  var deviceEyeDistance = 10;

  self.object = object;
  self.object.rotation.reorder('YXZ');

  self.enabled = true;

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
    var viewVector = new THREE.Vector3(0, 0, -deviceEyeDistance);
    viewVector.applyQuaternion(body.head.orientation);

    // Move camera forward to make players head the center of rotation
    viewVector.add(body.head.position);
    self.object.position.set(viewVector.x, viewVector.y, viewVector.z);
    
    self.object.quaternion.copy(body.head.orientation);
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

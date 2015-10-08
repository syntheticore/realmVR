var RealmVRControls = function(object, manager) {
  var self = this;

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
    self.object.quaternion.copy(body.head.orientation);
    self.object.position.set(body.head.position.x, body.head.position.y, body.head.position.z);
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

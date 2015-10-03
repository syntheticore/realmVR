var RealmVRControls = function(object, engine) {
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
    var body = engine.update(delta);
    self.object.quaternion.copy(body.head.orientation);
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

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

  self.update = function() {
    if(!self.enabled) return;
    var q = engine.update().head.orientation;
    self.object.quaternion.copy(q);
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};

module.exports = RealmVRControls;

var _ = require('eakwell');

var Client = require('./client.js');
var Fusion = require('./fusion.js');

var Device = function(uuid) {
  var self = this;
  _.eventHandling(self);

  self.fov = 70;
  self.eyeSeparation = 6.5;
  self.deviceHeadDistance = 12;

  var client = new Client(uuid);
  var posEngine = new Fusion(client, self.deviceHeadDistance);

  // Cardboard 2.0 switch activation
  _.on(window, 'touchstart click', function() {
    self.emit('headsetButtonPressed');
    // window.dispatchEvent(new Event('headsetButtonPressed'));
  }, false);

  // Trigger events
  self.proxy(posEngine, 'trigger');
  self.proxy(posEngine, 'triggerEnd');

  self.getState = function(delta) {
    var state = posEngine.body;
    state.corrections = posEngine.update(delta);
    return state;
  };

  self.calibrate = function() {
    return _.promise(function(ok) {
      self.once('headsetButtonPressed', function() {
        posEngine.calibrate();
        client.calibrationFinished();
        ok();
      });
    });
  };
};

module.exports = Device;

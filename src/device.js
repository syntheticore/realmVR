var _ = require('eakwell');

var Receiver = require('./receiver.js');
var PositionEngine = require('./positionEngine.js');

var Device = function(uuid) {
  var self = this;
  _.eventHandling(self);

  self.fov = 70;
  self.eyeSeparation = 6.5;
  self.deviceHeadDistance = 12;

  var receiver = new Receiver(uuid);
  var posEngine = new PositionEngine(receiver, self.deviceHeadDistance);

  // Cardboard 2.0 switch activation
  _.on(window, 'touchstart click', function() {
    self.emit('headsetButtonPressed');
    // window.dispatchEvent(new Event('headsetButtonPressed'));
  }, false);

  // Trigger events
  self.proxy(posEngine, 'trigger');
  self.proxy(posEngine, 'triggerEnd');

  console.log("getState");

  self.getState = function(delta) {
    var state = posEngine.body;
    state.corrections = posEngine.update(delta);
    return state;
  };

  self.calibrate = function() {
    return _.promise(function(ok) {
      self.once('headsetButtonPressed', function() {
        posEngine.calibrate();
        receiver.calibrationFinished();
        console.log("calibrated");
        ok();
      });
    });
  };
};

module.exports = Device;

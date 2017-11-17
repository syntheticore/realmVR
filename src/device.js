var _ = require('eakwell');

var Client = require('./client.js');
var Fusion = require('./fusion.js');

var Device = function() {
  var self = this;
  _.eventHandling(self);

  var url = new URL(window.location.href);
  var sessionId = url.searchParams.get('realm-vr-session') || 1;

  self.fov = 70;
  self.eyeSeparation = 6.5;

  var client = new Client(sessionId);
  var posEngine = new Fusion(client);

  self.bounds = [];

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
    //XXX calculate delta here
    state.corrections = posEngine.update(delta);
    return state;
  };

  self.setup = function() {
    return _.promise(function(ok) {
      // Calibrate device rotation in relation to tracked orientation
      self.once('headsetButtonPressed', function() {
        posEngine.calibrate();
        client.hmdPlaced();
        // Let the player define the bounds of the play space
        // by pressing the headset button in three different locations
        var handler = self.on('headsetButtonPressed', function() {
          self.bounds.push(self.getState().head.position.clone().setY(0))
          if(self.bounds.length == 3) {
            self.off(handler);
            client.playspaceFinished();
            ok();
          }
        });
      });
    });
  };
};

module.exports = Device;

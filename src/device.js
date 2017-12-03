var _ = require('eakwell');

var Client = require('./client.js');
var Fusion = require('./fusion.js');

var Device = function() {
  var self = this;
  _.eventHandling(self);

  self.fov = 80;
  self.eyeSeparation = 0.064;
  self.bounds = [];

  var url = new URL(window.location.href);
  var sessionId = url.searchParams.get('realm-vr-session') || 1;

  var client = new Client(sessionId);
  var fusion = new Fusion(client);

  // Cardboard 2.0 switch activation
  _.delay().then(function() {
    _.on(window, 'touchstart click', function() {
      self.emit('headsetButtonPressed');
      // window.dispatchEvent(new Event('headsetButtonPressed'));
    }, false);
  });

  // Trigger events
  self.proxy(fusion, 'trigger');
  self.proxy(fusion, 'triggerEnd');

  self.getState = function() {
    var state = fusion.body;
    state.corrections = fusion.update();
    return state;
  };

  self.setup = function() {
    return _.promise(function(ok) {
      // Calibrate device rotation in relation to tracked orientation
      self.once('headsetButtonPressed', function() {
        fusion.calibrate();
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

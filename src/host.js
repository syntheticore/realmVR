var _ = require('eakwell');

var ColorTracker = require('./tracker.js');

// Used in desktop browser to broadcast
// tracking data to connected mobile devices
var Host = function(width, height) {
  var self = this;
  _.eventHandling(self);

  var socket = io();

  // ID that clients use to connect
  self.uuid = 1; //_.uuid();

  socket.on('register', function(body) {
    self.emit('clientConnected');
  });

  socket.on('calibrationFinished', function(body) {
    self.emit('calibrationFinished');
  });
  
  socket.on('playspaceFinished', function(body) {
    self.emit('playspaceFinished');
  });

  // Track body through webcam
  var tracker = new ColorTracker(function(body) {
    // Broadcast coordinates to registered mobile devices
    if(!body.head || !body.head.position) return;
    socket.emit('track', {
      uuid: self.uuid,
      body: body
    });
  }, width, height);

  // Canvas with tracking markers on video stream
  self.canvas = tracker.videoSource.canvas;

  // Start broadcasting tracking data
  self.start = function() {
    // Broadcast empty packet to start session
    socket.emit('track', {uuid: self.uuid});
    return tracker.start();
  };

  // Stop broadcasting tracking data
  // Tracking can be restarted at any time
  self.stop = function() {
    return tracker.stop();
  };

  self.calibrate = function(cb) {
    tracker.calibrate(cb);
  };

  self.setColorCalibration = function(apple, cardinal) {
    tracker.setDeviations({
      apple: apple,
      cardinal: cardinal
    });
  };

  self.setEngineConfig = function(config) {
    socket.emit('configuration', {
      uuid: self.uuid,
      config: config
    });
  };
};

module.exports = Host;

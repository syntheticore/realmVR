var _ = require('eakwell');

var ColorTracker = require('./colorTracker.js');

// Used in desktop browser to broadcast
// tracking data to connected mobile devices
var Tracker = function(width, height, clientConnected) {
  var socket = io();
  var uuid = 1; //_.uuid();

  socket.on('register', function(body) {
    clientConnected && clientConnected();
  });

  // Track body through webcam
  var tracker = new ColorTracker(function(body) {
    // Broadcast coordinates to registered mobile devices
    if(!body.head || !body.head.position) return;
    socket.emit('data', {
      uuid: uuid,
      body: body
    });
  }, width, height);

  return {
    // ID that clients can use to connect
    uuid: uuid,

    // Canvas with tracking markers on video stream
    canvas: tracker.videoSource.canvas,

    // Start broadcasting tracking data
    start: function() {
      // Broadcast empty packet to start session
      socket.emit('data', {uuid: uuid});
      return tracker.start();
    },

    // Stop broadcasting tracking data
    // Tracking can be restarted at any time
    stop: function() {
      return tracker.stop();
    },

    calibrate: function(cb) {
      tracker.calibrate(cb);
    }
  };
};

module.exports = Tracker;

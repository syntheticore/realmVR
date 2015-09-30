var _ = require('eakwell');

var ColorTracker = require('./colorTracker.js');

// Used in desktop browser to broadcast
// tracking data to connected mobile devices
var Tracker = function(width, height) {
  var socket = io();
  var uuid = _.uuid();
  // Track body through webcam
  var tracker = new ColorTracker(function(body) {
    // Broadcast coordinates to registered mobile devices
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
      return tracker.start();
    },

    // Stop broadcasting tracking data
    // Tracking can be restarted at any time
    stop: function() {
      return tracker.stop();
    }
  };
};

module.exports = Tracker;

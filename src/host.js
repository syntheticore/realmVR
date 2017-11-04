var _ = require('eakwell');

var Tracker = require('./tracker.js');

var qr = _.onClient() ? require('browser-qr-js') : undefined;

// Used in desktop browser to broadcast
// tracking data to connected mobile devices
var Host = function(width, height, mobileUrl) {
  var self = this;
  _.eventHandling(self);

  mobileUrl = mobileUrl || window.location.href;

  var socket = io();

  // ID that clients use to connect
  self.uuid = 1; //_.uuid();

  socket.on('register', function(body) {
    self.emit('clientConnected');
    self.emit('status', [{
      title: 'Calibration',
      description: 'Put your headset on the floor and pull one trigger to start the calibration process',
      display: tracker.videoSource.canvas
    }]);
  });

  socket.on('hmdPlaced', function(body) {
    self.emit('hmdPlaced');
    tracker.calibrate(function() {
      self.emit('calibrationFinished');
      self.emit('status', [{
        title: 'Space setup',
        description: 'Define the bounds of your work space by walking to the left, right and back-most positions and pulling the trigger once at every location'
      }]);
    });
  });
  
  socket.on('playspaceFinished', function(body) {
    self.emit('playspaceFinished');
    self.emit('status', [{
      title: 'Enter VR',
      description: 'Put on your headset to start the experience'
    }]);
  });

  // Track body through webcam
  var tracker = new Tracker(function(result) {
    if(result.pose.hmd) result.pose.hmd.orientation = result.pose.hmd.orientation.toArray();
    if(result.pose.leftHand) result.pose.leftHand.orientation = result.pose.leftHand.orientation.toArray();
    if(result.pose.rightHand) result.pose.rightHand.orientation = result.pose.rightHand.orientation.toArray();
    // Broadcast coordinates to registered mobile devices
    socket.emit('track', {
      uuid: self.uuid,
      pose: result.pose,
      delay: Date.now() - result.timestamp
    });
    self.emit('track', [result.pose]);
  }, width, height);

  // Canvas with tracking markers on video stream
  self.canvas = tracker.videoSource.canvas;

  var makeQRCode = function() {
    var canvas = document.createElement('canvas');
    qr.canvas({
      canvas: canvas,
      value: mobileUrl + self.uuid + '?realm-vr-session=' + self.uuid,
      size: 9
    });
    return canvas;
  };

  // Start broadcasting tracking data
  self.start = function() {
    // Broadcast empty packet to start session
    socket.emit('track', {uuid: self.uuid});
    self.emit('status', [{
      title: 'Connect Headset',
      description: 'Hold your headset up to the QR code below to pair it with this computer',
      display: makeQRCode()
    }]);
    return tracker.start();
  };

  // Stop broadcasting tracking data
  // Tracking can be restarted at any time
  self.stop = function() {
    return tracker.stop();
  };

  self.setEngineConfig = function(config) {
    socket.emit('configuration', {
      uuid: self.uuid,
      config: config
    });
  };
};

module.exports = Host;

var _ = require('eakwell');

var Tracker = require('./tracker.js');

// Used in desktop browser to broadcast
// tracking data to connected mobile devices
var Host = function(width, height, mobileUrl, startSelector) {
  var self = this;
  _.eventHandling(self);

  mobileUrl = mobileUrl || window.location.href;

  var socket = io();

  // ID that clients use to connect
  self.uuid = 1; //_.uuid();

  var sendStatus = function(type, data) {
    socket.emit('status', self.uuid, type, data);
  };

  socket.on('register', function() {
    self.emit('clientConnected');
    self.emit('status', [{
      title: 'Calibration',
      description: 'Put your headset on the floor and pull one trigger to start the calibration process',
      display: tracker.videoSource.canvas
    }]);
  });

  socket.on('hmdPlaced', function() {
    tracker.calibrate().then(function() {
      self.emit('status', [{
        title: 'Space setup',
        description: 'Define the bounds of your work space by walking to the left, right and back-most positions and pulling the trigger once at every location'
      }]);
      sendStatus('calibrationFinished');
    }).catch(function(error) {
      console.error(error)
      self.emit('status', [{
        title: 'No Headset visible',
        description: 'Please check that your headset is visible in the camera preview then try again'
      }]);
    });
  });

  socket.on('playspaceFinished', function() {
    self.emit('status', [{
      title: 'Enter VR',
      description: 'Put on your headset to start the experience'
    }]);
  });

  // Track body through webcam
  var tracker = new Tracker(function(result) {
    self.emit('track', [result.pose]);
    // Broadcast coordinates to registered mobile devices
    if(result.pose.hmd) result.pose.hmd.orientation = result.pose.hmd.orientation.toArray();
    if(result.pose.leftHand) result.pose.leftHand.orientation = result.pose.leftHand.orientation.toArray();
    if(result.pose.rightHand) result.pose.rightHand.orientation = result.pose.rightHand.orientation.toArray();
    socket.emit('track', {
      uuid: self.uuid,
      pose: result.pose,
      delay: Date.now() - result.timestamp
    });
  }, width, height);

  // Canvas with tracking markers on video stream
  self.canvas = tracker.videoSource.canvas;

  var makeQRCode = function() {
    var canvas = document.createElement('canvas');
    var url = mobileUrl + self.uuid + '?realm-vr-session=' + self.uuid;
    if(startSelector) url += '&realm-vr-selector=' + startSelector;
    console.log(url);
    require('browser-qr-js').canvas({
      canvas: canvas,
      value: url,
      size: 9
    });
    return canvas;
  };

  // Start broadcasting tracking data
  self.start = function() {
    // Broadcast empty packet to start session
    socket.emit('track', {uuid: self.uuid});
    return tracker.start().then(function() {
      self.emit('status', [{
        title: 'Connect Headset',
        description: 'Hold your headset up to the QR code below to pair it with this computer',
        display: makeQRCode()
      }]);
    });
  };

  // Stop broadcasting tracking data
  // Tracking can be restarted at any time
  self.stop = function() {
    return tracker.stop();
  };
};

module.exports = Host;

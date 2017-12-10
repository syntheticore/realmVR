var _ = require('eakwell');
var THREE = require('three');

// Used on mobile device to receive
// tracking data from the specified desktop
var Receiver = function(sessionId) {
  var self = this;
  _.eventHandling(self);

  sessionId = sessionId || 1;

  var networkDelay = 6; // millis

  // Register for updates from desktop
  var socket = io();
  socket.emit('register', sessionId);

  // Emit track event when desktop sends data
  socket.on('track', function(data) {
    data.delay += networkDelay;
    if(data.pose.hmd) data.pose.hmd.orientation = (new THREE.Quaternion()).fromArray(data.pose.hmd.orientation);
    if(data.pose.leftHand) data.pose.leftHand.orientation = (new THREE.Quaternion()).fromArray(data.pose.leftHand.orientation);
    if(data.pose.rightHand) data.pose.rightHand.orientation = (new THREE.Quaternion()).fromArray(data.pose.rightHand.orientation);
    self.emit('track', [data]);
  });

  socket.on('calibrationFinished', function() {
    self.emit('calibrationFinished');
  });

  self.sendStatus = function(type, data) {
    socket.emit('status', sessionId, type, data);
  };

  LOG = function(txt) {
    socket.emit('debug', txt);
  };
};

module.exports = Receiver;

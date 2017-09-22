var _ = require('eakwell');
var THREE = require('three');

// Used on mobile device to receive
// tracking data from the specified desktop
var Receiver = function(uuid) {
  var self = this;
  _.eventHandling(self);

  uuid = uuid || 1;

  var networkDelay = 6; // millis

  // Register for updates from desktop
  var socket = io();
  socket.emit('register', uuid);
  
  // Emit track event when desktop sends data
  socket.on('track', function(result) {
    result.delay += networkDelay;
    if(result.pose.hmd) result.pose.hmd.orientation = (new THREE.Quaternion()).fromArray(result.pose.hmd.orientation);
    if(result.pose.leftHand) result.pose.leftHand.orientation = (new THREE.Quaternion()).fromArray(result.pose.leftHand.orientation);
    if(result.pose.rightHand) result.pose.rightHand.orientation = (new THREE.Quaternion()).fromArray(result.pose.rightHand.orientation);
    self.emit('track', [result]);
  });

  // Emit configuration event when desktop sends data
  socket.on('configuration', function(config) {
    self.emit('configuration', [config]);
  });

  // Tell server that the player has placed the headset into its tray
  this.hmdPlaced = function() {
    socket.emit('hmdPlaced', uuid);
  };

  // Tell server that the player has finished defining the bounds of the workspace
  this.playspaceFinished = function() {
    socket.emit('playspaceFinished', uuid);
  };

  LOG = function(txt) {
    socket.emit('debug', txt);
  };
};

module.exports = Receiver;

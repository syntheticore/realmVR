var _ = require('eakwell');

// Used on mobile device to receive
// tracking data from the specified desktop
var Receiver = function(uuid) {
  var self = this;
  _.eventHandling(self);

  // Register for updates from desktop
  var socket = io();
  socket.emit('register', uuid);
  
  // Emit track event when desktop sends data
  socket.on('track', function(body) {
    self.emit('track', [body]);
  });

  // Emit configuration event when desktop sends data
  socket.on('configuration', function(config) {
    self.emit('configuration', [config]);
  });

  // Tell server that the player has placed the headset into its tray
  this.calibrationFinished = function() {
    socket.emit('calibrationFinished', uuid);
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

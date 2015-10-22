var _ = require('eakwell');

// Used on mobile device to receive
// tracking data from the specified desktop
var Receiver = function(uuid, cb) {
  var socket = io();

  // Register for updates from desktop
  socket.emit('register', uuid);
  
  // Feed engine with real world positions
  socket.on('data', function(body) {
    console.log(body);
    if(body) cb(body);
  });

  LOG = function(txt) {
    socket.emit('debug', txt);
  };
};

module.exports = Receiver;

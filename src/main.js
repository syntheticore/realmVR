var _ = require('eakwell');

var THREE = require('./deps/threeAddons.js');


var realmVR = {
  THREE: THREE,
  UI: require('./ui.js'),
  Host: require('./host.js'),
  Device: require('./device.js'),
  Renderer: require('./renderer.js'),
  Utils: require('./utils.js'),
  Shim: require('./shim.js'),

  // Called from [server] to allow for web socket
  // communication between desktop and mobile devices
  serve: function(httpServer) {
    if(!httpServer) return;
    var IO = require('socket.io')(httpServer);
    var sessions = {};
    IO.on('connection', function(socket){
      // Mobile device registers for updates
      socket.on('register', function(uuid){
        if(sessions[uuid]) {
          // Save client in session
          sessions[uuid].clients.push(socket);
          // Tell host about client
          sessions[uuid].host.emit('register');
          console.log("realmVR: Device registered for ID " + uuid);
        } else {
          console.error("realmVR: Device tried to register for expired ID " + uuid);
        }
      });

      // Dispatch events of the given type between host and devices
      socket.on('status', function(uuid, type, data){
        var session = sessions[uuid];
        if(!session) return;
        if(socket == session.host) {
          _.each(session.clients, function(sock) {
            sock.emit(type, data);
          });
        } else {
          session.host.emit(type, data);
        }
      });

      // Desktop sends data to broadcast
      socket.on('track', function(data){
        // Desktop creates new session
        if(!sessions[data.uuid]) {
          sessions[data.uuid] = {
            host: socket,
            clients: []
          };
          console.log("realmVR: Desktop connected with ID " + data.uuid);
        // Dispatch data to registered clients in the same session
        } else {
          _.each(sessions[data.uuid].clients, function(sock) {
            sock.emit('track', data);
          });
        }
      });

      // Remove socket when client disconnects
      socket.on('disconnect', function(){
        _.each(sessions, function(session, uuid) {
          // Remove mobile device from session
          _.remove(session.clients, socket);
          // Remove session alltogether when desktop disconnects
          if(session.host == socket) {
            delete sessions[uuid];
            return;
          }
        });
        console.log("realmVR: Client disconnected");
      });

      socket.on('debug', function(txt){
        console.log(txt);
      });
    });
  }
};

module.exports = realmVR;

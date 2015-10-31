var _ = require('eakwell');

var realmVR = {
  Tracker: require('./tracker.js'),
  PositionEngine: require('./positionEngine.js'),
  SpaceManager: require('./spaceManager.js'),
  RealmVRControls: require('./vrControls.js'),

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
          console.log("RealmVR: Device registered for ID " + uuid);
        } else {
          console.error("RealmVR: Device tried to register for expired ID " + uuid);
        }
      });
      // Mobile device has finished calibration
      socket.on('calibrationFinished', function(uuid){
        if(sessions[uuid]) {
          sessions[uuid].host.emit('calibrationFinished');
          console.log("RealmVR: Device has calibrated for ID " + uuid);
        }
      });
      // Player has defined workspace bounds
      socket.on('playspaceFinished', function(uuid){
        if(sessions[uuid]) {
          sessions[uuid].host.emit('playspaceFinished');
          console.log("RealmVR: Player has defined workspace for ID " + uuid);
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
          console.log("RealmVR: Desktop connected with ID " + data.uuid);
        // Dispatch data to registered clients in the same session
        } else {
          _.each(sessions[data.uuid].clients, function(sock) {
            sock.emit('track', data.body);
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
        console.log("RealmVR: Client disconnected");
      });
      socket.on('debug', function(txt){
        console.log(txt);
      });
    });
  }
};

module.exports = realmVR;

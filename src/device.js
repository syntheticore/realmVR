var _ = require('eakwell');
var THREE = require('three');

var Client = require('./client.js');
var Fusion = require('./fusion.js');

var Device = function() {
  var self = this;
  _.eventHandling(self);

  // self.fov = 80;
  // self.eyeSeparation = 0.064;
  self.bounds = [];

  var url = new URL(window.location.href);
  var sessionId = url.searchParams.get('realm-vr-session') || 1;

  var client = new Client(sessionId);
  var fusion = new Fusion(client);

  var lenseOffsets = {
    left: 0.032,
    right: 0.032
  };

  client.on('track', function(result) {
    if(!result.pose.lenseOffsets) return;
    if(result.pose.lenseOffsets.left) lenseOffsets.left = result.pose.lenseOffsets.left;
    if(result.pose.lenseOffsets.right) lenseOffsets.right = result.pose.lenseOffsets.right;
  });

  // Cardboard 2.0 switch activation
  _.delay().then(function() {
    _.on(window, 'touchstart click', function() {
      self.emit('headsetButtonPressed');
      // window.dispatchEvent(new Event('headsetButtonPressed'));
    }, false);
  });

  // Trigger events
  self.proxy(fusion, 'trigger');
  self.proxy(fusion, 'triggerEnd');

  self.getPose = function() {
    var pose = fusion.body;
    pose.corrections = fusion.update();
    var vmL = new THREE.Matrix4();
    vmL.compose(pose.head.position, pose.head.orientation, new THREE.Vector3(1, 1, 1)).getInverse(vmL);
    pose.views = {
      left: vmL,
      right: vmL
    };
    return pose;
  };

  self.getProjections = function(depthNear, depthFar) {
    var dn = 0.01;
    var df = 10000;
    return {
      left: new THREE.Matrix4().makePerspective(-0.1, 0.1, 0.1, -0.1, depthNear || dn, depthFar || df),
      right: new THREE.Matrix4().makePerspective(-0.1, 0.1, 0.1, -0.1, depthNear || dn, depthFar || df)
    };
  };

  self.setup = function() {
    return _.promise(function(ok) {
      // Calibrate device rotation in relation to tracked orientation
      self.once('headsetButtonPressed', function() {
        fusion.calibrate();
        client.hmdPlaced();
        // Let the player define the bounds of the play space
        // by pressing the headset button in three different locations
        var handler = self.on('headsetButtonPressed', function() {
          self.bounds.push(self.getPose().head.position.clone().setY(0))
          if(self.bounds.length == 3) {
            self.off(handler);
            client.playspaceFinished();
            ok();
          }
        });
      });
    });
  };
};

module.exports = Device;

var _ = require('eakwell');

var Device = require('./device.js');
var TrackerUI = require('./ui.js');

var RealmVRDisplay = function() {
  var self = this;

  var sessionId = (new URL(window.location.href)).searchParams.get('realm-vr-session');

  var canvas;
  // var displayLayers = [];

  self.displayId = 'realmVR';
  self.displayName = 'realm VR';

  self.depthNear = 0.01;
  self.depthFar = 10000;

  self.isConnected = true;
  self.isPresenting = false;

  self.capabilities = {
    canPresent: true,
    hasExternalDisplay: false,
    hasPosition: true,
    maxLayers: 1
  };

  self.stageParameters = {
    sittingToStandingTransform: [],
    sizeX: 2,
    sizeY: 2
  };

  var setCanvas = function(c) {
    if(canvas) document.body.removeChild(canvas);
    canvas = c;
    if(!c) return;
    document.body.appendChild(canvas);
    canvas.style.position = 'fixed';
    canvas.style.top = 0;
    canvas.style.bottom = 0;
    canvas.style.left = 0;
    canvas.style.right = 0;
    canvas.style['z-index'] = 9999;
  };

  self.getEyeParameters = function() {
    return {
      renderWidth: document.documentElement.clientWidth / 2,
      renderHeight: document.documentElement.clientHeight
    };
  };

  self.getFrameData = function(frameData) {
    _.each({
      leftProjectionMatrix: Float32Array.from([0, 0, 0, 0]),
      leftViewMatrix: Float32Array.from([0, 0, 0, 0]),
      rightProjectionMatrix: Float32Array.from([0, 0, 0, 0]),
      rightViewMatrix: Float32Array.from([0, 0, 0, 0]),
      pose: {
        position: Float32Array.from([0, 0, 0]),
        linearVelocity: Float32Array.from([0, 0, 0]),
        linearAcceleration: Float32Array.from([0, 0, 0]),
        orientation: Float32Array.from([0, 0, 0, 0]),
        angularVelocity: Float32Array.from([0, 0, 0]),
        angularAcceleration: Float32Array.from([0, 0, 0]),
      },
      timestamp: Date.now()
    }, function(value, key) {
      frameData[key] = value;
    });
  };

  self.getLayers = function() {
    return [{
      leftBounds: [0.0, 0.0, 0.5, 1.0],
      rightBounds: [0.5, 0.0, 0.5, 1.0],
      source: canvas
    }];
    // return displayLayers;
  };

  self.resetPose = function() {
    // Resets the pose for this VRDisplay, treating its current VRPose.position and VRPose.orientation as the "origin/zero" values.
    // This corresponds to the heading correction in fusion calibration
  };

  self.requestAnimationFrame = sessionId ? window.requestAnimationFrame.bind(window) : _.noop;
  self.cancelAnimationFrame  = sessionId ? window.cancelAnimationFrame.bind(window) : _.noop;

  self.requestPresent = function(layers) {
    return new Promise(function(ok, fail) {
      if(!self.capabilities.canPresent) return fail('Cannot present');
      if(layers.length > self.capabilities.maxLayers) return fail('Too many layers given');
        if(sessionId) {
          // displayLayers = layers;
          setCanvas(layers[0].source);
          var device = new Device();
          device.setup();
          self.isPresenting = true;
          ok();
        } else {
          var ui = new TrackerUI();
          ui.startTracker();
          fail('Presentation happens on the mobile device');
        }
    });
  };

  self.exitPresent = function() {
    return new Promise(function(ok, fail) {
      if(!self.isPresenting) return fail('Not presenting');
      // displayLayers = [];
      setCanvas(null);
      self.isPresenting = false;
      ok();
    });
  };

  self.submitFrame = function() {
    //XXX render lens distortion correction
  };
};

module.exports = {
  RealmVRDisplay: RealmVRDisplay,

  shim: function() {
    var realmDisplay = new RealmVRDisplay();
    var getVRDisplays = navigator.getVRDisplays;

    navigator.getVRDisplays = function() {
      if(!getVRDisplays) return [realmDisplay];
      return getVRDisplays().then(function(displays) {
        displays.push(realmDisplay);
        return displays;
      });
    };
  }
};


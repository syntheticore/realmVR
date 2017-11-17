var _ = require('eakwell');

var Device = require('./device.js');
var TrackerUI = require('./ui.js');

var RealmVRDisplay = function() {
  var self = this;

  var canvas;
  // var displayLayers = [];
  var sessionId = getSessionId();

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
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style['z-index'] = 9999;
  };

  var getSelector = function(elem) {
    var parent = elem.parentNode;
    if(elem === document.body) return '';
    var index = '' + Array.prototype.indexOf.call(parent.children, elem);
    return getSelector(parent) + index;
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
          var selector = getSelector(window.event.target);
          var ui = new TrackerUI(selector);
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

var getSessionId = function() {
  return (new URL(window.location.href)).searchParams.get('realm-vr-session');
};

var getElement = function(selector) {
  var elem = document.body;
  _.each(selector, function(char) {
    var index = parseInt(char);
    elem = elem.childNodes[index];
  });
  return elem;
};

var enterVR = function() {
  var url = new URL(window.location.href);
  var startSelector = url.searchParams.get('realm-vr-selector');
  if(!startSelector) return;
  var button = getElement(startSelector);
  if(button.tagName == 'BUTTON') button.click();
};

var installDriver = function() {
  var realmDisplay = new RealmVRDisplay();
  var getVRDisplays = navigator.getVRDisplays || function() { return Promise.resolve([]) }

  navigator.getVRDisplays = function() {
    return getVRDisplays().then(function(displays) {
      if(getSessionId()) {
        displays = [];
        setTimeout(enterVR, 0);
      }
      displays.push(realmDisplay);
      return displays;
    });
  };

  VRFrameData = Object;
};

module.exports = {
  RealmVRDisplay: RealmVRDisplay,

  shim: function() {
    installDriver();
  }
};


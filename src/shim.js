var _ = require('eakwell');
var THREE = require('three');

var Device = require('./device.js');
var Overlay = require('./overlay.js');
var TrackerUI = require('./ui.js');

var RealmVRDisplay = function() {
  var self = this;

  var canvas;
  var device;
  var overlay;
  var overlayCanvas;
  var sessionId = getSessionId();
  var supersampling = 1;

  self.displayId = 'realmVR';
  self.displayName = 'realm VR';

  self.depthNear = 0.1;
  self.depthFar = 10000;

  self.isConnected = true;
  self.isPresenting = false;

  self.capabilities = {
    canPresent: true,
    hasExternalDisplay: false,
    hasPosition: true,
    maxLayers: 1
  };

  // self.stageParameters = {
  //   sittingToStandingTransform: [],
  //   sizeX: 2,
  //   sizeY: 2
  // };

  var appendCanvas = function(c) {
    document.body.appendChild(c);
    c.style.position = 'fixed';
    c.style.top = 0;
    c.style.left = 0;
    c.style.width = '100vw';
    c.style.height = '100vh';
    c.style['z-index'] = 9999;
  };

  var setCanvas = function(c) {
    if(canvas) document.body.removeChild(canvas);
    canvas = c;
    if(!canvas) return;
    appendCanvas(canvas);
    canvas.style.background = 'black';
  };

  var setOverlayCanvas = function(c) {
    if(overlayCanvas) document.body.removeChild(overlayCanvas);
    overlayCanvas = c;
    if(!overlayCanvas) return;
    appendCanvas(overlayCanvas);
  };

  self.getEyeParameters = function() {
    var scale = window.devicePixelRatio * supersampling;
    return {
      renderWidth: document.documentElement.clientWidth / 2 * scale,
      renderHeight: document.documentElement.clientHeight * scale
    };
  };

  var lastFrameData;

  self.getFrameData = function(frameData) {
    if(!device) return;

    frameData.timestamp = Date.now();

    // Pose
    var pose = device.getPose();
    pose.head.position.toArray(frameData.pose.position);
    pose.head.orientation.toArray(frameData.pose.orientation);

    // View matrices
    pose.views.left.toArray(frameData.leftViewMatrix);
    pose.views.right.toArray(frameData.rightViewMatrix);

    // Projection matrices
    var projections = device.getProjections(self.depthNear, self.depthFar);
    projections.left.toArray(frameData.leftProjectionMatrix);
    projections.right.toArray(frameData.rightProjectionMatrix);

    lastFrameData = frameData;
  };

  self.getLayers = function() {
    return [{
      leftBounds: [0.0, 0.0, 0.5, 1.0],
      rightBounds: [0.5, 0.0, 0.5, 1.0],
      source: canvas
    }];
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
        setCanvas(layers[0].source);
        device = new Device();
        device.setup().then(function() {
          overlay = new Overlay(canvas.width, canvas.height, device.bounds, self);
          setOverlayCanvas(overlay.canvas);
        });
        self.isPresenting = true;
        ok();
        emitEvent('vrdisplaypresentchange');
      } else {
        var selector = window.event && window.event.type + '-' + getSelector(window.event.target);
        var ui = new TrackerUI(selector);
        // ui.startTracker().then(ok).catch(fail);
        ui.startTracker();
        return fail('Presentation happens on the mobile device');
      }
    });
  };

  var emitEvent = function(eName) {
    var event = new CustomEvent(eName, {detail: {display: self}});
    window.dispatchEvent(event);
  };

  // emitEvent('vrdisplayblur');
  // emitEvent('vrdisplayfocus');

  self.exitPresent = function() {
    return new Promise(function(ok, fail) {
      if(!self.isPresenting) return fail('Not presenting');
      setCanvas(null);
      setOverlayCanvas(null);
      self.isPresenting = false;
      //XXX self.device.stop();
      device = null;
      emitEvent('vrdisplaypresentchange');
      ok();
    });
  };

  self.submitFrame = function() {
    //XXX render lens distortion correction
    if(!overlay) return;
    overlay.update(lastFrameData);
  };
};

var getSessionId = function() {
  return (new URL(window.location.href)).searchParams.get('realm-vr-session');
};

var getElement = function(selector) {
  var elem = document.body;
  _.each(selector, function(char) {
    var index = parseInt(char);
    elem = elem && elem.childNodes[index];
  });
  return elem;
};

var getSelector = function(elem) {
  var parent = elem.parentNode;
  if(elem === document.body || !parent) return '';
  var index = '' + Array.prototype.indexOf.call(parent.children, elem);
  return getSelector(parent) + index;
};

var didEnter;

var enterVR = function() {
  if(didEnter) return;
  var url = new URL(window.location.href);
  var startSelector = url.searchParams.get('realm-vr-selector');
  if(!startSelector) return;
  var parts = startSelector.split('-');
  var button = getElement(parts[1]);
  if(button) {
    var e = document.createEvent('HTMLEvents');
    e.initEvent(parts[0], true, true);
    button.dispatchEvent(e);
  }
  didEnter = true;
};

var makeGamepad = function(hand) {
  return {
    id: 'realmVR Motion Controller (' + hand + ')',
    displayId: 'realmVR',
    hand: hand,
    pose: {
      angularAcceleration: null,
      angularVelocity: null,
      hasOrientation: false,
      hasPosition: false,
      linearAcceleration: null,
      linearVelocity: null,
      orientation: null,
      position: null
    },
    axes: [0, 0],
    buttons: [{
      pressed: false,
      touched: true,
      value: 0
    }, {
      pressed: false,
      touched: true,
      value: 0
    }],
    timestamp: Date.now()
  };
};

var installDriver = function() {
  var realmDisplay = new RealmVRDisplay();
  var gamePads = {
    left: makeGamepad('left'),
    right: makeGamepad('right')
  };

  var getVRDisplays = navigator.getVRDisplays ?
    navigator.getVRDisplays.bind(navigator) : function() { return Promise.resolve([]) }

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

  var getGamepads = navigator.getGamepads.bind(navigator);
  navigator.getGamepads = function() {
    var gamepads = getGamepads();
    gamepads = _.compact(_.values(gamepads));
    gamepads.push(gamePads.left);
    gamepads.push(gamePads.right);
    return gamepads;
  };

  // window.VRFrameData = window.VRFrameData || function VRFrameData() {
  window.VRFrameData = function VRFrameData() {
    this.leftProjectionMatrix = new Float32Array(16);
    this.leftViewMatrix = new Float32Array(16);
    this.rightProjectionMatrix = new Float32Array(16);
    this.rightViewMatrix = new Float32Array(16);
    this.pose = {
      position: Float32Array.from([0, 0, 0]),
      linearVelocity: Float32Array.from([0, 0, 0]),
      linearAcceleration: Float32Array.from([0, 0, 0]),
      orientation: Float32Array.from([0, 0, 0, 0]),
      angularVelocity: Float32Array.from([0, 0, 0]),
      angularAcceleration: Float32Array.from([0, 0, 0]),
    };
    this.timestamp = Date.now();
  };

  var addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, cb, capture) {
    var obj = this;
    addEventListener.bind(obj)(type, function() {
      window.event = arguments[0];
      cb.apply(obj, arguments);
    }, capture);
  };
};

module.exports = {
  RealmVRDisplay: RealmVRDisplay,
  installDriver: installDriver
};

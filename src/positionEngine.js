var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');
var utils = require('./utils.js');

var PositionEngine = function(uuid, deviceHeadDistance) {
  var self = this;

  var convergenceHeadPos = 0.02;
  var convergenceHeadVelocity = 0.03;
  var convergenceHeading = 0.01;
  var convergenceHands = 0.6;

  self.body = {
    head: {
      position: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion()
    }
  };
  
  var xPredictor = new Predictor();
  var yPredictor = new Predictor();
  var zPredictor = new Predictor();

  var receiver = new Receiver(uuid, function(b) {
    xPredictor.feed(b.head.position.x);
    yPredictor.feed(b.head.position.y);
    zPredictor.feed(b.head.position.z);
  });

  var getTrackedPose = function() {
    return {
      head: {
        position: {
          x: xPredictor.predict() || 85,
          y: yPredictor.predict() || 40,
          z: zPredictor.predict() || -10
        }
      }
    };
  };

  var screenOrientation = window.orientation || 0;

  _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    lastOrientation = undefined;
  });

  var alphaPredictor = new Predictor(0, 360);
  var betaPredictor = new Predictor(-180, 180);
  var gammaPredictor = new Predictor(-90, 90);
  var lastHeading = 0;

  var getDeviceOrientation = function() {
    return {
      alpha: alphaPredictor.predict() || 90,
      beta: betaPredictor.predict()   || 100,
      gamma: gammaPredictor.predict() || 0,
      heading: lastHeading
    };
  };

  _.on(window, 'deviceorientation', function(e) {
    alphaPredictor.feed(e.alpha);
    betaPredictor.feed(e.beta);
    gammaPredictor.feed(e.gamma);
    lastHeading = e.webkitCompassHeading;
  });

  var velocity = new THREE.Vector3(0, 0, 0);
  var shakiness = 0;

  _.on(window, 'devicemotion', function(e) {
    // var acceleration = new THREE.Vector3(e.acceleration.x, e.acceleration.y, e.acceleration.z); // Portrait
    var acceleration = new THREE.Vector3(e.acceleration.y, -e.acceleration.x, -e.acceleration.z); // Landscape
    // Convert from device space to world space
    acceleration.applyQuaternion(self.body.head.orientation);
    // Integrate acceleration over time to yield velocity
    velocity.x += dampenAcceleration(acceleration.x * e.interval, velocity.x, e.interval);
    velocity.y += dampenAcceleration(acceleration.y * e.interval, velocity.y, e.interval);
    velocity.z += dampenAcceleration(acceleration.z * e.interval, velocity.z, e.interval);
    // LOG("X: " + velocity.x + " Y: " + velocity.y + " Z: " + velocity.z);
    shakiness = shakiness * 0.5 + 
                (
                  // (Math.abs(acceleration.x) + Math.abs(acceleration.y) + Math.abs(acceleration.z)) / 3 +
                  (Math.abs(e.rotationRate.alpha) + Math.abs(e.rotationRate.beta) + Math.abs(e.rotationRate.gamma)) / 3
                ) * 0.5;
  });

  var dampenAcceleration = function(acceleration, velocity, interval) {
    var maxVelocity = 50;
    // Correct more aggressively the closer we get to maxVelocity
    var correctionFactor = Math.min(1, Math.abs(velocity) / maxVelocity);
    // Strengthen naturally opposing movements, weaken movements that would further accelerate us
    var opposing = ((acceleration >= 0 && velocity < 0) || (acceleration < 0 && velocity >= 0));
    var dampened = acceleration * (opposing ? (1 + correctionFactor) : (1 - correctionFactor));
    // Slowly converge towards zero to cancel remaining velocity when standing still
    var braking = dampened - (velocity * interval * 50 * (1 + Math.abs(acceleration)) * convergenceHeadVelocity);
    return braking;
  };

  var getAbsoluteHeading = function() {
    var headingAbs;
    var orientation = getDeviceOrientation();
    var beta = orientation.beta;
    // Only in this interval can compass values be trusted
    //XXX if this should not work on android, compare gamma interval instead of beta
    if(beta < 90 && beta > -90 && orientation.heading != undefined) {
      // Measure real heading with possible noise
      headingAbs = orientation.heading + (orientation.gamma > 0 ? beta : -beta);
      if(headingAbs < 0) {
        headingAbs = headingAbs + 360;
      } else if(headingAbs > 360) {
        headingAbs = headingAbs - 360;
      }
      headingAbs = 360 - headingAbs;
    }
    return headingAbs;
  };

  var minimalRotation = function(angle) {
    if(angle >= 360) {
      angle = angle - 360;
    }
    if(angle < 0) {
      angle = 360 - angle;
    }
    if(Math.abs(angle) > 180) {
      return (360 - Math.abs(angle)) * (angle > 0 ? -1 : 1);
    }
    return angle;
  }

  var getHeadingDiff = function() {
    var compass = getAbsoluteHeading();
    if(compass) {
      var diff = getDeviceOrientation().alpha - compass;
      return minimalRotation(diff);
    }
  };

  var devicePosition = new THREE.Vector3();
  var initialHeadingDiff = 0;
  var initialAlpha = 0;

  var lastHeadingDiff = 0;
  var smoothDrift = 0;

  window.addEventListener('touchend', function() {
    self.calibrate();
  }, false);

  // Call calibrate once while oriented towards camera
  // to determine forward direction
  self.calibrate = function() {
    initialAlpha = getDeviceOrientation().alpha - 90;
    // Also determine divergence of gyro from compass
    initialHeadingDiff = getHeadingDiff();
  };

  self.update = function(delta) {
    // Collect potentially disorienting corrections so they can optionally be undone during rendering
    var corrections = {
      shakiness: shakiness
    };

    // Determine device orientation
    var deviceOrientation = getDeviceOrientation();
    var orientation = toQuaternion(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma, screenOrientation);

    // Correct heading according to calibration
    var headingOffsetCorrection = utils.quaternionFromHeading(-initialAlpha);

    // Correct accumulated heading drift using compass
    var headingDiff = getHeadingDiff();
    if(headingDiff) lastHeadingDiff = headingDiff;
    headingDiff = lastHeadingDiff;
    var drift = minimalRotation(initialHeadingDiff - headingDiff);
    smoothDrift = smoothDrift * (1 - convergenceHeading) + drift * convergenceHeading;
    var headingDriftCorrection = utils.quaternionFromHeading(smoothDrift);

    self.body.head.orientation = headingOffsetCorrection.multiply(headingDriftCorrection).multiply(orientation);

    // LOG("headingDiff: " + headingDiff + " drift: " + drift + " smoothDrift: " + smoothDrift);

    // Integrate velocity to yield device position, converge towards absolute position from tracker
    var bodyAbs = getTrackedPose();
    corrections.position = new THREE.Vector3(
      (bodyAbs.head.position.x - self.body.head.position.x) * convergenceHeadPos,
      (bodyAbs.head.position.y - self.body.head.position.y) * convergenceHeadPos,
      (bodyAbs.head.position.z - self.body.head.position.z) * convergenceHeadPos
    );
    devicePosition.x += (velocity.x + corrections.position.x) * delta / 20;
    devicePosition.y += (velocity.y + corrections.position.y) * delta / 20;
    devicePosition.z += (velocity.z + corrections.position.z) * delta / 20;

    // Derive head position from device position by following inverse view vector
    var viewVector = new THREE.Vector3(0, 0, deviceHeadDistance);
    viewVector.applyQuaternion(self.body.head.orientation);
    self.body.head.position.copy(viewVector.add(devicePosition));

    return corrections;
  };
};

var Predictor = function(min, max) {
  var lastValue;
  var lastNow;
  var lastDiff;

  this.feed = function(value) {
    var now = performance.now();
    if(lastValue != undefined) {
      lastDiff = (value - lastValue) / (now - lastNow);
    }
    lastValue = value;
    lastNow = now;
  };

  this.predict = function() {
    if(lastDiff != undefined && false) {
      var progress = performance.now() - lastNow;
      var value = lastValue + (lastDiff * progress);
      if(max && value >= max) {
        value = min + (value - max);
      } else if(min && value <= min) {
        value = max - (min - value);
      }
      return value;
    } else {
      return lastValue;
    }
  };
};

// Make quaternion from euler angles
var toQuaternion = (function() {
  var zee = new THREE.Vector3(0, 0, 1);
  var euler = new THREE.Euler();
  var q0 = new THREE.Quaternion();
  var q1 = new THREE.Quaternion(- Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));  // - PI/2 around the x-axis

  // The angles alpha, beta and gamma form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''
  return function(alpha, beta, gamma, orientation) {
    var q = new THREE.Quaternion();
    euler.set(THREE.Math.degToRad(beta), THREE.Math.degToRad(alpha), THREE.Math.degToRad(-gamma), 'YXZ'); // 'ZXY' for the device, but 'YXZ' for us
    q.setFromEuler(euler); // orient the device
    q.multiply(q1); // camera looks out the back of the device, not the top
    q.multiply(q0.setFromAxisAngle(zee, THREE.Math.degToRad(-orientation))); // adjust for screen orientation
    return q;
  };
})();

module.exports = PositionEngine;

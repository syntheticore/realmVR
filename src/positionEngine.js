var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');

var PositionEngine = function(uuid) {
  var convergenceHeadPos = 0.03;
  var convergenceHeadVelocity = 0.03;
  var convergenceHeading = 0.0005;
  var convergenceHands = 0.6;

  var body = {
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
          x: xPredictor.predict() || 0,
          y: yPredictor.predict() || 0,
          z: zPredictor.predict() || 0
        }
      }
    };
  };

  var screenOrientation = window.orientation || 0;

  var onScreenOrientation = _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    lastOrientation = undefined;
  });

  var alphaPredictor = new Predictor();
  var betaPredictor = new Predictor();
  var gammaPredictor = new Predictor();
  var lastHeading = 0;

  var getDeviceOrientation = function() {
    return {
      alpha: alphaPredictor.predict() || 0,
      beta: betaPredictor.predict()   || 90,
      gamma: gammaPredictor.predict() || 0,
      heading: lastHeading
    };
  };

  var onDeviceOrientation = _.on(window, 'deviceorientation', function(e) {
    alphaPredictor.feed(e.alpha);
    betaPredictor.feed(e.beta);
    gammaPredictor.feed(e.gamma);
    lastHeading = e.webkitCompassHeading;
  });

  var velocity = new THREE.Vector3(0, 0, 0);

  var onDeviceMotion = _.on(window, 'devicemotion', function(e) {
    // var acceleration = new THREE.Vector3(e.acceleration.x, e.acceleration.y, e.acceleration.z); // Portrait
    var acceleration = new THREE.Vector3(-e.acceleration.y, e.acceleration.x, e.acceleration.z); // Landscape
    // Convert from device space to world space
    acceleration.applyQuaternion(body.head.orientation);
    // Integrate acceleration over time to yield velocity
    velocity.x -= dampenAcceleration(acceleration.x * e.interval, velocity.x, e.interval);
    velocity.y -= dampenAcceleration(acceleration.y * e.interval, velocity.y, e.interval);
    velocity.z -= dampenAcceleration(acceleration.z * e.interval, velocity.z, e.interval);
    // LOG("X: " + velocity.x + " Y: " + velocity.y + " Z: " + velocity.z);
  });

  var dampenAcceleration = function(acceleration, velocity, interval) {
    var maxVelocity = 50;
    // Correct more aggressively the closer we get to maxVelocity
    var correctionFactor = Math.min(1, Math.abs(velocity) / maxVelocity);
    // Strengthen naturally opposing movements, weaken movements that would further accelerate us
    var opposing = ((acceleration.x >= 0 && velocity < 0) || (acceleration.x < 0 && velocity >= 0));
    var dampened = acceleration * (opposing ? (1 + correctionFactor) : (1 - correctionFactor));
    // Slowly converge towards zero to cancel remaining velocity when standing still
    var breaking = dampened + (velocity * interval * 50 * (1 + Math.abs(acceleration)) * convergenceHeadVelocity);
    return breaking;
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

  var lastOrientation;

  return {
    body: body,

    update: function(delta) {
      // Collect potentially disorienting corrections so they can optionally be undone during rendering
      var corrections = {};

      // Determine device orientation
      var deviceOrientation = getDeviceOrientation();
      var orientation = toQuaternion(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma, screenOrientation);

      // Determine rotation since last update
      if(lastOrientation == undefined) lastOrientation = orientation;
      var rotation = quaternionDifference(lastOrientation, orientation);
      lastOrientation = orientation;

      // Heading as believed by gyros
      var heading = headingFromQuaternion(body.head.orientation);

      // Actual compass heading
      var headingAbs = getAbsoluteHeading();

      // Calculate quaternion that corrects rotational drift
      var headingDiff = headingAbs ? heading - headingAbs : 0;
      if(Math.abs(headingDiff) > 180) {
        headingDiff = (360 - Math.abs(headingDiff)) * (headingDiff > 0 ? -1 : 1);
      }
      corrections.heading = headingDiff * convergenceHeading;
      var headingCorrection = quaternionFromHeading(corrections.heading);

      // Modify head orientation according to gyro rotation and compass correction
      headingCorrection.multiply(body.head.orientation).multiply(rotation);
      body.head.orientation = headingCorrection;
      // LOG("REL: " + Math.round(heading) + " ABS: " + Math.round(headingAbs) + " CORRECTION: " + Math.round(headingDiff));

      // Integrate velocity to yield head position, converge towards absolute position from tracker
      var bodyAbs = getTrackedPose();
      corrections.position = {
        x: (bodyAbs.head.position.x - body.head.position.x) * convergenceHeadPos,
        y: (bodyAbs.head.position.y - body.head.position.y) * convergenceHeadPos,
        z: (bodyAbs.head.position.z - body.head.position.z) * convergenceHeadPos
      };
      body.head.position.x += velocity.x * delta / 30 + corrections.position.x;
      body.head.position.y += velocity.y * delta / 30 + corrections.position.y;
      body.head.position.z += velocity.z * delta / 30 + corrections.position.z;

      return corrections;
    }
  };
};

var Predictor = function() {
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
    if(lastDiff != undefined) {
      var progress = performance.now() - lastNow;
      return lastValue + (lastDiff * progress);
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

// Determine cardinal direction from orientation
var headingFromQuaternion = function(q) {
  var toFront = new THREE.Vector3(1, 0, 0);
  toFront.applyQuaternion(q);
  toFront.setY(0);
  toFront.normalize();
  var heading = THREE.Math.radToDeg(toFront.angleTo(new THREE.Vector3(1, 0, 0)));
  if((toFront.x > 0 && toFront.z > 0)  || (toFront.x < 0 && toFront.z > 0)) {
    heading = 360 - heading;
  }
  return heading;
};

var quaternionFromHeading = function(heading) {
  var q = new THREE.Quaternion();
  var axis = new THREE.Vector3(1, 0, 0);
  q.setFromAxisAngle(axis, THREE.Math.degToRad(heading));
  return q;
};

var quaternionDifference = function(q1, q2) {
  return q1.clone().inverse().multiply(q2.clone());
};

module.exports = PositionEngine;

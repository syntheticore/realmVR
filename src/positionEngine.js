var THREE = require('three');
var _ = require('eakwell');

var Utils = require('./utils.js');

var PositionEngine = function(receiver, deviceHeadDistance) {
  var self = this;

  var convergenceHeadPos = 0.002;
  var convergenceHeadVelocity = 1.5;
  var convergenceHeading = 0.01;
  var convergenceHands = 0.1;

  var maxVelocity = 50;

  var useMagnetSwitch = false;
  var magnetThreshold = 30;

  var doCompassCorrection = true;

  var useKeyboard = true;

  self.body = {
    left: {
      position: new THREE.Vector3(0, 0, 0),
      active: false
    },
    right: {
      position: new THREE.Vector3(0, 0, 0),
      active: false
    },
    head: {
      position: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion()
    }
  };

  // Keyboard controls
  var movingForward = false;
  var movingBackward = false;
  var movingLeft = false;
  var movingRight = false;

  _.on(window, 'keydown', function(e) {
    if(!useKeyboard) return;
    if(e.keyCode == 87) movingForward = true;
    if(e.keyCode == 65) movingLeft = true;
    if(e.keyCode == 83) movingBackward = true;
    if(e.keyCode == 68) movingRight = true;
  });

  _.on(window, 'keyup', function(e) {
    if(!useKeyboard) return;
    if(e.keyCode == 87) movingForward = false;
    if(e.keyCode == 65) movingLeft = false;
    if(e.keyCode == 83) movingBackward = false;
    if(e.keyCode == 68) movingRight = false;
  });
  
  // Receive and predict absolute positions from tracker
  var leftPredictor = new VectorPredictor();
  var rightPredictor = new VectorPredictor();
  var headPredictor = new VectorPredictor();

  leftPredictor.feed(new THREE.Vector3(15, 110, 70));
  rightPredictor.feed(new THREE.Vector3(-15, 110, 70));
  headPredictor.feed(new THREE.Vector3(0, 150, 100));

  var leftActive = false;
  var rightActive = false;

  receiver.on('track', function(body) {
    leftPredictor.feed(body.left.position);
    rightPredictor.feed(body.right.position);
    headPredictor.feed(body.head.position);

    leftActive = body.left.active;
    rightActive = body.right.active;
  });

  var getTrackedPose = function() {
    return {
      left: {
        position: leftPredictor.predict().add(getViewVector()),
        active: leftActive
      },
      right: {
        position: rightPredictor.predict().add(getViewVector()),
        active: rightActive
      },
      head: {
        position: headPredictor.predict()
      }
    };
  };

  // Update screen orientation
  var screenOrientation = window.orientation || 0;

  _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    // Prevent white border problem in Safari
    _.defer(function() {
      window.scrollTo(0, 0);
    }, 500);
  });

  // Update and predict device orientation
  var alphaPredictor = new Predictor(0,    360, true);
  var betaPredictor  = new Predictor(-180, 180, true);
  var gammaPredictor = new Predictor(-90,  90,  true);
  var lastHeading = 0;

  _.on(window, 'deviceorientation', function(e) {
    alphaPredictor.feed(e.alpha);
    betaPredictor.feed(e.beta);
    gammaPredictor.feed(e.gamma);
    lastHeading = e.webkitCompassHeading || (360 - e.alpha);
  });

  var getDeviceOrientation = function() {
    return {
      alpha: alphaPredictor.predict() || 0,
      beta: betaPredictor.predict()   || 80,
      gamma: gammaPredictor.predict() || 0,
      heading: lastHeading
    };
  };

  // Integrate device motion to yield velocity
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
    // Correct more aggressively the closer we get to maxVelocity
    var correctionFactor = Math.min(1, Math.abs(velocity) / maxVelocity);
    // Strengthen naturally opposing movements, weaken movements that would further accelerate us
    var opposing = ((acceleration >= 0 && velocity < 0) || (acceleration < 0 && velocity >= 0));
    var dampened = acceleration * (opposing ? (1 + correctionFactor) : (1 - correctionFactor));
    // Slowly converge towards zero to cancel remaining velocity when standing still
    var braking = dampened - (velocity * interval * (1 + Math.abs(acceleration)) * convergenceHeadVelocity);
    return braking;
  };

  // Compass heading
  var getAbsoluteHeading = function() {
    var orientation = getDeviceOrientation();
    var beta = orientation.beta;
    // Only in this interval can compass values be trusted
    if(beta < 90 && beta > -90) {
      return 360 - orientation.heading;
    }
  };

  // Minimal rotation in any direction to yield the
  // same result as rotating the given angle
  var minimalRotation = function(angle) {
    if(angle >= 360) {
      angle = angle - 360;
    } else if(angle < 0) {
      angle = 360 + angle;
    }
    if(Math.abs(angle) > 180) {
      return (360 - Math.abs(angle)) * (angle > 0 ? -1 : 1);
    }
    return angle;
  }

  // Offset from gyro to compass
  var getHeadingDiff = function() {
    var compass = getAbsoluteHeading();
    if(compass) {
      var diff = getDeviceOrientation().alpha - compass;
      return minimalRotation(diff);
    }
  };

  // Current looking direction
  var getViewVector = function() {
    var viewVector = new THREE.Vector3(0, 0, -deviceHeadDistance);
    viewVector.applyQuaternion(self.body.head.orientation);
    return viewVector;
  };

  // Dispatch headset button event for others to enjoy
  var onHeadsetButtonPressed = function() {
    window.dispatchEvent(new Event('headsetButtonPressed'));
  };

  // Cardboard 2.0 switch activation
  window.addEventListener('click', function() {
    onHeadsetButtonPressed();
  }, false);

  var devicePosition = new THREE.Vector3();
  var initialHeadingDiff = 0;
  var headingOffsetCorrection = Utils.quaternionFromHeading(0);

  var lastHeadingDiff = 0;
  var smoothDrift = 0;

  var lastMagnetometerValue;

  // Call calibrate once while oriented towards camera
  self.calibrate = function() {
    // Determine forward direction
    var initialAlpha = getDeviceOrientation().alpha - 90;
    headingOffsetCorrection = Utils.quaternionFromHeading(-initialAlpha);
    // Determine divergence of gyro from compass
    initialHeadingDiff = getHeadingDiff() || 0;
  };

  self.update = function(delta) {
    // Determine device orientation
    var deviceOrientation = getDeviceOrientation();
    var orientation = toQuaternion(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma, screenOrientation);

    // Cardboard 1.0 switch activation
    if(useMagnetSwitch && deviceOrientation.heading && !doCompassCorrection) {
      var diff = Math.abs(deviceOrientation.heading - (lastMagnetometerValue || deviceOrientation.heading));
      if(diff > magnetThreshold) {
        onHeadsetButtonPressed();
      }
      lastMagnetometerValue = deviceOrientation.heading;
    }

    // Correct accumulated heading drift using compass
    var headingDiff = getHeadingDiff();
    if(headingDiff) lastHeadingDiff = headingDiff;
    headingDiff = lastHeadingDiff;
    var drift = minimalRotation(initialHeadingDiff - headingDiff);
    smoothDrift = smoothDrift * (1 - convergenceHeading) + drift * convergenceHeading * (doCompassCorrection ? 1 : 0);
    var headingDriftCorrection = Utils.quaternionFromHeading(smoothDrift);

    // Correct heading to match tracker space
    self.body.head.orientation = headingDriftCorrection.multiply(headingOffsetCorrection).multiply(orientation);

    // Converge towards absolute position from tracker
    var bodyAbs = getTrackedPose();
    var positionCorrection = new THREE.Vector3(
      (bodyAbs.head.position.x - self.body.head.position.x),
      (bodyAbs.head.position.y - self.body.head.position.y),
      (bodyAbs.head.position.z - self.body.head.position.z)
    );
    positionCorrection.multiplyScalar(convergenceHeadPos * delta);

    // Integrate velocity to yield device position
    devicePosition.x += velocity.x * delta / 7 + positionCorrection.x;
    devicePosition.y += velocity.y * delta / 7 + positionCorrection.y;
    devicePosition.z += velocity.z * delta / 7 + positionCorrection.z;

    // Derive head position from device position by following inverse view vector
    var viewVector = getViewVector();
    self.body.head.position.copy(devicePosition).sub(viewVector);

    // Converge hand positions to position from tracker
    self.body.left.position.lerp(bodyAbs.left.position, convergenceHands);
    self.body.right.position.lerp(bodyAbs.right.position, convergenceHands);

    // Update hand triggers
    self.body.left.active = bodyAbs.left.active;
    self.body.right.active = bodyAbs.right.active;

    // Collect potentially disorienting corrections so they can optionally be undone during rendering
    var corrections = {
      shakiness: shakiness,
      position: positionCorrection,
      rotation: smoothDrift
    };

    // Keyboard controls
    if(movingForward || movingBackward || movingLeft || movingRight) {
      if(movingForward || movingBackward) {
        var factor = (movingBackward ? -1 : 1) * delta / 3;
        devicePosition.add(viewVector.setY(0).normalize().multiplyScalar(factor));
      }
      if(movingLeft || movingRight) {
        var rightVector = new THREE.Vector3(1, 0, 0);
        var factor = (movingRight ? 1 : -1) * delta / 3;
        rightVector.applyQuaternion(self.body.head.orientation).setY(0).normalize().multiplyScalar(factor);
        devicePosition.add(rightVector);
      }
    }

    return corrections;
  };
};

var Predictor = function(min, max, disable) {
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
    if(lastDiff != undefined && !disable) {
      var progress = performance.now() - lastNow;
      var value = lastValue + (lastDiff * progress);
      if(_.hasValue(max) && value >= max) {
        value = min + (value - max);
      } else if(_.hasValue(min) && value <= min) {
        value = max - (min - value);
      }
      return value;
    } else {
      return lastValue;
    }
  };
};

var VectorPredictor = function() {
  var xPredictor = new Predictor();
  var yPredictor = new Predictor();
  var zPredictor = new Predictor();

  this.feed = function(vector) {
    xPredictor.feed(vector.x);
    yPredictor.feed(vector.y);
    zPredictor.feed(vector.z);
  };

  this.predict = function() {
    return new THREE.Vector3(xPredictor.predict() || 0, yPredictor.predict() || 0, zPredictor.predict() || 0);
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

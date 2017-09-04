var THREE = require('three');
var _ = require('eakwell');

var Utils = require('./utils.js');

var Fusion = function(client) {
  var self = this;
  _.eventHandling(self);

  var convergenceHeadPos = 0.002;
  var convergenceHeadVelocity = 1.5;
  var convergenceHeading = 0.01;
  var convergenceHands = 0.1;

  var maxVelocity = 30;
  var maxBrakeDistance = 100;

  self.body = {
    left: {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion(),
      active: false
    },
    right: {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion(),
      active: false
    },
    head: {
      position: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion()
    }
  };
  
  // Receive and predict absolute positions from tracker
  var leftPredictor = new VectorPredictor();
  var rightPredictor = new VectorPredictor();
  var headPredictor = new VectorPredictor();

  leftPredictor.feed(new THREE.Vector3(-80, 120, 130));
  rightPredictor.feed(new THREE.Vector3(-80, 120, 70));
  headPredictor.feed(new THREE.Vector3(0, 170, 100));

  var absHmdRotation = new THREE.Euler();
  var leftActive = false;
  var rightActive = false;

  client.on('track', function(body) {
    leftPredictor.feed(body.leftHand.position);
    rightPredictor.feed(body.rightHand.position);
    headPredictor.feed(body.hmd.position);

    absHmdRotation = body.hmd.rotation;

    leftActive = body.leftHand.active;
    rightActive = body.rightHand.active;
  });

  var getTrackedPose = function() {
    return {
      left: {
        position: leftPredictor.predict(),
        active: leftActive
      },
      right: {
        position: rightPredictor.predict(),
        active: rightActive
      },
      head: {
        position: headPredictor.predict(),
        orientation: absHmdRotation
      }
    };
  };

  // Update and predict device orientation
  var alphaPredictor = new Predictor(0,    360, true);
  var betaPredictor  = new Predictor(-180, 180, true);
  var gammaPredictor = new Predictor(-90,  90,  true);

  _.on(window, 'deviceorientation', function(e) {
    alphaPredictor.feed(e.alpha);
    betaPredictor.feed(e.beta);
    gammaPredictor.feed(e.gamma);
  });
  //XXX Use devicemotion angular velocity directly instead of deviceorientation (more reliable fire rate)

  var getDeviceRotation = function() {
    return {
      alpha: alphaPredictor.predict() || 0,
      beta: betaPredictor.predict()   || 90,
      gamma: gammaPredictor.predict() || 0
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
    var bodyAbs = getTrackedPose();
    velocity.x += dampenAcceleration(acceleration.x * e.interval, velocity.x, e.interval, bodyAbs);
    velocity.y += dampenAcceleration(acceleration.y * e.interval, velocity.y, e.interval, bodyAbs);
    velocity.z += dampenAcceleration(acceleration.z * e.interval, velocity.z, e.interval, bodyAbs);
    // e.rotationRate.alpha
    // LOG("X: " + velocity.x + " Y: " + velocity.y + " Z: " + velocity.z);
  });

  // Update screen orientation
  var screenOrientation = window.orientation || 0;

  _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    // Prevent white border problem in Safari
    _.defer(function() {
      window.scrollTo(0, 0);
    }, 500);
  });

  var dampenAcceleration = function(acceleration, velocity, interval, bodyAbs) {
    // Correct more aggressively the closer we get to maxVelocity
    var dampFactor = Math.min(1, Math.abs(velocity) / maxVelocity);
    var brakeFactor = Math.min(1, Math.abs(bodyAbs.head.position.distanceTo(self.body.head.position)) / maxBrakeDistance);
    // Strengthen naturally opposing movements, weaken movements that would further accelerate us
    var opposing = ((acceleration >= 0 && velocity < 0) || (acceleration < 0 && velocity >= 0));
    var dampened = acceleration * (opposing ? (1 + dampFactor) : (1 - dampFactor));
    // Slowly converge towards zero to cancel remaining velocity when standing still
    var braking = dampened - (velocity * interval * (1 + Math.abs(acceleration)) * convergenceHeadVelocity * brakeFactor);
    return braking;
  };

  // Offset from gyro to compass
  var getHeadingDiff = function() {
    var diff = absHmdRotation.y - THREE.Math.degToRad(getDeviceRotation().alpha);
    // var diff = absHmdRotation.y - Utils.headingFromQuaternion(self.body.head.orientation);
    return diff + Math.PI;
  };

  var headingDivergence = 0;

  // Call calibrate once while oriented towards camera
  self.calibrate = function() {
    headingDivergence = getHeadingDiff();
  };

  self.update = function(delta) {
    delta = delta || 0;
    // Determine device orientation
    var deviceRotation = getDeviceRotation();
    var orientation = toQuaternion(deviceRotation.alpha, deviceRotation.beta, deviceRotation.gamma, screenOrientation); //XXX always landscape

    // Correct heading to match tracker space
    var headingDiff = getHeadingDiff();
    headingDivergence = headingDivergence * (1 - convergenceHeading) + headingDiff * convergenceHeading;
    var headingDriftCorrection = Utils.quaternionFromHeadingRad(headingDivergence);
    self.body.head.orientation = headingDriftCorrection.multiply(orientation);

    // self.body.head.orientation = (new THREE.Quaternion()).setFromEuler((new THREE.Euler()).setFromVector3(absHmdRotation)).multiply(headingDriftCorrection);

    // Converge towards absolute position from tracker
    var bodyAbs = getTrackedPose();
    var positionCorrection = new THREE.Vector3(
      (bodyAbs.head.position.x - self.body.head.position.x),
      (bodyAbs.head.position.y - self.body.head.position.y),
      (bodyAbs.head.position.z - self.body.head.position.z)
    );
    positionCorrection.multiplyScalar(convergenceHeadPos * delta);

    // Integrate velocity to yield device position
    self.body.head.position.x += velocity.x * delta / 4 + positionCorrection.x;
    self.body.head.position.y += velocity.y * delta / 4 + positionCorrection.y;
    self.body.head.position.z += velocity.z * delta / 4 + positionCorrection.z;

    // Converge hand positions to position from tracker
    var oldLeft = self.body.left.position.clone();
    var oldRight = self.body.right.position.clone();
    self.body.left.position.lerp(bodyAbs.left.position, convergenceHands);
    self.body.right.position.lerp(bodyAbs.right.position, convergenceHands);

    // Update hand velocities
    self.body.left.velocity.copy(self.body.left.position).sub(oldLeft);
    self.body.right.velocity.copy(self.body.right.position).sub(oldRight);

    // Update hand triggers
    var lastLeftActive = self.body.left.active;
    var lastRightActive = self.body.right.active;
    self.body.left.active = bodyAbs.left.active;
    self.body.right.active = bodyAbs.right.active;

    // Trigger events
    if(self.body.left.active && !lastLeftActive) {
      self.emit('trigger', ['left']);
    } else if(!self.body.left.active && lastLeftActive) {
      self.emit('triggerEnd', ['left']);
    }
    if(self.body.right.active && !lastRightActive) {
      self.emit('trigger', ['right']);
    } else if(!self.body.right.active && lastRightActive) {
      self.emit('triggerEnd', ['right']);
    }
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

  this.changeSinceFeed = function() {
    if(lastDiff == undefined) return;
    var progress = performance.now() - lastNow;
    return lastDiff * progress;
  };

  this.predict = function() {
    return lastValue;
    if(lastDiff != undefined && !disable) {
      // Predict
      var value = lastValue + this.changeSinceFeed();
      // Clamp to bounds
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

  this.changeSinceFeed = function() {
    return new THREE.Vector3(xPredictor.changeSinceFeed() || 0, yPredictor.changeSinceFeed() || 0, zPredictor.changeSinceFeed() || 0);
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

module.exports = Fusion;

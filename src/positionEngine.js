var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');

var PositionEngine = function(uuid, cb) {
  var convergenceHeadPos = 0.005;
  var convergenceHeadVelocity = 0.006;
  var convergenceHeading = 0.0005;
  var convergenceHands = 0.6;

  var screenOrientation = window.orientation || 0;
  var deviceOrientation = {};
  var velocity = new THREE.Vector3(0, 0, 0);
  
  var bodyAbs = {
    head: {
      position: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion()
    }
  };

  var body = {
    head: {
      position: new THREE.Vector3(0, 0, 0),
      orientation: new THREE.Quaternion()
    }
  };

  var receiver = new Receiver(uuid, function(b) {
    bodyAbs = b;
  });

  var onScreenOrientation = _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    lastOrientation = undefined;
  });

  var onDeviceOrientation = _.on(window, 'deviceorientation', function(e) {
    deviceOrientation = e;
  });

  var onDeviceMotion = _.on(window, 'devicemotion', function(e) {
    // Convert from device space to world space
    var acceleration = new THREE.Vector3(-e.acceleration.y, e.acceleration.x, e.acceleration.z); // Landscape
    // var acceleration = new THREE.Vector3(e.acceleration.x, e.acceleration.y, e.acceleration.z); // Portrait
    acceleration.applyQuaternion(body.head.orientation);
    // Integrate acceleration over time to yield velocity
    velocity.x -= dampenAcceleration(acceleration.x * e.interval, velocity.x, e.interval);
    velocity.y -= dampenAcceleration(acceleration.y * e.interval, velocity.y, e.interval);
    velocity.z -= dampenAcceleration(acceleration.z * e.interval, velocity.z, e.interval);
    // LOG("X: " + Math.round(velocity.x) + " Y: " + Math.round(velocity.y) + " Z: " + Math.round(velocity.z));
  });

  var dampenAcceleration = function(acceleration, velocity, interval) {
    var maxVelocity = 50;
    var maxAcceleration = 30;
    // Correct more aggressively the closer we get to maxVelocity
    var correctionFactor = Math.min(1, Math.abs(velocity) / maxVelocity);
    // Strengthen naturally opposing movements, weaken movements that would further accelerate us
    var opposing = ((acceleration.x >= 0 && velocity < 0) || (acceleration.x < 0 && velocity >= 0));
    var dampened = acceleration * (opposing ? (1 + correctionFactor) : (1 - correctionFactor));
    // Slowly converge towards zero to cancel remaining velocity when standing still
    var breaking = dampened + (velocity * interval * (1 + Math.abs(acceleration) / maxAcceleration) * convergenceHeadVelocity);
    return breaking;
  };

  var getAbsoluteHeading = function() {
    var headingAbs;
    var beta  = deviceOrientation.beta  || 90;
    // Only in this interval can compass values be trusted
    //XXX if this should not work on android, compare gamma interval instead of beta
    if(beta < 90 && beta > -90 && deviceOrientation.webkitCompassHeading != undefined) {
      // Measure real heading with possible noise
      headingAbs = deviceOrientation.webkitCompassHeading + (deviceOrientation.gamma > 0 ? beta : -beta);
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
    update: function(delta) {
      // Determine device orientation
      var alpha = deviceOrientation.alpha || 0;
      var beta  = deviceOrientation.beta  || 90;
      var gamma = deviceOrientation.gamma || 0;
      var orientation = toQuaternion(alpha, beta, gamma, screenOrientation);

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
      var headingCorrection = quaternionFromHeading(headingDiff * convergenceHeading);

      // Modify head orientation according to gyro rotation and apply compass correction
      headingCorrection.multiply(body.head.orientation).multiply(rotation);
      body.head.orientation = headingCorrection;
      // LOG("REL: " + Math.round(heading) + " ABS: " + Math.round(headingAbs) + " CORRECTION: " + Math.round(headingDiff));

      // Integrate velocity to yield head position, converge towards absolute position from tracker
      var correctHeightOnly = false;
      body.head.position.x += (velocity.x + (correctHeightOnly ? 0 : (bodyAbs.head.position.x - body.head.position.x) * convergenceHeadPos)) * delta;
      body.head.position.y += (velocity.y +                          (bodyAbs.head.position.y - body.head.position.y) * convergenceHeadPos)  * delta;
      body.head.position.z += (velocity.z + (correctHeightOnly ? 0 : (bodyAbs.head.position.z - body.head.position.z) * convergenceHeadPos)) * delta;

      // body.left.position  = mixPos(body.left.position, bodyAbs.left.position, convergenceHands);
      // body.left.rotation  = mixRot(body.left.rotation, bodyAbs.left.rotation, convergenceHands);

      // body.right.position = mixPos(body.right.position, bodyAbs.right.position, convergenceHands);
      // body.right.rotation = mixRot(body.right.rotation, bodyAbs.right.rotation, convergenceHands);

      return body;
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

var mixPos = function(vec1, vec2, ratio) {
  return {
    x: vec1.x * (1 - ratio) + vec2.x * ratio,
    y: vec1.y * (1 - ratio) + vec2.y * ratio,
    z: vec1.z * (1 - ratio) + vec2.z * ratio
  };
};

var mixRot = function(vec1, vec2, ratio) {
  return {
    alpha: vec1.alpha * (1 - ratio) + vec2.alpha * ratio,
    beta:  vec1.beta  * (1 - ratio) + vec2.beta  * ratio,
    gamma: vec1.gamma * (1 - ratio) + vec2.gamma * ratio
  };
};

module.exports = PositionEngine;

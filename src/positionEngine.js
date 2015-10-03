var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');

var PositionEngine = function(uuid, cb) {
  var convergenceHeadPos = 0.2;
  var convergenceHeading = 0.0001;
  var convergenceHands = 0.6;

  var bodyAbsolute = {};
  var screenOrientation = window.orientation || 0;
  var deviceOrientation = {};
  var deviceMotion = {};

  var receiver = new Receiver(uuid, function(body) {
    bodyAbsolute = body;
  });

  var onScreenOrientation = _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
    lastOrientation = undefined;
  });

  var onDeviceOrientation = _.on(window, 'deviceorientation', function(e) {
    deviceOrientation = e;
  });

  var onDeviceMotion = _.on(window, 'devicemotion', function(e) {
    deviceMotion = e;
  });

  var body = {
    head: {
      position: {
        x: 0,
        y: 0,
        z: 0
      },
      orientation: new THREE.Quaternion()
    }
  };

  var lastOrientation;

  return {
    update: function(delta) {
      // Determine device orientation
      var alpha = deviceOrientation.alpha || 0;
      var beta  = deviceOrientation.beta  || 90;
      var gamma = deviceOrientation.gamma || 0;
      var orientation = toQuaternion(alpha, beta, gamma, screenOrientation);

      if(lastOrientation == undefined) lastOrientation = orientation;
      var rotation = quaternionDifference(lastOrientation, orientation);
      lastOrientation = orientation;

      var heading = headingFromQuaternion(body.head.orientation);

      // Only in this interval can compass values be trusted
      //XXX if this should not work on android, compare gamma interval instead of beta
      var headingAbs = heading;
      if(beta < 90 && beta > -90 && deviceOrientation.webkitCompassHeading != undefined) {
        // Measure real heading with possible noise
        headingAbs = deviceOrientation.webkitCompassHeading + (gamma > 0 ? beta : -beta);
        if(headingAbs < 0) {
          headingAbs = headingAbs + 360;
        } else if(headingAbs > 360) {
          headingAbs = headingAbs - 360;
        }
        headingAbs = 360 - headingAbs;
      }

      // Calculate quaternion that corrects drift
      var headingDiff = heading - headingAbs;
      if(Math.abs(headingDiff) > 180) {
        headingDiff = (360 - Math.abs(headingDiff)) * (headingDiff > 0 ? -1 : 1);
      }
      var headingCorrection = quaternionFromHeading(headingDiff * convergenceHeading);
      headingCorrection.multiply(body.head.orientation).multiply(rotation);

      // LOG("REL: " + Math.round(heading) + " ABS: " + Math.round(headingAbs) + " CORRECTION: " + Math.round(headingDiff));

      body.head.orientation = headingCorrection;

      // body.head.position = mixPos(body.head.position, bodyAbsolute.head.position, convergenceHeadPos);

      // body.left.position  = mixPos(body.left.position, bodyAbsolute.left.position, convergenceHands);
      // body.left.rotation  = mixRot(body.left.rotation, bodyAbsolute.left.rotation, convergenceHands);

      // body.right.position = mixPos(body.right.position, bodyAbsolute.right.position, convergenceHands);
      // body.right.rotation = mixRot(body.right.rotation, bodyAbsolute.right.rotation, convergenceHands);


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

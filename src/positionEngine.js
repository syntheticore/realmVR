var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');

var PositionEngine = function(uuid, cb) {
  var absolute;
  var screenOrientation = window.orientation || 0;
  var deviceOrientation = {};
  var deviceMotion = {};

  var convergenceHeadPos = 0.2;
  var convergenceHeadRot = 0.1;
  var convergenceHands = 0.6;

  var receiver = new Receiver(uuid, function(body) {
    absolute = body;
  });

  var onScreenOrientation = _.on(window, 'orientationchange', function(e) {
    screenOrientation = window.orientation;
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
      }
    }
  };

  return {
    update: function(delta) {
      // LOG('-----');

      // body.left.position  = mixPos(body.left.position, absolute.left.position, convergenceHands);
      // body.left.rotation  = mixRot(body.left.rotation, absolute.left.rotation, convergenceHands);

      // body.right.position = mixPos(body.right.position, absolute.right.position, convergenceHands);
      // body.right.rotation = mixRot(body.right.rotation, absolute.right.rotation, convergenceHands);

      // Determine device orientation
      var alpha = deviceOrientation.alpha || 0;
      var beta  = deviceOrientation.beta  || 90;
      var gamma = deviceOrientation.gamma || 0;
      var orientation = toQuaternion(alpha, beta, gamma, screenOrientation);

      // Calculate heading with possible drift
      var heading = headingFromQuaternion(orientation);
      // LOG(heading);

      // Measure real heading with possible noise
      var headingAbs = heading;
      if(deviceOrientation.webkitCompassHeading && deviceOrientation.webkitCompassAccuracy > 0.5) {
        // Only in this interval can compass values be trusted
        if(beta < 90 && beta > -90) {
          var headingAbs = deviceOrientation.webkitCompassHeading + (gamma > 0 ? beta : -beta);
          if(headingAbs < 0) {
            headingAbs = headingAbs + 360;
          } else if(headingAbs > 360) {
            headingAbs = headingAbs - 360;
          }
          headingAbs = 360 - headingAbs;
        }
      }
      // LOG(headingAbs);

      // Calculate quaternion that corrects drift
      var headingCorrection = headingAbs - heading;
      if(Math.abs(headingCorrection) > 180) {
        headingCorrection = (360 - Math.abs(headingCorrection)) * (headingCorrection > 0 ? -1 : 1);
      }
      // LOG(headingCorrection);
      var correction = quaternionFromHeading(headingCorrection);

      // body.head.position = mixPos(body.head.position, absolute.head.position, convergenceHeadPos);
      body.head.orientation = orientation;

      // LOG("REL: " + heading + " ABS: " + headingAbs);

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
    var quaternion = new THREE.Quaternion();
    euler.set(THREE.Math.degToRad(beta), THREE.Math.degToRad(alpha), THREE.Math.degToRad(-gamma), 'YXZ');                    // 'ZXY' for the device, but 'YXZ' for us
    quaternion.setFromEuler(euler); // orient the device
    quaternion.multiply(q1); // camera looks out the back of the device, not the top
    quaternion.multiply(q0.setFromAxisAngle(zee, THREE.Math.degToRad(-orientation))); // adjust for screen orientation
    return quaternion;
  };
})();

// Determine cardinal direction from orientation
var headingFromQuaternion = function(quaternion) {
  var toFront = new THREE.Vector3(1, 0, 0);
  toFront.applyQuaternion(quaternion);
  toFront.setY(0);
  var rot = toFront.angleTo(new THREE.Vector3(1, 0, 0));
  rot = THREE.Math.radToDeg(rot);
  if((toFront.x > 0 && toFront.z > 0)  || (toFront.x < 0 && toFront.z > 0)) {
    rot = 360 - rot;
  }
  return rot;
};

var quaternionFromHeading = function(heading) {

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

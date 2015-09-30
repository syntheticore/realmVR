var _ = require('eakwell');

var Receiver = require('./receiver.js');

var PositionEngine = function(uuid, cb) {
  var absolute;
  var deviceOrientation = {};

  var receiver = new Receiver(uuid, function(b) {
    console.log(b);
    absolute = b;
  });

  var onDeviceOrientation = _.on(window, 'deviceorientation', function(e) {
    deviceOrientation = e;
  });

  var body = {
    head: {
      position: {
        x: 0,
        y: 0,
        z: 0
      },
      rotation: {
        alpha: 0,
        beta:  0,
        gamma: 0
      }
    }
  };

  var convergenceHeadPos = 0.2;
  var convergenceHeadRot = 0.1;
  var convergenceHands = 0.6;

  var lastAlpha = 0;

  return {
    update: function(delta) {
      // body.left.position  = mixPos(body.left.position, absolute.left.position, convergenceHands);
      // body.left.rotation  = mixRot(body.left.rotation, absolute.left.rotation, convergenceHands);

      // body.right.position = mixPos(body.right.position, absolute.right.position, convergenceHands);
      // body.right.rotation = mixRot(body.right.rotation, absolute.right.rotation, convergenceHands);

      var alpha = deviceOrientation.alpha || 0;
      var turn = alpha - lastAlpha;

      var alphaAbs = alpha;
      if(deviceOrientation.webkitCompassHeading) {
        //XXX landscape only
        if(deviceOrientation.gamma > 0) {
          alphaAbs = 360 - deviceOrientation.webkitCompassHeading;
        } else {
          alphaAbs = 180 - deviceOrientation.webkitCompassHeading;
        }
      }

      // body.head.position  = mixPos(body.head.position, absolute.head.position, convergenceHeadPos);
      body.head.rotation.alpha = alpha ;//(body.head.rotation.alpha + turn) * (1 - convergenceHeadRot) + alphaAbs * convergenceHeadRot;
      body.head.rotation.beta = deviceOrientation.beta || 0;
      body.head.rotation.gamma = deviceOrientation.gamma || 0;

      lastAlpha = alpha;
      return body;
    }
  };
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

var THREE = require('three');

var RealmVRControls = function(object, engine) {
  var self = this;

  self.object = object;
  self.object.rotation.reorder('YXZ');

  self.enabled = true;

  self.screenOrientation = 0;

  var onScreenOrientationChangeEvent = function() {
    self.screenOrientation = window.orientation || 0;
  };

  // The angles alpha, beta and gamma form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''
  var setObjectQuaternion = (function() {
    var zee = new THREE.Vector3(0, 0, 1);
    var euler = new THREE.Euler();
    var q0 = new THREE.Quaternion();
    var q1 = new THREE.Quaternion(- Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));  // - PI/2 around the x-axis

    return function(quaternion, alpha, beta, gamma, orient) {
      euler.set(beta, alpha, -gamma, 'YXZ');                    // 'ZXY' for the device, but 'YXZ' for us
      quaternion.setFromEuler(euler);                           // orient the device
      quaternion.multiply(q1);                                  // camera looks out the back of the device, not the top
      quaternion.multiply(q0.setFromAxisAngle(zee, -orient));  // adjust for screen orientation
    };
  })();

  self.connect = function() {
    onScreenOrientationChangeEvent(); // run once on load
    window.addEventListener('orientationchange', onScreenOrientationChangeEvent, false);
    self.enabled = true;
  };

  self.disconnect = function() {
    window.removeEventListener('orientationchange', onScreenOrientationChangeEvent, false);
    self.enabled = false;
  };

  self.update = function() {
    if(self.enabled === false) return;

    var deviceOrientation = engine.update().head.rotation;

    var alpha  = deviceOrientation.alpha ? THREE.Math.degToRad(deviceOrientation.alpha) : 0; // Z
    var beta   = deviceOrientation.beta  ? THREE.Math.degToRad(deviceOrientation.beta ) : 90; // X'
    var gamma  = deviceOrientation.gamma ? THREE.Math.degToRad(deviceOrientation.gamma) : 0; // Y''
    var orient = self.screenOrientation  ? THREE.Math.degToRad(self.screenOrientation ) : 0; // O

    setObjectQuaternion(self.object.quaternion, alpha, beta, gamma, orient);
  };

  self.dispose = function() {
    self.disconnect();
  };

  self.connect();
};


module.exports = RealmVRControls;

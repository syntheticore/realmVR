var THREE = require('three');
var _ = require('eakwell');

module.exports = {
  // Determine cardinal direction from orientation
  headingFromQuaternion: function(q) {
    var toFront = new THREE.Vector3(1, 0, 0);
    toFront.applyQuaternion(q);
    toFront.setY(0);
    toFront.normalize();
    var heading = THREE.Math.radToDeg(toFront.angleTo(new THREE.Vector3(1, 0, 0)));
    if((toFront.x > 0 && toFront.z > 0)  || (toFront.x < 0 && toFront.z > 0)) {
      heading = 360 - heading;
    }
    return heading;
  },

  quaternionFromHeading: function(heading) {
    var q = new THREE.Quaternion();
    var axis = new THREE.Vector3(0, 1, 0);
    q.setFromAxisAngle(axis, THREE.Math.degToRad(heading));
    return q;
  },

  quaternionDifference: function(q1, q2) {
    return q1.clone().inverse().multiply(q2.clone());
  }
};

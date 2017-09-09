var THREE = require('three');
var _ = require('eakwell');

module.exports = {
  // Determine cardinal direction from orientation
  headingFromQuaternion: function(q) {
    var toFront = new THREE.Vector3(0, 0, 1);
    toFront.applyQuaternion(q);
    toFront.setY(0);
    toFront.normalize();
    return toFront.angleTo(new THREE.Vector3(0, 0, 1));
  },

  quaternionFromHeading: function(heading) {
    var q = new THREE.Quaternion();
    var axis = new THREE.Vector3(0, 1, 0);
    q.setFromAxisAngle(axis, THREE.Math.degToRad(heading));
    return q;
  },

  quaternionFromHeadingRad: function(heading) {
    var q = new THREE.Quaternion();
    var axis = new THREE.Vector3(0, 1, 0);
    q.setFromAxisAngle(axis, heading);
    return q;
  },

  quaternionDifference: function(q1, q2) {
    return q1.clone().inverse().multiply(q2.clone());
  },

  getTwist: function(quaternion, axis) {
    var ra = new THREE.Vector3(quaternion.x, quaternion.y, quaternion.z);
    ra.projectOnVector(axis);
    var twist = (new THREE.Quaternion()).set(ra.x, ra.y, ra.z, quaternion.w);
    return twist.normalize();
  },

  getTwistAngle: function(quaternion, axis) {
    var twist = this.getTwist(quaternion, axis);
    return (new THREE.Euler()).setFromQuaternion(twist).y;
  }
};

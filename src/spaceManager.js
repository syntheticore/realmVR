var THREE = require('three');
var _ = require('eakwell');

var Receiver = require('./receiver.js');
var PositionEngine = require('./positionEngine.js');
var Utils = require('./utils.js');

var SpaceManager = function(uuid, deviceHeadDistance) {
  var self = this;

  var positionCorrectionStrength = 0.5;
  var rotationCorrectionStrength = 0.5;

  var boundsRadius = 200;
  var maxBoundsDistance = 20;

  var world = {
    position: new THREE.Vector3(-85, 0, 10),
    rotation: -90
  };

  var bounds = [];

  var receiver = new Receiver(uuid);
  var engine = new PositionEngine(receiver, deviceHeadDistance);

  // Get player pose on game space
  var getGameBody = function() {
    var worldRot = Utils.quaternionFromHeading(-world.rotation);
    return {
      head: {
        position: engine.body.head.position.clone().applyQuaternion(worldRot).sub(world.position),
        orientation: worldRot.multiply(engine.body.head.orientation)
      },
      left: {
        position: engine.body.left.position.clone().applyQuaternion(worldRot).sub(world.position),
        active: engine.body.left.active
      },
      right: {
        position: engine.body.right.position.clone().applyQuaternion(worldRot).sub(world.position),
        active: engine.body.right.active
      }
    }
  };

  // Distance to real world bounds
  var distanceToBounds = function(point) {
    return Math.max(boundsRadius - point.length());
  };

  // Reorient the game world in an optimal way for
  // the players current position and walking direction
  var makeSpace = function() {
    return;
    // Measure angle with which the player approaches the wall
    var wallVector = new THREE.Vector3();
    wallVector.crossVectors(walkingDirection, pos);
    var wallAngle = THREE.radToDegree(walkingDirection.angleTo(wallVector));
    // Turn game world such that the real wall is behind
    // the player when he turns to match the correction
    world.rotation = wrapAround(world.rotation + 90 + wallAngle);
  };

  // Let the player define the bounds of the play space
  // by pressing the headset button in three different locations
  window.addEventListener('headsetButtonPressed', function() {
    // Collect first three locations
    if(bounds.length < 3) {
      bounds.push(engine.body.head.position.clone().setY(0));
      if(bounds.length == 3) {
        // Tell desktop we're done
        receiver.playspaceFinished();
      }
    }
  }, false);

  var ready2rock = false;

  var lastPos;

  var walkingDirection = new THREE.Vector3(0, 0, -1);
  var lastWalkMarker;
  var walkMarkerDistance = 10;

  var outOfBounds = false;

  // Calculate and return updated player
  // position and orientation in game space
  self.update = function(delta) {
    // Get player position in world space
    var corrections = engine.update(delta);

    // 2D world position
    var pos = engine.body.head.position.clone().setY(0);

    // Check for imminent collision with real world bounds
    lastPos = lastPos || pos;
    var velocity = pos.clone().sub(lastPos).multiplyScalar(delta);
    var futureWallDistance = distanceToBounds(velocity.add(pos));
    var wallDistance = distanceToBounds(pos);
    var minWallDistance = Math.min(wallDistance, futureWallDistance);
    if(!outOfBounds && minWallDistance < maxBoundsDistance) {
      makeSpace();
      outOfBounds = true;
    } else if(outOfBounds && minWallDistance > maxBoundsDistance) {
      outOfBounds = false;
    }

    // Find walking direction
    lastWalkMarker = lastWalkMarker || pos;
    if(pos.distanceTo(lastWalkMarker) > walkMarkerDistance) {
      walkingDirection = pos.clone().sub(lastWalkMarker);
      lastWalkMarker = pos;
    }

    // Check how much we are oriented away from the bounds center
    var offTrackRot = Math.abs(walkingDirection.angleTo(pos) / Math.PI);

    // Check how far away we are from the center relative to bounds size
    var offTrackPos = pos.length() / boundsRadius;

    // Check how much we are looking forward and down
    var viewVector = new THREE.Vector3(0, 0, -1);
    viewVector.applyQuaternion(engine.body.head.orientation);
    var up = new THREE.Vector3(0, 1, 0);
    var upLooking = 1 - Math.abs(viewVector.angleTo(up) / Math.PI);
    var frontFacing = 1 - 2 * Math.abs(0.5 - upLooking);
    
    if(upLooking < 0.1) {
      var worldRot = Utils.quaternionFromHeading(-world.rotation);
      world.position.sub(viewVector.clone().setY(0).normalize().multiplyScalar(0.5).applyQuaternion(worldRot));
    }

    return getGameBody();

    // Translate and rotate more
    // - the further the player looks up
    // - the faster the player is turning
    // - the further the player is from the bounds center
    // - the more the player is walking away from the bounds center
    // - the more the player moves sideways
    var correctionFactor = offTrackRot * offTrackPos * upLooking * corrections.shakiness;
    var rotFactor = correctionFactor * rotationCorrectionStrength;
    var posFactor = correctionFactor * positionCorrectionStrength;

    // Move game world in direction from player to bounds center
    world.position.sub(pos.clone().normalize().multiplyScalar(posFactor));
    
    // Rotate world a bit to discourage walking into bounds
    world.rotation = wrapAround(world.rotation - walkingDirection.angleTo(pos) * rotFactor);

    lastPos = pos;

    return getGameBody();
  };

  self.calibrate = function() {
    engine.calibrate();
    receiver.calibrationFinished();
  };

  // Place the player in an arbitrary position in the game world
  self.placePlayer = function(position, rotation) {

  };
};

var wrapAround = function(angle) {
  if(angle >= 360) {
    return angle - 360;
  } else if(angle < 0) {
    return 360 + angle;
  } else {
    return angle;
  }
};

module.exports = SpaceManager;

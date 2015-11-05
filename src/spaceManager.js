var THREE = require('three');
var _ = require('eakwell');

var PositionEngine = require('./positionEngine.js');
var Utils = require('./utils.js');

var SpaceManager = function(receiver, deviceHeadDistance) {
  var self = this;
  _.eventHandling(self);

  var positionCorrectionStrength = 0.5;
  var rotationCorrectionStrength = 0.5;

  var boundsRadius = 200;
  var maxBoundsDistance = 20;

  var world = {
    position: new THREE.Vector3(-85, 0, 10),
    rotation: -90
  };

  var boundMarkers = [];

  var engine = new PositionEngine(receiver, deviceHeadDistance);

  var world2game = function(pos, worldRot) {
    return pos.applyQuaternion(worldRot).sub(world.position);
  };

  // Get player pose in game space
  var getGameBody = function() {
    var worldRot = Utils.quaternionFromHeading(-world.rotation);
    return {
      head: {
        position: world2game(engine.body.head.position.clone(), worldRot),
        orientation: worldRot.clone().multiply(engine.body.head.orientation)
      },
      left: {
        position: world2game(engine.body.left.position.clone(), worldRot),
        active: engine.body.left.active
      },
      right: {
        position: world2game(engine.body.right.position.clone(), worldRot),
        active: engine.body.right.active
      },
      origin: {
        position: world2game(new THREE.Vector3(), worldRot),
        orientation: worldRot
      }
    }
  };

  var getBounds = function() {
    var bounds = {
      front: 0, //XXX Calculate front
      back:  boundMarkers[0].z,
      right: boundMarkers[1].x,
      left:  boundMarkers[2].x
    };
    return bounds;
  };

  self.getBoundingBox = function() {
    var bounds = getBounds();
    var width = bounds.right - bounds.left;
    var length = bounds.back - bounds.front;
    var height = (width + length) / 2;
    var cubeGeometry = new THREE.CubeGeometry(width, height, length);
    cubeGeometry.translate((bounds.right + bounds.left) / 2, height / 2, (bounds.back + bounds.front) / 2);
    var cube = new THREE.Mesh(cubeGeometry, new THREE.MeshBasicMaterial({
      shading: THREE.FlatShading,
      side: THREE.DoubleSide,
      color: 0x2194ce,
      transparent: true,
      opacity: 0.8,
      wireframe: true
    }));
    cube.rotation.reorder('YXZ');
    return cube;
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
    // Start local calibration
    engine.calibrate();
    // Start calibration process on the desktop
    receiver.calibrationFinished();
    // Let the player define the bounds of the play space
    // by pressing the headset button in three different locations
    var boundsHandler = _.on(window, 'headsetButtonPressed', function() {
      // Collect first three locations
      if(boundMarkers.length < 3) {
        boundMarkers.push(engine.body.head.position.clone().setY(0));
        if(boundMarkers.length == 3) {
          // Tell desktop we're done
          receiver.playspaceFinished();
          // VRControls need our bounding box
          self.emit('playspaceFinished');
          _.off(window, 'headsetButtonPressed', boundsHandler);
        }
      }
    }, false);
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

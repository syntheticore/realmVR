var THREE = require('three');
var _ = require('eakwell');

var PositionEngine = require('./positionEngine.js');
var Utils = require('./utils.js');

var SpaceManager = function(receiver, deviceHeadDistance) {
  var self = this;
  _.eventHandling(self);

  var positionCorrectionStrength = 0.5;
  var rotationCorrectionStrength = 0.5;

  var maxBoundsDistance = 20;

  var useKeyboard = true;

  var boundMarkers = [];

  var world = {
    position: new THREE.Vector3(-320, 0, 180),
    rotation: 0
  };

  var engine = new PositionEngine(receiver, deviceHeadDistance);

  // Proxy hand trigger events
  self.bubble(engine, 'trigger');
  self.bubble(engine, 'triggerEnd');

  // Keyboard & mouse controls
  var mouseDown = false;
  var movingForward = false;
  var movingBackward = false;
  var movingLeft = false;
  var movingRight = false;
  var lastMouseX = 0;

  _.on(window, 'keydown', function(e) {
    if(!useKeyboard) return;
    if(e.keyCode == 87) movingForward = true;
    if(e.keyCode == 65) movingLeft = true;
    if(e.keyCode == 83) movingBackward = true;
    if(e.keyCode == 68) movingRight = true;
  });

  _.on(window, 'keyup', function(e) {
    if(!useKeyboard) return;
    if(e.keyCode == 87) movingForward = false;
    if(e.keyCode == 65) movingLeft = false;
    if(e.keyCode == 83) movingBackward = false;
    if(e.keyCode == 68) movingRight = false;
  });

  _.on(window, 'mousedown', function(e) {
    mouseDown = true;
    lastMouseX = e.clientX;
  });

  _.on(window, 'mouseup', function(e) {
    mouseDown = false;
  });

  _.on(window, 'mousemove', function(e) {
    if(!useKeyboard || !mouseDown) return;
    var deltaX = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    world.rotation += deltaX;
  });

  var world2game = function(pos, worldRot) {
    var playerPos = engine.body.right.position;
    return pos.sub(playerPos).applyQuaternion(worldRot).add(playerPos).sub(world.position);
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
        orientation: worldRot,
        velocity: engine.body.left.velocity,
        active: engine.body.left.active
      },
      right: {
        position: world2game(engine.body.right.position.clone(), worldRot),
        orientation: worldRot,
        velocity: engine.body.right.velocity,
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
      back:  200,  //boundMarkers[0].z,
      right: 100,  //boundMarkers[1].x,
      left:  -100  //boundMarkers[2].x
    };
    bounds.width = bounds.right - bounds.left;
    bounds.length = bounds.back - bounds.front;
    bounds.height = (bounds.width + bounds.length) / 2;
    bounds.center = new THREE.Vector3((bounds.right + bounds.left) / 2, bounds.height / 2, (bounds.back + bounds.front) / 2);
    return bounds;
  };

  var getBoundingBox = function() {
    var cubeGeometry = new THREE.BoxGeometry(self.bounds.width, self.bounds.height, self.bounds.length, 4, 4, 4);
    cubeGeometry.translate(0, self.bounds.height / 2, (self.bounds.back + self.bounds.front) / 2 + self.bounds.front);
    var cube = new THREE.Mesh(cubeGeometry, new THREE.MeshBasicMaterial({
      shading: THREE.FlatShading,
      side: THREE.DoubleSide,
      color: 0x2194ce,
      transparent: true,
      opacity: 0.5,
      wireframe: true,
      depthWrite: false,
      wireframeLinewidth: 1
    }));
    cube.rotation.reorder('YXZ');
    // cube.renderOrder = 2;
    return cube;
  };

  // Distance to real world bounds
  var distanceToBounds = function(point) {
    return self.bounds.width / 2 - distanceToCenter(point);
  };

  // Distance to real world bounds center
  var distanceToCenter = function(point) {
    return self.bounds.center.clone().setY(0).distanceTo(point);
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

    if(!self.bounds) return getGameBody();

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

    // Show bounding box when near walls
    var boundsRadius = self.bounds.width / 2;
    self.boundingBox.material.opacity = (boundsRadius - wallDistance) / boundsRadius / 2;

    // Find walking direction
    lastWalkMarker = lastWalkMarker || pos;
    if(pos.distanceTo(lastWalkMarker) > walkMarkerDistance) {
      walkingDirection = pos.clone().sub(lastWalkMarker);
      lastWalkMarker = pos;
    }

    // Check how much we are oriented away from the bounds center
    var offTrackRot = Math.abs(walkingDirection.angleTo(pos) / Math.PI);

    // Check how far away we are from the center relative to bounds size
    var offTrackPos = distanceToCenter(pos) / boundsRadius;

    // Check how much we are looking forward and down
    var viewVector = new THREE.Vector3(0, 0, -1);
    viewVector.applyQuaternion(engine.body.head.orientation);
    var up = new THREE.Vector3(0, 1, 0);
    var upLooking = 1 - Math.abs(viewVector.angleTo(up) / Math.PI);
    var frontFacing = 1 - 2 * Math.abs(0.5 - upLooking);
    
    if(movingForward || movingBackward || movingLeft || movingRight || upLooking < 0.1) {
      var worldRot = Utils.quaternionFromHeading(-world.rotation);
      if(movingForward || movingBackward || upLooking < 0.1) {
        var factor = (movingBackward ? -1 : 1) * delta / 3;
        world.position.sub(viewVector.clone().setY(0).normalize().multiplyScalar(factor).applyQuaternion(worldRot));
      }
      if(movingLeft || movingRight) {
        var rightVector = new THREE.Vector3(1, 0, 0);
        var factor = (movingRight ? 1 : -1) * delta / 3;
        rightVector.applyQuaternion(engine.body.head.orientation).setY(0).normalize().multiplyScalar(factor);
        world.position.sub(rightVector.applyQuaternion(worldRot));
      }
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
      self.collectBoundsSample();
      _.off(window, 'headsetButtonPressed', boundsHandler);
    }, false);
  };

  self.collectBoundsSample = function() {
    // Collect first three locations
    if(boundMarkers.length < 3) {
      boundMarkers.push(engine.body.head.position.clone().setY(0));
      if(boundMarkers.length) { // == 3) {
        self.bounds = getBounds();
        self.boundingBox = getBoundingBox();
        // Tell desktop we're done
        receiver.playspaceFinished();
        // VRControls need our bounding box
        self.emit('playspaceFinished');
      }
    }
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

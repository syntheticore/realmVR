var THREE = require('three');
var _ = require('eakwell');

var PositionEngine = require('./positionEngine.js');
var utils = require('./utils.js');

var SpaceManager = function(uuid) {
  var engine = new PositionEngine(uuid);

  var world = {
    position: new THREE.Vector3(0, 0, 0),
    rotation: 0
  };

  var bounds = [];
  var maxBoundsDistance = 2;

  var getGameBody = function() {
    return {
      head: {
        position: engine.body.head.position.clone().sub(world.position),
        orientation: utils.quaternionFromHeading(-world.rotation).multiply(engine.body.head.orientation)
      }
    }
  };

  var distanceToBounds = function(point) {
    return 0;
  };

  var createSpace = function() {

  };

  return {
    // Calculate and return updated player position and orientation in game space
    update: function(delta) {
      var corrections = engine.update(delta);
      return engine.body;

      // Reverse corrections made to the body if they worsen our space problem
      // Never reverse height correction
      world.rotation += corrections.headingValue;
      world.position.add(corrections.position.setY(0).multiplyScalar(corrections.shakiness));

      // Check for collision with real world bounds
      if(distanceToBounds(engine.body.head.position) > maxBoundsDistance) {
        createSpace();
      }
      return getGameBody();
    },

    // Place the player in an arbitrary position in the game world
    placePlayer: function(position, rotation) {

    }
  };
};

module.exports = SpaceManager;

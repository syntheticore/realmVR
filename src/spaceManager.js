var THREE = require('three');
var _ = require('eakwell');

var PositionEngine = require('./positionEngine.js');

var SpaceManager = function(uuid) {
  var engine = new PositionEngine(uuid);

  var world = {
    position: {
      x: 0,
      y: 0,
      z:0
    },
    orientation: 0
  };

  var bounds = [];

  return {
    update: function(delta) {
      var corrections = engine.update(delta);
      var body = engine.body;
      return body;
    }
  };
};

module.exports = SpaceManager;

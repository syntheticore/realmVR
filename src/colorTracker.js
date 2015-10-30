var _ = require('eakwell');
var THREE = require('three');

var Posit = require('./posit.js').Posit;
var VideoSource = require('./videoSource.js');

var ColorTracker = function(cb, width, height) {
  width = width || 640;
  height = height || 480;

  var tracksPerSecond = 4;

  var source = new VideoSource(width, height);

  // Register a named color with the tracker
  // Colors that differ less than the given thresholds
  // in HSL color space are considered for tracking
  var registerColor = function(name, color, deviation) {
    // var hsl = color.getHSL();
    var pixelColor = new THREE.Color();
    tracking.ColorTracker.registerColor(name, function(r, g, b) {
      pixelColor.setRGB(r / 255, g / 255, b / 255);
      return Math.abs(pixelColor.r - color.r) + Math.abs(pixelColor.g - color.g) +  Math.abs(pixelColor.b - color.b) / 3 < deviation.dh;
      // var hslPixel = pixelColor.getHSL();
      // return Math.abs(hslPixel.h - hsl.h) < deviation.dh &&
      //        Math.abs(hslPixel.s - hsl.s) < deviation.ds &&
      //        Math.abs(hslPixel.l - hsl.l) < deviation.dl;
    });
  };

  var deviations = {
    apple: {dh: 0.15, ds: 0.3, dl: 0.2},
    cardinal: {dh: 0.1, ds: 0.15, dl: 0.15},
    magenta: {dh: 0.1, ds: 0.3, dl: 0.3},
    cyan: {dh: 0.1, ds: 0.3, dl: 0.3}
  };

  var colorDefinitions = {
    apple: new THREE.Color(137 / 255, 193 / 255, 114 / 255),
    cardinal: new THREE.Color(115 / 255, 38  / 255, 93  / 255)
  };

  // Make custom colors known to tracker
  var registerColors = function() {
    _.each(colorDefinitions, function(color, name) {
      registerColor(name, color, deviations[name]);
    });
  };

  registerColors();

  // Combinations of color that represent a single entity
  var colorCombos = {
    head: ['apple'],
    // left: ['magenta', 'cyan'],
    // right: ['cardinal', 'cyan'],
    ground: ['cardinal']
  };

  var colors;
  var tracker;

  // Initialize tracker with all colors needed
  var configureTracker = function(combos) {
    colors = _.unique(_.flatten(_.values(combos)));
    tracker = new tracking.ColorTracker(colors);
    tracker.setMinDimension(10);
    tracker.setMaxDimension(height * 2 / 3);
    tracker.setMinGroupSize(50);
  };

  configureTracker(colorCombos);

  // Return all blobs that match any of the used colors
  var detectBlobs = function(imageData) {
    var blobs;
    // Register for track event
    tracker.once('track', function(e) {
      blobs = _.map(e.data, function(rect) {
        // Convert to the simpler center + radius format
        return {
          color: rect.color,
          position: {
            x: rect.x + (rect.width / 2),
            y: rect.y + (rect.height / 2)
          },
          radius: (rect.width + rect.height) / 4
        };
      });
    });
    // Emit track event
    tracker.track(imageData.data, width, height);
    return blobs;
  };

  // Draw rectangles around blobs
  var drawBlobs = function(blobs, context) {
    _.each(blobs, function(blob) {
      context.strokeStyle = blob.color;
      context.strokeRect(blob.position.x - blob.radius, blob.position.y - blob.radius, blob.radius * 2, blob.radius * 2);
      context.font = '11px Helvetica';
      context.fillStyle = "#fff";
      context.fillText(blob.color, blob.position.x - blob.radius, blob.position.y + blob.radius + 11);
      // context.fillText('x: ' + blob.position.x + 'px', blob.position.x - blob.radius, blob.position.y + blob.radius + 22);
      // context.fillText('y: ' + blob.position.y + 'px', blob.position.x - blob.radius, blob.position.y + blob.radius + 33);
    });
  };

  // Combine adjacent blobs to form groups
  var makeContactGroups = function(blobs) {
    blobs = _.clone(blobs);
    var groups = [];
    var blob;
    while(blob = blobs.pop()) {
      // Find an existing group that this blob makes contact with
      var group = _.find(groups, function(group) {
        return _.any(group, function(blo) {
          var mergeThreshold = 5; // px
          // Check actual distance between blob borders
          var dist = distance(blob.position, blo.position) - blob.radius - blo.radius;
          return dist < mergeThreshold;
        });
      });
      if(group) {
        // Add to existing group
        group.push(blob);
      } else {
        // Start new group
        groups.push([blob]);
      }
    }
    return groups;
  };

  // Return all color groups forming a
  // four corner marker in the given image
  var detectMarkers = function(blobs) {
    // Group adjacent blobs to form markers
    var groups = makeContactGroups(blobs);
    // if(groups.length) console.log(groups);
    // Find a matching group for every body part
    var markers = _.map(colorCombos, function(combo) {
      var group = _.find(groups, function(group) {
        // Check if the set of used colors is the same
        if(group.length != 4) return false;
        var groupColors = _.unique(_.map(group, 'color'));
        return !_.difference(groupColors, combo).length;
      });
      return group ? _.map(group, 'position') : null;
    });
    //XXX Order corners correctly
    return markers;
  };

  // Return the real world position and
  // orientation of the given marker
  var poseFromMarker = function(marker) {
    var markerSize = 70; // mm
    var posit = new Posit(markerSize, width);
    // Corners must be centered on canvas 
    var corners = _.map(marker, function(corner) {
      return {
        x: corner.x - (width / 2),
        y: (height / 2) - corner.y
      };
    });
    var pose = posit.pose(corners);
    console.log(marker);
    console.log(pose);
    return {
      position: pose.bestTranslation,
      rotation: pose.bestRotation
    };
  };

  // Adjust color deviations to yield
  // more stable tracker performance
  var calibrateColors = function(imageData) {
    // Calibrate each color separately
    _.each(colorDefinitions, function(color, name) {
      // Return number of markers found for this color with given calibration
      var matchesForDeviation = function(deviation) {
        deviations[name].dh = deviation;
        registerColors();
        var blobs = detectBlobs(imageData);
        var matchingBlobs = _.select(blobs, function(blob) {
          return blob.color == name;
        });
        return matchingBlobs.length;
      };
      var steps = 30;
      // Increase deviation until we first find a marker of this color
      var minDeviation = _.step(0.0, 1.0, steps, function(step) {
        if(matchesForDeviation(step) == 1) return step;
      });
      // Decrease deviation until we find only one marker
      var maxDeviation = _.step(0.0, 1.0, steps, function(step) {
        if(matchesForDeviation(1 - step) == 1) return 1 - step;
      });
      // Set final deviation to average of extremes
      deviations[name].dh = (minDeviation * 0.75 + maxDeviation * 0.25);
      console.log("Final deviation for " + name + ": " + deviations[name].dh);
    });
    registerColors();
  };

  // Replace reference colors with actual colors found in the image
  var repickColors = function(imageData) {
    var blobs = detectBlobs(imageData);
    _.each(blobs, function(blob) {
      var color = colorDefinitions[blob.color];
      if(!color) return;
      var pixel = colorAround(source.context, blob.position.x, blob.position.y);
      color.copy(pixel);
    });
    registerColors();
  };

  // Average color surrounding the given coordinates
  var colorAround = function(context, x, y) {
    var sum = {
      r: 0,
      g: 0,
      b: 0
    };
    var radius = 5;
    var steps = 0;
    _.step(x - radius, x + radius, radius * 2 + 1, function(sx) {
      _.step(x - radius, y + radius, radius * 2 + 1, function(sy) {
        var pixel = context.getImageData(sx, sy, 1, 1).data;
        if(pixel) {
          sum.r += pixel[0];
          sum.g += pixel[1];
          sum.b += pixel[2];
          steps++;
        }
      });
    });
    return new THREE.Color(sum.r / steps / 255, sum.g / steps / 255, sum.b / steps / 255);
  };

  // Find camera height and orientation
  // and adjust calibration accordingly
  var fovX = 70; // Degrees
  var fovY = 60;
  var radiusAtOneMeter = 15 / 640 * width;
  var camHeight = 60;
  var camRotation = 0; // Radians

  var calibrateSpace = function(imageData) {
    var blobs = detectBlobs(imageData);
    var groundMarkers = _.select(blobs, function(blob) {
      return blob.color == colorCombos.ground[0];
    });
    if(groundMarkers.length >= 2) {
      // Zero camera configuration to receive raw values
      camHeight = 0;
      camRotation = 0;
      // Find ground markers in camera space
      var positions = _.map(groundMarkers, function(marker) {
        return getBlobPosition(marker);
      });
      // Find angle between the vector from one marker to the other and the ground
      var firstIsGreater = positions[0].y > positions[1].y;
      var higherPos = firstIsGreater ? positions[0] : positions[1];
      var lowerPos  = firstIsGreater ? positions[1] : positions[0];
      var groundLine = higherPos.sub(lowerPos);
      var realGroundLine = groundLine.copy().setY(0);
      // Set camera rotation
      camRotation = groundLine.angleTo(realGroundLine);
      // Estimate marker positions again to determine ground level
      var positions = _.map(groundMarkers, function(marker) {
        return getBlobPosition(marker);
      });
      // Set camera height
      camHeight = -positions[0].y;
    } else {
      console.error("Calibration failed: Could not find ground markers");
    }
  };

  var calibrate = function() {
    var imageData = source.getData();
    // Make sure we find each marker exactly once
    calibrateColors(imageData);
    // Update colors to match actual colors found
    // repickColors(imageData);
    // Recalibrate for new colors
    // calibrateColors(imageData);
    // Now that we find all the markers, position the camera space
    // calibrateSpace(imageData);
  };

  // Get blob position in world space
  var getBlobPosition = function(blob) {
    var depth = radiusAtOneMeter / blob.radius;
    var angleX = -fovX * (blob.position.x / width - 0.5);
    var angleY = fovY * (blob.position.y / height - 0.5);
    var yAxis = new THREE.Vector3(0, 1, 0);
    var rotY = (new THREE.Quaternion()).setFromAxisAngle(yAxis, THREE.Math.degToRad(angleX));
    var xAxis = new THREE.Vector3(1, 0, 0);
    var camRot = (new THREE.Quaternion()).setFromAxisAngle(xAxis, camRotation);
    xAxis.applyQuaternion(rotY);
    var rotX = (new THREE.Quaternion()).setFromAxisAngle(xAxis, THREE.Math.degToRad(angleY));
    var position = new THREE.Vector3(0, 0, depth);
    position.applyQuaternion(rotY).applyQuaternion(rotX).applyQuaternion(camRot).multiplyScalar(200);
    position.setY(position.y + camHeight);
    // console.log(position);
    return position;
  };

  // Return head position if found
  var getHeadPosition = function(blobs) {
    var headBlob = _.find(blobs, function(blob) {
      return blob.color == colorCombos.head[0];
    });
    if(headBlob) {
      return getBlobPosition(headBlob);
    }
  };

  // Detect the world positions of
  // all body parts using the given image
  var getBodyParts = function(imageData) {
    var blobs = detectBlobs(imageData);
    var head = getHeadPosition(blobs);
    // var markers = detectMarkers(blobs);

    var markers = {
      head: {
        position: head
      },
      left: {
        position: head,
        active: false
      },
      right: {
        position: head,
        active: false
      }
    };

    // Draw rectangles back onto canvas
    drawBlobs(blobs, source.context);

    return markers;

    // var poses = _.map(markers, function(marker) {
    //   return marker && poseFromMarker(marker);
    // });
    // return poses;
  };

  var lastNow;

  var tick = function() {
    if(!self.running) return;
    // Rate limit detector to give garbage collector some time between frames
    requestAnimationFrame(tick);
    var now = new Date().getTime();
    var delta = now - (lastNow || now);
    if(delta && delta < 1000 / tracksPerSecond) return;
    lastNow = now;
    // Get image pixels
    var imageData = source.getData();
    if(!imageData) return;
    // Detect head and hand positions and orientations
    var body = getBodyParts(imageData);
    cb(body);
  };

  var self = {
    running: false,
    videoSource: source,

    start: function() {
      if(self.running) return _.promiseFrom(null);
      self.running = true;
      return source.play().then(tick);
    },

    stop: function() {
      self.running = false;
      return source.pause();
    },

    calibrate: function(cb) {
      source.play().then(function() {
        _.waitFor(function() {
          return source.getData();
        }, function() {
          calibrate();
          cb();
        });
      });
    }
  };

  return self;
};

var distance = function(p1, p2) {
  return Math.sqrt(_.square(p1.x - p2.x) + _.square(p1.y - p2.y));
};

module.exports = ColorTracker;

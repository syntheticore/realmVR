var _ = require('eakwell');
var THREE = require('three');

var Posit = require('./posit.js').Posit;
var VideoSource = require('./videoSource.js');

var ColorTracker = function(cb, width, height) {
  width = width || 640;
  height = height || 480;

  var source = new VideoSource(width, height);
  var tracker;
  var colorCombos;

  // Register a named color with the tracker
  // Colors that differ less than the given thresholds
  // in HSL color space are considered for tracking
  var registerColor = function(name, color, dh, ds, dl) {
    var hsl = color.getHSL();
    var pixelColor = new THREE.Color();
    tracking.ColorTracker.registerColor(name, function(r, g, b) {
      pixelColor.setRGB(r / 255, g / 255, b / 255);
      var hslPixel = pixelColor.getHSL();
      return Math.abs(hslPixel.h - hsl.h) < dh &&
             Math.abs(hslPixel.s - hsl.s) < ds &&
             Math.abs(hslPixel.l - hsl.l) < dl;
    });
  };

  var configureTracker = function() {
    // Make custom colors known to tracker
    registerColor('apple',    new THREE.Color(137 / 255, 193 / 255, 114 / 255), 0.1, 0.3, 0.3);
    registerColor('cardinal', new THREE.Color(102 / 255, 48  / 255, 79  / 255), 0.1, 0.3, 0.3);

    // Define combinations of color that represent a single entity
    colorCombos = {
      head: ['apple'],
      left: ['magenta', 'cyan'],
      right: ['cardinal', 'cyan']
    };
    var colors = _.unique(_.flatten(_.values(colorCombos)));

    tracker = new tracking.ColorTracker(colors);
  };

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
    // Draw rectangles back onto canvas
    drawBlobs(blobs, source.context);
    return blobs;
  };

  var drawBlobs = function(blobs, context) {
    // source.context.clearRect(0, 0, source.canvas.width, source.canvas.height);
    _.each(blobs, function(blob) {
      context.strokeStyle = blob.color;
      context.strokeRect(blob.position.x - blob.radius, blob.position.y - blob.radius, blob.radius * 2, blob.radius * 2);
      context.font = '11px Helvetica';
      context.fillStyle = "#fff";
      context.fillText('x: ' + blob.position.x + 'px', blob.position.x, blob.position.y + 11);
      context.fillText('y: ' + blob.position.y + 'px', blob.position.x, blob.position.y + 22);
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

  var detectHead = function(blobs) {
    var radiusAtOneMeter = 15 / 640 * width;
    var fovX = 70;
    var fovY = 60;
    var camHeight = 0.6;
    var camRotation = 3;
    var headBlob = _.find(blobs, function(blob) {
      return blob.color == colorCombos.head[0];
    });
    if(headBlob) {
      var depth = radiusAtOneMeter / headBlob.radius;
      var angleX = -fovX * (headBlob.position.x / width - 0.5);
      var angleY = fovY * (headBlob.position.y / height - 0.5);
      var yAxis = new THREE.Vector3(0, 1, 0);
      var rotY = (new THREE.Quaternion()).setFromAxisAngle(yAxis, THREE.Math.degToRad(angleX));
      var xAxis = new THREE.Vector3(1, 0, 0);
      var camRot = (new THREE.Quaternion()).setFromAxisAngle(xAxis, THREE.Math.degToRad(camRotation));
      xAxis.applyQuaternion(rotY);
      var rotX = (new THREE.Quaternion()).setFromAxisAngle(xAxis, THREE.Math.degToRad(angleY));
      var position = new THREE.Vector3(0, 0, depth);
      position.applyQuaternion(rotY).applyQuaternion(rotX).applyQuaternion(camRot).multiplyScalar(100);
      position.setY(position.y + camHeight * 100);
      return position;
    }
  };

  // Detect the real world positions of
  // all body parts using the given image
  var findBodyParts = function(imageData) {
    var blobs = detectBlobs(imageData);
    var markers = detectMarkers(blobs);
    var head = detectHead(blobs);

    markers.head = {position: head};
    return markers;

    // var poses = _.map(markers, function(marker) {
    //   return marker && poseFromMarker(marker);
    // });
    // return poses;
  };

  var calibrate = function() {
    var imageData = source.getData();
    var blobs = detectBlobs(imageData);

  };

  var lastNow;

  var tick = function() {
    if(!self.running) return;
    // Rate limit detector to give garbage collector some time between frames
    requestAnimationFrame(tick);
    var now = new Date().getTime();
    var delta = now - (lastNow || now);
    if(delta && delta < 1000 / 8) return;
    lastNow = now;
    // Get image pixels
    var imageData = source.getData();
    if(!imageData) return;
    // Detect head and hand positions and orientations
    var body = findBodyParts(imageData);
    cb(body);
  };

  configureTracker();

  var self = {
    running: false,
    videoSource: source,

    start: function() {
      self.running = true;
      return source.play().then(tick);
    },

    stop: function() {
      self.running = false;
      return source.pause();
    }
  };

  return self;
};

var distance = function(p1, p2) {
  return Math.sqrt(_.square(p1.x - p2.x) + _.square(p1.y - p2.y));
};

module.exports = ColorTracker;

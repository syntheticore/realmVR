var _ = require('eakwell');

var Aruco = require('./aruco.js');
var Posit = require('./posit.js').Posit;
var VideoSource = require('./videoSource.js');

var ColorTracker = function(cb, width, height) {
  width = width || 640;
  height = height || 480;

  var source = new VideoSource(width, height);
  var markerDetector = new Aruco.Detector();

  var detectArucoMarkers = function(imageData) {
    var out = {};
    var markers = markerDetector.detect(imageData);
    _.each(markers, function(marker) {
      var part = {
        21: 'head',
        23: 'left',
        24: 'right'
      }[marker.id];
      out[part] = marker.corners;
    });
    return out;
  };

  // Configure color detector
  var colorCombos = {
    head: ['magenta'],
    left: ['magenta', 'cyan'],//, 'green'],
    right: ['magenta', 'cyan']//, 'yellow']
  };
  var colors = _.unique(_.flatten(_.values(colorCombos)));
  var tracker = new tracking.ColorTracker(colors);

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
          radius: (rect.width + rect.height) / 2
        };
      });
    });
    // Emit track event
    tracker.track(imageData.data, width, height);
    return blobs;
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
        // console.log(group);
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
  var detectColorMarkers = function(imageData) {
    var blobs = detectBlobs(imageData);
    // Group adjacent blobs to form markers
    var groups = makeContactGroups(blobs);
    console.log(groups);
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

  // Detect the real world positions of
  // all body parts using the given image
  var findBodyParts = function(imageData) {
    var markers = detectColorMarkers(imageData);
    console.log(markers);
    // var markers = detectArucoMarkers(imageData);
    var poses = _.map(markers, function(marker) {
      return marker && poseFromMarker(marker);
    });
    return poses;
  };

  // Track body and call back listeners
  var tick = function() {
    // console.log("tick");
    if(self.running) _.defer(tick);
    var imageData = source.getData();
    if(!imageData) return;
    var body = findBodyParts(imageData);
    cb(body);
  };

  var self = {
    running: false,
    videoSource: source,

    start: function() {
      self.running = true;
      console.log("started");
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

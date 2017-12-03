var _ = require('eakwell');
var THREE = require('three');
var jsfeat = require('jsfeat');

var CV = require('./deps/cv.js');
var Posit = require('./deps/posit.js').Posit;
var Aruco = require('./deps/aruco.js');
var VideoSource = require('./videoSource.js');

var Tracker = function(cb, width, height) {
  width = width || 640;
  height = height || 480;

  var markerSize = 48; // mm

  var maxMarkerAspectRatio = 10;
  var maxMarkerPerspective = 1.5;

  var source = new VideoSource(width, height);
  var detector = new Aruco.Detector();
  var motionTracker = new MotionTracker(width, height);
  var posit = new Posit(markerSize, width);

  var cameraPosition = new THREE.Vector3();
  // var cameraRotation = new THREE.Euler();
  var cameraOrientation = new THREE.Quaternion();
  var worldScale = 1;

  var hmdWidth = 145;
  var hmdHeight = 80;

  var cubeDefs = {
    testCube: {
      top: {
        id: 869,
        baseRotation: new THREE.Quaternion(),
        baseOffset: new THREE.Vector3(0, 0, 0)
      },
      bottom: {
        id: 954,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
        baseOffset: new THREE.Vector3(0, 0, 0)
      },
      front: {
        id: 136,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        baseOffset: new THREE.Vector3(0, 0, 0)
      },
      left: {
        id: 402,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
        baseOffset: new THREE.Vector3(0, 0, 0)
      },
      right: {
        id: 661,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
        baseOffset: new THREE.Vector3(0, 0, 0)
      }
    },
    hmd: {
      frontLeft: {
        id: 793,
        baseRotation: new THREE.Quaternion(), // Front is base orientation (z-axis sticking out the HMD)
        baseOffset: new THREE.Vector3(-markerSize / 2, 0, -hmdWidth / 2) // In marker space
      },
      frontRight: {
        id: 370,
        baseRotation: new THREE.Quaternion(),
        baseOffset: new THREE.Vector3(markerSize / 2, 0, -hmdHeight / 2)
      },
      left: {
        id: 868,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2),
        baseOffset: new THREE.Vector3(0, 0, -hmdWidth / 2)
      },
      right: {
        id: 9,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
        baseOffset: new THREE.Vector3(0, 0, -hmdWidth / 2)
      }
    },
    leftHand: {
      front: {
        id: 269,
        baseRotation: new THREE.Quaternion(),
        baseOffset: new THREE.Vector3(0, 0, 0)
      }
    }
  };

  // Draw rectangles around blobs
  var drawMarkers = function(markers, ctx) {
    ctx.lineWidth = 2;
    _.each(markers, function(marker) {
      // Oulines
      ctx.beginPath();
      ctx.strokeStyle = (marker.isApproximated ? 'white' : 'red');
      var lastCorner = marker.corners[3];
      ctx.moveTo(lastCorner.x, lastCorner.y);
      _.each(marker.corners, function(corner) {
        ctx.lineTo(corner.x, corner.y);
      });
      ctx.stroke();
      ctx.closePath();
      // First corner
      ctx.strokeStyle = 'green';
      ctx.strokeRect(marker.corners[0].x - 2, marker.corners[0].y - 2, 4, 4);
      // Id
      ctx.font = '11px Helvetica';
      ctx.fillStyle = "#fff";
      ctx.fillText(marker.id, lastCorner.x, lastCorner.y);
    });
  };

  var arucoVec2three = function(vec) {
    return new THREE.Vector3(vec[0], vec[1], -vec[2]);
  };

  var arucoRot2three = function(rot) {
    return new THREE.Euler(
      -Math.asin(-rot[1][2]),
      -Math.atan2(rot[0][2], rot[2][2]),
      Math.atan2(rot[1][0], rot[1][1])
    );
  };

  var cam2world = function(vec) {
    // return vec.applyEuler(cameraOrientation).add(cameraPosition).multiplyScalar(worldScale);
    return vec.multiplyScalar(worldScale).applyQuaternion(cameraOrientation).add(cameraPosition);
  };

  // var invertEuler = function(euler) {
  //   return euler.setFromQuaternion((new THREE.Quaternion()).setFromEuler(euler).inverse());
  // };

  // Return the real world position and
  // orientation of the given marker
  var orientMarker = function(marker) {
    // Corners must be centered on canvas 
    var corners = _.map(marker.corners, function(corner) {
      return {
        x: corner.x - (width / 2),
        y: (height / 2) - corner.y
      };
    });
    var pose = posit.pose(corners);
    marker.position = cam2world(arucoVec2three(pose.bestTranslation));
    marker.rotation = arucoRot2three(pose.bestRotation);
    marker.error = pose.bestError || 0.1;
  };

  var getMarkers = function(imageData) {
    var markers = detector.detect(imageData, 0.05, 2, 7, 0.05, 10);
    _.each(markers, function(marker) {
      orientMarker(marker);
    });
    return markers;
  };

  var vecAverage = function(vectors, weights) {
    var avg = new THREE.Vector3();
    var sum = 0;
    _.each(vectors, function(vec, i) {
      var weight = (weights && weights[i]) || 1;
      avg.add(vec.multiplyScalar(weight));
      sum += weight;
    });
    return avg.multiplyScalar(1 / sum);
  };

  var getPose = function(markers, cubeDef) {
    var cube = _.map(cubeDef, function(def, face) {
      var marker = _.find(markers, function(marker) {
        return marker.id == def.id;
      });
      if(!marker) return;
      return {
        center: def.baseOffset.clone().applyEuler(marker.rotation).add(marker.position),
        rotation: (new THREE.Euler()).setFromQuaternion((new THREE.Quaternion()).setFromEuler(marker.rotation).multiply(def.baseRotation)),
        quality: 1 //1 / marker.error + 5
      };
    });
    cube = _.compact(_.values(cube));
    if(!cube.length) return null;
    var qualities = _.map(cube, 'quality');
    var position = vecAverage(_.map(cube, 'center'), qualities);
    var rotation = vecAverage(_.invoke(_.map(cube, 'rotation'), 'toVector3'));
    return {
      position: position,
      // rotation: rotation, //XXX interpolate quaternions
      orientation: (new THREE.Quaternion()).setFromEuler((new THREE.Euler()).setFromVector3(rotation)),
      active: false
    };
  };

  var distance = function(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  var increasingRatio = function(value) {
    return value >= 1 ? value : 1 / value;
  };

  var isWellformed = function(vertices) {
    var distances = _.map(vertices, function(vertex, i) {
      return distance(vertex, vertices[(i + 1) % vertices.length]);
    });
    var aspects = _.map(distances, function(dist, i) {
      return increasingRatio(dist / distances[(i + 1) % distances.length]);
    });
    return !_.any(aspects, function(aspect, i) {
      // Reject very thin shapes
      if(aspect > maxMarkerAspectRatio) return true;
      // Reject shapes with a single corner wide off
      if(increasingRatio(aspect / aspects[(i + 1) % aspects.length]) > maxMarkerPerspective) return true;
    });
  };

  var lastMarkers;

  var motionComplete = function(markers, imageData) {
    motionTracker.clear();
    var unfoundMarkers = _.select(lastMarkers, function(lastMarker) {
      return !_.any(markers, function(marker) {
        return marker.id == lastMarker.id;
      });
    });
    _.each(unfoundMarkers, function(marker) {
      _.each(marker.corners, function(corner) {
        corner.motionIndex = motionTracker.addPoint(corner.x, corner.y);
      });
      marker.isApproximated = true;
    });
    motionTracker.tick(imageData, source.context);
    _.each(unfoundMarkers, function(marker) {
      var complete = _.all(marker.corners, function(corner) {
        var point = motionTracker.getPoint(corner.motionIndex);
        if(!point) return false;
        corner.x = point.x;
        corner.y = point.y;
        return true;
      });
      if(complete && CV.isContourConvex(marker.corners) && isWellformed(marker.corners)) {
        orientMarker(marker);
        markers.push(marker);
      }
    });
    lastMarkers = markers;
  };

  // Detect the world positions of
  // all body parts using the given image
  var getBody = function(imageData) {
    var markers = getMarkers(imageData);
    motionComplete(markers, imageData);
    var hmd = getPose(markers, cubeDefs.hmd);
    var left = getPose(markers, cubeDefs.leftHand);
    var right = getPose(markers, cubeDefs.testCube);
    // Draw markers back onto canvas
    drawMarkers(markers, source.context);
    return {
      hmd: hmd,
      leftHand: left,
      rightHand: right,
      markers: markers
    };
  };

  var calibrate = function(imageData) {
    worldScale = 1;
    cameraPosition = new THREE.Vector3(0, 1700, 0);
    return;
    cameraOrientation = (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    return;
    var body = getBody(imageData);
    if(!body.hmd) return; //XXX
    cameraPosition = body.hmd.position.clone().negate();
    // cameraOrientation = invertEuler(body.hmd.rotation.clone());
    cameraOrientation = body.hmd.orientation.clone().inverse();
    worldScale = 1 / cameraPosition.length();
  };

  var lastImageData;

  var self = {
    running: false,
    videoSource: source,

    start: function() {
      if(self.running) return _.promiseFrom(null);
      self.running = true;
      return source.run(function(image) {
        if(lastImageData) {
          var body = getBody(image.data);
          if(!(body.hmd || body.leftHand || body.rightHand)) return;
          // Return results in meters
          body.hmd && body.hmd.position.divideScalar(1000);
          body.leftHand && body.leftHand.position.divideScalar(1000);
          body.rightHand && body.rightHand.position.divideScalar(1000);
          cb({
            pose: body,
            timestamp: image.timestamp
          });
        }
        lastImageData = image.data;
      });
    },

    stop: function() {
      self.running = false;
      return source.stop();
    },

    calibrate: function(cb) {
      source.play().then(function() {
        var data;
        _.waitFor(function() {
          data = source.getData();
          return data;
        }, function() {
          calibrate(data);
          cb();
        });
      });
    }
  };

  return self;
};

var MotionTracker = function(width, height) {
  var self = this;

  var maxPoints = 64;

  self.win_size = 20;
  self.max_iterations = 30;
  self.epsilon = 0.01;
  self.minEigen = 0.001;

  var pyramid = new jsfeat.pyramid_t(3);
  var lastPyramid = new jsfeat.pyramid_t(3);
  pyramid.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);
  lastPyramid.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);

  var pointCount = 0;
  var status = new Uint8Array(maxPoints);
  var points = new Float32Array(maxPoints * 2);
  var lastPoints = new Float32Array(maxPoints * 2);


  self.addPoint = function(x, y) {
    points[pointCount<<1] = x;
    points[(pointCount<<1)+1] = y;
    return pointCount++;
  };

  self.getPoint = function(index) {
    if(!status[index]) return;
    return {
      x: points[index<<1],
      y: points[(index<<1) + 1]
    };
  };

  self.tick = function(imageData, ctx) {
    var tmp = lastPoints;
    lastPoints = points;
    points = tmp;
    tmp = lastPyramid;
    lastPyramid = pyramid;
    pyramid = tmp;
    jsfeat.imgproc.grayscale(imageData.data, width, height, pyramid.data[0]);
    pyramid.build(pyramid.data[0], true);
    jsfeat.optical_flow_lk.track(lastPyramid, pyramid, lastPoints, points, pointCount, self.win_size|0, self.max_iterations|0, status, self.epsilon, self.minEigen);
  };

  self.clear = function() {
    pointCount = 0;
  };
};

module.exports = Tracker;

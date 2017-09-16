var _ = require('eakwell');
var THREE = require('three');
var jsfeat = require('jsfeat');

var Posit = require('./deps/posit.js').Posit;
var Aruco = require('./deps/aruco.js');
var VideoSource = require('./videoSource.js');

var Tracker = function(cb, width, height) {
  width = width || 640;
  height = height || 480;

  var maxFPS = 20;
  var markerSize = 48; // mm
  var minCornerDistance = 10; // px

  var source = new VideoSource(width, height);
  var detector = new Aruco.Detector();
  var motionTracker = new MotionTracker(width, height);
  var posit = new Posit(markerSize, width);

  var cameraPosition = new THREE.Vector3();
  var cameraRotation = new THREE.Euler();
  var worldScale = 1;

  var hmdWidth = 145;
  var hmdHeight = 80;

  var cubeDefs = {
    testCube: {
      top: {
        id: 869,
        baseRotation: new THREE.Quaternion()
      },
      bottom: {
        id: 954,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      },
      front: {
        id: 136,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      },
      left: {
        id: 402,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
      },
      right: {
        id: 661,
        baseRotation: (new THREE.Quaternion()).setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
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
    return vec.applyEuler(cameraRotation).add(cameraPosition).multiplyScalar(worldScale);
  };

  var invertEuler = function(euler) {
    return euler.setFromQuaternion((new THREE.Quaternion()).setFromEuler(euler).inverse())
  };

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
        quality: 1 / marker.error + 5
      };
    });
    cube = _.compact(_.values(cube));
    if(!cube.length) return null;
    var qualities = _.map(cube, 'quality');
    return {
      position: vecAverage(_.map(cube, 'center'), qualities),
      rotation: vecAverage(_.invoke(_.map(cube, 'rotation'), 'toVector3')), //XXX interpolate quaternions
      active: false
    };
  };

  var isConvex = function(vertices) {
    var sign = false;
    var n = vertices.length;
    for(var i = 0; i < n; i++) {
      var dx1 = vertices[(i + 2) % n].x - vertices[(i+1) % n].x;
      var dy1 = vertices[(i + 2) % n].y - vertices[(i + 1) % n].y;
      var dx2 = vertices[i].x - vertices[(i + 1) % n].x;
      var dy2 = vertices[i].y - vertices[(i + 1) % n].y;
      var cross = dx1 * dy2 - dy1 * dx2;
      if(i == 0) {
        sign = cross > 0;
      } else if(sign != (cross > 0)) {
        return false;
      }
    }
    return true;
  };

  var distance = function(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  var isWellformed = function(vertices) {
    var lastDistance = 0;
    var n = vertices.length;
    for(var i = 0; i < n; i++) {
      var dist = distance(vertices[i], vertices[(i + 1) % n]);
      if(dist < minCornerDistance) return false;
      if(lastDistance && Math.abs(dist - lastDistance) > Math.min(dist, lastDistance) * 6) return false;
      lastDistance = dist;
    }
    return true;
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
      if(complete && isConvex(marker.corners) && isWellformed(marker.corners)) {
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
    var left = getPose(markers, cubeDefs.hmd);
    var right = getPose(markers, cubeDefs.hmd);
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
    cameraPosition = new THREE.Vector3(100, 170, 100);
    worldScale = 1;
    return;
    var body = getBody(imageData);
    if(!body.hmd) return; //XXX
    cameraPosition = body.hmd.position.clone().negate(); //copy
    cameraRotation = invertEuler(body.hmd.rotation.clone()); // copy
    worldScale = 1 / cameraPosition.length();
  };

  var lastNow;
  var lastImageData;

  var self = {
    running: false,
    videoSource: source,

    start: function() {
      if(self.running) return _.promiseFrom(null);
      self.running = true;
      return source.run(function(image) {
        if(lastImageData) {
          cb({
            pose: getBody(image.data),
            timestamp: image.timestamp
          });
        }
        lastImageData = image.data;
      });
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
          calibrate(source.getData());
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

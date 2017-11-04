var _ = require('eakwell');

// Provide easy access to raw image data from a live
// video stream at the camera's native frame rate
var VideoSource = function(width, height) {
  var numTestFrames = 60;
  var grabInterval = 1000 / 60;

  var video = document.createElement('video');
  video.width = width;
  video.height = height;

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');

  var compareFrames = function(frame1, frame2) {
    for(var i = frame1.data.length - 1; i >= 0; i--) {
      if(frame1.data[i] != frame2.data[i]) return true;
    }
  };

  var collectFrames = function() {
    return new Promise(function(ok) {
      var frames = [];
      video.play();
      _.waitFor(function() {
        return self.getData();
      }, function() {
        var loop = function() {
          if(frames.length >= numTestFrames) {
            video.pause();
            return ok(frames);
          }
          requestAnimationFrame(loop);
          frames.push({
            timestamp: performance.now(),
            image: self.getData()
          });
        };
        loop();
      });
    });
  };

  var testFramerate = function() {
    return collectFrames().then(function(frames) {
      var frameDurations = [];
      var duration = 0;
      _.each(frames, function(frame, i) {
        var nextFrame = frames[i + 1];
        if(!nextFrame) return;
        var different = compareFrames(frame.image, nextFrame.image);
        duration += nextFrame.timestamp - frame.timestamp;
        if(different) {
          frameDurations.push(duration);
          duration = 0;
        }
      });
      frameDurations.shift();
      frameDurations.shift();
      return _.minBy(frameDurations, function(duration) {
        return duration;
      });
    });
  };

  var init = function() {
    return _.promise(function(ok, fail) {
      if(!navigator.mediaDevices) {
        fail("getUserMedia() not supported.");
        return;
      }
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: width,
          height: height,
          frameRate: 60
        }
      }).then(function(stream) {
        video.src = window.URL.createObjectURL(stream);
        video.onloadedmetadata = function() {
          testFramerate().then(function(_grabInterval) {
            grabInterval = _grabInterval;
            console.log('Grabbing frames at ' + Math.round(1000 / _grabInterval) + ' FPS');
            ok();
          });
        };
      }).catch(function(err) {
        console.error(err);
        fail(err);
      });
    });
  };

  var running = false;

  var self = {
    canvas: canvas,
    context: context,

    play: function() {
      return init().then(function() {
        video.play();
        running = true;
      });
    },

    pause: function() {
      video.pause();
      running = false;
    },

    run: function(cb) {
      return self.play().then(function() {
        var loop = function() {
          if(!running) return;
          setTimeout(loop, grabInterval);
          cb({
            timestamp: Date.now(),
            data: self.getData()
          });
        };
        loop();
      });
    },

    getData: function(ctx) {
      ctx = ctx || context;
      if(video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height);
      }
    }
  };

  return self;
};

// Shim for older implementations of getUserMedia
if(typeof navigator != 'undefined') {
  navigator.mediaDevices = navigator.mediaDevices || ((navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia) ? {
    getUserMedia: function(c) {
      return new Promise(function(y, n) {
        (navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia).call(navigator, c, y, n);
      });
    }
  } : null);
}

module.exports = VideoSource;

var _ = require('eakwell');

// Provide easy access to raw image
// data from a live video stream
var VideoSource = function(width, height) {
  var video = document.createElement('video');
  video.width = width;
  video.height = height;

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');

  var init = _.promise(function(ok, fail) {
    if(!navigator.mediaDevices) {
      fail("getUserMedia() not supported.");
      return;
    }
    navigator.mediaDevices.getUserMedia({video: true}).then(function(stream) {
      video.src = window.URL.createObjectURL(stream);
      video.onloadedmetadata = function() {
        ok();
      };
    }).catch(function(err) {
      console.error(err);
      fail(err);
    });
  });

  return {
    canvas: canvas,
    context: context,

    play: function() {
      return init.then(function() {
        video.play();
      });
    },

    pause: function() {
      return init.then(function() {
        video.pause();
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

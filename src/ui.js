var _ = require('eakwell');
var Host = require('./host.js');
var THREE = require('./deps/threeAddons.js');

var UI = function(startSelector) {
  var self = this;
  _.eventHandling(self);

  var width = 640;
  var height = 480;

  var host = new Host(width, height, null, startSelector);
  var glView = new GlView(width, height);

  var mainTemplate = `
    <div class="rvr-backdrop">
      <style type="text/css">
        .rvr-backdrop {
          position: fixed;
          z-index: 101;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255,255,255, 0.8);
          display: flex;
          justify-items: center;
          align-items: center;
        }
        .rvr-backdrop * {
          font-family: 'Neue Helvetica', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif !important;
        }
        .rvr-dialog {
          overflow: hidden;
          margin: auto;
          background: #fff;
          padding: 2rem;
          border-radius: 3px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
          border: 1px solid #cacaca;
        }
        .rvr-dialog button {
          border: 1px solid #cacaca;
          background: white;
          font-size: 1rem;
          font-weight: 600;
          color: gray;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: all 0.2s;
          outline: none;
          border-radius: 2px;
          margin: 0;
        }
        .rvr-dialog button:hover {
          color: #383838;
          box-shadow: 0 1px 2px rgba(0,0,0, 0.15);
          text-decoration: none;
        }
        .rvr-dialog button:active {
          box-shadow: inset 0 1px 2px rgba(0,0,0, 0.15);
        }
        .rvr-dialog header {
          width: 640px;
          margin-bottom: 2rem;
        }
        .rvr-dialog .rvr-close {
          float: right;
        }
        .rvr-dialog header h1 {
          font-size: 1.6rem;
          display: inline-block;
          color: #383838;
          border-bottom: 2px solid #e42b6c;
        }
        .rvr-dialog header p {
          margin: 1rem 0;
          line-height: 1.4;
          width: 370px;
          font-size: 1.1rem;
          font-weight: 500;
          color: #5d5d5d;
        }
        .rvr-dialog .rvr-display-area {
          position: relative;
          display: flex;
          justify-items: center;
        }
        .rvr-dialog .rvr-display {
          overflow: hidden;
          margin: auto;
          border-radius: 3px;
        }
        .rvr-dialog .rvr-display canvas {
          display: block;
        }
        .rvr-dialog .rvr-gl {
          position: absolute;
          top: 0;
          left: 0;
        }
      </style>

      <div class="rvr-dialog">
        <header>
          <button class="rvr-close">X Cancel</button>
          <h1></h1>
          <p></p>
        </header>
        <div class="rvr-display-area">
          <div class="rvr-display"></div>
          <div class="rvr-gl"></div>
        </div>
      </div>
    </div>
  `;

  var evalTemplate = function(tmpl) {
    var div = document.createElement('div');
    div.innerHTML = tmpl;
    return div.childNodes[1];
  };

  var updateView = function(view, data) {
    view.querySelector('h1').textContent = data.title;
    view.querySelector('p').textContent = data.description;
    if(data.display) {
      var display = view.querySelector('.rvr-display');
      display.innerHTML = '';
      display.appendChild(data.display);
    }
  };

  self.startTracker = function() {
    var mainView = evalTemplate(mainTemplate);
    updateView(mainView, {
      title: 'realmVR',
      description: 'Please allow access to your computer\'s camera for tracking to begin'
    });
    document.body.appendChild(mainView);
    _.once(mainView.querySelector('.rvr-close'), 'click', function() {
      host.stop();
      document.body.removeChild(mainView);
    });

    host.on('status', function(status) {
      updateView(mainView, status);
    });

    host.on('clientConnected', function() {
      mainView.querySelector('.rvr-gl').appendChild(glView.domElement);
    });

    host.on('track', function(pose) {
      glView.clear();
      _.each(pose.markers, function(marker) {
        glView.createPlane(marker);
      });
      pose.hmd && glView.updateHMD(pose.hmd);
      pose.leftHand && glView.updateHand(pose.leftHand);
      glView.render();
    });

    return host.start().catch(function(error) {
      updateView(mainView, {
        title: 'We have a problem',
        description: error
      });
    });
  };
};

var GlView = function(width, height) {
  var self = this;

  var renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  // renderer.setClearColor(0xffff00, 1);
  renderer.setSize(width, height);
  renderer.setPixelRatio(2);
  self.domElement = renderer.domElement;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 100);
  var disposables = [];

  var createModel = function(width, height, depth) {
    var geometry = new THREE.BoxGeometry(width, height, depth);
    // var material = new THREE.MeshPhongMaterial();
    var colors = ['red', 'red', 'green', 'green', 'blue', 'black'];
    var j = 0;
    _.each(colors, function(color) {
      geometry.faces[j].color.set(color);
      geometry.faces[j + 1].color.set(color);
      j += 2;
    });
    var material = new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors});
    material.transparent = true;
    material.opacity = 0.5;
    var model = new THREE.Mesh(geometry, material);
    var axisHelper = new THREE.AxesHelper(0.150);
    scene.add(model);
    model.add(axisHelper);
    return model;
  };

  var applyTransform = function(obj, transform) {
    obj.position.x = transform.position.x;
    obj.position.y = transform.position.y;
    obj.position.z = transform.position.z;
    if(transform.orientation) {
      obj.quaternion.copy(transform.orientation);
    } else {
      obj.rotation.x = transform.rotation.x;
      obj.rotation.y = transform.rotation.y;
      obj.rotation.z = transform.rotation.z;
    }
  };

  var updateTransform = function(obj, transform) {
    obj.position.x = obj.position.x + (transform.position.x - obj.position.x) * 0.99;
    obj.position.y = obj.position.y + (transform.position.y - obj.position.y) * 0.99;
    obj.position.z = obj.position.z + (transform.position.z - obj.position.z) * 0.99;
    // obj.rotation.x = obj.rotation.x + (transform.rotation.x - obj.rotation.x) + 0.2;
    // obj.rotation.y = obj.rotation.y + (transform.rotation.y - obj.rotation.y) + 0.2;
    // obj.rotation.z = obj.rotation.z + (transform.rotation.z - obj.rotation.z) + 0.2;
    if(transform.orientation) {
      obj.quaternion.copy(transform.orientation);
    } else {
      obj.rotation.x = transform.rotation.x;
      obj.rotation.y = transform.rotation.y;
      obj.rotation.z = transform.rotation.z;
    }
  };

  self.createPlane = function(marker) {
    // var geometry = new THREE.PlaneGeometry(10, 10);
    // var material = new THREE.MeshNormalMaterial();
    // var plane = new THREE.Mesh(geometry, material);
    // applyTransform(plane, marker);
    var axisHelper = new THREE.AxesHelper(0.050);
    applyTransform(axisHelper, marker);
    scene.add(axisHelper);
    // scene.add(plane);
    disposables = _.union(disposables, [axisHelper]);
  };

  self.updateHMD = function(hmd) {
    if(!self.hmd) self.hmd = createModel(0.145, 0.080, 0.080);
    updateTransform(self.hmd, hmd);
  };

  self.updateHand = function(hand) {
    if(!self.hand) self.hand = createModel(0.040, 0.040, 0.040);
    updateTransform(self.hand, hand);
  };

  self.clear = function() {
    _.each(disposables, function(disposable) {
      scene.remove(disposable);
    });
    disposables = [];
  };

  self.render = function() {
    renderer.clear();
    renderer.render(scene, camera);
  };
};

module.exports = UI;

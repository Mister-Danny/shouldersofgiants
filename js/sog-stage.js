/**
 * sog-stage.js — Fixed-stage CSS transform scaling
 *
 * The entire game UI lives in a 1280×720 "stage" div. This module
 * scales it uniformly to fill the browser window while preserving the
 * 16:9 aspect ratio. Letterbox bars appear on the non-matching axis.
 *
 * Depends on nothing — runs before any game module.
 */
window.SOG = window.SOG || {};

window.SOG.Stage = (function () {
  'use strict';

  var TARGET_W = 1280;
  var TARGET_H = 720;
  var _stageEl = null;
  var _scale   = 1;

  function _el() {
    if (!_stageEl) _stageEl = document.getElementById('sog-stage');
    return _stageEl;
  }

  function update() {
    var el = _el();
    if (!el) return;
    _scale = Math.min(
      window.innerWidth  / TARGET_W,
      window.innerHeight / TARGET_H
    );
    el.style.transform = 'scale(' + _scale + ')';
  }

  function getScale() { return _scale; }

  function init() {
    update();
    window.addEventListener('resize',            update);
    window.addEventListener('orientationchange', update);
  }

  return { init: init, update: update, getScale: getScale };
})();

window.addEventListener('DOMContentLoaded', window.SOG.Stage.init);

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

  /* ── Device-pixel snapping ────────────────────────────────────────
     The stage is one composited layer: Chrome rasterizes its contents
     at layout size x devicePixelRatio, then the compositor resamples
     that raster by our transform. When scale x dpr is NOT an integer,
     that second resample lands source pixels between destination
     pixels and everything picks up moire / shimmer — card art, sprites,
     map and text alike. `image-rendering` cannot help: it governs the
     first stage only, and the compositor ignores it.

     Verified with a 1px line pattern rendered at its exact layout size
     (so zero per-image resampling): scale x dpr of 2.000 and 1.000 came
     out clean, 1.376 and 1.888 showed pronounced banding.

     This matters most on the school Chromebooks. At 1280x800 with
     Chrome's toolbar the viewport lands near 1280x712, giving
     scale 0.9889 — fractional, so the whole screen shimmers in
     exchange for about 1% of extra size. Snapping to 1.0 clips 4px
     per edge and makes it pixel-exact.

     We snap to the nearest scale that puts scale x dpr on an integer,
     but only when the cost is small. The cost is measured PER AXIS in
     real pixels rather than as a blanket tolerance, because the stage
     is wider than it is tall: a delta that clips 8px top and bottom
     clips 14px left and right. When height is the limiting axis (the
     usual case) the extra width is absorbed by existing letterbox and
     costs nothing at all, which a blanket tolerance cannot express. */

  /* Per-edge clipping budget. Measured tightest clearance from any
     interactive or text element to a stage edge is 9px
     (#adv-hud-player-name, overworld, bottom); battle's End Turn has
     18px and the deck builder title 10px. 8px stays inside all three. */
  var MAX_CLIP_PX = 8;

  /* Snapping DOWN costs no clipping but shrinks the play area, so it
     gets its own, tighter bound: at most 2% of linear size. */
  var MAX_SHRINK = 0.02;

  function _el() {
    if (!_stageEl) _stageEl = document.getElementById('sog-stage');
    return _stageEl;
  }

  /* Return `raw`, or a nearby scale landing on a whole device pixel if
     that costs less than the budgets above. */
  function _snap(raw, vw, vh) {
    var dpr = window.devicePixelRatio || 1;
    var dev = Math.round(raw * dpr);
    if (dev < 1) return raw;                 // never snap to nothing

    var cand = dev / dpr;
    if (cand === raw) return raw;            // already exact

    if (cand < raw && (raw - cand) / raw > MAX_SHRINK) return raw;

    /* Overflow is split evenly by the centred stage, so each edge
       loses half. Negative means letterbox to spare, not clipping. */
    if ((TARGET_W * cand - vw) / 2 > MAX_CLIP_PX) return raw;
    if ((TARGET_H * cand - vh) / 2 > MAX_CLIP_PX) return raw;

    return cand;
  }

  function update() {
    var el = _el();
    if (!el) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    _scale = _snap(Math.min(vw / TARGET_W, vh / TARGET_H), vw, vh);
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

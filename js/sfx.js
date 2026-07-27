/**
 * sfx.js — central NON-MUSIC sound router + SFX/Master volume axes.
 *
 * Before this module, non-music sound was fragmented: synth tones + Howler card
 * sounds in audio.js (hardcoded volume 1.0), scattered `new Audio(src).play()` /
 * per-module `_playSfx` helpers, and Web-Audio dialogue bleeps wired straight to
 * ctx.destination. This module gives all of them ONE volume knob.
 *
 *   SOG.sfx.play(src, opts)  — fire an HTMLAudio one-shot at the current SFX
 *                              volume; returns the <audio> element (opts.loop
 *                              for looped sounds the caller will stop later).
 *   SOG.sfx.factor()         — current scalar 0..1 = master% × sfx% (read at
 *                              play-time by the audio.js Howls + the bleeps).
 *   SOG.sfx.getCtx()         — the shared AudioContext (audio.js synth uses it).
 *   SOG.sfx.getGain()        — the shared master GainNode the synth routes through
 *                              (its .gain.value tracks factor(), so the synth is
 *                              live-scaled by the SFX/Master sliders).
 *   SOG.sfx.getVolume()/setVolume(pct)   — SFX axis (localStorage sog_sfx_volume).
 *   SOG.sfx.getMaster()/setMaster(pct)   — Master axis (localStorage
 *                              sog_master_volume); a multiplier OVER both SFX and
 *                              music — setMaster also re-applies SOG.music.
 *
 * Volumes are 0–100 ints in localStorage; both default to 100 so behaviour is
 * unchanged until the Options sliders move them.
 */
window.SOG = window.SOG || {};
SOG.sfx = (function () {
  'use strict';

  var KEY_SFX    = 'sog_sfx_volume';
  var KEY_MASTER = 'sog_master_volume';

  function _clampPct(v, dflt) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = dflt;
    return Math.max(0, Math.min(100, v));
  }
  function _sfxPct()    { return _clampPct(localStorage.getItem(KEY_SFX),    100); }
  function _masterPct() { return _clampPct(localStorage.getItem(KEY_MASTER), 100); }

  /** Effective non-music scalar (0..1): master × sfx. */
  function factor() { return (_masterPct() / 100) * (_sfxPct() / 100); }

  /* ── Shared AudioContext + master gain (for the audio.js synth) ──────────── */
  var _ctx = null, _gain = null;
  function _ensure() {
    if (_ctx) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      _ctx  = new C();
      _gain = _ctx.createGain();
      _gain.gain.value = factor();
      _gain.connect(_ctx.destination);
    } catch (e) { _ctx = null; _gain = null; }
  }
  function getCtx() {
    _ensure();
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch (e) {} }
    return _ctx;
  }
  function getGain() { _ensure(); return _gain; }
  function _refreshGain() { if (_gain) { try { _gain.gain.value = factor(); } catch (e) {} } }

  /* ── Named one-shots ─────────────────────────────────────────────────────
     Central registry for sounds referenced from more than one place (or tuned
     often), so call sites use a stable name instead of a path. Plays through
     the same play() below → obeys the Master × SFX volume axes / mute. */
  var NAMED = {
    flagThud: 'sfx/woodthud.mp3',   // flag reveal — pole planting (erect phase)
    flagFlap: 'sfx/flagflap.m4a'    // flag reveal — flag bending/settling (pivot phase)
  };
  function playNamed(name, opts) {
    var src = NAMED[name];
    if (!src) return null;
    return play(src, opts);
  }

  /* ── HTMLAudio one-shot, scaled to the current SFX volume ────────────────── */
  function play(src, opts) {
    opts = opts || {};
    try {
      var a = new Audio(src);
      a.volume = factor();
      if (opts.loop) a.loop = true;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
      return a;
    } catch (e) { return null; }
  }

  /* ── Volume axes ─────────────────────────────────────────────────────────── */
  function setVolume(pct) { localStorage.setItem(KEY_SFX, String(_clampPct(pct, 100))); _refreshGain(); }
  function getVolume()    { return _sfxPct(); }

  function setMaster(pct) {
    localStorage.setItem(KEY_MASTER, String(_clampPct(pct, 100)));
    _refreshGain();
    // Master also scales music — re-apply it through the music module.
    if (window.SOG && SOG.music && typeof SOG.music.refresh === 'function') SOG.music.refresh();
  }
  function getMaster() { return _masterPct(); }

  return {
    play: play,
    playNamed: playNamed,
    factor: factor,
    getCtx: getCtx,
    getGain: getGain,
    refreshGain: _refreshGain,
    setVolume: setVolume,
    getVolume: getVolume,
    setMaster: setMaster,
    getMaster: getMaster
  };
})();

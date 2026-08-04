/**
 * sog-playtime.js — Active play-time tracking
 *
 * Tracks accumulated ACTIVE play time in seconds — paused whenever the tab
 * is hidden (backgrounded/minimized/switched away), so idle time in a
 * background tab is never counted. This is the source for the teacher
 * dashboard roster's "Time Played" column (js/teacher-dashboard.js).
 *
 * Storage model:
 *   • A single integer (seconds) persisted under `sog_playtime_seconds`,
 *     mirroring sog-focus.js/sog-gold.js's "one key, one module owns it"
 *     convention.
 *   • The running total accrues continuously in memory via timestamp
 *     diffing while the tab is visible, but is only WRITTEN to localStorage
 *     (and folded into a Firestore checkpoint via getSnapshot()) at the
 *     existing checkpoint moments — battle win, account creation, logout —
 *     not on every tick. Matches the rest of the app's "checkpoint, don't
 *     stream" write philosophy; a hard crash between checkpoints can lose
 *     the in-progress session's time, same tradeoff already accepted
 *     elsewhere for progress in general.
 *
 * Public API (SOG.playtime):
 *   getSnapshot()       — flushes the current active session into the
 *                         running total, persists it, and returns
 *                         { totalSeconds } for save-state.js
 *   applySnapshot(snap) — restores totalSeconds (e.g. after a student login)
 */
window.SOG = window.SOG || {};
SOG.playtime = (function () {
  'use strict';

  var KEY = 'sog_playtime_seconds';

  var _totalSeconds = 0;
  var _sessionStart = null;   // Date.now() the current active stretch began, or null while paused/hidden

  function _load() {
    try {
      var v = parseInt(localStorage.getItem(KEY), 10);
      _totalSeconds = isNaN(v) ? 0 : v;
    } catch (e) { _totalSeconds = 0; }
  }

  function _persist() {
    try { localStorage.setItem(KEY, String(Math.floor(_totalSeconds))); } catch (e) {}
  }

  // Folds any in-progress active stretch into the running total without
  // stopping it (sessionStart just rebases to "now") — called both by the
  // pause path (which then nulls sessionStart) and by getSnapshot() (which
  // needs an up-to-date total without interrupting an ongoing session).
  function _flush() {
    if (_sessionStart === null) return;
    var now = Date.now();
    var elapsed = (now - _sessionStart) / 1000;
    if (elapsed > 0) _totalSeconds += elapsed;
    _sessionStart = now;
  }

  function _resume() {
    if (_sessionStart === null) _sessionStart = Date.now();
  }

  function _pause() {
    _flush();
    _sessionStart = null;
  }

  function _onVisibilityChange() {
    if (document.hidden) { _pause(); } else { _resume(); }
  }

  function init() {
    _load();
    if (!document.hidden) _resume();
    document.addEventListener('visibilitychange', _onVisibilityChange);
  }

  /* ── Snapshot (save-state.js) — this IS the write-at-checkpoints hook ── */
  function getSnapshot() {
    _flush();
    _persist();
    return { totalSeconds: Math.floor(_totalSeconds) };
  }

  function applySnapshot(snap) {
    _totalSeconds = (snap && snap.totalSeconds) || 0;
    _persist();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getSnapshot:   getSnapshot,
    applySnapshot: applySnapshot
  };
})();

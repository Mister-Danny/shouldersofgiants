/**
 * sog-focus.js — Player Focus (adventure energy)
 *
 * The single source of truth for the player's focus — the adventure-mode
 * energy that drains as you act (battles, travel, shopping). Mirrors sog-gold.js:
 * this module is the ONLY place that touches localStorage for focus, so a later
 * move to a Firebase profile is cheap (only this module's internals change).
 *
 * Storage model:
 *   • A single integer in [0, MAX] persisted under `sog_focus`.
 *   • Defaults to MAX (full) when unset.
 *   • STAGE 1 (this): just the economy — drain events deduct and the value
 *     persists/clamps. NO gate at 0 (that's Stage 3) and NO learning-check
 *     refill (Stage 2). spend() therefore NEVER refuses; it drains and clamps.
 *
 * Public API (SOG.focus):
 *   MAX          — number   (the cap, 100)
 *   get()        — number   (current value; MAX if unset; clamped to 0..MAX)
 *   set(v)       — sets the value (clamped to 0..MAX); returns the new value
 *   spend(n)     — drains n (clamped at 0, never negative — NO gate); returns
 *                  the new value. Always applies (unlike gold.spend).
 *   restore(n)   — adds n back (clamped to <= MAX); returns the new value
 *   reset()      — restores to full (MAX) (dev/testing + new game)
 *
 * Loaded right after sog-gold.js. The HUD bar is synced via SOG.HUD.refreshFocus().
 */
window.SOG = window.SOG || {};
SOG.focus = (function () {
  'use strict';

  var KEY = 'sog_focus';
  var MAX = 100;

  /* ── Storage (the ONLY focus localStorage access in the codebase) ── */
  function _read() {
    try {
      var v = parseInt(localStorage.getItem(KEY), 10);
      if (isNaN(v)) return MAX;          // unset / corrupt → full
      return _clamp(v);
    } catch (e) { return MAX; }
  }
  function _write(n) {
    try { localStorage.setItem(KEY, String(n)); } catch (e) {}
  }

  function _norm(n)  { return Math.max(0, Math.floor(Number(n) || 0)); }
  function _clamp(n) { return Math.max(0, Math.min(MAX, Math.floor(Number(n) || 0))); }

  /* ── Public API ── */

  function get() { return _read(); }

  // Set the value directly (clamped to 0..MAX). Returns the new value.
  function set(v) {
    var nv = _clamp(v);
    _write(nv);
    return nv;
  }

  // Drain n focus. Clamps at 0 — never goes negative and NEVER refuses (no
  // gate in Stage 1). Returns the new value.
  function spend(n) {
    return set(_read() - _norm(n));
  }

  // Add n back, clamped to the MAX cap. Returns the new value.
  function restore(n) {
    return set(_read() + _norm(n));
  }

  // Restore to full.
  function reset() { return set(MAX); }

  /* ── Snapshot (save-state.js) ── */
  function getSnapshot() { return { focus: _read() }; }
  function applySnapshot(snap) { set(snap && snap.focus); }

  return {
    MAX:          MAX,
    get:          get,
    set:          set,
    spend:        spend,
    restore:      restore,
    reset:        reset,
    getSnapshot:  getSnapshot,
    applySnapshot: applySnapshot
  };
})();

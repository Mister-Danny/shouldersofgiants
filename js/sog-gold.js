/**
 * sog-gold.js — Player Gold (hard currency)
 *
 * The single source of truth for the player's gold balance — the marketplace
 * economy's currency. Mirrors sog-collection.js: this module is the ONLY place
 * that touches localStorage for gold, so a later move to a Firebase profile is
 * cheap (only this module's internals change; callers keep the same API).
 *
 * Storage model:
 *   • A single non-negative integer persisted under `sog_gold`.
 *   • Earned via win rewards (Gilgamesh, etc.); spent at the marketplace.
 *
 * Public API (SOG.gold):
 *   get()        — number   (current balance; 0 if unset)
 *   add(n)       — adds n (clamped to >= 0, floored); returns the new balance
 *   spend(n)     — spends n IF affordable; returns true on success, false on
 *                  insufficient funds (balance unchanged)
 *   reset()      — sets balance to 0 (dev/testing)
 *
 * Loaded right after sog-collection.js. Nothing consumes it yet beyond the API.
 */
window.SOG = window.SOG || {};
SOG.gold = (function () {
  'use strict';

  var KEY = 'sog_gold';

  /* ── Storage (the ONLY gold localStorage access in the codebase) ── */
  function _read() {
    try {
      var v = parseInt(localStorage.getItem(KEY), 10);
      return (isNaN(v) || v < 0) ? 0 : v;
    } catch (e) { return 0; }
  }
  function _write(n) {
    try { localStorage.setItem(KEY, String(n)); } catch (e) {}
  }

  function _norm(n) { return Math.max(0, Math.floor(Number(n) || 0)); }

  /* ── Public API ── */

  function get() { return _read(); }

  // Add gold; returns the new balance.
  function add(n) {
    var total = _read() + _norm(n);
    _write(total);
    return total;
  }

  // Spend gold only if affordable. Returns true on success, false (and leaves
  // the balance untouched) on insufficient funds.
  function spend(n) {
    n = _norm(n);
    var cur = _read();
    if (n > cur) return false;
    _write(cur - n);
    return true;
  }

  function reset() { _write(0); }

  /* ── Snapshot (save-state.js) ── */
  function getSnapshot() { return { gold: _read() }; }
  function applySnapshot(snap) { _write(_norm(snap && snap.gold)); }

  return {
    get:          get,
    add:          add,
    spend:        spend,
    reset:        reset,
    getSnapshot:  getSnapshot,
    applySnapshot: applySnapshot
  };
})();

/**
 * sog-adventure-otzi.js
 * Shoulders of Giants — Adventure Mode: Otzi Battle
 *
 * Phase 1 placeholder.  Displays a "coming in Phase 2" screen with a
 * "Back to Map" button that returns the player to the overworld.
 *
 * Public API (mirrors sog-adventure-prehistory.js namespace pattern):
 *   SOG.OtziBattle.start()          — called by Overworld after the radial wipe
 *   SOG.OtziBattle.isBattleComplete() — returns true once Otzi is defeated
 *
 * localStorage key set ON VICTORY (Phase 2+):
 *   sog_battle_otzi_complete  — NOT written anywhere in Phase 1
 */

var SOG = window.SOG || {};

SOG.OtziBattle = (function () {
  'use strict';

  /* ── localStorage key ───────────────────────────────────────── */
  var KEY_BATTLE_OTZI_COMPLETE = 'sog_battle_otzi_complete';

  /* ── Logging helper ─────────────────────────────────────────── */
  function log(msg) { console.log('[Adventure/Otzi] ' + msg); }

  /* ── Public: start ─────────────────────────────────────────── */
  function start() {
    log('start() — Phase 1 placeholder');

    // Clear the radial wipe overlay so the placeholder screen is visible
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) {
      wipeEl.classList.remove('active');
      wipeEl.style.clipPath = '';
    }

    // Show the placeholder screen
    if (typeof showScreen === 'function') {
      showScreen('screen-otzi-battle');
    } else {
      // Fallback: manually hide all screens and show ours
      document.querySelectorAll('.screen').forEach(function (s) {
        s.classList.remove('active');
      });
      var screen = document.getElementById('screen-otzi-battle');
      if (screen) screen.classList.add('active');
    }

    // Wire the "Back to Map" button — single-use listener
    var backBtn = document.getElementById('otzi-battle-back');
    if (backBtn) {
      backBtn.addEventListener('click', function onBack() {
        backBtn.removeEventListener('click', onBack);
        _returnToOverworld();
      });
    }
  }

  /* ── Private: return to overworld ──────────────────────────── */
  function _returnToOverworld() {
    log('returning to overworld');

    if (typeof showScreen === 'function') {
      showScreen('screen-overworld');
    } else {
      document.querySelectorAll('.screen').forEach(function (s) {
        s.classList.remove('active');
      });
      var ow = document.getElementById('screen-overworld');
      if (ow) ow.classList.add('active');
    }

    // Re-initialise the overworld so the player's position and map state
    // are restored correctly (same pattern used when returning from
    // the Neanderthal battle).
    if (window.Overworld && typeof window.Overworld.init === 'function') {
      window.Overworld.init();
    }

    // Phase 2 will set KEY_BATTLE_OTZI_COMPLETE on victory, which will
    // make the signpost route directly to the Egypt map instead of
    // triggering the encounter again.
  }

  /* ── Public: isBattleComplete ───────────────────────────────── */
  function isBattleComplete() {
    try {
      return localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true';
    } catch (e) {
      return false;
    }
  }

  /* ── Expose ─────────────────────────────────────────────────── */
  return {
    start: start,
    isBattleComplete: isBattleComplete
  };

})();

window.SOG = SOG;

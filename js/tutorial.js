/**
 * tutorial.js — Shoulders of Giants · retired Lucy tutorial (save data only)
 *
 * The Lucy Arcadium tutorial ("I'm Ready To Learn") was removed. Its
 * completion flag stays in the /players/{uid}.progress snapshot so existing
 * saves round-trip unchanged, and js/welcome.js still reads it as a sign of
 * a returning player.
 *
 * Exposes: window.Tutorial { getSnapshot, applySnapshot } (for save-state.js)
 */
(function () {
  'use strict';

  var TUTORIAL_COMPLETE_KEY = 'sog_tutorial_complete';

  function getSnapshot() {
    return { complete: localStorage.getItem(TUTORIAL_COMPLETE_KEY) === 'true' };
  }
  function applySnapshot(snap) {
    try {
      if (snap && snap.complete) localStorage.setItem(TUTORIAL_COMPLETE_KEY, 'true');
      else localStorage.removeItem(TUTORIAL_COMPLETE_KEY);
    } catch (e) {}
  }

  window.Tutorial = {
    getSnapshot:   getSnapshot,
    applySnapshot: applySnapshot
  };

}());

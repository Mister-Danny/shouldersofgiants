/**
 * design-v2.js — the DOM half of the approved design-pass subset
 * (css/design-v2.css).
 *
 * Does nothing unless <html> has the design-v2 class (SOG_FEATURES.DESIGN_V2,
 * or ?design=v2 for a preview). It never changes game state.
 *
 *   battle  the turn line "TURN 2 / 4" split into a small "TURN" label and a
 *           large "2/4", so the label can be top-aligned with the number
 */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('design-v2')) return;

  function turnSplit() {
    var el = document.getElementById('battle-turn-info');
    if (!el) return;
    var apply = function () {
      if (el.querySelector('.dv2-turn-num')) return;          // already split
      var m = /^\s*TURN\s+(\d+\s*\/\s*\d+)\s*$/i.exec(el.textContent || '');
      if (!m) return;
      el.innerHTML = '<span class="dv2-turn-label">TURN</span><span class="dv2-turn-num">' + m[1].replace(/\s+/g, '') + '</span>';
    };
    new MutationObserver(apply).observe(el, { childList: true, characterData: true, subtree: true });
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', turnSplit); else turnSplit();
})();

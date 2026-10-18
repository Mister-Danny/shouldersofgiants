/**
 * design-v2.js — the DOM half of the approved design-pass subset
 * (css/design-v2.css).
 *
 * Does nothing unless <html> has the design-v2 class (SOG_FEATURES.DESIGN_V2,
 * or ?design=v2 for a preview). It never changes game state.
 *
 *   battle  the turn line "TURN 2 / 4" split into a small "TURN" label and a
 *           large "2/4", stacked as the turn box's left column
 *   battle  the location scores sized to each location bar: --dv2-score-size
 *           (ink ~75% of the bar, at most 44px) and --dv2-score-nudge
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

  /* CTGalbite's digits: ink height 0.7 × the font size, ink centre 0.1 × the
     size above the line box's middle (measured with canvas measureText). */
  var INK = 0.7, MAX = 44, FILL = 0.75;
  function scoreFit() {
    var board = document.getElementById('battle-board');
    if (!board) return;
    var raf = null;
    var fit = function () {
      raf = null;
      Array.prototype.forEach.call(board.querySelectorAll('.battle-location'), function (loc) {
        var bar = loc.querySelector('.battle-loc-info');
        var h = bar ? bar.offsetHeight : 0;              // layout px = stage px (the stage scale is a transform)
        if (!h) return;
        var size = Math.min(MAX, Math.round(h * FILL / INK));
        var px = size + 'px';
        if (loc.style.getPropertyValue('--dv2-score-size') === px) return;
        loc.style.setProperty('--dv2-score-size', px);
        loc.style.setProperty('--dv2-score-nudge', (size * 0.2).toFixed(1) + 'px');
      });
    };
    var schedule = function () { if (!raf) raf = requestAnimationFrame(fit); };
    // Locations are rebuilt per battle; ability text, floods or a re-render can
    // change a bar's height — re-fit on any board change (cheap: ≤3 bars).
    new MutationObserver(schedule).observe(board, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
  }

  function boot() { turnSplit(); scoreFit(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

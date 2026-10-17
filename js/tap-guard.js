/**
 * tap-guard.js — one tap, one action.
 *
 * A double tap (or a tap that a touch laptop also reports as a mouse click, or
 * an impatient double click) must not press the same button twice: End Turn,
 * Continue, Buy / Yes, Play Again, reward and dialog buttons all assume they run
 * once. A second activation of the SAME <button> within REPEAT_MS of the first
 * is swallowed in the capture phase, before any handler sees it.
 *
 * Opt out with data-repeat on a button meant for rapid presses (none today).
 * Inputs, sliders, cards and the board are untouched: the battle's own rules
 * gate (commitPlay / queueMove / undoPlay / onEndTurn) covers plays.
 */
(function () {
  'use strict';
  var REPEAT_MS = 350;
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.hasAttribute('data-repeat')) return;
    var now = Date.now();
    if (b._sogLastTap && now - b._sogLastTap < REPEAT_MS) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    b._sogLastTap = now;
  }, true);

  // A long press on a touch screen opens the context menu (Chromebooks, touch
  // laptops) — on a card mid-drag that cancels the drag. Block it on the game
  // stage for TOUCH long-presses only; a mouse right-click is left alone, and
  // text fields keep their menu (copy / paste a class code).
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('#sog-stage')) return;
    if (t.closest('input, textarea, [contenteditable="true"]')) return;
    var fromTouch = (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) || e.pointerType === 'touch';
    if (fromTouch) e.preventDefault();
  });
})();

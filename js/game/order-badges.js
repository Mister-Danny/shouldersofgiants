/**
 * order-badges.js — SOG.orderBadges: small numbers showing the ORDER of the
 * player's actions this turn.
 *
 * While choosing, every staged card and every queued move carries a badge
 * (1, 2, 3 …) in the order it was made — the same order the reveal uses
 * (game.js buildRevealSequence walks G.playerActionLog; the player's actions
 * alternate with the opponent's, player first when G.playerFirst). Taking one
 * back re-flows the numbers. During the reveal the badges light up one at a
 * time as each card flips or each move happens (game.js revealNext calls step).
 *
 * On when the battle config sets orderBadges: true (Ötzi), or everywhere when
 * SOG_FEATURES.ORDER_BADGES_EVERYWHERE is on. Badges live in their own layer
 * inside the stage (pointer-events none), positioned over the slots, so the
 * reveal's slot rebuilds never wipe them mid-sequence.
 */
window.SOG = window.SOG || {};
window.SOG.orderBadges = (function () {
  'use strict';

  var _frozen = false;      // reveal under way: positions fixed, only lighting changes
  var _lit = 0;             // player steps already lit this reveal
  var _raf = null;
  var _obs = null;

  function _G() { return window.SOG && SOG.state && SOG.state.G; }
  function enabled() {
    var G = _G();
    if (!G || !G.config) return false;
    if (G.config.orderBadges) return true;
    return !!(window.SOG_FEATURES && window.SOG_FEATURES.ORDER_BADGES_EVERYWHERE && G.config.structure && G.config.structure.locationsCount > 1);
  }
  function _stage() { return document.getElementById('sog-stage'); }
  // The layer sits INSIDE #screen-battle, after the board and before the hand.
  // CSS z-index 2 puts it above the hand strip's dark background and the
  // resting hand cards (z 1), but under a card lifted by hover (z 100) or
  // dragged, so a lifted card covers a badge rather than the other way round.
  function _layer() {
    var el = document.getElementById('order-badge-layer');
    if (el) return el;
    var screen = document.getElementById('screen-battle'), hand = document.getElementById('battle-player-hand');
    if (!screen) return null;
    el = document.createElement('div');
    el.id = 'order-badge-layer';
    var before = hand;
    while (before && before.parentElement !== screen) before = before.parentElement;
    if (before) screen.insertBefore(el, before); else screen.appendChild(el);
    return el;
  }
  // Positions are taken relative to the layer's own box (the battle screen).
  function _origin() {
    var l = document.getElementById('order-badge-layer'), st = _stage();
    if (!l || !st) return { x: 0, y: 0 };
    var r = l.getBoundingClientRect(), s = st.getBoundingClientRect(), k = (s.width / 1280) || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k };
  }
  function _rectIn(el) {
    var st = _stage(); if (!st || !el) return null;
    var r = el.getBoundingClientRect(), s = st.getBoundingClientRect(), k = (s.width / 1280) || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  function _slotEl(locId, si) { return SOG.board && SOG.board.getSlotEl ? SOG.board.getSlotEl('player', locId, si) : null; }

  // The element each action's badge sits on: a play's own slot; a move's card
  // at its (previewed) destination.
  function _anchorFor(a) {
    var G = _G();
    if (a.type === 'play') return _slotEl(a.toLocId, a.slotIndex);
    if (a.type === 'move') {
      var row = G.playerSlots[a.toLocId] || [];
      for (var i = row.length - 1; i >= 0; i--) if (row[i] && row[i].cardId === a.cardId) return _slotEl(a.toLocId, i);
    }
    return null;
  }

  function clear() {
    var el = document.getElementById('order-badge-layer');
    if (el) el.innerHTML = '';
    _frozen = false; _lit = 0;
  }

  function render() {
    _raf = null;
    if (_frozen) return;
    var G = _G(), layer = _layer();
    if (!layer || !G) return;
    // Only while choosing. Once End Turn is pressed (phase 'ending', then the
    // reveal) the badges stay as they are until freeze()/step()/clear().
    if (G.phase !== 'select') return;
    layer.innerHTML = '';
    if (!enabled()) return;
    var o = _origin();
    // The hand strip's top edge (the board's lower edge): badges sit just inside
    // the strip, never half on the board.
    var hr = _rectIn(document.getElementById('battle-player-hand'));
    (G.playerActionLog || []).forEach(function (a, k) {
      var r = _rectIn(_anchorFor(a));
      if (!r) return;
      var b = document.createElement('div');
      b.className = 'order-badge' + (a.type === 'move' ? ' order-badge--move' : '');
      b.textContent = String(k + 1);
      // Centred under the card, fully inside the dark hand strip: every corner
      // of a card carries information (Capital, type, IP), so the badge never
      // sits on the card itself, nor half on the board.
      var top = Math.max(r.y + r.h + 1, hr ? hr.y + 4 : 0);
      b.style.left = (r.x + r.w / 2 - o.x) + 'px';
      b.style.top  = (top - o.y) + 'px';
      layer.appendChild(b);
    });
  }
  function schedule() {
    if (_raf || _frozen) return;
    _raf = (window.requestAnimationFrame || setTimeout)(render);
  }

  // game.js: the reveal is starting — fix the badges where they are and dim them.
  function freeze() {
    if (!enabled()) return;
    _frozen = true; _lit = 0;
    var layer = document.getElementById('order-badge-layer');
    if (layer) Array.prototype.forEach.call(layer.children, function (b) { b.classList.add('order-badge--waiting'); });
  }
  // game.js revealNext: one sequence item is happening. Player items light the
  // next badge in order.
  function step(item) {
    if (!_frozen || !item || item.owner !== 'player') return;
    var layer = document.getElementById('order-badge-layer');
    var b = layer && layer.children[_lit];
    _lit++;
    if (b) { b.classList.remove('order-badge--waiting'); b.classList.add('order-badge--lit'); }
  }

  // Watch the board while choosing: any play / take-back / move / reset re-flows.
  function watch() {
    if (_obs || typeof MutationObserver === 'undefined') return;
    var board = document.getElementById('battle-board');
    if (!board) return;
    _obs = new MutationObserver(function () { if (enabled()) schedule(); });
    _obs.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-card-id'] });
    window.addEventListener('resize', function () { if (enabled() && !_frozen) schedule(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  return { enabled: enabled, render: render, freeze: freeze, step: step, clear: clear };
})();

/**
 * otzi-lessons.js — SOG.OtziLessons: the Ötzi battle's interjections.
 *
 * Ötzi is the step from "follow me" (the scripted Neanderthal battle) to "you
 * decide": the player chooses everything, and short system callouts (the
 * Neanderthal battle's style) react to what they do. Each fires once, never
 * blocks play, and fades after ~4 s or at the player's next action.
 *
 * FIRST ATTEMPT ONLY (the one-time lessons):
 *   "You can play 2 cards each turn." (at the CARDS TO PLAY counter) ·
 *   "Play 2 cards. Try two locations." · "Cave Art pays more later. Save it." ·
 *   stacking · way behind · reveal order · Cave Art order / its +1 arcs ·
 *   Lucy drawn / Lucy can move / "Moves happen in order too." / Lucy's move
 *   explained with arcs.
 * EVERY ATTEMPT until the win: the pinned goal, the score glow, the FINAL TURN
 *   banner with the standings line, and the loss explanation.
 *
 * Driven by js/sog-adventure-otzi.js's script hooks. A later game run "with
 * hints" (Yes before the deal) is begun again with first: true.
 */
window.SOG = window.SOG || {};
window.SOG.OtziLessons = (function () {
  'use strict';

  var LUCY = 33, CAVE = 30;
  var FADE_MS = 4000;
  var S = null;   // per-battle state; null outside an Ötzi battle

  /* ── Small helpers ─────────────────────────────────────────── */
  function _G() { return SOG.state.G; }
  // Callouts, arcs and fades come from the shared toolkit (js/game/callouts.js).
  var CO = SOG.Callouts;
  function _layer() { return CO.layer('otzi-layer'); }
  function _rectIn(el) { return CO.rectIn(el); }
  function _remove(el) { CO.remove(el); }
  function _fade(el) { CO.fade(el); }
  function _later(fn, ms) { var t = setTimeout(function () { if (S) fn(); }, ms); if (S) S.timers.push(t); return t; }
  function _once(key) { if (!S || S.once[key]) return false; S.once[key] = true; return true; }
  function _cardName(id) { var c = (typeof CARDS !== 'undefined') && CARDS.find(function (x) { return x.id === id; }); return c ? c.name : ''; }
  function _locName(locId) {
    var l = (_G().locations || []).find(function (x) { return x.id === locId; });
    return l ? String(l.name).replace(/^The\s+/i, '') : '';
  }
  function _handCard(id) { return document.querySelector('#battle-player-hand .battle-hand-card[data-id="' + id + '"]'); }
  function _slotEl(owner, locId, si) { return SOG.board.getSlotEl(owner, locId, si); }
  function _tile(locId) { var s = document.getElementById('loc-score-player-' + locId); return s && s.parentNode; }
  function _scoreEl(locId) { return document.getElementById('loc-score-player-' + locId); }
  function _counter() { return document.getElementById('battle-capital-num'); }

  function _totals() {
    var G = _G(), out = {};
    G.locations.forEach(function (l) {
      var p = 0, a = 0;
      (G.playerSlots[l.id] || []).forEach(function (s) { if (s && s.revealed) p += SOG.board.effectiveIP(s); });
      (G.aiSlots[l.id] || []).forEach(function (s) { if (s && s.revealed) a += SOG.board.effectiveIP(s); });
      out[l.id] = { p: p, a: a };
    });
    return out;
  }
  // This turn's staged (unrevealed) player cards.
  function _staged() {
    var G = _G(), out = [];
    G.locations.forEach(function (l) {
      (G.playerSlots[l.id] || []).forEach(function (s, si) { if (s && !s.revealed && s.turnPlayed === G.turn) out.push({ sd: s, locId: l.id, si: si }); });
    });
    return out;
  }
  function _lucySlot() {
    var G = _G();
    for (var li = 0; li < G.locations.length; li++) {
      var row = G.playerSlots[G.locations[li].id] || [];
      for (var si = 0; si < row.length; si++) if (row[si] && row[si].cardId === LUCY && row[si].revealed) return { sd: row[si], locId: G.locations[li].id, si: si };
    }
    return null;
  }

  /* ── Callouts (the shared .snap-callout style) ─────────────── */
  // A transient callout: fades after `ms` (default 4 s) or at the next action.
  function _callout(text, anchor, place, opts) {
    opts = opts || {};
    if (!S) return null;
    var el = CO.callout(_layer(), text, anchor, place, { sub: opts.sub, cls: opts.cls });
    if (el && !opts.sticky) { S.transient.push(el); _later(function () { _fade(el); }, opts.ms || FADE_MS); }
    return el;
  }
  // The player acted (a play, a move, End Turn): transient callouts make way.
  function _dismiss() {
    if (!S) return;
    S.transient.forEach(_fade);
    S.transient = [];
  }

  // Run fn only while the battle is still on (a later beat after teardown is a no-op).
  function _ifLive(fn) { if (S) fn(); }

  /* ── Arcs (Cave Art's +1s, Lucy's move) ──────────────────────── */
  function _svg() { return CO.svg(_layer(), 'otzi-arrow'); }
  function _arc(svg, x1, y1, x2, y2, lift, label) {
    CO.arc(svg, x1, y1, x2, y2, { lift: lift, label: label, markerId: 'otzi-arrow' });
  }
  function _transientEl(el, ms) { if (!el || !S) return; S.transient.push(el); _later(function () { _fade(el); }, ms || FADE_MS); }

  /* ── Score glow (every attempt): ahead → glows, behind → dims ── */
  function _glowAll() {
    if (!S) return;
    var t = _totals();
    Object.keys(t).forEach(function (id) {
      var el = _scoreEl(id); if (!el) return;
      el.classList.toggle('otzi-ahead',  t[id].p > t[id].a);
      el.classList.toggle('otzi-behind', t[id].p < t[id].a);
    });
  }
  function _watchScores() {
    if (typeof MutationObserver === 'undefined') return;
    _G().locations.forEach(function (l) {
      ['loc-score-player-', 'loc-score-opp-'].forEach(function (pre) {
        var el = document.getElementById(pre + l.id); if (!el) return;
        var o = new MutationObserver(_glowAll);
        o.observe(el, { childList: true, characterData: true, subtree: true });
        S.observers.push(o);
      });
    });
    _glowAll();
  }

  /* ── Lifecycle ─────────────────────────────────────────────── */
  function begin(opts) {
    teardown();
    S = { first: !!opts.first, attempt: opts.attempt || 1,
          once: {}, transient: [], timers: [], observers: [], instr: null,
          lucy: { moved: false, turn: null, flipped: false }, lucyBefore: null };
    document.body.classList.add('otzi-lessons');
  }
  function teardown() {
    if (!S) return;
    S.timers.forEach(clearTimeout);
    S.observers.forEach(function (o) { o.disconnect(); });
    _remove(document.getElementById('otzi-layer'));
    document.querySelectorAll('.otzi-ahead, .otzi-behind').forEach(function (el) { el.classList.remove('otzi-ahead', 'otzi-behind'); });
    document.body.classList.remove('otzi-lessons');
    S = null;
  }

  // After the deal: the goal and glow (always); the first attempt's openers.
  function afterDeal() {
    if (!S) return;
    var layer = _layer();
    if (layer && !document.getElementById('otzi-goal')) {
      var g = document.createElement('div'); g.id = 'otzi-goal'; g.className = 'snap-goal';
      g.textContent = 'Win 2 of 3 locations!';
      layer.appendChild(g);
    }
    _watchScores();
    if (!S.first) return;
    _ifLive(function () {
      _callout('You can play 2 cards each turn.', _counter(), 'right', { ms: 4200 });
      _later(function () {
        if (_G().turn !== 1 || _staged().length) return;
        var firstCard = document.querySelector('#battle-player-hand .battle-hand-card');
        S.instr = _callout('Play 2 cards. Try two locations.', firstCard, 'top', { sticky: true, cls: 'snap-callout--instr otzi-instr' });
        if (_handCard(CAVE) && _once('caveSave')) _callout('Cave Art pays more later. Save it.', _handCard(CAVE), 'top', { ms: 5000 });
      }, 3600);
    });
  }

  function onPlayerPlayed(p) {
    if (!S) return;
    _dismiss();
    if (S.instr && _staged().length >= 1) { _fade(S.instr); S.instr = null; }
    if (!S.first || !p) return;
    var G = _G(), staged = _staged();
    // Stacking: the turn's second card where the first went, and that is the only
    // location the player holds.
    if (staged.length === 2 && staged[0].locId === staged[1].locId) {
      var held = G.locations.filter(function (l) { return (G.playerSlots[l.id] || []).some(Boolean); });
      if (held.length === 1 && _once('stack')) _callout('All in one place? You need two locations.', _tile(staged[0].locId), 'top', { ms: 5000 });
    }
    // Cave Art order: a card staged after a this-turn Cave Art at the same location.
    if (p.cardId !== CAVE) {
      var row = G.playerSlots[p.locId] || [], mine = -1, cave = -1;
      row.forEach(function (s, si) {
        if (!s || s.revealed || s.turnPlayed !== G.turn) return;
        if (s.cardId === CAVE && cave === -1) cave = si;
        if (s.cardId === p.cardId) mine = si;
      });
      if (cave !== -1 && mine > cave && _once('caveOrder')) {
        _callout('Cave Art boosts cards played BEFORE it. Play it last!', _slotEl('player', p.locId, cave), 'top', { ms: 6000 });
      }
    }
  }

  function onBeforeReveal(turn) {
    if (!S) return;
    _dismiss();
    if (S.instr) { _fade(S.instr); S.instr = null; }
    if (!S.first) return;
    var log = _G().playerActionLog || [];
    var plays = log.filter(function (a) { return a.type === 'play'; });
    var move  = log.filter(function (a) { return a.type === 'move'; })[0];
    if (plays.length >= 2 && _once('order')) {
      var first = plays[0];
      _callout('Cards reveal in the order you played them.', _slotEl('player', first.toLocId, first.slotIndex), 'top', { ms: 4800 });
    }
    if (move && plays.length >= 1 && _once('moveOrder')) {
      var row = _G().playerSlots[move.toLocId] || [], at = -1;
      row.forEach(function (s, si) { if (s && s.cardId === move.cardId) at = si; });
      _callout('Moves happen in order too.', at >= 0 ? _slotEl('player', move.toLocId, at) : _tile(move.toLocId), 'top', { ms: 5200 });
    }
  }

  // A reveal step (sync). Lucy's move: measure before, explain after.
  function onRevealStep(p) {
    if (!S || !p || !p.item) return;
    var it = p.item;
    if (it.type !== 'move' || it.owner !== 'player' || it.cardId !== LUCY) return;
    if (!p.done) { S.lucyBefore = _totals(); return; }
    var before = S.lucyBefore || _totals(), after = _totals(), from = it.fromLocId, to = it.toLocId;
    var win = function (t, l) { return t[l].p > t[l].a ? 'p' : t[l].a > t[l].p ? 'a' : 't'; };
    S.lucy = { moved: true, turn: _G().turn,
               flipped: win(before, from) !== win(after, from) || win(before, to) !== win(after, to) };
    if (!S.first || !_once('lucyExplain')) return;
    _dismiss();   // "Moves happen in order too." has made its point
    var dFrom = after[from].p - before[from].p, dTo = after[to].p - before[to].p;
    var fmt = function (n) { return (n >= 0 ? '+' : '−') + Math.abs(n); };
    var a = _rectIn(_scoreEl(from)), b = _rectIn(_scoreEl(to));
    var svg = _svg();
    if (svg && a && b) {
      _arc(svg, a.x + a.w / 2, a.y + 4, b.x + b.w / 2, b.y + 4, 70, null);
      var lab = function (r, txt) { CO.label(svg, r.x + r.w / 2, r.y - 14, txt); };
      lab(a, fmt(dFrom)); lab(b, fmt(dTo));
      _transientEl(svg, 6000);
    }
    _callout('Lucy moved: ' + _locName(from) + ' ' + fmt(dFrom) + ', ' + _locName(to) + ' ' + fmt(dTo) + '.', _tile(to), 'bottom', { ms: 6000 });
  }

  function onAfterReveal(p) {
    if (!S) return;
    var G = _G(), turn = p && p.turn;
    if (!S.first) return;
    // Way behind (after a turn-2 or turn-3 reveal): Ötzi ahead by 5+ somewhere.
    if (turn === 2 || turn === 3) {
      var t = _totals();
      var worst = null;
      Object.keys(t).forEach(function (id) { var m = t[id].a - t[id].p; if (m >= 5 && (!worst || m > worst.m)) worst = { id: +id, m: m }; });
      if (worst && _once('behind')) _callout("Ötzi's way ahead here. Win the other two!", _tile(worst.id), 'bottom', { ms: 5500 });
    }
    // Cave Art played LAST at its location this turn, boosting the cards before it.
    (p && p.revealed || []).forEach(function (r) {
      if (r.owner !== 'player' || r.cardId !== CAVE || r.locId == null) return;
      var row = G.playerSlots[r.locId] || [];
      var later = row.some(function (s, si) { return s && si > r.slotIndex; });
      if (later || r.slotIndex < 1 || !_once('caveArcs')) return;
      var c = _rectIn(_slotEl('player', r.locId, r.slotIndex)), svg = _svg();
      if (!svg || !c) return;
      for (var si = 0; si < r.slotIndex; si++) {
        var e = _rectIn(_slotEl('player', r.locId, si)); if (!e) continue;
        _arc(svg, c.x + c.w / 2, c.y + 40, e.x + e.w / 2, e.y + 40, 34, '+1');
      }
      _transientEl(svg, 5000);
      _callout('Cave Art: +1 to every card before it.', _slotEl('player', r.locId, r.slotIndex), 'bottom', { ms: 5000 });
    });
  }

  // Turn start: Lucy drawn (T3, first attempt); FINAL TURN (T4, every attempt),
  // then — first attempt — the Lucy-can-move prompt.
  function onTurnStart(turn) {
    if (!S) return;
    _dismiss();
    if (turn === 3 && S.first) {
      _later(function () {
        _ifLive(function () {
          if (_handCard(LUCY) && _once('lucyDrawn')) _callout('Lucy can move once. Play her now, move her next turn.', _handCard(LUCY), 'top', { ms: 6500 });
        });
      }, 700);
    }
    if (turn === _G().config.structure.turns) {
      _later(function () { _ifLive(_finalTurn); }, 600);
    }
  }
  function _finalTurn() {
    if (!S) return;
    var t = _totals(), ahead = 0;
    Object.keys(t).forEach(function (id) { if (t[id].p > t[id].a) ahead++; });
    var line = ahead >= 2 ? "You're winning 2 of 3 — hold on!"
             : ahead === 1 ? 'You need one more location!'
             : 'You need two locations. Go big!';
    var layer = _layer(); if (!layer) return;
    var b = document.createElement('div');
    b.className = 'otzi-final-banner';
    b.innerHTML = '<div class="otzi-final-title">FINAL TURN</div><div class="otzi-final-line"></div>';
    b.querySelector('.otzi-final-line').textContent = line;
    layer.appendChild(b);
    _later(function () { _fade(b); }, 2600);
    // After the banner: point at an unmoved Lucy (first attempt).
    _later(function () {
      if (!S.first) return;
      var l = _lucySlot();
      if (l && !l.sd._advLucyMoved && _once('lucyMove')) {
        _callout("Lucy can move once! Drag her where she's needed.", _slotEl('player', l.locId, l.si), 'top', { ms: 7000 });
      }
    }, 3000);
  }

  // The end, before the outcome dialogue. A loss/tie points at the deciding
  // location (every attempt); then `then()` after a beat. Returns the Lucy record.
  function end(outcome, result, then) {
    if (!S) { then(); return null; }
    _dismiss();
    if (S.instr) { _fade(S.instr); S.instr = null; }
    var lucy = S.lucy;
    _remove(document.getElementById('otzi-goal'));
    if (outcome === 'win' || !result) { then(); return lucy; }
    var text, anchor = null;
    if (outcome === 'tie' && result.tiebreaker) {
      text = 'Split locations, equal total IP — a tie!';
    } else if (result.tiebreaker) {
      text = 'Split locations — Ötzi had more total IP.';
    } else {
      var t = _totals(), best = null;
      Object.keys(t).forEach(function (id) {
        var m = t[id].a - t[id].p;
        if (m < 0) return;                              // the player won it
        if (!best || m < best.m) best = { id: +id, m: m };
      });
      if (best) {
        anchor = _tile(best.id);
        text = best.m === 0 ? 'The ' + _locName(best.id) + ' was a tie. One more IP!'
                            : 'Lost the ' + _locName(best.id) + ' by ' + best.m + ' — so close!';
      }
    }
    if (!text) { then(); return lucy; }
    _callout(text, anchor, 'bottom', { ms: 3400, cls: 'otzi-loss-note' });
    _later(then, 3000);
    return lucy;
  }

  function lucyRecord() { return S ? S.lucy : null; }

  return { begin: begin, teardown: teardown, afterDeal: afterDeal, onPlayerPlayed: onPlayerPlayed,
           onBeforeReveal: onBeforeReveal, onRevealStep: onRevealStep, onAfterReveal: onAfterReveal,
           onTurnStart: onTurnStart, end: end, lucyRecord: lucyRecord };
})();

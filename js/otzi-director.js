/**
 * otzi-director.js — SOG.OtziDirector: the first Ötzi battle's lesson planner.
 *
 * Pure functions, no DOM. Two jobs:
 *   1. score(board) — the camp-card IP rules for Ötzi's battle, as the engine
 *      applies them (verified against the real engine in test/otzi-director.test.js):
 *        printed IP · Domesticated Animal (32) +1 to the cards beside it ·
 *        Fire (29) +1 to own cards in later slots · Cave Art (30) +1 to own cards
 *        in earlier slots · Tribe (36) +1 per other own card here · Megalith (31)
 *        +1 at the end of every turn it is on the board (incl. the turn it lands).
 *      Slot order = play/move order (a move compacts its origin and lands at the
 *      next free slot of the destination).
 *   2. chooseT4(state) — on the FIRST attempt, Ötzi's turn-4 plays are picked so
 *      that moving Lucy (33, 4 IP) to a close location is a winning play for the
 *      player: it searches every Ötzi option against every player turn-4 line
 *      (≤2 plays from hand, in order, with or without Lucy's move) and prefers the
 *      option where a Lucy line wins and no non-Lucy line does; failing that, one
 *      where a Lucy line wins at all. The Ötzi card (35, random flee) is never used.
 *
 * Board shape: { locIds: [8, 7, 2], player: { 8: [entry…], … }, ai: { … } },
 * entry = { id: cardId, turn: turnPlayed }.
 */
window.SOG = window.SOG || {};
window.SOG.OtziDirector = (function () {
  'use strict';

  var DA = 32, FIRE = 29, CAVE = 30, TRIBE = 36, MEGALITH = 31, LUCY = 33, OTZI = 35;
  var FINAL_TURN = 4;

  function _cards() { return (typeof CARDS !== 'undefined') ? CARDS : []; }
  function _base(id) {
    var c = _cards().find(function (x) { return x.id === id; });
    return c ? (c.ip || 0) : 0;
  }

  // IP of every card in one side's row at one location, at the end of `turn`.
  function rowIPs(row, turn) {
    var t = turn || FINAL_TURN;
    return row.map(function (e, i) {
      var ip = _base(e.id);
      row.forEach(function (o, j) {
        if (j === i) return;
        if (o.id === DA && Math.abs(i - j) === 1) ip++;
        if (o.id === FIRE && j < i) ip++;
        if (o.id === CAVE && j > i) ip++;
      });
      if (e.id === TRIBE) ip += row.length - 1;
      if (e.id === MEGALITH) ip += Math.max(0, t - e.turn + 1);
      return ip;
    });
  }
  function rowTotal(row, turn) { return rowIPs(row, turn).reduce(function (a, b) { return a + b; }, 0); }

  // Totals per location and the engine's outcome rule (most locations, 2 of 3;
  // split → total IP; exact → tie).
  function score(board, turn) {
    var per = {}, pWins = 0, aWins = 0, pTot = 0, aTot = 0;
    board.locIds.forEach(function (l) {
      var p = rowTotal(board.player[l] || [], turn), a = rowTotal(board.ai[l] || [], turn);
      per[l] = { p: p, a: a };
      pTot += p; aTot += a;
      if (p > a) pWins++; else if (a > p) aWins++;
    });
    var outcome;
    if (pWins >= 2) outcome = 'win';
    else if (aWins >= 2) outcome = 'loss';
    else if (pTot > aTot) outcome = 'win';
    else if (aTot > pTot) outcome = 'loss';
    else outcome = 'tie';
    return { per: per, pWins: pWins, aWins: aWins, pTotal: pTot, aTotal: aTot, outcome: outcome };
  }

  function clone(board) {
    var b = { locIds: board.locIds.slice(), player: {}, ai: {} };
    board.locIds.forEach(function (l) {
      b.player[l] = (board.player[l] || []).map(function (e) { return { id: e.id, turn: e.turn }; });
      b.ai[l]     = (board.ai[l]     || []).map(function (e) { return { id: e.id, turn: e.turn }; });
    });
    return b;
  }
  var SLOTS = 4;
  function place(board, side, locId, id, turn) {
    var row = board[side][locId];
    if (row.length >= SLOTS) return false;
    row.push({ id: id, turn: turn });
    return true;
  }
  function move(board, side, fromLoc, id, toLoc) {
    var from = board[side][fromLoc], to = board[side][toLoc];
    var i = -1;
    for (var k = 0; k < from.length; k++) if (from[k].id === id) { i = k; break; }
    if (i === -1 || to.length >= SLOTS) return false;
    var e = from.splice(i, 1)[0];
    to.push(e);
    return true;
  }

  // Every player turn-4 line: up to 2 plays from `hand` (ordered), and Lucy's
  // move (if she is on the board, unmoved) before, between or after them.
  function playerLines(board, hand, lucyAt, turn) {
    var locs = board.locIds, lines = [], cards = [];
    hand.forEach(function (id, i) { if (cards.indexOf(id) === -1) cards.push(id); });
    var plays = [[]];
    cards.forEach(function (c1) {
      locs.forEach(function (l1) {
        plays.push([{ id: c1, loc: l1 }]);
        cards.forEach(function (c2) {
          if (c2 === c1 && hand.filter(function (x) { return x === c1; }).length < 2) return;
          locs.forEach(function (l2) { plays.push([{ id: c1, loc: l1 }, { id: c2, loc: l2 }]); });
        });
      });
    });
    plays.forEach(function (ps) {
      lines.push({ plays: ps, lucy: null });
      if (lucyAt == null) return;
      locs.forEach(function (to) {
        if (to === lucyAt) return;
        for (var at = 0; at <= ps.length; at++) lines.push({ plays: ps, lucy: { from: lucyAt, to: to, at: at } });
      });
    });
    return lines;
  }
  function applyPlayerLine(board, line, turn) {
    var b = clone(board), steps = line.plays.slice();
    for (var s = 0; s <= steps.length; s++) {
      if (line.lucy && line.lucy.at === s && !move(b, 'player', line.lucy.from, LUCY, line.lucy.to)) return null;
      if (s < steps.length && !place(b, 'player', steps[s].loc, steps[s].id, turn)) return null;
    }
    return b;
  }

  // Ötzi's options for one turn: ≤2 plays from hand (never the Ötzi card).
  function aiOptions(board, hand) {
    var locs = board.locIds, cards = [], opts = [[]];
    hand.forEach(function (id) { if (id !== OTZI && cards.indexOf(id) === -1) cards.push(id); });
    cards.forEach(function (c1, i) {
      locs.forEach(function (l1) {
        opts.push([{ id: c1, loc: l1 }]);
        cards.forEach(function (c2, j) {
          if (j <= i) return;
          locs.forEach(function (l2) {
            opts.push([{ id: c1, loc: l1 }, { id: c2, loc: l2 }]);
            opts.push([{ id: c2, loc: l2 }, { id: c1, loc: l1 }]);
          });
        });
      });
    });
    return opts;
  }
  function applyAi(board, plays, turn) {
    var b = clone(board);
    for (var i = 0; i < plays.length; i++) if (!place(b, 'ai', plays[i].loc, plays[i].id, turn)) return null;
    return b;
  }

  /* Turn-4 director. state = { board, playerHand, aiHand, lucyAt (locId or null) }.
     Returns { plays: [{id, loc}], kind: 'needs-lucy' | 'lucy-wins' | 'fallback',
               lucyWins: n, otherWins: n }. Reveal order (player first,
     alternating) does not change these rules' totals, so lines are scored on the
     final board. */
  function chooseT4(state) {
    var turn = FINAL_TURN, best = null;
    var opts = aiOptions(state.board, state.aiHand);
    opts.forEach(function (ap) {
      var afterAi = applyAi(state.board, ap, turn);
      if (!afterAi) return;
      var lucyWins = 0, otherWins = 0, lines = playerLines(afterAi, state.playerHand, state.lucyAt, turn);
      lines.forEach(function (ln) {
        var b = applyPlayerLine(afterAi, ln, turn);
        if (!b) return;
        if (score(b, turn).outcome === 'win') { if (ln.lucy) lucyWins++; else otherWins++; }
      });
      // Rank: Lucy needed (a Lucy line wins, no other does) > Lucy wins too >
      // nothing wins. Within a rank, fewer winning lines = a sharper lesson, but
      // keep at least a few Lucy lines so it isn't a needle in a haystack.
      var rank = lucyWins > 0 && otherWins === 0 ? 3 : lucyWins > 0 ? 2 : 0;
      var sharp = rank ? -Math.abs(lucyWins - 6) - otherWins : -(lucyWins + otherWins);
      var key = rank * 100000 + sharp;
      if (!best || key > best.key) best = { key: key, plays: ap, rank: rank, lucyWins: lucyWins, otherWins: otherWins };
    });
    if (!best) return { plays: [], kind: 'fallback', lucyWins: 0, otherWins: 0 };
    return { plays: best.plays, kind: best.rank === 3 ? 'needs-lucy' : best.rank === 2 ? 'lucy-wins' : 'fallback',
             lucyWins: best.lucyWins, otherWins: best.otherWins };
  }

  return { score: score, rowIPs: rowIPs, clone: clone, place: place, move: move,
           playerLines: playerLines, applyPlayerLine: applyPlayerLine, aiOptions: aiOptions,
           applyAi: applyAi, chooseT4: chooseT4, ids: { DA: DA, FIRE: FIRE, CAVE: CAVE, TRIBE: TRIBE, MEGALITH: MEGALITH, LUCY: LUCY, OTZI: OTZI } };
})();

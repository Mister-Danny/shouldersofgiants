'use strict';
/* SOG.OtziDirector plans Ötzi's first-attempt turn 4 on its own scoring of the
   camp cards. That scoring must match the real engine exactly, or the "moving
   Lucy wins" plan would be built on wrong numbers. Random boards, real engine
   (test/support/engine-vm.js), card by card. */
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { engine, place, endOfTurn, ROOT } = require('./support/engine-vm');

function director() {
  const ctx = { window: {}, console };
  ctx.window.SOG = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8') + ';globalThis.CARDS=CARDS', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/otzi-director.js'), 'utf8'), ctx);
  return ctx.window.SOG.OtziDirector;
}

const POOL = [26, 27, 28, 29, 30, 31, 32, 33, 34, 36];   // Ötzi's battle cards minus the Ötzi card (35)
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('director scoring matches the engine card by card on random boards', () => {
  const D = director();
  for (let trial = 0; trial < 200; trial++) {
    const { G, abilities, board, CARDS } = engine();
    const locIds = G.locations.map((l) => l.id);
    const dBoard = { locIds, player: {}, ai: {} };
    const placed = [];
    locIds.forEach((l) => {
      ['player', 'ai'].forEach((side) => {
        const n = Math.floor(rnd() * 5);
        dBoard[side][l] = [];
        for (let k = 0; k < n; k++) {
          const id = POOL[Math.floor(rnd() * POOL.length)];
          const turn = 1 + Math.floor(rnd() * 4);
          const sd = place(G, side === 'player' ? 'player' : 'opp', l, id, CARDS, { turnPlayed: turn });
          dBoard[side][l].push({ id, turn });
          placed.push({ sd, side, l, k, id, turn });
        }
      });
    });
    // Megalith: one end-of-turn growth for every turn it has been on the board (to turn 4).
    placed.filter((p) => p.id === 31).forEach((p) => {
      for (let t = p.turn; t <= 4; t++) endOfTurn(abilities, 31, p.side === 'player' ? 'player' : 'opp', p.l, p.k, p.sd);
    });
    abilities.evaluateContinuous();
    locIds.forEach((l) => {
      ['player', 'ai'].forEach((side) => {
        const want = D.rowIPs(dBoard[side][l], 4);
        const got = placed.filter((p) => p.side === side && p.l === l).map((p) => board.effectiveIP(p.sd));
        assert.deepEqual([...want], got, `trial ${trial} ${side} @${l}: ${JSON.stringify(dBoard[side][l])}`);
      });
    });
  }
});

test('the turn-4 plan makes a Lucy move a winning play on a typical first-attempt board', () => {
  const D = director();
  // Typical spread: you hold the Savannah, the Desert is close, the Rift Valley is Ötzi's.
  const board = { locIds: [8, 7, 2],
    player: { 8: [{ id: 27, turn: 1 }], 7: [{ id: 34, turn: 1 }, { id: 36, turn: 2 }, { id: 33, turn: 3 }], 2: [{ id: 32, turn: 2 }] },
    ai:     { 8: [{ id: 28, turn: 1 }, { id: 34, turn: 2 }], 7: [{ id: 31, turn: 3 }], 2: [{ id: 27, turn: 1 }, { id: 36, turn: 2 }, { id: 29, turn: 3 }] } };
  const r = D.chooseT4({ board, playerHand: [28, 30, 29, 26], aiHand: [32, 30, 26, 35], lucyAt: 7 });
  assert.ok(r.kind === 'needs-lucy' || r.kind === 'lucy-wins', 'a Lucy line wins: ' + r.kind);
  assert.ok(r.lucyWins > 0);
  assert.ok(!r.plays.some((p) => p.id === 35), 'the plan never plays the Ötzi card (random flee)');
});

'use strict';
/* The play rules gate: commitPlay is the one place every player play lands
   (mouse drop, touch drop, click-to-place, keyboard), so it — not the input
   handlers — must refuse a play past the turn's limit or any other rule.
   A touch screen used to bypass the cards-per-turn cap because the touch drop
   called commitPlay without a legality check and commitPlay did not test the
   cap. Runs the real engine + input module in a VM (test/support/engine-vm.js). */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('./support/engine-vm');

const GATHERER = 28, DOM_ANIMAL = 32, TRIBE = 36, HUNTER = 27, FIRE = 29, CAVE_ART = 30;

function onTable(G, locIds) {
  let n = 0;
  locIds.forEach((id) => G.playerSlots[id].forEach((s) => { if (s && !s.revealed) n++; }));
  return n;
}

/* The scripted first Neanderthal battle: one location, one card a turn, no Capital. */
function neanderthal() {
  const e = engine({ input: true });
  const { G } = e;
  G.locations = [{ id: 100, name: 'The Camp', abilityKey: null }];
  G.playerSlots = { 100: [null, null, null, null] }; G.aiSlots = { 100: [null, null, null, null] };
  G.locationBoosts = { 100: { player: [], opp: [] } };
  G.config = { structure: { turns: 4, locationsCount: 1, slotsPerLocation: 4, handStart: 1, maxHandSize: 4, cardsPerTurn: 1 },
               resource: { model: 'none', capital: 0 }, ai: {} };
  G.phase = 'select'; G.turn = 3; G.capital = 0;
  G.playerHand = [TRIBE, HUNTER]; G.playerRevealQueue = []; G.playerActionLog = [];
  return e;
}

/* A 2-per-turn battle (Ötzi / Gilgamesh shape): three locations, no Capital. */
function twoPerTurn() {
  const e = engine({ input: true });
  const { G } = e;
  G.config = { structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 4, cardsPerTurn: 2 },
               resource: { model: 'none', capital: 0 }, ai: {} };
  G.phase = 'select'; G.turn = 1; G.capital = 0;
  G.playerHand = [GATHERER, DOM_ANIMAL, TRIBE, HUNTER]; G.playerRevealQueue = []; G.playerActionLog = [];
  return e;
}

test('scripted Neanderthal battle: a second play in the same turn is rejected', () => {
  const { G, input } = neanderthal();
  assert.equal(input.commitPlay(TRIBE, 100), true, 'the first card plays');
  assert.equal(input.commitPlay(HUNTER, 100), false, 'the second card is refused (1 per turn)');
  assert.equal(onTable(G, [100]), 1);
  assert.deepEqual([...G.playerHand], [HUNTER], 'the refused card stays in hand');
  assert.equal(G.playerActionLog.filter((a) => a.type === 'play').length, 1);
});

test('the same card cannot be played twice (a repeated drop / second finger)', () => {
  const { G, input } = neanderthal();
  assert.equal(input.commitPlay(TRIBE, 100), true);
  assert.equal(input.commitPlay(TRIBE, 100), false);
  assert.equal(onTable(G, [100]), 1);
});

test('a take-back frees the turn\'s play again', () => {
  const { G, input } = neanderthal();
  input.commitPlay(TRIBE, 100);
  input.undoPlay(100, 0);
  assert.equal(onTable(G, [100]), 0);
  assert.equal(input.commitPlay(HUNTER, 100), true, 'after taking Tribe back, Hunter may be played');
  assert.equal(input.commitPlay(TRIBE, 100), false, 'and then the limit holds again');
});

test('2-per-turn battle: a third play in the same turn is rejected', () => {
  const { G, input } = twoPerTurn();
  assert.equal(input.commitPlay(GATHERER, 101), true);
  assert.equal(input.commitPlay(DOM_ANIMAL, 102), true);
  assert.equal(input.commitPlay(TRIBE, 103), false, 'third card refused (2 per turn)');
  assert.equal(input.commitPlay(HUNTER, 101), false);
  assert.equal(onTable(G, [101, 102, 103]), 2);
  assert.equal(G.playerHand.length, 2);
});

test('the limit counts this turn only: last turn\'s revealed cards do not count', () => {
  const { G, input } = twoPerTurn();
  input.commitPlay(GATHERER, 101);
  input.commitPlay(DOM_ANIMAL, 102);
  G.playerSlots[101][0].revealed = true; G.playerSlots[102][0].revealed = true;
  G.turn = 2;
  assert.equal(input.commitPlay(TRIBE, 103), true);
  assert.equal(input.commitPlay(HUNTER, 103), true);
  assert.equal(input.commitPlay(FIRE, 101), false);
});

test('no plays outside the selection phase (after End Turn, during the reveal)', () => {
  const { G, input } = twoPerTurn();
  G.phase = 'ending';
  assert.equal(input.commitPlay(GATHERER, 101), false);
  G.phase = 'reveal';
  assert.equal(input.commitPlay(GATHERER, 101), false);
  assert.equal(onTable(G, [101, 102, 103]), 0);
});

test('no plays while a script blocks input (dialogue, lessons)', () => {
  const { G, input, ctx } = twoPerTurn();
  ctx.SOG.BattleHooks.services.blockInput();
  assert.equal(input.commitPlay(GATHERER, 101), false);
  ctx.SOG.BattleHooks.services.unblockInput();
  assert.equal(input.commitPlay(GATHERER, 101), true);
});

test('a full location is refused at the commit too', () => {
  const { G, input } = twoPerTurn();
  G.config.structure.cardsPerTurn = null;                  // no per-turn cap: only the slots limit
  G.playerSlots[101] = [1, 2, 3, 4].map((id) => ({ cardId: id, revealed: true }));
  assert.equal(input.commitPlay(GATHERER, 101), false, 'no open slot');
  assert.equal(input.commitPlay(GATHERER, 102), true);
});

test('Capital: a card costing more than the Capital left is refused at the commit', () => {
  const { G, input, CARDS } = twoPerTurn();
  G.config.structure.cardsPerTurn = null;
  G.config.resource = { model: 'capital', capital: 5 };
  const costly = CARDS.find((c) => typeof c.cc === 'number' && c.cc >= 3);
  G.playerHand = [costly.id];
  G.capital = costly.cc - 1;
  assert.equal(input.commitPlay(costly.id, 101), false);
  G.capital = costly.cc;
  assert.equal(input.commitPlay(costly.id, 101), true);
  assert.equal(G.capital, 0);
});

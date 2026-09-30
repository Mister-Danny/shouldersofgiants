'use strict';
/* The Giant's CONCENTRATION window (js/game/ai.js _giantSelectPlays):
   by default it stacks its two most-winnable locations on the last TWO turns;
   a signature's positionalTurns shortens that. Gilgamesh uses 1, so his turn 3
   (of 4) spreads like a Serf while his card is still held for the last two. */
const test   = require('node:test');
const assert = require('node:assert');
const { engine, place } = require('./support/engine-vm');

const GILGAMESH = 43, HUNTER = 27, GATHERER = 28, NEANDERTHAL = 34, LUCY = 33, TRIBE = 36;

/* A 4-turn, cost-free, two-plays-a-turn battle (Gilgamesh's shape) where the
   player is hopelessly ahead at 103: a concentrating Giant never plays there
   (it is the least winnable of the three), a spreading one sometimes does. */
function board(hook) {
  const e = engine({ ai: true });
  const { G, CARDS } = e;
  G.config.structure.turns = 4;
  G.config.structure.cardsPerTurn = 2;
  G.config.resource = { model: 'none', capital: 0 };
  G.config.scriptHook = hook;
  G.config.ai = { profile: 'heuristic', tier: 'giant' };
  for (let i = 0; i < 4; i++) place(G, 'player', 103, LUCY, CARDS);   // 16 IP for the player at 103
  place(G, 'ai', 101, NEANDERTHAL, CARDS);
  place(G, 'ai', 102, NEANDERTHAL, CARDS);
  return e;
}

function playsAt103(hook, turn, runs) {
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    const { G, ai } = board(hook);
    G.turn = turn; G.aiHand = [HUNTER, GATHERER, TRIBE, NEANDERTHAL];
    const plays = ai.giantSelectPlaysFor(hook)({ hand: G.aiHand.slice(), capital: 0, turn });
    assert.equal(plays.length, 2, 'two plays a turn');
    if (plays.some((p) => p.locId === 103)) hits++;
  }
  return hits;
}

test('a default Giant concentrates on turn 3 of 4: never onto the lost location', () => {
  assert.equal(playsAt103('kush', 3, 40), 0);
});

test('Gilgamesh spreads on turn 3 of 4: the lost location still gets plays sometimes', () => {
  assert.ok(playsAt103('gilgamesh', 3, 60) > 0);
});

test('Gilgamesh still concentrates on the final turn', () => {
  assert.equal(playsAt103('gilgamesh', 4, 40), 0);
});

test('Gilgamesh-the-card is held on turn 2 and released on turn 3 (the endgame window is unchanged)', () => {
  const held = (turn) => {
    const { G, ai } = board('gilgamesh');
    G.turn = turn; G.aiHand = [GILGAMESH, HUNTER, GATHERER, TRIBE];
    const plays = ai.giantSelectPlaysFor('gilgamesh')({ hand: G.aiHand.slice(), capital: 0, turn });
    return !plays.some((p) => p.cardId === GILGAMESH);
  };
  assert.equal(held(2), true, 'turn 2: held');
  // Turn 3: released. He is the biggest card in hand by far, so the greedy pick takes him.
  assert.equal(held(3), false, 'turn 3: released');
});

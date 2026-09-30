'use strict';
/* The Hyksos (67): a -2 card that crosses to the opponent's side. Once there he
   is an ordinary card of theirs — their auras and strikes reach him — so a single
   +1 aura softens him to -1, not to 0 as at the old -1. Real engine in a VM. */
const test   = require('node:test');
const assert = require('node:assert');
const { engine, place, atOnce } = require('./support/engine-vm');

const HYKSOS = 67, HUNTER = 27, FIRE = 29, DOMESTICATED_ANIMAL = 32, TRIBE = 36, SCRIBE = 40, SOLDIER = 42;

function invade(playerIds) {
  const e = engine();
  const { G, abilities, CARDS } = e;
  playerIds.forEach((id) => place(G, 'player', 101, id, CARDS));
  const hy = place(G, 'ai', 101, HYKSOS, CARDS);
  atOnce(abilities, HYKSOS, 'ai', 101, G.aiSlots[101].indexOf(hy), hy);
  abilities.evaluateContinuous();
  return Object.assign(e, { hy });
}
function playerTotal(e) {
  const { G, board } = e;
  return G.playerSlots[101].reduce((s, x) => s + (x ? board.effectiveIP(x) : 0), 0)
       + G.locationBoosts[101].player.reduce((s, b) => s + b.amount, 0);
}

test('Hyksos is printed at -2', () => {
  const { CARDS } = engine();
  assert.equal(CARDS.find((c) => c.id === HYKSOS).ip, -2);
});

test('he crosses to the player side and the location total goes negative', () => {
  const e = invade([]);
  assert.ok(e.G.playerSlots[101].includes(e.hy), 'on the player side');
  assert.equal(e.hy.revealed, true);
  assert.equal(e.board.effectiveIP(e.hy), -2);
  assert.equal(playerTotal(e), -2, 'a location can sit below zero');
});

test('the invaded side\'s auras reach him like any card of theirs: Fire and Domesticated Animal lift him to -1', () => {
  const fire = invade([FIRE]);
  assert.equal(fire.board.effectiveIP(fire.hy), -1);
  assert.equal(playerTotal(fire), 1 - 1, 'still a net penalty at -2, where -1 would have been cancelled');
  // Slot order matters for the dog: Hunter, dog, then the Hyksos lands NEXT to it.
  const dog = invade([HUNTER, DOMESTICATED_ANIMAL]);
  assert.equal(dog.board.effectiveIP(dog.hy), -1);
  assert.equal(playerTotal(dog), (2 + 1) + 1 - 1);
});

test('permanent gains and strikes both apply', () => {
  const e = invade([HUNTER]);
  e.board.addIPMod(e.hy, 1, SCRIBE);
  assert.equal(e.board.effectiveIP(e.hy), -1, 'a Scribe-style +1 lands');
  e.board.addIPMod(e.hy, -1, SOLDIER);
  assert.equal(e.board.effectiveIP(e.hy), -2, 'a strike lands');
});

test('Tribe still counts him as another card here (Tribe\'s own gain is Tribe\'s, not his)', () => {
  const e = invade([TRIBE]);
  assert.equal(e.board.effectiveIP(e.hy), -2);
  assert.equal(playerTotal(e), (1 + 1) - 2);
});

test('their side full: he stays at -2 on his own side', () => {
  const { G, abilities, board, CARDS } = engine();
  for (let i = 0; i < 4; i++) place(G, 'player', 101, HUNTER, CARDS);
  const hy = place(G, 'ai', 101, HYKSOS, CARDS);
  atOnce(abilities, HYKSOS, 'ai', 101, G.aiSlots[101].indexOf(hy), hy);
  assert.ok(G.aiSlots[101].includes(hy));
  assert.equal(board.effectiveIP(hy), -2);
});

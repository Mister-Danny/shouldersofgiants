'use strict';
/* India set, bucket 3: Priest-King, Jain, Bhagavad Gita, The Buddha. Real engine
   in a VM (test/support/engine-vm.js). */
const test   = require('node:test');
const assert = require('node:assert/strict');
const loose  = require('node:assert');
const { engine, place, atOnce } = require('./support/engine-vm');

const ID = { PRIEST_KING: 88, BUDDHA: 101, JAIN: 104, GITA: 116, COTTON: 94, SHUDRA: 109, DALIT: 110, DRAINAGE: 91 };
const CITIZENS = 1, PRIESTS = 6, KNIGHT = 11, SAMURAI = 12, JOAN = 14, GRIOTS = 16, JUVENAL = 18, COSIMO = 19, VOLTAIRE = 20;

test('the bucket-3 id map matches js/cards.js, and Priest-King is a 6 IP / 5 CC card', () => {
  const { CARDS } = engine();
  const want = { PRIEST_KING: 'Priest-King', BUDDHA: 'The Buddha', JAIN: 'Jain', GITA: 'Bhagavad Gita' };
  for (const [k, name] of Object.entries(want)) assert.equal(CARDS.find((c) => c.id === ID[k]).name, name, k);
  const pk = CARDS.find((c) => c.id === ID.PRIEST_KING);
  assert.equal(pk.ip, 6); assert.equal(pk.cc, 5); assert.equal(pk.abilityName, 'Unknown Authority');
});

/* Simulate the hand → board journey the engine performs: entering hand runs the
   registry hook; playing runs applyPrePlayBonuses onto the slot. */
function drawPriestKing(G, abilities, owner) {
  const hand = owner === 'player' ? G.playerHand : G.aiHand;
  hand.push(ID.PRIEST_KING);
  abilities.noteCardEnteredHand(owner, ID.PRIEST_KING);
}
function playPriestKing(G, board, owner, locId) {
  const c = { cardId: ID.PRIEST_KING, ip: 6, cc: 5, revealed: true, ipMod: 0, contMod: 0, ipModSources: [], contModSources: [], bonuses: [], turnPlayed: 1 };
  board.applyPrePlayBonuses(c, owner, ID.PRIEST_KING, {});
  const hand = owner === 'player' ? G.playerHand : G.aiHand;
  hand.splice(hand.indexOf(ID.PRIEST_KING), 1);
  const arr = owner === 'player' ? G.playerSlots[locId] : G.aiSlots[locId];
  arr[arr.indexOf(null)] = c;
  return c;
}

/* ── Priest-King ────────────────────────────────────────────────────────── */
test('Priest-King: a borrowed Continuous ability applies its effect through him, with its own timing', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerDeck = [KNIGHT, JUVENAL];                                 // Juvenal (Continuous) is the bottom card
  drawPriestKing(G, abilities, 'player');
  loose.deepEqual(G.playerDeck, [KNIGHT, JUVENAL], 'the bottom card stays in the deck, drawable');
  const pk = playPriestKing(G, board, 'player', 101);
  assert.equal(pk.transcribedFrom, JUVENAL);
  const victim = place(G, 'ai', 101, JOAN, CARDS);                 // cc 4 → Juvenal's -2
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(victim), 4 - 2, 'Juvenal\'s aura runs from the Priest-King\'s slot');
  assert.equal(victim.contModSources[0].source, 'Juvenal');
  assert.equal(atOnce(abilities, ID.PRIEST_KING, 'player', 101, 0, pk), true, 'the At-Once handler is a no-op for a Continuous borrow');
  assert.equal(board.effectiveIP(pk), 6 - 2, 'Juvenal hits every CC>=4 card here — the 5-CC Priest-King included');
});

test('Priest-King: a borrowed At Once fires from his registry entry with him as the actor', () => {
  const { G, board, abilities, CARDS } = engine();
  G.aiDeck = [KNIGHT, ID.COTTON];                                   // Cotton: At Once, +2 to own Labor cards HERE
  drawPriestKing(G, abilities, 'ai');
  const labor = place(G, 'ai', 102, ID.SHUDRA, CARDS);              // Labor, at the Priest-King's location
  const elsewhere = place(G, 'ai', 103, ID.SHUDRA, CARDS);
  const pk = playPriestKing(G, board, 'ai', 102);
  assert.equal(pk.transcribedFrom, ID.COTTON);
  atOnce(abilities, ID.PRIEST_KING, 'ai', 102, 1, pk);
  assert.equal(labor.ipMod, 2, '"here" resolved around the Priest-King');
  assert.equal(elsewhere.ipMod, 0);
  assert.equal(labor.ipModSources[0].id, ID.PRIEST_KING, 'attributed to the Priest-King, the actor');
});

test('Priest-King: empty deck or a vanilla bottom card leaves him a plain 6/5 body', () => {
  const { G, board, abilities } = engine();
  G.playerDeck = [];
  drawPriestKing(G, abilities, 'player');
  const a = playPriestKing(G, board, 'player', 101);
  assert.equal(a.transcribedFrom, undefined); loose.deepEqual(a.borrowed, { srcId: null });
  assert.equal(abilities.abilityIdOf(a), ID.PRIEST_KING);
  assert.equal(atOnce(abilities, ID.PRIEST_KING, 'player', 101, 0, a), true);
  assert.equal(board.effectiveIP(a), 6);
  G.playerDeck = [VOLTAIRE, CITIZENS];                              // Citizens: no ability text
  drawPriestKing(G, abilities, 'player');
  const b = playPriestKing(G, board, 'player', 102);
  assert.equal(b.transcribedFrom, undefined);
});

test('Priest-King: the borrow is fixed at the moment he entered hand, and a borrowed Priest-King is a safe no-op', () => {
  const { G, board, abilities } = engine();
  G.playerDeck = [KNIGHT, VOLTAIRE];
  drawPriestKing(G, abilities, 'player');
  G.playerDeck.push(JUVENAL);                                       // the deck changes afterwards
  const pk = playPriestKing(G, board, 'player', 101);
  assert.equal(pk.transcribedFrom, VOLTAIRE, 'still Voltaire');
  G.playerDeck = [KNIGHT, ID.PRIEST_KING];                          // bottom card is another Priest-King
  drawPriestKing(G, abilities, 'player');
  const twin = playPriestKing(G, board, 'player', 102);
  assert.equal(twin.transcribedFrom, ID.PRIEST_KING);
  assert.equal(atOnce(abilities, ID.PRIEST_KING, 'player', 102, 0, twin), true, 'regress guard: no recursion');
});

/* ── Jain ───────────────────────────────────────────────────────────────── */
test('Jain: Military cards cannot be played at its location by either side, but may still move in', () => {
  const { G, board, abilities, CARDS } = engine();
  place(G, 'ai', 101, ID.JAIN, CARDS);
  assert.equal(abilities.isPlayTypeBlockedAt(101, 'Military'), true);
  assert.equal(board.isLocationPlayable(101, 'player', KNIGHT), false, 'the opponent of the Jain is blocked');
  assert.equal(board.isLocationPlayable(101, 'ai', SAMURAI), false, 'the Jain\'s own side is blocked too');
  assert.equal(board.isLocationPlayable(101, 'player', PRIESTS), true, 'other types play normally');
  assert.equal(board.isLocationPlayable(102, 'player', KNIGHT), true, 'other locations are open');
  // Movement in is not gated: the move-target rule never consults the play gate.
  assert.equal(board.isMoveBlockedInto(101), false);
  const knight = place(G, 'player', 102, KNIGHT, CARDS);
  G.playerSlots[102][0] = null; G.playerSlots[101][G.playerSlots[101].indexOf(null)] = knight;   // the move commit
  abilities.fireOnArrivedHere('player', 101, knight);
  assert.equal(G.playerSlots[101].includes(knight), true, 'the Knight moved in and stays');
  assert.equal(board.isLocationPlayable(101, 'player', SAMURAI), false, 'and plays are still blocked afterwards');
});

/* ── Bhagavad Gita ──────────────────────────────────────────────────────── */
function total(G, board, locId, side) {
  const slots = side === 'player' ? G.playerSlots : G.aiSlots;
  let t = 0;
  (slots[locId] || []).forEach((s) => { if (s && s.revealed) t += board.effectiveIP(s); });
  (G.locationBoosts[locId][side === 'player' ? 'player' : 'opp'] || []).forEach((b) => { t += b.amount; });
  return t;
}
test('Bhagavad Gita: +2 to its controller\'s location total when the controller\'s cards there are all different types', () => {
  const { G, board, abilities, CARDS } = engine();
  const gita = place(G, 'player', 101, ID.GITA, CARDS);            // Religious, 3
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3, 'does not fire on a single-card location');
  place(G, 'ai', 101, KNIGHT, CARDS);                              // the opponent's card does not count toward the two
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3, 'still one card of my own → no boost');
  place(G, 'player', 101, COSIMO, CARDS);                          // my Cultural: two of mine, different types
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3 + 4 + 2);
  loose.deepEqual(G.locationBoosts[101].player, [{ sourceCardId: ID.GITA, sourceOwner: 'player', sourceLocId: 101, amount: 2 }]);
  assert.equal(board.effectiveIP(gita), 3, 'the +2 is on the location, not on a card');
  assert.equal(total(G, board, 101, 'ai'), 1, 'the opponent gets nothing');
  place(G, 'player', 101, PRIESTS, CARDS);                         // a second Religious card OF MINE breaks the mix
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3 + 4 + 1, 'shared type among my cards → no boost');
  assert.deepEqual(G.locationBoosts[102].player.length, 0, 'other locations untouched');
});

test('Bhagavad Gita: an opponent card of a repeated type no longer switches it off', () => {
  const { G, board, abilities, CARDS } = engine();
  place(G, 'player', 101, ID.GITA, CARDS);                         // Religious
  place(G, 'player', 101, KNIGHT, CARDS);                          // Military — two of mine, distinct
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3 + 1 + 2);
  place(G, 'ai', 101, PRIESTS, CARDS);                             // the opponent repeats Religious
  place(G, 'ai', 101, SAMURAI, CARDS);                             // and Military
  abilities.evaluateContinuous();
  assert.equal(total(G, board, 101, 'player'), 3 + 1 + 2, 'still on: only my cards are checked');
  assert.equal(total(G, board, 101, 'ai'), 1 + 2, 'and the opponent gets no boost');
});

/* ── The Buddha ─────────────────────────────────────────────────────────── */
test('The Buddha: +2 per own damaged card anywhere on the board, each attributed to the damaged card', () => {
  const { G, board, abilities, CARDS } = engine();
  const buddha = place(G, 'player', 101, ID.BUDDHA, CARDS);        // 0 IP
  const a = place(G, 'player', 101, KNIGHT, CARDS);  board.addIPMod(a, -1, JUVENAL);
  const b = place(G, 'player', 103, GRIOTS, CARDS);  board.addIPMod(b, -2, JUVENAL);   // another location
  const clean = place(G, 'player', 102, COSIMO, CARDS);
  const theirs = place(G, 'ai', 101, JOAN, CARDS);   board.addIPMod(theirs, -3, JUVENAL);   // opponent's damage: no
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(buddha), 4);
  const srcs = buddha.bonuses.filter((x) => x.continuous).map((x) => [x.sourceType, x.sourceId, x.amount, x.pattern]);
  loose.deepEqual(srcs.sort((x, y) => x[1] - y[1]), [['card', KNIGHT, 2, 'B'], ['card', GRIOTS, 2, 'B']], 'one record per damaged card, thumbnail pattern B');
  loose.deepEqual(buddha.contModSources.map((e) => e.id).sort((x, y) => x - y), [KNIGHT, GRIOTS]);
  // Healing one of them takes its +2 away on the next pass; clean cards never count.
  board.clearDamage(a);
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(buddha), 2);
  assert.equal(clean.ipMod, 0);
});

test('The Buddha counts continuous damage (a standing aura) and his own, after the per-location auras have run', () => {
  const { G, board, abilities, CARDS } = engine();
  const buddha = place(G, 'player', 101, ID.BUDDHA, CARDS);
  place(G, 'player', 102, ID.DALIT, CARDS);                        // -1 to every other card at 102
  const v1 = place(G, 'player', 102, KNIGHT, CARDS);
  const v2 = place(G, 'player', 102, COSIMO, CARDS);
  abilities.evaluateContinuous();
  assert.equal(board.hasDamage(v1), true); assert.equal(board.hasDamage(v2), true);
  assert.equal(board.effectiveIP(buddha), 4, 'aura damage on two cards → +4');
  board.addIPMod(buddha, -1, JUVENAL);                              // the Buddha himself is damaged now
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(buddha), -1 + 6, 'three damaged cards, himself included');
  assert.equal(buddha.bonuses.filter((x) => x.continuous && x.sourceId === ID.BUDDHA).length, 1);
});

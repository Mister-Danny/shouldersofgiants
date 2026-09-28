'use strict';
/* India engine primitives (phase 1): damage, adjust-to-value, the play gate by
   type, ability borrowing on entering hand, and the location type-mix predicate.
   The REAL engine modules run here under a DOM stub — these are behaviour tests
   against SOG.board / SOG.abilities, not source greps. */
const test   = require('node:test');
const assert = require('node:assert/strict');
// Objects and arrays built inside the VM carry that realm's prototypes, so strict
// deepEqual rejects them on prototype alone; loose deepEqual compares structure.
const loose  = require('node:assert');
const { engine, place } = require('./support/engine-vm');

const CITIZENS = 1, KNIGHT = 11, PRIESTS = 6, GRIOTS = 16, SAMURAI = 12, JOAN = 14, JUVENAL = 18, VOLTAIRE = 20;

/* ── 1. DAMAGE ──────────────────────────────────────────────────────────── */
test('damage: any negative permanent or continuous delta counts, from any source, self included', () => {
  const { G, board, CARDS } = engine();
  const sd = place(G, 'player', 101, KNIGHT, CARDS);              // 1/1
  assert.equal(board.damageOn(sd), 0); assert.equal(board.hasDamage(sd), false);
  board.addIPMod(sd, -2, JUVENAL);                                 // an opponent's card
  board.addIPMod(sd, +3, VOLTAIRE);                                // a buff does not offset damage
  board.addIPMod(sd, -1, KNIGHT);                                  // self-inflicted counts
  sd.contMod = -1; sd.contModSources.push({ source: 'Dalit', delta: -1 });   // continuous layer counts
  assert.equal(board.damageOn(sd), 4);
  assert.equal(board.hasDamage(sd), true);
  assert.equal(board.effectiveIP(sd), 1 - 2 + 3 - 1 - 1);
});

test('damage: IP goes below zero with no floor and no destroy', () => {
  const { G, board, CARDS } = engine();
  const sd = place(G, 'player', 101, KNIGHT, CARDS);              // 1 IP
  board.addIPMod(sd, -4, JUVENAL);
  assert.equal(board.effectiveIP(sd), -3);
  assert.equal(board.damageOn(sd), 4);
  assert.equal(G.playerSlots[101][0], sd, 'the card is still in play');
});

test('damage: cardsWithDamage covers the whole board for one controller only', () => {
  const { G, board, CARDS } = engine();
  const a = place(G, 'player', 101, KNIGHT, CARDS);
  const b = place(G, 'player', 103, GRIOTS, CARDS);
  const c = place(G, 'player', 102, PRIESTS, CARDS);
  const o = place(G, 'ai', 101, SAMURAI, CARDS);
  board.addIPMod(a, -1, JUVENAL); board.addIPMod(b, -2, JUVENAL); board.addIPMod(o, -3, JUVENAL);
  const hits = board.cardsWithDamage('player');
  loose.deepEqual(hits.map((h) => [h.locId, h.sd.cardId, h.damage]).sort(), [[101, KNIGHT, 1], [103, GRIOTS, 2]]);
  assert.equal(board.cardsWithDamage('player').some((h) => h.sd === c), false);
  loose.deepEqual(board.cardsWithDamage('ai').map((h) => h.sd), [o]);
  a.revealed = false;                                               // face-down cards are not in play
  loose.deepEqual(board.cardsWithDamage('player').map((h) => h.sd), [b]);
});

test('damage: an adjust-to-value delta is exempt even when it lowers IP', () => {
  const { G, board, CARDS } = engine();
  const sd = place(G, 'player', 101, VOLTAIRE, CARDS);            // 5 IP
  board.adjustIPToward(sd, 3, CITIZENS);                           // -2, tagged adjust
  assert.equal(board.effectiveIP(sd), 3);
  assert.equal(board.damageOn(sd), 0, 'lowering toward a target is not damage');
  assert.equal(sd.ipModSources[0].kind, 'adjust');
});

/* ── 2. ADJUST-TO-VALUE ─────────────────────────────────────────────────── */
test('adjust-to-value: the Great Bath case restores base IP by delta, leaving the ledger intact', () => {
  const { G, board, CARDS } = engine();
  const sd = place(G, 'player', 101, KNIGHT, CARDS);              // base 1
  board.addIPMod(sd, +3, VOLTAIRE);                                // buff
  board.addIPMod(sd, -2, JUVENAL);                                 // damage → 2
  const d = board.restoreToBaseIP(sd, CITIZENS);
  assert.equal(d, -1);
  assert.equal(board.effectiveIP(sd), 1);
  assert.equal(sd.ipModSources.length, 3, 'nothing was reset; a third entry was added');
  assert.equal(board.damageOn(sd), 2, 'the earlier damage is still on the ledger (Buddha still counts it)');
  assert.equal(board.restoreToBaseIP(sd, CITIZENS), 0, 'already at target → no-op');
});

test('adjust-to-value: the Standardized Weights case sets both sides to 3 and can re-adjust later', () => {
  const { G, board, CARDS } = engine();
  const mine = place(G, 'player', 102, VOLTAIRE, CARDS);          // 5
  const theirs = place(G, 'ai', 102, KNIGHT, CARDS);              // 1
  assert.equal(board.adjustIPToward(mine, 3, CITIZENS), -2);
  assert.equal(board.adjustIPToward(theirs, 3, CITIZENS), 2);
  assert.equal(board.effectiveIP(mine), 3); assert.equal(board.effectiveIP(theirs), 3);
  board.addIPMod(mine, +2, VOLTAIRE);                              // later buff moves it to 5 again
  assert.equal(board.adjustIPToward(mine, 3, CITIZENS), -2, 'a later adjustment re-applies from the new value');
  assert.equal(board.effectiveIP(mine), 3);
  assert.equal(board.damageOn(mine), 0);
});

/* ── 3. PLAY GATE BY TYPE ───────────────────────────────────────────────── */
test('play gate: a card in play blocks plays of its declared type here, for both sides, until it leaves', () => {
  const { G, board, abilities, CARDS } = engine();
  const R = abilities.CARD_ABILITIES;
  R[PRIESTS] = { blocksPlayOfType: 'Military' };                   // a stand-in Jain
  try {
    const jain = place(G, 'player', 101, PRIESTS, CARDS);
    assert.equal(abilities.isPlayTypeBlockedAt(101, 'Military'), true);
    assert.equal(abilities.isPlayTypeBlockedAt(101, 'Religious'), false);
    assert.equal(abilities.isPlayTypeBlockedAt(102, 'Military'), false, 'other locations are open');
    // Both sides are gated, only for the blocked type, only when the card is named.
    assert.equal(board.isLocationPlayable(101, 'player', KNIGHT), false);
    assert.equal(board.isLocationPlayable(101, 'ai', SAMURAI), false);
    assert.equal(board.isLocationPlayable(101, 'player', GRIOTS), true);
    assert.equal(board.isLocationPlayable(101, 'player'), true, 'two-argument form is unchanged');
    // Movement into the location is still allowed.
    assert.equal(board.isMoveBlockedInto(101), false);
    // Face-down (unrevealed) does not count; leaving the board lifts the block.
    jain.revealed = false;
    assert.equal(board.isLocationPlayable(101, 'player', KNIGHT), true);
    jain.revealed = true; G.playerSlots[101][0] = null;
    assert.equal(board.isLocationPlayable(101, 'player', KNIGHT), true);
  } finally { delete R[PRIESTS]; }
});

test('play gate: a Rosetta-style transcription carries the block (resolved via abilityIdOf)', () => {
  const { G, board, abilities, CARDS } = engine();
  const R = abilities.CARD_ABILITIES;
  R[PRIESTS] = { blocksPlayOfType: ['Military', 'Exploration'] };
  try {
    const rosetta = place(G, 'ai', 103, 58, CARDS);
    rosetta.transcribedFrom = PRIESTS;
    assert.equal(board.isLocationPlayable(103, 'player', KNIGHT), false);
    assert.equal(board.isLocationPlayable(103, 'player', 24), false);   // Magellan, Exploration
    assert.equal(board.isLocationPlayable(103, 'player', GRIOTS), true);
  } finally { delete R[PRIESTS]; }
});

/* ── 4. ABILITY BORROWING ON ENTERING HAND ──────────────────────────────── */
test('borrowing: reads the bottom card at that moment, stores it, and leaves the deck alone', () => {
  const { G, abilities, CARDS } = engine();
  G.playerDeck = [CITIZENS, KNIGHT, VOLTAIRE];                     // Voltaire (has an ability) is the bottom
  const rec = abilities.borrowAbilityFromDeckBottom('player', 88);
  assert.equal(rec.srcId, VOLTAIRE);
  loose.deepEqual(G.playerDeck, [CITIZENS, KNIGHT, VOLTAIRE], 'bottom card not moved');
  loose.deepEqual(abilities.borrowedAbilityOf('player', 88), { srcId: VOLTAIRE });
  assert.equal(abilities.borrowedAbilityOf('ai', 88), null, 'per side');
  G.playerDeck.push(JUVENAL);                                       // the deck changes afterwards
  assert.equal(abilities.borrowedAbilityOf('player', 88).srcId, VOLTAIRE, 'resolved at borrow time, not later');
});

test('borrowing: empty deck or a vanilla bottom card means no ability', () => {
  const { G, abilities } = engine();
  G.playerDeck = [];
  assert.equal(abilities.borrowAbilityFromDeckBottom('player', 88).srcId, null);
  G.aiDeck = [VOLTAIRE, CITIZENS];                                  // Citizens: no ability text
  assert.equal(abilities.borrowAbilityFromDeckBottom('ai', 88).srcId, null);
});

test('borrowing: rides onto the played slot as a transcription, keeps its own timing, and undo re-credits', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerDeck = [KNIGHT, JUVENAL];                                 // Juvenal is CONTINUOUS
  abilities.borrowAbilityFromDeckBottom('player', 88);
  const dry = { cardId: 88, ip: 5, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(dry, 'player', 88, { dryRun: true });
  assert.equal(dry.transcribedFrom, JUVENAL, 'the hand popup sees the borrowed ability');
  assert.ok(abilities.borrowedAbilityOf('player', 88), 'dry run does not consume');
  const sd = { cardId: 88, ip: 5, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(sd, 'player', 88, {});
  assert.equal(sd.transcribedFrom, JUVENAL);
  loose.deepEqual(sd.borrowed, { srcId: JUVENAL });
  assert.equal(abilities.abilityIdOf(sd), JUVENAL, 'continuous / end-of-turn dispatch resolves the borrowed id');
  assert.equal(abilities.borrowedAbilityOf('player', 88), null, 'consumed at play');
  // The borrowed rule is live on the board: Juvenal's -2 to CC>=4 cards here.
  G.playerSlots[101][0] = Object.assign(sd, { revealed: true });
  const big = place(G, 'ai', 101, JOAN, CARDS);                    // cc 4, no continuous ability of her own
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(big), 4 - 2, 'a borrowed Continuous ability runs as Continuous');
  assert.equal(board.damageOn(big), 2);
  // Undo the play: the borrow goes back to the hand table.
  board.recreditPrePlayBonuses(sd, 'player');
  loose.deepEqual(abilities.borrowedAbilityOf('player', 88), { srcId: JUVENAL });
});

test('borrowing: a borrow that found nothing marks the slot but sets no transcription', () => {
  const { G, board, abilities } = engine();
  G.playerDeck = [];
  abilities.borrowAbilityFromDeckBottom('player', 88);
  const sd = { cardId: 88, ip: 5, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(sd, 'player', 88, {});
  assert.equal(sd.transcribedFrom, undefined);
  loose.deepEqual(sd.borrowed, { srcId: null });
  assert.equal(abilities.abilityIdOf(sd), 88, 'falls back to the card\'s own id');
});

test('borrowing: noteCardEnteredHand runs a registry onEnterHand hook and nothing else', () => {
  const { abilities } = engine();
  const R = abilities.CARD_ABILITIES;
  const calls = [];
  R[PRIESTS] = { onEnterHand: (owner, id) => calls.push([owner, id]) };
  try {
    abilities.noteCardEnteredHand('player', PRIESTS);
    abilities.noteCardEnteredHand('ai', KNIGHT);                    // no hook → no-op
    loose.deepEqual(calls, [['player', PRIESTS]]);
  } finally { delete R[PRIESTS]; }
});

/* ── 5. LOCATION TYPE-MIX PREDICATE ─────────────────────────────────────── */
test('type mix: true only with two or more cards and no shared primary type, both sides counted', () => {
  const { G, abilities, CARDS } = engine();
  assert.equal(abilities.locationTypeMixDistinct(101), false, 'empty');
  place(G, 'player', 101, KNIGHT, CARDS);                          // Military
  assert.equal(abilities.locationTypeMixDistinct(101), false, 'one card');
  place(G, 'ai', 101, PRIESTS, CARDS);                             // Religious (other side)
  assert.equal(abilities.locationTypeMixDistinct(101), true);
  assert.equal(abilities.locationTypeMixDistinct(101, { owner: 'player' }), false, 'owner-restricted: one card');
  const dup = place(G, 'player', 101, SAMURAI, CARDS);             // a second Military
  assert.equal(abilities.locationTypeMixDistinct(101), false, 'shared type');
  dup.revealed = false;
  assert.equal(abilities.locationTypeMixDistinct(101), true, 'face-down cards do not count');
  assert.equal(abilities.locationTypeMixDistinct(102), false, 'other location untouched');
});

test('type mix: addLocationBoost pays the location, not a card, through the existing boost table', () => {
  const { G, board, abilities, CARDS } = engine();
  place(G, 'player', 101, KNIGHT, CARDS);
  assert.equal(abilities.addLocationBoost(101, 'player', 2, 118, 101), true);
  loose.deepEqual(G.locationBoosts[101].player, [{ sourceCardId: 118, sourceOwner: 'player', sourceLocId: 101, amount: 2 }]);
  loose.deepEqual(G.locationBoosts[101].opp, []);
  assert.equal(abilities.addLocationBoost(999, 'player', 2), false, 'unknown location → not written');
  // No card gained IP; the boost is only in the table (what updateScores/tallyResult read).
  assert.equal(board.effectiveIP(G.playerSlots[101][0]), 1);
});

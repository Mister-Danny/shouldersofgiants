'use strict';
/* India set, bucket 2 (composites) plus the three bucket-1 corrections and the
   controller-chosen Beast placement. Real engine in a VM (test/support/engine-vm.js).
   G._testChoose answers every chooser synchronously. */
const test   = require('node:test');
const assert = require('node:assert/strict');
const loose  = require('node:assert');
const { engine, place, atOnce, endOfTurn } = require('./support/engine-vm');

const ID = { GREAT_BATH: 89, GRANARY: 90, PASHUPATI: 92, BEAST: 93, INDUS_SEALS: 95, FIRED_BRICK: 96, WEIGHTS: 97,
             MERCHANT: 99, PRIEST: 100, ASHOKA: 102, MISSIONARY: 105, BRAHMIN: 107, VAISHYA: 111, SANSKRIT: 114,
             INOCULATION: 118, ALLOY: 119 };
const CITIZENS = 1, PRIESTS = 6, ERASMUS = 9, KNIGHT = 11, JOAN = 14, JUVENAL = 18, COSIMO = 19, VOLTAIRE = 20,
      HUNTER = 27, EGYPT_MERCHANT = 76, INDIA_COTTON = 94;

test('the bucket-2 id map matches js/cards.js, and every India card carries civilization "India"', () => {
  const { CARDS } = engine();
  const want = { GREAT_BATH: 'Great Bath', GRANARY: 'Granary', INDUS_SEALS: 'Indus Seals', FIRED_BRICK: 'Fired Brick',
                 WEIGHTS: 'Standardized Weights', MERCHANT: 'Merchant', ASHOKA: 'Asoka', VAISHYA: 'Vaishya',
                 SANSKRIT: 'Sanskrit', INOCULATION: 'Inoculation', ALLOY: 'Alloy' };
  for (const [k, name] of Object.entries(want)) assert.equal(CARDS.find((c) => c.id === ID[k]).name, name, k);
  assert.equal(CARDS.find((c) => c.id === ID.VAISHYA).type, 'Economic');
  const india = CARDS.filter((c) => /images\/cards\/india\//.test(c.image));
  assert.equal(india.length, 33);
  assert.ok(india.every((c) => c.civilization === 'India'));
  assert.match(CARDS.find((c) => c.id === ID.BRAHMIN).ability, /you control here\.$/);
  assert.match(CARDS.find((c) => c.id === ID.MISSIONARY).ability, /your non-Religious cards/);
});

/* ── Corrections ────────────────────────────────────────────────────────── */
test('Priest is a transfer: every hand card gives 1 IP (as a -1 stamp) and the Priest gains the total', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerHand = [KNIGHT, VOLTAIRE, VOLTAIRE];
  const priest = place(G, 'player', 101, ID.PRIEST, CARDS);
  atOnce(abilities, ID.PRIEST, 'player', 101, 0, priest);
  assert.equal(board.effectiveIP(priest), 3);
  assert.equal(abilities.handStats('player', KNIGHT).ip, 0);
  assert.equal(abilities.handStats('player', VOLTAIRE).ip, 5 - 2, 'twin ids share the stamp (both -1s on the id)');
  const played = { cardId: KNIGHT, ip: 1, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(played, 'player', KNIGHT, {});
  assert.equal(board.effectiveIP(played), 0);
  assert.equal(played.ipModSources[0].id, ID.PRIEST, 'attributed to the Priest');
  assert.equal(board.damageOn(played), 1, 'the cost side is damage the card took');
});

test('Brahmin counts only cards its controller owns here', () => {
  const { G, board, abilities, CARDS } = engine();
  const b = place(G, 'player', 101, ID.BRAHMIN, CARDS);
  place(G, 'player', 101, PRIESTS, CARDS);                         // mine, Religious
  place(G, 'ai', 101, CITIZENS, CARDS);                            // theirs, Political — no
  place(G, 'ai', 101, PRIESTS, CARDS);                             // theirs, Religious — no
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(b), 5);
});

test('Missionary buffs only its controller\'s non-Religious cards where it arrives', () => {
  const { G, abilities, CARDS } = engine();
  const m = place(G, 'player', 101, ID.MISSIONARY, CARDS);
  const mine = place(G, 'player', 102, KNIGHT, CARDS);
  const theirs = place(G, 'ai', 102, COSIMO, CARDS);
  G.playerSlots[101][0] = null; G.playerSlots[102][G.playerSlots[102].indexOf(null)] = m;
  abilities.fireOnArrivedHere('player', 102, m);
  assert.equal(mine.ipMod, 1); assert.equal(theirs.ipMod, 0);
});

test('Lord of the Beasts: the controller chooses the destination; the AI picks its weakest open location', () => {
  const { G, abilities, CARDS } = engine();
  const lord = place(G, 'player', 101, ID.PASHUPATI, CARDS);
  let offered = null;
  G._testChoose = (kind, options) => { offered = { kind, ids: options.map((l) => l.id) }; return options.find((l) => l.id === 103); };
  atOnce(abilities, ID.PASHUPATI, 'player', 101, 0, lord);
  loose.deepEqual(offered, { kind: 'location', ids: [102, 103] }, 'other locations with room are offered');
  assert.equal(G.playerSlots[103].filter((s) => s && s.cardId === ID.BEAST).length, 1, 'the chosen one got the Beast');
  assert.equal(G.playerSlots[102].filter((s) => s && s.cardId === ID.BEAST).length, 0);
  // AI: no chooser; it sends the Beast where its own total is lowest.
  delete G._testChoose;
  place(G, 'ai', 102, VOLTAIRE, CARDS);                            // AI strong at 102, empty at 103
  const aiLord = place(G, 'ai', 101, ID.PASHUPATI, CARDS);
  atOnce(abilities, ID.PASHUPATI, 'ai', 101, 0, aiLord);
  assert.equal(G.aiSlots[103].filter((s) => s && s.cardId === ID.BEAST).length, 1);
  // No room anywhere else → fizzle (no chooser shown).
  [102, 103].forEach((l) => { while (G.playerSlots[l].includes(null)) place(G, 'player', l, KNIGHT, CARDS); });
  G._testChoose = () => { throw new Error('chooser must not open with no options'); };
  atOnce(abilities, ID.PASHUPATI, 'player', 101, 0, lord);
});

/* ── Merges ─────────────────────────────────────────────────────────────── */
test('Indus Seals merges into a chosen own card, handing over its IP (+1 if the host is Economic), and vanishes', () => {
  const { G, board, abilities, CARDS } = engine();
  const econ = place(G, 'player', 101, INDIA_COTTON, CARDS);       // Economic, 1 IP
  const mil  = place(G, 'player', 101, KNIGHT, CARDS);             // 1 IP
  const seals = place(G, 'player', 101, ID.INDUS_SEALS, CARDS);    // 3 IP
  board.addIPMod(seals, +2, COSIMO);                                // a permanent buff rides along
  G._testChoose = (kind, targets) => targets.find((t) => t.sd === econ);
  atOnce(abilities, ID.INDUS_SEALS, 'player', 101, 2, seals);
  assert.equal(board.effectiveIP(econ), 1 + 3 + 2 + 1, 'printed 3 + carried 2 + Economic bonus 1');
  assert.equal(G.playerSlots[101].filter(Boolean).length, 2, 'Seals are gone');
  assert.equal(econ.ipModSources[0].id, ID.INDUS_SEALS, 'attributed to the merged card');
  assert.equal(mil.ipMod, 0);
  // AI: picks the host that ends highest, the Economic edge included.
  const a1 = place(G, 'ai', 102, KNIGHT, CARDS);                   // 1
  const a2 = place(G, 'ai', 102, INDIA_COTTON, CARDS);             // 1 (+1 edge)
  const aiSeals = place(G, 'ai', 102, ID.INDUS_SEALS, CARDS);
  delete G._testChoose;
  atOnce(abilities, ID.INDUS_SEALS, 'ai', 102, 2, aiSeals);
  assert.equal(board.effectiveIP(a2), 1 + 3 + 1); assert.equal(a1.ipMod, 0);
  // No host → reveals as a plain card.
  const lone = place(G, 'player', 103, ID.INDUS_SEALS, CARDS);
  atOnce(abilities, ID.INDUS_SEALS, 'player', 103, 0, lone);
  assert.equal(G.playerSlots[103][0], lone);
});

test('Sanskrit merges for +2 more when the host is Religious', () => {
  const { G, board, abilities, CARDS } = engine();
  const rel = place(G, 'player', 101, PRIESTS, CARDS);             // 1
  const sanskrit = place(G, 'player', 101, ID.SANSKRIT, CARDS);    // 1
  G._testChoose = (kind, targets) => targets[0];
  atOnce(abilities, ID.SANSKRIT, 'player', 101, 1, sanskrit);
  assert.equal(board.effectiveIP(rel), 1 + 1 + 2);
  assert.equal(G.playerSlots[101].filter(Boolean).length, 1);
});

test('Alloy merges with the last card the owner played here and doubles it', () => {
  const { G, board, abilities, CARDS } = engine();
  const first = place(G, 'player', 101, VOLTAIRE, CARDS, { playTime: 1 });   // 5
  const last  = place(G, 'player', 101, KNIGHT, CARDS, { playTime: 2 });     // 1
  const alloy = place(G, 'player', 101, ID.ALLOY, CARDS, { playTime: 3 });   // 1
  atOnce(abilities, ID.ALLOY, 'player', 101, 2, alloy);
  assert.equal(board.effectiveIP(last), (1 + 1) * 2, 'Knight took Alloy\'s 1, then doubled');
  assert.equal(board.effectiveIP(first), 5, 'the earlier card is untouched');
  assert.equal(G.playerSlots[101].filter(Boolean).length, 2);
  assert.ok(last.ipModSources.every((e) => e.id === ID.ALLOY));
});

/* ── Inoculation ────────────────────────────────────────────────────────── */
test('Inoculation: -1 to a chosen own card (counted as damage), then double it', () => {
  const { G, board, abilities, CARDS } = engine();
  const target = place(G, 'player', 101, VOLTAIRE, CARDS);         // 5
  const inoc = place(G, 'player', 101, ID.INOCULATION, CARDS);
  G._testChoose = (kind, targets) => targets[0];
  atOnce(abilities, ID.INOCULATION, 'player', 101, 1, inoc);
  assert.equal(board.effectiveIP(target), (5 - 1) * 2);
  assert.equal(board.damageOn(target), 1, 'the -1 is self-inflicted damage');
});

/* ── Merchant / Vaishya (Trader) ────────────────────────────────────────── */
test('Merchant and Vaishya react to the owner\'s Economic play here: +N (+1 if a different civilization) and move', () => {
  const { G, board, abilities, CARDS, ctx } = engine();
  const moves = [];
  ctx.SOG.game.executeMoveAnimated = (owner, cardId, from, to, opts, cb) => { moves.push([owner, cardId, from, to]); cb(); };
  const merchant = place(G, 'player', 101, ID.MERCHANT, CARDS);    // 2, India
  const vaishya  = place(G, 'player', 101, ID.VAISHYA, CARDS);     // 2, India
  let done = 0;
  abilities.fireOnCardLandedHere('player', INDIA_COTTON, 101, () => done++);   // an INDIAN Economic card: same civ
  assert.equal(done, 1);
  assert.equal(board.effectiveIP(merchant), 2 + 1); assert.equal(board.effectiveIP(vaishya), 2 + 2);
  assert.equal(moves.length, 2, 'both moved');
  assert.ok(moves.every((m) => m[2] === 101 && m[3] !== 101));
  // A different-civilization Economic card: +1 more to the reactor itself.
  // (The reveal pipeline names the AI side 'opp' when it lands a card.)
  const m2 = place(G, 'ai', 102, ID.MERCHANT, CARDS);
  abilities.fireOnCardLandedHere('opp', EGYPT_MERCHANT, 102, () => {});       // Egypt Economic card
  assert.equal(board.effectiveIP(m2), 2 + 1 + 1);
  // Not Economic, or the opponent's play → nothing.
  const m3 = place(G, 'player', 103, ID.MERCHANT, CARDS);
  abilities.fireOnCardLandedHere('player', KNIGHT, 103, () => {});
  abilities.fireOnCardLandedHere('opp', INDIA_COTTON, 103, () => {});
  assert.equal(board.effectiveIP(m3), 2);
});

/* ── Asoka ──────────────────────────────────────────────────────────────── */
test('Asoka destroys the owner\'s OTHER cards here and pays +2 per destroyed card to Religious cards in hand', () => {
  const { G, abilities, CARDS } = engine();
  place(G, 'player', 101, KNIGHT, CARDS); place(G, 'player', 101, HUNTER, CARDS);
  const theirs = place(G, 'ai', 101, VOLTAIRE, CARDS);
  const elsewhere = place(G, 'player', 102, COSIMO, CARDS);
  const asoka = place(G, 'player', 101, ID.ASHOKA, CARDS);
  G.playerHand = [PRIESTS, ERASMUS, KNIGHT];
  atOnce(abilities, ID.ASHOKA, 'player', 101, 2, asoka);
  loose.deepEqual(G.playerSlots[101].filter(Boolean).map((s) => s.cardId), [ID.ASHOKA], 'others destroyed, Asoka stays');
  assert.equal(G.playerDestroyed.length, 2);
  assert.equal(G.aiSlots[101][0], theirs); assert.equal(G.playerSlots[102][0], elsewhere);
  assert.equal(abilities.handStats('player', PRIESTS).ip, 1 + 4);
  assert.equal(abilities.handStats('player', ERASMUS).ip, 3 + 4);
  assert.equal(abilities.handStats('player', KNIGHT).ip, 1, 'non-Religious untouched');
  assert.equal(G.cardIPBonusSource.player[PRIESTS][0].id, ID.ASHOKA);
});

/* ── Great Bath ─────────────────────────────────────────────────────────── */
test('Great Bath restores a card played or moved here to its base IP, either side, via adjust-to-value', () => {
  const { G, board, abilities, CARDS } = engine();
  const bath = place(G, 'player', 101, ID.GREAT_BATH, CARDS);
  const played = place(G, 'ai', 101, KNIGHT, CARDS);               // opponent's card, arrives buffed and damaged
  board.addIPMod(played, +3, VOLTAIRE); board.addIPMod(played, -1, JUVENAL);
  abilities.fireOnCardLandedHere('ai', KNIGHT, 101, () => {});
  assert.equal(board.effectiveIP(played), 1);
  assert.equal(board.damageOn(played), 1, 'ledger intact');
  assert.equal(played.ipModSources[2].kind, 'adjust');
  assert.equal(played.ipModSources[2].id, ID.GREAT_BATH);
  const mover = place(G, 'player', 102, VOLTAIRE, CARDS); board.addIPMod(mover, +4, COSIMO);
  G.playerSlots[102][0] = null; G.playerSlots[101][G.playerSlots[101].indexOf(null)] = mover;
  abilities.fireOnCardMovedHere('player', VOLTAIRE, 101, mover);
  assert.equal(board.effectiveIP(mover), 5, 'a card that moved here is restored too');
  assert.equal(board.effectiveIP(bath), 5, 'the Bath never restores itself');
});

/* ── Granary ────────────────────────────────────────────────────────────── */
test('Granary holds +1 per unspent Capital for either side', () => {
  const { G, board, abilities, CARDS } = engine();
  const mine = place(G, 'player', 101, ID.GRANARY, CARDS);         // 2
  G.capital = 3;
  endOfTurn(abilities, ID.GRANARY, 'player', 101, 0, mine);
  assert.equal(board.effectiveIP(mine), 5);
  const theirs = place(G, 'ai', 102, ID.GRANARY, CARDS);
  G.aiCapitalBudgetThisTurn = 5; G.aiCapitalSpentThisTurn = 4;
  endOfTurn(abilities, ID.GRANARY, 'ai', 102, 0, theirs);
  assert.equal(board.effectiveIP(theirs), 3);
  G.capital = 0;
  endOfTurn(abilities, ID.GRANARY, 'player', 101, 0, mine);
  assert.equal(board.effectiveIP(mine), 5, 'nothing unspent → nothing');
});

test('the AI records its budget and spend so Granary can read them', () => {
  const { G, ai, CARDS } = engine({ ai: true });
  G.turn = 2; G.aiHand = [KNIGHT, CITIZENS, VOLTAIRE]; G.baseCapitalThisTurn = 5; G.aiBonusCapitalNextTurn = 0;
  G.config.ai = { profile: 'easy' };
  ai.runAiSelection();
  assert.equal(G.aiCapitalBudgetThisTurn, 5);
  const spent = G.aiActionLog.filter((a) => a.type === 'play').reduce((s, a) => s + CARDS.find((c) => c.id === a.cardId).cc, 0);
  assert.equal(G.aiCapitalSpentThisTurn, spent);
  assert.ok(G.aiCapitalSpentThisTurn <= 5);
});

/* ── Standardized Weights ───────────────────────────────────────────────── */
test('Standardized Weights sets every card here on both sides to 3 IP by adjustment', () => {
  const { G, board, abilities, CARDS } = engine();
  const low = place(G, 'player', 101, KNIGHT, CARDS);              // 1
  const high = place(G, 'ai', 101, JOAN, CARDS);                   // 4 (no continuous ability of her own)
  const far = place(G, 'ai', 102, JOAN, CARDS);
  const w = place(G, 'player', 101, ID.WEIGHTS, CARDS);            // 3 already
  atOnce(abilities, ID.WEIGHTS, 'player', 101, 1, w);
  assert.equal(board.effectiveIP(low), 3); assert.equal(board.effectiveIP(high), 3); assert.equal(board.effectiveIP(w), 3);
  assert.equal(board.effectiveIP(far), 4);
  assert.equal(board.damageOn(high), 0, 'lowering by adjustment is not damage');
  assert.equal(high.ipModSources[0].kind, 'adjust');
});

/* ── Fired Brick ────────────────────────────────────────────────────────── */
test('Fired Brick draws a card, then sets each hand card\'s IP to its CC as an adjust stamp', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerDeck = [ERASMUS, KNIGHT];                                 // Erasmus 4 CC / 3 IP is drawn
  G.playerHand = [VOLTAIRE, CITIZENS];                              // 5/5, 1/1
  const brick = place(G, 'player', 101, ID.FIRED_BRICK, CARDS);
  atOnce(abilities, ID.FIRED_BRICK, 'player', 101, 0, brick);
  loose.deepEqual(G.playerHand, [VOLTAIRE, CITIZENS, ERASMUS]); loose.deepEqual(G.playerDeck, [KNIGHT]);
  assert.equal(abilities.handStats('player', ERASMUS).ip, 4, 'IP = CC');
  assert.equal(abilities.handStats('player', VOLTAIRE).ip, 5, 'already equal → no stamp');
  assert.equal(abilities.handStats('player', CITIZENS).ip, 1);
  const played = { cardId: ERASMUS, ip: 3, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(played, 'player', ERASMUS, {});
  assert.equal(board.effectiveIP(played), 4);
  assert.equal(played.ipModSources[0].kind, 'adjust');
  // A set-DOWN is an adjustment too, not damage.
  G.playerHand = [VOLTAIRE]; G.playerDeck = [];
  const stampedDown = { cardId: VOLTAIRE, ip: 5, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  abilities.borrowedAbilityOf; // (no-op reference; keeps the harness honest about exports)
  G.cardIPBonus = {}; G.cardIPBonusSource.player = {};
  const brick2 = place(G, 'player', 102, ID.FIRED_BRICK, CARDS);
  G.playerHand = [JOAN];                                            // Joan 4 CC / 4 IP → no change; use a mismatch:
  G.playerHand = [COSIMO];                                          // Cosimo 4 CC / 4 IP … pick Erasmus again
  G.playerHand = [VOLTAIRE]; G.kushCCDiscount = { player: { 20: 2 }, opp: {} };   // Voltaire shows 3 CC now → set 5 → 3
  atOnce(abilities, ID.FIRED_BRICK, 'player', 102, 0, brick2);
  board.applyPrePlayBonuses(stampedDown, 'player', VOLTAIRE, {});
  assert.equal(board.effectiveIP(stampedDown), 3);
  assert.equal(board.damageOn(stampedDown), 0, 'a Fired Brick set-down is not damage');
  // Hand at cap → no draw, sets still apply.
  G.playerHand = [1, 2, 3, 4, 5, 6, 7]; G.playerDeck = [KNIGHT];
  const brick3 = place(G, 'player', 103, ID.FIRED_BRICK, CARDS);
  atOnce(abilities, ID.FIRED_BRICK, 'player', 103, 0, brick3);
  assert.equal(G.playerHand.length, 7); loose.deepEqual(G.playerDeck, [KNIGHT]);
});

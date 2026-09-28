'use strict';
/* India set, bucket 1: clearDamage, the seventeen wired cards, the farm-proof
   heal, and the Giant brain honouring the type gate. Runs the real engine in a
   VM (test/support/engine-vm.js). */
const test   = require('node:test');
const assert = require('node:assert/strict');
const loose  = require('node:assert');               // VM-realm objects: compare structure, not prototypes
const { engine, place, atOnce, endOfTurn } = require('./support/engine-vm');

const ID = { DRAINAGE: 91, PASHUPATI: 92, BEAST: 93, COTTON: 94, FARMER: 98, PRIEST: 100, STUPA: 103,
             MISSIONARY: 105, UPANISHADS: 106, BRAHMIN: 107, KSHATRIYA: 108, SHUDRA: 109, DALIT: 110,
             VAISHYA_FARMER: 112, CASTE: 113, SANSKRIT: 114, GUPTA: 115, NUMBER_ZERO: 117, VEDAS: 120 };
const CITIZENS = 1, JUVENAL = 18, KNIGHT = 11, SAMURAI = 12, HUNTER = 27, VOLTAIRE = 20, PRIESTS = 6,
      COSIMO = 19, ERASMUS = 9, JOAN = 14;

/* Guard: the id map above must name the cards it claims to (ids are CSV order). */
test('the India id map matches js/cards.js', () => {
  const { CARDS } = engine();
  const want = { DRAINAGE: 'Drainage System', PASHUPATI: 'Lord of the Beasts', BEAST: 'Beast', COTTON: 'Cotton', FARMER: 'Farmer',
                 PRIEST: 'Priest', STUPA: 'Stupa', MISSIONARY: 'Missionary', UPANISHADS: 'Upanishads', BRAHMIN: 'Brahmin',
                 KSHATRIYA: 'Kshatriya', SHUDRA: 'Shudra', DALIT: 'Dalit', VAISHYA_FARMER: 'Vaishya', CASTE: 'Caste System',
                 SANSKRIT: 'Sanskrit', GUPTA: 'The Gupta', NUMBER_ZERO: 'Number Zero', VEDAS: 'Vedas' };
  for (const [k, name] of Object.entries(want)) assert.equal(CARDS.find((c) => c.id === ID[k]).name, name, k);
  assert.equal(CARDS.find((c) => c.id === ID.VAISHYA_FARMER).type, 'Labor');
});

/* ── clearDamage ────────────────────────────────────────────────────────── */
test('clearDamage removes permanent negatives (not adjusts), returns the total, and fixes the popup records', () => {
  const { G, board, CARDS } = engine();
  const sd = place(G, 'player', 101, VOLTAIRE, CARDS);            // 5
  board.addIPMod(sd, -2, JUVENAL);
  board.addIPMod(sd, +1, COSIMO);
  board.addIPMod(sd, -1, SAMURAI);
  board.adjustIPToward(sd, 2, CITIZENS);                           // -1, adjust — must survive
  assert.equal(board.effectiveIP(sd), 2);
  assert.equal(board.damageOn(sd), 3);
  assert.equal(board.clearDamage(sd), 3);
  assert.equal(board.effectiveIP(sd), 5);
  assert.equal(board.damageOn(sd), 0);
  loose.deepEqual(sd.ipModSources.map((e) => [e.delta, e.kind || null]), [[1, null], [-1, 'adjust']]);
  loose.deepEqual(sd.bonuses.map((b) => [b.amount, b.kind || null]), [[1, null], [-1, 'adjust']]);
  assert.equal(board.clearDamage(sd), 0, 'nothing left to clear');
});

test('clearDamage never touches continuous damage, so a repeatable heal cannot farm IP off a standing aura', () => {
  const { G, board, abilities, CARDS } = engine();
  place(G, 'player', 101, ID.DALIT, CARDS);                        // -1 to every OTHER card here, continuous
  const victim = place(G, 'player', 101, KNIGHT, CARDS);           // 1 IP
  const drain  = place(G, 'player', 101, ID.DRAINAGE, CARDS);      // 3 IP
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(victim), 0);
  assert.equal(board.damageOn(victim), 1, 'the aura counts as damage');
  for (let i = 0; i < 3; i++) {
    assert.equal(board.clearDamage(victim), 0, 'continuous damage is not clearable');
    atOnce(abilities, ID.DRAINAGE, 'player', 101, 2, drain);
    abilities.evaluateContinuous();
  }
  assert.equal(board.effectiveIP(drain), 3 - 1, 'Drainage gained nothing from the aura (and takes the Dalit -1 itself)');
  assert.equal(board.effectiveIP(victim), 0, 'the aura still stands');
});

/* ── Drainage System ────────────────────────────────────────────────────── */
test('Drainage System clears permanent damage on own cards here and gains that much', () => {
  const { G, board, abilities, CARDS } = engine();
  const a = place(G, 'player', 101, KNIGHT, CARDS); board.addIPMod(a, -2, JUVENAL);
  const b = place(G, 'player', 101, VOLTAIRE, CARDS); board.addIPMod(b, -1, JUVENAL);
  const elsewhere = place(G, 'player', 102, COSIMO, CARDS); board.addIPMod(elsewhere, -3, JUVENAL);
  const theirs = place(G, 'ai', 101, SAMURAI, CARDS); board.addIPMod(theirs, -2, JUVENAL);
  const drain = place(G, 'player', 101, ID.DRAINAGE, CARDS);
  assert.equal(atOnce(abilities, ID.DRAINAGE, 'player', 101, 2, drain), true);
  assert.equal(board.effectiveIP(a), 1); assert.equal(board.effectiveIP(b), 5);
  assert.equal(board.effectiveIP(drain), 3 + 3, 'gained the 3 cleared');
  assert.equal(board.effectiveIP(elsewhere), 4 - 3, 'other locations untouched');
  assert.equal(board.effectiveIP(theirs), 2 - 2, 'opponent untouched');
  const again = place(G, 'player', 101, ID.DRAINAGE, CARDS);
  atOnce(abilities, ID.DRAINAGE, 'player', 101, 3, again);
  assert.equal(board.effectiveIP(again), 3, 'nothing left to clear → no gain');
});

/* ── Cotton ─────────────────────────────────────────────────────────────── */
test('Cotton gives +2 to the owner\'s Labor cards here only', () => {
  const { G, board, abilities, CARDS } = engine();
  const labor = place(G, 'player', 101, ID.SHUDRA, CARDS);         // Labor 0
  const notLabor = place(G, 'player', 101, KNIGHT, CARDS);
  const theirLabor = place(G, 'ai', 101, ID.DALIT, CARDS);         // Labor, opponent
  const cotton = place(G, 'player', 101, ID.COTTON, CARDS);
  atOnce(abilities, ID.COTTON, 'player', 101, 3, cotton);
  assert.equal(labor.ipMod, 2); assert.equal(notLabor.ipMod, 0); assert.equal(theirLabor.ipMod, 0);
  assert.equal(labor.ipModSources[0].id, ID.COTTON, 'attributed to Cotton');
});

/* ── Farmer / Vaishya (Farmer) ──────────────────────────────────────────── */
test('Farmer and Vaishya (Farmer) stamp the top card of the deck, as separate sources', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerDeck = [KNIGHT, VOLTAIRE];
  const farmer = place(G, 'player', 101, ID.FARMER, CARDS);
  atOnce(abilities, ID.FARMER, 'player', 101, 0, farmer);
  const vf = place(G, 'player', 102, ID.VAISHYA_FARMER, CARDS);
  atOnce(abilities, ID.VAISHYA_FARMER, 'player', 102, 0, vf);
  loose.deepEqual(G.playerDeck, [KNIGHT, VOLTAIRE], 'deck untouched');
  assert.equal(G.cardIPBonus[KNIGHT], 5, '3 + 2 waiting on the Knight');
  loose.deepEqual(G.cardIPBonusSource.player[KNIGHT].map((e) => [e.id, e.delta]), [[ID.FARMER, 3], [ID.VAISHYA_FARMER, 2]]);
  // The stamp lands when the Knight is played.
  const played = { cardId: KNIGHT, ip: 1, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [] };
  board.applyPrePlayBonuses(played, 'player', KNIGHT, {});
  assert.equal(board.effectiveIP(played), 6);
  assert.equal(G.cardIPBonus[KNIGHT], 0, 'consumed');
  // Empty deck → fizzle.
  G.aiDeck = [];
  const f2 = place(G, 'ai', 101, ID.FARMER, CARDS);
  assert.equal(atOnce(abilities, ID.FARMER, 'ai', 101, 0, f2), true);
  loose.deepEqual(Object.keys(G.aiCardIPBonus), []);
});

/* ── Priest ─────────────────────────────────────────────────────────────── */
test('Priest gains +1 per card in hand (the transfer\'s cost side is covered in india-abilities-2)', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerHand = [KNIGHT, VOLTAIRE, COSIMO, JOAN];
  const priest = place(G, 'player', 101, ID.PRIEST, CARDS);       // 0 IP
  atOnce(abilities, ID.PRIEST, 'player', 101, 0, priest);
  assert.equal(board.effectiveIP(priest), 4);
  assert.equal(G.cardIPBonus[KNIGHT], -1, 'each hand card paid 1');
  G.aiHand = [];
  const p2 = place(G, 'ai', 101, ID.PRIEST, CARDS);
  atOnce(abilities, ID.PRIEST, 'ai', 101, 0, p2);
  assert.equal(board.effectiveIP(p2), 0);
});

/* ── Kshatriya ──────────────────────────────────────────────────────────── */
test('Kshatriya destroys the strongest opponent card here with less IP, and nothing when none qualifies', () => {
  const { G, board, abilities, CARDS } = engine();
  const weak = place(G, 'ai', 101, CITIZENS, CARDS);               // 1
  const mid  = place(G, 'ai', 101, HUNTER, CARDS);                 // 2 (a card that stays dead — not the self-reviving Samurai)
  const big  = place(G, 'ai', 101, VOLTAIRE, CARDS);               // 5
  const k = place(G, 'player', 101, ID.KSHATRIYA, CARDS);         // 3
  atOnce(abilities, ID.KSHATRIYA, 'player', 101, 0, k);
  const left = G.aiSlots[101].filter(Boolean).map((s) => s.cardId);
  loose.deepEqual(left.sort(), [CITIZENS, VOLTAIRE].sort(), 'the 2-IP Hunter (strongest below 3) is gone; Voltaire stays');
  assert.equal(G.aiDestroyed.length, 1); assert.equal(G.aiDestroyed[0].cardId, HUNTER);
  const k2 = place(G, 'player', 102, ID.KSHATRIYA, CARDS);
  place(G, 'ai', 102, VOLTAIRE, CARDS);
  atOnce(abilities, ID.KSHATRIYA, 'player', 102, 0, k2);
  assert.equal(G.aiSlots[102].filter(Boolean).length, 1, 'nothing weaker here → no destroy');
});

/* ── Vedas ──────────────────────────────────────────────────────────────── */
test('Vedas gives -1 CC to the Religious cards in hand, through the cost the engine charges', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerHand = [PRIESTS, ERASMUS, KNIGHT, PRIESTS];              // Religious ×2 ids (one twice), one Military
  const vedas = place(G, 'player', 101, ID.VEDAS, CARDS);
  const priests = CARDS.find((c) => c.id === PRIESTS), knight = CARDS.find((c) => c.id === KNIGHT);
  const before = board.effectiveCost(priests, 101, 'player');
  atOnce(abilities, ID.VEDAS, 'player', 101, 0, vedas);
  assert.equal(board.effectiveCost(priests, 101, 'player'), before - 1);
  assert.equal(board.effectiveCost(CARDS.find((c) => c.id === ERASMUS), 101, 'player'), 4 - 1);
  assert.equal(board.effectiveCost(knight, 101, 'player'), 1, 'non-Religious untouched');
  assert.equal(board.effectiveCost(priests, 101, 'ai'), 1, 'opponent untouched');
  assert.equal(G.kushCCDiscount.player[PRIESTS], 1, 'a duplicate id in hand is stamped once');
});

/* ── Upanishads ─────────────────────────────────────────────────────────── */
test('Upanishads returns a random own card from discard or destroyed, here, revealing again with its At Once', () => {
  const { G, board, abilities, CARDS } = engine();
  G.playerDiscard = [{ cardId: ID.COTTON, ip: 1, cc: 1 }];       // Cotton: its At Once buffs Labor here
  const labor = place(G, 'player', 101, ID.SHUDRA, CARDS);
  const up = place(G, 'player', 101, ID.UPANISHADS, CARDS);
  assert.equal(atOnce(abilities, ID.UPANISHADS, 'player', 101, 1, up), true);
  const ids = G.playerSlots[101].filter(Boolean).map((s) => s.cardId);
  loose.deepEqual(ids, [ID.SHUDRA, ID.UPANISHADS, ID.COTTON]);
  assert.equal(G.playerDiscard.length, 0, 'pile entry consumed');
  assert.equal(labor.ipMod, 2, 'the returned Cotton fired its At Once again');
  // Destroyed pile works too; opponent's piles are never touched; no candidate → fizzle.
  G.aiDestroyed = [{ cardId: KNIGHT, ip: 1, cc: 1 }];
  const up2 = place(G, 'player', 102, ID.UPANISHADS, CARDS);
  atOnce(abilities, ID.UPANISHADS, 'player', 102, 0, up2);
  assert.equal(G.playerSlots[102].filter(Boolean).length, 1, 'nothing of the player\'s to return');
  assert.equal(G.aiDestroyed.length, 1);
  G.playerDestroyed = [{ cardId: KNIGHT, ip: 1, cc: 1 }];
  const up3 = place(G, 'player', 103, ID.UPANISHADS, CARDS);
  atOnce(abilities, ID.UPANISHADS, 'player', 103, 0, up3);
  assert.equal(G.playerSlots[103].filter(Boolean).map((s) => s.cardId).includes(KNIGHT), true);
  assert.equal(G.playerDestroyed.length, 0);
});

/* ── End of turn: Stupa / Number Zero / The Gupta ───────────────────────── */
test('Stupa: +1 to the owner\'s OTHER Religious cards here at end of turn', () => {
  const { G, board, abilities, CARDS } = engine();
  const stupa = place(G, 'player', 101, ID.STUPA, CARDS);
  const rel = place(G, 'player', 101, PRIESTS, CARDS);
  const notRel = place(G, 'player', 101, KNIGHT, CARDS);
  const theirRel = place(G, 'ai', 101, PRIESTS, CARDS);
  endOfTurn(abilities, ID.STUPA, 'player', 101, 0, stupa);
  assert.equal(rel.ipMod, 1); assert.equal(stupa.ipMod, 0); assert.equal(notRel.ipMod, 0); assert.equal(theirRel.ipMod, 0);
});
test('Number Zero: +1 to the owner\'s OTHER Scientific cards here at end of turn', () => {
  const { G, abilities, CARDS } = engine();
  const zero = place(G, 'player', 101, ID.NUMBER_ZERO, CARDS);
  const sci = place(G, 'player', 101, ID.DRAINAGE, CARDS);         // Scientific
  const cult = place(G, 'player', 101, ID.SANSKRIT, CARDS);        // Cultural
  endOfTurn(abilities, ID.NUMBER_ZERO, 'player', 101, 0, zero);
  assert.equal(sci.ipMod, 1); assert.equal(zero.ipMod, 0); assert.equal(cult.ipMod, 0);
});
test('The Gupta: +1 to each of the owner\'s Scientific and Cultural cards here at end of turn', () => {
  const { G, abilities, CARDS } = engine();
  const gupta = place(G, 'player', 101, ID.GUPTA, CARDS);
  const sci = place(G, 'player', 101, ID.DRAINAGE, CARDS);
  const cult = place(G, 'player', 101, ID.SANSKRIT, CARDS);
  const rel = place(G, 'player', 101, PRIESTS, CARDS);
  endOfTurn(abilities, ID.GUPTA, 'player', 101, 0, gupta);
  assert.equal(sci.ipMod, 1); assert.equal(cult.ipMod, 1); assert.equal(rel.ipMod, 0); assert.equal(gupta.ipMod, 0);
});

/* ── Continuous: Brahmin / Shudra / Dalit / Caste System ────────────────── */
test('Brahmin: +1 per other Religious or Political card its controller owns here', () => {
  const { G, board, abilities, CARDS } = engine();
  const b = place(G, 'player', 101, ID.BRAHMIN, CARDS);            // 4
  place(G, 'player', 101, PRIESTS, CARDS);                         // Religious, mine
  place(G, 'player', 101, CITIZENS, CARDS);                        // Political, mine
  place(G, 'ai', 101, CITIZENS, CARDS);                            // Political, opponent — no
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(b), 6);
  assert.equal(b.contModSources[0].source, 'Brahmin');
});
test('Shudra: a card its owner plays here gets a permanent +1 that survives a move; not an aura', () => {
  const { G, board, abilities, CARDS } = engine();
  const already = place(G, 'player', 101, COSIMO, CARDS);          // here before Shudra: nothing
  const s = place(G, 'player', 101, ID.SHUDRA, CARDS);             // 0
  const mine = place(G, 'player', 101, KNIGHT, CARDS);
  abilities.fireOnCardLandedHere('player', KNIGHT, 101, () => {}); // the Knight is PLAYED here
  const theirs = place(G, 'ai', 101, KNIGHT, CARDS);
  abilities.fireOnCardLandedHere('opp', KNIGHT, 101, () => {});    // the opponent's play: nothing
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(mine), 2); assert.equal(mine.ipModSources[0].id, ID.SHUDRA);
  assert.equal(board.effectiveIP(theirs), 1); assert.equal(board.effectiveIP(s), 0); assert.equal(board.effectiveIP(already), 4);
  // Permanent: the +1 goes with the card when it moves, and Shudra leaving changes nothing.
  G.playerSlots[101][G.playerSlots[101].indexOf(mine)] = null; G.playerSlots[103][0] = mine;
  G.playerSlots[101][G.playerSlots[101].indexOf(s)] = null;
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(mine), 2);
});
test('Dalit: -1 to every other card here, both sides, and that counts as damage', () => {
  const { G, board, abilities, CARDS } = engine();
  const d = place(G, 'player', 101, ID.DALIT, CARDS);
  const mine = place(G, 'player', 101, KNIGHT, CARDS);
  const theirs = place(G, 'ai', 101, JOAN, CARDS);                 // 4, no continuous ability of her own
  const far = place(G, 'ai', 102, KNIGHT, CARDS);
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(mine), 0); assert.equal(board.effectiveIP(theirs), 3); assert.equal(board.effectiveIP(d), 0);
  assert.equal(board.effectiveIP(far), 1);
  assert.equal(board.hasDamage(theirs), true);
});
test('Caste System: -1 to every card here costing 0, 1 or 2 CC, both sides', () => {
  const { G, board, abilities, CARDS } = engine();
  const c = place(G, 'player', 101, ID.CASTE, CARDS);              // cc 4 — not itself
  const cheap = place(G, 'player', 101, KNIGHT, CARDS);            // cc 1
  const theirCheap = place(G, 'ai', 101, SAMURAI, CARDS);          // cc 2
  const dear = place(G, 'ai', 101, VOLTAIRE, CARDS);               // cc 5
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(cheap), 0); assert.equal(board.effectiveIP(theirCheap), 1);
  assert.equal(board.effectiveIP(dear), 5); assert.equal(board.effectiveIP(c), 4);
});

/* ── Lord of the Beasts ─────────────────────────────────────────────────── */
test('Lord of the Beasts sends a Beast to another location; a re-trigger sends another; nowhere → fizzle', () => {
  const { G, abilities, CARDS } = engine();
  const lord = place(G, 'player', 101, ID.PASHUPATI, CARDS);
  G._testChoose = (kind, options) => options[0];                   // the controller's choice (see india-abilities-2 for the chooser)
  atOnce(abilities, ID.PASHUPATI, 'player', 101, 0, lord);
  const beasts = () => [102, 103].reduce((n, l) => n + G.playerSlots[l].filter((s) => s && s.cardId === ID.BEAST).length, 0);
  assert.equal(beasts(), 1);
  assert.equal(G.playerSlots[101].filter((s) => s && s.cardId === ID.BEAST).length, 0, 'never its own location');
  atOnce(abilities, ID.PASHUPATI, 'player', 101, 0, lord);
  assert.equal(beasts(), 2);
  [102, 103].forEach((l) => { while (G.playerSlots[l].includes(null)) place(G, 'player', l, KNIGHT, CARDS); });
  atOnce(abilities, ID.PASHUPATI, 'player', 101, 0, lord);
  assert.equal(beasts(), 2, 'no room elsewhere → fizzle');
  const beast = G.playerSlots[102].find((s) => s && s.cardId === ID.BEAST) || G.playerSlots[103].find((s) => s && s.cardId === ID.BEAST);
  assert.equal(beast.ip, 4); assert.equal(beast.cc, 3, '3 CC / 4 IP no matter what spawned it'); assert.equal(beast.revealed, true); assert.equal(beast.wasSpawned, true);
});

/* ── Missionary ─────────────────────────────────────────────────────────── */
test('Missionary: moves once (registry flag) and gives +1 to its controller\'s non-Religious cards where it arrives', () => {
  const { G, board, abilities, CARDS } = engine();
  const spec = abilities.CARD_ABILITIES[ID.MISSIONARY];
  assert.equal(spec.movesOncePerBattle, true);
  const m = place(G, 'player', 101, ID.MISSIONARY, CARDS);
  const mine = place(G, 'player', 102, KNIGHT, CARDS);
  const theirs = place(G, 'ai', 102, COSIMO, CARDS);
  const rel = place(G, 'ai', 102, PRIESTS, CARDS);
  // Simulate the move commit: relocate the record, then the pipeline's arrival hook.
  G.playerSlots[101][0] = null; G.playerSlots[102][G.playerSlots[102].indexOf(null)] = m;
  abilities.fireOnArrivedHere('player', 102, m);
  assert.equal(mine.ipMod, 1); assert.equal(theirs.ipMod, 0); assert.equal(rel.ipMod, 0); assert.equal(m.ipMod, 0);
  assert.equal(mine.ipModSources[0].id, ID.MISSIONARY);
  abilities.fireOnArrivedHere('player', 102, place(G, 'player', 103, KNIGHT, CARDS));   // a card with no arrival hook
  assert.equal(mine.ipMod, 1, 'no-op for other cards');
});

/* ── FIX 2: the Giant brain plans around the type gate ──────────────────── */
test('Giant brain never plans a play at a location whose type gate blocks that card', () => {
  const { G, abilities, ai, CARDS } = engine({ ai: true });
  const R = abilities.CARD_ABILITIES;
  R[PRIESTS] = { blocksPlayOfType: 'Military' };                   // stand-in Jain, on the player's side at 101
  try {
    place(G, 'player', 101, PRIESTS, CARDS);
    // Fill the AI's other two locations so 101 is the only open place; the Giant
    // must then hold its Military cards rather than commit them at 101.
    [102, 103].forEach((l) => { while (G.aiSlots[l].includes(null)) place(G, 'ai', l, KNIGHT, CARDS); });
    G.turn = 2; G.aiHand = [KNIGHT, SAMURAI, CITIZENS];
    const plays = ai.giantSelectPlaysFor('kush')({ hand: G.aiHand.slice(), capital: 5, turn: 2 });
    const military = plays.filter((p) => [KNIGHT, SAMURAI].includes(p.cardId));
    assert.equal(military.length, 0, 'no Military play planned at the gated location');
    assert.equal(plays.some((p) => p.cardId === CITIZENS && p.locId === 101), true, 'a Political card still goes there');
  } finally { delete R[PRIESTS]; }
});

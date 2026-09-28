'use strict';
/* India levels + the nine India locations, the Ashoka→Gupta rename, and the two
   gating updates. Real engine in a VM (test/support/engine-vm.js). */
const test   = require('node:test');
const assert = require('node:assert/strict');
const loose  = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { engine, place, ROOT } = require('./support/engine-vm');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CITIZENS = 1, PRIESTS = 6, KNIGHT = 11, JOAN = 14, JUVENAL = 18, COSIMO = 19, VOLTAIRE = 20, HUNTER = 27;
const LOC = { CITADEL: 171, LOWER_TOWN: 172, INDUS: 173, KAPILAVASTU: 174, BODH_GAYA: 175, GANGES: 176, NALANDA: 177, PATALIPUTRA: 178, PLAIN: 179 };

/* Load the data files the game loads, in a scratch VM. */
function data() {
  const window = {}; const ctx = { window, console };
  vm.runInNewContext(read('data/level-data.js'), ctx);
  vm.runInNewContext(read('data/map-data.js'), ctx);
  return { levels: window.SOG_LEVEL_DATA.levels, maps: window.SOG_MAP_DATA };
}
/* Put a real India location (by id, from level data) on the harness board. */
function withLocations(G, levelId, ids) {
  const { levels } = data();
  const locs = levels[levelId].locations.filter((l) => !ids || ids.includes(l.id)).map((l) => Object.assign({}, l));
  G.locations = locs;
  G.playerSlots = {}; G.aiSlots = {}; G.locationBoosts = {};
  locs.forEach((l) => { G.playerSlots[l.id] = [null, null, null, null]; G.aiSlots[l.id] = [null, null, null, null]; G.locationBoosts[l.id] = { player: [], opp: [] }; });
  return locs;
}

/* ── PART 1: the rename ─────────────────────────────────────────────────── */
test('Ashoka is gone from the map and the dev panel; the Gupta node, hook, milestone and india-complete flag replace it', () => {
  const { maps } = data();
  const india = maps.maps.india;
  const ids = india.nodes.map((n) => n.id);
  loose.deepEqual(ids, ['greatbath', 'india-market', 'siddhartha', 'gupta']);
  const gupta = india.nodes.find((n) => n.id === 'gupta');
  assert.equal(gupta.hook, 'gupta'); assert.equal(gupta.tiers, 2); assert.equal(gupta.showFrom, 'siddhartha-beaten');
  assert.equal(gupta.image, 'images/metaworld/civilization nodes/gupta.png');
  assert.ok(fs.existsSync(path.join(ROOT, gupta.image)), 'placeholder node art exists');
  const ms = Object.fromEntries(maps.milestones.map((m) => [m.id, m.flag]));
  assert.equal(ms['gupta-beaten'], 'sog_node_gupta_serf_beaten');
  assert.equal(ms['india-complete'], 'sog_node_gupta_giant_beaten');
  assert.equal(ms['ashoka-beaten'], undefined);
  const md = read('data/map-data.js');
  assert.doesNotMatch(md, /id:\s*'ashoka'|hook:\s*'ashoka'|'ashoka-beaten'|sog_node_ashoka/, 'no structural Ashoka references remain (the placeholder note may mention the old art file)');
  assert.match(read('js/sog-dev-panel.js'), /\['india',\s+'gupta'\]/);
  assert.doesNotMatch(read('js/sog-dev-panel.js'), /'ashoka'/);
});

/* ── PART 2: the level entries ──────────────────────────────────────────── */
test('greatbath, siddhartha and gupta are full level entries in Kush\'s shape, with the India decks and Giant-win cards', () => {
  const { levels } = data();
  const decksSrc = read('data/india-decks.js');
  const w = {}; vm.runInNewContext(decksSrc, { window: w, console });
  const D = w.SOG_INDIA_DECKS;
  const want = { greatbath: ['priest_king', 88], siddhartha: ['siddhartha', 101], gupta: ['gupta', 115] };
  for (const [lid, [deck, card]] of Object.entries(want)) {
    const L = levels[lid];
    assert.ok(L, lid + ' exists'); assert.equal(L.kind, 'battle'); assert.equal(L.tiers, 2);
    assert.equal(L.structure.turns, 5); assert.equal(L.resource.capital, 5); assert.equal(L.resource.model, 'capital');
    assert.equal(L.resource.capitalByTurn, undefined, 'flat capital');
    loose.deepEqual(L.decks.ai.ids, D[deck].ids); assert.equal(L.decks.player.source, 'active-deck');
    assert.equal(L.reward.cardIdOnGiantWin, card); loose.deepEqual(L.reward.gold, { serf: 20, giant: 30 });
    assert.equal(L.rulesPopup, undefined, 'no rules exception → no rules popup');
    assert.equal(L.locations.length, 3);
    for (const k of ['nodeIntro', 'opening', 'turn1', 'serfWinA', 'serfWinB', 'loss', 'tie', 'giantIntro', 'giantWinA', 'giantWinB', 'giantLoss', 'giantDraw']) loose.deepEqual(L.dialogue[k], [], lid + '.' + k);
    assert.ok(L.presentation.bodyClass === lid + '-battle');
    assert.ok(fs.existsSync(path.join(ROOT, L.presentation.opponentAvatar)), 'placeholder portrait exists: ' + L.presentation.opponentAvatar);
    L.locations.forEach((l) => {
      assert.ok(fs.existsSync(path.join(ROOT, l.image)), l.name + ' art exists');
      assert.match(l.image, /^images\/locations\/[a-z_]+\.jpeg$/, 'byte-exact lowercase jpeg');
    });
  }
  const allIds = ['greatbath', 'siddhartha', 'gupta'].flatMap((l) => levels[l].locations.map((x) => x.id));
  loose.deepEqual(allIds, [171, 172, 173, 174, 175, 176, 177, 178, 179]);
});

test('every India location key is a literal the map editor\'s validator can discover', () => {
  const { levels } = data();
  const src = ['js/game/abilities.js', 'js/game/board.js'].map(read).join('\n');
  const found = new Set(); const re = /abilityKey\s*[!=]==?\s*'([A-Z0-9_]+)'/g; let m;
  while ((m = re.exec(src))) found.add(m[1]);
  ['greatbath', 'siddhartha', 'gupta'].forEach((l) => levels[l].locations.forEach((x) => assert.ok(found.has(x.abilityKey), x.abilityKey)));
});

/* ── The Citadel ────────────────────────────────────────────────────────── */
test('The Citadel: permanent damage is refused, aura damage is stripped, the Buddha counts nothing there', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'greatbath', [LOC.CITADEL, LOC.LOWER_TOWN]);
  const safe = place(G, 'player', LOC.CITADEL, KNIGHT, CARDS);
  board.addIPMod(safe, -2, JUVENAL);
  assert.equal(board.effectiveIP(safe), 1, 'permanent negative refused');
  board.addIPMod(safe, +2, COSIMO);
  assert.equal(board.effectiveIP(safe), 3, 'gains still land');
  board.adjustIPToward(safe, 1, CITIZENS);
  assert.equal(board.effectiveIP(safe), 1, 'an adjust-to-value may still lower it (not damage)');
  place(G, 'player', LOC.CITADEL, 110, CARDS);                     // Dalit: -1 aura to every other card here
  place(G, 'player', LOC.LOWER_TOWN, 101, CARDS);                  // the Buddha, elsewhere
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(safe), 1, 'the aura\'s -1 is stripped');
  assert.equal(board.damageOn(safe), 0);
  const buddha = G.playerSlots[LOC.LOWER_TOWN][0];
  assert.equal(buddha.contMod, 1, 'Buddha gets only the Lower Town +1, no damage to count');
});

/* ── The Lower Town ─────────────────────────────────────────────────────── */
test('The Lower Town: +1 to each card here, both sides, continuous', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'greatbath', [LOC.LOWER_TOWN, LOC.CITADEL]);
  const a = place(G, 'player', LOC.LOWER_TOWN, KNIGHT, CARDS), b = place(G, 'ai', LOC.LOWER_TOWN, JOAN, CARDS);
  const far = place(G, 'ai', LOC.CITADEL, JOAN, CARDS);
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(a), 2); assert.equal(board.effectiveIP(b), 5); assert.equal(board.effectiveIP(far), 4);
  assert.equal(a.bonuses.find((x) => x.continuous).sourceType, 'location');
});

/* ── The Indus River ────────────────────────────────────────────────────── */
test('The Indus River: 50/50 start, flips every turn, wet +2 / dry -1 to cards played there, via the shared season module', () => {
  const { G, board, abilities, CARDS, ctx } = engine();
  const [indus] = withLocations(G, 'greatbath', [LOC.INDUS]);
  const seasons = [];
  ctx.SOG.flood = { setSeason: (id, on, opts) => seasons.push([id, on, opts && opts.suffix]), setFlooded() {}, clear() {} };
  const starts = new Set();
  for (let i = 0; i < 40; i++) { abilities.applySeasonalLocations(1); starts.add(indus.seasonWet); }
  loose.deepEqual([...starts].sort(), [false, true], 'turn 1 is a coin flip');
  abilities.applySeasonalLocations(1); const t1 = indus.seasonWet;
  abilities.applySeasonalLocations(2); assert.equal(indus.seasonWet, !t1, 'turn 2 flips');
  abilities.applySeasonalLocations(3); assert.equal(indus.seasonWet, t1, 'turn 3 flips back');
  assert.equal(seasons[seasons.length - 1][0], LOC.INDUS);
  assert.equal(seasons.filter((s) => s[1] === true).every((s) => s[2] === ' - Wet Season'), true);
  // Effects on a card played (revealed) there this turn.
  indus.seasonWet = true;
  const wet = place(G, 'player', LOC.INDUS, KNIGHT, CARDS);
  abilities.applyRiverAtOnce([{ owner: 'player', cardId: KNIGHT, locId: LOC.INDUS, slotIndex: 0 }]);
  assert.equal(board.effectiveIP(wet), 3);
  indus.seasonWet = false;
  const dry = place(G, 'ai', LOC.INDUS, JOAN, CARDS);
  abilities.applyRiverAtOnce([{ owner: 'opp', cardId: JOAN, locId: LOC.INDUS, slotIndex: 0 }]);
  assert.equal(board.effectiveIP(dry), 3); assert.equal(board.damageOn(dry), 1, 'the dry -1 is damage');
  abilities.applyRiverAtOnce([{ owner: 'opp', cardId: JOAN, locId: LOC.INDUS, slotIndex: 0 }]);
  assert.equal(board.effectiveIP(dry), 3, 'stamped once');
});

/* ── The Ganges Plain ───────────────────────────────────────────────────── */
test('The Ganges Plain: the monsoon is rolled at turn start, hidden until the reveal, +2 only while active, gone next turn', () => {
  const { G, board, abilities, CARDS, ctx, setRandom, resetRandom } = engine();
  const [plain] = withLocations(G, 'gupta', [LOC.PLAIN]);
  const shown = [];
  ctx.SOG.flood = { setSeason: (id, on, opts) => shown.push([on, opts && opts.suffix]), setFlooded() {}, clear() {} };
  setRandom(() => 0.1);                                             // the roll hits (the VM's own Math)
  abilities.applySeasonalLocations(1);
  assert.equal(plain.monsoonPending, true); assert.equal(plain.monsoonActive, false, 'hidden during selection');
  loose.deepEqual(shown, [[false, undefined]], 'nothing shown at turn start beyond clearing');
  const early = place(G, 'player', LOC.PLAIN, KNIGHT, CARDS);
  abilities.resolveHiddenSeasons();
  assert.equal(plain.monsoonActive, true); assert.equal(shown[shown.length - 1][1], ' - Monsoon');
  abilities.applyRiverAtOnce([{ owner: 'player', cardId: KNIGHT, locId: LOC.PLAIN, slotIndex: 0 }]);
  assert.equal(board.effectiveIP(early), 3, '+2 during a monsoon');
  setRandom(() => 0.9);                                             // the roll misses
  abilities.applySeasonalLocations(2);
  assert.equal(plain.monsoonActive, false); assert.equal(plain.monsoonPending, false);
  abilities.resolveHiddenSeasons();
  const dry = place(G, 'ai', LOC.PLAIN, JOAN, CARDS);
  abilities.applyRiverAtOnce([{ owner: 'opp', cardId: JOAN, locId: LOC.PLAIN, slotIndex: 0 }]);
  assert.equal(board.effectiveIP(dry), 4, 'a dry turn does nothing at all');
  resetRandom();
});

/* ── Kapilavastu / Bodh Gaya / The Ganges ───────────────────────────────── */
test('Kapilavastu: -1 to the highest card here (ties: most recent) and it moves to a random open location; no room → stays', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'siddhartha');
  const low = place(G, 'player', LOC.KAPILAVASTU, KNIGHT, CARDS, { playTime: 1 });
  const hiA = place(G, 'ai', LOC.KAPILAVASTU, JOAN, CARDS, { playTime: 2 });         // 4
  const hiB = place(G, 'player', LOC.KAPILAVASTU, COSIMO, CARDS, { playTime: 3 });   // 4, more recent → the pick
  let done = false; abilities.applyLocationEndOfTurn(() => { done = true; });
  assert.equal(done, true);
  assert.equal(board.effectiveIP(hiB), 3); assert.equal(hiB.ipModSources[0].type, 'location');
  assert.equal(board.effectiveIP(hiA), 4); assert.equal(board.effectiveIP(low), 1);
  assert.equal(G.playerSlots[LOC.KAPILAVASTU].includes(hiB), false, 'it left');
  assert.equal([LOC.BODH_GAYA, LOC.GANGES].some((l) => G.playerSlots[l].includes(hiB)), true, 'to another location on its side');
});

test('Kapilavastu no-room case, isolated: the -1 lands and the card stays', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'siddhartha');
  [LOC.BODH_GAYA, LOC.GANGES].forEach((l) => { while (G.playerSlots[l].includes(null)) place(G, 'player', l, HUNTER, CARDS); });
  const stuck = place(G, 'player', LOC.KAPILAVASTU, VOLTAIRE, CARDS, { playTime: 9 });
  abilities.applyLocationEndOfTurn(() => {});
  assert.equal(G.playerSlots[LOC.KAPILAVASTU].includes(stuck), true);
  assert.equal(stuck.ipModSources.filter((e) => e.delta === -1).length, 1);
});

test('Bodh Gaya: +1 to each card here at end of turn, permanent, travels with the card', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'siddhartha', [LOC.BODH_GAYA, LOC.GANGES]);
  const mine = place(G, 'player', LOC.BODH_GAYA, KNIGHT, CARDS), theirs = place(G, 'ai', LOC.BODH_GAYA, JOAN, CARDS);
  abilities.applyLocationEndOfTurn(() => {});
  assert.equal(mine.ipMod, 1); assert.equal(theirs.ipMod, 1);
  G.playerSlots[LOC.BODH_GAYA][0] = null; G.playerSlots[LOC.GANGES][0] = mine;
  abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(mine), 2, 'the +1 moved with it (a real modifier, not a location bonus)');
});

test('The Ganges: +1 to the lowest-IP card here at end of turn; ties go to the earliest played', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'siddhartha', [LOC.GANGES]);
  const a = place(G, 'ai', LOC.GANGES, KNIGHT, CARDS, { playTime: 5 });          // 1, later
  const b = place(G, 'player', LOC.GANGES, CITIZENS, CARDS, { playTime: 2 });    // 1, earliest → the pick
  const c = place(G, 'player', LOC.GANGES, JOAN, CARDS, { playTime: 1 });        // 4
  abilities.applyLocationEndOfTurn(() => {});
  assert.equal(board.effectiveIP(b), 2); assert.equal(board.effectiveIP(a), 1); assert.equal(board.effectiveIP(c), 4);
});

/* ── Nalanda / Pataliputra ──────────────────────────────────────────────── */
test('Nalanda: a card played here draws its owner a Scientific card; fizzles when none remain', () => {
  const { G, abilities, CARDS } = engine();
  withLocations(G, 'gupta', [LOC.NALANDA]);
  G.playerDeck = [KNIGHT, 91, 118];                                 // Drainage System and Inoculation are Scientific
  place(G, 'player', LOC.NALANDA, KNIGHT, CARDS);
  abilities.applyRiverAtOnce([{ owner: 'player', cardId: KNIGHT, locId: LOC.NALANDA, slotIndex: 0 }]);
  loose.deepEqual(G.playerHand, [91]); loose.deepEqual(G.playerDeck, [KNIGHT, 118]);
  abilities.applyRiverAtOnce([{ owner: 'player', cardId: KNIGHT, locId: LOC.NALANDA, slotIndex: 0 }]);
  loose.deepEqual(G.playerHand, [91], 'once per play');
  G.aiDeck = [KNIGHT];
  place(G, 'ai', LOC.NALANDA, JOAN, CARDS);
  abilities.applyRiverAtOnce([{ owner: 'opp', cardId: JOAN, locId: LOC.NALANDA, slotIndex: 0 }]);
  loose.deepEqual(G.aiHand, [], 'no Scientific card → fizzle');
});

test('Pataliputra: every permanent gain here gets +1 more, attributed to the location, and it never echoes itself', () => {
  const { G, board, abilities, CARDS } = engine();
  withLocations(G, 'gupta', [LOC.PATALIPUTRA, LOC.NALANDA]);
  const sd = place(G, 'player', LOC.PATALIPUTRA, KNIGHT, CARDS);
  board.addIPMod(sd, 2, COSIMO);
  assert.equal(board.effectiveIP(sd), 1 + 2 + 1);
  loose.deepEqual(sd.ipModSources.map((e) => [e.delta, e.kind || null, e.type]), [[2, null, 'card'], [1, 'echo', 'location']]);
  board.addIPMod(sd, -1, JUVENAL);
  assert.equal(board.effectiveIP(sd), 3, 'a loss is not a gain');
  board.adjustIPToward(sd, 5, CITIZENS);
  assert.equal(board.effectiveIP(sd), 5, 'an adjustment is not echoed (it would overshoot)');
  const far = place(G, 'player', LOC.NALANDA, KNIGHT, CARDS);
  board.addIPMod(far, 2, COSIMO);
  assert.equal(board.effectiveIP(far), 3, 'other locations untouched');
  // A stamp folded in at play is a gain here too — exactly one echo.
  board.stampHandBonus('player', JOAN, 3, COSIMO);
  const played = { cardId: JOAN, ip: 4, ipMod: 0, ipModSources: [], contMod: 0, contModSources: [], bonuses: [], revealed: true };
  G.playerSlots[LOC.PATALIPUTRA][1] = played;
  board.applyPrePlayBonuses(played, 'player', JOAN, {});
  assert.equal(board.effectiveIP(played), 4 + 3 + 1);
  assert.equal(played.ipModSources.filter((e) => e.kind === 'echo').length, 1);
  // Continuous gains do not echo (they are rebuilt every pass and would compound).
  place(G, 'player', LOC.PATALIPUTRA, 109, CARDS);                 // a Shudra is a reactor now, not an aura; use Brahmin instead
  const brahmin = place(G, 'ai', LOC.PATALIPUTRA, 107, CARDS);
  place(G, 'ai', LOC.PATALIPUTRA, PRIESTS, CARDS);
  abilities.evaluateContinuous(); abilities.evaluateContinuous();
  assert.equal(board.effectiveIP(brahmin), 4 + 1, 'aura +1 only, no echo, no compounding');
});

/* ── PART 3: gating ─────────────────────────────────────────────────────── */
test('the history cards now need all twelve Giants, India included; the end-of-content beat keys on the Gupta', () => {
  const src = read('js/sog-collection.js');
  const m = src.match(/ADVENTURE_GIANT_HOOKS = \[([^\]]+)\]/);
  const hooks = m[1].match(/'([a-z-]+)'/g).map((s) => s.replace(/'/g, ''));
  loose.deepEqual(hooks, ['gilgamesh', 'sargon', 'hammurabi', 'hanging-gardens', 'narmer', 'hatshepsut', 'ramses', 'akhenaten', 'kush', 'greatbath', 'siddhartha', 'gupta']);
  assert.match(read('js/overworld.js'), /END_OF_CONTENT\s*=\s*\{ hook: 'gupta', tier: 'giant' \}/);
});

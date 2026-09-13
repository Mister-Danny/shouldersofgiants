'use strict';

// Play log (logVersion 1) in js/analytics.js: battle id + tier at start, hand per
// turn, both action logs before the reveal, the final board at the end, and the
// same fields through the abandoned-session flush (owner uid only).
//
// Loads the real analytics.js into a vm context with a recording Firestore stub —
// no emulator, no network. Every write is checked for undefined values (Firestore
// rejects them) and the merged document is sized with Firestore's storage rules.
//
// Run via `node --test test/analytics-play-log.test.js`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { documentSize } = require('./support/firestore-doc-size');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/analytics.js'), 'utf8');

function findUndefined(v, at = '$') {
  if (v === undefined) return at;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const p = findUndefined(v[i], `${at}[${i}]`); if (p) return p; }
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { const p = findUndefined(x, `${at}.${k}`); if (p) return p; }
  }
  return null;
}

// Fresh module instance. `storage` can be shared to simulate a page reload.
function load({ storage = new Map(), uid = 'studentZ' } = {}) {
  const writes = [];
  const listeners = {};
  const SERVER_TS = { __serverTimestamp: true };
  const firestore = {
    collection: (c) => ({
      doc: (id) => ({
        set(data, opts) {
          const bad = findUndefined(data);
          if (bad) throw new Error(`undefined value written at ${bad}`);
          writes.push({ path: `${c}/${id}`, merge: !!(opts && opts.merge), data: JSON.parse(JSON.stringify(data)) });
          return Promise.resolve();
        },
      }),
    }),
  };
  const firebase = {
    initializeApp() {},
    firestore: Object.assign(() => firestore, { FieldValue: { serverTimestamp: () => SERVER_TS } }),
  };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const window = {
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    SogAuth: { ready: (cb) => cb(), getUser: () => ({ uid }) },
  };
  const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
  const ctx = vm.createContext({ window, localStorage, document, firebase, console });
  vm.runInContext(SRC, ctx, { filename: 'js/analytics.js' });
  return { Analytics: window.Analytics, writes, storage, unload: () => listeners.beforeunload() };
}

// Apply writes the way Firestore does for these docs (top-level fields replaced).
function merged(writes, docPath) {
  return writes.filter((w) => w.path === docPath).reduce((doc, w) => (w.merge ? { ...doc, ...w.data } : { ...w.data }), {});
}

const LOCATIONS = [
  { id: 8, name: 'Cedar Forest', region: 'Mesopotamia', abilityText: '' },
  { id: 7, name: 'Uruk' },
  { id: 2, name: 'Mount Mashu' },
];

function board() {
  return [
    { locId: 8, name: 'Cedar Forest', player: [{ slot: 0, cardId: 27, ip: 2, revealed: true }, { slot: 1, cardId: 46, ip: 1, revealed: true }], ai: [{ slot: 0, cardId: 43, ip: 6, revealed: true }] },
    { locId: 7, name: 'Uruk', player: [{ slot: 0, cardId: 33, ip: 5, revealed: true }], ai: [] },
    { locId: 2, name: 'Mount Mashu', player: [], ai: [{ slot: 0, cardId: 44, ip: 2, revealed: false }] },
  ];
}

test('battle start records battleId, tier, locations and the turn-1 hand on the create', () => {
  const { Analytics, writes } = load();
  Analytics.gameStarted('easy', { battleId: 'gilgamesh', tier: 'giant', locations: LOCATIONS, hand: [26, 27, 46, 33] });

  assert.equal(writes.length, 1);
  const w = writes[0];
  assert.equal(w.merge, false);
  assert.equal(w.data.uid, 'studentZ');
  assert.equal(w.data.logVersion, 1);
  assert.equal(w.data.battleId, 'gilgamesh');
  assert.equal(w.data.tier, 'giant');
  // Only id + name are kept from location objects.
  assert.deepEqual(w.data.locations, [{ id: 8, name: 'Cedar Forest' }, { id: 7, name: 'Uruk' }, { id: 2, name: 'Mount Mashu' }]);
  assert.deepEqual(w.data.turns, [{ turn: 1, hand: [26, 27, 46, 33], playerFirst: null, player: [], ai: [] }]);
});

test('turn actions normalize both logs in play order and write before the reveal', () => {
  const { Analytics, writes } = load();
  Analytics.gameStarted('easy', { battleId: 'gilgamesh', tier: 'serf', locations: LOCATIONS, hand: [26, 27, 46, 33] });
  Analytics.turnActions(1,
    [
      { type: 'play', cardId: 27, toLocId: 8, slotIndex: 0 },
      { type: 'move', cardId: 33, fromLocId: 7, fromSlotIndex: 0, toLocId: 8 },
    ],
    [{ type: 'play', cardId: 43, locId: 8, slotIndex: 0 }],
    false);

  const last = writes.at(-1);
  assert.equal(last.merge, true);
  assert.deepEqual(Object.keys(last.data), ['turns']);
  assert.deepEqual(last.data.turns[0], {
    turn: 1, hand: [26, 27, 46, 33], playerFirst: false,
    player: [
      { i: 0, type: 'play', cardId: 27, locId: 8, slot: 0 },
      { i: 1, type: 'move', cardId: 33, fromLocId: 7, fromSlot: 0, toLocId: 8 },
    ],
    ai: [{ i: 0, type: 'play', cardId: 43, locId: 8, slot: 0 }],
  });
});

test('each turn start records the hand; battle end writes turns and the final board in slot order', () => {
  const { Analytics, writes } = load();
  Analytics.setBoardProvider(board);
  Analytics.gameStarted('easy', { battleId: 'gilgamesh', tier: 'giant', locations: LOCATIONS, hand: [26, 27, 46, 33] });
  for (let t = 1; t <= 4; t++) {
    if (t > 1) Analytics.turnStarted(t, [26, 33, 46, 30 + t]);
    Analytics.turnActions(t, [{ type: 'play', cardId: 26, toLocId: 8, slotIndex: t - 1 }], [{ type: 'play', cardId: 40 + t, locId: 7, slotIndex: t - 1 }], t % 2 === 0);
    Analytics.turnEnded(t);
  }
  Analytics.gameCompleted({ outcome: 'ai', tiebreaker: false, playerTotal: 0, aiTotal: 0,
    locResults: LOCATIONS.map((loc) => ({ loc, playerIP: 3, aiIP: 4, winner: 'ai' })) });

  const end = writes.at(-1);
  assert.equal(end.data.completed, true);
  assert.deepEqual(end.data.turns.map((t) => t.turn), [1, 2, 3, 4]);
  assert.deepEqual(end.data.turns.map((t) => t.hand), [[26, 27, 46, 33], [26, 33, 46, 32], [26, 33, 46, 33], [26, 33, 46, 34]]);
  assert.deepEqual(end.data.board, board());
  assert.equal(end.data.turnDurations.length, 4);
});

test('malformed inputs never write undefined, NaN or non-scalar values', () => {
  const { Analytics, writes } = load();
  Analytics.setBoardProvider(() => [{ locId: undefined, player: [{ cardId: NaN, slot: '1', ip: {} }], ai: 'nope' }, null]);
  Analytics.gameStarted('easy', { battleId: undefined, tier: 7, locations: [null, { id: {}, name: undefined }], hand: [26, '27', null, NaN, 33] });
  Analytics.turnStarted(2, 'not a hand');
  Analytics.turnActions(2, [undefined, { type: 'play' }, { type: 'barter', cardId: 68 }, 5], null, 'yes');
  Analytics.gameCompleted({ outcome: 'player', locResults: [] });

  // load()'s stub throws on any undefined; also check the coerced values.
  const doc = merged(writes, writes[0].path);
  assert.equal(doc.battleId, null);
  assert.equal(doc.tier, 7);
  assert.deepEqual(doc.locations, [{ id: null, name: null }, { id: null, name: null }]);
  assert.deepEqual(doc.turns[0].hand, [26, 33]);
  assert.deepEqual(doc.turns[1], {
    turn: 2, hand: [], playerFirst: null,
    player: [{ i: 0, type: 'play', cardId: null, locId: null, slot: null }, { i: 1, type: 'barter', cardId: 68, partnerCardId: null }],
    ai: [],
  });
  assert.deepEqual(doc.board[0], { locId: null, name: null, player: [{ slot: '1', cardId: null, ip: null, revealed: false }], ai: [] });
  assert.deepEqual(doc.board[1], { locId: null, name: null, player: [], ai: [] });
});

test('older call signatures still work (no battle info, no turn args)', () => {
  const { Analytics, writes } = load();
  Analytics.gameStarted('hard');
  Analytics.turnEnded(1);
  Analytics.turnStarted();
  Analytics.gameCompleted({ outcome: 'player', locResults: [] });
  const doc = merged(writes, writes[0].path);
  assert.equal(doc.battleId, null);
  assert.equal(doc.tier, null);
  assert.deepEqual(doc.turns, [{ turn: 1, hand: [], playerFirst: null, player: [], ai: [] }]);
  assert.equal(doc.board, null);
});

test('abandoned session: page close saves the play log, the next battle flushes the same fields', () => {
  const storage = new Map();
  const first = load({ storage });
  first.Analytics.setBoardProvider(board);
  first.Analytics.gameStarted('easy', { battleId: 'otzi', tier: null, locations: LOCATIONS, hand: [26, 27, 28, 29] });
  first.Analytics.turnActions(1, [{ type: 'play', cardId: 27, toLocId: 8, slotIndex: 2 }, { type: 'move', cardId: 33, fromLocId: 7, fromSlotIndex: 1, toLocId: 8 }], [{ type: 'play', cardId: 35, locId: 7, slotIndex: 3 }], true);
  first.Analytics.turnEnded(1);
  first.Analytics.turnStarted(2, [26, 28, 29, 31]);
  first.unload();
  const abandonedId = first.writes[0].path;

  // Page reload: a new module instance sharing localStorage starts the next battle.
  const second = load({ storage });
  second.Analytics.gameStarted('easy', { battleId: 'otzi', locations: LOCATIONS, hand: [] });
  const flush = second.writes[0];
  assert.equal(flush.path, abandonedId);
  assert.equal(flush.merge, true);
  assert.equal(flush.data.uid, 'studentZ');
  assert.equal(flush.data.completed, false);
  assert.equal(flush.data.outcome, 'abandoned');
  assert.deepEqual(flush.data.turnDurations.length, 1);
  assert.equal(flush.data.logVersion, 1);
  assert.equal(flush.data.battleId, 'otzi');
  assert.equal(flush.data.tier, null);
  assert.deepEqual(flush.data.locations, [{ id: 8, name: 'Cedar Forest' }, { id: 7, name: 'Uruk' }, { id: 2, name: 'Mount Mashu' }]);
  assert.deepEqual(flush.data.turns, [
    { turn: 1, hand: [26, 27, 28, 29], playerFirst: true,
      player: [{ i: 0, type: 'play', cardId: 27, locId: 8, slot: 2 }, { i: 1, type: 'move', cardId: 33, fromLocId: 7, fromSlot: 1, toLocId: 8 }],
      ai: [{ i: 0, type: 'play', cardId: 35, locId: 7, slot: 3 }] },
    { turn: 2, hand: [26, 28, 29, 31], playerFirst: null, player: [], ai: [] },
  ]);
  assert.deepEqual(flush.data.board, board());
  assert.equal(second.writes[1].merge, false);   // then the new session's create
  assert.equal(storage.has('sog_abandoned_session'), false);
});

test('abandoned record left by a different uid (shared device) is dropped, not written', () => {
  const storage = new Map();
  const first = load({ storage, uid: 'studentA' });
  first.Analytics.gameStarted('easy', { battleId: 'otzi', locations: LOCATIONS, hand: [26] });
  first.unload();

  const second = load({ storage, uid: 'studentB' });
  second.Analytics.gameStarted('easy', { battleId: 'gilgamesh', tier: 'serf', locations: LOCATIONS, hand: [26] });
  assert.deepEqual(second.writes.map((w) => w.merge), [false]);   // only studentB's own create
  assert.equal(second.writes[0].data.uid, 'studentB');
  assert.equal(storage.has('sog_abandoned_session'), false);
  // Analytics still works for studentB afterwards.
  second.Analytics.turnActions(1, [], [], true);
  assert.equal(second.writes.length, 2);
});

test('abandoned record from an older build (no uid) is dropped', () => {
  const storage = new Map([['sog_abandoned_session', JSON.stringify({ sessionId: 'old-1', turnDurations: [9, 4], abandonedAt: '2026-09-01T00:00:00.000Z' })]]);
  const { Analytics, writes } = load({ storage });
  Analytics.gameStarted('easy', { battleId: 'otzi', locations: LOCATIONS, hand: [] });
  assert.deepEqual(writes.map((w) => w.merge), [false]);
  assert.equal(storage.has('sog_abandoned_session'), false);
});

test('a battle that finishes normally leaves no abandoned record', () => {
  const storage = new Map();
  const first = load({ storage });
  first.Analytics.gameStarted('easy', { battleId: 'otzi', locations: LOCATIONS, hand: [26] });
  first.Analytics.gameCompleted({ outcome: 'player', locResults: [] });
  first.unload();   // page closed after the result screen
  assert.equal(storage.has('sog_abandoned_session'), false);

  const second = load({ storage });
  second.Analytics.gameStarted('easy', { battleId: 'otzi', locations: LOCATIONS, hand: [] });
  assert.deepEqual(second.writes.map((w) => w.merge), [false]);
});

test('document size stays small for a typical and a worst-case battle', () => {
  const size = ({ turns, handSize, actionsPerSide, locs, cardsPerSide, nameLen }) => {
    const { Analytics, writes } = load();
    const locations = Array.from({ length: locs }, (_, i) => ({ id: 100 + i, name: `L${i}`.padEnd(nameLen, 'x') }));
    Analytics.setBoardProvider(() => locations.map((l) => ({
      locId: l.id, name: l.name,
      player: Array.from({ length: cardsPerSide }, (_, s) => ({ slot: s, cardId: 50 + s, ip: 12, revealed: true })),
      ai: Array.from({ length: cardsPerSide }, (_, s) => ({ slot: s, cardId: 60 + s, ip: 12, revealed: true })),
    })));
    Analytics.gameStarted('easy', { battleId: 'hanging-gardens', tier: 'giant', locations, hand: Array(handSize).fill(26) });
    for (let t = 1; t <= turns; t++) {
      if (t > 1) Analytics.turnStarted(t, Array(handSize).fill(26));
      const acts = (side) => Array.from({ length: actionsPerSide }, (_, i) => (i % 2
        ? { type: 'move', cardId: 48, fromLocId: 100, fromSlotIndex: 1, toLocId: 101 }
        : { type: 'play', cardId: 40, [side === 'p' ? 'toLocId' : 'locId']: 100 + (i % locs), slotIndex: i % 4 }));
      Analytics.turnActions(t, acts('p'), acts('a'), true);
      Analytics.turnEnded(t);
    }
    Analytics.gameCompleted({ outcome: 'player', tiebreaker: true, playerTotal: 40, aiTotal: 39,
      locResults: locations.map((loc) => ({ loc, playerIP: 20, aiIP: 19, winner: 'player' })) });
    const doc = merged(writes, writes[0].path);
    return documentSize(`sessions/${doc.sessionId}`, doc);
  };

  // Gilgamesh-shaped: 4 turns, hand 4, 2 plays a side, 3 locations, 4 cards a side at the end.
  const typical = size({ turns: 4, handSize: 4, actionsPerSide: 2, locs: 3, cardsPerSide: 4, nameLen: 14 });
  // Well past anything in the game today: 6 turns, hand 7, 8 actions a side, 4 full locations.
  const worst = size({ turns: 6, handSize: 7, actionsPerSide: 8, locs: 4, cardsPerSide: 8, nameLen: 40 });
  console.log(`play-log doc size: typical ${typical} bytes, worst case ${worst} bytes`);
  assert.ok(typical < 4 * 1024, `typical ${typical}`);
  assert.ok(worst < 16 * 1024, `worst ${worst}`);
});

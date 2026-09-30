'use strict';
/* The release gate (js/feature-flags.js): while the content past Kush is closed,
   the online game ends at the Kush Giant. These tests load the real flag file
   and the real collection module into a VM with a fake location/localStorage. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function boot(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const window = { SOG: {} };
  // In the browser `SOG` is window.SOG; the VM needs the same alias.
  const ctx = { window, SOG: window.SOG, localStorage, console,
                location: { protocol: opts.protocol || 'https:', hostname: opts.hostname || 'mister-danny.github.io' } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const load = (p, extra = '') => vm.runInContext(fs.readFileSync(path.join(ROOT, p), 'utf8') + extra, ctx, { filename: p });
  load('js/feature-flags.js');
  if (opts.flag !== undefined) window.SOG_FEATURES.CONTENT_PAST_KUSH_ENABLED = opts.flag;
  if (opts.collection) {
    load('js/cards.js', ';globalThis.CARDS=CARDS');
    load('js/sog-collection.js');
  }
  return { F: window.SOG_FEATURES, SOG: window.SOG, store };
}

const beaten = (hooks) => Object.fromEntries(hooks.map((h) => ['sog_node_' + h + '_giant_beaten', 'true']));
const THROUGH_KUSH = ['gilgamesh', 'sargon', 'hammurabi', 'hanging-gardens', 'narmer', 'hatshepsut', 'ramses', 'akhenaten', 'kush'];
const INDIA = ['greatbath', 'siddhartha', 'gupta'];

test('the shipped flag closes the content past Kush', () => {
  const { F } = boot();
  assert.strictEqual(F.CONTENT_PAST_KUSH_ENABLED, false);
  assert.strictEqual(F.LAST_RELEASED_BOSS, 'kush');
});

test('online: only the maps through Kush are open', () => {
  const { F } = boot();
  assert.strictEqual(F.contentPastKushOpen(), false);
  ['eastafrica', 'egypt', 'upper-egypt', 'mesopotamia'].forEach((m) => assert.strictEqual(F.isMapOpen(m), true, m));
  ['persia', 'india', 'china', 'levant', 'greece', 'rome', 'sahara'].forEach((m) => assert.strictEqual(F.isMapOpen(m), false, m));
});

test('a local host has every map open', () => {
  ['localhost', '127.0.0.1'].forEach((hostname) => {
    const { F } = boot({ protocol: 'http:', hostname });
    assert.strictEqual(F.contentPastKushOpen(), true, hostname);
    assert.strictEqual(F.isMapOpen('india'), true, hostname);
  });
});

test('the playtest switch closes the content on a local host', () => {
  const { F } = boot({ protocol: 'http:', hostname: 'localhost', store: { sog_dev_close_past_kush: 'true' } });
  assert.strictEqual(F.contentPastKushOpen(), false);
  assert.strictEqual(F.isMapOpen('india'), false);
  assert.strictEqual(F.isMapOpen('mesopotamia'), true);
});

test('the playtest switch cannot OPEN content online', () => {
  const { F } = boot({ store: { sog_dev_close_past_kush: 'false' } });
  assert.strictEqual(F.contentPastKushOpen(), false);
});

test('flipping the flag opens everything online', () => {
  const { F } = boot({ flag: true });
  assert.strictEqual(F.contentPastKushOpen(), true);
  assert.strictEqual(F.isMapOpen('india'), true);
});

test('every unreleased Giant is a real map node hook, and Kush is a released one', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/map-data.js'), 'utf8'), ctx);
  const maps = ctx.window.SOG_MAP_DATA.maps;
  const { F } = boot();
  const where = {};
  Object.keys(maps).forEach((m) => (maps[m].nodes || []).forEach((n) => { if (n.hook) where[n.hook] = m; }));
  F.UNRELEASED_GIANT_HOOKS.forEach((h) => {
    assert.ok(where[h], 'no map node carries hook ' + h);
    assert.strictEqual(F.RELEASED_MAPS.indexOf(where[h]), -1, h + ' sits on a released map');
  });
  assert.notStrictEqual(F.RELEASED_MAPS.indexOf(where[F.LAST_RELEASED_BOSS]), -1);
  F.RELEASED_MAPS.forEach((m) => assert.ok(maps[m], 'released map missing from map data: ' + m));
});

test('closed: the history cards unlock on the nine Giants through Kush', () => {
  const { SOG } = boot({ collection: true, store: beaten(THROUGH_KUSH) });
  assert.strictEqual(SOG.collection.historyCardsUnlocked(), true);
});

test('closed: a missing Giant through Kush still blocks the history cards', () => {
  const { SOG } = boot({ collection: true, store: beaten(THROUGH_KUSH.filter((h) => h !== 'narmer')) });
  assert.strictEqual(SOG.collection.historyCardsUnlocked(), false);
});

test('open: the India Giants are required too', () => {
  const nine = boot({ collection: true, flag: true, store: beaten(THROUGH_KUSH) });
  assert.strictEqual(nine.SOG.collection.historyCardsUnlocked(), false);
  const all = boot({ collection: true, flag: true, store: beaten(THROUGH_KUSH.concat(INDIA)) });
  assert.strictEqual(all.SOG.collection.historyCardsUnlocked(), true);
});

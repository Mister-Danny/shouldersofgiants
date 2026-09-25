'use strict';

// js/notice.js decides whether a message is worth showing and whether its link
// is safe to open. Loaded into a vm with a stub Firestore — no emulator.
//
// Run via `node --test test/notice.test.js`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/notice.js'), 'utf8');

function load({ doc = null, uid = 'player-1', seen = '' } = {}) {
  const store = new Map(seen ? [['sog_notice_seen', seen]] : []);
  const opened = [];
  const els = {};
  const makeEl = (id) => (els[id] = {
    id, textContent: '', innerHTML: '', style: {}, children: [],
    classList: { list: new Set(), add(c) { this.list.add(c); }, remove(c) { this.list.delete(c); }, contains(c) { return this.list.has(c); } },
    appendChild(child) { this.children.push(child); },
  });
  ['notice-backdrop', 'notice-title', 'notice-body', 'notice-action', 'notice-dismiss'].forEach(makeEl);
  const openPopups = { list: [] };   // stands in for another modal being on screen
  const document = {
    readyState: 'complete',
    getElementById: (id) => els[id] || null,
    createElement: () => ({ textContent: '' }),
    querySelectorAll: () => openPopups.list,
    addEventListener() {},
  };
  // ready() is captured rather than fired, so init()'s own check doesn't consume
  // the notice before a test calls check() itself.
  let readyCb = null;
  const window = {
    SogAuth: { getUser: () => ({ uid }), ready: (cb) => { readyCb = cb; } },
    open: (url) => opened.push(url),
  };
  const firebase = {
    apps: [{}],
    firestore: () => ({ collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: !!doc, data: () => doc }) }) }) }),
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  window.firebase = firebase;   // in a browser these are the same object
  const ctx = vm.createContext({ window, document, firebase, localStorage, console, setTimeout, clearTimeout, Promise });
  vm.runInContext(SRC, ctx, { filename: 'js/notice.js' });
  return { api: window.SogNotice, els, store, opened, openPopups, runReady: () => readyCb && readyCb() };
}

const NOTICE = { id: 'kush-2026-09', active: true, title: 'TOTAL VICTORY', body: 'Congratulations!\n\nFill in the survey.',
  buttonLabel: 'Total Victory', buttonUrl: 'https://docs.google.com/forms/d/e/abc/viewform' };
const check = (api) => new Promise((resolve) => api.check(resolve));

test('shows an active, unseen message and records its id', async () => {
  const { api, els, store } = load({ doc: NOTICE });
  assert.equal(await check(api), true);
  assert.ok(els['notice-backdrop'].classList.contains('visible'));
  assert.equal(els['notice-title'].textContent, 'TOTAL VICTORY');
  assert.equal(els['notice-body'].children.length, 2, 'blank line splits into paragraphs');
  assert.equal(els['notice-action'].textContent, 'Total Victory');
  assert.equal(store.get('sog_notice_seen'), 'kush-2026-09');
});

test('the same message is never shown twice on a device', async () => {
  const { api, els } = load({ doc: NOTICE, seen: 'kush-2026-09' });
  assert.equal(await check(api), false);
  assert.equal(els['notice-backdrop'].classList.contains('visible'), false);
});

test('a new id reaches a player who already saw an older message', async () => {
  const { api } = load({ doc: { ...NOTICE, id: 'winter-update' }, seen: 'kush-2026-09' });
  assert.equal(await check(api), true);
});

test('nothing shows for an inactive, empty or missing notice', async () => {
  for (const doc of [null, { ...NOTICE, active: false }, { ...NOTICE, body: '   ' }, { ...NOTICE, id: '' }]) {
    const { api } = load({ doc });
    assert.equal(await check(api), false, JSON.stringify(doc));
  }
});

test('the button opens only an https link, and text is never treated as markup', async () => {
  assert.equal(load().api.safeUrl('https://example.com/form'), 'https://example.com/form');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'http://example.com', '', null]) {
    assert.equal(load().api.safeUrl(bad), '', String(bad));
  }
  const { api, els, opened } = load({ doc: { ...NOTICE, buttonUrl: 'javascript:alert(1)' } });
  await check(api);
  assert.equal(els['notice-action'].style.display, 'none', 'no button without a safe link');
  assert.equal(opened.length, 0);

  const ok = load({ doc: NOTICE });
  await check(ok.api);
  ok.els['notice-action'].onclick();
  assert.deepEqual(ok.opened, [NOTICE.buttonUrl]);
  assert.equal(ok.els['notice-backdrop'].classList.contains('visible'), false, 'closes after opening the link');
  // Body paragraphs are set as text, so markup in the database stays inert.
  assert.equal(ok.els['notice-body'].innerHTML, '');
});

test('a signed-out boot and a Firestore failure are both silent', async () => {
  const { api: noUser } = load({ doc: NOTICE, uid: '' });
  assert.equal(await check(noUser), false);
});

test('boot shows the message once auth is ready, without being called directly', async () => {
  const { api, els, runReady } = load({ doc: NOTICE });
  assert.equal(els['notice-backdrop'].classList.contains('visible'), false, 'nothing before auth settles');
  runReady();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(els['notice-backdrop'].classList.contains('visible'));
  assert.ok(api);
});

test('waits for another popup to close instead of stacking on it', async () => {
  const { api, els, store, openPopups } = load({ doc: NOTICE });
  openPopups.list = [{ id: 'guest-notice-backdrop' }];   // the welcome popup is up
  const pending = check(api);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(els['notice-backdrop'].classList.contains('visible'), false, 'held back');
  assert.equal(store.get('sog_notice_seen'), undefined, 'not marked seen until it actually shows');

  openPopups.list = [];   // player dismisses it
  assert.equal(await pending, true);
  assert.ok(els['notice-backdrop'].classList.contains('visible'));
  assert.equal(store.get('sog_notice_seen'), 'kush-2026-09');
});

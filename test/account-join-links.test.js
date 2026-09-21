'use strict';

// Join links (?join=CODE) and the stored student passphrase, against the real
// js/account.js loaded into a vm with a recording Firestore/Auth stub — no
// emulator, no network. Rules coverage for the passphrase field lives in
// test/firestore.rules.test.js.
//
// Run via `node --test test/account-join-links.test.js`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/account.js'), 'utf8');

// Minimal browser + Firebase compat surface for the pieces account.js touches.
function load({ currentUser = { uid: 'anon-1', isAnonymous: true, email: null } } = {}) {
  const writes = [];
  const store = new Map();
  const linked = [];
  const doc = (col, id) => ({
    set(data, opts) { writes.push({ path: `${col}/${id}`, merge: !!(opts && opts.merge), data }); return Promise.resolve(); },
    get() { return Promise.resolve({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }); },
  });
  const firestore = () => ({ collection: (col) => ({ doc: (id) => doc(col, id) }) });
  firestore.FieldValue = { serverTimestamp: () => ({ __ts: true }) };
  const auth = () => ({
    currentUser,
    signOut: () => Promise.resolve(),
    getRedirectResult: () => Promise.resolve(null),
  });
  auth.EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  auth.GoogleAuthProvider = function () { this.addScope = () => {}; this.setCustomParameters = () => {}; };
  const firebase = { auth, firestore };
  const window = { SaveState: { getSnapshot: () => ({ modules: { gold: { gold: 3 } } }) } };
  const localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };
  // Default link behaviour; a test can supply its own on the user it passes in.
  if (currentUser && !currentUser.linkWithCredential) {
    currentUser.linkWithCredential = (cred) => { linked.push(cred); currentUser.email = cred.email; return Promise.resolve(); };
  }
  const ctx = vm.createContext({ window, firebase, localStorage, sessionStorage: localStorage, console, setTimeout, clearTimeout, Promise });
  vm.runInContext(SRC, ctx, { filename: 'js/account.js' });
  return { api: window.SogAccount, writes, store, linked };
}

test('parseJoinCode reads ?join= and #join=, normalizes, and rejects junk', () => {
  const { api } = load();
  assert.equal(api.parseJoinCode('?join=E233V7', ''), 'E233V7');
  assert.equal(api.parseJoinCode('?utm=x&join=e233v7', ''), 'E233V7', 'lowercase is normalized like a typed code');
  assert.equal(api.parseJoinCode('', '#join=E233V7'), 'E233V7');
  assert.equal(api.parseJoinCode('?join=%20E233V7%20', ''), 'E233V7', 'percent-encoded whitespace is trimmed');
  // Nothing to join.
  for (const s of ['', '?class=E233V7', '?joins=E233V7', '?join=', '?join=NOT A CODE', '?join=../../etc/passwd', `?join=${'X'.repeat(13)}`]) {
    assert.equal(api.parseJoinCode(s, ''), '', `expected no code from ${JSON.stringify(s)}`);
  }
});

test('signUpStudent stores the passphrase alongside the class membership', async () => {
  const { api, writes, linked } = load();
  const classInfo = { ungrouped: false, code: 'E233V7', label: 'Period 3', ownerUid: 'teacher-1' };
  const creds = await new Promise((resolve, reject) =>
    api.signUpStudent(classInfo, 'lucythebrave4', 'cometwaffle42', (err, c) => (err ? reject(err) : resolve(c))));

  assert.deepEqual(JSON.parse(JSON.stringify(creds)), { username: 'lucythebrave4', passphrase: 'cometwaffle42' });
  assert.deepEqual(JSON.parse(JSON.stringify(linked)), [{ email: 'lucythebrave4@sog.invalid', password: 'cometwaffle42' }]);
  const write = writes.find(w => w.path === 'players/anon-1');
  assert.equal(write.data.username, 'lucythebrave4');
  assert.equal(write.data.passphrase, 'cometwaffle42', 'teacher-readable recovery copy');
  assert.equal(write.data.classCode, 'E233V7');
  assert.equal(write.data.teacherUid, 'teacher-1');
  assert.deepEqual(JSON.parse(JSON.stringify(write.data.progress)), { modules: { gold: { gold: 3 } } }, 'guest progress carries over');
});

test('an already-linked retry never overwrites a stored passphrase with null', async () => {
  const { api, writes } = load();
  // Second signUpStudent call for a user whose credential is already attached:
  // link fails with provider-already-linked and no passphrase can be recovered.
  const user = { uid: 'anon-2', isAnonymous: false, email: 'lucythebrave4@sog.invalid' };
  user.linkWithCredential = () => Promise.reject(Object.assign(new Error('linked'), { code: 'auth/provider-already-linked' }));
  const again = load({ currentUser: user });
  const out = await new Promise(resolve =>
    again.api.signUpStudent({ ungrouped: true }, 'lucythebrave4', 'whatever12', (err, c) => resolve({ err, c })));
  assert.equal(out.c.passphrase, null);
  const write = again.writes.find(w => w.path === 'players/anon-2');
  assert.ok(write, 'the player doc is still written');
  assert.ok(!('passphrase' in write.data), 'no null passphrase — a good stored one would be wiped by the merge');
  assert.equal(writes.length, 0, 'sanity: the first fixture instance was untouched');
});

test('ungrouped signup (no class) still stores the passphrase', async () => {
  const { api, writes } = load();
  await new Promise((resolve, reject) =>
    api.signUpStudent({ ungrouped: true }, 'otzithebold7', 'tigerrobot19', (err) => (err ? reject(err) : resolve())));
  const write = writes.find(w => w.path === 'players/anon-1');
  assert.equal(write.data.classCode, '');
  assert.equal(write.data.teacherUid, '');
  assert.equal(write.data.passphrase, 'tigerrobot19');
});

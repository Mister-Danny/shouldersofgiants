'use strict';

// Open teacher signup (no invite code): the real js/account.js, the real
// Firebase compat SDK, and the Auth + Firestore emulators with the real
// firestore.rules. The guest (anonymous) account must be upgraded IN PLACE —
// same uid, guest progress carried — for email and for Google, and every
// edge case must end signed in with a usable next step, never orphaned.
//
// Popups can't run in an emulator test, so linkWithPopup/signInWithPopup are
// swapped for the credential calls with a fake Google token for whichever
// account the "user picks" (same technique as test/auth-google-link.test.js).
//
// Run under: firebase emulators:exec --only auth,firestore "node --test ..."

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const skip = !AUTH_HOST && 'needs the Auth emulator (run under emulators:exec --only auth,firestore)';
const PROJECT = 'demo-shoulders-of-giants';
const SRC = fs.readFileSync(path.resolve(__dirname, '../js/account.js'), 'utf8');
const RULES = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
const PW = 'correct-horse-9';
const GUEST_PROGRESS = { otzi: { battleComplete: true }, gold: { amount: 42 } };

let firebase, auth, testEnv, api, nextGoogle, popupMode = 'ok';

const rest = (p, method = 'GET', body) => fetch(`http://${AUTH_HOST}${p}`, {
  method, headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: body && JSON.stringify(body),
}).then(r => r.json());
const lookup = (uid) => rest(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, 'POST', { localId: [uid] })
  .then(j => j.users && j.users[0]);
const providersOf = async (uid) => {
  const u = await lookup(uid);
  return u ? (u.providerUserInfo || []).map(p => p.providerId).sort().join('+') : 'DELETED';
};
const docOf = async (p) => {
  let data = null;
  await testEnv.withSecurityRulesDisabled(async c => { const s = await c.firestore().doc(p).get(); data = s.exists ? s.data() : null; });
  return data;
};
const pickGoogle = (sub, email, name) => {
  nextGoogle = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: false, name: name || ('G ' + sub) }));
};
const call = (fn, ...args) => new Promise(resolve => fn(...args, (err, result) => resolve({ err, result })));
// Swap the emulator's rules (e.g. to the pre-open-signup ones) and back.
const setRules = (content) => fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}:securityRules`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ content }] } }),
}).then(r => { if (!r.ok) throw new Error('rules swap failed ' + r.status); });
const OLD_RULES = RULES.replace(/allow create: if signedIn\(\)\s*&& request\.auth\.uid == uid\s*&& request\.auth\.token\.firebase\.sign_in_provider[\s\S]*?!\('devTools' in request\.resource\.data\);/,
  "allow create: if signedIn() && request.auth.uid == uid && get(/databases/$(database)/documents/invites/$(request.resource.data.inviteCode)).data.active == true;");

before(async () => {
  if (skip) return;
  const sdk = path.dirname(require.resolve('firebase/package.json'));
  firebase = require(path.join(sdk, 'compat/app'));
  firebase = firebase.default || firebase;
  require(path.join(sdk, 'compat/auth'));
  require(path.join(sdk, 'compat/firestore'));
  firebase.initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'localhost' });
  auth = firebase.auth();
  auth.useEmulator(`http://${AUTH_HOST}`, { disableWarnings: true });
  firebase.firestore().useEmulator('127.0.0.1', 8080);

  const blocked = () => { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; return Promise.reject(e); };
  auth.signInWithPopup = () => popupMode === 'blocked' ? blocked() : auth.signInWithCredential(nextGoogle);
  const withPopupCred = (cred) => (e) => { if (e && !e.credential && e.code === 'auth/credential-already-in-use') e.credential = cred; throw e; };
  auth.onAuthStateChanged(() => {
    const u = auth.currentUser;
    if (u && !u.__patched) {
      const proto = Object.getPrototypeOf(u);
      proto.linkWithPopup = function () { if (popupMode === 'blocked') return blocked(); const c = nextGoogle; return this.linkWithCredential(c).catch(withPopupCred(c)); };
      proto.__patched = true;
    }
  });

  const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
  testEnv = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: RULES, host: '127.0.0.1', port: 8080 } });

  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] };
  const window = { SaveState: { getSnapshot: () => JSON.parse(JSON.stringify(GUEST_PROGRESS)), applySnapshot() {} }, SogAuth: { refresh() {} } };
  api = new Function('window', 'firebase', 'localStorage', 'sessionStorage', SRC + '\n;return window.SogAccount;')(
    window, firebase, localStorage, localStorage);
  api._store = store;
});

after(async () => {
  if (skip) return;
  await testEnv.cleanup();
  await Promise.all(firebase.apps.map(a => a.delete()));
});

beforeEach(async () => {
  if (skip) return;
  popupMode = 'ok';
  await auth.signOut();
  await rest(`/emulator/v1/projects/${PROJECT}/accounts`, 'DELETE');
  await testEnv.clearFirestore();
  await setRules(RULES);
  await testEnv.withSecurityRulesDisabled(c => c.firestore().doc('invites/HISTROCK').set({ active: true }));
});

async function guest() {
  const cred = await auth.signInAnonymously();
  api._store.set('sog_progress_owner_uid', cred.user.uid);   // what js/auth.js stamps on bootstrap
  return cred.user.uid;
}

test('email: the guest is upgraded in place — same uid, teacher doc with no invite, guest progress carried', { skip }, async () => {
  const guestUid = await guest();
  const r = await call(api.signUpTeacherOpen, { email: 'open@school.org', password: PW, src: 'newsletter-oct' });
  assert.ifError(r.err);
  assert.equal(r.result.uid, guestUid, 'same uid as the guest');
  assert.equal(r.result.created, true);
  assert.equal(await providersOf(guestUid), 'password');
  const t = await docOf(`teachers/${guestUid}`);
  assert.equal(t.inviteCode, '');
  assert.equal(t.src, 'newsletter-oct');
  assert.equal(t.adultConfirmed, true);
  assert.equal(t.authProvider, 'password');
  assert.equal(t.displayName, '', 'no name invented from the email');
  assert.equal('devTools' in t, false);
  const p = await docOf(`players/${guestUid}`);
  assert.deepEqual(p.progress, GUEST_PROGRESS, 'guest progress carried over');
  assert.equal(p.teacherUid, '');
  assert.equal(p.classCode, '');
});

test('Google: guest upgraded in place via linkWithPopup, name from Google, progress carried', { skip }, async () => {
  const guestUid = await guest();
  pickGoogle('g-open', 'ms.rivera@district.org', 'Ms Rivera');
  const r = await call(api.signUpTeacherGoogleOpen, { src: 'twitter' });
  assert.ifError(r.err);
  assert.equal(r.result.uid, guestUid);
  assert.equal(r.result.created, true);
  assert.equal(await providersOf(guestUid), 'google.com');
  const t = await docOf(`teachers/${guestUid}`);
  assert.equal(t.displayName, 'Ms Rivera');
  assert.equal(t.authProvider, 'google');
  assert.equal(t.src, 'twitter');
  assert.deepEqual((await docOf(`players/${guestUid}`)).progress, GUEST_PROGRESS);
});

test('Google account that is already a teacher here: signs in to it (returning), guest left behind, their doc untouched', { skip }, async () => {
  // An existing Google teacher, made through the open flow once.
  await guest();
  pickGoogle('g-ret', 'ret@district.org', 'Mr Ret');
  const first = await call(api.signUpTeacherGoogleOpen, {});
  assert.ifError(first.err);
  const teacherUid = first.result.uid;
  await testEnv.withSecurityRulesDisabled(c => c.firestore().doc(`players/${teacherUid}`).update({ progress: { mine: true } }));
  await auth.signOut();

  const guestUid = await guest();
  pickGoogle('g-ret', 'ret@district.org', 'Mr Ret');
  const r = await call(api.signUpTeacherGoogleOpen, {});
  assert.ifError(r.err);
  assert.equal(r.result.existing, true);
  assert.equal(r.result.uid, teacherUid);
  assert.notEqual(teacherUid, guestUid);
  assert.equal(auth.currentUser.uid, teacherUid);
  assert.deepEqual((await docOf(`players/${teacherUid}`)).progress, { mine: true }, 'returning teacher keeps their own progress');
});

test('email already registered: refused cleanly, still the same guest', { skip }, async () => {
  await guest();
  const a = await call(api.signUpTeacherOpen, { email: 'dup@school.org', password: PW });
  assert.ifError(a.err);
  await auth.signOut();
  const guestUid = await guest();
  const b = await call(api.signUpTeacherOpen, { email: 'dup@school.org', password: PW });
  assert.equal(b.err.code, 'auth/email-already-in-use');
  assert.equal(auth.currentUser.uid, guestUid);
  assert.equal(auth.currentUser.isAnonymous, true);
});

test('popup blocked: reported as popup-blocked, nothing changed, no redirect attempted', { skip }, async () => {
  const guestUid = await guest();
  popupMode = 'blocked';
  const r = await call(api.signUpTeacherGoogleOpen, {});
  assert.equal(r.err.code, 'popup-blocked');
  assert.equal(auth.currentUser.uid, guestUid);
  assert.equal(auth.currentUser.isAnonymous, true);
  const login = await call(api.signInTeacherWithGoogle, '');
  assert.equal(login.err.code, 'popup-blocked', 'Log In with Google reports it the same way');
});

test('site deployed before the rules (invite still required): stops at invite-required signed in, a code finishes it', { skip }, async () => {
  await setRules(OLD_RULES);
  const guestUid = await guest();
  const r = await call(api.signUpTeacherOpen, { email: 'early@school.org', password: PW });
  assert.equal(r.err.code, 'invite-required');
  assert.equal(auth.currentUser.uid, guestUid, 'account kept (upgraded), nothing orphaned');
  assert.equal(auth.currentUser.isAnonymous, false);
  assert.equal(await docOf(`teachers/${guestUid}`), null);
  const done = await call(api.finishTeacherSetup, 'histrock');
  assert.ifError(done.err);
  assert.equal((await docOf(`teachers/${guestUid}`)).inviteCode, 'HISTROCK');
  assert.deepEqual((await docOf(`players/${guestUid}`)).progress, GUEST_PROGRESS, 'progress still carried');
});

test('rules deployed before the site: the old invite-code signup still works under the new rules', { skip }, async () => {
  await guest();
  const r = await call(api.signUpTeacher, { email: 'legacy@school.org', password: PW, displayName: 'Ms L', inviteCode: 'HISTROCK' });
  assert.ifError(r.err);
  assert.equal((await docOf(`teachers/${r.result.uid}`)).inviteCode, 'HISTROCK');
});

test('a signed-in (non-guest) account is not silently converted', { skip }, async () => {
  await guest();
  await call(api.signUpTeacherOpen, { email: 'someone@school.org', password: PW });
  const r = await call(api.signUpTeacherOpen, { email: 'other@school.org', password: PW });
  assert.equal(r.err.code, 'already-signed-in');
});

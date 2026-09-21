'use strict';

// Teacher Google sign-in vs existing email/password accounts: the real
// js/account.js, the real Firebase compat SDK, and the Auth + Firestore
// emulators (rules enforced). Each case checks that there's one uid per
// teacher, the classes stay attached, and whether password login still works.
//
// The emulator applies the same account-matching rules as production
// (one account per email):
//   - a Google token with email_verified:true is a TRUSTED provider, which
//     production grants only to @gmail.com addresses;
//   - email_verified:false stands in for an UNTRUSTED Google address, which in
//     production is any Workspace/school domain.
// No emulator can run a real Google popup, so signInWithPopup/linkWithPopup
// are swapped for signInWithCredential/linkWithCredential with a fake Google
// token for whichever account the "user picks".
//
// Run: npx firebase emulators:exec --project demo-shoulders-of-giants \
//        --only auth,firestore "node --test test/auth-google-link.test.js"
// Set FIREBASE_SDK_DIR to test against another SDK copy (the game loads 9.23.0).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const skip = !AUTH_HOST && 'needs the Auth emulator (run under emulators:exec --only auth,firestore)';
const PROJECT = 'demo-shoulders-of-giants';
const SRC = fs.readFileSync(path.resolve(__dirname, '../js/account.js'), 'utf8');
const PW = 'correct-horse-9';

let firebase, auth, testEnv, api, nextGoogle;

const rest = (p, method = 'GET', body) => fetch(`http://${AUTH_HOST}${p}`, {
  method, headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: body && JSON.stringify(body),
}).then(r => r.json());
const lookup = (uid) => rest(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, 'POST', { localId: [uid] })
  .then(j => j.users && j.users[0]);
const providersOf = async (uid) => {
  const u = await lookup(uid);
  return u ? (u.providerUserInfo || []).map(p => p.providerId).sort().join('+') : 'DELETED';
};
const usersWithEmail = async (email) => (await rest(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=100`)).users
  ?.filter(u => u.email === email).length || 0;
const allUids = async () => ((await rest(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=100`)).users || [])
  .filter(u => (u.providerUserInfo || []).length).map(u => u.localId);   // guests (anonymous) aside
const teacherDoc = async (uid) => {
  let data = null;   // withSecurityRulesDisabled resolves to undefined, so capture inside
  await testEnv.withSecurityRulesDisabled(async c => { const s = await c.firestore().doc(`teachers/${uid}`).get(); data = s.exists ? s.data() : null; });
  return data;
};

// The Google account the user "picks" in the next popup.
const pickGoogle = (sub, email, { trusted }) => {
  nextGoogle = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: trusted, name: 'G ' + sub }));
};
const call = (fn, ...args) => new Promise(resolve => fn(...args, (err, result) => resolve({ err, result })));

before(async () => {
  if (skip) return;
  const sdk = process.env.FIREBASE_SDK_DIR || path.dirname(require.resolve('firebase/package.json'));
  firebase = require(path.join(sdk, 'compat/app'));
  firebase = firebase.default || firebase;
  require(path.join(sdk, 'compat/auth'));
  require(path.join(sdk, 'compat/firestore'));
  firebase.initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'localhost' });
  auth = firebase.auth();
  auth.useEmulator(`http://${AUTH_HOST}`, { disableWarnings: true });
  firebase.firestore().useEmulator('127.0.0.1', 8080);

  // Popups → credential calls with the picked account. Real popup errors carry
  // err.credential for credential-already-in-use; the credential call doesn't,
  // so it's attached here the way the popup would.
  auth.signInWithPopup = () => auth.signInWithCredential(nextGoogle);
  auth.signInWithRedirect = () => Promise.reject(new Error('redirect not expected in tests'));
  const withPopupCred = (cred) => (e) => { if (e && !e.credential && e.code === 'auth/credential-already-in-use') e.credential = cred; throw e; };
  const patchUser = () => {
    const u = auth.currentUser;
    if (u && !u.__patched) {
      const proto = Object.getPrototypeOf(u);
      proto.linkWithPopup = function () { const c = nextGoogle; return this.linkWithCredential(c).catch(withPopupCred(c)); };
      proto.__patched = true;
    }
  };
  auth.onAuthStateChanged(patchUser);

  const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] };
  const window = { SaveState: { getSnapshot: () => ({}), applySnapshot() {} }, SogAuth: { refresh() {} } };
  // Same realm as the SDK (not a vm context): Firestore rejects object
  // literals from another realm as "custom Object" data.
  api = new Function('window', 'firebase', 'localStorage', 'sessionStorage', SRC + '\n;return window.SogAccount;')(
    window, firebase, localStorage, localStorage);
});

after(async () => {
  if (skip) return;
  await testEnv.cleanup();
  await Promise.all(firebase.apps.map(a => a.delete()));
});

beforeEach(async () => {
  if (skip) return;
  await auth.signOut();
  await rest(`/emulator/v1/projects/${PROJECT}/accounts`, 'DELETE');
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(c => c.firestore().doc('invites/HISTROCK').set({ active: true }));
});

// A password teacher made through the game's own signup, with one class.
async function passwordTeacher(email, { verified = false } = {}) {
  await auth.signInAnonymously();   // the game always starts as a guest
  const { err, result } = await call(api.signUpTeacher, { email, password: PW, displayName: 'Ms ' + email[0], inviteCode: 'HISTROCK' });
  assert.ifError(err);
  await testEnv.withSecurityRulesDisabled(c => c.firestore().doc(`teachers/${result.uid}`).set({ classCodes: ['CLS' + email[0].toUpperCase() + '1'] }, { merge: true }));
  if (verified) await rest(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, 'POST', { localId: result.uid, emailVerified: true });
  await auth.signOut();
  await auth.signInAnonymously();
  return result.uid;
}
const passwordWorks = async (email) => {
  await auth.signOut();
  const r = await call(api.loginTeacher, email, PW);
  const out = r.err ? r.err.code : 'ok';
  await auth.signOut();
  return out;
};

test('school (Workspace) address = password email: refused, then password once links it to the same uid', { skip }, async () => {
  const email = 'c.teacher@school.org';
  const uid = await passwordTeacher(email);

  pickGoogle('g-c', email, { trusted: false });
  const first = await call(api.signInTeacherWithGoogle, '');
  assert.equal(first.err.code, 'google-needs-password');
  assert.equal(first.result.email, email);
  assert.equal(await usersWithEmail(email), 1, 'no second account was created');
  assert.equal(await providersOf(uid), 'password', 'password account untouched by the refused sign-in');

  const linked = await call(api.linkGoogleWithPassword, email, PW);
  assert.ifError(linked.err);
  assert.equal(linked.result.uid, uid);
  assert.equal(await providersOf(uid), 'google.com+password');

  await auth.signOut();
  pickGoogle('g-c', email, { trusted: false });
  const again = await call(api.signInTeacherWithGoogle, '');
  assert.ifError(again.err);
  assert.equal(again.result.uid, uid);
  assert.equal(again.result.existing, true);
  assert.equal(again.result.passwordLost, false);
  assert.deepEqual((await teacherDoc(uid)).classCodes, ['CLSC1'], 'classes still attached');
  assert.equal(await passwordWorks(email), 'ok');
});

test('different Google address: stops at the invite step (even with a code), "I already have an account" links instead of duplicating', { skip }, async () => {
  const pwEmail = 'e.teacher@gmail.com', gEmail = 'e.teacher@district.org';
  const uid = await passwordTeacher(pwEmail);

  pickGoogle('g-e', gEmail, { trusted: false });
  const first = await call(api.signInTeacherWithGoogle, 'HISTROCK');   // from the signup form, code filled in
  assert.equal(first.err.code, 'invite-required', 'a new Google uid never becomes a teacher without the confirm step');
  const googleUid = first.result.uid;
  assert.notEqual(googleUid, uid);
  assert.equal(first.result.inviteCode, 'HISTROCK', 'code carried into the step');
  assert.equal(await teacherDoc(googleUid), null, 'no teacher doc yet');

  assert.equal(api.startLinkToExistingAccount(), true);
  const wrong = await call(api.linkGoogleWithPassword, pwEmail, 'nope-nope');
  assert.match(wrong.err.code, /auth\/(wrong-password|invalid-credential)/);
  assert.equal(await providersOf(googleUid), 'DELETED', 'the empty Google user is removed before the password try');

  const linked = await call(api.linkGoogleWithPassword, pwEmail, PW);   // retry after a typo still works
  assert.ifError(linked.err);
  assert.equal(linked.result.uid, uid);
  assert.equal(await providersOf(uid), 'google.com+password');
  assert.deepEqual(await allUids(), [uid], 'exactly one account left');

  await auth.signOut();
  pickGoogle('g-e', gEmail, { trusted: false });
  const again = await call(api.signInTeacherWithGoogle, '');
  assert.equal(again.result.uid, uid, 'school Google now opens the gmail password account');
  assert.equal(await passwordWorks(pwEmail), 'ok');
});

test('gmail, linked from a password session first: Google later keeps the password', { skip }, async () => {
  const email = 'd.teacher@gmail.com';
  const uid = await passwordTeacher(email);
  assert.ifError((await call(api.loginTeacher, email, PW)).err);

  pickGoogle('g-d', email, { trusted: true });
  const linked = await call(api.linkGoogleToCurrentUser);
  assert.ifError(linked.err);
  assert.equal(linked.result.linked, true);
  assert.equal(await providersOf(uid), 'google.com+password');

  await auth.signOut();
  pickGoogle('g-d', email, { trusted: true });
  const again = await call(api.signInTeacherWithGoogle, '');
  assert.equal(again.result.uid, uid);
  assert.equal(again.result.passwordLost, false);
  assert.equal(await providersOf(uid), 'google.com+password', 'trusted-provider overwrite did not run');
  assert.equal(await passwordWorks(email), 'ok');
});

test('gmail, unverified, Google WITHOUT linking first: same uid and classes, password switched off, detected and restorable', { skip }, async () => {
  const email = 'a.teacher@gmail.com';
  const uid = await passwordTeacher(email);

  pickGoogle('g-a', email, { trusted: true });
  const r = await call(api.signInTeacherWithGoogle, '');
  assert.ifError(r.err);
  assert.equal(r.result.uid, uid, 'no duplicate: Firebase kept the uid');
  assert.equal(r.result.existing, true);
  assert.equal(r.result.passwordLost, true, 'the UI is told the password was switched off');
  assert.equal(await providersOf(uid), 'google.com');
  assert.deepEqual((await teacherDoc(uid)).classCodes, ['CLSA1']);

  const restored = await call(api.addPasswordToCurrentUser, PW);
  assert.ifError(restored.err);
  assert.equal(await providersOf(uid), 'google.com+password');
  assert.equal(await passwordWorks(email), 'ok');
});

test('gmail, "Google only" choice is remembered (rules allow the authProvider update)', { skip }, async () => {
  const email = 'k.teacher@gmail.com';
  const uid = await passwordTeacher(email);
  pickGoogle('g-k', email, { trusted: true });
  assert.equal((await call(api.signInTeacherWithGoogle, '')).result.passwordLost, true);
  await new Promise(res => api.keepGoogleOnly(res));
  assert.equal((await teacherDoc(uid)).authProvider, 'google');
  assert.equal((await teacherDoc(uid)).inviteCode, 'HISTROCK');
  await auth.signOut();
  pickGoogle('g-k', email, { trusted: true });
  assert.equal((await call(api.signInTeacherWithGoogle, '')).result.passwordLost, false);
});

test('gmail whose password account was email-verified: Google links automatically and keeps the password', { skip }, async () => {
  const email = 'b.teacher@gmail.com';
  const uid = await passwordTeacher(email, { verified: true });
  pickGoogle('g-b', email, { trusted: true });
  const r = await call(api.signInTeacherWithGoogle, '');
  assert.equal(r.result.uid, uid);
  assert.equal(r.result.passwordLost, false);
  assert.equal(await providersOf(uid), 'google.com+password');
  assert.equal(await passwordWorks(email), 'ok');
});

test('dashboard link picks a Google account left over from an unfinished sign-in: password once, leftover removed, linked', { skip }, async () => {
  const pwEmail = 'o.teacher@gmail.com', gEmail = 'o@district.org';
  const uid = await passwordTeacher(pwEmail);
  pickGoogle('g-o', gEmail, { trusted: false });
  const orphan = (await call(api.signInTeacherWithGoogle, '')).result.uid;   // walked away at the invite step
  await auth.signOut();

  assert.ifError((await call(api.loginTeacher, pwEmail, PW)).err);
  pickGoogle('g-o', gEmail, { trusted: false });
  const r = await call(api.linkGoogleToCurrentUser);
  assert.equal(r.err.code, 'google-needs-password');
  assert.equal(r.result.email, pwEmail);
  assert.equal(r.result.googleEmail, gEmail);

  const linked = await call(api.linkGoogleWithPassword, pwEmail, PW);
  assert.ifError(linked.err);
  assert.equal(await providersOf(orphan), 'DELETED');
  assert.equal(await providersOf(uid), 'google.com+password');
});

test('dashboard link picks a Google account that is another teacher: refused, nothing deleted', { skip }, async () => {
  const pwEmail = 'p.teacher@gmail.com', gEmail = 'q@district.org';
  const uid = await passwordTeacher(pwEmail);
  pickGoogle('g-q', gEmail, { trusted: false });
  const other = (await call(api.signInTeacherWithGoogle, '')).result.uid;
  assert.ifError((await call(api.finishTeacherGoogleSignup, 'HISTROCK')).err);
  await auth.signOut();

  assert.ifError((await call(api.loginTeacher, pwEmail, PW)).err);
  pickGoogle('g-q', gEmail, { trusted: false });
  const r = await call(api.linkGoogleToCurrentUser);
  assert.equal(r.err.code, 'google-is-other-teacher');
  assert.equal(await providersOf(other), 'google.com');
  assert.equal(await providersOf(uid), 'password');
  assert.ok(await teacherDoc(other));
});

test('brand-new Google teacher still signs up normally, and is never flagged as a lost password', { skip }, async () => {
  pickGoogle('g-n', 'new@district.org', { trusted: false });
  const first = await call(api.signInTeacherWithGoogle, '');
  assert.equal(first.err.code, 'invite-required');
  const done = await call(api.finishTeacherGoogleSignup, 'HISTROCK');
  assert.ifError(done.err);
  assert.equal((await teacherDoc(done.result.uid)).authProvider, 'google');
  await auth.signOut();
  pickGoogle('g-n', 'new@district.org', { trusted: false });
  const again = await call(api.signInTeacherWithGoogle, '');
  assert.equal(again.result.existing, true);
  assert.equal(again.result.passwordLost, false);
});

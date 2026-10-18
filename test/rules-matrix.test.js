'use strict';

// Permission matrix: every rule in firestore.rules and database.rules.json,
// exercised as seven identities on a freshly seeded database per operation.
// Each test row lists the expected outcome per identity, so a rules change
// that opens or closes something shows up as a named, readable failure.
//
//   signedOut   no auth
//   anon        a guest (anonymous sign-in)
//   studentA    username@sog.invalid in teacher A's class (email unverified)
//   studentB    username@sog.invalid in teacher B's class
//   teacherA    email/password teacher, verified email
//   teacherB    Google teacher (verified), original invite-code teacher
//   unverified  a real-looking email account that never verified
//
// Expected strings read left to right in that order: 'A' allowed, 'd' denied.
// Run via `npm run test:rules` (Firestore + Realtime Database emulators).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const PROJECT = 'demo-rules-matrix';
const ROOT = path.resolve(__dirname, '..');
const SAVE_MAX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-snapshot.max.json'), 'utf8'));
const SAVE_FRESH = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-snapshot.fresh.json'), 'utf8'));
const { _comment, ...PLAY_LOG } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/session-play-log.sample.json'), 'utf8'));

const WHO = ['signedOut', 'anon', 'studentA', 'studentB', 'teacherA', 'teacherB', 'unverified'];
const UID = { signedOut: 'nobody', anon: 'anon1', studentA: 'stuA', studentB: 'stuB', teacherA: 'tchA', teacherB: 'tchB', unverified: 'unv' };
let env;
const ctx = {
  signedOut:  () => env.unauthenticatedContext(),
  anon:       () => env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }),
  studentA:   () => env.authenticatedContext('stuA', { email: 'stua@sog.invalid', email_verified: false, firebase: { sign_in_provider: 'password' } }),
  studentB:   () => env.authenticatedContext('stuB', { email: 'stub@sog.invalid', email_verified: false, firebase: { sign_in_provider: 'password' } }),
  teacherA:   () => env.authenticatedContext('tchA', { email: 'a@school.org', email_verified: true, firebase: { sign_in_provider: 'password' } }),
  teacherB:   () => env.authenticatedContext('tchB', { email: 'b@school.org', email_verified: true, firebase: { sign_in_provider: 'google.com' } }),
  unverified: () => env.authenticatedContext('unv', { email: 'real.teacher@school.org', email_verified: false, firebase: { sign_in_provider: 'password' } }),
};

const progress = (modules) => ({ version: 1, modules });
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('invites/TESTLIVE').set({ active: true });
    await db.doc('invites/TESTDEAD').set({ active: false });
    await db.doc('teachers/tchA').set({ email: 'a@school.org', inviteCode: '', displayName: 'Ms A' });
    await db.doc('teachers/tchB').set({ email: 'b@school.org', inviteCode: 'TESTLIVE', displayName: 'Mr B' });
    await db.doc('classes/AAAAAA').set({ ownerUid: 'tchA', active: true, label: 'P1', teacherName: 'Ms A' });
    await db.doc('classes/BBBBBB').set({ ownerUid: 'tchB', active: true, label: 'P2', teacherName: 'Mr B' });
    await db.doc('players/stuA').set({ username: 'stua', classCode: 'AAAAAA', teacherUid: 'tchA', passphrase: 'tiger19', progress: progress({ gold: { amount: 5 } }) });
    await db.doc('players/stuB').set({ username: 'stub', classCode: 'BBBBBB', teacherUid: 'tchB', passphrase: 'robot22', progress: progress({ gold: { amount: 9 } }) });
    await db.doc('players/tchA').set({ username: 'Ms A', classCode: '', teacherUid: '', progress: {} });
    await db.doc('sessions/s-stuA').set({ uid: 'stuA', outcome: 'player' });
    await db.doc('sessions/s-stuB').set({ uid: 'stuB', outcome: 'ai' });
    await db.doc('notices/stuA').set({ text: 'hi' });
  });
}
const removeOwn = (coll) => async (w) => env.withSecurityRulesDisabled((c) => c.firestore().doc(`${coll}/${UID[w]}`).delete());

async function outcome(p) {
  try { await p; return 'A'; } catch (e) {
    const msg = String((e && (e.code || e.message)) || e);
    if (/PERMISSION_DENIED|permission[_-]denied|Permission denied/i.test(msg)) return 'd';
    throw e;   // anything else is a broken test, not a rules answer
  }
}

const fsOf = (c) => c.firestore();
const OWN_PLAYER = (w, extra) => ({ username: 'u', classCode: '', teacherUid: '', progress: {}, ...extra });
const BIG_NODE_PROGRESS = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['sog_node_x' + i + '_serf_beaten', 'true']));

// [name, expected, op(ctx, who), prepare?(who)]
const OPS = [
  // ── /players ──────────────────────────────────────────────────────────────
  ['players: get own doc',                              'dAAAAAA', (c, w) => fsOf(c).doc('players/' + UID[w]).get()],
  ['players: get stuA (class A student)',               'ddAdAdd', (c) => fsOf(c).doc('players/stuA').get()],
  ['players: get stuB (class B student)',               'dddAdAd', (c) => fsOf(c).doc('players/stuB').get()],
  ['players: list where teacherUid == tchA',            'ddddAdd', (c) => fsOf(c).collection('players').where('teacherUid', '==', 'tchA').get()],
  ['players: list where teacherUid == tchB',            'dddddAd', (c) => fsOf(c).collection('players').where('teacherUid', '==', 'tchB').get()],
  ['players: list all (no filter)',                     'ddddddd', (c) => fsOf(c).collection('players').get()],
  ['players: checkpoint save to stuA (real max save)',  'ddAdddd', (c) => fsOf(c).doc('players/stuA').set({ progress: SAVE_MAX, lastActive: new Date() }, { merge: true })],
  ['players: move stuA to class B',                     'ddddddd', (c) => fsOf(c).doc('players/stuA').update({ classCode: 'BBBBBB', teacherUid: 'tchB' })],
  ['players: rename stuA',                              'ddddddd', (c) => fsOf(c).doc('players/stuA').update({ username: 'other' })],
  ['players: add a field to stuA (role)',               'ddddddd', (c) => fsOf(c).doc('players/stuA').update({ role: 'teacher' })],
  ['players: delete stuA',                              'ddddddd', (c) => fsOf(c).doc('players/stuA').delete()],
  ['players: create own doc joined to class A',         'dAAAAAA', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { classCode: 'AAAAAA', teacherUid: 'tchA' })), removeOwn('players')],
  ['players: create own doc, forged teacherUid',        'ddddddd', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { classCode: 'BBBBBB', teacherUid: 'tchA' })), removeOwn('players')],
  ['players: create a doc for someone else',            'ddddddd', (c) => fsOf(c).doc('players/zzz').set(OWN_PLAYER())],
  ['players: create own doc with the real max save',    'dAAAAAA', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { progress: SAVE_MAX })), removeOwn('players')],
  ['players: create own doc with the real fresh save',  'dAAAAAA', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { progress: SAVE_FRESH })), removeOwn('players')],
  ['players: create own doc, ~900 KB junk in progress', 'ddddddd', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { progress: { blob: 'x'.repeat(900000) } })), removeOwn('players')],
  ['players: create own doc, unknown save module',      'ddddddd', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { progress: progress({ cheats: { on: true } }) })), removeOwn('players')],
  ['players: create own doc, 1001 nodeProgress keys',   'ddddddd', (c, w) => fsOf(c).doc('players/' + UID[w]).set(OWN_PLAYER(w, { progress: progress({ nodeProgress: BIG_NODE_PROGRESS }) })), removeOwn('players')],
  // ── /teachers ─────────────────────────────────────────────────────────────
  ['teachers: create own, inviteCode ""',               'ddddAAd', (c, w) => fsOf(c).doc('teachers/' + UID[w]).set({ email: 'e', inviteCode: '', displayName: 'X' }), removeOwn('teachers')],
  ['teachers: create own, live invite code',            'ddddAAd', (c, w) => fsOf(c).doc('teachers/' + UID[w]).set({ email: 'e', inviteCode: 'TESTLIVE' }), removeOwn('teachers')],
  ['teachers: create own, inactive invite code',        'ddddddd', (c, w) => fsOf(c).doc('teachers/' + UID[w]).set({ email: 'e', inviteCode: 'TESTDEAD' }), removeOwn('teachers')],
  ['teachers: create own, unknown invite code',         'ddddddd', (c, w) => fsOf(c).doc('teachers/' + UID[w]).set({ email: 'e', inviteCode: 'NOSUCH12' }), removeOwn('teachers')],
  ['teachers: create own with devTools:true',           'ddddddd', (c, w) => fsOf(c).doc('teachers/' + UID[w]).set({ email: 'e', inviteCode: '', devTools: true }), removeOwn('teachers')],
  ['teachers: create one for someone else',             'ddddddd', (c) => fsOf(c).doc('teachers/zzz').set({ email: 'e', inviteCode: '' })],
  ['teachers: tchA sets devTools true',                 'ddddddd', (c) => fsOf(c).doc('teachers/tchA').update({ devTools: true })],
  ['teachers: tchA changes inviteCode',                 'ddddddd', (c) => fsOf(c).doc('teachers/tchA').update({ inviteCode: 'TESTLIVE' })],
  ['teachers: tchA edits displayName',                  'ddddAdd', (c) => fsOf(c).doc('teachers/tchA').update({ displayName: 'Ms Alvarez' })],
  ['teachers: get tchA',                                'ddddAdd', (c) => fsOf(c).doc('teachers/tchA').get()],
  ['teachers: get tchB',                                'dddddAd', (c) => fsOf(c).doc('teachers/tchB').get()],
  ['teachers: list all',                                'ddddddd', (c) => fsOf(c).collection('teachers').get()],
  ['teachers: delete tchA',                             'ddddddd', (c) => fsOf(c).doc('teachers/tchA').delete()],
  // ── /classes ──────────────────────────────────────────────────────────────
  ['classes: get AAAAAA by id',                         'dAAAAAA', (c) => fsOf(c).doc('classes/AAAAAA').get()],
  ['classes: get a missing code',                       'dAAAAAA', (c) => fsOf(c).doc('classes/ZZZZZZ').get()],
  ['classes: list all',                                 'ddddddd', (c) => fsOf(c).collection('classes').get()],
  ['classes: create one owned by self',                 'ddddAAd', (c, w) => fsOf(c).doc('classes/NEWCOD').set({ ownerUid: UID[w], active: true, label: 'L' })],
  ['classes: create one owned by tchB',                 'dddddAd', (c) => fsOf(c).doc('classes/NEWCOD').set({ ownerUid: 'tchB', active: true, label: 'L' })],
  ['classes: overwrite BBBBBB with set()',              'dddddAd', (c, w) => fsOf(c).doc('classes/BBBBBB').set({ ownerUid: UID[w], active: true, label: 'mine' })],
  ['classes: rename / deactivate AAAAAA',               'ddddAdd', (c) => fsOf(c).doc('classes/AAAAAA').update({ active: false, label: 'renamed' })],
  ['classes: transfer AAAAAA to tchB',                  'ddddddd', (c) => fsOf(c).doc('classes/AAAAAA').update({ ownerUid: 'tchB' })],
  ['classes: delete AAAAAA',                            'ddddddd', (c) => fsOf(c).doc('classes/AAAAAA').delete()],
  // ── /sessions ─────────────────────────────────────────────────────────────
  ['sessions: create a real game session (own uid)',    'dAAAAAA', (c, w) => fsOf(c).doc('sessions/new-' + w).set({ ...PLAY_LOG, uid: UID[w] })],
  ['sessions: create a funnel event (own uid)',         'dAAAAAA', (c, w) => fsOf(c).doc('sessions/funnel-' + w).set({ type: 'funnel', event: 'otzi_result', isTestSession: false, tz: 'America/Chicago', createdAt: new Date(), outcome: 'win', attempt: '1', uid: UID[w] })],
  ['sessions: create claiming uid = stuB',              'dddAddd', (c, w) => fsOf(c).doc('sessions/spoof-' + w).set({ uid: 'stuB', outcome: 'player' })],
  ['sessions: create with no uid',                      'ddddddd', (c, w) => fsOf(c).doc('sessions/nouid-' + w).set({ outcome: 'player' })],
  ['sessions: create with ~900 KB junk field',          'ddddddd', (c, w) => fsOf(c).doc('sessions/big-' + w).set({ uid: UID[w], junk: 'x'.repeat(900000) })],
  ['sessions: create with an unknown field',            'ddddddd', (c, w) => fsOf(c).doc('sessions/odd-' + w).set({ uid: UID[w], isTeacher: true })],
  ['sessions: create with 41 turns',                    'ddddddd', (c, w) => fsOf(c).doc('sessions/long-' + w).set({ uid: UID[w], turns: Array.from({ length: 41 }, (_, i) => ({ turn: i })) })],
  ['sessions: create with a 65-char sessionId',         'ddddddd', (c, w) => fsOf(c).doc('sessions/sid-' + w).set({ uid: UID[w], sessionId: 'x'.repeat(65) })],
  ['sessions: read s-stuA',                             'ddddddd', (c) => fsOf(c).doc('sessions/s-stuA').get()],
  ['sessions: list',                                    'ddddddd', (c) => fsOf(c).collection('sessions').get()],
  ['sessions: update s-stuA outcome',                   'ddAdddd', (c) => fsOf(c).doc('sessions/s-stuA').update({ outcome: 'ai', completed: true })],
  ['sessions: overwrite s-stuB with set()',             'dddAddd', (c) => fsOf(c).doc('sessions/s-stuB').set({ uid: 'stuB', outcome: 'draw' })],
  ['sessions: owner hands s-stuA uid to stuB',          'ddddddd', (c) => fsOf(c).doc('sessions/s-stuA').update({ uid: 'stuB' })],
  ['sessions: delete s-stuA',                           'ddddddd', (c) => fsOf(c).doc('sessions/s-stuA').delete()],
  // ── /invites, /notices, everything else ───────────────────────────────────
  ['invites: get a live code',                          'ddddddd', (c) => fsOf(c).doc('invites/TESTLIVE').get()],
  ['invites: get a missing code',                       'ddddddd', (c) => fsOf(c).doc('invites/GUESS1').get()],
  ['invites: list',                                     'ddddddd', (c) => fsOf(c).collection('invites').get()],
  ['invites: create one',                               'ddddddd', (c) => fsOf(c).doc('invites/MINE').set({ active: true })],
  ['notices: get notices/stuA',                         'ddAdddd', (c) => fsOf(c).doc('notices/stuA').get()],
  ['notices: write own',                                'ddddddd', (c, w) => fsOf(c).doc('notices/' + UID[w]).set({ text: 'x' })],
  ['other: write /admins/{self}',                       'ddddddd', (c, w) => fsOf(c).doc('admins/' + UID[w]).set({ admin: true })],
  ['other: read /config/app',                           'ddddddd', (c) => fsOf(c).doc('config/app').get()],
  // ── Realtime Database (deny-all while multiplayer is off) ─────────────────
  ['rtdb: read root',                                   'ddddddd', (c) => c.database().ref('/').once('value')],
  ['rtdb: write /tournaments/12345',                    'ddddddd', (c) => c.database().ref('/tournaments/12345').set({ host: 'me' })],
  ['rtdb: write /quickMatches/m1',                      'ddddddd', (c) => c.database().ref('/quickMatches/m1').set({ p1: 'me' })],
];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    database:  { rules: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
after(async () => { await env.cleanup(); });

for (const [name, expected, op, prepare] of OPS) {
  test('matrix — ' + name, async () => {
    assert.equal(expected.length, WHO.length, 'one expectation per identity');
    let got = '';
    for (const w of WHO) {
      await seed();
      if (prepare) await prepare(w);
      got += await outcome(op(ctx[w](), w));
    }
    const show = (s) => WHO.map((w, i) => w + ':' + (s[i] === 'A' ? 'ALLOW' : 'deny')).join('  ');
    assert.equal(got, expected, '\n  expected ' + show(expected) + '\n  got      ' + show(got));
  });
}

// The two real save snapshots must also survive a merge onto an existing doc
// (checkpointSave), and the play-log / abandoned-session shapes analytics writes.
test('matrix — every analytics write shape is accepted for its owner', async () => {
  await seed();
  const db = ctx.studentA().firestore();
  const ref = db.doc('sessions/real-1');
  await ref.set({ ...PLAY_LOG, uid: 'stuA', sessionId: 'real-1', timestamp: new Date(), startedAtClient: new Date().toISOString(), clientTzOffsetMin: -300, clientTimeZone: 'America/Chicago', completed: false, outcome: null, turnDurations: [], locationScores: [] });
  await ref.set({ turns: PLAY_LOG.turns }, { merge: true });
  await ref.set({ turnDurations: [12, 30, 41] }, { merge: true });
  await ref.set({ completed: true, outcome: 'player', locationScores: [{ location: 'Uruk', playerIP: 9, aiIP: 4, winner: 'player' }], playerTotal: 20, aiTotal: 11, usedTiebreaker: false, board: PLAY_LOG.board, finishedAt: new Date(), finishedAtClient: new Date().toISOString() }, { merge: true });
  // Abandoned-game flush, onto a doc that never reached the server.
  await db.doc('sessions/abandoned-1').set({ uid: 'stuA', completed: false, outcome: 'abandoned', turnDurations: [5], abandonedAt: new Date().toISOString(), logVersion: 1, battleId: 'gilgamesh', tier: 'serf', locations: PLAY_LOG.locations, turns: PLAY_LOG.turns, board: null }, { merge: true });
});

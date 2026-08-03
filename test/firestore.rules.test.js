'use strict';

// Firestore security rules test suite for AUTH_SPEC.md Phase 0.
// Run via `npm run test:rules` (spins up the Firestore emulator, then
// runs this file with node's built-in test runner).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-shoulders-of-giants';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Seed helper: writes bypass security rules entirely, same as an admin SDK would.
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore());
  });
}

test('student A cannot read student B', async () => {
  await seed(async (db) => {
    await db.doc('players/studentA').set({
      username: 'bronze-anvil-quarry',
      classCode: '',
      teacherUid: '',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    });
    await db.doc('players/studentB').set({
      username: 'silver-oak-harbor',
      classCode: '',
      teacherUid: '',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    });
  });

  const asStudentA = testEnv.authenticatedContext('studentA').firestore();

  // Sanity check: a student CAN read their own doc.
  await assertSucceeds(asStudentA.doc('players/studentA').get());

  // The actual assertion: student A cannot read student B's doc.
  await assertFails(asStudentA.doc('players/studentB').get());
});

test('teacher A cannot list teacher B players', async () => {
  await seed(async (db) => {
    await db.doc('players/studentOfA').set({
      username: 'bronze-anvil-quarry',
      classCode: 'TESTAB',
      teacherUid: 'teacherA',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    });
    await db.doc('players/studentOfB').set({
      username: 'silver-oak-harbor',
      classCode: 'OTHERB',
      teacherUid: 'teacherB',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    });
  });

  const asTeacherB = testEnv.authenticatedContext('teacherB').firestore();

  // Sanity check: teacher B CAN list their own roster.
  await assertSucceeds(
    asTeacherB.collection('players').where('teacherUid', '==', 'teacherB').get()
  );

  // The actual assertion: teacher B cannot list teacher A's roster.
  await assertFails(
    asTeacherB.collection('players').where('teacherUid', '==', 'teacherA').get()
  );
});

test('student cannot create a player doc with a forged teacherUid', async () => {
  await seed(async (db) => {
    await db.doc('classes/TESTAB').set({
      ownerUid: 'teacherA',
      label: 'Mr. S — Period 3',
      active: true,
      createdAt: new Date(),
    });
  });

  const asStudentX = testEnv.authenticatedContext('studentX').firestore();

  // Forged teacherUid: class TESTAB is really owned by teacherA.
  await assertFails(
    asStudentX.doc('players/studentX').set({
      username: 'gold-fern-meadow',
      classCode: 'TESTAB',
      teacherUid: 'not-teacherA',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    })
  );

  // Sanity check: the honest teacherUid for the same class code succeeds.
  await assertSucceeds(
    asStudentX.doc('players/studentX').set({
      username: 'gold-fern-meadow',
      classCode: 'TESTAB',
      teacherUid: 'teacherA',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    })
  );
});

test('student cannot update their own classCode', async () => {
  await seed(async (db) => {
    await db.doc('classes/TESTAB').set({
      ownerUid: 'teacherA',
      label: 'Mr. S — Period 3',
      active: true,
      createdAt: new Date(),
    });
    await db.doc('players/studentY').set({
      username: 'copper-elm-hollow',
      classCode: 'TESTAB',
      teacherUid: 'teacherA',
      progress: {},
      createdAt: new Date(),
      lastActive: new Date(),
    });
  });

  const asStudentY = testEnv.authenticatedContext('studentY').firestore();

  // Relocating into a different roster mid-year: denied.
  await assertFails(
    asStudentY.doc('players/studentY').set(
      { classCode: 'OTHERCODE', teacherUid: 'teacherA', username: 'copper-elm-hollow' },
      { merge: true }
    )
  );

  // Clearing classCode to go ungrouped: also denied (same pinning rule).
  await assertFails(
    asStudentY.doc('players/studentY').set(
      { classCode: '', teacherUid: '', username: 'copper-elm-hollow' },
      { merge: true }
    )
  );

  // Sanity check: updating progress/lastActive while classCode stays pinned succeeds.
  await assertSucceeds(
    asStudentY.doc('players/studentY').set(
      {
        classCode: 'TESTAB',
        teacherUid: 'teacherA',
        username: 'copper-elm-hollow',
        lastActive: new Date(),
      },
      { merge: true }
    )
  );
});

test('sessions can be created when signed in, and are never readable', async () => {
  const asStudentZ = testEnv.authenticatedContext('studentZ').firestore();

  await assertSucceeds(
    asStudentZ.doc('sessions/session-1').set({
      sessionId: 'session-1',
      uid: 'studentZ',
      timestamp: new Date(),
      difficulty: 'easy',
      gameMode: 'standard',
      completed: false,
      outcome: null,
    })
  );

  // No client can read a session back, not even the one who wrote it.
  await assertFails(asStudentZ.doc('sessions/session-1').get());

  const asAnonymous = testEnv.unauthenticatedContext().firestore();

  // Signed out entirely: create is denied too.
  await assertFails(
    asAnonymous.doc('sessions/session-2').set({
      sessionId: 'session-2',
      timestamp: new Date(),
    })
  );
});

test('session owner can update their own session doc; a different user and an anonymous user cannot', async () => {
  await seed(async (db) => {
    await db.doc('sessions/session-owner-test').set({
      sessionId: 'session-owner-test',
      uid: 'studentZ',
      timestamp: new Date(),
      difficulty: 'easy',
      gameMode: 'standard',
      completed: false,
      outcome: null,
    });
  });

  const asStudentZ     = testEnv.authenticatedContext('studentZ').firestore();
  const asSomeoneElse  = testEnv.authenticatedContext('someoneElse').firestore();
  const asAnonymous    = testEnv.unauthenticatedContext().firestore();

  // A different signed-in user cannot update studentZ's session.
  await assertFails(
    asSomeoneElse.doc('sessions/session-owner-test').set(
      { completed: true, outcome: 'player' },
      { merge: true }
    )
  );

  // An unauthenticated user cannot update it either.
  await assertFails(
    asAnonymous.doc('sessions/session-owner-test').set(
      { completed: true, outcome: 'player' },
      { merge: true }
    )
  );

  // The owner CAN update their own session doc (turn durations, outcome, etc.
  // as the game progresses).
  await assertSucceeds(
    asStudentZ.doc('sessions/session-owner-test').set(
      { completed: true, outcome: 'player', turnDurations: [12, 8, 15] },
      { merge: true }
    )
  );
});

test('a session doc created without a uid cannot be updated by anyone', async () => {
  await seed(async (db) => {
    await db.doc('sessions/session-no-uid').set({
      sessionId: 'session-no-uid',
      // no uid field — e.g. a doc from before this field existed.
      timestamp: new Date(),
      difficulty: 'easy',
      gameMode: 'standard',
      completed: false,
      outcome: null,
    });
  });

  const asStudentZ  = testEnv.authenticatedContext('studentZ').firestore();
  const asAnonymous = testEnv.unauthenticatedContext().firestore();

  // No signed-in uid ever equals a missing field — permanently update-locked,
  // not even by a plausible-looking owner.
  await assertFails(
    asStudentZ.doc('sessions/session-no-uid').set({ completed: true }, { merge: true })
  );
  await assertFails(
    asAnonymous.doc('sessions/session-no-uid').set({ completed: true }, { merge: true })
  );
});

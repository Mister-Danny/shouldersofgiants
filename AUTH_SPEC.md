# Shoulders of Giants — Account System Spec

Drop this in the repo root and point Claude Code at it. Build in phase order; do not skip Phase 0.

---

## 1. Locked decisions

| Decision | Value |
|---|---|
| Student identity | Generated username + generated 3-word passphrase. No student typing, no PII. |
| Student recovery | None. Progress loss is acceptable. Printed card is the only backup. |
| Teacher identity | Real email + password. Uses Firebase's built-in reset flow. |
| Invite code | Gates **teacher** signup. Distributed via TPT / LinkedIn DM. Rotatable. |
| Class code | Gates **student** signup. Per teacher, per period. Teacher-generated, not freeform. |
| Source of truth | localStorage. Firestore is a mirror, written at checkpoints only. |
| Save granularity | One document per player. Whole-doc write = 1 billed write regardless of payload. |
| Anonymous auth | ON. Every visitor gets an anon uid at load. See §2. |

### Why anonymous auth

Three problems collapse into one solution:

1. Guest → student upgrade uses `linkWithCredential`, which **preserves the uid**. Progress carries over with no migration step.
2. No unauthenticated Firestore reads anywhere, so the student can fetch a class label before signing up without opening a public read hole.
3. Teacher demoing as guest can convert without losing their poke-around save.

Cost: every random visitor creates an Auth user record. Mitigated by the `lastActive` field and periodic pruning (Phase 5). Auth user count is free; this is housekeeping, not billing.

---

## 2. Data model

Document IDs matter — they enforce uniqueness at the database level rather than in application code.

```
/invites/{CODE}          # CODE is the doc ID, uppercase
  active: bool
  label: string          # "linkedin-aug-2026" — tells you which channel converts
  createdAt: timestamp

/teachers/{uid}
  email: string
  inviteCode: string     # which code they came in on
  displayName: string
  createdAt: timestamp

/classes/{CODE}          # CODE is the doc ID
  ownerUid: string
  label: string          # "Mr. S — Period 3"
  active: bool
  createdAt: timestamp

/players/{uid}
  username: string
  classCode: string      # '' for ungrouped
  teacherUid: string     # '' for ungrouped — denormalized, see below
  progress: map
  createdAt: timestamp
  lastActive: timestamp
```

**`teacherUid` is denormalized onto the player doc on purpose.** Firestore evaluates security rules against the *query*, not the results. A dashboard query of `where('teacherUid','==',myUid)` can be authorized in one pass. Resolving the class doc per-result inside rules gets slow and ugly.

The student writes that field at signup, so it must be validated on create rather than trusted. The rules below do that.

### Code format

Generate from an unambiguous alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O`, no `1/I/L`). These get read off a whiteboard. Class codes 6 chars, invite codes 8.

---

## 3. firestore.rules

Deploy this **before** writing any real data.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function classDoc(code) {
      return get(/databases/$(database)/documents/classes/$(code)).data;
    }

    // Invite codes: never client-readable, in any form.
    // Validation happens via get() inside rules, which is server-side
    // and does not require client read permission.
    match /invites/{code} {
      allow read, write: if false;
    }

    // Classes: fetchable by exact ID so the student can see
    // "Joining: Mr. S — Period 3" before committing.
    // list is denied, so codes cannot be enumerated.
    match /classes/{code} {
      allow get:    if signedIn();
      allow list:   if false;
      allow create: if signedIn()
                    && request.resource.data.ownerUid == request.auth.uid
                    && exists(/databases/$(database)/documents/teachers/$(request.auth.uid));
      allow update: if signedIn()
                    && resource.data.ownerUid == request.auth.uid
                    && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if false;
    }

    match /teachers/{uid} {
      allow get:    if signedIn() && request.auth.uid == uid;
      allow list:   if false;
      allow create: if signedIn()
                    && request.auth.uid == uid
                    && get(/databases/$(database)/documents/invites/$(request.resource.data.inviteCode)).data.active == true;
      allow update: if signedIn()
                    && request.auth.uid == uid
                    && request.resource.data.inviteCode == resource.data.inviteCode;
      allow delete: if false;
    }

    match /players/{uid} {
      allow get:    if signedIn()
                    && (request.auth.uid == uid
                        || resource.data.teacherUid == request.auth.uid);

      allow list:   if signedIn()
                    && resource.data.teacherUid == request.auth.uid;

      allow create: if signedIn()
                    && request.auth.uid == uid
                    && (
                         // ungrouped play
                         (request.resource.data.classCode == ''
                          && request.resource.data.teacherUid == '')
                         ||
                         // joined to a live class, teacherUid must match reality
                         (classDoc(request.resource.data.classCode).active == true
                          && classDoc(request.resource.data.classCode).ownerUid
                             == request.resource.data.teacherUid)
                       );

      // Pin class membership: a student cannot relocate into
      // another teacher's roster mid-year.
      allow update: if signedIn()
                    && request.auth.uid == uid
                    && request.resource.data.classCode == resource.data.classCode
                    && request.resource.data.teacherUid == resource.data.teacherUid
                    && request.resource.data.username == resource.data.username;

      allow delete: if request.auth.uid == uid;
    }

    // Sessions: pre-existing analytics telemetry (js/analytics.js), predates
    // this spec. Write-only — no client ever reads it back; the bypass.js
    // Data Review panel is a teacher-console tool that will need to move
    // behind a Cloud Function or admin SDK rather than a client-side get/list.
    // Session docs carry a `uid` field (the authenticated writer's uid) set
    // at creation, and the owner may update their own doc thereafter (turn
    // durations, outcome, etc. get merged in as the game progresses) — a doc
    // created without a uid can never satisfy resource.data.uid == auth.uid
    // for anyone, so it's permanently update-locked. This makes session docs
    // client-writable by their owner: analytics data is NOT tamper-proof
    // (a student could, in principle, rewrite their own session's outcome),
    // which is an accepted tradeoff for now since nothing reads this data
    // back client-side and it isn't used for grading or progress-gating.
    match /sessions/{sessionId} {
      allow read:   if false;
      allow create: if signedIn();
      allow update: if signedIn() && resource.data.uid == request.auth.uid;
      allow delete: if false;
    }
  }
}
```

Note: `get()` calls inside rules are billed reads and capped at 10 per request. Only the create paths use them, so the cost is negligible.

**Write emulator tests for these before shipping.** At minimum: student A cannot read student B; teacher A cannot list teacher B's players; a student cannot create with a forged `teacherUid`; a student cannot update their own `classCode`; a session owner can update their own session doc while a different signed-in user and an anonymous user cannot; a session doc created without a `uid` cannot be updated by anyone.

### Out of scope: Realtime Database

`multiplayer.js` (`tournaments/{code}`), `battlelobby.js` (`versus/{code}`), and `match.js` (`tournaments/{code}/matches/{matchId}`) run on **Realtime Database**, a separate product with its own rules file, not `firestore.rules`. Those rules are currently wide open by explicit design comment in the code ("refine before production"). This spec's Auth/Firestore model does not lock them down — anonymous Auth alone has no effect on RTDB access unless its rules are separately updated to require `auth != null`. Locking down RTDB is explicitly **out of scope for this branch** and should be its own pass.

---

## 4. Flow order-of-operations

Order matters here — get it wrong and you strand orphaned Auth users with no Firestore doc.

### Guest
1. On load, `signInAnonymously()`. The codebase already has two independent Firebase apps — the default app (js/analytics.js) and a named `'rtdb'` app (js/multiplayer.js). Anonymous auth targets the **default app**; the `'rtdb'` app is untouched by this spec (see Out of scope: Realtime Database, §3).
2. First-launch modal: progress saves to this device only, clearing browser data wipes it.
3. Persistent corner strip: `Guest — progress saved on this device only` + a "Create an account" affordance.
4. No Firestore writes at all. localStorage only.

### Naming note: new localStorage keys

`sog_teacher_code` already exists (multiplayer.js/battlelobby.js) as an RTDB tournament join-code convenience value — unrelated to the `/teachers/{uid}` Firestore concept introduced here. To avoid confusion between the two "teacher" notions, any client-side caching of the new class/invite codes uses distinct keys: **`sog_class_code`** and **`sog_invite_code`**.

### Student signup
1. Student enters class code.
2. `getDoc(classes/CODE)` → if missing or `active === false`, fail here with a clear message. **This is the pre-validation step that avoids orphans.**
3. Show `Joining: Mr. S — Period 3`. Require confirmation. A mistyped code now fails visibly instead of silently landing them in a stranger's roster.
4. Generate username + passphrase. Build synthetic email `username@sog.invalid` (`.invalid` is RFC 2606 reserved — can never route anywhere real).
5. `linkWithCredential(EmailAuthProvider.credential(...))` on the existing anon user. Preserves uid, carries guest progress.
   - On `auth/email-already-in-use`: regenerate username, retry. Cap at 5 attempts, then append digits.
6. Write `/players/{uid}` including any localStorage progress.
7. **Credential card screen.** Big, printable, with the no-recovery warning. Checkbox confirmation required before it can be dismissed.

### Teacher signup
Invites are `read: false`, so there is no pre-validation step. Use create-then-rollback:

1. Collect email, password, display name, invite code.
2. `createUserWithEmailAndPassword` (do *not* link the anon user — teachers should be a clean account).
3. Attempt write to `/teachers/{uid}`.
4. **If the write fails** (bad or deactivated invite code), call `user.delete()` on the currently signed-in user and surface "That code isn't valid." No orphan left behind.

Tradeoff, stated plainly: keeping invites unreadable means brute-forcing a code requires account creation, which Firebase rate-limits. Making them gettable would allow cheap read-based guessing. The rollback dance is worth it here; for class codes it is not, since a leaked class code just means someone joins a roster.

### Class code creation (teacher)
1. Teacher clicks Generate. Client generates a candidate code.
2. Attempt create at `/classes/{CODE}` — collision surfaces as a rules/exists failure, retry with a new candidate.
3. Display large. Offer **Regenerate** (creates new) and **Deactivate** (`active: false`). Leaked-code remediation is one click.

### Checkpoint save
Whole `/players/{uid}` doc, `merge: true`, bump `lastActive`. Wrap in try/catch — on failure, keep playing from localStorage silently. Never block gameplay on a network write.

### Signup failure fallback
Firebase Auth rate-limits account creation per IP, and a district NATs a whole campus behind a few addresses. 35 students hitting signup in three minutes looks like abuse. Catch the throttle error and drop them into local-only play with a "cloud save unavailable, progress saved on this device" note. No blocked kid, no teacher pinging you mid-period.

---

## 5. Build phases

**Phase 0 — Foundation.** Add the `firebase-auth-compat.js` script tag to index.html (the Auth SDK isn't loaded today — only firestore-compat and database-compat are). Deploy rules. Enable Anonymous + Email/Password providers. Emulator test suite. Seed one invite doc by hand in the console.

**Phase 1 — Save-state aggregator.** Progress currently lives across ~10 independent localStorage-owning modules (decks.js, progression.js, sog-collection.js, sog-gold.js, sog-focus.js, overworld.js, tutorial.js/dbtutorial.js, the per-chapter sog-adventure-*.js files, and misc UI prefs) with no single aggregate object. Build `js/save-state.js`: a single module that collects a snapshot across all of these modules' keys and can restore them back, so later phases have one object to write to and read from `/players/{uid}.progress` rather than reaching into a dozen modules individually. This is pure localStorage-side plumbing — no Firebase calls in this phase.

**Phase 2 — Guest.** Anon sign-in on load, cache-warning modal, persistent guest strip. Everything else keeps working exactly as today.

**Phase 3 — Student accounts.** Username/passphrase generator, credential card UI, link flow, checkpoint writes (using the Phase 1 aggregator for the `progress` map). *Seed a `/classes/TESTAB` doc by hand so this can be built and tested before the teacher side exists.*

**Phase 4 — Teacher signup.** Invite code validation, rollback on failure, teacher doc creation.

**Phase 5 — Teacher dashboard.** Class code generate/deactivate, roster query on `teacherUid`. Keep it coarse: furthest progress reached, learning-check totals, time played, last active. **Do not store per-question correctness** — that turns a progress tracker into an assessment record, which is a heavier compliance category.

**Phase 6 — Housekeeping.** Prune script for anon users with no player doc and stale `lastActive`. Rotate the invite code, add a new one labeled for the next channel.

---

## 6. The roster mapping

The teacher sees `bronze-anvil-quarry — furthest: Narmer / Egypt`. Useless for grading unless someone holds the name↔username mapping.

**The teacher keeps that mapping in their own spreadsheet.** They already have legitimate access to their roster; you never receive a student name. That is a strong, simple line for any SOPIPA / AB 1584 conversation with a district.

It only holds if usernames are generated. One teacher telling 35 kids "just use your first name and last initial" undoes it silently and you would never know. Which is the argument for never shipping a username input field at all.

### Learning Checks: aggregate counts only

The roster's "Learning Checks" column shows two running totals — questions answered correctly, and questions answered in total (e.g. `12 / 15`) — sourced from `/players/{uid}.progress.modules.learningCheck`. This is deliberately the same coarseness contract as the rest of the roster:

- **Stored:** exactly two integers, `correct` and `total`. Incremented in place on every answer; nothing else.
- **Never stored:** which question was asked, which option was picked, whether a specific question was missed, timestamps per question, or any other per-item detail. There is no question ID or log anywhere in the data model.
- **Why:** two integers are a progress signal — "this kid is engaging with the material." A per-question log is an assessment record, which is a meaningfully heavier compliance category (see Phase 5's own note above) and isn't something a district conversation should need to account for. If a future feature wants per-question analytics, that decision needs to be made deliberately and separately — it does not fall out of this feature by accident.
- Same rule applies to any future roster metric: aggregate-only by default; per-item detail requires an explicit, separate design decision.

---

## 7. Open items

- Auto-approve teachers, or gate the dashboard on `approved: true`? Recommend auto-approve; add friction only if abuse appears.
- Teacher-triggered student password reset via a Cloud Function with admin credentials — build only when teachers actually ask.
- Invite code rotation cadence. Seasonal is a reasonable default.

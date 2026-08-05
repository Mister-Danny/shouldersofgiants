/**
 * account.js — Student + teacher account signup/login/checkpoints
 * (AUTH_SPEC.md Phase 3 students, Phase 4 teachers)
 *
 * Pure logic layer — no DOM. js/account-ui.js drives the modal UI and calls
 * into the functions exposed here. Firebase-only; reuses the default app
 * already initialized by js/analytics.js (same app js/auth.js signs in
 * anonymously against).
 *
 * Order of operations follows AUTH_SPEC.md §4 "Student signup" exactly:
 *   1. Class code entered (validated by lookupClassCode before anything else
 *      is generated — this is the pre-validation step that avoids orphaned
 *      Auth users described in the spec).
 *   2. Confirmation (UI layer shows the class label back).
 *   3. UI layer calls generateUsernameOptions()/generatePassphrase() up front
 *      (before its "Conjuring…" animation even starts) so the student's
 *      credentials exist in memory before any Firebase call is made, and
 *      picks one of the 5 options.
 *   4. linkWithCredential() upgrades the EXISTING anonymous user in place —
 *      preserves the uid, so guest progress carries over with no migration.
 *   5. On auth/email-already-in-use, a fresh single username is generated and
 *      retried (capped at MAX_USERNAME_ATTEMPTS) — vanishingly rare given the
 *      figure/epithet/digit combination space, but still handled.
 *   6. /players/{uid} is written with the Phase 1 SaveState snapshot as
 *      `progress` — this write IS the "checkpoint at account creation".
 *   7. UI layer shows the credential card.
 *
 * Teacher signup (signUpTeacher, below) follows §4 "Teacher signup" exactly
 * instead — create-then-rollback, since invites are unreadable client-side
 * so there's no pre-validation step available. See that function's doc.
 *
 * Checkpoint saves (checkpointSave()) fire from exactly three places in the
 * app: after a battle win (js/game.js endGame()), the account-creation write
 * (student OR teacher, both below), and logout() below. Nowhere else.
 * Teachers get a /players/{uid} doc too (ungrouped shape — empty classCode/
 * teacherUid, same as a student who joined no class) so their own adventure
 * progress round-trips across devices exactly like a student's. That doc's
 * empty teacherUid is what keeps it out of every roster query (js/
 * teacher-dashboard.js queries `where('teacherUid','==',myUid)`, which an
 * empty string can never match, including the teacher's own) — no separate
 * filtering needed.
 */
window.SogAccount = (function () {
  'use strict';

  var EMAIL_DOMAIN  = '@sog.invalid';   // RFC 2606 reserved — never routes anywhere real
  var MAX_USERNAME_ATTEMPTS = 5;        // collision retries before giving up (see _tryLink)
  var OPTIONS_PER_ROLL = 5;             // credential-card "SUMMON" reveal count
  var LINK_TIMEOUT_MS  = 15000;         // linkWithCredential should never hang the "Creating…" step silently
  var WRITE_TIMEOUT_MS = 15000;         // same for the /players/{uid} write

  // Must match js/auth.js's own PROGRESS_OWNER_UID_KEY exactly — that file
  // stamps this on every anonymous bootstrap/restore; this file both reads
  // it (signUpStudent) and stamps it itself (loginStudent, checkpointSave)
  // so a real account's uid is also on record, not just anonymous ones.
  var PROGRESS_OWNER_UID_KEY = 'sog_progress_owner_uid';

  function _stampProgressOwner(uid) {
    if (!uid) return;
    try { localStorage.setItem(PROGRESS_OWNER_UID_KEY, uid); } catch (e) {}
  }

  // Guards against carrying a DIFFERENT account's leftover progress into a
  // brand-new signup — e.g. Firebase's persisted session was lost (cleared
  // cookies, a fresh profile, whatever) while localStorage itself was not,
  // so a freshly-bootstrapped anonymous uid would otherwise inherit
  // whoever's data was last written here. Only trusts localStorage when its
  // stamped owner matches the uid being upgraded, or when there's no stamp
  // at all (nothing to contradict — first-ever visit, or data older than
  // this check existing).
  function _localProgressBelongsToCurrentSession(uid) {
    var stamped = null;
    try { stamped = localStorage.getItem(PROGRESS_OWNER_UID_KEY); } catch (e) {}
    return !stamped || stamped === uid;
  }

  // Wraps a Firebase promise so a hung request fails visibly instead of
  // leaving the UI stuck on "Creating your account…" forever. Tags the
  // rejection with auth/network-request-failed so callers that branch on
  // err.code treat a timeout the same as a real network failure.
  function _withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var err = new Error('Request timed out after ' + ms + 'ms.');
        err.code = 'auth/network-request-failed';
        reject(err);
      }, ms);
      promise.then(function (v) {
        clearTimeout(timer);
        resolve(v);
      }, function (e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function _usernameFromEmail(email) {
    if (!email) return null;
    var i = email.indexOf(EMAIL_DOMAIN);
    return i > 0 ? email.slice(0, i) : null;
  }

  // Passphrase word list — deliberately distinct flavor from the username
  // lists above (simple, concrete, easy for a middle-schooler to write down).
  var PASSPHRASE_WORDS = [
    'puppy', 'rocket', 'banana', 'thunder', 'cookie', 'rainbow', 'penguin', 'dragon',
    'bicycle', 'volcano', 'waffle', 'comet', 'tiger', 'robot', 'castle', 'dolphin'
  ];

  function _rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 1-9 only (no 0) — matches AUTH_SPEC's existing "no ambiguous characters"
  // spirit for anything a student has to read back exactly.
  function _randDigit1to9() { return String(1 + Math.floor(Math.random() * 9)); }

  function _formatUsername(figureName, epithet, digit) {
    return (figureName + 'the' + epithet + digit).toLowerCase();
  }

  function _capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // CamelCase form for the options-picker screen ONLY (e.g. "AugustusThe
  // Fabled3" -> "AugustusTheFabled3") — display formatting only. The actual
  // stored/auth username is always _formatUsername()'s all-lowercase form;
  // login normalizes to lowercase before lookup (see loginStudent below).
  function _formatUsernameDisplay(figureName, epithet, digit) {
    return _capitalize(figureName) + 'The' + _capitalize(epithet) + digit;
  }

  // Draws one random, unformatted figure+epithet pair — used both by
  // generateUsernameOptions() below and by _tryLink()'s collision retry
  // (which needs a single fresh username, not a full new roll of 5).
  function _pickRandomFigureEpithet() {
    var words = window.USERNAME_WORDS;
    return { figure: _rand(words.figures), epithet: _rand(words.epithets) };
  }

  function _pickRandomUsername() {
    var pick = _pickRandomFigureEpithet();
    return _formatUsername(pick.figure.name, pick.epithet, _randDigit1to9());
  }

  /**
   * Generates OPTIONS_PER_ROLL (5) candidate usernames for the student to
   * choose from: no repeated figure, no repeated epithet, and at least one
   * female figure guaranteed (js/data/username-words.js `female` flag).
   * Pure/synchronous — no Firebase involved, safe to call before any
   * animation so the credentials exist even if the animation is skipped.
   *
   * Returns [{ username, display }, ...] — `username` is the all-lowercase
   * form used for the real Auth credential/Firestore doc; `display` is the
   * CamelCase form shown ONLY on the options-picker screen (js/account-ui.js
   * _renderUsernameOptions). Same figure/epithet/digit underlie both, so
   * they always describe the same account.
   */
  function generateUsernameOptions(n) {
    n = n || OPTIONS_PER_ROLL;
    var figures  = window.USERNAME_WORDS.figures;
    var epithets = window.USERNAME_WORDS.epithets;
    var femaleFigures = figures.filter(function (f) { return f.female; });

    var usedFigures  = {};
    var picks = [];

    var guaranteed = _rand(femaleFigures);
    picks.push(guaranteed);
    usedFigures[guaranteed.name] = true;

    while (picks.length < n) {
      var candidate = _rand(figures);
      if (usedFigures[candidate.name]) continue;
      usedFigures[candidate.name] = true;
      picks.push(candidate);
    }

    var usedEpithets = {};
    var options = picks.map(function (figure) {
      var epithet;
      do { epithet = _rand(epithets); } while (usedEpithets[epithet]);
      usedEpithets[epithet] = true;
      var digit = _randDigit1to9();
      return {
        username: _formatUsername(figure.name, epithet, digit),
        display:  _formatUsernameDisplay(figure.name, epithet, digit)
      };
    });

    // Shuffle (Fisher-Yates) so the guaranteed female pick isn't always first.
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    return options;
  }

  // Two distinct words (no space) + two digits, e.g. "comettiger43".
  function generatePassphrase() {
    var w1 = _rand(PASSPHRASE_WORDS);
    var w2 = _rand(PASSPHRASE_WORDS);
    while (w2 === w1) { w2 = _rand(PASSPHRASE_WORDS); }
    var digits = String(10 + Math.floor(Math.random() * 90));  // 10-99, always 2 digits
    return w1 + w2 + digits;
  }

  function _db() { return firebase.firestore(); }

  /* ── Class code lookup (student signup step 1-2) ─────────────────────────
     Trims + uppercases before lookup. Blank => ungrouped play. This is the
     pre-validation step AUTH_SPEC.md §4 calls out explicitly: it runs BEFORE
     any credential is generated or linked, so a bad/mistyped code fails
     visibly here rather than stranding an orphaned Auth user later. */
  function lookupClassCode(raw, cb) {
    var code = (raw || '').trim().toUpperCase();
    if (!code) { cb(null, { ungrouped: true, code: '', label: '', ownerUid: '' }); return; }

    _db().collection('classes').doc(code).get().then(function (snap) {
      if (!snap.exists || snap.data().active !== true) {
        var err = new Error('Class code not found or no longer active.');
        err.code = 'class-not-found';
        cb(err, null);
        return;
      }
      var data = snap.data();
      cb(null, { ungrouped: false, code: code, label: data.label || code, ownerUid: data.ownerUid });
    }).catch(function (err) {
      console.error('[Account] Class code lookup failed', err);
      cb(err, null);
    });
  }

  /* ── Signup (student signup steps 3-6) ─────────────────────────────────
     username/passphrase are chosen by the UI layer BEFORE this is ever
     called (see generateUsernameOptions/generatePassphrase above) — this
     function only does the Firebase side. On a (vanishingly rare) username
     collision, it silently swaps in a fresh single username and retries;
     the student never sees this, since the credential card only renders
     once this whole chain resolves. */
  function _tryLink(user, username, passphrase, attempt, cb) {
    var email      = username + EMAIL_DOMAIN;
    var credential = firebase.auth.EmailAuthProvider.credential(email, passphrase);

    _withTimeout(user.linkWithCredential(credential), LINK_TIMEOUT_MS).then(function () {
      // Firebase does NOT fire onAuthStateChanged for linkWithCredential (see
      // js/auth.js's refresh() doc) — without this, live UI (corner strip,
      // home-screen account button) would stay stuck on "Guest"/"Create
      // Account" until the next full page reload.
      if (window.SogAuth && typeof window.SogAuth.refresh === 'function') {
        window.SogAuth.refresh();
      }
      cb(null, { username: username, passphrase: passphrase });
    }).catch(function (err) {
      console.error('[Account] linkWithCredential failed (attempt ' + attempt + ')', err);
      if (err && err.code === 'auth/email-already-in-use' && attempt <= MAX_USERNAME_ATTEMPTS) {
        _tryLink(user, _pickRandomUsername(), passphrase, attempt + 1, cb);
        return;
      }
      if (err && err.code === 'auth/provider-already-linked') {
        // This Auth user already has a password credential attached — almost
        // always means an EARLIER call to signUpStudent() in this session
        // already linked successfully but failed on the /players/{uid} write
        // below, and the student (or the UI) is now retrying. We can't
        // regenerate the lost passphrase (never persisted anywhere, by
        // design), but the account itself is real — surface the username so
        // the caller can still complete the write instead of discarding it.
        var existingUsername = _usernameFromEmail(user.email);
        cb(err, existingUsername ? { username: existingUsername, passphrase: null, alreadyLinked: true } : null);
        return;
      }
      cb(err, null);
    });
  }

  /**
   * @param {object} classInfo  result of lookupClassCode's success callback
   * @param {string} username   one of generateUsernameOptions()'s picks (the
   *   one the student clicked)
   * @param {string} passphrase from generatePassphrase(), generated in the
   *   same up-front batch as the username options
   * @param {function(err, creds)} cb  creds = { username, passphrase } (set
   *   even on a later write failure, or on an alreadyLinked retry where
   *   passphrase is null — the Auth account is real either way)
   */
  function signUpStudent(classInfo, username, passphrase, cb) {
    var user = firebase.auth().currentUser;
    if (!user) { cb(new Error('No current user to upgrade.'), null); return; }

    _tryLink(user, username, passphrase, 1, function (linkErr, creds) {
      // linkErr with no creds is a genuine failure (bad network, exhausted
      // retries, etc.) — nothing to write. linkErr WITH creds is the
      // alreadyLinked case above: still worth completing the write so
      // progress/username stay current even without a passphrase to show.
      if (linkErr && !creds) { cb(linkErr, null); return; }

      // Only carry over local progress if it actually belongs to the guest
      // session being upgraded — see _localProgressBelongsToCurrentSession
      // above. A mismatch means this device's localStorage still holds some
      // OTHER account's leftover data (Firebase session lost while
      // localStorage survived) — start this new account clean rather than
      // hand it a stranger's progress.
      var carryOverProgress = _localProgressBelongsToCurrentSession(user.uid);
      if (!carryOverProgress) {
        console.warn('[Account] localStorage progress belongs to a different account (uid mismatch) — starting new student clean.');
      }

      var playerData = {
        username:   creds.username,
        classCode:  classInfo.ungrouped ? '' : classInfo.code,
        teacherUid: classInfo.ungrouped ? '' : classInfo.ownerUid,
        progress:   carryOverProgress ? ((window.SaveState && window.SaveState.getSnapshot()) || {}) : {},
        createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      };

      // merge:true so that IF this write fails (network blip) and a later
      // checkpointSave() retries it, Firestore still evaluates the retry as
      // a 'create' (no doc exists yet) rather than a denied 'update' — this
      // self-heals without needing explicit orphan rollback.
      _withTimeout(_db().collection('players').doc(user.uid).set(playerData, { merge: true }), WRITE_TIMEOUT_MS).then(function () {
        cb(linkErr || null, creds);
      }).catch(function (writeErr) {
        console.error('[Account] /players/{uid} write failed', writeErr);
        cb(writeErr, creds);
      });
    });
  }

  /* ── Login (returning students) ──────────────────────────────────────── */
  function loginStudent(username, passphrase, cb) {
    var email = (username || '').trim().toLowerCase() + EMAIL_DOMAIN;
    firebase.auth().signInWithEmailAndPassword(email, passphrase).then(function (userCred) {
      // signInWithEmailAndPassword swaps in a different user, which normally
      // does fire onAuthStateChanged — but call refresh() explicitly anyway
      // rather than relying on that assumption (see linkWithCredential above
      // for why that assumption already failed once in this same file).
      if (window.SogAuth && typeof window.SogAuth.refresh === 'function') {
        window.SogAuth.refresh();
      }
      var uid = userCred.user.uid;
      _db().collection('players').doc(uid).get().then(function (snap) {
        if (snap.exists && snap.data().progress && window.SaveState) {
          window.SaveState.applySnapshot(snap.data().progress);
        }
        // This account's uid now owns localStorage — reinforces the stamp
        // so a later signup attempt on this same device (were it ever to
        // happen) sees the correct owner rather than a stale one.
        _stampProgressOwner(uid);
        cb(null, userCred.user);
      }).catch(function () {
        // Couldn't fetch the stored progress (offline, etc.) — still signed
        // in; this device just keeps whatever local progress it already had.
        cb(null, userCred.user);
      });
    }).catch(function (err) {
      cb(err, null);
    });
  }

  /* ── Teacher login ──────────────────────────────────────────────────────
     Real email + password, signed in directly — no synthetic domain. Restores
     /players/{uid}.progress exactly like loginStudent below, so a teacher's
     own adventure progress follows them to a new browser/device too.
     js/account-ui.js's login form branches to this vs. loginStudent above
     based on whether the entered identifier contains "@". */
  function loginTeacher(email, password, cb) {
    var normalizedEmail = (email || '').trim().toLowerCase();
    firebase.auth().signInWithEmailAndPassword(normalizedEmail, password).then(function (userCred) {
      if (window.SogAuth && typeof window.SogAuth.refresh === 'function') {
        window.SogAuth.refresh();
      }
      var uid = userCred.user.uid;
      _db().collection('players').doc(uid).get().then(function (snap) {
        if (snap.exists && snap.data().progress && window.SaveState) {
          window.SaveState.applySnapshot(snap.data().progress);
        }
        _stampProgressOwner(uid);
        cb(null, userCred.user);
      }).catch(function () {
        // Couldn't fetch the stored progress (offline, etc.) — still signed
        // in; this device just keeps whatever local progress it already had.
        cb(null, userCred.user);
      });
    }).catch(function (err) {
      cb(err, null);
    });
  }

  /* ── Teacher password reset ───────────────────────────────────────────
     Firebase's standard built-in reset — for a teacher's own real email
     account only. Students have no recovery path at all (per the
     credential card's warning); js/account-ui.js gates on "contains @"
     before ever calling this, but guard here too: a synthetic
     @sog.invalid address doesn't route anywhere real, so a reset email
     "sent" to one would silently vanish rather than erroring, which could
     mask a bug in the caller. */
  function sendPasswordReset(email, cb) {
    var normalizedEmail = (email || '').trim().toLowerCase();
    if (normalizedEmail.indexOf(EMAIL_DOMAIN) !== -1) {
      var err = new Error('Student accounts have no password recovery.');
      err.code = 'reset-not-supported';
      cb(err);
      return;
    }
    firebase.auth().sendPasswordResetEmail(normalizedEmail).then(function () {
      cb(null);
    }).catch(function (err) {
      cb(err);
    });
  }

  /* ── Teacher signup (AUTH_SPEC.md §4 "Teacher signup", Phase 4) ────────
     Invites are `read: false` (see firestore.rules), so there is no
     pre-validation step like the student class-code lookup — the invite
     code is only ever checked server-side, inside the /teachers/{uid}
     create rule's get(). That means a bad/deactivated code can't be
     detected until AFTER the Auth user already exists, so this follows the
     spec's create-then-rollback order exactly:
       1. createUserWithEmailAndPassword — a clean account, NOT linked to
          the current anonymous session (teachers don't carry over guest
          progress; real email+password so Firebase's password reset works).
       2. Attempt the /teachers/{uid} write.
       3. If that write fails, delete the just-created Auth user so no
          orphan is left behind, and surface a friendly invite-code message
          for the specific case the rules would deny (permission-denied) —
          any other failure (network, timeout) is passed through as-is
          rather than being mislabeled as a bad code. */
  function _friendlyTeacherSignupError(writeErr) {
    if (writeErr && writeErr.code === 'permission-denied') {
      var err = new Error("That code isn't valid.");
      err.code = 'invite-invalid';
      return err;
    }
    return writeErr;
  }

  /**
   * @param {object} opts  { email, password, displayName, inviteCode }
   * @param {function(err, result)} cb  result = { uid, email, displayName }
   */
  function signUpTeacher(opts, cb) {
    var email       = (opts.email || '').trim();
    var password    = opts.password || '';
    var displayName = (opts.displayName || '').trim();
    var inviteCode  = (opts.inviteCode || '').trim().toUpperCase();

    _withTimeout(firebase.auth().createUserWithEmailAndPassword(email, password), LINK_TIMEOUT_MS)
      .then(function (userCred) {
        var user = userCred.user;

        var teacherData = {
          email:       email,
          inviteCode:  inviteCode,
          displayName: displayName,
          createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        _withTimeout(_db().collection('teachers').doc(user.uid).set(teacherData), WRITE_TIMEOUT_MS)
          .then(function () {
            // createUserWithEmailAndPassword reliably fires onAuthStateChanged
            // (a genuinely different signed-in user, unlike linkWithCredential
            // above) but refresh() explicitly anyway per this file's established
            // "don't assume, verify" rule for auth-state notifications.
            if (window.SogAuth && typeof window.SogAuth.refresh === 'function') {
              window.SogAuth.refresh();
            }

            // Bootstrap the teacher's OWN /players/{uid} doc — same ungrouped
            // shape a classless student gets (empty classCode/teacherUid) —
            // so their own adventure progress gets cloud-saved too. Clean
            // start, not the local device's guest progress: this is a brand
            // new Auth user (never linked to the anonymous session), so
            // whatever's in localStorage right now belongs to whichever
            // guest was last using this device, not this teacher.
            var playerData = {
              username:   displayName,
              classCode:  '',
              teacherUid: '',
              progress:   {},
              createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
              lastActive: firebase.firestore.FieldValue.serverTimestamp()
            };
            _withTimeout(_db().collection('players').doc(user.uid).set(playerData), WRITE_TIMEOUT_MS)
              .then(function () {
                cb(null, { uid: user.uid, email: email, displayName: displayName });
              })
              .catch(function (playerWriteErr) {
                // Never fail teacher signup over this — the real account
                // (Auth user + /teachers/{uid}) already exists. A later
                // checkpointSave() merge-write self-heals the missing doc
                // (same trick student signup relies on), so this teacher
                // just starts without cloud save until the next checkpoint.
                console.warn('[Account] /players/{uid} bootstrap write failed for teacher — will self-heal on next checkpoint', playerWriteErr);
                cb(null, { uid: user.uid, email: email, displayName: displayName });
              });
          })
          .catch(function (writeErr) {
            console.error('[Account] /teachers/{uid} write failed — rolling back the Auth user', writeErr);
            user.delete().then(function () {
              cb(_friendlyTeacherSignupError(writeErr), null);
            }).catch(function (deleteErr) {
              console.error('[Account] Teacher signup rollback delete failed — an orphaned Auth user may remain', deleteErr);
              cb(_friendlyTeacherSignupError(writeErr), null);
            });
          });
      })
      .catch(function (createErr) {
        console.error('[Account] Teacher createUserWithEmailAndPassword failed', createErr);
        cb(createErr, null);
      });
  }

  /* ── Checkpoint save — one of exactly 3 call sites in the whole app:
     after a battle win (js/game.js endGame()), account creation (the write
     inside signUpStudent OR signUpTeacher above), and logout() below. Never
     on map transitions, purchases, deck edits, or turn ends. No-ops silently
     for guests (anonymous users never get a Firestore write) and on any
     error — gameplay must never block on this. */
  function checkpointSave(cb) {
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function'
      ? window.SogAuth.getUser() : null;
    if (!user || user.isAnonymous || !window.SaveState) { if (cb) cb(); return; }

    // Reinforce the owner stamp on every checkpoint, not just login — cheap
    // defense-in-depth for _localProgressBelongsToCurrentSession's check.
    _stampProgressOwner(user.uid);

    try {
      _db().collection('players').doc(user.uid).set({
        progress:   window.SaveState.getSnapshot(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(function () {
        if (cb) cb();
      }).catch(function (e) {
        console.warn('[Account] Checkpoint save failed — continuing on local progress.', e);
        if (cb) cb();
      });
    } catch (e) {
      console.warn('[Account] Checkpoint save threw — continuing on local progress.', e);
      if (cb) cb();
    }
  }

  /* ── Logout ───────────────────────────────────────────────────────────
     Checkpoint-saves first, then wipes this device's progress (shared
     classroom Chromebooks: the NEXT person to use Guest mode on this device
     shouldn't inherit this student's cards/gold/map position — mirrors the
     dev panel's "Clear adventure progress" keep-list), signs out, and
     reloads so the page's normal boot sequence signs back in anonymously —
     the same guest bootstrap every fresh visitor gets. */
  function _clearLocalProgressForNextStudent() {
    try {
      var keep = /^(sog_dev_menu_visible|sog_music|sog_sfx|sog_volume|sog_muted|sog_master|sog_welcome_seen|sog_guest_notice_seen|sog_card_hover_info)/i;
      var rm = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sog_/.test(k) && !keep.test(k)) rm.push(k);
      }
      rm.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
  }

  function logout() {
    checkpointSave(function () {
      _clearLocalProgressForNextStudent();
      firebase.auth().signOut().then(function () {
        location.reload();
      }).catch(function () {
        location.reload();   // reload regardless — never strand the device signed in oddly
      });
    });
  }

  return {
    generateUsernameOptions: generateUsernameOptions,
    generatePassphrase: generatePassphrase,
    lookupClassCode:   lookupClassCode,
    signUpStudent:     signUpStudent,
    loginStudent:      loginStudent,
    signUpTeacher:     signUpTeacher,
    loginTeacher:      loginTeacher,
    sendPasswordReset: sendPasswordReset,
    checkpointSave:    checkpointSave,
    logout:            logout
  };
})();

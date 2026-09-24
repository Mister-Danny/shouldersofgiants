/**
 * analytics.js — Shoulders of Giants · Firebase Firestore Analytics
 *
 * Tracks anonymous session data: game starts, completions vs abandonment,
 * per-turn durations, outcomes, location scores, and difficulty mode.
 * No personal information is collected — no names, accounts, or device IDs.
 *
 * Play log (logVersion 1) — card-level data for the hint system:
 *   battleId, tier   scriptHook ('otzi', 'gilgamesh', …) and flag tier ('serf' /
 *                    'giant'); null for battles without them (e.g. Arcadium).
 *   locations        [{ id, name }] in board order; every locId below refers here.
 *   turns            [{ turn, hand, playerFirst, player, ai }] — hand = card ids at
 *                    the start of the turn; player / ai = that turn's action logs in
 *                    play order, captured after the AI picks its plays and before
 *                    the reveal: { i, type:'play', cardId, locId, slot } or
 *                    { i, type:'move', cardId, fromLocId, fromSlot, toLocId }.
 *                    slot is the commit-time slot index. Adventure AI moves that
 *                    happen after the reveal are not in `ai` (see board).
 *   board            [{ locId, name, player, ai }] at battle end (or at page close
 *                    for abandoned sessions); player / ai = [{ slot, cardId, ip,
 *                    revealed }] in slot order, ip = effective points.
 * Rules: sessions/{id} rules check auth + uid only, so no rules change is needed.
 *
 * Test mode:  Triple-click "Shoulders of Giants" title on the home screen
 *             to toggle. Active sessions are tagged isTestSession:true in
 *             Firestore. State persists in localStorage until toggled off.
 *
 * Abandonment: On page close mid-game the session ID + state is saved to
 *             localStorage. On the next game start that pending record is
 *             written to Firestore (more reliable than beforeunload writes).
 *
 * Depends on: Firebase compat v9 (loaded via CDN before this script). Also
 *             reads window.SogAuth (js/auth.js, loads right after this file)
 *             at write time — every Firestore write waits for SogAuth.ready()
 *             before hitting the network, and session-creation docs are
 *             stamped with the signed-in uid (AUTH_SPEC.md §3). Guarded so a
 *             missing SogAuth degrades to writing immediately rather than
 *             hanging, same spirit as every other failure path in this file.
 * Exposes:    window.Analytics
 */

(function () {
  'use strict';

  /* ── Firebase config ─────────────────────────────────────────── */
  var firebaseConfig = {
    apiKey:            'AIzaSyC1RwlyaNm6vomkc2gSkVkhJxIHpohEddQ',
    authDomain:        'shoulders-of-giants-db884.firebaseapp.com',
    projectId:         'shoulders-of-giants-db884',
    storageBucket:     'shoulders-of-giants-db884.firebasestorage.app',
    messagingSenderId: '580586690652',
    appId:             '1:580586690652:web:ae6376c516a59663412e99'
  };

  /* ── Constants ───────────────────────────────────────────────── */
  var TEST_MODE_KEY      = 'sog_test_mode';
  var ABANDONED_KEY      = 'sog_abandoned_session';
  var COLLECTION         = 'sessions';
  var LOG_VERSION        = 1;
  var MAX_LIST           = 40;    // cap on any logged list (hand, actions, cards per side) — keeps docs small

  /* ── Module state ────────────────────────────────────────────── */
  var db            = null;   // Firestore instance
  var sessionId     = null;   // unique per game
  var sessionDocRef = null;   // Firestore doc ref for the current game
  var isTestSession = false;
  var gameActive    = false;  // true while a game is in progress (not yet over)
  var turnStartTime = 0;      // Date.now() at the start of the current turn
  var turnDurations = [];     // array of seconds (one entry per completed turn)
  var analyticsDisabled = false;  // bug 3: set true on first permission-denied; subsequent writes silently no-op
  var battleInfo    = null;   // { battleId, tier, locations } for the current game
  var turnLog       = [];     // play log: one entry per turn (see header)
  var boardProvider = null;   // game.js-supplied fn → board snapshot, read at game end / page close

  /* ══════════════════════════════════════════════════════════════
     Play-log sanitizers
     Firestore rejects undefined values, so every logged field is coerced to a
     number / string / boolean / null here — never passed through raw.
  ══════════════════════════════════════════════════════════════ */
  function _scalar(v) {
    return (typeof v === 'number' && isFinite(v)) || typeof v === 'string' ? v : null;
  }
  function _idList(arr) {
    return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice(0, MAX_LIST) : [];
  }
  // `logged` = the entry is already in play-log shape (slot / fromSlot), e.g. read
  // back from an abandoned-session record; otherwise it's a raw engine action-log
  // entry (slotIndex / fromSlotIndex; player plays use toLocId, AI plays locId).
  function _action(a, i, logged) {
    var out = { i: i, type: (a && typeof a.type === 'string') ? a.type : 'unknown', cardId: _scalar(a && a.cardId) };
    if (out.type === 'play') {
      out.locId = _scalar(logged || a.toLocId === undefined ? a.locId : a.toLocId);
      out.slot  = _scalar(logged ? a.slot : a.slotIndex);
    } else if (out.type === 'move') {
      out.fromLocId = _scalar(a.fromLocId);
      out.fromSlot  = _scalar(logged ? a.fromSlot : a.fromSlotIndex);
      out.toLocId   = _scalar(a.toLocId);
    }
    return out;
  }
  function _actions(arr, logged) {
    return Array.isArray(arr) ? arr.filter(function (a) { return a && typeof a === 'object'; }).slice(0, MAX_LIST)
      .map(function (a, i) { return _action(a, i, logged); }) : [];
  }
  function _locations(arr) {
    return Array.isArray(arr) ? arr.slice(0, MAX_LIST).map(function (l) {
      return { id: _scalar(l && l.id), name: _scalar(l && l.name) };
    }) : [];
  }
  function _board(arr) {
    if (!Array.isArray(arr)) return null;
    var side = function (cards) {
      return Array.isArray(cards) ? cards.slice(0, MAX_LIST).map(function (c) {
        return { slot: _scalar(c && c.slot), cardId: _scalar(c && c.cardId), ip: _scalar(c && c.ip), revealed: !!(c && c.revealed) };
      }) : [];
    };
    return arr.slice(0, MAX_LIST).map(function (loc) {
      return { locId: _scalar(loc && loc.locId), name: _scalar(loc && loc.name), player: side(loc && loc.player), ai: side(loc && loc.ai) };
    });
  }
  function _turnEntry(turn) {
    for (var k = turnLog.length - 1; k >= 0; k--) if (turnLog[k].turn === turn) return turnLog[k];
    var entry = { turn: turn, hand: [], playerFirst: null, player: [], ai: [] };
    turnLog.push(entry);
    return entry;
  }
  function _readBoard() {
    if (typeof boardProvider !== 'function') return null;
    try { return _board(boardProvider()); } catch (e) { return null; }
  }

  /* ══════════════════════════════════════════════════════════════
     UUID / session ID
  ══════════════════════════════════════════════════════════════ */
  function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Firebase init
  ══════════════════════════════════════════════════════════════ */
  function initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('[Analytics] Firebase SDK not loaded — analytics disabled.');
      return;
    }
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch (e) {
      console.warn('[Analytics] Firebase init error:', e);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Firestore helpers
  ══════════════════════════════════════════════════════════════ */
  function getDocRef(id) {
    if (!db) return null;
    return db.collection(COLLECTION).doc(id);
  }

  function writeDoc(ref, data, merge) {
    if (!ref) return;
    // bug 3: short-circuit after permission-denied — analytics is configured
    // but Firestore rules deny the writes. We log once, then suppress further
    // attempts and noise for the session. The server-side fix is to update
    // Firestore rules in the Firebase Console — until then, gameplay is
    // unaffected, data is just not captured.
    if (analyticsDisabled) return;

    // Wait for js/auth.js's anonymous sign-in to settle before the actual
    // network write. Firestore rules require request.auth != null to create
    // a session doc — firing this before signInAnonymously() resolves was
    // getting denied every time, which then (via the permission-denied catch
    // below) disabled analytics for the rest of the session. ready() calls
    // back on the same tick once already resolved, so this is a no-op delay
    // for every write after the first in a session. Falls back to writing
    // immediately if auth.js somehow isn't loaded, rather than hanging.
    if (window.SogAuth && typeof window.SogAuth.ready === 'function') {
      window.SogAuth.ready(function () { _writeDocNow(ref, data, merge); });
    } else {
      _writeDocNow(ref, data, merge);
    }
  }

  function _writeDocNow(ref, data, merge) {
    if (analyticsDisabled) return;   // could have flipped true while we were waiting on auth
    var payload = data;
    if (!merge) {
      // Stamp the authenticated writer's uid on the CREATE only (AUTH_SPEC.md
      // §3 note) — read fresh here rather than at writeDoc()'s call site, so
      // it reflects the resolved user, not whatever was current before we
      // waited on ready() above. null if anon sign-in never succeeded; the
      // create itself will then be denied by rules (signedIn()) and fall
      // into the permission-denied branch below, same as today.
      var user = window.SogAuth && typeof window.SogAuth.getUser === 'function'
        ? window.SogAuth.getUser() : null;
      payload = Object.assign({}, data, { uid: user ? user.uid : null });
    }
    ref.set(payload, { merge: !!merge }).catch(function (e) {
      if (e && e.code === 'permission-denied') {
        if (!analyticsDisabled) {
          console.warn('[Analytics] Disabled — Firestore writes denied. Update security rules in Firebase Console to enable telemetry. (Suppressing further warnings this session.)');
          analyticsDisabled = true;
        }
      } else {
        // Non-permission errors might be transient (network, etc.) — keep warning
        console.warn('[Analytics] Firestore write error:', e);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Abandoned-session recovery
     On page close mid-game we save minimal state to localStorage.
     On the NEXT call to gameStarted() we flush that record first —
     but only when the signed-in uid is the one that wrote it.
  ══════════════════════════════════════════════════════════════ */
  // Guarded: resolvedOptions().timeZone is absent on a few old browsers, and
  // a garbage value must never be written. Capped like every other string here.
  function _timeZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return (typeof tz === 'string' && tz.length <= 64) ? tz : '';
    } catch (e) { return ''; }
  }

  function _currentUid() {
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function'
      ? window.SogAuth.getUser() : null;
    return user ? user.uid : null;
  }

  function saveAbandonedSession() {
    if (!gameActive || !sessionId) return;
    try {
      localStorage.setItem(ABANDONED_KEY, JSON.stringify({
        sessionId:     sessionId,
        uid:           _currentUid(),
        turnDurations: turnDurations,
        abandonedAt:   new Date().toISOString(),
        logVersion:    LOG_VERSION,
        battleId:      battleInfo ? battleInfo.battleId : null,
        tier:          battleInfo ? battleInfo.tier : null,
        locations:     battleInfo ? battleInfo.locations : [],
        turns:         turnLog,
        board:         _readBoard()
      }));
    } catch (e) { /* storage full — ignore */ }
  }

  function flushAbandonedSession() {
    var raw = null;
    try { raw = localStorage.getItem(ABANDONED_KEY); } catch (e) {}
    if (!raw) return;
    // Consume the record up front so a bad record can't be retried every battle.
    try { localStorage.removeItem(ABANDONED_KEY); } catch (e) {}

    var data = null;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var ref = (data && typeof data.sessionId === 'string') ? getDocRef(data.sessionId) : null;
    if (!ref) return;

    // Sessions rules only let the creating uid update a session. A record left by a
    // different user on a shared device (or saved by a build that didn't stamp the
    // uid) would be denied — and a denial disables analytics for this whole session
    // (see _writeDocNow). So compare uids once auth has settled, and drop otherwise.
    var flushIfOwner = function () {
      if (!data.uid || data.uid !== _currentUid()) return;
      try {
        var abandoned = {
          uid:           data.uid,
          completed:     false,
          outcome:       'abandoned',
          turnDurations: data.turnDurations || [],
          abandonedAt:   data.abandonedAt
        };
        // Play-log fields (logVersion 1). Re-sanitized: localStorage content is
        // not trusted to be well-formed.
        if (data.logVersion) {
          abandoned.logVersion = data.logVersion;
          abandoned.battleId   = _scalar(data.battleId);
          abandoned.tier       = _scalar(data.tier);
          abandoned.locations  = _locations(data.locations);
          abandoned.turns      = Array.isArray(data.turns) ? data.turns.slice(0, MAX_LIST).map(function (t) {
            return { turn: _scalar(t && t.turn), hand: _idList(t && t.hand),
                     playerFirst: typeof (t && t.playerFirst) === 'boolean' ? t.playerFirst : null,
                     player: _actions(t && t.player, true), ai: _actions(t && t.ai, true) };
          }) : [];
          abandoned.board      = _board(data.board);
        }
        writeDoc(ref, abandoned, true);
      } catch (e) {
        console.warn('[Analytics] Failed to flush abandoned session:', e);
      }
    };
    if (window.SogAuth && typeof window.SogAuth.ready === 'function') {
      window.SogAuth.ready(flushIfOwner);
    } else {
      flushIfOwner();
    }
  }

  window.addEventListener('beforeunload', saveAbandonedSession);

  /* ══════════════════════════════════════════════════════════════
     Test mode
  ══════════════════════════════════════════════════════════════ */
  function loadTestMode() {
    try { isTestSession = localStorage.getItem(TEST_MODE_KEY) === 'true'; } catch (e) {}
    applyTestModeUI();
  }

  function toggleTestMode() {
    isTestSession = !isTestSession;
    try { localStorage.setItem(TEST_MODE_KEY, isTestSession ? 'true' : 'false'); } catch (e) {}
    applyTestModeUI();
    console.log('[Analytics] Test mode:', isTestSession ? 'ON' : 'OFF');
  }

  function applyTestModeUI() {
    var el = document.getElementById('test-mode-indicator');
    if (el) el.style.display = isTestSession ? 'block' : 'none';
  }

  function setupTestModeToggle() {
    var titleEl = document.getElementById('home-title');
    if (!titleEl) return;

    var count = 0;
    var timer = null;

    titleEl.addEventListener('click', function () {
      count++;
      clearTimeout(timer);
      timer = setTimeout(function () { count = 0; }, 600);
      if (count >= 3) {
        clearTimeout(timer);
        count = 0;
        if (window.BattleLobby) window.BattleLobby.prompt();
        else if (window.BypassAuth) window.BypassAuth.prompt();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Public API  (window.Analytics)
  ══════════════════════════════════════════════════════════════ */
  window.Analytics = {

    /**
     * Called when turn 1 activates (end of initGame's onBattleStart).
     * Flushes any abandoned prior session, then opens a new session doc.
     * @param {string} difficulty  'easy' | 'hard'
     * @param {object} [battle]    { battleId, tier, locations:[{id,name}], hand:[cardId] }
     */
    gameStarted: function (difficulty, battle) {
      // Flush a genuinely abandoned prior session (page was closed mid-game).
      // A clean game end already clears the record in gameCompleted(), so any
      // record still present here is a real abandonment. (This used to clear the
      // record first, which meant the flush never found anything.)
      flushAbandonedSession();

      if (!db) return;

      sessionId     = generateSessionId();
      sessionDocRef = getDocRef(sessionId);
      turnDurations = [];
      turnStartTime = Date.now();
      gameActive    = true;
      battleInfo    = {
        battleId:  _scalar(battle && battle.battleId),
        tier:      _scalar(battle && battle.tier),
        locations: _locations(battle && battle.locations)
      };
      turnLog = [];
      _turnEntry(1).hand = _idList(battle && battle.hand);

      writeDoc(sessionDocRef, {
        sessionId:      sessionId,
        timestamp:      firebase.firestore.FieldValue.serverTimestamp(),
        // The server stamp is filled in when the write REACHES Firestore. On a
        // flaky Chromebook the SDK queues writes offline and commits them later,
        // so a whole lesson's games can land in the same second with ~0s
        // durations — real play that then looks like scripted test data. These
        // two carry the device's own clock (and its UTC offset, so the local
        // time of day survives): wrong if the device clock is wrong, but never
        // collapsed. See lib/sessions.js in the analytics toolkit, which prefers
        // them and falls back to the server stamp for older rows.
        startedAtClient: new Date().toISOString(),
        clientTzOffsetMin: -new Date().getTimezoneOffset(),
        // The browser's IANA zone ('America/Chicago'), so a report can show the
        // player's own clock rather than the server's. Coarse by design — a
        // region, not a location — and never recorded for a named person:
        // guests are anonymous, and a student is only ever a username to us.
        clientTimeZone: _timeZone(),
        isTestSession:  isTestSession,
        difficulty:     difficulty || 'easy',
        gameMode:       'standard',
        completed:      false,
        outcome:        null,
        turnDurations:  [],
        locationScores: [],
        logVersion:     LOG_VERSION,
        battleId:       battleInfo.battleId,
        tier:           battleInfo.tier,
        locations:      battleInfo.locations,
        turns:          turnLog
      }, false);
    },

    /**
     * Called at the start of each new turn (turns 2–5).
     * Turn 1 timer begins in gameStarted().
     * @param {number}   [turnNum]  1-based turn number that is starting
     * @param {number[]} [hand]     card ids in the player's hand after the draw
     */
    turnStarted: function (turnNum, hand) {
      turnStartTime = Date.now();
      if (gameActive && typeof turnNum === 'number') _turnEntry(turnNum).hand = _idList(hand);
    },

    /**
     * Called after the opponent's plays are chosen and before the reveal.
     * Records both sides' action logs for the turn and writes the play log.
     * @param {number}  turnNum         1-based turn being revealed
     * @param {Array}   playerActions   G.playerActionLog entries, in play order
     * @param {Array}   aiActions       G.aiActionLog entries (AI, or the 2P opponent via applyOpponentActions)
     * @param {boolean} playerFirst     whether the player's cards reveal first
     */
    turnActions: function (turnNum, playerActions, aiActions, playerFirst) {
      if (!gameActive || !sessionDocRef || typeof turnNum !== 'number') return;
      var entry = _turnEntry(turnNum);
      entry.player      = _actions(playerActions);
      entry.ai          = _actions(aiActions);
      entry.playerFirst = typeof playerFirst === 'boolean' ? playerFirst : null;
      writeDoc(sessionDocRef, { turns: turnLog }, true);
    },

    /**
     * Registers a function returning the current board as
     * [{ locId, name, player:[{slot,cardId,ip,revealed}], ai:[…] }].
     * Read at game end and when the page closes mid-game.
     */
    setBoardProvider: function (fn) {
      boardProvider = typeof fn === 'function' ? fn : null;
    },

    /**
     * Called when the player clicks END TURN.
     * Logs the elapsed seconds for this turn.
     * @param {number} turnNum  1-based turn number that just ended
     */
    turnEnded: function (turnNum) {
      if (!gameActive || !sessionDocRef) return;
      var elapsed = Math.round((Date.now() - turnStartTime) / 1000);
      turnDurations.push(elapsed);
      writeDoc(sessionDocRef, { turnDurations: turnDurations }, true);
    },

    /**
     * Called inside endGame() with the result object from tallyResult().
     * @param {object} result  { outcome, tiebreaker, playerTotal, aiTotal, locResults }
     */
    gameCompleted: function (result) {
      if (!sessionDocRef) return;
      gameActive = false;

      // Clear beforeunload flag — game ended normally
      try { localStorage.removeItem(ABANDONED_KEY); } catch (e) {}

      var locScores = (result.locResults || []).map(function (lr) {
        return {
          location: lr.loc.name,
          playerIP: lr.playerIP,
          aiIP:     lr.aiIP,
          winner:   lr.winner   // 'player' | 'ai' | 'tie'
        };
      });

      writeDoc(sessionDocRef, {
        completed:      true,
        outcome:        result.outcome,         // 'player' | 'ai' | 'draw'
        locationScores: locScores,
        playerTotal:    result.playerTotal  || 0,
        aiTotal:        result.aiTotal      || 0,
        usedTiebreaker: result.tiebreaker   || false,
        turnDurations:  turnDurations,
        turns:          turnLog,
        board:          _readBoard(),
        finishedAt:     firebase.firestore.FieldValue.serverTimestamp(),
        finishedAtClient: new Date().toISOString()
      }, true);
    }
  };

  /* ── Bootstrap ───────────────────────────────────────────────── */
  initFirebase();
  loadTestMode();
  // Defer toggle setup until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTestModeToggle);
  } else {
    setupTestModeToggle();
  }

})();

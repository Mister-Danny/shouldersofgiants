/**
 * analytics.js — Shoulders of Giants · Firebase Firestore Analytics
 *
 * Tracks anonymous session data: game starts, completions vs abandonment,
 * per-turn durations, outcomes, location scores, and difficulty mode.
 * No personal information is collected — no names, accounts, or device IDs.
 *
 * Test mode:  Triple-click "Shoulders of Giants" title on the home screen
 *             to toggle. Active sessions are tagged isTestSession:true in
 *             Firestore. State persists in localStorage until toggled off.
 *
 * Abandonment: On page close mid-game the session ID + state is saved to
 *             localStorage. On the next game start that pending record is
 *             written to Firestore (more reliable than beforeunload writes).
 *
 * Depends on: Firebase compat v9 (loaded via CDN before this script)
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

  /* ── Module state ────────────────────────────────────────────── */
  var db            = null;   // Firestore instance
  var sessionId     = null;   // unique per game
  var sessionDocRef = null;   // Firestore doc ref for the current game
  var isTestSession = false;
  var gameActive    = false;  // true while a game is in progress (not yet over)
  var turnStartTime = 0;      // Date.now() at the start of the current turn
  var turnDurations = [];     // array of seconds (one entry per completed turn)

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
    ref.set(data, { merge: !!merge }).catch(function (e) {
      console.warn('[Analytics] Firestore write error:', e);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Abandoned-session recovery
     On page close mid-game we save minimal state to localStorage.
     On the NEXT call to gameStarted() we flush that record first.
  ══════════════════════════════════════════════════════════════ */
  function saveAbandonedSession() {
    if (!gameActive || !sessionId) return;
    try {
      localStorage.setItem(ABANDONED_KEY, JSON.stringify({
        sessionId:     sessionId,
        turnDurations: turnDurations,
        abandonedAt:   new Date().toISOString()
      }));
    } catch (e) { /* storage full — ignore */ }
  }

  function flushAbandonedSession() {
    var raw = null;
    try { raw = localStorage.getItem(ABANDONED_KEY); } catch (e) {}
    if (!raw) return;

    try {
      var data = JSON.parse(raw);
      var ref  = getDocRef(data.sessionId);
      if (ref) {
        writeDoc(ref, {
          completed:     false,
          outcome:       'abandoned',
          turnDurations: data.turnDurations || [],
          abandonedAt:   data.abandonedAt
        }, true);
      }
    } catch (e) {
      console.warn('[Analytics] Failed to flush abandoned session:', e);
    }

    try { localStorage.removeItem(ABANDONED_KEY); } catch (e) {}
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
     * Called at the very start of initGame().
     * Flushes any abandoned prior session, then opens a new session doc.
     * @param {string} difficulty  'easy' | 'hard'
     */
    gameStarted: function (difficulty) {
      // Clear any stale beforeunload flag from a clean previous session end
      try { localStorage.removeItem(ABANDONED_KEY); } catch (e) {}

      // Flush a genuinely abandoned prior session (page was closed mid-game)
      flushAbandonedSession();

      if (!db) return;

      sessionId     = generateSessionId();
      sessionDocRef = getDocRef(sessionId);
      turnDurations = [];
      turnStartTime = Date.now();
      gameActive    = true;

      writeDoc(sessionDocRef, {
        sessionId:      sessionId,
        timestamp:      firebase.firestore.FieldValue.serverTimestamp(),
        isTestSession:  isTestSession,
        difficulty:     difficulty || 'easy',
        gameMode:       'standard',
        completed:      false,
        outcome:        null,
        turnDurations:  [],
        locationScores: []
      }, false);
    },

    /**
     * Called at the start of each new turn (turns 2–5).
     * Turn 1 timer begins in gameStarted().
     */
    turnStarted: function () {
      turnStartTime = Date.now();
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
        finishedAt:     firebase.firestore.FieldValue.serverTimestamp()
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

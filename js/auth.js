/**
 * auth.js — Firebase Anonymous Auth (AUTH_SPEC.md Phase 2 — Guest route)
 *
 * On load, signs in anonymously against the DEFAULT Firebase app — the same
 * app js/analytics.js uses for Firestore — NOT the named 'rtdb' app that
 * js/multiplayer.js/battlelobby.js/match.js use for Realtime Database.
 *
 * Guest-only for this phase: no student/teacher signup, no Firestore writes
 * of its own (see AUTH_SPEC.md §4 "Guest"). If sign-in fails for any reason
 * (offline, blocked, SDK missing, quota), the game continues exactly as it
 * does today — every failure path below is caught and silently degrades to
 * local-only play. The guest UI (js/guest-status.js) does not depend on this
 * succeeding.
 *
 * Must load AFTER js/analytics.js, which already calls
 * firebase.initializeApp(firebaseConfig) for the default app — this file
 * reuses that instance rather than re-initializing it (a second
 * initializeApp() call for the same default app throws).
 *
 * Exposes window.SogAuth = { getUser(), isSignedIn(), ready(cb) }.
 * ready(cb) is the readiness gate other modules (analytics.js) wait on
 * before their first Firestore write — see the "ready" doc below for why
 * this is tied to signInAnonymously() settling rather than the first
 * onAuthStateChanged tick.
 */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey:            'AIzaSyC1RwlyaNm6vomkc2gSkVkhJxIHpohEddQ',
    authDomain:        'shoulders-of-giants-db884.firebaseapp.com',
    projectId:         'shoulders-of-giants-db884',
    storageBucket:     'shoulders-of-giants-db884.firebasestorage.app',
    messagingSenderId: '580586690652',
    appId:             '1:580586690652:web:ae6376c516a59663412e99'
  };

  var _user = null;
  var _ready = false;
  var _readyCallbacks = [];

  function _resolveReady() {
    if (_ready) return;
    _ready = true;
    var cbs = _readyCallbacks;
    _readyCallbacks = [];
    cbs.forEach(function (cb) {
      try { cb(_user); } catch (e) {}
    });
  }

  function _defaultApp() {
    if (typeof firebase === 'undefined') return null;
    try {
      var apps = firebase.apps || [];
      for (var i = 0; i < apps.length; i++) {
        if (apps[i].name === '[DEFAULT]') return apps[i];
      }
      // analytics.js normally creates this first; only get here if it
      // failed to load or hasn't run yet.
      return firebase.initializeApp(firebaseConfig);
    } catch (e) {
      console.warn('[Auth] Firebase init error — continuing in local-only mode.', e);
      return null;
    }
  }

  function init() {
    var app = _defaultApp();
    if (!app || typeof firebase.auth !== 'function') {
      console.warn('[Auth] Firebase Auth SDK unavailable — continuing in local-only mode.');
      _resolveReady();
      return;
    }
    try {
      // Kept live for the whole session (token refresh, future account
      // upgrades) — but NOT what readiness is gated on. onAuthStateChanged
      // fires immediately with whatever the cached/current state is (often
      // null on a fresh load), a tick before signInAnonymously() actually
      // resolves — gating readiness on that first tick would let callers
      // read a premature "no user" state and race ahead exactly like the
      // bug this file fixes. Readiness is gated on signInAnonymously()
      // itself settling, below.
      firebase.auth().onAuthStateChanged(function (user) {
        _user = user;
      });
      firebase.auth().signInAnonymously()
        .then(function (cred) {
          _user = (cred && cred.user) ? cred.user : firebase.auth().currentUser;
        })
        .catch(function (e) {
          console.warn('[Auth] Anonymous sign-in failed — continuing in local-only mode.', e);
        })
        .then(function () {
          _resolveReady();
        });
    } catch (e) {
      console.warn('[Auth] Anonymous sign-in threw — continuing in local-only mode.', e);
      _resolveReady();
    }
  }

  init();

  window.SogAuth = {
    getUser:    function () { return _user; },
    isSignedIn: function () { return !!_user; },

    /**
     * Registers cb to run once the initial anonymous sign-in attempt has
     * settled (succeeded or failed) — never blocks forever. Fires
     * immediately (synchronously-ish, via the same callback) if already
     * resolved, so calling this after the first game is a same-tick no-op.
     * @param {function(user)} cb
     */
    ready: function (cb) {
      if (typeof cb !== 'function') return;
      if (_ready) { cb(_user); return; }
      _readyCallbacks.push(cb);
    }
  };
})();

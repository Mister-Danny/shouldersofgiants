/**
 * auth.js — Firebase Anonymous Auth (AUTH_SPEC.md Phase 2 — Guest route)
 *
 * On load, signs in anonymously against the DEFAULT Firebase app — the same
 * app js/analytics.js uses for Firestore — NOT the named 'rtdb' app that
 * js/multiplayer.js/battlelobby.js/match.js use for Realtime Database.
 *
 * Guest-only for this phase: no student/teacher signup, no Firestore writes
 * (see AUTH_SPEC.md §4 "Guest"). If sign-in fails for any reason (offline,
 * blocked, SDK missing, quota), the game continues exactly as it does today —
 * every failure path below is caught and silently degrades to local-only
 * play. The guest UI (js/guest-status.js) does not depend on this succeeding.
 *
 * Must load AFTER js/analytics.js, which already calls
 * firebase.initializeApp(firebaseConfig) for the default app — this file
 * reuses that instance rather than re-initializing it (a second
 * initializeApp() call for the same default app throws).
 *
 * Exposes window.SogAuth = { getUser(), isSignedIn() } for later phases.
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
      return;
    }
    try {
      firebase.auth().onAuthStateChanged(function (user) {
        _user = user;
      });
      firebase.auth().signInAnonymously().catch(function (e) {
        console.warn('[Auth] Anonymous sign-in failed — continuing in local-only mode.', e);
      });
    } catch (e) {
      console.warn('[Auth] Anonymous sign-in threw — continuing in local-only mode.', e);
    }
  }

  init();

  window.SogAuth = {
    getUser:     function () { return _user; },
    isSignedIn:  function () { return !!_user; }
  };
})();

/**
 * auth.js — Firebase Auth bootstrap (AUTH_SPEC.md Phase 2 guest route +
 * Phase 3 returning-student session restore)
 *
 * On load, restores whoever Firebase has persisted for this browser — a
 * guest's anonymous session, or (once AUTH_SPEC.md Phase 3 has linked an
 * account) a real student session — and ONLY bootstraps a fresh anonymous
 * sign-in if nothing was persisted at all (first-ever visit, or a device
 * that just logged out). Targets the DEFAULT Firebase app — the same app
 * js/analytics.js uses for Firestore — NOT the named 'rtdb' app that
 * js/multiplayer.js/battlelobby.js/match.js use for Realtime Database.
 *
 * If sign-in fails for any reason (offline, blocked, SDK missing, quota),
 * the game continues exactly as it does today — every failure path below is
 * caught and silently degrades to local-only play. The guest UI
 * (js/guest-status.js) does not depend on this succeeding.
 *
 * Must load AFTER js/analytics.js, which already calls
 * firebase.initializeApp(firebaseConfig) for the default app — this file
 * reuses that instance rather than re-initializing it (a second
 * initializeApp() call for the same default app throws).
 *
 * Exposes window.SogAuth = { getUser(), isSignedIn(), ready(cb), onChange(cb),
 * refresh() }.
 * ready(cb) is the readiness gate other modules (analytics.js, account.js)
 * wait on before their first Firestore write — see the "ready" doc below.
 * onChange(cb) fires on every auth state change reported by Firebase's own
 * onAuthStateChanged (sign-in, sign-out) — but NOT on linkWithCredential:
 * Firebase does not re-fire onAuthStateChanged for that, since the uid
 * doesn't change (confirmed empirically — 0 events on a live linkWithCredential
 * call). js/account.js's signUpStudent therefore calls refresh() explicitly
 * right after a successful link, which re-reads firebase.auth().currentUser
 * and notifies onChange listeners itself. Any UI that needs to stay live
 * through signup — the guest corner strip (js/guest-status.js), the home
 * screen's account button label (js/home.js) — must not assume
 * onAuthStateChanged alone covers linking.
 *
 * Also stamps localStorage with whichever anonymous uid currently owns it
 * (sog_progress_owner_uid) — see js/account.js's signUpStudent for why:
 * that's how it tells "this device's local progress genuinely belongs to
 * the guest session being upgraded" apart from "Firebase's persisted
 * session was lost while localStorage was not, so a brand-new anonymous
 * uid is about to inherit some OTHER account's leftover data."
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
  var _changeListeners = [];

  // Must match js/account.js's PROGRESS_OWNER_UID_KEY exactly.
  var PROGRESS_OWNER_UID_KEY = 'sog_progress_owner_uid';
  function _stampProgressOwner(uid) {
    if (!uid) return;
    try { localStorage.setItem(PROGRESS_OWNER_UID_KEY, uid); } catch (e) {}
  }

  function _resolveReady() {
    if (_ready) return;
    _ready = true;
    var cbs = _readyCallbacks;
    _readyCallbacks = [];
    cbs.forEach(function (cb) {
      try { cb(_user); } catch (e) {}
    });
  }

  function _notifyChange() {
    _changeListeners.forEach(function (cb) {
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
      // Firebase persists whoever was last signed in (LOCAL persistence, via
      // IndexedDB) and restores them across reloads — anonymous guest OR a
      // linked student account (AUTH_SPEC.md Phase 3). That restoration is
      // itself async: onAuthStateChanged's FIRST callback is what reports
      // it, once it's actually done. Calling signInAnonymously() eagerly,
      // before waiting for that first callback, races the restoration — for
      // a returning student this was clobbering their real linked session
      // with a brand-new throwaway anonymous one on every reload. So:
      // bootstrap anonymously ONLY if that first, authoritative callback
      // reports no persisted user at all. Every callback after the first
      // just keeps _user live (token refresh, sign-in/out/link during this
      // session) without touching sign-in state.
      var sawFirstState = false;
      firebase.auth().onAuthStateChanged(function (user) {
        _user = user;
        if (sawFirstState) {
          // Every tick after the first is a real change during this session
          // (sign-in, sign-out, or a linkWithCredential upgrade) — live UI
          // (the guest corner strip) reacts to this via onChange() below.
          _notifyChange();
          return;
        }
        sawFirstState = true;

        if (user) {
          // A restored anonymous session's uid is stable across reloads —
          // re-stamp defensively so the mark is always present/correct for
          // signUpStudent's check, even if it was somehow missing (e.g.
          // data predating this feature).
          if (user.isAnonymous) _stampProgressOwner(user.uid);
          _resolveReady();
          _notifyChange();
          return;
        }
        firebase.auth().signInAnonymously()
          .then(function (cred) {
            _user = (cred && cred.user) ? cred.user : firebase.auth().currentUser;
            // Fresh anonymous uid — this is the ONLY session that can
            // legitimately claim whatever's currently in localStorage.
            if (_user) _stampProgressOwner(_user.uid);
          })
          .catch(function (e) {
            console.warn('[Auth] Anonymous sign-in failed — continuing in local-only mode.', e);
          })
          .then(function () {
            _resolveReady();
            _notifyChange();
          });
      }, function (e) {
        console.warn('[Auth] onAuthStateChanged error — continuing in local-only mode.', e);
        _resolveReady();
      });
    } catch (e) {
      console.warn('[Auth] Auth setup threw — continuing in local-only mode.', e);
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
    },

    /**
     * Registers cb to run on every auth state change from here on (sign-in,
     * sign-out, a linkWithCredential upgrade) — unlike ready(), this doesn't
     * fire immediately for the current state and never stops firing. For
     * live UI (the guest corner strip) that needs to react the moment a
     * student finishes signing up, without a page reload.
     * @param {function(user)} cb
     */
    onChange: function (cb) {
      if (typeof cb !== 'function') return;
      _changeListeners.push(cb);
    },

    /**
     * Re-reads firebase.auth().currentUser and notifies onChange listeners
     * immediately. Firebase does NOT fire onAuthStateChanged after
     * linkWithCredential (same uid, no state transition it considers
     * notable) — js/account.js calls this right after a successful link so
     * live UI (corner strip, home-screen account button) updates without
     * waiting on an event that will never come.
     */
    refresh: function () {
      if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return;
      _user = firebase.auth().currentUser;
      _notifyChange();
    }
  };
})();

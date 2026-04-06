/**
 * match.js — Blind simultaneous 2-player match sync via Firebase.
 * Exposes: window.Match
 *
 * Firebase path: tournaments/{code}/matches/{matchId}/
 *   p1: { deck: [...], ready: true, locationIds: [...] }
 *   p2: { deck: [...], ready: true }
 *   turns/
 *     t1/ { p1: { actions: [...] }, p2: { actions: [...] } }
 *     t2/ ...
 *   result: { winner, p1Score, p2Score, status, completedAt }
 */
(function () {
  'use strict';

  var TOURNAMENTS_REF = 'tournaments';
  var _db             = null;
  var _state          = null;   // active match state

  /* ── Firebase helper ─────────────────────────────────────────── */

  function _getDb() {
    if (_db) return _db;
    try { _db = firebase.database(firebase.app('rtdb')); } catch (e) {}
    return _db;
  }

  function _matchRef(code, matchId) {
    var db = _getDb();
    if (!db) return null;
    return db.ref(TOURNAMENTS_REF + '/' + code + '/matches/' + matchId);
  }

  function _shuffle(arr) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function _pickLocations() {
    var locs = (typeof LOCATIONS !== 'undefined' ? LOCATIONS : []);
    return _shuffle(locs).slice(0, 3);
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════════ */

  /**
   * Initialise a 2-player match.
   *
   * @param {string}   matchId
   * @param {string}   myRole       'p1' | 'p2'
   * @param {string}   code         tournament lobby code
   * @param {string}   myId         this student's ID
   * @param {string}   oppId        opponent student's ID
   * @param {number[]} deckIds      this student's selected card IDs
   * @param {Function} onBothReady  called (no args) once both players have synced;
   *                                if timeout fires first, window.matchId is cleared
   *                                and the game falls back to AI mode.
   */
  function init(matchId, myRole, code, myId, oppId, deckIds, onBothReady) {
    _state = {
      matchId:    matchId,
      myRole:     myRole,
      oppRole:    myRole === 'p1' ? 'p2' : 'p1',
      code:       code,
      myId:       myId,
      oppId:      oppId,
      deckIds:    deckIds,
      locations:  null,
      oppDeckIds: null
    };

    var ref = _matchRef(code, matchId);
    if (!ref) {
      /* No Firebase — start immediately with local picks */
      _state.locations  = _pickLocations();
      _state.oppDeckIds = [];
      onBothReady();
      return;
    }

    /* P1 picks and writes locations; P2 reads them later */
    var writes = {};
    writes[myRole + '/deck']  = deckIds;
    writes[myRole + '/ready'] = true;

    if (myRole === 'p1') {
      _state.locations = _pickLocations();
      writes['p1/locationIds'] = _state.locations.map(function (l) { return l.id; });
    }

    /* 30-second overall timeout — degrade to AI if opponent never connects */
    var timedOut = false;
    var initTimer = setTimeout(function () {
      timedOut = true;
      ref.off('value', readyListener);
      if (!_state.locations)  _state.locations  = _pickLocations();
      if (!_state.oppDeckIds) _state.oppDeckIds = [];
      window.matchId = null;   // signal AI-fallback to initGame
      onBothReady();
    }, 30000);

    function readyListener(snap) {
      if (timedOut) return;
      var data = snap.val();
      if (!data) return;
      var p1 = data.p1;
      var p2 = data.p2;
      if (!p1 || !p1.ready || !p2 || !p2.ready) return;

      clearTimeout(initTimer);
      ref.off('value', readyListener);

      /* P2 resolves locations from P1's write */
      if (myRole === 'p2') {
        var ids = p1.locationIds || [];
        var all = typeof LOCATIONS !== 'undefined' ? LOCATIONS : [];
        _state.locations = all
          .filter(function (l) { return ids.indexOf(l.id) !== -1; })
          .sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
      }

      /* Resolve opponent deck */
      var oppData = myRole === 'p1' ? p2 : p1;
      _state.oppDeckIds = oppData.deck || [];

      onBothReady();
    }

    ref.update(writes).then(function () {
      ref.on('value', readyListener);
    }).catch(function () {
      clearTimeout(initTimer);
      if (!_state.locations)  _state.locations  = _pickLocations();
      _state.oppDeckIds = [];
      window.matchId = null;
      onBothReady();
    });
  }

  /**
   * Return the resolved 2P config. Call only after onBothReady has fired.
   * @returns {{ locations: Object[], oppDeckIds: number[], myDeckIds: number[] } | null}
   */
  function get2PConfig() {
    if (!_state) return null;
    return {
      locations:  _state.locations  || [],
      oppDeckIds: _state.oppDeckIds || [],
      myDeckIds:  _state.deckIds    || []
    };
  }

  /**
   * Blind-submit this player's turn actions and wait for opponent's.
   * Times out after 60 s and calls back with an empty array (Serf fallback).
   *
   * @param {number}   turn
   * @param {Object[]} actions           serialised G.playerActionLog entries
   * @param {Function} onBothSubmitted   called with (oppActions: Object[])
   */
  function submitTurn(turn, actions, onBothSubmitted) {
    if (!_state) { onBothSubmitted([]); return; }

    var ref = _matchRef(_state.code, _state.matchId);
    if (!ref) { onBothSubmitted([]); return; }

    var turnRef = ref.child('turns/t' + turn);
    var myRole  = _state.myRole;
    var oppRole = _state.oppRole;

    /* Wrap in {ok, actions} so Firebase never drops an empty-array turn
       (RTDB silently converts [] to null, breaking the opponent's listener). */
    turnRef.child(myRole).set({ ok: true, actions: actions || [] }).then(function () {
      var done    = false;

      var timeout = setTimeout(function () {
        if (done) return;
        done = true;
        turnRef.off('value', listener);
        onBothSubmitted([]);   /* opponent didn't submit in time → empty hand */
      }, 60000);

      function listener(snap) {
        if (done) return;
        var data = snap.val();
        if (!data || !data[oppRole] || !data[oppRole].ok) return;
        done = true;
        clearTimeout(timeout);
        turnRef.off('value', listener);
        onBothSubmitted(data[oppRole].actions || []);
      }

      turnRef.on('value', listener);

    }).catch(function () {
      onBothSubmitted([]);
    });
  }

  /**
   * Write match result to Firebase.
   * Only call this from P1 to avoid duplicate writes.
   *
   * @param {string} winner    'player' | 'ai' | 'draw'  (P1 perspective)
   * @param {number} p1Score
   * @param {number} p2Score
   */
  function reportResult(winner, p1Score, p2Score) {
    if (!_state) return;
    var ref = _matchRef(_state.code, _state.matchId);
    if (ref) {
      ref.child('result').set({
        winner:      winner,
        p1Score:     p1Score || 0,
        p2Score:     p2Score || 0,
        status:      'complete',
        completedAt: Date.now()
      }).catch(function () {});
    }

    /* Also mark the quick match record as complete */
    var db = _getDb();
    if (db) {
      var updates = {};
      updates[TOURNAMENTS_REF + '/' + _state.code + '/quickMatches/' + _state.matchId + '/status'] = 'complete';
      db.ref().update(updates).catch(function () {});
    }
  }

  /** Clear match state — call when returning to lobby. */
  function reset() {
    _state = null;
  }

  /* ── Public surface ──────────────────────────────────────────── */

  window.Match = {
    init:         init,
    get2PConfig:  get2PConfig,
    submitTurn:   submitTurn,
    reportResult: reportResult,
    reset:        reset
  };

})();

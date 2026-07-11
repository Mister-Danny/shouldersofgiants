/**
 * js/game/hand.js — SOG.hand
 *
 * The SEAM for the hand-of-objects migration (Stage 0 of that migration).
 *
 * Today G.playerHand / G.aiHand are BARE ARRAYS OF CARD IDS. A later stage will
 * flip each entry to an instance object { cardId, iid, ipBonus } so a buffed
 * Papyrus copy is a distinct, visible instance carrying its OWN ipBonus (instead
 * of the id-keyed G.copyIPBonus side-table which can't represent two different
 * buffs for the same id). THIS module is the interface that lets that flip happen
 * behind a stable API — Stage 0 wraps the CURRENT bare-id behaviour (zero change);
 * Stage 1 swaps the internals + flips the one EXPECT constant below.
 *
 * Shape-agnostic accessors read either representation, so callers migrated to this
 * module keep working across the flip.
 *
 * API (all take side = 'player' | 'ai' | 'opp'):
 *   get(side)                 → the raw hand array (live reference)
 *   ids(side)                 → derived bare-id array (for AI / read-only consumers)
 *   length(side)              → hand size (respects the maxHandSize cap externally)
 *   add(side, cardId, bonus)  → append a card (optional buffed ipBonus); returns the entry
 *   removeCardId(side, id)    → remove ONE entry matching cardId; returns it or null
 *   removeInstance(side, iid) → remove the entry with instance id iid; returns it or null
 *   findByIid(side, iid)      → the entry with instance id iid, or null
 *   cardIdOf(entry) / bonusOf(entry) / iidOf(entry)   → shape-agnostic field reads
 *   nextIid() / resetIids()   → per-battle instance-id counter (used by Stage 1)
 *   assertShape(where)        → dev-mode shape check (see below)
 */
window.SOG = window.SOG || {};
SOG.hand = (function () {
  'use strict';

  function _G()   { return SOG.state && SOG.state.G; }
  // Resolve the LIVE hand array fresh each call — several sites reassign
  // G.playerHand / G.aiHand (filter(), splice-and-replace), so never cache it.
  function _hand(side) {
    var G = _G(); if (!G) return [];
    return (side === 'ai' || side === 'opp') ? (G.aiHand || []) : (G.playerHand || []);
  }
  function _sideKey(side) { return (side === 'ai' || side === 'opp') ? 'opp' : 'player'; }

  /* ── Shape-agnostic field reads (bare id OR {cardId,iid,ipBonus}) ── */
  function cardIdOf(entry) { return (entry && typeof entry === 'object') ? entry.cardId : entry; }
  function iidOf(entry)    { return (entry && typeof entry === 'object') ? entry.iid    : undefined; }
  function bonusOf(entry)  { return (entry && typeof entry === 'object') ? (entry.ipBonus || 0) : 0; }

  /* ── Derived views ── */
  function get(side)    { return _hand(side); }
  function ids(side)    { return _hand(side).map(cardIdOf); }
  function length(side) { return _hand(side).length; }

  /* ── Instance-id counter (per battle; Stage 1 stamps entries with it) ── */
  var _iid = 0;
  function nextIid()  { return ++_iid; }
  function resetIids() { _iid = 0; }

  /* Append a card, optionally carrying a buffed ipBonus.
     STAGE 0: pushes the BARE id (behaviour-identical to today) and, if a bonus is
     given, routes it to the legacy G.copyIPBonus side-table exactly as Papyrus
     does today. STAGE 1 will instead push { cardId, iid: nextIid(), ipBonus:bonus }
     and the side-table disappears. Returns the entry that was pushed. */
  function add(side, cardId, bonus) {
    bonus = bonus || 0;
    var h = _hand(side);
    h.push(cardId);                                    // STAGE 0 representation: bare id
    if (bonus) {
      var G = _G();
      if (G) {
        if (!G.copyIPBonus) G.copyIPBonus = { player: {}, opp: {} };
        var k = _sideKey(side);
        G.copyIPBonus[k][cardId] = (G.copyIPBonus[k][cardId] || 0) + bonus;
      }
    }
    return h[h.length - 1];
  }

  /* Remove ONE entry by cardId (splice the first match — never filter-all, which
     would delete twins). This is the migration-safe replacement for today's
     indexOf+splice / filter(id!==cardId) patterns. Returns the removed entry. */
  function removeCardId(side, cardId) {
    var h = _hand(side);
    for (var i = 0; i < h.length; i++) {
      if (cardIdOf(h[i]) === cardId) return h.splice(i, 1)[0];
    }
    return null;
  }

  /* Remove / find by instance id — the Stage 1 identity handle. STAGE 0 bare ids
     carry no iid, so these resolve nothing (undefined iid never matches); no
     production code calls them until Stage 1/2. */
  function removeInstance(side, iid) {
    if (iid === undefined || iid === null) return null;
    var h = _hand(side);
    for (var i = 0; i < h.length; i++) { if (iidOf(h[i]) === iid) return h.splice(i, 1)[0]; }
    return null;
  }
  function findByIid(side, iid) {
    if (iid === undefined || iid === null) return null;
    var h = _hand(side);
    for (var i = 0; i < h.length; i++) { if (iidOf(h[i]) === iid) return h[i]; }
    return null;
  }

  /* ── Dev-mode shape assertion (the Stage-1 migration net) ──────────────────
     EXPECT is the single switch: 'id' now, flipped to 'object' the moment Stage 1
     changes the representation. When it runs (dev only), it loudly console.errors
     any hand entry whose type doesn't match EXPECT — catching a missed mutation
     site that left a bare id among objects (or an object where an id is expected).
     No-op unless window.SOG_DEBUG (zero production cost). */
  var EXPECT = 'id';   // <<< STAGE 1: flip to 'object' when the representation changes
  function _entryOk(e) {
    return EXPECT === 'object'
      ? (e && typeof e === 'object' && typeof e.cardId === 'number' &&
         typeof e.iid === 'number' && typeof e.ipBonus === 'number')
      : (typeof e === 'number');
  }
  function assertShape(where) {
    if (!window.SOG_DEBUG) return true;
    var G = _G(); if (!G) return true;
    var bad = [];
    ['player', 'ai'].forEach(function (side) {
      _hand(side).forEach(function (e, i) {
        if (!_entryOk(e)) bad.push({ side: side, index: i, entry: e, jsType: typeof e });
      });
    });
    if (bad.length && typeof console !== 'undefined') {
      console.error('[SOG.hand] shape assertion FAILED (expected "' + EXPECT + '")' +
                    (where ? ' @ ' + where : ''), bad);
    }
    return bad.length === 0;
  }

  return {
    get: get, ids: ids, length: length,
    add: add, removeCardId: removeCardId, removeInstance: removeInstance, findByIid: findByIid,
    cardIdOf: cardIdOf, iidOf: iidOf, bonusOf: bonusOf,
    nextIid: nextIid, resetIids: resetIids,
    assertShape: assertShape,
    _expect: function () { return EXPECT; }   // introspection for tests
  };
})();

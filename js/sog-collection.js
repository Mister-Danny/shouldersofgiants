/**
 * sog-collection.js — Player Collection
 *
 * The single source of truth for which cards a player OWNS (has unlocked).
 * Adventure Mode is the spine: players earn cards in Adventure and (later)
 * carry only owned cards into Arcadium/multiplayer.
 *
 * Storage model:
 *   • A small set of STARTER cards every player begins with (the eight
 *     Prehistory cards from the opening Neanderthal battle). Starters are
 *     CONFIG, not data — they are not persisted; they are always owned.
 *   • EARNED cards are persisted as a JSON array of ids under the existing
 *     `sog_unlocked_cards` key (reused so current players keep their unlocks).
 *   • getUnlockedCards() returns the deduped union of starters + earned.
 *
 * This module is the ONLY place that touches localStorage for card ownership.
 * That indirection is what makes a later move to a Firebase profile cheap:
 * only this module's internals change; callers keep using the same API.
 *
 * Public API (SOG.collection):
 *   STARTER_CARD_IDS              — the eight starter ids
 *   getUnlockedCards()            — number[]  (starters ∪ earned, deduped)
 *   isUnlocked(id)                — boolean
 *   unlockCard(idOrIds)           — idempotent; persists earned ids; returns
 *                                   whether anything new was unlocked
 *   resetCollection()             — clears earned back to starters-only and
 *                                   re-locks non-starter adventure cards
 *
 * Loaded right after cards.js (it reads/writes the global CARDS view).
 */
window.SOG = window.SOG || {};
SOG.collection = (function () {
  'use strict';

  // Reuse the existing key so players who already have unlocks keep them.
  var KEY = 'sog_unlocked_cards';

  // The eight Prehistory starters every player begins with (the deck used in
  // the opening Neanderthal battle): Tool, Hunter, Gatherer, Fire, Cave Art,
  // Megalith, Domesticated Animal, Tribe. Always owned; never persisted.
  var STARTER_CARD_IDS = [26, 27, 28, 29, 30, 31, 32, 36];

  function _isStarter(id) { return STARTER_CARD_IDS.indexOf(id) !== -1; }

  /* ── Storage (the ONLY ownership localStorage access in the codebase) ── */
  function _readEarned() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'number'; }) : [];
    } catch (e) { return []; }
  }
  function _writeEarned(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
  }

  /* ── CARDS[].locked view-sync — keeps the deck builder's existing
        `!card.locked` reads consistent with ownership. ── */
  function _applyOwned(id, owned) {
    if (typeof CARDS === 'undefined') return;
    var c = CARDS.find(function (x) { return x.id === id; });
    if (c) c.locked = !owned;   // owned → locked:false
  }

  /* ── Public API ── */

  function getUnlockedCards() {
    var out = STARTER_CARD_IDS.slice();
    _readEarned().forEach(function (id) { if (out.indexOf(id) === -1) out.push(id); });
    return out;
  }

  function isUnlocked(id) {
    return _isStarter(id) || _readEarned().indexOf(id) !== -1;
  }

  function unlockCard(idOrIds) {
    var ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    var earned = _readEarned();
    var changed = false;
    ids.forEach(function (id) {
      if (typeof id !== 'number') return;
      _applyOwned(id, true);                 // reflect in the CARDS view (idempotent)
      if (_isStarter(id)) return;            // starters are config — not persisted
      if (earned.indexOf(id) === -1) { earned.push(id); changed = true; }
    });
    if (changed) {
      _writeEarned(earned);
      // Keep the default deck (slot 1) in step with the collection while the
      // deck builder is still locked (no-op once the player owns deck comp).
      syncDefaultDeck();
    }
    return changed;
  }

  function resetCollection() {
    _writeEarned([]);
    // Restore the starters-only view, but ONLY for adventure-lane cards — never
    // touch arcadium-lane locked flags (those are governed by the Arcadium
    // Progression system, not by this collection).
    if (typeof CARDS !== 'undefined') {
      var laneOf = (window.SOG && SOG.Cards && SOG.Cards.laneOf) ? SOG.Cards.laneOf : null;
      CARDS.forEach(function (c) {
        if (laneOf && laneOf(c) !== 'adventure') return;   // leave arcadium cards alone
        c.locked = !_isStarter(c.id);                      // starter → unlocked, else → locked
      });
    }
  }

  // While the deck builder is still LOCKED (early adventure), the player can't
  // compose decks yet, so the DEFAULT deck (slot 1) auto-mirrors the collection:
  // the 8 starters at the start, then Lucy / Ötzi / Neanderthal / Cuneiform /
  // marketplace buys as they're earned. This is what the Gilgamesh battle plays
  // from. Once the builder unlocks (post-marketplace), the player owns deck
  // composition and we stop touching slot 1.
  var KEY_DECKBUILDER_UNLOCKED = 'sog_deckbuilder_unlocked';
  function _deckbuilderUnlocked() {
    try { return localStorage.getItem(KEY_DECKBUILDER_UNLOCKED) === 'true'; } catch (e) { return false; }
  }
  function syncDefaultDeck() {
    if (_deckbuilderUnlocked()) return false;     // player owns deck comp now
    if (!window.Decks || typeof window.Decks.setDeckCards !== 'function') return false;
    window.Decks.setDeckCards(1, getUnlockedCards());
    if (typeof window.Decks.setActiveSlot === 'function') window.Decks.setActiveSlot(1);
    return true;
  }

  /* ── Boot: apply the owned view (starters ∪ earned → locked:false). Mirrors
        the rehydration cards.js used to do, now extended to include starters. ── */
  getUnlockedCards().forEach(function (id) { _applyOwned(id, true); });
  // Seed the default deck from the collection on boot (no-op once unlocked).
  syncDefaultDeck();

  /* ── Snapshot (save-state.js) ── */
  function getSnapshot() { return { earned: _readEarned() }; }
  function applySnapshot(snap) {
    var earned = (snap && Array.isArray(snap.earned))
      ? snap.earned.filter(function (x) { return typeof x === 'number'; })
      : [];
    _writeEarned(earned);
    getUnlockedCards().forEach(function (id) { _applyOwned(id, true); });
  }

  return {
    STARTER_CARD_IDS: STARTER_CARD_IDS.slice(),
    getUnlockedCards: getUnlockedCards,
    isUnlocked:       isUnlocked,
    unlockCard:       unlockCard,
    syncDefaultDeck:  syncDefaultDeck,
    resetCollection:  resetCollection,
    getSnapshot:      getSnapshot,
    applySnapshot:    applySnapshot
  };
})();

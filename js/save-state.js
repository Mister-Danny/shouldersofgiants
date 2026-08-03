/**
 * save-state.js — Local save-state aggregator (AUTH_SPEC.md Phase 1)
 *
 * Collects a single snapshot object from every localStorage-owning module by
 * calling each module's own getSnapshot()/applySnapshot() — it never reads or
 * writes a raw localStorage key itself. This gives later phases one object to
 * hand to /players/{uid}.progress instead of reaching into a dozen modules.
 *
 * Scope: player progress (deck, collection, gold, focus, tutorial completion,
 * overworld/adventure state) plus player-facing prefs (audio volume, card-hover
 * toggle, home-screen onboarding flags). Developer/test-only state (analytics
 * test-mode, the AI diagnostic log, the deck builder's "unlock all" cheat, and
 * bypass.js's forced-locations override) is intentionally excluded — none of
 * it is player progress, and restoring it on a fresh device would reintroduce
 * dev/test artifacts a real player never had.
 *
 * No Firebase, auth, or network code here — purely a localStorage round trip.
 *
 * Usage:
 *   var snap = SaveState.getSnapshot();   // plain JSON-serializable object
 *   SaveState.applySnapshot(snap);        // writes it all back
 */
window.SaveState = (function () {
  'use strict';

  var VERSION = 1;

  // Each entry: { name, ref: function() → the live module object (or null/undefined
  // if not loaded), for save-state.js to call getSnapshot()/applySnapshot() on. }
  var MODULES = [
    { name: 'decks',               ref: function () { return window.Decks; } },
    { name: 'progression',         ref: function () { return window.Progression; } },
    { name: 'collection',          ref: function () { return window.SOG && window.SOG.collection; } },
    { name: 'gold',                ref: function () { return window.SOG && window.SOG.gold; } },
    { name: 'focus',                ref: function () { return window.SOG && window.SOG.focus; } },
    { name: 'tutorial',            ref: function () { return window.Tutorial; } },
    { name: 'deckBuilderTutorial', ref: function () { return window.DeckBuilderTutorial; } },
    { name: 'overworld',           ref: function () { return window.Overworld; } },
    { name: 'gilgamesh',           ref: function () { return window.SOG && window.SOG.GilgameshBattle; } },
    { name: 'otzi',                 ref: function () { return window.SOG && window.SOG.OtziBattle; } },
    { name: 'hammurabi',           ref: function () { return window.SOG && window.SOG.HammurabiBattle; } },
    { name: 'hangingGardens',      ref: function () { return window.SOG && window.SOG.HangingGardensBattle; } },
    { name: 'narmer',               ref: function () { return window.SOG && window.SOG.NarmerBattle; } },
    { name: 'sargon',               ref: function () { return window.SOG && window.SOG.SargonBattle; } },
    { name: 'prehistory',           ref: function () { return window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory; } },
    { name: 'nodeProgress',        ref: function () { return window.SOG && window.SOG.game; } },
    { name: 'cardHover',            ref: function () { return window.SOG && window.SOG.cardHover; } },
    { name: 'sfx',                  ref: function () { return window.SOG && window.SOG.sfx; } },
    { name: 'music',                ref: function () { return window.SOG && window.SOG.music; } },
    { name: 'home',                 ref: function () { return window.HomeFlow; } }
  ];

  function getSnapshot() {
    var modules = {};
    MODULES.forEach(function (m) {
      try {
        var mod = m.ref();
        if (mod && typeof mod.getSnapshot === 'function') {
          modules[m.name] = mod.getSnapshot();
        }
      } catch (e) {
        if (window.SOG_DEBUG) console.warn('[SaveState] getSnapshot failed for', m.name, e);
      }
    });
    return { version: VERSION, modules: modules };
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !snapshot.modules) return;
    MODULES.forEach(function (m) {
      if (!(m.name in snapshot.modules)) return;
      try {
        var mod = m.ref();
        if (mod && typeof mod.applySnapshot === 'function') {
          mod.applySnapshot(snapshot.modules[m.name]);
        }
      } catch (e) {
        if (window.SOG_DEBUG) console.warn('[SaveState] applySnapshot failed for', m.name, e);
      }
    });
  }

  return {
    VERSION: VERSION,
    getSnapshot: getSnapshot,
    applySnapshot: applySnapshot
  };
})();

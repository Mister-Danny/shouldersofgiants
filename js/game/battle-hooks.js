/**
 * js/game/battle-hooks.js
 * Shoulders of Giants — Battle script-hook mechanism (Adventure migration).
 *
 * The engine runs every battle from G.config. A battle's NARRATIVE behaviour
 * (dialogue, coaching, flee, post-victory sequences) lives in a separate
 * "script" module, referenced by name via G.config.scriptHook. This file is
 * the seam: a tiny registry plus the dispatch helpers the engine calls at each
 * lifecycle point.
 *
 * Contract:
 *   • Every hook is OPTIONAL. At each lifecycle point the engine calls the hook
 *     IF a script is present AND implements it; otherwise it runs its current
 *     default behaviour, unchanged.
 *   • G.config.scriptHook === null (Arcadium, 2P, standard) → NO script → every
 *     call site falls through to exactly today's behaviour.
 *   • The script is resolved DYNAMICALLY from the live G.config on every call
 *     (never cached) so it always reflects the current battle — adventure
 *     battles that build G without a config simply resolve to null.
 *
 * Lifecycle hooks (all optional):
 *   onIntro(ctx, done)                      — async; before the board is built
 *   onBattleStart(ctx, done)                — async; board built, before turn 1
 *   onTurnStart(ctx, turn)                  — sync; start of a selection phase
 *   onPlayerPlayed(ctx, {cardId,locId,turn})— sync; after a player commits a card
 *   onBeforeReveal(ctx, turn)               — sync; before the flip animation
 *   onAfterReveal(ctx, {turn, revealed})    — sync; after flips + At-Once + cont.
 *   onWin(ctx, result, proceed)             — async; script runs outcome, then
 *   onLoss(ctx, result, proceed)              calls proceed() for the default
 *   onTie(ctx, result, proceed)               scoreboard, or owns the end screen
 *   isInputBlocked(ctx)                     — pull predicate consulted in commitPlay
 *
 * ctx = { G, config, services } where services exposes shared engine primitives.
 *
 * Public API (window.SOG.BattleHooks):
 *   .register(name, module)   — a script registers itself by name
 *   .get(name)                — look up a registered script (or null)
 *   .current()                — resolve the active script from G.config (or null)
 *   .has(hookName)            — active script implements hookName?
 *   .fire(hookName, args)     — sync fire-and-forget (no default)
 *   .runOr(hookName, args, defaultFn)      — sync; hook OR default
 *   .runAsyncOr(hookName, args, done)      — async; hook(…, done) OR done()
 *   .isInputBlocked()         — script/flag says block card placement?
 *   .context()                — build the ctx handle
 *   .services                 — the shared services object
 */

window.SOG = window.SOG || {};

SOG.BattleHooks = (function () {
  'use strict';

  var registry      = {};
  var _inputBlocked = false;   // imperative block set via services.blockInput()

  /* ── Registry ──────────────────────────────────────────────────── */
  function register(name, mod) { if (name) registry[name] = mod; }
  function get(name)           { return name ? (registry[name] || null) : null; }

  /* ── Dynamic resolution of the active script ───────────────────── */
  function current() {
    var G = SOG.state && SOG.state.G;
    var name = G && G.config && G.config.scriptHook;
    return get(name);
  }
  function has(hookName) {
    var s = current();
    return !!(s && typeof s[hookName] === 'function');
  }

  /* ── Shared services exposed to scripts via ctx.services ─────────
     Thin, lazily-resolved pass-throughs to existing engine primitives.
     (Best-effort wiring for the mechanism; scripts use what they need.) */
  var services = {
    showDialogue: function (lines, done) {
      if (SOG.HUD && typeof SOG.HUD.runDialogue === 'function') return SOG.HUD.runDialogue(lines, done);
      if (typeof done === 'function') done();
    },
    blockInput:   function () { _inputBlocked = true;  },
    unblockInput: function () { _inputBlocked = false; },
    getSlotEl: function () {
      return (SOG.board && SOG.board.getSlotEl) ? SOG.board.getSlotEl.apply(SOG.board, arguments) : null;
    },
    flipSlot: function () {
      var fn = window.flipSlot || (SOG.game && SOG.game.flipSlot);
      if (typeof fn === 'function') return fn.apply(null, arguments);
    },
    showCardAcquisition: function () {
      var P = SOG.Adventure && SOG.Adventure.Prehistory;
      if (P && typeof P.showCardAcquisition === 'function') return P.showCardAcquisition.apply(P, arguments);
    },
    showScoreboard: function () {
      if (typeof window.showScreen === 'function') window.showScreen('screen-result');
    },
    applyBattleAvatars: function (presentation) {
      if (SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') SOG.HUD.applyBattleAvatars(presentation);
    },
    restoreBattleAvatars: function () {
      if (SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    }
  };

  function context() {
    var G = SOG.state && SOG.state.G;
    return { G: G, config: G && G.config, services: services };
  }

  /* ── Dispatch helpers ──────────────────────────────────────────── */
  // Call the active script's hook (assumes has(hookName)).
  function _call(hookName, args) {
    var s = current();
    return s[hookName].apply(null, [context()].concat(args || []));
  }
  // Sync fire-and-forget: run the hook if present, no default.
  function fire(hookName, args) {
    if (has(hookName)) return _call(hookName, args);
  }
  // Sync: run the hook if present, else the engine default.
  function runOr(hookName, args, defaultFn) {
    if (has(hookName)) return _call(hookName, args);
    return (typeof defaultFn === 'function') ? defaultFn() : undefined;
  }
  // Async: run the hook with a trailing done/proceed continuation if present,
  // else call done() immediately. Lets the engine await/pause on the script.
  function runAsyncOr(hookName, args, done) {
    if (has(hookName)) return _call(hookName, (args || []).concat([done]));
    if (typeof done === 'function') done();
  }

  /* ── Input gate (pull predicate consulted in commitPlay) ───────── */
  function isInputBlocked() {
    if (_inputBlocked) return true;
    if (has('isInputBlocked')) return !!_call('isInputBlocked', []);
    return false;
  }

  return {
    register:       register,
    get:            get,
    current:        current,
    has:            has,
    fire:           fire,
    runOr:          runOr,
    runAsyncOr:     runAsyncOr,
    isInputBlocked: isInputBlocked,
    context:        context,
    services:       services
  };

})();

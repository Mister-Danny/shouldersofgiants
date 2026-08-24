/**
 * game.js — Shoulders of Giants · Core Turn Engine + Card Ability Engine (Step 6)
 *
 * Slot ordering:     Cards fill left-to-right; gaps compact left on removal.
 * Reveal ordering:   Sequential, alternating player/AI, ~800 ms apart.
 * IP model:          slotData.ip  = base IP at time of play (card.ip + G.cardIPBonus)
 *                    slotData.ipMod  = permanent modifier (reset by Justinian)
 *                    slotData.contMod = continuous modifier (recalculated each pass)
 *                    effectiveIP(s) = s.ip + s.ipMod + s.contMod
 *
 * Ability trigger points:
 *   At Once    — fireAtOnce()      called immediately after flipSlot()
 *   Continuous — evaluateContinuous() called after every At Once + at end of reveal pass
 *   Conditional — triggered by destroyCard() / discardFromHand()
 *
 * Depends on: cards.js, locations.js, ui.js
 * Exposes:    window.initGame([injectedCfg])  — optional config; falls back to resolveBattleConfig
 */

(function () {
  'use strict';

  /* ── State and constants from game/state.js ──────────────────
     state.js loads before this file (see index.html) and populates
     SOG.state with G and all numeric/string constants. We alias them
     into local vars so the rest of this file reads the same as it
     did before the Pass 3a extraction.                              */
  var G             = SOG.state.G;
  var TURNS         = SOG.state.TURNS;
  var CAPITAL       = SOG.state.CAPITAL;
  var HAND_START    = SOG.state.HAND_START;
  var MAX_HAND_SIZE = SOG.state.MAX_HAND_SIZE;
  var SLOTS_PER_LOC = SOG.state.SLOTS_PER_LOC;
  var REVEAL_DELAY  = SOG.state.REVEAL_DELAY;
  var POST_REVEAL   = SOG.state.POST_REVEAL;
  var TYPE_ORDER    = SOG.state.TYPE_ORDER;

  /* ── Board helpers from game/board.js (Pass 3b) ──────────────
     board.js loads before this file. We alias each helper into a
     local var of the same name so the existing call sites in
     game.js (placeRevealedCard, effectiveIP, updateScores, etc.)
     continue to work unchanged.                                     */
  var shuffle               = SOG.board.shuffle;
  var getSlotEl             = SOG.board.getSlotEl;
  var findSlotEl            = SOG.board.findSlotEl;
  var getCardLocId          = SOG.board.getCardLocId;
  var setSlotFaceDown       = SOG.board.setSlotFaceDown;
  var buildCardFace         = SOG.board.buildCardFace;
  /* Renders a slot with the slot-data's OWN cc when it differs from the card
     definition — a Mummy (72) is defined 0/0 but carries its source's frozen cc.
     Every path that rebuilds a face must go through this or the badge regresses. */
  var faceCard              = SOG.board.faceCard;
  var placeRevealedCard     = SOG.board.placeRevealedCard;
  var isMoveBlockedInto     = SOG.board.isMoveBlockedInto;   // NO_MOVE_HERE (The Cataracts)
  var removeEl              = SOG.board.removeEl;
  var makeBoardGhost        = SOG.board.makeBoardGhost;
  var removeGhost           = SOG.board.removeGhost;
  var clearSlotDOM          = SOG.board.clearSlotDOM;
  var compactPlayerSlots    = SOG.board.compactPlayerSlots;
  var syncPlayerSlots       = SOG.board.syncPlayerSlots;
  var compactOppSlots       = SOG.board.compactOppSlots;
  var syncOppSlots          = SOG.board.syncOppSlots;
  var effectiveCost         = SOG.board.effectiveCost;
  var effectiveIP           = SOG.board.effectiveIP;
  var addIPMod              = SOG.board.addIPMod;
  var updateScores          = SOG.board.updateScores;
  var refreshSlotIPDisplays = SOG.board.refreshSlotIPDisplays;
  var updateHeader          = SOG.board.updateHeader;

  /* ── Input helpers from game/input.js (Pass 3c) ──────────────
     input.js loads after board.js but before game.js. We alias
     each helper that game.js still calls (rebuildPlayerHand from
     init/abilities, refreshHand* and refreshMoveableCards from
     reveal/abilities/turn-flow, commitPlay from applyOpponentActions,
     snapBack from startReveal, resetTurn from the reset button). */
  var rebuildPlayerHand       = SOG.input.rebuildPlayerHand;
  var refreshHandIPDisplays   = SOG.input.refreshHandIPDisplays;
  var refreshHandCostDisplays = SOG.input.refreshHandCostDisplays;
  var refreshMoveableCards    = SOG.input.refreshMoveableCards;
  var commitPlay              = SOG.input.commitPlay;
  var queueMove               = SOG.input.queueMove;
  var snapBack                = SOG.input.snapBack;
  var resetTurn               = SOG.input.resetTurn;
  var clearSelection          = SOG.input.clearSelection;

  /* ── Ability helpers from game/abilities.js (Pass 4) ─────────
     abilities.js loads after input.js but before game.js. We alias
     each helper that game.js still calls. game.js's reveal phase
     calls fireAtOnce + evaluateContinuous repeatedly; the avatar
     reveal-first highlight is shown/hidden by nextTurn and other
     turn-boundary helpers. */
  var fireAtOnce                    = SOG.abilities.fireAtOnce;
  var evaluateContinuous            = SOG.abilities.evaluateContinuous;
  var isKenteProtected              = SOG.abilities.isKenteProtected;
  var showRevealFirstHighlight      = SOG.abilities.showRevealFirstHighlight;
  var hideRevealFirstHighlight      = SOG.abilities.hideRevealFirstHighlight;
  var getAdjacentLocIds             = SOG.abilities.getAdjacentLocIds;

  /* ── Drag state (game.js no longer needs its own — owned by input.js) ── */
  /* dragInfo, selectedCardId/Source/FromLocId/FromSlotIndex, pendingPopupTimer,
     DBLCLICK_MS all moved to game/input.js (Pass 3c). game.js no longer
     reads or writes these directly — input.js owns the entire select-phase
     interaction surface. */

  /* ── Background music ─────────────────────────────────────────
     Moved to game/ui.js in Pass 2. Call sites in this file use
     SOG.ui.startBgMusic / SOG.ui.stopBgMusic. */

  /* ── Selection timer state ──────────────────────────────────── */
  var _timerEl         = null;   /* kept for compat — legacy HUD box, never shown */
  var _timerValEl      = null;
  var _timerBarWrapEl  = null;
  var _timerBarEl      = null;
  var _timerInterval   = null;
  var _timerSecs       = 0;
  var _timerTotal      = 0;

  /* ── Undo-end-turn state ─────────────────────────────────────── */
  var _undoEndTurnTimer    = null;
  var _undoEndTurnCountdown = 0;

  /* ── DOM refs ────────────────────────────────────────────────── */
  var headerPhaseEl    = document.getElementById('battle-phase-info');
  var endTurnBtn       = document.getElementById('battle-end-turn');
  var resetTurnBtn     = document.getElementById('battle-reset-turn');
  var playerHandEl     = document.getElementById('battle-player-hand');
  var boardEl          = document.getElementById('battle-board');
  /* headerTurnEl and capitalNumEl moved to game/board.js (Pass 3b).
     Battle-popup and opponent-hand refs moved to game/ui.js (Pass 2). */

  /* ═══════════════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════════════ */

  /* Build the battle-config object for a standard/Arcadium match from TODAY's
     sources — SOG.state constants, the 2P Match config, window.aiDifficulty,
     and the forced-locations strategy. Matches the battle-config schema blocks
     (structure / resource / decks / locationAbilities / ai / scoring).
     Battle-config arc Step 1: this is attached to G.config but NOT yet read —
     the engine still runs off its constants. Every value here equals the
     source it mirrors, so attaching it is behavior-neutral. (Steps 2+ route
     initGame's reads through it; turns/scoring/AI reads come in a later step.) */
  function resolveBattleConfig(twoPlayerCfg) {
    var cfg2p             = twoPlayerCfg || null;
    var hasExplicitLocs   = !!(cfg2p && cfg2p.locations  && cfg2p.locations.length);
    var hasExplicitAiDeck = !!(cfg2p && cfg2p.oppDeckIds && cfg2p.oppDeckIds.length);
    return {
      structure: {
        turns:            TURNS,
        locationsCount:   3,
        slotsPerLocation: SLOTS_PER_LOC,
        handStart:        HAND_START,
        maxHandSize:      MAX_HAND_SIZE
      },
      resource: { model: 'capital', capital: CAPITAL, resetEachTurn: true },
      // Draw policy. 'replenish' = draw back exactly what was played last turn
      // (deck permitting, deliberately uncapped — ability-granted cards ride
      // above maxHandSize). The 'flat' variant (+N/turn) exists for future battles.
      draw: { model: 'replenish' },
      decks: {
        player: { source: 'active-deck' },                     // window.Decks.getActiveCards()
        ai: hasExplicitAiDeck
          ? { source: 'explicit', ids: cfg2p.oppDeckIds.slice() }
          : { source: 'random-types', typeCount: 3 }           // buildAiDeck()
      },
      locationAbilities: {
        // Abilities ride along with the chosen location objects' abilityKey;
        // this block only describes how those locations are selected.
        select: hasExplicitLocs
          ? { mode: 'explicit', locations: cfg2p.locations }
          : { mode: 'random-of-catalog', count: 3, catalog: 'LOCATIONS', allowForced: true }
      },
      ai:      { profile: window.aiDifficulty },
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'draw' },
      scriptHook: null
    };
  }

  function initGame(injectedCfg) {
    // Default to easy if no difficulty was chosen (e.g. launched from tutorial)
    if (!window.aiDifficulty) window.aiDifficulty = 'easy';

    /* ── 2P mode: use Match-resolved locations + opponent deck ─── */
    var _2pCfg = (window.matchId && typeof Match !== 'undefined') ? Match.get2PConfig() : null;

    /* Battle-config injection seam (Prehistory-cutover prerequisite):
       a caller may pass a fully-formed config (e.g. a scripted Adventure
       battle); otherwise initGame resolves its own as before. Arcadium and
       every current caller pass nothing → the fallback runs resolveBattleConfig
       exactly as today, so behaviour is byte-for-byte identical. From here
       initGame reads its setup values through cfg; _2pCfg only feeds the
       fallback. */
    G.config = injectedCfg || resolveBattleConfig(_2pCfg);
    var cfg = G.config;

    /* Dev/testing: window.__forceTier ('serf' | 'giant') bakes an AI tier into THIS
       battle's config and self-clears, so the chosen brain is used for one battle
       only (no leakage into the next). Set by the dev-menu tier launchers.
       window.__forceSerfTier stays as a back-compat alias for the Serf launchers. */
    var __traceForceTier = window.__forceTier;   // TEMP TRACE: capture before clear
    if (window.__forceTier && cfg.ai) {
      cfg.ai.tier = window.__forceTier;
      window.__forceTier = null;
    }
    if (window.__forceSerfTier) {
      if (cfg.ai) cfg.ai.tier = 'serf';
      window.__forceSerfTier = false;
    }

    /* flagTier — the "flag slot" a win stamps + the tier SOG.rewards gates gold/card on.
       Tier and flag now ALIGN for every boss (the old Gilgamesh decoupling is removed),
       so this just tracks ai.tier. window.__forceFlagTier is retained as a general
       override hook but nothing sets it today → flagTier === ai.tier. Self-clears. */
    cfg.flagTier = window.__forceFlagTier || (cfg.ai && cfg.ai.tier) || null;
    window.__forceFlagTier = null;

    /* AI profile bridge (Step 5): populate the global the AI read sites (ai.js,
       game.js) already use FROM the config. This is the deliberate minimal
       bridge — the read sites are untouched. Value round-trips the same string
       resolveBattleConfig just captured, so behavior is identical. */
    window.aiDifficulty = cfg.ai.profile;

    /* onIntro (async script hook): fires BEFORE the board is built. With no
       script present (Arcadium / 2P / standard → scriptHook null) runAsyncOr
       invokes the build continuation immediately — behaviour-identical to today. */
    SOG.BattleHooks.runAsyncOr('onIntro', [], _initGameBuild);
  }

  function _initGameBuild() {
    var cfg = G.config;

    /* Locations: cfg.locationAbilities.select — an explicit set (2P/Match) or
       the random/forced pick. Equivalent to the old _2pCfg.locations branch. */
    var locSel = cfg.locationAbilities.select;
    G.locations = (locSel.mode === 'explicit' && locSel.locations && locSel.locations.length)
      ? locSel.locations
      : pickLocations();
    window.initBattleUI(G.locations);

    /* Player deck: cfg.decks.player. 'explicit' → a fixed id list from config
       (scripted Adventure battles); otherwise the player's active deck from the
       deck builder (Arcadium / 2P → 'active-deck'). The explicit branch is
       unreached by Arcadium. */
    var pDeck = cfg.decks.player;
    if (pDeck && pDeck.source === 'explicit' && pDeck.ids && pDeck.ids.length) {
      var pIds = pDeck.ids.slice();
      G.playerDeck = pDeck.shuffle ? shuffle(pIds) : pIds;
    } else {
      var deckIds = (window.Decks && window.Decks.getActiveCards()) || [];
      G.playerDeck = shuffle(deckIds.slice());
    }
    G.playerHand = G.playerDeck.splice(0, cfg.structure.handStart);

    /* AI deck: cfg.decks.ai. 'explicit' → fixed ids (2P); 'scripted' → seed the
       hand with ai.settings.playOrder and the deck with handPadding (scripted
       opponent — faces never shown; the scriptedSequence AI step plays one each
       turn); otherwise random-types via buildAiDeck (Arcadium). The 'scripted'
       branch is unreached by Arcadium. */
    var aiDeckCfg = cfg.decks.ai;
    if (aiDeckCfg.source === 'explicit' && aiDeckCfg.ids && aiDeckCfg.ids.length) {
      G.aiDeck = shuffle(aiDeckCfg.ids.slice());
      G.aiHand = G.aiDeck.splice(0, cfg.structure.handStart);
    } else if (aiDeckCfg.source === 'scripted') {
      var aiSettings = (cfg.ai && cfg.ai.settings) || {};
      G.aiHand = (aiSettings.playOrder   || []).slice();   // hand = scripted sequence
      G.aiDeck = (aiSettings.handPadding || []).slice();   // deck = cosmetic padding
    } else {
      G.aiDeck = buildAiDeck();
      G.aiHand = G.aiDeck.splice(0, cfg.structure.handStart);
    }

    // Stage 1 preload: warm both decks' card art + reveal-fx overlays + this
    // battle's SFX into cache now, so the reveal sequence plays from cache instead
    // of fetching mid-animation online. Fire-and-forget — never blocks.
    if (window.SOG && SOG.preload && typeof SOG.preload.battle === 'function') SOG.preload.battle(G);

    // Context soundtrack — switch to this battle's track at battle ENTRY (here, in
    // the build), NOT at turn-1 activation, so the overworld track doesn't keep
    // playing through a long opening cinematic (e.g. the Neanderthal coaching).
    // Adventure bosses each get their own track (constant 50%); Arcadium / 2P fall
    // back to the legacy playlist. Idempotent — a "Play Again" won't restart it.
    (function () {
      var ctx = cfg.scriptHook ? ('battle:' + cfg.scriptHook) : null;
      if (ctx && window.SOG && SOG.music && typeof SOG.music.playContext === 'function'
          && SOG.music.srcForContext(ctx)) {
        SOG.music.playContext(ctx);
      } else if (window.SOG && SOG.ui && typeof SOG.ui.startBgMusic === 'function') {
        SOG.ui.startBgMusic();
      }
    })();

    G.locations.forEach(function (loc) {
      G.playerSlots[loc.id] = Array(cfg.structure.slotsPerLocation).fill(null);
      G.aiSlots[loc.id]     = Array(cfg.structure.slotsPerLocation).fill(null);
    });

    G.turn              = 1;
    G.phase             = 'select';
    G.capital           = _capitalForTurn(cfg.resource, G.turn);
    G.turnStartCapital  = G.capital;
    G.playerFirst       = Math.random() < 0.5;
    showRevealFirstHighlight(G.playerFirst);
    G.playerRevealQueue = [];
    G.aiRevealQueue     = [];
    G.aiActionLog       = [];   // bug 16: unified action log mirroring playerActionLog

    G.locationBoosts         = {};   // { locId: { player: [...], opp: [...] } } — rebuilt by evaluateContinuous
    G.playOrderCounter       = 0;   // increments on every play-from-hand; stored on each sd.playTime
    G.culturalCount          = { player: 0, opp: 0 };  // cumulative Cultural plays per owner (Gilgamesh)

    G.bonusCapitalNextTurn   = 0;
    G.aiBonusCapitalNextTurn = 0;
    G.nextTurnEffects        = [];  // general "Next Turn:" effects queue (Ramses 53); pruned in nextTurn
    G.playerDiscard          = [];  // Batch C resurrection pile — snapshot entries { cardId, ip, cc }; fed by discardFromHand
    G.aiDiscard              = [];
    G.playerDestroyed        = [];  // Batch C destroyed pile — same entry shape; fed by destroyCard. Priest (71) revives from BOTH
    G.aiDestroyed            = [];
    // Egypt Farmer (55): one PENDING +1 IP per side for the next card that side
    // plays. A flag, not a counter (Farmers don't stack), and deliberately NOT
    // cleared by nextTurn — it waits across turns until a card consumes it.
    G.pendingIPBuff          = { player: false, opp: false };
    G.cardIPBonus            = {};
    G.aiCardIPBonus          = {};
    // Papyrus (54) state-copy: PERMANENT ipMod inherited by a pending copy in
    // hand, keyed per side by cardId; consumed (deleted) when the copy is played.
    G.copyIPBonus            = { player: {}, opp: {} };
    G.nebCCDiscount          = { player: {}, opp: {} };  // Nebuchadnezzar one-time in-hand -1 CC stamps
    G.ramsesCCDiscount       = { player: {}, opp: {} };  // Ramses II one-time in-hand -1 CC stamps
    G.destroyedIPTotal       = 0;
    G.aiDestroyedIPTotal     = 0;
    /* Akhenaten (77) — "Forsaken Gods". A MONOTONIC per-owner tally of discard
       EVENTS this battle, incremented in abilities.discardFromHand (the one central
       pipeline every discard funnels through) and NEVER decremented. Deliberately
       not the discard pile: Jesus discarded is filtered out of the pile by
       staysDead yet still counts, and a Priest/Book resurrection consumes a pile
       entry without lowering the count. History, not inventory. Battle-scoped, so
       it resets here with the rest of the per-battle counters. */
    G.discardCount           = { player: 0, opp: 0 };
    // Queued Akhenaten pulses (one per discard event, drained after the source
    // ability's own animation finishes — see flushAkhenatenPulses in abilities.js).
    G.akhPulseQueue          = { player: 0, opp: 0 };
    G.columbusMoved          = false;
    G.aiColumbusMoved        = false;
    G.movedThisTurn          = {};
    G.locMoveUsedThisTurn    = {};
    G.aiMovedThisTurn        = {};
    G.moveLog                = [];
    G.playerActionLog        = [];
    G.traderBarter           = null;   // Trader (68) barter preview/queue
    G.locationSnapshots      = {};
    G.reservedSlotsPerLoc    = {};
    G.deferredPlays          = {};
    SOG.input.resetDragInfo();

    rebuildPlayerHand();
    SOG.ui.updateOppHand();
    /* capitalNumEl is now looked up inside board.updateHeader (Pass 3b). */

    endTurnBtn.textContent     = 'END TURN';
    endTurnBtn.disabled        = false;
    resetTurnBtn.disabled      = false;
    resetTurnBtn.style.display = '';
    document.getElementById('btn-back-results').style.display = 'none';
    // Bug 19: tutorial.js hides Play Again at the end of the tutorial battle
    // via inline style.display = 'none' but never restores it. Reset on every
    // fresh game so subsequent battles show Play Again again.
    var _resultPlayAgainBtn = document.getElementById('result-play-again');
    if (_resultPlayAgainBtn) _resultPlayAgainBtn.style.display = '';

    updateHeader();
    refreshMoveableCards();

    /* onBattleStart (async script hook): the board is built and the gameplay UI
       is in place; a script can run its opening sequence (coaching, dialogue,
       interactive pause) and gate turn 1 until done(). With no script present
       the turn-1 activation tail runs immediately — behaviour-identical. */
    SOG.BattleHooks.runAsyncOr('onBattleStart', [], function _activateTurn1() {
      // (Battle music already started at battle entry in _initGameBuild.)
      _startSelectionTimer();
      if (typeof Analytics !== 'undefined') {
        Analytics.gameStarted(window.aiDifficulty);
      }
    });
  }

  /* ── Utilities ───────────────────────────────────────────────── */
  /* shuffle moved to game/board.js (Pass 3b). Aliased above. */

  /* ═══════════════════════════════════════════════════��══════════
     SELECTION PHASE TIMER
     Active only when window.tournamentMatch === true.
     Turn 1: 60s, each subsequent turn adds 15s.
  ══════════════════════════════════════════════════════════════ */

  function _timerRefs() {
    if (!_timerBarWrapEl) {
      _timerEl       = document.getElementById('battle-timer');      /* legacy */
      _timerValEl    = document.getElementById('battle-timer-val');  /* legacy */
      _timerBarWrapEl = document.getElementById('battle-timer-bar-wrap');
      _timerBarEl     = document.getElementById('battle-timer-bar');
    }
  }

  function _timerBarUpdate() {
    if (!_timerBarEl) return;
    var pct   = _timerTotal > 0 ? Math.max(0, _timerSecs / _timerTotal) * 100 : 0;
    _timerBarEl.style.width = pct + '%';
    _timerBarEl.className   = 'battle-timer-bar' +
      (_timerSecs <= 10 ? ' urgent' : _timerSecs <= 20 ? ' warning' : '');
  }

  function _startSelectionTimer() {
    if (!window.tournamentMatch || window.tournamentMatch === false) return;
    _timerRefs();
    _stopSelectionTimer();

    _timerTotal = 60 + (G.turn - 1) * 15;
    _timerSecs  = _timerTotal;

    if (_timerBarWrapEl) {
      /* Set to 100% instantly (no transition), then let each tick drain smoothly */
      _timerBarEl.style.transition = 'none';
      _timerBarEl.style.width      = '100%';
      _timerBarEl.className        = 'battle-timer-bar';
      _timerBarWrapEl.style.display = '';
      /* Re-enable transition on next frame so the first tick animates */
      requestAnimationFrame(function () {
        if (_timerBarEl) _timerBarEl.style.transition = '';
      });
    }

    _timerInterval = setInterval(function () {
      _timerSecs--;
      _timerBarUpdate();

      if (_timerSecs <= 0) {
        _stopSelectionTimer();
        if (G.phase === 'select' && !window.tutorialActive) {
          if (typeof SFX !== 'undefined') SFX.endTurn();
          onEndTurn();
        }
      }
    }, 1000);
  }

  function _stopSelectionTimer() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
    _timerRefs();
    if (_timerBarWrapEl) _timerBarWrapEl.style.display = 'none';
  }

  /* ═══════════════════════════════════════════════════════════════
     2P MATCH HELPERS
  ═══════════════════════════════════════════════════════════════ */

  function _showMatchWaitOverlay(show) {
    var el = document.getElementById('match-wait-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  /**
   * Apply serialised opponent actions to G.aiSlots / G.aiRevealQueue.
   * Called in 2P mode after both players have submitted their turn.
   * Moves are applied first (already-revealed cards), then plays (new cards face-down).
   */
  function applyOpponentActions(actions) {
    if (!actions) actions = [];
    G.aiRevealQueue = [];
    // Bug 16 scope note: multiplayer's executeMove path is preserved for now
    // (bug 20). aiActionLog is reset here to keep state clean even though
    // applyOpponentActions doesn't write to it yet.
    G.aiActionLog   = [];

    /* ── Moves: delegate to executeMove so face-up render, IP mods
          (Cape +1, Magellan +1, Columbus), and slot compaction all
          run correctly for every movement card.                    ── */
    actions.filter(function (a) { return a.type === 'move'; }).forEach(function (a) {
      var fromSlots = G.aiSlots[a.fromLocId];
      if (!fromSlots) return;
      var fromIdx = -1;
      fromSlots.forEach(function (s, i) { if (s && s.cardId === a.cardId) fromIdx = i; });
      if (fromIdx === -1) return;
      executeMove('opp', a.fromLocId, fromIdx, a.toLocId);
    });

    /* ── Plays: place new cards face-down ───────────────────── */
    actions.filter(function (a) { return a.type === 'play'; }).forEach(function (a) {
      var card = CARDS.find(function (c) { return c.id === a.cardId; });
      if (!card) return;
      var locId = a.toLocId;
      if (locId == null || !G.aiSlots[locId]) return;
      var slotIndex = G.aiSlots[locId].indexOf(null);
      if (slotIndex === -1) return;
      var baseIP = card.ip + (G.aiCardIPBonus[a.cardId] || 0);
      G.aiSlots[locId][slotIndex] = { cardId: a.cardId, ip: baseIP, revealed: false, ipMod: 0, contMod: 0, ipModSources: [], bonuses: [] };
      // Remove ONE instance (filter would delete both copies of a duplicated id).
      var _2phi = G.aiHand.indexOf(a.cardId);
      if (_2phi !== -1) G.aiHand.splice(_2phi, 1);
      G.aiRevealQueue.push(a.cardId);
      var slotEl = getSlotEl('opp', locId, slotIndex);
      if (slotEl) { slotEl.dataset.cardId = String(a.cardId); setSlotFaceDown(slotEl); }
    });

    SOG.ui.updateOppHand();
  }

  function pickLocations() {
    // Bypass menu: teacher may force a specific set of 3 locations
    try {
      var forced = JSON.parse(localStorage.getItem('sog_forced_locations'));
      if (Array.isArray(forced) && forced.length === 3) {
        var result = forced.map(function (id) {
          return LOCATIONS.find(function (l) { return l.id === id; });
        }).filter(Boolean);
        if (result.length === 3) return result;
      }
    } catch (e) {}
    // Standard Arcadium pool = the six locations with an ability. Savannah (7)
    // and Desert (8) carry abilityKey null and exist only for the Ötzi adventure
    // battle (which resolves them by id from LOCATIONS), so exclude them from the
    // random pick.
    var pool = LOCATIONS.filter(function (l) { return l.abilityKey != null; });
    pool.sort(function () { return Math.random() - 0.5; });
    return pool.slice(0, 3);
  }

  function buildAiDeck() {
    var types = TYPE_ORDER.slice();
    types.sort(function () { return Math.random() - 0.5; });
    var deck = [];
    types.slice(0, 3).forEach(function (type) {
      CARDS.filter(function (c) { return c.type === type && !c.locked && SOG.Cards.laneOf(c) === 'arcadium'; })
           .forEach(function (c) { deck.push(c.id); });
    });
    return shuffle(deck);
  }

  /* updateHeader moved to game/board.js (Pass 3b). Aliased above. */

  /* ═══════════════════════════════════════════════════════════════
     INPUT (Pass 3c) — game/input.js owns everything in this region
     ───────────────────────────────────────────────────────────────
     Moved out of this file:
       • Hand event handlers (click / dblclick / drag / keyboard)
       • Board drag/click/dblclick/keyboard handlers + selection state
       • Document-level click & keyboard handlers
       • Touch drag support (initTouchDrag)
       • Legality predicates (isLegalPlayTarget / Undo / Move)
       • Terminal actions: commitPlay, undoPlay, queueMove
       • Reveal-phase entry helpers: snapBack, resetTurn
       • Hand display refresh: rebuildPlayerHand, refreshHand{IP,Cost}
       • Moveable affordance: refreshMoveableCards
     Call sites in this file use the aliases at the top of the IIFE
     (rebuildPlayerHand, refreshHand*, refreshMoveableCards, snapBack,
     resetTurn, commitPlay, queueMove, clearSelection).
  ═══════════════════════════════════════════════════════════════ */


  /* ═══════════════════════════════════════════════════════════════
     SLOT HELPERS
     Pre-Pass-3b this section housed all slot DOM and compaction
     functions; most have moved to game/board.js (aliased above).
     flipSlot stays here for now because it dispatches per-card
     reveal effects (Kente / Juvenal / Cosimo / Henry); Pass 4
     (the abilities registry) is where that separates cleanly.
  ═══════════════════════════════════════════════════════════════ */

  /* Current slot element holding this exact slot-data object, or null. Found by
     OBJECT IDENTITY rather than cardId — a side can legitimately hold two cards of
     the same id (a Papyrus copy, a Nubian Gold token) — so this pins the right one
     even after the card has been moved between slots mid-reveal. */
  function _liveSlotElFor(owner, sd) {
    if (!sd) return null;
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    for (var i = 0; i < G.locations.length; i++) {
      var lid = G.locations[i].id, arr = slots[lid];
      if (!arr) continue;
      var idx = arr.indexOf(sd);
      if (idx !== -1) return getSlotEl(owner, lid, idx);
    }
    return null;
  }

  /**
   * flipSlot(slotEl, done)
   * Reveals a face-down card with SFX + animation, fires per-card reveal
   * effects (Kente, Juvenal, Cosimo, Henry), then calls done() when all
   * reveal effects are complete so the next card / ability can begin cleanly.
   */
  function flipSlot(slotEl, done) {
    if (typeof SFX !== 'undefined') SFX.cardReveal();
    var cardId    = parseInt(slotEl.dataset.cardId,    10);
    var locId     = parseInt(slotEl.dataset.locId,     10);
    var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
    var owner     = slotEl.dataset.owner;
    var card      = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) { if (done) done(); return; }
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    if (slots[locId] && slots[locId][slotIndex]) slots[locId][slotIndex].revealed = true;
    slotEl.removeAttribute('draggable');
    slotEl.classList.remove('face-down', 'unplayed');
    slotEl.classList.add('face-up');
    var sd = slots[locId] && slots[locId][slotIndex];
    buildCardFace(slotEl, faceCard(sd, card), sd ? effectiveIP(sd) : card.ip);
    if (typeof Anim !== 'undefined') Anim.cardReveal(slotEl);

    // ── Per-card reveal SFX + animations ──────────────────────────
    // Wait for the 300ms card-reveal scale-in to finish, then fire
    // per-card effects and signal done when they complete.
    setTimeout(function () {
      var extraDelay = 0; // ms to wait for per-card effects before calling done

      // Kente Cloth (id 17): shield chime + warm orange location glow
      if (cardId === 17) {
        if (typeof SFX !== 'undefined') SFX.kenteSound();
        var locTileEl = boardEl.querySelector('.battle-col[data-loc-id="' + locId + '"]');
        if (typeof Anim !== 'undefined') Anim.setKenteGlow(locTileEl, true);
        extraDelay = Math.max(extraDelay, 400);
      }

      // Juvenal (id 18): laughter + orange flash only when he actually penalises cards
      if (cardId === 18) {
        var juvenalTargetEls = [];
        ['player', 'opp'].forEach(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          sl[locId].forEach(function (s, si) {
            if (!s || !s.revealed || s.cardId === 18) return;
            // honors a Mummy's inherited CC (sd.cc) via abilities.effectiveCC
            if (SOG.abilities.effectiveCC(s) >= 4) juvenalTargetEls.push(getSlotEl(own, locId, si));
          });
        });
        if (juvenalTargetEls.length > 0) {
          if (typeof SFX  !== 'undefined') SFX.juvenalSound();
          if (typeof Anim !== 'undefined') juvenalTargetEls.forEach(function (el) { if (el) Anim.juvenalFlash(el); });
          extraDelay = Math.max(extraDelay, 600);
        }
      }

      // Any card revealed at a location where Juvenal is already active:
      // flash the newly revealed card if it is penalised (CC ≥ 4, not Juvenal itself)
      if (cardId !== 18 && card && card.cc >= 4) {
        /* ABILITY id, mirroring evaluateContinuous's own Juvenal detection
           (abilities.js, abilityIdOf(s) === 18). Presentation only — the -2 itself
           is applied by evaluateContinuous — but a raw cardId scan meant a Rosetta
           (58) that had TRANSCRIBED Juvenal levied the penalty with no flash to
           explain it. Same "if one side changes, the other must" rule as the CC
           badge / effectiveCost pair. */
        var juvenalPresent = ['player', 'opp'].some(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          return sl[locId].some(function (s) {
            return s && s.revealed && ((s.transcribedFrom != null) ? s.transcribedFrom : s.cardId) === 18;
          });
        });
        if (juvenalPresent) {
          if (typeof SFX !== 'undefined') SFX.juvenalSound();
          if (typeof Anim !== 'undefined') Anim.juvenalFlash(slotEl);
          extraDelay = Math.max(extraDelay, 600);
        }
      }

      // Cosimo de'Medici (id 19): money-bags chime on reveal
      if (cardId === 19) {
        if (typeof SFX !== 'undefined') SFX.cosimoSound();
        extraDelay = Math.max(extraDelay, 300);
      }

      // Henry the Navigator (id 22): patronage chime on reveal
      if (cardId === 22) {
        if (typeof SFX !== 'undefined') SFX.henrySound();
        extraDelay = Math.max(extraDelay, 300);
      }

      // Per-card REVEAL presentation (flavor only; separate from CARD_ABILITIES).
      // Registered cards get custom SFX/animation that OVERLAYS the flip without
      // stalling the loop (handlers return 0). Unregistered cards are untouched.
      if (window.SOG && SOG.RevealFx && typeof SOG.RevealFx.fire === 'function') {
        var fxDelay = SOG.RevealFx.fire({
          cardId: cardId, owner: owner, locId: locId, slotIndex: slotIndex,
          card: card, slotEl: slotEl, getSlotEl: getSlotEl
        });
        extraDelay = Math.max(extraDelay, fxDelay || 0);
      }

      // Signal done after per-card effects have had time to play
      if (done) setTimeout(done, extraDelay);
    }, 320);
  }

  /* placeRevealedCard, removeEl, makeBoardGhost, removeGhost, clearSlotDOM,
     effectiveCost, effectiveIP, addIPMod, updateScores, refreshSlotIPDisplays
     all moved to game/board.js (Pass 3b). Aliased at top of IIFE. */

  /* flashScore moved to game/ui.js (Pass 2) — callers use SOG.ui.flashScore. */

  /* ═══════════════════════════════════════════════════════════════
     BUTTONS
  ═══════════════════════════════════════════════════════════════ */

  endTurnBtn.addEventListener('click', function () {
    if (window.tutorialActive) return;  // tutorial owns this button
    if (G.phase !== 'select')   return;
    if (typeof SFX !== 'undefined') SFX.endTurn();
    onEndTurn();
  });

  resetTurnBtn.addEventListener('click', function () {
    if (G.phase !== 'select') return;
    resetTurn();
  });

  function onEndTurn() {
    _stopSelectionTimer();
    if (typeof Analytics !== 'undefined') Analytics.turnEnded(G.turn);
    endTurnBtn.disabled   = true;
    resetTurnBtn.disabled = true;

    /* ── Proceed directly (undo window removed for single-player) ── */
    _proceedEndTurn();
  }

  function _cancelUndoEndTurn() {
    if (_undoEndTurnTimer) { clearInterval(_undoEndTurnTimer); _undoEndTurnTimer = null; }
    var undoBtn = document.getElementById('battle-undo-endturn');
    if (undoBtn) { undoBtn.style.display = 'none'; undoBtn.onclick = null; }
  }

  function _proceedEndTurn() {
    /* ── 2P mode: blind-submit then wait for opponent ─────────── */
    if (window.matchId && typeof Match !== 'undefined') {
      _showMatchWaitOverlay(true);
      Match.submitTurn(G.turn, G.playerActionLog.slice(), function (oppActions) {
        _showMatchWaitOverlay(false);
        applyOpponentActions(oppActions);
        setTimeout(startReveal, 600);
      });
      return;
    }

    /* ── Normal AI path ──────────────────────────────────────── */
    // Adventure battles (cfg.ai.movement 'adventure') relocate their move-capable
    // AI cards (Chariot, id 48) POST-reveal via runAdventureMovements — once per
    // BATTLE (_advChariotMoved) with the smart _bestChariotDest destination —
    // rather than the Arcadium end-turn runAiMovements path (which records a
    // once-per-TURN move into the reveal sequence). Skip runAiMovements there so
    // the Chariot isn't moved twice. Inert for Arcadium/Prehistory/Ötzi (none
    // sets ai.movement 'adventure'); aiActionLog is reset by nextTurn, not here.
    if (!(G.config && G.config.ai && G.config.ai.movement === 'adventure')) {
      SOG.ai.runAiMovements();
    }
    SOG.ai.runAiSelection();
    SOG.ui.updateOppHand();
    setTimeout(startReveal, 600);
  }


  /* ═══════════════════════════════════════════════════════════════
     MOVEMENT SYSTEM  (Magellan / Columbus)
  ═══════════════════════════════════════════════════════════════ */

  /* refreshMoveableCards moved to game/input.js (Pass 3c). Aliased above. */

  function executeMove(owner, fromLocId, fromSlotIndex, toLocId) {
    /* NO_MOVE_HERE (The Cataracts): the LAST line of defence. Every real
       relocation — player, AI, ability-driven, either side — passes through this
       function or executeMoveAnimated below, so blocking here catches paths the
       UI gate and the AI choosers cannot see. */
    if (isMoveBlockedInto(toLocId)) return;
    var slots   = owner === 'player' ? G.playerSlots : G.aiSlots;
    var sd      = slots[fromLocId][fromSlotIndex];
    if (!sd) return;
    var cardId  = sd.cardId;
    var toIndex = slots[toLocId].indexOf(null);
    if (toIndex === -1) return;

    slots[fromLocId][fromSlotIndex] = null;
    clearSlotDOM(owner, fromLocId, fromSlotIndex);
    if (owner === 'player') { compactPlayerSlots(fromLocId); syncPlayerSlots(fromLocId); }
    else                    { compactOppSlots(fromLocId);    syncOppSlots(fromLocId);    }

    // Track ipMod added by this move so resetTurn can reverse it
    var ipModAdded = 0;
    var ipModSourcesAdded = [];

    // Apply MOVE_IN_GAINS_IP at destination
    var dl = G.locations.find(function (l) { return l.id === toLocId; });
    if (dl && dl.abilityKey === 'MOVE_IN_GAINS_IP') {
      addIPMod(sd, 1, 'The Cape of Good Hope');
      ipModAdded += 1;
      ipModSourcesAdded.push({ source: 'The Cape of Good Hope', delta: 1 });
    }

    toIndex = slots[toLocId].indexOf(null);
    if (toIndex === -1) return;
    slots[toLocId][toIndex] = sd;

    var card   = CARDS.find(function (c) { return c.id === cardId; });
    var toSlotEl = getSlotEl(owner, toLocId, toIndex);
    if (toSlotEl && card) {
      toSlotEl.dataset.cardId = cardId;
      toSlotEl.className      = 'battle-card-slot occupied face-up';
      toSlotEl.removeAttribute('draggable');
      buildCardFace(toSlotEl, faceCard(sd, card), effectiveIP(sd));
    }

    // Magellan: +1 IP per move
    if (cardId === 24) {
      addIPMod(sd, 1, 'Magellan');
      ipModAdded += 1;
      ipModSourcesAdded.push({ source: 'Magellan', delta: 1 });
      if (owner === 'player') G.movedThisTurn[24]   = true;
      else                    G.aiMovedThisTurn[24]  = true;
      refreshSlotIPDisplays();
    }

    // Log player moves so resetTurn can undo them
    if (owner === 'player') {
      G.moveLog.push({
        cardId:            cardId,
        fromLocId:         fromLocId,
        toLocId:           toLocId,
        toSlotIdx:         toIndex,
        ipModAdded:        ipModAdded,
        ipModSourcesAdded: ipModSourcesAdded,
        isColumbus:        cardId === 25
      });
    }

    // Location-ability moves (Scandinavia / Timbuktu): track so each card moves at most once per turn
    if (owner === 'player' && cardId !== 24 && cardId !== 25) {
      G.movedThisTurn[cardId] = true;
    }

    // Columbus: one-time move; -1 IP to opponent's Cultural and Political cards at destination
    if (cardId === 25) {
      var flag = owner === 'player' ? 'columbusMoved' : 'aiColumbusMoved';
      if (!G[flag]) {
        G[flag] = true;
        var oppSlots = owner === 'player' ? G.aiSlots : G.playerSlots;
        oppSlots[toLocId].forEach(function (s) {
          if (!s || !s.revealed) return;
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && (c.type === 'Cultural' || c.type === 'Political')) addIPMod(s, -1, 'Christopher Columbus');
        });
        refreshSlotIPDisplays();
        updateScores();
      }
    }

    refreshMoveableCards();
    updateScores();
  }

  /* queueMove moved to game/input.js (Pass 3c). */

  /**
   * Universal movement handler — called during the reveal phase for ALL card moves:
   * player-queued moves (Magellan, Columbus, Scandinavia, Timbuktu, Cape), Empress Wu
   * pushes, and any future movement mechanic.
   *
   * By the time this is called, snapBack() has already returned every queued card
   * to its true origin slot, so the card is at fromLocId ready to slide.
   *
   * opts (optional):
   *   sfxOnStart  — fn() called before the slide animation starts
   *   onLand      — fn(sd, done) called after the slot data is committed; skips
   *                 default Columbus/Magellan on-land behaviour when provided
   */
  function executeMoveAnimated(owner, cardId, fromLocId, toLocId, opts, done) {
    // Support legacy two-arg call: executeMoveAnimated(..., done)
    if (typeof opts === 'function') { done = opts; opts = {}; }
    opts = opts || {};
    done = done || function () {};
    // NO_MOVE_HERE — same last line of defence as executeMove. done() still fires
    // so a caller waiting on the move (the reveal pipeline) is never stranded.
    if (isMoveBlockedInto(toLocId)) { done(); return; }

    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var card  = CARDS.find(function (c) { return c.id === cardId; });

    // Resolve the moving card's SOURCE slot — duplicate-cardId safe (twins can
    // DIVERGE: one Chariots may have spent _advChariotMoved, one Megalith twin
    // may carry accumulated ipMod — the EXACT queued card must move):
    //   1) opts.sd — the exact slot-data object (direct callers: adventure
    //      Chariot, Empress Wu push, Ötzi flee). Object identity survives
    //      snapbacks/compaction (same references move between slots).
    //   2) opts.fromSlotIndex — recorded at queue time in the action log,
    //      validated (the slot must still hold an sd with this cardId; an
    //      earlier move out of the same location can compact/shift indexes).
    //   3) Fallback: first cardId match at fromLocId (2P serialised entries
    //      carry no coordinates) — noted in debug when coordinates went stale.
    var snapIdx = -1;
    if (opts.sd) snapIdx = slots[fromLocId].indexOf(opts.sd);
    if (snapIdx === -1 && opts.fromSlotIndex != null) {
      var _qSd = slots[fromLocId][opts.fromSlotIndex];
      if (_qSd && _qSd.cardId === cardId) snapIdx = opts.fromSlotIndex;
    }
    if (snapIdx === -1) {
      for (var fi = 0; fi < slots[fromLocId].length; fi++) {
        if (slots[fromLocId][fi] && slots[fromLocId][fi].cardId === cardId) { snapIdx = fi; break; }
      }
      if (snapIdx !== -1 && (opts.sd || opts.fromSlotIndex != null) && window.SOG_DEBUG) {
        console.warn('[move] source slot resolved by cardId FALLBACK (queued coordinates stale): card ' + cardId + ' at loc ' + fromLocId);
      }
    }
    if (snapIdx === -1) { done(); return; }

    var sd         = slots[fromLocId][snapIdx];
    var fromSlotEl = getSlotEl(owner, fromLocId, snapIdx);
    // Clear any queued-dest styling still on the slot (e.g. non-snapped-back cases)
    if (fromSlotEl) fromSlotEl.classList.remove('queued-dest');

    // ── Slide fromLocId → toLocId ─────────────────────────────────
    var toIndex  = slots[toLocId].indexOf(null);
    if (toIndex === -1) { done(); return; }
    var toSlotEl = getSlotEl(owner, toLocId, toIndex);

    // SFX at start of slide
    // _advSteps holds Lucy's looping footstep audio so the GSAP onComplete (and
    // the no-gsap fallback) can stop it the instant she arrives.
    var _advSteps = null;
    if (opts.sfxOnStart) {
      opts.sfxOnStart();
    } else if (cardId === 33) {
      // Lucy (First Steps): slow wobbling walk — loop footsteps for the move's duration.
      try { _advSteps = new Audio('sfx/adventuresteps.m4a'); _advSteps.loop = true; _advSteps.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1; _advSteps.play(); } catch (e) {}
    } else if (cardId === 35) {
      // Ötzi (flee): quick "yoink" as he darts away (movement itself unchanged).
      SOG.sfx.play('sfx/yoink.mp3');
    } else if (cardId === 24 && typeof SFX !== 'undefined') {
      SFX.sailingSound();
    } else if (cardId === 48 || cardId === 69) {
      // Chariot (48) / Chariots (69, Egypt): play chariot.mp3 as it rolls to the new location.
      SOG.sfx.play('sfx/chariot.mp3');
    }

    // Apply IP mods (Cape of Good Hope, Magellan +1)
    // Columbus -1 is applied in applyMove() after the slide completes
    var ipModAdded = 0;
    var ipModSourcesAdded = [];
    var dl = G.locations.find(function (l) { return l.id === toLocId; });
    if (dl && dl.abilityKey === 'MOVE_IN_GAINS_IP') {
      addIPMod(sd, 1, 'The Cape of Good Hope');
      ipModAdded += 1;
      ipModSourcesAdded.push({ source: 'The Cape of Good Hope', delta: 1 });
    }
    if (cardId === 24) {
      addIPMod(sd, 1, 'Magellan');
      ipModAdded += 1;
      ipModSourcesAdded.push({ source: 'Magellan', delta: 1 });
    }

    // Mark moveLog entry as executed — prefer the entry queued for THIS exact
    // source slot (fromLocId + fromSlotIndex) so twin queued moves of the same
    // cardId can't cross-mark each other's entries; fall back to the first
    // queued cardId match (entries without a recorded index).
    var _mlIdx = -1;
    for (var li = 0; li < G.moveLog.length; li++) {
      var _ml = G.moveLog[li];
      if (_ml.cardId !== cardId || !_ml.queued) continue;
      if (_ml.fromLocId === fromLocId && _ml.fromSlotIndex === snapIdx) { _mlIdx = li; break; }
      if (_mlIdx === -1) _mlIdx = li;
    }
    if (_mlIdx !== -1) {
      G.moveLog[_mlIdx].queued            = false;
      G.moveLog[_mlIdx].ipModAdded        = ipModAdded;
      G.moveLog[_mlIdx].ipModSourcesAdded = ipModSourcesAdded;
      G.moveLog[_mlIdx].toSlotIdx         = toIndex;
    }

    function applyMove() {
      slots[fromLocId][snapIdx] = null;
      clearSlotDOM(owner, fromLocId, snapIdx);
      if (owner === 'player') { compactPlayerSlots(fromLocId); syncPlayerSlots(fromLocId); }
      else                    { compactOppSlots(fromLocId);    syncOppSlots(fromLocId);    }

      var finalIdx = slots[toLocId].indexOf(null);
      if (finalIdx === -1) { done(); return; }
      slots[toLocId][finalIdx] = sd;

      /* A card may move only ONCE per turn. Stamped HERE because applyMove is the
         single commit point every move passes through (queued player moves, the
         Merchant's trade relocation, Chariot, Lucy, Magellan, Columbus, Ötzi's
         flee, and the AI's own post-reveal movers). The stamp travels with the sd,
         so it survives the card changing slots.
         This exists because a card RELOCATED DURING THE REVEAL by another card's
         ability was still eligible for the AI's post-reveal movement pass — e.g. an
         Egypt Merchant traded from Thebes to the Red Sea mid-reveal, then picked up
         again by the Red Sea free-move at end of turn. That second move is illegal:
         the AI commits its movement choices in the SELECTION phase, before the
         reveal, so it could not have chosen a card that was not there yet.
         Read by ai.js _aiSlotMovableNow, the shared gate for the post-reveal movers. */
      sd._movedOnTurn = G.turn;

      var finalSlotEl = getSlotEl(owner, toLocId, finalIdx);
      if (finalSlotEl && card) {
        finalSlotEl.dataset.cardId = cardId;
        finalSlotEl.className      = 'battle-card-slot occupied face-up';
        finalSlotEl.removeAttribute('draggable');
        buildCardFace(finalSlotEl, faceCard(sd, card), effectiveIP(sd));
      }

      if (cardId === 24) {
        SOG.ui.showIPFloat(owner, cardId, 1);
        refreshSlotIPDisplays();
      }

      // Destination "when a card moves here" bonus (Punt: +1 IP to the arriving
      // card; Thebes: +1 capital next turn). Fired HERE — the single commit point
      // every move passes through — so it applies uniformly to Chariot, Lucy,
      // Magellan, Columbus, Ötzi's flee and the Merchant's trade move, instead of
      // each mover remembering to call it. Inert at locations without the key.
      if (SOG.abilities && typeof SOG.abilities.fireMoveHereBonus === 'function') {
        SOG.abilities.fireMoveHereBonus(owner, toLocId, sd);
      }

      refreshMoveableCards();
      updateScores();

      // Custom on-land callback (e.g. Empress Wu routes through here)
      if (opts.onLand) { opts.onLand(sd, done); return; }

      // Chariot (id 48): on arrival, strike the highest-IP opponent card at the destination
      if (cardId === 48 && SOG.abilities && typeof SOG.abilities.chariotArrival === 'function') {
        SOG.abilities.chariotArrival(owner, toLocId, sd, done);
        return;
      }
      // Chariots (id 69, Egypt): arrival strike for -2 IP (Sphinx protection applies)
      if (cardId === 69 && SOG.abilities && typeof SOG.abilities.chariotArrival === 'function') {
        SOG.abilities.chariotArrival(owner, toLocId, sd, done, -2);
        return;
      }

      // Columbus: apply -1 IP, play bell, shake affected cards, then proceed
      if (cardId === 25) {
        var oppOwner = owner === 'player' ? 'opp' : 'player';
        var oppSlots = owner === 'player' ? G.aiSlots : G.playerSlots;
        var affectedSlotEls = [];

        oppSlots[toLocId].forEach(function (s, si) {
          if (!s || !s.revealed) return;
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && (c.type === 'Cultural' || c.type === 'Political')) {
            addIPMod(s, -1, 'Christopher Columbus');
            var affSlotEl = getSlotEl(oppOwner, toLocId, si);
            if (affSlotEl) affectedSlotEls.push(affSlotEl);
          }
        });

        if (affectedSlotEls.length > 0) {
          if (typeof SFX !== 'undefined') SFX.columbusSound();
          var remaining = affectedSlotEls.length;
          affectedSlotEls.forEach(function (affSlotEl) {
            if (typeof Anim !== 'undefined') {
              Anim.columbusShake(affSlotEl, function () {
                Anim.floatNumber(affSlotEl, -1);
                remaining--;
                if (remaining === 0) {
                  refreshSlotIPDisplays();
                  updateScores();
                  done();
                }
              });
            } else {
              remaining--;
              if (remaining === 0) {
                refreshSlotIPDisplays();
                updateScores();
                done();
              }
            }
          });
        } else {
          setTimeout(done, 200);
        }
        return;
      }

      setTimeout(done, 200);
    }

    // GSAP slide animation
    if (typeof gsap !== 'undefined' && fromSlotEl && toSlotEl) {
      var fromRect = fromSlotEl.getBoundingClientRect();
      var toRect   = toSlotEl.getBoundingClientRect();

      var clone = fromSlotEl.cloneNode(true);
      clone.style.cssText = [
        'position:fixed',
        'left:'   + fromRect.left   + 'px',
        'top:'    + fromRect.top    + 'px',
        'width:'  + fromRect.width  + 'px',
        'height:' + fromRect.height + 'px',
        'z-index:9000',
        'pointer-events:none',
        'margin:0',
        'transition:none'
      ].join(';');
      document.body.appendChild(clone);
      fromSlotEl.style.opacity = '0';

      // Per-card travel feel. Default cards keep the straight 0.55s slide.
      // Lucy (33) walks slowly (~1.5s) with a gentle side-to-side "teeter-totter"
      // wobble pivoting at her feet — reads as a deliberate waddle. The position
      // tween animates left/top; the wobble animates rotation (transform), so the
      // two run concurrently without conflict.
      // Chariots (69, Egypt) travel at the SAME pace as Chariot (48) — the two share
      // their whole presentation (chariot.mp3 on the roll, the arrival arrow via
      // chariotArrival/chariotArrow); this duration was the last thing that differed,
      // leaving the Egypt one visibly hurried at the default 0.55s.
      var slideDuration = (cardId === 33) ? 1.5 : (cardId === 48 || cardId === 69) ? 1.0 : (cardId === 35) ? 0.633 : 0.55;   // Chariots ~1s; Ötzi flee 15% slower than the 0.55s default
      var wobbleTween   = null;
      if (cardId === 33) {
        gsap.set(clone, { transformOrigin: '50% 100%', rotation: -5 });
        wobbleTween = gsap.to(clone, {
          rotation: 5, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: 4
        });
      }

      gsap.to(clone, {
        left:     toRect.left,
        top:      toRect.top,
        duration: slideDuration,
        ease:     'power2.inOut',
        onComplete: function () {
          if (wobbleTween) wobbleTween.kill();
          if (_advSteps) { try { _advSteps.pause(); _advSteps.currentTime = 0; } catch (e) {} }
          document.body.removeChild(clone);
          fromSlotEl.style.opacity = '';
          applyMove();
        }
      });
    } else {
      // No-gsap fallback: still stop Lucy's footstep loop if it started.
      if (_advSteps) { try { _advSteps.pause(); } catch (e) {} }
      applyMove();
    }
  }

  /* Trader (68) barter: at the Trader's beat in the reveal, swap the Trader and
     its chosen partner between their slots FOR REAL (both cards belong to the
     same owner). Preview was display-only; this is the authoritative exchange.
     FIZZLES safely if either card is gone (destroyed earlier this reveal), with
     no half-swap. Once-per-battle flag `_advTraderBartered` is set here (on real
     resolution) so re-choosing during selection stays free. Animates a two-card
     cross-slide both sides see, then re-tallies. */
  function executeBarter(owner, traderCardId, partnerCardId, done, coords) {
    done = done || function () {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;

    function locate(cardId) {
      for (var li = 0; li < G.locations.length; li++) {
        var lid = G.locations[li].id, arr = slots[lid] || [];
        for (var si = 0; si < arr.length; si++) {
          if (arr[si] && arr[si].cardId === cardId) return { locId: lid, idx: si, sd: arr[si] };
        }
      }
      return null;
    }
    // Coordinate resolution (duplicate-cardId safe): coords — recorded at queue
    // time — pin the exact trader/partner slots. Validated (the slot must still
    // hold an sd with the expected cardId); a stale coordinate falls back to the
    // first-match locate() scan (pre-coordinate behaviour).
    function locateAt(locId, idx, cardId) {
      if (locId == null || idx == null) return null;
      var arr = slots[locId];
      var s = arr && arr[idx];
      return (s && s.cardId === cardId) ? { locId: locId, idx: idx, sd: s } : null;
    }

    var t = null, p = null;
    if (coords) {
      t = locateAt(coords.traderLocId,  coords.traderIdx,  traderCardId);
      p = locateAt(coords.partnerLocId, coords.partnerIdx, partnerCardId);
    }
    if (!t) t = locate(traderCardId);
    if (!p) p = locate(partnerCardId);
    // Fizzle safely: a partner (or the Trader) destroyed before this beat.
    if (!t || !p || (t.locId === p.locId && t.idx === p.idx)) {
      G.traderBarter = null;
      done();
      return;
    }

    var tCard = CARDS.find(function (c) { return c.id === traderCardId; });
    var pCard = CARDS.find(function (c) { return c.id === partnerCardId; });
    var syncLoc = (owner === 'player')
      ? function (l) { syncPlayerSlots(l); }
      : function (l) { syncOppSlots(l); };

    // Capture on-screen rects of both cards BEFORE the swap, for the cross-slide.
    var tEl = getSlotEl(owner, t.locId, t.idx);
    var pEl = getSlotEl(owner, p.locId, p.idx);
    var tRect = tEl ? tEl.getBoundingClientRect() : null;
    var pRect = pEl ? pEl.getBoundingClientRect() : null;

    function commit() {
      // Real exchange: swap the two sd objects between their slots.
      slots[t.locId][t.idx] = p.sd;
      slots[p.locId][p.idx] = t.sd;
      // A barter relocates BOTH cards, so both spend their move for the turn. This
      // commit path swaps slots directly rather than going through applyMove, so
      // the once-per-turn stamp has to be applied here too.
      t.sd._movedOnTurn = G.turn;
      p.sd._movedOnTurn = G.turn;
      t.sd._advTraderBartered = true;   // once per battle — set on real resolution
      G.traderBarter = null;
      syncLoc(t.locId);
      if (p.locId !== t.locId) syncLoc(p.locId);
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
      done();
    }

    SOG.sfx.play('sfx/chariot.mp3');

    if (typeof gsap !== 'undefined' && tEl && pEl && tRect && pRect) {
      var cloneT = tEl.cloneNode(true);
      var cloneP = pEl.cloneNode(true);
      function styleClone(clone, rect) {
        clone.style.cssText = [
          'position:fixed', 'left:' + rect.left + 'px', 'top:' + rect.top + 'px',
          'width:' + rect.width + 'px', 'height:' + rect.height + 'px',
          'z-index:9000', 'pointer-events:none', 'margin:0', 'transition:none'
        ].join(';');
        document.body.appendChild(clone);
      }
      styleClone(cloneT, tRect);
      styleClone(cloneP, pRect);
      tEl.style.opacity = '0';
      pEl.style.opacity = '0';
      var remaining = 2;
      var onOne = function () {
        remaining--;
        if (remaining > 0) return;
        document.body.removeChild(cloneT);
        document.body.removeChild(cloneP);
        tEl.style.opacity = '';
        pEl.style.opacity = '';
        commit();
      };
      gsap.to(cloneT, { left: pRect.left, top: pRect.top, duration: 0.6, ease: 'power2.inOut', onComplete: onOne });
      gsap.to(cloneP, { left: tRect.left, top: tRect.top, duration: 0.6, ease: 'power2.inOut', onComplete: onOne });
    } else {
      commit();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     REVEAL PHASE
  ═══════════════════════════════════════════════════════════════ */

  function startReveal() {
    G.phase = 'reveal';
    /* onBeforeReveal (script hook): before the flip animation. Sync,
       fire-and-forget. No script → no-op. */
    SOG.BattleHooks.fire('onBeforeReveal', [G.turn]);
    clearSelection();      // tear down any click/keyboard selection state
    hideRevealFirstHighlight();  // glow shown during selection — clear it now
    snapBack();            // Restore all queued cards to true origin slots
    // Trader barter: tear down the display-only swap PREVIEW (real swap still
    // queued in the action log, executes at the Trader's beat). Phase is now
    // 'reveal', so _applyTraderPreview no-ops and these re-syncs show TRUE faces.
    if (G.traderBarter) {
      syncPlayerSlots(G.traderBarter.traderLocId);
      syncPlayerSlots(G.traderBarter.partnerLocId);
    }
    refreshMoveableCards();
    updateHeader();

    // Flip all face-up unplayed player cards face-down before reveal begins
    var unplayedEls = Array.prototype.slice.call(
      boardEl.querySelectorAll('.battle-card-slot.unplayed[data-owner="player"]')
    );
    var afterFlip = function () {
      setTimeout(function () { revealNext(buildRevealSequence(), 0); }, 700);
    };

    if (unplayedEls.length && typeof gsap !== 'undefined') {
      gsap.to(unplayedEls, {
        scaleX: 0, duration: 0.15, ease: 'power2.in',
        onComplete: function () {
          unplayedEls.forEach(function (el) {
            el.classList.remove('face-up', 'unplayed');
            el.classList.add('face-down');
            el.innerHTML = '';
          });
          gsap.to(unplayedEls, { scaleX: 1, duration: 0.12, ease: 'power2.out',
            onComplete: afterFlip
          });
        }
      });
    } else {
      unplayedEls.forEach(function (el) {
        el.classList.remove('face-up', 'unplayed');
        el.classList.add('face-down');
        el.innerHTML = '';
      });
      afterFlip();
    }
  }

  /* showRevealFirstHighlight / hideRevealFirstHighlight moved to
     game/abilities.js (Pass 4). Aliased above. */


  function buildRevealSequence() {
    // Player side uses playerActionLog (ordered plays + queued moves)
    var pQ = G.playerActionLog.slice();
    // AI side uses aiActionLog (ordered plays + queued moves, populated by
    // runAiSelection and runAiMovements). Already in {type, cardId, ...} shape
    // — symmetric with playerActionLog so revealNext's 'move'/'play' branches
    // handle both sides uniformly. Bug 16.
    var aQ = G.aiActionLog.slice();
    var fQ = G.playerFirst ? pQ : aQ;
    var sQ = G.playerFirst ? aQ : pQ;
    var fO = G.playerFirst ? 'player' : 'opp';
    var sO = G.playerFirst ? 'opp'    : 'player';
    var seq = [];
    var len = Math.max(fQ.length, sQ.length);
    // 'play' entries carry the commit-time slot COORDINATES (locId + slotIndex —
    // the player log stores the loc as toLocId, the AI log as locId) so revealNext
    // can resolve the exact slot even with DUPLICATE cardIds on board (Papyrus
    // copies, Nubian Gold tokens). Entries without them (2P serialised actions)
    // fall back to the cardId scan.
    for (var i = 0; i < len; i++) {
      if (i < fQ.length) {
        var fi = fQ[i];
        seq.push({ type: fi.type, owner: fO, cardId: fi.cardId,
                   locId: (fi.locId != null ? fi.locId : (fi.type === 'play' ? fi.toLocId : undefined)),
                   slotIndex: fi.slotIndex, fromSlotIndex: fi.fromSlotIndex,
                   fromLocId: fi.fromLocId, toLocId: fi.toLocId,
                   partnerCardId: fi.partnerCardId, barterCoords: fi.barterCoords });
      }
      if (i < sQ.length) {
        var si2 = sQ[i];
        seq.push({ type: si2.type, owner: sO, cardId: si2.cardId,
                   locId: (si2.locId != null ? si2.locId : (si2.type === 'play' ? si2.toLocId : undefined)),
                   slotIndex: si2.slotIndex, fromSlotIndex: si2.fromSlotIndex,
                   fromLocId: si2.fromLocId, toLocId: si2.toLocId,
                   partnerCardId: si2.partnerCardId, barterCoords: si2.barterCoords });
      }
    }
    return seq;
  }

  /* findSlotEl and getCardLocId moved to game/board.js (Pass 3b). Aliased above. */

  function revealNext(seq, i) {
    if (i >= seq.length) {
      evaluateContinuous();
      refreshSlotIPDisplays();
      refreshHandIPDisplays();
      refreshHandCostDisplays();
      updateScores();
      /* Cards PLAYED THIS TURN, both sides — built ONCE and reused by the At-Once
         river stamp and the onAfterReveal hook below. PRIMARY: the commit-time
         (locId, slotIndex) carried on the seq entry — exact even with DUPLICATE
         cardIds on a side (Papyrus copies; cardId is NOT unique per side anymore).
         FALLBACK (2P entries without coordinates): search the owner's slots for
         the cardId — a card played this turn hasn't relocated yet at reveal-end,
         so its current slot IS its play location. */
      var revealed = [];
      seq.forEach(function (it) {
        if (it.type !== 'play') return;
        var oSlots  = (it.owner === 'player') ? G.playerSlots : G.aiSlots;
        var foundLoc = null, foundIdx = -1;
        if (it.locId != null && it.slotIndex != null && oSlots[it.locId]) {
          var cs = oSlots[it.locId][it.slotIndex];
          if (cs && cs.cardId === it.cardId) { foundLoc = it.locId; foundIdx = it.slotIndex; }
        }
        for (var li = 0; li < G.locations.length && foundLoc === null; li++) {
          var arr = oSlots[G.locations[li].id];
          if (!arr) continue;
          for (var si = 0; si < arr.length; si++) {
            if (arr[si] && arr[si].cardId === it.cardId) { foundLoc = G.locations[li].id; foundIdx = si; break; }
          }
        }
        revealed.push({ owner: it.owner, cardId: it.cardId, locId: foundLoc, slotIndex: foundIdx });
      });
      /* AT-ONCE river type-boosts (LABOR_PLUS_2_HERE / MILITARY_PLUS_1_HERE): stamp
         the bonus PERMANENTLY on each matching card that REVEALED at a river this turn
         — once, here, after all flips. Re-tally so the score reflects the stamp. The
         per-turn `revealed` gate means a card relocated onto a river later is never
         stamped. Inert in battles with no river-keyed location. */
      if (SOG.abilities && typeof SOG.abilities.applyRiverAtOnce === 'function') {
        if (SOG.abilities.applyRiverAtOnce(revealed) > 0) {   // re-tally only if something stamped
          evaluateContinuous();
          refreshSlotIPDisplays();
          updateScores();
        }
      }
      // NUBIAN_GOLD_ON_PLAY location key: grant a Nubian Gold token to each side
      // that played a card at a keyed location (unless their hand is full). Reveal-
      // end, once per turn (mirrors applyRiverAtOnce). Inert without the key.
      if (SOG.abilities && typeof SOG.abilities.applyNubianGoldOnPlay === 'function') {
        SOG.abilities.applyNubianGoldOnPlay(revealed);
      }
      /* Once-per-turn location abilities (e.g. CAPITAL_WHEN_FULL). Evaluated HERE
         — exactly once, after all flips/At-Once/continuous have resolved — NOT in
         evaluateContinuous (which re-runs many times per turn and would over-grant).
         Grants next-turn capital to each side whose slots at such a location are
         full. Inert in battles with no location carrying the key. */
      if (SOG.abilities && typeof SOG.abilities.applyCapitalWhenFull === 'function') {
        SOG.abilities.applyCapitalWhenFull();
      }
      /* onAfterReveal (script hook): all flips + At-Once + continuous mods are
         done. `revealed` lists the cards newly played this turn (both sides) so
         a script (e.g. Ötzi flee) can act per-card. Sync, fire-and-forget.
         No script → no-op. */
      if (SOG.BattleHooks.has('onAfterReveal')) {
        SOG.BattleHooks.fire('onAfterReveal', [{ turn: G.turn, revealed: revealed }]);
      }
      var _proceedAfterReveal = function () {
        /* END-OF-TURN ability phase: after ALL reveals (and, on the adventure
           path, the Chariot movement) but BEFORE the turn advances — so a
           gain landed here counts in this turn's totals and in endGame's
           tally. Discrete once-per-turn phase (see fireEndOfTurn); fires each
           end-of-turn card sequentially in global reveal order and the turn
           WAITS for the whole phase. No end-of-turn cards on board → no-op. */
        var _advance = function () {
          setTimeout(function () { G.turn >= G.config.structure.turns ? endGame() : nextTurn(); }, POST_REVEAL);
        };
        if (SOG.abilities && typeof SOG.abilities.fireEndOfTurn === 'function') {
          SOG.abilities.fireEndOfTurn(_advance);
        } else {
          _advance();
        }
      };
      /* Adventure-battle AI movement (cfg.ai.movement 'adventure'): relocate a
         move-capable AI card (Chariot, id 48) now that every card is revealed —
         once per BATTLE (_advChariotMoved), smart _bestChariotDest destination,
         executed directly via executeMoveAnimated (fires the arrival strike).
         Mirrors the bespoke cloned-reveal ordering (flee per-card during reveal,
         then Chariot move, then turn advance). Re-tally after the strike, then
         proceed. Config-gated; inert for Arcadium/Prehistory/Ötzi (none sets
         ai.movement 'adventure', and none has a move-capable AI card here). */
      var _afterAiMove = function () {
        evaluateContinuous();
        updateScores();
        _proceedAfterReveal();
      };
      if (G.config && G.config.ai && G.config.ai.movement === 'adventure'
          && G.config.ai.tier !== 'serf'   // Serf leaves movers in place; Giant repositions them
          && SOG.ai && typeof SOG.ai.runAdventureMovements === 'function') {
        /* Giant movement is TWO passes: the card-driven one (Chariot/Trader,
           which knows nothing about locations) and then the LOCATION-driven
           free-move-away, which is the only thing that uses Red Sea. Chained
           rather than merged because they answer different questions — "does
           this mover want to reposition" vs "does this board hand me a free
           move" — and a board can offer both. */
        SOG.ai.runAdventureMovements(function () {
          if (typeof SOG.ai.runGiantFreeMoveAway === 'function'
              && G.locations.some(function (l) { return l.abilityKey === 'ANY_FREE_MOVE_AWAY'; })) {
            SOG.ai.runGiantFreeMoveAway(_afterAiMove);
          } else {
            _afterAiMove();
          }
        });
      /* Serf still gets ONE relocation, but only the free one a location hands
         out: an ANY_FREE_MOVE_AWAY board (Red Sea) lets a card leave each turn,
         and the Serf used to ignore it entirely. Random card, random open
         destination — see runSerfFreeMoveAway. Inert on every other battle,
         since no other location carries that ability key. */
      } else if (G.config && G.config.ai && G.config.ai.tier === 'serf'
          && SOG.ai && typeof SOG.ai.runSerfFreeMoveAway === 'function'
          && G.locations.some(function (l) { return l.abilityKey === 'ANY_FREE_MOVE_AWAY'; })) {
        SOG.ai.runSerfFreeMoveAway(_afterAiMove);
      } else {
        _proceedAfterReveal();
      }
      return;
    }
    var item = seq[i];

    var proceed = function () {
      // After a queued player move, pop the next deferred new-play for that
      // location into the now-available slot (one per move that leaves).
      if (item.type === 'move' && item.owner === 'player') {
        var deferred = G.deferredPlays[item.fromLocId];
        if (deferred && deferred.length > 0) {
          var sd = deferred.shift();
          if (deferred.length === 0) delete G.deferredPlays[item.fromLocId];
          var fsi = G.playerSlots[item.fromLocId].indexOf(null);
          if (fsi !== -1) {
            G.playerSlots[item.fromLocId][fsi] = sd;
            syncPlayerSlots(item.fromLocId);
          }
        }
      }
      evaluateContinuous();
      refreshSlotIPDisplays();
      refreshHandIPDisplays();
      refreshHandCostDisplays();
      updateScores();
      setTimeout(function () { revealNext(seq, i + 1); }, REVEAL_DELAY);
    };

    if (item.type === 'move') {
      // fromSlotIndex (recorded at queue time) pins the exact source slot —
      // duplicate-cardId safe; executeMoveAnimated validates + falls back.
      executeMoveAnimated(item.owner, item.cardId, item.fromLocId, item.toLocId,
                          { fromSlotIndex: item.fromSlotIndex }, proceed);
      return;
    }

    if (item.type === 'barter') {
      // barterCoords (recorded at queue time) pin both swap slots — duplicate-
      // cardId safe; executeBarter validates + falls back to the cardId scan.
      executeBarter(item.owner, item.cardId, item.partnerCardId, proceed, item.barterCoords);
      return;
    }

    // type === 'play'
    // Resolve the play's SLOT — duplicate-cardId safe (Papyrus copies a card to
    // hand, so a side CAN hold two copies of one id; Nubian Gold tokens likewise).
    //   PRIMARY: the (locId, slotIndex) recorded at commit time, validated (the
    //   slot must still hold an UNREVEALED sd with this cardId — a queued-move
    //   snapback can shift player slot indexes).
    //   FALLBACK (2P serialised entries carry no coordinates; shifted indexes):
    //   scan for the cardId PREFERRING an unrevealed slot. The reveal target is
    //   by definition unrevealed, so an already-revealed twin is never matched —
    //   the old first-match scan resolved the copy to the original's face-up slot
    //   and left the copy face-down forever (0 IP, still occupying a slot).
    var rSlots = item.owner === 'player' ? G.playerSlots : G.aiSlots;
    var rLocId = null, rSi = -1;
    if (item.locId != null && item.slotIndex != null && rSlots[item.locId]) {
      var cSd = rSlots[item.locId][item.slotIndex];
      if (cSd && cSd.cardId === item.cardId && !cSd.revealed) {
        rLocId = item.locId; rSi = item.slotIndex;
      }
    }
    if (rLocId === null) {
      var fbLoc = null, fbIdx = -1;                    // first match of ANY state
      for (var rli = 0; rli < G.locations.length && rLocId === null; rli++) {
        var rlid = G.locations[rli].id, rarr = rSlots[rlid];
        if (!rarr) continue;
        for (var rsi2 = 0; rsi2 < rarr.length; rsi2++) {
          var rs2 = rarr[rsi2];
          if (!rs2 || rs2.cardId !== item.cardId) continue;
          if (!rs2.revealed) { rLocId = rlid; rSi = rsi2; break; }   // prefer unrevealed
          if (fbLoc === null) { fbLoc = rlid; fbIdx = rsi2; }
        }
      }
      if (rLocId === null && fbLoc !== null) { rLocId = fbLoc; rSi = fbIdx; }
    }
    var rSd    = rLocId !== null ? rSlots[rLocId][rSi] : null;
    var slotEl = rLocId !== null ? getSlotEl(item.owner, rLocId, rSi) : null;
    // Gate on data state (sd.revealed), not on DOM class. The slot's classList
    // is derived from the slot data; checking sd.revealed reads the canonical
    // source of truth and correctly skips slots whose reveal has already fired
    // earlier in the sequence.
    if (slotEl && rSd && !rSd.revealed) {
      if (!slotEl.classList.contains('face-down')) {
        slotEl.classList.remove('face-up', 'unplayed');
        slotEl.classList.add('face-down');
        slotEl.innerHTML = '';
      }
      // Wait for reveal animation + per-card SFX to finish, then fire ability.
      // After the card's own At Once resolves, run the play-from-hand hooks
      // (in order): play-order metadata, Cultural counter.
      flipSlot(slotEl, function () {
        /* Egypt Farmer (55) pending +1 IP: consume it onto THIS card BEFORE its own
           At Once runs. That ordering is load-bearing — an Egypt Farmer revealing
           here takes the pending +1 itself and only then arms the next one, instead
           of buffing itself. No buff pending → no-op. */
        var _tookFarmerBuff = false;
        if (SOG.abilities && typeof SOG.abilities.consumePendingIPBuff === 'function') {
          if (SOG.abilities.consumePendingIPBuff(item.owner, rSd)) {
            _tookFarmerBuff = true;
            refreshSlotIPDisplays();
            updateScores();
            if (SOG.ui && SOG.ui.showIPFloat) SOG.ui.showIPFloat(item.owner, item.cardId, 1);
          }
        }
        // rSi/rSd are THIS play's resolved coordinates (see the duplicate-safe
        // lookup above) — the At-Once handler needs the actor, not just the id.
        fireAtOnce(item.owner, item.cardId, rLocId, rSi, rSd, function () {
          /* Egypt Farmer (55) PHASE 2 — the onion descends onto the card that just
             took the +1 and is eaten. Fired HERE, in the At-Once completion
             callback, because this is the point at which the buffed card has
             finished its OWN reveal animation: flipSlot's done only covers the flip
             and reveal-fx overlays, whereas Ramses' shimmer, Hatshepsut's Merchant
             boat and Papyrus' scroll are ABILITY animations gated on this callback.
             A card with no animation reaches here immediately, so the onion just
             arrives at once. The slot element is re-resolved rather than reusing
             the captured `slotEl`, because the card may have RELOCATED during its
             own At Once — the onion has to land on wherever it actually is now.
             Visual only; never gates the pipeline. */
          if (_tookFarmerBuff && window.SOG && SOG.RevealFx &&
              typeof SOG.RevealFx.farmerOnionBite === 'function') {
            SOG.RevealFx.farmerOnionBite(_liveSlotElFor(item.owner, rSd) || slotEl);
          }
          // (a) Per-slot play metadata (Scribe needs this on every revealed card)
          if (rSd && rLocId !== null) {
            rSd.playTime      = ++G.playOrderCounter;
            rSd.originalLocId = rLocId;
          }
          // (c) Cultural counter increment (Gilgamesh reads this)
          if (rLocId !== null) {
            var _pc = CARDS.find(function (c) { return c.id === item.cardId; });
            if (_pc && _pc.type === 'Cultural') {
              G.culturalCount[item.owner] = (G.culturalCount[item.owner] || 0) + 1;
            }
          }
          // (c2) "Next Turn:" reveal effects (Ramses 53 — 2x IP to this turn's
          //      Cultural reveals). Applied per-card at reveal so within-turn order
          //      doesn't matter; inert when no effect is live.
          if (SOG.abilities && typeof SOG.abilities.applyNextTurnRevealEffects === 'function') {
            SOG.abilities.applyNextTurnRevealEffects(item.owner, item.cardId, rSd, rLocId);
          }
          // (d) Reactive: fire onCardLandedHere for OTHER already-revealed cards
          //     at this location (e.g. Ötzi's flee). Excludes the just-landed
          //     card, so it never fires on a card's own reveal. No card 35 in an
          //     Arcadium deck → unreached there. AWAIT it: an async reactor (Ötzi's
          //     flee slide) fully finishes before proceed() schedules the next
          //     reveal, so the flee never overlaps a card reveal. With no reactor,
          //     proceed runs immediately (behaviour-identical for other battles).
          if (SOG.abilities && typeof SOG.abilities.fireOnCardLandedHere === 'function') {
            SOG.abilities.fireOnCardLandedHere(item.owner, item.cardId, rLocId, proceed);
          } else {
            proceed();
          }
        });
      });
    } else {
      proceed();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ABILITY ENGINE (Pass 4) — game/abilities.js owns this region
     ───────────────────────────────────────────────────────────────
     Moved out of this file:
       • fireAtOnce + CARD_ABILITIES registry
       • evaluateContinuous + updateKenteGlows
       • destroyCard + discardFromHand
       • isKenteProtected, updateWilliamDisplay, pulseWilliam
       • All 8 At Once ability implementations (id 2,3,4,5,8,9,13,23)
       • All 5 conditional triggers (Jan Hus, Jesus, Samurai, Joan x2)
       • Discard chooser UI (buildChooserCard, showDiscardChooser)
       • Adjacency helper (getAdjacentLocIds)
     Call sites in this file use the aliases at the top of the IIFE
     (fireAtOnce, evaluateContinuous, isKenteProtected,
     showRevealFirstHighlight, hideRevealFirstHighlight,
     getAdjacentLocIds).
  ═══════════════════════════════════════════════════════════════ */



  /* Per-turn capital override. resource.capitalByTurn is optional and
     level-editor-authored — every hand-written boss config only ever sets
     resource.capital (a flat number), so capitalByTurn is undefined for all
     of them and this always falls through to the old behavior unchanged.
     1-indexed turn in, capitalByTurn is 0-indexed (turn 1 -> index 0). Falls
     back to the flat capital for any turn past the array's end, which won't
     happen for editor-authored levels (the form keeps the array's length in
     sync with structure.turns) but keeps this safe regardless. */
  function _capitalForTurn(resource, turn) {
    var perTurn = resource.capitalByTurn;
    if (perTurn && perTurn[turn - 1] != null) return perTurn[turn - 1];
    return resource.capital;
  }

  /* ═══════════════════════════════════════════════════════════════
     NEXT TURN / END GAME
  ═══════════════════════════════════════════════════════════════ */

  function nextTurn() {
    G.turn    += 1;
    G.phase    = 'select';
    if (window.SOG_DEBUG && SOG.hand) SOG.hand.assertShape('nextTurn');  // hand-of-objects migration net (dev-only no-op today)
    /* Prune expired "Next Turn:" effects. An effect declared on turn T is active
       ONLY on turn T+1; once G.turn passes that window it is dropped. Keeps effects
       declared last turn (now active) and this-turn declarations; inert when the
       queue is empty. */
    if (G.nextTurnEffects && G.nextTurnEffects.length) {
      G.nextTurnEffects = G.nextTurnEffects.filter(function (e) {
        return (e.turnDeclared + 1) >= G.turn;
      });
    }
    /* Capital reset via config.resource (was hardcoded CAPITAL). 'none' holds
       capital at 0 (future capital-less battles); any other model resets to
       _capitalForTurn(resource, G.turn) + bonus — resource.capital unless a
       level-editor level sets resource.capitalByTurn, a flat number for
       every hand-written boss. Arcadium (model 'capital', capital 5) is
       identical to the old CAPITAL + bonus. The 'none' branch is unreached
       by Arcadium. */
    var _res = G.config.resource;
    G.capital  = (_res.model === 'none') ? 0 : (_capitalForTurn(_res, G.turn) + G.bonusCapitalNextTurn);
    G.turnStartCapital     = G.capital;
    G.bonusCapitalNextTurn = 0;
    SOG.input.resetDragInfo();

    var playerDrew = G.playerRevealQueue.length;
    var aiDrew     = G.aiRevealQueue.length;
    G.playerRevealQueue = [];
    G.aiRevealQueue     = [];
    G.aiActionLog       = [];   // bug 16
    G.playerFirst       = !G.playerFirst;
    showRevealFirstHighlight(G.playerFirst);
    G.movedThisTurn          = {};
    G.locMoveUsedThisTurn    = {};
    G.aiMovedThisTurn        = {};
    G.moveLog                = [];
    G.playerActionLog        = [];
    G.traderBarter           = null;   // Trader (68) barter preview/queue
    G.locationSnapshots      = {};
    G.reservedSlotsPerLoc    = {};
    G.deferredPlays          = {};

    /* Draw policy via config.draw. 'flat' draws a fixed +N per side per turn
       (future capital-less battles); 'replenish' draws back exactly what each
       side PLAYED last turn, deck permitting — deliberately NOT capped at
       maxHandSize (ability-granted cards like Tool's draw are net gains that
       ride above the cap; grant sites enforce the cap where cards are added). */
    var _draw    = G.config.draw || { model: 'replenish' };
    if (_draw.model === 'flat') {
      var _n = _draw.perTurn || 1;
      G.playerDeck.splice(0, Math.min(_n, G.playerDeck.length)).forEach(function (id) { G.playerHand.push(id); });
      G.aiDeck.splice(0,     Math.min(_n, G.aiDeck.length)).forEach(function (id) { G.aiHand.push(id); });
    } else {
      // Replenish draws back exactly what was PLAYED last turn (deck permitting).
      // Deliberately NOT capped at maxHandSize: cards granted by abilities mid-turn
      // (Tool's draw, Jesus' return, future Egypt grants) are NET gains that ride
      // ABOVE the cap — the cap is enforced where cards are GRANTED (e.g.
      // drawTypeFromDeck / applyNubianGoldOnPlay), not clawed back at the draw.
      var playerCanDraw = Math.min(playerDrew, G.playerDeck.length);
      var aiCanDraw     = Math.min(aiDrew,     G.aiDeck.length);
      G.playerDeck.splice(0, playerCanDraw).forEach(function (id) { G.playerHand.push(id); });
      G.aiDeck.splice(0, aiCanDraw).forEach(function (id) { G.aiHand.push(id); });
    }

    rebuildPlayerHand();
    SOG.ui.updateOppHand();
    updateHeader();
    refreshMoveableCards();

    endTurnBtn.textContent     = 'END TURN';
    endTurnBtn.disabled        = false;
    resetTurnBtn.disabled      = false;
    resetTurnBtn.style.display = '';
    _startSelectionTimer();

    if (typeof Analytics !== 'undefined') Analytics.turnStarted();

    /* onTurnStart (script hook): start of a selection phase (turns 2+). Sync,
       fire-and-forget. No script → no-op. */
    SOG.BattleHooks.fire('onTurnStart', [G.turn]);
  }

  function endGame() {
    _stopSelectionTimer();
    _cancelUndoEndTurn();
    G.phase = 'over';
    refreshMoveableCards();
    var result = tallyResult();
    if (typeof Analytics !== 'undefined') Analytics.gameCompleted(result);

    // Checkpoint save (AUTH_SPEC.md Phase 3) — one of exactly three call
    // sites in the whole app (the others: account creation, logout). Fires
    // only on a WIN. No-ops silently for guests and on any Firestore error —
    // gameplay never blocks on this.
    if (result.outcome === 'player' && window.SogAccount &&
        typeof window.SogAccount.checkpointSave === 'function') {
      window.SogAccount.checkpointSave();
    }

    /* AI win-rate instrumentation (Stage A): log every completed ADVENTURE battle
       (scriptHook set) — boss, tier (serf/giant), result, turn count, per-loc +
       total scores. Guarded to adventure battles so Arcadium/2P aren't logged.
       No PII. Read via SOG.aiLog.dump()/summary(). */
    try {
      if (G.config && G.config.scriptHook && SOG.aiLog && typeof SOG.aiLog.record === 'function') {
        var _lr = (result.locResults || []).map(function (r) {
          return { loc: r.loc && r.loc.name, playerIP: r.playerIP, aiIP: r.aiIP, winner: r.winner };
        });
        var _pT = _lr.reduce(function (s, r) { return s + (r.playerIP || 0); }, 0);
        var _aT = _lr.reduce(function (s, r) { return s + (r.aiIP    || 0); }, 0);
        var _tier = (G.config.ai && G.config.ai.tier) ? G.config.ai.tier
                  : (G.config.ai && G.config.ai.profile === 'heuristic') ? 'giant'
                  : (window.aiDifficulty || 'unknown');
        SOG.aiLog.record({ boss: G.config.scriptHook, tier: _tier, result: result.outcome,
                           turns: G.turn, locs: _lr, playerTotal: _pT, aiTotal: _aT, ts: Date.now() });
      }
    } catch (e) {}

    /* Per-node "encountered" stamp (difficulty-picker system): the player has now
       COMPLETED this boss node's battle at least once (win OR lose). Set here — the
       single completion point for every adventure battle, keyed by scriptHook — so
       the overworld shows the Serf/Giant picker on subsequent clicks instead of the
       first-encounter dialogue. Harmless for non-boss adventure scriptHooks (their
       nodes don't read it). See overworld.js _nodeEncountered / onNodeClick. */
    try {
      if (G.config && G.config.scriptHook) {
        localStorage.setItem('sog_node_encountered_' + G.config.scriptHook, 'true');
      }
    } catch (e) {}

    /* Flag/stamp node progression: on a WIN, record which TIER of this boss node was
       beaten (serf/giant tracked independently — a Giant win via the picker can stamp
       the Giant flag while Serf stays unstamped, and vice-versa), and stash a one-shot
       pending-stamp signal the overworld consumes on the return-to-map to animate the
       new stamp landing. Tier = cfg.ai.tier (the same signal the win-log records). */
    try {
      // Flag SLOT (not AI tier) drives the stamp + the SOG.rewards gold/card gate.
      // Normally flagTier === ai.tier; Gilgamesh's first battle sets flagTier='serf'
      // while ai.tier='giant' (decoupled — see initGame). Falls back to ai.tier.
      var _wtier = (G.config && G.config.flagTier)
                || (G.config && G.config.ai && G.config.ai.tier) || null;
      if (result.outcome === 'player' && G.config && G.config.scriptHook &&
          (_wtier === 'serf' || _wtier === 'giant')) {
        var _bkey = 'sog_node_' + G.config.scriptHook + '_' + _wtier + '_beaten';
        // Snapshot the PRIOR beaten state BEFORE stamping it — this is the win-reward
        // gate (SOG.rewards.consume): first-tier-win pays gold, a replay pays zero.
        // Once stamped below, the flag reads true for every later read, so the boss's
        // onWin (which fires after this) can't recover "was this the first time".
        var _wasBeaten = false;
        try { _wasBeaten = localStorage.getItem(_bkey) === 'true'; } catch (e) {}
        localStorage.setItem(_bkey, 'true');
        window.__pendingStamp  = { hook: G.config.scriptHook, tier: _wtier };   // consumed by overworld render
        window.__pendingReward = { hook: G.config.scriptHook, tier: _wtier, firstTierWin: !_wasBeaten };  // consumed by boss onWin
        // FIRST-EVER win on this boss (neither tier beaten before) → the Giant flag
        // transitions hidden→visible on the return. Stash the one-shot reveal signal
        // so EVERY boss's return (incl. the generic resumeAfterBattle) plays the
        // "erected" animation — not just the modules that set it themselves.
        var _okey = 'sog_node_' + G.config.scriptHook + '_' + (_wtier === 'serf' ? 'giant' : 'serf') + '_beaten';
        var _otherBeaten = false;
        try { _otherBeaten = localStorage.getItem(_okey) === 'true'; } catch (e) {}
        if (!_wasBeaten && !_otherBeaten) {
          window.__pendingFlagReveal = { hook: G.config.scriptHook, tier: 'giant' };
        }
      }
    } catch (e) {}

    showResult(result);

    /* Progression: track wins for card unlocking (single-player only).
       Scripted battles (G.config.scriptHook set — Adventure narrative battles
       like Prehistory) do NOT feed Arcadium progression: recordWin both
       increments the win counters and arms the victory montage
       (window._pendingMontage), so skipping it suppresses every progression
       side-effect. Arcadium has scriptHook null → the guard is unreached and it
       records exactly as today. */
    if (result.outcome === 'player' &&
        typeof Progression !== 'undefined' &&
        !(G.config && G.config.scriptHook) &&
        !window.matchId && !window.versusStudentMode && !window.tournamentMatch) {
      Progression.recordWin(window.aiDifficulty);
    }

    /* 2P mode: P1 writes match result; both players clear Match state */
    if (window.matchId && typeof Match !== 'undefined') {
      if (window.p1OrP2 === 'p1') {
        Match.reportResult(result.outcome, result.playerTotal, result.aiTotal);
      }
      Match.reset();
      window.matchId  = null;
      window.p1OrP2   = null;
    }

    headerPhaseEl.textContent = 'GAME OVER';
    endTurnBtn.disabled       = true;
    resetTurnBtn.disabled     = true;

    // Location win animations
    if (typeof Anim !== 'undefined') {
      result.locResults.forEach(function (lr) {
        if (lr.winner !== 'tie') {
          var locTile = boardEl.querySelector('.battle-location[data-loc-id="' + lr.loc.id + '"]');
          if (locTile) Anim.locationWin(locTile);
        }
      });
    }

    // Stop background music before game-over sounds play
    SOG.ui.stopBgMusic();

    /* Shared helper — shows result screen + headline animation */
    var _showResultScreen = function () {
      showScreen('screen-result');
      if (typeof Anim !== 'undefined') {
        if      (result.outcome === 'player') Anim.celebration();
        else if (result.outcome === 'ai')     Anim.sadResult();
      }
      // Vs AI / Multiplayer match completion — feeds the feedback
      // counter + home-button visibility. Tutorial uses its own
      // showScreen('screen-result') in tutorial.js, so it doesn't
      // reach this code path.
      if (window.Feedback && typeof window.Feedback.recordMatchCompleted === 'function') {
        window.Feedback.recordMatchCompleted();
      }
    };

    /* Tournament champion: Final knockout win always triggers the legend screen */
    var _isTournamentChampion = result.outcome === 'player' &&
                                window.tournamentMatch === 'knockout' &&
                                window.currentKORound  === 'final' &&
                                typeof LegendScreen !== 'undefined';

    /* 5-win session milestone — disabled; replaced by 10-win victory montage in Progression */
    var _isSessionMilestone = false;

    var _isLegendMilestone = _isTournamentChampion || _isSessionMilestone;

    /* Outcome hooks (async script): the engine has determined the result and
       run all rules/bookkeeping above; this final block is the PRESENTATION.
       A script runs its win/loss/tie narrative (dialogue, card grant, custom
       end screen) then calls proceed() for the default scoreboard — or owns the
       end screen and never calls it. With no script (Arcadium/2P/standard →
       scriptHook null) proceed() runs immediately → today's presentation. */
    var _defaultOutcomePresentation = function () {
      if (_isLegendMilestone) {
        /* Brief pause so board location-win animations are visible, then cut to legend */
        setTimeout(function () {
          var showFn = (_isTournamentChampion && LegendScreen.showChampion)
            ? function (cb) { LegendScreen.showChampion(window.currentLobbyId || '', cb); }
            : function (cb) { LegendScreen.show(cb); };

          showFn(function () {
            /* Legend clicked through — play win sound then show result screen */
            if (typeof SFX !== 'undefined') SFX.gameWon();
            _showResultScreen();
          });
        }, 800);
      } else {
        /* Normal path */
        if (typeof SFX !== 'undefined') {
          if      (result.outcome === 'player') SFX.gameWon();
          else if (result.outcome === 'ai')     SFX.gameLost();
          else                                  SFX.locationWon();
        }
        setTimeout(_showResultScreen, 1000);
      }
    };

    // Focus drain (clamps at 0). ADVENTURE-ONLY (Stage 3 scoping): every battle
    // WIN costs 25, every LOSS costs 10 (ties cost nothing). Guarded on
    // G.config.scriptHook — truthy for adventure battles (bosses + prehistory/
    // otzi), null for Arcadium/2P — so Arcadium play never touches focus.
    // endGame() runs exactly once per battle, so this drains once.
    if ((G.config && G.config.scriptHook) && window.SOG && SOG.focus) {
      if      (result.outcome === 'player') SOG.focus.spend(25);
      else if (result.outcome === 'ai')     SOG.focus.spend(10);
      if (window.SOG.HUD && typeof SOG.HUD.refreshFocus === 'function') SOG.HUD.refreshFocus();
    }

    var _outcomeHook = result.outcome === 'player' ? 'onWin'
                     : result.outcome === 'ai'     ? 'onLoss'
                     : 'onTie';
    SOG.BattleHooks.runAsyncOr(_outcomeHook, [result], _defaultOutcomePresentation);
  }

  function tallyResult() {
    var locResults = G.locations.map(function (loc) {
      var pIP = G.playerSlots[loc.id].reduce(function (s, x) { return s + (x ? effectiveIP(x) : 0); }, 0);
      var aIP = G.aiSlots[loc.id].reduce(    function (s, x) { return s + (x ? effectiveIP(x) : 0); }, 0);
      // Include per-location external boosts (e.g., Sargon's adjacent-location bonus)
      if (G.locationBoosts && G.locationBoosts[loc.id]) {
        G.locationBoosts[loc.id].player.forEach(function (b) { pIP += b.amount; });
        G.locationBoosts[loc.id].opp.forEach(    function (b) { aIP += b.amount; });
      }
      return { loc: loc, playerIP: pIP, aiIP: aIP,
               winner: pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie' };
    });
    var sc   = G.config.scoring;
    var rule = sc.rule || 'most-locations';

    /* ── 'single-location' rule (future variant — UNREACHED by Arcadium) ──
       For a one-location battle: compare player vs AI IP at that location.
       sc.tie governs the exact-tie outcome ('loss' → a distinct 'tie' outcome
       the caller treats like a loss, vs 'draw' for a true draw). Written for
       the deferred Prehistory cutover; Arcadium uses 'most-locations' below. */
    if (rule === 'single-location') {
      var only = locResults[0] || { playerIP: 0, aiIP: 0 };
      var sOutcome = only.playerIP > only.aiIP ? 'player'
                   : only.aiIP > only.playerIP ? 'ai'
                   : (sc.tie === 'loss' ? 'tie' : (sc.exactTie || 'draw'));
      return { outcome: sOutcome, tiebreaker: false,
               playerWins: only.playerIP > only.aiIP ? 1 : 0,
               aiWins:     only.aiIP > only.playerIP ? 1 : 0,
               playerTotal: only.playerIP, aiTotal: only.aiIP, locResults: locResults };
    }

    /* ── 'most-locations' rule (Arcadium — unchanged) ── */
    var pW = locResults.filter(function (r) { return r.winner === 'player'; }).length;
    var aW = locResults.filter(function (r) { return r.winner === 'ai';     }).length;
    var outcome, tb = false, pT = 0, aT = 0;
    if      (pW >= sc.winThreshold) { outcome = 'player'; }
    else if (aW >= sc.winThreshold) { outcome = 'ai'; }
    else {
      tb = true;
      // tiebreaker 'total-ip': compare summed IP across all locations.
      if (sc.tiebreaker === 'total-ip') {
        pT = locResults.reduce(function (s, r) { return s + r.playerIP; }, 0);
        aT = locResults.reduce(function (s, r) { return s + r.aiIP;     }, 0);
      }
      outcome = pT > aT ? 'player' : aT > pT ? 'ai' : sc.exactTie;
    }
    return { outcome: outcome, tiebreaker: tb, playerWins: pW, aiWins: aW,
             playerTotal: pT, aiTotal: aT, locResults: locResults };
  }

  function showResult(r) {
    var hEl    = document.getElementById('result-headline');
    var subEl  = document.getElementById('result-subline');
    var locsEl = document.getElementById('result-locs');
    var tbEl   = document.getElementById('result-tiebreaker');

    var isGiantWin = r.outcome === 'player' && window.aiDifficulty === 'hard';
    hEl.className   = 'result-headline ' + (isGiantWin ? 'result-giant' : 'result-' + r.outcome);
    hEl.textContent = isGiantWin         ? 'GIANT VICTORY!'
                    : r.outcome === 'player' ? 'VICTORY'
                    : r.outcome === 'ai'     ? 'DEFEAT'
                    : 'DRAW';

    if (r.tiebreaker) {
      subEl.textContent = r.outcome === 'draw'
        ? 'Total IP tied — the game is a draw'
        : (r.outcome === 'player' ? 'You' : 'Opponent') + ' won on total IP across all 3 locations';
    } else {
      var w = r.outcome === 'player' ? r.playerWins : r.aiWins;
      subEl.textContent = (r.outcome === 'player' ? 'You' : 'Opponent') + ' won ' + w + ' of 3 locations';
    }

    locsEl.innerHTML = '';
    r.locResults.forEach(function (lr) {
      var row = document.createElement('div'); row.className = 'result-loc-row';
      var nm  = document.createElement('div'); nm.className = 'result-loc-name'; nm.textContent = lr.loc.name;
      var sc  = document.createElement('div'); sc.className = 'result-loc-scores';
      var yu  = document.createElement('span');
      yu.className   = 'result-loc-you' + (lr.winner === 'player' ? ' result-loc-winner' : '');
      yu.textContent = 'You: ' + lr.playerIP;
      var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
      var op  = document.createElement('span');
      op.className   = 'result-loc-opp' + (lr.winner === 'ai' ? ' result-loc-winner' : '');
      op.textContent = 'Opp: ' + lr.aiIP;
      sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
      var bd  = document.createElement('div');
      bd.className   = 'result-loc-badge result-loc-badge-' + lr.winner;
      bd.textContent = lr.winner === 'player' ? 'YOU' : lr.winner === 'ai' ? 'OPP' : 'TIE';
      row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
      locsEl.appendChild(row);
    });

    if (r.tiebreaker) {
      document.getElementById('result-tb-player').textContent = r.playerTotal;
      document.getElementById('result-tb-ai').textContent     = r.aiTotal;
      tbEl.style.display = '';
    } else {
      tbEl.style.display = 'none';
    }

    /* Show/hide lobby return button */
    var lobbyBtn = document.getElementById('result-return-lobby');
    if (lobbyBtn) {
      lobbyBtn.style.display = window.currentLobbyCode ? '' : 'none';
    }

    /* Tournament match: record result */
    if (window.tournamentMatch && window.currentLobbyCode) {
      var outcome = r.outcome === 'player' ? 'win'
                  : r.outcome === 'ai'     ? 'loss'
                  :                          'draw';
      if (window.tournamentMatch === 'knockout') {
        if (window.Multiplayer && typeof window.Multiplayer.recordKnockoutResult === 'function') {
          window.Multiplayer.recordKnockoutResult(outcome);
        }
      } else if (window.tournamentMatch !== 'versus') {
        if (window.Multiplayer && typeof window.Multiplayer.recordGroupResult === 'function') {
          window.Multiplayer.recordGroupResult(outcome);
        }
      }
    }

    /* Versus mode: 35-second auto-return to lobby */
    if (window.tournamentMatch === 'versus') {
      var vsWrap = document.getElementById('vs-result-return-wrap');
      var vsNum  = document.getElementById('vs-result-return-num');
      if (vsWrap) vsWrap.classList.add('visible');
      var vsLeft = 35;
      if (vsNum) vsNum.textContent = vsLeft;
      var vsTimer = setInterval(function () {
        vsLeft--;
        if (vsNum) vsNum.textContent = vsLeft;
        if (vsLeft <= 0) {
          clearInterval(vsTimer);
          if (vsWrap) vsWrap.classList.remove('visible');
          if (window.BattleLobby && typeof window.BattleLobby.returnToLobby === 'function') {
            window.BattleLobby.returnToLobby();
          }
        }
      }, 1000);
    }
  }

  /* CARD INFO POPUP, OPPONENT HAND, and flashDeny moved to game/ui.js (Pass 2).
     Callers use SOG.ui.openBattlePopup / SOG.ui.updateOppHand / SOG.ui.flashDeny. */


  /* clearDragOver moved to game/input.js (Pass 3c). */

  /* ═══════════════════════════════════════════════════════════════
     RESULT SCREEN BUTTONS
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Chain any pending unlock cutscene → victory montage → then call finalCb.
   * Plays unlock cutscene first (if pending), then montage (if pending), then destination.
   */
  function _playPendingCelebrations(finalCb) {
    if (typeof Progression === 'undefined') { finalCb(); return; }

    // Step 1: unlock cutscene?
    function step1() {
      if (Progression.hasPendingCutscene()) {
        var unlockType = Progression.hasPendingCutscene();
        Progression.playCutscene(unlockType, step2);
      } else {
        step2();
      }
    }
    // Step 2: victory montage?
    function step2() {
      if (Progression.hasPendingMontage()) {
        Progression.playMontage(finalCb);
      } else {
        finalCb();
      }
    }
    step1();
  }

  document.getElementById('result-play-again').addEventListener('click', function () {
    // First-time feedback popup intercept (3rd-match milestone).
    // Returns true if popup is now visible — abort the navigation
    // and let the popup's own "Play Again" button re-fire this click.
    if (window.Feedback && window.Feedback.maybeShowPopup()) return;
    // A battle config may supply a replay() to re-run THE SAME battle (e.g. the
    // Narmer advance-board battle rebuilds a fresh config). Arcadium / 2P set
    // none → fall through to the default (re-resolve a new Arcadium game).
    var _replay = G.config && typeof G.config.replay === 'function' ? G.config.replay : null;
    _playPendingCelebrations(function () {
      if (_replay) { _replay(); return; }
      showScreen('screen-battle');
      initGame();
    });
  });

  document.getElementById('result-home').addEventListener('click', function () {
    if (window.Feedback && window.Feedback.maybeShowPopup()) return;
    SOG.ui.stopBgMusic();
    _playPendingCelebrations(function () {
      showScreen('screen-home');
      if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') {
        window.HomeFlow.reset();   // re-sync home-state (btn-account opacity/display, etc.)
      }
      if (window.HomeFlow && typeof window.HomeFlow.playMusic === 'function') {
        window.HomeFlow.playMusic();
      }
    });
  });

  document.getElementById('result-return-lobby').addEventListener('click', function () {
    SOG.ui.stopBgMusic();
    if (window.Multiplayer && typeof window.Multiplayer.returnToLobby === 'function') {
      window.Multiplayer.returnToLobby();
    }
  });

  document.getElementById('result-gameboard').addEventListener('click', function () {
    showScreen('screen-battle');
    document.getElementById('btn-back-results').style.display = '';
  });

  document.getElementById('btn-back-results').addEventListener('click', function () {
    document.getElementById('btn-back-results').style.display = 'none';
    showScreen('screen-result');
  });

  /* Music control widget moved to game/ui.js (Pass 2). */

  /* TOUCH DRAG SUPPORT (initTouchDrag and its inner functions) moved to
     game/input.js (Pass 3c). input.js auto-initializes touch drag at module load. */


  /* ── Export ──────────────────────────────────────────────────── */
  window.initGame          = initGame;
  window.showResult        = showResult;
  /* window.openBattlePopup is now set by game/ui.js (Pass 2). */

  /* ── SOG namespace exports (consumed by sibling modules) ──
     SOG.state     owned by game/state.js     (Pass 3a).
     SOG.board     owned by game/board.js     (Pass 3b).
     SOG.input     owned by game/input.js     (Pass 3c).
     SOG.abilities owned by game/abilities.js (Pass 4).
     This file's SOG.game retains only what sibling modules need
     that wasn't part of those extractions:
       • Backwards-compat pass-throughs for ai.js / ui.js / board.js
         (most are aliased from sibling modules at the top of this
         IIFE — kept on SOG.game so older sibling code doesn't break).
       • executeMove and executeMoveAnimated — cross-cutting reveal
         pipeline helpers that game.js owns; called by ai.js's
         runAiMovements (executeMove) and abilities.js's Wu push
         (executeMoveAnimated). */
  /* ── Snapshot (save-state.js) ──────────────────────────────────
     Covers the per-node "encountered" stamps and per-tier "beaten" flags
     this file stamps generically in endGame (see the win-reward /
     node-progression block above), keyed dynamically by scriptHook — an
     open-ended, data-driven set (one per boss across data/map-data.js's
     milestones), so no fixed module can enumerate them ahead of time.
     Scanned by pattern rather than by a known key list. */
  var NODE_ENCOUNTERED_RE = /^sog_node_encountered_/;
  var NODE_BEATEN_RE      = /^sog_node_.+_(serf|giant)_beaten$/;

  function getSnapshot() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (NODE_ENCOUNTERED_RE.test(key) || NODE_BEATEN_RE.test(key)) {
          out[key] = localStorage.getItem(key);
        }
      }
    } catch (e) {}
    return out;
  }

  function applySnapshot(snap) {
    if (!snap) return;
    try {
      Object.keys(snap).forEach(function (key) {
        if (NODE_ENCOUNTERED_RE.test(key) || NODE_BEATEN_RE.test(key)) {
          localStorage.setItem(key, snap[key]);
        }
      });
    } catch (e) {}
  }

  SOG.game = {
    shuffle:               shuffle,
    getSlotEl:             getSlotEl,
    setSlotFaceDown:       setSlotFaceDown,
    effectiveIP:           effectiveIP,
    isKenteProtected:      isKenteProtected,
    executeMove:           executeMove,
    executeMoveAnimated:   executeMoveAnimated,
    executeBarter:         executeBarter,   // Trader (68) barter — reused by AI movement pass
    findSlotEl:            findSlotEl,
    refreshMoveableCards:  refreshMoveableCards,
    // Exposed for the Prehistory adventure module's reveal sequence.
    flipSlot:              flipSlot,
    getSnapshot:           getSnapshot,
    applySnapshot:         applySnapshot
  };

})();

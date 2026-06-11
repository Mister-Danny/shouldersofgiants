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
  var placeRevealedCard     = SOG.board.placeRevealedCard;
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
      // Draw policy. 'replenish' = draw back up by however many cards were
      // played last turn, capped at structure.maxHandSize (today's Arcadium
      // behaviour). The 'flat' variant (+N/turn) exists for future battles.
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

    G.locations.forEach(function (loc) {
      G.playerSlots[loc.id] = Array(cfg.structure.slotsPerLocation).fill(null);
      G.aiSlots[loc.id]     = Array(cfg.structure.slotsPerLocation).fill(null);
    });

    G.turn              = 1;
    G.phase             = 'select';
    G.capital           = cfg.resource.capital;
    G.turnStartCapital  = cfg.resource.capital;
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
    G.cardIPBonus            = {};
    G.aiCardIPBonus          = {};
    G.destroyedIPTotal       = 0;
    G.aiDestroyedIPTotal     = 0;
    G.columbusMoved          = false;
    G.aiColumbusMoved        = false;
    G.movedThisTurn          = {};
    G.aiMovedThisTurn        = {};
    G.moveLog                = [];
    G.playerActionLog        = [];
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
      SOG.ui.startBgMusic();
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
      G.aiHand = G.aiHand.filter(function (id) { return id !== a.cardId; });
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
    var pool = LOCATIONS.slice();
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
    buildCardFace(slotEl, card, sd ? effectiveIP(sd) : card.ip);
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
            var c = CARDS.find(function (x) { return x.id === s.cardId; });
            if (c && c.cc >= 4) juvenalTargetEls.push(getSlotEl(own, locId, si));
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
        var juvenalPresent = ['player', 'opp'].some(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          return sl[locId].some(function (s) { return s && s.revealed && s.cardId === 18; });
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
    if (G.prehistoryMode)      return;  // adventure module owns End Turn in prehistory tutorial
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
    SOG.ai.runAiMovements();
    SOG.ai.runAiSelection();
    SOG.ui.updateOppHand();
    setTimeout(startReveal, 600);
  }


  /* ═══════════════════════════════════════════════════════════════
     MOVEMENT SYSTEM  (Magellan / Columbus)
  ═══════════════════════════════════════════════════════════════ */

  /* refreshMoveableCards moved to game/input.js (Pass 3c). Aliased above. */

  function executeMove(owner, fromLocId, fromSlotIndex, toLocId) {
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
      buildCardFace(toSlotEl, card, effectiveIP(sd));
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

    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var card  = CARDS.find(function (c) { return c.id === cardId; });

    // Find card at fromLocId by cardId (snapBack already placed it here)
    var snapIdx = -1;
    for (var fi = 0; fi < slots[fromLocId].length; fi++) {
      if (slots[fromLocId][fi] && slots[fromLocId][fi].cardId === cardId) { snapIdx = fi; break; }
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
    if (opts.sfxOnStart) {
      opts.sfxOnStart();
    } else if (cardId === 24 && typeof SFX !== 'undefined') {
      SFX.sailingSound();
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

    // Mark moveLog entry as executed
    for (var li = 0; li < G.moveLog.length; li++) {
      if (G.moveLog[li].cardId === cardId && G.moveLog[li].queued) {
        G.moveLog[li].queued            = false;
        G.moveLog[li].ipModAdded        = ipModAdded;
        G.moveLog[li].ipModSourcesAdded = ipModSourcesAdded;
        G.moveLog[li].toSlotIdx         = toIndex;
        break;
      }
    }

    function applyMove() {
      slots[fromLocId][snapIdx] = null;
      clearSlotDOM(owner, fromLocId, snapIdx);
      if (owner === 'player') { compactPlayerSlots(fromLocId); syncPlayerSlots(fromLocId); }
      else                    { compactOppSlots(fromLocId);    syncOppSlots(fromLocId);    }

      var finalIdx = slots[toLocId].indexOf(null);
      if (finalIdx === -1) { done(); return; }
      slots[toLocId][finalIdx] = sd;

      var finalSlotEl = getSlotEl(owner, toLocId, finalIdx);
      if (finalSlotEl && card) {
        finalSlotEl.dataset.cardId = cardId;
        finalSlotEl.className      = 'battle-card-slot occupied face-up';
        finalSlotEl.removeAttribute('draggable');
        buildCardFace(finalSlotEl, card, effectiveIP(sd));
      }

      if (cardId === 24) {
        SOG.ui.showIPFloat(owner, cardId, 1);
        refreshSlotIPDisplays();
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

      gsap.to(clone, {
        left:     toRect.left,
        top:      toRect.top,
        duration: 0.55,
        ease:     'power2.inOut',
        onComplete: function () {
          document.body.removeChild(clone);
          fromSlotEl.style.opacity = '';
          applyMove();
        }
      });
    } else {
      applyMove();
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
    for (var i = 0; i < len; i++) {
      if (i < fQ.length) {
        var fi = fQ[i];
        seq.push({ type: fi.type, owner: fO, cardId: fi.cardId,
                   fromLocId: fi.fromLocId, toLocId: fi.toLocId });
      }
      if (i < sQ.length) {
        var si2 = sQ[i];
        seq.push({ type: si2.type, owner: sO, cardId: si2.cardId,
                   fromLocId: si2.fromLocId, toLocId: si2.toLocId });
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
      /* onAfterReveal (script hook): all flips + At-Once + continuous mods are
         done. `revealed` lists the cards newly played this turn (both sides) so
         a script (e.g. Ötzi flee) can act per-card. Sync, fire-and-forget.
         No script → no-op. */
      if (SOG.BattleHooks.has('onAfterReveal')) {
        var revealed = [];
        seq.forEach(function (it) {
          if (it.type !== 'play') return;
          var rLocId = it.toLocId;
          var rSlots = (it.owner === 'player') ? G.playerSlots[rLocId] : G.aiSlots[rLocId];
          var rIdx = -1;
          if (rSlots) {
            for (var k = 0; k < rSlots.length; k++) {
              if (rSlots[k] && rSlots[k].cardId === it.cardId) { rIdx = k; break; }
            }
          }
          revealed.push({ owner: it.owner, cardId: it.cardId, locId: rLocId, slotIndex: rIdx });
        });
        SOG.BattleHooks.fire('onAfterReveal', [{ turn: G.turn, revealed: revealed }]);
      }
      setTimeout(function () { G.turn >= G.config.structure.turns ? endGame() : nextTurn(); }, POST_REVEAL);
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
      executeMoveAnimated(item.owner, item.cardId, item.fromLocId, item.toLocId, item.opts || {}, proceed);
      return;
    }

    // type === 'play'
    var slotEl = findSlotEl(item.owner, item.cardId);
    var rLocId = slotEl ? getCardLocId(item.owner, item.cardId) : null;
    var rSlots = item.owner === 'player' ? G.playerSlots : G.aiSlots;
    var rSi    = rLocId !== null
      ? rSlots[rLocId].findIndex(function (s) { return s && s.cardId === item.cardId; })
      : -1;
    var rSd    = rSi !== -1 ? rSlots[rLocId][rSi] : null;
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
        fireAtOnce(item.owner, item.cardId, rLocId, function () {
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
          proceed();
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



  /* ═══════════════════════════════════════════════════════════════
     NEXT TURN / END GAME
  ═══════════════════════════════════════════════════════════════ */

  function nextTurn() {
    G.turn    += 1;
    G.phase    = 'select';
    /* Capital reset via config.resource (was hardcoded CAPITAL). 'none' holds
       capital at 0 (future capital-less battles); any other model resets to
       resource.capital + bonus. Arcadium (model 'capital', capital 5) is
       identical to the old CAPITAL + bonus. The 'none' branch is unreached
       by Arcadium. */
    var _res = G.config.resource;
    G.capital  = (_res.model === 'none') ? 0 : (_res.capital + G.bonusCapitalNextTurn);
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
    G.aiMovedThisTurn        = {};
    G.moveLog                = [];
    G.playerActionLog        = [];
    G.locationSnapshots      = {};
    G.reservedSlotsPerLoc    = {};
    G.deferredPlays          = {};

    /* Draw policy via config.draw (was hardcoded draw-to-MAX_HAND_SIZE).
       'flat' draws a fixed +N per side per turn (future capital-less battles);
       'replenish' (Arcadium) draws back up by however many cards were played
       last turn, capped at structure.maxHandSize — identical to the old logic
       (MAX_HAND_SIZE === structure.maxHandSize). The 'flat' branch is unreached
       by Arcadium. */
    var _draw    = G.config.draw || { model: 'replenish' };
    var _maxHand = G.config.structure.maxHandSize;
    if (_draw.model === 'flat') {
      var _n = _draw.perTurn || 1;
      G.playerDeck.splice(0, Math.min(_n, G.playerDeck.length)).forEach(function (id) { G.playerHand.push(id); });
      G.aiDeck.splice(0,     Math.min(_n, G.aiDeck.length)).forEach(function (id) { G.aiHand.push(id); });
    } else {
      var playerCanDraw = Math.min(playerDrew, Math.max(0, _maxHand - G.playerHand.length));
      var aiCanDraw     = Math.min(aiDrew,     Math.max(0, _maxHand - G.aiHand.length));
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
    showResult(result);

    /* Progression: track wins for card unlocking (single-player only) */
    if (result.outcome === 'player' &&
        typeof Progression !== 'undefined' &&
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
    _playPendingCelebrations(function () {
      showScreen('screen-battle');
      initGame();
    });
  });

  document.getElementById('result-home').addEventListener('click', function () {
    if (window.Feedback && window.Feedback.maybeShowPopup()) return;
    SOG.ui.stopBgMusic();
    _playPendingCelebrations(function () {
      showScreen('screen-home');
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
  SOG.game = {
    shuffle:               shuffle,
    getSlotEl:             getSlotEl,
    setSlotFaceDown:       setSlotFaceDown,
    effectiveIP:           effectiveIP,
    isKenteProtected:      isKenteProtected,
    executeMove:           executeMove,
    executeMoveAnimated:   executeMoveAnimated,
    findSlotEl:            findSlotEl,
    refreshMoveableCards:  refreshMoveableCards,
    // Exposed for the Prehistory adventure module's reveal sequence.
    flipSlot:              flipSlot
  };

})();

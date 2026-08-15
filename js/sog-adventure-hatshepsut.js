/**
 * sog-adventure-hatshepsut.js — SOG.HatshepsutBattle (Egypt Battle 2).
 *
 * Hatshepsut's fight on a STANDARD board — unlike Narmer's, there is NO advance
 * gate: all three locations are open from turn 1 and the win condition is the
 * ordinary "most IP at 2 of 3 locations" the Mesopotamia bosses use. What makes
 * this fight its own thing is MOVEMENT, expressed entirely through the three
 * locations' abilities rather than through a bespoke rule:
 *
 *   Thebes   MOVE_HERE_CAPITAL   a card moving here earns +1 Capital next turn
 *   Red Sea  ANY_FREE_MOVE_AWAY  one card may leave here each turn
 *   Punt     MOVE_HERE_IP        a card moving here gains +1 IP
 *
 * Red Sea is the engine and the other two are the payoffs: park cards on the Red
 * Sea, then ferry one per turn into Punt for IP or Thebes for Capital.
 * Hatshepsut herself feeds the loop — her At Once drops a Merchant onto another
 * location, and the Merchant relocates every time an Economic card lands beside
 * it, so Merchants keep arriving at Punt/Thebes and collecting those bonuses.
 *
 * All three location keys are handled by SHARED engine code, not by this module:
 * MOVE_HERE_* is fired from game.js's applyMove (so EVERY mover triggers it) and
 * ANY_FREE_MOVE_AWAY is read by input.js's refreshMoveableCards. This module only
 * declares the locations; the rules live where every other battle can reuse them.
 *
 * SCOPE — MECHANIC + DECK + LOCATIONS ONLY. No encounter/win/loss dialogue and no
 * two-tier Serf/Giant track yet; both are a later pass. Outcomes fall through to
 * the engine's default scoreboard (proceed()), which is exactly what Narmer's
 * module did at the equivalent stage.
 *
 * Entry: SOG.HatshepsutBattle.start() (dev panel / console). The overworld
 * 'hatshepsut' node is NOT wired to this yet — that needs map-data.js, which is
 * out of scope here.
 */
window.SOG = window.SOG || {};
SOG.HatshepsutBattle = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[HatshepsutBattle] ' + msg); }

  /* ── Location ids (this battle only; one battle runs at a time, so the 12x
        block is free — Narmer uses 111-113, Hammurabi/HG use 101-103). ── */
  var LOC_THEBES  = 121;
  var LOC_RED_SEA = 122;
  var LOC_PUNT    = 123;

  /* ── Hatshepsut's 15. Every id below already existed EXCEPT 74/75, the two
        Natural Resources built for this fight:
          52 Hatshepsut · 74 Papyrus(Econ) · 75 Purple Dye · 900 Merchant ·
          56 Scribe(Egypt/Econ) · 59 Obelisk · 62 Hieroglyphics · 57 Pyramid ·
          64 Sphinx · 54 Papyrus(Scientific) · 65 Imhotep · 60 Khufu ·
          55 Farmer(Egypt) · 49 The Phoenicians(Meso) · 41 Canals(Meso)
        The deck is deliberately Economic-heavy: five Economic cards (74, 75,
        900, 56 and Hatshepsut's spawned Merchants) keep the Merchant trigger
        firing. Purple Dye is MESOPOTAMIAN on purpose — an Egypt Merchant's
        different-civilization bonus fires on it, but not on the Egyptian
        Papyrus, so the two resources play differently. ── */
  var AI_IDS = [52, 74, 75, 900, 56, 59, 62, 57, 64, 54, 65, 60, 55, 49, 41];

  /* ── The three locations. abilityKey is what activates the SHARED engine
        behaviour; abilityText is what the player reads on the board. ── */
  function _hatshepsutLocations() {
    return [
      {
        id: LOC_THEBES, name: 'Thebes', region: 'City of a Hundred Gates',
        abilityText: 'When a card moves here this turn, gain +1 Capital next turn.',
        abilityKey: 'MOVE_HERE_CAPITAL',
        image: 'images/locations/thebes.jpg', thumbnailCrop: null
      },
      {
        id: LOC_RED_SEA, name: 'The Red Sea', region: 'Trade Route to Punt',
        abilityText: 'You can move one card from here each turn.',
        abilityKey: 'ANY_FREE_MOVE_AWAY',
        image: 'images/locations/redsea.jpg', thumbnailCrop: null
      },
      {
        id: LOC_PUNT, name: 'Punt', region: 'Land of Incense',
        abilityText: 'When a card moves here, it gains +1 IP.',
        abilityKey: 'MOVE_HERE_IP',
        image: 'images/locations/punt.jpg', thumbnailCrop: null
      }
    ];
  }

  /* ══════════════════════════════════════════════════════════════
     DIALOGUE — ten named arrays, empty for now (Phase 2 stub; text is
     being drafted separately). Same shape and naming convention as
     Hammurabi/Hanging Gardens (OPENING_DIALOGUE/LOSS_DIALOGUE/
     TIE_DIALOGUE unprefixed, everything else HATSHEPSUT_-prefixed) —
     not Sargon's, whose LOSS_SMACK is shared between loss and tie; this
     battle gets the full ten distinct slots. Wired to the SCRIPT's
     onBattleStart/onWin/onLoss/onTie below via _runLinesIfAny, which
     no-ops instantly on an empty array (see js/game/dialogue-runner.js's
     runLines: an empty lines array hits showLine's `if (!line)` on the
     very first call and finishes synchronously) — so the battle is
     fully playable turn-to-turn with every array still empty; filling
     one in later needs no further wiring.
  ══════════════════════════════════════════════════════════════ */
  var OPENING_DIALOGUE      = [];
  var HATSHEPSUT_SERF_WIN_A = [];
  var HATSHEPSUT_SERF_WIN_B = [];
  var LOSS_DIALOGUE         = [];
  var TIE_DIALOGUE          = [];
  var HATSHEPSUT_GIANT_INTRO = [];
  var HATSHEPSUT_GIANT_WIN_A = [];
  var HATSHEPSUT_GIANT_WIN_B = [];
  var HATSHEPSUT_GIANT_LOSS  = [];
  var HATSHEPSUT_GIANT_DRAW  = [];

  /* ══════════════════════════════════════════════════════════════
     AI SELECTOR — the untiered fallback.
     Mirrors Narmer's: a plain capital-aware greedy selector kept as the
     bespoke option. In practice the TIER routing in ai.js sends play to the
     shared Serf/Giant brains (cfg.ai.tier below), so this runs only if the
     tier is ever cleared — same dormant-fallback shape every boss has.
     Light biases only: play the Natural Resources EARLY (their At Once buffs
     whatever is already standing, so they want company), hold the premium
     monuments for later, and spread rather than stack.
  ══════════════════════════════════════════════════════════════ */
  var RESOURCE_IDS = { 74: true, 75: true };
  var PREMIUM_IDS  = { 52: true, 60: true, 57: true, 62: true, 64: true };

  function hatshepsutSelectPlays(ctx) {
    var G       = ctx.G;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : 5;
    var hand    = ctx.hand.slice();
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, locId, 'ai') : card.cc;
    }

    var free = {}, count = {}, ownIP = {};
    G.locations.forEach(function (loc) {
      var s = (G.aiSlots && G.aiSlots[loc.id]) || [];
      free[loc.id]  = s.filter(function (x) { return x === null; }).length;
      count[loc.id] = s.filter(Boolean).length;
      ownIP[loc.id] = 0;
      s.forEach(function (x) { if (x) ownIP[loc.id] += (x.ip || 0) + (x.ipMod || 0) + (x.contMod || 0); });
    });

    // Weakest open location — spreads the AI across all three rather than stacking.
    function weakestOpen() {
      var best = null;
      G.locations.forEach(function (loc) {
        if (free[loc.id] <= 0) return;
        if (best === null || ownIP[loc.id] < ownIP[best]) best = loc.id;
      });
      return best;
    }

    var plays = [];
    for (var guard = 0; guard < 12; guard++) {
      if (capital <= 0 || !hand.length) break;
      var locId = weakestOpen();
      if (locId == null) break;

      var best = null, bestScore = -Infinity;
      for (var i = 0; i < hand.length; i++) {
        var c = cardById(hand[i]);
        if (!c || aiCost(c, locId) > capital) continue;
        var s = c.ip - c.cc * 0.1;
        if (RESOURCE_IDS[c.id]) s += 2 + count[locId];   // resources want company → play early, where cards already stand
        if (PREMIUM_IDS[c.id])  s += 1;
        if (c.id === 900)       s += 1.5;                // a Merchant on the board is a recurring engine
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (!best) break;

      plays.push({ cardId: best.id, locId: locId });
      capital -= aiCost(best, locId);
      free[locId]--; count[locId]++; ownIP[locId] += best.ip;
      hand.splice(hand.indexOf(best.id), 1);
    }
    log('AI plays: ' + JSON.stringify(plays) + ' (capital left ' + capital + ')');
    return plays;
  }

  /* ══════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════ */
  /* Tier from SAVE STATE, same derivation every other boss uses: SERF until the
     Serf flag is beaten, GIANT afterwards. Honest default matters — PLAY AGAIN
     rebuilds this config with __forceTier already consumed. */
  function _tierBeatenLocal(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }

  /* This particular play-through is the GIANT REMATCH (Serf beaten, Giant
     not yet) → the in-battle dominance intro (HATSHEPSUT_GIANT_INTRO)
     plays instead of the Serf opening. Reuses the exact same check
     buildHatshepsutConfig's own _aiTier derivation below already makes —
     this battle doesn't decouple AI difficulty from which tier's dialogue
     plays (same as Narmer; no separate flagTier concept needed here). */
  function _isGiantRematch() {
    return _tierBeatenLocal('hatshepsut', 'serf') && !_tierBeatenLocal('hatshepsut', 'giant');
  }

  function buildHatshepsutConfig() {
    var st = (window.SOG && SOG.state) || {};
    var _aiTier = _tierBeatenLocal('hatshepsut', 'serf') ? 'giant' : 'serf';
    return {
      structure: {
        turns:            5,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _hatshepsutLocations() } },
      // NO rules.advanceGate — this is a standard open board (contrast Narmer).
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', tier: _aiTier, movement: 'adventure',
                  settings: { selectPlays: hatshepsutSelectPlays } },
      presentation: {
        bodyClass:      'hatshepsut-battle',
        allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
        opponentAvatar: 'images/portraits/hatshepsutportrait.jpeg',
        popAlly:        true
      },
      rewards:  {},
      replay:   function () { start(); },
      scriptHook: 'hatshepsut'
    };
  }

  /* Fade the overworld radial-wipe cover out to reveal the board (mirrors
     Narmer's). A dev-menu launch has no cover, so this proceeds immediately. */
  function _fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl || !wipeEl.classList.contains('active')) { if (onDone) onDone(); return; }
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
      if (onDone) onDone();
      return;
    }
    gsap.to(wipeEl, {
      opacity: 0, duration: 0.45, ease: 'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  function _teardown() {
    document.body.classList.remove('hatshepsut-battle');
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* Shared bubble/typewriter/bleep engine (js/game/dialogue-runner.js) —
     same module every other boss uses, one instance per battle module.
     Bleep tone picked distinct from the others already in use (sargon 440,
     narmer 190, otzi 210, hammurabi/HG's own defaults) — 300 sits clear of
     all of them. runLines([], cb) finishes synchronously with nothing shown
     (see the dialogue-array comment above), which is what keeps every hook
     below safe to call with today's empty arrays. */
  var BLEEP_PROFILES = {
    hatshepsut: { freq: 300, wobble: 22, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer:   { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'hatshepsut',
    typeSpeedMs:       32
  });
  function runLines(lines, onAllDone) { _runner.runLines(lines, onAllDone); }
  function _runLinesIfAny(lines, onDone) {
    if (lines && lines.length) runLines(lines, onDone); else onDone();
  }

  // Captured once, at battle start, from _isGiantRematch() — NOT re-read
  // inside onWin/onLoss/onTie. game.js's endGame() stamps the tier-beaten
  // flag before those hooks fire, so re-querying _isGiantRematch() there
  // could see a DIFFERENT answer than the one that picked the opening/
  // giantIntro at battle start (a Serf win would flip it mid-battle) —
  // capturing keeps "which intro played" and "which outcome dialogue
  // plays" consistent for one battle instance.
  var _battleWasGiantRematch = false;

  var _dialogueActive = false;

  /* ══════════════════════════════════════════════════════════════
     SCRIPT — every outcome plays its tier-appropriate dialogue (today: all
     ten arrays are empty, so this reduces to _teardown() + proceed(), same
     as before) then calls proceed() so the ENGINE's default scoreboard
     handles win/loss/tie. No reward grant here — rewards stays {} in
     buildHatshepsutConfig, unchanged; this is dialogue wiring only.
  ══════════════════════════════════════════════════════════════ */
  var HATSHEPSUT_SCRIPT = {
    onIntro: function (ctx, done) {
      var p = ctx.config && ctx.config.presentation;
      if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _battleWasGiantRematch = _isGiantRematch();
      _fadeOutCover(function () {
        _dialogueActive = true;
        var finish = function () { _dialogueActive = false; done(); };
        // GIANT rematch → in-battle dominance intro instead of the Serf
        // opening tutorial (mirrors every other two-tier boss).
        if (_battleWasGiantRematch) _runLinesIfAny(HATSHEPSUT_GIANT_INTRO, finish);
        else                        _runLinesIfAny(OPENING_DIALOGUE, finish);
      });
    },

    isInputBlocked: function () { return _dialogueActive; },

    onWin: function (ctx, result, proceed) {
      var linesA = _battleWasGiantRematch ? HATSHEPSUT_GIANT_WIN_A : HATSHEPSUT_SERF_WIN_A;
      var linesB = _battleWasGiantRematch ? HATSHEPSUT_GIANT_WIN_B : HATSHEPSUT_SERF_WIN_B;
      _runLinesIfAny(linesA, function () {
        _runLinesIfAny(linesB, function () { _teardown(); proceed(); });
      });
    },
    onLoss: function (ctx, result, proceed) {
      _runLinesIfAny(_battleWasGiantRematch ? HATSHEPSUT_GIANT_LOSS : LOSS_DIALOGUE, function () {
        _teardown(); proceed();
      });
    },
    onTie: function (ctx, result, proceed) {
      _runLinesIfAny(_battleWasGiantRematch ? HATSHEPSUT_GIANT_DRAW : TIE_DIALOGUE, function () {
        _teardown(); proceed();
      });
    }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hatshepsut', HATSHEPSUT_SCRIPT);
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  function start() {
    log('start() → initGame(buildHatshepsutConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHatshepsutConfig());
  }

  return {
    start:                  start,
    buildHatshepsutConfig:  buildHatshepsutConfig,
    teardown:               _teardown,
    LOC: { THEBES: LOC_THEBES, RED_SEA: LOC_RED_SEA, PUNT: LOC_PUNT }
  };
})();

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
 * SCOPE — MECHANIC + DECK + LOCATIONS + REWARD ECONOMY, DIALOGUE TEXT STILL
 * EMPTY. The two-tier Serf/Giant reward gate (SOG.rewards, 20 gold Serf / 30
 * gold + the Hatshepsut card on Giant) and all ten named dialogue arrays are
 * wired; the arrays themselves have no lines in them yet — that, the overworld
 * encounter, and the Narmer-transition/Merchant-intervention cutscenes are a
 * later pass. Every outcome still ultimately calls proceed() so the engine's
 * default scoreboard handles win/loss/tie, same as Narmer's module did at the
 * equivalent stage.
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

  /* ── Two-tier reward economy — mirrors Narmer's richer-than-default scale
        (his file's own comment: GOLD_SERF_WIN 20 / GOLD_GIANT_WIN 30 + card,
        deliberately above every other boss's flat 15/15). SOG.rewards.consume
        only decides WHETHER a reward fires (firstTierWin/grantCard) — the
        AMOUNTS below are this boss's own, read by _grantGold's caller, not
        SOG.rewards' generic GOLD_PER_TIER. ── */
  var HATSHEPSUT_CARD_ID      = 52;
  var HATSHEPSUT_GOLD_SERF_WIN  = 20;
  var HATSHEPSUT_GOLD_GIANT_WIN = 30;

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

  /* Generic localStorage flag helpers — same shape as every other boss's
     private _has/_set (Narmer, Sargon, Otzi, ...), not shared, on purpose:
     one file, one tiny wrapper, no cross-module dependency for two lines. */
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  // In-battle intro: first-time only, same convention as
  // KEY_HAMMURABI_OPENING_SEEN / KEY_OTZI_OPENING_SEEN. Without this, every
  // Serf encounter (including replays after a loss) would replay the full
  // OPENING_DIALOGUE from the top.
  var KEY_HATSHEPSUT_OPENING_SEEN = 'sog_hatshepsut_opening_seen';

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

  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  /* Grant Hatshepsut's card (52) via the SHARED acquisition reveal — FIRST WIN
     ONLY (SOG.Cards.unlock returns truthy only on a new unlock). Mirrors
     Narmer's _grantNarmerCard exactly. */
  function _grantHatshepsutCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') newly = !!SOG.Cards.unlock([HATSHEPSUT_CARD_ID]);
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === HATSHEPSUT_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Gold reward — amount is the CALLER's (HATSHEPSUT_GOLD_SERF_WIN/_GIANT_WIN
     above), not SOG.rewards' own GOLD_PER_TIER. Coin-drop animation mirrors
     Narmer's _runGoldRewardAnimation byte-for-byte except the overlay id. */
  function _grantGold(amount, done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(amount, function () { if (done) done(); });
  }
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'hatshepsut-gold-reward';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;pointer-events:none;';
    var dim = document.createElement('div');
    dim.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.80);transition:opacity 0.4s ease;';
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;' +
      'transform:translateY(-110px);transition:opacity 0.45s ease, transform 0.7s cubic-bezier(0.2,0.9,0.3,1);';
    var coin = document.createElement('img');
    coin.src = 'images/ui_images/coin.png'; coin.alt = ''; coin.draggable = false;
    coin.style.cssText = 'width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6));';
    var label = document.createElement('div');
    label.textContent = amount + ' Gold';
    label.style.cssText = 'font-family:var(--font, sans-serif);font-size:46px;font-weight:bold;color:#f3d574;' +
      '-webkit-text-stroke:2px #1a0a04;' +
      'text-shadow:-2px -2px 0 #1a0a04, 2px -2px 0 #1a0a04, -2px 2px 0 #1a0a04, 2px 2px 0 #1a0a04, 0 4px 6px rgba(0,0,0,0.55);';
    box.appendChild(coin); box.appendChild(label);
    overlay.appendChild(dim); overlay.appendChild(box);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void box.offsetHeight;
    box.style.opacity = '1'; box.style.transform = 'translateY(0)';
    setTimeout(function () { _playSfx('sfx/demedici-money.mp3'); }, 300);
    setTimeout(function () {
      box.style.transition = 'opacity 0.4s ease';
      box.style.opacity = '0'; dim.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 420);
    }, 1900);
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

  /* First-time-only battle intro — mirrors Narmer's _runOpeningDialogue.
     KEY_HATSHEPSUT_OPENING_SEEN gates it so a Serf replay (after a loss, or
     after already winning) never re-plays OPENING_DIALOGUE; only the very
     first Serf encounter does. Sets the flag right after the lines finish,
     not before — so a page reload mid-dialogue doesn't skip it next time. */
  function _runOpeningDialogue(onComplete) {
    if (_has(KEY_HATSHEPSUT_OPENING_SEEN)) { if (onComplete) onComplete(); return; }
    _runLinesIfAny(OPENING_DIALOGUE, function () {
      _set(KEY_HATSHEPSUT_OPENING_SEEN);
      if (onComplete) onComplete();
    });
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
     ten arrays are empty, so this reduces to the reward grant, if any, plus
     _teardown() + proceed()) then calls proceed() so the ENGINE's default
     scoreboard handles win/loss/tie. onWin grants gold/card via SOG.rewards
     (script-owned, like every other boss — buildHatshepsutConfig's own
     `rewards: {}` stays empty and unused, same as Narmer's).
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
        // opening tutorial (mirrors every other two-tier boss). The Giant
        // intro has no seen-gate of its own — same convention as every
        // other boss's giantIntro, which plays once per Giant ENTRY
        // (Giant is a single rematch, not a repeatable tutorial).
        if (_battleWasGiantRematch) _runLinesIfAny(HATSHEPSUT_GIANT_INTRO, finish);
        else                        _runOpeningDialogue(finish);
      });
    },

    isInputBlocked: function () { return _dialogueActive; },

    /* Two-tier reward gate (SOG.rewards): the one-shot snapshot game.js's
       endGame() stages BEFORE stamping sog_node_hatshepsut_<tier>_beaten —
       reading _tierBeatenLocal directly here would see the post-stamp value
       and misread the actual first win. grantCard implies firstTierWin &&
       tier==='giant' (SOG.rewards' own contract), so the three branches below
       are mutually exclusive: first Giant win → card+gold; first Serf win →
       gold only; anything else (a replay of an already-beaten tier) → dialogue
       only, zero reward (anti-farming). Mirrors Narmer's _onWin exactly,
       amounts are this boss's own (20/30, see HATSHEPSUT_GOLD_* above). */
    onWin: function (ctx, result, proceed) {
      var r = (window.SOG && SOG.rewards)
            ? SOG.rewards.consume('hatshepsut')
            : { firstTierWin: true, tier: _battleWasGiantRematch ? 'giant' : 'serf', grantCard: _battleWasGiantRematch };
      var finishToScoreboard = function () { _teardown(); proceed(); };
      if (r.grantCard) {
        // FIRST GIANT win — card, THEN gold, split around the "Take this" beat.
        _runLinesIfAny(HATSHEPSUT_GIANT_WIN_A, function () {
          _grantHatshepsutCard(function () {
            _grantGold(HATSHEPSUT_GOLD_GIANT_WIN, function () {
              _runLinesIfAny(HATSHEPSUT_GIANT_WIN_B, finishToScoreboard);
            });
          });
        });
      } else if (r.firstTierWin) {
        // FIRST SERF win — gold only, no card.
        _runLinesIfAny(HATSHEPSUT_SERF_WIN_A, function () {
          _grantGold(HATSHEPSUT_GOLD_SERF_WIN, function () {
            _runLinesIfAny(HATSHEPSUT_SERF_WIN_B, finishToScoreboard);
          });
        });
      } else {
        // Replay of an already-beaten tier — dialogue only, zero reward.
        var linesA = _battleWasGiantRematch ? HATSHEPSUT_GIANT_WIN_A : HATSHEPSUT_SERF_WIN_A;
        var linesB = _battleWasGiantRematch ? HATSHEPSUT_GIANT_WIN_B : HATSHEPSUT_SERF_WIN_B;
        _runLinesIfAny(linesA, function () { _runLinesIfAny(linesB, finishToScoreboard); });
      }
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

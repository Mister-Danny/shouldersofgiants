/**
 * sog-adventure-hammurabi.js — SOG.HammurabiBattle (Phase D4+, STAGE 2).
 *
 * A SCRIPTED capital battle (scriptHook: 'hammurabi'), mirroring SOG.SargonBattle.
 * This is the third boss (after Gilgamesh and Sargon). Its wrinkle is THREE
 * locations that each carry a per-location ability (the engine keys built in
 * Stage 1, all SYMMETRIC):
 *   • Banks of the Euphrates (left)   → LABOR_PLUS_2_HERE    (Labor cards +2 IP here)
 *   • The Fertile Crescent (center)   → CAPITAL_WHEN_FULL    (+1 capital next turn when a side is full)
 *   • Banks of the Tigris (right)     → MILITARY_PLUS_1_HERE (Military cards +1 IP here)
 *
 * STAGE 2 scope: the battle MODULE + CONFIG only. The location abilities FIRE
 * (the engine keys do the work), but their text is NOT shown yet — abilityText is
 * '' (Stage 3 = nameplate display; Stage 4 = the shake-reveal that populates it).
 * The registered 'hammurabi' script is MINIMAL: presentation (body class / screen /
 * avatars / cover-fade) + teardown only. The opening dialogue + shake-reveal come
 * in Stage 4; win/loss/reward come in Stage 5 — those hooks are STUBS here (they
 * fall through to the engine's default scoreboard).
 *
 * Hammurabi's card (id 47, "Eye For An Eye") sits in the AI deck and will be the
 * Stage-5 victory reward.
 */
window.SOG = window.SOG || {};
SOG.HammurabiBattle = (function () {
  'use strict';

  function log(msg) { console.log('[HammurabiBattle] ' + msg); }
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }

  // Set on the first Hammurabi victory (Stage 5 will set it). Drives the
  // post-win encounter-skip + scoreboard later — read-only stub for now.
  var KEY_HAMMURABI_COMPLETE = 'sog_battle_hammurabi_complete';

  // ── Hammurabi's AI deck (ids). PLACEHOLDER 15-card Mesopotamia boss deck that
  //    INCLUDES Hammurabi (47). Finalized 15-card list:
  //    40 Scribe, 41 Canals, 42 Soldier, 43 Gilgamesh, 44 Enkidu, 45 Ziggurat,
  //    46 Cuneiform, 47 Hammurabi, 48 Chariot, 49 The Phoenicians, 37 Sargon,
  //    38 Priest, 39 Farmer, 31 Megalith, 32 Domesticated Animal.
  var HAMMURABI_AI_IDS = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 37, 38, 39, 31, 32];

  // ── Presentation (Hammurabi portrait + a hammurabi-battle body class). The body
  //    class supplies the location backgrounds (PLACEHOLDER art for now — see the
  //    CSS note below) and does NOT hide the hand / CC overlays.
  var HAMMURABI_PRESENTATION = {
    bodyClass:      'hammurabi-battle',
    allyAvatar:     'images/femaleexplorer%20portrait.jpeg',
    opponentAvatar: 'images/portraits/hammurabi.jpg',
    popAlly:        true
  };

  // ── The 3 NEW locations (own ids 101/102/103 so they don't collide with the
  //    real locations or the Sargon/Gilgamesh battles). Each carries its Stage-1
  //    ability key. abilityText is '' on purpose this stage (Stage 4's shake-reveal
  //    populates it; Stage 3 styles the nameplate area).
  //    Left = Euphrates, center = Fertile Crescent, right = Tigris.
  //
  //    PLACEHOLDER BACKGROUNDS: the `image` paths + the body.hammurabi-battle CSS
  //    (style.css) reuse the Sargon Mesopotamia art for now. Swap these three
  //    (uppersea/akkad/lowersea) for the real Euphrates/Crescent/Tigris art when
  //    it lands — change the `image` field here AND the data-loc-id CSS rules.
  function _hammurabiLocations() {
    return [
      { id: 101, name: 'Banks of the Euphrates', region: 'Mesopotamia', abilityText: 'Labor cards gain +2 IP.',                     abilityKey: 'LABOR_PLUS_2_HERE',    image: 'images/locations/uppersea.jpg', thumbnailCrop: null },
      { id: 102, name: 'The Fertile Crescent',   region: 'Mesopotamia', abilityText: '+1 Capital next turn when full.', abilityKey: 'CAPITAL_WHEN_FULL',    image: 'images/locations/akkad.jpg',    thumbnailCrop: null },
      { id: 103, name: 'Banks of the Tigris',    region: 'Mesopotamia', abilityText: 'Military cards gain +1 IP.',                  abilityKey: 'MILITARY_PLUS_1_HERE', image: 'images/locations/lowersea.jpg', thumbnailCrop: null }
    ];
  }

  /* ── Presentation helpers (mirror Sargon) ─────────────────────────── */
  function _applyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass) document.body.classList.add(p.bodyClass);
  }

  /* Fade the overworld radial-wipe cover out to reveal the board. */
  function fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onDone) onDone(); return; }
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

  /* Battle-exit teardown — removes the body class so it can't leak into a later
     battle, restores avatars, clears any lingering wipe. (Stage 4/5 will extend
     this for bubbles / popups.) */
  function _hammurabiTeardown() {
    document.body.classList.remove('hammurabi-battle');
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') {
      SOG.HUD.restoreBattleAvatars();
    }
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* Outcome STUB (Stage 5 replaces with the real scoreboard + reward). End the
     battle on the engine's DEFAULT scoreboard, then tear the presentation down once
     the result screen has covered the board (so the body class can't leak). */
  function _outcomeStub(proceed) {
    if (proceed) proceed();
    setTimeout(_hammurabiTeardown, 1300);
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE 4 — location-ability shake-reveal
     ──────────────────────────────────────────────────────────────
     The battle opens showing NAMES ONLY: the ability text is already in the
     nameplate DOM (.battle-loc-ability, populated from each location's
     abilityText), but held at opacity 0 — so its HEIGHT is reserved and nothing
     shifts when it appears. On the opening beat each nameplate SHAKES (left→right
     stagger) and its ability line fades in, then stays for the rest of the battle.
  ══════════════════════════════════════════════════════════════ */
  var _revealActive = false;   // input blocked while the shake-reveal beat plays
  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }
  function _hideLocationAbilities() {
    var els = document.querySelectorAll('.battle-location .battle-loc-ability');
    Array.prototype.forEach.call(els, function (el) { el.style.opacity = '0'; });
  }
  function _revealLocationAbilities(onDone) {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.battle-location'));
    if (!tiles.length) { if (onDone) onDone(); return; }
    tiles.forEach(function (tile, i) {
      var delay = i * 0.14;                                   // left → right stagger
      var ab    = tile.querySelector('.battle-loc-ability');
      // A stone-stamp as each law is struck into the Code (swappable / removable).
      setTimeout(function () { try { new Audio('sfx/cuneiformstamp.mp3').play(); } catch (e) {} }, delay * 1000);
      if (typeof gsap !== 'undefined') {
        gsap.timeline({ delay: delay })
          .to(tile, { x: -5, duration: 0.05, ease: 'none' })
          .to(tile, { x:  5, duration: 0.06, ease: 'none' })
          .to(tile, { x: -3, duration: 0.05, ease: 'none' })
          .to(tile, { x:  3, duration: 0.05, ease: 'none' })
          .to(tile, { x:  0, duration: 0.05, ease: 'none' });
        if (ab) gsap.fromTo(ab, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: delay });
      } else if (ab) {
        ab.style.opacity = '1';
      }
    });
    setTimeout(function () { if (onDone) onDone(); }, 1000);   // after the last shake + fade
  }

  /* ══════════════════════════════════════════════════════════════
     HAMMURABI SCRIPT — registered as 'hammurabi'
  ══════════════════════════════════════════════════════════════ */
  var HAMMURABI_SCRIPT = {
    // Pre-board: context body class + switch to the battle screen under the
    // overworld's radial-wipe cover (onBattleStart fades it).
    onIntro: function (ctx, done) {
      _applyPresentationClasses(ctx.config && ctx.config.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    // Board built + hands dealt by the engine; apply the Hammurabi avatars, open
    // with NAMES ONLY, then on a beat shake the nameplates + reveal the ability
    // text (Stage 4). Turn 1 is gated until the reveal finishes.
    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _hideLocationAbilities();              // names only (text held at opacity 0)
      _disableButtons();
      _revealActive = true;                  // block plays/drags through the reveal
      fadeOutCover(function () {
        setTimeout(function () {             // brief beat on the names, then reveal the Code
          _revealLocationAbilities(function () {
            _revealActive = false;
            _enableButtons();
            done();
          });
        }, 700);
      });
    },

    // Block plays/drags while the opening shake-reveal beat is on screen.
    isInputBlocked: function (ctx) { return !!_revealActive; },

    // Win/loss/tie — STUBS (Stage 5). Default scoreboard + teardown.
    onWin:  function (ctx, result, proceed) { _outcomeStub(proceed); },   // TODO Stage 5: scoreboard + grant card 47 + gold
    onLoss: function (ctx, result, proceed) { _outcomeStub(proceed); },   // TODO Stage 5: loss flow
    onTie:  function (ctx, result, proceed) { _outcomeStub(proceed); }    // TODO Stage 5: tie flow
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hammurabi', HAMMURABI_SCRIPT);
  }

  /* Capital-aware AI selector behind game.js's 'heuristic' seam. Greedily plays
     the highest-IP affordable cards until the per-turn capital budget runs out.
     KEY DIFFERENCE from Sargon: the budget is ctx.capital — the value ai.js
     already computed as (CAPITAL + G.aiBonusCapitalNextTurn) with the accumulator
     then zeroed — so the AI actually SPENDS the Fertile-Crescent (CAPITAL_WHEN_FULL)
     bonus capital it earned. Falls back to config.resource.capital if ctx.capital
     is absent. (Sargon's selector reads the static config value and ignores it.) */
  function hammurabiSelectPlays(ctx) {
    var G   = ctx.G;
    var baseCap = (G.config && G.config.resource && typeof G.config.resource.capital === 'number')
      ? G.config.resource.capital : 5;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : baseCap;
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }

    var hand      = G.aiHand.slice();
    var simFilled = {};   // locId → placements simulated this turn (so we don't over-fill a slot)
    function slotsLeft(locId) {
      var arr = G.aiSlots[locId] || [], open = 0;
      for (var i = 0; i < arr.length; i++) if (arr[i] === null) open++;
      return open - (simFilled[locId] || 0);
    }

    var plays = [], guard = 0;
    while (guard++ < 24) {
      // Affordable cards still in hand (cc ≤ remaining capital).
      var aff = [];
      for (var h = 0; h < hand.length; h++) {
        var c = cardById(hand[h]);
        if (c && c.cc <= capital) aff.push(c);
      }
      if (!aff.length) break;
      var openLocs = G.locations.filter(function (loc) { return slotsLeft(loc.id) > 0; });
      if (!openLocs.length) break;

      aff.sort(function (a, b) { return (b.ip - a.ip) || (b.cc - a.cc); });   // strongest first
      var pick = aff[0];
      var locId = openLocs[0].id;

      plays.push({ cardId: pick.id, locId: locId });
      capital -= pick.cc;
      simFilled[locId] = (simFilled[locId] || 0) + 1;
      var idx = hand.indexOf(pick.id);
      if (idx !== -1) hand.splice(idx, 1);
    }
    return plays;
  }

  /* The Hammurabi battle config — Arcadium-style capital battle with the three
     ability-carrying locations. Mirrors buildSargonConfig. */
  function buildHammurabiConfig() {
    var st = (window.SOG && SOG.state) || {};
    return {
      // Arcadium-style structure: 4 turns, 3 locations, standard slots/hands.
      structure: {
        turns:            4,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },   // capital ON, 5/turn
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },                // the player's built 15-card deck
        ai:     { source: 'explicit', ids: HAMMURABI_AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _hammurabiLocations() } },
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', movement: 'adventure', settings: { selectPlays: hammurabiSelectPlays } },
      presentation: HAMMURABI_PRESENTATION,
      rewards:  {},                 // none yet — card-47 grant + gold come in Stage 5
      scriptHook: 'hammurabi'       // scripted battle (presentation now; dialogue/scoreboard in Stage 4/5)
    };
  }

  /* Entry point (called by overworld _launchHammurabiBattle after the radial wipe
     covers the screen). The 'hammurabi' script owns presentation via its hooks;
     here we only kick off the engine's build (which fires onIntro → onBattleStart). */
  function start() {
    log('start() → initGame(buildHammurabiConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHammurabiConfig());
  }

  function isBattleComplete() { return _has(KEY_HAMMURABI_COMPLETE); }

  return {
    start:                start,
    buildHammurabiConfig: buildHammurabiConfig,
    isBattleComplete:     isBattleComplete,
    teardown:             _hammurabiTeardown
  };
})();

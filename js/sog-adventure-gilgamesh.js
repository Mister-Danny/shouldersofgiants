/**
 * sog-adventure-gilgamesh.js
 * Shoulders of Giants — Adventure Mode: Gilgamesh Battle 1 (Phase D3a)
 *
 * Real battle, cloned from the Otzi battle (sog-adventure-otzi.js) — same
 * adventure-battle engine (G.otziMode: no CC, 2 cards/turn, 4 turns), with
 * Gilgamesh-specific data. SOG.GilgameshBattle.start() is called by
 * overworld.js after the Walls-of-Uruk encounter dialogue.
 *
 * Decks (each side shuffles, draws 4, 8/5 remain):
 *   Player: 11 Prehistory cards (26-36); +Cuneiform(46) once granted (12).
 *   Gilgamesh AI (9, NO Enkidu / NO Cuneiform):
 *     Priest(38) Farmer(39) Scribe(40) Canals(41) Soldier(42)
 *     Gilgamesh(43) Ziggurat(45) Chariot(48) The Phoenicians(49)
 *
 * Locations (left→right): Cedar Forest · Uruk (center) · Mount Mashu.
 *   No location abilities. (Placeholder art — swap when Mesopotamia
 *   battle backgrounds exist.)
 *
 * State flags:
 *   sog_cuneiform_granted          — set when Cuneiform is awarded
 *   sog_gilgamesh_phase1_complete  — set on Battle 1 victory (D3b trigger)
 *   sog_battle_gilgamesh_complete  — declared, NOT set here (D3b/Battle 2)
 */

var SOG = window.SOG || {};

SOG.GilgameshBattle = (function () {
  'use strict';

  /* ── localStorage keys ──────────────────────────────────────── */
  var KEY_BATTLE_GILGAMESH_COMPLETE = 'sog_battle_gilgamesh_complete'; // set in D3b
  var KEY_PHASE1_COMPLETE           = 'sog_gilgamesh_phase1_complete';
  var KEY_CUNEIFORM_GRANTED         = 'sog_cuneiform_granted';

  /* ── Deck IDs ────────────────────────────────────────────────── */
  var PREHISTORY_IDS   = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]; // 11
  var GILGAMESH_AI_IDS = [38, 39, 40, 41, 42, 43, 45, 48, 49];         // 9 Mesopotamia

  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }

  // Player's pool: 11 Prehistory, +Cuneiform(46) once granted.
  function buildPlayerDeck() {
    var ids = PREHISTORY_IDS.slice();
    if (_has(KEY_CUNEIFORM_GRANTED)) ids.push(46);
    return ids;
  }

  /* ── Timing ──────────────────────────────────────────────────── */
  var TYPE_SPEED_MS = 32;
  var TOTAL_TURNS   = 4;

  /* ── Logging ─────────────────────────────────────────────────── */
  function log(msg) { console.log('[Adventure/Gilgamesh] ' + msg); }

  /* ── Web Audio bleeps ────────────────────────────────────────── */
  var _bleepCtx = null;
  function getBleepCtx() {
    if (_bleepCtx) return _bleepCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _bleepCtx = new Ctx();
    } catch (e) {}
    return _bleepCtx;
  }

  var BLEEP_PROFILES = {
    otzi:     { freq: 210, wobble: 20, wave: 'triangle', peak: 0.07, decay: 0.07, dur: 0.08, every: 2 },
    explorer: { freq: 520, wobble: 30, wave: 'square',   peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };

  function playBleep(who) {
    var ctx = getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
    var now = ctx.currentTime;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var freq = p.freq + (Math.random() - 0.5) * p.wobble;
    osc.type = p.wave;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0,        now);
    gain.gain.linearRampToValueAtTime(p.peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
  }

  /* ── Fisher-Yates shuffle (in-place) ────────────────────────── */
  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ── Bubble helpers ──────────────────────────────────────────── */
  function getBubbleEl(who) {
    return document.getElementById('adv-bubble-' + who);
  }

  function hideBubbles() {
    ['otzi', 'explorer'].forEach(function (who) {
      var el = getBubbleEl(who);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }

  /* ── Dialogue runner (click-to-advance typewriter) ───────────── */
  var _dlg = {
    lines:        null,
    lineIdx:      0,
    isTyping:     false,
    timer:        null,
    fullText:     '',
    textEl:       null,
    activeEl:     null,
    clickHandler: null,
    onAllDone:    null
  };

  function runLines(lines, onAllDone) {
    _dlg.lines     = lines;
    _dlg.lineIdx   = 0;
    _dlg.onAllDone = onAllDone;

    _dlg.clickHandler = function (e) {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      advanceLine();
    };
    // Defer so the click that ended the previous phase doesn't skip line 1.
    setTimeout(function () {
      document.addEventListener('click',   _dlg.clickHandler);
      document.addEventListener('keydown', _dlg.clickHandler);
    }, 0);

    showLine();
  }

  function showLine() {
    var line = _dlg.lines[_dlg.lineIdx];
    if (!line) { finishRunner(); return; }

    // Hide the other speaker's bubble
    var other = (line.who === 'otzi') ? 'explorer' : 'otzi';
    var otherEl = getBubbleEl(other);
    if (otherEl) otherEl.classList.remove('is-visible', 'is-ready');

    var el     = getBubbleEl(line.who);
    if (!el)     { _dlg.lineIdx++; showLine(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { _dlg.lineIdx++; showLine(); return; }

    textEl.textContent = '';
    el.classList.add('is-visible');
    el.classList.remove('is-ready');

    _dlg.fullText = line.text;
    _dlg.textEl   = textEl;
    _dlg.isTyping = true;
    _dlg.activeEl = el;

    var i = 0, bleepCount = 0;
    if (_dlg.timer) clearInterval(_dlg.timer);
    _dlg.timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
      var c = line.text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.otzi;
        bleepCount++;
        if (bleepCount >= p.every) { bleepCount = 0; playBleep(line.who); }
      }
      if (i >= line.text.length) {
        clearInterval(_dlg.timer);
        _dlg.timer    = null;
        _dlg.isTyping = false;
        el.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  function advanceLine() {
    if (_dlg.isTyping) {
      if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
      if (_dlg.textEl) _dlg.textEl.textContent = _dlg.fullText;
      _dlg.isTyping = false;
      if (_dlg.activeEl) _dlg.activeEl.classList.add('is-ready');
      return;
    }
    _dlg.lineIdx++;
    if (_dlg.lineIdx >= _dlg.lines.length) { finishRunner(); return; }
    showLine();
  }

  function finishRunner() {
    if (_dlg.clickHandler) {
      document.removeEventListener('click',   _dlg.clickHandler);
      document.removeEventListener('keydown', _dlg.clickHandler);
      _dlg.clickHandler = null;
    }
    if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
    _dlg.isTyping = false;
    hideBubbles();
    var onDone    = _dlg.onAllDone;
    _dlg.onAllDone = null;
    _dlg.lines     = null;
    if (onDone) onDone();
  }

  /* ── Turn counter ────────────────────────────────────────────── */
  function setTurnCounter(current, total) {
    var capEl  = document.getElementById('battle-capital-info');
    if (capEl)  capEl.textContent  = 'Turn ' + current + ' / ' + total;
    var turnEl = document.getElementById('battle-turn-info');
    if (turnEl) turnEl.textContent = '';
  }

  /* ── Board setup ─────────────────────────────────────────────── */
  function setupBattleBoard() {
    log('setupBattleBoard()');

    var G = SOG.state.G;

    // Gilgamesh's three locations — no abilities. Placeholder art (reusing
    // existing biome images) until Mesopotamia battle backgrounds exist.
    var cedar = { id: 8, name: 'Cedar Forest', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/scandinavia.jpg',    thumbnailCrop: null };
    var uruk  = { id: 7, name: 'Uruk',         region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/levant.jpg',         thumbnailCrop: null };
    var mashu = { id: 2, name: 'Mount Mashu',  region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/capeofgoodhope.jpg', thumbnailCrop: null };

    // Order: Cedar Forest (left) · Uruk (center) · Mount Mashu (right)
    G.locations = [cedar, uruk, mashu];

    G.playerSlots = {};
    G.aiSlots     = {};
    G.locations.forEach(function (loc) {
      G.playerSlots[loc.id] = [null, null, null, null];
      G.aiSlots[loc.id]     = [null, null, null, null];
    });

    // Shuffle decks + deal initial hands (4 each)
    var playerDeck    = shuffleInPlace(buildPlayerDeck());
    G.playerHand      = playerDeck.splice(0, 4);
    G.playerDeck      = playerDeck;

    var gilgameshDeckArr   = shuffleInPlace(GILGAMESH_AI_IDS.slice());
    G.aiHand          = gilgameshDeckArr.splice(0, 4);
    G.aiDeck          = gilgameshDeckArr;

    // Minimal G state (mirrors Prehistory's setupBattleBoard pattern)
    G.turn                  = 1;
    G.phase                 = 'select';
    G.capital               = 0;
    G.turnStartCapital      = 0;
    G.otziMode              = true;
    G.otziCardsPlayed       = 0;
    G.prehistoryMode        = false;
    G.playerFirst           = true;
    G.bonusCapitalNextTurn  = 0;
    G.aiBonusCapitalNextTurn = 0;
    G.cardIPBonus           = {};
    G.aiCardIPBonus         = {};
    G.destroyedIPTotal      = 0;
    G.aiDestroyedIPTotal    = 0;
    G.movedThisTurn         = {};
    G.aiMovedThisTurn       = {};
    G.moveLog               = [];
    G.playerActionLog       = [];
    G.aiActionLog           = [];
    G.locationSnapshots     = {};
    G.reservedSlotsPerLoc   = {};
    G.deferredPlays         = {};
    G.prehistoryHasPlayed   = false;
    G.playerRevealQueue     = [];
    G.aiRevealQueue         = [];

    // Build board DOM with all 3 locations
    if (typeof window.initBattleUI === 'function') {
      window.initBattleUI(G.locations);
    }

    // Immediately park Desert and GRV columns off-screen; they slide
    // in from the edges after the screen shake during dialogue.
    if (typeof gsap !== 'undefined') {
      var boardEl = document.getElementById('battle-board');
      if (boardEl) {
        var desertCol = boardEl.querySelector('[data-loc-id="8"]');
        var grvCol    = boardEl.querySelector('[data-loc-id="2"]');
        if (desertCol) gsap.set(desertCol, { x: -600, opacity: 0 });
        if (grvCol)    gsap.set(grvCol,    { x:  600, opacity: 0 });
      }
    }

    // Build player hand DOM (CSS hides it via otzi-pre-deal until card deal)
    if (window.SOG && SOG.input && typeof SOG.input.rebuildPlayerHand === 'function') {
      SOG.input.rebuildPlayerHand();
    } else if (typeof window.setPlayerHand === 'function') {
      window.setPlayerHand(G.playerHand, G.playerDeck.length);
    }

    // Sync opp-hand display with G state (4 face-down + deck 6)
    if (window.SOG && SOG.ui && typeof SOG.ui.updateOppHand === 'function') {
      SOG.ui.updateOppHand();
    }

    setTurnCounter(1, TOTAL_TURNS);

    // Restore reset button (tutorial.js may have hidden it)
    var resetBtn = document.getElementById('battle-reset-turn');
    if (resetBtn) resetBtn.style.display = '';
  }

  /* ── Explorer avatar management ──────────────────────────────── */
  function applyExplorerAvatar() {
    var img = document.querySelector('.battle-avatar-lucy .battle-avatar-frame img');
    if (!img) return;
    if (typeof img.dataset.origSrc === 'undefined') img.dataset.origSrc = img.src;
    img.src = 'images/femaleexplorer%20portrait.jpeg';
    var avEl = document.querySelector('.battle-avatar-lucy');
    if (avEl) avEl.classList.add('adv-active');
  }

  function restoreExplorerAvatar() {
    var img = document.querySelector('.battle-avatar-lucy .battle-avatar-frame img');
    if (!img) return;
    if (img.dataset.origSrc) img.src = img.dataset.origSrc;
    var avEl = document.querySelector('.battle-avatar-lucy');
    if (avEl) avEl.classList.remove('adv-active');
  }

  /* ── Fade out the radial wipe cover ──────────────────────────── */
  function fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onDone) onDone(); return; }
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
      if (onDone) onDone();
      return;
    }
    gsap.to(wipeEl, {
      opacity:  0,
      duration: 0.45,
      ease:     'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active');
        wipeEl.style.opacity  = '';
        wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  /* ── Camera shake (same rumble as Prehistory) ────────────────── */
  function shakeCamera(onDone) {
    var el = document.getElementById('screen-battle');
    if (!el || typeof gsap === 'undefined') {
      setTimeout(function () { if (onDone) onDone(); }, 300);
      return;
    }
    var tl = gsap.timeline({
      onComplete: function () {
        gsap.set(el, { x: 0, y: 0 });
        if (onDone) onDone();
      }
    });
    tl.to(el, { x: -10, y:  4, duration: 0.05, ease: 'none' })
      .to(el, { x:  10, y: -4, duration: 0.06, ease: 'none' })
      .to(el, { x:  -7, y:  3, duration: 0.05, ease: 'none' })
      .to(el, { x:   5, y: -2, duration: 0.05, ease: 'none' })
      .to(el, { x:   0, y:  0, duration: 0.05, ease: 'none' });
  }

  /* ── Slide Desert (left) and GRV (right) into view ───────────── */
  function revealSideLocations(onDone) {
    var boardEl = document.getElementById('battle-board');
    if (!boardEl || typeof gsap === 'undefined') {
      if (onDone) onDone();
      return;
    }
    var desertCol = boardEl.querySelector('[data-loc-id="8"]');
    var grvCol    = boardEl.querySelector('[data-loc-id="2"]');

    var tl = gsap.timeline({ onComplete: onDone || function () {} });
    if (desertCol) tl.to(desertCol, { x: 0, opacity: 1, duration: 0.65, ease: 'power2.out' }, 0);
    if (grvCol)    tl.to(grvCol,    { x: 0, opacity: 1, duration: 0.65, ease: 'power2.out' }, 0.08);
    if (!desertCol && !grvCol && onDone) setTimeout(onDone, 0);
  }

  /* ── Card deal animation ─────────────────────────────────────── */
  function dealCards(onDone) {
    // Lift the pre-deal visibility:hidden — elements now render
    document.body.classList.remove('otzi-pre-deal');

    if (typeof gsap === 'undefined') {
      if (onDone) onDone();
      return;
    }

    var handCards = document.querySelectorAll('#battle-player-hand .battle-hand-card');
    var deckPile  = document.querySelector('#battle-player-hand .battle-deck-pile');
    var oppHand   = document.getElementById('battle-opp-hand');
    var hudBR     = document.querySelector('.battle-hud-bottomright');

    // Player hand cards fly up from below, staggered
    for (var i = 0; i < handCards.length; i++) {
      gsap.fromTo(handCards[i],
        { y: 220, opacity: 0, scale: 0.55, rotate: -12 },
        { y: 0,   opacity: 1, scale: 1,    rotate: 0,
          duration: 0.55, ease: 'power2.out', delay: i * 0.10 });
    }

    // Deck pile slides in from the right
    if (deckPile) {
      gsap.fromTo(deckPile,
        { x: 120, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.45, ease: 'power2.out', delay: 0.45 });
    }

    // Opp hand drops down from above
    if (oppHand) {
      gsap.fromTo(oppHand,
        { y: -130, opacity: 0 },
        { y: 0,    opacity: 1, duration: 0.50, ease: 'power2.out', delay: 0.10 });
    }

    // Reset + End Turn buttons slide in from the right
    if (hudBR) {
      gsap.fromTo(hudBR,
        { x: 160, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.50, ease: 'power2.out', delay: 0.20 });
    }

    // All animations complete by ~0.85s; give them 1s to settle
    setTimeout(function () { if (onDone) onDone(); }, 1000);
  }

  /* ── Phase 3: Turn loop state ─────────────────────────────────── */
  var _hasPlayedThisTurn   = false;
  var _gilgameshEndTurnHandler  = null;
  var _gilgameshResetHandler    = null;

  /* Called by input.js's commitPlay when G.otziMode is true */
  function notifyPlayerPlayed(cardId, locId) {
    log('Player played card ' + cardId + ' at loc ' + locId);
    _hasPlayedThisTurn = true;
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = false;
    if (resetBtn)   resetBtn.disabled   = false;

    // Otzi's flee ability is triggered at reveal time (runGilgameshReveal), not here.
  }

  // delayMs: 350 when triggered by a player play (lets card-drop animation settle);
  //           0 when triggered by an AI play (synchronous path, no animation to wait for).
  function _maybeOtziFlees(triggeredLocId, delayMs) {
    var G = SOG.state.G;
    if (!G) return;
    if (delayMs === undefined) delayMs = 350;

    // Check both sides — Otzi card (id 35) may be owned by player or AI.
    var owner = null;
    var sideSlots;
    var sides = ['player', 'opp'];
    for (var s = 0; s < sides.length; s++) {
      sideSlots = (sides[s] === 'player' ? G.playerSlots : G.aiSlots);
      var locSlots = (sideSlots && sideSlots[triggeredLocId]) || [];
      for (var i = 0; i < locSlots.length; i++) {
        if (locSlots[i] && locSlots[i].cardId === 35 && locSlots[i].revealed) {
          owner = sides[s];
          break;
        }
      }
      if (owner) break;
    }
    if (!owner) return;  // Otzi not here (or face-down)

    // Find eligible destinations: another location with an open slot on the same side
    var ownerSlots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var candidates = G.locations.filter(function (loc) {
      if (loc.id === triggeredLocId) return false;
      return ownerSlots[loc.id] && ownerSlots[loc.id].indexOf(null) !== -1;
    });
    if (!candidates.length) return;  // nowhere to flee

    var dest      = candidates[Math.floor(Math.random() * candidates.length)];
    var gameOwner = owner === 'player' ? 'player' : 'opp';

    setTimeout(function () {
      if (window.SOG && SOG.game && typeof SOG.game.executeMoveAnimated === 'function') {
        SOG.game.executeMoveAnimated(gameOwner, 35, triggeredLocId, dest.id, {}, function () {
          log('Otzi card (' + gameOwner + ') fled from loc ' + triggeredLocId + ' to loc ' + dest.id);
        });
      }
    }, delayMs);
  }

  /* ── End Turn hook ────────────────────────────────────────────── */
  function installEndTurnHook() {
    if (_gilgameshEndTurnHandler) return;
    var btn = document.getElementById('battle-end-turn');
    if (!btn) return;
    _gilgameshEndTurnHandler = function (e) {
      var G = SOG.state.G;
      if (!G.otziMode) return;
      if (btn.disabled) return;
      if (!_hasPlayedThisTurn) return;
      e.stopPropagation();
      onGilgameshEndTurn();
    };
    btn.addEventListener('click', _gilgameshEndTurnHandler, true);
  }

  function removeEndTurnHook() {
    if (!_gilgameshEndTurnHandler) return;
    var btn = document.getElementById('battle-end-turn');
    if (btn) btn.removeEventListener('click', _gilgameshEndTurnHandler, true);
    _gilgameshEndTurnHandler = null;
  }

  /* ── Reset hook ───────────────────────────────────────────────── */
  function installResetHook() {
    if (_gilgameshResetHandler) return;
    var btn = document.getElementById('battle-reset-turn');
    if (!btn) return;
    _gilgameshResetHandler = function (e) {
      var G = SOG.state.G;
      if (!G.otziMode) return;
      if (btn.disabled) return;
      e.stopImmediatePropagation();
      onGilgameshReset();
    };
    btn.addEventListener('click', _gilgameshResetHandler, true);
  }

  function removeResetHook() {
    if (!_gilgameshResetHandler) return;
    var btn = document.getElementById('battle-reset-turn');
    if (btn) btn.removeEventListener('click', _gilgameshResetHandler, true);
    _gilgameshResetHandler = null;
  }

  function onGilgameshReset() {
    log('Otzi Reset — returning played cards to hand');
    var G = SOG.state.G;
    // Undo ALL unrevealed player plays (up to 2 per turn)
    var anyRestored = false;
    G.locations.forEach(function (loc) {
      var slots = G.playerSlots[loc.id] || [];
      for (var i = slots.length - 1; i >= 0; i--) {
        if (slots[i] && !slots[i].revealed) {
          if (SOG.input && typeof SOG.input.undoPlay === 'function') {
            SOG.input.undoPlay(loc.id, i);
            anyRestored = true;
          }
        }
      }
    });
    _hasPlayedThisTurn = false;
    G.otziCardsPlayed  = 0;
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;
  }

  /* ── End Turn: AI plays, reveal, next turn or end ─────────────── */
  function onGilgameshEndTurn() {
    log('Otzi End Turn — turn ' + SOG.state.G.turn);
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;

    // AI plays cards face-down
    aiPlayCards();

    // Brief pause so the face-down cards appear, then reveal
    setTimeout(function () {
      runGilgameshReveal(function () {
        var G = SOG.state.G;
        if (G.turn >= TOTAL_TURNS) {
          setTimeout(endGilgameshBattle, 800);
        } else {
          advanceGilgameshTurn();
        }
      });
    }, 600);
  }

  /* ── AI: play 1–2 random cards from aiHand ──────────────────── */
  function aiPlayCards() {
    var G       = SOG.state.G;
    var numPlay = Math.min(2, G.aiHand.length);
    for (var p = 0; p < numPlay; p++) {
      if (!G.aiHand.length) break;
      var handIdx = Math.floor(Math.random() * G.aiHand.length);
      var cardId  = G.aiHand.splice(handIdx, 1)[0];
      // Pick a random location with an open slot
      var openLocs = G.locations.filter(function (loc) {
        return (G.aiSlots[loc.id] || []).indexOf(null) !== -1;
      });
      if (!openLocs.length) { G.aiHand.unshift(cardId); break; }
      var loc       = openLocs[Math.floor(Math.random() * openLocs.length)];
      var slotIndex = G.aiSlots[loc.id].indexOf(null);
      var card      = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
      if (!card)    { G.aiHand.unshift(cardId); continue; }
      G.aiSlots[loc.id][slotIndex] = {
        cardId: cardId, ip: card.ip, revealed: false,
        ipMod: 0, contMod: 0, ipModSources: [], turnPlayed: G.turn
      };
      G.aiRevealQueue.push(cardId);
      if (SOG.board && typeof SOG.board.getSlotEl === 'function') {
        var slotEl = SOG.board.getSlotEl('opp', loc.id, slotIndex);
        if (slotEl) {
          slotEl.dataset.cardId = cardId;
          if (SOG.board.setSlotFaceDown) SOG.board.setSlotFaceDown(slotEl);
        }
      }
      // Otzi's flee ability is triggered at reveal time (runGilgameshReveal), not here.
    }
    if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') SOG.ui.updateOppHand();
  }

  /* ── Reveal all unrevealed slots across 3 locations ─────────── */
  function runGilgameshReveal(onDone) {
    var G        = SOG.state.G;
    var flipSlot = window.flipSlot || (SOG.game && SOG.game.flipSlot);
    if (typeof flipSlot !== 'function') flipSlot = _hardReveal;

    // Gather [{ owner, locId, idx }] for all unrevealed slots
    var toFlip = [];
    G.locations.forEach(function (loc) {
      (G.playerSlots[loc.id] || []).forEach(function (sd, i) {
        if (sd && !sd.revealed) toFlip.push({ owner: 'player', locId: loc.id, idx: i });
      });
      (G.aiSlots[loc.id] || []).forEach(function (sd, i) {
        if (sd && !sd.revealed) toFlip.push({ owner: 'opp', locId: loc.id, idx: i });
      });
    });

    // Re-evaluate continuous abilities + refresh displays after each card reveal.
    // Matches the cadence of the regular game's revealNext → proceed pipeline.
    function afterCard() {
      if (SOG.abilities && typeof SOG.abilities.evaluateContinuous === 'function') {
        SOG.abilities.evaluateContinuous();
      }
      if (SOG.board && typeof SOG.board.refreshSlotIPDisplays === 'function') SOG.board.refreshSlotIPDisplays();
      if (SOG.board && typeof SOG.board.updateScores         === 'function') SOG.board.updateScores();
    }

    var next = function (i) {
      if (i >= toFlip.length) {
        afterCard();   // final pass once every card is revealed
        setTimeout(function () { if (onDone) onDone(); }, 1100);
        return;
      }
      var item   = toFlip[i];
      // Capture cardId from slot data before the flip marks it revealed
      var slots  = item.owner === 'player' ? G.playerSlots : G.aiSlots;
      var sd     = slots[item.locId] && slots[item.locId][item.idx];
      var cardId = sd ? sd.cardId : null;
      var slotEl = SOG.board && typeof SOG.board.getSlotEl === 'function'
                   ? SOG.board.getSlotEl(item.owner, item.locId, item.idx) : null;
      flipSlot(slotEl, function () {
        // Fire At Once ability (e.g. Tool → draw a card), then check Otzi flee,
        // refresh + continue.  Otzi's ability fires here — at reveal time — for
        // both player and AI cards, for both the fireAtOnce and fallback paths.
        function afterReveal() {
          _maybeOtziFlees(item.locId, 0);
          afterCard();
          setTimeout(function () { next(i + 1); }, 500);
        }
        if (cardId && SOG.abilities && typeof SOG.abilities.fireAtOnce === 'function') {
          SOG.abilities.fireAtOnce(item.owner, cardId, item.locId, afterReveal);
        } else {
          afterReveal();
        }
      });
    };

    // Before the sequential flip begins, ensure every unrevealed card is
    // showing face-down. Player cards were placed face-up during the select
    // phase (commitPlay → 'face-up unplayed') and Lucy's move destination
    // has 'queued-dest'. Mirror game.js lines 824-853: GSAP-squish them to
    // face-down so the whole board shows a uniform face-down state, then
    // start the reveal sequence.
    var faceUpEls = [];
    toFlip.forEach(function (item) {
      var slotEl = SOG.board && typeof SOG.board.getSlotEl === 'function'
                   ? SOG.board.getSlotEl(item.owner, item.locId, item.idx) : null;
      if (slotEl && !slotEl.classList.contains('face-down')) {
        faceUpEls.push(slotEl);
      }
    });

    function startReveal() {
      setTimeout(function () { next(0); }, 400);
    }

    if (faceUpEls.length && typeof gsap !== 'undefined') {
      gsap.to(faceUpEls, {
        scaleX: 0, duration: 0.15, ease: 'power2.in',
        onComplete: function () {
          faceUpEls.forEach(function (el) {
            el.classList.remove('face-up', 'unplayed', 'queued-dest');
            el.classList.add('face-down');
            el.innerHTML = '';
          });
          gsap.to(faceUpEls, { scaleX: 1, duration: 0.12, ease: 'power2.out',
            onComplete: startReveal
          });
        }
      });
    } else {
      faceUpEls.forEach(function (el) {
        el.classList.remove('face-up', 'unplayed', 'queued-dest');
        el.classList.add('face-down');
        el.innerHTML = '';
      });
      startReveal();
    }
  }

  /* Fallback reveal with no animation */
  function _hardReveal(slotEl, cb) {
    if (!slotEl) { if (cb) cb(); return; }
    var cardId    = parseInt(slotEl.dataset.cardId,    10);
    var locId     = parseInt(slotEl.dataset.locId,     10);
    var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
    var owner     = slotEl.dataset.owner;
    var G         = SOG.state.G;
    var slots     = owner === 'player' ? G.playerSlots : G.aiSlots;
    if (slots[locId] && slots[locId][slotIndex]) slots[locId][slotIndex].revealed = true;
    slotEl.classList.remove('face-down', 'unplayed');
    slotEl.classList.add('face-up');
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
    if (card && SOG.board && SOG.board.buildCardFace) {
      var sd = slots[locId] && slots[locId][slotIndex];
      var ip = sd ? (SOG.board.effectiveIP ? SOG.board.effectiveIP(sd) : sd.ip) : card.ip;
      SOG.board.buildCardFace(slotEl, card, ip);
    }
    setTimeout(cb || function () {}, 60);
  }

  /* ── Advance to next turn ─────────────────────────────────────── */
  function advanceGilgameshTurn() {
    var G = SOG.state.G;
    G.turn++;
    log('Advancing to turn ' + G.turn);
    setTurnCounter(G.turn, TOTAL_TURNS);
    _hasPlayedThisTurn = false;
    G.otziCardsPlayed  = 0;
    G.prehistoryHasPlayed = false;

    // Draw up to hand-cap (4) for player; draw up to 4 for AI
    while (G.playerDeck.length > 0 && G.playerHand.length < 4) {
      G.playerHand.push(G.playerDeck.shift());
    }
    while (G.aiDeck.length > 0 && G.aiHand.length < 4) {
      G.aiHand.push(G.aiDeck.shift());
    }

    if (SOG.input && typeof SOG.input.rebuildPlayerHand === 'function') {
      SOG.input.rebuildPlayerHand();
    } else if (typeof window.setPlayerHand === 'function') {
      window.setPlayerHand(G.playerHand, G.playerDeck.length);
    }
    if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') SOG.ui.updateOppHand();

    // Reset turn-state in G (mirrors nextTurn() in game.js)
    G.playerRevealQueue   = [];
    G.aiRevealQueue       = [];
    G.playerActionLog     = [];
    G.aiActionLog         = [];
    G.moveLog             = [];
    // Preserve Lucy's move flag across turns: she gets one move per battle, not per turn.
    // All other movement cards (Magellan etc.) reset normally.
    var lucyAlreadyMoved = G.movedThisTurn && G.movedThisTurn[33];
    G.movedThisTurn       = {};
    if (lucyAlreadyMoved) G.movedThisTurn[33] = true;
    G.aiMovedThisTurn     = {};
    G.locationSnapshots   = {};
    G.reservedSlotsPerLoc = {};
    G.deferredPlays       = {};

    // Re-evaluate moveable affordances now that movedThisTurn has been reset.
    // Without this, Lucy (card 33) and other movement cards never show their
    // moveable ring on turns 2-4 because refreshMoveableCards isn't called
    // anywhere else in the Otzi turn-advance path.
    if (SOG.input && typeof SOG.input.refreshMoveableCards === 'function') {
      SOG.input.refreshMoveableCards();
    }

    // Buttons: disabled until player places a card
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;
  }

  /* ── End battle: tally 3-location scores ──────────────────────── */
  function endGilgameshBattle() {
    var G    = SOG.state.G;
    var eIP  = SOG.board && SOG.board.effectiveIP;
    var playerWins = 0, gilgameshWins = 0;

    // Tally per-location winners
    var locResults = G.locations.map(function (loc) {
      var pIP = 0, aIP = 0;
      (G.playerSlots[loc.id] || []).forEach(function (s) {
        if (s && s.revealed) pIP += eIP ? eIP(s) : (s.ip || 0);
      });
      (G.aiSlots[loc.id] || []).forEach(function (s) {
        if (s && s.revealed) aIP += eIP ? eIP(s) : (s.ip || 0);
      });
      return { loc: loc, playerIP: pIP, aiIP: aIP };
    });

    locResults.forEach(function (r) {
      if (r.playerIP > r.aiIP)      playerWins++;
      else if (r.aiIP > r.playerIP) gilgameshWins++;
    });

    log('Battle over — player wins ' + playerWins + ' locs, Otzi wins ' + gilgameshWins);

    // Determine outcome. True tie = 1-1-1 split with equal total IP.
    var won = false, isTie = false, usedTiebreaker = false;
    var playerTotal = 0, gilgameshTotal = 0;
    if (playerWins >= 2) {
      won = true;
    } else if (gilgameshWins >= 2) {
      won = false;
    } else {
      usedTiebreaker = true;
      locResults.forEach(function (r) {
        playerTotal += r.playerIP;
        gilgameshTotal   += r.aiIP;
      });
      if (playerTotal === gilgameshTotal) {
        isTie = true;   // exact tie — treated as loss for progression
        won   = false;
      } else {
        won = playerTotal > gilgameshTotal;
      }
      log('Tiebreaker — player total IP: ' + playerTotal + ', Otzi total IP: ' + gilgameshTotal);
    }

    if (won) {
      // NOTE: sog_battle_gilgamesh_complete is intentionally NOT set in D3a
      // (D3b sets it on the Battle 2 win). Battle 1 victory sets phase-1.
      if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    } else {
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
    }

    setTimeout(function () { _routePostBattle(won, isTie, locResults); }, 600);
  }

  /* ── Post-battle: self-rendered result popup ──────────────────────
     Win  → set phase-1 complete (+ lucky-win Cuneiform auto-grant) →
            "Continue" returns to the Mesopotamia overworld (D3b adds the
            5-card-grant sequence on top of this).
     Loss → "Play Again" (post-loss intervention, or a direct restart once
            Cuneiform is granted) + "Gameboard" (overworld). Tie = loss.  */

  function _routePostBattle(won, isTie, locResults) {
    if (won) {
      try { localStorage.setItem(KEY_PHASE1_COMPLETE, 'true'); } catch (e) {}
      if (!_has(KEY_CUNEIFORM_GRANTED)) {
        // Lucky first-try win without Cuneiform → auto-grant it (no Farmer
        // dialogue, just the standard acquisition popup). Player ends with
        // Cuneiform regardless of path.
        _grantCuneiform(function () { _showResultPopup(true, locResults); });
      } else {
        _showResultPopup(true, locResults);
      }
    } else {
      _showResultPopup(false, locResults);   // tie treated as loss
    }
  }

  /* Grant Cuneiform: idempotent flag + unlock + acquisition reveal. */
  function _grantCuneiform(done) {
    try { localStorage.setItem(KEY_CUNEIFORM_GRANTED, 'true'); } catch (e) {}
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') SOG.Cards.unlock([46]);
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === 46; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Build a single location result row. */
  function _buildLocRow(locName, pIP, aIP) {
    var winner = pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie';
    var row = document.createElement('div'); row.className = 'result-loc-row';
    var nm  = document.createElement('div'); nm.className  = 'result-loc-name'; nm.textContent = locName;
    var sc  = document.createElement('div'); sc.className  = 'result-loc-scores';
    var yu  = document.createElement('span');
    yu.className   = 'result-loc-you'  + (winner === 'player' ? ' result-loc-winner' : '');
    yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className   = 'result-loc-opp'  + (winner === 'ai'     ? ' result-loc-winner' : '');
    op.textContent = 'Gilgamesh: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'GILGAMESH' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  var RESULT_ID = 'adv-gilgamesh-result';
  function _removeResultPopup() {
    var el = document.getElementById(RESULT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function _showResultPopup(won, locResults) {
    _removeResultPopup();
    var el = document.createElement('div');
    el.id = RESULT_ID;
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:11000', 'display:flex',
      'flex-direction:column', 'align-items:center', 'justify-content:center',
      'gap:18px', 'background:rgba(8,5,2,0.85)', 'font-family:\'CT Galbite\',monospace'
    ].join(';');

    var title = document.createElement('div');
    title.textContent = won ? 'VICTORY' : 'DEFEAT';
    title.style.cssText = 'font-size:42px;letter-spacing:0.12em;color:' +
      (won ? '#f8d000' : '#d46a3a') + ';text-shadow:0 0 18px rgba(248,208,0,0.45)';
    el.appendChild(title);

    var rows = document.createElement('div');
    rows.className = 'result-loc-list';
    rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:380px';
    locResults.forEach(function (r) { rows.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP)); });
    el.appendChild(rows);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:18px;margin-top:12px';
    function mkBtn(label, cb) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        'padding:10px 28px', 'background:transparent', 'border:2px solid #f8d000',
        'color:#f8d000', 'font-family:\'CT Galbite\',monospace', 'font-size:16px',
        'letter-spacing:0.08em', 'cursor:pointer', 'border-radius:3px'
      ].join(';');
      b.addEventListener('click', cb);
      return b;
    }

    if (won) {
      btnRow.appendChild(mkBtn('Continue',  function () { _removeResultPopup(); _exitToOverworld(); }));
    } else {
      btnRow.appendChild(mkBtn('Play Again', function () { _removeResultPopup(); _onPlayAgain(); }));
      btnRow.appendChild(mkBtn('Gameboard',  function () { _removeResultPopup(); _exitToOverworld(); }));
    }
    el.appendChild(btnRow);
    document.body.appendChild(el);
  }

  /* "Play Again" after a loss. If Cuneiform is already granted, restart the
     battle directly. Otherwise run the post-loss candle/Farmer/Cuneiform/
     Gilgamesh-challenge intervention (owned by overworld.js, which has the
     candle + HUD-dialogue helpers), then restart Battle 1 Attempt 2. */
  function _onPlayAgain() {
    if (_has(KEY_CUNEIFORM_GRANTED)) {
      _restartBattle();
      return;
    }
    var ow = window.Overworld;
    if (ow && typeof ow.runGilgameshCuneiformIntervention === 'function') {
      removeEndTurnHook(); removeResetHook(); teardown();
      ow.runGilgameshCuneiformIntervention(function () { SOG.GilgameshBattle.start(); });
    } else {
      // Fallback: grant Cuneiform silently and restart.
      _grantCuneiform(function () { _restartBattle(); });
    }
  }

  function _restartBattle() {
    removeEndTurnHook(); removeResetHook(); teardown();
    if (typeof SOG !== 'undefined' && SOG.GilgameshBattle) SOG.GilgameshBattle.start();
  }

  /* Tear down and return to the Mesopotamia overworld. */
  function _exitToOverworld() {
    removeEndTurnHook(); removeResetHook(); teardown();
    if (typeof showScreen === 'function') showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* ── Start turn loop (called after dealCards completes) ─────── */
  function startTurnLoop() {
    log('Phase 3 — installing turn loop hooks');
    var G = SOG.state.G;
    G.otziCardsPlayed  = 0;
    _hasPlayedThisTurn = false;
    installEndTurnHook();
    installResetHook();
    // Buttons start disabled — enabled after first card placement
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;
  }

  /* ── Teardown ─────────────────────────────────────────────────── */
  function teardown() {
    document.body.classList.remove('otzi-battle');
    document.body.classList.remove('otzi-pre-deal');
    restoreExplorerAvatar();
    hideBubbles();
    removeEndTurnHook();
    removeResetHook();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
    }
    if (window.SOG && SOG.state && SOG.state.G) {
      SOG.state.G.otziMode = false;
    }
  }

  /* ════════════════════════════════════════════════════════════
     MAIN ENTRY POINT
     ════════════════════════════════════════════════════════════
     Called by overworld.js after the radial wipe covers the screen.
     Flow:
       1. Set body classes + build G state + board DOM
       2. Switch to screen-battle
       3. Fade out wipe → board visible (Savannah only)
       4. Pre-shake dialogue (5 lines, Explorer then Otzi)
       5. Screen shake → Desert slides left, GRV slides right
       6. Post-shake dialogue (5 lines)
       7. Card deal animation (both hands + decks fly in)
       8. Board fully assembled — Phase 3 will wire the turn loop
  ═══════════════════════════════════════════════════════════════ */
  function start() {
    log('start() — Phase 2 implementation');

    // Prime the Web Audio context (needs a user gesture — the click that
    // started this encounter counts, so resume here to ensure beeps work).
    var _ctx = getBleepCtx();
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch(e) {} }

    // Context classes
    document.body.classList.add('otzi-battle');
    document.body.classList.add('otzi-pre-deal');

    // Build G state + board DOM (all 3 locations; Desert/GRV hidden by GSAP)
    setupBattleBoard();

    // Swap Lucy avatar slot to show the Explorer
    applyExplorerAvatar();

    // Switch to the battle screen
    if (typeof showScreen === 'function') {
      showScreen('screen-battle');
    }

    // Buttons: visible after deal but non-functional in Phase 2
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;

    // Fade out the radial wipe → board reveals with Uruk (center) only.
    // No tutorial dialogue — the player already learned the rules vs Otzi;
    // the Gilgamesh "Welcome"/"challenge again" exchange plays in the overworld
    // before this battle starts.
    fadeOutCover(function () {
      shakeCamera(function () {
        revealSideLocations(function () {
          dealCards(function () {
            log('Turn loop starting');
            startTurnLoop();
          });
        });
      });
    });
  }

  /* ── Public surface ──────────────────────────────────────────── */
  function isBattleComplete() {
    try { return localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true'; }
    catch (e) { return false; }
  }

  return {
    start:                start,
    isBattleComplete:     isBattleComplete,
    teardown:             teardown,
    notifyPlayerPlayed:   notifyPlayerPlayed
  };

})();

window.SOG = SOG;

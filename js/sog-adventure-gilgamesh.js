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
  var MESO_STARTER_IDS = [38, 39, 40, 42, 41]; // Priest, Farmer, Scribe, Soldier, Canals (win prize)
  var ENKIDU_ID        = 44;                   // joins Gilgamesh's deck for the rematch
  var KEY_MESO_STARTER_GRANTED = 'sog_mesopotamia_starter_granted';

  // True for the rematch (Battle 2): captured at start() from the phase-1 flag,
  // BEFORE this victory could set it. Drives deck sourcing + end-game routing.
  var _isRematch = false;

  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }

  // Player's deck pool. Battle 1: 11 Prehistory (+Cuneiform once granted).
  // Rematch: the deck the player just built in the deck builder.
  function buildPlayerDeck() {
    if (_isRematch && window.Decks && typeof window.Decks.getActiveCards === 'function') {
      var built = window.Decks.getActiveCards();
      if (built && built.length) return built.slice();
    }
    var ids = PREHISTORY_IDS.slice();
    if (_has(KEY_CUNEIFORM_GRANTED)) ids.push(46);
    return ids;
  }

  // AI deck. Rematch adds Enkidu (id 44) to Gilgamesh's 9 Mesopotamia cards.
  function buildAiDeck() {
    var ids = GILGAMESH_AI_IDS.slice();
    if (_isRematch) ids.push(ENKIDU_ID);
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

    // Gilgamesh's three locations — no abilities.
    var cedar = { id: 8, name: 'Cedar Forest', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/cedarforest.jpg', thumbnailCrop: null };
    var uruk  = { id: 7, name: 'Uruk',         region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/uruk.jpg',       thumbnailCrop: null };
    var mashu = { id: 2, name: 'Mount Mashu',  region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/mountmashu.jpg', thumbnailCrop: null };

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

    var gilgameshDeckArr   = shuffleInPlace(buildAiDeck());
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
    G.culturalCount         = { player: 0, opp: 0 };  // Gilgamesh card reads this
    G.playOrderCounter      = 0;                       // Scribe play-order metadata
    G.locationBoosts        = G.locationBoosts || {};  // Sargon (unused here, but safe)

    // Build board DOM with all 3 locations
    if (typeof window.initBattleUI === 'function') {
      window.initBattleUI(G.locations);
    }

    // D3a.1: all 3 locations render in place immediately (no shake-into-place
    // intro — that inherited Otzi tutorial beat is cut for Gilgamesh).

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

  /* ── Avatar presentation ─────────────────────────────────────────
     Ally is the female Explorer (popped in at apply time); opponent is
     Gilgamesh. Both slots are set explicitly via the shared engine path
     (SOG.HUD.applyBattleAvatars / restoreBattleAvatars). */
  var PRESENTATION = {
    allyAvatar:     'images/femaleexplorer%20portrait.jpeg',
    opponentAvatar: 'images/portraits/gilgameshportrait.jpeg',
    popAlly:        true
  };

  /* ── Battle rules popup + opponent-portrait interaction (D3a.1) ──── */
  var RULES_TITLE = 'The Epic Battle of Gilgamesh';
  var RULES_BODY  = [
    '<b>Win Condition</b> — Gain more Influence Points than your opponent at the most locations.',
    'Draw 2 cards per turn.',
    '4 turns total.'
  ];
  function _opponentAvatarEl() { return document.querySelector('.battle-avatar-opponent'); }
  function _openRulesPopup(onDismiss) {
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function') {
      SOG.BattleRulesPopup.show({ title: RULES_TITLE, body: RULES_BODY, onDismiss: onDismiss });
    } else if (onDismiss) { onDismiss(); }
  }

  var _portraitClickHandler = null;
  function _wireOpponentPortraitClick() {
    var el = _opponentAvatarEl();
    if (!el || _portraitClickHandler) return;
    el.classList.add('gilgamesh-clickable');
    _portraitClickHandler = function () { _openRulesPopup(); };
    el.addEventListener('click', _portraitClickHandler);
  }
  function _unwireOpponentPortraitClick() {
    var el = _opponentAvatarEl();
    if (el && _portraitClickHandler) el.removeEventListener('click', _portraitClickHandler);
    if (el) el.classList.remove('gilgamesh-clickable', 'gilgamesh-portrait-glow');
    _portraitClickHandler = null;
    _removeClickHereIndicator();
  }

  function _addClickHereIndicator() {
    var el = _opponentAvatarEl();
    if (!el || document.getElementById('gilgamesh-clickhere')) return;
    var tag = document.createElement('div');
    tag.id = 'gilgamesh-clickhere';
    tag.className = 'gilgamesh-clickhere';
    tag.textContent = 'Click Here';
    el.appendChild(tag);
  }
  function _removeClickHereIndicator() {
    var t = document.getElementById('gilgamesh-clickhere');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }
  function _glowOpponentPortrait(on) {
    var el = _opponentAvatarEl();
    if (!el) return;
    if (on) { el.classList.add('gilgamesh-portrait-glow', 'gilgamesh-clickable'); _addClickHereIndicator(); }
    else    { el.classList.remove('gilgamesh-portrait-glow'); _removeClickHereIndicator(); }
  }

  /* Show one opponent-bubble line (typewriter + bleep) that stays visible
     with NO click-to-advance — used for the interactive "Click on me" beat. */
  function _showOpponentLine(text, onReady) {
    var el = getBubbleEl('otzi');
    if (!el) { if (onReady) onReady(); return; }
    var ex = getBubbleEl('explorer'); if (ex) ex.classList.remove('is-visible', 'is-ready');
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { if (onReady) onReady(); return; }
    textEl.textContent = '';
    el.classList.add('is-visible'); el.classList.remove('is-ready');
    var i = 0, bleepCount = 0;
    var timer = setInterval(function () {
      i++; textEl.textContent = text.slice(0, i);
      var c = text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') { bleepCount++; if (bleepCount >= 2) { bleepCount = 0; playBleep('otzi'); } }
      if (i >= text.length) { clearInterval(timer); el.classList.add('is-ready'); if (onReady) onReady(); }
    }, TYPE_SPEED_MS);
  }

  /* Opening in-battle dialogue (Battle 1 Attempt 1 only). Lines 1-5 advance
     normally; "Click on me" pauses for a portrait click → rules popup → resume
     with "Thank you". Skipped on Attempt 2+ / re-entries. */
  var OPENING_PRE = [
    { who: 'otzi',     text: 'I am Gilgamesh.' },
    { who: 'explorer', text: 'Hi.' },
    { who: 'otzi',     text: 'I will smite you into the great beyond.' },
    { who: 'explorer', text: 'Gulp.' },
    { who: 'explorer', text: 'How do you play this, again?' }
  ];
  var OPENING_PROMPT = 'Click on me, if you need a reminder.';

  function _runOpeningDialogue(onComplete) {
    var seen = false, cun = false;
    try { seen = localStorage.getItem('sog_gilgamesh_opening_seen') === 'true'; } catch (e) {}
    try { cun  = localStorage.getItem(KEY_CUNEIFORM_GRANTED) === 'true'; } catch (e) {}
    if (seen || cun) { if (onComplete) onComplete(); return; }

    runLines(OPENING_PRE, function () {
      _showOpponentLine(OPENING_PROMPT, function () {
        _glowOpponentPortrait(true);
        var el = _opponentAvatarEl();
        var oneShot = function () {
          if (el) el.removeEventListener('click', oneShot);
          _openRulesPopup(function () {
            _glowOpponentPortrait(false);
            var ot = getBubbleEl('otzi'); if (ot) ot.classList.remove('is-visible', 'is-ready');
            runLines([{ who: 'explorer', text: 'Thank you.' }], function () {
              try { localStorage.setItem('sog_gilgamesh_opening_seen', 'true'); } catch (e) {}
              if (onComplete) onComplete();
            });
          });
        };
        if (el) el.addEventListener('click', oneShot);
        else oneShot();
      });
    });
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

  /* ── AI: card-aware play selection (D3a.2 ST2) ────────────────────
     A modest priority cascade — NOT optimal play. For each of up to 2 plays:
     pick the highest-value playable card (deferring "hold" cards), then send
     it to its preferred synergy location, falling back to general location
     rules. Goal: the AI plays cards where their abilities actually do
     something. Gilgamesh deck (9): 38 Priest(Rel), 39 Farmer(Labor),
     40 Scribe(Cul,boost-before), 41 Canals(Sci), 42 Soldier(Mil,strike),
     43 Gilgamesh(Cul,+1/Cultural), 45 Ziggurat(Rel,+1 Religious),
     48 Chariot(Mil,move+strike), 49 Phoenicians(Cul,attach-Cultural). */

  function _gAiTypeOf(cardId) {
    var c = (typeof CARDS !== 'undefined') && CARDS.find(function (x) { return x.id === cardId; });
    return c ? c.type : null;
  }
  function _gAiEffIP(s) {
    var fn = (SOG.board && SOG.board.effectiveIP) || (SOG.game && SOG.game.effectiveIP);
    return fn ? fn(s) : (s.ip + (s.ipMod || 0) + (s.contMod || 0));
  }
  function _gAiOpenLocs() {
    var G = SOG.state.G;
    return G.locations.filter(function (loc) { return (G.aiSlots[loc.id] || []).indexOf(null) !== -1; });
  }
  // AI cards present at a loc — includes face-down cards placed earlier THIS
  // turn (the AI knows its own plays). Used for own-synergy targeting.
  function _gAiCardsAt(locId) { return (SOG.state.G.aiSlots[locId] || []).filter(Boolean); }
  function _gAiHasType(locId, type) {
    return _gAiCardsAt(locId).some(function (s) { return _gAiTypeOf(s.cardId) === type; });
  }
  // Player cards the AI can actually see (revealed) — for strike targeting.
  function _gPlayerRevealedAt(locId) {
    return (SOG.state.G.playerSlots[locId] || []).filter(function (s) { return s && s.revealed; });
  }
  function _gLocIP(slots, locId) {
    return (slots[locId] || []).reduce(function (sum, s) { return sum + (s && s.revealed ? _gAiEffIP(s) : 0); }, 0);
  }
  function _gLocGap(locId) {  // AI minus player (revealed) at a location
    var G = SOG.state.G;
    return _gLocIP(G.aiSlots, locId) - _gLocIP(G.playerSlots, locId);
  }
  function _gSoldierStrikeValue(locId) {
    var pr = _gPlayerRevealedAt(locId);
    if (!pr.length) return -Infinity;
    var highIP = pr.reduce(function (m, s) { return Math.max(m, _gAiEffIP(s)); }, 0);
    var gap = _gLocGap(locId);
    var flips = gap < 0 && (gap + 1) >= 0;        // -1 to player flips/ties the loc
    return highIP + (flips ? 5 : 0);
  }
  function _gAiHasCulturalAnywhere() {
    return SOG.state.G.locations.some(function (loc) { return _gAiHasType(loc.id, 'Cultural'); });
  }
  // "Hold" cards play poorly now and want a later turn / a prerequisite.
  function _gAiHeld(cardId, turn) {
    if (cardId === 49) return !_gAiHasCulturalAnywhere(); // Phoenicians: need a Cultural to attach to
    if (cardId === 43) return turn < 3;                   // Gilgamesh card: play in the back half
    return false;
  }
  // Preferred synergy location for a card (open locs only); null → no preference.
  function _gPreferredLoc(cardId) {
    var open = _gAiOpenLocs();
    if (!open.length) return null;
    function best(filterFn, scoreFn) {
      var cands = open.filter(filterFn);
      if (!cands.length) return null;
      cands.sort(function (a, b) { return scoreFn(b.id) - scoreFn(a.id); });
      return cands[0].id;
    }
    switch (cardId) {
      case 49: // Phoenicians → a loc where the AI has a Cultural card to attach to
        return best(function (l) { return _gAiHasType(l.id, 'Cultural'); },
                    function (id) { return _gAiCardsAt(id).filter(function (s) { return _gAiTypeOf(s.cardId) === 'Cultural'; }).length; });
      case 45: // Ziggurat → a loc where the AI has another Religious card (Priest)
        return best(function (l) { return _gAiHasType(l.id, 'Religious'); },
                    function (id) { return _gAiCardsAt(id).filter(function (s) { return _gAiTypeOf(s.cardId) === 'Religious'; }).length; });
      case 42: // Soldier → a loc with a player card; prefer the strongest strike / a flip
        return best(function (l) { return _gPlayerRevealedAt(l.id).length > 0; }, _gSoldierStrikeValue);
      case 40: // Scribe → a loc where the AI already has cards (boosts cards played before it)
        return best(function (l) { return _gAiCardsAt(l.id).length > 0; },
                    function (id) { return _gAiCardsAt(id).length; });
      case 43: // Gilgamesh card → contest the location we're most behind at
        return best(function () { return true; }, function (id) { return -_gLocGap(id); });
      default:
        return null; // Chariot/Priest/Farmer/Canals: no strong location context
    }
  }
  // General fallback location rules: spread out, contest losses, don't pile on.
  function _gLocPlayScore(locId) {
    var count = _gAiCardsAt(locId).length;
    var gap   = _gLocGap(locId);
    var score = 0;
    if (count >= 3) score -= 6;   // avoid stacking 3+ on one location
    else if (count >= 2) score -= 2;
    if (gap >= 3) score -= 3;     // already comfortably won — don't reinforce
    if (gap < 0)  score += 3;     // contest a location we're losing
    if (count === 0) score += 1;  // prefer spreading to fresh locations
    return score;
  }
  function _gFallbackLoc() {
    var open = _gAiOpenLocs();
    if (!open.length) return null;
    open.sort(function (a, b) { return _gLocPlayScore(b.id) - _gLocPlayScore(a.id); });
    return open[0].id;
  }
  // How eagerly to play a card this turn (higher = sooner; held → -1).
  function _gCardPlayScore(cardId, turn) {
    if (_gAiHeld(cardId, turn)) return -1;
    var pref = _gPreferredLoc(cardId);
    switch (cardId) {
      case 49: return pref !== null ? 5 : 0;     // Phoenicians with a Cultural target ready
      case 42: return pref !== null ? 3 : 0;     // Soldier with a strike target
      case 45: return pref !== null ? 3 : 0;     // Ziggurat next to a Religious card
      case 40: return pref !== null ? 2 : 0;     // Scribe co-located with earlier plays
      case 43: return turn >= 3 ? 4 : -1;        // Gilgamesh card late = big scorer
      default: return 0;
    }
  }

  function _gAiPlaceCard(cardId, locId) {
    var G        = SOG.state.G;
    var slotIndex = G.aiSlots[locId].indexOf(null);
    if (slotIndex === -1) return false;
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
    G.aiSlots[locId][slotIndex] = {
      cardId: cardId, ip: card.ip, revealed: false,
      ipMod: 0, contMod: 0, ipModSources: [], turnPlayed: G.turn
    };
    G.aiRevealQueue.push(cardId);
    if (SOG.board && typeof SOG.board.getSlotEl === 'function') {
      var slotEl = SOG.board.getSlotEl('opp', locId, slotIndex);
      if (slotEl) {
        slotEl.dataset.cardId = cardId;
        if (SOG.board.setSlotFaceDown) SOG.board.setSlotFaceDown(slotEl);
      }
    }
    // Otzi's flee ability is triggered at reveal time (runGilgameshReveal), not here.
    return true;
  }

  function aiPlayCards() {
    var G       = SOG.state.G;
    var numPlay = Math.min(2, G.aiHand.length);
    for (var p = 0; p < numPlay; p++) {
      if (!G.aiHand.length || !_gAiOpenLocs().length) break;
      // Rank hand: prefer non-held cards (score >= 0); only release a held card
      // if nothing else is available this play.
      var ranked = G.aiHand.map(function (cid) { return { cid: cid, score: _gCardPlayScore(cid, G.turn) }; });
      var playable = ranked.filter(function (r) { return r.score >= 0; });
      var pool = playable.length ? playable : ranked;
      pool.sort(function (a, b) { return b.score - a.score; });
      var cardId = pool[0].cid;
      var locId  = _gPreferredLoc(cardId);
      if (locId === null) locId = _gFallbackLoc();
      if (locId === null) break;
      if (!_gAiPlaceCard(cardId, locId)) break;
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
        // D3a.2 ST1: process AI movements (Chariot) — the cloned reveal never
        // ran the canonical runAiMovements path, so move-capable cards never
        // relocated. runAdventureMovements decides + executes via
        // executeMoveAnimated (which fires the arrival strike), then we refresh.
        var finishReveal = function () { setTimeout(function () { if (onDone) onDone(); }, 1100); };
        if (SOG.ai && typeof SOG.ai.runAdventureMovements === 'function') {
          SOG.ai.runAdventureMovements(function () { afterCard(); finishReveal(); });
        } else {
          finishReveal();
        }
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
          // Replicate game.js revealNext's post-At-Once play-from-hand hooks so
          // AI (and player) plays behave equivalently to the standard game.
          // The cloned battle reveal previously skipped these, silently breaking
          // Scribe (needs play metadata) and the Gilgamesh card (needs the
          // cumulative Cultural counter).
          if (sd && item.locId !== null) {
            G.playOrderCounter = (G.playOrderCounter || 0) + 1;
            sd.playTime      = G.playOrderCounter;
            sd.originalLocId = item.locId;
          }
          var _pc = (typeof CARDS !== 'undefined') &&
                    CARDS.find(function (c) { return c.id === cardId; });
          if (_pc && _pc.type === 'Cultural' && item.locId !== null) {
            if (!G.culturalCount) G.culturalCount = { player: 0, opp: 0 };
            G.culturalCount[item.owner] = (G.culturalCount[item.owner] || 0) + 1;
          }
          // Reactive abilities of OTHER already-revealed cards at this location
          // (e.g. Ötzi's flee, card 35) — the shared dispatcher, identical to
          // the engine reveal pipeline. Excludes the just-landed card, so Ötzi
          // never fleas on his own reveal.
          if (SOG.abilities && typeof SOG.abilities.fireOnCardLandedHere === 'function') {
            SOG.abilities.fireOnCardLandedHere(item.owner, cardId, item.locId);
          }
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
    if (_isRematch) {
      // Battle 2 (rematch): standard end-game, no victory sequence.
      if (won) { try { localStorage.setItem(KEY_BATTLE_GILGAMESH_COMPLETE, 'true'); } catch (e) {} }
      _showResultPopup(won, locResults);
      return;
    }
    // Battle 1
    if (won) {
      try { localStorage.setItem(KEY_PHASE1_COMPLETE, 'true'); } catch (e) {}
      _showResultPopup(true, locResults);   // CONTINUE → _runPostVictorySequence
    } else {
      _showResultPopup(false, locResults);  // tie treated as loss; PLAY AGAIN → intervention
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

  /* ── Post-victory sequence (Battle 1 win) ─────────────────────────
     CONTINUE on the victory scoreboard runs this on the battle screen:
       Gilgamesh dialogue → grant the 5 Mesopotamia starter cards →
       Explorer line → Gilgamesh summons Enkidu (growl sfx) → Enkidu card
       pops up 2s and fades into his deck → closing lines → shh + fade to
       the deck builder (12-card build) → "Let's Play" launches the rematch
       (player's built deck vs. Gilgamesh + Enkidu).                       */

  function _playSfx(src) { try { var a = new Audio(src); a.play(); } catch (e) {} }

  // Grant the 5 starter cards back-to-back via the shared acquisition reveal.
  function _grantStarterCards(cb) {
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    var i = 0;
    (function next() {
      if (i >= MESO_STARTER_IDS.length) {
        try { localStorage.setItem(KEY_MESO_STARTER_GRANTED, 'true'); } catch (e) {}
        if (cb) cb();
        return;
      }
      var id = MESO_STARTER_IDS[i++];
      if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') SOG.Cards.unlock([id]);
      var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === id; });
      if (card && preh && typeof preh.showCardAcquisition === 'function') {
        preh.showCardAcquisition(card, null, next, { autoDismissMs: 1500 });
      } else { next(); }
    })();
  }

  // Enkidu card pops up centred for ~2s, then shrinks/fades toward Gilgamesh's
  // deck (top-right). NOT the "card acquired" reveal — it's HIS card.
  function _revealEnkidu(cb) {
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === ENKIDU_ID; });
    var overlay = document.createElement('div');
    overlay.id = 'gilg-enkidu-reveal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .35s ease;';
    var img = document.createElement('img');
    img.src = card ? card.image : 'images/mesopotamiacards/enkidu@0.5x.jpg';
    img.alt = 'Enkidu';
    img.style.cssText = 'width:200px;max-width:40vw;height:auto;border-radius:8px;box-shadow:0 0 44px rgba(248,208,0,.65);transition:opacity .5s ease, transform .5s ease;';
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    void overlay.offsetHeight; overlay.style.opacity = '1';
    setTimeout(function () {
      img.style.transform = 'translate(38vw, -40vh) scale(0.18)';
      img.style.opacity   = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (cb) cb();
      }, 520);
    }, 2000);
  }

  // shh + dark fade → tear down the battle → open the deck builder for the
  // rematch deck. adventureBattleTarget routes its "Let's Play" back here.
  function _fadeToDeckBuilder() {
    var fade = document.createElement('div');
    fade.id = 'gilg-db-fade';
    fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:10050;transition:opacity .55s ease;pointer-events:none;';
    document.body.appendChild(fade);
    void fade.offsetHeight; fade.style.opacity = '1';
    setTimeout(function () {
      removeEndTurnHook(); removeResetHook(); teardown();
      // The player owns their Prehistory cards (they piloted them in Battle 1)
      // but those are never explicitly unlocked elsewhere — register them
      // silently so the deck-builder pool can reach 12. The 5 Mesopotamia
      // starters were already unlocked during the grant sequence.
      if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
        SOG.Cards.unlock(PREHISTORY_IDS);
      }
      window.adventureBattleTarget = 'gilgamesh';
      if (typeof showScreen === 'function') showScreen('screen-deckbuilder');
      if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
      setTimeout(function () {
        fade.style.opacity = '0';
        setTimeout(function () { if (fade.parentNode) fade.parentNode.removeChild(fade); }, 600);
      }, 80);
    }, 600);
  }

  function _runPostVictorySequence() {
    runLines([
      { who: 'otzi', text: 'I underestimated you.' },
      { who: 'otzi', text: "For that, you've earned a prize." }
    ], function () {
      _grantStarterCards(function () {
        runLines([{ who: 'explorer', text: 'Thank you?' }], function () {
          runLines([
            { who: 'otzi', text: "But it won't happen again." },
            { who: 'otzi', text: 'Enkidu?!' }
          ], function () {
            _playSfx('sfx/enkidugrowl.mp3');
            runLines([{ who: 'explorer', text: "I don't like that sound." }], function () {
              _revealEnkidu(function () {
                runLines([
                  { who: 'otzi',     text: 'With my companion by my side, I will become immortal.' },
                  { who: 'explorer', text: 'Oh boy.' }
                ], function () {
                  _playSfx('sfx/shh.m4a');
                  _fadeToDeckBuilder();
                });
              });
            });
          });
        });
      });
    });
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
  var SHOW_RESULTS_ID = 'adv-gilgamesh-show-results';
  function _removeResultPopup() {
    var el = document.getElementById(RESULT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _removeFloatingResultsBtn();
  }
  function _removeFloatingResultsBtn() {
    var b = document.getElementById(SHOW_RESULTS_ID);
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  // "Game Board" on the victory popup — hide the scoreboard to reveal the final
  // battle board for review, and float a "Show Results" button to bring it back.
  function _hideResultForReview() {
    var el = document.getElementById(RESULT_ID);
    if (el) el.style.display = 'none';
    if (document.getElementById(SHOW_RESULTS_ID)) return;
    var btn = document.createElement('button');
    btn.id = SHOW_RESULTS_ID;
    btn.className = 'btn-primary';
    btn.textContent = 'SHOW RESULTS';
    btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10060;';
    btn.addEventListener('click', function () {
      var r = document.getElementById(RESULT_ID);
      if (r) r.style.display = '';
      _removeFloatingResultsBtn();
    });
    document.body.appendChild(btn);
  }

  // Built on the standard adventure scoreboard markup (.adv-result →
  // .result-wrap → .result-headline / .result-locs / .result-actions) so the
  // visual treatment (parchment panel, gold double-border, fonts) matches the
  // Otzi/Arcadium end-game scoreboard. Only the per-battle content differs.
  function _showResultPopup(won, locResults) {
    _removeResultPopup();
    var overlay = document.createElement('div');
    overlay.id = RESULT_ID;
    overlay.className = 'adv-result';

    var wrap = document.createElement('div');
    wrap.className = 'result-wrap';

    var headline = document.createElement('div');
    headline.className = 'result-headline ' + (won ? 'result-player' : 'result-ai');
    headline.textContent = won ? 'VICTORY' : 'DEFEAT';

    var locs = document.createElement('div');
    locs.className = 'result-locs';
    locResults.forEach(function (r) { locs.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP)); });

    var actions = document.createElement('div');
    actions.className = 'result-actions';
    function mkBtn(label, cb) {
      var b = document.createElement('button');
      b.className = 'btn-primary';
      b.textContent = label;
      b.addEventListener('click', cb);
      return b;
    }
    if (won) {
      // Battle 1 victory → rich post-victory sequence (prize + Enkidu + deck
      // builder). Rematch victory → straight back to the overworld.
      var onContinue = _isRematch
        ? function () { _removeResultPopup(); _exitToOverworld(); }
        : function () { _removeResultPopup(); _runPostVictorySequence(); };
      actions.appendChild(mkBtn('CONTINUE', onContinue));
      // Game Board: hide the scoreboard to review the final board; a floating
      // "Show Results" button brings it back so Continue stays reachable.
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN', function () { _removeResultPopup(); _onPlayAgain(); }));
      actions.appendChild(mkBtn('GAMEBOARD',  function () { _removeResultPopup(); _exitToOverworld(); }));
    }

    wrap.appendChild(headline);
    wrap.appendChild(locs);
    wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
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
    document.body.classList.remove('gilgamesh-battle');
    document.body.classList.remove('otzi-pre-deal');
    if (SOG.HUD && SOG.HUD.restoreBattleAvatars) SOG.HUD.restoreBattleAvatars();
    _unwireOpponentPortraitClick();
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.hide === 'function') {
      SOG.BattleRulesPopup.hide();
    }
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

    // Capture rematch state up-front (before a Battle-1 win sets phase-1).
    _isRematch = _has(KEY_PHASE1_COMPLETE);

    // Prime the Web Audio context (needs a user gesture — the click that
    // started this encounter counts, so resume here to ensure beeps work).
    var _ctx = getBleepCtx();
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch(e) {} }

    // Context classes
    document.body.classList.add('otzi-battle');
    document.body.classList.add('gilgamesh-battle');   // scopes Mesopotamia location art
    document.body.classList.add('otzi-pre-deal');

    // Build G state + board DOM (all 3 locations; Desert/GRV hidden by GSAP)
    setupBattleBoard();

    // Set both battle-screen avatars explicitly (ally Explorer, opponent Gilgamesh)
    if (SOG.HUD && SOG.HUD.applyBattleAvatars) SOG.HUD.applyBattleAvatars(PRESENTATION);

    // Switch to the battle screen
    if (typeof showScreen === 'function') {
      showScreen('screen-battle');
    }

    // Buttons: visible after deal but non-functional in Phase 2
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;

    // Fade out the radial wipe → all 3 locations already in place (no shake
    // intro). Deal, run the Attempt-1 opening dialogue, then begin turn 1.
    fadeOutCover(function () {
      dealCards(function () {
        _runOpeningDialogue(function () {
          _wireOpponentPortraitClick();   // rules popup stays clickable all battle
          log('Turn loop starting');
          startTurnLoop();
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

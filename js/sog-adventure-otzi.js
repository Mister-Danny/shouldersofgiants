/**
 * sog-adventure-otzi.js
 * Shoulders of Giants — Adventure Mode: Otzi Battle (Phase 2)
 *
 * Replaces the Phase 1 placeholder stub. SOG.OtziBattle.start() is
 * called by overworld.js after the radial wipe from the Egypt signpost.
 *
 * Phase 2 scope: pre-battle dialogue → 1→3 location reveal → card deal.
 * Ends with the board fully assembled and turn 1 ready.
 * Turn play mechanics (Phase 3+) are NOT implemented here.
 *
 * Deck composition:
 *   Player (10): Tool(26) Hunter(27) Gatherer(28) Fire(29) Cave Art(30)
 *                Megalith(31) Dom Animal(32) Tribe(36) Lucy(33) Neanderthal(34)
 *   Otzi   (10): Tool(26) Hunter(27) Gatherer(28) Fire(29) Cave Art(30)
 *                Megalith(31) Dom Animal(32) Tribe(36) Neanderthal(34) Otzi(35)
 *   Both decks shuffled; each side draws 4 into hand, 6 remain in deck.
 *
 * Locations (left→right): Desert(8) · Savannah(7, center) · Gr. Rift Valley(2)
 *   Only Savannah is visible at battle entry; Desert and GRV slide in
 *   from the edges after the screen shake.
 *
 * State:
 *   localStorage: sog_battle_otzi_complete — NOT set in Phase 2
 */

var SOG = window.SOG || {};

SOG.OtziBattle = (function () {
  'use strict';

  /* ── localStorage key ───────────────────────────────────────── */
  var KEY_BATTLE_OTZI_COMPLETE = 'sog_battle_otzi_complete';

  /* ── Deck IDs ────────────────────────────────────────────────── */
  var PLAYER_DECK_IDS = [26, 27, 28, 29, 30, 31, 32, 36, 33, 34];
  var OTZI_DECK_IDS   = [26, 27, 28, 29, 30, 31, 32, 36, 34, 35];

  /* ── Dialogue scripts ────────────────────────────────────────── */
  var PRE_SHAKE_LINES = [
    { who: 'explorer', text: 'I know this game.'         },
    { who: 'explorer', text: 'Play a card each turn.'    },
    { who: 'explorer', text: 'Score the most points.'    },
    { who: 'explorer', text: 'Easy'                      },
    { who: 'otzi',     text: 'The world is a big place.' }
  ];

  var POST_SHAKE_LINES = [
    { who: 'explorer', text: 'Oh…'                                                 },
    { who: 'otzi',     text: 'You can now play 2 cards each turn.'                      },
    { who: 'explorer', text: 'How do I win?'                                             },
    { who: 'otzi',     text: "You won't"                                            },
    { who: 'otzi',     text: 'But try to gain the most IP at 2 of the 3 locations.'    }
  ];

  /* ── Timing ──────────────────────────────────────────────────── */
  var TYPE_SPEED_MS = 32;
  var TOTAL_TURNS   = 4;

  /* ── Logging ─────────────────────────────────────────────────── */
  function log(msg) { console.log('[Adventure/Otzi] ' + msg); }

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

    // Resolve location objects from the global LOCATIONS array
    var locs = typeof LOCATIONS !== 'undefined' ? LOCATIONS : [];
    var savannah = locs.find(function (l) { return l.id === 7; }) ||
                   { id: 7, name: 'The Savannah',         region: 'Heart of Africa', abilityText: '', abilityKey: null, image: 'images/locations/savannah.jpg',         thumbnailCrop: null };
    var desert   = locs.find(function (l) { return l.id === 8; }) ||
                   { id: 8, name: 'The Desert',           region: 'Ancient Sands',   abilityText: '', abilityKey: null, image: 'images/locations/desert.jpg',           thumbnailCrop: null };
    var grv      = locs.find(function (l) { return l.id === 2; }) ||
                   { id: 2, name: 'The Great Rift Valley',region: 'Cradle of Humanity', abilityText: '', abilityKey: null, image: 'images/locations/greatriftvalley.jpg', thumbnailCrop: null };

    // Order: Desert (left) · Savannah (center) · GRV (right)
    G.locations = [desert, savannah, grv];

    G.playerSlots = {};
    G.aiSlots     = {};
    G.locations.forEach(function (loc) {
      G.playerSlots[loc.id] = [null, null, null, null];
      G.aiSlots[loc.id]     = [null, null, null, null];
    });

    // Shuffle decks + deal initial hands (4 each, 6 remaining)
    var playerDeck    = shuffleInPlace(PLAYER_DECK_IDS.slice());
    G.playerHand      = playerDeck.splice(0, 4);
    G.playerDeck      = playerDeck;

    var otziDeckArr   = shuffleInPlace(OTZI_DECK_IDS.slice());
    G.aiHand          = otziDeckArr.splice(0, 4);
    G.aiDeck          = otziDeckArr;

    // Minimal G state (mirrors Prehistory's setupBattleBoard pattern)
    G.turn                  = 1;
    G.phase                 = 'select';
    G.capital               = 0;
    G.turnStartCapital      = 0;
    G.otziMode              = true;
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

  /* ── Teardown ─────────────────────────────────────────────────── */
  function teardown() {
    document.body.classList.remove('otzi-battle');
    document.body.classList.remove('otzi-pre-deal');
    restoreExplorerAvatar();
    hideBubbles();
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

    // Step 3: fade out the radial wipe → board reveals with Savannah only
    fadeOutCover(function () {
      log('Board revealed — starting pre-shake dialogue');

      // Step 4: pre-shake dialogue
      runLines(PRE_SHAKE_LINES, function () {
        log('Pre-shake dialogue done — shaking camera');

        // Step 5: shake then slide in the side locations
        shakeCamera(function () {
          revealSideLocations(function () {
            log('Locations revealed — starting post-shake dialogue');

            // Step 6: post-shake dialogue
            runLines(POST_SHAKE_LINES, function () {
              log('Post-shake dialogue done — dealing cards');

              // Step 7: card deal animation
              dealCards(function () {
                log('Phase 2 complete — board fully assembled');
                // Buttons remain disabled (Phase 3 wires the turn loop)
                // Phase 3 note: set G.otziMode and install End Turn hook here
              });
            });
          });
        });
      });
    });
  }

  /* ── Public surface ──────────────────────────────────────────── */
  function isBattleComplete() {
    try { return localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true'; }
    catch (e) { return false; }
  }

  return {
    start:           start,
    isBattleComplete: isBattleComplete,
    teardown:        teardown
  };

})();

window.SOG = SOG;

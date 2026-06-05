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

  /* ── Post-battle dialogue scripts ───────────────────────────────── */
  var WIN_DIALOGUE = [
    { who: 'otzi',     text: 'How did you beat me?'                                   },
    { who: 'explorer', text: 'Hard work and perseverance.'                            },
    { who: 'otzi',     text: 'Whatever that means.'                                   },
    { who: 'explorer', text: 'It means a lot.'                                        },
    { who: 'otzi',     text: 'Right. Take this token of me — frozen in time.'   }
  ];
  var LOSS_DIALOGUE = [
    { who: 'otzi',     text: "As I said. You’re not ready."                      },
    { who: 'explorer', text: 'Let me try again.'                                       },
    { who: 'otzi',     text: "The world doesn’t give second chances. But I will." },
    { who: 'explorer', text: '…thanks?'                                           },
    { who: 'otzi',     text: "Don’t waste it."                                    }
  ];
  var TIE_DIALOGUE = [
    { who: 'otzi',     text: 'A stalemate. Curious.'         },
    { who: 'explorer', text: 'Does that mean I can pass?'   },
    { who: 'otzi',     text: 'No. It means we go again.'    }
  ];

  var KEY_CARD_OTZI_UNLOCKED = 'sog_card_otzi_unlocked';

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

    // Strip FIRST_CARD_HERE from GRV so any location is valid on turn 1
    var grvCopy = Object.assign({}, grv, { abilityKey: null, abilityText: '' });

    // Order: Desert (left) · Savannah (center) · GRV (right)
    G.locations = [desert, savannah, grvCopy];

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
  var _otziEndTurnHandler  = null;
  var _otziResetHandler    = null;

  /* Called by input.js's commitPlay when G.otziMode is true */
  function notifyPlayerPlayed(cardId, locId) {
    log('Player played card ' + cardId + ' at loc ' + locId);
    _hasPlayedThisTurn = true;
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = false;
    if (resetBtn)   resetBtn.disabled   = false;

    // Otzi's flee ability is triggered at reveal time (runOtziReveal), not here.
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
    if (_otziEndTurnHandler) return;
    var btn = document.getElementById('battle-end-turn');
    if (!btn) return;
    _otziEndTurnHandler = function (e) {
      var G = SOG.state.G;
      if (!G.otziMode) return;
      if (btn.disabled) return;
      if (!_hasPlayedThisTurn) return;
      e.stopPropagation();
      onOtziEndTurn();
    };
    btn.addEventListener('click', _otziEndTurnHandler, true);
  }

  function removeEndTurnHook() {
    if (!_otziEndTurnHandler) return;
    var btn = document.getElementById('battle-end-turn');
    if (btn) btn.removeEventListener('click', _otziEndTurnHandler, true);
    _otziEndTurnHandler = null;
  }

  /* ── Reset hook ───────────────────────────────────────────────── */
  function installResetHook() {
    if (_otziResetHandler) return;
    var btn = document.getElementById('battle-reset-turn');
    if (!btn) return;
    _otziResetHandler = function (e) {
      var G = SOG.state.G;
      if (!G.otziMode) return;
      if (btn.disabled) return;
      e.stopImmediatePropagation();
      onOtziReset();
    };
    btn.addEventListener('click', _otziResetHandler, true);
  }

  function removeResetHook() {
    if (!_otziResetHandler) return;
    var btn = document.getElementById('battle-reset-turn');
    if (btn) btn.removeEventListener('click', _otziResetHandler, true);
    _otziResetHandler = null;
  }

  function onOtziReset() {
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
  function onOtziEndTurn() {
    log('Otzi End Turn — turn ' + SOG.state.G.turn);
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;

    // AI plays cards face-down
    aiPlayCards();

    // Brief pause so the face-down cards appear, then reveal
    setTimeout(function () {
      runOtziReveal(function () {
        var G = SOG.state.G;
        if (G.turn >= TOTAL_TURNS) {
          setTimeout(endOtziBattle, 800);
        } else {
          advanceOtziTurn();
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
        ipMod: 0, contMod: 0, ipModSources: []
      };
      G.aiRevealQueue.push(cardId);
      if (SOG.board && typeof SOG.board.getSlotEl === 'function') {
        var slotEl = SOG.board.getSlotEl('opp', loc.id, slotIndex);
        if (slotEl) {
          slotEl.dataset.cardId = cardId;
          if (SOG.board.setSlotFaceDown) SOG.board.setSlotFaceDown(slotEl);
        }
      }
      // Otzi's flee ability is triggered at reveal time (runOtziReveal), not here.
    }
    if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') SOG.ui.updateOppHand();
  }

  /* ── Reveal all unrevealed slots across 3 locations ─────────── */
  function runOtziReveal(onDone) {
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
  function advanceOtziTurn() {
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
  function endOtziBattle() {
    var G    = SOG.state.G;
    var eIP  = SOG.board && SOG.board.effectiveIP;
    var playerWins = 0, otziWins = 0;

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
      else if (r.aiIP > r.playerIP) otziWins++;
    });

    log('Battle over — player wins ' + playerWins + ' locs, Otzi wins ' + otziWins);

    // Determine outcome. True tie = 1-1-1 split with equal total IP.
    var won = false, isTie = false, usedTiebreaker = false;
    var playerTotal = 0, otziTotal = 0;
    if (playerWins >= 2) {
      won = true;
    } else if (otziWins >= 2) {
      won = false;
    } else {
      usedTiebreaker = true;
      locResults.forEach(function (r) {
        playerTotal += r.playerIP;
        otziTotal   += r.aiIP;
      });
      if (playerTotal === otziTotal) {
        isTie = true;   // exact tie — treated as loss for progression
        won   = false;
      } else {
        won = playerTotal > otziTotal;
      }
      log('Tiebreaker — player total IP: ' + playerTotal + ', Otzi total IP: ' + otziTotal);
    }

    if (won) {
      try { localStorage.setItem(KEY_BATTLE_OTZI_COMPLETE, 'true'); } catch (e) {}
      if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    } else {
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
    }

    setTimeout(function () {
      _routePostBattle(won, isTie, locResults, usedTiebreaker, playerTotal, otziTotal);
    }, 600);
  }

  /* ── Post-battle dialogue → card reveal → scoreboard ──────────── */

  /* Route outcome to the correct dialogue then scoreboard. */
  function _routePostBattle(won, isTie, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var lines = won ? WIN_DIALOGUE : (isTie ? TIE_DIALOGUE : LOSS_DIALOGUE);
    runLines(lines, function () {
      hideBubbles();
      if (won) {
        var cardAlreadyOwned = false;
        try { cardAlreadyOwned = localStorage.getItem(KEY_CARD_OTZI_UNLOCKED) === 'true'; } catch (e) {}
        if (cardAlreadyOwned) {
          _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
        } else {
          var otziCard = (typeof CARDS !== 'undefined') &&
                        CARDS.find(function (c) { return c.id === 35; });
          var preh = window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory;
          if (otziCard && preh && typeof preh.showCardAcquisition === 'function') {
            preh.showCardAcquisition(otziCard, null, function () {
              try { localStorage.setItem(KEY_CARD_OTZI_UNLOCKED, 'true'); } catch (e) {}
              _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
            });
          } else {
            _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
          }
        }
      } else {
        _showOtziScoreboard(isTie ? 'tie' : 'loss', locResults, usedTiebreaker, playerTotal, otziTotal);
      }
    });
  }

  /* Build a single location result row (Desert / Savannah / Great Rift Valley). */
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
    op.textContent = 'Otzi: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'OTZI' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  /* Helpers shared by all three scoreboard paths. */
  function _replayOtziBattle(overlayEl) {
    overlayEl.style.display = 'none';
    removeEndTurnHook();
    removeResetHook();
    teardown();
    if (typeof SOG !== 'undefined' && SOG.OtziBattle) SOG.OtziBattle.start();
  }

  function _showBoardFromResult(overlayEl) {
    overlayEl.style.display = 'none';
    var backBtn = document.getElementById('adv-btn-back-results');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.onclick = function () {
        backBtn.style.display = 'none';
        overlayEl.style.display = 'flex';
      };
    }
  }

  function _exitOtziBattleToOverworld(wonBattle) {
    teardown();
    if (typeof showScreen === 'function') showScreen('screen-overworld');
    if (wonBattle) {
      // 500 ms settle — let the overworld screen finish rendering before
      // triggering the post-victory sequence.
      setTimeout(function () {
        var mesArrivalDone = false;
        try { mesArrivalDone = localStorage.getItem('sog_mesopotamia_arrival_complete') === 'true'; } catch (e) {}

        if (!mesArrivalDone) {
          // First victory: play the full Phase D1 Otzi→Mesopotamia travel cinematic.
          if (window.Overworld && typeof window.Overworld.startMesopotamiaArrival === 'function') {
            window.Overworld.startMesopotamiaArrival();
          }
        } else {
          // Subsequent victories (replay): just apply the victory checkmark and return.
          // The full D1 cinematic only plays once.
          // TODO (future phase): add replay-specific overworld dialogue here.
          var nodeEl = document.querySelector('#overworld-overlay [data-id="egypt-signpost"]');
          if (nodeEl) nodeEl.classList.add('overworld-node-complete');
        }
      }, 500);
    }
  }

  /* Display the HTML scoreboard for the given outcome. */
  function _showOtziScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var elId, subId, locsId, boardBtnId, againBtnId, mapBtnId;
    if (outcome === 'win') {
      elId = 'adv-otzi-result-victory'; subId = 'adv-otzi-result-victory-subline';
      locsId = 'adv-otzi-result-victory-locs';
      boardBtnId = 'adv-otzi-result-victory-board'; againBtnId = 'adv-otzi-result-victory-again';
      mapBtnId   = 'adv-otzi-result-victory-backtomap';
    } else if (outcome === 'tie') {
      elId = 'adv-otzi-result-tie'; subId = 'adv-otzi-result-tie-subline';
      locsId = 'adv-otzi-result-tie-locs';
      boardBtnId = 'adv-otzi-result-tie-board'; againBtnId = 'adv-otzi-result-tie-again';
      mapBtnId   = 'adv-otzi-result-tie-backtomap';
    } else {
      elId = 'adv-otzi-result-defeat'; subId = 'adv-otzi-result-defeat-subline';
      locsId = 'adv-otzi-result-defeat-locs';
      boardBtnId = 'adv-otzi-result-defeat-board'; againBtnId = 'adv-otzi-result-defeat-again';
      mapBtnId   = 'adv-otzi-result-defeat-backtomap';
    }

    var el      = document.getElementById(elId);
    var subEl   = document.getElementById(subId);
    var locsEl  = document.getElementById(locsId);
    var boardBtn= document.getElementById(boardBtnId);
    var againBtn= document.getElementById(againBtnId);
    var mapBtn  = document.getElementById(mapBtnId);

    if (!el) {
      log('scoreboard element #' + elId + ' not found — falling back to plain overlay');
      _fallbackScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal);
      return;
    }

    // Populate subline
    if (subEl) {
      if (usedTiebreaker) {
        subEl.textContent = 'Tiebreaker — Total IP: You ' + playerTotal + '  vs  Otzi ' + otziTotal;
      } else if (outcome === 'win') {
        subEl.textContent = 'You conquered Otzi at 2 of 3 locations';
      } else if (outcome === 'tie') {
        subEl.textContent = 'A stalemate — every location tied';
      } else {
        subEl.textContent = 'Otzi won 2 of 3 locations';
      }
    }

    // Populate 3-location rows
    if (locsEl) {
      locsEl.innerHTML = '';
      locResults.forEach(function (r) {
        locsEl.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP));
      });
    }

    el.style.display = 'flex';

    if (boardBtn) boardBtn.onclick = function () { _showBoardFromResult(el); };
    if (againBtn) againBtn.onclick = function () { _replayOtziBattle(el); };
    if (mapBtn)   mapBtn.onclick   = function () {
      el.style.display = 'none';
      _exitOtziBattleToOverworld(outcome === 'win');
    };
  }

  /* Plain-text fallback if HTML elements are missing (shouldn't happen). */
  function _fallbackScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.82)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'z-index:9000;font-family:\'CT Galbite\',monospace;color:#fff;gap:16px'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'font-size:32px;color:' + (outcome === 'win' ? '#f8d000' : '#f04030');
    title.textContent = outcome === 'win' ? 'VICTORY' : outcome === 'tie' ? 'A TIE' : 'DEFEATED';
    overlay.appendChild(title);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px';

    var againBtn = document.createElement('button');
    againBtn.textContent = 'PLAY AGAIN';
    againBtn.style.cssText = 'padding:10px 20px;font-family:\'CT Galbite\',monospace;font-size:14px;background:#12004a;color:#fff;border:2px solid #8898ff;cursor:pointer';
    againBtn.onclick = function () { overlay.parentNode.removeChild(overlay); removeEndTurnHook(); removeResetHook(); teardown(); SOG.OtziBattle.start(); };

    var mapBtn = document.createElement('button');
    mapBtn.textContent = 'BACK TO MAP';
    mapBtn.style.cssText = againBtn.style.cssText;
    mapBtn.onclick = function () { overlay.parentNode.removeChild(overlay); _exitOtziBattleToOverworld(outcome === 'win'); };

    btnRow.appendChild(againBtn);
    btnRow.appendChild(mapBtn);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);
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
                log('Phase 3 — starting turn loop');
                startTurnLoop();
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
    start:                start,
    isBattleComplete:     isBattleComplete,
    teardown:             teardown,
    notifyPlayerPlayed:   notifyPlayerPlayed
  };

})();

window.SOG = SOG;

/**
 * tutorial.js — Shoulders of Giants · Interactive Tutorial
 *
 * Guided 3-turn game narrated by Lucy (a 3.2-million-year-old hominid).
 * Uses fixed locations + scripted AI; does NOT invoke game.js logic.
 *
 * Card placement uses drag-to-place.
 *
 * Exposes: window.startTutorial()
 * Guards:  window.tutorialActive  (checked by game.js to suppress its handlers)
 */
(function () {
  'use strict';

  /* ── Fixed tutorial locations ─────────────────────────────────
     Left = Timbuktu          (id 5)
     Mid  = Great Rift Valley (id 2)
     Right= Scandinavia       (id 1)                           */
  var LOC_TIMB = LOCATIONS.find(function (l) { return l.id === 5; }); // Timbuktu   — left
  var LOC_RIFT = LOCATIONS.find(function (l) { return l.id === 2; }); // Great Rift — center
  var LOC_SCAN = LOCATIONS.find(function (l) { return l.id === 1; }); // Scandinavia — right
  var T_LOCS   = [LOC_TIMB, LOC_RIFT, LOC_SCAN];

  /* ── Scripted draws ───────────────────────────────────────────
     Turn 1 opening hand; Turn 2 additions                       */
  var PLAYER_T1_HAND = [1, 12, 3, 19, 25]; // Citizens, Samurai, Justinian, Cosimo, Columbus
  var PLAYER_T2_ADD  = [4, 2];              // Empress Wu, Scholar-Officials
  var PLAYER_T3_ADD  = [6, 24];             // Priests, Magellan
  var PLAYER_T4_ADD  = [13, 18];            // Hernan Cortes, Juvenal
  var PLAYER_T5_ADD  = [15, 20];            // William the Conqueror, Voltaire

  /* ── Tutorial state ─────────────────────────────────────────── */
  var TS = {
    active:       false,
    turn:         1,
    capital:      5,
    playerHand:   [],
    playerSlots:  {},
    aiSlots:      {},
    // Dialogue
    dialogQueue:  [],
    dialogOnDone: null,
    typing:       false,
    fullText:     '',
    typedLen:     0,
    typeTimer:    null,
    // Interaction gating
    awaitAction:  null,   // 'citizens_rift'|'free_end_turn'|'ability_clicks'|'magellan_play'|'magellan_board_move'
    freeEndCb:    null,
    playerWon:    null,   // 'player'|'otzi'|'draw'
    useBubbles:   false,  // true during battle tutorial; false on home screen
    // T3+ ability gating
    abilitiesActive:    false,
    abilityCardsToTap:  [],
    abilityCardsTapped: {},
    needMagellanMove:      false,
    bonusCapitalNextTurn:  0
  };

  /* ── DOM refs (assigned in init) ─────────────────────────────── */
  var boxEl, textEl, hintEl, dimEl, skipEl, endEl;
  var lucyBubbleEl, lucyBubbleTextEl, lucyBubbleHintEl;
  var otziBoxEl, otziTextEl;
  var playerHandEl, boardEl, endTurnBtnEl, capitalNumEl;
  var clickOverlayEl = null; // full-screen transparent click-anywhere overlay
  var numHighlightEl = null; // floating element that pulses over a number overlay
  var tutDragCardId        = null; // hand card being dragged
  var tutBoardDragCardId   = null; // board card being dragged (Magellan move)
  var tutBoardDragFromLocId = null;
  var tutBoardDragFromSi    = null;
  var _otziTyping = false, _otziFullText = '', _otziTypeTimer = null, _otziOnDone = null;

  /* ═══════════════════════════════════════════════════════════════
     WEB AUDIO  — typewriter blip
  ═══════════════════════════════════════════════════════════════ */

  var _audioCtx   = null;
  var _blipCount  = 0;    // incremented each character; blip plays every 3rd

  function getAudioCtx() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { /* audio not supported */ }
    }
    return _audioCtx;
  }

  /* Short (~35 ms) sine-wave blip at ~480 Hz with fast attack/decay.
     Plays on every 3rd character to avoid being overwhelming.       */
  function playBlip() {
    _blipCount++;
    if (_blipCount % 3 !== 0) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 480;           // mid-pitched, not shrill
      var t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.10, t + 0.005);  // 5 ms attack
      gain.gain.linearRampToValueAtTime(0,    t + 0.035);  // fade out by 35 ms
      osc.start(t);
      osc.stop(t + 0.04);
    } catch (e) { /* silently skip */ }
  }

  /* Ötzi's blip — lower pitched, gruffer triangle wave at ~120 Hz.
     Slightly longer decay gives a heavier, older character.         */
  var _otziBlipCount = 0;
  function playOtziBlip() {
    _otziBlipCount++;
    if (_otziBlipCount % 3 !== 0) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';               // warmer, more organic than sine
      osc.frequency.value = 120;           // deep, gruff rumble
      var t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.008);  // slightly slower attack
      gain.gain.linearRampToValueAtTime(0,    t + 0.060);  // longer tail = heavier feel
      osc.start(t);
      osc.stop(t + 0.07);
    } catch (e) { /* silently skip */ }
  }

  /* ═══════════════════════════════════════════════════════════════
     HOME INTRO  — 3-line Lucy sequence shown on the home screen
     before the video plays on a player's first visit.
     Called by deckbuilder.js when "I'm Ready" is clicked.
  ═══════════════════════════════════════════════════════════════ */

  function startHomeIntro(onDone) {
    if (!boxEl) initDOMRefs();

    TS.active = true;   // enables click/spacebar dialogue advance
    // Home intro: no nickname — just "Lucy"
    var speakerEl = boxEl.querySelector('.tut-speaker');
    if (speakerEl) speakerEl.innerHTML = 'Lucy';
    showEl(boxEl);

    queueDialogues([
      'You? Make history? Ha!',
      'You look as ready as an Aztec inviting a conquistador to dinner.',
      'If you want to make history, you\'re going to need a lesson from your ancestors.'
    ], function () {
      // After last line: fade Lucy + home screen, then hand off to caller
      TS.active = false;
      var homeEl = document.getElementById('screen-home');
      if (typeof gsap !== 'undefined') {
        gsap.to([boxEl, homeEl], {
          opacity: 0, duration: 0.55, ease: 'power1.in',
          onComplete: function () {
            homeEl.style.opacity = '';
            boxEl.style.opacity  = '';
            hideEl(boxEl);
            onDone();
          }
        });
      } else {
        hideEl(boxEl);
        onDone();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MATCHUP SCREEN  — cinematic Lucy vs Ötzi intro
     Shown between the intro video and the tutorial battle.
     Calls onDone() when the VS hold completes.
  ═══════════════════════════════════════════════════════════════ */

  function showMatchupScreen(onDone) {
    var TYPE_SPEED = 28;   // ms per character — matches tutorial typewriter
    var phase      = 0;    // 0=lucyLine 1=otziSlides+line 2=lucyReply 3=vsReveal
    var typing     = false;
    var fullText   = '';
    var typeTimer  = null;
    var _mBlipCt   = 0;
    var _mAudioCtx = null;

    /* ── Minimal typewriter blip (self-contained) ─────────── */
    function blip() {
      _mBlipCt++;
      if (_mBlipCt % 3 !== 0) return;
      if (!_mAudioCtx) {
        try { _mAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return; }
      }
      try {
        var osc  = _mAudioCtx.createOscillator();
        var gain = _mAudioCtx.createGain();
        osc.connect(gain); gain.connect(_mAudioCtx.destination);
        osc.type = 'sine'; osc.frequency.value = 420;
        var t = _mAudioCtx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.07, t + 0.005);
        gain.gain.linearRampToValueAtTime(0,    t + 0.035);
        osc.start(t); osc.stop(t + 0.04);
      } catch (e) {}
    }

    /* ── Ötzi's matchup blip — triangle 120 Hz, longer decay ── */
    function blipOtzi() {
      _mBlipCt++;
      if (_mBlipCt % 3 !== 0) return;
      if (!_mAudioCtx) {
        try { _mAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return; }
      }
      try {
        var osc  = _mAudioCtx.createOscillator();
        var gain = _mAudioCtx.createGain();
        osc.connect(gain); gain.connect(_mAudioCtx.destination);
        osc.type = 'triangle'; osc.frequency.value = 120;
        var t = _mAudioCtx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.14, t + 0.008);
        gain.gain.linearRampToValueAtTime(0,    t + 0.060);
        osc.start(t); osc.stop(t + 0.07);
      } catch (e) {}
    }

    /* ── Lightning crack sound ────────────────────────────── */
    function playLightningSound() {
      if (!_mAudioCtx) {
        try { _mAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return; }
      }
      try {
        var dur   = 0.35;
        var sRate = _mAudioCtx.sampleRate;
        var len   = Math.floor(sRate * dur);
        var buf   = _mAudioCtx.createBuffer(1, len, sRate);
        var data  = buf.getChannelData(0);
        for (var i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
        }
        var src  = _mAudioCtx.createBufferSource();
        src.buffer = buf;
        var hpf  = _mAudioCtx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 600;
        var gain = _mAudioCtx.createGain();
        gain.gain.value = 0.65;
        src.connect(hpf); hpf.connect(gain); gain.connect(_mAudioCtx.destination);
        src.start();
      } catch (e) {}
    }

    /* ── Build DOM ────────────────────────────────────────── */
    var screen = document.createElement('div');
    screen.id  = 'matchup-screen';

    /* Lucy group — portrait col + dialogue box, top-left */
    var lucyGroup = document.createElement('div');
    lucyGroup.className = 'matchup-lucy-group';

    var lucyPortCol = document.createElement('div');
    lucyPortCol.className = 'matchup-portrait-col';

    var lucyFrame = document.createElement('div');
    lucyFrame.className = 'matchup-portrait-frame';
    var lucyImg = document.createElement('img');
    lucyImg.className = 'matchup-portrait-img';
    lucyImg.src = 'images/Lucy.png';
    lucyImg.alt = 'Lucy';
    lucyImg.onerror = function () { this.style.display = 'none'; };
    lucyFrame.appendChild(lucyImg);

    var lucyNameCard = document.createElement('div');
    lucyNameCard.className = 'matchup-name-card';
    var lucyNameTxt = document.createElement('div');
    lucyNameTxt.className = 'matchup-name-text';
    lucyNameTxt.innerHTML = 'Lucy<br><span class="matchup-name-sub">The Ancient One</span>';
    lucyNameCard.appendChild(lucyNameTxt);

    lucyPortCol.appendChild(lucyFrame);
    lucyPortCol.appendChild(lucyNameCard);

    var lucyDlg = document.createElement('div');
    lucyDlg.className = 'matchup-dialogue';
    var lucyDlgText = document.createElement('div');
    lucyDlgText.className = 'matchup-dialogue-text';
    var lucyDlgHint = document.createElement('div');
    lucyDlgHint.className = 'matchup-dialogue-hint';
    lucyDlgHint.textContent = '\u25b6 Click to continue';
    lucyDlg.appendChild(lucyDlgText);
    lucyDlg.appendChild(lucyDlgHint);

    lucyGroup.appendChild(lucyPortCol);
    lucyGroup.appendChild(lucyDlg);

    /* Ötzi group — dialogue box + portrait col, bottom-right */
    var otziGroup = document.createElement('div');
    otziGroup.className = 'matchup-otzi-group';

    var otziDlg = document.createElement('div');
    otziDlg.className = 'matchup-dialogue';
    var otziDlgText = document.createElement('div');
    otziDlgText.className = 'matchup-dialogue-text';
    var otziDlgHint = document.createElement('div');
    otziDlgHint.className = 'matchup-dialogue-hint';
    otziDlgHint.textContent = '\u25b6 Click to continue';
    otziDlg.appendChild(otziDlgText);
    otziDlg.appendChild(otziDlgHint);

    var otziPortCol = document.createElement('div');
    otziPortCol.className = 'matchup-portrait-col';

    var otziFrame = document.createElement('div');
    otziFrame.className = 'matchup-portrait-frame';
    var otziImg = document.createElement('img');
    otziImg.className = 'matchup-portrait-img';
    otziImg.src = 'images/Otzi.jpg';
    otziImg.alt = '\u00d6tzi';
    otziImg.onerror = function () { this.style.display = 'none'; };
    otziFrame.appendChild(otziImg);

    var otziNameCard = document.createElement('div');
    otziNameCard.className = 'matchup-name-card';
    var otziNameTxt = document.createElement('div');
    otziNameTxt.className = 'matchup-name-text';
    otziNameTxt.innerHTML = '\u00d6tzi<br><span class="matchup-name-sub">The Iceman</span>';
    otziNameCard.appendChild(otziNameTxt);

    otziPortCol.appendChild(otziFrame);
    otziPortCol.appendChild(otziNameCard);

    /* Dialogue on left of Otzi's portrait */
    otziGroup.appendChild(otziDlg);
    otziGroup.appendChild(otziPortCol);

    /* VS graphic (absolutely centered in screen) */
    var vsWrap = document.createElement('div');
    vsWrap.className = 'matchup-vs-wrap';
    var vsTxt = document.createElement('div');
    vsTxt.className = 'matchup-vs-text';
    vsTxt.textContent = 'VS';
    vsWrap.appendChild(vsTxt);

    /* White flash overlay for lightning transition */
    var flashEl = document.createElement('div');
    flashEl.className = 'matchup-flash';

    screen.appendChild(lucyGroup);
    screen.appendChild(otziGroup);
    screen.appendChild(vsWrap);
    screen.appendChild(flashEl);
    document.body.appendChild(screen);

    /* ── GSAP initial states ──────────────────────────────── */
    gsap.set(lucyGroup,   { x: -560, opacity: 0 });
    gsap.set(otziGroup,   { x:  560, opacity: 0 });
    gsap.set(lucyDlg,     { opacity: 0 });
    gsap.set(lucyDlgHint, { opacity: 0 });
    gsap.set(otziDlg,     { opacity: 0 });
    gsap.set(otziDlgHint, { opacity: 0 });
    gsap.set(vsWrap,      { scale: 0, opacity: 0 });
    gsap.set(flashEl,     { opacity: 0 });

    /* ── Active dialogue refs (for skip-to-end) ───────────── */
    var activeDlgText = null;
    var activeDlgHint = null;
    var animating     = false;  // blocks advance() during slide animations

    /* ── Typewriter — accepts optional blipFn ─────────────── */
    function typeIt(dlgText, dlgHint, text, blipFn) {
      blipFn = blipFn || blip;
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
      fullText      = text;
      typing        = true;
      _mBlipCt      = 0;
      activeDlgText = dlgText;
      activeDlgHint = dlgHint;
      dlgText.textContent = '';
      gsap.set(dlgHint, { opacity: 0 });
      var idx = 0;
      typeTimer = setInterval(function () {
        idx++;
        dlgText.textContent = fullText.slice(0, idx);
        blipFn();
        if (idx >= fullText.length) {
          clearInterval(typeTimer); typeTimer = null;
          typing = false;
          gsap.to(dlgHint, { opacity: 1, duration: 0.3 });
        }
      }, TYPE_SPEED);
    }

    function showLucyLine(text) {
      gsap.to(lucyDlg, { opacity: 1, duration: 0.25 });
      typeIt(lucyDlgText, lucyDlgHint, text, blip);
    }

    function showOtziLine(text) {
      gsap.to(otziDlg, { opacity: 1, duration: 0.25 });
      typeIt(otziDlgText, otziDlgHint, text, blipOtzi);
    }

    /* ── Lightning flash → battle screen transition ───────── */
    function doLightningTransition() {
      playLightningSound();
      var tl = gsap.timeline();
      tl.to(flashEl, { opacity: 0.85, duration: 0.05 })
        .to(flashEl, { opacity: 0,    duration: 0.07 })
        .to(flashEl, { opacity: 0.6,  duration: 0.04 })
        .to(flashEl, { opacity: 0,    duration: 0.09 })
        .to(flashEl, { opacity: 1,    duration: 0.18,
            onComplete: function () {
              // Full white — swap to battle screen, then fade out
              var bodyFlash = document.createElement('div');
              bodyFlash.style.cssText =
                'position:fixed;inset:0;background:#fff;z-index:4999;pointer-events:none;';
              document.body.appendChild(bodyFlash);
              teardown();
              onDone();
              gsap.to(bodyFlash, {
                opacity: 0, duration: 0.55, delay: 0.05,
                onComplete: function () {
                  if (bodyFlash.parentNode) bodyFlash.parentNode.removeChild(bodyFlash);
                }
              });
            }
          });
    }

    /* ── Phase advance (click / spacebar / enter) ─────────── */
    function advance() {
      if (animating) return;

      // First click while typing → skip to end of current line
      if (typing) {
        clearInterval(typeTimer); typeTimer = null;
        typing = false;
        if (activeDlgText) activeDlgText.textContent = fullText;
        if (activeDlgHint) gsap.to(activeDlgHint, { opacity: 1, duration: 0 });
        return;
      }

      phase++;

      if (phase === 1) {
        showLucyLine('Let me show you how we do things around here\u2026');

      } else if (phase === 2) {
        // Ötzi slides in from the right; block advance until he lands
        animating = true;
        gsap.to(otziGroup, {
          x: 0, opacity: 1, duration: 0.75, ease: 'power3.out',
          onComplete: function () {
            animating = false;
            showOtziLine('Not so fast grandma.');
          }
        });

      } else if (phase === 3) {
        showLucyLine('What do you want, \u00d6tzi?');

      } else if (phase === 4) {
        showOtziLine('The kid doesn\u2019t want to learn how to smack rocks together.');

      } else if (phase === 5) {
        showLucyLine('I didn\u2019t stand up so you could fall and die in ice.');

      } else if (phase === 6) {
        // VS pops center, then lightning flash to battle
        animating = true;
        gsap.to(lucyDlg, { opacity: 0, duration: 0.2 });
        gsap.to(otziDlg, { opacity: 0, duration: 0.2 });
        gsap.to(vsWrap, {
          scale: 1, opacity: 1,
          duration: 0.55, delay: 0.2,
          ease: 'back.out(1.6)',
          onComplete: function () {
            setTimeout(doLightningTransition, 2000);
          }
        });
      }
    }

    /* ── Input listeners ──────────────────────────────────── */
    screen.addEventListener('click', advance);
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
    }
    document.addEventListener('keydown', onKey);

    /* ── Teardown ─────────────────────────────────────────── */
    function teardown() {
      document.removeEventListener('keydown', onKey);
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
      if (screen.parentNode) screen.parentNode.removeChild(screen);
    }

    /* ── Kick off: Lucy slides in, shows opening line ─────── */
    animating = true;
    gsap.to(lucyGroup, {
      x: 0, opacity: 1, duration: 0.75, ease: 'power3.out',
      onComplete: function () {
        animating = false;
        showLucyLine('Pretty cool for a 3.2 million-year-old, huh?');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC ENTRY POINT  — called after the intro video ends
  ═══════════════════════════════════════════════════════════════ */

  function startTutorial() {
    if (!boxEl) initDOMRefs();

    var speakerEl = boxEl.querySelector('.tut-speaker');
    if (speakerEl) speakerEl.textContent = 'Lucy';

    window.tutorialActive = true;

    TS.active      = true;
    TS.turn        = 1;
    TS.capital     = 5;
    TS.playerHand  = PLAYER_T1_HAND.slice();
    TS.playerSlots = emptySlotMap();
    TS.aiSlots     = emptySlotMap();
    TS.awaitAction        = null;
    TS.freeEndCb          = null;
    TS.playerWon          = null;
    TS.useBubbles         = true;
    TS.abilitiesActive    = false;
    TS.abilityCardsToTap  = [];
    TS.abilityCardsTapped = {};
    TS.needMagellanMove      = false;
    TS.bonusCapitalNextTurn  = 0;
    TS.playerFirst           = Math.random() < 0.5;

    showEl(skipEl);
    setupBattle();
  }

  function emptySlotMap() {
    var m = {};
    T_LOCS.forEach(function (l) { m[l.id] = [null, null, null, null]; });
    return m;
  }

  /* ── DOM init ──────────────────────────────────────────────── */

  function initDOMRefs() {
    boxEl        = document.getElementById('tut-box');
    textEl       = document.getElementById('tut-text');
    hintEl       = document.getElementById('tut-hint');
    dimEl        = document.getElementById('tut-dim');
    skipEl       = document.getElementById('tut-skip');
    endEl        = document.getElementById('tut-end');
    playerHandEl = document.getElementById('battle-player-hand');
    boardEl      = document.getElementById('battle-board');
    endTurnBtnEl = document.getElementById('battle-end-turn');

    // Lucy comic bubble (battle tutorial)
    lucyBubbleEl     = document.getElementById('tut-lucy-bubble');
    lucyBubbleTextEl = document.getElementById('tut-lucy-text');
    lucyBubbleHintEl = document.getElementById('tut-lucy-hint');
    lucyBubbleEl.addEventListener('click', function () { advanceDialogue(); });

    // Create Otzi comic bubble dynamically
    otziBoxEl = document.createElement('div');
    otziBoxEl.id = 'tut-otzi-box';
    otziBoxEl.innerHTML =
      '<div id="tut-otzi-text" class="tut-bubble-text"></div>' +
      '<div class="tut-bubble-hint" id="tut-otzi-hint">\u25b6 Click to continue</div>';
    otziBoxEl.style.display = 'none';
    document.body.appendChild(otziBoxEl);
    otziTextEl = document.getElementById('tut-otzi-text');
    otziBoxEl.addEventListener('click', function () { advanceOtzi(); });

    // Click tut-box or spacebar → advance dialogue
    boxEl.addEventListener('click', function () { advanceDialogue(); });
    document.addEventListener('keydown', function (e) {
      if (!TS.active) return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); advanceDialogue(); }
    });

    // Tutorial End Turn button
    endTurnBtnEl.addEventListener('click', function () {
      if (!TS.active) return;
      if (TS.awaitAction === 'end_turn') { onEndTurnClicked(); }
      else if (TS.awaitAction === 'free_end_turn') { onFreeEndTurn(); }
    });

    // Dim overlay — advances dialogue when not waiting for player action
    dimEl.addEventListener('click', function () {
      if (TS.awaitAction) return;
      advanceDialogue();
    });

    // Skip button
    skipEl.addEventListener('click', exitTutorial);

    // Completion panel buttons
    document.getElementById('tut-btn-ready').addEventListener('click', finishTutorial);
    document.getElementById('tut-btn-again').addEventListener('click', function () {
      hideEl(endEl);
      startTutorial();
    });

    // Board-level drag handlers for card placement
    initBoardDrag();

    // Full-screen click-anywhere overlay (advances dialogue on click)
    clickOverlayEl = document.createElement('div');
    clickOverlayEl.id = 'tut-click-overlay';
    document.body.appendChild(clickOverlayEl);
    clickOverlayEl.addEventListener('click', function () {
      if (otziBoxEl && otziBoxEl.style.display !== 'none') {
        advanceOtzi();
      } else {
        advanceDialogue();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     BATTLE SETUP
  ═══════════════════════════════════════════════════════════════ */

  function setupBattle() {
    showScreen('screen-battle');
    window.initBattleUI(T_LOCS);
    capitalNumEl = document.getElementById('battle-capital-num');
    endTurnBtnEl.disabled = true;
    var resetBtn = document.getElementById('battle-reset-turn');
    resetBtn.disabled = true;
    resetBtn.style.display = 'none';
    document.getElementById('btn-back-results').style.display = 'none';

    // Turn 1: only Rift Valley visible; Timbuktu and Scandinavia hidden
    var timbCol = boardEl.querySelector('.battle-col[data-loc-id="5"]');
    var scanCol = boardEl.querySelector('.battle-col[data-loc-id="1"]');
    if (timbCol) { timbCol.style.opacity = '0'; timbCol.style.pointerEvents = 'none'; }
    if (scanCol) { scanCol.style.opacity = '0'; scanCol.style.pointerEvents = 'none'; }

    // Hide all location ability text
    boardEl.querySelectorAll('.battle-loc-ability').forEach(function (el) {
      el.classList.add('tut-ability-hidden');
    });

    // Hide music player and stop any background music during tutorial
    var _musicCtrl = document.getElementById('battle-music-ctrl');
    if (_musicCtrl) _musicCtrl.style.display = 'none';
    if (typeof Howler !== 'undefined') Howler.stop();

    setHeader(1, 'SELECT CARDS', 5);
    renderHand(TS.playerHand);
    step_openingDialogue();
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP MACHINE — TURN 1
  ═══════════════════════════════════════════════════════════════ */

  function step_openingDialogue() {
    showEl(lucyBubbleEl);
    hideEl(boxEl);

    queueDialogues(["Let\u2019s show \u00d6tzi how history is written."], function () {
      showOtziLine("Like you can even write\u2026", function () {

        // Rift Valley white glow on — targets the full column (background image is on .battle-col)
        var riftTileEl = boardEl.querySelector('.battle-col[data-loc-id="2"]');
        if (riftTileEl) riftTileEl.classList.add('tut-white-glow');

        queueDialogues(["See The Great Rift Valley?"], function () {
          queueDialogues(["Aside from being the birthplace of humanity\u2026"], function () {
            queueDialogues(["That\u2019s where you play cards to gain Influence Points."], function () {

              // Rift glow off
              if (riftTileEl) riftTileEl.classList.remove('tut-white-glow');

              showOtziLine("Not more than me.", function () {
                queueDialogues(["Definitely more than him."], function () {

                  queueDialogues(["You spend Capital to play cards."], function () {
                    // Citizens pops + CC highlight together on this line
                    var cEl = getHandCardEl(1);
                    if (cEl) {
                      gsap.killTweensOf(cEl);
                      gsap.set(cEl, { zIndex: 100 });
                      gsap.to(cEl, { scale: 1.35, duration: 0.14, ease: 'power2.out' });
                    }
                    pinNumHighlight(cEl, 'cc');
                    queueDialogues(["This is this card\u2019s Capital cost."], function () {

                      // CC highlight off, Citizens stays popped
                      removeNumHighlight();

                      // Capital counter white glow on
                      var capEl = document.getElementById('battle-capital-info');
                      if (capEl) capEl.classList.add('tut-white-glow');

                      queueDialogues(["Each turn you have 5 Capital to spend"], function () {

                        // Capital glow off (player clicked to continue)
                        if (capEl) capEl.classList.remove('tut-white-glow');

                        // IP highlight — Citizens still popped
                        var cEl2 = getHandCardEl(1);
                        pinNumHighlight(cEl2, 'ip');

                        queueDialogues(["The number on the top right of the card"], function () {
                          queueDialogues(["Is the card\u2019s Influence Points."], function () {

                            // IP highlight off
                            removeNumHighlight();

                            queueDialogues(["Let\u2019s put that card into play."], function () {
                              step_playCitizens();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function step_playCitizens() {
    var citizensEl = getHandCardEl(1);
    lit(citizensEl);
    getPlayerSlotsFor(2).forEach(lit);
    TS.awaitAction = 'citizens_rift';
    setLocked(true);
    updateHint();
  }

  function onCitizensPlaced() {
    TS.awaitAction = null;
    setLocked(false);
    var citizensEl = getHandCardEl(1);
    unlit(citizensEl);
    getPlayerSlotsFor(2).forEach(unlit);

    queueDialogues([
      "But your turn isn\u2019t over yet.",
      "You still have more Capital to spend.",
      "Select another card to play"
    ], function () {
      lit(endTurnBtnEl);
      queueDialogues(["When you\u2019re done click \u2018End Turn\u2019 and watch your influence grow."], function () {
        hideEl(lucyBubbleEl);
        step_freeTurn(onT1EndTurn);
        startInactivityTimer();
      });
    });
  }

  /* ── Inactivity timer ──────────────────────────────────────── */

  var _inactivityTimer = null;

  function startInactivityTimer() {
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(function () {
      lit(endTurnBtnEl);
    }, 90000);
  }

  function cancelInactivityTimer() {
    if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null; }
  }

  /* ── Turn management dispatcher ──────────────────────────────── */

  function startTurn(n) {
    TS.turn        = n;
    TS.capital     = 5 + (TS.bonusCapitalNextTurn || 0);
    TS.bonusCapitalNextTurn = 0;
    TS.playerFirst = !TS.playerFirst;   // alternate from previous turn
    if (n === 2) { startTurn2(); return; }
    if (n === 3) { startTurn3(); return; }
    if (n === 4) { startTurn4(); return; }
    if (n === 5) { startTurn5(); return; }
  }

  /* ── Turn 1 end ──────────────────────────────────────────────── */

  function onT1EndTurn() {
    cancelInactivityTimer();
    unlit(endTurnBtnEl);
    setHeader(1, 'REVEAL', TS.capital);
    placeAICards(1);
    runReveal(1, function () {
      var ps = scoreAt('player', 2), as = scoreAt('opp', 2);
      if (ps > as) {
        showOtziLine("A tie? How exciting\u2026", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["You want to see excitement?"], function () {
            revealNewLocations(function () { startTurn(2); });
          });
        });
      } else {
        showOtziLine("I told you, I\u2019d win.", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["We\u2019re just getting started."], function () {
            revealNewLocations(function () { startTurn(2); });
          });
        });
      }
    });
  }

  /* ── Turn 2 ──────────────────────────────────────────────────── */

  function startTurn2() {
    PLAYER_T2_ADD.forEach(function (id) {
      if (TS.playerHand.indexOf(id) === -1) TS.playerHand.push(id);
    });
    renderHand(TS.playerHand);
    setHeader(2, 'SELECT CARDS', 5);
    // Lucy is visible from onT1EndTurn callback
    queueDialogues([
      "The world is a big place.",
      "Your goal is to gain more Influence Points at 2 of 3 locations."
    ], function () {
      hideEl(lucyBubbleEl);
      step_freeTurn(onT2EndTurn);
    });
  }

  function onT2EndTurn() {
    setHeader(2, 'REVEAL', TS.capital);
    placeAICards(2);
    runReveal(2, function () {
      var pw = 0, ow = 0;
      T_LOCS.forEach(function (loc) {
        var ps = scoreAt('player', loc.id), as = scoreAt('opp', loc.id);
        if (ps > as) pw++; else if (as > ps) ow++;
      });
      if (pw > ow) {
        showOtziLine("History has a long arc.", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["And it bends to me."], function () { startTurn(3); });
        });
      } else {
        showOtziLine("The world gets bigger and you get smaller.", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["You spelled smarter wrong."], function () { startTurn(3); });
        });
      }
    });
  }

  /* ── Turn 3 — abilities unlock ───────────────────────────────── */

  function startTurn3() {
    TS.abilitiesActive = true;
    PLAYER_T3_ADD.forEach(function (id) {
      if (TS.playerHand.indexOf(id) === -1) TS.playerHand.push(id);
    });
    // Build ability tap list before renderHand so glow class is applied correctly
    TS.abilityCardsToTap = TS.playerHand.filter(function (id) {
      var card = CARDS.find(function (c) { return c.id === id; });
      return card && card.ability !== null;
    });
    TS.abilityCardsTapped = {};
    renderHand(TS.playerHand);
    setHeader(3, 'SELECT CARDS', 5);

    if (typeof SFX !== 'undefined' && typeof SFX.atOnce === 'function') SFX.atOnce();

    // Lucy is visible from onT2EndTurn callback
    queueDialogues(["Let\u2019s evolve things."], function () {
      queueDialogues([
        "Most cards have special abilities.",
        "Click on your cards to see what they do."
      ], function () {
        TS.awaitAction = 'ability_clicks';
        endTurnBtnEl.disabled = true;
        updateHint();
      });
    });
  }

  function checkAllAbilitiesClicked() {
    var allDone = TS.abilityCardsToTap.every(function (id) {
      return !!TS.abilityCardsTapped[id];
    });
    if (!allDone) return;
    TS.awaitAction = null;
    var magellanEl = getHandCardEl(24);
    if (magellanEl) lit(magellanEl);
    // lucyBubble still visible
    queueDialogues(["Put them to work."], function () {
      TS.awaitAction = 'magellan_play';
      endTurnBtnEl.disabled = true;
      updateHint();
    });
  }

  function onT3EndTurn() {
    setHeader(3, 'REVEAL', TS.capital);
    placeAICards(3);
    runReveal(3, function () {
      var pw = 0, ow = 0;
      T_LOCS.forEach(function (loc) {
        var ps = scoreAt('player', loc.id), as = scoreAt('opp', loc.id);
        if (ps > as) pw++; else if (as > ps) ow++;
      });
      if (pw > ow) {
        showOtziLine("Grrr\u2026", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["Australopithecus got your tongue?"], function () { startTurn(4); });
        });
      } else {
        showOtziLine("Muahahaha\u2026", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["Do not lose to this homo sapien."], function () { startTurn(4); });
        });
      }
    });
  }

  /* ── Turn 4 — location abilities + Magellan move ─────────────── */

  function startTurn4() {
    PLAYER_T4_ADD.forEach(function (id) {
      if (TS.playerHand.indexOf(id) === -1) TS.playerHand.push(id);
    });
    renderHand(TS.playerHand);
    setHeader(4, 'SELECT CARDS', 5);

    if (typeof SFX !== 'undefined' && typeof SFX.atOnce === 'function') SFX.atOnce();

    // Fade in location ability text + glow nameplates
    boardEl.querySelectorAll('.battle-loc-ability').forEach(function (el) {
      el.classList.remove('tut-ability-hidden');
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' });
    });
    boardEl.querySelectorAll('.battle-loc-name').forEach(function (el) {
      el.classList.add('tut-loc-glow');
      setTimeout(function () { el.classList.remove('tut-loc-glow'); }, 2200);
    });

    // Lucy is visible from onT3EndTurn callback
    queueDialogues(["The fun isn\u2019t done yet."], function () {
      queueDialogues(["Locations also have their own abilities"], function () {
        // Highlight Magellan on board
        var magellanPos = findPlayerCard(24);
        if (magellanPos) {
          var mSlotEl = getTutSlotEl('player', magellanPos.locId, magellanPos.si);
          if (mSlotEl) lit(mSlotEl);
        }
        queueDialogues(["Speaking of special abilities, some cards can move."], function () {
          step_magellanMove();
        });
      });
    });
  }

  function step_magellanMove() {
    var magellanPos = findPlayerCard(24);
    if (!magellanPos) {
      // Magellan not on board — skip directly to free turn
      queueDialogues(["Now finish the rest of your turn."], function () {
        hideEl(lucyBubbleEl);
        step_freeTurn(onT4EndTurn);
      });
      return;
    }
    makeBoardCardMoveable(magellanPos.locId, magellanPos.si);
    queueDialogues(["Try dragging Magellan to a new location."], function () {
      TS.awaitAction = 'magellan_board_move';
      updateHint();
    });
  }

  function onMagellanMoved() {
    TS.awaitAction = null;
    // lucyBubble still showing from step_magellanMove
    queueDialogues(["Nice. Now finish the rest of your turn."], function () {
      hideEl(lucyBubbleEl);
      step_freeTurn(onT4EndTurn);
    });
  }

  function onT4EndTurn() {
    setHeader(4, 'REVEAL', TS.capital);
    placeAICards(4);
    runReveal(4, function () {
      var pw = 0, ow = 0;
      T_LOCS.forEach(function (loc) {
        var ps = scoreAt('player', loc.id), as = scoreAt('opp', loc.id);
        if (ps > as) pw++; else if (as > ps) ow++;
      });
      if (pw > ow) {
        showOtziLine("I don\u2019t like where this is headed.", function () {
          showEl(lucyBubbleEl);
          startTurn(5);
        });
      } else {
        showOtziLine("I eat flint chips like you for breakfast.", function () {
          showEl(lucyBubbleEl);
          queueDialogues(["You eat flint chips for breakfast?"], function () { startTurn(5); });
        });
      }
    });
  }

  /* ── Turn 5 — final turn ─────────────────────────────────────── */

  function startTurn5() {
    PLAYER_T5_ADD.forEach(function (id) {
      if (TS.playerHand.indexOf(id) === -1) TS.playerHand.push(id);
    });
    renderHand(TS.playerHand);
    setHeader(5, 'SELECT CARDS', 5);
    // Lucy is visible from onT4EndTurn callback
    queueDialogues([
      "I\u2019m all out of surprises.",
      "Take him down."
    ], function () {
      hideEl(lucyBubbleEl);
      step_freeTurn(onT5EndTurn);
    });
  }

  function onT5EndTurn() {
    setHeader(5, 'REVEAL', TS.capital);
    placeAICards(5);
    runReveal(5, function () {
      showPostGameDialogue(determineWinner());
    });
  }

  /* ── Post-game flow ──────────────────────────────────────────── */

  function determineWinner() {
    var pw = 0, ow = 0;
    T_LOCS.forEach(function (loc) {
      var ps = scoreAt('player', loc.id), as = scoreAt('opp', loc.id);
      if (ps > as) pw++; else if (as > ps) ow++;
    });
    return pw > ow ? 'player' : (ow > pw ? 'otzi' : 'draw');
  }

  function showPostGameDialogue(won) {
    if (won === 'player') {
      showOtziLine("No! Not again.", function () {
        showEl(lucyBubbleEl);
        queueDialogues(["As always, history has been written by the victors."], function () {
          showTutorialResults(won);
        });
      });
    } else {
      showOtziLine("The mountain keeps the strong and buries the weak.", function () {
        showEl(lucyBubbleEl);
        queueDialogues(["You\u2019re not done. Adapt and try again."], function () {
          showTutorialResults(won);
        });
      });
    }
  }

  function showTutorialResults(won) {
    // Partial teardown — keep Lucy bubble available for final dialogue
    clearSelection();
    removeNumHighlight();
    cancelInactivityTimer();
    TS.active     = false;
    TS.useBubbles = false;
    window.tutorialActive = false;
    if (TS.typeTimer) { clearInterval(TS.typeTimer); TS.typeTimer = null; }
    setLocked(false);
    hideEl(lucyBubbleEl);
    hideEl(skipEl);
    hideEl(dimEl);
    hideEl(endEl);
    if (otziBoxEl) hideEl(otziBoxEl);
    if (_otziTypeTimer) { clearInterval(_otziTypeTimer); _otziTypeTimer = null; }
    if (clickOverlayEl) clickOverlayEl.style.pointerEvents = 'none';
    document.body.classList.remove('tut-locked');
    document.querySelectorAll('.tut-lit').forEach(function (el) { el.classList.remove('tut-lit'); });
    document.querySelectorAll('.tut-ability-glow').forEach(function (el) { el.classList.remove('tut-ability-glow'); });

    // Build result data from tutorial state
    var locResults = T_LOCS.map(function (loc) {
      var pIP = 0, aIP = 0;
      TS.playerSlots[loc.id].forEach(function (sd) { if (sd && sd.revealed) pIP += tEffectiveIP(sd); });
      TS.aiSlots[loc.id].forEach(function (sd)     { if (sd && sd.revealed) aIP += tEffectiveIP(sd); });
      return { loc: loc, playerIP: pIP, aiIP: aIP,
               winner: pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie' };
    });
    var pW = locResults.filter(function (r) { return r.winner === 'player'; }).length;
    var aW = locResults.filter(function (r) { return r.winner === 'ai';     }).length;
    var outcome, tb = false, pT = 0, aT = 0;
    if      (pW >= 2) { outcome = 'player'; }
    else if (aW >= 2) { outcome = 'ai'; }
    else {
      tb = true;
      pT = locResults.reduce(function (s, r) { return s + r.playerIP; }, 0);
      aT = locResults.reduce(function (s, r) { return s + r.aiIP;     }, 0);
      outcome = pT > aT ? 'player' : aT > pT ? 'ai' : 'draw';
    }
    var result = { outcome: outcome, tiebreaker: tb, playerWins: pW, aiWins: aW,
                   playerTotal: pT, aiTotal: aT, locResults: locResults };

    // Populate result screen
    if (typeof window.showResult === 'function') window.showResult(result);

    // Location win animations while still on battle screen
    if (typeof Anim !== 'undefined') {
      locResults.forEach(function (lr) {
        if (lr.winner !== 'tie') {
          var locTile = boardEl.querySelector('.battle-location[data-loc-id="' + lr.loc.id + '"]');
          if (locTile) Anim.locationWin(locTile);
        }
      });
    }

    // SFX
    if (typeof SFX !== 'undefined') {
      if (outcome === 'player') SFX.gameWon();
      else if (outcome === 'ai') SFX.gameLost();
      else SFX.locationWon();
    }

    // Switch to result screen
    showScreen('screen-result');
    if (typeof Anim !== 'undefined') {
      if      (outcome === 'player') Anim.celebration();
      else if (outcome === 'ai')     Anim.sadResult();
    }

    // After 4 seconds Lucy's full dialogue box appears with final line
    setTimeout(function () {
      TS.active     = true;
      TS.useBubbles = false;
      hideEl(lucyBubbleEl);
      var speakerEl = boxEl ? boxEl.querySelector('.tut-speaker') : null;
      if (speakerEl) speakerEl.textContent = 'Lucy';
      showEl(boxEl);
      var line = (outcome === 'player' || outcome === 'draw')
        ? 'You did make history afterall. The Giants are waiting for you.'
        : 'Well, I said you need a lesson or two, but keep trying. Adapt. And one day, you will be ready for those Giants.';
      queueDialogues([line], function () {
        hideEl(boxEl);
        TS.active = false;
        localStorage.setItem('sog_tutorial_complete', 'true');
      });
    }, 4000);
  }

  function goHome(won) {
    // Partial teardown — preserves boxEl for home-screen dialogue
    clearSelection();
    removeNumHighlight();
    cancelInactivityTimer();
    TS.active     = false;
    TS.useBubbles = false;
    window.tutorialActive = false;
    if (TS.typeTimer) { clearInterval(TS.typeTimer); TS.typeTimer = null; }
    setLocked(false);
    hideEl(lucyBubbleEl);
    hideEl(skipEl);
    hideEl(dimEl);
    hideEl(endEl);
    if (otziBoxEl) hideEl(otziBoxEl);
    if (_otziTypeTimer) { clearInterval(_otziTypeTimer); _otziTypeTimer = null; }
    document.body.classList.remove('tut-locked');
    document.querySelectorAll('.tut-lit').forEach(function (el) { el.classList.remove('tut-lit'); });
    document.querySelectorAll('.tut-valid-slot').forEach(function (el) { el.classList.remove('tut-valid-slot'); });
    document.querySelectorAll('.tut-ability-glow').forEach(function (el) { el.classList.remove('tut-ability-glow'); });
    document.querySelectorAll('.tut-moveable').forEach(function (el) {
      el.classList.remove('tut-moveable'); el.removeAttribute('draggable');
    });
    document.querySelectorAll('.tut-loc-glow').forEach(function (el) { el.classList.remove('tut-loc-glow'); });
    document.querySelectorAll('.tut-ability-hidden').forEach(function (el) { el.classList.remove('tut-ability-hidden'); });
    var _musicCtrl = document.getElementById('battle-music-ctrl');
    if (_musicCtrl) _musicCtrl.style.display = '';

    showScreen('screen-home');
    showHomeOutcomeDialogue(won);
  }

  function showHomeOutcomeDialogue(won) {
    TS.active     = true;
    TS.useBubbles = false;
    var speakerEl = boxEl ? boxEl.querySelector('.tut-speaker') : null;
    if (speakerEl) speakerEl.textContent = 'Lucy';
    showEl(boxEl);
    var line = (won === 'player' || won === 'draw')
      ? "You just made history, kid. The Giants are waiting for you. Think you can handle them?"
      : "Perhaps a little more practice\u2026 but the Giants are waiting whenever you\u2019re ready.";
    showDialogue(line, function () {
      if (typeof gsap !== 'undefined') {
        gsap.to(boxEl, { opacity: 0, duration: 0.5, ease: 'power1.in', onComplete: function () {
          hideEl(boxEl);
          boxEl.style.opacity = '';
          TS.active = false;
          localStorage.setItem('sog_tutorial_complete', 'true');
        }});
      } else {
        hideEl(boxEl);
        TS.active = false;
        localStorage.setItem('sog_tutorial_complete', 'true');
      }
    });
  }

  /* ── Score helper ───────────────────────────────────────────── */

  function scoreAt(owner, locId) {
    var slots = owner === 'player' ? TS.playerSlots[locId] : TS.aiSlots[locId];
    if (!slots) return 0;
    var total = 0;
    slots.forEach(function (sd) { if (sd && sd.revealed) total += tEffectiveIP(sd); });
    return total;
  }

  /* ── AI card placement (hardcoded per turn) ──────────────────── */

  function placeAICards(turn) {
    var plays = [];
    if (turn === 1) plays = [{ l: 2, c: 21 }, { l: 2, c: 14 }]; // Nomad+JoA → Rift
    if (turn === 2) plays = [{ l: 1, c: 10 }];                   // Jesus Christ → Scandinavia
    if (turn === 3) plays = [{ l: 5, c: 18 }, { l: 5, c: 2  }]; // Juvenal+Scholar-Officials → Timbuktu
    if (turn === 4) plays = [{ l: 2, c: 3  }, { l: 5, c: 23 }]; // Justinian→Rift, ZhengHe→Timbuktu
    if (turn === 5) plays = [{ l: 1, c: 4  }, { l: 5, c: 11 }]; // EmpressWu→Scandinavia, Knight→Timbuktu
    plays.forEach(function (item) {
      var slots = TS.aiSlots[item.l]; if (!slots) return;
      var si = slots.indexOf(null); if (si === -1) return;
      var card = CARDS.find(function (c) { return c.id === item.c; }); if (!card) return;
      slots[si] = { cardId: item.c, ip: card.ip, revealed: false, contMod: 0 };
      var slotEl = getTutSlotEl('opp', item.l, si);
      if (slotEl) slotEl.className = 'battle-card-slot occupied face-down';
    });
  }

  /* ── Location reveal (T1 → T2 transition) ───────────────────── */

  function revealNewLocations(onDone) {
    var timbCol = boardEl.querySelector('.battle-col[data-loc-id="5"]');
    var scanCol = boardEl.querySelector('.battle-col[data-loc-id="1"]');

    if (typeof gsap !== 'undefined') {
      if (timbCol) gsap.fromTo(timbCol, { x: -300, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
        onStart: function () { timbCol.style.pointerEvents = ''; }
      });
      if (scanCol) gsap.fromTo(scanCol, { x: 300, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
        onStart: function () { scanCol.style.pointerEvents = ''; },
        onComplete: onDone
      });
      if (!scanCol && onDone) setTimeout(onDone, 700);
    } else {
      if (timbCol) { timbCol.style.opacity = ''; timbCol.style.pointerEvents = ''; }
      if (scanCol) { scanCol.style.opacity = ''; scanCol.style.pointerEvents = ''; }
      if (onDone) onDone();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CARD PLACEMENT
  ═══════════════════════════════════════════════════════════════ */

  function playCard(cardId, locId) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    var slots = TS.playerSlots[locId];
    if (!slots) return false;
    var si = slots.indexOf(null);
    if (si === -1 || card.cc > TS.capital) return false;

    slots[si] = { cardId: cardId, ip: card.ip, revealed: false, contMod: 0 };
    TS.capital -= card.cc;
    TS.playerHand = TS.playerHand.filter(function (id) { return id !== cardId; });

    var slotEl = getTutSlotEl('player', locId, si);
    if (slotEl) {
      slotEl.dataset.cardId = cardId;
      slotEl.className = 'battle-card-slot occupied face-up unplayed';
      slotEl.draggable = true;
      slotEl.innerHTML = '';
      var _w = document.createElement('div'); _w.className = 'db-card-img-wrap';
      var _p = document.createElement('div'); _p.className = 'db-card-img-placeholder'; _p.textContent = card.name.charAt(0);
      var _i = document.createElement('img'); _i.className = 'db-card-img'; _i.src = 'images/cards/' + card.name + '.jpg'; _i.onerror = function () { this.style.display = 'none'; };
      _w.appendChild(_p); _w.appendChild(_i);
      var _cc = document.createElement('div'); _cc.className = 'db-overlay-cc'; _cc.textContent = card.cc;
      var _ip = document.createElement('div'); _ip.className = 'db-overlay-ip'; _ip.textContent = card.ip;
      slotEl.appendChild(_w); slotEl.appendChild(_cc); slotEl.appendChild(_ip);
    }

    renderHand(TS.playerHand);
    setCapital(TS.capital);
    cancelInactivityTimer();
    startInactivityTimer();
    return true;
  }

  /* Find a player card on the board; returns {locId, si} or null */
  function findPlayerCard(cardId) {
    for (var locId in TS.playerSlots) {
      var slots = TS.playerSlots[locId];
      for (var i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].cardId === cardId) {
          return { locId: parseInt(locId, 10), si: i };
        }
      }
    }
    return null;
  }

  /* Make a revealed board-card slot draggable for the Magellan move */
  function makeBoardCardMoveable(locId, si) {
    var slotEl = getTutSlotEl('player', locId, si);
    if (!slotEl) return;
    slotEl.draggable = true;
    slotEl.classList.add('tut-moveable');
    slotEl.dataset.boardDragLocId = locId;
    slotEl.dataset.boardDragSi    = si;
  }

  /* Move a player board card to a new location (Magellan gains +1 IP per move) */
  function moveBoardCard(fromLocId, fromSi, toLocId) {
    var fromSlots = TS.playerSlots[fromLocId];
    var toSlots   = TS.playerSlots[toLocId];
    if (!fromSlots || !toSlots) return false;
    var sd = fromSlots[fromSi];
    if (!sd) return false;
    var toSi = toSlots.indexOf(null);
    if (toSi === -1) return false;

    sd.ip += 1;
    toSlots[toSi]     = sd;
    fromSlots[fromSi] = null;

    // Vacate old slot
    var fromEl = getTutSlotEl('player', fromLocId, fromSi);
    if (fromEl) {
      fromEl.className = 'battle-card-slot';
      fromEl.innerHTML = '';
      fromEl.removeAttribute('draggable');
      fromEl.classList.remove('tut-moveable');
      delete fromEl.dataset.boardDragLocId;
      delete fromEl.dataset.boardDragSi;
    }

    // Build new face-up slot
    var toEl = getTutSlotEl('player', toLocId, toSi);
    if (toEl) {
      var card = CARDS.find(function (c) { return c.id === sd.cardId; });
      toEl.className = 'battle-card-slot occupied face-up';
      toEl.innerHTML = '';
      toEl.removeAttribute('draggable');
      if (card) {
        var wrap = document.createElement('div');
        wrap.className = 'db-card-img-wrap';
        var ph = document.createElement('div');
        ph.className   = 'db-card-img-placeholder';
        ph.textContent = card.name.charAt(0);
        var img = document.createElement('img');
        img.className = 'db-card-img';
        img.src       = 'images/cards/' + card.name + '.jpg';
        img.onerror   = function () { this.style.display = 'none'; };
        wrap.appendChild(ph); wrap.appendChild(img);
        var ccEl = document.createElement('div');
        ccEl.className = 'db-overlay-cc'; ccEl.textContent = card.cc;
        var ipEl = document.createElement('div');
        ipEl.className = 'db-overlay-ip'; ipEl.textContent = sd.ip;
        toEl.appendChild(wrap); toEl.appendChild(ccEl); toEl.appendChild(ipEl);
      }
    }
    updateScores();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     REVEAL SEQUENCE
  ═══════════════════════════════════════════════════════════════ */

  function runReveal(turn, onDone) {
    // Flip all face-up unplayed player cards face-down before reveal begins
    var unplayedEls = Array.prototype.slice.call(
      document.querySelectorAll('.battle-card-slot.unplayed[data-owner="player"]')
    );
    function doReveal() {
      var pQ = [], aQ = [];
      T_LOCS.forEach(function (loc) {
        TS.playerSlots[loc.id].forEach(function (sd, i) {
          if (sd && !sd.revealed) pQ.push({ owner: 'player', locId: loc.id, si: i, sd: sd });
        });
        TS.aiSlots[loc.id].forEach(function (sd, i) {
          if (sd && !sd.revealed) aQ.push({ owner: 'opp', locId: loc.id, si: i, sd: sd });
        });
      });

      var fQ = TS.playerFirst ? pQ : aQ;
      var sQ = TS.playerFirst ? aQ : pQ;
      var combined = [];
      var max = Math.max(fQ.length, sQ.length);
      for (var i = 0; i < max; i++) {
        if (i < fQ.length) combined.push(fQ[i]);
        if (i < sQ.length) combined.push(sQ[i]);
      }

      showTutRevealHighlight(TS.playerFirst);
      var idx = 0;
      function next() {
        if (idx >= combined.length) {
          hideTutRevealHighlight();
          updateScores();
          setTimeout(onDone, 800);
          return;
        }
        var item = combined[idx++];
        flipCard(item, function () {
          updateScores();
          setTimeout(next, 1000);
        });
      }
      setTimeout(next, 700);
    } // end doReveal

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
            onComplete: doReveal
          });
        }
      });
    } else {
      unplayedEls.forEach(function (el) {
        el.classList.remove('face-up', 'unplayed');
        el.classList.add('face-down');
        el.innerHTML = '';
      });
      doReveal();
    }
  }

  function flipCard(item, proceed) {
    item.sd.revealed = true;
    var card = CARDS.find(function (c) { return c.id === item.sd.cardId; });
    if (!card) { if (proceed) proceed(); return; }
    var slotEl = getTutSlotEl(item.owner, item.locId, item.si);
    if (!slotEl) { if (proceed) proceed(); return; }

    if (typeof SFX !== 'undefined') SFX.cardReveal();

    slotEl.innerHTML = '';
    slotEl.className = 'battle-card-slot occupied face-up';
    slotEl.removeAttribute('draggable');

    var wrap = document.createElement('div');
    wrap.className = 'db-card-img-wrap';
    var ph = document.createElement('div');
    ph.className   = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);
    var img = document.createElement('img');
    img.className = 'db-card-img';
    img.src       = 'images/cards/' + card.name + '.jpg';
    img.onerror   = function () { this.style.display = 'none'; };
    wrap.appendChild(ph);
    wrap.appendChild(img);

    var ccEl = document.createElement('div');
    ccEl.className   = 'db-overlay-cc';
    ccEl.textContent = card.cc;
    var ipEl = document.createElement('div');
    ipEl.className   = 'db-overlay-ip';
    ipEl.textContent = tEffectiveIP(item.sd);

    slotEl.appendChild(wrap);
    slotEl.appendChild(ccEl);
    slotEl.appendChild(ipEl);

    if (typeof Anim !== 'undefined') Anim.cardReveal(slotEl);

    setTimeout(function () {
      fireAtOnce_tut(item.owner, item.sd.cardId, item.locId, function () {
        evalContinuous_tut();
        if (proceed) proceed();
      });
    }, 320);
  }

  function tEffectiveIP(sd) {
    return sd.ip + (sd.contMod || 0);
  }

  /* ═══════════════════════════════════════════════════════════════
     TUTORIAL ABILITY ENGINE  (active from T3 onward)
  ═══════════════════════════════════════════════════════════════ */

  /* Re-evaluate all Continuous abilities and update slot IP displays. */
  function evalContinuous_tut() {
    if (!TS.abilitiesActive) return;

    // Reset contMods
    T_LOCS.forEach(function (loc) {
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? TS.playerSlots : TS.aiSlots;
        sl[loc.id].forEach(function (s) { if (s) s.contMod = 0; });
      });
    });

    T_LOCS.forEach(function (loc) {
      var sides = [
        { own: 'player', sl: TS.playerSlots },
        { own: 'opp',    sl: TS.aiSlots     }
      ];

      // Juvenal (18): -2 IP to all revealed 4/5-CC cards at this location (both sides)
      sides.forEach(function (side) {
        side.sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || s.cardId !== 18) return;
          sides.forEach(function (side2) {
            side2.sl[loc.id].forEach(function (s2) {
              if (!s2 || !s2.revealed || s2.cardId === 18) return;
              var c2 = CARDS.find(function (c) { return c.id === s2.cardId; });
              if (c2 && c2.cc >= 4) s2.contMod = (s2.contMod || 0) - 2;
            });
          });
        });
      });

      // Voltaire (20): +4 IP if the only revealed card on that side at this location
      sides.forEach(function (side) {
        side.sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || s.cardId !== 20) return;
          var count = side.sl[loc.id].filter(function (s2) {
            return s2 && s2.revealed;
          }).length;
          if (count === 1) s.contMod = (s.contMod || 0) + 4;
        });
      });
    });

    // Refresh all revealed-slot IP displays with updated contMods
    T_LOCS.forEach(function (loc) {
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? TS.playerSlots : TS.aiSlots;
        for (var i = 0; i < 4; i++) {
          var sd = sl[loc.id][i];
          if (!sd || !sd.revealed) continue;
          var slotEl = getTutSlotEl(own, loc.id, i);
          if (!slotEl) continue;
          var ipEl = slotEl.querySelector('.db-overlay-ip');
          if (ipEl) ipEl.textContent = tEffectiveIP(sd);
        }
      });
    });
  }

  /* Fire the At Once ability for a just-revealed card (no-op before T3). */
  function fireAtOnce_tut(owner, cardId, locId, done) {
    if (!TS.abilitiesActive) { done(); return; }
    switch (cardId) {
      case 2:  tAb_ScholarOfficials(owner, locId, done); break;
      case 3:  tAb_Justinian(owner, locId, done);        break;
      case 4:  tAb_EmpressWu(owner, locId, done);        break;
      case 5:  tAb_Pacal(owner, locId, done);            break;
      case 13: tAb_HernanCortes(owner, locId, done);     break;
      case 23: tAb_ZhengHe(owner, locId, done);          break;
      default: done(); break;
    }
  }

  /* Scholar-Officials: player earns +1 Capital next turn per other card at this location. */
  function tAb_ScholarOfficials(owner, locId, done) {
    if (owner !== 'player') { done(); return; }   // AI capital not tracked
    var sl = TS.playerSlots[locId];
    var others = sl.filter(function (s) { return s && s.revealed && s.cardId !== 2; }).length;
    if (others > 0) {
      TS.bonusCapitalNextTurn += others;
      if (typeof SFX !== 'undefined') SFX.atOnce();
    }
    done();
  }

  /* Justinian: reset all revealed cards at this location to their original IP. */
  function tAb_Justinian(owner, locId, done) {
    if (typeof SFX !== 'undefined') SFX.atOnce();
    ['player', 'opp'].forEach(function (own) {
      var sl = own === 'player' ? TS.playerSlots : TS.aiSlots;
      sl[locId].forEach(function (s) {
        if (!s || !s.revealed) return;
        var card = CARDS.find(function (c) { return c.id === s.cardId; });
        if (card) s.ip = card.ip;
      });
    });
    done();
  }

  /* Pacal: trigger At Once abilities of all your other revealed cards here. */
  function tAb_Pacal(owner, locId, done) {
    var sl = owner === 'player' ? TS.playerSlots : TS.aiSlots;
    var others = sl[locId].filter(function (s) {
      return s && s.revealed && s.cardId !== 5;
    });
    var i = 0;
    function next() {
      if (i >= others.length) { done(); return; }
      var s = others[i++];
      fireAtOnce_tut(owner, s.cardId, locId, next);
    }
    next();
  }

  /* Zheng He: +2 IP to the first revealed card on your side at each adjacent location. */
  function tAb_ZhengHe(owner, locId, done) {
    if (typeof SFX !== 'undefined') SFX.atOnce();
    var locIdx = -1;
    for (var li = 0; li < T_LOCS.length; li++) {
      if (T_LOCS[li].id === locId) { locIdx = li; break; }
    }
    var adjIds = [];
    if (locIdx > 0)               adjIds.push(T_LOCS[locIdx - 1].id);
    if (locIdx < T_LOCS.length - 1) adjIds.push(T_LOCS[locIdx + 1].id);

    var sl = owner === 'player' ? TS.playerSlots : TS.aiSlots;
    adjIds.forEach(function (adjId) {
      for (var i = 0; i < 4; i++) {
        var s = sl[adjId] && sl[adjId][i];
        if (s && s.revealed) { s.ip += 2; break; }
      }
    });
    done();
  }

  /* Hernan Cortes: destroy all of your other revealed cards here, +1 IP each. */
  function tAb_HernanCortes(owner, locId, done) {
    if (typeof SFX !== 'undefined') SFX.atOnce();
    var sl = owner === 'player' ? TS.playerSlots : TS.aiSlots;
    var destroyed = 0;
    for (var i = 0; i < sl[locId].length; i++) {
      var s = sl[locId][i];
      if (!s || !s.revealed || s.cardId === 13) continue;
      sl[locId][i] = null;
      var deadEl = getTutSlotEl(owner, locId, i);
      if (deadEl) { deadEl.className = 'battle-card-slot'; deadEl.innerHTML = ''; }
      destroyed++;
    }
    // Give Cortes +1 IP for each card destroyed
    for (var j = 0; j < sl[locId].length; j++) {
      var sd = sl[locId][j];
      if (!sd || sd.cardId !== 13) continue;
      sd.ip += destroyed;
      var cortesEl = getTutSlotEl(owner, locId, j);
      if (cortesEl) {
        var ipEl = cortesEl.querySelector('.db-overlay-ip');
        if (ipEl) ipEl.textContent = tEffectiveIP(sd);
      }
      break;
    }
    done();
  }

  /* Empress Wu: push (or destroy) the highest-IP revealed Political/Military card here. */
  function tAb_EmpressWu(owner, locId, done) {
    if (typeof SFX !== 'undefined') SFX.atOnce();

    // Find highest-IP revealed Pol/Mil card at this location on either side (excluding Wu herself)
    var best = null, bestIP = -Infinity, bestOwn = null, bestIdx = -1;
    ['player', 'opp'].forEach(function (own) {
      var sl = own === 'player' ? TS.playerSlots : TS.aiSlots;
      sl[locId].forEach(function (s, i) {
        if (!s || !s.revealed || s.cardId === 4) return;
        var c = CARDS.find(function (c_) { return c_.id === s.cardId; });
        if (!c || (c.type !== 'Political' && c.type !== 'Military')) return;
        var ip = tEffectiveIP(s);
        if (ip > bestIP) { bestIP = ip; best = s; bestOwn = own; bestIdx = i; }
      });
    });
    if (!best) { done(); return; }

    var ownerSl = bestOwn === 'player' ? TS.playerSlots : TS.aiSlots;
    var pushed = false;

    // Try to push to any adjacent location with a free slot
    for (var li = 0; li < T_LOCS.length; li++) {
      if (T_LOCS[li].id === locId) continue;
      var destSl = ownerSl[T_LOCS[li].id];
      var fi = destSl.indexOf(null);
      if (fi === -1) continue;

      // Move card to destination
      destSl[fi] = best;
      ownerSl[locId][bestIdx] = null;

      var fromEl = getTutSlotEl(bestOwn, locId, bestIdx);
      if (fromEl) { fromEl.className = 'battle-card-slot'; fromEl.innerHTML = ''; }

      var toEl = getTutSlotEl(bestOwn, T_LOCS[li].id, fi);
      if (toEl) {
        var movedCard = CARDS.find(function (c_) { return c_.id === best.cardId; });
        toEl.className = 'battle-card-slot occupied face-up';
        if (movedCard) {
          var wrap = document.createElement('div'); wrap.className = 'db-card-img-wrap';
          var ph = document.createElement('div'); ph.className = 'db-card-img-placeholder'; ph.textContent = movedCard.name.charAt(0);
          var img = document.createElement('img'); img.className = 'db-card-img';
          img.src = 'images/cards/' + movedCard.name + '.jpg';
          img.onerror = function () { this.style.display = 'none'; };
          wrap.appendChild(ph); wrap.appendChild(img);
          var ccEl = document.createElement('div'); ccEl.className = 'db-overlay-cc'; ccEl.textContent = movedCard.cc;
          var ipEl2 = document.createElement('div'); ipEl2.className = 'db-overlay-ip'; ipEl2.textContent = tEffectiveIP(best);
          toEl.appendChild(wrap); toEl.appendChild(ccEl); toEl.appendChild(ipEl2);
        }
      }
      pushed = true;
      break;
    }

    if (!pushed) {
      // No room elsewhere — destroy the card
      ownerSl[locId][bestIdx] = null;
      var deadEl2 = getTutSlotEl(bestOwn, locId, bestIdx);
      if (deadEl2) { deadEl2.className = 'battle-card-slot'; deadEl2.innerHTML = ''; }
    }
    done();
  }

  function updateScores() {
    T_LOCS.forEach(function (loc) {
      var ps = 0, as = 0;
      TS.playerSlots[loc.id].forEach(function (sd) { if (sd && sd.revealed) ps += tEffectiveIP(sd); });
      TS.aiSlots[loc.id].forEach(function (sd)     { if (sd && sd.revealed) as += tEffectiveIP(sd); });
      var pEl = document.getElementById('loc-score-player-' + loc.id);
      var aEl = document.getElementById('loc-score-opp-'    + loc.id);
      if (pEl) pEl.textContent = ps;
      if (aEl) aEl.textContent = as;
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     HAND RENDERING
  ═══════════════════════════════════════════════════════════════ */

  function renderHand(cardIds) {
    playerHandEl.innerHTML = '';
    cardIds.forEach(function (id) {
      var card = CARDS.find(function (c) { return c.id === id; });
      if (!card) return;
      var el = buildHandCard(card, 0);
      // Pulsing glow only on T3 ability-discovery cards, not on cards added in later turns
      if (TS.abilityCardsToTap.indexOf(id) !== -1 && !TS.abilityCardsTapped[id]) {
        el.classList.add('tut-ability-glow');
      }
      addTutDrag(el, id);
      playerHandEl.appendChild(el);
    });
    var sep = document.createElement('div');
    sep.className = 'battle-hand-sep';
    playerHandEl.appendChild(sep);
    var pileCount = Math.max(0, 12 - TS.turn * 2);
    playerHandEl.appendChild(buildDeckPile(pileCount));
  }

  function buildHandCard(card, ipBonus) {
    var el = document.createElement('div');
    el.className  = 'battle-hand-card';
    el.dataset.id = card.id;
    var wrap = document.createElement('div');
    wrap.className = 'db-card-img-wrap';
    var ph = document.createElement('div');
    ph.className   = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);
    var img = document.createElement('img');
    img.className = 'db-card-img';
    img.src       = 'images/cards/' + card.name + '.jpg';
    img.onerror   = function () { this.style.display = 'none'; };
    wrap.appendChild(ph);
    wrap.appendChild(img);
    var cc = document.createElement('div');
    cc.className   = 'db-overlay-cc';
    cc.textContent = card.cc;
    var ip = document.createElement('div');
    ip.className   = 'db-overlay-ip';
    ip.textContent = card.ip + (ipBonus || 0);
    el.appendChild(wrap);
    el.appendChild(cc);
    el.appendChild(ip);

    // GSAP hover — same as regular hand cards
    if (typeof gsap !== 'undefined') {
      el.addEventListener('mouseenter', function () {
        if (el.classList.contains('selected')) return;
        gsap.killTweensOf(el);
        gsap.set(el, { zIndex: 100 });
        gsap.to(el, { scale: 1.35, duration: 0.14, ease: 'power2.out' });
      });
      el.addEventListener('mouseleave', function () {
        gsap.killTweensOf(el);
        gsap.to(el, {
          scale: 1, duration: 0.22, ease: 'power2.inOut',
          onComplete: function () { gsap.set(el, { zIndex: 1 }); }
        });
      });
    }

    return el;
  }

  function buildDeckPile(count) {
    var pile = document.createElement('div');
    pile.className = 'battle-deck-pile';
    var lbl = document.createElement('div');
    lbl.className   = 'battle-deck-label';
    lbl.textContent = 'DECK';
    var cnt = document.createElement('div');
    cnt.className   = 'battle-deck-count';
    cnt.textContent = count;
    pile.appendChild(lbl);
    pile.appendChild(cnt);
    return pile;
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAG-TO-PLAY SYSTEM
  ═══════════════════════════════════════════════════════════════ */

  /* Returns true when this hand card may be dragged given the current step. */
  function canDrag(cardId) {
    if (!TS.awaitAction) return false;
    if (TS.awaitAction === 'citizens_rift') return cardId === 1;
    if (TS.awaitAction === 'free_end_turn') return true;
    if (TS.awaitAction === 'magellan_play') {
      // Only Magellan or 1-CC cards allowed in this phase
      var c = CARDS.find(function (c_) { return c_.id === cardId; });
      return cardId === 24 || (c && c.cc === 1);
    }
    return false;
  }

  /* Returns true when tutDragCardId may be dropped at locId. */
  function validLocForCard(cardId, locId) {
    if (!TS.playerSlots[locId]) return false;
    if (TS.playerSlots[locId].indexOf(null) === -1) return false;
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card || card.cc > TS.capital) return false;
    if (TS.awaitAction === 'citizens_rift') return locId === 2 && cardId === 1;
    if (TS.awaitAction === 'free_end_turn') {
      if (TS.turn === 1) return locId === 2;
      return true;
    }
    if (TS.awaitAction === 'magellan_play') return true;
    return false;
  }

  /* Make a hand card draggable; gates on canDrag.
     Click opens the info popup; in T3 ability_clicks phase it tracks taps. */
  function addTutDrag(cardEl, cardId) {
    cardEl.draggable = true;

    cardEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (tutDragCardId !== null) return;

      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card || typeof window.openBattlePopup !== 'function') return;

      // Ability-click gating (T3)
      if (TS.awaitAction === 'ability_clicks' && card.ability) {
        if (!TS.abilityCardsTapped[cardId]) {
          TS.abilityCardsTapped[cardId] = true;
          cardEl.classList.remove('tut-ability-glow');
        }
        var sd2 = { cardId: cardId, ip: card.ip, ipMod: 0, ipModSources: [], contMod: 0, revealed: true };
        window.openBattlePopup(card, sd2, 'player', false);
        checkAllAbilitiesClicked();
        return;
      }

      // Normal popup (suppress ability in T1/T2)
      var displayCard = TS.abilitiesActive
        ? card
        : { name: card.name, cc: card.cc, ip: card.ip, type: card.type, ability: null, abilityName: null };
      var sd = { cardId: cardId, ip: card.ip, ipMod: 0, ipModSources: [], contMod: 0, revealed: true };
      window.openBattlePopup(displayCard, sd, 'player', false);
    });

    cardEl.addEventListener('dragstart', function (e) {
      if (!canDrag(cardId)) { e.preventDefault(); return; }
      tutDragCardId = cardId;
      e.dataTransfer.effectAllowed = 'move';
      cardEl.classList.add('dragging');
      T_LOCS.forEach(function (loc) {
        if (!validLocForCard(cardId, loc.id)) return;
        var si = TS.playerSlots[loc.id].indexOf(null);
        if (si === -1) return;
        var sl = getTutSlotEl('player', loc.id, si);
        if (sl) sl.classList.add('tut-valid-slot');
      });
    });

    cardEl.addEventListener('dragend', function () {
      cardEl.classList.remove('dragging');
      tutDragCardId = null;
      clearDragHighlights();
    });
  }

  /* Clear all drag-related highlights from the board. */
  function clearDragHighlights() {
    document.querySelectorAll('.tut-valid-slot').forEach(function (el) {
      el.classList.remove('tut-valid-slot');
    });
    document.querySelectorAll('.drag-over').forEach(function (el) {
      el.classList.remove('drag-over');
    });
  }

  /* Kept for teardown compatibility. */
  function clearSelection() {
    tutDragCardId = null;
    clearDragHighlights();
  }

  /* Board-level drag handlers — registered once in initDOMRefs. */
  function initBoardDrag() {

    // Dragstart on board cards (Magellan board-move)
    boardEl.addEventListener('dragstart', function (e) {
      if (!TS.active) return;
      if (TS.awaitAction !== 'magellan_board_move' && TS.awaitAction !== 'free_end_turn') return;
      var slotEl = e.target.closest('.battle-card-slot.tut-moveable[data-owner="player"]');
      if (!slotEl) return;
      tutBoardDragCardId    = 24; // always Magellan in this tutorial
      tutBoardDragFromLocId = parseInt(slotEl.dataset.boardDragLocId || '0', 10);
      tutBoardDragFromSi    = parseInt(slotEl.dataset.boardDragSi    || '0', 10);
      e.dataTransfer.effectAllowed = 'move';
      slotEl.classList.add('dragging');
      // Highlight valid destinations
      T_LOCS.forEach(function (loc) {
        if (loc.id === tutBoardDragFromLocId) return;
        var destEl = getFirstAvailableSlotEl('player', loc.id);
        if (destEl) destEl.classList.add('tut-valid-slot');
      });
    });

    boardEl.addEventListener('dragover', function (e) {
      if (!TS.active) return;

      // Board-card move in progress
      if (tutBoardDragFromLocId !== null) {
        var slotEl2 = e.target.closest('.battle-card-slot[data-owner="player"]');
        if (!slotEl2) return;
        var locId2 = parseInt(slotEl2.dataset.locId, 10);
        if (locId2 === tutBoardDragFromLocId) return;
        if (!TS.playerSlots[locId2] || TS.playerSlots[locId2].indexOf(null) === -1) return;
        e.preventDefault();
        document.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
        var firstEmpty2 = getFirstAvailableSlotEl('player', locId2);
        if (firstEmpty2) firstEmpty2.classList.add('drag-over');
        return;
      }

      // Hand-card drag in progress
      if (tutDragCardId === null) return;
      var slotEl = e.target.closest('.battle-card-slot[data-owner="player"]');
      if (!slotEl) { clearDragHighlights(); return; }
      var locId = parseInt(slotEl.dataset.locId, 10);
      if (!validLocForCard(tutDragCardId, locId)) { clearDragHighlights(); return; }
      e.preventDefault();
      document.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
      var firstEmpty = getFirstAvailableSlotEl('player', locId);
      if (firstEmpty) firstEmpty.classList.add('drag-over');
    });

    boardEl.addEventListener('dragleave', function (e) {
      var s = e.target.closest('.battle-card-slot');
      if (s) s.classList.remove('drag-over');
    });

    boardEl.addEventListener('drop', function (e) {
      e.preventDefault();
      var slotEl = e.target.closest('.battle-card-slot[data-owner="player"]');
      if (!slotEl) return;
      slotEl.classList.remove('drag-over');
      var locId = parseInt(slotEl.dataset.locId, 10);

      // Board-card drop (Magellan move)
      if (tutBoardDragFromLocId !== null) {
        var fromLocId = tutBoardDragFromLocId;
        var fromSi    = tutBoardDragFromSi;
        tutBoardDragCardId    = null;
        tutBoardDragFromLocId = null;
        tutBoardDragFromSi    = null;
        document.querySelectorAll('.tut-moveable.dragging').forEach(function (el) {
          el.classList.remove('dragging');
        });
        clearDragHighlights();
        if (locId === fromLocId) return;
        if (!TS.playerSlots[locId] || TS.playerSlots[locId].indexOf(null) === -1) return;
        var moved = moveBoardCard(fromLocId, fromSi, locId);
        if (moved && TS.awaitAction === 'magellan_board_move') {
          onMagellanMoved();
        }
        return;
      }

      // Hand-card drop
      if (tutDragCardId === null) return;
      if (!validLocForCard(tutDragCardId, locId)) return;

      var cardId = tutDragCardId;
      var action = TS.awaitAction;
      tutDragCardId = null;
      clearDragHighlights();

      var ok = playCard(cardId, locId);
      if (!ok) return;

      if (action === 'citizens_rift') {
        onCitizensPlaced();
      } else if (action === 'magellan_play' && cardId === 24) {
        // Magellan played — unlock free turn
        hideEl(lucyBubbleEl);
        step_freeTurn(onT3EndTurn);
      }
      // 'free_end_turn': player continues freely
    });

    // Dragend on board (cleanup if Magellan drag is aborted mid-air)
    boardEl.addEventListener('dragend', function () {
      if (tutBoardDragFromLocId !== null) {
        document.querySelectorAll('.tut-moveable.dragging').forEach(function (el) {
          el.classList.remove('dragging');
        });
        tutBoardDragCardId    = null;
        tutBoardDragFromLocId = null;
        tutBoardDragFromSi    = null;
        clearDragHighlights();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     DIALOGUE SYSTEM
  ═══════════════════════════════════════════════════════════════ */

  var TYPE_SPEED = 28; // ms per character

  function queueDialogues(texts, onAllDone) {
    TS.dialogQueue  = texts.slice(1);
    TS.dialogOnDone = onAllDone || null;
    typeText(texts[0]);
  }

  function showDialogue(text, onDone) {
    TS.dialogQueue  = [];
    TS.dialogOnDone = onDone || null;
    typeText(text);
  }

  function typeText(text) {
    if (TS.typeTimer) { clearInterval(TS.typeTimer); TS.typeTimer = null; }
    TS.fullText = text;
    TS.typedLen = 0;
    TS.typing   = true;
    _blipCount  = 0;
    var activeTextEl = TS.useBubbles ? lucyBubbleTextEl : textEl;
    activeTextEl.textContent = '';
    updateHint();

    var lucyAvEl = document.querySelector('.battle-avatar-lucy');
    if (lucyAvEl) lucyAvEl.classList.add('tut-speaking');

    TS.typeTimer = setInterval(function () {
      TS.typedLen++;
      activeTextEl.textContent = TS.fullText.slice(0, TS.typedLen);
      playBlip();
      if (TS.typedLen >= TS.fullText.length) {
        clearInterval(TS.typeTimer);
        TS.typeTimer = null;
        TS.typing = false;
        updateHint();
        if (lucyAvEl) lucyAvEl.classList.remove('tut-speaking');
      }
    }, TYPE_SPEED);
  }

  function advanceDialogue() {
    if (TS.typing) {
      clearInterval(TS.typeTimer);
      TS.typeTimer = null;
      TS.typing = false;
      var activeTextEl = TS.useBubbles ? lucyBubbleTextEl : textEl;
      activeTextEl.textContent = TS.fullText;
      updateHint();
      var lucyAvEl = document.querySelector('.battle-avatar-lucy');
      if (lucyAvEl) lucyAvEl.classList.remove('tut-speaking');
      return;
    }
    if (TS.awaitAction) return; // player must act

    if (TS.dialogQueue.length > 0) {
      typeText(TS.dialogQueue.shift());
    } else if (TS.dialogOnDone) {
      var cb = TS.dialogOnDone;
      TS.dialogOnDone = null;
      cb();
    }
  }

  function updateHint() {
    var actionHints = {
      'citizens_rift':       'DRAG CITIZENS TO THE GREAT RIFT VALLEY',
      'free_end_turn':       'CLICK END TURN WHEN READY',
      'ability_clicks':      'CLICK EACH GLOWING CARD TO VIEW ITS ABILITY',
      'magellan_play':       'PLAY MAGELLAN — DRAG HIM TO A LOCATION',
      'magellan_board_move': 'DRAG MAGELLAN TO A NEW LOCATION'
    };
    var activeHintEl = TS.useBubbles ? lucyBubbleHintEl : hintEl;
    if (!activeHintEl) return;
    if (TS.awaitAction && actionHints[TS.awaitAction]) {
      activeHintEl.textContent = actionHints[TS.awaitAction];
      activeHintEl.classList.add('tut-hint-action');
    } else if (TS.typing) {
      activeHintEl.textContent = '\u25b6 Click to skip';
      activeHintEl.classList.remove('tut-hint-action');
    } else {
      activeHintEl.textContent = '\u25b6 Click to continue';
      activeHintEl.classList.remove('tut-hint-action');
    }
    updateOverlay();
  }

  /* Activate the full-screen click overlay only when dialogue is waiting
     for a click-to-continue and no board interaction is required.       */
  function updateOverlay() {
    if (!clickOverlayEl) return;
    var active = TS.active && !TS.awaitAction;
    clickOverlayEl.style.pointerEvents = active ? 'auto' : 'none';
  }

  /* ═══════════════════════════════════════════════════════════════
     ÖTZI DIALOGUE SYSTEM
  ═══════════════════════════════════════════════════════════════ */

  function showOtziLine(text, onDone) {
    if (!otziBoxEl) { if (onDone) onDone(); return; }
    _otziOnDone   = onDone || null;
    _otziFullText = text;
    _otziTyping   = true;
    _blipCount    = 0;
    otziTextEl.textContent = '';
    showEl(otziBoxEl);
    updateOverlay(); // activate click-anywhere while Otzi is speaking
    var idx = 0;
    if (_otziTypeTimer) clearInterval(_otziTypeTimer);
    _otziTypeTimer = setInterval(function () {
      idx++;
      otziTextEl.textContent = _otziFullText.slice(0, idx);
      playOtziBlip();
      if (idx >= _otziFullText.length) {
        clearInterval(_otziTypeTimer);
        _otziTypeTimer = null;
        _otziTyping = false;
      }
    }, 28);
  }

  function advanceOtzi() {
    if (_otziTyping) {
      if (_otziTypeTimer) { clearInterval(_otziTypeTimer); _otziTypeTimer = null; }
      _otziTyping = false;
      otziTextEl.textContent = _otziFullText;
      return;
    }
    hideEl(otziBoxEl);
    updateOverlay(); // deactivate (or let Lucy re-activate via typeText → updateHint)
    var cb = _otziOnDone;
    _otziOnDone = null;
    if (cb) cb();
  }

  /* ═══════════════════════════════════════════════════════════════
     HIGHLIGHT / LOCK / DIM
  ═══════════════════════════════════════════════════════════════ */

  function lit(el)   { if (el) el.classList.add('tut-lit'); }
  function unlit(el) { if (el) el.classList.remove('tut-lit'); }

  function showTutRevealHighlight(playerFirst) {
    var lucyAv = document.querySelector('.battle-avatar-lucy');
    var otziAv = document.querySelector('.battle-avatar-otzi');
    if (lucyAv) lucyAv.classList.toggle('reveal-first', !!playerFirst);
    if (otziAv) otziAv.classList.toggle('reveal-first', !playerFirst);
  }

  function hideTutRevealHighlight() {
    document.querySelectorAll('.battle-avatar.reveal-first').forEach(function (el) {
      el.classList.remove('reveal-first');
    });
  }

  function setLocked(on) {
    document.body.classList.toggle('tut-locked', on);
  }

  /* ── Number highlight ─────────────────────────────────────────── */
  /*
   * Places a pulsing gold box exactly over the CC (top-left) or IP
   * (top-right) overlay element on the given card.  Uses a fixed-
   * positioned div that is repositioned by a rAF loop so it tracks
   * the card even if layout shifts (scroll, resize).
   */
  function pinNumHighlight(cardEl, which) {
    removeNumHighlight(); // clear any existing one

    var overlayEl = cardEl.querySelector(
      which === 'cc' ? '.db-overlay-cc' : '.db-overlay-ip'
    );
    if (!overlayEl) return;

    var el = document.createElement('div');
    el.className = 'tut-num-highlight';
    document.body.appendChild(el);
    numHighlightEl = el;

    var animId;
    function track() {
      if (!numHighlightEl) return; // removed
      var r = overlayEl.getBoundingClientRect();
      el.style.left   = r.left + 'px';
      el.style.top    = r.top  + 'px';
      el.style.width  = r.width  + 'px';
      el.style.height = r.height + 'px';
      animId = requestAnimationFrame(track);
    }
    track();
    numHighlightEl._animId = animId;
  }

  function removeNumHighlight() {
    if (!numHighlightEl) return;
    if (numHighlightEl._animId) cancelAnimationFrame(numHighlightEl._animId);
    numHighlightEl.remove();
    numHighlightEl = null;
  }

  /* ═══════════════════════════════════════════════════════════════
     HEADER / CAPITAL HELPERS
  ═══════════════════════════════════════════════════════════════ */

  function setHeader(turn, phase, capital) {
    var ti = document.getElementById('battle-turn-info');
    var pi = document.getElementById('battle-phase-info');
    if (ti) ti.textContent = 'TURN ' + turn + ' / 5';
    if (pi) pi.textContent = phase;
    setCapital(capital);
  }

  function setCapital(n) {
    TS.capital = n;
    if (!capitalNumEl) capitalNumEl = document.getElementById('battle-capital-num');
    if (capitalNumEl) capitalNumEl.textContent = n;
  }

  /* ═══════════════════════════════════════════════════════════════
     DOM QUERY HELPERS
  ═══════════════════════════════════════════════════════════════ */

  function getHandCardEl(cardId) {
    return playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
  }

  function getTutSlotEl(owner, locId, si) {
    return boardEl.querySelector(
      '.battle-card-slot[data-owner="' + owner + '"]' +
      '[data-loc-id="' + locId + '"]' +
      '[data-slot-index="' + si + '"]'
    );
  }

  function getPlayerSlotsFor(locId) {
    return Array.from(boardEl.querySelectorAll(
      '.battle-card-slot[data-owner="player"][data-loc-id="' + locId + '"]'
    ));
  }

  function getFirstAvailableSlotEl(owner, locId) {
    var slots = owner === 'player' ? TS.playerSlots[locId] : TS.aiSlots[locId];
    if (!slots) return null;
    var si = slots.indexOf(null);
    if (si === -1) return null;
    return getTutSlotEl(owner, locId, si);
  }

  function showEl(el) { if (el) el.style.display = ''; }
  function hideEl(el) { if (el) el.style.display = 'none'; }

  /* ═══════════════════════════════════════════════════════════════
     FREE PLAY TURN
  ═══════════════════════════════════════════════════════════════ */

  function step_freeTurn(onEndTurn) {
    var popupEl = document.getElementById('battle-popup-backdrop');
    if (popupEl) popupEl.classList.remove('visible');
    endTurnBtnEl.disabled = false;
    lit(endTurnBtnEl);
    TS.awaitAction = 'free_end_turn';
    TS.freeEndCb   = onEndTurn;
    setLocked(false);
    renderHand(TS.playerHand);
    // If Magellan is already on the board, make it draggable each free turn
    var magPos = findPlayerCard(24);
    if (magPos) makeBoardCardMoveable(magPos.locId, magPos.si);
    updateHint();
  }

  function onFreeEndTurn() {
    cancelInactivityTimer();
    clearSelection();
    document.querySelectorAll('.tut-moveable').forEach(function (el) {
      el.classList.remove('tut-moveable');
      el.removeAttribute('draggable');
    });
    unlit(endTurnBtnEl);
    endTurnBtnEl.disabled = true;
    var cb = TS.freeEndCb;
    TS.freeEndCb   = null;
    TS.awaitAction = null;
    if (cb) cb();
  }

  /* Placeholder for old end_turn action (kept for initDOMRefs handler reference) */
  function onEndTurnClicked() {
    onFreeEndTurn();
  }

  /* ═══════════════════════════════════════════════════════════════
     EXIT / COMPLETE
  ═══════════════════════════════════════════════════════════════ */

  function exitTutorial() {
    localStorage.setItem('sog_tutorial_complete', 'true');
    teardown();
    showScreen('screen-deckbuilder');
    if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
  }

  function finishTutorial() {
    exitTutorial();
  }

  function teardown() {
    clearSelection();
    removeNumHighlight();
    cancelInactivityTimer();
    TS.active             = false;
    TS.useBubbles         = false;
    window.tutorialActive = false;
    if (TS.typeTimer) { clearInterval(TS.typeTimer); TS.typeTimer = null; }
    setLocked(false);
    hideEl(boxEl);
    hideEl(lucyBubbleEl);
    hideEl(skipEl);
    hideEl(dimEl);
    hideEl(endEl);
    document.body.classList.remove('tut-locked');
    document.querySelectorAll('.tut-lit').forEach(function (el) {
      el.classList.remove('tut-lit');
    });
    document.querySelectorAll('.tut-valid-slot').forEach(function (el) {
      el.classList.remove('tut-valid-slot');
    });
    document.querySelectorAll('.tut-ability-glow').forEach(function (el) {
      el.classList.remove('tut-ability-glow');
    });
    document.querySelectorAll('.tut-moveable').forEach(function (el) {
      el.classList.remove('tut-moveable');
      el.removeAttribute('draggable');
    });
    document.querySelectorAll('.tut-loc-glow').forEach(function (el) {
      el.classList.remove('tut-loc-glow');
    });
    // Clean up Otzi box
    if (otziBoxEl) hideEl(otziBoxEl);
    if (_otziTypeTimer) { clearInterval(_otziTypeTimer); _otziTypeTimer = null; }
    // Remove tut-ability-hidden classes
    document.querySelectorAll('.tut-ability-hidden').forEach(function (el) {
      el.classList.remove('tut-ability-hidden');
    });
    // Deactivate click overlay
    if (clickOverlayEl) clickOverlayEl.style.pointerEvents = 'none';
    // Clean up board drag state
    tutBoardDragCardId    = null;
    tutBoardDragFromLocId = null;
    tutBoardDragFromSi    = null;
    // Restore music player
    var _musicCtrl = document.getElementById('battle-music-ctrl');
    if (_musicCtrl) _musicCtrl.style.display = '';
  }

  /* ── Exports ─────────────────────────────────────────────────── */
  window.startHomeIntro    = startHomeIntro;
  window.showMatchupScreen = showMatchupScreen;
  window.startTutorial     = startTutorial;

}());

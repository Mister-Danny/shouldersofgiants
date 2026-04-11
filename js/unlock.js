/**
 * unlock.js
 * Shoulders of Giants — Card Unlock Progression System
 *
 * Tracks wins per difficulty, unlocks Religious/Exploration card types,
 * and plays a cinematic GSAP cutscene on first unlock.
 *
 * localStorage keys:
 *   sog_serf_wins              — int, wins on Serf (easy) difficulty
 *   sog_giant_wins             — int, wins on Giant (hard) difficulty
 *   sog_religious_unlocked     — 'true' when Religious cards are unlocked
 *   sog_exploration_unlocked   — 'true' when Exploration cards are unlocked
 *   sog_religious_cutscene_seen  — 'true' after Religious cutscene plays
 *   sog_exploration_cutscene_seen — 'true' after Exploration cutscene plays
 *
 * Depends on: CARDS (cards.js), gsap, Howl (howler.js)
 */

(function () {
  'use strict';

  var WINS_REQUIRED = 3;

  /* ── localStorage helpers ──────────────────────────────────────── */

  function getWinCount(difficulty) {
    var key = difficulty === 'hard' ? 'sog_giant_wins' : 'sog_serf_wins';
    return parseInt(localStorage.getItem(key) || '0', 10);
  }

  function setWinCount(difficulty, n) {
    var key = difficulty === 'hard' ? 'sog_giant_wins' : 'sog_serf_wins';
    localStorage.setItem(key, String(n));
  }

  function isTypeUnlocked(type) {
    if (type === 'Political' || type === 'Military' || type === 'Cultural') return true;
    if (type === 'Religious')   return localStorage.getItem('sog_religious_unlocked') === 'true';
    if (type === 'Exploration') return localStorage.getItem('sog_exploration_unlocked') === 'true';
    return true;
  }

  function isCutsceneSeen(type) {
    var key = type === 'Religious' ? 'sog_religious_cutscene_seen' : 'sog_exploration_cutscene_seen';
    return localStorage.getItem(key) === 'true';
  }

  function markCutsceneSeen(type) {
    var key = type === 'Religious' ? 'sog_religious_cutscene_seen' : 'sog_exploration_cutscene_seen';
    localStorage.setItem(key, 'true');
  }

  /**
   * incrementWins(difficulty)
   * Called after a single-player victory. Increments win counter,
   * checks thresholds, and returns { newUnlock: 'Religious'|'Exploration'|null }.
   */
  function incrementWins(difficulty) {
    var count = getWinCount(difficulty) + 1;
    setWinCount(difficulty, count);

    var result = { newUnlock: null };

    // Serf wins → Religious unlock
    if (difficulty === 'easy' && count >= WINS_REQUIRED &&
        localStorage.getItem('sog_religious_unlocked') !== 'true') {
      localStorage.setItem('sog_religious_unlocked', 'true');
      result.newUnlock = 'Religious';
    }

    // Giant wins → Exploration unlock
    if (difficulty === 'hard' && count >= WINS_REQUIRED &&
        localStorage.getItem('sog_exploration_unlocked') !== 'true') {
      localStorage.setItem('sog_exploration_unlocked', 'true');
      result.newUnlock = 'Exploration';
    }

    return result;
  }

  /**
   * getUnlockHint(type)
   * Returns the lock message shown on locked cards.
   */
  function getUnlockHint(type) {
    if (type === 'Religious')   return 'Unlock with ' + WINS_REQUIRED + ' Serf wins';
    if (type === 'Exploration') return 'Unlock with ' + WINS_REQUIRED + ' Giant wins';
    return '';
  }

  /* ── Cutscene ──────────────────────────────────────────────────── */

  var _cutsceneHowl = null;

  /**
   * playCutscene(type, onComplete)
   * Plays the full unlock cutscene for the given card type.
   * Calls onComplete() when the cutscene ends (at ~28s).
   */
  function playCutscene(type, onComplete) {
    if (typeof gsap === 'undefined') { onComplete(); return; }

    // Mark seen immediately so it never replays
    markCutsceneSeen(type);

    // Get the 5 cards of this type
    var unlockCards = CARDS.filter(function (c) { return c.type === type; });

    // DOM refs
    var cutsceneEl = document.getElementById('unlock-cutscene');
    var curtainEl  = document.getElementById('unlock-curtain');
    var stageEl    = document.getElementById('unlock-stage');
    var textEl     = document.getElementById('unlock-text');
    var cardsEl    = document.getElementById('unlock-cards');

    // Build card elements
    cardsEl.innerHTML = '';
    unlockCards.forEach(function (card) {
      var cardEl = document.createElement('div');
      cardEl.className = 'unlock-card';

      var imgWrap = document.createElement('div');
      imgWrap.className = 'unlock-card-img-wrap';

      var img = document.createElement('img');
      img.className = 'unlock-card-img';
      img.src = 'images/cards/' + card.name + '.jpg';
      img.alt = card.name;
      img.onerror = function () { this.style.display = 'none'; };

      imgWrap.appendChild(img);

      var ccEl = document.createElement('div');
      ccEl.className = 'unlock-card-cc';
      ccEl.textContent = card.cc;

      var ipEl = document.createElement('div');
      ipEl.className = 'unlock-card-ip';
      ipEl.textContent = card.ip;

      cardEl.appendChild(imgWrap);
      cardEl.appendChild(ccEl);
      cardEl.appendChild(ipEl);
      cardsEl.appendChild(cardEl);
    });

    // Set text
    textEl.textContent = type + ' Cards Unlocked!';
    textEl.style.opacity = '0';
    textEl.style.transform = 'scale(0)';

    // Reset curtain position (covering the screen)
    curtainEl.style.transform = 'translateY(0)';

    // Show cutscene
    cutsceneEl.style.display = 'flex';

    // Play music
    if (typeof Howl !== 'undefined') {
      _cutsceneHowl = new Howl({
        src: ['music/The Curtain Rises.mp3'],
        volume: 0.7,
        loop: false,
        html5: true
      });
      _cutsceneHowl.play();
    }

    // Position cards for spiral — start stacked at center
    var cardEls = cardsEl.querySelectorAll('.unlock-card');
    cardEls.forEach(function (el) {
      gsap.set(el, {
        x: 0, y: 0,
        rotation: 0,
        scale: 0.6,
        opacity: 0
      });
    });

    // GSAP master timeline
    var tl = gsap.timeline();

    // 0:00 — Curtain rises
    tl.to(curtainEl, {
      y: '-100%',
      duration: 2,
      ease: 'power2.inOut'
    }, 0);

    // 0:00 — Fade in cards
    tl.to(cardEls, {
      opacity: 1,
      duration: 0.5,
      stagger: 0.1
    }, 0);

    // 0:00–0:20 — Synchronized spiral routine
    // Each card orbits in a spiral pattern, all moving together
    var spiralDuration = 20;
    var centerX = 0;
    var centerY = 0;

    cardEls.forEach(function (el, i) {
      var angleOffset = (i / 5) * Math.PI * 2; // evenly spaced around circle
      var startRadius = 50;
      var maxRadius = 280;

      // Create a spiral path using an onUpdate function
      var spiralObj = { progress: 0 };

      tl.to(spiralObj, {
        progress: 1,
        duration: spiralDuration,
        ease: 'none',
        onUpdate: function () {
          var p = spiralObj.progress;
          // Number of full rotations
          var rotations = 4;
          var angle = angleOffset + (p * rotations * Math.PI * 2);
          // Radius oscillates and grows then shrinks toward end
          var radiusPhase = Math.sin(p * Math.PI); // peaks at 0.5
          var radius = startRadius + (maxRadius - startRadius) * radiusPhase;
          // Add some vertical wave
          var waveY = Math.sin(p * Math.PI * 6 + i) * 40;

          var x = centerX + Math.cos(angle) * radius;
          var y = centerY + Math.sin(angle) * radius + waveY;
          var rot = angle * (180 / Math.PI) * 0.3; // gentle rotation

          gsap.set(el, { x: x, y: y, rotation: rot });
        }
      }, 0);
    });

    // 0:20 — Cards sweep into horizontal row
    var cardWidth = 140; // approximate card width at 60% scale
    var gap = 20;
    var totalWidth = (cardWidth * 5) + (gap * 4);
    var startX = -totalWidth / 2 + cardWidth / 2;

    cardEls.forEach(function (el, i) {
      var finalX = startX + i * (cardWidth + gap);
      tl.to(el, {
        x: finalX,
        y: 40, // slightly below center to make room for text above
        rotation: 0,
        scale: 0.6,
        duration: 0.8,
        ease: 'back.out(1.7)'
      }, spiralDuration);
    });

    // 0:20 — Text pops in
    tl.to(textEl, {
      opacity: 1,
      scale: 1,
      duration: 0.6,
      ease: 'back.out(2)'
    }, spiralDuration);

    // 0:28 — End cutscene
    tl.call(function () {
      // Stop music
      if (_cutsceneHowl) {
        _cutsceneHowl.stop();
        _cutsceneHowl.unload();
        _cutsceneHowl = null;
      }

      // Hide cutscene
      cutsceneEl.style.display = 'none';
      cardsEl.innerHTML = '';

      // Callback
      if (onComplete) onComplete();
    }, null, 28);
  }

  /* ── Public API ────────────────────────────────────────────────── */

  window.Unlock = {
    isTypeUnlocked:  isTypeUnlocked,
    getWinCount:     getWinCount,
    incrementWins:   incrementWins,
    getUnlockHint:   getUnlockHint,
    isCutsceneSeen:  isCutsceneSeen,
    playCutscene:    playCutscene
  };

})();

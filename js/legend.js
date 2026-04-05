/**
 * legend.js — Shoulders of Giants · 5-Win Milestone Victory Screen
 *
 * Triggers when the player wins their 5th game in a browser session.
 * Win count is a plain JS variable — resets automatically when the tab closes.
 *
 * Sequence:
 *   1. Blackout
 *   2. "YOU HAVE MADE HISTORY" title + fanfare
 *   3. Location image montage (5 images, full-screen slides)
 *   4. Historical figures montage (7 card images, rapid slides)
 *   5. Lucy + Ötzi portrait moment with dialogue
 *   6. "LEGEND" burst with gold particle explosion
 *   7. Subtitle → click to continue
 *
 * Exposes: window.LegendScreen
 *   .recordWin()           → increments counter; returns true on the 5th
 *   .show(onComplete)      → plays sequence, calls onComplete when clicked through
 */
(function () {
  'use strict';

  /* ── Session win tracking (plain var — no localStorage) ─────── */
  var WIN_THRESHOLD = 3;
  var _sessionWins  = 0;

  /* ── Slide lists ─────────────────────────────────────────────── */
  var LOCATION_SLIDES = [
    { src: 'images/locations/scandinavia.jpg',     pos: 'center 70%' },
    { src: 'images/locations/greatriftvalley.jpg', pos: 'center 65%' },
    { src: 'images/locations/capeofgoodhope.jpg',  pos: 'center'     },
    { src: 'images/locations/levant.jpg',          pos: 'center'     },
    { src: 'images/locations/timbuktu.jpg',        pos: 'center 60%' },
  ];

  var CARD_SLIDES = [
    'Pacal the Great',
    'Jesus Christ',
    'William the Conqueror',
    'Voltaire',
    'Christopher Columbus',
  ];

  /* Cycle of slide-in directions (offset between location + card lists) */
  var DIRS = [
    { x: '-115%', y: '0'     },
    { x: '115%',  y: '0'     },
    { x: '0',     y: '-115%' },
    { x: '0',     y: '115%'  },
  ];

  /* ══════════════════════════════════════════════════════════════
     Web Audio helpers — self-contained, independent of SFX module
  ══════════════════════════════════════════════════════════════ */

  var _ac = null;

  function getAC() {
    if (!_ac) {
      try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  }

  function tone(freq, type, attack, sustain, release, gainVal, delay) {
    var ac = getAC(); if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var env = ac.createGain();
      var now = ac.currentTime + (delay || 0);
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(gainVal || 0.2, now + attack);
      env.gain.setValueAtTime(gainVal || 0.2, now + attack + sustain);
      env.gain.linearRampToValueAtTime(0.0001, now + attack + sustain + release);
      osc.connect(env); env.connect(ac.destination);
      osc.start(now); osc.stop(now + attack + sustain + release + 0.02);
    } catch (e) {}
  }

  function noiseGain(duration, gainVal, delay) {
    var ac = getAC(); if (!ac) return;
    try {
      var bufLen = Math.floor(ac.sampleRate * duration);
      var buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
      var data   = buf.getChannelData(0);
      for (var i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      var src = ac.createBufferSource(); src.buffer = buf;
      var env = ac.createGain();
      var now = ac.currentTime + (delay || 0);
      env.gain.setValueAtTime(gainVal || 0.3, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.connect(env); env.connect(ac.destination);
      src.start(now); src.stop(now + duration + 0.02);
    } catch (e) {}
  }

  /**
   * Triumphant ascending C-major fanfare — plays over the opening title phase.
   * Rising arpeggio with bass roots and a full sustained chord at the peak.
   */
  function playFanfare() {
    /* Melody — ascending C major arpeggio with triangle harmony */
    var melody = [262, 330, 392, 523, 659, 784, 1047];
    melody.forEach(function (f, i) {
      tone(f,     'square',   0.01, 0.08, 0.20, 0.18, i * 0.20);
      tone(f,     'triangle', 0.01, 0.10, 0.22, 0.09, i * 0.20 + 0.01);
    });
    /* Bass root notes (one octave down) */
    [131, 196, 262].forEach(function (f, i) {
      tone(f, 'sine', 0.02, 0.28, 0.45, 0.20, i * 0.50);
    });
    /* Final chord: full C-major triad sustained */
    [523, 659, 784, 1047].forEach(function (f, i) {
      tone(f, 'square',   0.02, 0.65, 0.55, 0.11, 1.45 + i * 0.015);
      tone(f, 'triangle', 0.02, 0.70, 0.55, 0.07, 1.45 + i * 0.015);
    });
    /* Shimmering high octave on final chord */
    tone(2093, 'sine', 0.02, 0.30, 0.50, 0.07, 1.55);
    tone(1568, 'sine', 0.02, 0.40, 0.55, 0.06, 1.58);
  }

  /**
   * Short whoosh — swept bandpass noise burst for image transitions.
   */
  function playWhoosh() {
    var ac = getAC(); if (!ac) return;
    try {
      var dur    = 0.36;
      var bufLen = Math.floor(ac.sampleRate * dur);
      var buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
      var data   = buf.getChannelData(0);
      for (var i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      var src    = ac.createBufferSource(); src.buffer = buf;
      var filt   = ac.createBiquadFilter();
      filt.type  = 'bandpass'; filt.Q.value = 1.5;
      var env    = ac.createGain();
      var now    = ac.currentTime;
      filt.frequency.setValueAtTime(7200, now);
      filt.frequency.exponentialRampToValueAtTime(160, now + dur);
      env.gain.setValueAtTime(0.5, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filt); filt.connect(env); env.connect(ac.destination);
      src.start(now); src.stop(now + dur + 0.02);
    } catch (e) {}
  }

  /**
   * LEGEND burst impact — deep punch + bright shimmer + noise crash.
   */
  function playImpact() {
    tone(78,   'sine',    0.005, 0.05, 0.45, 0.55, 0.00);
    tone(44,   'sine',    0.005, 0.07, 0.55, 0.45, 0.00);
    tone(2093, 'square',  0.005, 0.01, 0.30, 0.13, 0.04);
    tone(1047, 'square',  0.005, 0.02, 0.32, 0.11, 0.04);
    tone(1568, 'triangle',0.005, 0.02, 0.28, 0.09, 0.06);
    tone(523,  'sine',    0.005, 0.12, 0.80, 0.14, 0.08);
    noiseGain(0.30, 0.40, 0.00);
  }

  /* ══════════════════════════════════════════════════════════════
     Particle burst
  ══════════════════════════════════════════════════════════════ */

  function spawnParticles() {
    if (typeof gsap === 'undefined') return;
    var container = document.getElementById('legend-particles');
    if (!container) return;
    container.innerHTML = '';

    var GOLD = ['#f8d000','#ffd700','#ffec6e','#ffe033','#fff0a0','#ffaa00','#ffc533'];
    var count = 70;

    for (var i = 0; i < count; i++) {
      var p   = document.createElement('div');
      p.className = 'legend-particle';
      var sz  = 5 + Math.random() * 9;
      p.style.width    = sz + 'px';
      p.style.height   = sz + 'px';
      p.style.top      = (-sz / 2) + 'px';
      p.style.left     = (-sz / 2) + 'px';
      p.style.background = GOLD[Math.floor(Math.random() * GOLD.length)];
      /* Some particles are diamond-shaped */
      if (Math.random() < 0.3) p.style.borderRadius = '0';
      container.appendChild(p);

      var angle = Math.random() * Math.PI * 2;
      var dist  = 100 + Math.random() * 280;
      var tx    = Math.cos(angle) * dist;
      var ty    = Math.sin(angle) * dist;
      var dur   = 0.85 + Math.random() * 0.90;
      var delay = Math.random() * 0.12;

      gsap.fromTo(p,
        { x: 0, y: 0, scale: 1, opacity: 1 },
        { x: tx, y: ty, scale: 0, opacity: 0,
          duration: dur, delay: delay, ease: 'power2.out' }
      );
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Main GSAP sequence
  ══════════════════════════════════════════════════════════════ */

  function playSequence(onComplete) {
    /* Graceful no-GSAP fallback */
    if (typeof gsap === 'undefined') {
      var scr = document.getElementById('screen-legend');
      if (scr) {
        scr.style.display = 'flex';
        scr.style.cursor  = 'pointer';
        scr.onclick = function () {
          scr.style.display = 'none';
          scr.onclick = null;
          if (onComplete) onComplete();
        };
      } else if (onComplete) { onComplete(); }
      return;
    }

    /* Element refs */
    var screen      = document.getElementById('screen-legend');
    var blackout    = document.getElementById('legend-blackout');
    var titleWrap   = document.getElementById('legend-title-wrap');
    var openTitle   = document.getElementById('legend-opening-title');
    var slideEl     = document.getElementById('legend-slide');
    var wordWrap    = document.getElementById('legend-word-wrap');
    var wordEl      = document.getElementById('legend-word');
    var particles   = document.getElementById('legend-particles');
    var subtitle    = document.getElementById('legend-subtitle');

    if (!screen) { if (onComplete) onComplete(); return; }

    /* ── Initial state reset ──────────────────────────────────── */
    screen.style.display  = 'flex';
    screen.style.cursor   = 'default';

    gsap.set(blackout,  { autoAlpha: 0 });
    gsap.set(titleWrap, { autoAlpha: 0 });
    gsap.set(openTitle, { y: 0 });
    gsap.set(slideEl,   { autoAlpha: 0, x: 0, y: 0 });
    gsap.set(wordWrap,  { autoAlpha: 0 });
    gsap.set(wordEl,    { scale: 1 });
    gsap.set(particles, { autoAlpha: 1 });
    gsap.set(subtitle,  { autoAlpha: 0 });

    var tl = gsap.timeline();

    /* ── 1. Blackout ──────────────────────────────────────────── */
    tl.to(blackout, { autoAlpha: 1, duration: 0.45, ease: 'power2.inOut' });

    /* ── 2. Opening title + fanfare ───────────────────────────── */
    tl.call(function () { playFanfare(); });
    tl.to(titleWrap, { autoAlpha: 1, duration: 0.01 });   // reveal wrapper
    tl.fromTo(openTitle,
      { y: 45 },
      { y: 0, duration: 0.80, ease: 'power3.out' },
      '<'
    );
    /* Hold 2 s then fade out */
    tl.to(titleWrap,  { autoAlpha: 0, duration: 0.50, ease: 'power2.in' }, '+=2.0');

    /* ── 3. Location montage ──────────────────────────────────── */
    LOCATION_SLIDES.forEach(function (loc, i) {
      var dir = DIRS[i % DIRS.length];
      tl.call((function (slide) {
        return function () {
          slideEl.style.backgroundImage    = 'url("' + slide.src + '")';
          slideEl.style.backgroundPosition = slide.pos;
          playWhoosh();
        };
      })(loc));
      tl.fromTo(slideEl,
        { autoAlpha: 1, x: dir.x, y: dir.y },
        { x: 0, y: 0, duration: 0.32, ease: 'power3.out' }
      );
      tl.to({}, { duration: 0.50 });   // hold 0.5 s per spec
    });

    /* Quick flash-cut between montage sections */
    tl.to(slideEl, { autoAlpha: 0, duration: 0.12 });

    /* ── 4. Card montage (5-cost cards, framed to show upper half) */
    CARD_SLIDES.forEach(function (name, i) {
      var dir = DIRS[(i + 1) % DIRS.length];   // offset 1 so directions vary vs locations
      tl.call((function (cardName) {
        return function () {
          slideEl.style.backgroundImage    = 'url("images/cards/' + cardName + '.jpg")';
          slideEl.style.backgroundPosition = 'center 30%';
          playWhoosh();
        };
      })(name));
      tl.fromTo(slideEl,
        { autoAlpha: 1, x: dir.x, y: dir.y },
        { x: 0, y: 0, duration: 0.28, ease: 'power3.out' }
      );
      tl.to({}, { duration: 0.50 });
    });

    tl.to(slideEl, { autoAlpha: 0, duration: 0.22 });

    /* ── 5 (was 6). LEGEND burst ─────────────────────────────── */
    tl.to({}, { duration: 0.28 });   // brief all-black pause

    tl.call(function () {
      spawnParticles();
      playImpact();
    });

    tl.to(wordWrap, { autoAlpha: 1, duration: 0.01 });
    tl.fromTo(wordEl,
      { scale: 0.35 },
      { scale: 1.0, duration: 0.44, ease: 'back.out(1.5)' },
      '<'
    );

    /* ── 7. Subtitle → click to continue ─────────────────────── */
    tl.to(subtitle, { autoAlpha: 1, duration: 0.50, ease: 'power2.out' }, '+=0.30');

    tl.call(function () {
      screen.style.cursor = 'pointer';

      function handleClick() {
        screen.removeEventListener('click', handleClick);
        screen.style.cursor = 'default';
        tl.pause();   // stop timeline (particles may still be running)
        gsap.to(screen, {
          autoAlpha: 0,
          duration: 0.55,
          ease: 'power2.in',
          onComplete: function () {
            screen.style.display = 'none';
            gsap.set(screen, { clearProps: 'opacity,visibility' });
            if (onComplete) onComplete();
          }
        });
      }

      screen.addEventListener('click', handleClick);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Public API
  ══════════════════════════════════════════════════════════════ */
  window.LegendScreen = {

    /**
     * Call this after every player win.
     * @returns {boolean}  true if this is the 5th win (milestone reached)
     */
    recordWin: function () {
      _sessionWins++;
      if (_sessionWins >= WIN_THRESHOLD) {
        _sessionWins = 0;   // reset so milestone can fire again after 5 more wins
        return true;
      }
      return false;
    },

    /**
     * Play the full legend sequence.
     * @param {Function} onComplete  Called when the player clicks through
     */
    show: function (onComplete) {
      playSequence(onComplete);
    }
  };

})();

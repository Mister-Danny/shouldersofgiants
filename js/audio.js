/**
 * audio.js
 * Shoulders of Giants — SNES-style Sound Effects
 *
 * All sounds synthesised with the Web Audio API — no external files.
 * Exposes a single global object: SFX
 *
 * Usage:
 *   SFX.cardReveal()
 *   SFX.atOnce()
 *   SFX.continuous()
 *   SFX.conditional()
 *   SFX.cardDestroyed()
 *   SFX.cardDiscarded()
 *   SFX.ipGained()
 *   SFX.ipLost()
 *   SFX.locationWon()
 *   SFX.capitalSpent()
 *   SFX.endTurn()
 *   SFX.gameWon()
 *   SFX.gameLost()
 */

var SFX = (function () {
  'use strict';

  var ctx    = null;
  var _muted = false;   // suppresses all synth + file sounds during Cortes animation

  function getCtx() {
    // Prefer the shared SOG.sfx context so synth routes through the SFX master gain.
    if (window.SOG && SOG.sfx && typeof SOG.sfx.getCtx === 'function') {
      var sc = SOG.sfx.getCtx();
      if (sc) { ctx = sc; return ctx; }
    }
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* Route synth output through the SFX master gain when available (so the SFX /
     Master sliders scale it); fall back to the raw destination otherwise. */
  function _dest(ac) {
    if (window.SOG && SOG.sfx && typeof SOG.sfx.getGain === 'function') {
      var g = SOG.sfx.getGain();
      if (g) return g;
    }
    return ac.destination;
  }
  /* Current non-music scalar (0..1) for the file-backed Howl SFX. */
  function _sfxVol() {
    return (window.SOG && SOG.sfx && typeof SOG.sfx.factor === 'function') ? SOG.sfx.factor() : 1;
  }
  /* Play a cached Howl at the current SFX volume. Returns false if no Howl. */
  function _playHowl(howl) {
    if (!howl) return false;
    try { howl.volume(_sfxVol()); } catch (e) {}
    howl.stop();
    howl.play();
    return true;
  }

  /**
   * Play a single oscillator tone.
   * @param {number} freq      Frequency in Hz
   * @param {string} type      Oscillator type: 'square'|'sine'|'sawtooth'|'triangle'
   * @param {number} attack    Seconds to peak
   * @param {number} sustain   Seconds at peak
   * @param {number} release   Seconds to silence
   * @param {number} gain      Peak gain (0–1)
   * @param {number} [delay]   Start offset from now in seconds
   */
  function tone(freq, type, attack, sustain, release, gain, delay) {
    if (_muted) return;
    var ac = getCtx();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var env = ac.createGain();
      var now = ac.currentTime + (delay || 0);

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);

      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(gain || 0.25, now + attack);
      env.gain.setValueAtTime(gain || 0.25, now + attack + sustain);
      env.gain.linearRampToValueAtTime(0.0001, now + attack + sustain + release);

      osc.connect(env);
      env.connect(_dest(ac));
      osc.start(now);
      osc.stop(now + attack + sustain + release + 0.01);
    } catch (e) {}
  }

  /**
   * Play a white-noise burst (for crunch/destroy effects).
   * @param {number} duration  Length in seconds
   * @param {number} gain      Initial gain
   * @param {number} [delay]   Start offset from now in seconds
   */
  function noise(duration, gain, delay) {
    if (_muted) return;
    var ac = getCtx();
    if (!ac) return;
    try {
      var bufLen = Math.floor(ac.sampleRate * duration);
      var buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
      var data   = buf.getChannelData(0);
      for (var i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      var src = ac.createBufferSource();
      src.buffer = buf;

      var env = ac.createGain();
      var now = ac.currentTime + (delay || 0);
      env.gain.setValueAtTime(gain || 0.3, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      src.connect(env);
      env.connect(_dest(ac));
      src.start(now);
      src.stop(now + duration + 0.01);
    } catch (e) {}
  }

  /* ── Howler-based sounds (file-backed) ───────────────────────── */

  // Every Howl below uses the same volume/html5 defaults; centralized here
  // so a load or play failure is never silent — Howler's html5:true mode
  // just wraps a real <audio> element, which can reject playback (wrong
  // server MIME type, decode failure, a browser's stricter media
  // validation, etc.) with nothing else in the console to say why.
  // extraOpts can add/override handlers (jesusHowl needs its own
  // onend/onloaderror/onplayerror) — those still run after this logs.
  function _makeHowl(src, extraOpts) {
    extraOpts = extraOpts || {};
    var srcArr = Array.isArray(src) ? src : [src];
    var userLoadErr = extraOpts.onloaderror;
    var userPlayErr = extraOpts.onplayerror;
    var opts = { volume: 1.0, html5: true };
    for (var k in extraOpts) { if (Object.prototype.hasOwnProperty.call(extraOpts, k)) opts[k] = extraOpts[k]; }
    opts.src = srcArr;
    opts.onloaderror = function (id, err) {
      console.warn('[audio.js] Howl failed to load "' + srcArr[0] + '":', err);
      if (userLoadErr) userLoadErr(id, err);
    };
    opts.onplayerror = function (id, err) {
      console.warn('[audio.js] Howl failed to play "' + srcArr[0] + '":', err);
      if (userPlayErr) userPlayErr(id, err);
    };
    return new Howl(opts);
  }

  var _jesusHowl       = null;
  var _jesusOnFinished = null;

  var _cortesHowl    = null;
  var _deflateHowl   = null;
  var _joanHowl      = null;
  var _samuraiHowl   = null;
  var _williamHowl   = null;
  var _coinHowl      = null;
  var _pacalHowl     = null;
  var _justinianHowl = null;
  var _wuHowl        = null;
  var _kenteHowl     = null;
  var _juvenalHowl   = null;
  var _cosimoHowl    = null;
  var _janHusHowl    = null;
  var _francisHowl   = null;
  var _erasmusHowl   = null;
  var _henryHowl     = null;
  var _zhengheHowl   = null;
  var _sailingHowl   = null;
  var _columbusHowl  = null;
  var _voltaireHowl  = null;
  var _waterflowHowl = null;
  var _magicSwirlHowl = null;

  function cortesHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_cortesHowl) {
      _cortesHowl = _makeHowl('sfx/cortes-destroy.mp3');
    }
    return _cortesHowl;
  }

  function deflateHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_deflateHowl) {
      _deflateHowl = _makeHowl('sfx/cortes-deflate.mp3');
    }
    return _deflateHowl;
  }

  function joanHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_joanHowl) {
      _joanHowl = _makeHowl('sfx/joan-warhorn.mp3');
    }
    return _joanHowl;
  }

  function williamHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_williamHowl) {
      _williamHowl = _makeHowl('sfx/william-mine.mp3');
    }
    return _williamHowl;
  }

  function samuraiHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_samuraiHowl) {
      _samuraiHowl = _makeHowl('sfx/samurai-rise.mp3');
    }
    return _samuraiHowl;
  }

  function coinHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_coinHowl) {
      _coinHowl = _makeHowl('sfx/scholar-officials-coin.mp3');
    }
    return _coinHowl;
  }

  function pacalHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_pacalHowl) {
      _pacalHowl = _makeHowl('sfx/pacal-rewind.mp3');
    }
    return _pacalHowl;
  }

  function wuHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_wuHowl) {
      _wuHowl = _makeHowl('sfx/empresswu-push.mp3');
    }
    return _wuHowl;
  }

  function erasmusHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_erasmusHowl) {
      _erasmusHowl = _makeHowl('sfx/erasmus-noyield.mp3');
    }
    return _erasmusHowl;
  }

  function henryHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_henryHowl) {
      _henryHowl = _makeHowl('sfx/henrynav-watermoney.mp3');
    }
    return _henryHowl;
  }

  function zhengheHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_zhengheHowl) {
      _zhengheHowl = _makeHowl('sfx/zhenghe-bubble.mp3');
    }
    return _zhengheHowl;
  }

  function sailingHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_sailingHowl) {
      _sailingHowl = _makeHowl('sfx/boat-waves.mp3');
    }
    return _sailingHowl;
  }

  function columbusHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_columbusHowl) {
      _columbusHowl = _makeHowl('sfx/columbus-churchbell.mp3');
    }
    return _columbusHowl;
  }

  function voltaireHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_voltaireHowl) {
      _voltaireHowl = _makeHowl('sfx/voltaire-break.mp3');
    }
    return _voltaireHowl;
  }

  function waterflowHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_waterflowHowl) {
      _waterflowHowl = _makeHowl('sfx/waterflow.m4a');
    }
    return _waterflowHowl;
  }

  function magicSwirlHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_magicSwirlHowl) {
      _magicSwirlHowl = _makeHowl('sfx/magicswirl.m4a');
    }
    return _magicSwirlHowl;
  }

  function francisHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_francisHowl) {
      _francisHowl = _makeHowl('sfx/francis-prayer.mp3');
    }
    return _francisHowl;
  }

  function justinianHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_justinianHowl) {
      _justinianHowl = _makeHowl('sfx/justinian-reset.mp3');
    }
    return _justinianHowl;
  }

  function kenteHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_kenteHowl) {
      _kenteHowl = _makeHowl('sfx/kente-shield.mp3');
    }
    return _kenteHowl;
  }

  function juvenalHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_juvenalHowl) {
      _juvenalHowl = _makeHowl('sfx/juvenal-laugh.mp3');
    }
    return _juvenalHowl;
  }

  function cosimoHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_cosimoHowl) {
      _cosimoHowl = _makeHowl('sfx/demedici-money.mp3');
    }
    return _cosimoHowl;
  }

  function jesusHowl() {
    if (typeof Howl === 'undefined') return null;
    if (!_jesusHowl) {
      _jesusHowl = _makeHowl('sfx/jesus-resurrect.mp3', {
        onend: function () {
          var cb = _jesusOnFinished;
          _jesusOnFinished = null;
          if (cb) setTimeout(cb, 500);
        },
        onloaderror: function () {
          var cb = _jesusOnFinished;
          _jesusOnFinished = null;
          if (cb) setTimeout(cb, 500);
        },
        onplayerror: function () {
          var cb = _jesusOnFinished;
          _jesusOnFinished = null;
          if (cb) setTimeout(cb, 500);
        }
      });
    }
    return _jesusHowl;
  }

  /* ── Public SFX API ─────────────────────────────────────────── */

  return {

    /** Card flips face-up: quick pitch click */
    cardReveal: function () {
      tone(440, 'square', 0.005, 0.015, 0.07, 0.09);
      tone(660, 'square', 0.003, 0.010, 0.05, 0.06, 0.025);
    },

    /** At Once ability fires: ascending 3-note chime */
    atOnce: function () {
      tone(523, 'square', 0.005, 0.04, 0.06, 0.09);          // C5
      tone(659, 'square', 0.005, 0.04, 0.06, 0.09, 0.11);    // E5
      tone(784, 'square', 0.005, 0.05, 0.10, 0.09, 0.22);    // G5
    },

    /** End-of-turn IP gain (e.g. Megalith): short positive 2-note up-blip —
        distinct from the 3-note At-Once chime so the new timing reads apart. */
    eotGain: function () {
      tone(587, 'square', 0.004, 0.03, 0.05, 0.09);          // D5
      tone(880, 'square', 0.004, 0.05, 0.09, 0.10, 0.09);    // A5 — bright landing
    },

    /** Learning check — CORRECT: bright ascending 8-bit "ta-da" chime */
    learnCorrect: function () {
      tone(659,  'square', 0.005, 0.04, 0.06, 0.11);         // E5
      tone(880,  'square', 0.005, 0.04, 0.06, 0.11, 0.09);   // A5
      tone(1175, 'square', 0.005, 0.07, 0.14, 0.11, 0.18);   // D6 — bright finish
    },

    /** Learning check — WRONG: low buzzy "bummer" buzzer (two detuned squares + grit) */
    learnWrong: function () {
      tone(196, 'square',   0.004, 0.20, 0.07, 0.15);        // G3
      tone(185, 'square',   0.004, 0.20, 0.07, 0.11);        // detuned → buzzy beat
      noise(0.05, 0.05);                                      // a touch of grit
    },

    /** Continuous ability activates: soft warm two-note hum */
    continuous: function () {
      tone(330, 'sine', 0.015, 0.06, 0.10, 0.12);
      tone(440, 'sine', 0.015, 0.05, 0.10, 0.08, 0.08);
    },

    /** Conditional ability triggers: dramatic descending 3-note drop */
    conditional: function () {
      tone(523, 'square', 0.005, 0.06, 0.05, 0.14);          // C5
      tone(415, 'square', 0.005, 0.06, 0.05, 0.14, 0.13);    // Ab4
      tone(311, 'square', 0.005, 0.10, 0.12, 0.14, 0.26);    // Eb4
    },

    /** Card destroyed: noise crunch + pitch drop */
    cardDestroyed: function () {
      noise(0.06, 0.35);
      tone(200, 'sawtooth', 0.005, 0.04, 0.14, 0.14);
      tone(100, 'square',   0.005, 0.04, 0.14, 0.09, 0.08);
    },

    /** Card discarded from hand: high-to-low whoosh sweep */
    cardDiscarded: function () {
      var ac = getCtx();
      if (!ac) return;
      try {
        var osc = ac.createOscillator();
        var env = ac.createGain();
        var now = ac.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);
        env.gain.setValueAtTime(0.18, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(env);
        env.connect(_dest(ac));
        osc.start(now);
        osc.stop(now + 0.23);
      } catch (e) {}
    },

    /** IP increased: bright high-pitched ding */
    ipGained: function () {
      tone(880, 'sine', 0.004, 0.03, 0.14, 0.14);
    },

    /** IP decreased: short low thud */
    ipLost: function () {
      tone(110, 'square', 0.004, 0.03, 0.12, 0.14);
      noise(0.04, 0.18);
    },

    /** Location win fanfare: 5-note triumphant arpeggio */
    locationWon: function () {
      var notes = [523, 659, 784, 1047, 1319];  // C E G C E
      notes.forEach(function (f, i) {
        tone(f, 'square', 0.005, 0.06, 0.09, 0.14, i * 0.1);
      });
    },

    /** Capital spent (card played): soft click */
    capitalSpent: function () {
      tone(440, 'square', 0.002, 0.008, 0.025, 0.05);
    },

    /** End Turn button pressed: punchy medium thump */
    endTurn: function () {
      tone(293, 'square', 0.003, 0.04, 0.07, 0.16);
      tone(220, 'square', 0.003, 0.03, 0.09, 0.11, 0.05);
    },

    /** Game won: 7-note victory fanfare */
    gameWon: function () {
      var notes = [523, 659, 784, 523, 659, 784, 1047];
      var times = [0, 0.12, 0.24, 0.45, 0.57, 0.69, 0.85];
      notes.forEach(function (f, i) {
        tone(f, 'square', 0.005, 0.08, 0.12, 0.16, times[i]);
      });
    },

    /** Game lost: 4-note sad descending melody */
    gameLost: function () {
      var notes = [494, 440, 392, 330];  // B A G E
      notes.forEach(function (f, i) {
        tone(f, 'square', 0.005, 0.10, 0.16, 0.14, i * 0.22);
      });
    },

    /** Cortes charge — plays "You Are Nothing" m4a (fire-and-forget) */
    cortesCharge: function () {
      var howl = cortesHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/cortes-destroy.mp3').play(); } catch (e) {}
    },

    /** Calls cb() once Cortes's audio finishes (or immediately if it's not playing). */
    afterCortesAudio: function (cb) {
      var howl = cortesHowl();
      if (!howl || !howl.playing()) { cb(); return; }
      howl.once('end', cb);
    },

    /**
     * William the Conqueror gains IP — plays "william-mine.mp3" on every card destruction.
     * Exempt from mute so it fires live during Cortes's animation sequence.
     */
    williamGain: function () {
      var howl = williamHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/william-mine.mp3').play(); } catch (e) {}
    },

    /** Samurai returns — plays "samurai-rise.mp3" (fire-and-forget) */
    samuraiReturn: function () {
      var howl = samuraiHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio("sfx/samurai-rise.mp3").play(); } catch (e) {}
    },

    /** Joan of Arc ability — plays "joan-warhorn.mp3" (fire-and-forget) */
    joanRise: function () {
      var howl = joanHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/joan-warhorn.mp3').play(); } catch (e) {}
    },

    /** Scholar-Officials ability — plays scholar-officials-coin.mp3 */
    coinSound: function () {
      if (_muted) return;
      var howl = coinHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/scholar-officials-coin.mp3').play(); } catch (e) {}
    },

    /** Pacal the Great ability — plays pacal-rewind.mp3 */
    pacalSound: function () {
      if (_muted) return;
      var howl = pacalHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/pacal-rewind.mp3').play(); } catch (e) {}
    },

    /** Erasmus ability — plays erasmus-noyield.mp3 when the discard chooser opens */
    erasmusSound: function () {
      var howl = erasmusHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/erasmus-noyield.mp3').play(); } catch (e) {}
    },

    /**
     * Francis of Assisi ability — plays francis-prayer.mp3.
     * @param {Function} [callback]  Called when the track ends (or immediately on fallback).
     */
    francisSound: function (callback) {
      var howl = francisHowl();
      if (howl) {
        if (callback) howl.once('end', callback);
        try { howl.volume(_sfxVol()); } catch (e) {}
        howl.stop();
        howl.play();
        return;
      }
      try { new Audio('sfx/francis-prayer.mp3').play(); } catch (e) {}
      if (callback) setTimeout(callback, 800);
    },

    /** Jan Hus ability — plays janhus-firebell.mp3 */
    janHusSplit: function () {
      if (_muted) return;
      if (!_janHusHowl && typeof Howl !== 'undefined') {
        _janHusHowl = _makeHowl('sfx/janhus-firebell.mp3');
      }
      if (_janHusHowl) { _playHowl(_janHusHowl); return; }
      try { new Audio('sfx/janhus-firebell.mp3').play(); } catch (e) {}
    },

    /** Empress Wu ability — plays Empress Wu_mixdown.wav */
    wuPunch: function () {
      if (_muted) return;
      var howl = wuHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/empresswu-push.mp3').play(); } catch (e) {}
    },

    /** Justinian ability — plays justinian-reset.mp3 */
    justinianShing: function () {
      if (_muted) return;
      var howl = justinianHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/justinian-reset.mp3').play(); } catch (e) {}
    },

    /** Cortes blocked — plays deflate sfx (fire-and-forget) */
    cortesDeflate: function () {
      var howl = deflateHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/cortes-deflate.mp3').play(); } catch (e) {}
    },

    /** Kente revealed — shield spell chime */
    kenteSound: function () {
      if (_muted) return;
      var howl = kenteHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/kente-shield.mp3').play(); } catch (e) {}
    },

    /** Juvenal revealed / penalising a card — laughter sfx */
    juvenalSound: function () {
      if (_muted) return;
      var howl = juvenalHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/juvenal-laugh.mp3').play(); } catch (e) {}
    },

    /** Cosimo de'Medici revealed — money-bags sfx */
    cosimoSound: function () {
      if (_muted) return;
      var howl = cosimoHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/demedici-money.mp3').play(); } catch (e) {}
    },

    /** Henry the Navigator revealed — "thank you for your patronage" */
    henrySound: function () {
      if (_muted) return;
      var howl = henryHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/henrynav-watermoney.mp3').play(); } catch (e) {}
    },

    /** Zheng He ability fires — plays zhenghe-bubble when cards are boosted */
    zhengheSound: function () {
      if (_muted) return;
      var howl = zhengheHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/zhenghe-bubble.mp3').play(); } catch (e) {}
    },

    /** Magellan moves — plays boat-waves.mp3 */
    sailingSound: function () {
      if (_muted) return;
      var howl = sailingHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/boat-waves.mp3').play(); } catch (e) {}
    },

    /** Voltaire ability activates (+4 bonus as sole card) */
    voltaireSound: function () {
      if (_muted) return;
      var howl = voltaireHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/voltaire-break.mp3').play(); } catch (e) {}
    },

    /** Canals starts boosting a newly-qualifying Labor card — flowing water with a
     *  short fade-out on its tail (applied at playback via Howler; asset unchanged). */
    waterflowSound: function () {
      if (_muted) return;
      var howl = waterflowHowl();
      if (howl) {
        howl.stop();
        howl.volume(_sfxVol());           // reset to current SFX volume (a prior tail-fade may have left it at 0)
        var id = howl.play();
        var FADE_MS = 800;                // tail fade length
        howl.once('play', function () {
          var durMs = (howl.duration() || 0) * 1000;
          if (durMs > FADE_MS) {
            setTimeout(function () {
              try { howl.fade(howl.volume(), 0, FADE_MS, id); } catch (e) {}
            }, durMs - FADE_MS);
          }
        }, id);
        return;
      }
      try { new Audio('sfx/waterflow.m4a').play(); } catch (e) {}
    },

    /** Student-signup "conjuring" flourish (js/account-ui.js, credential-card
     *  reveal) — 4s swirl with a 500ms fade on its tail, timed to match the
     *  visual particle animation's own synced fade-out. Never throws: the
     *  caller's 4s visual timeline runs on its own clock regardless of
     *  whether this sound loads or plays. */
    magicSwirl: function () {
      if (_muted) return;
      try {
        var howl = magicSwirlHowl();
        if (!howl) { try { new Audio('sfx/magicswirl.m4a').play(); } catch (e) {} return; }
        howl.stop();
        howl.volume(_sfxVol());
        var id = howl.play();
        var FADE_MS = 500;
        howl.once('play', function () {
          var durMs = (howl.duration() || 0) * 1000;
          if (durMs > FADE_MS) {
            setTimeout(function () {
              try { howl.fade(howl.volume(), 0, FADE_MS, id); } catch (e) {}
            }, durMs - FADE_MS);
          }
        }, id);
      } catch (e) {}
    },

    /** Columbus arrives at a location with Cultural cards — plays church bell */
    columbusSound: function () {
      if (_muted) return;
      var howl = columbusHowl();
      if (howl) { _playHowl(howl); return; }
      try { new Audio('sfx/columbus-churchbell.mp3').play(); } catch (e) {}
    },

    /**
     * Silence / restore all sounds (used during Cortes animation).
     * cortesCharge and cortesDeflate are exempt and always play.
     */
    mute: function (v) { _muted = !!v; },

    /**
     * Jesus Christ returns to hand: plays the sfx file via Howler.
     * Falls back to raw Audio if Howler is not loaded.
     * @param {Function} [onFinished]  Called 500 ms after the track ends.
     */
    jesusReturn: function (onFinished) {
      if (_muted) { if (onFinished) setTimeout(onFinished, 500); return; }
      var howl = jesusHowl();
      if (howl) {
        _jesusOnFinished = onFinished || null;
        try { howl.volume(_sfxVol()); } catch (e) {}
        howl.stop();
        howl.play();
        return;
      }
      // Fallback: Howler not loaded — use raw Audio element
      try {
        var audio = new Audio('sfx/jesus-resurrect.mp3');
        audio.volume = 1.0;
        if (onFinished) {
          audio.addEventListener('ended', function () { setTimeout(onFinished, 500); });
          audio.addEventListener('error', function () { setTimeout(onFinished, 500); });
        }
        audio.play().catch(function () { if (onFinished) setTimeout(onFinished, 500); });
      } catch (e) {
        if (onFinished) setTimeout(onFinished, 500);
      }
    }

  };

})();

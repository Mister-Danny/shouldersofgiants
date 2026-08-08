/* ══════════════════════════════════════════════════════════════════════════
   SOG.DialogueRunner — shared in-battle speech-bubble runner.

   Extracted from five near-identical private copies (sog-adventure-
   {gilgamesh,sargon,hammurabi,hanginggardens,narmer}.js each had their own
   _dlg/runLines/showLine/advanceLine/finishRunner + bleep/bubble helpers).
   Behavior-preserving: every boss's own bleep profiles / bubble-id mapping /
   Hammurabi's slam-before/reveal-before line gate now plug into one engine
   instead of five copies of it.

   create(opts) returns one runner instance holding its own dialogue state, so
   a boss module calling create() once at load time behaves exactly like its
   old private module-scope _dlg did.
   ══════════════════════════════════════════════════════════════════════════ */
window.SOG = window.SOG || {};
SOG.DialogueRunner = (function () {
  'use strict';

  function create(opts) {
    opts = opts || {};
    var TYPE_SPEED_MS   = opts.typeSpeedMs || 32;
    var bubbleIds        = opts.bubbleIds || ['otzi', 'explorer'];
    var bubbleIdFor      = opts.bubbleIdFor || function (who) { return who === 'explorer' ? 'explorer' : 'otzi'; };
    var profiles          = opts.bleepProfiles || {};
    var defaultProfileKey = opts.defaultProfileKey;
    var onLineGate        = opts.onLineGate;         // optional (line, next) => true if it took over
    var isAdvanceBlocked  = opts.isAdvanceBlocked;    // optional () => bool

    var _bleepCtx = null;
    function getBleepCtx() {
      if (_bleepCtx) return _bleepCtx;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) _bleepCtx = new Ctx();
      } catch (e) {}
      return _bleepCtx;
    }

    function profileFor(who) {
      return profiles[who] || profiles[defaultProfileKey] || { freq: 440, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 };
    }

    function playBleep(who) {
      var ctx = getBleepCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
      var p    = profileFor(who);
      var now  = ctx.currentTime;
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      var freq = p.freq + (Math.random() - 0.5) * p.wobble;
      osc.type = p.wave || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + p.dur);
    }

    function getBubbleEl(id) { return document.getElementById('adv-bubble-' + id); }
    function hideBubbles() {
      bubbleIds.forEach(function (id) {
        var el = getBubbleEl(id);
        if (el) el.classList.remove('is-visible', 'is-ready');
      });
    }

    var _dlg = {
      lines: null, lineIdx: 0, isTyping: false, timer: null,
      fullText: '', textEl: null, activeEl: null, clickHandler: null, onAllDone: null
    };

    function runLines(lines, onAllDone) {
      if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(true);   // duck battle music during dialogue
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

      if (onLineGate && onLineGate(line, showLine)) return;   // boss-specific gate took over; it re-enters via next()

      var thisId  = bubbleIdFor(line.who);
      var otherId = bubbleIds.filter(function (id) { return id !== thisId; })[0];
      var otherEl = otherId && getBubbleEl(otherId);
      if (otherEl) otherEl.classList.remove('is-visible', 'is-ready');

      var el = getBubbleEl(thisId);
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
          var p = profileFor(line.who);
          bleepCount++;
          if (bleepCount >= (p.every || 2)) { bleepCount = 0; playBleep(line.who); }
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
      if (isAdvanceBlocked && isAdvanceBlocked()) return;
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
      if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(false);   // restore battle music after dialogue
      if (_dlg.clickHandler) {
        document.removeEventListener('click',   _dlg.clickHandler);
        document.removeEventListener('keydown', _dlg.clickHandler);
        _dlg.clickHandler = null;
      }
      if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
      _dlg.isTyping = false;
      hideBubbles();
      var onDone     = _dlg.onAllDone;
      _dlg.onAllDone = null;
      _dlg.lines     = null;
      if (onDone) onDone();
    }

    return {
      runLines:     runLines,
      advanceLine:  advanceLine,
      hideBubbles:  hideBubbles,
      getBubbleEl:  getBubbleEl,
      playBleep:    playBleep,
      getBleepCtx:  getBleepCtx
    };
  }

  return { create: create };
})();

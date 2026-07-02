/**
 * sog-adventure-gilgamesh.js
 * Shoulders of Giants — Adventure Mode: Gilgamesh Battle 1 (Phase D3a)
 *
 * Real battle on the shared config engine (initGame + the 'gilgamesh' script):
 * cost-free, 2 cards/turn, 4 turns, with Gilgamesh-specific data.
 * SOG.GilgameshBattle.start() is called by
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
 * State flags (one-and-done battle — no rematch):
 *   sog_cuneiform_granted          — set when Cuneiform is awarded (post-loss)
 *   sog_gilgamesh_phase1_complete  — set on victory (overworld re-entry gate)
 *   sog_battle_gilgamesh_complete  — set on victory (isBattleComplete / overworld)
 */

var SOG = window.SOG || {};

SOG.GilgameshBattle = (function () {
  'use strict';

  /* ── localStorage keys ──────────────────────────────────────── */
  var KEY_BATTLE_GILGAMESH_COMPLETE = 'sog_battle_gilgamesh_complete'; // set on victory
  var KEY_PHASE1_COMPLETE           = 'sog_gilgamesh_phase1_complete';
  var KEY_CUNEIFORM_GRANTED         = 'sog_cuneiform_granted';

  /* ── Deck IDs (one-and-done: the same battle is retried until won) ─── */
  var PREHISTORY_IDS   = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]; // 11 — player base
  var GILGAMESH_AI_IDS = [38, 39, 40, 41, 42, 43, 45, 48, 49];         // 9 Mesopotamia
  var ENKIDU_ID        = 44;                   // ALWAYS in Gilgamesh's AI deck
  var GILGAMESH_CARD_ID = 43;                  // granted to the player on victory

  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }

  /* ── Timing ──────────────────────────────────────────────────── */
  var TYPE_SPEED_MS = 32;
  var TOTAL_TURNS   = 4;

  /* ── Logging ─────────────────────────────────────────────────── */
  function log(msg) { if (window.SOG_DEBUG) console.log('[Adventure/Gilgamesh] ' + msg); }

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
    gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
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
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(false);   // restore battle music after dialogue
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

  /* ── Avatar presentation ─────────────────────────────────────────
     Ally is the female Explorer (popped in at apply time); opponent is
     Gilgamesh. Both slots are set explicitly via the shared engine path
     (SOG.HUD.applyBattleAvatars / restoreBattleAvatars). */
  var PRESENTATION = {
    allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
    opponentAvatar: 'images/portraits/gilgameshportrait.jpeg',
    popAlly:        true
  };

  /* ── Battle rules popup + opponent-portrait interaction (D3a.1) ──── */
  var RULES_TITLE = 'The Epic Battle of Gilgamesh';
  var RULES_BODY  = [
    '4 Turns',
    'Play 2 cards each turn.',
    '<u>Win Condition</u> — Gain the most IP at the most locations to defeat Gilgamesh.'
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
    { who: 'otzi',     text: 'Prepare to be smited into the great beyond.' },
    { who: 'explorer', text: 'Gulp' },
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
      case 38: // Priest → a loc where the AI already has a Ziggurat (gains its +1 to Religious)
        return best(function (l) { return _gAiCardsAt(l.id).some(function (s) { return s.cardId === 45; }); },
                    function (id) { return _gAiCardsAt(id).filter(function (s) { return s.cardId === 45; }).length; });
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
      case 38: return pref !== null ? 2 : 0;     // Priest — prefers a loc with a Ziggurat (its +1)
      case 40: return pref !== null ? 2 : 0;     // Scribe co-located with earlier plays
      case 43: return turn >= 3 ? 4 : -1;        // Gilgamesh card late = big scorer
      default: return 0;
    }
  }

  /* ── Post-battle: self-rendered result popup ──────────────────────
     Win  → set phase-1 complete (+ lucky-win Cuneiform auto-grant) →
            "Continue" returns to the Mesopotamia overworld (D3b adds the
            5-card-grant sequence on top of this).
     Loss → "Play Again" (post-loss intervention, or a direct restart once
            Cuneiform is granted) + "Gameboard" (overworld). Tie = loss.  */

  // Gilgamesh's on-board taunt after a loss/tie, before the DEFEAT scoreboard.
  var GILGAMESH_LOSS_SMACK = [
    { who: 'otzi',     text: 'Muahaha...' },
    { who: 'explorer', text: 'I never had a chance.' },
    { who: 'otzi',     text: 'What did you expect in my city-state?' },
    { who: 'explorer', text: 'Your cards were too overpowering.' }
  ];

  // True if THIS win is the player's first-ever Gilgamesh win. Captured in
  // _routePostBattle BEFORE the completion flag is set, then read by the gold
  // reward in _runPostVictorySequence (first win = 25 gold, repeat win = 10).
  var _gWinWasFirstTime = false;

  function _routePostBattle(won, isTie, locResults) {
    // The FIRST win/loss keep their full narrative; once Gilgamesh has been
    // beaten, every later battle is streamlined (no post-game dialogue):
    //   • repeat win  → +10 gold animation → Play Again / Gameboard / Back To Map.
    //   • repeat loss → straight to that same scoreboard.
    var alreadyBeaten = _has(KEY_BATTLE_GILGAMESH_COMPLETE);
    if (won) {
      _gWinWasFirstTime = !alreadyBeaten;   // capture BEFORE setting the flag
      try { localStorage.setItem(KEY_PHASE1_COMPLETE, 'true'); } catch (e) {}
      try { localStorage.setItem(KEY_BATTLE_GILGAMESH_COMPLETE, 'true'); } catch (e) {}
      if (_gWinWasFirstTime) {
        _showResultPopup(true, locResults);   // CONTINUE → _runPostVictorySequence
      } else {
        // Repeat win: VICTORY chime + pop-up (2.5s) → +10 gold acquisition →
        // the streamlined scoreboard.
        _victoryFlourish(function () {
          _grantRepeatWinGold(function () {
            _showResultPopup(true, locResults, { repeat: true });
          });
        });
      }
    } else if (alreadyBeaten) {
      // Loss after the initial victory: straight to the scoreboard (no smack-talk).
      _showResultPopup(false, locResults, { repeat: true });
    } else {
      // First-encounter loss: Gilgamesh smack-talk on the board, THEN the DEFEAT
      // scoreboard (PLAY AGAIN → Cuneiform intervention).
      runLines(GILGAMESH_LOSS_SMACK, function () {
        _showResultPopup(false, locResults);
      });
    }
  }

  /* Repeat-win flourish: the word VICTORY — same gold colour / font / glow as the
     scoreboard headline (.result-headline.result-player) — pops in with the victory
     chime, holds 2.5s, then fades and hands off to the gold acquisition. Only the
     REPEAT-win path uses it (the first win has its full post-victory sequence). */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'gilg-victory-flourish';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10045;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity 0.3s ease;';
    var txt = document.createElement('div');
    txt.className   = 'result-headline result-player';
    txt.textContent = 'VICTORY';
    txt.style.cssText = 'opacity:0;transform:scale(0.7);transition:opacity 0.3s ease, transform 0.45s cubic-bezier(0.2,0.9,0.3,1);';
    overlay.appendChild(txt);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void txt.offsetHeight;
    txt.style.opacity = '1'; txt.style.transform = 'scale(1)';
    setTimeout(function () {
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 300);
    }, 2500);
  }

  /* Repeat-win gold: bank +10, refresh the HUD number, play the coin animation. */
  function _grantRepeatWinGold(done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(10);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(10, function () { if (done) done(); });
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

  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  /* Grant the Gilgamesh card (43) on victory via the shared card-acquisition
     reveal. On a REPEAT win the player already owns it, so skip the acquisition
     animation entirely (only the gold reward should play). SOG.Cards.unlock
     returns true only when something was NEWLY unlocked — use that as the gate. */
  function _grantGilgameshCard(done) {
    var newlyUnlocked = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newlyUnlocked = !!SOG.Cards.unlock([GILGAMESH_CARD_ID]);
    }
    if (!newlyUnlocked) { if (done) done(); return; }   // already owned → no card reveal
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === GILGAMESH_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Gold-acquisition animation: coin + "<amount> Gold" (gold letters, black
     outline) fade in and fall to a centre stopping point; demedici-money.mp3
     plays AT the moment it lands. `amount` is a parameter — not hardcoded — so
     this is reusable for any future gold reward. onDone fires after it settles. */
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'gilg-gold-reward';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;pointer-events:none;';

    // Same shadowed backdrop the card-acquisition reveal uses (rgba(0,0,0,0.80)),
    // so the board stays dimmed through the gold reward too. Present from the
    // first frame (no fade-in) and faded out with the reward at the end. On a
    // repeat win — where the card reveal is skipped — this is the only dim.
    var dim = document.createElement('div');
    dim.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.80);transition:opacity 0.4s ease;';

    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;' +
      'transform:translateY(-110px);transition:opacity 0.45s ease, transform 0.7s cubic-bezier(0.2,0.9,0.3,1);';

    var coin = document.createElement('img');
    coin.src = 'images/ui_images/coin.png'; coin.alt = ''; coin.draggable = false;
    coin.style.cssText = 'width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6));';

    var label = document.createElement('div');
    label.textContent = amount + ' Gold';
    label.style.cssText = 'font-family:var(--font, sans-serif);font-size:46px;font-weight:bold;color:#f3d574;' +
      '-webkit-text-stroke:2px #1a0a04;' +
      'text-shadow:-2px -2px 0 #1a0a04, 2px -2px 0 #1a0a04, -2px 2px 0 #1a0a04, 2px 2px 0 #1a0a04, 0 4px 6px rgba(0,0,0,0.55);';

    box.appendChild(coin); box.appendChild(label);
    overlay.appendChild(dim);   // shadow backdrop behind the reward
    overlay.appendChild(box);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);

    void box.offsetHeight;                 // reflow so the transition animates from the start state
    box.style.opacity = '1';
    box.style.transform = 'translateY(0)';

    // SFX early in the drop (sooner than the full 0.7s fall).
    setTimeout(function () { _playSfx('sfx/demedici-money.mp3'); }, 300);

    // Hold, then fade out + finish.
    setTimeout(function () {
      box.style.transition = 'opacity 0.4s ease';
      box.style.opacity = '0';
      dim.style.opacity = '0';          // fade the shadow out with the reward
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 420);
    }, 1900);
  }

  /* ── Post-victory reward sequence (one-and-done win) ──────────────
     CONTINUE on the victory scoreboard runs this on the battle screen:
       win dialogue → Gilgamesh-card acquisition (43) → [gold reward, part 4]
       → closing dialogue → [Mesopotamian Marketplace transition, part 4].
     The old rematch machinery (5-card grant, Enkidu reveal, deck-builder
     hand-off) is retired — Enkidu now just lives in Gilgamesh's deck. */
  function _runPostVictorySequence() {
    runLines([
      { who: 'explorer', text: 'I did it!' },
      { who: 'otzi',     text: 'How was that possible?' },
      { who: 'explorer', text: 'I learned from history.' },
      { who: 'otzi',     text: "By doing so, you've earned this." }
    ], function () {
      // (a) Win reward: grant the Gilgamesh card (43) with the acquisition animation.
      _grantGilgameshCard(function () {
        // (b) Gold reward — first win = 25, repeat = 10 (per _gWinWasFirstTime,
        // captured before the win flag was set). Bank it, refresh the HUD gold
        // number, play the coin animation, then continue. Gold lives only on the
        // Gilgamesh win path; Prehistory/Otzi/Arcadium award none.
        var grantGoldThenFinish = function () {
          var goldAmount = _gWinWasFirstTime ? 25 : 10;
          if (window.SOG && SOG.gold) SOG.gold.add(goldAmount);
          if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
          _runGoldRewardAnimation(goldAmount, function () {
          runLines([
            { who: 'explorer', text: 'Wow!' },
            { who: 'otzi',     text: 'See what you can get yourself at the Mesopotamian Marketplace.' },
            { who: 'explorer', text: "Thank you! You're such a gracious king." },
            { who: 'otzi',     text: "Until the next time..." }
          ], function () {
            // The win dialogue (above) teases the Marketplace; now fade to the
            // Mesopotamia map at Uruk and reveal the market node. The player
            // walks into it on their own when ready — no auto-walk. (The market
            // SCREEN itself is a placeholder until next session — see overworld
            // _enterMarket's TODO.)
            _returnToMesopotamiaMarket();
          });
          });   // _runGoldRewardAnimation callback
        };
        // (a.5) FLUKE-WIN guard: a player who beat Gilgamesh on the first try
        // (never lost) never received the candle-intervention Cuneiform. If they
        // still don't own Cuneiform (46) at win time, grant it HERE — between the
        // Gilgamesh-card and gold grants — using the SAME acquisition animation
        // (_grantCuneiform). Normal-path players already own it, so this is a no-op
        // and they get Gilgamesh + gold exactly as before.
        var ownsCuneiform = !!(window.SOG && SOG.Cards &&
          typeof SOG.Cards.isUnlocked === 'function' && SOG.Cards.isUnlocked(46));
        if (ownsCuneiform) { grantGoldThenFinish(); }
        else { _grantCuneiform(grantGoldThenFinish); }
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
  function _showResultPopup(won, locResults, opts) {
    opts = opts || {};
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
    if (opts.repeat) {
      // Streamlined post-initial-victory scoreboard (win or loss): no narrative.
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _removeResultPopup(); _onPlayAgain(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn('BACK TO MAP', function () { _removeResultPopup(); _exitToOverworld(); }));
    } else if (won) {
      // First victory → the post-victory reward sequence (Gilgamesh-card grant +
      // closing dialogue; gold + market in part 4).
      actions.appendChild(mkBtn('CONTINUE', function () { _removeResultPopup(); _runPostVictorySequence(); }));
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

  /* ── Post-loss Cuneiform intervention (battle-screen, no candle) ──────
     Plays over the (still-intact) lost board: SHH → board fades to black →
     HUD Farmer/Explorer conversation (Cuneiform card-acquisition mid-way) →
     board fades back in "as it was" → Gilgamesh re-challenges on the board →
     onDone (the caller shakes + restarts into a fresh game with Cuneiform now
     shuffled into the deck). The HUD only renders on the overworld screen
     (CSS-gated to body[data-screen="overworld"]), so while everything is black
     we switch to the overworld for the HUD, then switch back to the battle
     screen before fading the black out — invisible to the player. */
  // Farmer dialogue runs in two halves around the Cuneiform card-acquisition
  // animation (A → grant reveal → B).
  var FARMER_POSTLOSS_A = [
    { who: 'farmer',   text: 'Hey, I think you could use this.' },
    { who: 'explorer', text: 'What?' }
  ];
  var FARMER_POSTLOSS_B = [
    { who: 'explorer', text: "What's this?" },
    { who: 'farmer',   text: 'Cuneiform, the first written language.' },
    { who: 'explorer', text: 'Oh wow, how does it work?' },
    { who: 'farmer',   text: 'You should read it, obviously.' },
    { who: 'explorer', text: 'Oh, right.' },
    { who: 'farmer',   text: 'But in effect, it will empower those old prehistoric cards you have.' },
    { who: 'explorer', text: 'Thank you.' },
    { who: 'farmer',   text: "Don't mention." },
    { who: 'farmer',   text: "Seriously, he'll kill me." }
  ];
  var GILGAMESH_POSTLOSS_CHALLENGE = [
    { who: 'otzi',     text: 'Back for more?' },
    { who: 'explorer', text: "I think, I'm ready." },
    { who: 'otzi',     text: 'I think you should have learned your lesson.' },
    { who: 'explorer', text: "That's exactly what I did." }
  ];

  // Pure-black cover at z 100 — below the HUD (150) and grant reveals (5000+),
  // above the screen content (same proven layer as the candle backdrop).
  function _gFadeToBlack(onDone) {
    var prev = document.getElementById('gilg-loss-fade');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var fade = document.createElement('div');
    fade.id = 'gilg-loss-fade';
    fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:100;pointer-events:none;transition:opacity 0.5s ease;';
    (document.getElementById('sog-stage') || document.body).appendChild(fade);
    void fade.offsetHeight;   // reflow so the transition animates from 0
    fade.style.opacity = '1';
    setTimeout(function () { if (onDone) onDone(); }, 540);
  }
  function _gFadeFromBlack(onDone) {
    var fade = document.getElementById('gilg-loss-fade');
    if (!fade) { if (onDone) onDone(); return; }
    fade.style.opacity = '0';
    setTimeout(function () { if (fade.parentNode) fade.parentNode.removeChild(fade); if (onDone) onDone(); }, 540);
  }
  function _gHudLines(lines, cb) {
    var hud = window.SOG && SOG.HUD;
    if (hud && typeof hud.runLines === 'function') hud.runLines(lines, cb);
    else if (cb) cb();
  }

  /* Post-loss Cuneiform intervention WITH the candle restored:
       SHH → board fades to black → MATCHSTRIKE + candle flame fills the black →
       Farmer/Explorer conversation in the lower HUD (Cuneiform card-acquisition
       mid-way) → SHH + candle fades out → HUD exits → battle board returns →
       Gilgamesh re-challenges on the board → onDone (caller shakes + restarts
       into a fresh game with Cuneiform now shuffled in).
     The candle flame visual is reused from overworld.js (window.Overworld
     .showCuneiformCandle / .fadeOutCuneiformCandle), which owns the flame in one
     place. If unavailable, we fall back to the plain-black conversation. */
  function _runCuneiformIntervention(onDone) {
    var hud = window.SOG && SOG.HUD;
    var ow  = window.Overworld;
    var hasCandle = !!(ow && typeof ow.showCuneiformCandle === 'function'
                          && typeof ow.fadeOutCuneiformCandle === 'function');
    // Keep the "shh" intervention SILENT: it borrows the overworld screen below
    // (so the HUD can render the Farmer dialogue), which would otherwise resume the
    // map music via the showScreen hook. Suppress + stop any music for the duration.
    window._sogSuppressMapMusic = true;
    if (window.SOG && SOG.ui && typeof SOG.ui.stopBgMusic === 'function') SOG.ui.stopBgMusic();
    _playSfx('sfx/shh.m4a');
    _gFadeToBlack(function () {
      // Behind black: borrow the overworld screen so the HUD can render.
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      if (hud && typeof hud.enterDialogueMode === 'function') hud.enterDialogueMode(null, function () {});
      if (hud && typeof hud.swapNpcPortrait === 'function') hud.swapNpcPortrait({ character: 'farmer' });

      var runConversation = function () {
        _gHudLines(FARMER_POSTLOSS_A, function () {
          _grantCuneiform(function () {
            _gHudLines(FARMER_POSTLOSS_B, function () {
              var backToBoard = function () {
                // Behind the candle: return to the intact battle board.
                if (typeof showScreen === 'function') showScreen('screen-battle');
                window._sogSuppressMapMusic = false;   // "shh" sequence over — music may resume again
                _playSfx('sfx/shh.m4a');   // SHH as the candle is snuffed
                var revealChallenge = function () {
                  runLines(GILGAMESH_POSTLOSS_CHALLENGE, function () {
                    if (onDone) onDone();
                  });
                };
                if (hasCandle) {
                  // The candlelit backdrop covers the plain-black cover beneath
                  // it, so drop the black instantly (invisible), then fade the
                  // candle out to reveal the battle board.
                  var f = document.getElementById('gilg-loss-fade');
                  if (f && f.parentNode) f.parentNode.removeChild(f);
                  ow.fadeOutCuneiformCandle(revealChallenge);
                } else {
                  _gFadeFromBlack(revealChallenge);
                }
              };
              if (hud && typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(backToBoard);
              else backToBoard();
            });
          });
        });
      };

      // MATCHSTRIKE + candle flame fills the black, THEN the conversation runs
      // over the candlelit backdrop. No candle helper → plain-black fallback.
      if (hasCandle) ow.showCuneiformCandle(runConversation);
      else runConversation();
    });
  }

  /* "Play Again" after a loss. Cuneiform already granted → restart directly.
     Otherwise run the post-loss intervention (above) on the still-intact board,
     then shake → restart into a fresh Attempt 2 (Cuneiform now in the deck). */
  function _onPlayAgain() {
    if (_has(KEY_CUNEIFORM_GRANTED)) {
      _restartBattle();
      return;
    }
    _runCuneiformIntervention(function () {
      shakeCamera(function () { _restartBattle(); });
    });
  }

  function _restartBattle() {
    window._sogSuppressMapMusic = false;   // safety: never leave map music suppressed
    teardown();   // engine owns the End Turn / Reset buttons now
    if (typeof SOG !== 'undefined' && SOG.GilgameshBattle) SOG.GilgameshBattle.start();
  }

  /* Tear down and return to the Mesopotamia overworld. */
  function _exitToOverworld() {
    teardown();   // engine owns the End Turn / Reset buttons now
    if (typeof showScreen === 'function') showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* Post-win → Mesopotamia market navigation. Fade to black, tear down, switch
     to the overworld screen UNDER the black, then hand off to the overworld:
     it lands at Uruk, reveals the market node, and (first time) auto-walks into
     the market. We pass _gFadeFromBlack as the "map shown" callback so the black
     lifts once the overworld has positioned the Explorer + refreshed the nodes.
     Falls back to the plain overworld return if the hook is unavailable. */
  function _returnToMesopotamiaMarket() {
    var ow = window.Overworld;
    if (!ow || typeof ow.returnFromGilgameshWin !== 'function') { _exitToOverworld(); return; }
    _gFadeToBlack(function () {
      teardown();   // engine owns the End Turn / Reset buttons now
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      ow.returnFromGilgameshWin(function () { _gFadeFromBlack(); });
    });
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
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
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
    log('start() → initGame(buildGilgameshConfig)');

    // Prime the Web Audio context (needs a user gesture — the click that
    // started this encounter counts, so resume here to ensure beeps work).
    var _ctx = getBleepCtx();
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch (e) {} }

    // Route through game.js's engine: buildGilgameshConfig + the registered
    // 'gilgamesh' script (scriptHook) supply ALL setup + narrative via the
    // lifecycle hooks — onIntro (body classes + screen switch under the
    // overworld wipe), onBattleStart (avatars + fade cover + deal + the
    // Attempt-1 opening dialogue with the interactive portrait/rules-popup pause
    // + wire the persistent rules click), onTurnStart/onPlayerPlayed/
    // onBeforeReveal/isInputBlocked, and onWin/onLoss/onTie. The AI is the
    // heuristic seam (gilgameshSelectPlays) + adventure Chariot movement.
    if (typeof window.initGame === 'function') window.initGame(buildGilgameshConfig());
  }

  /* ════════════════════════════════════════════════════════════════
     BATTLE-CONFIG MIGRATION (Stage 2) — DORMANT
     ────────────────────────────────────────────────────────────────
     The engine-resident half of this battle: a config-builder + a registered
     'gilgamesh' script that map the bespoke flow onto game.js's initGame
     lifecycle + the Stage-1 heuristic-AI seam (cfg.ai.profile 'heuristic' +
     cfg.ai.movement 'adventure'). REUSES the bespoke helpers (dialogue, popup,
     AI heuristics, post-battle sequences) — it calls them, it does not
     re-implement.

     ── DORMANT THIS SESSION ──
     The registry holds the script, but the entry point (start) still runs the
     bespoke loop and NEVER assigns buildGilgameshConfig() to G.config — so the
     'gilgamesh' scriptHook never resolves and no hook fires (the shared input.js
     onPlayerPlayed / isInputBlocked call sites resolve the active script from
     G.config.scriptHook, which bespoke Gilgamesh leaves untouched). The Stage-3
     cutover flips start() to initGame(buildGilgameshConfig()),
     reconciles board-presentation timing (the engine's _initGameBuild deals the
     hand the bespoke dealCards/setupBattleBoard does today), and removes the
     bespoke loop.
  ════════════════════════════════════════════════════════════════ */

  // Cedar Forest / Uruk / Mount Mashu, no abilities — setupBattleBoard's inline
  // location defs expressed as a config helper (abilityKey already null).
  function _gilgameshLocations() {
    return [
      { id: 8, name: 'Cedar Forest', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/cedarforest.jpg', thumbnailCrop: null },
      { id: 7, name: 'Uruk',         region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/uruk.jpg',       thumbnailCrop: null },
      { id: 2, name: 'Mount Mashu',  region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/mountmashu.jpg', thumbnailCrop: null }
    ];
  }

  /* Card-aware AI selector behind the Stage-1 'heuristic' seam. A faithful
     re-packaging of aiPlayCards (NOT a redesign): the same ranked/held/
     preferred/fallback decisions, reusing the same _g* helpers (which read
     SOG.state.G directly). Receives ctx = { G, turn, hand, locations } and
     RETURNS [{cardId, locId}] in play order; the engine commits each via its
     own commitPlay. To keep the sequential decisions IDENTICAL to the bespoke
     (which placed each card via _gAiPlaceCard before deciding the next), it
     reflects each pick on the board between iterations, then RESTORES the board
     so the engine stays the authoritative committer (no reveal-queue / DOM side
     effects here). */
  function gilgameshSelectPlays(ctx) {
    var G = ctx.G;                       // === SOG.state.G (the _g* helpers read it)
    var numPlay = Math.min(2, G.aiHand.length);
    var plays = [], simSlots = [], handSnapshot = G.aiHand.slice();
    for (var p = 0; p < numPlay; p++) {
      if (!G.aiHand.length || !_gAiOpenLocs().length) break;
      var ranked = G.aiHand.map(function (cid) { return { cid: cid, score: _gCardPlayScore(cid, G.turn) }; });
      var playable = ranked.filter(function (r) { return r.score >= 0; });
      var pool = playable.length ? playable : ranked;
      pool.sort(function (a, b) { return b.score - a.score; });
      var cardId = pool[0].cid;
      var locId  = _gPreferredLoc(cardId);
      if (locId === null) locId = _gFallbackLoc();
      if (locId === null) break;
      var slotIndex = G.aiSlots[locId].indexOf(null);
      if (slotIndex === -1) break;
      var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
      if (!card) break;                  // mirrors _gAiPlaceCard's !card → false → break
      plays.push({ cardId: cardId, locId: locId });
      G.aiSlots[locId][slotIndex] = { cardId: cardId, ip: card.ip, revealed: false, ipMod: 0, contMod: 0, ipModSources: [], turnPlayed: G.turn };
      G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
      simSlots.push({ locId: locId, slotIndex: slotIndex });
    }
    simSlots.forEach(function (s) { G.aiSlots[s.locId][s.slotIndex] = null; });
    G.aiHand = handSnapshot;
    return plays;
  }

  // The config-builder (one-and-done: ONE battle, retried until won). Player =
  // Prehistory base (+Cuneiform once granted on a loss); AI = Gilgamesh's 9
  // Mesopotamia cards + Enkidu (always). The 'gilgamesh' script drives it.
  function buildGilgameshConfig() {
    // The player fights with their ACTIVE deck. While the deck builder is still
    // locked this is the default deck (slot 1), which auto-mirrors the collection
    // — 11 Prehistory cards, +Cuneiform after a loss — so it matches the old
    // fixed list. Once the builder unlocks, it's whatever the player has built.
    if (window.SOG && SOG.collection && typeof SOG.collection.syncDefaultDeck === 'function') {
      SOG.collection.syncDefaultDeck();
    }
    var activeIds = (window.Decks && typeof window.Decks.getActiveCards === 'function')
      ? window.Decks.getActiveCards() : [];
    var playerDeck;
    if (activeIds && activeIds.length) {
      playerDeck = { source: 'active-deck', shuffle: true };   // game.js → Decks.getActiveCards()
    } else {
      // Safety net: never start the battle with an empty deck.
      var pIds = PREHISTORY_IDS.slice();
      if (_has(KEY_CUNEIFORM_GRANTED)) pIds.push(46);
      playerDeck = { source: 'explicit', ids: pIds, shuffle: true };
    }
    var aiDeck     = { source: 'explicit', ids: GILGAMESH_AI_IDS.concat([ENKIDU_ID]), shuffle: true };
    return {
      structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 4, cardsPerTurn: 2 },
      resource:  { model: 'none', capital: 0 },               // cost-free
      draw:      { model: 'replenish' },                       // fill-to-4
      decks:     { player: playerDeck, ai: aiDeck },
      locationAbilities: { select: { mode: 'explicit', locations: _gilgameshLocations() } },
      scoring:   { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },  // exact-IP tie → onTie (tie-as-loss)
      ai:        { profile: 'heuristic', movement: 'adventure', settings: { selectPlays: gilgameshSelectPlays } },
      presentation: {
        bodyClass:        'gilgamesh-battle',                  // Mesopotamia location art
        bodyClassExtra:   'otzi-battle',                       // shared adventure-battle styling
        preCoachingClass: 'otzi-pre-deal',                     // hides hand until the deal
        allyAvatar:       'images/portraits/femaleexplorer%20portrait.jpeg',
        opponentAvatar:   'images/portraits/gilgameshportrait.jpeg',
        popAlly:          true
      },
      // Minimal — the script's onWin owns the reward sequence (Gilgamesh-card
      // grant; gold + market in part 4) and sets the completion flags itself;
      // the engine never consumes this since onWin/onLoss/onTie don't proceed().
      rewards:   { onWin: { completionFlag: KEY_PHASE1_COMPLETE } },
      scriptHook: 'gilgamesh'
    };
  }

  /* ── 'gilgamesh' script (registered; dormant until the Stage-3 cutover) ── */
  var _gBattleSkippedOpening = false;   // decide-once, captured in onIntro
  var _gScriptDialogueActive = false;   // drives isInputBlocked during the opening

  // Opening dialogue + interactive pause play ONCE (first attempt): skip on a
  // repeat (opening-seen) or after the post-loss Cuneiform grant (every retry).
  // Captured BEFORE _runOpeningDialogue can set sog_gilgamesh_opening_seen
  // (the Prehistory decide-once lesson — don't re-evaluate post-mutation).
  function _gScriptSkipOpening() {
    return _has('sog_gilgamesh_opening_seen') || _has(KEY_CUNEIFORM_GRANTED);
  }
  function _gApplyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass)        document.body.classList.add(p.bodyClass);
    if (p.bodyClassExtra)   document.body.classList.add(p.bodyClassExtra);
    if (p.preCoachingClass) document.body.classList.add(p.preCoachingClass);
  }
  function _gEnableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }
  function _gDisableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }

  var GILGAMESH_SCRIPT = {
    // Pre-board: context classes + switch to the battle screen under the
    // overworld's radial-wipe cover (onBattleStart fades it). Decide-once skip
    // captured here, before the opening can flip sog_gilgamesh_opening_seen.
    onIntro: function (ctx, done) {
      _gBattleSkippedOpening = _gScriptSkipOpening();
      _gApplyPresentationClasses(ctx.config && ctx.config.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();   // → engine builds the board (decks/locations from config) under the cover
    },

    // Board built (hidden by otzi-pre-deal). Avatars + turn-1 presentation, then
    // fade the cover → deal → (Attempt-1 only) opening dialogue + INTERACTIVE
    // PAUSE (glow portrait → await click → BattleRulesPopup → resume) → wire the
    // persistent rules-popup portrait click. done() begins turn 1.
    onBattleStart: function (ctx, done) {
      if (SOG.HUD && SOG.HUD.applyBattleAvatars) SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      setTurnCounter(1, TOTAL_TURNS);
      _gDisableButtons();
      fadeOutCover(function () {
        dealCards(function () {
          var finishStart = function () { _wireOpponentPortraitClick(); done(); };
          if (_gBattleSkippedOpening) { finishStart(); return; }
          _gScriptDialogueActive = true;
          _runOpeningDialogue(function () {   // 5 lines → portrait pause → rules popup → "Thank you"
            _gScriptDialogueActive = false;
            finishStart();
          });
        });
      });
    },

    // Turns 2-4: re-apply per-turn presentation; buttons disabled until a play.
    onTurnStart: function (ctx, turn) {
      setTurnCounter(turn, TOTAL_TURNS);
      _gDisableButtons();
    },

    // A card was committed — enable End Turn + Reset (mirrors notifyPlayerPlayed).
    onPlayerPlayed: function (ctx, p) { _gEnableButtons(); },

    // Player ended the turn — keep buttons disabled through the reveal.
    onBeforeReveal: function (ctx, turn) { _gDisableButtons(); },

    // Block card input while the opening dialogue / interactive pause is active.
    isInputBlocked: function (ctx) { return !!_gScriptDialogueActive; },

    // Outcomes own the screen (no proceed()): _routePostBattle — win → set
    // completion flags → scoreboard CONTINUE → _runPostVictorySequence (dialogue
    // → Gilgamesh-card grant → [gold/market, part 4] → overworld); loss → PLAY
    // AGAIN → Cuneiform intervention → retry the SAME battle; exact-IP tie →
    // routed as a loss (tie-as-loss). result.locResults is the same
    // {loc, playerIP, aiIP} shape Otzi already consumes.
    onWin:  function (ctx, result, proceed) { _routePostBattle(true,  false, result.locResults); },
    onLoss: function (ctx, result, proceed) { _routePostBattle(false, false, result.locResults); },
    onTie:  function (ctx, result, proceed) { _routePostBattle(false, true,  result.locResults); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('gilgamesh', GILGAMESH_SCRIPT);
  }

  /* ── Public surface ──────────────────────────────────────────── */
  function isBattleComplete() {
    try { return localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true'; }
    catch (e) { return false; }
  }

  return {
    start:                start,
    isBattleComplete:     isBattleComplete,
    teardown:             teardown
  };

})();

window.SOG = SOG;

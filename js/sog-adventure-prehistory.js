/**
 * sog-adventure-prehistory.js
 * Shoulders of Giants — Adventure Mode · Prehistory arc
 *
 * Houses the Neanderthal tutorial battle (the first Adventure Mode
 * battle). Future Prehistory-arc battles will also live here.
 *
 * Public entry point:
 *   SOG.Adventure.Prehistory.startNeanderthalBattle()
 *     — Called by overworld.js after the player clicks the Prehistory
 *       node and (if it's their first time) the walk completes.
 *     — Branches on the localStorage gate:
 *         • sog_battle_neanderthal_complete === 'true'
 *           → skip pre-battle dialogue + radial wipe + Lucy coaching,
 *             drop the player straight into the gameboard (battle still
 *             plays — the player can replay the matchup).
 *         • else → full intro sequence (phases C → D → E) then battle.
 *
 * State:
 *   • localStorage: sog_battle_neanderthal_complete
 *       Set to 'true' on victory (phase F). Persists across sessions.
 *   • in-memory:    neanderthalIntroSeenThisSession
 *       Set to true after the first intro plays this browser session.
 *       Used by the defeat-replay flow (phase F) to skip the walk +
 *       dialogue + wipe when the player retries within the same
 *       session. Closing/reopening the tab resets to false, so a fresh
 *       visit always replays the full intro on the first attempt.
 *
 * Implementation phases (each ships as its own commit):
 *   A — Card abilities (in js/game/abilities.js)       [SHIPPED]
 *   B — Module skeleton + overworld wiring             [THIS COMMIT]
 *   C — Pre-battle dialogue + radial wipe
 *   D — Gameboard customization (single-loc, Turn counter, CC hidden)
 *   E — Coaching dialogue + UI slide-in
 *   F — Turn loop, scripted AI, win/loss + replay flow
 *
 * Depends on (phase B): nothing at call time — the entry point is
 *   currently a stub that logs the path it would take. Overworld
 *   wiring assumes window.SOG.Adventure.Prehistory exists when the
 *   Prehistory node is clicked; this script tag must load before the
 *   user clicks. Insertion point in index.html is after game/ui.js so
 *   all SOG.* namespaces (state, board, input, abilities, ui) are
 *   built by the time any consumer asks for them.
 *
 * Devtools:
 *   • SOG.Adventure.Prehistory.isBattleComplete()
 *       Returns true if the win flag is set.
 *   • SOG.Adventure.Prehistory.resetBattleComplete()
 *       Clears both the localStorage flag and the session flag — so the
 *       full intro plays on the next click.
 */

window.SOG          = window.SOG          || {};
window.SOG.Adventure = window.SOG.Adventure || {};

window.SOG.Adventure.Prehistory = (function () {
  'use strict';

  /* ── State keys ────────────────────────────────────────────── */
  var KEY_BATTLE_COMPLETE = 'sog_battle_neanderthal_complete';

  // Session-only flag — see header comment.
  var neanderthalIntroSeenThisSession = false;

  /* ── Logging helper ────────────────────────────────────────── */
  function log(msg) { console.log('[Adventure/Prehistory] ' + msg); }

  /* ── Tuning constants ──────────────────────────────────────── */
  var TYPE_SPEED_MS      = 32;     // ms per character (slightly slower
                                   // than overworld dialogue's 28 — these
                                   // are short shouts, give them weight)
  var POST_TYPE_HOLD_MS  = 900;    // hold after each line types out before
                                   // auto-advancing
  var POST_DIALOGUE_MS   = 2000;   // 2-second beat after both bubbles
                                   // before the wipe fires (per spec step 2)
  var WIPE_DURATION_MS   = 1000;   // 1s radial expansion (per spec step 3)

  /* ── Audio (lazy-loaded Howls) ──────────────────────────────── */
  var wooshHowl       = null;
  var cardAcquireHowl = null;

  function ensureWoosh() {
    if (wooshHowl || typeof Howl === 'undefined') return;
    wooshHowl = new Howl({ src: ['sfx/woosh.m4a'], volume: 0.8, html5: true });
  }
  function playWoosh() {
    ensureWoosh();
    if (wooshHowl) { try { wooshHowl.volume(0.8 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1)); wooshHowl.stop(); wooshHowl.play(); } catch (e) {} }
  }

  function ensureCardAcquire() {
    if (cardAcquireHowl || typeof Howl === 'undefined') return;
    cardAcquireHowl = new Howl({ src: ['sfx/cardacquire.mp3'], volume: 0.9, html5: true });
  }
  function playCardAcquire() {
    ensureCardAcquire();
    if (cardAcquireHowl) { try { cardAcquireHowl.volume(0.9 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1)); cardAcquireHowl.stop(); cardAcquireHowl.play(); } catch (e) {} }
  }

  /* ── Text-bleep audio (Web Audio API, no asset required) ──────
     Mirrors the overworld.js bleep engine so voices feel consistent
     across both systems.

     Profiles:
       'lucy'        — 340 Hz square, every 2 non-space chars.
                       Identical to her overworld voice so she always
                       sounds the same.
       'otzi'        — 210 Hz triangle, every 2 chars. Warmer/earthier
                       than Lucy; used as the Otzi baseline.
       'neanderthal' — 185 Hz triangle, every 3 chars. Same texture as
                       Otzi but the bleep fires one char later, making
                       it feel heavier and slightly slower.             */
  var _bleepCtx = null;
  function _getBleepCtx() {
    if (_bleepCtx) return _bleepCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _bleepCtx = new Ctx();
    } catch (e) {}
    return _bleepCtx;
  }

  var BLEEP_PROFILES = {
    // Lucy's sound is handled by the canonical special-case in playBleep()
    // (sine 480 Hz — matches the original tutorial battle); only `every` is
    // read here, for the every-3rd-char cadence.
    lucy:        { freq: 480, wobble: 0,  wave: 'sine',     peak: 0.10, decay: 0.035, dur: 0.04, every: 3 },
    otzi:        { freq: 210, wobble: 20, wave: 'triangle', peak: 0.07, decay: 0.07, dur: 0.08, every: 2 },
    neanderthal: { freq: 185, wobble: 20, wave: 'triangle', peak: 0.07, decay: 0.09, dur: 0.10, every: 3 }
  };

  function playBleep(who) {
    var ctx = _getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var now = ctx.currentTime;
    if (who === 'lucy') {
      // Lucy's canonical bleep — identical to the original tutorial battle
      // (tutorial.js playBlip): sine, 480 Hz, fast linear attack + linear decay.
      var losc  = ctx.createOscillator();
      var lgain = ctx.createGain();
      losc.type = 'sine';
      losc.frequency.setValueAtTime(480, now);
      lgain.gain.setValueAtTime(0,    now);
      lgain.gain.linearRampToValueAtTime(0.10 * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
      lgain.gain.linearRampToValueAtTime(0,    now + 0.035);
      losc.connect(lgain).connect(ctx.destination);
      losc.start(now); losc.stop(now + 0.04);
      return;
    }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var freq = p.freq + (Math.random() - 0.5) * p.wobble;
    osc.type = p.wave;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0,      now);
    gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1),  now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
  }

  /* ════════════════════════════════════════════════════════════
     PHASE C — Pre-battle dialogue (speech bubbles)
     ════════════════════════════════════════════════════════════
     Neanderthal "AARRGH!" (top-right) then Explorer "Uh oh…"
     (bottom-left). Auto-advancing typewriter — this is a cutscene
     reaction shot, not an interactive conversation. After both
     lines have typed + their hold, a 2-second beat lands the
     moment before the radial wipe fires.

     Both bubbles stay visible on screen through the 2-second beat
     and through the start of the wipe; the wipe element covers
     them as it expands, so an explicit fade isn't necessary. */

  function getBubbleEl(who) {
    return document.getElementById('adv-bubble-' + who);
  }

  function showBubbleText(who, text, onDone) {
    var el = getBubbleEl(who);
    if (!el) { log('bubble #adv-bubble-' + who + ' missing — skipping'); if (onDone) onDone(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { if (onDone) onDone(); return; }

    textEl.textContent = '';
    el.classList.add('is-visible');

    // Typewriter — char-by-char with bleeps, then hold, then call onDone.
    var i = 0, bleepCount = 0;
    var timer = setInterval(function () {
      i++;
      textEl.textContent = text.slice(0, i);
      var c = text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var profile = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
        bleepCount++;
        if (bleepCount >= profile.every) { bleepCount = 0; playBleep(who); }
      }
      if (i >= text.length) {
        clearInterval(timer);
        setTimeout(onDone, POST_TYPE_HOLD_MS);
      }
    }, TYPE_SPEED_MS);
  }

  function hideAllBubbles() {
    ['neanderthal', 'explorer', 'lucy'].forEach(function (who) {
      var el = getBubbleEl(who);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }

  function playPreBattleDialogue(onDone) {
    log('Phase C — pre-battle dialogue starting');
    // Use the overworld's .adv-dialogue system so the Neanderthal/Explorer
    // pre-battle exchange looks identical to the Lucy intro conversation.
    var ow = window.Overworld;
    if (ow && typeof ow.runPreBattleLines === 'function') {
      ow.runPreBattleLines([
        { who: 'neanderthal', text: 'AARRGH!' },
        { who: 'explorer',    text: 'Uh oh…' },
        { who: 'explorer',    text: 'Help?' }
      ], function () {
        log('Phase C — pre-battle dialogue complete');
        if (onDone) onDone();
      });
    } else {
      // Fallback: overworld module unavailable — skip dialogue, go to wipe.
      log('Phase C — Overworld.runPreBattleLines unavailable, skipping dialogue');
      if (onDone) onDone();
    }
  }

  /* ════════════════════════════════════════════════════════════
     PHASE C — Radial wipe transition
     ════════════════════════════════════════════════════════════
     Center the wipe on the Prehistory node's current screen
     position (the character + node are still rendered on the
     overworld). Animate clip-path circle from radius 0 to
     viewport-cover. Plays woosh.m4a at the start. */

  function getPrehistoryNodeCenter() {
    // Look up the node element placed by overworld.js's loadMap().
    var nodeEl = document.querySelector(
      '#overworld-overlay [data-id="prehistory"]'
    );
    if (!nodeEl) {
      // Fallback to viewport center if the node DOM is missing for any
      // reason (shouldn't happen in normal flow — overworld must be
      // active for the player to have clicked the node).
      log('WARN: prehistory node DOM not found, wiping from viewport center');
      return { xPct: 50, yPct: 50 };
    }
    var rect = nodeEl.getBoundingClientRect();
    var cx   = rect.left + rect.width  / 2;
    var cy   = rect.top  + rect.height / 2;
    return {
      xPct: (cx / window.innerWidth)  * 100,
      yPct: (cy / window.innerHeight) * 100
    };
  }

  function radialWipe(onCoverComplete) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) {
      log('WARN: #adv-radial-wipe missing — skipping wipe');
      if (onCoverComplete) onCoverComplete();
      return;
    }
    var center  = getPrehistoryNodeCenter();
    var maxR    = Math.max(window.innerWidth, window.innerHeight) * 1.4;

    log('Phase C — radial wipe starting (center ' + center.xPct.toFixed(1) +
        '%,' + center.yPct.toFixed(1) + '%, max radius ' + Math.round(maxR) + 'px)');

    // Position + reveal the overlay at radius 0
    wipeEl.style.clipPath = 'circle(0px at ' + center.xPct + '% ' + center.yPct + '%)';
    wipeEl.classList.add('active');

    // SFX in lock-step with the wipe start
    playWoosh();

    // GSAP-driven radius tween (clip-path isn't directly tween-able)
    if (typeof gsap === 'undefined') {
      // Fallback: snap to fully-covered, then call onCoverComplete.
      wipeEl.style.clipPath = 'circle(' + maxR + 'px at ' + center.xPct + '% ' + center.yPct + '%)';
      setTimeout(function () { if (onCoverComplete) onCoverComplete(); }, WIPE_DURATION_MS);
      return;
    }
    var proxy = { r: 0 };
    gsap.to(proxy, {
      r: maxR,
      duration: WIPE_DURATION_MS / 1000,
      ease: 'power2.inOut',
      onUpdate: function () {
        wipeEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + center.xPct + '% ' + center.yPct + '%)';
      },
      onComplete: function () {
        log('Phase C — radial wipe fully covered');
        if (onCoverComplete) onCoverComplete();
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     PHASE D — Gameboard customization
     ════════════════════════════════════════════════════════════
     Bypasses initGame() (per the architecture decision in phase B —
     option β). Builds G state directly, calls the same low-level
     SOG.* render helpers initGame() uses, and applies a body
     context class so CSS overrides constrain the standard
     #screen-battle DOM into the single-location tutorial layout.

     Specifically:
       • body.prehistory-battle           — gates all CSS overrides
       • body.prehistory-pre-coaching     — additionally hides hand +
                                            deck + opp hand + bottom-
                                            right HUD until Phase E
                                            slides them in.

     The Camp uses loc.id = 100, a value safely outside the standard
     1-6 range so CSS rules (.battle-col[data-loc-id="100"]) target
     it without colliding with the canonical locations.

     Player deck (8 cards, no Lucy):
       26 Tool, 27 Hunter, 28 Gatherer, 29 Fire,
       30 Cave Art, 31 Megalith, 32 Domesticated Animal, 36 Tribe
     Shuffled on entry; initial hand of 4 drawn off the top.

     AI hand/deck (parallel-to-player model):
       Game start: AI hand=[27,28,31,34] (4 scripted cards), AI deck=[29,30,32,36,26] (5 cosmetic).
       T1 plays Hunter (27): hand 4→3; start-of-turn flat +1 keeps the hand topped up.
       T2 plays Gatherer (28) → hand 4, deck 3.
       T3 plays Megalith (31) → hand 4, deck 2.
       T4 plays Neanderthal (34) → hand 4, deck 1.
  ═══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     BATTLE CONFIG (battle-config migration, Stage 1)
     ──────────────────────────────────────────────────────────────
     The rules half of this battle expressed as a config object, per the
     migration design. This session is the HYBRID step: the existing
     Prehistory turn loop stays, but its setup/AI now READ from this config
     instead of hardcoded literals. (Full cutover to game.js's lifecycle +
     the engine config-dimension extensions is a deferred later step.)

     • The Camp uses pseudo-location ID 100 to sidestep the standard locs
       (1-6) so .battle-col[data-loc-id="100"] targets only this tile.
     • decks.player.ids per cards.js (no duplicates, no Lucy id 33).
     • ai.settings.playOrder is the scripted opponent sequence T1→T4:
       Hunter(27) → Gatherer(28) → Megalith(31) → Neanderthal(34).
       handPadding seeds G.aiDeck with 5 cosmetic cards (faces never shown,
       no overlap with the play order) so the opp-hand display starts
       hand=4 / deck=5, matching the player.
     • scriptHook 'prehistory' is the target; the script module is registered
       in the deferred Stage 3, so it is INERT this session (no script is
       registered → the BattleHooks seam resolves to null and falls through).
  ══════════════════════════════════════════════════════════════ */
  var BATTLE_CONFIG = {
    structure: { turns: 4, locationsCount: 1, slotsPerLocation: 4,
                 handStart: 4, maxHandSize: 4, cardsPerTurn: 1 },
    resource:  { model: 'none', capital: 0, resetEachTurn: false },
    // Flat +1 draw per turn (NOT draw-to-cap). Tool(26)'s reveal-phase draw
    // is the documented soft-cap exception that can push the hand to 5.
    draw:      { model: 'flat', perTurn: 1, softCapExceptionCardId: 26 },
    decks: {
      player: { source: 'explicit', ids: [26, 27, 28, 29, 30, 31, 32, 36], shuffle: true },
      ai:     { source: 'scripted' }   // cards come from ai.settings.playOrder
    },
    locationAbilities: {
      select: { mode: 'explicit', locations: [
        { id: 100, name: 'The Camp', region: '', abilityText: '', abilityKey: null }
      ] }
    },
    scoring: {
      rule: 'single-location', metric: 'player-ip-vs-ai-ip',
      outcomes: { win: 'pIP>aIP', loss: 'pIP<aIP', tie: 'pIP===aIP' },
      tie: 'loss'   // a tie is treated like a loss for progression (own dialogue/screen)
    },
    rewards: { onWin: { cards: [34], completionFlag: 'sog_battle_neanderthal_complete' } },
    presentation: {
      bodyClass:        'prehistory-battle',        // gates all CSS overrides (applied pre-board)
      preCoachingClass: 'prehistory-pre-coaching',  // additionally hides hand+deck+HUD until slide-in
      allyAvatar:       'images/portraits/Lucy.png',          // ally is Lucy (HTML default — no visible swap)
      opponentAvatar:   'images/portraits/neanderthalportait.jpeg'
    },
    ai: { profile: 'scriptedSequence',
          settings: { playOrder: [27, 28, 31, 34], faceDown: true,
                      handPadding: [29, 30, 32, 36, 26] } },
    // The battle runs through game.js's initGame lifecycle + the registered
    // 'prehistory' script (below), which supplies all narrative via the hooks.
    scriptHook: 'prehistory'
  };

  function setTurnCounter(current, total) {
    var capEl = document.getElementById('battle-capital-info');
    if (capEl) capEl.textContent = 'Turn ' + current + ' / ' + total;
    // The turn-info element is hidden via CSS in prehistory mode but
    // clear it anyway so a stale value doesn't reappear if CSS misses.
    var turnEl = document.getElementById('battle-turn-info');
    if (turnEl) turnEl.textContent = '';
  }

  // Pre-board presentation: apply the battle's static body-class identity from
  // config.presentation. These classes drive all CSS overrides and gate the
  // hidden-until-slide-in state, so they're applied BEFORE the board renders.
  // The bespoke setup calls this now; the 'prehistory' script calls it from
  // onIntro at the cutover — one path, one source of truth.
  function _applyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass)        document.body.classList.add(p.bodyClass);
    if (p.preCoachingClass) document.body.classList.add(p.preCoachingClass);
  }

  /* ── Fade the radial-wipe cover out to reveal the board ───── */
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
      opacity: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active');
        wipeEl.style.opacity  = '';
        wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     PHASE E — Coaching dialogue + UI slide-in
     ════════════════════════════════════════════════════════════
     Step 5 (intro exchange): Neanderthal + Lucy 5-line exchange,
     played with click-to-advance typewriter (mid-type click skips
     to full text; full-text click advances). Lucy avatar pops in
     during her first line and stays visible for the rest of the
     battle.

     Step 6 (transition): light camera shake (~300ms), then UI
     slide-in — hand cards fly individually from Lucy's avatar
     position into their dock; opp hand slides down from the top;
     Turn counter slides from the left; Reset/End Turn buttons
     slide from the right.

     Step 7 (coaching): Lucy's 9-line tutorial coaching. During the
     "See that number?" line, the rightmost hand card's IP overlay
     pulses (adv-ip-pulse class); the next line clears the pulse.
     After the final line, the pulse is cleared and Phase F's turn
     loop kicks in.
  ═══════════════════════════════════════════════════════════════ */

  var COACHING_PHASE_1 = [
    { who: 'neanderthal', text: 'This my fire.' },
    { who: 'lucy',        text: "He thinks he invented fire and doesn't have to share it.",
                          popLucyOnStart: true },
    { who: 'neanderthal', text: 'Me no think. Me know.' },
    { who: 'lucy',        text: 'You no think, alright.' },
    { who: 'neanderthal', text: 'AARRGH!!!' }
  ];

  var COACHING_PHASE_2 = [
    { who: 'lucy', text: "If this Neanderthal wants to get rocked, we're ready to roll." },
    { who: 'lucy', text: 'Pay attention, this is important...' },
    { who: 'lucy', text: 'See those cards?' },
    { who: 'lucy', text: 'You play one each turn on your side of The Camp.' },
    { who: 'lucy', text: 'See that number?',                  startIPPulse: true },
    { who: 'lucy', text: 'Those are Influence Points, or IP for short.' },
    { who: 'lucy', text: 'Your goal here is to gain the most IP at The Camp after four turns.' },
    { who: 'lucy', text: 'Oh, and most cards have special abilities.' },
    { who: 'lucy', text: 'If you want to win, click on them to read what they have in store.' },
    { who: 'lucy', text: "When you're ready to send this guy back to whatever came before the Stone Age..." },
    { who: 'lucy', text: 'Click and drag your first card into play.' }
  ];

  /* ── Coaching dialogue runner ──────────────────────────────── */
  // Per-line typewriter state — module-scoped because the click
  // handler and the typewriter timer both need to mutate it.
  var co_isTyping     = false;
  var co_timer        = null;
  var co_fullText     = '';
  var co_textEl       = null;
  var co_activeEl     = null;   // bubble element currently shown (for hint management)
  // Per-runner state.
  var co_lines        = null;
  var co_lineIdx      = 0;
  var co_clickHandler = null;
  var co_onAllDone    = null;

  function runCoachingLines(lines, onAllDone) {
    co_lines     = lines;
    co_lineIdx   = 0;
    co_onAllDone = onAllDone;

    co_clickHandler = function (e) {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      coachingAdvance();
    };
    // Defer the listener so the click that triggered the previous beat
    // doesn't bubble in and skip line 1 before typing starts.
    setTimeout(function () {
      document.addEventListener('click',   co_clickHandler);
      document.addEventListener('keydown', co_clickHandler);
    }, 0);

    showCoachingLine();
  }

  function showCoachingLine() {
    var line = co_lines[co_lineIdx];
    if (!line) { finishCoachingRunner(); return; }

    // Side-effect markers — fire BEFORE typing starts.
    if (line.popLucyOnStart) popLucyIn();
    if (line.startIPPulse)   startIPPulse();

    // Hide the other bubbles — only one bubble visible at a time.
    var who = line.who;  // 'neanderthal' | 'lucy' | 'explorer'
    ['neanderthal', 'explorer', 'lucy'].forEach(function (w) {
      if (w === who) return;
      var el = getBubbleEl(w);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });

    var el     = getBubbleEl(who);
    if (!el) { co_lineIdx++; showCoachingLine(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { co_lineIdx++; showCoachingLine(); return; }

    textEl.textContent = '';
    el.classList.add('is-visible');
    el.classList.remove('is-ready');  // hide hint while typing

    co_fullText = line.text;
    co_textEl   = textEl;
    co_isTyping = true;
    co_activeEl = el;  // track active bubble for hint management

    var i = 0, bleepCount = 0;
    if (co_timer) clearInterval(co_timer);
    co_timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
      var c = line.text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var profile = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
        bleepCount++;
        if (bleepCount >= profile.every) { bleepCount = 0; playBleep(who); }
      }
      if (i >= line.text.length) {
        clearInterval(co_timer);
        co_timer    = null;
        co_isTyping = false;
        el.classList.add('is-ready');  // show hint when typing finishes
      }
    }, TYPE_SPEED_MS);
  }

  function coachingAdvance() {
    if (co_isTyping) {
      // First click during typewriter — skip to full text immediately.
      if (co_timer) { clearInterval(co_timer); co_timer = null; }
      if (co_textEl) co_textEl.textContent = co_fullText;
      co_isTyping = false;
      // Show hint immediately after skip
      if (co_activeEl) co_activeEl.classList.add('is-ready');
      return;
    }
    co_lineIdx++;
    if (co_lineIdx >= co_lines.length) {
      finishCoachingRunner();
      return;
    }
    showCoachingLine();
  }

  function finishCoachingRunner() {
    if (co_clickHandler) {
      document.removeEventListener('click',   co_clickHandler);
      document.removeEventListener('keydown', co_clickHandler);
      co_clickHandler = null;
    }
    if (co_timer) { clearInterval(co_timer); co_timer = null; }
    co_isTyping = false;
    hideAllBubbles();
    stopIPPulse();
    var onDone = co_onAllDone;
    co_onAllDone = null;
    co_lines     = null;
    if (onDone) onDone();
  }

  /* ════════════════════════════════════════════════════════════
     POST-BATTLE DIALOGUE + CARD REVEAL (win / loss sequences)
     ════════════════════════════════════════════════════════════ */

  /* ── Dialogue line arrays ───────────────────────────────────── */
  var WIN_DIALOGUE = [
    { who: 'neanderthal', text: 'Hey, you not so bad.'        },
    { who: 'lucy',        text: 'Yeah, you really know your stuff.'  },
    { who: 'neanderthal', text: 'You join my tribe?'          },
    { who: 'lucy',        text: "Don't let him get any ideas." },
    { who: 'neanderthal', text: 'Oh fine, can I join yours?'  }
  ];

  var LOSS_DIALOGUE = [
    { who: 'neanderthal', text: 'You no match for me.'        },
    { who: 'lucy',        text: 'How did you let that happen?' },
    { who: 'neanderthal', text: 'Me the strongest.'           },
    { who: 'lucy',        text: "Click and read your card abilities and he doesn't stand a chance." }
  ];

  var TIE_DIALOGUE = [
    { who: 'neanderthal', text: 'Hm. We same.'                              },
    { who: 'lucy',        text: 'A tie is not a win.'                       },
    { who: 'neanderthal', text: 'Come back. I ready.'                       },
    { who: 'lucy',        text: 'We were close. Use your abilities and go again.' }
  ];

  /* ── Post-battle dialogue runner (mirrors co_* coaching runner) ─
     Same typewriter + click-to-advance pattern as the coaching
     dialogue.  First click while typing = skip to full text.
     First click after line is done = advance to next line.       */
  var pb_isTyping     = false;
  var pb_timer        = null;
  var pb_fullText     = '';
  var pb_textEl       = null;
  var pb_activeEl     = null;
  var pb_lines        = null;
  var pb_lineIdx      = 0;
  var pb_clickHandler = null;
  var pb_onAllDone    = null;

  // Active flag — blocks card clicks and other input while running.
  var postBattleDialogueActive = false;

  function runPostBattleDialogue(lines, onAllDone) {
    pb_lines              = lines;
    pb_lineIdx            = 0;
    pb_onAllDone          = onAllDone;
    postBattleDialogueActive = true;

    pb_clickHandler = function (e) {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      pbAdvance();
    };
    // Defer listener so the click that ended the reveal phase doesn't
    // skip line 1 before the typewriter has even started.
    setTimeout(function () {
      document.addEventListener('click',   pb_clickHandler);
      document.addEventListener('keydown', pb_clickHandler);
    }, 0);

    showPostBattleLine();
  }

  function showPostBattleLine() {
    var line = pb_lines[pb_lineIdx];
    if (!line) { finishPostBattleRunner(); return; }

    var who = line.who;
    ['neanderthal', 'explorer', 'lucy'].forEach(function (w) {
      if (w === who) return;
      var el = getBubbleEl(w);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });

    var el     = getBubbleEl(who);
    if (!el)     { pb_lineIdx++; showPostBattleLine(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { pb_lineIdx++; showPostBattleLine(); return; }

    textEl.textContent = '';
    el.classList.add('is-visible');
    el.classList.remove('is-ready');

    pb_fullText = line.text;
    pb_textEl   = textEl;
    pb_isTyping = true;
    pb_activeEl = el;

    var i = 0, bleepCount = 0;
    if (pb_timer) clearInterval(pb_timer);
    pb_timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
      var c = line.text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var profile = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
        bleepCount++;
        if (bleepCount >= profile.every) { bleepCount = 0; playBleep(who); }
      }
      if (i >= line.text.length) {
        clearInterval(pb_timer);
        pb_timer    = null;
        pb_isTyping = false;
        el.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  function pbAdvance() {
    if (pb_isTyping) {
      // First click skips to full text, shows hint.
      if (pb_timer) { clearInterval(pb_timer); pb_timer = null; }
      if (pb_textEl) pb_textEl.textContent = pb_fullText;
      pb_isTyping = false;
      if (pb_activeEl) pb_activeEl.classList.add('is-ready');
      return;
    }
    pb_lineIdx++;
    if (pb_lineIdx >= pb_lines.length) {
      finishPostBattleRunner();
      return;
    }
    showPostBattleLine();
  }

  function finishPostBattleRunner() {
    if (pb_clickHandler) {
      document.removeEventListener('click',   pb_clickHandler);
      document.removeEventListener('keydown', pb_clickHandler);
      pb_clickHandler = null;
    }
    if (pb_timer) { clearInterval(pb_timer); pb_timer = null; }
    pb_isTyping              = false;
    postBattleDialogueActive = false;
    hideAllBubbles();
    var onDone   = pb_onAllDone;
    pb_onAllDone = null;
    pb_lines     = null;
    if (onDone) onDone();
  }

  /* ── Win card-reveal sequence ────────────────────────────────
     1. Fade in 80% black dim over the gameboard.
     2. Neanderthal card rises from off-screen bottom (GSAP).
     3. "New Card Acquired" banner fades/bounces in above card.
     4. Click anywhere to fade out card + banner + dim → onDismiss.

     Both #adv-post-battle-dim and #adv-card-reveal are moved into
     #sog-stage on first call so they inherit the stage scale.

     #battle-popup-backdrop is also moved here. It lives inside
     #screen-battle in the HTML, but #screen-battle has position:relative
     with no z-index — it forms no stacking context of its own, so the
     browser paints everything inside it before any explicitly z-indexed
     sibling of #sog-stage (like #adv-card-reveal at 5100). No z-index
     value on the popup can overcome that. Moving it to #sog-stage puts
     it in the same stacking context as #adv-card-reveal so z-index 5200
     (applied by .visible in CSS) correctly appears on top.              */
  var _revealElementsMoved = false;
  function _ensureRevealInStage() {
    if (_revealElementsMoved) return;
    _revealElementsMoved = true;
    var stage = document.getElementById('sog-stage');
    if (!stage) return;
    ['adv-post-battle-dim', 'adv-card-reveal', 'battle-popup-backdrop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode !== stage) stage.appendChild(el);
    });
  }

  /* ── Shared card-acquisition component ─────────────────────────
     showCardAcquisition(card, sfxFn, onComplete)
       card      — a CARDS[] entry (uses card.image, card.id, etc.)
       sfxFn     — function to call when the banner appears;
                   pass null to use the default playCardAcquire()
       onComplete— called after the player dismisses the reveal

     Interaction after the card lands:
       • Click the card image   → open the standard card-info popup
       • Click outside the card/banner → dismiss (fade out + callback)
       • Closing the popup      → returns to the reveal; card still showing
       Re-entrant safe: only one reveal is active at a time because
       each caller waits for onComplete before triggering the next.    */
  function showCardAcquisition(card, sfxFn, onComplete, opts) {
    opts = opts || {};
    _ensureRevealInStage();

    var dimEl    = document.getElementById('adv-post-battle-dim');
    var revealEl = document.getElementById('adv-card-reveal');
    var wrapEl   = document.getElementById('adv-card-reveal-card-wrap');
    var imgEl    = document.getElementById('adv-card-reveal-img');
    var ipEl     = document.getElementById('adv-card-reveal-ip');
    var ccEl     = document.getElementById('adv-card-reveal-cc');
    var bannerEl = document.getElementById('adv-card-reveal-banner');

    // wrapEl is preferred GSAP target (img + IP overlay move together);
    // fall back to imgEl if wrapper isn't in DOM yet (old HTML).
    var animTarget = wrapEl || imgEl;

    if (!revealEl || !animTarget) { if (onComplete) onComplete(); return; }

    // Point the image at this card and stamp the IP number
    imgEl.src = card.image || '';
    if (ipEl) ipEl.textContent = card.ip != null ? String(card.ip) : '';

    // Capital cost (top-left). Shown for capital-era cards, but HIDDEN for the
    // pre-capital companion / boss cards that have no Capital cost in play:
    // Lucy (33), Neanderthal (34), Ötzi (35), Gilgamesh (43). Every other card —
    // Sargon, marketplace purchases, and all future cards — shows its CC.
    if (ccEl) {
      var NO_CC_REVEAL_IDS = [33, 34, 35, 43];
      if (card.cc != null && NO_CC_REVEAL_IDS.indexOf(card.id) === -1) {
        ccEl.textContent   = String(card.cc);
        ccEl.style.display = '';
      } else {
        ccEl.textContent   = '';
        ccEl.style.display = 'none';
      }
    }

    // Show and fade-in the dim overlay
    if (dimEl) {
      dimEl.style.display = 'block';
      gsap.fromTo(dimEl, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' });
    }

    // Prepare card: start off below stage, transparent
    revealEl.style.display = 'flex';
    gsap.set(animTarget, { y: 380, opacity: 0 });
    if (bannerEl) {
      bannerEl.style.transition = '';
      bannerEl.style.opacity    = '0';
      bannerEl.style.transform  = 'scale(0.88)';
    }

    // Card rises into centre — but GATE the rise on the NEW card's image being
    // decoded. #adv-card-reveal-img is reused across acquisitions, so until the new
    // src finishes loading the element still shows the PREVIOUS card's image (e.g.
    // Lucy before Neanderthal). Online that load takes a moment, so an un-gated
    // fade-in flashes the prior card. The card stays at opacity 0 (invisible) over
    // the dim backdrop until its art is ready, then rises — correct from frame one.
    var _risen = false;
    function _startRise() {
      if (_risen) return;
      _risen = true;
      gsap.to(animTarget, {
        y:        0,
        opacity:  1,
        duration: 1.5,
        ease:     'power2.out',
        onComplete: function () {
          // Banner bounces in
          if (bannerEl) {
            bannerEl.style.transition = 'opacity 0.15s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            bannerEl.style.opacity    = '1';
            bannerEl.style.transform  = 'scale(1.0)';
          }

          // SFX on banner entrance
          if (typeof sfxFn === 'function') sfxFn();
          else playCardAcquire();

          // Wire up interactions after a short guard (so the click that
          // advanced the last dialogue line doesn't instantly fire).
          setTimeout(function () {
            _wireCardAcquisitionInteractions(card, dimEl, revealEl, animTarget, bannerEl, onComplete, opts);
          }, 80);
        }
      });
    }

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      _startRise();                 // art already cached (e.g. preloaded) → rise now
    } else {
      imgEl.onload  = _startRise;
      imgEl.onerror = _startRise;   // missing/failed art must not hang the reward
      setTimeout(_startRise, 2000); // safety cap so we never wait forever
    }
  }

  /* Attaches the click-to-popup / click-outside-to-dismiss handlers
     for a live card-acquisition reveal.  Called once per reveal.     */
  /* wrapEl is the GSAP / click-detection target (#adv-card-reveal-card-wrap).
     It contains both the img and the IP overlay, so they move together.    */
  function _wireCardAcquisitionInteractions(card, dimEl, revealEl, wrapEl, bannerEl, onComplete, opts) {
    opts = opts || {};
    var _dismissed = false;
    var _autoTimer = null;

    // Optional auto-dismiss: used by the D2c Farmer grant sequence so cards
    // advance on their own (~1.5s). The player can still click early to
    // dismiss — dismiss() clears the timer so it never double-fires.
    if (typeof opts.autoDismissMs === 'number' && opts.autoDismissMs >= 0) {
      _autoTimer = setTimeout(function () { dismiss(); }, opts.autoDismissMs);
    }

    function dismiss() {
      if (_dismissed) return;
      _dismissed = true;
      if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = null; }
      revealEl.removeEventListener('click', onRevealAreaClick);

      if (bannerEl) bannerEl.style.transition = '';
      gsap.to(wrapEl, { opacity: 0, duration: 0.3 });
      if (bannerEl) gsap.to(bannerEl, { opacity: 0, duration: 0.3 });

      var dimTarget = dimEl || revealEl;
      gsap.to(dimTarget, {
        opacity:  0,
        duration: 0.3,
        onComplete: function () {
          revealEl.style.display = 'none';
          if (dimEl) { dimEl.style.display = 'none'; dimEl.style.opacity = ''; }
          gsap.set(wrapEl, { clearProps: 'all' });
          if (bannerEl) { bannerEl.style.opacity = ''; bannerEl.style.transform = ''; }
          if (onComplete) onComplete();
        }
      });
    }

    function onRevealAreaClick(e) {
      // If the card-info popup is open, let it handle the click — do nothing.
      var popupEl = document.getElementById('battle-popup-backdrop');
      if (popupEl && popupEl.classList.contains('visible')) return;

      // Click anywhere on the card wrapper (img or IP overlay) → open popup
      if (wrapEl.contains(e.target)) {
        var minimalSd = {
          cardId: card.id,  ip: card.ip,
          ipMod: 0, contMod: 0,
          revealed: true,
          bonuses: [], ipModSources: [], contModSources: []
        };
        if (SOG.ui && typeof SOG.ui.openBattlePopup === 'function') {
          SOG.ui.openBattlePopup(card, minimalSd, 'player', false);
        }
        return;
      }

      // Click on the banner → no action (let them keep reading)
      if (bannerEl && (e.target === bannerEl || bannerEl.contains(e.target))) return;

      // Click anywhere else (outside card + banner) → dismiss
      dismiss();
    }

    revealEl.addEventListener('click', onRevealAreaClick);
  }

  /* ── Lucy avatar pop-in (large bottom-left battle portrait) ── */
  function popLucyIn() {
    var avEl = document.querySelector('.battle-avatar-ally');
    if (avEl) avEl.classList.add('adv-active');
    // CSS handles the scale + opacity transition (.adv-active in style.css)
  }

  /* ── IP gold-ring highlight on leftmost hand card ─────────────
     The card has overflow:hidden, so outline/box-shadow on a child
     element gets clipped.  Instead we inject a <div.adv-ip-ring>
     directly onto #sog-stage, positioned over the IP number via
     getBoundingClientRect() → stage-local coords (accounting for
     the stage scale transform).                                   */
  function startIPPulse() {
    var cards = document.querySelectorAll('#battle-player-hand .battle-hand-card');
    if (!cards.length) return;
    var firstCard = cards[0];
    var ipEl = firstCard.querySelector('.db-overlay-ip');
    if (!ipEl) return;

    stopIPPulse();   // remove any stale ring first

    var stage = document.getElementById('sog-stage');
    if (!stage) return;

    var ipRect    = ipEl.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();
    var scale     = stageRect.width / 1280;   // stage is always 1280px logical width

    // Centre of the IP element in stage-local (unscaled) coordinates
    var cx = (ipRect.left + ipRect.width  / 2 - stageRect.left) / scale;
    var cy = (ipRect.top  + ipRect.height / 2 - stageRect.top)  / scale;

    // Ring diameter: ~2.4× the IP element's larger dimension
    var ipW  = ipRect.width  / scale;
    var ipH  = ipRect.height / scale;
    var r    = Math.max(ipW, ipH) * 1.2;
    var size = r * 2;

    var ring = document.createElement('div');
    ring.className = 'adv-ip-ring';
    ring.style.left   = (cx - r) + 'px';
    ring.style.top    = (cy - r) + 'px';
    ring.style.width  = size + 'px';
    ring.style.height = size + 'px';
    stage.appendChild(ring);
  }
  function stopIPPulse() {
    var rings = document.querySelectorAll('.adv-ip-ring');
    for (var i = 0; i < rings.length; i++) {
      rings[i].parentNode.removeChild(rings[i]);
    }
  }

  /* ── Camera shake ───────────────────────────────────────────── */
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
    // Quick rumble: 5 offset frames over ~300ms total.
    tl.to(el, { x: -10, y:  4, duration: 0.05, ease: 'none' })
      .to(el, { x:  10, y: -4, duration: 0.06, ease: 'none' })
      .to(el, { x:  -7, y:  3, duration: 0.05, ease: 'none' })
      .to(el, { x:   5, y: -2, duration: 0.05, ease: 'none' })
      .to(el, { x:   0, y:  0, duration: 0.05, ease: 'none' });
  }

  /* ── UI slide-in ────────────────────────────────────────────── */
  // After pre-coaching dialogue ends and the camera shakes, the
  // gameplay UI elements (hand, opp hand, deck pile, HUD buttons,
  // Turn counter) animate in from their respective edges.
  // Each hand card flies individually from Lucy avatar's position
  // toward its dock spot. Other elements slide from edges.
  function slideInUI(onDone) {
    // Remove the pre-coaching class FIRST so the CSS visibility:hidden
    // clears and the elements have real bounding rects to animate from.
    document.body.classList.remove('prehistory-pre-coaching');

    if (typeof gsap === 'undefined') {
      if (onDone) onDone();
      return;
    }

    var lucyAvEl   = document.querySelector('.battle-avatar-ally');
    var hudTopLeft = document.querySelector('.battle-hud-topleft');
    var oppHand    = document.getElementById('battle-opp-hand');
    var hudBR      = document.querySelector('.battle-hud-bottomright');
    var handCards  = document.querySelectorAll('#battle-player-hand .battle-hand-card');
    var deckPile   = document.querySelector('#battle-player-hand .battle-deck-pile');

    // Hand cards fly from Lucy's portrait position. Compute per-card
    // delta so each card starts ON Lucy and ends in its dock spot.
    if (lucyAvEl && handCards.length) {
      var lucyRect = lucyAvEl.getBoundingClientRect();
      var lucyCx   = lucyRect.left + lucyRect.width  / 2;
      var lucyCy   = lucyRect.top  + lucyRect.height / 2;
      for (var i = 0; i < handCards.length; i++) {
        (function (card, idx) {
          var rect = card.getBoundingClientRect();
          var dx = lucyCx - (rect.left + rect.width  / 2);
          var dy = lucyCy - (rect.top  + rect.height / 2);
          gsap.fromTo(card,
            { x: dx, y: dy, opacity: 0, scale: 0.35, rotate: -15 },
            { x: 0,  y: 0,  opacity: 1, scale: 1,    rotate: 0,
              duration: 0.55, ease: 'power2.out', delay: idx * 0.09 }
          );
        })(handCards[i], i);
      }
    }

    // Deck pile slides in from the right (it sits at the end of the
    // hand row). Slightly delayed so it lands after the cards.
    if (deckPile) {
      gsap.fromTo(deckPile,
        { x: 120, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.45, ease: 'power2.out', delay: 0.4 }
      );
    }

    // Opp hand slides down from above the viewport.
    if (oppHand) {
      gsap.fromTo(oppHand,
        { y: -120, opacity: 0 },
        { y: 0,    opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }

    // Turn counter HUD slides in from the left.
    if (hudTopLeft) {
      gsap.fromTo(hudTopLeft,
        { x: -160, opacity: 0 },
        { x: 0,    opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }

    // Reset + End Turn buttons slide in from the right.
    if (hudBR) {
      gsap.fromTo(hudBR,
        { x: 160, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.5, ease: 'power2.out', delay: 0.1 }
      );
    }

    // Total animation duration approx: 0.55 (cards) + 0.27 (last card
    // stagger) = ~0.82s; deck pile lands ~0.85s. Schedule the
    // onDone callback slightly after everything settles.
    setTimeout(function () { if (onDone) onDone(); }, 950);
  }

  /* ── Main coaching entry point ─────────────────────────────── */
  function playCoaching(onAllDone) {
    log('Phase E — coaching starting (phase 1: intro exchange)');
    runCoachingLines(COACHING_PHASE_1, function () {
      log('Phase E — phase 1 complete, shake + UI slide-in');
      // Woosh leads the card shake-in: play it now, then start the shake 500ms
      // later so the whoosh anticipates the cards arriving.
      SOG.sfx.play('sfx/woosh.m4a');
      setTimeout(function () {
        shakeCamera(function () {
          slideInUI(function () {
            log('Phase E — UI in place, starting phase 2 (Lucy coaching)');
            runCoachingLines(COACHING_PHASE_2, function () {
              log('Phase E — coaching complete; starting Phase F turn loop');
              stopIPPulse();
              if (onAllDone) onAllDone();
            });
          });
        });
      }, 500);
    });
  }

  // One-shot Lucy bubble (no click-to-advance, no other lines).
  // Stays visible until explicitly hidden (e.g. on End Turn click).
  function showLucyOneLiner(text) {
    var el = getBubbleEl('lucy');
    if (!el) return;
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) return;
    textEl.textContent = '';
    el.classList.add('is-visible');
    var i = 0;
    var timer = setInterval(function () {
      i++;
      textEl.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(timer); }
    }, TYPE_SPEED_MS);
  }

  function hideLucyOneLiner() {
    var el = getBubbleEl('lucy');
    if (el) el.classList.remove('is-visible');
  }

  /* ── Build a single result-loc-row element (Arcadium pattern) ── */
  function buildAdvResultRow(locName, pIP, aIP, winner) {
    var row = document.createElement('div'); row.className = 'result-loc-row';
    var nm  = document.createElement('div'); nm.className  = 'result-loc-name'; nm.textContent = locName;
    var sc  = document.createElement('div'); sc.className  = 'result-loc-scores';
    var yu  = document.createElement('span');
    yu.className   = 'result-loc-you' + (winner === 'player' ? ' result-loc-winner' : '');
    yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className   = 'result-loc-opp' + (winner === 'ai' ? ' result-loc-winner' : '');
    op.textContent = 'Opp: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'OPP' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  /* ── Shared helpers for result-screen buttons ──────────────── */

  // Shared replay handler — used by both Play Again buttons and the
  // defeat Try Again button. Tears down the finished battle and starts
  // a fresh one from turn 1, skipping the walk / dialogue / wipe.
  function replayBattle(overlayEl) {
    overlayEl.style.display = 'none';
    teardownBattle();
    // Re-enter through the engine (replay → script takes the skip-intro path:
    // no dialogue/wipe/coaching; popLucyIn via onBattleStart).
    log('Phase F — replay: re-entering battle via initGame(BATTLE_CONFIG)');
    if (typeof window.initGame === 'function') window.initGame(BATTLE_CONFIG);
  }

  // "Game Board" button — hides the result overlay so the player can
  // inspect the final board state. Shows the adv-specific "← Results"
  // button (mirrors Arcadium's btn-back-results pattern but scoped to
  // the adventure module so it doesn't fire the Arcadium handler).
  function showBoardFromResult(overlayEl) {
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

  /* ── Victory / defeat screens ─────────────────────────────── */
  function showVictoryScreen(pIP, aIP) {
    var el = document.getElementById('adv-result-victory');
    if (!el) return;

    // Populate score row
    var subEl  = document.getElementById('adv-result-victory-subline');
    var locsEl = document.getElementById('adv-result-victory-locs');
    if (subEl)  subEl.textContent = 'You conquered The Camp';
    if (locsEl) { locsEl.innerHTML = ''; locsEl.appendChild(buildAdvResultRow('The Camp', pIP, aIP, 'player')); }

    el.style.display = 'flex';

    // SFX already played by the script's outcome hook before the dialogue.

    // Game Board — inspect the final board, then ← Results to return
    var boardBtn = document.getElementById('adv-result-victory-board');
    if (boardBtn) boardBtn.onclick = function () { showBoardFromResult(el); };

    // Continue — mark win + return to overworld
    // TODO: Lucy overworld pop-up triggers here
    var contBtn = document.getElementById('adv-result-victory-continue');
    if (contBtn) {
      contBtn.onclick = function () {
        el.style.display = 'none';
        markPrehistoryNodeCompleteFlag = true;
        exitBattleToOverworld();
      };
    }
  }

  // Flag read on the next overworld load to add the .overworld-node-complete
  // class to the Prehistory node. Set in showVictoryScreen's Continue handler.
  var markPrehistoryNodeCompleteFlag = false;

  function showDefeatScreen(pIP, aIP) {
    var el = document.getElementById('adv-result-defeat');
    if (!el) return;

    // Populate score row
    var subEl  = document.getElementById('adv-result-defeat-subline');
    var locsEl = document.getElementById('adv-result-defeat-locs');
    if (subEl)  subEl.textContent = 'Neanderthal won The Camp';
    if (locsEl) { locsEl.innerHTML = ''; locsEl.appendChild(buildAdvResultRow('The Camp', pIP, aIP, 'ai')); }

    el.style.display = 'flex';

    // SFX already played by the script's outcome hook before the dialogue.

    // Game Board — inspect the final board, then ← Results to return
    var boardBtn = document.getElementById('adv-result-defeat-board');
    if (boardBtn) boardBtn.onclick = function () { showBoardFromResult(el); };

    // Play Again — start a fresh battle from turn 1
    var againBtn = document.getElementById('adv-result-defeat-again');
    if (againBtn) againBtn.onclick = function () { replayBattle(el); };

    // Back to Map — return to overworld without marking the node complete.
    // The Prehistory node stays active so the player can re-enter and retry.
    var mapBtn = document.getElementById('adv-result-defeat-backtomap');
    if (mapBtn) {
      mapBtn.onclick = function () {
        el.style.display = 'none';
        // markPrehistoryNodeCompleteFlag stays false — no progress recorded.
        exitBattleToOverworld();
      };
    }
  }

  function showTieScreen(pIP, aIP) {
    var el = document.getElementById('adv-result-tie');
    if (!el) return;

    // Populate score row — 'tie' badge on both sides
    var subEl  = document.getElementById('adv-result-tie-subline');
    var locsEl = document.getElementById('adv-result-tie-locs');
    if (subEl)  subEl.textContent = 'The Camp ended in a draw';
    if (locsEl) { locsEl.innerHTML = ''; locsEl.appendChild(buildAdvResultRow('The Camp', pIP, aIP, 'tie')); }

    el.style.display = 'flex';

    // SFX already played by the script's outcome hook before the dialogue.

    // Game Board — inspect the final board, then ← Results to return
    var boardBtn = document.getElementById('adv-result-tie-board');
    if (boardBtn) boardBtn.onclick = function () { showBoardFromResult(el); };

    // Play Again — start a fresh battle from turn 1
    var againBtn = document.getElementById('adv-result-tie-again');
    if (againBtn) againBtn.onclick = function () { replayBattle(el); };

    // Back to Map — no progress; node stays active for another attempt
    var mapBtn = document.getElementById('adv-result-tie-backtomap');
    if (mapBtn) {
      mapBtn.onclick = function () {
        el.style.display = 'none';
        exitBattleToOverworld();
      };
    }
  }

  /* ── Teardown / exit to overworld ───────────────────────────── */
  function teardownBattle() {
    // Clear context classes
    document.body.classList.remove('prehistory-battle');
    document.body.classList.remove('prehistory-pre-coaching');
    // Reset End Turn button
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) {
      endTurnBtn.disabled = true;
      endTurnBtn.classList.remove('adv-pulse');
    }
    // Restore both battle-screen avatar slots to the HTML baseline
    // (also clears the ally's .adv-active pop state).
    if (SOG.HUD && SOG.HUD.restoreBattleAvatars) SOG.HUD.restoreBattleAvatars();
    // Hide any open bubbles
    hideAllBubbles();
    // Hide the adventure "← Results" back button (only shown during board review)
    var advBack = document.getElementById('adv-btn-back-results');
    if (advBack) { advBack.style.display = 'none'; advBack.onclick = null; }
  }

  function exitBattleToOverworld() {
    teardownBattle();
    if (typeof window.showScreen === 'function') {
      window.showScreen('screen-overworld');
    }
    if (markPrehistoryNodeCompleteFlag) {
      markPrehistoryNodeCompleteFlag = false;
      // 500 ms settling beat (spec §1): let the overworld screen finish
      // rendering before we apply the badge and start the dialogue.
      setTimeout(function () {
        var nodeEl = document.querySelector('#overworld-overlay [data-id="prehistory"]');
        if (nodeEl) nodeEl.classList.add('overworld-node-complete');
        // Trigger the post-victory overworld dialogue + Lucy card reveal.
        // Gated inside startPostVictorySequence() by localStorage flag so
        // it only runs once per player.
        if (window.Overworld && typeof window.Overworld.startPostVictorySequence === 'function') {
          window.Overworld.startPostVictorySequence();
        }
      }, 500);
    }
  }

  /* ── Exit back to overworld (devtools / temporary escape) ──── */
  function exitToOverworld() {
    log('Exiting Prehistory battle — returning to overworld');
    document.body.classList.remove('prehistory-battle');
    document.body.classList.remove('prehistory-pre-coaching');
    if (SOG.HUD && SOG.HUD.restoreBattleAvatars) SOG.HUD.restoreBattleAvatars();
    hideAllBubbles();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
    }
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
  }

  /* ── localStorage helpers ──────────────────────────────────── */
  function isBattleComplete() {
    try { return localStorage.getItem(KEY_BATTLE_COMPLETE) === 'true'; }
    catch (e) { return false; }
  }

  function markBattleComplete() {
    try { localStorage.setItem(KEY_BATTLE_COMPLETE, 'true'); } catch (e) {}
    log('sog_battle_neanderthal_complete set to true');
  }

  /* ════════════════════════════════════════════════════════════
     PHASE B STUB: full battle entry point
     ════════════════════════════════════════════════════════════
     Phases C-F will fill in the branches. For now this is a
     dispatcher that logs which path it would take and exits.

     Branch matrix:

       battleComplete   introSeenThisSession   → behavior
       ─────────────────────────────────────────────────────────
       false            false                   → full intro (C→D→E→F)
       false            true                    → skip intro, board (F)
                                                  (defeat replay this session)
       true             *                       → skip intro, board (F)
                                                  (cross-session replay)
  ═══════════════════════════════════════════════════════════════ */
  function startNeanderthalBattle() {
    // The Neanderthal battle runs through game.js's engine, configured by
    // BATTLE_CONFIG (scriptHook 'prehistory'). The 'prehistory' script supplies
    // ALL narrative via the lifecycle hooks: onIntro (pre-battle dialogue +
    // radial wipe + screen switch under cover, or skip on replay), onBattleStart
    // (avatars, turn presentation, coaching/slide-in or popLucyIn on replay),
    // onTurnStart, onPlayerPlayed, and onWin/onLoss/onTie. The intro-vs-replay
    // gating lives in the script (_scriptSkipIntro).
    log('startNeanderthalBattle() → initGame(BATTLE_CONFIG)');
    if (typeof window.initGame === 'function') window.initGame(BATTLE_CONFIG);
  }

  /* ── Devtools helpers ──────────────────────────────────────── */
  function resetBattleComplete() {
    try { localStorage.removeItem(KEY_BATTLE_COMPLETE); } catch (e) {}
    neanderthalIntroSeenThisSession = false;
    log('Battle flag + session flag cleared — full intro will play on next click');
  }

  /* ── Public surface ────────────────────────────────────────── */
  /**
   * Returns true while the in-game coaching runner OR post-battle
   * dialogue is active. Used by game/input.js to block card placement.
   */
  function isCoachingActive() {
    return co_lines !== null || postBattleDialogueActive;
  }

  /* ════════════════════════════════════════════════════════════
     SCRIPT-HOOK MODULE (battle-config migration, Stage 1)
     ────────────────────────────────────────────────────────────
     The narrative half of this battle, expressed through the engine's
     script-hook seam (SOG.BattleHooks), registered as 'prehistory'. It
     maps the bespoke flow's narrative inventory onto the lifecycle hooks,
     REUSING the existing dialogue constants, coaching content, cinematic
     helpers, and result screens — it CALLS them, it does not re-implement.

     Intro-only-vs-replay gating is owned here: the intro (pre-battle
     dialogue + wipe) and the two coaching phases fire only first-time
     (battleComplete || introSeenThisSession); the outcome dialogue and the
     card-acquisition reveal fire EVERY play.

     ── INERT THIS SESSION ──
     The registry holds this script, but the entry point
     (startNeanderthalBattle) still runs the bespoke loop and
     BATTLE_CONFIG.scriptHook is null — so nothing resolves to this script
     yet and no hook fires (proven: Prehistory + Arcadium play identically).
     The deferred cutover flips scriptHook to 'prehistory' and routes the
     entry through game.js's initGame lifecycle, at which point these hooks
     drive the battle. Board-presentation timing (body classes / hidden-
     until-coaching state, currently in setupBattleBoard) is reconciled at
     that cutover; the hooks below mirror the bespoke sequence so the move
     is mechanical.
  ════════════════════════════════════════════════════════════ */
  function _scriptSkipIntro() {
    return isBattleComplete() || neanderthalIntroSeenThisSession;
  }

  // The skip-intro decision must be made ONCE per battle entry, in onIntro,
  // BEFORE neanderthalIntroSeenThisSession is set — otherwise onBattleStart's
  // re-evaluation would read the just-set flag and wrongly skip the coaching
  // (and fadeOutCover), leaving the wipe cover up. onBattleStart reads this.
  var _battleSkippedIntro = false;

  // End-Turn gating: the engine starts the button ENABLED each turn; this battle
  // disables it until the player commits a card (1-card-per-turn cadence).
  function _disableEndTurn() {
    var btn = document.getElementById('battle-end-turn');
    if (btn) { btn.disabled = true; btn.classList.remove('adv-pulse'); }
  }
  function _enableEndTurn() {
    var btn = document.getElementById('battle-end-turn');
    if (btn) btn.disabled = false;
  }
  // Per-turn presentation the engine doesn't do for this battle: the visible
  // "Turn X / 4" counter, force player-first reveal order, suppress the engine's
  // reveal-first avatar glow (the bespoke battle had none), and disable End Turn.
  function _applyTurnPresentation(turn) {
    setTurnCounter(turn, BATTLE_CONFIG.structure.turns);
    SOG.state.G.playerFirst = true;
    if (SOG.abilities && typeof SOG.abilities.hideRevealFirstHighlight === 'function') {
      SOG.abilities.hideRevealFirstHighlight();
    }
    _disableEndTurn();
  }

  var PREHISTORY_SCRIPT = {
    // onIntro — fires BEFORE the engine builds the board. Apply the pre-board
    // body classes; then first play only: pre-battle dialogue (over the
    // overworld) → radial wipe → switch to the battle screen UNDER the wipe
    // cover, so the engine's board build happens covered (radialWipe leaves the
    // cover up; onBattleStart fades it). Replay: just switch to the battle screen.
    onIntro: function (ctx, done) {
      // Capture the skip decision ONCE, before mutating the flag below, so
      // onBattleStart can reuse it (decide-once semantics, like the bespoke flow).
      _battleSkippedIntro = _scriptSkipIntro();
      _applyPresentationClasses(BATTLE_CONFIG.presentation);
      if (_battleSkippedIntro) {
        if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
        done();
        return;
      }
      // Set BEFORE the intro plays so a same-session defeat-replay skips it.
      neanderthalIntroSeenThisSession = true;
      playPreBattleDialogue(function () {
        radialWipe(function () {
          if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
          done();   // → engine builds the board under the wipe cover
        });
      });
    },

    // onBattleStart — board built (gameplay UI hidden by the pre-coaching class).
    // Dress it: avatars + turn-1 presentation (counter, player-first, End-Turn
    // disabled). First play: fade the cover out → coaching P1 → shake → slide-in
    // → P2 (chained in playCoaching; Lucy pops in via the coaching script).
    // Replay: clear the pre-coaching hidden state and pop Lucy in directly.
    onBattleStart: function (ctx, done) {
      if (SOG.HUD && SOG.HUD.applyBattleAvatars) SOG.HUD.applyBattleAvatars(BATTLE_CONFIG.presentation);
      _applyTurnPresentation(1);
      if (_battleSkippedIntro) {   // captured in onIntro before the flag was set
        document.body.classList.remove('prehistory-pre-coaching');
        popLucyIn();
        done();
        return;
      }
      hideAllBubbles();
      fadeOutCover(function () {
        playCoaching(function () { done(); });
      });
    },

    // onTurnStart (turns 2-4): re-apply the per-turn presentation.
    onTurnStart: function (ctx, turn) {
      _applyTurnPresentation(turn);
    },

    // onBeforeReveal: the player has ended the turn — clear the turn-1 "click
    // End Turn" prompt + button pulse (the bespoke onPrehistoryEndTurn did this).
    onBeforeReveal: function (ctx, turn) {
      hideLucyOneLiner();
      _disableEndTurn();
    },

    // onPlayerPlayed: enable End Turn now that a card is committed; turn 1 also
    // shows Lucy's "click End Turn" prompt + button pulse.
    onPlayerPlayed: function (ctx, p) {
      _enableEndTurn();
      if (p && p.turn === 1) {
        var endTurnBtn = document.getElementById('battle-end-turn');
        if (endTurnBtn) endTurnBtn.classList.add('adv-pulse');
        showLucyOneLiner("When you've made your decision, click the End Turn button.");
      }
    },

    // Win: fanfare → win dialogue → card-acquisition reveal (grant Neanderthal
    // 34 + completion flag) → victory screen. The script OWNS the end screen,
    // so it does NOT call proceed() (the engine's default scoreboard).
    onWin: function (ctx, result, proceed) {
      markBattleComplete();
      if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
      setTimeout(function () {
        runPostBattleDialogue(WIN_DIALOGUE, function () {
          if (window.SOG && SOG.collection && typeof SOG.collection.unlockCard === 'function') {
            SOG.collection.unlockCard(34);
          }
          var neanderthalCard = (typeof CARDS !== 'undefined') &&
                                CARDS.find(function (c) { return c.id === 34; });
          showCardAcquisition(
            neanderthalCard || { id: 34, name: 'Neanderthal', image: 'images/cards/prehistorycards/neanderthalcard.jpg', ip: 4, ability: null, abilityName: null },
            playCardAcquire,
            function () { showVictoryScreen(result.playerTotal, result.aiTotal); }
          );
        });
      }, 600);
    },

    // Loss: loss dialogue → defeat screen.
    onLoss: function (ctx, result, proceed) {
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
      setTimeout(function () {
        runPostBattleDialogue(LOSS_DIALOGUE, function () {
          showDefeatScreen(result.playerTotal, result.aiTotal);
        });
      }, 600);
    },

    // Tie: tie dialogue → tie screen (tie-as-loss progression — no card, node
    // stays active). Reached when single-location scoring + tie:'loss' yields
    // an exact-tie outcome.
    onTie: function (ctx, result, proceed) {
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
      setTimeout(function () {
        runPostBattleDialogue(TIE_DIALOGUE, function () {
          showTieScreen(result.playerTotal, result.aiTotal);
        });
      }, 600);
    },

    // Input gate during coaching / post-battle dialogue — the role
    // isCoachingActive() plays today in input.js _dialogueActive.
    isInputBlocked: function (ctx) {
      return isCoachingActive();
    }
  };

  // Register the script (name 'prehistory'). Dormant until the deferred
  // cutover points BATTLE_CONFIG.scriptHook at it and routes the entry
  // through game.js's lifecycle.
  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('prehistory', PREHISTORY_SCRIPT);
  }

  return {
    startNeanderthalBattle: startNeanderthalBattle,
    isBattleComplete:       isBattleComplete,
    markBattleComplete:     markBattleComplete,
    resetBattleComplete:    resetBattleComplete,
    // Shared card-acquisition component — called by overworld.js for the
    // Lucy reveal (and any future card unlocks that use the same flow).
    showCardAcquisition:    showCardAcquisition,
    // Devtools escape
    exitToOverworld:        exitToOverworld,
    // Input guard: true while coaching or post-battle dialogue is running.
    isCoachingActive:       isCoachingActive
  };

})();

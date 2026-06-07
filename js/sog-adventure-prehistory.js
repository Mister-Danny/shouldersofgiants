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
    if (wooshHowl) { try { wooshHowl.stop(); wooshHowl.play(); } catch (e) {} }
  }

  function ensureCardAcquire() {
    if (cardAcquireHowl || typeof Howl === 'undefined') return;
    cardAcquireHowl = new Howl({ src: ['sfx/cardacquire.mp3'], volume: 0.9, html5: true });
  }
  function playCardAcquire() {
    ensureCardAcquire();
    if (cardAcquireHowl) { try { cardAcquireHowl.stop(); cardAcquireHowl.play(); } catch (e) {} }
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
      lgain.gain.linearRampToValueAtTime(0.10, now + 0.005);
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
    gain.gain.linearRampToValueAtTime(p.peak,  now + 0.005);
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
        { who: 'explorer',    text: 'Uh oh…' }
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
       Game start: AI hand=[26,27,31,34] (4 scripted cards), AI deck=[29,30,32,36,28] (5 cosmetic).
       T1 plays Tool (26): hand 4→3; Tool's draw fires → hand 3→4, deck 5→4.
       T2 start draw → hand 5; plays Hunter (27) → hand 4, deck 3.
       T3 start draw → hand 5; plays Megalith (31) → hand 4, deck 2.
       T4 start draw → hand 5; plays Neanderthal (34) → hand 4, deck 1.
  ═══════════════════════════════════════════════════════════════ */

  // Pseudo-location for The Camp. ID 100 sidesteps the standard locs
  // (1-6) so the CSS rule .battle-col[data-loc-id="100"] targets only
  // this tile and we don't accidentally style any real game location.
  function buildCampLocation() {
    return {
      id:          100,
      name:        'The Camp',
      region:      '',
      abilityText: '',  // spec: "No ability text"
      abilityKey:  null
    };
  }

  function buildPrehistoryDeck() {
    // IDs per cards.js:206-279 — no duplicates, no Lucy (id 33).
    return [26, 27, 28, 29, 30, 31, 32, 36];
  }

  function buildNeanderthalAiDeck() {
    // Full scripted play sequence T1→T4: Tool(26), Hunter(27), Megalith(31), Neanderthal(34).
    // Tool fires its "draw 1" ability during the reveal phase (fireRevealAbilities →
    // abilityTool), pushing an extra cosmetic card from deck to hand. This makes the
    // AI's hand/deck pattern mirror a player who opens with Tool.
    // All 4 are loaded directly into G.aiHand at setup. G.aiDeck is seeded
    // separately with 5 cosmetic cards so the opp-hand display starts at
    // hand=4, deck=5 — mirroring the player's opening state.
    return [26, 27, 31, 34];
  }

  // Fisher-Yates shuffle (in-place). The standard SOG.board.shuffle
  // is the same algorithm but we avoid the cross-module dependency.
  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // Swap the Otzi avatar img src to the Neanderthal portrait photo.
  // Stash the original src so the exit path can restore it for the next
  // standard battle.
  function applyNeanderthalAvatar() {
    var img = document.querySelector('.battle-avatar-otzi .battle-avatar-frame img');
    if (!img) return;
    if (typeof img.dataset.origSrc === 'undefined') img.dataset.origSrc = img.src;
    img.src = 'images/portraits/neanderthalportait.jpeg';
    img.style.objectPosition = '';   // use default (center top) from CSS
  }
  function restoreOtziAvatar() {
    var img = document.querySelector('.battle-avatar-otzi .battle-avatar-frame img');
    if (!img) return;
    if (img.dataset.origSrc) img.src = img.dataset.origSrc;
    img.style.objectPosition = '';
  }

  function setTurnCounter(current, total) {
    var capEl = document.getElementById('battle-capital-info');
    if (capEl) capEl.textContent = 'Turn ' + current + ' / ' + total;
    // The turn-info element is hidden via CSS in prehistory mode but
    // clear it anyway so a stale value doesn't reappear if CSS misses.
    var turnEl = document.getElementById('battle-turn-info');
    if (turnEl) turnEl.textContent = '';
  }

  function setupBattleBoard() {
    log('Phase D — setting up Prehistory battle board');

    // Body context class — drives all CSS overrides. Pre-coaching
    // sub-class hides hand+deck+HUD until Phase E slides them in.
    document.body.classList.add('prehistory-battle');
    document.body.classList.add('prehistory-pre-coaching');

    // Build minimal G state directly (option β architecture — we do
    // not call initGame()). The reveal sequence, hand UI, and ability
    // engine all read from G, so populating it here is enough to make
    // the rendering helpers happy.
    var G = SOG.state.G;
    var camp = buildCampLocation();

    G.locations    = [camp];
    G.playerSlots  = {};
    G.aiSlots      = {};
    G.playerSlots[camp.id] = [null, null, null, null];
    G.aiSlots[camp.id]     = [null, null, null, null];

    G.playerDeck = shuffleInPlace(buildPrehistoryDeck().slice());
    G.playerHand = G.playerDeck.splice(0, 4);  // hand of 4 (spec)

    // Parallel-to-player model: AI starts with 4 scripted cards in hand
    // and 5 cosmetic padding cards in deck. aiPlayScripted() always takes
    // aiHand[0] so the scripted sequence runs T1→T4 in order. The deck
    // cards are cosmetic — they keep the opp-hand display at hand=4, deck=5
    // at game start, exactly matching the player's opening hand/deck counts.
    // T1 Tool fires its draw ability and pulls one cosmetic card from deck
    // into hand, making hand briefly 4 before the next-turn draw brings it to 5.
    G.aiHand = buildNeanderthalAiDeck().slice();   // [26, 27, 31, 34]
    G.aiDeck = [29, 30, 32, 36, 28];              // 5 cosmetic padding cards (faces never shown)

    G.turn               = 1;
    G.phase              = 'select';
    G.capital            = 0;          // spec: CC ignored entirely
    G.turnStartCapital   = 0;
    G.prehistoryMode     = true;       // flag for the input layer (Phase F)
    G.playerFirst        = true;
    G.bonusCapitalNextTurn   = 0;
    G.aiBonusCapitalNextTurn = 0;
    G.cardIPBonus         = {};
    G.aiCardIPBonus       = {};
    G.destroyedIPTotal    = 0;
    G.aiDestroyedIPTotal  = 0;
    G.movedThisTurn       = {};
    G.aiMovedThisTurn     = {};
    G.moveLog             = [];
    G.playerActionLog     = [];
    G.aiActionLog         = [];
    G.locationSnapshots   = {};
    G.reservedSlotsPerLoc = {};
    G.deferredPlays       = {};
    // Explicit resets for Play Again safety: these are NOT set by
    // teardownBattle() and can carry stale values from a previous game.
    // • prehistoryHasPlayed: still true after the player's last turn →
    //   isLegalPlayTarget returns false → no-drop cursor on retry.
    // • reveal queues: stale entries from the previous game don't
    //   affect correctness but are confusing to debug.
    G.prehistoryHasPlayed = false;
    G.playerRevealQueue   = [];
    G.aiRevealQueue       = [];

    // Show the battle screen + build the board DOM. initBattleUI
    // builds opp hand, board cols, and clears the player hand container.
    if (typeof window.showScreen   === 'function') window.showScreen('screen-battle');
    if (typeof window.initBattleUI === 'function') window.initBattleUI(G.locations);

    // Build the player hand DOM (visibility-hidden by CSS until Phase E).
    // rebuildPlayerHand also calls bindHandEvents so single-click → popup works.
    if (SOG.input && typeof SOG.input.rebuildPlayerHand === 'function') {
      SOG.input.rebuildPlayerHand();
    } else if (typeof window.setPlayerHand === 'function') {
      window.setPlayerHand(G.playerHand, G.playerDeck.length);
    }
    if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') {
      SOG.ui.updateOppHand();
    }

    setTurnCounter(1, 4);
    applyNeanderthalAvatar();

    // tutorial.js hides the reset button (display:none) for the guided
    // tutorial; initGame() restores it but we skip initGame() here.
    // Explicitly restore so the button is visible in adventure mode.
    var resetBtn = document.getElementById('battle-reset-turn');
    if (resetBtn) resetBtn.style.display = '';
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
    { who: 'lucy', text: 'Oh, and most cards have special abilities' },
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
    { who: 'lucy',        text: 'You really know your stuff.'  },
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
    var bannerEl = document.getElementById('adv-card-reveal-banner');

    // wrapEl is preferred GSAP target (img + IP overlay move together);
    // fall back to imgEl if wrapper isn't in DOM yet (old HTML).
    var animTarget = wrapEl || imgEl;

    if (!revealEl || !animTarget) { if (onComplete) onComplete(); return; }

    // Point the image at this card and stamp the IP number
    imgEl.src = card.image || '';
    if (ipEl) ipEl.textContent = card.ip != null ? String(card.ip) : '';

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

    // Card rises into centre
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
    var avEl = document.querySelector('.battle-avatar-lucy');
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

    var lucyAvEl   = document.querySelector('.battle-avatar-lucy');
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
    });
  }

  /* ════════════════════════════════════════════════════════════
     PHASE F — Turn loop, scripted AI, reveal, win/loss, replay
     ════════════════════════════════════════════════════════════
     Per-turn cadence (4 turns total):
       1. Turn starts with End Turn button DISABLED. Hand drawn to
          maintain 4 cards (cap exception: Tool's draw can push to 5).
       2. Player drags one card → input.js's commitPlay places it.
          input.js then calls our notifyPlayerPlayed().
       3. notifyPlayerPlayed() draws 1 to maintain hand-of-4, enables
          End Turn, and (turn 1 only) shows Lucy's "click End Turn"
          prompt + pulses the End Turn button.
       4. Player clicks End Turn → our endTurn hook fires (game.js's
          handler early-returns for G.prehistoryMode).
       5. AI plays its scripted card for this turn (face-down).
       6. Reveal: both slots flip face-up via the existing flipSlot
          animation; At Once abilities fire (Tool draws; others none);
          evaluateContinuous() applies the per-slot contMod modifiers
          (Fire/Cave Art/Dom Animal/Tribe); scores update.
       7. Brief pause, then advanceToNextTurn() (or end battle if
          this was turn 4).

     Scripted AI sequence (deterministic):
       T1 Hunter (27), T2 Gatherer (28), T3 Megalith (31),
       T4 Neanderthal (34).

     Win condition: after turn 4 reveal, player IP >= AI IP wins
     (tie = player wins).
  ═══════════════════════════════════════════════════════════════ */

  var TOTAL_TURNS         = 4;
  var POST_REVEAL_HOLD_MS = 1100;  // beat after IP updates before next turn
  var HAND_CAP            = 4;     // Tool's draw can exceed this (see commentary)

  // Module-level turn-loop state. Reset on each setupBattleBoard().
  var _hasPlayedThisTurn = false;
  var _endTurnHandler    = null;
  var _resetHandler      = null;
  var _onResultDismiss   = null;

  // Public function called by input.js's commitPlay when a card is
  // played AND G.prehistoryMode is true.
  function notifyPlayerPlayed(cardId, locId) {
    log('Phase F — player played card ' + cardId + ' at loc ' + locId);
    _hasPlayedThisTurn = true;
    // Mirror onto G so isLegalPlayTarget (in input.js) can block a
    // second play this turn — G is the shared object both modules read.
    SOG.state.G.prehistoryHasPlayed = true;

    // NO draw here. Draw timing spec:
    //   • Selection phase begins → draw 1 card (in advanceToNextTurn)
    //   • Tool (id 26) At Once fires during the reveal phase and draws
    //     its own card — can push hand to 5 on the following turn's draw.
    // Drawing immediately after the play was removed so the hand
    // visibly drops to 3 between placement and the next turn's refill.

    // Enable End Turn and Reset now that the player has committed.
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = false;
    if (resetBtn)   resetBtn.disabled   = false;

    // Turn 1 only — Lucy bubble + End Turn pulse.
    var G = SOG.state.G;
    if (G.turn === 1) {
      if (endTurnBtn) endTurnBtn.classList.add('adv-pulse');
      showLucyOneLiner("When you've made your decision, click the End Turn button.");
    }
  }

  // Draw cards from the player's deck until hand reaches HAND_CAP (4).
  // Tool's onAtOnce ability draws via its own logic and bypasses this
  // (it can push the hand to 5, and this function then no-ops until
  // the hand is consumed back down to 4 or less).
  function drawToHandCap() {
    var G = SOG.state.G;
    while (G.playerHand.length < HAND_CAP && G.playerDeck.length > 0) {
      G.playerHand.push(G.playerDeck.shift());
    }
    // rebuildPlayerHand re-binds click events so popup keeps working mid-battle.
    if (SOG.input && typeof SOG.input.rebuildPlayerHand === 'function') {
      SOG.input.rebuildPlayerHand();
    } else if (typeof window.setPlayerHand === 'function') {
      window.setPlayerHand(G.playerHand, G.playerDeck.length);
    }
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

  /* ── End Turn click handling (prehistory mode) ─────────────── */

  function installEndTurnHook() {
    if (_endTurnHandler) return;  // already installed
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (!endTurnBtn) return;
    _endTurnHandler = function (e) {
      var G = SOG.state.G;
      if (!G.prehistoryMode) return;
      if (endTurnBtn.disabled) return;
      if (!_hasPlayedThisTurn) return;
      e.stopPropagation();
      onPrehistoryEndTurn();
    };
    // Capture phase so we run BEFORE the standard handler in game.js
    // (which is registered without `useCapture`, i.e. bubbling). The
    // standard handler's early-return on G.prehistoryMode also defends.
    endTurnBtn.addEventListener('click', _endTurnHandler, true);
  }

  function removeEndTurnHook() {
    if (!_endTurnHandler) return;
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) endTurnBtn.removeEventListener('click', _endTurnHandler, true);
    _endTurnHandler = null;
  }

  /* ── Reset button hook ─────────────────────────────────────── */
  // Capture phase (same rationale as End Turn): runs before game.js's
  // bubbling handler, which does nothing in prehistoryMode anyway.
  function installResetHook() {
    if (_resetHandler) return;
    var resetBtn = document.getElementById('battle-reset-turn');
    if (!resetBtn) return;
    _resetHandler = function (e) {
      if (resetBtn.disabled) return;
      e.stopPropagation();
      onPrehistoryReset();
    };
    resetBtn.addEventListener('click', _resetHandler, true);
  }

  function removeResetHook() {
    if (!_resetHandler) return;
    var resetBtn = document.getElementById('battle-reset-turn');
    if (resetBtn) resetBtn.removeEventListener('click', _resetHandler, true);
    _resetHandler = null;
  }

  function onPrehistoryReset() {
    log('Phase F — Reset (turn ' + SOG.state.G.turn + ')');
    // Return the played card to the exact hand slot it came from.
    // undoPlay reads sd.handIndex (stored by commitPlay) and splices the
    // card back at that position — so the hand order is preserved.
    // We scan the camp slots for the first unrevealed entry (there can
    // only ever be one in the prehistory battle).
    var G   = SOG.state.G;
    var campId = G.locations && G.locations[0] ? G.locations[0].id : null;
    var restored = false;
    if (campId !== null && SOG.input && typeof SOG.input.undoPlay === 'function') {
      var slots = G.playerSlots[campId] || [];
      for (var i = 0; i < slots.length; i++) {
        if (slots[i] && !slots[i].revealed) {
          SOG.input.undoPlay(campId, i);
          restored = true;
          break;
        }
      }
    }
    if (!restored && SOG.input && typeof SOG.input.resetTurn === 'function') {
      // Fallback (should not occur in normal prehistory flow).
      SOG.input.resetTurn();
    }
    // Reset prehistory gate flags so the player can place again.
    _hasPlayedThisTurn = false;
    SOG.state.G.prehistoryHasPlayed = false;
    // Disable both action buttons — nothing is pending.
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) { endTurnBtn.disabled = true; endTurnBtn.classList.remove('adv-pulse'); }
    if (resetBtn)   resetBtn.disabled = true;
    hideLucyOneLiner();
  }

  function onPrehistoryEndTurn() {
    log('Phase F — End Turn (turn ' + SOG.state.G.turn + ')');
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) {
      endTurnBtn.disabled = true;
      endTurnBtn.classList.remove('adv-pulse');
    }
    // Lock Reset during the reveal + AI phase — nothing to undo now.
    if (resetBtn) resetBtn.disabled = true;
    hideLucyOneLiner();
    aiPlayScripted();
    // Brief pause so the player sees the Neanderthal's face-down card
    // appear before the reveal animation flips both cards.
    setTimeout(function () {
      runPrehistoryReveal(function () {
        var G = SOG.state.G;
        if (G.turn >= TOTAL_TURNS) {
          endBattle();
        } else {
          advanceToNextTurn();
        }
      });
    }, 600);
  }

  /* ── AI scripted play ──────────────────────────────────────── */
  // Hard-coded turn → card-id mapping. Matches the user spec
  // (T1 Hunter, T2 Gatherer, T3 Megalith, T4 Neanderthal). The AI's
  // hand was pre-loaded with all 4 cards in setupBattleBoard, so we
  // consume from index 0 each turn for a deterministic sequence.
  function aiPlayScripted() {
    var G = SOG.state.G;
    if (!G.aiHand.length) { log('AI hand empty — nothing to play'); return; }
    var cardId = G.aiHand[0];
    G.aiHand = G.aiHand.slice(1);

    var camp = G.locations[0];  // single-loc battle
    var slotIndex = G.aiSlots[camp.id].indexOf(null);
    if (slotIndex === -1) { log('AI slots full — cannot place'); return; }

    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) { log('AI card id ' + cardId + ' not found in CARDS'); return; }

    G.aiSlots[camp.id][slotIndex] = {
      cardId:        cardId,
      ip:            card.ip,
      revealed:      false,
      ipMod:         0,
      contMod:       0,
      ipModSources:  []
    };
    G.aiRevealQueue = G.aiRevealQueue || [];
    G.aiRevealQueue.push(cardId);
    G.aiActionLog.push({ type: 'play', cardId: cardId });

    var slotEl = SOG.board.getSlotEl('opp', camp.id, slotIndex);
    if (slotEl) {
      slotEl.dataset.cardId = cardId;
      SOG.board.setSlotFaceDown(slotEl);
    }

    // Update the opp hand display (visual face-down count).
    if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') {
      SOG.ui.updateOppHand();
    }

    log('AI played ' + card.name + ' (id ' + cardId + ') at slot ' + slotIndex);
  }

  /* ── Reveal: flip player slot, then opp slot, then resolve ──── */
  function runPrehistoryReveal(onDone) {
    var G = SOG.state.G;
    var camp = G.locations[0];

    // Find the just-played player slot (face-up unplayed) — should be
    // the highest-index non-null slot for this turn.
    var playerSlotIdx = lastPlayedIndex(G.playerSlots[camp.id]);
    var aiSlotIdx     = lastPlayedIndex(G.aiSlots[camp.id]);
    var playerSlotEl  = playerSlotIdx >= 0 ? SOG.board.getSlotEl('player', camp.id, playerSlotIdx) : null;
    var aiSlotEl      = aiSlotIdx     >= 0 ? SOG.board.getSlotEl('opp',    camp.id, aiSlotIdx)    : null;

    // flipSlot is exposed via window in game.js. Each call animates the
    // reveal + fires per-card SFX + sets sd.revealed = true.
    var flipSlot = window.flipSlot ||
                   (SOG.game && SOG.game.flipSlot);
    // (Phase F robustness: if flipSlot isn't accessible — different
    // export shape between sessions — fall back to a hard reveal.)
    if (typeof flipSlot !== 'function') flipSlot = hardReveal;

    flipSlot(playerSlotEl, function () {
      flipSlot(aiSlotEl, function () {
        resolveAfterReveal(onDone);
      });
    });
  }

  // Hard reveal fallback: just toggle classes + buildCardFace, no
  // animation. Used if window.flipSlot isn't found for any reason.
  function hardReveal(slotEl, cb) {
    if (!slotEl) { if (cb) cb(); return; }
    var cardId    = parseInt(slotEl.dataset.cardId,    10);
    var locId     = parseInt(slotEl.dataset.locId,     10);
    var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
    var owner     = slotEl.dataset.owner;
    var slots     = owner === 'player' ? SOG.state.G.playerSlots : SOG.state.G.aiSlots;
    if (slots[locId] && slots[locId][slotIndex]) slots[locId][slotIndex].revealed = true;
    slotEl.classList.remove('face-down', 'unplayed');
    slotEl.classList.add('face-up');
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (card && SOG.board && SOG.board.buildCardFace) {
      var sd = slots[locId][slotIndex];
      var ip = SOG.board.effectiveIP(sd);
      SOG.board.buildCardFace(slotEl, card, ip);
    }
    setTimeout(cb || function () {}, 60);
  }

  function lastPlayedIndex(slotArr) {
    if (!slotArr) return -1;
    for (var i = slotArr.length - 1; i >= 0; i--) {
      if (slotArr[i] && slotArr[i].revealed === false) return i;
    }
    return -1;
  }

  function resolveAfterReveal(onDone) {
    // 1) Fire At Once abilities for both newly-revealed cards (Tool's
    //    draw triggers here). Sequential — done callback chains.
    fireRevealAbilities(function () {
      // 2) Apply continuous IP modifiers (Fire/Cave Art/Dom Animal/Tribe).
      if (SOG.abilities && typeof SOG.abilities.evaluateContinuous === 'function') {
        SOG.abilities.evaluateContinuous();
      }
      // 3) Refresh per-slot IP displays + the loc-score totals.
      if (SOG.board && typeof SOG.board.refreshSlotIPDisplays === 'function') {
        SOG.board.refreshSlotIPDisplays();
      }
      if (SOG.board && typeof SOG.board.updateScores === 'function') {
        SOG.board.updateScores();
      }
      // 4) Brief pause so the player can read the result before the
      //    next turn starts (or the battle ends).
      setTimeout(onDone, POST_REVEAL_HOLD_MS);
    });
  }

  function fireRevealAbilities(onAllDone) {
    var G = SOG.state.G;
    var camp = G.locations[0];
    // Build a queue: just-revealed cards from both sides, in
    // (player-first) order. Spec doesn't specify order; matches
    // standard battle which interleaves but for one-card-per-side
    // per turn the order doesn't materially matter (only Tool draws).
    var queue = [];
    var pSlots = G.playerSlots[camp.id];
    var aSlots = G.aiSlots[camp.id];
    for (var i = 0; i < pSlots.length; i++) {
      var s = pSlots[i];
      if (s && s.revealed && !s._abilityFired) queue.push({ owner: 'player', cardId: s.cardId, slot: s });
    }
    for (var j = 0; j < aSlots.length; j++) {
      var s2 = aSlots[j];
      if (s2 && s2.revealed && !s2._abilityFired) queue.push({ owner: 'opp', cardId: s2.cardId, slot: s2 });
    }
    var fire = function (idx) {
      if (idx >= queue.length) { if (onAllDone) onAllDone(); return; }
      var item = queue[idx];
      item.slot._abilityFired = true;
      if (SOG.abilities && typeof SOG.abilities.fireAtOnce === 'function') {
        SOG.abilities.fireAtOnce(item.owner, item.cardId, camp.id, function () {
          fire(idx + 1);
        });
      } else {
        fire(idx + 1);
      }
    };
    fire(0);
  }

  /* ── Advance to next turn ──────────────────────────────────── */
  function advanceToNextTurn() {
    var G = SOG.state.G;
    G.turn++;
    log('Phase F — advancing to turn ' + G.turn);
    setTurnCounter(G.turn, TOTAL_TURNS);
    _hasPlayedThisTurn = false;
    G.prehistoryHasPlayed = false;  // unlock next play for isLegalPlayTarget

    // Reset End Turn and Reset buttons (disabled until player places).
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) {
      endTurnBtn.disabled = true;
      endTurnBtn.classList.remove('adv-pulse');
    }
    if (resetBtn) resetBtn.disabled = true;

    // Start-of-turn draw (player): exactly 1 card (flat draw, not draw-to-cap).
    // Because this is a flat +1, Tool's reveal-phase draw (which fires
    // before advanceToNextTurn) can push the hand to 4, and then this
    // +1 brings it to 5 — the only legal way to exceed the 4-card cap.
    var G2 = SOG.state.G;
    if (G2.playerDeck.length > 0) {
      G2.playerHand.push(G2.playerDeck.shift());
      if (SOG.input && typeof SOG.input.rebuildPlayerHand === 'function') {
        SOG.input.rebuildPlayerHand();
      } else if (typeof window.setPlayerHand === 'function') {
        window.setPlayerHand(G2.playerHand, G2.playerDeck.length);
      }
    }

    // Start-of-turn draw (AI, parallel model): draw 1 cosmetic card from
    // AI deck into AI hand. aiPlayScripted() consumed hand[0] this turn,
    // dropping hand count by 1; this draw restores it — hand stays at 3→4
    // and deck shrinks by 1, mirroring the player's draw rhythm.
    if (G2.aiDeck.length > 0) {
      G2.aiHand.push(G2.aiDeck.shift());
      if (SOG.ui && typeof SOG.ui.updateOppHand === 'function') {
        SOG.ui.updateOppHand();
      }
    }
  }

  /* ── End battle: tally scores, play SFX, run post-battle flow ── */
  function endBattle() {
    var G = SOG.state.G;
    var camp = G.locations[0];
    var pIP = 0, aIP = 0;
    G.playerSlots[camp.id].forEach(function (s) {
      if (s && s.revealed) pIP += SOG.board.effectiveIP(s);
    });
    G.aiSlots[camp.id].forEach(function (s) {
      if (s && s.revealed) aIP += SOG.board.effectiveIP(s);
    });
    var playerWon = pIP > aIP;
    var tied      = pIP === aIP;
    log('Phase F — battle complete: player ' + pIP + ' vs AI ' + aIP +
        ' → ' + (playerWon ? 'VICTORY' : tied ? 'TIE' : 'DEFEAT'));

    if (playerWon) {
      markBattleComplete();
      // Play victory fanfare immediately after the reveal settles
      if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
      // Brief pause for fanfare to land, then dialogue → card reveal → scoreboard
      setTimeout(function () {
        runPostBattleDialogue(WIN_DIALOGUE, function () {
          var neanderthalCard = (typeof CARDS !== 'undefined') &&
                                CARDS.find(function (c) { return c.id === 34; });
          showCardAcquisition(
            neanderthalCard || { id: 34, name: 'Neanderthal', image: 'images/cards/prehistorycards/neanderthalcard.jpg', ip: 4, ability: null, abilityName: null },
            playCardAcquire,
            function () { showVictoryScreen(pIP, aIP); }
          );
        });
      }, 600);
    } else if (tied) {
      // Tie: same progression treatment as loss (no card, node stays active)
      // TODO: replace with custom loss sound
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
      setTimeout(function () {
        runPostBattleDialogue(TIE_DIALOGUE, function () {
          showTieScreen(pIP, aIP);
        });
      }, 600);
    } else {
      // TODO: replace with custom loss sound
      if (typeof SFX !== 'undefined' && typeof SFX.gameLost === 'function') SFX.gameLost();
      // Brief pause for loss sound, then dialogue → scoreboard
      setTimeout(function () {
        runPostBattleDialogue(LOSS_DIALOGUE, function () {
          showDefeatScreen(pIP, aIP);
        });
      }, 600);
    }
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
    setupBattleBoard();
    document.body.classList.remove('prehistory-pre-coaching');
    popLucyIn();
    startTurnLoop();
    log('Phase F — replay: re-entering battle from gameboard');
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

    // SFX already played in endBattle() before the dialogue sequence.

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

    // SFX already played in endBattle() before the dialogue sequence.

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

    // SFX already played in endBattle() before the dialogue sequence.

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
    // Reset Lucy avatar
    var lucyAv = document.querySelector('.battle-avatar-lucy');
    if (lucyAv) lucyAv.classList.remove('adv-active');
    // Restore Otzi avatar image
    restoreOtziAvatar();
    // Hide any open bubbles
    hideAllBubbles();
    // Remove End Turn hook
    removeEndTurnHook();
    // Hide the adventure "← Results" back button (only shown during board review)
    var advBack = document.getElementById('adv-btn-back-results');
    if (advBack) { advBack.style.display = 'none'; advBack.onclick = null; }
    // Clear prehistoryMode so subsequent standard battles work
    if (SOG.state && SOG.state.G) SOG.state.G.prehistoryMode = false;
    _hasPlayedThisTurn = false;
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

  /* ── Entry-point wiring: install End Turn hook when battle starts */
  // Called from the intro flow (after coaching ends) AND from the
  // skip-intro flow (after setupBattleBoard runs).
  function startTurnLoop() {
    log('Phase F — starting turn loop (turn 1)');
    _hasPlayedThisTurn = false;
    SOG.state.G.prehistoryHasPlayed = false;
    installEndTurnHook();
    installResetHook();
    // Both action buttons start disabled — player must place a card first.
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
    if (resetBtn)   resetBtn.disabled   = true;
  }

  /* ── Exit back to overworld (devtools / temporary escape) ──── */
  function exitToOverworld() {
    log('Exiting Prehistory battle — returning to overworld');
    document.body.classList.remove('prehistory-battle');
    document.body.classList.remove('prehistory-pre-coaching');
    restoreOtziAvatar();
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
    var battleComplete = isBattleComplete();
    var skipIntro      = battleComplete || neanderthalIntroSeenThisSession;
    log('startNeanderthalBattle() — battleComplete=' + battleComplete +
        ' introSeenThisSession=' + neanderthalIntroSeenThisSession +
        ' → skipIntro=' + skipIntro);

    if (skipIntro) {
      // Skip-intro path: drop straight to the gameboard (no walk, no
      // dialogue, no wipe, no coaching). Spec: "Drop the player straight
      // into the gameboard with their current deck."
      setupBattleBoard();
      // Skip-intro doesn't need the coaching slide-in either — clear
      // the pre-coaching state immediately so the hand + buttons + HUD
      // are visible right away. Lucy avatar still pops in (spec: "Her
      // portrait stays on screen for the rest of the battle").
      document.body.classList.remove('prehistory-pre-coaching');
      popLucyIn();
      startTurnLoop();
    } else {
      // Set this BEFORE the intro plays so a defeat-replay this session
      // skips straight to the gameboard (phase F's loss-replay flow).
      neanderthalIntroSeenThisSession = true;
      // Phase C: pre-battle dialogue → radial wipe.
      // Phase D: setupBattleBoard() while cover is up → fade cover out.
      // Phase E: playCoaching() — intro exchange → shake + UI slide-in
      //          → Lucy tutorial coaching → enable card interaction.
      // Phase F: startTurnLoop() — install End Turn hook + gate.
      playPreBattleDialogue(function () {
        radialWipe(function () {
          setupBattleBoard();
          // Bubbles are no longer needed; the wipe covered them anyway.
          hideAllBubbles();
          fadeOutCover(function () {
            log('Phase D complete — gameboard visible, starting Phase E');
            playCoaching(function () {
              log('Phase E complete — starting Phase F turn loop');
              startTurnLoop();
            });
          });
        });
      });
    }
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

  return {
    startNeanderthalBattle: startNeanderthalBattle,
    isBattleComplete:       isBattleComplete,
    markBattleComplete:     markBattleComplete,
    resetBattleComplete:    resetBattleComplete,
    // Called by input.js commitPlay when G.prehistoryMode is true.
    notifyPlayerPlayed:     notifyPlayerPlayed,
    // Shared card-acquisition component — called by overworld.js for the
    // Lucy reveal (and any future card unlocks that use the same flow).
    showCardAcquisition:    showCardAcquisition,
    // Devtools escape
    exitToOverworld:        exitToOverworld,
    // Input guard: true while coaching or post-battle dialogue is running.
    isCoachingActive:       isCoachingActive
  };

})();

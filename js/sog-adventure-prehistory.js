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

  /* ── Audio (lazy-loaded Howl for woosh.m4a) ────────────────── */
  var wooshHowl = null;
  function ensureWoosh() {
    if (wooshHowl || typeof Howl === 'undefined') return;
    wooshHowl = new Howl({
      src: ['sfx/woosh.m4a'],
      volume: 0.8,
      html5: true
    });
  }
  function playWoosh() {
    ensureWoosh();
    if (wooshHowl) { try { wooshHowl.stop(); wooshHowl.play(); } catch (e) {} }
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

    // Typewriter — char-by-char, then hold, then call onDone.
    var i = 0;
    var timer = setInterval(function () {
      i++;
      textEl.textContent = text.slice(0, i);
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

     AI deck (scripted, no shuffle):
       27 Hunter, 28 Gatherer, 31 Megalith, 34 Neanderthal
     The AI "hand" pre-loads all 4 — phase F consumes from index 0
     each turn for a deterministic scripted sequence.
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
    // Scripted AI plays exactly these in order across turns 1-4:
    //   T1 Hunter, T2 Gatherer, T3 Megalith, T4 Neanderthal
    return [27, 28, 31, 34];
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

  // Swap the Otzi avatar img src to the Neanderthal card art (cropped
  // to face region via object-position). Stash original src so the
  // exit path can restore it for the next standard battle.
  function applyNeanderthalAvatar() {
    var img = document.querySelector('.battle-avatar-otzi .battle-avatar-frame img');
    if (!img) return;
    if (typeof img.dataset.origSrc === 'undefined') img.dataset.origSrc = img.src;
    img.src = 'images/prehistorycards/neanderthalcard.jpg';
    img.style.objectPosition = 'center 18%';
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

    G.aiDeck = [];                                   // AI doesn't draw
    G.aiHand = buildNeanderthalAiDeck().slice();     // scripted, all 4 pre-loaded

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
    { who: 'lucy',        text: 'He thinks because he invented fire. No one else can have it.',
                          popLucyOnStart: true },
    { who: 'neanderthal', text: 'Me no think. Me know.' },
    { who: 'lucy',        text: 'You no think alright.' },
    { who: 'neanderthal', text: 'AARRGH!!!' }
  ];

  var COACHING_PHASE_2 = [
    { who: 'lucy', text: 'If this Neanderthal wants a battle, I came prepared.' },
    { who: 'lucy', text: 'See those cards?' },
    { who: 'lucy', text: 'You play one each turn on your side of the center location.' },
    { who: 'lucy', text: 'See that number?',                  startIPPulse: true },
    { who: 'lucy', text: 'Those are Influence Points, or IP for short.' },
    { who: 'lucy', text: 'Your goal here is to gain the most IP at The Camp after four turns.' },
    { who: 'lucy', text: 'Oh, and most cards have special abilities' },
    { who: 'lucy', text: 'Click on them to read what they have in store.' },
    { who: 'lucy', text: "When you're ready, click and drag your first card into play and send this guy back to whatever came before the Stone Age." }
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

    var i = 0;
    if (co_timer) clearInterval(co_timer);
    co_timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
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

  /* ── Lucy avatar pop-in (large bottom-left battle portrait) ── */
  function popLucyIn() {
    var avEl = document.querySelector('.battle-avatar-lucy');
    if (avEl) avEl.classList.add('adv-active');
    // CSS handles the scale + opacity transition (.adv-active in style.css)
  }

  /* ── IP pulse on rightmost hand card ───────────────────────── */
  function startIPPulse() {
    var cards = document.querySelectorAll('#battle-player-hand .battle-hand-card');
    if (!cards.length) return;
    var lastCard = cards[cards.length - 1];
    var ipEl = lastCard.querySelector('.db-overlay-ip');
    if (ipEl) ipEl.classList.add('adv-ip-pulse');
  }
  function stopIPPulse() {
    var pulsing = document.querySelectorAll('.adv-ip-pulse');
    for (var i = 0; i < pulsing.length; i++) {
      pulsing[i].classList.remove('adv-ip-pulse');
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
  var _onResultDismiss   = null;

  // Public function called by input.js's commitPlay when a card is
  // played AND G.prehistoryMode is true.
  function notifyPlayerPlayed(cardId, locId) {
    log('Phase F — player played card ' + cardId + ' at loc ' + locId);
    _hasPlayedThisTurn = true;

    // Post-play draw: maintain hand at 4. If hand is already at or
    // above the cap (e.g. Tool's onAtOnce raised it to 5 last turn),
    // don't draw — the cap stands until the next play brings it
    // back down.
    drawToHandCap();

    // Enable End Turn now that the player has committed.
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) endTurnBtn.disabled = false;

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

  function onPrehistoryEndTurn() {
    log('Phase F — End Turn (turn ' + SOG.state.G.turn + ')');
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) {
      endTurnBtn.disabled = true;
      endTurnBtn.classList.remove('adv-pulse');
    }
    hideLucyOneLiner();
    aiPlayScripted();
    runPrehistoryReveal(function () {
      var G = SOG.state.G;
      if (G.turn >= TOTAL_TURNS) {
        endBattle();
      } else {
        advanceToNextTurn();
      }
    });
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

    var card = window.CARDS && window.CARDS.find(function (c) { return c.id === cardId; });
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
    var card = window.CARDS && window.CARDS.find(function (c) { return c.id === cardId; });
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
    // Reset End Turn button (disabled until player places this turn).
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) {
      endTurnBtn.disabled = true;
      endTurnBtn.classList.remove('adv-pulse');
    }
    // Standard hand refill at turn start — same rule as post-play
    // (only draw if hand below cap, so Tool's hand-of-5 sticks until
    // a play brings it back to 4).
    drawToHandCap();
  }

  /* ── End battle: tally + show victory or defeat ─────────────── */
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
    var playerWon = pIP >= aIP;  // tie = player wins (spec)
    log('Phase F — battle complete: player ' + pIP + ' vs AI ' + aIP +
        ' → ' + (playerWon ? 'VICTORY' : 'DEFEAT'));
    if (playerWon) {
      markBattleComplete();
      showVictoryScreen();
    } else {
      showDefeatScreen();
    }
  }

  /* ── Victory / defeat screens ─────────────────────────────── */
  function showVictoryScreen() {
    var el = document.getElementById('adv-result-victory');
    if (!el) return;
    el.style.display = 'flex';
    var btn = document.getElementById('adv-result-victory-continue');
    if (btn) {
      btn.onclick = function () {
        el.style.display = 'none';
        // Mark the Prehistory node as completed before returning to
        // the overworld so the checkmark renders on the next paint.
        markPrehistoryNodeCompleteFlag = true;
        exitBattleToOverworld();
      };
    }
  }

  // Flag read on the next overworld load to add the .overworld-node-complete
  // class to the Prehistory node. Set in showVictoryScreen's Continue handler.
  var markPrehistoryNodeCompleteFlag = false;

  function showDefeatScreen() {
    var el = document.getElementById('adv-result-defeat');
    if (!el) return;
    el.style.display = 'flex';
    var btn = document.getElementById('adv-result-defeat-retry');
    if (btn) {
      btn.onclick = function () {
        el.style.display = 'none';
        // Replay from step 4 (gameboard appears). Per spec: do NOT
        // replay steps 1-3 (overworld walk, dialogue, radial wipe).
        // neanderthalIntroSeenThisSession is already true from the
        // first run this session, so the skipIntro path is taken.
        // We call setupBattleBoard directly to skip the wipe-fade.
        teardownBattle();
        setupBattleBoard();
        document.body.classList.remove('prehistory-pre-coaching');
        popLucyIn();
        installEndTurnHook();
        log('Phase F — defeat replay: re-entering battle from gameboard');
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
    // Clear prehistoryMode so subsequent standard battles work
    if (SOG.state && SOG.state.G) SOG.state.G.prehistoryMode = false;
    _hasPlayedThisTurn = false;
  }

  function exitBattleToOverworld() {
    teardownBattle();
    if (typeof window.showScreen === 'function') {
      window.showScreen('screen-overworld');
    }
    // Apply node-complete badge if needed.
    if (markPrehistoryNodeCompleteFlag) {
      markPrehistoryNodeCompleteFlag = false;
      // Defer one frame so the overworld DOM has settled.
      setTimeout(function () {
        var nodeEl = document.querySelector('#overworld-overlay [data-id="prehistory"]');
        if (nodeEl) nodeEl.classList.add('overworld-node-complete');
      }, 50);
    }
  }

  /* ── Entry-point wiring: install End Turn hook when battle starts */
  // Called from the intro flow (after coaching ends) AND from the
  // skip-intro flow (after setupBattleBoard runs).
  function startTurnLoop() {
    log('Phase F — starting turn loop (turn 1)');
    _hasPlayedThisTurn = false;
    installEndTurnHook();
    // End Turn starts disabled — player must place a card first.
    var endTurnBtn = document.getElementById('battle-end-turn');
    if (endTurnBtn) endTurnBtn.disabled = true;
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
  return {
    startNeanderthalBattle: startNeanderthalBattle,
    isBattleComplete:       isBattleComplete,
    markBattleComplete:     markBattleComplete,
    resetBattleComplete:    resetBattleComplete,
    // Devtools escape — call from console while testing Phase D-E
    // (the player can't progress past the board until Phase F wires
    // the turn loop). Returns to overworld and clears the context class.
    exitToOverworld:        exitToOverworld
  };

})();

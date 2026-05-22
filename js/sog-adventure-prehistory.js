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
      if (el) el.classList.remove('is-visible');
    });
  }

  function playPreBattleDialogue(onDone) {
    log('Phase C — pre-battle dialogue starting');
    // Belt-and-suspenders: clear any stale bubble state from a previous run
    hideAllBubbles();
    showBubbleText('neanderthal', 'AARRGH!', function () {
      showBubbleText('explorer', 'Uh oh…', function () {
        log('Phase C — both lines typed; holding ' + POST_DIALOGUE_MS + 'ms before wipe');
        setTimeout(function () {
          log('Phase C — pre-battle dialogue complete');
          if (onDone) onDone();
        }, POST_DIALOGUE_MS);
      });
    });
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
    if (typeof window.setPlayerHand === 'function') {
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
      // Skip-intro doesn't need the coaching slide-in either — show
      // hand + buttons immediately.
      document.body.classList.remove('prehistory-pre-coaching');
      log('TODO phase F: runTurnLoop (skip-intro path)');
    } else {
      // Set this BEFORE the intro plays so a defeat-replay this session
      // skips straight to the gameboard (phase F's loss-replay flow).
      neanderthalIntroSeenThisSession = true;
      // Phase C: pre-battle dialogue → radial wipe.
      // Phase D: setupBattleBoard() while cover is up → fade cover out.
      playPreBattleDialogue(function () {
        radialWipe(function () {
          // Cover is fully up. Build the gameboard underneath it so the
          // reveal feels instant when the cover fades.
          setupBattleBoard();
          // Bubbles are no longer needed; the wipe covered them anyway.
          hideAllBubbles();
          // Reveal the board by fading the cover to transparent.
          fadeOutCover(function () {
            log('Phase D complete — gameboard visible');
            // TODO phase E: playCoaching() — Lucy pops in, coaches the
            //              player through the rules; then UI slides in.
            // TODO phase F: runTurnLoop() once coaching ends.
            log('TODO phase E-F: coaching + turn loop');
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

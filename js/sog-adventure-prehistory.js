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

  /* PHASE C TESTING ONLY: reverse the wipe so the overworld becomes
     visible again. Phase D will replace this with: setupBattleBoard()
     then fade the cover out to reveal the board. */
  function _tempReverseWipeForTesting(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onDone) onDone(); return; }
    var center = getPrehistoryNodeCenter();
    var maxR   = Math.max(window.innerWidth, window.innerHeight) * 1.4;
    log('Phase C TEST — reversing wipe so overworld becomes visible again ' +
        '(Phase D will replace this with board setup)');
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active');
      if (onDone) onDone();
      return;
    }
    var proxy = { r: maxR };
    gsap.to(proxy, {
      r: 0,
      duration: 0.6,
      ease: 'power2.inOut',
      onUpdate: function () {
        wipeEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + center.xPct + '% ' + center.yPct + '%)';
      },
      onComplete: function () {
        wipeEl.classList.remove('active');
        hideAllBubbles();
        if (onDone) onDone();
      }
    });
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
      // TODO phase D+F: setupBattleBoard() then runTurnLoop()
      log('TODO phase D+F: straight-to-gameboard path');
    } else {
      // Set this BEFORE the intro plays so a defeat-replay this session
      // skips straight to the gameboard.
      neanderthalIntroSeenThisSession = true;
      // Phase C: pre-battle dialogue → radial wipe.
      playPreBattleDialogue(function () {
        radialWipe(function () {
          // TODO phase D: setupBattleBoard() — render gameboard behind the
          //              still-covered radial wipe, then fade the cover out.
          // TODO phase E: playCoaching() once the board is visible.
          // TODO phase F: runTurnLoop() + win/loss flow.
          log('TODO phase D-F: board setup + coaching + turn loop');
          // PHASE C TESTING: reverse the wipe so the overworld becomes
          // visible again — lets us verify the wipe completed cleanly
          // without phases D-F being implemented yet. Remove in phase D.
          _tempReverseWipeForTesting(function () {
            log('Phase C TEST — wipe reversed, ready for next click');
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
    resetBattleComplete:    resetBattleComplete
  };

})();

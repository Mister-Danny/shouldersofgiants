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
      // TODO phase C: playPreBattleDialogue() → radialWipe()
      // TODO phase D: setupBattleBoard()
      // TODO phase E: playCoaching()
      // TODO phase F: runTurnLoop() + win/loss flow
      log('TODO phase C-F: full intro sequence');
      // Set this BEFORE the intro plays so a defeat-replay this session
      // skips straight to the gameboard.
      neanderthalIntroSeenThisSession = true;
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

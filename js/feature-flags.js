/**
 * feature-flags.js — temporary whole-feature on/off switches.
 *
 * Not a per-player unlock (compare sog_deckbuilder_unlocked, an earned
 * progression flag in localStorage) — this is a single source-code switch a
 * developer flips to pull a feature for everyone, with no other code changes.
 *
 * Must load before js/teacher-dashboard.js and js/home.js, the two modules
 * that check MULTIPLAYER_ENABLED to hide their entry points into Versus/
 * Tournament. Everything downstream (js/multiplayer.js, js/battlelobby.js,
 * js/match.js) is left completely untouched — re-enabling is exactly one
 * flip back to `true` here.
 */
window.SOG_FEATURES = {
  // Multiplayer Versus + Tournament — temporarily disabled. Gates:
  //   - js/home.js's "⚔ Multiplayer" button (#btn-versus)
  //   - js/teacher-dashboard.js's "⚔ Tournament Lobby" button (#td-open-lobby)
  MULTIPLAYER_ENABLED: false
};

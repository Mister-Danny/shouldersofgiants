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
  MULTIPLAYER_ENABLED: false,

  // Adventure content PAST KUSH (Persia, India and beyond) — not ready for
  // players yet. While this is false the ONLINE game ends at the Kush Giant:
  //   - js/overworld.js hides every exit into a map outside RELEASED_MAPS, moves
  //     a save that is already standing on one back to Mesopotamia, and shows
  //     the end-of-content popup after the Kush Giant
  //   - js/sog-collection.js stops counting the India Giants toward the
  //     7th-grade history card unlock
  // A local host (localhost / file:) always gets everything, so playtesting is
  // unaffected. Releasing the content is one flip to `true` here.
  CONTENT_PAST_KUSH_ENABLED: false,

  // The maps a player can reach up to and including Kush.
  RELEASED_MAPS: ['eastafrica', 'egypt', 'upper-egypt', 'mesopotamia'],
  // The last boss inside those maps, and the Giants that live past it.
  LAST_RELEASED_BOSS: 'kush',
  UNRELEASED_GIANT_HOOKS: ['greatbath', 'siddhartha', 'gupta']
};

/* Is the content past Kush open for THIS session? True when the flag is on, or
   on a local host (unless the playtest switch below closes it). Client-side
   only: it hides the road, it is not a security boundary. */
window.SOG_FEATURES.contentPastKushOpen = function () {
  if (window.SOG_FEATURES.CONTENT_PAST_KUSH_ENABLED) return true;
  try {
    // Playtest the closed game on a local host: in the console,
    //   localStorage.setItem('sog_dev_close_past_kush', 'true')   then reload.
    // Only ever CLOSES content, so it does nothing useful on the live site.
    if (localStorage.getItem('sog_dev_close_past_kush') === 'true') return false;
    if (location.protocol === 'file:') return true;
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
  } catch (e) { return false; }
};
/* Can the player be on this map? */
window.SOG_FEATURES.isMapOpen = function (mapId) {
  return window.SOG_FEATURES.contentPastKushOpen() ||
         window.SOG_FEATURES.RELEASED_MAPS.indexOf(mapId) !== -1;
};

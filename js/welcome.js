/**
 * First-load welcome modal — "Before You Begin"
 *
 * Shows once on the very first visit to the game in a given browser.
 * Skipped silently on every subsequent visit (unless localStorage is cleared).
 * Also skipped for "returning players" who already have REAL progress saved
 * (Arcadium wins / unlocks / tutorial, any completed Adventure battle or beaten
 * node, Adventure map progress) but no welcome flag yet — so we don't pop this
 * on people who pre-date the modal.
 *
 * NOT progress: the deck keys. js/decks.js creates an empty sog_decks (and
 * sog_active_deck_slot) the moment it loads, before this runs — counting
 * sog_decks made every brand-new player look like a returning one, so the
 * popup silently never showed from 2026-04-26 (4560067) until this fix.
 */
(function () {
  'use strict';

  var WELCOME_KEY = 'sog_welcome_seen';

  // If any of these existing keys is set, treat the user as a returning player.
  // (Arcadium progression keys, plus Adventure progress below.)
  var PROGRESS_KEYS = [
    'sog_tutorial_complete',
    'sog_serf_wins',
    'sog_giant_wins',
    'sog_total_wins',
    'sog_religious_unlocked',
    'sog_exploration_unlocked',
    'sog_religious_cutscene_seen',
    'sog_exploration_cutscene_seen',
    'sog_victory_montage_seen',
    // Adventure: past the map intro, or a map / position saved.
    'sog_adventure_intro_complete',
    'sog_overworld_map',
    'sog_overworld_pos'
  ];
  // Adventure battles won / map nodes beaten, by key pattern.
  var PROGRESS_PATTERNS = [
    /^sog_battle_[a-z_]+_complete$/,
    /^sog_node_[a-z0-9_-]+_(serf|giant)_beaten$/
  ];

  function hasExistingProgress() {
    try {
      for (var i = 0; i < PROGRESS_KEYS.length; i++) {
        if (localStorage.getItem(PROGRESS_KEYS[i])) return true;
      }
      for (var k = 0; k < localStorage.length; k++) {
        var key = localStorage.key(k);
        if (key && localStorage.getItem(key) && PROGRESS_PATTERNS.some(function (re) { return re.test(key); })) return true;
      }
    } catch (e) { return false; }
    return false;
  }

  function init() {
    try {
      // Already dismissed → nothing to do
      if (localStorage.getItem(WELCOME_KEY) === 'true') return;

      // Returning player who pre-dates this modal → mark seen and skip
      if (hasExistingProgress()) {
        localStorage.setItem(WELCOME_KEY, 'true');
        return;
      }
    } catch (e) {
      // localStorage disabled / blocked — fall through to show the welcome anyway
    }

    var backdrop = document.getElementById('welcome-backdrop');
    var btn      = document.getElementById('welcome-dismiss');
    if (!backdrop || !btn) return;

    // Show the modal — same .visible-class pattern as every other popup-backdrop.
    // (.popup-backdrop has pointer-events:none until .visible is added, so the
    // home buttons behind it are non-interactive while the modal is up.)
    backdrop.classList.add('visible');

    function dismiss() {
      try { localStorage.setItem(WELCOME_KEY, 'true'); } catch (e) {}
      backdrop.classList.remove('visible');
      btn.removeEventListener('click', dismiss);
    }

    // Single handler covers both desktop click and mobile tap (standard click event)
    btn.addEventListener('click', dismiss);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

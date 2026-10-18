/**
 * progression.js
 * Shoulders of Giants — Arcadium win counters
 *
 * Counts Arcadium Serf/Giant wins. These once unlocked the Religious and
 * Exploration card types with a cutscene (and armed a 10-win "Victory
 * Montage" placeholder); the collection gates cards now, so those are gone.
 * The counters and the old unlock/cutscene flags stay: they are part of the
 * /players/{uid}.progress snapshot, and js/welcome.js reads them as signs of
 * a returning player.
 */

var Progression = (function () {
  'use strict';

  /* ── localStorage key constants ──────────────────────────────── */
  var KEY_SERF_WINS       = 'sog_serf_wins';
  var KEY_GIANT_WINS      = 'sog_giant_wins';
  var KEY_REL_UNLOCKED    = 'sog_religious_unlocked';
  var KEY_EXP_UNLOCKED    = 'sog_exploration_unlocked';
  var KEY_REL_CUTSCENE    = 'sog_religious_cutscene_seen';
  var KEY_EXP_CUTSCENE    = 'sog_exploration_cutscene_seen';
  var KEY_TOTAL_WINS      = 'sog_total_wins';
  var KEY_MONTAGE_SEEN    = 'sog_victory_montage_seen';

  var WINS_REQUIRED       = 3;

  /* ── Helpers ─────────────────────────────────────────────────── */
  function _getInt(key) { return parseInt(localStorage.getItem(key) || '0', 10); }
  function _setInt(key, v) { localStorage.setItem(key, String(v)); }
  function _getBool(key) { return localStorage.getItem(key) === 'true'; }
  function _setBool(key) { localStorage.setItem(key, 'true'); }
  function _setBoolValue(key, v) {
    if (v) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  }

  /* ── Public API ──────────────────────────────────────────────── */

  /**
   * Record a player win.
   * @param {string} difficulty  'easy' (Serf) or 'hard' (Giant)
   */
  function recordWin(difficulty) {
    if (difficulty === 'easy') {
      var sw = _getInt(KEY_SERF_WINS) + 1;
      _setInt(KEY_SERF_WINS, sw);
      if (sw >= WINS_REQUIRED) _setBool(KEY_REL_UNLOCKED);
    } else if (difficulty === 'hard') {
      var gw = _getInt(KEY_GIANT_WINS) + 1;
      _setInt(KEY_GIANT_WINS, gw);
      if (gw >= WINS_REQUIRED) _setBool(KEY_EXP_UNLOCKED);
    }
    _setInt(KEY_TOTAL_WINS, _getInt(KEY_TOTAL_WINS) + 1);

    if (window.SOG_DEBUG) console.log('[Progression] recordWin:', difficulty,
      '| totalWins:', _getInt(KEY_TOTAL_WINS), '| serfWins:', _getInt(KEY_SERF_WINS), '| giantWins:', _getInt(KEY_GIANT_WINS));
  }

  /* ── Snapshot (save-state.js) ── */
  function getSnapshot() {
    return {
      serfWins:                _getInt(KEY_SERF_WINS),
      giantWins:                _getInt(KEY_GIANT_WINS),
      religiousUnlocked:        _getBool(KEY_REL_UNLOCKED),
      explorationUnlocked:      _getBool(KEY_EXP_UNLOCKED),
      religiousCutsceneSeen:    _getBool(KEY_REL_CUTSCENE),
      explorationCutsceneSeen:  _getBool(KEY_EXP_CUTSCENE),
      totalWins:                _getInt(KEY_TOTAL_WINS),
      victoryMontageSeen:       _getBool(KEY_MONTAGE_SEEN)
    };
  }

  function applySnapshot(snap) {
    if (!snap) return;
    _setInt(KEY_SERF_WINS, snap.serfWins || 0);
    _setInt(KEY_GIANT_WINS, snap.giantWins || 0);
    _setBoolValue(KEY_REL_UNLOCKED, !!snap.religiousUnlocked);
    _setBoolValue(KEY_EXP_UNLOCKED, !!snap.explorationUnlocked);
    _setBoolValue(KEY_REL_CUTSCENE, !!snap.religiousCutsceneSeen);
    _setBoolValue(KEY_EXP_CUTSCENE, !!snap.explorationCutsceneSeen);
    _setInt(KEY_TOTAL_WINS, snap.totalWins || 0);
    _setBoolValue(KEY_MONTAGE_SEEN, !!snap.victoryMontageSeen);
  }

  /* ── Expose ──────────────────────────────────────────────────── */
  return {
    recordWin:          recordWin,
    getSnapshot:        getSnapshot,
    applySnapshot:      applySnapshot
  };
})();

window.Progression = Progression;

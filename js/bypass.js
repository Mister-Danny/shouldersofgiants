/**
 * bypass.js — Shoulders of Giants · Teacher Bypass Menu
 *
 * Opens from the triple-click on the "Shoulders of Giants" title, for a signed-in
 * teacher or a trusted local host (TeacherDashboard.devToolsAllowed).
 * Sections: Tutorial Controls, Session Controls, Progression, Feedback,
 * Classroom Controls. (The old Data Review section read /sessions, which the
 * Firestore rules deny to every client — it was removed rather than left erroring.)
 *
 * Exposes:    window.BypassMenu
 */
(function () {
  'use strict';

  /* ── localStorage keys (must match analytics.js) ─────────────── */
  var FORCED_LOCS_KEY = 'sog_forced_locations';
  var TUTORIAL_KEY    = 'sog_tutorial_complete';
  var DB_TUTORIAL_KEY = 'sog_deckbuilder_tutorial_complete';
  var TEST_MODE_KEY   = 'sog_test_mode';
  // Saved decks now live in window.Decks (multi-slot system).
  var ABANDONED_KEY   = 'sog_abandoned_session';

  /* ══════════════════════════════════════════════════════════════
     Open / Close
  ══════════════════════════════════════════════════════════════ */
  function open() {
    var el = document.getElementById('bypass-backdrop');
    if (!el) return;
    el.style.display = 'flex';
    refreshTestModeBtn();
    refreshForcedLocations();
    refreshFeedbackBypassState();
  }

  function refreshFeedbackBypassState() {
    var seenEl = document.getElementById('bypass-feedback-seen');
    if (seenEl) {
      var offered = window.Feedback ? window.Feedback.isOffered() : false;
      seenEl.textContent = offered ? 'yes' : 'no';
    }
  }

  function close() {
    var el = document.getElementById('bypass-backdrop');
    if (el) el.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════════════
     Tutorial Controls
  ══════════════════════════════════════════════════════════════ */
  function skipTutorial() {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    showBypassToast('Tutorial skipped — going to Deck Builder');
    close();
    // Fade home music out while the bypass menu animates closed, so the
    // user lands on the deck builder in silence ready for deck music.
    // Sibling to bug 13's home-music leak fix.
    if (window.HomeFlow && typeof window.HomeFlow.stopMusic === 'function') {
      window.HomeFlow.stopMusic(400);
    }
    setTimeout(function () {
      // bug 23: if dbtutorial will run, preset the marker so the music widget
      // never flashes visible, and skip the deck-music start (tearDown will).
      var dbWillRun = window.DeckBuilderTutorial &&
                      typeof window.DeckBuilderTutorial.willRunOnNext === 'function' &&
                      window.DeckBuilderTutorial.willRunOnNext();
      if (dbWillRun) document.body.dataset.dbtutorial = 'active';
      if (typeof showScreen      === 'function') showScreen('screen-deckbuilder');
      if (typeof initDeckBuilder === 'function') initDeckBuilder();
      // Match the home.js Arcadium handler's order: init first, then start
      // deck music with the same 400ms fade-in used by the tutorial-end path.
      if (!dbWillRun && typeof window.playDeckMusic === 'function') window.playDeckMusic(400);
    }, 600);
  }

  function resetTutorial() {
    localStorage.removeItem(TUTORIAL_KEY);
    localStorage.removeItem(DB_TUTORIAL_KEY);
    showBypassToast('Tutorials reset — will replay on next visit');
  }

  /* ══════════════════════════════════════════════════════════════
     Progression Unlocks
  ══════════════════════════════════════════════════════════════ */
  function unlockReligious() {
    localStorage.setItem('sog_religious_unlocked', 'true');
    localStorage.setItem('sog_religious_cutscene_seen', 'true');
    showBypassToast('Religious cards unlocked — reload to see changes in deck builder');
  }

  function unlockExploration() {
    localStorage.setItem('sog_exploration_unlocked', 'true');
    localStorage.setItem('sog_exploration_cutscene_seen', 'true');
    showBypassToast('Exploration cards unlocked — reload to see changes in deck builder');
  }

  function unlockAll() {
    localStorage.setItem('sog_religious_unlocked', 'true');
    localStorage.setItem('sog_exploration_unlocked', 'true');
    localStorage.setItem('sog_religious_cutscene_seen', 'true');
    localStorage.setItem('sog_exploration_cutscene_seen', 'true');
    localStorage.setItem('sog_serf_wins', '3');
    localStorage.setItem('sog_giant_wins', '3');
    localStorage.setItem('sog_total_wins', '6');
    showBypassToast('All cards unlocked — reload to see changes in deck builder');
  }

  /* ══════════════════════════════════════════════════════════════
     Session Controls
  ══════════════════════════════════════════════════════════════ */
  function refreshTestModeBtn() {
    var btn = document.getElementById('bypass-test-toggle');
    if (!btn) return;
    var on = localStorage.getItem(TEST_MODE_KEY) === 'true';
    btn.textContent = 'TEST MODE: ' + (on ? 'ON' : 'OFF');
    btn.className   = 'btn-snes bypass-btn-action ' + (on ? 'bypass-test-on' : 'bypass-test-off');
  }

  function toggleTestMode() {
    var on = localStorage.getItem(TEST_MODE_KEY) === 'true';
    var next = !on;
    localStorage.setItem(TEST_MODE_KEY, next ? 'true' : 'false');
    // Sync visible TEST MODE badge without full page reload
    var ind = document.getElementById('test-mode-indicator');
    if (ind) ind.style.display = next ? 'block' : 'none';
    refreshTestModeBtn();
    showBypassToast('Test mode ' + (next ? 'ON' : 'OFF'));
  }

  function resetAllData() {
    if (!confirm('Reset ALL student data?\n\nThis clears the saved deck, tutorial progress, test mode flag, and all session state. The page will reload immediately.\n\nThis cannot be undone.')) return;
    if (!confirm('Second confirmation: click OK to wipe all data and reload.')) return;
    localStorage.removeItem(TUTORIAL_KEY);
    localStorage.removeItem(DB_TUTORIAL_KEY);
    localStorage.removeItem(TEST_MODE_KEY);
    if (window.Decks && typeof window.Decks.clearAll === 'function') window.Decks.clearAll();
    localStorage.removeItem(ABANDONED_KEY);
    localStorage.removeItem(FORCED_LOCS_KEY);
    location.reload();
  }

  /* ══════════════════════════════════════════════════════════════
     Classroom Controls — Force Locations
  ══════════════════════════════════════════════════════════════ */
  function refreshForcedLocations() {
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(FORCED_LOCS_KEY)); } catch (e) {}
    var forced = Array.isArray(stored) ? stored : [];

    document.querySelectorAll('.bypass-loc-check').forEach(function (cb) {
      cb.checked = forced.indexOf(parseInt(cb.value, 10)) !== -1;
    });
    updateLocStatus(forced.length === 3 ? forced : []);
  }

  function updateLocStatus(forced) {
    var el = document.getElementById('bypass-loc-status');
    if (!el) return;
    if (!forced || forced.length === 0) {
      el.textContent = 'Random each game';
      el.className   = 'bypass-loc-status bypass-loc-random';
    } else if (forced.length === 3) {
      el.textContent = 'LOCKED';
      el.className   = 'bypass-loc-status bypass-loc-locked';
    } else {
      el.textContent = 'Select exactly 3 to lock';
      el.className   = 'bypass-loc-status bypass-loc-partial';
    }
  }

  function onLocCheckChange(changedCb) {
    var checked = [];
    document.querySelectorAll('.bypass-loc-check:checked').forEach(function (cb) {
      checked.push(parseInt(cb.value, 10));
    });

    if (checked.length > 3) {
      changedCb.checked = false;
      showBypassToast('Select exactly 3 locations to lock');
      return;
    }

    if (checked.length === 3) {
      localStorage.setItem(FORCED_LOCS_KEY, JSON.stringify(checked));
      updateLocStatus(checked);
      showBypassToast('Locations locked for all games');
    } else {
      localStorage.removeItem(FORCED_LOCS_KEY);
      updateLocStatus([]);
      if (checked.length === 0) showBypassToast('Locations will randomize normally');
    }
  }

  function clearForcedLocations() {
    localStorage.removeItem(FORCED_LOCS_KEY);
    document.querySelectorAll('.bypass-loc-check').forEach(function (cb) {
      cb.checked = false;
    });
    updateLocStatus([]);
    showBypassToast('Locations will randomize normally');
  }

  /* ══════════════════════════════════════════════════════════════
     Toast notification
  ══════════════════════════════════════════════════════════════ */
  function showBypassToast(msg) {
    var el = document.getElementById('bypass-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('bypass-toast-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('bypass-toast-visible');
    }, 3000);
  }

  /* ══════════════════════════════════════════════════════════════
     DOM event binding
  ══════════════════════════════════════════════════════════════ */
  function bindEvents() {
    var backdrop = document.getElementById('bypass-backdrop');
    if (!backdrop) return;

    /* Close on backdrop click (outside dialog) */
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });

    /* Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var bd = document.getElementById('bypass-backdrop');
        if (bd && bd.style.display !== 'none') close();
      }
    });

    /* Header close */
    var closeBtn = document.getElementById('bypass-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    /* Tutorial controls */
    var skipBtn = document.getElementById('bypass-skip-tut');
    if (skipBtn) skipBtn.addEventListener('click', skipTutorial);

    var resetTutBtn = document.getElementById('bypass-reset-tut');
    if (resetTutBtn) resetTutBtn.addEventListener('click', resetTutorial);

    /* Progression controls — unlocks */
    var unlockRelBtn = document.getElementById('bypass-unlock-religious');
    if (unlockRelBtn) unlockRelBtn.addEventListener('click', unlockReligious);

    var unlockExpBtn = document.getElementById('bypass-unlock-exploration');
    if (unlockExpBtn) unlockExpBtn.addEventListener('click', unlockExploration);

    var unlockAllBtn = document.getElementById('bypass-unlock-all');
    if (unlockAllBtn) unlockAllBtn.addEventListener('click', unlockAll);

    /* Session controls */
    var testBtn = document.getElementById('bypass-test-toggle');
    if (testBtn) testBtn.addEventListener('click', toggleTestMode);

    var resetAllBtn = document.getElementById('bypass-reset-all');
    if (resetAllBtn) resetAllBtn.addEventListener('click', resetAllData);

    var legendBtn = document.getElementById('bypass-play-legend');
    if (legendBtn) legendBtn.addEventListener('click', function () {
      if (window.LegendScreen) {
        close();
        window.LegendScreen.show(function () {});
      }
    });

    /* Progression controls */
    var relBtn = document.getElementById('bypass-play-religious');
    if (relBtn) relBtn.addEventListener('click', function () {
      if (typeof Progression !== 'undefined') {
        close();
        Progression.playCutscene('Religious', function () {
          showScreen('screen-home');
          if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') window.HomeFlow.reset();
        }, { preview: true });
      }
    });

    var expBtn = document.getElementById('bypass-play-exploration');
    if (expBtn) expBtn.addEventListener('click', function () {
      if (typeof Progression !== 'undefined') {
        close();
        Progression.playCutscene('Exploration', function () {
          showScreen('screen-home');
          if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') window.HomeFlow.reset();
        }, { preview: true });
      }
    });

    var montageBtn = document.getElementById('bypass-play-montage');
    if (montageBtn) montageBtn.addEventListener('click', function () {
      if (typeof Progression !== 'undefined') {
        close();
        Progression.playMontage(function () {
          showScreen('screen-home');
          if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') window.HomeFlow.reset();
        }, { preview: true });
      }
    });

    var resetProgBtn = document.getElementById('bypass-reset-progress');
    if (resetProgBtn) resetProgBtn.addEventListener('click', function () {
      localStorage.removeItem('sog_serf_wins');
      localStorage.removeItem('sog_giant_wins');
      localStorage.removeItem('sog_religious_unlocked');
      localStorage.removeItem('sog_exploration_unlocked');
      localStorage.removeItem('sog_religious_cutscene_seen');
      localStorage.removeItem('sog_exploration_cutscene_seen');
      localStorage.removeItem('sog_total_wins');
      localStorage.removeItem('sog_victory_montage_seen');
      window._pendingUnlock = null;
      window._pendingMontage = null;
      showBypassToast('All progression reset — reload to see changes in deck builder');
    });

    /* Feedback Controls */
    var resetFbBtn = document.getElementById('bypass-reset-feedback');
    if (resetFbBtn) resetFbBtn.addEventListener('click', function () {
      if (window.Feedback) window.Feedback.resetOffer();
      refreshFeedbackBypassState();
      showBypassToast('Feedback popup reset — it shows again on the next first Gilgamesh Serf win');
    });

    /* Location checkboxes */
    document.querySelectorAll('.bypass-loc-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        onLocCheckChange(cb);
      });
    });

    var clearLocBtn = document.getElementById('bypass-loc-clear');
    if (clearLocBtn) clearLocBtn.addEventListener('click', clearForcedLocations);

  }

  /* ── Bootstrap ───────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }

  window.BypassMenu = { open: open, close: close };

})();


/* ══════════════════════════════════════════════════════════════════
   BypassAuth — access gate for the teacher bypass menu.
   Triple-click on the title lands here: a signed-in teacher (or a trusted
   local host) goes straight into the menu; anyone else sees a brief
   "teacher account required" notice that closes itself. No password — the
   old client-side one was readable in View Source.
   Exposes: window.BypassAuth.prompt()
══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _deniedTimer = null;

  function el(id) { return document.getElementById(id); }

  function allowed() {
    return !!(window.TeacherDashboard && typeof window.TeacherDashboard.devToolsAllowed === 'function'
              && window.TeacherDashboard.devToolsAllowed());
  }

  /* ── Entry point ───────────────────────────────────────────────── */
  function prompt() {
    if (allowed()) {
      dismissNotice();
      if (window.BypassMenu) window.BypassMenu.open();
      return;
    }
    showNotice();
  }

  /* ── Denied notice ─────────────────────────────────────────────── */
  function showNotice() {
    var backdrop = el('bypass-pw-backdrop');
    var msg      = el('bypass-pw-msg');
    if (!backdrop) return;
    clearTimeout(_deniedTimer);
    if (msg) {
      msg.textContent = 'Teacher account required — sign in to open this menu.';
      msg.className   = 'bypass-pw-msg bypass-pw-denied';
    }
    backdrop.style.display = 'flex';
    _deniedTimer = setTimeout(dismissNotice, 2200);
  }

  function dismissNotice() {
    var backdrop = el('bypass-pw-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    clearTimeout(_deniedTimer);
  }

  /* ── Bind events once DOM is ready ────────────────────────────── */
  function bindAuth() {
    var backdrop = el('bypass-pw-backdrop');
    if (!backdrop) return;
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) dismissNotice(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.style.display !== 'none') dismissNotice();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAuth);
  } else {
    bindAuth();
  }

  window.BypassAuth = { prompt: prompt };

})();

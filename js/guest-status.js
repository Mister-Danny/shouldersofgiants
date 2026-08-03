/**
 * guest-status.js — First-launch guest notice modal (AUTH_SPEC.md Phase 2)
 * + live corner-strip auth status (AUTH_SPEC.md Phase 3)
 *
 * The modal is pure UI + localStorage — deliberately independent of whether
 * js/auth.js's anonymous sign-in actually succeeds, so its messaging stays
 * correct even if Firebase is blocked, offline, or unreachable (mirrors
 * js/welcome.js's existing first-load-modal pattern).
 *
 * The persistent corner strip (#guest-status-strip) DOES depend on
 * window.SogAuth: it reads the current user via SogAuth.ready()/onChange()
 * and shows "Guest" for an anonymous session or the student's username (the
 * part of their synthetic email before @sog.invalid) once linked — updating
 * live the moment signup/login completes, not just on page load. The
 * account-creation affordance itself lives on the home screen (js/home.js).
 */
(function () {
  'use strict';

  var NOTICE_SEEN_KEY = 'sog_guest_notice_seen';
  var EMAIL_DOMAIN    = '@sog.invalid';   // must match js/account.js's synthetic-email suffix

  function showGuestModalNow() {
    var backdrop = document.getElementById('guest-notice-backdrop');
    var btn      = document.getElementById('guest-notice-dismiss');
    if (!backdrop || !btn) return;

    backdrop.classList.add('visible');

    function dismiss() {
      try { localStorage.setItem(NOTICE_SEEN_KEY, 'true'); } catch (e) {}
      backdrop.classList.remove('visible');
      btn.removeEventListener('click', dismiss);
    }

    btn.addEventListener('click', dismiss);
  }

  function initModal() {
    try {
      if (localStorage.getItem(NOTICE_SEEN_KEY) === 'true') return;
    } catch (e) {
      // localStorage blocked — fall through and show it anyway.
    }

    // Don't stack on top of the "Before You Begin" welcome popup — if it's
    // currently showing, wait for it to be dismissed first.
    var welcomeBackdrop = document.getElementById('welcome-backdrop');
    if (welcomeBackdrop && welcomeBackdrop.classList.contains('visible')) {
      var welcomeDismissBtn = document.getElementById('welcome-dismiss');
      if (welcomeDismissBtn) {
        welcomeDismissBtn.addEventListener('click', function onWelcomeDismiss() {
          welcomeDismissBtn.removeEventListener('click', onWelcomeDismiss);
          showGuestModalNow();
        });
        return;
      }
    }
    showGuestModalNow();
  }

  /* ── Corner strip: live auth status ──────────────────────────────────── */
  function _usernameFromUser(user) {
    if (!user || user.isAnonymous || !user.email) return null;
    var i = user.email.indexOf(EMAIL_DOMAIN);
    return i > 0 ? user.email.slice(0, i) : user.email;
  }

  function _renderCornerStrip(user) {
    var textEl = document.querySelector('#guest-status-strip .guest-status-text');
    if (!textEl) return;
    textEl.textContent = _usernameFromUser(user) || 'Guest';
  }

  function initCornerStrip() {
    if (!window.SogAuth) return;   // Firebase blocked/missing — strip keeps its static "Guest" markup
    window.SogAuth.ready(_renderCornerStrip);
    window.SogAuth.onChange(_renderCornerStrip);
  }

  function init() {
    initModal();
    initCornerStrip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

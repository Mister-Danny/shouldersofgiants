/**
 * guest-status.js — First-launch guest notice modal (AUTH_SPEC.md Phase 2)
 *
 * Pure UI + localStorage — deliberately independent of whether js/auth.js's
 * anonymous sign-in actually succeeds. Every visitor is a device-only guest
 * from this file's point of view regardless of Firebase's state, so the
 * messaging here stays correct even if Firebase is blocked, offline, or
 * unreachable (mirrors js/welcome.js's existing first-load-modal pattern).
 *
 * The persistent corner strip (#guest-status-strip) is a static "Guest" text
 * badge — no interactivity, no JS needed for it. The account-creation
 * affordance lives on the home screen instead (see js/home.js).
 */
(function () {
  'use strict';

  var NOTICE_SEEN_KEY = 'sog_guest_notice_seen';

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModal);
  } else {
    initModal();
  }
})();

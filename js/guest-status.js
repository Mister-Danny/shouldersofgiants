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
 * and shows "Guest" for an anonymous session, the student's username (the
 * part of their synthetic email before @sog.invalid) once linked, or a
 * teacher's chosen display name (from window.TeacherDashboard's cached
 * /teachers/{uid} doc, via onStatusChange()) — updating live the moment
 * signup/login completes, not just on page load. The account-creation
 * affordance itself lives on the home screen (js/home.js).
 *
 * A teacher's real email must NEVER reach this element (or any other UI
 * text) — teachers may demo the game on a projector. A real (non-synthetic)
 * email only ever means a teacher account (students always get
 * username@sog.invalid), so _deriveDisplayText below falls back to the
 * generic label "Teacher" rather than the email whenever a display name
 * isn't available yet or isn't set.
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

  // Students only — a synthetic username@sog.invalid address. Returns null
  // for anything else (an anonymous user with no email, or a teacher's real
  // email), which callers must NOT fall back to showing verbatim.
  function _studentUsernameFromEmail(email) {
    if (!email) return null;
    var i = email.indexOf(EMAIL_DOMAIN);
    return i > 0 ? email.slice(0, i) : null;
  }

  function _deriveDisplayText(user) {
    if (!user || user.isAnonymous) return 'Guest';

    var studentUsername = _studentUsernameFromEmail(user.email);
    if (studentUsername) return studentUsername;

    // Not the synthetic domain → a teacher account (the only other kind
    // real signup ever creates). Never surface user.email itself here —
    // only the display name they chose at signup, or a generic fallback
    // while that's still loading / if it's somehow unset.
    var teacherDoc = window.TeacherDashboard && typeof window.TeacherDashboard.getTeacherDoc === 'function'
      ? window.TeacherDashboard.getTeacherDoc() : null;
    return (teacherDoc && teacherDoc.displayName) || 'Teacher';
  }

  function _renderCornerStrip(user) {
    var textEl = document.querySelector('#guest-status-strip .guest-status-text');
    if (!textEl) return;
    textEl.textContent = _deriveDisplayText(user);
  }

  function initCornerStrip() {
    if (!window.SogAuth) return;   // Firebase blocked/missing — strip keeps its static "Guest" markup
    window.SogAuth.ready(_renderCornerStrip);
    window.SogAuth.onChange(_renderCornerStrip);
    // Re-render once the teacher-doc check resolves (or changes) — at the
    // moment SogAuth fires above, window.TeacherDashboard's own async
    // /teachers/{uid} lookup may not have settled yet, so this is what
    // actually reveals the display name instead of the "Teacher" fallback.
    if (window.TeacherDashboard && typeof window.TeacherDashboard.onStatusChange === 'function') {
      window.TeacherDashboard.onStatusChange(function () {
        _renderCornerStrip(window.SogAuth.getUser());
      });
    }
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

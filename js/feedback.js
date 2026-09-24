/**
 * feedback.js
 * The player feedback form: a one-time popup, and a home-screen Feedback button.
 *
 *   sog_feedback_form_offered   "true" once the popup has been shown. It is
 *                               never shown again on this device. Logout's
 *                               keep-list (js/account.js) does not preserve it,
 *                               so on a shared device the next player gets their
 *                               own ask.
 *
 * THE POPUP — a caller picks the moment and hands over what happens next:
 *   Feedback.offerOnce(onContinue)
 * The only caller today is the Gilgamesh battle, on leaving the result screen of
 * the player's first Serf win (js/sog-adventure-gilgamesh.js) — the first point
 * every Adventure player reaches. Both popup buttons carry on to onContinue; the
 * form opens in a new tab. If the popup was already offered, onContinue runs at
 * once. The module itself knows nothing about battles, so a future trigger is
 * just another offerOnce call.
 *
 * THE END-OF-CONTENT POPUP — a second, separately-worded popup for the player who
 * has beaten the LAST boss that exists so far (js/overworld.js decides the moment
 * and owns its once-only flag, sog_end_of_content_seen, which rides in the save
 * snapshot). It congratulates them, says more is being built, and asks for the
 * form as the biggest help they can give — with the link itself shown and
 * clickable. Text lives in END_OF_CONTENT_TEXT below; edit it there.
 *   Feedback.showEndOfContent(onContinue)
 *
 * THE HOME BUTTON — shown on the home menu to everyone, guests included, at any
 * progress. The one-time popup only reaches players who have not yet beaten
 * Gilgamesh, so a guest past that point would otherwise have no way to the form.
 * The single exception is a brand-new guest's first-visit funnel ("I'm Ready"
 * plus the account button), which stays uncluttered; a signed-in account on that
 * screen is a returning student who logged out and back in, so it shows for them.
 * js/home.js's applyVisitState() decides when the home menu is on screen and
 * calls refreshHomeButton(), so the button follows the account button's
 * lifecycle, including every sign-in and sign-out.
 *
 * Replaces the old three-match counter (sog_completed_matches /
 * sog_feedback_prompt_seen), which only counted Arcadium and Multiplayer matches
 * on the standard result screen — a path Adventure players never reach.
 */
(function () {
  'use strict';

  var OFFERED_KEY = 'sog_feedback_form_offered';
  var FORM_URL    = 'https://docs.google.com/forms/d/e/1FAIpQLSfSBd4cMeFjQZce1NX86leaLkAofRECZJBjh3gbDbhOcAuxRg/viewform?usp=dialog';

  /* END-OF-CONTENT POPUP TEXT — edit freely. `title` is the big gold heading,
     `subhead` the italic line under it, `paragraphs` the body (each entry is one
     paragraph, in order). The form link is rendered after the last paragraph as
     the URL itself, clickable, opening in a new tab. Plain text only — it is set
     via textContent, so no HTML. */
  var END_OF_CONTENT_TEXT = {
    title:   'Congratulations!',
    subhead: "You've reached the end... for now",
    paragraphs: [
      "You've beaten every challenge in Shoulders of Giants that exists so far. That is a serious achievement.",
      'More civilizations are being built right now, and they will appear on your map as they are finished.',
      'The biggest help you can give us is to fill out the feedback form. It only takes a few minutes, and what you tell us shapes what gets built next:'
    ]
  };

  var _pendingContinue = null;   // what offerOnce's caller wants to happen next

  // ── Once-only flag ───────────────────────────────────────────
  function isOffered() {
    try { return localStorage.getItem(OFFERED_KEY) === 'true'; } catch (e) { return false; }
  }
  function markOffered() { try { localStorage.setItem(OFFERED_KEY, 'true'); } catch (e) {} }
  function resetOffer()  { try { localStorage.removeItem(OFFERED_KEY); } catch (e) {} }

  // ── Popup ────────────────────────────────────────────────────
  function getBackdrop() { return document.getElementById('feedback-backdrop'); }

  /**
   * Show the feedback popup if it has never been offered, then run onContinue
   * when the player answers. Returns true if the popup is now showing, false if
   * onContinue ran straight away (already offered, or the markup is missing).
   * The flag is set the moment the popup SHOWS, so it is shown at most once
   * even if the tab closes while it is open.
   */
  function offerOnce(onContinue) {
    var go = (typeof onContinue === 'function') ? onContinue : function () {};
    var bd = getBackdrop();
    if (isOffered() || !bd) { go(); return false; }
    markOffered();
    _pendingContinue = go;
    bd.classList.add('visible');
    return true;
  }

  function _answer(openForm) {
    // window.open runs synchronously inside the click so popup blockers allow it.
    if (openForm) window.open(FORM_URL, '_blank', 'noopener,noreferrer');
    var bd = getBackdrop();
    if (bd) bd.classList.remove('visible');
    var go = _pendingContinue;
    _pendingContinue = null;
    if (go) go();
  }

  // ── End-of-content popup ─────────────────────────────────────
  function getEndBackdrop() { return document.getElementById('endgame-backdrop'); }

  /* Fill the popup from END_OF_CONTENT_TEXT every time it shows, so an edit to
     the constant is the only edit needed. Built with textContent, never
     innerHTML. */
  function _renderEndOfContent() {
    var t = END_OF_CONTENT_TEXT;
    var titleEl = document.getElementById('endgame-title');
    var bodyEl  = document.getElementById('endgame-body');
    if (titleEl) {
      titleEl.textContent = '';
      titleEl.appendChild(document.createTextNode(t.title || ''));
      if (t.subhead) {
        titleEl.appendChild(document.createElement('br'));
        var sub = document.createElement('span');
        sub.className = 'feedback-subhead';
        sub.textContent = t.subhead;
        titleEl.appendChild(sub);
      }
    }
    if (bodyEl) {
      bodyEl.textContent = '';
      (t.paragraphs || []).forEach(function (txt) {
        var p = document.createElement('p');
        p.textContent = txt;
        bodyEl.appendChild(p);
      });
      var a = document.createElement('a');
      a.className = 'endgame-link';
      a.href = FORM_URL;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = FORM_URL;
      bodyEl.appendChild(a);
    }
  }

  /**
   * Show the end-of-content popup, then run onContinue when the player answers.
   * NOT once-only here: the caller (js/overworld.js) owns the flag and the
   * moment. Returns true if the popup is showing, false if onContinue ran at
   * once (markup missing).
   */
  function showEndOfContent(onContinue) {
    var go = (typeof onContinue === 'function') ? onContinue : function () {};
    var bd = getEndBackdrop();
    if (!bd) { go(); return false; }
    _renderEndOfContent();
    _pendingContinue = go;
    bd.classList.add('visible');
    return true;
  }

  function _answerEnd(openForm) {
    if (openForm) window.open(FORM_URL, '_blank', 'noopener,noreferrer');
    var bd = getEndBackdrop();
    if (bd) bd.classList.remove('visible');
    var go = _pendingContinue;
    _pendingContinue = null;
    if (go) go();
  }

  // ── Home-screen Feedback button ──────────────────────────────
  function isAccountSignedIn() {
    var user = (window.SogAuth && typeof window.SogAuth.getUser === 'function')
      ? window.SogAuth.getUser() : null;
    return !!(user && user.isAnonymous === false);
  }
  /* Every caller gets the same answer: the visit state is read from HomeFlow, not
     passed in, so feedback.js's own load-time call (which runs after home.js has
     already laid out the funnel) cannot un-hide the button there. */
  function refreshHomeButton() {
    var btn = document.getElementById('btn-home-feedback');
    if (!btn) return;
    var firstVisit = !!(window.HomeFlow && typeof window.HomeFlow.isFirstVisit === 'function'
                        && window.HomeFlow.isFirstVisit());
    btn.style.display = (!firstVisit || isAccountSignedIn()) ? '' : 'none';
  }
  function openForm() {
    window.open(FORM_URL, '_blank', 'noopener,noreferrer');
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    var btnForm     = document.getElementById('feedback-form-btn');
    var btnContinue = document.getElementById('feedback-continue-btn');
    var btnHomeNav  = document.getElementById('btn-home-feedback');

    if (btnForm)     btnForm.addEventListener('click', function () { _answer(true); });
    if (btnContinue) btnContinue.addEventListener('click', function () { _answer(false); });
    if (btnHomeNav)  btnHomeNav.addEventListener('click', openForm);

    var btnEndForm     = document.getElementById('endgame-form-btn');
    var btnEndContinue = document.getElementById('endgame-continue-btn');
    if (btnEndForm)     btnEndForm.addEventListener('click', function () { _answerEnd(true); });
    if (btnEndContinue) btnEndContinue.addEventListener('click', function () { _answerEnd(false); });

    // Clicking the backdrop outside the panel does NOT dismiss — the player
    // answers with one of the two buttons, and either one carries on.

    refreshHomeButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Feedback = {
    offerOnce:         offerOnce,
    showEndOfContent:  showEndOfContent,
    refreshHomeButton: refreshHomeButton,
    isOffered:         isOffered,
    resetOffer:        resetOffer,
    FORM_URL:          FORM_URL
  };
})();

/**
 * notice.js — a one-off message for a single player.
 *
 * Reads /notices/{uid} for the signed-in player (anonymous guests included, since
 * a guest's uid is stable in their browser) and, if there is one, shows it once
 * on the home screen with a single button that opens a link.
 *
 * The doc id IS the uid, so a player can only ever read their own — the rules
 * deny list, so the collection cannot be walked, and deny every write, so the
 * doc is created from the Firebase console, never by the game.
 *
 *   /notices/{uid}
 *     id          string   changing it lets the same player be shown a NEW
 *                          message later; the seen-flag is keyed on it
 *     active      bool     false parks a message without deleting it
 *     title       string   heading
 *     body        string   one or more paragraphs, split on a blank line
 *     buttonLabel string   the action button's text
 *     buttonUrl   string   https:// only — opened in a new tab
 *
 *   sog_notice_seen   the id of the last message shown on this device.
 *
 * Text is written with textContent and the URL is scheme-checked, so a message
 * can never inject markup or a javascript: link into the page.
 *
 * Exposes: window.SogNotice
 */
window.SogNotice = (function () {
  'use strict';

  var SEEN_KEY = 'sog_notice_seen';
  var READ_TIMEOUT_MS = 8000;

  function _seen() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; }
  }
  function _markSeen(id) {
    try { localStorage.setItem(SEEN_KEY, id); } catch (e) {}
  }

  // A message is only worth showing if it has something to say and has not been
  // shown here before. Anything malformed is ignored rather than half-rendered.
  function shouldShow(data, seenId) {
    if (!data || data.active !== true) return false;
    if (typeof data.id !== 'string' || !data.id) return false;
    if (typeof data.body !== 'string' || !data.body.trim()) return false;
    if (data.id === seenId) return false;
    return true;
  }

  // Only a real https link is ever opened: a notice is data from the database,
  // not code, and javascript:/data: URLs must never come back out of it.
  function safeUrl(url) {
    return (typeof url === 'string' && /^https:\/\//i.test(url)) ? url : '';
  }

  function _render(data) {
    var bd = document.getElementById('notice-backdrop');
    if (!bd) return false;
    var titleEl = document.getElementById('notice-title');
    var bodyEl = document.getElementById('notice-body');
    var btn = document.getElementById('notice-action');
    var close = document.getElementById('notice-dismiss');
    if (!titleEl || !bodyEl || !btn || !close) return false;

    titleEl.textContent = (typeof data.title === 'string' && data.title) ? data.title : 'A MESSAGE FOR YOU';
    bodyEl.innerHTML = '';
    String(data.body).split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.textContent = para.trim();   // never innerHTML: this is database content
      bodyEl.appendChild(p);
    });

    var url = safeUrl(data.buttonUrl);
    if (url) {
      btn.textContent = (typeof data.buttonLabel === 'string' && data.buttonLabel) ? data.buttonLabel : 'OPEN';
      btn.style.display = '';
      btn.onclick = function () {
        window.open(url, '_blank', 'noopener,noreferrer');
        bd.classList.remove('visible');
      };
    } else {
      btn.style.display = 'none';   // a message with no link still gets its OK button
    }
    close.onclick = function () { bd.classList.remove('visible'); };
    bd.classList.add('visible');
    return true;
  }

  // Never stack on another popup (the guest welcome, a feedback ask). Waits for
  // a clear screen, and gives up for this visit rather than interrupting —
  // the message is still unseen, so the next boot tries again.
  var WAIT_STEP_MS = 500;
  var WAIT_TRIES = 60;   // ~30s

  function _somethingElseIsOpen() {
    var open = document.querySelectorAll('.guest-modal-backdrop.visible, .card-popup-backdrop.visible, #account-flow-backdrop.visible');
    for (var i = 0; i < open.length; i++) {
      if (open[i].id !== 'notice-backdrop') return true;
    }
    return false;
  }

  function _showWhenClear(data, done, tries) {
    if (!_somethingElseIsOpen()) {
      _markSeen(data.id);   // set as it SHOWS, so a closed tab doesn't re-show it
      done(_render(data));
      return;
    }
    if ((tries || 0) >= WAIT_TRIES) { done(false); return; }
    setTimeout(function () { _showWhenClear(data, done, (tries || 0) + 1); }, WAIT_STEP_MS);
  }

  function _db() { return firebase.firestore(); }

  function _withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  /**
   * Looks for a message for the current player and shows it. Silent when there
   * is nothing to show, when offline, or when the read is denied — a notice is
   * never important enough to interrupt a boot.
   */
  function check(cb) {
    var done = typeof cb === 'function' ? cb : function () {};
    var user = (window.SogAuth && typeof window.SogAuth.getUser === 'function') ? window.SogAuth.getUser() : null;
    if (!user || !user.uid || !window.firebase || !firebase.apps.length) { done(false); return; }

    _withTimeout(_db().collection('notices').doc(user.uid).get(), READ_TIMEOUT_MS).then(function (snap) {
      if (!snap.exists) { done(false); return; }
      var data = snap.data();
      if (!shouldShow(data, _seen())) { done(false); return; }
      _showWhenClear(data, done, 0);
    }).catch(function () {
      done(false);   // offline, denied, or slow — nothing to do
    });
  }

  function init() {
    if (!window.SogAuth || typeof window.SogAuth.ready !== 'function') return;
    window.SogAuth.ready(function () { check(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    init: init,
    check: check,
    shouldShow: shouldShow,   // exported for tests
    safeUrl: safeUrl,
  };
})();

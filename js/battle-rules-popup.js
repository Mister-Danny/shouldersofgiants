/**
 * battle-rules-popup.js
 * Reusable "battle rules" popup for Adventure-mode battles (Gilgamesh, and
 * future Sargon / Hammurabi / etc.). Each battle module passes its own rules
 * content; the visual treatment (card-popup dimensions, gold/parchment tint,
 * X + click-outside dismiss) is shared.
 *
 *   SOG.BattleRulesPopup.show({ title, body, onDismiss })
 *     title    {string}            — centered header
 *     body     {string|string[]}   — HTML string, or array of bullet strings
 *     onDismiss{function}          — called once when the popup closes
 *   SOG.BattleRulesPopup.hide()    — close programmatically
 *   SOG.BattleRulesPopup.isOpen()
 */
window.SOG = window.SOG || {};
SOG.BattleRulesPopup = (function () {
  'use strict';

  var BACKDROP_ID = 'battle-rules-backdrop';
  var _onDismiss  = null;

  function isOpen() {
    var el = document.getElementById(BACKDROP_ID);
    return !!(el && el.classList.contains('visible'));
  }

  function hide() {
    var el = document.getElementById(BACKDROP_ID);
    if (el) el.classList.remove('visible');
    var cb = _onDismiss;
    _onDismiss = null;
    // Remove after the fade transition.
    if (el) setTimeout(function () { if (el.parentNode && !el.classList.contains('visible')) el.parentNode.removeChild(el); }, 200);
    if (cb) cb();
  }

  function _buildBodyHTML(body) {
    if (Array.isArray(body)) {
      return '<ul class="rules-popup-list">' +
        body.map(function (line) { return '<li>' + line + '</li>'; }).join('') +
        '</ul>';
    }
    return '<div class="rules-popup-prose">' + (body || '') + '</div>';
  }

  function show(opts) {
    opts = opts || {};
    hide();                       // close any existing instance (no dismiss cb)
    _onDismiss = opts.onDismiss || null;

    var backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.className = 'popup-backdrop rules-popup-backdrop';

    var panel = document.createElement('div');
    panel.className = 'card-popup rules-popup' + (opts.panelClass ? ' ' + opts.panelClass : '');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-x';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&#x2715;';

    var titleEl = document.createElement('div');
    titleEl.className = 'rules-popup-title';
    titleEl.textContent = opts.title || 'Battle Rules';

    var bodyEl = document.createElement('div');
    bodyEl.className = 'rules-popup-body';
    bodyEl.innerHTML = _buildBodyHTML(opts.body);

    panel.appendChild(closeBtn);
    panel.appendChild(titleEl);
    panel.appendChild(bodyEl);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // Dismiss: X button, or click outside the panel (mirrors the card popup).
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) hide(); });

    // Force reflow then add .visible so the CSS fade/scale transition runs.
    void backdrop.offsetHeight;
    backdrop.classList.add('visible');
  }

  return { show: show, hide: hide, isOpen: isOpen };
})();

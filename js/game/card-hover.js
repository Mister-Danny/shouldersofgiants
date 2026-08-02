/**
 * card-hover.js — SOG.cardHover: the hover card-info panel for HAND cards.
 *
 * WHY THIS EXISTS
 * Reading a card's ability used to cost two clicks (click to open the modal,
 * click again to dismiss). Hovering a hand card now shows the same information
 * immediately; starting to play the card dismisses it.
 *
 * NON-MODAL BY DESIGN — this is the whole trick. The click-to-open popup
 * (#battle-popup-backdrop) is a real modal: a dimming backdrop with
 * pointer-events:all. Reusing THAT on hover flicker-loops, because the backdrop
 * covers the very card you're hovering, so mouseleave fires the instant it opens.
 * So this panel:
 *   • has NO backdrop (the board stays readable),
 *   • is pointer-events:none end-to-end (it can never steal the cursor, so hover
 *     state stays on the card and drag-to-play passes straight through),
 *   • is positioned ABOVE the hovered card rather than screen-centre.
 * It is otherwise the SAME panel: same dark-wood/bronze treatment, same content,
 * rendered by the same SOG.ui.fillPopupContent the modal uses (one code path, so
 * the two surfaces can't drift), just scaled down since it sits near the card.
 *
 * SCOPE — HAND CARDS ONLY. Cards already in play keep click-to-open: their popup
 * carries the live IP breakdown, which is a "stop and study it" surface, not a
 * glance. Board slots are untouched by this module.
 *
 * STAGE COORDINATES — #sog-stage is a fixed 1280x720 box that sog-stage.js scales
 * with a CSS transform. The panel is appended INSIDE the stage and positioned in
 * unscaled stage units, so it tracks the card at any window size. Screen-space
 * rects from getBoundingClientRect are converted via _toStage().
 *
 * SETTING — Settings ▸ Gameplay ▸ "Card info on hover" (default ON). Turning it
 * off restores the original click-to-open behaviour for hand cards exactly;
 * input.js reads isEnabled() to decide which path to run.
 */
window.SOG = window.SOG || {};
SOG.cardHover = (function () {
  'use strict';

  var STORAGE_KEY = 'sog_card_hover_info';   // 'false' disables; absent/anything else = ON
  var PANEL_ID    = 'battle-hover-popup';
  var SHOW_DELAY_MS = 90;    // brief settle so sweeping across the hand doesn't strobe
  var GAP_PX        = 14;    // stage-units between the panel's bottom and the card's top
  var EDGE_PAD_PX   = 10;    // keep the panel this far inside the stage edges

  var STAGE_W = 1280, STAGE_H = 720;

  var _panel = null, _els = null, _showTimer = null, _anchorEl = null;
  var _suppressed = false;   // set while a play gesture is in flight (drag / hold)

  /* ── Setting ─────────────────────────────────────────────────────────── */
  function isEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false'); } catch (e) {}
    if (!on) hide();
  }

  /* Pointer that can actually hover (mouse/trackpad). Touch-only devices never
     get the hover path — they keep click-to-open, which is the only thing that
     works there. */
  function _canHover() {
    try { return window.matchMedia && window.matchMedia('(hover: hover)').matches; }
    catch (e) { return true; }
  }

  /* ── Panel construction (lazy; mirrors index.html's #battle-popup markup) ── */
  function _stage() { return document.getElementById('sog-stage') || document.body; }

  function _build() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.id = PANEL_ID;
    _panel.className = 'card-popup hover-popup';
    _panel.setAttribute('aria-hidden', 'true');
    _panel.innerHTML =
      '<div class="popup-header-row">' +
        '<span class="popup-card-name" data-el="name"></span>' +
        '<span class="popup-card-type" data-el="type"></span>' +
      '</div>' +
      '<div class="popup-divider"></div>' +
      '<div class="popup-ability-name" data-el="abilName"></div>' +
      '<div class="popup-ability-text" data-el="abilText"></div>' +
      '<div class="popup-divider"></div>' +
      '<div class="popup-footer-row">' +
        '<div class="popup-ip-breakdown" data-el="ipBrk" style="display:none"></div>' +
        '<span class="popup-hint" data-el="hint"></span>' +
      '</div>' +
      '<div class="hover-popup-tail" aria-hidden="true"></div>';
    _stage().appendChild(_panel);
    _els = {
      name:     _panel.querySelector('[data-el="name"]'),
      type:     _panel.querySelector('[data-el="type"]'),
      abilName: _panel.querySelector('[data-el="abilName"]'),
      abilText: _panel.querySelector('[data-el="abilText"]'),
      ipBrk:    _panel.querySelector('[data-el="ipBrk"]'),
      hint:     _panel.querySelector('[data-el="hint"]')
    };
    return _panel;
  }

  /* Screen-space rect → unscaled stage coordinates. */
  function _toStage(rect) {
    var st = _stage().getBoundingClientRect();
    var scale = st.width ? (st.width / STAGE_W) : 1;
    if (!scale) scale = 1;
    return {
      left:   (rect.left   - st.left) / scale,
      top:    (rect.top    - st.top)  / scale,
      width:  rect.width  / scale,
      height: rect.height / scale
    };
  }

  /* Park the panel above the anchor card, centred on it, clamped to the stage. */
  function _position(anchorEl) {
    if (!_panel || !anchorEl) return;
    var card = _toStage(anchorEl.getBoundingClientRect());
    // Measure in stage units (offsetWidth/Height are unaffected by the transform).
    var pw = _panel.offsetWidth, ph = _panel.offsetHeight;

    var left = card.left + (card.width / 2) - (pw / 2);
    left = Math.max(EDGE_PAD_PX, Math.min(left, STAGE_W - pw - EDGE_PAD_PX));

    var top = card.top - ph - GAP_PX;
    var below = false;
    if (top < EDGE_PAD_PX) {           // not enough room above → flip below the card
      top = card.top + card.height + GAP_PX;
      below = true;
      if (top + ph > STAGE_H - EDGE_PAD_PX) top = Math.max(EDGE_PAD_PX, STAGE_H - ph - EDGE_PAD_PX);
    }
    _panel.classList.toggle('is-below', below);

    // Tail sits under the card's centre even when the panel was clamped sideways.
    var tailX = card.left + (card.width / 2) - left;
    tailX = Math.max(16, Math.min(tailX, pw - 16));
    _panel.style.setProperty('--hover-tail-x', tailX + 'px');

    _panel.style.left = left + 'px';
    _panel.style.top  = top  + 'px';
  }

  /* ── Public API ──────────────────────────────────────────────────────── */

  /**
   * Show the hover panel for a card, anchored to its hand element.
   * @param {object} card     CARDS entry
   * @param {object} [sd]     synthetic slot data (input.js builds it)
   * @param {Element} anchorEl the .battle-hand-card element being hovered
   */
  function show(card, sd, anchorEl) {
    if (!isEnabled() || !_canHover() || _suppressed || !card || !anchorEl) return;
    // Never compete with the modal, the tutorial's scripted popups, or boss dialogue.
    if (window.tutorialActive) return;
    var modal = document.getElementById('battle-popup-backdrop');
    if (modal && modal.classList.contains('visible')) return;
    if (!SOG.ui || typeof SOG.ui.fillPopupContent !== 'function') return;

    _anchorEl = anchorEl;
    if (_showTimer) clearTimeout(_showTimer);
    _showTimer = setTimeout(function () {
      _showTimer = null;
      // The cursor may have left during the settle delay.
      if (_anchorEl !== anchorEl || !anchorEl.isConnected) return;
      _build();
      // Same arguments the MODAL uses for a hand card (input.js builds the same sd),
      // so the two surfaces show identical content: name, type, ability, and the
      // live IP line. isBoard=false — this card is in hand, not on the board.
      SOG.ui.fillPopupContent(_els, card, sd, 'player', false);
      _panel.classList.add('visible');
      _position(anchorEl);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
    _anchorEl = null;
    if (_panel) _panel.classList.remove('visible');
  }

  /* Called on drag start / select-to-play so the panel can't reappear mid-gesture
     (the browser fires mouseenter again as the drag ghost detaches). Released on
     drag end / mouseleave. */
  function suppress()   { _suppressed = true;  hide(); }
  function unsuppress() { _suppressed = false; }

  /* Full teardown — battle exit / hand rebuild. */
  function destroy() {
    hide();
    _suppressed = false;
    if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
    _panel = null; _els = null;
  }

  return {
    isEnabled:  isEnabled,
    setEnabled: setEnabled,
    show:       show,
    hide:       hide,
    suppress:   suppress,
    unsuppress: unsuppress,
    destroy:    destroy,
    STORAGE_KEY: STORAGE_KEY
  };
})();

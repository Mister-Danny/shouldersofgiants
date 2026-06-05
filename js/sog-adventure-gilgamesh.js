/**
 * sog-adventure-gilgamesh.js
 * Phase D2b — Gilgamesh battle stub.
 *
 * Exposes SOG.GilgameshBattle.start().
 * Displays a placeholder screen with a "Back to Map" button that returns
 * the player to the Mesopotamia overworld with the Explorer at the Walls
 * of Uruk node position.
 *
 * Pattern matches the Phase 1 Otzi battle stub lessons:
 *   - Full DOM teardown on Back to Map (no leaking elements)
 *   - Unique container ID (#adv-gilgamesh-stub)
 *   - Returns Explorer to node coordinates (72, 82) on Mesopotamia map
 *   - sog_battle_gilgamesh_complete is NEVER set here — reserved for
 *     the real battle implementation in a future phase.
 */

window.SOG           = window.SOG           || {};
window.SOG.Adventure = window.SOG.Adventure || {};

window.SOG.GilgameshBattle = (function () {
  'use strict';

  var CONTAINER_ID   = 'adv-gilgamesh-stub';
  var RETURN_MAP     = 'mesopotamia';
  var RETURN_POS     = { x: 68, y: 78 };  // near the Walls of Uruk, clear of edge

  /* ── Teardown ──────────────────────────────────────────────── */

  function _teardown() {
    var el = document.getElementById(CONTAINER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ── Back to Map ───────────────────────────────────────────── */

  function _exitToOverworld() {
    _teardown();

    // Restore the overworld screen — the overworld's in-memory state still
    // has currentMapId='mesopotamia' and currentPos at the Walls of Uruk.
    if (typeof showScreen === 'function') showScreen('screen-overworld');

    // Brief settle so the overworld finishes rendering, then re-engage idle.
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* ── Stub screen ───────────────────────────────────────────── */

  function _buildStub() {
    _teardown(); // defensive: remove any stale instance

    var el       = document.createElement('div');
    el.id        = CONTAINER_ID;
    el.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:#0d0a06',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:24px',
      'z-index:9999',
      'font-family:\'CT Galbite\',monospace'
    ].join(';');

    var title       = document.createElement('div');
    title.textContent = 'GILGAMESH';
    title.style.cssText = [
      'font-size:36px',
      'letter-spacing:0.14em',
      'color:#f8d000',
      'text-shadow:0 0 18px rgba(248,208,0,0.55)'
    ].join(';');

    var sub         = document.createElement('div');
    sub.textContent = 'King of Uruk';
    sub.style.cssText = [
      'font-size:16px',
      'letter-spacing:0.08em',
      'color:#bba060',
      'margin-top:-12px'
    ].join(';');

    var label       = document.createElement('div');
    label.textContent = 'Battle — coming in next phase';
    label.style.cssText = [
      'font-size:18px',
      'color:#888',
      'letter-spacing:0.06em',
      'margin-top:8px'
    ].join(';');

    var btn         = document.createElement('button');
    btn.textContent = 'Back to Map';
    btn.style.cssText = [
      'margin-top:16px',
      'padding:10px 28px',
      'background:transparent',
      'border:2px solid #f8d000',
      'color:#f8d000',
      'font-family:\'CT Galbite\',monospace',
      'font-size:16px',
      'letter-spacing:0.08em',
      'cursor:pointer',
      'border-radius:3px'
    ].join(';');
    btn.addEventListener('click', _exitToOverworld);

    el.appendChild(title);
    el.appendChild(sub);
    el.appendChild(label);
    el.appendChild(btn);
    document.body.appendChild(el);
  }

  /* ── Public API ────────────────────────────────────────────── */

  function start() {
    // The radial wipe already covers the overworld; we append the stub div
    // on top of everything (z-index 9999) without changing the screen state.
    _buildStub();
  }

  return {
    start: start
  };

})();

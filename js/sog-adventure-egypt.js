/**
 * sog-adventure-egypt.js
 * Shoulders of Giants — Adventure Mode: Egypt (stub)
 *
 * SOG.Egypt.start() renders a placeholder screen.
 * "Back to Map" tears it down and returns to the overworld.
 */

var SOG = window.SOG || {};

SOG.Egypt = (function () {
  'use strict';

  function log(msg) { console.log('[Egypt] ' + msg); }

  /* ── Entry point ─────────────────────────────────────────────── */
  function start() {
    log('start() — placeholder screen');

    // Clean up any previous instance
    var prev = document.getElementById('egypt-placeholder-screen');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    // Inject inside #sog-stage so it scales with the stage transform
    var stage = document.getElementById('sog-stage');
    if (!stage) {
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      return;
    }

    var screen = document.createElement('div');
    screen.id = 'egypt-placeholder-screen';
    screen.style.cssText = [
      'position:fixed;inset:0',
      'background:linear-gradient(180deg,#1a0a2e 0%,#0a0518 100%)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'z-index:8500;gap:32px'
    ].join(';');

    var heading = document.createElement('div');
    heading.style.cssText = [
      'font-family:\'CT Galbite\',monospace',
      'font-size:32px;letter-spacing:0.12em',
      'color:#f8d000;text-align:center'
    ].join(';');
    heading.textContent = 'Egypt';

    var subtext = document.createElement('div');
    subtext.style.cssText = [
      'font-family:\'Source Sans 3\',sans-serif',
      'font-size:20px;color:#aaa;text-align:center;letter-spacing:0.04em'
    ].join(';');
    subtext.textContent = 'Coming in the next phase…';

    var backBtn = document.createElement('button');
    backBtn.textContent = 'BACK TO MAP';
    backBtn.style.cssText = [
      'margin-top:16px',
      'padding:12px 32px',
      'font-family:\'CT Galbite\',monospace;font-size:16px;letter-spacing:0.08em',
      'background:#12004a;color:#fff',
      'border:2px solid #f8d000;cursor:pointer',
      'transition:background 0.15s'
    ].join(';');
    backBtn.addEventListener('mouseenter', function () { backBtn.style.background = '#1e0070'; });
    backBtn.addEventListener('mouseleave', function () { backBtn.style.background = '#12004a'; });
    backBtn.addEventListener('click', function () {
      screen.parentNode.removeChild(screen);
      log('Back to Map clicked — returning to overworld');
      if (typeof showScreen === 'function') showScreen('screen-overworld');
    });

    screen.appendChild(heading);
    screen.appendChild(subtext);
    screen.appendChild(backBtn);
    stage.appendChild(screen);
  }

  /* ── Public surface ──────────────────────────────────────────── */
  return {
    start: start
  };

})();

window.SOG = SOG;

/**
 * callouts.js — SOG.Callouts: the system-callout toolkit battles teach with.
 *
 * One look for instructions and explanations (the .snap-callout style: dark
 * slate, yellow edge, sans-serif — visibly not a character's speech bubble),
 * shared by the scripted Neanderthal battle (js/sog-adventure-prehistory.js)
 * and the Ötzi lessons (js/otzi-lessons.js). Future battles reuse it.
 *
 *   layer(id)                      an overlay layer inside #sog-stage (pointer-events none)
 *   rectIn(el | rect)              an element's box in stage coordinates (1280×720)
 *   callout(layer, text, anchor, place, opts)
 *                                  a callout pointing at `anchor` ('top' | 'bottom' |
 *                                  'left' | 'right'; no anchor = centred, no arrow).
 *                                  opts: sub (second line), tap ("Tap to continue"), cls
 *   place(el, anchor, place)       (re)position a callout
 *   svg(layer, markerId)           a stage-sized SVG with a yellow arrowhead marker
 *   arc(svg, x1, y1, x2, y2, opts) a raised arc with that arrowhead; opts: peakY |
 *                                  lift, label, labelAt {x,y}, markerId
 *   waitTap(done, hold)            one tap / click / Enter anywhere (capture phase,
 *                                  after 300 ms); hold(off) receives the cancel
 *   remove(el), fade(el)
 */
window.SOG = window.SOG || {};
window.SOG.Callouts = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function stage() { return document.getElementById('sog-stage'); }

  function layer(id) {
    var el = document.getElementById(id);
    if (!el) {
      var st = stage(); if (!st) return null;
      el = document.createElement('div');
      el.id = id;
      el.className = 'callout-layer';
      st.appendChild(el);
    }
    return el;
  }

  function rectIn(el) {
    if (!el) return null;
    if (typeof el.getBoundingClientRect !== 'function') return (typeof el.x === 'number') ? el : null;   // already a rect
    var st = stage(); if (!st) return null;
    var r = el.getBoundingClientRect(), s = st.getBoundingClientRect(), k = (s.width / 1280) || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  function place(el, anchor, where) {
    var a = rectIn(anchor), w = el.offsetWidth, h = el.offsetHeight, gap = 16, x, y;
    if (!a)                      { x = 640 - w / 2;          y = 320 - h / 2; }
    else if (where === 'bottom') { x = a.x + a.w / 2 - w / 2; y = a.y + a.h + gap; }
    else if (where === 'left')   { x = a.x - w - gap;         y = a.y + a.h / 2 - h / 2; }
    else if (where === 'right')  { x = a.x + a.w + gap;       y = a.y + a.h / 2 - h / 2; }
    else                         { x = a.x + a.w / 2 - w / 2; y = a.y - h - gap; }
    var cx = Math.max(8, Math.min(1280 - w - 8, x)), cy = Math.max(8, Math.min(720 - h - 8, y));
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    if (!a) { el.classList.add('snap-callout--free'); return; }
    // Keep the arrow on the anchor after clamping.
    if (where === 'left' || where === 'right') el.style.setProperty('--arrow-y', Math.max(14, Math.min(h - 14, a.y + a.h / 2 - cy)) + 'px');
    else el.style.setProperty('--arrow-x', Math.max(18, Math.min(w - 18, a.x + a.w / 2 - cx)) + 'px');
  }

  function callout(layerEl, text, anchor, where, opts) {
    opts = opts || {};
    if (!layerEl) return null;
    var el = document.createElement('div');
    el.className = 'snap-callout snap-callout--' + (where || 'top') + (opts.tap ? ' snap-callout--tap' : '') + (opts.cls ? ' ' + opts.cls : '');
    var t = document.createElement('div'); t.className = 'snap-callout-text'; t.textContent = text; el.appendChild(t);
    if (opts.sub) { var sb = document.createElement('div'); sb.className = 'snap-callout-sub'; sb.textContent = opts.sub; el.appendChild(sb); }
    if (opts.tap) { var tp = document.createElement('div'); tp.className = 'snap-callout-tap'; tp.textContent = 'Tap to continue ▸'; el.appendChild(tp); }
    layerEl.appendChild(el);
    place(el, anchor, where);
    return el;
  }

  function svg(layerEl, markerId) {
    if (!layerEl) return null;
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'snap-svg');
    s.setAttribute('viewBox', '0 0 1280 720');
    if (markerId) {
      var defs = document.createElementNS(NS, 'defs');
      defs.innerHTML = '<marker id="' + markerId + '" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f8d000"/></marker>';
      s.appendChild(defs);
    }
    layerEl.appendChild(s);
    return s;
  }

  function label(s, x, y, text) {
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('class', 'snap-arc-label');
    t.textContent = text;
    s.appendChild(t);
    return t;
  }

  function arc(s, x1, y1, x2, y2, opts) {
    opts = opts || {};
    var mx = (x1 + x2) / 2;
    var my = (opts.peakY != null) ? opts.peakY : Math.min(y1, y2) - (opts.lift || 40);
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2);
    p.setAttribute('class', 'snap-arc');
    if (opts.markerId) p.setAttribute('marker-end', 'url(#' + opts.markerId + ')');
    s.appendChild(p);
    if (opts.label) {
      var at = opts.labelAt || { x: mx, y: (Math.min(y1, y2) + my) / 2 };
      label(s, at.x, at.y, opts.label);
    }
    return p;
  }

  function waitTap(done, hold) {
    var fired = false, armed = true;
    var h = function (e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation();
      if (fired) return; fired = true;
      off(); done();
    };
    var off = function () {
      armed = false;
      document.removeEventListener('click', h, true);
      document.removeEventListener('keydown', h, true);
    };
    if (hold) hold(off);
    // Deferred so the tap that ended the previous beat doesn't also answer this one.
    setTimeout(function () {
      if (fired || !armed) return;
      document.addEventListener('click', h, true);
      document.addEventListener('keydown', h, true);
    }, 300);
    return off;
  }

  function remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
  function fade(el, ms) {
    if (!el || !el.parentNode) return;
    el.classList.add('callout-fading');
    setTimeout(function () { remove(el); }, ms || 350);
  }

  return { layer: layer, rectIn: rectIn, place: place, callout: callout, svg: svg, arc: arc,
           label: label, waitTap: waitTap, remove: remove, fade: fade };
})();

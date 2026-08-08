/* ══════════════════════════════════════════════════════════════════════════
   SoG Map Editor
   ══════════════════════════════════════════════════════════════════════════
   Local-only dev tool. Loads data/map-data.js, lets you drag nodes / draw walk
   paths / add nodes / create regions, and POSTs the result back to serve.js,
   which rewrites data/map-data.js.

   Modern JS on purpose: this never ships to a Chromebook, it runs in whatever
   browser the developer has open. The GAME code stays ES5; this does not.

   THE ONE INVARIANT: every coordinate is a percentage of the 1280×600 map
   container, identical to what the game stores. #stage is aspect-locked to
   1280:600 and the background uses the same object-fit:cover, so a position
   dragged here is the position rendered in-game. Nothing is converted on save.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ── State ────────────────────────────────────────────────────────────── */
let doc       = null;      // the whole SOG_MAP_DATA: { milestones, maps }
let maps      = null;      // alias for doc.maps, edited in place
let mapId     = null;      // which region is on screen
let mode      = 'select';  // 'select' | 'path'
let sel       = null;      // { type:'node'|'exit'|'prop'|'wp', id|index, wpIndex? }
let dirty     = false;
let art       = { maps: [], nodes: [], topo: [] };
let scrubIdx  = 0;         // which story beat the stage is previewing
let routeSel  = null;      // { from, to } — the route being edited
let routePick = null;      // first endpoint clicked, waiting for the second
const undoStack = [];

/* Nodes whose art size the game overrides in CSS rather than via `scale`.
   Replicated in editor.css; listed here so the inspector can explain itself. */
const CSS_SIZED = { 'egypt-signpost': '126px (hard-coded in css/style.css)' };

/* ── Boot ─────────────────────────────────────────────────────────────── */
(async function boot() {
  try {
    doc  = await loadMapData();
    maps = doc.maps;
    art  = await fetch('/api/art').then(r => r.json());
  } catch (e) {
    return toast('Could not load map data: ' + e.message, true);
  }
  buildTabs();
  buildScrubber();
  selectMap(Object.keys(maps)[0]);
  wireGlobalEvents();
})();

/* data/map-data.js is a script that assigns a global, not JSON — so fetch the
   text and run it against a fake `window` to get the object back out. Same
   reason the game can load it off file://. */
async function loadMapData() {
  const src = await fetch('/data/map-data.js?t=' + Date.now()).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
  const w = {};
  new Function('window', src)(w);
  if (!w.SOG_MAP_DATA) throw new Error('map-data.js did not assign window.SOG_MAP_DATA');
  if (!w.SOG_MAP_DATA.maps) throw new Error('map-data.js is in the old format (no `maps` key)');
  return w.SOG_MAP_DATA;
}

/* ── Undo ─────────────────────────────────────────────────────────────── */
/* Snapshot BEFORE a mutation. Drags snapshot once on pointerdown, not per
   pixel, so one undo steps back a whole drag rather than one frame of it. */
function snapshot() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 60) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  doc  = JSON.parse(undoStack.pop());
  maps = doc.maps;
  if (!maps[mapId]) mapId = Object.keys(maps)[0];
  sel = null;
  buildTabs(); buildScrubber(); render(); markDirty();
}

function markDirty() {
  dirty = true;
  $('#dirty').hidden = false;
  $('#btn-save').disabled = false;
}

/* ── Map tabs ─────────────────────────────────────────────────────────── */
function buildTabs() {
  const nav = $('#map-tabs');
  nav.innerHTML = '';
  Object.keys(maps).forEach(id => {
    const b = document.createElement('button');
    b.textContent = maps[id].displayName || id;
    b.className = id === mapId ? 'on' : '';
    b.onclick = () => selectMap(id);
    nav.appendChild(b);
  });
}

function selectMap(id) {
  mapId = id;
  sel = null;
  buildTabs();
  render();
}

/* ── Timeline ─────────────────────────────────────────────────────────────
   The scrubber previews the world at a point in the story. Note this uses the
   milestone's INDEX, unlike the game, which decides visibility from the flag.
   That difference is deliberate: the editor is asking "what does this look
   like at story beat N", which is an ordering question. The game is asking
   "what has this player actually done", which is not — their flags can be set
   in any order. Same data, two correct readings. */
function buildScrubber() {
  const sc = $('#scrub');
  sc.max = Math.max(0, (doc.milestones || []).length - 1);
  sc.value = Math.min(scrubIdx, Number(sc.max));
  scrubIdx = Number(sc.value);
  sc.oninput = () => { scrubIdx = Number(sc.value); render(); };
  $('#preview').onchange = render;
}

const milestoneIndex = id => {
  if (!id || id === 'start') return 0;
  const i = (doc.milestones || []).findIndex(m => m.id === id);
  // An unknown id means the milestone was renamed or deleted out from under
  // this gate. Treat it as "never", which is visible in the editor and matches
  // the game (an unknown flag is never set).
  return i === -1 ? Infinity : i;
};

/* Is this node / exit / prop on screen at the scrubbed story point? */
function visibleNow(o) {
  if (o.showFrom  && milestoneIndex(o.showFrom)  > scrubIdx) return false;
  if (o.showUntil && milestoneIndex(o.showUntil) <= scrubIdx) return false;
  return true;
}

/* Things that aren't visible yet are GHOSTED rather than removed, so you can
   still select and drag them — you often need to place a node long before the
   story reveals it. The Preview checkbox hides them properly. */
function applyVis(el, o) {
  if (visibleNow(o)) return el;
  if ($('#preview').checked) el.classList.add('gone');
  else el.classList.add('ghost');
  return el;
}

/* ── Render ───────────────────────────────────────────────────────────── */
function render() {
  const m = maps[mapId];
  const overlay = $('#overlay');
  const bg = $('#bg');

  $('#empty-note').hidden = !!m;
  if (!m) return;

  /* A missing background used to render as an empty stage with no explanation —
     which happens easily, because renaming art or changing .jpg to .jpeg breaks
     the reference silently. Say exactly which file is missing instead. */
  bg.onerror = () => showBgError(m.image);
  bg.onload  = () => { const w = $('#bg-error'); if (w) w.remove(); };
  bg.src = '/' + m.image;

  /* Background framing, mirroring overworld.js exactly. The transform applies to
     the IMAGE ONLY — the node overlay stays untransformed in both places, which
     is what keeps a dragged coordinate meaning the same thing here and in game. */
  applyFit(bg, m.imageFit);

  const ms = (doc.milestones || [])[scrubIdx];
  $('#scrub-label').textContent = ms ? (ms.label || ms.id) : '—';

  // Wipe everything except the persistent <svg> path layer.
  $$('.n, .exit, .wp, .prop, .spawn', overlay).forEach(el => el.remove());
  document.body.classList.toggle('route-mode', mode === 'route');

  // Props first — they are scenery and must paint behind the nodes, same as
  // the game's insertBefore(overlay.firstChild).
  (m.props || []).forEach((p, i) => overlay.appendChild(applyVis(propEl(p, i), p)));
  (m.nodes || []).forEach(n => overlay.appendChild(applyVis(nodeEl(n), n)));
  (m.exits || []).forEach(x => overlay.appendChild(applyVis(exitEl(x), x)));

  overlay.appendChild(spawnEl(m));
  renderPaths();
  renderWaypoints();
  renderLists();
  renderFitPanel();
  renderRouteList();
  renderInspector();
  updateHint();
}

/* Shared by the stage background and the framing preview so they can never
   drift apart. Same property order as the game. */
function showBgError(path) {
  if ($('#bg-error')) return;
  const d = document.createElement('div');
  d.id = 'bg-error';
  d.innerHTML = `<b>Background image not found</b>
    <code>${esc(path)}</code>
    <span>Check the filename in <code>images/metaworld/maps/</code> — a changed
    extension (.jpg vs .jpeg) is the usual cause.</span>`;
  $('#stage').appendChild(d);
}

function applyFit(el, fit) {
  fit = fit || {};
  const anchor = fit.anchor || 'center center';
  let t = '';
  if (fit.offsetX) t += ` translateX(${fit.offsetX}%)`;
  if (fit.offsetY) t += ` translateY(${fit.offsetY}%)`;
  if (fit.scale && fit.scale !== 1) t += ` scale(${fit.scale})`;
  el.style.objectPosition  = anchor;
  el.style.transformOrigin = anchor;
  el.style.transform       = t.trim();
}

function nodeEl(n) {
  const el = document.createElement('div');
  el.className = 'n' + (sel && sel.type === 'node' && sel.id === n.id ? ' sel' : '');
  el.dataset.id = n.id;
  el.style.left = n.x + '%';
  el.style.top  = n.y + '%';
  // Same order as the game and the props: centre, rotate, scale.
  let t = 'translate(-50%,-50%)';
  if (n.rotation) t += ` rotate(${n.rotation}deg)`;
  if (n.scale && n.scale !== 1) t += ` scale(${n.scale})`;
  el.style.transform = t;

  const img = document.createElement('img');
  img.src = '/' + n.image;
  img.draggable = false;
  if (n.flipX) img.style.transform = 'scaleX(-1)';
  // A missing file would otherwise render as an invisible broken image and look
  // like the node simply vanished.
  img.onerror = () => { img.replaceWith(missingArt(n.image)); };
  el.appendChild(img);

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = `${n.id}  ${fmt(n.x)},${fmt(n.y)}`;
  el.appendChild(tag);

  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'node', id: n.id }));
  return el;
}

/* Topography. Mirrors the game's _placeProps transform exactly — the signed
   scale for flips and the rotation both have to match or what you position
   here is not what renders. */
function propEl(p, i) {
  const el = document.createElement('div');
  el.className = 'prop' + (sel && sel.type === 'prop' && sel.index === i ? ' sel' : '');
  el.dataset.index = i;
  el.style.left = p.x + '%';
  el.style.top  = p.y + '%';
  const sc = p.scale == null ? 1 : p.scale;
  const sx = sc * (p.flipX ? -1 : 1);
  const sy = sc * (p.flipY ? -1 : 1);
  el.style.transform = `translate(-50%,-50%) rotate(${p.rotation || 0}deg) scale(${sx},${sy})`;

  const img = document.createElement('img');
  img.src = '/' + p.image;
  img.draggable = false;
  img.onerror = () => { img.replaceWith(missingArt(p.image)); };
  el.appendChild(img);

  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'prop', index: i }));
  return el;
}

/* Spawn is where the player lands on this map, and the start of their first
   walk — a real endpoint of the route graph, so it is placeable like any other. */
function spawnEl(m) {
  const el = document.createElement('div');
  el.className = 'spawn' + (sel && sel.type === 'spawn' ? ' sel' : '');
  el.style.left = m.spawn.x + '%';
  el.style.top  = m.spawn.y + '%';
  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'spawn' }));
  return el;
}

function missingArt(path) {
  const d = document.createElement('div');
  d.style.cssText = 'width:84px;height:60px;display:grid;place-items:center;' +
                    'border:1px dashed #c0392b;color:#e88;font-size:9px;text-align:center';
  d.textContent = 'missing art';
  d.title = path;
  return d;
}

function exitEl(x) {
  const el = document.createElement('div');
  el.className = 'exit' + (sel && sel.type === 'exit' && sel.id === x.id ? ' sel' : '');
  el.dataset.id = x.id;
  el.style.left   = x.zone.x + '%';
  el.style.top    = x.zone.y + '%';
  el.style.width  = x.zone.w + '%';
  el.style.height = x.zone.h + '%';
  el.textContent  = x.label || x.id;
  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'exit', id: x.id }));
  return el;
}

/* ── Routes ───────────────────────────────────────────────────────────────
   The walking graph. Every pair of endpoints (nodes, exits, spawn) is joined
   by a straight line unless a route with bends is stored for it — so the file
   only carries the routes you actually shaped, and everything else is a
   straight line by omission rather than by storing hundreds of two-point
   lines.

   Routes are undirected: one entry serves both directions, and the game walks
   the bends in reverse when travelling the other way. */

const endpointsOf = m => [
  { id: 'spawn', x: m.spawn.x, y: m.spawn.y, kind: 'spawn' },
  ...(m.nodes || []).map(n => ({ id: n.id, x: n.x, y: n.y, kind: 'node' })),
  ...(m.exits || []).map(e => ({ id: e.id, x: e.walkTo.x, y: e.walkTo.y, kind: 'exit' }))
];
const endpointPos = (m, id) => endpointsOf(m).find(e => e.id === id);

/* Undirected lookup — A->B and B->A are the same route. */
function findRoute(m, a, b) {
  return (m.routes || []).find(r =>
    (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

/* The full point list for drawing: start, bends (in travel order), end. */
function routePoints(m, from, to) {
  const a = endpointPos(m, from), b = endpointPos(m, to);
  if (!a || !b) return null;
  const r = findRoute(m, from, to);
  let mid = r ? (r.waypoints || []).slice() : [];
  if (r && r.to !== to) mid.reverse();
  return [a, ...mid, b];
}

function renderPaths() {
  const svg = $('#paths');
  svg.innerHTML = '';
  const m = maps[mapId];
  const line = (pts, colour, width, opacity, dash) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    el.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', colour);
    el.setAttribute('stroke-width', width);
    el.setAttribute('stroke-opacity', opacity);
    if (dash) el.setAttribute('stroke-dasharray', dash);
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(el);
  };

  // Every stored (bent) route, faint — so you can see the shape of the map's
  // walking graph without selecting anything.
  (m.routes || []).forEach(r => {
    if (routeSel && sameRoute(r, routeSel)) return;      // drawn highlighted below
    const pts = routePoints(m, r.from, r.to);
    if (pts) line(pts, '#6fd47a', 1.5, 0.4, '4 3');
  });

  if (routeSel) {
    const pts = routePoints(m, routeSel.from, routeSel.to);
    if (pts) line(pts, '#f8d000', 2.5, 1, null);
  }
}

const sameRoute = (r, sel) =>
  (r.from === sel.from && r.to === sel.to) || (r.from === sel.to && r.to === sel.from);

/* Handles for the selected route's bends. */
function renderWaypoints() {
  if (!routeSel) return;
  const m = maps[mapId];
  const r = findRoute(m, routeSel.from, routeSel.to);
  if (!r) return;
  let wps = (r.waypoints || []);
  // Displayed in travel order, which may be the reverse of storage order.
  const reversed = r.to !== routeSel.to;
  const view = reversed ? wps.slice().reverse() : wps;
  view.forEach((p, i) => {
    const storeIndex = reversed ? wps.length - 1 - i : i;
    const el = document.createElement('div');
    el.className = 'wp' + (sel && sel.type === 'wp' && sel.wpIndex === storeIndex ? ' sel' : '');
    el.style.left = p.x + '%';
    el.style.top  = p.y + '%';
    el.title = `bend ${i + 1} of ${view.length}`;
    el.addEventListener('pointerdown', e => beginDrag(e, { type: 'wp', wpIndex: storeIndex }));
    $('#overlay').appendChild(el);
  });
}

/* Insert a bend where the user clicked, into the segment they clicked NEAR —
   appending would put it at the end of the line no matter where you aimed,
   which is useless for shaping an existing route. */
function insertBend(pt) {
  const m = maps[mapId];
  let r = findRoute(m, routeSel.from, routeSel.to);
  if (!r) {
    r = { from: routeSel.from, to: routeSel.to, waypoints: [] };
    m.routes = m.routes || [];
    m.routes.push(r);
  }
  const pts = routePoints(m, routeSel.from, routeSel.to);
  // Which segment of the drawn line is closest to the click?
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(pt, pts[i], pts[i + 1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  const reversed = r.to !== routeSel.to;
  const view = reversed ? r.waypoints.slice().reverse() : r.waypoints.slice();
  view.splice(best, 0, { x: r2(pt.x), y: r2(pt.y) });
  r.waypoints = reversed ? view.reverse() : view;
  const shownIndex = reversed ? r.waypoints.length - 1 - best : best;
  sel = { type: 'wp', wpIndex: shownIndex };
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ── Map framing ──────────────────────────────────────────────────────────
   The map area is 1280×600 — the 1280×720 stage minus the 120px HUD strip —
   and every background so far is taller in proportion than that, so
   object-fit:cover always crops some height. These controls decide WHICH
   height is lost rather than eliminating the crop, which is not possible
   without either letterboxing or art at the frame's own proportion. */
function renderFitPanel() {
  const box = $('#fit-panel');
  const m = maps[mapId];
  if (!m) { box.innerHTML = ''; return; }
  const fit = m.imageFit || {};
  const anchors = [['center center','centred — crops top and bottom equally'],
                   ['center top','keep the top — crops the bottom'],
                   ['center bottom','keep the bottom — crops the top']];

  box.innerHTML = `
    <div class="f"><label>framing</label>
      <select id="fit-anchor">
        ${anchors.map(([v,l]) => `<option value="${v}" ${v === (fit.anchor || 'center center') ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    <div class="f2">
      <div class="f"><label>zoom</label><input id="fit-scale" type="number" step="0.01" value="${fit.scale ?? 1}"></div>
      <div class="f"><label>nudge y %</label><input id="fit-oy" type="number" step="0.5" value="${fit.offsetY || 0}"></div>
    </div>
    <div class="f"><label>nudge x %</label><input id="fit-ox" type="number" step="0.5" value="${fit.offsetX || 0}"></div>
    <p class="note" id="fit-report">measuring…</p>
    <div class="rowbtns"><button class="ghost sm" id="fit-reset">Reset framing</button></div>`;

  const set = (k, v) => {
    snapshotOnce();
    m.imageFit = m.imageFit || {};
    if (v === '' || v === 0 || v === null || (k === 'scale' && Number(v) === 1)) delete m.imageFit[k];
    else m.imageFit[k] = k === 'anchor' ? v : Number(v);
    if (m.imageFit.anchor === 'center center') delete m.imageFit.anchor;
    if (!Object.keys(m.imageFit).length) delete m.imageFit;
    markDirty(); render();
  };
  $('#fit-anchor').onchange = e => set('anchor', e.target.value);
  $('#fit-scale').oninput   = e => set('scale', e.target.value);
  $('#fit-oy').oninput      = e => set('offsetY', e.target.value);
  $('#fit-ox').oninput      = e => set('offsetX', e.target.value);
  $('#fit-reset').onclick   = () => { snapshot(); delete m.imageFit; markDirty(); render(); };

  reportCrop();
}

/* Say plainly how much of the source art never reaches the screen. Reads the
   image's natural size, so it is the real number for this file, not an
   estimate from the filename. */
function reportCrop() {
  const el = $('#fit-report'), bg = $('#bg');
  if (!el) return;
  const done = () => {
    const iw = bg.naturalWidth, ih = bg.naturalHeight;
    if (!iw || !ih) { el.textContent = 'could not read the image size'; return; }
    const fit = maps[mapId].imageFit || {};
    const zoom = fit.scale || 1;
    // cover: scale so the image covers 1280×600, then apply the zoom on top
    const s = Math.max(1280 / iw, 600 / ih) * zoom;
    const rh = ih * s, rw = iw * s;
    const lostY = Math.max(0, (rh - 600) / rh * 100);
    const lostX = Math.max(0, (rw - 1280) / rw * 100);
    const where = (fit.anchor || 'center center') === 'center top'    ? 'all off the bottom'
                : (fit.anchor || '') === 'center bottom'              ? 'all off the top'
                : `${(lostY / 2).toFixed(1)}% top and ${(lostY / 2).toFixed(1)}% bottom`;
    el.innerHTML = `Source is ${iw}×${ih}. The map area is 1280×600, so ` +
      (lostY > 0.5 ? `<b>${lostY.toFixed(1)}% of the height</b> is cropped — ${where}.`
                   : 'the full height fits.') +
      (lostX > 0.5 ? ` ${lostX.toFixed(1)}% of the width is cropped too.` : '');
  };
  if (bg.complete && bg.naturalWidth) done(); else bg.onload = done;
}

function renderLists() {
  const m = maps[mapId];
  const nl = $('#node-list');
  nl.innerHTML = '';
  (m.nodes || []).forEach(n => {
    const li = document.createElement('li');
    li.className = sel && sel.type === 'node' && sel.id === n.id ? 'sel' : '';
    li.innerHTML = `<img src="/${n.image}" alt=""><span>${n.id}</span><span class="k">${n.kind || '—'}</span>`;
    li.onclick = () => { sel = { type: 'node', id: n.id }; render(); };
    nl.appendChild(li);
  });
  if (!(m.nodes || []).length) nl.innerHTML = '<li class="note">No nodes on this map.</li>';

  const pl = $('#prop-list');
  pl.innerHTML = '';
  (m.props || []).forEach((p, i) => {
    const li = document.createElement('li');
    li.className = sel && sel.type === 'prop' && sel.index === i ? 'sel' : '';
    const when = p.showUntil ? 'until ' + p.showUntil : (p.showFrom ? 'from ' + p.showFrom : 'always');
    li.innerHTML = `<img src="/${p.image}" alt=""><span>${esc(p.image.split('/').pop())}</span><span class="k">${esc(when)}</span>`;
    li.onclick = () => { sel = { type: 'prop', index: i }; render(); };
    pl.appendChild(li);
  });
  if (!(m.props || []).length) pl.innerHTML = '<li class="note">No scenery on this map.</li>';

  const xl = $('#exit-list');
  xl.innerHTML = '';
  (m.exits || []).forEach(x => {
    const li = document.createElement('li');
    li.className = sel && sel.type === 'exit' && sel.id === x.id ? 'sel' : '';
    li.innerHTML = `<span>${x.id}</span><span class="k">→ ${x.target}</span>`;
    li.onclick = () => { sel = { type: 'exit', id: x.id }; render(); };
    xl.appendChild(li);
  });
  if (!(m.exits || []).length) xl.innerHTML = '<li class="note">No exits on this map.</li>';
}

/* ── Dragging ─────────────────────────────────────────────────────────── */
let drag = null;

function beginDrag(e, target) {
  e.preventDefault();
  e.stopPropagation();          // don't let the stage treat this as a bare click
  sel = target;
  render();
  // In route mode a click on an endpoint picks it for the route, rather than
  // starting a drag.
  if (mode === 'route' && ['node', 'exit', 'spawn'].includes(target.type)) {
    pickEndpoint(target.type === 'spawn' ? 'spawn' : target.id);
    return;
  }

  const p = pct(e);
  const cur = currentPos(target);
  snapshot();
  drag = {
    target,
    // Grab offset, so the thing doesn't jump its centre to the cursor.
    dx: cur.x - p.x,
    dy: cur.y - p.y,
    moved: false
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!drag) return;
  const p = pct(e);
  setPos(drag.target, clamp(p.x + drag.dx), clamp(p.y + drag.dy));
  drag.moved = true;
  markDirty();
  render();
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  // A click that never moved shouldn't leave an undo entry behind.
  if (drag && !drag.moved) undoStack.pop();
  drag = null;
}

/* One entry per draggable/selectable thing. Adding a new kind of stage
   object means adding one entry here — currentPos/setPos, drag, arrow-key
   nudge, and the position readout all go through this, so nothing can add a
   kind here and forget to wire it into one of those call sites. */
const KINDS = {
  node:  {
    get: t => { const n = node(t.id); return { x: n.x, y: n.y }; },
    set: (t, x, y) => { const n = node(t.id); n.x = r2(x); n.y = r2(y); }
  },
  exit:  {
    get: t => { const x = exit(t.id); return { x: x.zone.x, y: x.zone.y }; },
    set: (t, x, y) => { const e = exit(t.id); e.zone.x = r2(x); e.zone.y = r2(y); }
  },
  prop:  {
    get: t => { const p = prop(t.index); return { x: p.x, y: p.y }; },
    set: (t, x, y) => { const p = prop(t.index); p.x = r2(x); p.y = r2(y); }
  },
  spawn: {
    get: () => ({ x: maps[mapId].spawn.x, y: maps[mapId].spawn.y }),
    set: (t, x, y) => { const sp = maps[mapId].spawn; sp.x = r2(x); sp.y = r2(y); }
  },
  wp:    {
    get: t => bend(t.wpIndex),
    set: (t, x, y) => { const p = bend(t.wpIndex); if (p) { p.x = r2(x); p.y = r2(y); } }
  }
};

function currentPos(t) { return (KINDS[t.type] || KINDS.wp).get(t); }
function setPos(t, x, y) { return (KINDS[t.type] || KINDS.wp).set(t, x, y); }

/* Cursor position as a percentage of the stage. This is the only place screen
   pixels touch the data model. */
function pct(e) {
  const b = $('#stage').getBoundingClientRect();
  return {
    x: (e.clientX - b.left) / b.width  * 100,
    y: (e.clientY - b.top)  / b.height * 100
  };
}

const clamp = v => Math.max(0, Math.min(100, v));
const r2    = v => Math.round(v * 100) / 100;
const fmt   = v => (Math.round(v * 10) / 10).toFixed(1);

const node = id => (maps[mapId].nodes || []).find(n => n.id === id);
const exit = id => (maps[mapId].exits || []).find(x => x.id === id);
// Props have no id — several mudhuts share the same art — so they are keyed by
// position in the array. Anything that reorders props must re-point `sel`.
const prop = i  => (maps[mapId].props || [])[i];
/* A bend belongs to the selected route, addressed by its index in STORAGE
   order — the display may show it reversed. */
const bend = i  => {
  if (!routeSel) return null;
  const r = findRoute(maps[mapId], routeSel.from, routeSel.to);
  return r && r.waypoints ? r.waypoints[i] : null;
};

/* ── Stage-level interactions ─────────────────────────────────────────── */
function wireGlobalEvents() {
  const stage = $('#stage');

  stage.addEventListener('pointermove', e => {
    const p = pct(e);
    $('#cursor-pos').textContent = `x ${fmt(p.x)}   y ${fmt(p.y)}`;
  });
  stage.addEventListener('pointerleave', () => { $('#cursor-pos').textContent = '—'; });

  // Bare click on the map: in path mode append a waypoint, otherwise deselect.
  stage.addEventListener('pointerdown', e => {
    if (mode === 'route') {
      if (!routeSel) return toast('Click two places to pick a route between them');
      snapshot();
      insertBend(pct(e));
      markDirty(); render();
    } else {
      sel = null; render();
    }
  });

  $$('.seg button').forEach(b => {
    b.onclick = () => {
      mode = b.dataset.mode;
      $$('.seg button').forEach(x => x.classList.toggle('on', x === b));
      updateHint(); render();
    };
  });

  $('#btn-save').onclick    = save;
  $('#btn-add-node').onclick = addNodeFlow;
  $('#btn-new-map').onclick  = newMapFlow;
  $('#btn-help').onclick     = showHelp;
  $('#btn-add-prop').onclick = addPropFlow;
  $('#btn-story').onclick    = showMilestones;

  document.addEventListener('keydown', onKey);

  // Cheap insurance — losing a session of positioning to a stray Cmd-W is
  // exactly the kind of thing that makes a tool feel untrustworthy.
  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

function onKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); return undo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); return save(); }

  if (!sel) return;

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    return deleteSelection();
  }

  const step = e.shiftKey ? 1 : 0.1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  snapshot();
  const cur = currentPos(sel);
  setPos(sel, clamp(cur.x + d[0]), clamp(cur.y + d[1]));
  markDirty(); render();
}

function deleteSelection() {
  const m = maps[mapId];
  if (sel.type === 'wp') {
    const r = findRoute(m, routeSel.from, routeSel.to);
    if (!r) return;
    snapshot();
    r.waypoints.splice(sel.wpIndex, 1);
    // A route with no bends IS a straight line, so stop storing it.
    if (!r.waypoints.length) m.routes.splice(m.routes.indexOf(r), 1);
    sel = null; markDirty(); return render();
  }
  if (sel.type === 'prop') {
    snapshot();
    m.props.splice(sel.index, 1);
    sel = null; markDirty(); return render();
  }
  if (sel.type === 'node') {
    const n = node(sel.id);
    // Deleting a node whose id is wired into overworld.js breaks a gate or a
    // click handler with no error — warn with the specifics, don't just confirm.
    if (!confirm(`Delete node "${n.id}"?\n\nIf overworld.js has a NODE_BEHAVIOUR entry or an onNodeClick branch for this id, that code becomes dead and any progression flag pointing at it stops mattering. Check js/overworld.js before you push.`)) return;
    snapshot();
    m.nodes.splice(m.nodes.indexOf(n), 1);
    sel = null; markDirty(); return render();
  }
  if (sel.type === 'exit') {
    const x = exit(sel.id);
    if (!confirm(`Delete exit "${x.id}" → ${x.target}?\n\nThis may strand a region with no way in or out.`)) return;
    snapshot();
    m.exits.splice(m.exits.indexOf(x), 1);
    sel = null; markDirty(); return render();
  }
}

/* Two clicks pick a route: first endpoint, then second. Clicking the same one
   twice cancels, which is the obvious way out of a mis-click. */
function pickEndpoint(id) {
  if (!routePick) {
    routePick = id;
    toast(`From ${id} — now click where the route goes`);
  } else if (routePick === id) {
    routePick = null;
    toast('Cancelled');
  } else {
    routeSel = { from: routePick, to: id };
    routePick = null;
    sel = null;
  }
  render();
}

function renderRouteList() {
  const ul = $('#route-list');
  if (!ul) return;
  ul.innerHTML = '';
  const m = maps[mapId];
  if (mode !== 'route') {
    ul.innerHTML = '<li class="note">Switch to Routes mode to edit walking paths.</li>';
    return;
  }
  const eps = endpointsOf(m);
  const pairs = [];
  for (let i = 0; i < eps.length; i++)
    for (let j = i + 1; j < eps.length; j++)
      pairs.push([eps[i].id, eps[j].id]);

  pairs.forEach(([a, b]) => {
    const r = findRoute(m, a, b);
    const bends = r ? (r.waypoints || []).length : 0;
    const li = document.createElement('li');
    li.className = (bends ? 'bent ' : '') +
      (routeSel && sameRoute({ from: a, to: b }, routeSel) ? 'sel' : '');
    li.innerHTML = `<span>${esc(a)} → ${esc(b)}</span>
      <span class="k">${bends ? bends + ' bend' + (bends > 1 ? 's' : '') : 'straight'}</span>`;
    li.onclick = () => { routeSel = { from: a, to: b }; routePick = null; sel = null; render(); };
    ul.appendChild(li);
  });
}

function updateHint() {
  $('#hint').textContent = mode === 'route'
    ? (routeSel
        ? `Editing ${routeSel.from} → ${routeSel.to}. Click the line to add a bend, drag bends to shape it, Delete to remove one.`
        : (routePick ? `From ${routePick} — now click the other end.`
                     : 'Click two places to pick the route between them.'))
    : 'Drag to move. Arrows nudge 0.1%, Shift+arrows 1%. Cmd/Ctrl+Z undo, Cmd/Ctrl+S save.';
  $('#mode-note').textContent = mode === 'route'
    ? 'Every pair of places is a straight line until you bend it. Only the ones you shape get stored.'
    : 'Drag nodes to reposition. Arrow keys nudge by 0.1%, Shift+arrows by 1%.';
}

/* ── Inspector ────────────────────────────────────────────────────────── */
function renderInspector() {
  const box = $('#inspector');
  if (!sel) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  if (sel.type === 'exit') return renderExitInspector(box, exit(sel.id));
  if (sel.type === 'prop') return renderPropInspector(box, prop(sel.index), sel.index);
  const n = node(sel.id);
  if (!n) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }

  box.innerHTML = `
    <div class="f"><label>id</label><input id="i-id" value="${esc(n.id)}"></div>
    <div class="f"><label>name</label><input id="i-name" value="${esc(n.name || '')}"></div>
    <div class="f"><label>kind</label>
      <select id="i-kind">
        ${['battle', 'market'].map(k =>
          `<option ${k === (n.kind || 'battle') ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
    </div>
    ${gateFields(n)}
    ${bossFields(n)}
    <div class="f2">
      <div class="f"><label>x %</label><input id="i-x" type="number" step="0.1" value="${n.x}"></div>
      <div class="f"><label>y %</label><input id="i-y" type="number" step="0.1" value="${n.y}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>scale</label><input id="i-scale" type="number" step="0.05" value="${n.scale ?? ''}" placeholder="1"></div>
      <div class="f"><label>rotation °</label><input id="i-rot" type="number" step="1" value="${n.rotation || 0}"></div>
    </div>
    <div class="f"><label class="chk"><input id="i-flip" type="checkbox" ${n.flipX ? 'checked' : ''}> flip horizontally</label></div>
    <div class="f"><label>image</label><input id="i-image" value="${esc(n.image)}"></div>
    <div class="f"><label>note (survives saving)</label><textarea id="i-note">${esc(n.note || '')}</textarea></div>

    ${CSS_SIZED[n.id] ? `<p class="warn">This node's art size is ${CSS_SIZED[n.id]}, not by <code>scale</code>. Changing scale here will not match the game until that CSS rule is removed.</p>` : ''}
    ${src2(n)}
    <div class="rowbtns">
      <button class="danger" id="i-del">Delete node</button>
    </div>`;

  bindGates(n);
  bindBoss(n);
  bind('#i-id',    'input', v => { renameNode(n, v); });
  bind('#i-name',  'input', v => { n.name = v; });
  bind('#i-kind',  'change', v => { n.kind = v; });
  bind('#i-x',     'input', v => { n.x = Number(v); render(); });
  bind('#i-y',     'input', v => { n.y = Number(v); render(); });
  bind('#i-scale', 'input', v => { if (v === '') delete n.scale; else n.scale = Number(v); render(); });
  bind('#i-rot',   'input', v => { const r = Number(v); if (r) n.rotation = r; else delete n.rotation; render(); });
  bind('#i-image', 'input', v => { n.image = v; render(); });
  bind('#i-note',  'input', v => { if (v) n.note = v; else delete n.note; });
  $('#i-flip').onchange = e => { if (e.target.checked) n.flipX = true; else delete n.flipX; markDirty(); render(); };
  $('#i-del').onclick = () => deleteSelection();
}

/* Boss ladder. `tiers: 2` is what makes a node draw Serf and Giant flags; the
   game reads these fields directly, so a boss added here gets its flags with no
   code change. `hook` is the flag key — sog_node_<hook>_serf_beaten etc. */
function bossFields(n) {
  if (n.kind !== 'battle') return '';
  const t = n.tiers == null ? 2 : n.tiers;
  return `
    <div class="f2">
      <div class="f"><label>levels</label>
        <select id="b-tiers">
          <option value="2" ${t === 2 ? 'selected' : ''}>Serf + Giant (flags)</option>
          <option value="1" ${t === 1 ? 'selected' : ''}>single level (no flags)</option>
        </select></div>
      <div class="f"><label>hook (flag key)</label>
        <input id="b-hook" value="${esc(n.hook || '')}" placeholder="e.g. hatshepsut"></div>
    </div>
    ${t === 2 ? `
    <div class="f2">
      <div class="f"><label>flag nudge x</label>
        <input id="b-dx" type="number" step="0.5" value="${(n.flagNudge || {}).dx || 0}"></div>
      <div class="f"><label>flag nudge y</label>
        <input id="b-dy" type="number" step="0.5" value="${(n.flagNudge || {}).dy || 0}"></div>
    </div>
    <div class="f"><label>Serf flag appears</label>
      <select id="b-sfo">
        <option value="" ${!n.serfFlagOn ? 'selected' : ''}>with the node (reveal-animated bosses)</option>
        <option value="encounter" ${n.serfFlagOn === 'encounter' ? 'selected' : ''}>when the player first meets them</option>
      </select></div>
    ${t === 2 && !n.hook ? `<p class="warn">Two-level battles need a <b>hook</b> or no flags will render.</p>` : ''}
    ` : ''}
    ${regionRuleWarning(n)}`;
}

function bindBoss(n) {
  const t = $('#b-tiers'), h = $('#b-hook'), dx = $('#b-dx'), dy = $('#b-dy'), sf = $('#b-sfo');
  if (t) t.onchange = () => { snapshot(); n.tiers = Number(t.value); markDirty(); render(); };
  if (h) h.oninput  = () => { snapshotOnce(); if (h.value) n.hook = h.value; else delete n.hook; markDirty(); };
  const nudge = () => {
    snapshotOnce();
    const x = Number(dx.value) || 0, y = Number(dy.value) || 0;
    if (x || y) n.flagNudge = { dx: x, dy: y }; else delete n.flagNudge;
    markDirty();
  };
  if (dx) dx.oninput = nudge;
  if (dy) dy.oninput = nudge;
  if (sf) sf.onchange = () => { snapshot(); if (sf.value) n.serfFlagOn = sf.value; else delete n.serfFlagOn; markDirty(); };
}

/* The two-tier progression rule, checked rather than trusted to memory:
   inside a region the next node opens on the previous boss's SERF win, but
   reaching a NEW region requires the GIANT. A gate that crosses regions on a
   serf flag would let the player skip a boss's hard tier. */
function regionRuleWarning(n) {
  if (!n.showFrom) return '';
  const ms = (doc.milestones || []).find(m => m.id === n.showFrom);
  if (!ms || !ms.flag) return '';
  const m = /^sog_node_(.+)_(serf|giant)_beaten$/.exec(ms.flag);
  if (!m) return '';                       // a derived flag; the rule can't be read off it
  const [, hook, tier] = m;
  // Which map does that boss live on?
  let srcMap = null;
  for (const [id, map] of Object.entries(doc.maps))
    if ((map.nodes || []).some(x => x.hook === hook)) srcMap = id;
  if (!srcMap || srcMap === mapId) return '';
  if (tier === 'giant') return '';
  return `<p class="warn">This node is on <b>${esc(mapId)}</b> but opens on
    <b>${esc(hook)}'s Serf win</b>, and ${esc(hook)} is on <b>${esc(srcMap)}</b>.
    Crossing into a new region is supposed to require the <b>Giant</b> win —
    as written, the player reaches ${esc(mapId)} without beating ${esc(hook)}'s
    hard tier.</p>`;
}

/* showFrom / showUntil dropdowns. Every node, exit and prop gets these — this
   is how the locked pass-through version of a region and the fully-unlocked one
   are authored, without storing two copies of the map. */
function gateFields(o) {
  const opts = (sel2, blank) =>
    `<option value="">${blank}</option>` +
    (doc.milestones || []).map(m =>
      `<option value="${esc(m.id)}" ${m.id === sel2 ? 'selected' : ''}>${esc(m.label || m.id)}</option>`
    ).join('');
  return `
    <div class="f"><label>appears from</label>
      <select class="g-from">${opts(o.showFrom, 'always visible')}</select></div>
    <div class="f"><label>disappears at</label>
      <select class="g-until">${opts(o.showUntil, 'never disappears')}</select></div>`;
}

/* Wire the two dropdowns above for whatever object is selected. */
function bindGates(o) {
  const f = $('.g-from'), u = $('.g-until');
  if (f) f.onchange = () => { snapshot(); if (f.value) o.showFrom = f.value; else delete o.showFrom; markDirty(); render(); };
  if (u) u.onchange = () => { snapshot(); if (u.value) o.showUntil = u.value; else delete o.showUntil; markDirty(); render(); };
}

/* Whether the game has a click handler for this node id. The editor cannot make
   a node DO anything — onNodeClick still dispatches on literal id — so saying so
   per-node is more useful than a blanket warning. */
const WIRED_NODES = new Set([
  'walls-of-uruk', 'market', 'sargon', 'hammurabi', 'hanging-gardens',
  'double-crown', 'egypt-market', 'prehistory', 'egypt-signpost'
]);
function src2(n) {
  if (WIRED_NODES.has(n.id)) return '';
  return `<p class="warn"><b>Nothing happens when this node is clicked.</b>
    The game dispatches clicks on literal node id in <code>onNodeClick</code>, and
    there is no branch for <code>${esc(n.id)}</code> yet. Position it here, then ask
    Claude to wire up the ${esc(n.kind || 'battle')}.</p>`;
}

/* Topography inspector. Props have rotation and a Y flip that nodes do not —
   scenery gets mirrored and tilted to avoid looking stamped out. */
function renderPropInspector(box, p, i) {
  if (!p) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  box.innerHTML = `
    <div class="f"><label>image</label><input id="p-image" value="${esc(p.image)}"></div>
    <div class="f2">
      <div class="f"><label>x %</label><input id="p-x" type="number" step="0.1" value="${p.x}"></div>
      <div class="f"><label>y %</label><input id="p-y" type="number" step="0.1" value="${p.y}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>scale</label><input id="p-scale" type="number" step="0.01" value="${p.scale == null ? 1 : p.scale}"></div>
      <div class="f"><label>rotation °</label><input id="p-rot" type="number" step="1" value="${p.rotation || 0}"></div>
    </div>
    <div class="f2">
      <div class="f"><label class="chk"><input id="p-fx" type="checkbox" ${p.flipX ? 'checked' : ''}> flip X</label></div>
      <div class="f"><label class="chk"><input id="p-fy" type="checkbox" ${p.flipY ? 'checked' : ''}> flip Y</label></div>
    </div>
    ${gateFields(p)}
    <div class="f"><label>note</label><textarea id="p-note">${esc(p.note || '')}</textarea></div>
    <p class="note">Scenery is decorative only — never clickable, always painted behind the nodes.</p>
    <div class="rowbtns">
      <button class="ghost sm" id="p-dup">Duplicate</button>
      <button class="danger" id="p-del">Delete</button>
    </div>`;

  bind('#p-image', 'input',  v => { p.image = v; render(); });
  bind('#p-x',     'input',  v => { p.x = Number(v); render(); });
  bind('#p-y',     'input',  v => { p.y = Number(v); render(); });
  bind('#p-scale', 'input',  v => { p.scale = Number(v); render(); });
  bind('#p-rot',   'input',  v => { p.rotation = Number(v); render(); });
  bind('#p-note',  'input',  v => { if (v) p.note = v; else delete p.note; });
  $('#p-fx').onchange = e => { snapshot(); if (e.target.checked) p.flipX = true; else delete p.flipX; markDirty(); render(); };
  $('#p-fy').onchange = e => { snapshot(); if (e.target.checked) p.flipY = true; else delete p.flipY; markDirty(); render(); };
  bindGates(p);

  // Duplicating is the fastest way to dot a river with huts — offset slightly so
  // the copy is visible rather than hidden exactly behind the original.
  $('#p-dup').onclick = () => {
    snapshot();
    const copy = JSON.parse(JSON.stringify(p));
    copy.x = r2(Math.min(100, p.x + 3));
    copy.y = r2(Math.min(100, p.y + 3));
    maps[mapId].props.splice(i + 1, 0, copy);
    sel = { type: 'prop', index: i + 1 };
    markDirty(); render();
  };
  $('#p-del').onclick = () => {
    snapshot();
    maps[mapId].props.splice(i, 1);
    sel = null; markDirty(); render();
  };
}

function renderExitInspector(box, x) {
  if (!x) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  box.innerHTML = `
    <div class="f"><label>id</label><input id="e-id" value="${esc(x.id)}"></div>
    <div class="f"><label>label</label><input id="e-label" value="${esc(x.label || '')}"></div>
    <div class="f"><label>target map</label>
      <select id="e-target">
        ${Object.keys(maps).map(k => `<option ${k === x.target ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
    </div>
    <div class="f2">
      <div class="f"><label>zone x</label><input id="e-zx" type="number" step="0.5" value="${x.zone.x}"></div>
      <div class="f"><label>zone y</label><input id="e-zy" type="number" step="0.5" value="${x.zone.y}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>zone w</label><input id="e-zw" type="number" step="0.5" value="${x.zone.w}"></div>
      <div class="f"><label>zone h</label><input id="e-zh" type="number" step="0.5" value="${x.zone.h}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>walkTo x</label><input id="e-wx" type="number" step="0.5" value="${x.walkTo.x}"></div>
      <div class="f"><label>walkTo y</label><input id="e-wy" type="number" step="0.5" value="${x.walkTo.y}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>entryAt x</label><input id="e-ex" type="number" step="0.5" value="${x.entryAt.x}"></div>
      <div class="f"><label>entryAt y</label><input id="e-ey" type="number" step="0.5" value="${x.entryAt.y}"></div>
    </div>
    ${gateFields(x)}
    <p class="note">entryAt is where the player lands on the <b>target</b> map, so it is a coordinate in ${esc(x.target)}'s space, not this one.</p>
    <div class="rowbtns"><button class="danger" id="e-del">Delete exit</button></div>`;

  bindGates(x);
  bind('#e-id',     'input', v => { x.id = v; renderLists(); });
  bind('#e-label',  'input', v => { x.label = v; render(); });
  bind('#e-target', 'change', v => { x.target = v; render(); });
  [['zx', 'zone', 'x'], ['zy', 'zone', 'y'], ['zw', 'zone', 'w'], ['zh', 'zone', 'h'],
   ['wx', 'walkTo', 'x'], ['wy', 'walkTo', 'y'], ['ex', 'entryAt', 'x'], ['ey', 'entryAt', 'y']]
    .forEach(([id, obj, key]) => bind('#e-' + id, 'input', v => { x[obj][key] = Number(v); render(); }));
  $('#e-del').onclick = () => deleteSelection();
}

/* Renaming is riskier than it looks — the id is the join key between this data
   and every behaviour hook in overworld.js. Warn once, then allow it. */
function renameNode(n, next) {
  if (!next || next === n.id) return;
  n.id = next;
  if (sel) sel.id = next;
  markDirty();
  renderLists();
}

function bind(selector, ev, fn) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener(ev, e => { snapshotOnce(); fn(e.target.value); markDirty(); });
}
/* One undo entry per burst of typing rather than one per keystroke. */
let snapTimer = null;
function snapshotOnce() {
  if (snapTimer) return;
  snapshot();
  snapTimer = setTimeout(() => { snapTimer = null; }, 700);
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ── Add Node ─────────────────────────────────────────────────────────── */
function addNodeFlow() {
  pickArt('Choose node art', art.nodes, chosen => {
    const name = prompt('Node name?', 'New Node');
    if (name === null) return;
    const id = uniqueId(slug(name || 'new-node'));
    snapshot();
    maps[mapId].nodes = maps[mapId].nodes || [];
    maps[mapId].nodes.push({
      id,
      name: name || 'New Node',
      kind: 'battle',
      image: chosen.path,
      // Drop it dead centre; the point is to drag it somewhere anyway.
      x: 50, y: 50
    });
    sel = { type: 'node', id };
    markDirty(); render();
    toast(`Added "${id}" — drag it into place`);
  });
}

function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';
}
function uniqueId(base) {
  const taken = new Set();
  Object.values(maps).forEach(m => (m.nodes || []).forEach(n => taken.add(n.id)));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

/* ── Add Scenery ──────────────────────────────────────────────────────── */
function addPropFlow() {
  pickArt('Choose scenery', art.topo, chosen => {
    snapshot();
    maps[mapId].props = maps[mapId].props || [];
    // Default scale 0.25: the topography art is authored large, and dropping a
    // prop in at 1.0 fills the screen and looks broken.
    maps[mapId].props.push({ image: chosen.path, x: 50, y: 50, scale: 0.25, rotation: 0 });
    sel = { type: 'prop', index: maps[mapId].props.length - 1 };
    markDirty(); render();
    toast('Scenery added — drag it into place');
  });
}

/* ── New Map ──────────────────────────────────────────────────────────── */
function newMapFlow() {
  pickArt('Choose a background for the new region', art.maps, chosen => {
    const display = prompt('Region name? (e.g. Greece)', '');
    if (!display) return;
    const id = slug(display);
    if (maps[id]) return toast(`A map called "${id}" already exists`, true);
    snapshot();
    maps[id] = {
      displayName: display,
      image: chosen.path,
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      props: [],
      nodes: [],
      exits: []
    };
    markDirty();
    buildTabs();
    selectMap(id);
    toast(`Created "${id}". Add nodes, then an exit from an existing map to reach it.`);
  });
}

/* ── Milestone editor ─────────────────────────────────────────────────────
   Story moments are global, not per-map, so this lives beside the scrubber
   rather than in the per-map sidebar.

   The important design choice: you pick a BATTLE and a TIER rather than typing
   a flag. That produces sog_node_<hook>_<tier>_beaten, which the battle system
   already writes on its own — so a milestone built this way needs no code at
   all. It also makes the two-tier rule visible at the point of decision: the
   Serf/Giant choice IS the "next node here" vs "next region" choice. */

const FLAG_RE = /^sog_node_(.+)_(serf|giant)_beaten$/;

/* Every battle node across every map that could satisfy a milestone. */
function battleNodes() {
  return Object.entries(doc.maps).flatMap(([mid, m]) =>
    (m.nodes || []).filter(n => n.kind === 'battle' && n.hook)
                   .map(n => ({ mapId: mid, id: n.id, name: n.name, hook: n.hook })));
}

/* Describe where a milestone's flag comes from, in words. */
function milestoneSource(ms) {
  if (!ms.flag) return { text: 'always true — the beginning of the game', custom: false };
  const m = FLAG_RE.exec(ms.flag);
  if (!m) return { text: 'set by game code · ' + ms.flag, custom: true };
  const node = battleNodes().find(b => b.hook === m[1]);
  const who = node ? (node.name || node.id) : m[1];
  const tier = m[2] === 'giant' ? 'Giant' : 'Serf';
  return { text: `when ${who}'s ${tier} battle is won`, custom: false };
}

/* What breaks if this milestone goes away. */
function milestoneUsage(id) {
  const out = [];
  for (const [mid, m] of Object.entries(doc.maps)) {
    const scan = (arr, label) => (arr || []).forEach((o, i) => {
      const who = `${mid} · ${label(o, i)}`;
      if (o.showFrom  === id) out.push({ obj: o, key: 'showFrom',  who });
      if (o.showUntil === id) out.push({ obj: o, key: 'showUntil', who });
    });
    scan(m.nodes, o => o.id);
    scan(m.exits, o => o.id);
    scan(m.props, (o, i) => 'scenery ' + (i + 1));
  }
  return out;
}

function showMilestones() {
  $('#modal-title').textContent = 'Story moments';
  $('#modal-ok').hidden = true;
  $('#modal-cancel').textContent = 'Close';
  const close = () => {
    $('#modal').hidden = true;
    $('#modal-ok').hidden = false;
    $('#modal-cancel').textContent = 'Cancel';
  };
  $('#modal-cancel').onclick = $('#modal-x').onclick = close;
  $('#modal').hidden = false;
  drawMilestones();
}

function drawMilestones() {
  const ms = doc.milestones || [];
  const battles = battleNodes();

  const rows = ms.map((m, i) => {
    const src = milestoneSource(m);
    const used = milestoneUsage(m.id).length;
    // 'start' is the implicit beginning — reordering or deleting it would be
    // meaningless, so it is shown but not editable.
    const locked = m.id === 'start';
    return `<li class="${locked ? 'locked' : ''}">
      <span class="ms-num">${i + 1}</span>
      <span class="ms-main">
        <b>${esc(m.label || m.id)}</b>
        <span class="ms-src ${src.custom ? 'custom' : ''}">${esc(src.text)}</span>
      </span>
      <span class="ms-used">${used ? used + ' use' + (used > 1 ? 's' : '') : 'unused'}</span>
      <span class="ms-btns">
        <button data-up="${i}"   ${i <= 1 ? 'disabled' : ''} title="earlier">↑</button>
        <button data-down="${i}" ${i === 0 || i === ms.length - 1 ? 'disabled' : ''} title="later">↓</button>
        <button data-del="${i}" class="del" ${locked ? 'disabled' : ''} title="delete">✕</button>
      </span></li>`;
  }).join('');

  $('#modal-body').innerHTML = `
    <p class="note">These are the moments the story slider walks through, in order.
      Anything on a map can be set to appear or disappear at one of them.</p>
    <ul class="ms-list">${rows}</ul>
    <div class="ms-add">
      <h4>Add a story moment</h4>
      <div class="f"><label>name</label>
        <input id="ms-label" placeholder="e.g. Hatshepsut defeated"></div>
      <div class="f"><label>what makes it happen</label>
        <select id="ms-src">
          <option value="battle">winning a battle</option>
          <option value="custom">something else (needs code) …</option>
        </select></div>
      <div id="ms-battle-fields">
        <div class="f2">
          <div class="f"><label>battle</label>
            <select id="ms-hook">
              ${battles.map(b => `<option value="${esc(b.hook)}">${esc(b.name || b.id)} (${esc(b.mapId)})</option>`).join('')}
              ${battles.length ? '' : '<option value="">— no battle nodes with a hook yet —</option>'}
            </select></div>
          <div class="f"><label>which win</label>
            <select id="ms-tier">
              <option value="serf">Serf — opens the next node here</option>
              <option value="giant">Giant — opens the next region</option>
            </select></div>
        </div>
      </div>
      <div id="ms-custom-fields" hidden>
        <div class="f"><label>flag name</label>
          <input id="ms-flag" placeholder="sog_something_complete"></div>
        <p class="warn">A flag nothing sets keeps its nodes hidden forever. Use this
          only for something game code already writes — otherwise pick a battle above.</p>
      </div>
      <div class="rowbtns"><button class="primary" id="ms-add">Add</button></div>
    </div>`;

  $$('.ms-btns button').forEach(b => {
    if (b.dataset.up   != null) b.onclick = () => moveMilestone(+b.dataset.up, -1);
    if (b.dataset.down != null) b.onclick = () => moveMilestone(+b.dataset.down, +1);
    if (b.dataset.del  != null) b.onclick = () => deleteMilestone(+b.dataset.del);
  });
  $('#ms-src').onchange = e => {
    $('#ms-battle-fields').hidden = e.target.value !== 'battle';
    $('#ms-custom-fields').hidden = e.target.value !== 'custom';
  };
  $('#ms-add').onclick = addMilestone;
}

function moveMilestone(i, dir) {
  const ms = doc.milestones;
  const j = i + dir;
  if (j < 1 || j >= ms.length) return;      // never move above 'start'
  snapshot();
  [ms[i], ms[j]] = [ms[j], ms[i]];
  markDirty(); buildScrubber(); render(); drawMilestones();
}

function deleteMilestone(i) {
  const ms = doc.milestones[i];
  const used = milestoneUsage(ms.id);
  if (used.length) {
    const list = used.slice(0, 8).map(u => '  • ' + u.who + ' (' + u.key + ')').join('\n');
    const more = used.length > 8 ? `\n  …and ${used.length - 8} more` : '';
    if (!confirm(`"${ms.label || ms.id}" is used by ${used.length} thing(s):\n\n${list}${more}\n\n` +
                 `Delete it and clear those settings? Those items will go back to being always visible.`)) return;
  }
  snapshot();
  // Strip the dangling gates too — leaving them would point at a milestone that
  // no longer exists, which the save validator rejects anyway.
  used.forEach(u => { delete u.obj[u.key]; });
  doc.milestones.splice(i, 1);
  if (scrubIdx >= doc.milestones.length) scrubIdx = doc.milestones.length - 1;
  markDirty(); buildScrubber(); render(); drawMilestones();
}

function addMilestone() {
  const label = $('#ms-label').value.trim();
  if (!label) return toast('Give it a name first', true);
  const id = uniqueMilestoneId(slug(label));
  let flag;
  if ($('#ms-src').value === 'battle') {
    const hook = $('#ms-hook').value;
    if (!hook) return toast('No battle to attach this to — give a battle node a hook first', true);
    flag = `sog_node_${hook}_${$('#ms-tier').value}_beaten`;
  } else {
    flag = $('#ms-flag').value.trim();
    if (!flag) return toast('Enter a flag name, or attach it to a battle instead', true);
  }
  if ((doc.milestones || []).some(m => m.flag === flag)) {
    return toast('Another story moment already uses that flag', true);
  }
  snapshot();
  doc.milestones.push({ id, label, flag });
  markDirty(); buildScrubber(); render(); drawMilestones();
  toast(`Added "${label}" — it's the last moment; use ↑ to move it earlier`);
}

function uniqueMilestoneId(base) {
  const taken = new Set((doc.milestones || []).map(m => m.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

/* ── Help ─────────────────────────────────────────────────────────────────
   Written for someone who does not program. This lives in the toolbar rather
   than in a README because the toolbar is where the question gets asked. */
function showHelp() {
  $('#modal-title').textContent = 'How to use the map editor';
  $('#modal-body').innerHTML = `
    <div class="help">
      <h3>The short version</h3>
      <ol>
        <li>Drag things where you want them.</li>
        <li>Click <b>Save to map-data.js</b>.</li>
        <li>Reload the game tab to see it.</li>
      </ol>
      <p>You cannot break the game by dragging. Positions are the only thing
         this tool can change.</p>

      <h3>Moving things</h3>
      <p>Click and drag any node. The small gold circle is the spot it is
         actually pinned to — the artwork around it is usually much bigger, so
         judge position by the circle, not the picture.</p>
      <p>For fine adjustment, click a node once and use the <b>arrow keys</b>.
         Each press moves it a tiny amount; hold <b>Shift</b> for bigger steps.</p>

      <h3>Walking routes</h3>
      <p>A route is the path the explorer walks between two places, so you can
         keep her out of lakes and off mountains.</p>
      <p><b>Every pair of places is already joined by a straight line.</b> You
         don't create routes — you bend the ones that need bending.</p>
      <ol>
        <li>Click <b>Routes</b> at the top of the right-hand panel.</li>
        <li>Click the two places you want the route between — or pick the pair
            from the Routes list below.</li>
        <li>The line lights up yellow. <b>Click the line</b> to add a bend
            wherever you clicked, then drag bends to shape it.</li>
        <li>Click a bend and press Delete to remove it. Remove them all and it
            goes back to a straight line.</li>
      </ol>
      <p>Routes work in both directions — shape it once and the walk back
         follows the same path in reverse.</p>
      <p>The gold circle marked <b>spawn</b> is where the player arrives on that
         map. It counts as a place, so you can route from it, and you can drag
         it if they're landing somewhere awkward.</p>

      <h3>Adding a node</h3>
      <p><b>+ Add Node</b> → pick a picture → give it a name. It appears in the
         middle of the map; drag it where you want. A node is either a
         <b>battle</b> or a <b>market</b> — those are the only two kinds.</p>
      <p class="warn"><b>Important:</b> a node you add will look right and
         animate, but <b>nothing happens when a player clicks it</b>. Making it
         open a shop or start a battle still needs a programming change. The
         Inspector tells you which nodes are in that state. Adding it here is
         step one of two — tell Claude what it should do and it wires up the rest.</p>

      <h3>Scenery</h3>
      <p><b>+ Add Scenery</b> drops in topography — huts, granaries, ruins. It's
         decorative: never clickable, always painted behind the nodes. You can
         rotate and mirror each piece so a row of huts doesn't look stamped out,
         and <b>Duplicate</b> is the quick way to dot a riverbank.</p>

      <h3>The story slider — this is the important one</h3>
      <p>The slider under the map is <b>when</b>. Drag it and the map rebuilds
         to show that point in the game.</p>
      <p>Every node and every piece of scenery can be set to
         <b>appear from</b> a story moment and <b>disappear at</b> one. That's
         how a region has a locked version and an unlocked version without you
         building it twice:</p>
      <ol>
        <li>Scenery with no settings shows the whole game long.</li>
        <li>Egypt's plain mud huts <i>disappear at</i> "Nebuchadnezzar defeated".</li>
        <li>The grand houses <i>appear from</i> that same moment.</li>
        <li>So the settlement visibly grows up the moment Egypt opens.</li>
      </ol>
      <p>Things that haven't appeared yet are shown faded, so you can still drag
         them into position long before the player will ever see them. Tick
         <b>hide what's not visible yet</b> to see the map exactly as a player
         would at that moment.</p>
      <h3>Adding story moments</h3>
      <p>Click <b>Edit story…</b> next to the slider. You'll see every moment in
         order, what makes each one happen, and how many things depend on it.</p>
      <p>To add one, give it a name and pick <b>which battle</b> it follows and
         <b>which win</b>:</p>
      <ul>
        <li><b>Serf</b> — opens the next node <i>on the same map</i>.</li>
        <li><b>Giant</b> — opens the <i>next region</i>. Use this for the last
            battle of a map.</li>
      </ul>
      <p>That's the whole rule, and picking it here is all it takes — the game
         already records those wins, so a moment made this way works with no
         programming.</p>
      <p>Use ↑ and ↓ to put it in the right place in the story. Deleting one
         tells you what depends on it first, and clears those settings for you
         if you go ahead.</p>
      <p>"Something else (needs code)" is for moments the game marks in its own
         way — the older ones in Mesopotamia work like that. Don't invent one:
         a moment nothing sets keeps its nodes hidden forever.</p>

      <h3>If you make a mess</h3>
      <p><b>Cmd + Z</b> undoes, as many times as you like, right back to how
         things were when you opened the editor. Nothing is written to disk
         until you press Save.</p>
      <p>If you already saved and want the previous version back, ask Claude —
         the file before your last save is kept automatically.</p>

      <h3>Publishing your changes</h3>
      <p>Saving updates the game on <i>this</i> computer only. Getting it onto
         the real site is a separate step — ask Claude to commit and push when
         you're happy with how things look.</p>
    </div>`;
  $('#modal-ok').hidden = true;
  const close = () => { $('#modal').hidden = true; $('#modal-ok').hidden = false; };
  $('#modal-cancel').textContent = 'Close';
  $('#modal-cancel').onclick = $('#modal-x').onclick = () => {
    close();
    $('#modal-cancel').textContent = 'Cancel';
  };
  $('#modal').hidden = false;
}

/* ── Art picker modal ─────────────────────────────────────────────────── */
function pickArt(title, list, onOk) {
  const modal = $('#modal');
  let chosen = null;
  $('#modal-title').textContent = title;
  $('#modal-ok').disabled = true;

  if (!list.length) {
    $('#modal-body').innerHTML = '<p class="note">No image files found in that folder.</p>';
  } else {
    $('#modal-body').innerHTML = `<div class="art-grid">${list.map((a, i) =>
      `<div class="art" data-i="${i}"><img src="/${a.path}" alt=""><span>${esc(a.name)}</span></div>`
    ).join('')}</div>`;
    $$('#modal-body .art').forEach(el => {
      el.onclick = () => {
        $$('#modal-body .art').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        chosen = list[Number(el.dataset.i)];
        $('#modal-ok').disabled = false;
      };
    });
  }

  const close = () => {
    modal.hidden = true;
    $('#modal-ok').onclick = $('#modal-cancel').onclick = $('#modal-x').onclick = null;
  };
  $('#modal-cancel').onclick = $('#modal-x').onclick = close;
  $('#modal-ok').onclick = () => { if (!chosen) return; close(); onOk(chosen); };
  modal.hidden = false;
}

/* ── Save ─────────────────────────────────────────────────────────────── */
async function save() {
  $('#btn-save').disabled = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    const out = await res.json();
    if (!out.ok) { $('#btn-save').disabled = false; return toast(out.error, true); }
    dirty = false;
    $('#dirty').hidden = true;
    toast(`Saved — ${out.maps} maps, ${out.nodes} nodes. Reload the game to see it.`);
  } catch (e) {
    $('#btn-save').disabled = false;
    toast('Save failed: ' + e.message, true);
  }
}

/* ── Toast ────────────────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = bad ? 'bad' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3200);
}

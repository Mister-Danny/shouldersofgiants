import { $, $$, esc, fmt } from '../shared/utils.js';
import { State, markDirty } from './state.js';
import { endpointsOf, findRoute, routePoints, sameRoute } from './routes.js';
import { visibleNow } from './milestones.js';
import { selectMap, snapshot, snapshotOnce } from './commands.js';
import { beginDrag } from './drag.js';
import { renderInspector } from './inspector.js';

/* ── Render ───────────────────────────────────────────────────────────────
   Reads State and paints the DOM. Imports commands.js (to wire a tab click
   or a framing-panel edit to a mutation), drag.js (to wire pointerdown) and
   inspector.js (to paint the inspector panel) — all three sit below this
   module in the graph, so none of them import render.js back; anything down
   there that needs a repaint calls requestRender() (shared/notify.js)
   instead, which app.js wires to render() once, at boot. */

/* ── Map tabs ─────────────────────────────────────────────────────────── */
function buildTabs() {
  const nav = $('#map-tabs');
  nav.innerHTML = '';
  Object.keys(State.maps).forEach(id => {
    const b = document.createElement('button');
    b.textContent = State.maps[id].displayName || id;
    b.className = id === State.mapId ? 'on' : '';
    b.onclick = () => selectMap(id);
    nav.appendChild(b);
  });
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
  sc.max = Math.max(0, (State.doc.milestones || []).length - 1);
  sc.value = Math.min(State.scrubIdx, Number(sc.max));
  State.scrubIdx = Number(sc.value);
  sc.oninput = () => { State.scrubIdx = Number(sc.value); render(); };
  $('#preview').onchange = render;
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
  const m = State.maps[State.mapId];
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

  const ms = (State.doc.milestones || [])[State.scrubIdx];
  $('#scrub-label').textContent = ms ? (ms.label || ms.id) : '—';

  // Wipe everything except the persistent <svg> path layer.
  $$('.n, .exit, .wp, .prop, .spawn', overlay).forEach(el => el.remove());
  document.body.classList.toggle('route-mode', State.mode === 'route');

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
  el.className = 'n' + (State.sel && State.sel.type === 'node' && State.sel.id === n.id ? ' sel' : '');
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
  el.className = 'prop' + (State.sel && State.sel.type === 'prop' && State.sel.index === i ? ' sel' : '');
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
  el.className = 'spawn' + (State.sel && State.sel.type === 'spawn' ? ' sel' : '');
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
  el.className = 'exit' + (State.sel && State.sel.type === 'exit' && State.sel.id === x.id ? ' sel' : '');
  el.dataset.id = x.id;
  el.style.left   = x.zone.x + '%';
  el.style.top    = x.zone.y + '%';
  el.style.width  = x.zone.w + '%';
  el.style.height = x.zone.h + '%';
  el.textContent  = x.label || x.id;
  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'exit', id: x.id }));
  return el;
}

function renderPaths() {
  const svg = $('#paths');
  svg.innerHTML = '';
  const m = State.maps[State.mapId];
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
    if (State.routeSel && sameRoute(r, State.routeSel)) return;      // drawn highlighted below
    const pts = routePoints(m, r.from, r.to);
    if (pts) line(pts, '#6fd47a', 1.5, 0.4, '4 3');
  });

  if (State.routeSel) {
    const pts = routePoints(m, State.routeSel.from, State.routeSel.to);
    if (pts) line(pts, '#f8d000', 2.5, 1, null);
  }
}

/* Handles for the selected route's bends. */
function renderWaypoints() {
  if (!State.routeSel) return;
  const m = State.maps[State.mapId];
  const r = findRoute(m, State.routeSel.from, State.routeSel.to);
  if (!r) return;
  let wps = (r.waypoints || []);
  // Displayed in travel order, which may be the reverse of storage order.
  const reversed = r.to !== State.routeSel.to;
  const view = reversed ? wps.slice().reverse() : wps;
  view.forEach((p, i) => {
    const storeIndex = reversed ? wps.length - 1 - i : i;
    const el = document.createElement('div');
    el.className = 'wp' + (State.sel && State.sel.type === 'wp' && State.sel.wpIndex === storeIndex ? ' sel' : '');
    el.style.left = p.x + '%';
    el.style.top  = p.y + '%';
    el.title = `bend ${i + 1} of ${view.length}`;
    el.addEventListener('pointerdown', e => beginDrag(e, { type: 'wp', wpIndex: storeIndex }));
    $('#overlay').appendChild(el);
  });
}

/* ── Map framing ──────────────────────────────────────────────────────────
   The map area is 1280×600 — the 1280×720 stage minus the 120px HUD strip —
   and every background so far is taller in proportion than that, so
   object-fit:cover always crops some height. These controls decide WHICH
   height is lost rather than eliminating the crop, which is not possible
   without either letterboxing or art at the frame's own proportion. */
function renderFitPanel() {
  const box = $('#fit-panel');
  const m = State.maps[State.mapId];
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
    const fit = State.maps[State.mapId].imageFit || {};
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
  const m = State.maps[State.mapId];
  const nl = $('#node-list');
  nl.innerHTML = '';
  (m.nodes || []).forEach(n => {
    const li = document.createElement('li');
    li.className = State.sel && State.sel.type === 'node' && State.sel.id === n.id ? 'sel' : '';
    li.innerHTML = `<img src="/${n.image}" alt=""><span>${n.id}</span><span class="k">${n.kind || '—'}</span>`;
    li.onclick = () => { State.sel = { type: 'node', id: n.id }; render(); };
    nl.appendChild(li);
  });
  if (!(m.nodes || []).length) nl.innerHTML = '<li class="note">No nodes on this map.</li>';

  const pl = $('#prop-list');
  pl.innerHTML = '';
  (m.props || []).forEach((p, i) => {
    const li = document.createElement('li');
    li.className = State.sel && State.sel.type === 'prop' && State.sel.index === i ? 'sel' : '';
    const when = p.showUntil ? 'until ' + p.showUntil : (p.showFrom ? 'from ' + p.showFrom : 'always');
    li.innerHTML = `<img src="/${p.image}" alt=""><span>${esc(p.image.split('/').pop())}</span><span class="k">${esc(when)}</span>`;
    li.onclick = () => { State.sel = { type: 'prop', index: i }; render(); };
    pl.appendChild(li);
  });
  if (!(m.props || []).length) pl.innerHTML = '<li class="note">No scenery on this map.</li>';

  const xl = $('#exit-list');
  xl.innerHTML = '';
  (m.exits || []).forEach(x => {
    const li = document.createElement('li');
    li.className = State.sel && State.sel.type === 'exit' && State.sel.id === x.id ? 'sel' : '';
    li.innerHTML = `<span>${x.id}</span><span class="k">→ ${x.target}</span>`;
    li.onclick = () => { State.sel = { type: 'exit', id: x.id }; render(); };
    xl.appendChild(li);
  });
  if (!(m.exits || []).length) xl.innerHTML = '<li class="note">No exits on this map.</li>';
}

function renderRouteList() {
  const ul = $('#route-list');
  if (!ul) return;
  ul.innerHTML = '';
  const m = State.maps[State.mapId];
  if (State.mode !== 'route') {
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
      (State.routeSel && sameRoute({ from: a, to: b }, State.routeSel) ? 'sel' : '');
    li.innerHTML = `<span>${esc(a)} → ${esc(b)}</span>
      <span class="k">${bends ? bends + ' bend' + (bends > 1 ? 's' : '') : 'straight'}</span>`;
    li.onclick = () => { State.routeSel = { from: a, to: b }; State.routePick = null; State.sel = null; render(); };
    ul.appendChild(li);
  });
}

function updateHint() {
  $('#hint').textContent = State.mode === 'route'
    ? (State.routeSel
        ? `Editing ${State.routeSel.from} → ${State.routeSel.to}. Click the line to add a bend, drag bends to shape it, Delete to remove one.`
        : (State.routePick ? `From ${State.routePick} — now click the other end.`
                     : 'Click two places to pick the route between them.'))
    : 'Drag to move. Arrows nudge 0.1%, Shift+arrows 1%. Cmd/Ctrl+Z undo, Cmd/Ctrl+S save.';
  $('#mode-note').textContent = State.mode === 'route'
    ? 'Every pair of places is a straight line until you bend it. Only the ones you shape get stored.'
    : 'Drag nodes to reposition. Arrow keys nudge by 0.1%, Shift+arrows by 1%.';
}

export { render, buildTabs, buildScrubber };

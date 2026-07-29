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
let maps      = null;      // the whole SOG_MAP_DATA object, edited in place
let mapId     = null;      // which region is on screen
let mode      = 'select';  // 'select' | 'path'
let sel       = null;      // { type:'node'|'exit'|'wp', id, wpIndex? }
let dirty     = false;
let art       = { maps: [], nodes: [] };
const undoStack = [];

/* Nodes whose art size the game overrides in CSS rather than via `scale`.
   Replicated in editor.css; listed here so the inspector can explain itself. */
const CSS_SIZED = { 'egypt-signpost': '126px (hard-coded in css/style.css)' };

/* ── Boot ─────────────────────────────────────────────────────────────── */
(async function boot() {
  try {
    maps = await loadMapData();
    art  = await fetch('/api/art').then(r => r.json());
  } catch (e) {
    return toast('Could not load map data: ' + e.message, true);
  }
  buildTabs();
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
  return w.SOG_MAP_DATA;
}

/* ── Undo ─────────────────────────────────────────────────────────────── */
/* Snapshot BEFORE a mutation. Drags snapshot once on pointerdown, not per
   pixel, so one undo steps back a whole drag rather than one frame of it. */
function snapshot() {
  undoStack.push(JSON.stringify(maps));
  if (undoStack.length > 60) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  maps = JSON.parse(undoStack.pop());
  if (!maps[mapId]) mapId = Object.keys(maps)[0];
  sel = null;
  buildTabs(); render(); markDirty();
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

/* ── Render ───────────────────────────────────────────────────────────── */
function render() {
  const m = maps[mapId];
  const overlay = $('#overlay');
  const bg = $('#bg');

  $('#empty-note').hidden = !!m;
  if (!m) return;

  bg.src = '/' + m.image;

  /* Egypt's background is zoomed in the GAME (overworld.js: translateY(-4%)
     scale(1.08)) on the IMAGE ONLY — the node overlay is untransformed. We
     replicate it here so the art you position against is the art the player
     sees. Any new map gets no transform, matching the game's `if (mapId ===
     'egypt')` hard-code. */
  if (mapId === 'egypt') {
    bg.style.objectPosition  = 'center top';
    bg.style.transformOrigin = 'center top';
    bg.style.transform       = 'translateY(-4%) scale(1.08)';
  } else {
    bg.style.objectPosition = bg.style.transformOrigin = bg.style.transform = '';
  }

  // Wipe everything except the persistent <svg> path layer.
  $$('.n, .exit, .wp', overlay).forEach(el => el.remove());

  (m.nodes || []).forEach(n => overlay.appendChild(nodeEl(n)));
  (m.exits || []).forEach(x => overlay.appendChild(exitEl(x)));

  renderPaths();
  renderWaypoints();
  renderLists();
  renderInspector();
  updateHint();
}

function nodeEl(n) {
  const el = document.createElement('div');
  el.className = 'n' + (sel && sel.type === 'node' && sel.id === n.id ? ' sel' : '');
  el.dataset.id = n.id;
  el.style.left = n.x + '%';
  el.style.top  = n.y + '%';
  if (n.scale) el.style.transform = `translate(-50%,-50%) scale(${n.scale})`;

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

/* Walk paths, drawn in the SVG layer. viewBox is 0 0 100 100 with
   preserveAspectRatio="none", so SVG units ARE percentages — no conversion.
   non-scaling-stroke keeps the line from being squashed by that same
   non-uniform scale. */
function renderPaths() {
  const svg = $('#paths');
  svg.innerHTML = '';
  (maps[mapId].nodes || []).forEach(n => {
    if (!n.path || n.path.length < 2) return;
    const active = sel && sel.id === n.id;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', n.path.map(p => `${p.x},${p.y}`).join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', active ? '#f8d000' : '#6fd47a');
    line.setAttribute('stroke-width', active ? 2 : 1.5);
    line.setAttribute('stroke-opacity', active ? 1 : 0.55);
    line.setAttribute('stroke-dasharray', '4 3');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
  });
}

/* Waypoint handles only appear for the selected node — showing every waypoint
   on every node at once turns Mesopotamia into confetti.
   Note the 'wp' case: selecting a waypoint must KEEP the node's handles on
   screen, otherwise grabbing one makes the whole path vanish mid-drag. */
function renderWaypoints() {
  if (!sel || (sel.type !== 'node' && sel.type !== 'wp')) return;
  const n = node(sel.id);
  if (!n || !n.path) return;
  n.path.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'wp' + (sel.wpIndex === i ? ' sel' : '');
    el.style.left = p.x + '%';
    el.style.top  = p.y + '%';
    el.title = `waypoint ${i + 1} of ${n.path.length} — ${fmt(p.x)}, ${fmt(p.y)}`;
    el.addEventListener('pointerdown', e => beginDrag(e, { type: 'wp', id: n.id, wpIndex: i }));
    $('#overlay').appendChild(el);
  });
}

function renderLists() {
  const m = maps[mapId];
  const nl = $('#node-list');
  nl.innerHTML = '';
  (m.nodes || []).forEach(n => {
    const li = document.createElement('li');
    // 'wp' counts as the node being selected — you are still editing that node.
    li.className = sel && (sel.type === 'node' || sel.type === 'wp') && sel.id === n.id ? 'sel' : '';
    li.innerHTML = `<img src="/${n.image}" alt=""><span>${n.id}</span><span class="k">${n.kind || '—'}</span>`;
    li.onclick = () => { sel = { type: 'node', id: n.id }; render(); };
    nl.appendChild(li);
  });
  if (!(m.nodes || []).length) nl.innerHTML = '<li class="note">No nodes on this map.</li>';

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
  if (mode === 'path' && target.type === 'node') return;   // path mode: select only

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

function currentPos(t) {
  if (t.type === 'node') { const n = node(t.id); return { x: n.x, y: n.y }; }
  if (t.type === 'exit') { const x = exit(t.id); return { x: x.zone.x, y: x.zone.y }; }
  return node(t.id).path[t.wpIndex];
}

function setPos(t, x, y) {
  if (t.type === 'node')      { const n = node(t.id); n.x = r2(x); n.y = r2(y); }
  else if (t.type === 'exit') { const e = exit(t.id); e.zone.x = r2(x); e.zone.y = r2(y); }
  else                        { const p = node(t.id).path[t.wpIndex]; p.x = r2(x); p.y = r2(y); }
}

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
    if (mode === 'path') {
      if (!sel || sel.type !== 'node') return toast('Select a node first — the path leads to it');
      const p = pct(e);
      snapshot();
      const n = node(sel.id);
      n.path = n.path || [];
      n.path.push({ x: r2(p.x), y: r2(p.y) });
      sel = { type: 'node', id: n.id, wpIndex: n.path.length - 1 };
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
  if (sel.type === 'wp' || (sel.type === 'node' && sel.wpIndex != null)) {
    const n = node(sel.id);
    snapshot();
    n.path.splice(sel.wpIndex, 1);
    if (!n.path.length) delete n.path;
    sel = { type: 'node', id: n.id };
    markDirty(); return render();
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

function updateHint() {
  $('#hint').textContent = mode === 'path'
    ? 'Path mode — select a node, then click the map to lay waypoints toward it. Drag to adjust, Delete to remove.'
    : 'Drag to move. Arrows nudge 0.1%, Shift+arrows 1%. Cmd/Ctrl+Z undo, Cmd/Ctrl+S save.';
  $('#mode-note').textContent = mode === 'path'
    ? 'Waypoints are the route the sprite walks TO the node. The last waypoint should sit on the node itself.'
    : 'Drag nodes to reposition. Arrow keys nudge by 0.1%, Shift+arrows by 1%.';
}

/* ── Inspector ────────────────────────────────────────────────────────── */
function renderInspector() {
  const box = $('#inspector');
  if (!sel) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  if (sel.type === 'exit') return renderExitInspector(box, exit(sel.id));
  const n = node(sel.id);
  if (!n) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }

  box.innerHTML = `
    <div class="f"><label>id</label><input id="i-id" value="${esc(n.id)}"></div>
    <div class="f"><label>name</label><input id="i-name" value="${esc(n.name || '')}"></div>
    <div class="f"><label>kind</label>
      <select id="i-kind">
        ${['battle', 'market', 'signpost', 'landmark'].map(k =>
          `<option ${k === (n.kind || 'battle') ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
    </div>
    <div class="f2">
      <div class="f"><label>x %</label><input id="i-x" type="number" step="0.1" value="${n.x}"></div>
      <div class="f"><label>y %</label><input id="i-y" type="number" step="0.1" value="${n.y}"></div>
    </div>
    <div class="f2">
      <div class="f"><label>scale</label><input id="i-scale" type="number" step="0.05" value="${n.scale ?? ''}" placeholder="1"></div>
      <div class="f"><label class="chk"><input id="i-flip" type="checkbox" ${n.flipX ? 'checked' : ''}> flipX</label></div>
    </div>
    <div class="f"><label>image</label><input id="i-image" value="${esc(n.image)}"></div>
    <div class="f"><label>note (survives saving)</label><textarea id="i-note">${esc(n.note || '')}</textarea></div>
    <p class="note">${(n.path || []).length} path waypoint(s).</p>
    ${pathEndWarning(n)}
    ${CSS_SIZED[n.id] ? `<p class="warn">This node's art size is ${CSS_SIZED[n.id]}, not by <code>scale</code>. Changing scale here will not match the game until that CSS rule is removed.</p>` : ''}
    <p class="warn"><b>kind is not wired up yet.</b> The game still dispatches clicks on literal node id in <code>onNodeClick</code>, so a node added here renders but does nothing when clicked until Phase 2.</p>
    <div class="rowbtns">
      <button class="ghost sm" id="i-clearpath">Clear path</button>
      <button class="danger" id="i-del">Delete node</button>
    </div>`;

  const snapBtn = $('#i-snapend');
  if (snapBtn) snapBtn.onclick = () => {
    snapshot();
    n.path[n.path.length - 1] = { x: n.x, y: n.y };
    markDirty(); render();
  };

  bind('#i-id',    'input', v => { renameNode(n, v); });
  bind('#i-name',  'input', v => { n.name = v; });
  bind('#i-kind',  'change', v => { n.kind = v; });
  bind('#i-x',     'input', v => { n.x = Number(v); render(); });
  bind('#i-y',     'input', v => { n.y = Number(v); render(); });
  bind('#i-scale', 'input', v => { if (v === '') delete n.scale; else n.scale = Number(v); render(); });
  bind('#i-image', 'input', v => { n.image = v; render(); });
  bind('#i-note',  'input', v => { if (v) n.note = v; else delete n.note; });
  $('#i-flip').onchange = e => { if (e.target.checked) n.flipX = true; else delete n.flipX; markDirty(); render(); };
  $('#i-clearpath').onclick = () => { snapshot(); delete n.path; markDirty(); render(); };
  $('#i-del').onclick = () => deleteSelection();
}

/* A walk path is the route the sprite takes TO the node, so its last waypoint
   has to land on the node. If it doesn't, the sprite visibly walks past and
   stops short — and because the game silently falls back to the node's own
   coords when there is no path at all, this failure only shows up for nodes
   that HAVE one. Cheap to detect here, maddening to debug in-game. */
function pathEndWarning(n) {
  if (!n.path || !n.path.length) return '';
  const last = n.path[n.path.length - 1];
  const off = Math.hypot(last.x - n.x, last.y - n.y);
  if (off <= 1) return '';
  return `<p class="warn">The path ends ${off.toFixed(1)}% away from the node
    (${fmt(last.x)},${fmt(last.y)} vs ${fmt(n.x)},${fmt(n.y)}), so the sprite will
    stop short of it. <button class="ghost sm" id="i-snapend">Snap end to node</button></p>`;
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
    <p class="note">entryAt is where the player lands on the <b>target</b> map, so it is a coordinate in ${esc(x.target)}'s space, not this one.</p>
    <div class="rowbtns"><button class="danger" id="e-del">Delete exit</button></div>`;

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
      nodes: [],
      exits: []
    };
    markDirty();
    buildTabs();
    selectMap(id);
    toast(`Created "${id}". Add nodes, then an exit from an existing map to reach it.`);
  });
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
      body: JSON.stringify(maps)
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

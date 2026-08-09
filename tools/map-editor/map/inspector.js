import { $, esc, r2 } from '../shared/utils.js';
import { requestRender } from '../shared/notify.js';
import { requestConfigureLevel } from '../shared/navigate.js';
import { State, CSS_SIZED, markDirty, node, exit, prop } from './state.js';
import { bind, snapshot, snapshotOnce, deleteSelection } from './commands.js';
// Read-only cross-reference into the OTHER document, purely to know whether
// this node already has a level authored — never mutated from here, and
// level/state.js has zero imports of its own, so this can't become a cycle.
import { State as levelState } from '../level/state.js';

/* ── Inspector ────────────────────────────────────────────────────────────
   Painted BY render.js (render() calls renderInspector as its last step —
   render.js imports this module), but every field edit here needs its own
   repaint too (moving a node's x also has to move its dot on the stage).
   Calling render() back would be the cycle; requestRender() is the seam. */

function renderInspector() {
  const box = $('#inspector');
  if (!State.sel) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  if (State.sel.type === 'exit') return renderExitInspector(box, exit(State.sel.id));
  if (State.sel.type === 'prop') return renderPropInspector(box, prop(State.sel.index), State.sel.index);
  const n = node(State.sel.id);
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
  bind('#i-x',     'input', v => { n.x = Number(v); requestRender(); });
  bind('#i-y',     'input', v => { n.y = Number(v); requestRender(); });
  bind('#i-scale', 'input', v => { if (v === '') delete n.scale; else n.scale = Number(v); requestRender(); });
  bind('#i-rot',   'input', v => { const r = Number(v); if (r) n.rotation = r; else delete n.rotation; requestRender(); });
  bind('#i-image', 'input', v => { n.image = v; requestRender(); });
  bind('#i-note',  'input', v => { if (v) n.note = v; else delete n.note; });
  $('#i-flip').onchange = e => { if (e.target.checked) n.flipX = true; else delete n.flipX; markDirty(); requestRender(); };
  $('#i-del').onclick = () => deleteSelection();
  const cfgBtn = $('#i-configure-level');
  if (cfgBtn) cfgBtn.onclick = () => requestConfigureLevel(n.id, n.kind);
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
  if (t) t.onchange = () => { snapshot(); n.tiers = Number(t.value); markDirty(); requestRender(); };
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
  const ms = (State.doc.milestones || []).find(m => m.id === n.showFrom);
  if (!ms || !ms.flag) return '';
  const m = /^sog_node_(.+)_(serf|giant)_beaten$/.exec(ms.flag);
  if (!m) return '';                       // a derived flag; the rule can't be read off it
  const [, hook, tier] = m;
  // Which map does that boss live on?
  let srcMap = null;
  for (const [id, map] of Object.entries(State.doc.maps))
    if ((map.nodes || []).some(x => x.hook === hook)) srcMap = id;
  if (!srcMap || srcMap === State.mapId) return '';
  if (tier === 'giant') return '';
  return `<p class="warn">This node is on <b>${esc(State.mapId)}</b> but opens on
    <b>${esc(hook)}'s Serf win</b>, and ${esc(hook)} is on <b>${esc(srcMap)}</b>.
    Crossing into a new region is supposed to require the <b>Giant</b> win —
    as written, the player reaches ${esc(State.mapId)} without beating ${esc(hook)}'s
    hard tier.</p>`;
}

/* showFrom / showUntil dropdowns. Every node, exit and prop gets these — this
   is how the locked pass-through version of a region and the fully-unlocked one
   are authored, without storing two copies of the map. */
function gateFields(o) {
  const opts = (sel2, blank) =>
    `<option value="">${blank}</option>` +
    (State.doc.milestones || []).map(m =>
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
  if (f) f.onchange = () => { snapshot(); if (f.value) o.showFrom = f.value; else delete o.showFrom; markDirty(); requestRender(); };
  if (u) u.onchange = () => { snapshot(); if (u.value) o.showUntil = u.value; else delete o.showUntil; markDirty(); requestRender(); };
}

/* Whether the game has a click handler for this node id. The editor cannot make
   a node DO anything by itself — onNodeClick dispatches on literal id — so
   saying so per-node is more useful than a blanket warning. As of the level
   editor, "wired" has two independent sources: this hand-maintained set of
   ids overworld.js's if-chain still handles directly, OR a data-driven entry
   in level-data.js (onNodeClick checks that FIRST, unconditionally, before
   ever reaching this list — see js/overworld.js). Only 'battle' offers the
   Configure/Edit path: 'market' levels aren't wired in js/level-runtime.js
   yet, so pairing one would be a dead end the level form can't save. */
const WIRED_NODES = new Set([
  'walls-of-uruk', 'market', 'sargon', 'hammurabi', 'hanging-gardens',
  'double-crown', 'egypt-market', 'prehistory', 'egypt-signpost'
]);
function src2(n) {
  const hasLevel = n.kind === 'battle' && !!(levelState.levels && levelState.levels[n.id]);
  const wired = WIRED_NODES.has(n.id) || hasLevel;
  let html = wired ? '' : `<p class="warn"><b>Nothing happens when this node is clicked.</b>
    The game dispatches clicks on literal node id in <code>onNodeClick</code>, and
    there is no branch for <code>${esc(n.id)}</code> yet. Position it here, then ask
    Claude to wire up the ${esc(n.kind || 'battle')}.</p>`;
  if (n.kind === 'battle') {
    html += `<div class="rowbtns"><button class="ghost sm" id="i-configure-level">${hasLevel ? 'Edit' : 'Configure'} battle →</button></div>`;
  }
  return html;
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

  bind('#p-image', 'input',  v => { p.image = v; requestRender(); });
  bind('#p-x',     'input',  v => { p.x = Number(v); requestRender(); });
  bind('#p-y',     'input',  v => { p.y = Number(v); requestRender(); });
  bind('#p-scale', 'input',  v => { p.scale = Number(v); requestRender(); });
  bind('#p-rot',   'input',  v => { p.rotation = Number(v); requestRender(); });
  bind('#p-note',  'input',  v => { if (v) p.note = v; else delete p.note; });
  $('#p-fx').onchange = e => { snapshot(); if (e.target.checked) p.flipX = true; else delete p.flipX; markDirty(); requestRender(); };
  $('#p-fy').onchange = e => { snapshot(); if (e.target.checked) p.flipY = true; else delete p.flipY; markDirty(); requestRender(); };
  bindGates(p);

  // Duplicating is the fastest way to dot a river with huts — offset slightly so
  // the copy is visible rather than hidden exactly behind the original.
  $('#p-dup').onclick = () => {
    snapshot();
    const copy = JSON.parse(JSON.stringify(p));
    copy.x = r2(Math.min(100, p.x + 3));
    copy.y = r2(Math.min(100, p.y + 3));
    State.maps[State.mapId].props.splice(i + 1, 0, copy);
    State.sel = { type: 'prop', index: i + 1 };
    markDirty(); requestRender();
  };
  $('#p-del').onclick = () => {
    snapshot();
    State.maps[State.mapId].props.splice(i, 1);
    State.sel = null; markDirty(); requestRender();
  };
}

function renderExitInspector(box, x) {
  if (!x) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  box.innerHTML = `
    <div class="f"><label>id</label><input id="e-id" value="${esc(x.id)}"></div>
    <div class="f"><label>label</label><input id="e-label" value="${esc(x.label || '')}"></div>
    <div class="f"><label>target map</label>
      <select id="e-target">
        ${Object.keys(State.maps).map(k => `<option ${k === x.target ? 'selected' : ''}>${k}</option>`).join('')}
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
  bind('#e-id',     'input', v => { x.id = v; requestRender(); });
  bind('#e-label',  'input', v => { x.label = v; requestRender(); });
  bind('#e-target', 'change', v => { x.target = v; requestRender(); });
  [['zx', 'zone', 'x'], ['zy', 'zone', 'y'], ['zw', 'zone', 'w'], ['zh', 'zone', 'h'],
   ['wx', 'walkTo', 'x'], ['wy', 'walkTo', 'y'], ['ex', 'entryAt', 'x'], ['ey', 'entryAt', 'y']]
    .forEach(([id, obj, key]) => bind('#e-' + id, 'input', v => { x[obj][key] = Number(v); requestRender(); }));
  $('#e-del').onclick = () => deleteSelection();
}

/* Renaming is riskier than it looks — the id is the join key between this data
   and every behaviour hook in overworld.js. Warn once, then allow it. */
function renameNode(n, next) {
  if (!next || next === n.id) return;
  n.id = next;
  if (State.sel) State.sel.id = next;
  markDirty();
  requestRender();
}

export { renderInspector, renderPropInspector, renderExitInspector, gateFields };

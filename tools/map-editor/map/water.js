import { $, esc, pct, r2 } from '../shared/utils.js';
import { toast } from '../shared/toast.js';
import { requestRender } from '../shared/notify.js';
import { State, markDirty } from './state.js';
import { snapshot } from './commands.js';
import { beginDrag } from './drag.js';
import { standPos } from './routes.js';

/* ── Water ────────────────────────────────────────────────────────────────
   Where the Explorer may NOT walk: each map's `water` grid (generated from
   the art, fixed here by hand) and its river `crossings`. The grid maths —
   codec, crossings, reachability, auto-placement — is js/water-grid.js, the
   same file the game runs, loaded as a classic script (window.SOG.WaterGrid)
   so the editor can never disagree with the game about what is blocked.

   Water mode tools:
     paint     brush water onto the grid
     erase     brush it off
     crossing  click to add a river crossing (drag one to move it, Delete to
               remove it; its radius is in the inspector)
   "Auto-place crossings" adds the fewest crossings that make every node,
   exit, the spawn and every arrival point reachable from every other. */

const WG = () => window.SOG && window.SOG.WaterGrid;

// Walk stops that are not nodes or exits — scripted in js/overworld.js
// (the D1 arrivals and the D2a river stop). Kept in step by hand.
const SCRIPTED = {
  egypt: [{ x: 10, y: 85 }],
  mesopotamia: [{ x: 10, y: 85 }, { x: 66, y: 65 }]
};

export const Water = { tool: 'paint', brush: 2, show: false };

/* Decoded grid for the current map, cached against its rle string. */
let cache = { mapId: null, rle: null, grid: null };
function grid() {
  const m = State.maps[State.mapId], W = WG();
  if (!W || !m) return null;
  const rle = m.water ? m.water.rle : '';
  if (cache.mapId !== State.mapId || cache.rle !== rle || !cache.grid) {
    cache = { mapId: State.mapId, rle, grid: W.fromMap(m) };
  }
  return cache.grid;
}
function store(g) {
  const m = State.maps[State.mapId];
  m.water = { cell: g.cell, rle: WG().encode(g.water) };
  cache.rle = m.water.rle;
}

export function waterVisible() { return State.mode === 'water' || Water.show; }

/* ── Paint ─────────────────────────────────────────────────────────────── */
export function renderWater() {
  const cv = $('#water-cv');
  const g = waterVisible() ? grid() : null;
  cv.hidden = !g;
  document.querySelectorAll('#overlay .crossing').forEach(el => el.remove());
  if (!g) return;
  // Recompute the cleared cells from the current crossings every paint —
  // cheap, and dragging a crossing shows its effect live.
  const m = State.maps[State.mapId];
  const blocked = new Uint8Array(g.water);
  (m.crossings || []).forEach(x => g.disk(blocked, x, x.r || WG().DEFAULT_R, 0));
  cv.width = g.cols; cv.height = g.rows;
  const cx = cv.getContext('2d'), img = cx.createImageData(g.cols, g.rows), d = img.data;
  for (let i = 0; i < g.n; i++) {
    if (!g.water[i]) continue;
    const ford = !blocked[i];
    d[i * 4] = ford ? 40 : 235; d[i * 4 + 1] = ford ? 220 : 30; d[i * 4 + 2] = ford ? 230 : 90;
    d[i * 4 + 3] = ford ? 150 : 115;
  }
  cx.putImageData(img, 0, 0);
  (m.crossings || []).forEach((x, i) => $('#overlay').appendChild(crossingEl(x, i)));
}

function crossingEl(x, i) {
  const el = document.createElement('div');
  const r = x.r || WG().DEFAULT_R;
  el.className = 'crossing' + (State.sel && State.sel.type === 'crossing' && State.sel.index === i ? ' sel' : '');
  el.style.left = x.x + '%';
  el.style.top = x.y + '%';
  el.style.width = (2 * r / 1280 * 100) + '%';
  el.style.height = (2 * r / 600 * 100) + '%';
  el.title = `crossing ${i + 1} — drag to move, Delete to remove`;
  el.addEventListener('pointerdown', e => beginDrag(e, { type: 'crossing', index: i }));
  return el;
}

/* A bare pointerdown on the stage in water mode. */
export function waterPointerDown(e) {
  const m = State.maps[State.mapId], g = grid();
  if (!g) return toast('js/water-grid.js did not load', true);
  const p = pct(e);
  if (Water.tool === 'crossing') {
    snapshot();
    m.crossings = m.crossings || [];
    m.crossings.push({ x: r2(p.x), y: r2(p.y), r: WG().DEFAULT_R });
    State.sel = { type: 'crossing', index: m.crossings.length - 1 };
    markDirty(); requestRender();
    return;
  }
  // Brush: paint (or erase — also Alt held) a disk of cells, one undo per stroke.
  const v = Water.tool === 'erase' || e.altKey ? 0 : 1;
  const rPx = (Water.brush - 0.5) * g.cell;
  snapshot();
  State.sel = null;
  // Dab every half cell along the stroke, so a fast drag leaves no gaps.
  let last = null;
  const dab = ev => {
    const p = pct(ev);
    const steps = last ? Math.max(1, Math.ceil(Math.hypot((p.x - last.x) / 100 * 1280, (p.y - last.y) / 100 * 600) / (g.cell / 2))) : 1;
    for (let k = 1; k <= steps; k++) {
      const t = last ? k / steps : 1;
      g.disk(g.water, last ? { x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t } : p, rPx, v);
    }
    last = p;
    store(g); renderWater();
  };
  dab(e);
  const move = ev => dab(ev);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', () => {
    window.removeEventListener('pointermove', move);
    markDirty(); requestRender();
  }, { once: true });
}

/* ── Reachability ──────────────────────────────────────────────────────── */
function endpointsOfMap(id) {
  const m = State.maps[id], out = [{ label: 'spawn', p: m.spawn }];
  (m.nodes || []).forEach(n => out.push({ label: n.id, p: standPos(n) }));
  (m.exits || []).forEach(x => out.push({ label: x.id, p: x.walkTo }));
  Object.entries(State.maps).forEach(([oid, om]) => (om.exits || []).forEach(x => {
    if (x.target === id && x.entryAt) out.push({ label: 'arrival from ' + oid, p: x.entryAt });
  }));
  (SCRIPTED[id] || []).forEach((p, i) => out.push({ label: 'scripted stop ' + (i + 1), p }));
  return out;
}

function reachReport() {
  const g = grid(), W = WG(), m = State.maps[State.mapId];
  if (!g || !m.water) return 'No water grid on this map yet — paint one, or generate it.';
  const blocked = new Uint8Array(g.water);
  (m.crossings || []).forEach(x => g.disk(blocked, x, x.r || W.DEFAULT_R, 0));
  const comp = W.components(blocked, g), eps = endpointsOfMap(State.mapId);
  const cells = eps.map(e => { const c = g.cellOf(e.p), f = W.nearestFree(blocked, g, c.c, c.r); return f ? comp[f.r * g.cols + f.c] : -1; });
  const main = cells[0], wet = eps.filter(e => W.inWater(blocked, g, e.p)).map(e => e.label);
  const cut = eps.filter((e, i) => cells[i] !== main).map(e => e.label);
  let s = cut.length ? `<b>Cut off:</b> ${esc(cut.join(', '))}.` : `All ${eps.length} places reachable.`;
  if (wet.length) s += ` <b>In the water</b> (she stops on the shore): ${esc(wet.join(', '))}.`;
  return s;
}

function autoPlace(replace) {
  const m = State.maps[State.mapId], W = WG();
  if (!m.water) return toast('No water grid on this map yet', true);
  snapshot();
  if (replace) m.crossings = [];
  const res = W.autoCrossings(m, endpointsOfMap(State.mapId).map(e => e.p));
  m.crossings = (m.crossings || []).concat(res.crossings);
  markDirty(); requestRender();
  toast(res.crossings.length ? `Added ${res.crossings.length} crossing(s)` : 'Nothing to add — everything is reachable');
}

/* ── Sidebar panel ─────────────────────────────────────────────────────── */
export function renderWaterPanel() {
  const box = $('#water-panel');
  if (!box) return;
  const m = State.maps[State.mapId];
  if (State.mode !== 'water') {
    box.innerHTML = `<label class="chk"><input id="w-show" type="checkbox" ${Water.show ? 'checked' : ''}> show water + crossings</label>`;
    $('#w-show').onchange = e => { Water.show = e.target.checked; requestRender(); };
    return;
  }
  const tools = [['paint', 'Paint water'], ['erase', 'Erase'], ['crossing', 'Add crossing']];
  box.innerHTML = `
    <div class="seg" id="w-tools">${tools.map(([k, l]) =>
      `<button data-tool="${k}" class="${Water.tool === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="f"><label>brush</label>
      <select id="w-brush">${[1, 2, 3, 5, 8].map(b =>
        `<option value="${b}" ${b === Water.brush ? 'selected' : ''}>${b} cell${b > 1 ? 's' : ''} (${b * 4}px)</option>`).join('')}
      </select></div>
    <p class="note">Alt-drag erases with any brush. ${(m.crossings || []).length} crossing(s) on this map.</p>
    <p class="note" id="w-reach">${reachReport()}</p>
    <div class="rowbtns">
      <button class="ghost sm" id="w-auto" title="Add the fewest crossings that connect every place, keeping yours">Auto-place crossings</button>
      <button class="ghost sm" id="w-replace" title="Delete every crossing on this map and place them again">Re-place all</button>
    </div>`;
  box.querySelectorAll('#w-tools button').forEach(b => {
    b.onclick = () => { Water.tool = b.dataset.tool; requestRender(); };
  });
  $('#w-brush').onchange = e => { Water.brush = Number(e.target.value); };
  $('#w-auto').onclick = () => autoPlace(false);
  $('#w-replace').onclick = () => {
    if (confirm('Delete every crossing on this map and place them again from scratch?')) autoPlace(true);
  };
}

/* ── Selection: a crossing (its drag/nudge kind lives in commands.js KINDS) ── */
export function deleteCrossing(index) {
  const m = State.maps[State.mapId];
  snapshot();
  m.crossings.splice(index, 1);
  State.sel = null; markDirty(); requestRender();
}

export function renderCrossingInspector(box, index) {
  const x = State.maps[State.mapId].crossings[index];
  if (!x) { box.innerHTML = '<p class="note">Nothing selected.</p>'; return; }
  box.innerHTML = `
    <p class="note">River crossing ${index + 1}: the Explorer may ford the river inside this circle.</p>
    <div class="f2">
      <div class="f"><label>x %</label><input id="c-x" type="number" step="0.1" value="${x.x}"></div>
      <div class="f"><label>y %</label><input id="c-y" type="number" step="0.1" value="${x.y}"></div>
    </div>
    <div class="f"><label>radius (stage px)</label><input id="c-r" type="number" step="1" min="4" value="${x.r || WG().DEFAULT_R}"></div>
    <div class="rowbtns"><button class="ghost sm" id="c-del">Delete crossing</button></div>`;
  const set = (k, v) => { snapshot(); x[k] = Number(v); markDirty(); requestRender(); };
  $('#c-x').onchange = e => set('x', e.target.value);
  $('#c-y').onchange = e => set('y', e.target.value);
  $('#c-r').onchange = e => set('r', Math.max(4, Number(e.target.value)));
  $('#c-del').onclick = () => deleteCrossing(index);
}

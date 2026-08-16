import { $, $$, fmt, clamp, pct } from '../shared/utils.js';
import { toast } from '../shared/toast.js';
import { onChange, requestRender } from '../shared/notify.js';
import { getActiveTab } from '../shared/active-tab.js';
import { State, markDirty } from './state.js';
import { insertBend } from './routes.js';
import {
  snapshot, undo, deleteSelection, currentPos, setPos,
  addNodeFlow, addPropFlow, newMapFlow
} from './commands.js';
import { render, buildTabs, buildScrubber } from './render.js';
import { showHelp, showMilestones } from './modals.js';

/* ── Map Editor entry point ──────────────────────────────────────────────
   Owns exactly the map document — its own dirty flag and undo stack live
   entirely inside State (state.js), never touched by the shell or by the
   level editor. Registers render.js's repaint as the target of the
   notify.js seam (the one thing every module below render.js calls instead
   of render() directly, to avoid an import cycle).

   `opts.onAfterRender`, if given, fires after every repaint — the shell
   uses it to refresh this tab's dirty dot without map/app.js needing to
   know the shell exists. beforeunload is NOT wired here: with two
   documents now in play, one shared listener checking both belongs to the
   shell, not to either editor. */
let onAfterRender = () => {};

export function initMapEditor(opts) {
  onAfterRender = (opts && opts.onAfterRender) || onAfterRender;
  onChange(() => { buildTabs(); buildScrubber(); render(); onAfterRender(); });
  boot();
}

/* ── Boot ─────────────────────────────────────────────────────────────── */
async function boot() {
  try {
    State.doc  = await loadMapData();
    State.maps = State.doc.maps;
    State.art  = await fetch('/api/art').then(r => r.json());
    // wiredNodeIds rides /api/level-meta (the level editor's own endpoint —
    // see wired-nodes-extract.js on the server side) purely because that's
    // where the scan already lives; only this one field is used here, the
    // rest of that payload (cards/abilityKeys) is the level editor's.
    const meta = await fetch('/api/level-meta').then(r => r.json());
    State.wiredNodeIds = meta.wiredNodeIds || [];
  } catch (e) {
    return toast('Could not load map data: ' + e.message, true);
  }
  State.mapId = Object.keys(State.maps)[0];
  State.sel = null;
  requestRender();
  wireGlobalEvents();
}

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

/* ── Stage-level interactions ─────────────────────────────────────────── */
function wireGlobalEvents() {
  const stage = $('#stage');

  stage.addEventListener('pointermove', e => {
    const p = pct(e);
    $('#cursor-pos').textContent = `x ${fmt(p.x)}   y ${fmt(p.y)}`;
  });
  stage.addEventListener('pointerleave', () => { $('#cursor-pos').textContent = '—'; });

  // Bare click on the map: in route mode append a waypoint, otherwise deselect.
  stage.addEventListener('pointerdown', e => {
    if (State.mode === 'route') {
      if (!State.routeSel) return toast('Click two places to pick a route between them');
      snapshot();
      insertBend(pct(e));
      markDirty(); requestRender();
    } else {
      State.sel = null; requestRender();
    }
  });

  $$('.seg button').forEach(b => {
    b.onclick = () => {
      State.mode = b.dataset.mode;
      $$('.seg button').forEach(x => x.classList.toggle('on', x === b));
      requestRender();
    };
  });

  $('#btn-save').onclick     = save;
  $('#btn-add-node').onclick = addNodeFlow;
  $('#btn-new-map').onclick  = newMapFlow;
  $('#btn-help').onclick     = showHelp;
  $('#btn-add-prop').onclick = addPropFlow;
  $('#btn-story').onclick    = showMilestones;

  document.addEventListener('keydown', onKey);
}

function onKey(e) {
  // Both editors' keydown listeners stay attached to `document` at all
  // times (see shared/active-tab.js) — this is what stops a shortcut fired
  // while looking at the Level tab from reaching this document.
  if (getActiveTab() !== 'map') return;

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); return undo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); return save(); }

  if (!State.sel) return;

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    return deleteSelection();
  }

  const step = e.shiftKey ? 1 : 0.1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  snapshot();
  const cur = currentPos(State.sel);
  setPos(State.sel, clamp(cur.x + d[0]), clamp(cur.y + d[1]));
  markDirty(); requestRender();
}

/* ── Save ─────────────────────────────────────────────────────────────── */
async function save() {
  $('#btn-save').disabled = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(State.doc)
    });
    const out = await res.json();
    if (!out.ok) { $('#btn-save').disabled = false; return toast(out.error, true); }
    State.dirty = false;
    $('#dirty').hidden = true;
    toast(`Saved — ${out.maps} maps, ${out.nodes} nodes. Reload the game to see it.`);
  } catch (e) {
    $('#btn-save').disabled = false;
    toast('Save failed: ' + e.message, true);
  }
  onAfterRender();
}

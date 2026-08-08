import { $, r2, slug } from '../shared/utils.js';
import { toast } from '../shared/toast.js';
import { requestRender } from '../shared/notify.js';
import { pickArt } from '../shared/art-picker.js';
import { State, markDirty, node, exit, prop, uniqueId } from './state.js';
import { findRoute, bend } from './routes.js';
import { uniqueMilestoneId, milestoneUsage } from './milestones.js';

/* ── Commands ─────────────────────────────────────────────────────────────
   Anything that mutates State and then wants a repaint lives here, and ends
   with requestRender() — never a direct call into render.js. render.js,
   drag.js and inspector.js all import THIS module (to wire a tab click, a
   pointerdown, or an inspector field edit to the mutation it should cause);
   this module imports none of them back. That's what keeps the graph one-
   way — render.js is free to paint, and nothing down here has to guess
   which higher-level module happens to be listening. */

/* ── Undo ─────────────────────────────────────────────────────────────────
   Kept together deliberately: snapshot() is what undo() unwinds, and the
   "undo replaces doc wholesale, sel is reset" behavior is only readable if
   both halves are in the same place. */

/* Snapshot BEFORE a mutation. Drags snapshot once on pointerdown, not per
   pixel, so one undo steps back a whole drag rather than one frame of it. */
export function snapshot() {
  State.undoStack.push(JSON.stringify(State.doc));
  if (State.undoStack.length > 60) State.undoStack.shift();
}

/* One undo entry per burst of typing rather than one per keystroke. */
let snapTimer = null;
export function snapshotOnce() {
  if (snapTimer) return;
  snapshot();
  snapTimer = setTimeout(() => { snapTimer = null; }, 700);
}

export function undo() {
  if (!State.undoStack.length) return toast('Nothing to undo');
  State.doc  = JSON.parse(State.undoStack.pop());
  State.maps = State.doc.maps;
  if (!State.maps[State.mapId]) State.mapId = Object.keys(State.maps)[0];
  State.sel = null;
  requestRender();
  markDirty();
}

/* Wire an inspector field to snapshot-on-first-edit + the mutation + dirty.
   Lives here (not shared/utils.js) because it needs snapshotOnce, which
   needs State's undo stack — a leaf module can't depend on that. */
export function bind(selector, ev, fn) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener(ev, e => { snapshotOnce(); fn(e.target.value); markDirty(); });
}

/* ── Kind registry ────────────────────────────────────────────────────────
   One entry per draggable/selectable thing. Adding a new kind of stage
   object means adding one entry here — currentPos/setPos, drag, arrow-key
   nudge, and the position readout all go through this, so nothing can add a
   kind here and forget to wire it into one of those call sites.

   Lives in commands.js rather than state.js because the `wp` case needs
   findRoute (routes.js), and state.js is below routes.js in the graph. */
export const KINDS = {
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
    get: () => ({ x: State.maps[State.mapId].spawn.x, y: State.maps[State.mapId].spawn.y }),
    set: (t, x, y) => { const sp = State.maps[State.mapId].spawn; sp.x = r2(x); sp.y = r2(y); }
  },
  wp:    {
    get: t => bend(t.wpIndex),
    set: (t, x, y) => { const p = bend(t.wpIndex); if (p) { p.x = r2(x); p.y = r2(y); } }
  }
};

export function currentPos(t) { return (KINDS[t.type] || KINDS.wp).get(t); }
export function setPos(t, x, y) { return (KINDS[t.type] || KINDS.wp).set(t, x, y); }

/* ── Map / selection ──────────────────────────────────────────────────── */
export function selectMap(id) {
  State.mapId = id;
  State.sel = null;
  requestRender();
}

export function deleteSelection() {
  const m = State.maps[State.mapId];
  if (State.sel.type === 'wp') {
    const r = findRoute(m, State.routeSel.from, State.routeSel.to);
    if (!r) return;
    snapshot();
    r.waypoints.splice(State.sel.wpIndex, 1);
    // A route with no bends IS a straight line, so stop storing it.
    if (!r.waypoints.length) m.routes.splice(m.routes.indexOf(r), 1);
    State.sel = null; markDirty(); return requestRender();
  }
  if (State.sel.type === 'prop') {
    snapshot();
    m.props.splice(State.sel.index, 1);
    State.sel = null; markDirty(); return requestRender();
  }
  if (State.sel.type === 'node') {
    const n = node(State.sel.id);
    // Deleting a node whose id is wired into overworld.js breaks a gate or a
    // click handler with no error — warn with the specifics, don't just confirm.
    if (!confirm(`Delete node "${n.id}"?\n\nIf overworld.js has a NODE_BEHAVIOUR entry or an onNodeClick branch for this id, that code becomes dead and any progression flag pointing at it stops mattering. Check js/overworld.js before you push.`)) return;
    snapshot();
    m.nodes.splice(m.nodes.indexOf(n), 1);
    State.sel = null; markDirty(); return requestRender();
  }
  if (State.sel.type === 'exit') {
    const x = exit(State.sel.id);
    if (!confirm(`Delete exit "${x.id}" → ${x.target}?\n\nThis may strand a region with no way in or out.`)) return;
    snapshot();
    m.exits.splice(m.exits.indexOf(x), 1);
    State.sel = null; markDirty(); return requestRender();
  }
}

/* Two clicks pick a route: first endpoint, then second. Clicking the same one
   twice cancels, which is the obvious way out of a mis-click. */
export function pickEndpoint(id) {
  if (!State.routePick) {
    State.routePick = id;
    toast(`From ${id} — now click where the route goes`);
  } else if (State.routePick === id) {
    State.routePick = null;
    toast('Cancelled');
  } else {
    State.routeSel = { from: State.routePick, to: id };
    State.routePick = null;
    State.sel = null;
  }
  requestRender();
}

/* ── Milestone CRUD ───────────────────────────────────────────────────────
   The modal that DISPLAYS these lives in modals.js, which calls them and
   then redraws its own list — that redraw isn't a "repaint the stage"
   concern, so it isn't requestRender()'s job.

   Each returns true on an actual mutation, false/undefined on a no-op
   (blocked move, cancelled confirm, failed validation) — modals.js only
   redraws the modal body on true. addMilestone's validation failures are
   the case that matters: an unconditional redraw would wipe out whatever
   the user had already typed into the form the moment one field was wrong. */
export function moveMilestone(i, dir) {
  const ms = State.doc.milestones;
  const j = i + dir;
  if (j < 1 || j >= ms.length) return false;      // never move above 'start'
  snapshot();
  [ms[i], ms[j]] = [ms[j], ms[i]];
  markDirty(); requestRender();
  return true;
}

export function deleteMilestone(i) {
  const ms = State.doc.milestones[i];
  const used = milestoneUsage(ms.id);
  if (used.length) {
    const list = used.slice(0, 8).map(u => '  • ' + u.who + ' (' + u.key + ')').join('\n');
    const more = used.length > 8 ? `\n  …and ${used.length - 8} more` : '';
    if (!confirm(`"${ms.label || ms.id}" is used by ${used.length} thing(s):\n\n${list}${more}\n\n` +
                 `Delete it and clear those settings? Those items will go back to being always visible.`)) return false;
  }
  snapshot();
  // Strip the dangling gates too — leaving them would point at a milestone that
  // no longer exists, which the save validator rejects anyway.
  used.forEach(u => { delete u.obj[u.key]; });
  State.doc.milestones.splice(i, 1);
  if (State.scrubIdx >= State.doc.milestones.length) State.scrubIdx = State.doc.milestones.length - 1;
  markDirty(); requestRender();
  return true;
}

export function addMilestone() {
  const label = $('#ms-label').value.trim();
  if (!label) { toast('Give it a name first', true); return false; }
  const id = uniqueMilestoneId(slug(label));
  let flag;
  if ($('#ms-src').value === 'battle') {
    const hook = $('#ms-hook').value;
    if (!hook) { toast('No battle to attach this to — give a battle node a hook first', true); return false; }
    flag = `sog_node_${hook}_${$('#ms-tier').value}_beaten`;
  } else {
    flag = $('#ms-flag').value.trim();
    if (!flag) { toast('Enter a flag name, or attach it to a battle instead', true); return false; }
  }
  if ((State.doc.milestones || []).some(m => m.flag === flag)) {
    toast('Another story moment already uses that flag', true);
    return false;
  }
  snapshot();
  State.doc.milestones.push({ id, label, flag });
  markDirty(); requestRender();
  toast(`Added "${label}" — it's the last moment; use ↑ to move it earlier`);
  return true;
}

/* ── Add Node ─────────────────────────────────────────────────────────── */
export function addNodeFlow() {
  pickArt('Choose node art', State.art.nodes, chosen => {
    const name = prompt('Node name?', 'New Node');
    if (name === null) return;
    const id = uniqueId(slug(name || 'new-node'));
    snapshot();
    State.maps[State.mapId].nodes = State.maps[State.mapId].nodes || [];
    State.maps[State.mapId].nodes.push({
      id,
      name: name || 'New Node',
      kind: 'battle',
      image: chosen.path,
      // Drop it dead centre; the point is to drag it somewhere anyway.
      x: 50, y: 50
    });
    State.sel = { type: 'node', id };
    markDirty(); requestRender();
    toast(`Added "${id}" — drag it into place`);
  });
}

/* ── Add Scenery ──────────────────────────────────────────────────────── */
export function addPropFlow() {
  pickArt('Choose scenery', State.art.topo, chosen => {
    snapshot();
    State.maps[State.mapId].props = State.maps[State.mapId].props || [];
    // Default scale 0.25: the topography art is authored large, and dropping a
    // prop in at 1.0 fills the screen and looks broken.
    State.maps[State.mapId].props.push({ image: chosen.path, x: 50, y: 50, scale: 0.25, rotation: 0 });
    State.sel = { type: 'prop', index: State.maps[State.mapId].props.length - 1 };
    markDirty(); requestRender();
    toast('Scenery added — drag it into place');
  });
}

/* ── New Map ──────────────────────────────────────────────────────────── */
export function newMapFlow() {
  pickArt('Choose a background for the new region', State.art.maps, chosen => {
    const display = prompt('Region name? (e.g. Greece)', '');
    if (!display) return;
    const id = slug(display);
    if (State.maps[id]) return toast(`A map called "${id}" already exists`, true);
    snapshot();
    State.maps[id] = {
      displayName: display,
      image: chosen.path,
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      props: [],
      nodes: [],
      exits: []
    };
    markDirty();
    selectMap(id);
    toast(`Created "${id}". Add nodes, then an exit from an existing map to reach it.`);
  });
}

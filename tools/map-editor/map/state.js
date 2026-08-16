import { $ } from '../shared/utils.js';

/* ── State ────────────────────────────────────────────────────────────────
   ONE shared mutable object, not individual `let` exports. ESM imports are
   live but READ-ONLY bindings — `import { sel } from './state.js'; sel = x`
   is a load-time SyntaxError from every other module. The original single-
   scope editor.js reassigns doc/maps/mapId/mode/sel/dirty/scrubIdx/routeSel/
   routePick directly at dozens of call sites; routing all of that through
   property writes on one object (`State.sel = x`) is the only way to split
   the file without threading a setter function through every one of them.

   Nobody may destructure `maps` or `doc` out of this object into a local
   that outlives a single synchronous call — undo() swaps `State.doc` (and
   `State.maps`, its alias) for a different object wholesale, and a cached
   reference goes stale silently. Always read State.doc / State.maps fresh. */
export const State = {
  doc:       null,      // the whole SOG_MAP_DATA: { milestones, maps }
  maps:      null,      // alias for doc.maps, edited in place
  mapId:     null,      // which region is on screen
  mode:      'select',  // 'select' | 'route'
  sel:       null,      // { type:'node'|'exit'|'prop'|'spawn'|'wp', id|index, wpIndex? }
  dirty:     false,
  art:       { maps: [], nodes: [], topo: [] },
  // Node ids onNodeClick actually dispatches to, scanned server-side from
  // js/overworld.js on every /api/level-meta request — see
  // tools/map-editor/wired-nodes-extract.js. Loaded once at boot, same as
  // art. Replaces a hand-maintained Set that had already drifted once.
  wiredNodeIds: [],
  scrubIdx:  0,          // which story beat the stage is previewing
  routeSel:  null,       // { from, to } — the route being edited
  routePick: null,       // first endpoint clicked, waiting for the second
  undoStack: []
};

/* Nodes whose art size the game overrides in CSS rather than via `scale`.
   Replicated in editor.css; listed here so the inspector can explain itself. */
export const CSS_SIZED = { 'egypt-signpost': '126px (hard-coded in css/style.css)' };

export function markDirty() {
  State.dirty = true;
  $('#dirty').hidden = false;
  $('#btn-save').disabled = false;
}

/* ── Data accessors ───────────────────────────────────────────────────────
   node/exit/prop live here since routes.js and commands.js both need them
   and neither should import the other just for this. The fourth accessor —
   a route's waypoint by index — needs findRoute (routes.js), which would
   make this module depend on the layer above it, so it lives in commands.js
   next to the KINDS registry that's its only real caller. */
export const node = id => (State.maps[State.mapId].nodes || []).find(n => n.id === id);
export const exit = id => (State.maps[State.mapId].exits || []).find(x => x.id === id);
// Props have no id — several mudhuts share the same art — so they are keyed by
// position in the array. Anything that reorders props must re-point `sel`.
export const prop = i  => (State.maps[State.mapId].props || [])[i];

export function uniqueId(base) {
  const taken = new Set();
  Object.values(State.maps).forEach(m => (m.nodes || []).forEach(n => taken.add(n.id)));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

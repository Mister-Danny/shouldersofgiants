import { r2 } from '../shared/utils.js';
import { State } from './state.js';

/* ── Routes ───────────────────────────────────────────────────────────────
   The walking graph. Every pair of endpoints (nodes, exits, spawn) is joined
   by a straight line unless a route with bends is stored for it — so the
   file only carries the routes you actually shaped, and everything else is a
   straight line by omission rather than by storing hundreds of two-point
   lines.

   Routes are undirected: one entry serves both directions, and the game
   walks the bends in reverse when travelling the other way. */

export const endpointsOf = m => [
  { id: 'spawn', x: m.spawn.x, y: m.spawn.y, kind: 'spawn' },
  ...(m.nodes || []).map(n => ({ id: n.id, x: n.x, y: n.y, kind: 'node' })),
  ...(m.exits || []).map(e => ({ id: e.id, x: e.walkTo.x, y: e.walkTo.y, kind: 'exit' }))
];
export const endpointPos = (m, id) => endpointsOf(m).find(e => e.id === id);

/* Undirected lookup — A->B and B->A are the same route. */
export function findRoute(m, a, b) {
  return (m.routes || []).find(r =>
    (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

/* The full point list for drawing: start, bends (in travel order), end. */
export function routePoints(m, from, to) {
  const a = endpointPos(m, from), b = endpointPos(m, to);
  if (!a || !b) return null;
  const r = findRoute(m, from, to);
  let mid = r ? (r.waypoints || []).slice() : [];
  if (r && r.to !== to) mid.reverse();
  return [a, ...mid, b];
}

export const sameRoute = (r, sel) =>
  (r.from === sel.from && r.to === sel.to) || (r.from === sel.to && r.to === sel.from);

/* A route's waypoint by storage index — depends on findRoute, so it lives
   here rather than in state.js (which routes.js already imports; state.js
   importing this back would be the cycle). The only real caller is
   commands.js's KINDS registry. */
export function bend(i) {
  if (!State.routeSel) return null;
  const r = findRoute(State.maps[State.mapId], State.routeSel.from, State.routeSel.to);
  return r && r.waypoints ? r.waypoints[i] : null;
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* Insert a bend where the user clicked, into the segment they clicked NEAR —
   appending would put it at the end of the line no matter where you aimed,
   which is useless for shaping an existing route. */
export function insertBend(pt) {
  const m = State.maps[State.mapId];
  let r = findRoute(m, State.routeSel.from, State.routeSel.to);
  if (!r) {
    r = { from: State.routeSel.from, to: State.routeSel.to, waypoints: [] };
    m.routes = m.routes || [];
    m.routes.push(r);
  }
  const pts = routePoints(m, State.routeSel.from, State.routeSel.to);
  // Which segment of the drawn line is closest to the click?
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(pt, pts[i], pts[i + 1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  const reversed = r.to !== State.routeSel.to;
  const view = reversed ? r.waypoints.slice().reverse() : r.waypoints.slice();
  view.splice(best, 0, { x: r2(pt.x), y: r2(pt.y) });
  r.waypoints = reversed ? view.reverse() : view;
  const shownIndex = reversed ? r.waypoints.length - 1 - best : best;
  State.sel = { type: 'wp', wpIndex: shownIndex };
}

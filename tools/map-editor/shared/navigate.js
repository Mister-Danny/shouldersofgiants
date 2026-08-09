/* ── Cross-workspace navigation ──────────────────────────────────────────
   map/inspector.js needs to say "configure this node's level" and land on
   the Level tab with that node loaded. It can't import app.js (the shell)
   or level/* directly — inspector.js sits low in the map/ dependency graph,
   and importing either would be a backwards edge (or, for level/*, a
   dependency map/ has no business having at all).

   Same shape as shared/notify.js: a callback slot registered once by the
   shell, called from below without the caller needing to know who's
   listening. app.js registers the handler at boot: switch to the Level
   tab, then ask level/commands.js to select-or-create that node's level. */
let _onConfigureLevel = () => {};

export function onConfigureLevel(fn) { _onConfigureLevel = fn; }
export function requestConfigureLevel(nodeId, kind) { _onConfigureLevel(nodeId, kind); }

/* ── The level editor's own copy of shared/notify.js's seam ──────────────
   NOT importing shared/notify.js here on purpose. That module is a single
   global callback slot — map/app.js already calls its onChange() to wire
   render.js's render() as THE target. If level/commands.js called the same
   shared requestRender(), it would repaint the MAP stage, not the level
   form (or silently do nothing/the wrong thing depending on init order) —
   the two editors need two independent render loops, not one shared slot
   that whichever editor booted last wins.

   Same reasoning as map's seam otherwise: level/render.js has to import
   level/commands.js (to wire a field to setLevelField), and things below
   render.js that mutate state and want a repaint can't call render()
   directly without creating that same import cycle. This is a deliberate,
   small duplication rather than a shared/notify.js factory refactor — that
   would touch every already-verified map/* import site for a level-editor-
   only need. Worth unifying into a factory if a third editor ever needs
   this same shape. */
let _onChange = () => {};

export function onChange(fn) { _onChange = fn; }
export function requestRender() { _onChange(); }

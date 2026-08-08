/* ── The one deliberate cycle-breaking seam ──────────────────────────────
   render.js paints the stage. It also has to import commands.js (to wire
   e.g. a tab click to selectMap) and drag.js/inspector.js (to wire pointer
   handlers and paint the inspector panel) — so nothing BELOW render.js in
   the dependency graph (commands, drag, inspector) is allowed to import
   render.js back to ask for a repaint; that would be a cycle, and an ESM
   cycle resolves as undefined at the moment of the call, not at load time,
   which turns into a mystery null deep in a click handler.

   Instead, anything below render.js that mutates state and wants a repaint
   calls requestRender() here. app.js — which imports everyone — is the
   only module that ever calls onChange(), wiring this passthrough to the
   real render() once, at boot.

   requestRender() MUST stay a synchronous passthrough. Code throughout the
   editor calls it and then reads the DOM back immediately after (e.g. crop
   report measurements) — batching this onto a rAF would change behavior
   that today is synchronous, which is exactly what a pure refactor must
   not do. */
let _onChange = () => {};

export function onChange(fn) { _onChange = fn; }
export function requestRender() { _onChange(); }

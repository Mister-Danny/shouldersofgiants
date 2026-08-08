/* ── Generic DOM / math / string helpers ─────────────────────────────────
   Zero imports on purpose — this is the bottom of the dependency graph.
   Nothing here knows the map editor's data shape exists. */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export const clamp = v => Math.max(0, Math.min(100, v));
export const r2    = v => Math.round(v * 100) / 100;
export const fmt   = v => (Math.round(v * 10) / 10).toFixed(1);

export function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';
}

/* Cursor position as a percentage of #stage. This is the only place screen
   pixels touch the data model — every caller works in the same 0-100 space
   the saved data uses. */
export function pct(e) {
  const b = $('#stage').getBoundingClientRect();
  return {
    x: (e.clientX - b.left) / b.width  * 100,
    y: (e.clientY - b.top)  / b.height * 100
  };
}

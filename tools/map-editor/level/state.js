import { $ } from '../shared/utils.js';

/* ── Level document state ────────────────────────────────────────────────
   Same shape as map/state.js: one shared mutable object, not individual
   `let` exports (ESM imports are read-only bindings — every module below
   writes State.x = y, not `import { x }; x = y`). Its own dirty flag and
   undo stack, never shared with map/state.js's — "per-document dirty AND
   per-document undo" from the tab-shell commit applies here exactly the
   same way it did between Map and the (then-empty) Level tab. */
export const State = {
  doc:     null,   // the whole SOG_LEVEL_DATA: { levels }
  levels:  null,   // alias for doc.levels, edited in place
  levelId: null,   // which level is on screen
  dirty:   false,
  undoStack: [],

  // Loaded once at boot from GET /api/level-meta — the SAME scanners
  // validateLevel() uses server-side (loadCards/discoverAbilityKeys), not a
  // second hand-copied list here. See shared/navigate.js's docstring for
  // why this can't just import serve.js's functions directly (this is
  // browser code; serve.js is Node).
  cards:       [],   // [{id, name, cc, ip, type, type2, era, image, ...}]
  abilityKeys: []    // ['ALL_MINUS_ONE_IP', ...]
};

export function markDirty() {
  State.dirty = true;
  $('#level-dirty').hidden = false;
  $('#level-btn-save').disabled = false;
}

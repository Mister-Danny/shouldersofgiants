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
  levelId: null,   // which AUTHORED (editable) level is on screen
  dirty:   false,
  undoStack: [],

  // Loaded once at boot from GET /api/level-meta — the SAME scanners
  // validateLevel() uses server-side (loadCards/discoverAbilityKeys), not a
  // second hand-copied list here. See shared/navigate.js's docstring for
  // why this can't just import serve.js's functions directly (this is
  // browser code; serve.js is Node).
  cards:       [],   // [{id, name, cc, ip, type, type2, era, image, ...}]
  abilityKeys: [],   // ['ALL_MINUS_ONE_IP', ...]

  // Loaded (and, after a dialogue save, RE-loaded) from GET /api/boss-previews
  // — server-computed ground truth for the 5 hand-authored bosses, extracted
  // from their own .js files (see tools/map-editor/boss-extract.js). Keyed
  // by node id, matching levels' own keying, so gap/list logic can treat
  // both uniformly. Structure/locations/decks/etc. stay read-only always;
  // only dialogue (Phase 2) can be edited, and only where
  // dialogue[key].editable is true.
  bossPreviews: {},

  // Which boss is being VIEWED — mutually exclusive with levelId (selecting
  // one clears the other; see commands.js's selectLevel/viewBoss).
  bossKey: null,

  // Phase 2: in-progress dialogue EDITS, kept entirely separate from
  // bossPreviews (server-fetched ground truth) so typing doesn't mutate the
  // thing a "no changes since load" comparison would need to compare
  // against. { [bossKey]: { [dialogueKey]: [{who,text}, ...] } } — populated
  // lazily, per array, the first time that array is edited (see
  // commands.js's editBossDialogueLine), from bossPreviews' own extracted
  // current value. Saves through POST /api/save-boss-dialogue, a completely
  // different endpoint/file from the authored-levels save — deliberately
  // does NOT touch `dirty`/#level-dirty/markDirty(), which are the levels
  // document's own "Save to level-data.js" button; "dirty" for a boss's
  // dialogue is just Object.keys(bossDialogueEdits[key]||{}).length > 0,
  // computed where needed rather than tracked as a second boolean that
  // could drift out of sync with the buffer it describes.
  bossDialogueEdits: {}
};

export function markDirty() {
  State.dirty = true;
  $('#level-dirty').hidden = false;
  $('#level-btn-save').disabled = false;
}

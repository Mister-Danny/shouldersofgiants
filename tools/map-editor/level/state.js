/* ── Level document state ────────────────────────────────────────────────
   Stub, same shape as map/state.js's dirty flag and undo stack, kept
   separate on purpose — even with no level form yet, "per-document dirty
   AND per-document undo" means there are two of each, not one shared pair
   that the map editor happens to be first to use. Nothing sets `dirty` or
   pushes onto `undoStack` yet; both stay in this empty state until the
   level form exists to mutate them. */
export const State = {
  dirty: false,
  undoStack: []
};

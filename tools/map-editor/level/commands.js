import { $ } from '../shared/utils.js';
import { toast } from '../shared/toast.js';
import { requestRender } from './notify.js';
import { State, markDirty } from './state.js';

/* ── Commands ─────────────────────────────────────────────────────────────
   Same split as map/commands.js: anything that mutates State and wants a
   repaint lives here and ends with requestRender(). render.js (the form)
   imports this to wire field inputs; this never imports render.js back. */

export function snapshot() {
  State.undoStack.push(JSON.stringify(State.doc));
  if (State.undoStack.length > 60) State.undoStack.shift();
}

let snapTimer = null;
export function snapshotOnce() {
  if (snapTimer) return;
  snapshot();
  snapTimer = setTimeout(() => { snapTimer = null; }, 700);
}

export function undo() {
  if (!State.undoStack.length) return toast('Nothing to undo');
  State.doc    = JSON.parse(State.undoStack.pop());
  State.levels = State.doc.levels;
  if (State.levelId && !State.levels[State.levelId]) State.levelId = null;
  requestRender();
  markDirty();
}

export function bind(selector, ev, fn) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener(ev, e => { snapshotOnce(); fn(e.target.value); markDirty(); requestRender(); });
}

export function selectLevel(id) {
  State.levelId = id;
  requestRender();
}

/* Sensible defaults matching every existing boss (Sargon/Hatshepsut/Narmer/
   Hammurabi/Nebuchadnezzar all use turns:4, slotsPerLocation:4, handStart:4,
   maxHandSize:7, capital:5, replenish draw, most-locations/total-ip/tie
   scoring) — the parts that genuinely can't have a default (which 3
   locations, which cards) are left empty for the author to fill in. */
function blankLevel() {
  return {
    kind: 'battle',
    tiers: 2,
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true, capitalByTurn: [5, 5, 5, 5] },
    draw: { model: 'replenish' },
    decks: {
      player: { source: 'active-deck', shuffle: true },
      ai: { source: 'explicit', ids: [], shuffle: true }
    },
    locations: [
      { id: null, name: '', region: '', abilityText: '', abilityKey: null, image: '', thumbnailCrop: null },
      { id: null, name: '', region: '', abilityText: '', abilityKey: null, image: '', thumbnailCrop: null },
      { id: null, name: '', region: '', abilityText: '', abilityKey: null, image: '', thumbnailCrop: null }
    ],
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    presentation: { bodyClass: '', allyAvatar: '', opponentAvatar: '', opponentBubblePortrait: '', popAlly: true },
    dialogue: { opening: [], serfWinA: [], serfWinB: [], loss: [], tie: [], giantIntro: [], giantWinA: [], giantWinB: [], giantLoss: [], giantDraw: [] }
  };
}

/* Creates a level for a node id that doesn't have one yet — the landing
   spot for both the Level tab's own "+ New" flow and the Map tab's
   "Configure battle" button (shared/navigate.js). Only 'battle' is offered:
   'market' isn't wired in js/level-runtime.js yet, and validateLevel()
   rejects saving one, so a market-paired form would be a dead end. */
export function createLevel(id) {
  if (State.levels[id]) { State.levelId = id; requestRender(); return; }
  snapshot();
  State.levels[id] = blankLevel();
  State.levelId = id;
  markDirty();
  requestRender();
}

export function deleteLevel(id) {
  if (!confirm(`Delete the level for "${id}"?\n\nThe node stays on the map — this only removes its battle configuration, which onNodeClick would then have nothing to launch.`)) return;
  snapshot();
  delete State.levels[id];
  if (State.levelId === id) State.levelId = null;
  markDirty();
  requestRender();
}

/* Generic field setter — a dot path into the current level (structure.turns,
   presentation.bodyClass, locations.0.name, scoring.rule, ...). Arrays are
   plain objects as far as string-keyed access goes, so 'locations.0.name'
   reaches locations[0].name with no special-casing. One function instead of
   a hand-written setter per field, same reasoning as map's bind() — the
   alternative is dozens of near-identical one-liners that drift out of sync
   with the form as fields get added. */
export function setLevelField(path, value) {
  const lvl = State.levels[State.levelId];
  const parts = path.split('.');
  let obj = lvl;
  for (let i = 0; i < parts.length - 1; i++) {
    if (obj[parts[i]] == null) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === undefined || value === '') delete obj[last];
  else obj[last] = value;
  markDirty();
}

/* Wraps setLevelField with the same snapshot-once pattern bind() gives
   map's inspector — used by every plain text/number/select input in the
   form via a data-path attribute (see render.js).

   Deliberately does NOT call requestRender(). Confirmed against the live
   map editor before writing this: #i-x's binding calls requestRender() on
   every 'input' event, and typing into it destroys and recreates the
   field's DOM node each keystroke (innerHTML rebuild), which drops focus —
   #i-name has no such call and typing works fine. Map's inspector only
   re-renders from fields whose change needs to show up somewhere ELSE on
   screen (the position dot on the stage); everything else stays silent.
   The level form has no stage, so almost nothing needs a rerender on
   'input' — render.js calls requestRender() itself, explicitly, only for
   the few fields where that's actually true (abilityKey, which toggles a
   warning). Passing rerender:true opts a field into the map's behavior for
   the rare cases — 'change' events (selects, checkboxes) fire once per
   choice, not per keystroke, so losing focus there is a non-issue. */
export function bindField(selector, ev, path, transform, opts) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener(ev, e => {
    snapshotOnce();
    setLevelField(path, transform ? transform(e.target.value) : e.target.value);
    if (opts && opts.rerender) requestRender();
  });
}

/* Capital is authored per turn, not as one flat number — resource.
   capitalByTurn holds one entry per turn (js/game.js's _capitalForTurn
   reads capitalByTurn[turn-1], falling back to the old flat resource.
   capital only for hand-written bosses that never set the array at all).
   Changing the turn count resizes the array: growing keeps every existing
   turn's value and defaults new turns to the level's current flat rate
   (falling back to 5 only if that's also unset — matches every hand-
   written boss), shrinking drops the trailing turns. resource.capital is
   kept mirroring turn 1 throughout — not shown in the form any more, but
   the engine's fallback path still reads it, so it can't go stale.

   A level authored before this feature existed (or hand-written, like the
   spike) has no capitalByTurn at all — render.js's capitalSection() shows
   it a DERIVED array (the flat rate repeated) purely for display, without
   touching State. The actual array only gets created here, lazily, the
   first time an author edits a turn box or the turn count — viewing an
   old-style level never marks it dirty by itself. */
export function setTurnCount(n) {
  snapshot();
  const lvl = State.levels[State.levelId];
  const fallback = lvl.resource.capital ?? 5;
  const old = (lvl.resource.capitalByTurn || []).slice();
  const next = [];
  for (let i = 0; i < n; i++) next.push(old[i] != null ? old[i] : fallback);
  lvl.resource.capitalByTurn = next;
  lvl.resource.capital = next[0];
  lvl.structure.turns = n;
  markDirty();
  requestRender();
}

export function setCapitalForTurn(index, value) {
  snapshotOnce();
  const lvl = State.levels[State.levelId];
  if (!lvl.resource.capitalByTurn) {
    const fallback = lvl.resource.capital ?? 5;
    lvl.resource.capitalByTurn = Array((lvl.structure && lvl.structure.turns) || 0).fill(fallback);
  }
  lvl.resource.capitalByTurn[index] = value;
  if (index === 0) lvl.resource.capital = value;
  markDirty();
}

export function setDeckIds(who, ids) {
  snapshot();
  const lvl = State.levels[State.levelId];
  lvl.decks[who] = lvl.decks[who] || { source: 'explicit', shuffle: true };
  lvl.decks[who].ids = ids;
  markDirty();
  requestRender();
}

export function addDialogueLine(arrayName) {
  snapshot();
  const lvl = State.levels[State.levelId];
  lvl.dialogue = lvl.dialogue || {};
  lvl.dialogue[arrayName] = lvl.dialogue[arrayName] || [];
  lvl.dialogue[arrayName].push({ who: '', text: '' });
  markDirty();
  requestRender();
}

export function removeDialogueLine(arrayName, index) {
  snapshot();
  State.levels[State.levelId].dialogue[arrayName].splice(index, 1);
  markDirty();
  requestRender();
}

export function setDialogueLine(arrayName, index, field, value) {
  State.levels[State.levelId].dialogue[arrayName][index][field] = value;
  markDirty();
}

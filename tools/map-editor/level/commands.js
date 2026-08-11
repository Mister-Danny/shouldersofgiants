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
  State.bossKey = null;          // mutually exclusive with viewing a boss read-only
  State.viewingOverworld = false;   // ...or the overworld dialogue view
  requestRender();
}

/* Selects a hand-authored boss for viewing. Structure/locations/decks/etc.
   stay read-only (no document behind them to mutate); only dialogue is
   editable (Phase 2, via editBossDialogueLine et al. below), which is why
   this still never snapshots or touches State.levels/State.doc — that
   undo stack belongs to the AUTHORED levels document, not boss files. */
export function viewBoss(nodeId) {
  State.bossKey = nodeId;
  State.levelId = null;
  State.viewingOverworld = false;
  requestRender();
}

/* Phase 3: selects the overworld dialogue view — same read/edit split as
   viewBoss (everything is grouped dialogue, all potentially editable per
   overworld-extract.js's registry), but there's only one of these (no key
   needed) since it's one file, not five. */
export function viewOverworldDialogue() {
  State.viewingOverworld = true;
  State.bossKey = null;
  State.levelId = null;
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
  if (State.levels[id]) { State.levelId = id; State.bossKey = null; State.viewingOverworld = false; requestRender(); return; }
  snapshot();
  State.levels[id] = blankLevel();
  State.levelId = id;
  State.bossKey = null;
  State.viewingOverworld = false;
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

/* ══════════════════════════════════════════════════════════════════════════
   Phase 2 — boss dialogue editing. A completely separate track from
   everything above: edits live in State.bossDialogueEdits, never
   State.doc/State.levels, and save through POST /api/save-boss-dialogue to
   one boss's own .js file — never markDirty()/the #level-dirty dot, which
   belong to the authored-levels document and its own "Save to level-
   data.js" button. Conflating the two would make a boss-dialogue edit look
   like an unsaved LEVEL change, and vice versa.
   ══════════════════════════════════════════════════════════════════════════ */

/* Lazily starts an edit buffer for one (boss, dialogueKey) pair from its
   current extracted value — never called for a key whose preview marked
   editable:false; render.js only wires inputs for editable arrays, so
   there is nothing here re-checking that gate (the DOM simply has no input
   to invoke this from otherwise). */
function _bossEditBuffer(bossKey, dialogueKey) {
  State.bossDialogueEdits[bossKey] = State.bossDialogueEdits[bossKey] || {};
  const buf = State.bossDialogueEdits[bossKey];
  let created = false;
  if (!buf[dialogueKey]) {
    const current = State.bossPreviews[bossKey].dialogue[dialogueKey].extraction.value || [];
    buf[dialogueKey] = current.map(l => ({ who: l.who, text: l.text }));
    created = true;
  }
  return { lines: buf[dialogueKey], created };
}

/* No requestRender() on every keystroke — same reasoning as bindField's own
   comment (a full innerHTML rebuild on 'input' drops focus). The ONE thing
   on screen that needs to reflect a plain text edit is the "N arrays
   changed" Save button label/enabled-state, and that only changes the
   FIRST time a given array gets an edit buffer at all — so only THAT
   transition rerenders. */
export function editBossDialogueLine(bossKey, dialogueKey, index, field, value) {
  const { lines, created } = _bossEditBuffer(bossKey, dialogueKey);
  lines[index][field] = value;
  if (created) requestRender();
}

export function addBossDialogueLine(bossKey, dialogueKey) {
  _bossEditBuffer(bossKey, dialogueKey).lines.push({ who: '', text: '' });
  requestRender();
}

export function removeBossDialogueLine(bossKey, dialogueKey, index) {
  _bossEditBuffer(bossKey, dialogueKey).lines.splice(index, 1);
  requestRender();
}

/* Backs out edits to ONE array, restoring the read-only/editable-input view
   to whatever is currently on disk (re-derived fresh next time it's
   touched, via _bossEditBuffer). Does not affect any other array's
   pending edits for this boss. */
export function revertBossDialogueEdits(bossKey, dialogueKey) {
  if (State.bossDialogueEdits[bossKey]) delete State.bossDialogueEdits[bossKey][dialogueKey];
  requestRender();
}

/* Submits every array with a pending edit buffer for this boss in one
   request — the server (applyDialogueEdits) is what actually decides,
   per array, whether anything changed; an array whose buffer happens to
   equal what's on disk is a no-op there, so sending the whole buffer here
   is simpler than this file also tracking a precise per-array dirty flag.
   On success: drop this boss's edit buffer and re-fetch bossPreviews fresh
   (server is the only ground truth for sourceText/isPlainLiteral/etc. —
   patching them in client-side would risk drifting from what's really on
   disk). On failure: keep the buffer so nothing typed is lost. */
export async function saveBossDialogue(bossKey) {
  const edits = State.bossDialogueEdits[bossKey];
  if (!edits || !Object.keys(edits).length) return toast('No dialogue changes to save for this boss');

  try {
    const res = await fetch('/api/save-boss-dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bossKey, dialogue: edits })
    });
    const out = await res.json();
    if (!out.ok) return toast(out.error, true);

    delete State.bossDialogueEdits[bossKey];
    const res2 = await fetch('/api/boss-previews');
    if (res2.ok) State.bossPreviews = await res2.json();

    if (!out.changed.length) {
      toast('No changes — already matched what was on disk');
    } else {
      let msg = `Saved ${out.changed.join(', ')} to ${(State.bossPreviews[bossKey] || {}).file || 'the boss file'}.`;
      if (out.commentsLost.length) msg += ` Comment lost in: ${out.commentsLost.join(', ')}.`;
      toast(msg);
    }
    requestRender();
  } catch (e) {
    toast('Save failed: ' + e.message, true);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Phase 3 — overworld dialogue editing. Same split as the boss-dialogue
   commands above (separate edit buffer, separate save endpoint, never
   markDirty()/#level-dirty), just flat-keyed by varName instead of
   [bossKey][dialogueKey] — overworld arrays aren't grouped under any one
   "document" the way a boss's 10 dialogue keys are, they're 39
   independent named vars in one file.
   ══════════════════════════════════════════════════════════════════════════ */

function _findOverworldArray(varName) {
  for (const g of State.overworldPreview.groups) {
    const a = g.arrays.find(a => a.varName === varName);
    if (a) return a;
  }
  return null;
}

function _overworldEditBuffer(varName) {
  let created = false;
  if (!State.overworldDialogueEdits[varName]) {
    const current = _findOverworldArray(varName).extraction.value || [];
    State.overworldDialogueEdits[varName] = current.map(l => ({ who: l.who, text: l.text }));
    created = true;
  }
  return { lines: State.overworldDialogueEdits[varName], created };
}

export function editOverworldDialogueLine(varName, index, field, value) {
  const { lines, created } = _overworldEditBuffer(varName);
  lines[index][field] = value;
  if (created) requestRender();
}

export function addOverworldDialogueLine(varName) {
  _overworldEditBuffer(varName).lines.push({ who: '', text: '' });
  requestRender();
}

export function removeOverworldDialogueLine(varName, index) {
  _overworldEditBuffer(varName).lines.splice(index, 1);
  requestRender();
}

export function revertOverworldDialogueEdits(varName) {
  delete State.overworldDialogueEdits[varName];
  requestRender();
}

/* ── Phase 3b: the 3 inline (unnamed) dialogue blocks ────────────────────
   Same edit-buffer shape as the named arrays, but the buffer also freezes
   expectedCurrent at creation time (never touched again after that) — the
   server needs it to verify the block it locates by POSITION still holds
   the same content this edit was staged against, before writing anything.
   See state.js's own comment on overworldInlineDialogueEdits. */

function _findInlineBlock(id) {
  for (const g of State.overworldPreview.groups) {
    const b = (g.inline || []).find(b => b.id === id);
    if (b) return b;
  }
  return null;
}

function _inlineEditBuffer(id) {
  let created = false;
  if (!State.overworldInlineDialogueEdits[id]) {
    const current = (_findInlineBlock(id).extraction.value || []).map(l => ({ who: l.who, text: l.text }));
    State.overworldInlineDialogueEdits[id] = { expectedCurrent: current, lines: current.map(l => ({ ...l })) };
    created = true;
  }
  return { entry: State.overworldInlineDialogueEdits[id], created };
}

/* No add/remove commands here on purpose — inline blocks never support
   line-count changes (see boss-extract.js's applyInlineDialogueEdit), so
   there is nothing for an add/remove button to call; render.js simply
   never renders one for these. */
export function editInlineDialogueLine(id, index, field, value) {
  const { entry, created } = _inlineEditBuffer(id);
  entry.lines[index][field] = value;
  if (created) requestRender();
}

export function revertInlineDialogueEdits(id) {
  delete State.overworldInlineDialogueEdits[id];
  requestRender();
}

/* Submits every array AND every inline block with a pending edit buffer
   in one request — same "server decides what actually changed" reasoning
   as saveBossDialogue/saveOverworldDialogue's named-array path. On
   success: clear both buffers and re-fetch the preview fresh (never patch
   sourceText/isPlainLiteral/etc. client-side). On failure: keep both
   buffers so nothing typed is lost — including expectedCurrent, so a
   retry after reloading isn't needed unless the server specifically said
   the block had drifted. */
export async function saveOverworldDialogue() {
  const edits = State.overworldDialogueEdits;
  const inlineEdits = State.overworldInlineDialogueEdits;
  if (!Object.keys(edits).length && !Object.keys(inlineEdits).length) return toast('No overworld dialogue changes to save');

  const inlinePayload = {};
  Object.keys(inlineEdits).forEach(id => {
    inlinePayload[id] = { expectedCurrent: inlineEdits[id].expectedCurrent, lines: inlineEdits[id].lines };
  });

  try {
    const res = await fetch('/api/save-overworld-dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialogue: edits, inline: inlinePayload })
    });
    const out = await res.json();
    if (!out.ok) return toast(out.error, true);

    State.overworldDialogueEdits = {};
    State.overworldInlineDialogueEdits = {};
    const res2 = await fetch('/api/overworld-dialogue-preview');
    if (res2.ok) State.overworldPreview = await res2.json();

    if (!out.changed.length) {
      toast('No changes — already matched what was on disk');
    } else {
      let msg = `Saved ${out.changed.join(', ')} to ${State.overworldPreview.file}.`;
      if (out.commentsLost.length) msg += ` Comment lost in: ${out.commentsLost.join(', ')}.`;
      toast(msg);
    }
    requestRender();
  } catch (e) {
    toast('Save failed: ' + e.message, true);
  }
}

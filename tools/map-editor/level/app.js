import { $ } from '../shared/utils.js';
import { toast } from '../shared/toast.js';
import { getActiveTab } from '../shared/active-tab.js';
import { onChange, requestRender } from './notify.js';
import { State } from './state.js';
import { undo } from './commands.js';
import { render } from './render.js';

/* ── Level Editor entry point ────────────────────────────────────────────
   Same shape as map/app.js: owns the level document's own dirty flag and
   undo stack (state.js), registers render() as this editor's own notify.js
   target (its OWN module, not the shared one map/app.js already claimed —
   see notify.js's docstring), guards its keydown handler on
   getActiveTab() === 'level' so a shortcut fired while looking at the Map
   tab can never reach here. */
let onAfterRender = () => {};

export function initLevelEditor(opts) {
  onAfterRender = (opts && opts.onAfterRender) || onAfterRender;
  onChange(() => { render(); onAfterRender(); });
  boot();
}

async function boot() {
  try {
    const [doc, meta, bossData, overworldPreview] = await Promise.all([
      loadLevelData(), loadLevelMeta(), loadBossPreviews(), loadOverworldPreview()
    ]);
    State.doc    = doc;
    State.levels = State.doc.levels;
    State.cards       = meta.cards;
    State.abilityKeys = meta.abilityKeys;
    State.bossPreviews = bossData.previews;
    State.unregisteredBossFiles = bossData.unregistered || [];
    State.overworldPreview = overworldPreview;
  } catch (e) {
    return toast('Could not load level data: ' + e.message, true);
  }
  requestRender();
  wireGlobalEvents();
}

/* data/level-data.js is a script that assigns a global, not JSON — same
   reason map/app.js's loadMapData() has to actually run map-data.js. */
async function loadLevelData() {
  const src = await fetch('/data/level-data.js?t=' + Date.now()).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
  const w = {};
  new Function('window', src)(w);
  if (!w.SOG_LEVEL_DATA) throw new Error('level-data.js did not assign window.SOG_LEVEL_DATA');
  if (!w.SOG_LEVEL_DATA.levels) throw new Error('level-data.js is missing a `levels` key');
  return w.SOG_LEVEL_DATA;
}

async function loadLevelMeta() {
  const res = await fetch('/api/level-meta');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadBossPreviews() {
  const res = await fetch('/api/boss-previews');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadOverworldPreview() {
  const res = await fetch('/api/overworld-dialogue-preview');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function wireGlobalEvents() {
  $('#level-btn-save').onclick = save;
  document.addEventListener('keydown', onKey);
}

function onKey(e) {
  if (getActiveTab() !== 'level') return;

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); return undo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); return save(); }
}

/* ── Save ─────────────────────────────────────────────────────────────── */
async function save() {
  $('#level-btn-save').disabled = true;
  try {
    const res = await fetch('/api/save-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(State.doc)
    });
    const out = await res.json();
    if (!out.ok) { $('#level-btn-save').disabled = false; return toast(out.error, true); }
    State.dirty = false;
    $('#level-dirty').hidden = true;
    toast(`Saved — ${out.levels} level${out.levels === 1 ? '' : 's'}. Reload the game to see it.`);
  } catch (e) {
    $('#level-btn-save').disabled = false;
    toast('Save failed: ' + e.message, true);
  }
  onAfterRender();
}

import { $, $$, esc } from '../shared/utils.js';
import { requestRender } from './notify.js';
import { State as mapState } from '../map/state.js';
import { State, markDirty } from './state.js';
import {
  bindField, setLevelField, selectLevel, createLevel, deleteLevel, viewBoss,
  setTurnCount, setCapitalForTurn,
  setDeckIds, addDialogueLine, removeDialogueLine, setDialogueLine,
  editBossDialogueLine, addBossDialogueLine, removeBossDialogueLine,
  revertBossDialogueEdits, saveBossDialogue,
  viewOverworldDialogue, editOverworldDialogueLine, addOverworldDialogueLine,
  removeOverworldDialogueLine, revertOverworldDialogueEdits, saveOverworldDialogue,
  editInlineDialogueLine, revertInlineDialogueEdits
} from './commands.js';
import { pickDeck } from './deck-picker.js';

/* ── Render ───────────────────────────────────────────────────────────────
   Same shape as map/render.js: reads State and paints. Levels have no
   stage/selection concept — this IS the inspector, there's nothing else to
   paint, so unlike map there's no separate inspector.js split. */

function battleNodesFromMap() {
  const out = [];
  Object.values(mapState.maps || {}).forEach(m => {
    (m.nodes || []).forEach(n => { if (n.kind === 'battle') out.push(n); });
  });
  return out;
}

function render() {
  renderLevelList();
  renderBossList();
  renderOverworldList();
  renderForm();
}

/* ── Level list + gap list ───────────────────────────────────────────────
   Gap visibility from the Level side: any battle node in map-data.js with
   no matching entry here shows in "Unconfigured nodes", clickable straight
   into createLevel(). The map inspector's own src2() shows the same gap
   the other way (a "Configure battle →" button on the node itself) — two
   views of one fact, not two separate trackers to keep in sync.

   Nodes with a hand-authored boss preview (State.bossPreviews) are excluded
   from the gap list — they're not unconfigured, they're configured in a
   .js file this tool doesn't write to yet; they show in their own "Hand-
   authored bosses" section instead (renderBossList). */
function renderLevelList() {
  const ul = $('#level-list');
  const ids = Object.keys(State.levels || {});
  ul.innerHTML = ids.map(id => `
    <li class="${id === State.levelId ? 'sel' : ''}" data-id="${esc(id)}">
      <span>${esc(id)}</span><span class="k">${esc((State.levels[id] || {}).kind || '?')}</span>
    </li>`).join('') || '<li class="note">No levels authored yet.</li>';
  $$('#level-list li[data-id]').forEach(li => { li.onclick = () => selectLevel(li.dataset.id); });

  const gaps = battleNodesFromMap().filter(n => !State.levels[n.id] && !(State.bossPreviews || {})[n.id]);
  const gl = $('#unconfigured-list');
  gl.innerHTML = gaps.map(n => `
    <li data-id="${esc(n.id)}"><span class="gap-dot">●</span><span>${esc(n.name || n.id)}</span></li>
  `).join('') || '<li class="note">Every battle node on the map has a level.</li>';
  $$('#unconfigured-list li[data-id]').forEach(li => { li.onclick = () => createLevel(li.dataset.id); });
}

/* Phase 1: the five hand-authored bosses, read-only. Selecting one calls
   viewBoss() (state.js), which clears levelId — see that command's own
   docstring for why there's no snapshot/dirty/undo wiring here at all. */
function renderBossList() {
  const ul = $('#boss-list');
  const keys = Object.keys(State.bossPreviews || {});
  ul.innerHTML = keys.map(nodeId => `
    <li class="${nodeId === State.bossKey ? 'sel' : ''}" data-id="${esc(nodeId)}">
      <span>${esc(nodeId)}</span><span class="k">boss</span>
    </li>`).join('') || '<li class="note">None loaded.</li>';
  $$('#boss-list li[data-id]').forEach(li => { li.onclick = () => viewBoss(li.dataset.id); });

  renderUnregisteredBossWarning();
}

/* The existence-check half of "don't let a boss file drift out of
   BOSS_SOURCES unnoticed" (boss-extract.js's findUnregisteredBossFiles(),
   scanned server-side on every /api/boss-previews request — see
   level/app.js's boot() and commands.js's saveBossDialogue()). Hidden
   entirely when the list is empty — this is a warning, not a status line;
   the common, correct state is nothing to show. */
function renderUnregisteredBossWarning() {
  const section = $('#unregistered-boss-section');
  const files = State.unregisteredBossFiles || [];
  if (!section) return;
  section.hidden = files.length === 0;
  if (!files.length) return;
  const box = $('#unregistered-boss-warning');
  box.innerHTML = `<b>${files.length} boss file${files.length === 1 ? '' : 's'} not in BOSS_SOURCES.</b>
    Reachable and playable, but their dialogue can't be edited here yet:<br>` +
    files.map(f => `${esc(f.file)} — registers <code>${f.hooks.map(esc).join(', ')}</code>`).join('<br>');
}

/* Phase 3: one entry — there's only one overworld.js, unlike the 5 bosses —
   that opens the grouped dialogue view. */
function renderOverworldList() {
  const ul = $('#overworld-list');
  if (!ul) return;
  const count = State.overworldPreview ? State.overworldPreview.groups.reduce((n, g) => n + g.arrays.length, 0) : 0;
  ul.innerHTML = `
    <li class="${State.viewingOverworld ? 'sel' : ''}" data-id="overworld-dialogue">
      <span>Dialogue</span><span class="k">${count} arrays</span>
    </li>`;
  const li = ul.querySelector('li[data-id="overworld-dialogue"]');
  if (li) li.onclick = () => viewOverworldDialogue();
}

/* ── Form ─────────────────────────────────────────────────────────────── */
function renderForm() {
  const wrap = $('#level-form');
  const empty = $('#level-empty-note');

  if (State.viewingOverworld) {
    const preview = State.overworldPreview;
    empty.hidden = true; wrap.hidden = false;
    wrap.innerHTML = preview ? overworldFormHtml(preview) : '<p class="note">No overworld dialogue data loaded.</p>';
    if (preview) wireOverworldDialogue();
    return;
  }

  if (State.bossKey) {
    const preview = State.bossPreviews[State.bossKey];
    empty.hidden = true; wrap.hidden = false;
    wrap.innerHTML = preview ? bossFormHtml(preview) : '<p class="note">No preview data for this boss.</p>';
    if (preview) wireBossDialogue(preview);
    return;   // everything but dialogue is read-only — nothing else to wire
  }

  const lvl = State.levelId && State.levels[State.levelId];
  if (!lvl) { wrap.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; wrap.hidden = false;

  wrap.innerHTML = formHtml(State.levelId, lvl);
  wireForm(State.levelId, lvl);
}

function formHtml(id, lvl) {
  return `
    <div class="form-section">
      <h3>${esc(id)}</h3>
      <div class="f2">
        <div class="f"><label>tiers</label>
          <select data-path="tiers" data-num="1">
            <option value="2" ${lvl.tiers === 2 ? 'selected' : ''}>Serf + Giant</option>
            <option value="1" ${lvl.tiers === 1 ? 'selected' : ''}>single level</option>
          </select></div>
        <div class="f"><label>note (survives saving)</label>
          <input data-path="note" value="${esc(lvl.note || '')}"></div>
      </div>
      <div class="rowbtns"><button class="danger sm" id="lvl-del">Delete this level</button></div>
    </div>

    ${structureSection(lvl)}
    ${decksSection(id, lvl)}
    ${locationsSection(lvl)}
    ${scoringSection(lvl)}
    ${presentationSection(lvl)}
    ${rulesPopupSection(lvl)}
    ${dialogueSection(lvl)}
  `;
}

function structureSection(lvl) {
  const s = lvl.structure || {};
  return `
    <div class="form-section">
      <h3>Structure</h3>
      <div class="f2">
        <div class="f"><label>turns</label><input type="number" min="1" data-resize-turns="1" value="${s.turns ?? 4}"></div>
        <div class="f"><label>locations</label><input type="number" data-path="structure.locationsCount" data-num="1" value="${s.locationsCount ?? 3}"></div>
      </div>
      <div class="f2">
        <div class="f"><label>slots per location</label><input type="number" data-path="structure.slotsPerLocation" data-num="1" value="${s.slotsPerLocation ?? 4}"></div>
        <div class="f"><label>hand start</label><input type="number" data-path="structure.handStart" data-num="1" value="${s.handStart ?? 4}"></div>
      </div>
      <div class="f"><label>max hand size</label><input type="number" data-path="structure.maxHandSize" data-num="1" value="${s.maxHandSize ?? 7}"></div>
    </div>
    ${capitalSection(lvl)}`;
}

/* Capital per turn, one box per turn instead of one flat rate — changing
   "turns" above resizes this list (new turns default to the level's
   current flat rate; shrinking drops the trailing turns and keeps the
   rest). See commands.js's setTurnCount/setCapitalForTurn.

   A level with no resource.capitalByTurn yet (hand-written, or authored
   before this existed — e.g. the spike) shows a DERIVED array here, the
   flat resource.capital repeated once per turn, purely for display; commands.js
   only actually writes the real array the first time a box is touched. */
function capitalSection(lvl) {
  const turns = (lvl.structure && lvl.structure.turns) || 0;
  const stored = (lvl.resource && lvl.resource.capitalByTurn) || [];
  const fallback = (lvl.resource && lvl.resource.capital) ?? 5;
  const perTurn = Array.from({ length: turns }, (_, i) => stored[i] != null ? stored[i] : fallback);
  return `
    <div class="form-section">
      <h3>Capital per turn</h3>
      <div class="turn-grid">
        ${perTurn.map((amt, i) => `
          <div class="f" style="flex:0 0 90px">
            <label>Turn ${i + 1}</label>
            <input type="number" min="0" data-capital-turn="${i}" value="${amt}">
          </div>`).join('')}
      </div>
    </div>`;
}

function decksSection(id, lvl) {
  const ai = (lvl.decks && lvl.decks.ai) || { ids: [] };
  const player = (lvl.decks && lvl.decks.player) || { source: 'active-deck' };
  const count = (ai.ids || []).length;
  return `
    <div class="form-section">
      <h3>Decks</h3>
      <div class="f"><label>player deck</label>
        <select data-path="decks.player.source">
          <option value="active-deck" ${player.source === 'active-deck' ? 'selected' : ''}>Player's own built deck</option>
          <option value="explicit" ${player.source === 'explicit' ? 'selected' : ''}>Fixed list (rare — same picker as AI)</option>
        </select></div>
      <div class="f">
        <label>AI deck — ${count} card${count === 1 ? '' : 's'}</label>
        <div class="rowbtns"><button class="ghost sm" id="lvl-pick-ai-deck">Choose cards…</button></div>
        <p class="note">Order doesn't matter — the AI deck is always shuffled
          (js/game.js ignores decks.ai.shuffle entirely; it's kept in the
          data only so the shape matches every hand-written boss file).</p>
      </div>
    </div>`;
}

function abilityKeyOptions(selected) {
  const opts = ['<option value="">— none —</option>']
    .concat(State.abilityKeys.map(k => `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(k)}</option>`));
  return opts.join('');
}

function locationsSection(lvl) {
  const locs = lvl.locations || [];
  return `
    <div class="form-section">
      <h3>Locations (3)</h3>
      ${locs.map((loc, i) => `
        <h4>Location ${i + 1}</h4>
        <div class="f2">
          <div class="f"><label>id</label><input type="number" data-path="locations.${i}.id" data-num="1" value="${loc.id ?? ''}"></div>
          <div class="f"><label>name</label><input data-path="locations.${i}.name" value="${esc(loc.name || '')}"></div>
        </div>
        <div class="f2">
          <div class="f"><label>region</label><input data-path="locations.${i}.region" value="${esc(loc.region || '')}"></div>
          <div class="f"><label>image</label><input data-path="locations.${i}.image" value="${esc(loc.image || '')}" placeholder="images/locations/…"></div>
        </div>
        <div class="f"><label>ability key</label>
          <select data-path="locations.${i}.abilityKey" data-ability-key="${i}">${abilityKeyOptions(loc.abilityKey)}</select></div>
        <div class="f"><label>ability text (shown to players — write this yourself, it is never auto-filled)</label>
          <input data-path="locations.${i}.abilityText" data-blur-rerender="1" value="${esc(loc.abilityText || '')}"></div>
        ${loc.abilityKey && !loc.abilityText ? '<p class="warn">This location has an ability but no player-facing text yet — students will see a blank description during the battle.</p>' : ''}
        <p class="note">A new ability key needs a code change in js/game/abilities.js first — this list is scanned from what the engine already checks for, not hand-typed.</p>
      `).join('')}
    </div>`;
}

function scoringSection(lvl) {
  const sc = lvl.scoring || {};
  return `
    <div class="form-section">
      <h3>Scoring</h3>
      <div class="f2">
        <div class="f"><label>win threshold (locations)</label><input type="number" data-path="scoring.winThreshold" data-num="1" value="${sc.winThreshold ?? 2}"></div>
        <div class="f"><label>tiebreaker</label>
          <select data-path="scoring.tiebreaker">
            <option value="total-ip" ${sc.tiebreaker === 'total-ip' ? 'selected' : ''}>Total IP</option>
          </select></div>
      </div>
    </div>`;
}

function presentationSection(lvl) {
  const p = lvl.presentation || {};
  return `
    <div class="form-section">
      <h3>Presentation</h3>
      <div class="f"><label>body class (css hook)</label><input data-path="presentation.bodyClass" value="${esc(p.bodyClass || '')}" placeholder="e.g. sargon-battle"></div>
      <div class="f2">
        <div class="f"><label>ally avatar</label><input data-path="presentation.allyAvatar" value="${esc(p.allyAvatar || '')}"></div>
        <div class="f"><label>opponent avatar</label><input data-path="presentation.opponentAvatar" value="${esc(p.opponentAvatar || '')}"></div>
      </div>
      <div class="f"><label>opponent bubble portrait</label><input data-path="presentation.opponentBubblePortrait" value="${esc(p.opponentBubblePortrait || '')}"></div>
      <div class="f"><label class="chk"><input type="checkbox" data-path="presentation.popAlly" data-bool="1" ${p.popAlly ? 'checked' : ''}> pop the ally portrait in on battle start</label></div>
    </div>`;
}

function rulesPopupSection(lvl) {
  const rp = lvl.rulesPopup || { title: '', body: [] };
  return `
    <div class="form-section">
      <h3>Rules popup <span class="note">(shown once, first time — optional)</span></h3>
      <div class="f"><label>title</label><input data-path="rulesPopup.title" value="${esc(rp.title || '')}"></div>
      <div class="f"><label>body (one line per row)</label>
        <textarea data-path="rulesPopup.body" data-lines="1">${esc((rp.body || []).join('\n'))}</textarea></div>
    </div>`;
}

const DIALOGUE_KEYS = ['opening', 'serfWinA', 'serfWinB', 'loss', 'tie', 'giantIntro', 'giantWinA', 'giantWinB', 'giantLoss', 'giantDraw'];

function dialogueSection(lvl) {
  const d = lvl.dialogue || {};
  const opponentKey = (lvl.bleep && lvl.bleep.defaultKey) || '';
  return `
    <div class="form-section">
      <h3>Dialogue</h3>
      ${DIALOGUE_KEYS.map(key => {
        const lines = d[key] || [];
        return `
        <h4>${esc(key)}</h4>
        ${lines.map((line, i) => `
          <div class="f2" data-dlg="${esc(key)}:${i}">
            <div class="f" style="flex:0 0 110px">
              <select data-dlg-who="${esc(key)}:${i}">
                <option value="explorer" ${line.who === 'explorer' ? 'selected' : ''}>Explorer</option>
                <option value="${esc(opponentKey)}" ${line.who && line.who !== 'explorer' ? 'selected' : ''}>${esc(opponentKey || 'opponent — set bleep.defaultKey first')}</option>
              </select>
            </div>
            <div class="f"><input data-dlg-text="${esc(key)}:${i}" value="${esc(line.text || '')}"></div>
            <button class="ghost sm" data-dlg-remove="${esc(key)}:${i}" title="Remove line">✕</button>
          </div>`).join('')}
        <div class="rowbtns"><button class="ghost sm" data-dlg-add="${esc(key)}">+ Add line</button></div>`;
      }).join('')}
    </div>`;
}

function wireForm(id, lvl) {
  $('#lvl-del').onclick = () => deleteLevel(id);

  // Plain data-path fields — one generic wiring pass instead of a bind()
  // call per field, same reasoning as commands.js's setLevelField.
  $$('#level-form [data-path]').forEach(el => {
    const path = el.dataset.path;
    if (el.tagName === 'TEXTAREA' && el.dataset.lines) {
      el.addEventListener('input', () => {
        setLevelField(path, el.value.split('\n').map(s => s.trim()).filter(Boolean));
        markDirty();
      });
      return;
    }
    // SELECT/checkbox fire once per discrete choice ('change'), not per
    // keystroke — safe to rerender (needed so e.g. abilityKey's warning
    // shows/hides immediately). Text/number inputs stay silent; see
    // bindField's own comment for why re-rendering those drops focus.
    const isDiscrete = el.tagName === 'SELECT' || el.type === 'checkbox';
    const ev = isDiscrete ? 'change' : 'input';
    bindField(`#level-form [data-path="${cssEscape(path)}"]`, ev, path, v => {
      if (el.dataset.num) return v === '' ? undefined : Number(v);
      if (el.dataset.bool) return el.checked;
      return v;
    }, { rerender: isDiscrete });
  });

  // abilityText's "no player-facing text yet" warning is computed at render
  // time, so it goes stale while typing (deliberately — see bindField's
  // comment). Refresh once on blur, so it catches up as soon as you leave
  // the field instead of staying wrong until some unrelated repaint.
  $$('[data-blur-rerender]').forEach(el => { el.addEventListener('blur', () => requestRender()); });

  // Turns resizes the per-turn capital list, so it has to rerender — but
  // only on 'change' (blur/Enter), never on 'input', or typing "10" would
  // resize/rerender after the "1" and drop focus mid-keystroke.
  const turnsEl = $('[data-resize-turns]');
  if (turnsEl) turnsEl.addEventListener('change', () => {
    const n = Math.max(1, Number(turnsEl.value) || 1);
    turnsEl.value = n;
    setTurnCount(n);
  });
  // Per-turn capital boxes: plain number inputs, no rerender needed (nothing
  // else on screen reflects a single turn's value), so typing is safe as-is.
  $$('[data-capital-turn]').forEach(el => {
    el.addEventListener('input', () => setCapitalForTurn(Number(el.dataset.capitalTurn), Number(el.value) || 0));
  });

  const dp = $('#lvl-pick-ai-deck');
  if (dp) dp.onclick = () => {
    pickDeck(((lvl.decks && lvl.decks.ai && lvl.decks.ai.ids) || []).slice(), ids => setDeckIds('ai', ids));
  };

  DIALOGUE_KEYS.forEach(key => {
    const addBtn = $(`[data-dlg-add="${key}"]`);
    if (addBtn) addBtn.onclick = () => addDialogueLine(key);
  });
  $$('[data-dlg-remove]').forEach(b => {
    const [key, idx] = b.dataset.dlgRemove.split(':');
    b.onclick = () => removeDialogueLine(key, Number(idx));
  });
  $$('[data-dlg-who]').forEach(el => {
    const [key, idx] = el.dataset.dlgWho.split(':');
    el.onchange = () => setDialogueLine(key, Number(idx), 'who', el.value);
  });
  $$('[data-dlg-text]').forEach(el => {
    el.addEventListener('input', () => {
      const [key, idx] = el.dataset.dlgText.split(':');
      setDialogueLine(key, Number(idx), 'text', el.value);
    });
  });
}

/* CSS.escape isn't universally needed here (ids are level ids / dot paths,
   never containing quotes) but a stray one would break the attribute
   selector silently — cheap insurance. */
function cssEscape(s) { return s.replace(/["\\]/g, '\\$&'); }

/* ══════════════════════════════════════════════════════════════════════════
   Boss preview (Phase 1, read-only) ─────────────────────────────────────
   Mirrors formHtml's section layout field-for-field so the two views are
   visually comparable, but built entirely from <div>/<span> — no <input>,
   <select>, or <textarea> anywhere in this half of the file. There is
   nothing here to wire: renderForm() returns right after setting
   innerHTML for a boss, unlike wireForm() for an authored level.

   Every value comes straight from tools/map-editor/boss-extract.js's
   extraction result (see that file's own docstring for the two mechanisms
   — bracket-span-finding and isPlainLiteral). A field whose extraction
   isn't a plain literal is flagged with .impure-note rather than silently
   shown as if it were an ordinary value — the user asked specifically for
   dynamically-built dialogue/fields to be visible but never mistakable for
   editable data. */

function bossFormHtml(p) {
  return `
    <div class="ro-banner">Hand-authored in <code>${esc(p.file)}</code>. Structure/locations/decks/etc. below are read-only — only the Dialogue section can be edited and saved back to the file.</div>
    <div class="form-section"><h3>${esc(p.nodeId)}</h3></div>
    ${bossStructureSection(p)}
    ${bossDecksSection(p)}
    ${bossLocationsSection(p)}
    ${bossScoringSection(p)}
    ${bossPresentationSection(p)}
    ${bossRulesPopupSection(p)}
    ${bossDialogueSection(p)}
    ${bossBespokeSection(p)}
    ${bossNotesSection(p)}
  `;
}

function roField(label, value) {
  return `<div class="ro-field"><span class="k">${esc(label)}</span><span class="v">${esc(value == null || value === '' ? '—' : String(value))}</span></div>`;
}

function bossStructureSection(p) {
  const s = p.structure || {};
  const r = p.resource || {};
  return `
    <div class="form-section">
      <h3>Structure</h3>
      <div class="f2">${roField('turns', s.turns)}${roField('locations', s.locationsCount)}</div>
      <div class="f2">${roField('slots per location', s.slotsPerLocation)}${roField('hand start', s.handStart)}</div>
      ${roField('max hand size', s.maxHandSize)}
      <h4>Resource</h4>
      <div class="f2">${roField('model', r.model)}${r.model === 'capital' ? roField('capital (flat, per turn)', r.capital) : ''}</div>
    </div>`;
}

function bossDecksSection(p) {
  const ai = p.aiIds;
  let idsText, flag = '';
  if (ai.computed) {
    idsText = (ai.value || []).join(', ');
    flag = `<p class="impure-note">Computed via a method call, not a literal in the source — ${esc(ai.note)}</p>`;
  } else {
    const ex = ai.extraction;
    if (!ex.found) { idsText = '(not found)'; flag = '<p class="impure-note">Variable not found in source.</p>'; }
    else if (!ex.isPlainLiteral) { idsText = ex.evalError ? '(could not evaluate)' : (ex.value || []).join(', '); flag = '<p class="impure-note">Source is not a plain literal — displayed only.</p>'; }
    else idsText = (ex.value || []).join(', ');
  }
  return `
    <div class="form-section">
      <h3>Decks</h3>
      ${roField('player deck', 'not extracted by this tool — see notes below for this boss\'s actual rule')}
      ${roField('AI deck ids', idsText)}
      ${flag}
    </div>`;
}

/* Prefers the constant-resolved version only when it IS a plain literal
   after substitution — otherwise falls back to the raw (unresolved)
   extraction so a genuinely dynamic span is never silently displayed as
   if it were clean. See boss-extract.js's extractWithResolution. */
function bestExtraction(pair) {
  if (pair.resolved && pair.resolved.isPlainLiteral) return { ...pair.resolved, resolvedFrom: pair.raw };
  return pair.raw;
}

function bossLocationsSection(p) {
  const raw = p.locations.raw;
  const best = bestExtraction(p.locations);
  let body;
  if (!raw.found) {
    body = '<p class="impure-note">Not found in source.</p>';
  } else if (best.value == null) {
    body = `<p class="impure-note">Could not evaluate: ${esc(best.evalError || 'unknown error')}</p><pre class="ro-source">${esc(best.sourceText)}</pre>`;
  } else {
    body = best.value.map((loc, i) => `
      <h4>Location ${i + 1}</h4>
      <div class="f2">${roField('id', loc.id)}${roField('name', loc.name)}</div>
      <div class="f2">${roField('region', loc.region)}${roField('image', loc.image)}</div>
      ${roField('ability key', loc.abilityKey)}
      ${roField('ability text', loc.abilityText)}
    `).join('');
  }
  const impureNote = best.resolvedFrom
    ? '<p class="impure-note">Source references named constants (e.g. a location-id variable), not raw literals — resolved below by substituting each constant\'s own value. Display only; Phase 2 would never treat a resolved span as directly editable.</p>'
    : (!best.isPlainLiteral && raw.found ? '<p class="impure-note">Source is not a plain literal and could not be resolved — displayed only.</p>' : '');
  return `<div class="form-section"><h3>Locations</h3>${impureNote}${body}</div>`;
}

function bossScoringSection(p) {
  const sc = p.scoring || {};
  return `
    <div class="form-section">
      <h3>Scoring</h3>
      <div class="f2">${roField('win threshold (locations)', sc.winThreshold)}${roField('tiebreaker', sc.tiebreaker)}</div>
      ${roField('exact tie', sc.exactTie)}
    </div>`;
}

function bubbleText(bubble) {
  if (!bubble) return null;
  if (!bubble.found) return '(not found)';
  return bubble.isPlainLiteral ? bubble.value : bubble.sourceText;
}

function bossPresentationSection(p) {
  const pr = p.presentation;
  if (pr.inline) {
    const bt = bubbleText(pr.bubblePortrait);
    return `<div class="form-section"><h3>Presentation</h3>
      <p class="impure-note">${esc(pr.note)}</p>
      ${bt != null ? roField('opponent bubble portrait', bt) : ''}
    </div>`;
  }
  const best = bestExtraction(pr.extraction);
  const val = best.value || {};
  const bt = bubbleText(pr.bubblePortrait) ?? val.opponentBubblePortrait;
  return `
    <div class="form-section">
      <h3>Presentation</h3>
      ${!best.isPlainLiteral ? '<p class="impure-note">Source is not a plain literal — displayed only.</p>' : ''}
      ${roField('body class', val.bodyClass)}
      <div class="f2">${roField('ally avatar', val.allyAvatar)}${roField('opponent avatar', val.opponentAvatar)}</div>
      ${roField('opponent bubble portrait', bt)}
      ${roField('pop ally on battle start', val.popAlly ? 'yes' : 'no')}
    </div>`;
}

function bossRulesPopupSection(p) {
  const rp = p.rulesPopup;
  const title = rp.title.found ? rp.title.value : '(not found)';
  const body = (rp.body.found && rp.body.isPlainLiteral) ? (rp.body.value || []) : [];
  return `
    <div class="form-section">
      <h3>Rules popup <span class="note">(shown once, first time)</span></h3>
      ${roField('title', title)}
      ${!rp.body.found ? '<p class="impure-note">Body not found in source.</p>' : (!rp.body.isPlainLiteral ? '<p class="impure-note">Body is not a plain literal — displayed only.</p>' : '')}
      <div class="ro-field"><span class="k">body</span>
        ${body.map(l => `<div class="v">${esc(l)}</div>`).join('') || '<span class="v">—</span>'}
      </div>
    </div>`;
}

/* Phase 2: an array with editable:true (see boss-extract.js's
   dialogueEditability — plain literal, no sameAs, no fields beyond
   who/text) renders as editable rows, same input shape as the authored-
   level dialogue form. Everything else keeps Phase 1's read-only .ro-line
   rendering, with editBlockedReason shown instead of re-deriving why —
   that gate is computed once, server-side, in boss-extract.js. */
function bossDialogueSection(p) {
  const bossKey = p.nodeId;
  const pending = State.bossDialogueEdits[bossKey] || {};
  const dirtyCount = Object.keys(pending).length;
  const colors = bossSpeakerColors(p);
  return `
    <div class="form-section">
      <h3>Dialogue</h3>
      <div class="rowbtns">
        <button class="primary sm" id="boss-dlg-save" ${dirtyCount ? '' : 'disabled'}>
          Save dialogue${dirtyCount ? ` (${dirtyCount} array${dirtyCount === 1 ? '' : 's'} changed)` : ''}
        </button>
        <p class="note">Writes only the array(s) you've changed, straight into ${esc(p.file)} — .bak kept, whole file syntax-checked first. Structure/locations/etc. above stay read-only.</p>
      </div>
      ${DIALOGUE_KEYS.map(key => {
        const d = p.dialogue[key];
        if (!d || !d.present) return `<h4>${esc(key)}</h4><p class="note">(no such beat for this boss)</p>`;
        const varName = d.varName || d.sharedWith;
        let noteHtml = '';
        if (d.sharedWith) noteHtml = `<p class="note">Shares dialogue with <code>${esc(d.sharedWith)}</code> — ${esc(d.note || '')}</p>`;
        else if (d.note) noteHtml = `<p class="note">${esc(d.note)}</p>`;

        const header = `<h4>${esc(key)} ${varName ? `<span class="note">(${esc(varName)})</span>` : ''}</h4>`;

        if (!d.editable) {
          const ex = d.extraction;
          const lines = (ex && ex.isPlainLiteral) ? (ex.value || []) : [];
          const src = (ex && ex.found && !ex.isPlainLiteral && !ex.evalError) ? `<pre class="ro-source">${esc(ex.sourceText)}</pre>` : '';
          return `
            ${header}
            ${noteHtml}
            <p class="impure-note">Not editable — ${esc(d.editBlockedReason || 'unknown reason')}.</p>
            ${src}
            ${lines.map(line => {
              const c = speakerColor(colors, line.who);
              return `<div class="ro-line"><span class="who" style="color:${c}">${esc(line.who || '')}</span><span class="text" style="color:${c}">${esc(line.text || '')}</span></div>`;
            }).join('')}
          `;
        }

        const isDirty = !!pending[key];
        const lines = isDirty ? pending[key] : d.extraction.value;
        // Extra fields (slamBefore/revealBefore etc.) come from the ORIGINAL
        // server data by line INDEX, never from the edit buffer — the buffer
        // only ever holds {who,text} (see commands.js's _bossEditBuffer),
        // and these flags never change from the UI, only their line's
        // who/text does. Indexing is safe here specifically because
        // lineOpsBlocked arrays can't have their line count changed (add/
        // remove is disabled below), so index i always means the same line
        // on both sides.
        const originalLines = d.extraction.value;
        const commentWarning = d.extraction.hasComments
          ? `<p class="impure-note">This array has a comment in the source${isDirty ? ' — saving these changes may remove it (a comment inside an edited line isn\'t preserved on rewrite).' : '; editing a line that contains it will remove it on save.'}</p>`
          : '';
        const lineOpsNote = d.lineOpsBlocked
          ? `<p class="impure-note">${esc(d.lineOpsBlockedReason)}</p>`
          : '';
        return `
          ${header}
          ${noteHtml}${commentWarning}${lineOpsNote}
          ${lines.map((line, i) => {
            const c = speakerColor(colors, line.who);
            const extra = Object.keys(originalLines[i] || {}).filter(k => k !== 'who' && k !== 'text');
            const extraHtml = extra.length
              ? `<span class="dlg-extra-flags" title="Not editable here — preserved as-is on save">${extra.map(k => esc(k) + ':' + esc(String(originalLines[i][k]))).join(', ')}</span>`
              : '';
            return `
            <div class="f2" data-boss-dlg="${esc(key)}:${i}">
              <div class="f" style="flex:0 0 120px">
                <input data-boss-dlg-who="${esc(key)}:${i}" value="${esc(line.who || '')}" style="color:${c}">
              </div>
              <div class="f"><input data-boss-dlg-text="${esc(key)}:${i}" value="${esc(line.text || '')}" style="color:${c}"></div>
              ${extraHtml}
              ${d.lineOpsBlocked ? '' : `<button class="ghost sm" data-boss-dlg-remove="${esc(key)}:${i}" title="Remove line">✕</button>`}
            </div>`;
          }).join('')}
          <div class="rowbtns">
            ${d.lineOpsBlocked ? '' : `<button class="ghost sm" data-boss-dlg-add="${esc(key)}">+ Add line</button>`}
            ${isDirty ? `<button class="ghost sm" data-boss-dlg-revert="${esc(key)}">Revert to saved</button>` : ''}
          </div>
        `;
      }).join('')}
    </div>`;
}

function wireBossDialogue(preview) {
  const bossKey = preview.nodeId;

  const saveBtn = $('#boss-dlg-save');
  if (saveBtn) saveBtn.onclick = () => saveBossDialogue(bossKey);

  DIALOGUE_KEYS.forEach(key => {
    const addBtn = $(`[data-boss-dlg-add="${cssEscape(key)}"]`);
    if (addBtn) addBtn.onclick = () => addBossDialogueLine(bossKey, key);
    const revertBtn = $(`[data-boss-dlg-revert="${cssEscape(key)}"]`);
    if (revertBtn) revertBtn.onclick = () => revertBossDialogueEdits(bossKey, key);
  });
  $$('[data-boss-dlg-remove]').forEach(b => {
    const [key, idx] = b.dataset.bossDlgRemove.split(':');
    b.onclick = () => removeBossDialogueLine(bossKey, key, Number(idx));
  });
  $$('[data-boss-dlg-who]').forEach(el => {
    const [key, idx] = el.dataset.bossDlgWho.split(':');
    el.addEventListener('input', () => editBossDialogueLine(bossKey, key, Number(idx), 'who', el.value));
  });
  $$('[data-boss-dlg-text]').forEach(el => {
    const [key, idx] = el.dataset.bossDlgText.split(':');
    el.addEventListener('input', () => editBossDialogueLine(bossKey, key, Number(idx), 'text', el.value));
  });
}

/* Speaker → color, by POSITION within one boss's dialogue, not a fixed
   per-character lookup — every boss reads as the same two colors
   (Explorer's light brown + the boss's own blue) instead of each boss
   having its own hue, which read as harder to scan across bosses than it
   was worth. A genuine third speaker (none of the 10 standard arrays has
   one today — Farmer only speaks in Gilgamesh's Cuneiform-intervention
   beat, which isn't one of the 10) gets purple; a 4th+ would also get
   purple rather than growing the palette further.

   Computed fresh per boss from whichever `who` values actually appear in
   ITS OWN dialogue (never a hand-maintained per-boss list — that's what
   drifts), but stable within one render: the non-explorer speakers are
   collected once and sorted alphabetically, not colored in whatever order
   the 10 arrays happen to be walked in — so "the boss" is always blue and
   a third character is always purple, regardless of which array or which
   line within it is read first. */
function bossSpeakerColors(preview) {
  const whoSet = new Set();
  Object.values(preview.dialogue).forEach(d => {
    if (d.present && d.extraction && d.extraction.isPlainLiteral) {
      (d.extraction.value || []).forEach(line => { if (line.who) whoSet.add(line.who); });
    }
  });
  const nonExplorer = [...whoSet].filter(w => w !== 'explorer').sort();
  const colors = { explorer: 'var(--dlg-explorer)' };
  nonExplorer.forEach((who, i) => { colors[who] = i === 0 ? 'var(--exit)' : 'var(--dlg-violet)'; });
  return colors;
}
function speakerColor(colors, who) {
  return (who && colors[who]) || 'var(--text)';
}

function bossBespokeSection(p) {
  if (!p.bespokeMechanics || !p.bespokeMechanics.length) return '';
  return `
    <div class="form-section">
      <h3>Bespoke mechanics <span class="note">(not expressible in this schema)</span></h3>
      ${p.bespokeMechanics.map(m => `
        <div class="bespoke-box">
          <h4>${esc(m.name)}</h4>
          <div class="loc">${esc(m.file)} — ${esc(m.lines)}</div>
          <p>${esc(m.description)}</p>
        </div>`).join('')}
    </div>`;
}

function bossNotesSection(p) {
  if (!p.notes || !p.notes.length) return '';
  return `
    <div class="form-section">
      <h3>Notes</h3>
      <ul class="ro-notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Phase 3 — overworld dialogue (js/overworld.js, the 39 approved arrays).
   Same read/edit shape as the boss dialogue section above, grouped by flow
   instead of by boss — one flat list of {group, arrays} instead of one
   boss's 10 fixed keys, so the rendering is array-driven rather than
   walking a fixed DIALOGUE_KEYS list. Every array here is currently
   editable (verified server-side, see overworld-extract.js's tests), but
   the !a.editable branch is kept for parity with the boss section — a
   future addition to the registry could add an impure or sameAs-like case
   without this file needing a second code path built from scratch.
   ══════════════════════════════════════════════════════════════════════════ */

/* Colors are computed PER ARRAY, not per-document — unlike a boss (one
   character + Explorer, persistent across all 10 keys), overworld dialogue
   has a wide cast (hunter, lucy, farmer, gilgamesh, sargon, trader, ...)
   that changes array to array and rarely repeats. Same positional scheme
   as bossSpeakerColors (Explorer always brown, first other speaker blue,
   a third purple) applied at the scope where it actually makes sense here
   — one array at a time, so an array with only Explorer+one other speaker
   still reads as brown+blue, just not "the same blue as some OTHER array's
   different character" (there's no single "the boss" to anchor on
   document-wide the way there is for a boss preview). */
function overworldArraySpeakerColors(lines) {
  const whoSet = new Set((lines || []).map(l => l.who).filter(Boolean));
  const nonExplorer = [...whoSet].filter(w => w !== 'explorer').sort();
  const colors = { explorer: 'var(--dlg-explorer)' };
  nonExplorer.forEach((who, i) => { colors[who] = i === 0 ? 'var(--exit)' : 'var(--dlg-violet)'; });
  return colors;
}

function overworldFormHtml(preview) {
  const dirtyCount = Object.keys(State.overworldDialogueEdits).length + Object.keys(State.overworldInlineDialogueEdits).length;
  const totalArrays = preview.groups.reduce((n, g) => n + g.arrays.length, 0);
  const totalInline = preview.groups.reduce((n, g) => n + (g.inline || []).length, 0);
  return `
    <div class="ro-banner">Hand-authored in <code>${esc(preview.file)}</code>. ${totalArrays} named dialogue arrays + ${totalInline} inline blocks across ${preview.groups.length} flow groups — grouped to match the approved read-only inventory.</div>
    <div class="form-section">
      <h3>Overworld Dialogue</h3>
      <div class="rowbtns">
        <button class="primary sm" id="overworld-dlg-save" ${dirtyCount ? '' : 'disabled'}>
          Save dialogue${dirtyCount ? ` (${dirtyCount} block${dirtyCount === 1 ? '' : 's'} changed)` : ''}
        </button>
        <p class="note">Writes only the array(s)/block(s) you've changed, straight into ${esc(preview.file)} — .bak kept, whole file syntax-checked first.</p>
      </div>
    </div>
    ${preview.groups.map(overworldGroupHtml).join('')}
  `;
}

function overworldGroupHtml(g) {
  return `
    <div class="form-section">
      <h3>${esc(g.group)}</h3>
      ${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
      ${g.arrays.map(overworldArrayHtml).join('')}
      ${(g.inline || []).map(overworldInlineBlockHtml).join('')}
    </div>`;
}

function overworldArrayHtml(a) {
  const pending = State.overworldDialogueEdits[a.varName];
  const isDirty = !!pending;
  const lines = isDirty ? pending : (a.extraction.value || []);
  const colors = overworldArraySpeakerColors(a.extraction.value);
  const header = `<h4>${esc(a.varName)}</h4>`;

  if (!a.editable) {
    return `
      ${header}
      <p class="impure-note">Not editable — ${esc(a.editBlockedReason || 'unknown reason')}.</p>
      ${lines.map(line => {
        const c = colors[line.who] || 'var(--text)';
        return `<div class="ro-line"><span class="who" style="color:${c}">${esc(line.who || '')}</span><span class="text" style="color:${c}">${esc(line.text || '')}</span></div>`;
      }).join('')}
    `;
  }

  const commentWarning = a.extraction.hasComments
    ? `<p class="impure-note">This array has a comment in the source${isDirty ? ' — saving these changes may remove it (a comment inside an edited line isn\'t preserved on rewrite).' : '; editing it will remove that comment on save.'}</p>`
    : '';
  return `
    ${header}
    ${commentWarning}
    ${lines.map((line, i) => {
      const c = colors[line.who] || 'var(--text)';
      return `
      <div class="f2" data-ow-dlg="${esc(a.varName)}:${i}">
        <div class="f" style="flex:0 0 120px">
          <input data-ow-dlg-who="${esc(a.varName)}:${i}" value="${esc(line.who || '')}" style="color:${c}">
        </div>
        <div class="f"><input data-ow-dlg-text="${esc(a.varName)}:${i}" value="${esc(line.text || '')}" style="color:${c}"></div>
        <button class="ghost sm" data-ow-dlg-remove="${esc(a.varName)}:${i}" title="Remove line">✕</button>
      </div>`;
    }).join('')}
    <div class="rowbtns">
      <button class="ghost sm" data-ow-dlg-add="${esc(a.varName)}">+ Add line</button>
      ${isDirty ? `<button class="ghost sm" data-ow-dlg-revert="${esc(a.varName)}">Revert to saved</button>` : ''}
    </div>
  `;
}

/* Phase 3b — inline (unnamed) dialogue block. Same visual language as
   overworldArrayHtml, three deliberate differences: the heading shows the
   human description + locator (functionName/occurrence) instead of a var
   name, since there isn't one; NO add-line button and NO per-line remove
   button, ever — lineOpsBlocked is unconditionally true for these (see
   overworld-extract.js's buildInlineBlockPreview); and a note explaining
   why, since "there's no + Add line button here" is easy to misread as a
   bug rather than a deliberate safety choice. */
function overworldInlineBlockHtml(b) {
  const pending = State.overworldInlineDialogueEdits[b.id];
  const isDirty = !!pending;
  const lines = isDirty ? pending.lines : (b.extraction.value || []);
  const colors = overworldArraySpeakerColors(b.extraction.value);
  const header = `<h4>${esc(b.description)} <span class="note">(inline — in ${esc(b.functionName)}())</span></h4>`;

  if (!b.editable) {
    return `
      ${header}
      <p class="impure-note">Not editable — ${esc(b.editBlockedReason || 'unknown reason')}.</p>
      ${lines.map(line => {
        const c = colors[line.who] || 'var(--text)';
        return `<div class="ro-line"><span class="who" style="color:${c}">${esc(line.who || '')}</span><span class="text" style="color:${c}">${esc(line.text || '')}</span></div>`;
      }).join('')}
    `;
  }

  const commentWarning = b.extraction.hasComments
    ? `<p class="impure-note">This block has a comment in the source${isDirty ? ' — saving these changes may remove it.' : '; editing it will remove that comment on save.'}</p>`
    : '';
  return `
    ${header}
    <p class="note">Inline block, no name to anchor on — located by position and re-verified against what you loaded right before saving. Lines can't be added or removed here.</p>
    ${commentWarning}
    ${lines.map((line, i) => {
      const c = colors[line.who] || 'var(--text)';
      return `
      <div class="f2" data-ow-inline-dlg="${esc(b.id)}:${i}">
        <div class="f" style="flex:0 0 120px">
          <input data-ow-inline-who="${esc(b.id)}:${i}" value="${esc(line.who || '')}" style="color:${c}">
        </div>
        <div class="f"><input data-ow-inline-text="${esc(b.id)}:${i}" value="${esc(line.text || '')}" style="color:${c}"></div>
      </div>`;
    }).join('')}
    ${isDirty ? `<div class="rowbtns"><button class="ghost sm" data-ow-inline-revert="${esc(b.id)}">Revert to saved</button></div>` : ''}
  `;
}

function wireOverworldDialogue() {
  const saveBtn = $('#overworld-dlg-save');
  if (saveBtn) saveBtn.onclick = () => saveOverworldDialogue();

  $$('[data-ow-dlg-add]').forEach(b => { b.onclick = () => addOverworldDialogueLine(b.dataset.owDlgAdd); });
  $$('[data-ow-dlg-revert]').forEach(b => { b.onclick = () => revertOverworldDialogueEdits(b.dataset.owDlgRevert); });
  $$('[data-ow-dlg-remove]').forEach(b => {
    const [name, idx] = b.dataset.owDlgRemove.split(':');
    b.onclick = () => removeOverworldDialogueLine(name, Number(idx));
  });
  $$('[data-ow-dlg-who]').forEach(el => {
    const [name, idx] = el.dataset.owDlgWho.split(':');
    el.addEventListener('input', () => editOverworldDialogueLine(name, Number(idx), 'who', el.value));
  });
  $$('[data-ow-dlg-text]').forEach(el => {
    const [name, idx] = el.dataset.owDlgText.split(':');
    el.addEventListener('input', () => editOverworldDialogueLine(name, Number(idx), 'text', el.value));
  });

  $$('[data-ow-inline-revert]').forEach(b => { b.onclick = () => revertInlineDialogueEdits(b.dataset.owInlineRevert); });
  $$('[data-ow-inline-who]').forEach(el => {
    const [id, idx] = el.dataset.owInlineWho.split(':');
    el.addEventListener('input', () => editInlineDialogueLine(id, Number(idx), 'who', el.value));
  });
  $$('[data-ow-inline-text]').forEach(el => {
    const [id, idx] = el.dataset.owInlineText.split(':');
    el.addEventListener('input', () => editInlineDialogueLine(id, Number(idx), 'text', el.value));
  });
}

export { render };

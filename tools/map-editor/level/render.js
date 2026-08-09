import { $, $$, esc } from '../shared/utils.js';
import { requestRender } from './notify.js';
import { State as mapState } from '../map/state.js';
import { State, markDirty } from './state.js';
import {
  bindField, setLevelField, selectLevel, createLevel, deleteLevel,
  setDeckIds, addDialogueLine, removeDialogueLine, setDialogueLine
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
  renderForm();
}

/* ── Level list + gap list ───────────────────────────────────────────────
   Gap visibility from the Level side: any battle node in map-data.js with
   no matching entry here shows in "Unconfigured nodes", clickable straight
   into createLevel(). The map inspector's own src2() shows the same gap
   the other way (a "Configure battle →" button on the node itself) — two
   views of one fact, not two separate trackers to keep in sync. */
function renderLevelList() {
  const ul = $('#level-list');
  const ids = Object.keys(State.levels || {});
  ul.innerHTML = ids.map(id => `
    <li class="${id === State.levelId ? 'sel' : ''}" data-id="${esc(id)}">
      <span>${esc(id)}</span><span class="k">${esc((State.levels[id] || {}).kind || '?')}</span>
    </li>`).join('') || '<li class="note">No levels authored yet.</li>';
  $$('#level-list li[data-id]').forEach(li => { li.onclick = () => selectLevel(li.dataset.id); });

  const gaps = battleNodesFromMap().filter(n => !State.levels[n.id]);
  const gl = $('#unconfigured-list');
  gl.innerHTML = gaps.map(n => `
    <li data-id="${esc(n.id)}"><span class="gap-dot">●</span><span>${esc(n.name || n.id)}</span></li>
  `).join('') || '<li class="note">Every battle node on the map has a level.</li>';
  $$('#unconfigured-list li[data-id]').forEach(li => { li.onclick = () => createLevel(li.dataset.id); });
}

/* ── Form ─────────────────────────────────────────────────────────────── */
function renderForm() {
  const wrap = $('#level-form');
  const empty = $('#level-empty-note');
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
  const r = lvl.resource || {};
  return `
    <div class="form-section">
      <h3>Structure</h3>
      <div class="f2">
        <div class="f"><label>turns</label><input type="number" data-path="structure.turns" data-num="1" value="${s.turns ?? 4}"></div>
        <div class="f"><label>locations</label><input type="number" data-path="structure.locationsCount" data-num="1" value="${s.locationsCount ?? 3}"></div>
      </div>
      <div class="f2">
        <div class="f"><label>slots per location</label><input type="number" data-path="structure.slotsPerLocation" data-num="1" value="${s.slotsPerLocation ?? 4}"></div>
        <div class="f"><label>hand start</label><input type="number" data-path="structure.handStart" data-num="1" value="${s.handStart ?? 4}"></div>
      </div>
      <div class="f2">
        <div class="f"><label>max hand size</label><input type="number" data-path="structure.maxHandSize" data-num="1" value="${s.maxHandSize ?? 7}"></div>
        <div class="f"><label>capital per turn</label><input type="number" data-path="resource.capital" data-num="1" value="${r.capital ?? 5}"></div>
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

export { render };

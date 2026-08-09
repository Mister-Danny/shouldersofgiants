import { $, $$, esc } from '../shared/utils.js';
import { State } from './state.js';

/* ── Deck picker ──────────────────────────────────────────────────────────
   Multi-select over State.cards (loaded once from GET /api/level-meta —
   the same loadCards() serve.js uses to validate a save, not a second
   hand-maintained list). Built for the card pool roughly doubling (76 now,
   more landing as the Kush/India/China/Hebrews/Greece/Rome art sets get
   wired into js/cards.js) — search + type/era filters from the start, and
   the grid scrolls inside a fixed-height picker rather than assuming
   everything fits on screen.

   Order doesn't matter: js/game.js's AI-deck branch always calls
   shuffle(ids) regardless of decks.ai.shuffle — that field is read for
   the PLAYER's explicit-source branch, but never for AI. Chips are
   removable, not draggable/reorderable, on purpose — building reorder UI
   for an order the engine ignores would be teaching the wrong lesson about
   what this field does. */
export function pickDeck(currentIds, onOk) {
  const modal = $('#modal');
  let selected = currentIds.slice();
  let search = '';
  let typeFilter = '';
  let eraFilter = '';

  $('#modal-title').textContent = 'Choose AI deck';
  $('#modal-ok').hidden = false;
  $('#modal-ok').disabled = false;

  const types = Array.from(new Set(State.cards.map(c => c.type))).sort();
  const eras  = Array.from(new Set(State.cards.map(c => c.era).filter(Boolean))).sort();

  $('#modal-body').innerHTML = `
    <div class="deck-picker">
      <div class="deck-picker-filters">
        <input id="dp-search" type="text" placeholder="Search by name…">
        <select id="dp-type"><option value="">All types</option>${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
        <select id="dp-era"><option value="">All eras</option>${eras.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}</select>
      </div>
      <div class="deck-picker-selected">
        <div class="deck-picker-count" id="dp-count"></div>
        <div class="chip-list" id="dp-chips"></div>
      </div>
      <div class="deck-picker-grid" id="dp-grid"></div>
    </div>`;

  function cardById(id) { return State.cards.find(c => c.id === id); }

  function drawChips() {
    $('#dp-count').textContent = `${selected.length} card${selected.length === 1 ? '' : 's'} selected`;
    $('#dp-chips').innerHTML = selected.map(id => {
      const c = cardById(id);
      return `<span class="chip" data-id="${id}">${esc(c ? c.name : 'id ' + id)} <button data-remove="${id}" title="Remove">✕</button></span>`;
    }).join('') || '<span class="note">Nothing picked yet — click cards below to add them.</span>';
    $$('#dp-chips button[data-remove]').forEach(b => {
      b.onclick = () => { selected = selected.filter(id => id !== Number(b.dataset.remove)); drawAll(); };
    });
  }

  function drawGrid() {
    const q = search.trim().toLowerCase();
    const list = State.cards.filter(c =>
      (!q || c.name.toLowerCase().includes(q)) &&
      (!typeFilter || c.type === typeFilter) &&
      (!eraFilter || c.era === eraFilter)
    );
    $('#dp-grid').innerHTML = list.map(c => `
      <div class="dp-card ${selected.includes(c.id) ? 'sel' : ''}" data-id="${c.id}">
        <img src="/${esc(c.image)}" alt="" loading="lazy">
        <div class="name">${esc(c.name)}</div>
        <div class="stats">${c.cc} CC · ${c.ip} IP</div>
      </div>`).join('') || '<p class="note">No cards match.</p>';
    $$('#dp-grid .dp-card').forEach(el => {
      el.onclick = () => {
        const id = Number(el.dataset.id);
        selected = selected.includes(id) ? selected.filter(x => x !== id) : selected.concat(id);
        drawAll();
      };
    });
  }

  function drawAll() { drawChips(); drawGrid(); }
  drawAll();

  $('#dp-search').oninput = e => { search = e.target.value; drawGrid(); };
  $('#dp-type').onchange  = e => { typeFilter = e.target.value; drawGrid(); };
  $('#dp-era').onchange   = e => { eraFilter = e.target.value; drawGrid(); };

  const close = () => {
    modal.hidden = true;
    $('#modal-ok').onclick = $('#modal-cancel').onclick = $('#modal-x').onclick = null;
  };
  $('#modal-cancel').onclick = $('#modal-x').onclick = close;
  $('#modal-ok').onclick = () => { close(); onOk(selected); };
  modal.hidden = false;
}

import { $, $$, esc } from './utils.js';

/* ── Art picker modal ─────────────────────────────────────────────────────
   Fully generic — a title, a list of { path, name } entries, and a callback.
   Doesn't know a map, a node, or a level exists, so both editors can share
   it unchanged. */
export function pickArt(title, list, onOk) {
  const modal = $('#modal');
  let chosen = null;
  $('#modal-title').textContent = title;
  $('#modal-ok').disabled = true;

  if (!list.length) {
    $('#modal-body').innerHTML = '<p class="note">No image files found in that folder.</p>';
  } else {
    $('#modal-body').innerHTML = `<div class="art-grid">${list.map((a, i) =>
      `<div class="art" data-i="${i}"><img src="/${a.path}" alt=""><span>${esc(a.name)}</span></div>`
    ).join('')}</div>`;
    $$('#modal-body .art').forEach(el => {
      el.onclick = () => {
        $$('#modal-body .art').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        chosen = list[Number(el.dataset.i)];
        $('#modal-ok').disabled = false;
      };
    });
  }

  const close = () => {
    modal.hidden = true;
    $('#modal-ok').onclick = $('#modal-cancel').onclick = $('#modal-x').onclick = null;
  };
  $('#modal-cancel').onclick = $('#modal-x').onclick = close;
  $('#modal-ok').onclick = () => { if (!chosen) return; close(); onOk(chosen); };
  modal.hidden = false;
}

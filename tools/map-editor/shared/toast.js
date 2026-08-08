import { $ } from './utils.js';

/* ── Toast ────────────────────────────────────────────────────────────── */
let toastTimer = null;
export function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = bad ? 'bad' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3200);
}

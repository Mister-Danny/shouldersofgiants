import { toast } from '../shared/toast.js';
import { getActiveTab } from '../shared/active-tab.js';
import { State } from './state.js';

/* ── Level Editor entry point ────────────────────────────────────────────
   Empty tab for now — no level form, no save target. Still wires its own
   Cmd+Z the same way map/app.js does, guarded by getActiveTab(), so it's
   provable (not just assumed) that a shortcut fired while looking at this
   tab can never reach the map document, and vice versa: see the "no cross-
   tab undo" check in the tab-shell commit's verification. */
let onAfterRender = () => {};

export function initLevelEditor(opts) {
  onAfterRender = (opts && opts.onAfterRender) || onAfterRender;
  document.addEventListener('keydown', onKey);
  onAfterRender();
}

function onKey(e) {
  if (getActiveTab() !== 'level') return;

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (!State.undoStack.length) return toast('Nothing to undo');
    // Nothing ever pushes onto this stack yet — no level form exists to
    // mutate. Kept as a real (if currently unreachable) branch rather than
    // omitted, so the shape matches map/app.js's undo exactly once a level
    // document exists to pop.
    return;
  }
}

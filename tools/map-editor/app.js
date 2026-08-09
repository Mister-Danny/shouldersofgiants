import { $, $$ } from './shared/utils.js';
import { setActiveTab } from './shared/active-tab.js';
import { onConfigureLevel } from './shared/navigate.js';
import { State as mapState } from './map/state.js';
import { State as levelState } from './level/state.js';
import { initMapEditor } from './map/app.js';
import { initLevelEditor } from './level/app.js';
import { createLevel } from './level/commands.js';

/* ── Shell ────────────────────────────────────────────────────────────────
   Owns exactly one thing: which document is on screen. Both editors mount
   ONCE at boot and stay mounted for the session — switching tabs toggles
   [hidden] on their root elements, it never unmounts or re-fetches
   anything. That's the explicit choice for unsaved changes on switch:
   allow it silently. Both documents keep their own State object (and
   therefore their own dirty flag and undo stack) in memory regardless of
   which tab is visible, so nothing is lost by looking away — the risk that
   actually loses work is closing the tab/window with something unsaved,
   which beforeunload below still catches for either document. A confirm-
   before-switch prompt would only protect against a loss that was never
   possible in the first place, for the cost of an interruption every time. */

const ROOTS = { map: $('#map-editor-root'), level: $('#level-editor-root') };
const DOCS  = { map: mapState, level: levelState };

function refreshDirtyDots() {
  Object.keys(DOCS).forEach(id => {
    const dot = $(`#workspace-tabs button[data-workspace="${id}"] .tab-dirty`);
    dot.hidden = !DOCS[id].dirty;
  });
}

function switchTo(id) {
  setActiveTab(id);
  Object.keys(ROOTS).forEach(k => { ROOTS[k].hidden = k !== id; });
  $$('#workspace-tabs button').forEach(b => b.classList.toggle('on', b.dataset.workspace === id));
  refreshDirtyDots();
}

$$('#workspace-tabs button').forEach(b => {
  b.onclick = () => switchTo(b.dataset.workspace);
});

// map/inspector.js's "Configure battle →" button (shared/navigate.js) — it
// can't import the Level tab's own modules (map/ has no business depending
// on level/), so it asks the shell to do both halves: switch tabs, then
// select-or-create that node's level. createLevel() already handles both
// cases (existing id → select; new id → create then select).
onConfigureLevel((nodeId, kind) => {
  if (kind !== 'battle') return;   // 'market' isn't wired in level-runtime.js yet
  switchTo('level');
  createLevel(nodeId);
});

// Losing work to a stray Cmd-W is the actual risk — checked here, once, for
// both documents, regardless of which is on screen right now.
window.addEventListener('beforeunload', e => {
  if (mapState.dirty || levelState.dirty) { e.preventDefault(); e.returnValue = ''; }
});

switchTo('map');
initMapEditor({ onAfterRender: refreshDirtyDots });
initLevelEditor({ onAfterRender: refreshDirtyDots });

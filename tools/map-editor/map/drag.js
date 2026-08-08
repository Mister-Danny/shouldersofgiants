import { clamp, pct } from '../shared/utils.js';
import { requestRender } from '../shared/notify.js';
import { State, markDirty } from './state.js';
import { snapshot, pickEndpoint, currentPos, setPos } from './commands.js';

/* ── Dragging ─────────────────────────────────────────────────────────────
   Strictly pointer handling: interpret pointerdown/move/up into a target and
   a position. The actual state mutation + repaint decision is commands.js's
   currentPos/setPos/pickEndpoint — this module never calls render() or
   anything render.js owns, so render.js (which imports THIS module to wire
   beginDrag into every node/exit/prop/spawn/waypoint element) can do so
   without creating a cycle. */
let drag = null;

export function beginDrag(e, target) {
  e.preventDefault();
  e.stopPropagation();          // don't let the stage treat this as a bare click
  State.sel = target;
  requestRender();
  // In route mode a click on an endpoint picks it for the route, rather than
  // starting a drag.
  if (State.mode === 'route' && ['node', 'exit', 'spawn'].includes(target.type)) {
    pickEndpoint(target.type === 'spawn' ? 'spawn' : target.id);
    return;
  }

  const p = pct(e);
  const cur = currentPos(target);
  snapshot();
  drag = {
    target,
    // Grab offset, so the thing doesn't jump its centre to the cursor.
    dx: cur.x - p.x,
    dy: cur.y - p.y,
    moved: false
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!drag) return;
  const p = pct(e);
  setPos(drag.target, clamp(p.x + drag.dx), clamp(p.y + drag.dy));
  drag.moved = true;
  markDirty();
  requestRender();
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  // A click that never moved shouldn't leave an undo entry behind.
  if (drag && !drag.moved) State.undoStack.pop();
  drag = null;
}

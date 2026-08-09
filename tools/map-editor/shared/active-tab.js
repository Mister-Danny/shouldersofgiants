/* ── Which document is on screen ─────────────────────────────────────────
   Generic on purpose — knows nothing about "map" or "level" beyond the id
   string the shell assigns them. Each editor's own global keydown handler
   checks getActiveTab() before acting on ANYTHING (not just undo — arrow
   nudge, delete, save), because both editors' listeners stay attached to
   `document` at all times (their DOM is hidden via CSS on the inactive tab,
   not unmounted) rather than being added/removed on switch. One check at
   the top of each handler is far lower-risk than getting listener add/
   remove lifecycle right, and it's what actually guarantees a shortcut
   fired while looking at one document can never reach the other. */
let current = null;

export function getActiveTab() { return current; }
export function setActiveTab(id) { current = id; }

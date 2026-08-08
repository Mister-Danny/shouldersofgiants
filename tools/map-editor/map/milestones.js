import { State } from './state.js';

/* ── Milestones — pure queries ────────────────────────────────────────────
   Nothing here mutates State or repaints; moveMilestone/deleteMilestone/
   addMilestone (the mutating trio) live in commands.js. */

/* The scrubber previews the world at a point in the story. Note this uses
   the milestone's INDEX, unlike the game, which decides visibility from the
   flag. That difference is deliberate: the editor is asking "what does this
   look like at story beat N", which is an ordering question. The game is
   asking "what has this player actually done", which is not — their flags
   can be set in any order. Same data, two correct readings. */
export const milestoneIndex = id => {
  if (!id || id === 'start') return 0;
  const i = (State.doc.milestones || []).findIndex(m => m.id === id);
  // An unknown id means the milestone was renamed or deleted out from under
  // this gate. Treat it as "never", which is visible in the editor and
  // matches the game (an unknown flag is never set).
  return i === -1 ? Infinity : i;
};

/* Is this node / exit / prop on screen at the scrubbed story point? */
export function visibleNow(o) {
  if (o.showFrom  && milestoneIndex(o.showFrom)  > State.scrubIdx) return false;
  if (o.showUntil && milestoneIndex(o.showUntil) <= State.scrubIdx) return false;
  return true;
}

/* ── Milestone editor data ───────────────────────────────────────────────
   Story moments are global, not per-map. The important design choice: you
   pick a BATTLE and a TIER rather than typing a flag. That produces
   sog_node_<hook>_<tier>_beaten, which the battle system already writes on
   its own — so a milestone built this way needs no code at all. It also
   makes the two-tier rule visible at the point of decision: the Serf/Giant
   choice IS the "next node here" vs "next region" choice. */
export const FLAG_RE = /^sog_node_(.+)_(serf|giant)_beaten$/;

/* Every battle node across every map that could satisfy a milestone. */
export function battleNodes() {
  return Object.entries(State.doc.maps).flatMap(([mid, m]) =>
    (m.nodes || []).filter(n => n.kind === 'battle' && n.hook)
                   .map(n => ({ mapId: mid, id: n.id, name: n.name, hook: n.hook })));
}

/* Describe where a milestone's flag comes from, in words. */
export function milestoneSource(ms) {
  if (!ms.flag) return { text: 'always true — the beginning of the game', custom: false };
  const m = FLAG_RE.exec(ms.flag);
  if (!m) return { text: 'set by game code · ' + ms.flag, custom: true };
  const node = battleNodes().find(b => b.hook === m[1]);
  const who = node ? (node.name || node.id) : m[1];
  const tier = m[2] === 'giant' ? 'Giant' : 'Serf';
  return { text: `when ${who}'s ${tier} battle is won`, custom: false };
}

/* What breaks if this milestone goes away. */
export function milestoneUsage(id) {
  const out = [];
  for (const [mid, m] of Object.entries(State.doc.maps)) {
    const scan = (arr, label) => (arr || []).forEach((o, i) => {
      const who = `${mid} · ${label(o, i)}`;
      if (o.showFrom  === id) out.push({ obj: o, key: 'showFrom',  who });
      if (o.showUntil === id) out.push({ obj: o, key: 'showUntil', who });
    });
    scan(m.nodes, o => o.id);
    scan(m.exits, o => o.id);
    scan(m.props, (o, i) => 'scenery ' + (i + 1));
  }
  return out;
}

export function uniqueMilestoneId(base) {
  const taken = new Set((State.doc.milestones || []).map(m => m.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

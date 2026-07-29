# Map Editor

A local tool for laying out the overworld: drag nodes, draw walk paths, add
nodes, create regions. It writes `data/map-data.js` and nothing else.

**To open it, double-click `Open Map Editor.command` in the project folder.**
That starts the server and opens the editor in your browser — no terminal, no
install. Leave the black window it opens alone until you're done; closing it
shuts the editor down. There's a **? Help** button in the editor's toolbar
written for non-programmers.

If you'd rather use a terminal, it's the same thing:

```
node tools/map-editor/serve.js
```

- Editor → <http://localhost:8750/tools/map-editor/>
- Game → <http://localhost:8750/>

One process serves both, from the repo root, so the editor loads the same art
by the same relative paths the game uses. No `npm install` — zero dependencies
on purpose, so this still boots in a year.

## What it edits

| | |
|---|---|
| **Drag** | Nodes, exit zones, path waypoints. Arrow keys nudge 0.1%, Shift+arrows 1%. |
| **Draw Path** mode | Select a node, then click the map to lay waypoints leading to it. Drag to adjust, Delete to remove. |
| **+ Add Node** | Pick art, name it, drag it into place. |
| **+ New Map** | Pick a background from `images/metaworld/maps/`, name the region. |
| **Inspector** | id, name, kind, x/y, scale, flipX, image, note. Exits get zone/walkTo/entryAt. |

Cmd/Ctrl+Z undoes (one step per drag, not per pixel). Cmd/Ctrl+S saves. The
previous file is kept as `data/map-data.js.bak` (gitignored).

## The one thing to know

**`kind` is not wired up yet.** The game still dispatches node clicks on
literal node id, in a 212-line `if`-chain in `onNodeClick`
([js/overworld.js](../../js/overworld.js)). So a node you add here will render,
animate and be clickable — and do *nothing* when clicked, until someone adds a
branch for it by hand. Collapsing that chain into `kind`-based dispatch, so
`{kind:'market'}` works with no new code, is Phase 2.

The editor says this in the inspector too. It is not a bug; it is the honest
state of the seam.

## How it stays safe

The map data was split in two:

- **`data/map-data.js`** — pure positional data. The editor owns this file and
  rewrites it wholesale.
- **`NODE_BEHAVIOUR` / `EXIT_BEHAVIOUR` in `js/overworld.js`** — the `showIf`
  gates and the `onBeforeExit` hook. These are *functions* closing over the
  `KEY_*` constants and `runDialogue`, so they can never be serialised out.
  They are merged onto the data by node id at load.

That split is the safety property: the editor can rewrite layout freely and
still has no way to break game logic. It also means **node `id` is a join key**
— renaming a node here silently orphans its gate and its click handler. The
editor warns on delete; it cannot warn on every rename.

Comments you type into `data/map-data.js` are lost on the next save. Use the
per-node `note` field, which round-trips.

## Coordinates

Percentages of the map container, origin top-left. The container is 1280×600
stage px (the 1280×720 stage minus the 120px HUD strip), so 1% x ≈ 12.8px and
1% y ≈ 6px. Nodes are centred on their point — the small gold circle in the
editor is the actual anchor, which is often nowhere near the middle of the art.

`#stage` is aspect-locked to 1280:600 and uses the same `object-fit: cover` as
the game, so a position dragged here is the position rendered in-game. Nothing
is converted on save.

## Known rough edges

- **Egypt** is previewed with the same `translateY(-4%) scale(1.08)` the game
  applies to that map's background image. It is hard-coded in both places
  (`overworld.js` does `if (mapId === 'egypt')`), so a new map gets no
  transform.
- **`egypt-signpost`** is sized by a CSS rule (`width: 126px`) rather than by
  `scale`. The editor replicates it for preview and flags it in the inspector,
  but changing `scale` on that node will not match the game until the CSS rule
  goes.
- **Reveal animations hard-code their own art paths** —
  `_d2aFadeInUrukNode`, `_revealSargonNode` and friends do
  `img.src = NODE_PATH + 'sargonshadow.png'`. Change a node's art here and the
  reveal animation still shows the old sprite.
- **`walls-of-uruk` has a pre-existing position conflict**: the arrival
  cinematic hard-codes `72%/82%` while the data says `74/85`, so the node jumps
  a few percent on the next map load. Called out in its `note`.

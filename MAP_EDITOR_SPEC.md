# Map Editor — implementation reference

Status as of commit `305b388` on `main`. Written for a session extending the
editor or building a second one on the same machinery. Line numbers are from the
files as committed; treat them as anchors, not guarantees.

---

## 1. File map

| File | Lines | Responsibility |
|---|---|---|
| `tools/map-editor/serve.js` | 487 | Zero-dep Node server. Static file serving from repo root, `/api/art`, `/api/save`. Owns **serialisation** (`serialise()`), **validation** (`validate()`), and the `KNOWN` field whitelist. |
| `tools/map-editor/editor.js` | 1512 | The entire browser app. State, render, drag, inspector, routes, milestones, modals, save. No modules, no build step, one global scope. |
| `tools/map-editor/editor.css` | 505 | All editor chrome. Shares nothing with `css/style.css`. |
| `tools/map-editor/index.html` | 109 | Static DOM skeleton — every panel exists in markup and is filled by JS. |
| `tools/map-editor/data-header.txt` | 29 | Comment block prepended to every generated `data/map-data.js`. Edit here, not in the output. |
| `tools/map-editor/README.md` | 171 | User-facing docs. |
| `Open Map Editor.command` | 114 | Double-clickable macOS launcher (repo root). |

### Files the editor touches that aren't editor-specific

| File | Relationship |
|---|---|
| `data/map-data.js` | **The only file the editor writes.** 989 lines, fully generated. |
| `data/map-data.js.bak` | One generation of backup, written on every save. Gitignored. |
| `js/overworld.js` | 5040 lines. Consumes the data. Contains `_buildMaps()` (592), `_isVisible()` (581), `_placeProps()`, `_routeTo()` (856), `_bossHook()` (1216), `_flagTiers()` (1227), and the `EXIT_BEHAVIOUR` / `NODE_BEHAVIOUR` overlays (542, 564). |
| `index.html` | Line 1744 — `<script src="data/map-data.js">` **must** precede `js/overworld.js` (1745). Read synchronously at init. |
| `images/metaworld/maps/` | Background art. Listed by `/api/art` → `.maps`. |
| `images/metaworld/civilization nodes/` | Node art → `.nodes`. |
| `images/metaworld/topography/` | Scenery art → `.topo`. |
| `.claude/launch.json` | Points the preview tooling at `serve.js` on 8750. |

---

## 2. How it launches

**Double-click `Open Map Editor.command`** at the repo root, or:

```bash
node tools/map-editor/serve.js          # PORT=8751 to override
```

- Editor: `http://localhost:8750/tools/map-editor/`
- Game: `http://localhost:8750/`

One process serves both from the repo root, so the editor loads art by the same
relative paths that get written into `map-data.js`. If a path resolves in the
editor it resolves in the game.

**Gating in production: none, because it never ships.** The editor is not
referenced from `index.html`, has no route in the game, and no keypress opens
it. It only exists when `serve.js` is running. `tools/` is committed but inert.

**No localStorage, no cookies, no game globals.** The only `window` use in
`editor.js` is `addEventListener` for drag and `beforeunload` (566, 567, 580,
670). All state is in memory and on the server. This is a real difference from
the game, which is localStorage-heavy.

The launcher checks for Node, verifies the server answers with `curl` rather
than checking whether the port is occupied (`lsof -ti` matches dead client
sockets and produced false "already running" reports), and traps `INT/TERM/HUP`
to kill the child on window close.

---

## 3. Data format

### Where it lives

Single artifact: `data/map-data.js`. **No conversion step** — the editor writes
exactly what the game reads.

It is a **`.js` file assigning a global**, not JSON:

```js
window.SOG_MAP_DATA = { milestones: [...], maps: {...} };
```

Reason: the game is opened off disk on Chromebooks (`file://`), where
`fetch()` of a local `.json` is CORS-blocked. A script tag works everywhere and
stays synchronous, which `_buildMaps()` depends on.

The editor reads it back by fetching the text and running it against a fake
window (`loadMapData()`, editor.js:56):

```js
const w = {};
new Function('window', src)(w);
return w.SOG_MAP_DATA;
```

Save is `POST /api/save` with the whole `doc` as JSON. The server validates,
serialises, syntax-checks the output with `new Function()` **before** writing,
copies the current file to `.bak`, then writes.

### Top-level shape

```js
window.SOG_MAP_DATA = {
  milestones: [ { id, label, flag } ],   // ORDERED — the editor's scrubber walks this
  maps: { '<mapId>': { ...map } }        // insertion order = tab order
};
```

### A real saved map

Verbatim from `data/map-data.js`:

```js
  'persia': {
    displayName: 'Persia',
    image: 'images/metaworld/maps/persia.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'darius',
        name:  'Darius',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/darius.png',
        x: 18, y: 62,
        scale: 1,
        hook:  'darius',
        tiers: 1,
        serfFlagOn: 'encounter',
        victoryFlag: true,
        showFrom: 'china-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'persia-market',
        name:  'The Persian Bazaar',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/persianmarket.png',
        x: 30, y: 46.7,
        scale: 1,
        showFrom: 'china-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      }
    ],
    exits: [
      {
        id:      'to-mesopotamia',
        label:   '← To Mesopotamia',
        zone:    { x: 0, y: 38, w: 15, h: 26 },
        walkTo:  { x: 8, y: 50 },
        target:  'mesopotamia',
        entryAt: { x: 92, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },
```

A map with framing and scenery (`egypt`, abbreviated):

```js
  'egypt': {
    displayName: 'Lower Egypt',
    image: 'images/metaworld/maps/loweregypt.jpg',
    imageFit: { scale: 2, offsetY: 50 },
    spawn: { x: 11.28, y: 78.22 },
    startsFogged: true,
    props: [
      { image: 'images/metaworld/topography/mudhut.png', x: 50.47, y: 77.41,
        scale: 0.2, rotation: 20, showUntil: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 52.23, y: 76.9,
        scale: 0.3, rotation: 20, showFrom: 'neb-beaten', note: 'north (delta)' }
    ],
    ...
    routes: [
      { from: 'spawn', to: 'prehistory', waypoints: [{ x: 47.54, y: 91.67 }, { x: 31.6, y: 88.8 }] }
    ]
  },
```

### Coordinate system — the load-bearing invariant

**Every x/y is a percentage of a 1280×600 box**, origin top-left. That box is
the 1280×720 stage minus the 120px HUD strip. The HUD sits *below* the map, so
the map element is shortened, not covered.

`#stage` in `editor.css:114` is `aspect-ratio: 1280 / 600` and `#bg` uses the
same `object-fit: cover` as `#overworld-map`. That pairing is what makes a
dragged coordinate mean the same thing in both places. **Nothing is converted on
save.** Break the aspect lock and every position silently shifts.

---

## 4. Entity model

Four placeable kinds, plus spawn. In memory they are plain objects inside
`doc.maps[mapId]`, mutated in place.

### Node — `maps[id].nodes[]`

| Field | Req | Notes |
|---|---|---|
| `id` | ✅ | **Join key.** `onNodeClick` dispatches on it; `[data-id]` lookups use it; duplicates rejected at save. Renaming orphans behaviour silently. |
| `name` | ✅ | Display only. |
| `kind` | ✅ | `'battle'` \| `'market'`. Serialiser coerces anything else to `'battle'` (serve.js:159). |
| `image` | ✅ | Repo-relative. |
| `x`, `y` | ✅ | Percent. |
| `scale` | | Omitted = 1. |
| `rotation` | | Degrees. Omitted/0 = none. |
| `flipX` | | Applied to the `<img>`, not the node div. |
| `label` | | Rarely used. |
| `showFrom` / `showUntil` | | Milestone ids. |
| `hook` | | Flag key → `sog_node_<hook>_<tier>_beaten`. |
| `tiers` | | `2` = Serf+Giant ladder (draws two flags), `1` = single level. |
| `victoryFlag` | | Only meaningful with `tiers: 1` — draws one Giant flag that stamps on win. |
| `flagNudge` | | `{ dx, dy }` percent offset for the flag cluster. |
| `serfFlagOn` | | `'encounter'` holds the Serf flag until the boss is met. Omitted = flag erects with the node (reveal-animated bosses). |
| `note` | | Free text. **Round-trips** — the place to put durable prose. |

**How kinds differ:** only `kind` and which optional fields are meaningful.
`bossFields()` (editor.js:846) hides the boss block unless `kind === 'battle'`.
Markets carry no `hook`/`tiers`. There is no per-kind class, constructor or
schema — a node is a bag of fields and the inspector decides what to show.

### Exit — `maps[id].exits[]`

`id`, `label`, `zone {x,y,w,h}`, `walkTo {x,y}`, `target` (map id), `entryAt
{x,y}` — *a coordinate in the target map's space*, `walkOff` (bool, cinematic
off-screen walk that ignores routing), `showFrom`/`showUntil`, `note`.

An **empty `label` renders nothing** while staying clickable — that's how the
hidden Sahara entrances work (`overworld.js`, exit placement guards on
`if (e.label)`).

### Prop (topography) — `maps[id].props[]`

`image`, `x`, `y`, `scale`, `rotation`, `flipX`, `flipY`, `showFrom`,
`showUntil`, `note`. **No `id`** — several mudhuts share art, so props are keyed
by array index. Anything reordering props must re-point `sel` (editor.js:618).

### Route — `maps[id].routes[]`

```js
{ from: '<endpointId>', to: '<endpointId>', waypoints: [{x,y}, ...] }
```

Endpoint = node id, exit id, or the literal `'spawn'`. `waypoints` are
**intermediate bends only** — endpoints implied. Undirected: one entry serves
both directions, reversed on the return trip. Absent pair = straight line, so
only shaped routes are stored.

### Milestone — `doc.milestones[]`

`{ id, label, flag }`. `flag` is a localStorage key or `null` (only `start`).
**Order is editor-only** — the game decides visibility from the flag, never the
index (see §8).

---

## 5. Canvas / interaction layer

No canvas. **Absolutely-positioned DOM in `#overlay`**, percent left/top, plus
one `<svg id="paths">` for route lines. `render()` (editor.js:153) wipes and
rebuilds everything on every change. No diffing, no virtual DOM. At ~40 nodes
this is imperceptible; it will not scale to thousands.

### Paint order (editor.js:182–187)

props → nodes → exits → spawn → routes → waypoints. Matches the game's
`insertBefore(overlay.firstChild)` for props.

### What is genuinely generic — reusable as-is

| Thing | Where | Note |
|---|---|---|
| `pct(e)` | 604 | Screen px → percent. **The only place pixels touch the model.** |
| `clamp` / `r2` / `fmt` | 612–614 | |
| `snapshot()` / `undo()` | 71, 75 | Serialises whole `doc`. Type-agnostic. |
| `markDirty()` + `beforeunload` | 84, 670 | |
| `toast()` | 1505 | |
| `bind()` / `snapshotOnce()` | 1057, 1064 | Debounced-undo field binding. |
| `pickArt()` | 1452 | Generic grid picker over any `[{path, name}]`. |
| `esc()` | | |
| `distToSegment()` | 422 | |
| **serve.js whole-file** | | Static serving, path containment, `/api/art` (just add a dir), backup-on-write, syntax-check-before-write. Only `serialise`/`validate`/`KNOWN` are map-shaped. |

### Drag — generic mechanism, hardcoded dispatch

`beginDrag` / `onDragMove` / `onDragEnd` (544–584) are fully generic: grab-offset
preserved, one undo entry per drag, no-op drags popped off the stack.

But they call `currentPos(t)` and `setPos(t, x, y)` (586, 594), which are
**if-chains over literal type strings** — `'node'`, `'exit'`, `'prop'`,
`'spawn'`, else waypoint. To reuse, extract a registry:

```js
const KINDS = { node: { get, set }, exit: { get, set }, ... };
```

That's a ~30-line change and the single highest-value extraction.

### Selection

One global `sel`, shape `{ type, id | index, wpIndex? }`. No multi-select, no
marquee, no grouping. Adding multi-select means touching drag, delete,
inspector and arrow-nudge.

### Inspector

`renderInspector()` (791) is a **type switch** that returns early for `'exit'`
and `'prop'`, otherwise renders the node form. Each form is a template literal
of `<input>`s, re-rendered wholesale, re-bound every time. Field wiring is
`bind('#i-x', 'input', v => {...})`.

**Pattern is reusable; the content is not.** For a second editor, copy the
shape — template literal + `bind()` calls + `snapshotOnce()` — and write new
forms.

### Hardcoded to maps/nodes — must be replaced

| | Where | |
|---|---|---|
| `render()` order | 182–187 | Knows about props/nodes/exits/spawn by name. |
| `renderLists()` | 504 | Three hardcoded `<ul>`s. |
| `currentPos`/`setPos` | 586, 594 | Type if-chains. |
| `endpointsOf()` | 318 | Assumes nodes+exits+spawn. |
| `#stage` aspect lock | css:114 | **1280:600 is map-specific.** A battle editor needs its own frame. |
| `doc` / `maps` / `mapId` | 22–24 | Assume a map-keyed document. |
| `WIRED_NODES` | 941 | Hand-maintained Set mirroring `onNodeClick`. |
| `CSS_SIZED` | 36 | Hardcodes `egypt-signpost`. |

### Risky to touch

1. **The 1280:600 aspect lock + `object-fit: cover` mirroring.** This is the
   invariant. Break it and every coordinate silently means something else. A
   second editor must establish its own equivalent deliberately.
2. **`serialise()` + `KNOWN` + `validate()` must move in lockstep.** Adding a
   field means editing all three or the field is silently dropped — this bit
   twice (`routes`, `imageFit`) before `unknownFields()` was added to catch it.
3. **`_buildMaps()` in overworld.js:612** now copies *every* field. It used to
   copy an explicit list, which silently dropped new map-level fields twice. Do
   not reintroduce a list.

---

## 6. Topography

Scenery is `props[]` per map — decorative, never clickable, painted behind
nodes. Art from `images/metaworld/topography/`, listed as `/api/art` → `.topo`.

Transform must match the game exactly or placement lies. Game
(`_placeProps`, overworld.js) and editor (`propEl`, editor.js:254) both do:

```
translate(-50%,-50%) rotate(<rotation>deg) scale(<scale * flipX?-1:1>, <scale * flipY?-1:1>)
```

Flips are a **signed scale**, not a separate transform. Props are the only
entity with `flipY`.

Props carry `showFrom`/`showUntil` like everything else, and that pair is how
one map holds both its locked and unlocked dressing: Egypt's early mudhuts carry
`showUntil: 'neb-beaten'`, the advanced ones `showFrom: 'neb-beaten'`.

**Background framing** is per-map `imageFit { anchor, scale, offsetX, offsetY }`,
applied to the image only — never the overlay. `applyFit()` (editor.js:209) and
overworld.js:1020 must stay identical. `renderFitPanel()`/`reportCrop()` (437,
480) read `naturalWidth/Height` to report real crop numbers.

Every source background is taller in proportion than 2.13:1, so
`object-fit: cover` always crops height (16–25% depending on the map).
`imageFit` decides *which* height is lost; it cannot eliminate the crop.

**None of this carries to a level editor.**

---

## 7. State + undo

```js
let doc, maps, mapId, mode, sel, dirty, art, scrubIdx, routeSel, routePick;
const undoStack = [];
```

Plain module-scope globals. No store, no events, no reactivity. Mutate then call
`render()`.

**Undo:** `snapshot()` pushes `JSON.stringify(doc)` before each mutation, capped
at 60. `undo()` parses back and re-points `maps`. **One shared stack, no redo.**
Drags snapshot once on pointerdown; a drag that never moved pops its own entry.
Typing debounces via `snapshotOnce()` (700ms).

Because undo replaces `doc` wholesale, anything holding a reference *into* the
old object is stale after undo. `sel` is re-derived by id, which is why props
being index-keyed is fragile.

**Dirty tracking:** boolean + `beforeunload` guard. No autosave, no recovery.

**Round-trip:** verified lossless. Load → save → reload produces byte-identical
data. Coordinates round to 2dp (`num`), scale to 4dp (`scaleNum` — 2dp
quantised `1.275` → `1.27` and silently resized art).

---

## 8. Known rough edges

### Stale comments — code differs from what it says

| | |
|---|---|
| editor.js:25 | `mode` documented as `'select' \| 'path'`. **Actual values are `'select'` and `'route'`** (index.html:59–60). |
| editor.js:26 | `sel` type list omits `'spawn'`, which is a real selectable type. |
| editor.js:639 | "in path mode append a waypoint" — it's route mode, and it *inserts* at the nearest segment. |

### Dead code

- **`validate()` still checks `n.path`** (serve.js:358–364), the pre-routes
  per-node walk path. `path` is **not** in `KNOWN.node`, so `unknownFields()`
  rejects any node carrying it before that check runs. Unreachable.
- **`NODE_BEHAVIOUR` is `{}`** (overworld.js:564). Every gate is now data. Kept
  as a seam.
- **`_isVisible` still honours a function-valued `showIf`** (overworld.js:586).
  Nothing sets it; it cannot survive serialisation.

### Hand-maintained lists that drift

- **`WIRED_NODES`** (editor.js:941) — must be updated whenever an `onNodeClick`
  branch is added, or the editor keeps warning that a wired node does nothing.
- **`CSS_SIZED`** (editor.js:36) — mirrors `[data-id="egypt-signpost"]` in
  `css/style.css`.
- **`KNOWN`** (serve.js:426) — must match `serialise()`.

### Not implemented

- **No `kind`-based click dispatch.** `onNodeClick` is a long if-chain on
  literal node id. A node added in the editor renders, animates, and does
  nothing. `src2()` (editor.js:945) says so per node. This is the largest
  outstanding gap.
- **No redo.** No multi-select. No copy/paste. No duplicate-entity command.
- **No zoom/pan on the stage** — it's fixed to the frame.
- **Exit zones can be dragged but not resized on canvas** — w/h are inspector
  fields only.

### Workarounds a new session would trip on

1. **`[hidden] { display: none !important; }`** (editor.css:25). An explicit
   `display` in author CSS beats the UA `[hidden]` rule, so `#modal`
   (`display:grid`) rendered on load. Removing this reopens that bug.
2. **The shared `#modal`** is used by three flows (art picker, milestones,
   help). Milestones and help hide `#modal-ok` and relabel `#modal-cancel` to
   "Close" — and must restore both on close, or the art picker comes back
   broken.
3. **A second `serve.js` dies instantly on `EADDRINUSE`** and requests silently
   hit the older process. This produced two false test passes. Check
   `pgrep -f serve.js` before testing, or use `PORT=`.
4. **`data/map-data.js.bak`** is written on every save and gitignored.

### Would redo

- **Extract `currentPos`/`setPos` into a kind registry** before building a
  second editor. Everything else follows from it.
- **Give props stable ids.** Index-keying makes reorder/delete fragile and
  blocks undo from restoring selection correctly.
- **Generate `KNOWN` from `serialise()`**, or drive both from one field table.
  Three places to edit for one field is why fields got dropped twice.
- **Split `editor.js`.** 1512 lines in one scope; the route, milestone and
  inspector sections are independent enough to be separate files even without a
  bundler.

---

## Branch state

`main` — all editor work is here, through `305b388`.
`adventure-first-rebuild` is **34 commits behind `main`** and 0 ahead; it has
none of the editor. Other branches: `auth-system`, `feat/developer-map-builder`
(where the editor started, since merged forward).

The working tree at time of writing has uncommitted changes in `css/style.css`,
`data/map-data.js`, `index.html`, `js/cards.js`, `js/game.js`,
`js/game/abilities.js`, `js/game/card-hover.js`, `js/game/input.js`,
`js/game/state.js` — unrelated card/merchant work, not editor changes.

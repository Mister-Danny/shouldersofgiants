/* ══════════════════════════════════════════════════════════════════════════
   OVERWORLD MAP DATA — the positional source of truth for every region.
   ══════════════════════════════════════════════════════════════════════════

   ⚠ THIS FILE IS WRITTEN BY tools/map-editor. Comments you add here WILL BE
   LOST the next time someone saves from the editor. Put durable prose in the
   per-node `note` field (it round-trips), or in the behaviour overlay in
   js/overworld.js (hand-maintained, never regenerated).

   WHY A .js FILE AND NOT .json — the game is opened straight off disk on
   Chromebooks (file://), and fetch() of a local .json is CORS-blocked there.
   A plain script tag assigning a global works everywhere and stays synchronous,
   which matters because overworld.js reads MAPS during init().

   WHAT LIVES HERE — pure data only. Anything function-valued (showIf gates,
   onBeforeExit hooks) lives in NODE_BEHAVIOUR / EXIT_BEHAVIOUR in
   js/overworld.js and is merged in by id at load. That split is what lets the
   editor rewrite this file without being able to break game logic.

   COORDINATES — x/y are percentages of the map container, origin top-left.
   The container is 1280×600 stage px (the 1280×720 stage minus the 120px HUD),
   so 1% x ≈ 12.8px and 1% y ≈ 6px. Nodes are centred on their point.

   `kind` is recorded but NOT yet consumed by the game — onNodeClick still
   dispatches on literal node id. Wiring kind-based dispatch is Phase 2; until
   then a newly added node renders and animates but has no click behaviour.

   To edit:  node tools/map-editor/serve.js  →  localhost:8750/tools/map-editor/
   ══════════════════════════════════════════════════════════════════════════ */

window.SOG_MAP_DATA = {

  'eastafrica': {
    displayName: 'East Africa',
    image: 'images/metaworld/maps/eastafrica.jpeg',
    spawn: { x: 65, y: 90 },
    startsFogged: false,
    nodes: [
      {
        id:    'egypt-signpost',
        name:  'To Egypt',
        kind:  'signpost',
        image: 'images/metaworld/civilization nodes/toegypt.png',
        x: 20, y: 20,
        note: 'No label — the separate To Egypt exit box (visible post-victory) handles navigation.',
        path: [
          { x: 28, y: 28 },
          { x: 20, y: 20 }
        ]
      },
      {
        id:    'prehistory',
        name:  'Prehistory',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/prehistory node.png',
        x: 38, y: 35,
        note: 'Walk path is a C-shape around the west side of Lake Victoria, staying wide enough to clear the lakes and the mountain range NW of it.',
        path: [
          { x: 45, y: 72 },
          { x: 28, y: 65 },
          { x: 20, y: 50 },
          { x: 22, y: 40 },
          { x: 32, y: 38 },
          { x: 38, y: 35 }
        ]
      }
    ],
    exits: [
      {
        id:      'to-egypt',
        label:   'To Egypt →',
        zone:    { x: 29, y: 5, w: 22, h: 24 },
        walkTo:  { x: 28, y: 16 },
        walkOff: true,
        target:  'egypt',
        entryAt: { x: 10, y: 85 },
        note: 'Sits at the top of the screen just right of the egypt-signpost node. Gated on beating Otzi. entryAt matches the D1 East Africa->Egypt arrival point (Egypt’s west spawn).'
      }
    ]
  },

  'egypt': {
    displayName: 'Egypt',
    image: 'images/metaworld/maps/egyptz.jpeg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    nodes: [
      {
        id:    'double-crown',
        name:  'The Double Crown',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/doublecrown.png',
        x: 23, y: 35,
        scale: 0.95,
        flipX: true,
        note: 'Narmer. Placed at the base of the Nile Delta (the green fan, top-left). ART IS A PLACEHOLDER — swap doublecrown.png when the real art lands.'
      },
      {
        id:    'egypt-market',
        name:  'The River Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/egyptmarket.png',
        x: 29, y: 18,
        scale: 1.1,
        note: '29/18 is the DELTA slot the advanced river hut used to occupy — the market REPLACES that prop. Pre-unlock the player sees the humble riverhut.png there; post-unlock it becomes this walkable market.'
      }
    ],
    exits: [
      {
        id:      'to-mesopotamia',
        label:   'To Mesopotamia →',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'mesopotamia',
        entryAt: { x: 10, y: 85 }
      },
      {
        id:      'to-eastafrica',
        label:   '← To East Africa',
        zone:    { x: 0, y: 70, w: 20, h: 30 },
        walkTo:  { x: 10, y: 85 },
        target:  'eastafrica',
        entryAt: { x: 88, y: 15 }
      }
    ]
  },

  'mesopotamia': {
    displayName: 'Mesopotamia',
    image: 'images/metaworld/maps/mesopotamia.jpeg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    nodes: [
      {
        id:    'walls-of-uruk',
        name:  'Walls of Uruk',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/wallsofuruk@0.33x.png',
        x: 74, y: 85,
        scale: 1.35,
        note: 'Gilgamesh. NOTE: _d2aFadeInUrukNode in overworld.js hardcodes 72%/82% for the arrival cinematic, which disagrees with this position — the node visibly jumps on the next map load. Worth reconciling.'
      },
      {
        id:    'market',
        name:  'Mesopotamian Marketplace',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/mesomarketnode@0.5x.png',
        x: 82, y: 65,
        scale: 2,
        flipX: true,
        note: 'Placed near the Uruk node. First win auto-walks here (returnFromGilgameshWin); afterwards it is a clickable node.'
      },
      {
        id:    'sargon',
        name:  'Akkad',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/sargonshadow.png',
        x: 60, y: 52,
        scale: 1.25,
        note: 'Dust-storm-revealed on the first marketplace return. Boss flags anchor to these coords, so they move with the node. 704x384 art rendered at 84px base — scale is a knob.'
      },
      {
        id:    'hammurabi',
        name:  'Babylon',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hammurabinode.png',
        x: 48, y: 31,
        scale: 1.25,
        note: 'Rises from the dirt on the first overworld return after defeating Sargon. Placed up-and-left of Akkad along the Euphrates.'
      },
      {
        id:    'hanging-gardens',
        name:  'The Hanging Gardens',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hanginggardens@0.33x.png',
        x: 67, y: 69,
        scale: 1.275,
        note: 'Sparkle-revealed on the first overworld return after defeating Hammurabi. Positioned at the midpoint between Walls of Uruk and Akkad.'
      }
    ],
    exits: [
      {
        id:      'to-egypt',
        label:   '← To Egypt',
        zone:    { x: 0, y: 70, w: 20, h: 30 },
        walkTo:  { x: 10, y: 85 },
        target:  'egypt',
        entryAt: { x: 88, y: 15 }
      }
    ]
  }

};

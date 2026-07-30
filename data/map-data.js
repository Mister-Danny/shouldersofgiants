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

  milestones: [
    { id: 'start', label: 'Start of the game', flag: null },
    { id: 'neanderthal-beaten', label: 'Neanderthal defeated', flag: 'sog_post_neanderthal_overworld_complete' },
    { id: 'otzi-beaten', label: 'Ötzi defeated', flag: 'sog_battle_otzi_complete' },
    { id: 'mesopotamia-arrival', label: 'Arrived in Mesopotamia', flag: 'sog_mesopotamia_arrival_complete' },
    { id: 'gilgamesh-beaten', label: 'Gilgamesh defeated', flag: 'sog_battle_gilgamesh_complete' },
    { id: 'sargon-revealed', label: 'Akkad revealed', flag: 'sog_sargon_node_revealed' },
    { id: 'hammurabi-revealed', label: 'Babylon revealed', flag: 'sog_hammurabi_node_revealed' },
    { id: 'hanging-gardens-revealed', label: 'Hanging Gardens revealed', flag: 'sog_hanging_gardens_revealed' },
    { id: 'neb-beaten', label: 'Nebuchadnezzar defeated → Egypt opens', flag: 'sog_egypt_node_live' },
    { id: 'narmer-beaten', label: 'Narmer defeated', flag: 'sog_node_narmer_serf_beaten' },
    { id: 'hatshepsut-beaten', label: 'Hatshepsut defeated', flag: 'sog_node_hatshepsut_serf_beaten' },
    { id: 'ramses-beaten', label: 'Ramses defeated', flag: 'sog_node_ramses_serf_beaten' },
    { id: 'akhenaten-beaten', label: 'Akhenaten defeated', flag: 'sog_node_akhenaten_serf_beaten' }
  ],

  maps: {

  'eastafrica': {
    displayName: 'East Africa',
    image: 'images/metaworld/maps/eastafrica.jpeg',
    spawn: { x: 65, y: 90 },
    startsFogged: false,
    props: [],
    nodes: [
      {
        id:    'egypt-signpost',
        name:  'To Egypt',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/toegypt.png',
        x: 20.05, y: 20,
        showFrom: 'neanderthal-beaten',
        note: 'No label — the separate To Egypt exit box (visible post-victory) handles navigation.',
        path: [
          { x: 33.44, y: 34.49 },
          { x: 20, y: 20 }
        ]
      },
      {
        id:    'prehistory',
        name:  'Prehistory',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/prehistory node.png',
        x: 38.23, y: 33.53,
        note: 'Walk path is a C-shape around the west side of Lake Victoria, staying wide enough to clear the lakes and the mountain range NW of it.',
        path: [
          { x: 47.54, y: 91.67 },
          { x: 31.6, y: 88.8 },
          { x: 30.06, y: 61.61 },
          { x: 32.05, y: 51.21 },
          { x: 35.87, y: 44.69 },
          { x: 38.23, y: 33.53 }
        ]
      }
    ],
    exits: [
      {
        id:      'to-egypt',
        label:   'To Egypt →',
        zone:    { x: 30.02, y: 0.2, w: 22, h: 24 },
        walkTo:  { x: 28, y: 16 },
        walkOff: true,
        target:  'egypt',
        entryAt: { x: 10, y: 85 },
        showFrom: 'otzi-beaten',
        note: 'Sits at the top of the screen just right of the egypt-signpost node. Gated on beating Otzi. entryAt matches the D1 East Africa->Egypt arrival point (Egypt’s west spawn).'
      }
    ]
  },

  'egypt': {
    displayName: 'Egypt',
    image: 'images/metaworld/maps/egyptz.jpeg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [
      { image: 'images/metaworld/topography/ummelqaab@0.25x.png', x: 28, y: 87, scale: 0.35, rotation: 0, showUntil: 'neb-beaten', note: 'Umm el-Qaab necropolis' },
      { image: 'images/metaworld/topography/riverhut.png', x: 29, y: 18, scale: 0.21, rotation: -3, showUntil: 'neb-beaten', note: 'Delta river hut — replaced by the River Market node at the same spot once Neb falls' },
      { image: 'images/metaworld/topography/granary.png', x: 27, y: 46, scale: 0.29, rotation: 0, showUntil: 'neb-beaten' },
      { image: 'images/metaworld/topography/mudhut.png', x: 16, y: 24, scale: 0.2, rotation: 20, showUntil: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/mudhut.png', x: 21, y: 57, scale: 0.2, rotation: 20, showUntil: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/mudhut.png', x: 29, y: 66, scale: 0.2, rotation: 40, showUntil: 'neb-beaten', note: 'east bank' },
      { image: 'images/metaworld/topography/advgranary.png', x: 27, y: 46, scale: 0.26, rotation: 0, showFrom: 'neb-beaten' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 17, y: 24, scale: 0.3, rotation: 20, showFrom: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 22, y: 57, scale: 0.3, rotation: 20, showFrom: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 27, y: 66, scale: 0.3, rotation: -15, flipX: true, showFrom: 'neb-beaten', note: 'east bank — mirrored' }
    ],
    nodes: [
      {
        id:    'double-crown',
        name:  'The Double Crown',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/doublecrown.png',
        x: 22.4, y: 37.56,
        scale: 0.85,
        flipX: true,
        showFrom: 'neb-beaten',
        note: 'Narmer. Placed at the base of the Nile Delta (the green fan, top-left). ART IS A PLACEHOLDER — swap doublecrown.png when the real art lands.'
      },
      {
        id:    'egypt-market',
        name:  'The River Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/egyptmarket.png',
        x: 29, y: 18,
        scale: 1.1,
        showFrom: 'neb-beaten',
        note: '29/18 is the DELTA slot the advanced river hut used to occupy — the market REPLACES that prop. Pre-unlock the player sees the humble riverhut.png there; post-unlock it becomes this walkable market.'
      },
      {
        id:    'kush',
        name:  'Kush',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/kush@0.1x.png',
        x: 28.29, y: 87.77,
        showFrom: 'akhenaten-beaten',
        note: 'Placed and ready; battle not wired. Hidden until Akhenaten falls -- that flag does not exist yet, so it stays hidden until the battle is built.'
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
    props: [],
    nodes: [
      {
        id:    'walls-of-uruk',
        name:  'Walls of Uruk',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/wallsofuruk@0.33x.png',
        x: 73.26, y: 86.18,
        scale: 1.35,
        showFrom: 'mesopotamia-arrival',
        note: 'Gilgamesh. NOTE: _d2aFadeInUrukNode in overworld.js hardcodes 72%/82% for the arrival cinematic, which disagrees with this position — the node visibly jumps on the next map load. Worth reconciling.'
      },
      {
        id:    'market',
        name:  'Mesopotamian Marketplace',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/mesomarketnode@0.5x.png',
        x: 80.52, y: 65.59,
        scale: 2,
        flipX: true,
        showFrom: 'gilgamesh-beaten',
        note: 'Placed near the Uruk node. First win auto-walks here (returnFromGilgameshWin); afterwards it is a clickable node.'
      },
      {
        id:    'sargon',
        name:  'Akkad',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/sargonshadow.png',
        x: 58.52, y: 51.9,
        scale: 1.15,
        showFrom: 'sargon-revealed',
        note: 'Dust-storm-revealed on the first marketplace return. Boss flags anchor to these coords, so they move with the node. 704x384 art rendered at 84px base — scale is a knob.'
      },
      {
        id:    'hammurabi',
        name:  'Babylon',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hammurabinode.png',
        x: 47.54, y: 30.02,
        scale: 1.25,
        showFrom: 'hammurabi-revealed',
        note: 'Rises from the dirt on the first overworld return after defeating Sargon. Placed up-and-left of Akkad along the Euphrates.'
      },
      {
        id:    'hanging-gardens',
        name:  'The Hanging Gardens',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hanginggardens@0.33x.png',
        x: 67, y: 69,
        scale: 1.125,
        showFrom: 'hanging-gardens-revealed',
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
  }
};

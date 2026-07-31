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
    { id: 'akhenaten-beaten', label: 'Akhenaten defeated', flag: 'sog_node_akhenaten_serf_beaten' },
    { id: 'kush-beaten', label: 'Kush defeated', flag: 'sog_node_kush_serf_beaten' },
    { id: 'egypt-complete', label: 'Kush Giant beaten → opens what follows', flag: 'sog_node_kush_giant_beaten' },
    { id: 'greatbath-beaten', label: 'The Great Bath defeated', flag: 'sog_node_greatbath_serf_beaten' },
    { id: 'siddhartha-beaten', label: 'Siddhartha defeated', flag: 'sog_node_siddhartha_serf_beaten' },
    { id: 'ashoka-beaten', label: 'Ashoka defeated', flag: 'sog_node_ashoka_serf_beaten' },
    { id: 'india-complete', label: 'Ashoka Giant beaten → opens what follows', flag: 'sog_node_ashoka_giant_beaten' },
    { id: 'confucius-beaten', label: 'Confucius defeated', flag: 'sog_node_confucius_serf_beaten' },
    { id: 'shihuangdi-beaten', label: 'Shi Huangdi defeated', flag: 'sog_node_shihuangdi_serf_beaten' },
    { id: 'zhangqian-beaten', label: 'Zhang Qian defeated', flag: 'sog_node_zhangqian_serf_beaten' },
    { id: 'china-complete', label: 'Zhang Qian Giant beaten → opens what follows', flag: 'sog_node_zhangqian_giant_beaten' },
    { id: 'persia-complete', label: 'Darius Giant beaten → opens what follows', flag: 'sog_node_darius_giant_beaten' },
    { id: 'abraham-beaten', label: 'Abraham defeated', flag: 'sog_node_abraham_serf_beaten' },
    { id: 'moses-beaten', label: 'Moses defeated', flag: 'sog_node_moses_serf_beaten' },
    { id: 'david-beaten', label: 'David defeated', flag: 'sog_node_david_serf_beaten' },
    { id: 'levant-complete', label: 'David Giant beaten → opens what follows', flag: 'sog_node_david_giant_beaten' },
    { id: 'leonidas-beaten', label: 'Leonidas defeated', flag: 'sog_node_leonidas_serf_beaten' },
    { id: 'pericles-beaten', label: 'Pericles defeated', flag: 'sog_node_pericles_serf_beaten' },
    { id: 'socrates-beaten', label: 'Socrates defeated', flag: 'sog_node_socrates_serf_beaten' },
    { id: 'alexander-beaten', label: 'Alexander the Great defeated', flag: 'sog_node_alexander_serf_beaten' },
    { id: 'greece-complete', label: 'Alexander the Great Giant beaten → opens what follows', flag: 'sog_node_alexander_giant_beaten' },
    { id: 'romulus-beaten', label: 'Romulus and Remus defeated', flag: 'sog_node_romulus_serf_beaten' },
    { id: 'cincinnatus-beaten', label: 'Cincinnatus defeated', flag: 'sog_node_cincinnatus_serf_beaten' },
    { id: 'hannibal-beaten', label: 'Hannibal defeated', flag: 'sog_node_hannibal_giant_beaten' },
    { id: 'julius-beaten', label: 'Julius Caesar defeated', flag: 'sog_node_julius_serf_beaten' },
    { id: 'augustus-beaten', label: 'Augustus defeated', flag: 'sog_node_augustus_serf_beaten' },
    { id: 'rome-complete', label: 'Augustus Giant beaten → opens what follows', flag: 'sog_node_augustus_giant_beaten' },
    { id: 'jesus-beaten', label: 'Jesus defeated', flag: 'sog_node_jesus_serf_beaten' },
    { id: 'paul-beaten', label: 'Paul defeated', flag: 'sog_node_paul_serf_beaten' },
    { id: 'christianity-complete', label: 'Paul Giant beaten → opens what follows', flag: 'sog_node_paul_giant_beaten' },
    { id: 'constantine-beaten', label: 'Constantine defeated', flag: 'sog_node_constantine_serf_beaten' },
    { id: 'empire-complete', label: 'Constantine Giant beaten → opens what follows', flag: 'sog_node_constantine_giant_beaten' }
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
        image: 'images/metaworld/civilization nodes/otzi.png',
        x: 20.05, y: 20,
        tiers: 1,
        showFrom: 'neanderthal-beaten',
        note: 'No label — the separate To Egypt exit box (visible post-victory) handles navigation.'
      },
      {
        id:    'prehistory',
        name:  'Prehistory',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/neanderthal.png',
        x: 38.23, y: 33.53,
        tiers: 1,
        note: 'Walk path is a C-shape around the west side of Lake Victoria, staying wide enough to clear the lakes and the mountain range NW of it.'
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
      },
      {
        id:      'to-sahara',
        label:   '',
        zone:    { x: 0, y: 38, w: 15, h: 26 },
        walkTo:  { x: 8, y: 50 },
        target:  'sahara',
        entryAt: { x: 92, y: 50 },
        showFrom: 'china-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: [
      { from: 'prehistory', to: 'egypt-signpost', waypoints: [{ x: 33.44, y: 34.49 }] },
      { from: 'spawn', to: 'prehistory', waypoints: [{ x: 47.54, y: 91.67 }, { x: 31.6, y: 88.8 }, { x: 30.06, y: 61.61 }, { x: 32.05, y: 51.21 }, { x: 35.87, y: 44.69 }] }
    ]
  },

  'egypt': {
    displayName: 'Egypt',
    image: 'images/metaworld/maps/egyptz.jpeg',
    imageFit: { anchor: 'center top', scale: 1.08, offsetY: -4 },
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [
      { image: 'images/metaworld/topography/ummelqaab@0.25x.png', x: 28, y: 87, scale: 0.35, rotation: 0, showUntil: 'neb-beaten', note: 'Umm el-Qaab necropolis' },
      { image: 'images/metaworld/topography/riverhut.png', x: 29, y: 18, scale: 0.21, rotation: -3, showUntil: 'neb-beaten', note: 'Delta river hut — replaced by the River Market node at the same spot once Neb falls' },
      { image: 'images/metaworld/topography/granary.png', x: 27, y: 46, scale: 0.29, rotation: 0, showUntil: 'neb-beaten' },
      { image: 'images/metaworld/topography/mudhut.png', x: 16, y: 24, scale: 0.2, rotation: 20, showUntil: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/mudhut.png', x: 21, y: 57, scale: 0.2, rotation: 20, showUntil: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/mudhut.png', x: 29, y: 66, scale: 0.2, rotation: 40, showUntil: 'neb-beaten', note: 'east bank' },
      { image: 'images/metaworld/topography/advgranary.png', x: 27.87, y: 45.78, scale: 0.26, rotation: 0, showFrom: 'neb-beaten' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 17, y: 24, scale: 0.3, rotation: 20, showFrom: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 22, y: 57, scale: 0.3, rotation: 20, showFrom: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 27, y: 66, scale: 0.3, rotation: -15, flipX: true, showFrom: 'neb-beaten', note: 'east bank — mirrored' }
    ],
    nodes: [
      {
        id:    'narmer',
        name:  'Narmer',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/narmer.png',
        x: 22.85, y: 33.66,
        scale: 0.8,
        hook:  'narmer',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'neb-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'egypt-market',
        name:  'The River Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/egyptmarket.png',
        x: 28.42, y: 17.38,
        scale: 1,
        showFrom: 'neb-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'hatshepsut',
        name:  'Hatshepsut',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hatshepsut.png',
        x: 24.42, y: 60.74,
        scale: 1,
        hook:  'hatshepsut',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'narmer-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'ramses',
        name:  'Ramses',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/ramses.png',
        x: 29.07, y: 79.7,
        scale: 1,
        hook:  'ramses',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'hatshepsut-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'akhenaten',
        name:  'Akhenaten',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/akhenaten.png',
        x: 21.03, y: 21.95,
        scale: 1,
        hook:  'akhenaten',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'ramses-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'kush',
        name:  'Kush',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/kush.png',
        x: 18.21, y: 95.03,
        scale: 1,
        hook:  'kush',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'akhenaten-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-eastafrica',
        label:   '← To East Africa',
        zone:    { x: 0, y: 70, w: 20, h: 30 },
        walkTo:  { x: 10, y: 85 },
        target:  'eastafrica',
        entryAt: { x: 88, y: 15 }
      },
      {
        id:      'to-mesopotamia',
        label:   'To Mesopotamia →',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'mesopotamia',
        entryAt: { x: 10, y: 85 }
      }
    ],
    routes: []
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
        image: 'images/metaworld/civilization nodes/gilgamesh.png',
        x: 73.26, y: 86.18,
        scale: 1.35,
        hook:  'gilgamesh',
        tiers: 2,
        flagNudge: { dx: 0, dy: -2 },
        serfFlagOn: 'encounter',
        showFrom: 'mesopotamia-arrival',
        note: 'Gilgamesh. NOTE: _d2aFadeInUrukNode in overworld.js hardcodes 72%/82% for the arrival cinematic, which disagrees with this position — the node visibly jumps on the next map load. Worth reconciling.'
      },
      {
        id:    'market',
        name:  'Mesopotamian Marketplace',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/mesomarket.png',
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
        image: 'images/metaworld/civilization nodes/sargon.png',
        x: 58.52, y: 51.9,
        scale: 1.15,
        hook:  'sargon',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        showFrom: 'sargon-revealed',
        note: 'Dust-storm-revealed on the first marketplace return. Boss flags anchor to these coords, so they move with the node. 704x384 art rendered at 84px base — scale is a knob.'
      },
      {
        id:    'hammurabi',
        name:  'Babylon',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hammurabi.png',
        x: 47.54, y: 30.02,
        scale: 1.25,
        hook:  'hammurabi',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        showFrom: 'hammurabi-revealed',
        note: 'Rises from the dirt on the first overworld return after defeating Sargon. Placed up-and-left of Akkad along the Euphrates.'
      },
      {
        id:    'hanging-gardens',
        name:  'The Hanging Gardens',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/nebuchadnezzar.png',
        x: 67, y: 69,
        scale: 1.125,
        hook:  'hanging-gardens',
        tiers: 2,
        flagNudge: { dx: 0, dy: -2 },
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
      },
      {
        id:      'to-levant',
        label:   'The Levant',
        zone:    { x: 0, y: 38, w: 15, h: 26 },
        walkTo:  { x: 8, y: 50 },
        target:  'levant',
        entryAt: { x: 92, y: 50 },
        showFrom: 'persia-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-persia',
        label:   'To Persia →',
        zone:    { x: 84.44, y: 42.25, w: 15, h: 26 },
        walkTo:  { x: 92, y: 50 },
        target:  'persia',
        entryAt: { x: 8, y: 50 },
        showFrom: 'egypt-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-greece',
        label:   'To Greece ↑',
        zone:    { x: 40, y: 0, w: 20, h: 18 },
        walkTo:  { x: 50, y: 10 },
        target:  'greece',
        entryAt: { x: 50, y: 88 },
        showFrom: 'levant-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

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
      },
      {
        id:      'to-india',
        label:   'To India →',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'india',
        entryAt: { x: 10, y: 85 },
        showFrom: 'egypt-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'india': {
    displayName: 'India',
    image: 'images/metaworld/maps/india.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'greatbath',
        name:  'The Great Bath',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/greatbath.png',
        x: 18, y: 62,
        scale: 1,
        hook:  'greatbath',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'egypt-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'india-market',
        name:  'The Indian Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/indiamarket.png',
        x: 30, y: 46.7,
        scale: 1,
        showFrom: 'greatbath-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'siddhartha',
        name:  'Siddhartha',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/siddhartha.png',
        x: 42, y: 37.3,
        scale: 1,
        hook:  'siddhartha',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'greatbath-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'ashoka',
        name:  'Ashoka',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/ashoka.png',
        x: 54, y: 37.3,
        scale: 1,
        hook:  'ashoka',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'siddhartha-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-persia',
        label:   '← To Persia',
        zone:    { x: 0, y: 38, w: 15, h: 26 },
        walkTo:  { x: 8, y: 50 },
        target:  'persia',
        entryAt: { x: 92, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-china',
        label:   'To China →',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'china',
        entryAt: { x: 10, y: 85 },
        showFrom: 'india-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'china': {
    displayName: 'China',
    image: 'images/metaworld/maps/china.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'confucius',
        name:  'Confucius',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/confucious.png',
        x: 18, y: 62,
        scale: 1,
        hook:  'confucius',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'india-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'china-market',
        name:  'The Silk Road Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/chinamarket.png',
        x: 30, y: 46.7,
        scale: 1,
        showFrom: 'india-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'shihuangdi',
        name:  'Shi Huangdi',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/shihuangdi.png',
        x: 42, y: 37.3,
        scale: 1,
        hook:  'shihuangdi',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'confucius-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'zhangqian',
        name:  'Zhang Qian',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/zhangqian.png',
        x: 54, y: 37.3,
        scale: 1,
        hook:  'zhangqian',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'shihuangdi-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-india',
        label:   '← To India',
        zone:    { x: 0, y: 38, w: 15, h: 26 },
        walkTo:  { x: 8, y: 50 },
        target:  'india',
        entryAt: { x: 92, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'levant': {
    displayName: 'The Levant',
    image: 'images/metaworld/maps/levant.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'abraham',
        name:  'Abraham',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/abraham.png',
        x: 71.81, y: 75.74,
        scale: 1,
        hook:  'abraham',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'persia-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'levant-market',
        name:  'The Levantine Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/levantmarket.png',
        x: 33.53, y: 60.76,
        scale: 1,
        showFrom: 'abraham-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'moses',
        name:  'Moses',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/moses.png',
        x: 39.29, y: 43.62,
        scale: 1,
        hook:  'moses',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'abraham-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'david',
        name:  'David',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/david.png',
        x: 32.54, y: 75.35,
        scale: 1,
        hook:  'david',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'moses-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'jesus',
        name:  'Jesus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/jesus.png',
        x: 37.69, y: 31.44,
        scale: 1,
        hook:  'jesus',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'rome-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'paul',
        name:  'Paul',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/paul.png',
        x: 38.4, y: 22.1,
        scale: 1,
        hook:  'paul',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'jesus-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-mesopotamia',
        label:   '← Back',
        zone:    { x: 85, y: 38, w: 15, h: 26 },
        walkTo:  { x: 92, y: 50 },
        target:  'mesopotamia',
        entryAt: { x: 8, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'greece': {
    displayName: 'Greece',
    image: 'images/metaworld/maps/greece.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'leonidas',
        name:  'Leonidas',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/leonidas.png',
        x: 18, y: 62,
        scale: 1,
        hook:  'leonidas',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'levant-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'greece-market',
        name:  'The Agora',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/greecemarket.png',
        x: 30, y: 46.7,
        scale: 1,
        showFrom: 'levant-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'pericles',
        name:  'Pericles',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/pericles.png',
        x: 42, y: 37.3,
        scale: 1,
        hook:  'pericles',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'leonidas-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'socrates',
        name:  'Socrates',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/socrates.png',
        x: 54, y: 37.3,
        scale: 1,
        hook:  'socrates',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'pericles-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'alexander',
        name:  'Alexander the Great',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/alexanderthegreat.png',
        x: 66, y: 46.7,
        scale: 1,
        hook:  'alexander',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'socrates-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-mesopotamia',
        label:   'To Mesopotamia →',
        zone:    { x: 85, y: 38, w: 15, h: 26 },
        walkTo:  { x: 92, y: 50 },
        target:  'mesopotamia',
        entryAt: { x: 8, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-rome',
        label:   'To Rome →',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'rome',
        entryAt: { x: 10, y: 85 },
        showFrom: 'greece-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'rome': {
    displayName: 'Rome',
    image: 'images/metaworld/maps/rome.jpg',
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'romulus',
        name:  'Romulus and Remus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/romulusandremus.png',
        x: 56.07, y: 32.68,
        scale: 1,
        hook:  'romulus',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'greece-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'rome-market',
        name:  'The Roman Forum',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/romanmarket.png',
        x: 64.69, y: 46.81,
        scale: 0.7,
        showFrom: 'romulus-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'cincinnatus',
        name:  'Cincinnatus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/cincinnatus.png',
        x: 80.38, y: 53.87,
        scale: 1,
        hook:  'cincinnatus',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'romulus-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'hannibal',
        name:  'Hannibal',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hannibal.png',
        x: 36.83, y: 8.74,
        scale: 1,
        hook:  'hannibal',
        tiers: 1,
        serfFlagOn: 'encounter',
        victoryFlag: true,
        showFrom: 'cincinnatus-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'julius',
        name:  'Julius Caesar',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/julius.png',
        x: 61.14, y: 36.12,
        scale: 1.35,
        hook:  'julius',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'hannibal-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'augustus',
        name:  'Augustus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/augustus.png',
        x: 73.5, y: 52.3,
        scale: 1,
        hook:  'augustus',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'julius-beaten',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      },
      {
        id:    'constantine',
        name:  'Constantine',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/constantine.png',
        x: 98.23, y: 59.53,
        scale: 1,
        hook:  'constantine',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'christianity-complete',
        note: 'Scaffolded position — drag into place. Battle not wired.'
      }
    ],
    exits: [
      {
        id:      'to-greece',
        label:   '← To Greece',
        zone:    { x: 80, y: 5, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'greece',
        entryAt: { x: 10, y: 85 },
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-sahara',
        label:   '',
        zone:    { x: 40, y: 82, w: 20, h: 18 },
        walkTo:  { x: 50, y: 88 },
        target:  'sahara',
        entryAt: { x: 50, y: 10 },
        showFrom: 'china-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'sahara': {
    displayName: 'Sahara',
    image: 'images/metaworld/maps/garamantes.jpg',
    spawn: { x: 93.23, y: 57.17 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'sahara-market',
        name:  'The Saharan Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/garamantesmarket.png',
        x: 50, y: 55,
        scale: 1,
        showFrom: 'china-complete',
        note: 'Hidden region — no battle here yet.'
      }
    ],
    exits: [
      {
        id:      'to-eastafrica',
        label:   'To East Africa →',
        zone:    { x: 85.41, y: 43.34, w: 15, h: 26 },
        walkTo:  { x: 92, y: 50 },
        target:  'eastafrica',
        entryAt: { x: 8, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-rome',
        label:   '',
        zone:    { x: 60.54, y: 0, w: 20, h: 18 },
        walkTo:  { x: 50, y: 10 },
        target:  'rome',
        entryAt: { x: 50, y: 88 },
        showFrom: 'china-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  }
  }
};

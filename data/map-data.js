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
   so 1% x ≈ 12.8px and 1% y ≈ 6px. Nodes and props STAND on their point: x/y
   is the bottom-centre of the (trimmed) art — its base line — which is also
   what depth-sorts them. A node's optional `stand: { dx, dy }` (map-%, from
   its point) is where the Explorer stops; omitted = just in front of it.
   `standFacing` ('up'|'down'|'left'|'right') overrides which way she then
   faces; omitted = toward the node's art.

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
    { id: 'hatshepsut-giant-beaten', label: 'Hatshepsut Giant beaten → Ramses rises', flag: 'sog_node_hatshepsut_giant_beaten' },
    { id: 'ramses-beaten', label: 'Ramses defeated', flag: 'sog_node_ramses_serf_beaten' },
    { id: 'ramses-giant-beaten', label: 'Ramses Giant beaten → Akhenaten rises', flag: 'sog_node_ramses_giant_beaten' },
    { id: 'akhenaten-beaten', label: 'Akhenaten defeated', flag: 'sog_node_akhenaten_serf_beaten' },
    { id: 'akhenaten-giant-beaten', label: 'Akhenaten Giant beaten → Kush rises', flag: 'sog_node_akhenaten_giant_beaten' },
    { id: 'kush-beaten', label: 'Kush defeated', flag: 'sog_node_kush_serf_beaten' },
    { id: 'egypt-complete', label: 'Kush Giant beaten → opens what follows', flag: 'sog_node_kush_giant_beaten' },
    { id: 'greatbath-beaten', label: 'The Great Bath defeated', flag: 'sog_node_greatbath_serf_beaten' },
    { id: 'siddhartha-beaten', label: 'Siddhartha defeated', flag: 'sog_node_siddhartha_serf_beaten' },
    { id: 'gupta-beaten', label: 'The Gupta defeated', flag: 'sog_node_gupta_serf_beaten' },
    { id: 'india-complete', label: 'Gupta Giant beaten → opens what follows', flag: 'sog_node_gupta_giant_beaten' },
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
        x: 21.95, y: 25.45,
        scale: 0.5515,
        tiers: 1,
        stand: { dx: 0.97, dy: 1.8 },
        showFrom: 'neanderthal-beaten',
        note: 'No label — the separate To Egypt exit box (visible post-victory) handles navigation.'
      },
      {
        id:    'prehistory',
        name:  'Neanderthal Camp',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/neanderthal.png',
        x: 40.85, y: 40.08,
        scale: 1.0874,
        tiers: 1,
        stand: { dx: -0.64, dy: 3.4 },
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
      { from: 'prehistory', to: 'egypt-signpost', waypoints: [{ x: 35.82, y: 45.43 }, { x: 33.44, y: 34.49 }] },
      { from: 'spawn', to: 'prehistory', waypoints: [{ x: 48.76, y: 93.22 }, { x: 39.05, y: 94.16 }, { x: 31.6, y: 88.8 }, { x: 30.06, y: 61.61 }, { x: 32.05, y: 51.21 }, { x: 35.87, y: 44.69 }] },
      { from: 'spawn', to: 'egypt-signpost', waypoints: [{ x: 39.83, y: 90.78 }, { x: 31.18, y: 87.87 }, { x: 28.14, y: 55.11 }] },
      { from: 'spawn', to: 'to-egypt', waypoints: [{ x: 58.88, y: 60.31 }, { x: 51.89, y: 51.55 }, { x: 39.53, y: 46.62 }, { x: 34.52, y: 32.12 }, { x: 26.54, y: 18.89 }, { x: 27.88, y: 15.78 }] },
      { from: 'spawn', to: 'to-sahara', waypoints: [{ x: 43.47, y: 92.15 }, { x: 33.6, y: 89.96 }, { x: 28.88, y: 78.93 }] },
      { from: 'prehistory', to: 'to-egypt', waypoints: [{ x: 32.18, y: 28.38 }] }
    ]
  },

  'egypt': {
    displayName: 'Lower Egypt',
    image: 'images/metaworld/maps/loweregypt.jpg',
    imageFit: { scale: 2, offsetY: 50, smooth: true },
    spawn: { x: 11.28, y: 78.22 },
    startsFogged: true,
    props: [
      { image: 'images/metaworld/topography/riverhut.png', x: 61.57, y: 34.31, scale: 0.344, rotation: -3, showUntil: 'neb-beaten', note: 'Delta river hut — replaced by the River Market node at the same spot once Neb falls' },
      { image: 'images/metaworld/topography/granary.png', x: 37.77, y: 21.46, scale: 0.395, rotation: 0, showUntil: 'neb-beaten' },
      { image: 'images/metaworld/topography/mudhut.png', x: 49.73, y: 79.29, scale: 0.358, rotation: 20, showUntil: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/mudhut.png', x: 40.93, y: 38.14, scale: 0.358, rotation: 20, showUntil: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/mudhut.png', x: 55.46, y: 97.98, scale: 0.358, rotation: 40, showUntil: 'neb-beaten', note: 'east bank' },
      { image: 'images/metaworld/topography/advgranary.png', x: 36.05, y: 25.79, scale: 0.421, rotation: 0, showFrom: 'neb-beaten' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 50.15, y: 79.59, scale: 0.456, rotation: 20, showFrom: 'neb-beaten', note: 'north (delta)' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 40.97, y: 38.64, scale: 0.456, rotation: 20, showFrom: 'neb-beaten', note: 'west bank' },
      { image: 'images/metaworld/topography/advmudhouse3@0.25x.png', x: 56.42, y: 99.01, scale: 0.456, rotation: -15, flipX: true, showFrom: 'neb-beaten', note: 'east bank — mirrored' }
    ],
    nodes: [
      {
        id:    'narmer',
        name:  'Narmer',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/narmer.png',
        x: 56.19, y: 68.56,
        scale: 1.1344,
        flipX: true,
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
        x: 60.04, y: 28.24,
        scale: 1.2124,
        showFrom: 'neb-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      }
    ],
    exits: [
      {
        id:      'to-eastafrica',
        label:   '← To East Africa',
        zone:    { x: 0, y: 69.7, w: 20, h: 30 },
        walkTo:  { x: 10, y: 85 },
        target:  'eastafrica',
        entryAt: { x: 88, y: 15 }
      },
      {
        id:      'to-mesopotamia',
        label:   'To Mesopotamia →',
        zone:    { x: 80.62, y: 38.79, w: 20, h: 30 },
        walkTo:  { x: 88, y: 15 },
        target:  'mesopotamia',
        entryAt: { x: 10, y: 85 }
      },
      {
        id:      'to-upper-egypt',
        label:   'To Upper Egypt ↓',
        zone:    { x: 40, y: 82, w: 20, h: 18 },
        walkTo:  { x: 50, y: 88 },
        target:  'upper-egypt',
        entryAt: { x: 50, y: 19 },
        showFrom: 'narmer-beaten',
        note: 'Bottom of Lower Egypt — the way upriver.'
      }
    ],
    routes: []
  },

  'upper-egypt': {
    displayName: 'Upper Egypt',
    image: 'images/metaworld/maps/upperegypt.jpg',
    spawn: { x: 50, y: 19 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'hatshepsut',
        name:  'Hatshepsut',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hatshepsut.png',
        x: 72.62, y: 35.33,
        scale: 1.606,
        flipX: true,
        rotation: 20,
        hook:  'hatshepsut',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        stand: { dx: -3.9, dy: 1 },
        standFacing: 'right',
        serfFlagOn: 'encounter',
        showFrom: 'narmer-beaten',
        note: 'Scaffolded position on the new Upper Egypt map — drag into place.'
      },
      {
        id:    'ramses',
        name:  'Ramses',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/ramses.png',
        x: 53.95, y: 73.49,
        scale: 1.7742,
        rotation: -3,
        hook:  'ramses',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'hatshepsut-giant-beaten',
        note: 'Scaffolded position on the new Upper Egypt map — drag into place.'
      },
      {
        id:    'akhenaten',
        name:  'Akhenaten',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/akhenaten.png',
        x: 58, y: 40,
        scale: 1.5149,
        hook:  'akhenaten',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'ramses-giant-beaten',
        note: 'Scaffolded position on the new Upper Egypt map — drag into place.'
      },
      {
        id:    'kush',
        name:  'Kush',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/kush.png',
        x: 42.6, y: 89.15,
        scale: 1.5366,
        hook:  'kush',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'akhenaten-giant-beaten',
        note: 'Scaffolded position on the new Upper Egypt map — drag into place.'
      }
    ],
    exits: [
      {
        id:      'to-egypt',
        label:   '↑ To Lower Egypt',
        zone:    { x: 40, y: 0, w: 20, h: 18 },
        walkTo:  { x: 50, y: 10 },
        target:  'egypt',
        entryAt: { x: 50, y: 86 },
        note: 'Top of Upper Egypt — returns to the bottom of Lower Egypt.'
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
        name:  'Gilgamesh',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/gilgamesh.png',
        x: 71.28, y: 94.25,
        scale: 2.0494,
        hook:  'gilgamesh',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'mesopotamia-arrival',
        note: 'Gilgamesh. NOTE: _d2aFadeInUrukNode in overworld.js hardcodes 72%/82% for the arrival cinematic, which disagrees with this position — the node visibly jumps on the next map load. Worth reconciling.'
      },
      {
        id:    'market',
        name:  'Mesopotamian Marketplace',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/mesomarket.png',
        x: 75.17, y: 56.34,
        scale: 1.304,
        flipX: true,
        showFrom: 'gilgamesh-beaten',
        note: 'Placed near the Uruk node. The first Serf win walks the Explorer in for a scripted first visit (returnFromGilgameshWin, sog_market_auto_visit_done); afterwards it is a clickable node.'
      },
      {
        id:    'sargon',
        name:  'Sargon',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/sargon.png',
        x: 58.59, y: 57.04,
        scale: 1.2808,
        hook:  'sargon',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        showFrom: 'sargon-revealed',
        note: 'Dust-storm-revealed on the first marketplace return. Boss flags anchor to these coords, so they move with the node. 704x384 art rendered at 84px base — scale is a knob.'
      },
      {
        id:    'hammurabi',
        name:  'Hammurabi',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hammurabi.png',
        x: 47.53, y: 37.15,
        scale: 0.6036,
        hook:  'hammurabi',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        showFrom: 'hammurabi-revealed',
        note: 'Rises from the dirt on the first overworld return after defeating Sargon. Placed up-and-left of Akkad along the Euphrates.'
      },
      {
        id:    'hanging-gardens',
        name:  'Nebuchadnezzar',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/nebuchadnezzar.png',
        x: 68.09, y: 75.8,
        scale: 2.044,
        hook:  'hanging-gardens',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
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
        zone:    { x: 3.28, y: 40.3, w: 15, h: 26 },
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
        zone:    { x: 22.49, y: 0, w: 20, h: 18 },
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
        x: 37.56, y: 81.35,
        scale: 1.3362,
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
        x: 29.97, y: 51.21,
        scale: 1.4219,
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
        entryAt: { x: 26, y: 24 },
        showFrom: 'egypt-complete',
        note: 'Scaffolded — drag the zone where it belongs.'
      }
    ],
    routes: []
  },

  'india': {
    displayName: 'India',
    image: 'images/metaworld/maps/india1.jpg',
    imageFit: { scale: 1.11 },
    spawn: { x: 26, y: 24 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'greatbath',
        name:  'The Great Bath',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/greatbath.png',
        x: 51.73, y: 29.25,
        scale: 1.5892,
        hook:  'greatbath',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'egypt-complete',
        note: 'Scaffolded position — drag into place.'
      },
      {
        id:    'india-market',
        name:  'The Indian Market',
        kind:  'market',
        image: 'images/metaworld/civilization nodes/indiamarket.png',
        x: 57.81, y: 50.12,
        scale: 1.4036,
        showFrom: 'greatbath-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'siddhartha',
        name:  'Siddhartha',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/siddhartha.png',
        x: 41, y: 50,
        scale: 1.6349,
        hook:  'siddhartha',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'greatbath-beaten',
        note: 'Scaffolded position — drag into place.'
      },
      {
        id:    'gupta',
        name:  'The Gupta',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/gupta.png',
        x: 64.8, y: 28.68,
        scale: 0.505,
        hook:  'gupta',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        serfFlagOn: 'encounter',
        showFrom: 'siddhartha-beaten',
        note: 'Scaffolded position — drag into place.'
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
    image: 'images/metaworld/maps/china1.jpg',
    imageFit: { scale: 1.06 },
    spawn: { x: 10, y: 85 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'confucius',
        name:  'Confucius',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/confucious.png',
        x: 79.73, y: 78.83,
        scale: 1.4708,
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
        x: 83.9, y: 45.6,
        scale: 1.0223,
        showFrom: 'india-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'shihuangdi',
        name:  'Shi Huangdi',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/shihuangdi.png',
        x: 81.13, y: 22.18,
        scale: 1.4693,
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
        x: 73.5, y: 52.51,
        scale: 1.4919,
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
    imageFit: { scale: 1.15 },
    spawn: { x: 11.26, y: 89.6 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'abraham',
        name:  'Abraham',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/abraham.png',
        x: 73.07, y: 82.75,
        scale: 2.0828,
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
        x: 26.07, y: 82.08,
        scale: 1.3523,
        showFrom: 'abraham-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'moses',
        name:  'Moses',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/moses.png',
        x: 45.5, y: 52.28,
        scale: 1.343,
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
        x: 32.93, y: 65.68,
        scale: 1.3418,
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
        x: 36.1, y: 36.14,
        scale: 1.0999,
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
        x: 43.57, y: 22.05,
        scale: 1.0208,
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
    image: 'images/metaworld/maps/greece1.jpg',
    imageFit: { scale: 1.26, offsetX: 1.5, offsetY: 10 },
    spawn: { x: 21.22, y: 4.92 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'leonidas',
        name:  'Leonidas',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/leonidas.png',
        x: 41.72, y: 74.99,
        scale: 1.2654,
        flipX: true,
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
        x: 53.94, y: 55.05,
        scale: 1.1508,
        showFrom: 'levant-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'pericles',
        name:  'Pericles',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/pericles.png',
        x: 44.44, y: 23.36,
        scale: 1.7308,
        flipX: true,
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
        x: 45.6, y: 46.8,
        scale: 1.3793,
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
        x: 33.8, y: 49.54,
        scale: 1.5298,
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
        zone:    { x: 85.4, y: 19.7, w: 15, h: 26 },
        walkTo:  { x: 92, y: 50 },
        target:  'mesopotamia',
        entryAt: { x: 8, y: 50 },
        note: 'Scaffolded — drag the zone where it belongs.'
      },
      {
        id:      'to-rome',
        label:   'To Rome →',
        zone:    { x: 5.78, y: 0, w: 20, h: 30 },
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
    image: 'images/metaworld/maps/rome1.jpg',
    spawn: { x: 88.31, y: 18.14 },
    startsFogged: true,
    props: [],
    nodes: [
      {
        id:    'romulus',
        name:  'Romulus and Remus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/romulusandremus.png',
        x: 53.9, y: 50,
        scale: 1.5111,
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
        x: 62.44, y: 61.42,
        scale: 1.2118,
        showFrom: 'romulus-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'cincinnatus',
        name:  'Cincinnatus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/cincinnatus.png',
        x: 49.83, y: 26.7,
        scale: 0.9695,
        flipX: true,
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
        x: 27.41, y: 27.07,
        scale: 1.4448,
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
        x: 46.9, y: 38.3,
        scale: 0.6263,
        flipX: true,
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
        x: 68.23, y: 71.38,
        scale: 1.6281,
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
        x: 91.5, y: 58.1,
        scale: 2.0352,
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
        x: 42.36, y: 59.47,
        scale: 1.1646,
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

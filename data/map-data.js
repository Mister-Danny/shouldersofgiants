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

   WATER — each map's `water` grid (cell = stage px per cell; rle = run
   lengths, base 36) marks seas, lakes and rivers the Explorer never walks
   across; `crossings` ({ x, y, r }: map-%, radius in stage px) are where a
   river may be forded. Generated from the art, fixed by hand in the editor's
   Water mode; read by js/water-grid.js, which paths every walk round them.

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
        scale: 0.4964,
        tiers: 1,
        stand: { dx: 0.87, dy: 1.62 },
        showFrom: 'neanderthal-beaten',
        note: 'No label — the separate To Egypt exit box (visible post-victory) handles navigation.'
      },
      {
        id:    'prehistory',
        name:  'Neanderthal Camp',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/neanderthal.png',
        x: 40.85, y: 40.08,
        scale: 0.9787,
        tiers: 1,
        stand: { dx: -0.58, dy: 3.06 },
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
    ],
    crossings: [],
    water: { cell: 4, rle: '7o.18.7p.17.7r.z.7z.j.3.9.83.d.8l.9.54a.2.8t.4.8s.3.8r.4.8r.4.8r.4.8t.2.cb.3.8s.2.1.1.8p.3.ve.5.8r.5.8r.5.8r.5.8q.7.8p.7.8p.7.8q.6.3w.2.4s.6.3x.a.4k.5.45.1.4m.5.8s.4.8t.4.8s.5.8s.7.6i.1.28.6.6g.3.28.5.6f.4.29.4.6d.6.29.4.6c.7.2a.4.68.9.n.4.7v.9.n.5.7t.b.h.7.5x.5.1u.a.j.5.7.4.5m.b.1p.8.o.3.2.7.5m.3.7.7.1k.7.r.c.5k.3.e.1.1j.7.u.4.2.6.5g.3.20.6.13.4.5e.4.22.5.6i.5.25.2.6b.a.8r.2.8m.3.8s.4.8s.4.8q.6.8p.b.1.2.8g.9.2.5.8f.a.6.3.3.1.3f.2.4r.b.8.6.3d.4.4p.c.d.1.3c.6.2.2.4k.c.d.3.31.2.6.8.1.3.3.1.4d.e.e.2.30.6.2.h.4c.f.f.2.2u.1.1.s.4b.g.f.2.2r.x.4b.g.g.1.1l.3.11.11.48.h.g.1.1k.6.y.13.6.4.3v.j.g.1.1i.9.x.14.2.8.3u.j.f.2.1i.8.z.14.1.8.3u.j.e.2.1i.8.z.19.2.1.3v.k.e.1.1j.7.z.19.3z.k.d.2.1i.7.z.15.43.l.d.1.1j.4.11.15.43.m.d.2.1j.1.13.14.44.m.d.2.2m.16.42.n.e.1.2m.16.40.p.e.2.2m.16.3y.q.e.2.2m.16.3y.q.f.2.2m.14.3z.q.g.1.2m.13.3z.r.g.2.2l.12.3z.s.h.1.2l.12.3y.t.h.2.2k.10.3z.u.h.2.2j.11.3z.u.h.1.1b.3.p.2.f.z.41.u.h.1.1b.3.p.2.f.z.40.v.h.1.1a.5.p.1.e.10.3z.w.g.2.1a.5.o.1.f.z.40.w.g.1.1b.6.n.1.f.x.42.w.g.1.1a.7.n.1.e.y.19.3.2q.w.g.1.1a.6.13.z.18.4.2o.x.f.2.19.6.15.m.3.6.1.1.18.5.2n.y.f.1.1a.5.16.o.2.3.7.2.13.5.2m.z.f.1.1a.3.17.x.3.3.13.5.2m.z.f.1.1a.2.18.14.12.5.2l.10.f.1.2k.b.1.r.13.4.2l.11.f.1.2l.9.3.n.16.4.2j.13.f.1.2m.6.6.a.1.a.16.4.2k.13.g.1.2k.7.7.3.1.4.4.7.16.4.2j.15.g.1.2k.6.e.2.6.3.19.1.11.2.1i.15.h.1.2k.5.e.2.2k.3.1f.17.h.2.2j.2.1.2.e.2.2h.1.3.3.1d.18.i.1.2j.2.h.2.2h.4.2.2.1b.19.i.1.32.3.2g.6.1.2.15.1e.i.1.31.2.2k.8.13.1f.h.1.1d.1.1o.1.2f.2.5.7.12.1g.g.2.1c.3.42.3.5.6.12.1h.g.1.1c.5.41.4.6.2.2.1.11.1h.g.1.1c.5.42.2.8.1.14.1h.g.2.1b.5.44.1.1c.1h.h.1.1b.5.5i.1g.h.2.1a.5.5i.1g.i.1.19.6.2v.1.b.1.29.1h.i.1.19.6.2u.3.9.2.29.1h.i.1.19.7.2q.5.a.3.28.1h.i.1.19.7.2o.7.9.4.27.1i.i.1.19.8.2m.7.a.3.26.1k.i.1.19.9.2i.9.b.3.26.1k.i.2.18.2.1.6.2h.6.f.3.25.1l.j.2.17.2.1.6.2i.2.2q.1l.l.2.15.1.2.8.58.1l.m.2.16.9.58.1l.n.2.15.a.56.1m.o.4.11.b.56.1m.q.3.10.b.56.1m.s.2.y.b.56.1n.t.2.x.b.55.1o.u.2.w.b.55.1o.v.1.w.b.54.1p.v.2.v.c.53.1p.v.2.w.c.51.1q' }
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
        scale: 1.021,
        flipX: true,
        hook:  'narmer',
        tiers: 2,
        flagNudge: { dx: 0, dy: 3 },
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
        scale: 1.0912,
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
        entryAt: { x: 41, y: 19 }
      },
      {
        id:      'to-mesopotamia',
        label:   'To Mesopotamia →',
        zone:    { x: 80.62, y: 38.79, w: 20, h: 30 },
        walkTo:  { x: 92, y: 50 },
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
    routes: [],
    crossings: [
      { x: 52.66, y: 88.33, r: 14 },
      { x: 58.59, y: 42, r: 14 },
      { x: 77.81, y: 65.67, r: 14 }
    ],
    water: { cell: 4, rle: '0.v2.8.8o.e.8k.d.85.1.e.g.7w.4.i.f.7q.8.j.h.s.4.6q.8.n.h.p.6.6e.2.5.a.i.3.4.j.m.3.3.3.6b.h.i.5.3.k.f.3.3.2.5.2.68.1.3.f.i.7.2.m.7.9.2.2.7.1.67.3.3.8.m.9.2.l.3.d.3.1.6f.5.3.7.d.1.6.b.2.l.2.d.4.1.6f.6.3.6.9.6.4.c.2.k.2.d.4.3.6d.7.4.6.7.7.4.c.2.i.3.d.4.4.6d.8.4.7.5.8.3.c.2.h.4.d.3.5.6c.a.3.9.3.8.3.c.2.h.3.d.3.6.60.1.a.c.3.8.3.8.3.c.1.h.3.d.3.6.61.2.9.c.3.9.3.8.2.c.1.h.2.d.3.6.5w.3.2.7.7.b.3.8.3.8.3.b.2.f.3.d.2.7.5u.5.2.7.7.b.2.9.3.8.3.b.2.e.2.f.2.6.5u.6.2.7.7.b.3.9.3.8.3.a.2.f.1.e.3.6.s.3.4x.7.3.7.7.a.4.9.4.8.3.9.3.c.3.d.3.8.q.5.4v.5.6.p.3.a.3.8.3.a.2.b.4.c.4.a.p.5.4s.5.8.p.4.a.3.8.2.a.2.b.3.c.4.c.o.4.4t.3.6.1.4.p.5.9.3.7.3.9.2.b.3.b.4.e.o.2.4s.3.8.3.2.q.5.9.3.7.2.9.2.a.3.b.4.f.6.2.m.3.4j.5.6.5.3.q.4.b.2.6.2.9.2.a.2.6.9.f.5.5.k.6.15.2.39.4.7.7.3.q.4.b.2.5.2.9.2.9.3.4.a.g.4.6.k.8.11.5.36.5.7.9.3.r.4.9.3.4.2.9.3.7.3.4.5.i.6.8.j.a.z.6.k.5.7.3.26.5.8.a.5.p.4.9.2.4.2.9.3.6.4.4.5.e.9.9.e.3.2.b.y.6.j.t.1r.6.2.4.1.e.6.n.4.8.3.3.2.9.4.4.4.4.4.f.7.b.d.i.y.7.d.1.3.w.1o.d.1.f.a.j.4.7.4.1.3.a.3.3.3.5.4.f.4.e.d.l.w.7.a.17.1j.x.a.h.3.7.4.1.3.a.4.1.3.6.4.e.4.f.a.7.3.f.j.7.5.8.5.1d.1g.12.9.f.3.7.6.c.7.4.5.e.4.f.b.7.3.f.h.m.4.1h.1b.17.9.c.3.8.5.c.2.1.3.4.5.d.5.f.3.3.5.8.3.n.7.2b.17.1e.5.c.3.7.4.d.5.4.4.e.5.f.3.5.3.9.3.p.2.2g.12.1j.4.b.4.7.3.d.4.3.5.d.6.g.2.6.3.9.3.38.z.1n.3.b.3.7.3.d.4.3.4.d.5.h.3.5.4.9.3.39.w.1p.4.a.3.8.2.d.2.4.4.d.3.k.2.1.1.2.4.b.3.3b.s.1t.3.9.3.8.2.b.4.3.4.d.3.k.a.c.3.3d.n.1x.3.8.4.7.2.b.3.3.4.d.3.l.9.d.3.3f.i.20.4.8.3.7.2.b.4.1.4.d.4.k.5.i.3.3i.a.26.4.7.3.7.2.b.3.2.3.e.3.j.5.k.3.60.3.6.3.7.2.b.2.2.4.e.3.i.5.l.3.60.4.5.3.7.2.a.2.3.3.e.3.h.5.n.3.62.3.4.3.7.2.a.2.3.3.e.3.g.4.p.3.63.2.4.2.8.2.9.3.4.2.e.3.f.3.r.3.65.6.9.1.9.2.5.2.d.3.e.4.s.3.65.6.9.2.7.3.4.3.d.3.d.4.t.3.66.5.9.2.7.3.4.3.d.3.c.4.u.3.67.4.9.2.7.2.6.2.d.3.c.3.w.3.66.4.9.2.6.3.6.3.c.3.a.4.y.3.66.3.9.2.5.3.7.3.c.2.a.4.10.3.65.3.9.2.5.3.7.4.a.3.a.3.11.3.65.3.9.2.5.2.9.3.a.3.8.4.11.3.66.3.9.2.4.2.a.3.a.3.7.4.12.3.66.3.9.8.a.3.a.3.5.4.14.3.67.3.8.8.a.3.9.4.4.4.15.3.67.3.9.6.b.3.9.5.1.5.15.3.68.4.8.2.1.3.b.3.8.a.16.3.6a.3.8.6.b.3.8.9.16.3.6b.3.9.5.a.3.8.6.19.3.6c.3.9.5.a.2.8.6.1a.3.6d.3.8.5.9.3.7.5.1d.3.6c.3.8.5.8.3.7.4.1h.3.6b.2.9.3.8.4.6.4.1j.3.6a.2.9.3.7.4.6.3.1m.3.69.2.9.3.6.5.5.4.1m.3.69.2.9.3.6.4.5.4.1m.3.6a.2.9.3.5.4.5.3.c.3.19.3.69.3.9.4.3.3.6.3.b.4.1b.3.68.2.b.8.6.3.a.4.1e.3.66.3.c.7.5.3.a.4.1e.4.66.3.c.7.4.3.a.3.1g.4.66.3.c.6.4.3.a.3.1g.6.65.4.c.4.4.3.a.3.1g.7.65.6.b.4.2.3.a.2.1i.8.65.7.9.9.8.3.1j.8.67.6.8.9.7.3.1k.9.68.5.8.3.1.3.7.4.1l.9.68.4.8.3.1.3.7.2.1n.9.69.3.8.3.1.3.6.3.1o.9.69.4.6.3.1.3.6.3.1q.8.69.3.6.7.5.3.1t.8.68.5.2.8.4.3.1v.8.68.e.4.3.1w.8.68.d.3.3.1z.6.6c.d.25.2.6e.b.25.2.6g.8.26.2.6h.6.27.2.6i.5.27.2.6j.4.27.2.6k.3.27.2.6l.2.27.2.6l.2.27.2.6l.2.27.2.6l.2.27.2.6l.2.27.2.6l.2.27.2.6l.3.26.2.6l.3.26.2.6m.3.25.2.6m.3.24.3.6n.3.21.6.6m.3.20.7.6m.3.20.8.6l.3.21.8.6l.2.21.9.6k.2.21.9.6k.3.1z.a.6k.3.1y.b.6k.3.1x.d.6j.4.1w.e.6i.4.1v.f.6i.4.1u.h.6h.4.1t.j.6h.3.1s.j.6i.2.1t.k.6h.2.1s.l.6h.2.1s.l.6h.2.1s.l.6g.3.1s.l.5k.7.p.2.1t.l.5i.b.n.2.1s.m.5e.f.m.2.1t.m.5c.f.o.2.1u.m.59.h.n.2.1v.m.56.f.s.2.1w.m.55.d.u.1.1x.m.57.7.x.2.1y.l.57.6.x.3.1z.l.69.3.20.k.69.3.21.j.69.3.22.j.68.3.23.i.69.2.24.i.68.2.25.i.67.2.26.i.66.2.27.i.4w.4.15.2.27.i.4v.5.14.3.29.g.4w.4.14.3.29.h.4x.1.14.4.29.h.61.4.2b.g.61.3.2c.h.60.3.2c.i' }
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
        scale: 1.4454,
        flipX: true,
        rotation: 20,
        hook:  'hatshepsut',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        stand: { dx: -3.51, dy: 0.9 },
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
        scale: 1.5968,
        rotation: -3,
        hook:  'ramses',
        tiers: 2,
        flagNudge: { dx: 0, dy: -3 },
        shadow: { length: 0.18, soft: 3 },
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
        scale: 1.3634,
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
        scale: 1.3829,
        hook:  'kush',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        shadow: { length: 0.18, soft: 3 },
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
    routes: [],
    crossings: [
      { x: 49.53, y: 14.33, r: 14 },
      { x: 47.97, y: 78.33, r: 14 }
    ],
    water: { cell: 4, rle: '4j.2.12.2.7q.2.11.4.7p.2.10.6.7p.1.z.8.7o.2.x.a.7n.2.x.a.7n.2.w.b.7n.1.y.a.7n.1.y.a.7n.1.y.b.7l.2.y.b.76.5.a.2.10.a.73.7.b.1.11.a.26.2.4r.9.c.1.12.a.24.3.4r.5.f.2.13.9.22.5.5b.2.14.9.21.5.5a.2.15.a.1z.5.5b.2.16.9.1y.6.5a.2.17.a.1w.6.5a.2.19.b.1t.7.59.2.1a.d.1r.7.58.2.1b.e.1p.8.57.1.1d.e.1o.8.57.2.1c.h.1m.8.2i.2.2n.2.1d.h.1l.8.2e.5.2n.2.1e.i.1k.7.2b.8.2o.1.1g.h.1k.7.2a.6.2q.2.1h.g.1k.7.2b.4.2r.1.1i.g.1j.7.56.2.1j.f.1j.7.56.2.1k.f.1i.7.56.2.1l.e.1i.7.55.2.1n.d.1h.8.55.2.1n.d.1h.7.56.2.1o.d.1g.7.56.2.1o.d.1g.7.56.2.1p.e.1d.8.55.2.1q.f.1c.8.54.3.1r.g.19.9.54.2.1t.g.17.a.54.1.1v.g.16.a.54.1.1x.f.15.a.53.2.1y.f.13.a.54.2.1y.h.10.a.55.2.1z.i.x.a.57.2.1z.i.w.a.57.2.20.i.u.a.59.2.20.i.t.a.59.2.20.i.s.a.5b.2.21.h.r.a.5b.2.22.h.q.9.5c.2.23.h.p.9.5d.1.23.i.o.9.5d.2.23.h.o.9.5e.2.23.h.n.8.5f.2.23.h.n.8.5f.2.24.h.l.9.5e.2.26.h.j.9.5f.2.28.h.g.a.5f.1.2a.i.d.b.5f.2.29.j.b.b.5g.2.2a.k.8.c.5h.2.2a.n.3.d.5h.2.2d.10.5i.2.2e.y.5i.2.2e.y.5j.1.2d.z.5k.1.2c.y.5l.2.2c.x.5m.2.2b.x.5n.2.2a.w.5p.2.2a.v.5p.2.2b.u.5p.2.2b.u.5p.2.2c.t.5p.2.2e.r.5p.2.2f.q.5o.2.2h.p.5o.1.2i.p.5n.2.2i.p.5m.2.2k.o.5l.3.2k.o.5l.2.2m.m.5l.2.2o.k.5m.2.2o.k.5m.2.2o.j.5m.2.2q.i.5m.2.2q.h.5m.3.2r.f.5n.2.2r.g.5n.2.2r.f.5o.1.2s.f.5n.2.2s.e.5p.1.2s.e.5p.1.2t.d.49.2.1e.1.2u.b.48.4.1d.2.2v.a.47.4.1e.2.2v.a.1.2.5.9.3p.7.1b.2.2w.e.2.d.3n.3.1.2.1b.2.2y.t.3k.4.1f.2.2y.t.3k.3.1g.1.2z.7.2.l.3k.1.1h.1.2z.7.3.l.51.1.2z.x.4y.2.2y.z.4x.2.2y.10.4w.2.2y.11.4v.2.2y.t.1.8.4v.2.2x.t.2.7.4v.2.2x.12.4v.2.2y.12.4v.2.2x.12.4v.2.2x.12.4w.2.2w.12.4w.2.2w.13.4v.2.2w.14.4u.2.2w.15.4u.1.2w.16.4t.2.2u.19.4r.2.2u.19.4s.2.2t.1a.4r.2.2t.1a.4r.2.2s.1b.4q.2.2s.1d.2q.1.1y.2.2r.1e.2p.3.1x.1.2s.1e.2o.4.1x.1.2s.1f.23.2.h.5.1x.2.2s.1f.21.3.g.5.1y.2.2s.1g.1z.3.h.4.20.2.2r.1h.1y.2.h.5.20.2.2s.1i.2g.3.22.2.2s.1h.4m.2.2r.1h.4n.3.2p.1h.4o.3.2p.1a.1.5.4q.3.2n.1a.1.5.4r.3.2n.19.2.5.4r.5.2k.1a.2.5.4s.3.2k.1a.2.7.4s.2.2k.1a.2.7.4r.2.2l.1a.1.8.4r.2.2k.1j.4r.3.2k.1j.4r.3.2k.1i.4s.2.2l.1c.1.5.4s.2.2l.1b.2.4.4t.2.2l.1g.4t.2.2l.1h.4t.2.2l.1h.4s.2.2l.1h' }
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
        scale: 1.8445,
        hook:  'gilgamesh',
        tiers: 2,
        flagNudge: { dx: 0, dy: -1 },
        shadow: { length: 0.15, soft: 3 },
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
        scale: 1.1736,
        flipX: true,
        shadow: { length: 0.15, soft: 3 },
        showFrom: 'gilgamesh-beaten',
        note: 'Placed near the Uruk node. The first Serf win walks the Explorer in for a scripted first visit (returnFromGilgameshWin, sog_market_auto_visit_done); afterwards it is a clickable node.'
      },
      {
        id:    'sargon',
        name:  'Sargon',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/sargon.png',
        x: 58.59, y: 57.04,
        scale: 1.1527,
        hook:  'sargon',
        tiers: 2,
        flagNudge: { dx: 0, dy: 0 },
        shadow: { length: 0.15, soft: 3 },
        showFrom: 'sargon-revealed',
        note: 'Dust-storm-revealed on the first marketplace return. Boss flags anchor to these coords, so they move with the node. 704x384 art rendered at 84px base — scale is a knob.'
      },
      {
        id:    'hammurabi',
        name:  'Hammurabi',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/hammurabi.png',
        x: 47.53, y: 37.15,
        scale: 0.5432,
        hook:  'hammurabi',
        tiers: 2,
        flagNudge: { dx: 0, dy: 2 },
        showFrom: 'hammurabi-revealed',
        note: 'Rises from the dirt on the first overworld return after defeating Sargon. Placed up-and-left of Akkad along the Euphrates.'
      },
      {
        id:    'hanging-gardens',
        name:  'Nebuchadnezzar',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/nebuchadnezzar.png',
        x: 68.09, y: 75.8,
        scale: 1.8396,
        hook:  'hanging-gardens',
        tiers: 2,
        flagNudge: { dx: 0, dy: -1 },
        shadow: { length: 0.15, soft: 3 },
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
        entryAt: { x: 92, y: 50 }
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
    routes: [],
    crossings: [
      { x: 68.28, y: 91, r: 14 },
      { x: 47.66, y: 41, r: 14 },
      { x: 60.16, y: 59, r: 14 },
      { x: 65, y: 58.33, r: 14 },
      { x: 79.22, y: 72.33, r: 14 }
    ],
    water: { cell: 4, rle: '27.2.2g.1.1t.5.4f.2.2g.2.1u.3.3a.3.13.2.2f.2.4h.3.e.1.7.5.12.2.2g.2.4e.7.b.2.5.7.13.1.2h.2.4c.b.8.1.2.b.13.1.2i.1.4a.e.7.1.2.c.12.1.2i.2.48.h.6.1.2.a.13.1.2i.5.44.k.3.1.2.b.13.3.2h.5.42.11.15.3.2j.4.3z.10.19.2.2j.4.3x.10.1a.2.2l.2.3w.10.1c.1.2k.3.3v.10.1c.2.2j.2.3x.z.1c.2.2k.2.3x.y.1d.2.1g.1.13.5.3u.y.1d.2.1g.1.17.2.3t.z.1c.2.1f.1.18.4.3r.z.1b.3.1f.1.1a.3.3q.10.19.3.1g.1.1c.2.3p.10.18.3.1g.2.1c.2.3p.11.17.3.1g.1.1e.2.10.1.2n.11.17.3.1g.1.1e.3.y.2.2n.11.17.3.1g.1.1f.2.x.2.2o.10.19.3.1f.1.1g.2.w.2.2o.z.1b.4.1d.1.1g.2.x.2.2n.y.1d.7.4.8.2e.2.y.1.2n.y.1f.b.3.5.2c.4.w.1.2n.x.1h.8.8.6.29.2.x.1.2n.8.1.o.20.8.23.2.3m.5.3.p.25.5.21.2.3m.2.5.p.29.3.20.2.3r.r.2b.2.1z.2.3p.t.2b.2.1y.2.3p.v.2b.2.1x.2.3n.y.2a.3.1v.2.3o.y.2c.2.1u.2.3o.y.2d.3.1s.2.3o.y.2e.2.1t.2.3n.y.2e.3.8.1.1j.2.3n.z.2e.3.7.1.1k.1.3n.z.2f.3.5.2.1k.2.4.1.3h.z.2h.3.3.1.1l.3.2.1.1b.2.25.y.2j.3.1.1.1n.4.1c.2.25.x.2l.4.1o.2.1d.1.26.x.2m.2.1p.2.1c.2.26.x.2m.2.1p.3.1a.4.25.x.2m.2.1q.3.3i.x.2n.2.1q.2.3i.x.2n.3.1p.2.3i.x.2o.2.1p.2.3i.x.2o.2.1p.1.3j.x.2p.2.1o.1.3j.x.2p.3.1n.2.3i.y.2p.3.1m.3.3h.y.2r.3.1l.3.3g.y.2s.3.1l.2.3g.y.2t.2.1m.2.3f.x.2v.2.1l.1.3g.w.2w.2.1l.2.3f.u.2y.2.f.3.14.2.3e.u.2y.3.4.4.2.a.11.2.t.1.2k.t.30.e.5.4.10.2.s.1.2l.s.32.5.f.3.z.2.s.1.2l.r.3o.8.u.2.r.1.2l.q.3q.7.u.2.r.1.2l.q.3r.7.u.2.p.1.2m.q.3v.3.u.2.p.1.2m.q.3w.1.v.2.n.2.2n.q.3w.1.v.3.l.2.2o.q.3w.2.v.3.3a.p.3x.3.v.8.34.n.40.3.y.6.32.m.42.3.10.4.7.1.2t.m.43.2.12.3.5.2.2t.m.43.5.10.2.4.1.2v.l.45.5.y.2.4.2.2v.l.48.2.y.2.4.1.1h.5.1a.k.49.2.y.1.5.1.1g.3.1d.k.49.2.y.1.4.2.2w.j.4b.2.w.3.3.2.2w.j.4c.2.v.2.4.2.2w.i.4e.2.t.3.4.2.2w.h.4g.3.r.2.5.2.2w.g.4i.8.l.2.5.1.2x.g.4k.8.j.2.5.1.2x.g.4p.7.f.2.4.2.2x.f.4t.5.e.2.4.1.2y.e.4x.4.c.3.32.d.50.3.c.5.2z.d.51.3.c.4.2z.d.52.3.c.3.2z.d.53.3.c.2.2z.c.55.4.a.2.2z.c.a.2.4v.3.9.2.2z.c.9.3.4w.3.8.3.2y.9.c.3.4x.2.9.4.2w.9.c.3.4x.3.9.6.2t.9.c.3.4y.2.b.5.2s.9.c.2.4z.3.c.5.2q.8.d.1.51.2.e.4.2p.8.5g.2.e.4.2o.8.5g.2.g.4.2m.7.5h.2.i.2.2m.7.5g.3.j.3.2k.7.5g.2.l.3.d.5.21.6.5h.2.m.3.b.8.1z.6.5h.1.o.7.4.4.3.7.1v.5.5i.2.o.c.7.8.1s.5.5i.2.t.5.f.3.1r.4.5j.2.v.2.i.2.1q.4.g.1.52.2.w.2.h.3.1p.3.g.3.52.2.w.2.g.3.1p.2.h.3.52.2.x.1.g.2.1q.2.g.4.52.2.x.1.g.2.1q.1.h.3.54.2.w.2.f.2.28.3.54.2.x.2.b.2.1.2.27.4.54.2.y.1.a.7.26.4.54.3.x.1.b.3.1.3.25.4.54.3.x.1.c.2.2.3.24.4.55.2.w.1.i.3.23.2.58.2.v.1.j.2.23.2.58.2.u.2.j.6.1z.3.57.2.v.2.i.7.1y.3.51.3.4.2.u.2.e.1.7.3.1y.3.51.5.2.2.v.2.c.3.7.2.4.4.1r.1.52.5.2.2.w.1.b.4.7.2.4.5.6v.3.2.2.w.1.b.4.7.2.6.3.6o.4.8.2.w.1.m.3.6.1.2.6.g.1.5z.7.6.2.w.2.m.2.8.7.g.3.5x.7.6.2.w.2.f.4.3.3.7.6.h.3.5z.4.7.3.n.3.5.2.e.6.3.3.7.5.i.1.6c.3.m.2.6.2.f.6.3.3.6.4.6y.3.i.3.7.2.g.1.1.2.5.3.6.2.70.4.g.3.8.1.q.3.5.2.h.2.69.5.5.4.7.1.h.2.q.2.4.3.g.2.6a.6.6.c.g.1.q.2.4.3.g.1.6c.5.9.b.f.1.f.4.6.2.4.3.f.1.6e.4.i.3.f.1.c.7.5.2.3.3.f.2.71.2.g.1.b.7.5.2.2.3.f.2.73.3.e.2.b.5.6.2.2.3.e.1.76.5.b.1.n.2.1.4.d.1.79.7.7.2.m.2.2.2.e.1.6p.2.1.3.h.8.3.1.n.2.3.1.e.1.6o.6.1.1.l.5.2.1.j.6.h.1.6o.6.1.2.n.3.1.2.g.9.1.2.e.1.6p.7.o.5.5.e.3.6.e.2.6s.1.r.5.3.7.c.3.h.1.7m.4.6.3.c.5.e.1.7v.9.9.4' }
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
        scale: 1.2026,
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
        scale: 1.2797,
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
    routes: [],
    crossings: [],
    water: { cell: 4, rle: '29.1d.4.c.76.15.8.c.7a.x.82.r.88.i.8j.8.3zh.4.8r.5.2js.1.8u.2.8u.1.8u.2.8u.2.8u.2.8u.1.8v.1.48.1.4l.1.49.2.4k.1.4a.3.4i.1.4b.3.4h.1.4b.3.4g.2.4b.4.4g.1.4a.6.4g.1.48.8.4f.1.46.b.4f.1.45.c.4f.2.42.d.4g.2.41.c.4i.3.3z.b.4l.1.l.1.3g.5.59.1.8q.5.8s.3.d2a.3.8t.3.8t.2.zd.2.8t.3.8s.3.8t.3.8u.2.8u.1.av.1.6v.2.1x.1.6v.3.1w.1.6w.3.1v.2.6v.3.1v.1.6x.3.1u.1.8v.1.4.1.8q.1.4.2.8o.1.4.1.1.4.h.4.84.1.3.5.2.1.b.6.82.1.6.6.b.2.1.3.7z.3.9.4.a.3.83.2.b.4.9.4.6l.2.1f.2.c.3.a.4.6j.3.1f.1.e.3.9.6.d.3.5z.5.1f.1.f.2.9.b.7.5.5p.1.7.6.1e.2.6.1.8.2.9.c.4.8.5m.f.1f.1.7.2.1.4.3.2.8.d.1.a.5n.d.1g.1.8.7.2.3.2.u.5p.7.1j.1.8.4.1.3.2.y.5r.3.1k.3.8.2.3.13.7d.3.8.2.4.13.7c.3.8.1.6.13.1p.4.5i.2.g.14.1m.5.5j.2.6.1.8.16.1l.6.5i.1.5.2.8.18.1k.7.5g.2.3.3.3.2.2.1b.1n.6.5d.6.4.1h.1o.5.5b.5.6.1i.1p.3.5a.4' }
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
        scale: 1.4303,
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
        scale: 1.2632,
        showFrom: 'greatbath-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'siddhartha',
        name:  'Siddhartha',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/siddhartha.png',
        x: 41, y: 50,
        scale: 1.4714,
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
        scale: 0.4545,
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
    routes: [],
    crossings: [],
    water: { cell: 4, rle: 'g3.3.8s.5.8r.5.2ql.1.8s.4.8q.3.1p7.1.8u.1.8v.1.38.3.5j.2.35.6.5j.2.1v.1.g.2.3.1.3.9.1.h.5i.1.1w.a.2.16.7e.1i.7e.1m.4z.1.2a.1m.4z.2.29.1n.4z.3.27.1o.4z.1.1.3.24.1o.52.2.24.1q.76.1t.73.1x.6z.1y.59.1.1o.1y.57.3.1o.1z.58.1.1o.20.57.1.1o.23.a.2.4s.2.1n.26.3.6.4s.3.1m.2e.4t.4.2.3.1g.2b.4x.9.1f.23.1.4.50.1.1.2.1.5.1e.23.t.2.3o.1.m.3.1.6.1d.24.s.2.3o.2.d.2.4.c.1d.25.q.3.3o.2.d.3.1.e.1d.26.q.3.3l.4.3.1.3.1.1.n.1c.28.o.4.3h.13.1c.29.n.4.3e.16.1c.2b.k.4.3e.18.1b.2b.j.6.3d.18.1b.2d.f.9.3c.19.1a.2e.c.b.3c.1a.19.2h.5.f.3c.1b.18.32.3a.1d.17.31.3b.1e.16.31.39.1j.13.31.38.1k.13.30.38.1l.1.3.z.30.2z.3.1.1w.x.31.2y.20.x.31.2x.22.w.31.2w.21.1.1.w.31.2v.22.y.32.2t.25.w.32.2s.26.w.32.2r.25.1.4.t.32.2q.2c.s.32.2p.2e.r.33.2m.2g.r.33.2k.2j.q.34.2h.2l.q.34.2h.2l.q.34.2g.2n.p.35.2d.2p.p.35.2b.2r.p.35.29.2t.p.36.26.2v.j.2.4.36.26.2u.k.3.3.36.26.2u.k.4.2.36.25.2v.j.5.2.36.24.2v.h.9.1.37.20.2y.g.3i.1v.33.d.3m.1u.33.c.3n.1t.37.8.3p.1m.3j.1.3r.1k.7d.1j.7e.1h.7f.1h.7f.1h.7g.1g.7i.1e.7j.1d.7j.1d.7k.1c.7k.1c.7l.1b.7l.1c.7l.1b.7l.1b.7l.1b.2z.1.4l.1c.2y.2.4l.1a.2z.1.4m.1a.2z.1.4n.19.2y.2.4n.19.2y.2.4n.18.2z.2.4o.17.2z.1.4q.15.30.1.4q.14.7t.13.30.1.4t.11.31.1.4u.10.7x.z.7y.z.7y.y.7y.y.7y.y.7z.x.2y.2.50.w.2z.1.50.w.81.r.85.q.87.p.87.o.88.n.8.2.7z.m.b.1.7z.m.a.3.7x.k.b.5.7x.g.e.6.7x.e.e.8.7w.d.f.9.7x.b.f.9.7x.b.e.b.7y.8.f.c.7y.4.h.e.8i.e.8i.f.8h.g.8h.f.8h.f.8h.g.8g.g.2t.1.v' }
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
        scale: 1.3237,
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
        scale: 0.9201,
        showFrom: 'india-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'shihuangdi',
        name:  'Shi Huangdi',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/shihuangdi.png',
        x: 81.13, y: 22.18,
        scale: 1.3224,
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
        scale: 1.3427,
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
    routes: [],
    crossings: [
      { x: 82.03, y: 64, r: 14 },
      { x: 81.41, y: 31, r: 14 }
    ],
    water: { cell: 4, rle: '89.2.2.1.8q.8.60.2.2l.9.5y.2.2.4.2h.a.5w.1.1.9.2e.b.5x.d.2a.b.5w.6.4.8.3.2.22.a.5x.4.8.d.1y.c.g.1.5g.3.b.f.1s.c.e.5.5g.3.l.7.1p.c.c.8.5f.3.p.5.1m.e.b.9.5e.3.t.2.1l.e.a.b.5e.2.u.3.1k.e.8.d.5e.2.u.3.1k.g.5.e.5e.2.u.3.1k.h.3.f.5e.3.t.3.1j.i.3.f.5e.3.s.3.1b.3.2.k.3.h.5e.3.s.2.1c.o.3.i.5e.3.s.2.1b.p.1.k.5e.3.r.3.1b.1a.5e.3.r.2.1b.1b.5e.3.r.2.1c.1a.5d.3.s.2.1c.1a.5d.2.s.3.1d.19.3l.3.1o.3.r.3.1f.18.3l.4.1n.3.q.3.1m.12.3m.3.1m.3.r.2.1n.e.2.m.5b.2.s.2.1n.d.4.l.21.5.34.3.s.2.1l.3.2.9.8.3.2.d.22.4.33.3.t.3.1j.3.3.7.i.a.58.3.v.2.1i.3.3.7.j.a.58.3.v.3.1e.5.5.6.j.a.55.5.w.3.1c.6.7.4.k.a.51.8.x.2.1c.4.t.3.1.b.4z.6.10.3.1b.3.u.g.42.3.t.4.13.3.1a.3.t.i.41.5.r.3.14.3.1a.3.s.k.41.6.q.3.14.3.19.4.r.l.41.7.q.3.13.3.18.3.s.m.42.7.q.2.13.3.17.3.t.m.46.3.q.3.12.3.16.3.t.n.4z.2.14.2.15.3.r.q.4x.4.14.2.14.3.s.q.49.1.m.4.15.2.13.4.r.r.48.9.a.3.1.3.17.2.12.5.r.r.47.b.8.7.18.3.10.3.t.s.46.3.8.6.3.1.1e.3.y.4.s.u.26.3.1w.2.b.9.1e.3.y.3.t.u.26.5.1t.2.1z.3.x.3.u.u.27.3.1u.1.20.3.w.3.u.v.44.1.20.3.v.3.u.w.44.1.1z.3.v.3.v.w.1x.3.1m.3.f.2.1y.3.8.4.8.d.x.v.1x.4.10.2.g.5.1.1.e.2.1y.2.8.7.5.e.y.u.1z.1.y.6.f.5.g.2.1y.2.5.6.1.k.11.t.2b.3.i.4.3.3.z.3.1w.2.2.7.6.6.1f.q.2a.7.e.3.6.3.z.4.1t.9.1w.o.2e.4.1.3.7.3.9.4.l.2.c.3.1t.5.1z.o.2h.f.a.3.k.1.1.1.d.3.1t.3.21.n.2n.3.h.3.l.2.d.3.3w.n.38.3.k.1.f.4.3v.m.21.1.5.1.11.3.k.1.h.3.3t.m.21.2.1.2.1.1.12.3.12.3.3d.1.e.m.21.7.13.4.11.3.3c.2.e.l.22.4.17.2.13.2.3a.4.d.l.3e.2.12.2.39.5.e.k.3e.3.11.2.39.5.2.2.a.k.3f.4.w.4.3b.2.4.2.b.j.3g.3.49.3.5.3.a.j.3h.3.4g.3.b.i.3i.2.4v.h.3i.3.4v.g.3j.3.4h.2.c.f.1s.5.1n.4.49.a.b.e.y.4.q.6.1o.3.47.h.7.c.z.3.r.5.1p.3.46.3.7.8.7.b.11.1.s.3.1r.3.44.3.a.1.3.4.5.b.3p.2.43.3.j.1.4.b.3p.3.42.2.k.3.2.b.l.2.32.3.41.3.m.e.k.4.32.2.41.3.b.3.9.d.l.3.33.2.40.2.b.4.a.c.3r.3.3y.3.b.5.a.b.28.2.1h.3.3w.4.d.4.a.b.24.6.1h.3.3v.4.e.4.a.b.24.5.1i.3.3v.3.q.e.25.2.1k.3.26.a.1e.3.q.f.3s.3.1x.k.1a.4.p.h.3s.3.1w.c.5.6.17.4.q.h.3s.3.1w.3.g.5.l.5.g.3.n.l.3s.3.1w.2.k.2.k.7.e.3.p.4.3.d.3s.3.1v.3.k.6.f.3.2.4.c.3.y.3.2.7.3s.3.1u.3.m.8.c.2.3.1.1.3.8.1.2.2.13.1.1.6.3t.2.1t.3.n.8.b.3.2.2.2.3.6.6.12.9.3t.2.1t.2.u.3.9.3.7.4.5.5.12.a.3t.2.1s.3.v.2.7.6.8.b.14.9.3t.2.1q.4.w.6.2.4.c.8.16.9.25.3.1l.2.1m.7.x.7.1.3.f.5.17.9.25.5.1j.2.1j.9.z.9.j.2.17.9.26.1.1m.2.1i.5.1.2.14.5.k.2.15.1.1.9.3t.2.1i.4.18.4.k.3.15.b.3t.3.1f.4.18.1.1.3.l.6.12.b.3t.3.1e.4.19.2.1.2.m.5.12.b.3t.3.1d.4.18.1.3.3.o.2.13.b.3t.3.18.8.18.7.p.2.12.c.3t.3.12.c.1b.6.1u.b.3t.3.y.f.3c.b.3t.3.x.7.3.2.3c.1.2.c.3u.3.v.3.3m.f.3v.2.u.4.3l.g.3v.3.s.5.3k.h.3v.3.s.3.3m.h.3q.1.4.3.5.1.m.3.3m.h.3q.2.3.3.4.3.k.3.3m.i.3r.1.3.3.3.4.j.4.3m.i.3r.1.1.1.2.3.2.4.j.3.3n.i.3r.3.2.3.1.3.1.2.h.3.3n.j.3r.1.5.5.2.2.g.3.3n.k.3r.1.6.4.1.2.g.3.3o.k.3r.1.6.4.1.2.h.2.3n.l.20.4.1n.1.7.3.1.2.g.3.3j.p.1y.2.2.2.1n.1.a.3.8.2.7.2.3j.p.3r.1.a.3.6.4.7.2.3j.p.3r.1.a.3.5.5.7.2.3j.p.3r.1.1.1.8.3.3.8.6.2.3j.p.3r.1.1.1.8.9.3.2.2.6.3i.q.3r.1.1.1.8.7.4.3.1.6.3i.r.3r.1.1.1.a.3.6.8.3k.r.3r.1.1.2.j.4.3o.q.1t.1.1x.1.1.2.4b.q.1t.1.1x.1.2.1.4a.r.1t.1.21.1.49.r.1t.1.6b.r.1t.2.6a.r.1t.1.69.t.1t.1.69.t.1t.1.68.u.81.h.4.a.81.g.6.9.7x.j.7.9.7w.j.8.9.7w.j.8.9.7w.i.9.9.7v.i.a.9.7u.j.a.9.7t.k.a.9.7s.l.a.9.7q.n.a.9.7o.p.a.9.7n.q.9.a' }
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
        scale: 1.8745,
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
        scale: 1.2171,
        showFrom: 'abraham-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'moses',
        name:  'Moses',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/moses.png',
        x: 45.5, y: 52.28,
        scale: 1.2087,
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
        scale: 1.2076,
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
        scale: 0.9899,
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
        scale: 0.9187,
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
    routes: [],
    crossings: [],
    water: { cell: 4, rle: '0.3h.11.9.45.3h.10.a.45.3a.3.3.11.a.45.39.5.1.12.a.45.39.18.a.45.39.19.9.45.39.1a.8.45.39.1a.8.45.39.1a.8.45.39.1b.6.46.38.1c.6.46.38.1d.4.47.37.1e.3.48.37.5p.37.5p.37.5p.37.5p.37.5p.36.5q.36.5q.36.5q.35.5r.35.5r.35.5r.35.5r.35.5r.34.5s.34.5s.34.5s.34.5s.33.5t.33.1h.2.4a.33.1h.1.4b.32.1h.2.4b.32.1h.2.4b.31.1i.1.4c.31.1h.2.4c.31.1i.1.4c.31.1i.1.4c.31.5v.30.1j.1.4c.30.1j.1.4c.30.1j.1.4c.2z.1k.1.4c.2z.1k.2.4b.2z.1k.2.4b.2y.1l.2.4b.2y.1l.2.4b.2y.1l.2.4b.2x.1m.2.4b.2x.1m.2.4b.2x.1m.1.4c.2w.1n.1.4c.2w.1m.2.4c.2v.1n.2.4c.2v.1n.1.4d.2v.1n.1.4d.2u.1o.2.4c.2u.1n.3.4c.2t.1o.2.4d.2t.1o.1.4e.2s.1p.1.4e.2s.1o.1.4f.2s.1o.1.4f.2r.1p.1.4f.2r.1p.2.4e.2q.1r.1.4e.2q.1r.1.4e.2q.66.2p.1t.1.4d.2p.1t.1.4d.2o.1t.2.4d.2o.1t.1.4e.2n.1t.1.4f.2m.1u.1.4f.2m.1v.1.4e.2m.1v.1.4e.2l.1x.1.4d.2k.1y.1.4d.2k.1y.1.4d.2j.1y.2.4d.2j.1y.2.4d.2i.1z.2.4d.2h.21.1.4d.2h.1z.3.4d.2g.20.3.4d.2g.1x.1.1.5.4c.2f.1x.1.1.8.4a.2e.1z.8.4b.2d.1z.9.4b.2d.1y.a.4b.2c.1z.8.4d.2b.20.8.4d.2a.20.9.4d.29.21.9.4d.29.20.a.4d.28.21.a.4d.27.20.b.4e.26.21.b.4e.26.21.b.4e.25.23.a.4e.24.24.a.4e.23.24.b.4e.22.24.c.4e.21.25.c.4e.20.26.c.4e.1z.27.d.4d.1y.28.d.4d.1x.29.d.4d.1v.2c.c.4d.1v.2b.d.4d.1t.2c.d.4e.1s.2d.d.4e.1r.2e.d.4e.1q.2f.d.4e.1p.2g.c.4f.1o.2i.b.4f.1n.2j.7.2.2.4f.1m.2k.6.3.2.4f.1k.2n.4.5.1.4f.1i.2o.4.6.1.4f.1h.2p.3.4n.1f.2q.4.4n.1e.2q.3.4p.1b.2t.3.4p.19.2v.3.4p.14.2z.6.4n.c.1.q.30.7.4m.e.2.i.35.9.4k.e.3.d.39.a.4k.b.7.7.3e.b.4i.5.3y.b.4h.4.41.a.4h.3.42.a.8n.8.8o.8.8o.8.8p.7.8q.2' }
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
        scale: 1.1389,
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
        scale: 1.0357,
        showFrom: 'levant-complete',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'pericles',
        name:  'Pericles',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/pericles.png',
        x: 44.44, y: 23.36,
        scale: 1.5577,
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
        scale: 1.2414,
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
        scale: 1.3768,
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
    routes: [],
    crossings: [
      { x: 27.34, y: 49.33, r: 14 },
      { x: 38.91, y: 53.33, r: 14 }
    ],
    water: { cell: 4, rle: '1.1i.1a.5.2r.1d.16.o.3.1g.1a.4.2r.1g.13.p.5.1d.1b.3.2q.c.1.15.12.q.8.1a.1b.1.2e.5.7.d.4.14.10.r.a.17.3q.p.6.13.z.s.c.15.3p.p.7.13.y.9.4.g.f.12.3p.p.7.13.g.6.9.c.4.g.g.11.30.2.p.n.7.15.7.d.6.z.h.10.2z.3.q.o.4.1p.5.11.h.10.2x.5.r.2e.4.14.i.11.2u.6.t.1e.2.t.5.r.8.7.j.10.2t.6.s.1e.6.o.7.e.2.c.8.7.m.x.2r.6.u.1e.6.n.6.c.6.d.6.8.n.x.2p.7.u.1g.4.l.7.3.5.4.8.e.3.6.r.x.2o.8.u.4.2.1w.9.2.j.d.4.2.v.r.2.3.2o.9.10.1t.a.2.l.b.13.r.1.3.2p.a.p.4.8.1q.9.2.u.2.15.q.2t.c.k.9.7.1p.7.3.1b.a.i.q.2r.g.h.e.3.1o.5.4.13.2.7.c.g.q.2r.j.4.5.6.e.3.19.5.9.4.3.13.5.6.d.f.r.2p.m.1.a.3.e.3.17.6.9.3.2.15.5.6.e.e.s.2o.m.2.a.4.d.3.14.9.7.4.2.15.4.7.e.f.t.2l.n.2.b.6.b.2.14.7.9.3.2.1h.f.e.v.2k.m.3.b.6.1h.3.b.3.3.1h.f.e.x.2i.m.4.a.7.1z.1i.g.c.10.2g.n.4.a.6.17.1.q.1j.g.c.12.2e.o.5.9.5.15.3.o.1l.g.b.14.2e.n.8.7.4.w.7.1.3.n.1n.g.b.15.2f.o.7.15.a.o.1n.h.a.16.2f.q.4.15.a.n.1o.i.9.17.2e.1z.5.1.4.n.1o.k.7.17.2f.1y.5.2.2.k.2.2.1o.m.4.1a.2e.20.2.3.2.n.1o.20.2g.2s.1o.1u.2.4.2g.2s.1o.1q.7.2.2h.2s.1o.1p.8.2.2i.2r.1o.1q.6.4.2h.2r.1o.1r.4.7.2g.2q.1o.1r.5.8.2e.2p.m.1.12.1t.4.8.2f.1q.1.w.e.a.11.1u.3.8.2g.1o.2.v.b.e.11.1u.3.8.2i.1m.1.x.4.j.12.1v.2.9.2i.35.13.1v.3.9.2i.33.14.1w.3.8.2j.2k.4.d.15.1x.5.5.2k.2i.6.8.1.1.17.20.2.5.2c.1.8.2g.8.7.19.28.29.5.6.2d.b.7.19.29.26.9.5.28.g.9.16.2d.22.a.5.j.1.1m.i.8.16.2e.21.b.4.i.2.1m.9.3.7.8.15.23.1.a.21.b.5.3.2.b.3.1m.8.4.8.9.13.2f.21.a.4.3.2.5.2.1v.7.2.a.a.12.2g.22.4.5.d.4.1x.3.1.c.9.12.2i.21.m.3.20.e.8.12.2j.4.1.1v.2p.e.7.13.2k.2.3.1v.2r.9.8.14.2k.2.7.1.4.1n.5.5.2j.1.d.14.2l.1.c.1m.3.9.y.1.1y.13.2y.1i.6.b.x.3.22.x.2m.1.2.4.5.1a.1.6.6.c.x.3.23.w.2m.8.3.1a.a.h.w.4.21.x.2l.1l.a.3.7.9.w.4.1y.z.2i.1u.g.9.v.4.1w.10.2h.1z.e.9.2s.11.2g.5.5.1u.b.c.2k.15.2g.4.7.1v.a.c.2i.16.2f.5.7.1w.b.d.25.2.8.16.2f.5.9.1v.1.5.5.l.1v.5.7.15.2f.5.9.21.6.k.1v.6.8.13.2f.1.d.21.9.h.17.2.a.3.9.6.8.13.2u.20.a.h.16.2.7.8.8.6.8.12.2u.23.7.i.1e.9.7.6.3.1.5.11.2v.27.1.j.1f.7.9.5.a.10.2i.1.d.2p.1h.6.b.3.c.y.2e.2.2.1.e.14.2.1i.1i.5.b.3.3.2.6.z.2e.3.1.1.e.6.2.e.1.1.6.9.4.10.c.6.1i.4.a.5.2.3.3.11.2e.3.2.1.d.5.5.a.d.2.1.3.5.3.2.v.c.5.1h.6.8.6.2.17.2a.2.1.4.2.2.c.3.8.3.u.2.3.z.9.5.1g.6.4.1j.29.8.11.7.n.11.6.4.1e.7.4.1k.29.9.y.b.m.12.5.3.1e.7.5.1j.28.c.w.d.l.12.5.3.1d.6.8.1h.28.3.1.9.u.f.r.w.4.4.1e.3.d.5.4.14.28.3.1.9.j.5.5.l.q.s.5.4.1u.3.5.14.2d.9.i.x.p.r.5.c.1n.1.7.13.2d.a.h.13.j.q.6.c.1w.12.2j.3.h.16.9.1.6.q.a.9.1w.2.3.x.32.19.6.z.a.8.23.v.32.1a.6.g.4.e.a.8.24.u.31.1c.5.a.9.f.b.1.2.3.6.2.20.r.2z.1g.3.8.8.4.2.c.m.4.21.p.2i.1.e.1o.d.3.5.a.m.6.1z.p.2h.4.c.1o.m.9.n.7.1w.q.2h.5.b.1n.o.9.o.5.1w.q.2h.8.b.1p.k.8.o.5.1x.p.2i.8.c.1n.m.7.o.5.1d.8.2.1.8.p.2i.9.b.1n.9.3.b.6.q.3.1c.d.6.q.2j.9.b.1m.9.3.c.5.r.2.1b.e.5.r.2l.3.f.1m.9.3.d.4.8.2.i.1.1b.2.3.7.1.x.2m.2.g.1l.q.2.8.3.j.2.z.3.d.4.4.w.36.1j.10.3.k.6.p.7.p.t.38.1i.4.3.s.3.a.1.a.5.n.8.6.2.k.r.39.13.2.e.3.2.s.1.o.4.m.7.8.1.l.r.3a.12.3.i.1j.2.m.3.y.r.3b.11.7.h.35.r.3c.10.9.f.18.1.b.4.1h.r.3c.10.b.d.s.2.e.2.a.5.1h.q.3d.z.c.c.s.3.c.3.b.2.1i.r.3d.10.a.6.z.3.d.1.1c.1.j.4.2.l.3e.10.9.5.7.2.r.2.1r.1.p.l.3e.10.b.1.7.3.2l.1.r.j.3d.12.36.1.r.j.3c.14.40.g.3b.15.40.g.3a.17.1d.2.u.1.12.1.l.h.3a.17.1d.2.t.3.11.2.k.h.3a.17.1e.1.l.2.5.5.1f.3.4.h.3a.19.1w.4.3.7.1d.q.3a.19.1w.4.3.6.1e.q.3b.19.1u.5.3.6.15.2.7.j.3j.b.5.s.1g.2.a.1.2.3.4.6.15.3.6.3.4.9.3m.a.6.s.1h.2.8.2.3.1.6.5.15.3.7.1.41.9.6.s.1h.2.l.2.5j.8.7.t.2j.2.1o.2.3d.8.8.s.2h.4.x.5.l.3.3d.8.a.r.2f.3.x.7.l.3.3d.8.b.q.1a.2.11.3.y.6.n.3.3i.3.c.a.6.a.19.2.10.3.y.5.d.f.3j.2.c.9.7.9.17.4.m.2.1c.2.g.7.8.2.3y.8.7.9.14.7.m.3.1b.2.d.8.a.2.3y.7.9.7.15.7.h.2.4.3.1a.1.d.9.8.4.3z.5.a.7.16.3.j.2.6.2.1p.3.f.2.3z.5.c.5.1m.1.19.1.1c.2.3z.5.c.6.2v.2.l.1.h.2.4.4.3z.4.e.6.2q.5.14.2.4.2.41.4.f.6.2q.3.16.1.47.4.f.7.87.4.e.2.2.3.88.3.j.3.1v.1.1.1.1k.3.4o.1.2i.3.1k.3.j.1.6m.3.8.2.1c.1.h.3.4h.1.2f.3.1r.5.4h.2.46.7.4h.3.44.8.4h.4.42.9.4h.5.3t.3.5.9.4h.5.40.a.4h.4.40.b.4i.3.3z' }
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
        scale: 1.36,
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
        scale: 1.0906,
        showFrom: 'romulus-beaten',
        note: 'Scaffolded position — drag into place. Shop contents not wired.'
      },
      {
        id:    'cincinnatus',
        name:  'Cincinnatus',
        kind:  'battle',
        image: 'images/metaworld/civilization nodes/cincinnatus.png',
        x: 49.83, y: 26.7,
        scale: 0.8726,
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
        scale: 1.3003,
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
        scale: 0.5637,
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
        scale: 1.4653,
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
        scale: 1.8317,
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
    routes: [],
    crossings: [],
    water: { cell: 4, rle: '0.2.8u.2.8u.2.8u.2.8u.3.8t.4.8s.2.1.2.8r.2.2.2.8q.2.4r.2.3.2.3w.2.4q.8.3w.2.4q.8.3w.1.4o.b.3w.1.4i.2.2.b.3y.1.4h.g.3y.1.4g.h.3y.1.4g.h.a.2.83.i.8.3.84.h.8.3.85.g.9.1.87.g.6.2.88.g.6.2.89.g.4.3.2.3.1.1.82.h.2.4.2.5.81.i.2.4.2.5.7z.r.1.5.7z.r.1.5.7x.t.1.4.7z.s.1.4.80.x.80.x.6q.5.14.y.6o.9.11.z.6m.b.11.y.6l.e.z.y.6k.g.z.x.6j.j.y.u.6k.n.w.u.6i.p.x.t.6g.r.y.r.3.2.68.u.10.r.1.3.63.z.z.w.4w.1.12.12.11.w.4s.4.10.13.12.w.4q.a.u.14.14.u.4o.c.t.15.15.u.1.5.4g.i.m.18.15.11.4b.p.h.19.15.z.4c.r.g.1a.15.x.6.1.45.v.c.1b.15.y.3.5.42.x.8.1f.15.x.3.6.41.11.2.1h.15.17.40.2k.15.18.3z.25.1.d.17.13.43.25.2.d.16.y.6.2.40.25.2.f.14.18.3y.25.2.a.1.5.14.18.3x.25.2.8.3.5.14.17.3.3.3t.20.6.i.12.1f.3r.1y.8.j.12.1f.3q.1x.9.j.13.1g.3p.1v.a.k.13.1g.3o.1u.b.k.14.1g.2.1.3i.1w.c.j.2.1.12.1i.3i.1w.c.o.11.1i.5.2.3b.1v.c.p.11.1j.3.3.3a.1v.c.q.11.1j.3.3.39.1v.c.q.12.1j.3.1.39.1x.a.s.13.1h.3c.1x.a.u.13.1h.3a.1z.9.w.14.9.3.14.36.21.9.x.1g.16.32.22.9.y.1f.17.2y.25.9.z.1e.16.2x.28.7.11.1c.17.2w.29.7.12.19.19.2v.2a.7.12.19.19.2u.2d.4.14.18.18.2r.2j.2.15.18.17.2l.3z.17.16.2i.43.17.14.2f.2v.1.1b.3.1.14.11.1q.3.m.2v.4.1f.1.2.12.y.1q.5.k.2u.6.1i.13.w.1p.6.k.2s.8.1j.15.t.j.2.13.5.m.2j.1.7.a.1i.17.s.i.2.y.9.m.2k.1.6.b.1j.17.q.j.2.x.b.j.2m.2.3.d.1j.18.p.j.2.y.c.g.2n.j.1j.1a.m.1k.b.f.2o.j.1n.18.k.17.1.c.b.e.2p.k.1n.19.i.16.2.d.a.e.2p.k.1m.1b.h.15.3.g.7.d.2r.j.1m.1.5.16.h.14.4.a.4.3.5.c.2t.j.1s.r.1.f.f.14.6.8.6.2.4.b.2u.i.1u.p.4.e.e.14.8.2.3.3.5.1.4.a.2w.h.1u.o.6.e.c.15.9.1.4.3.9.9.2x.g.1v.o.8.c.d.14.9.2.4.3.8.9.2x.f.1w.n.e.8.c.14.9.3.4.2.8.8.1b.5.1i.f.1w.n.f.7.e.13.a.3.c.7.13.1.8.5.1i.g.1x.k.h.6.g.12.o.6.11.4.9.5.1g.h.1y.i.i.6.h.12.n.6.z.6.c.2.1g.h.1z.3.2.c.j.5.i.11.n.5.y.9.1.1.1s.g.25.b.j.4.k.11.m.5.x.d.1s.f.25.b.k.3.k.11.m.4.x.d.1t.f.25.a.15.2.2.11.l.4.x.d.1s.g.26.9.14.3.2.12.k.5.10.8.1t.g.26.a.14.3.2.12.j.5.11.6.1u.f.27.a.15.2.3.12.i.5.12.5.1u.f.28.d.12.1.3.13.h.5.14.2.1u.g.28.e.12.1.3.y.2.3.g.6.2z.g.29.f.15.w.4.2.g.6.i.3.2e.g.29.g.14.x.3.2.g.7.g.4.2e.g.2a.f.16.y.i.8.e.4.2f.g.2a.f.17.v.j.b.d.1.2h.9.3.4.2a.f.18.v.1.4.e.a.2v.9.5.1.2b.f.19.2.2.v.e.9.2w.9.2i.e.1f.l.5.4.d.7.2y.1.1.7.2i.e.1b.2.2.l.6.6.a.6.32.5.2k.d.1a.t.4.a.5.3.5u.8.1e.x.3.9.4.2.5v.7.1e.2.2.w.2.9.3.1.5w.6.1f.2.3.w.1.9.3.1.5t.9.1f.2.3.16.5w.a.1l.11.2.3.5v.a.1m.11.2.2.5i.1.d.9.1f.2.5.3.1.7.a.h.2.2.5v.9.1e.3.6.1.7.3.b.f.3.2.5t.9.1e.4.e.5.d.b.3.2.5t.8.1f.5.c.9.a.b.4.1.5o.2.2.8.1h.5.7.g.4.f.5r.c.1l.2.7.i.1.5.3.1.2.5.4y.3.j.2.2.e.1u.o.8.4.4s.1.4.5.f.c.2.7.1t.p.9.4.4p.4.2.7.6.1.5.e.2.7.1s.r.a.2.4o.h.1.l.3.6.1n.2.6.p.e.1.4l.12.1x.4.5.o.50.12.1y.3.5.r.4x.11.29.q.4w.11.2a.g.4.6.4w.z.2c.f.5.2.50.y.2d.f.4.1.56.t.2d.g.5c.q.2e.g.5e.o.2d.i.41.3.1a.o.2c.i.3y.7.1a.o.2b.j.3u.e.18.m.2b.6.1.c.2u.3.8.3.k.g.1a.k.2c.4.3.c.1v.4.t.5.7.4.i.h.1b.k.2c.3.3.c.1k.2.8.g.h.9.4.6.f.j.8.2.16.e.2c.3.4.c.1i.t.c.n.4.4.2.n.7.4.16.d.2c.3.5.a.f' }
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
        scale: 1.0481,
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
    routes: [],
    crossings: [],
    water: { cell: 4, rle: '3o.1q.1y.6.8.16.3p.1p.1z.3.f.11.3n.1s.2l.w.3m.2.4.1n.2p.s.3l.1.4.2.5.1j.2p.r.3k.1.4.2.g.19.2q.3.1.m.3j.1.4.2.m.14.2v.l.3i.1.3.3.q.11.33.d.3m.2.t.z.35.a.3m.1.y.v.37.7.3n.2.11.s.3a.2.3p.1.13.q.72.1.16.n.71.2.17.l.72.2.18.j.74.1.19.h.8g.f.31.6.3z.2.1b.b.30.b.3y.1.1d.7.30.j.3s.2.1d.3.32.k.3t.1.1d.2.30.j.3y.1.1c.2.2z.i.40.1.1d.2.2x.i.41.2.1c.3.2v.h.43.2.1e.5.2q.g.45.3.1h.4.2l.h.46.2.1k.4.2i.h.47.1.1o.2.1q.3.n.h.47.2.1p.2.1o.5.l.f.4a.2.1p.2.1q.4.l.e.49.2.1r.2.1p.3.n.f.46.2.1e.2.d.1.23.1.b.h.43.2.1e.8.8.1.22.3.a.h.42.2.1l.5.4.2.1z.8.7.f.45.1.1p.8.1z.8.6.g.44.1.1s.5.22.6.6.f.44.2.1s.1.2a.1.8.1.4.8.45.2.1r.1.2r.6.45.2.1q.2.2r.5.46.2.1q.2.2p.5.48.2.1r.2.2k.8.4a.1.1s.3.2h.7.4d.1.1t.2.70.1.1u.3.6y.1.1w.2.ft.2.8u.1.8u.2.8u.1.8u.2.7q.1.12.3.7r.1.10.4.7s.1.w.4.1.2.7s.2.t.5.2.2.7t.3.o.3.6.2.7w.5.i.3.8.2.7y.9.a.1.b.2.83.f.b.2.8s.3.8s.2.8s.3.8r.3.8r.4.8r.3.8s.2.8u.2.8t.2.8s.3.8s.2.8x.1.8u.2.8t.2.8t.2.8t.2.av8.2.8t.1.8u.1.8u.1.8u.2.8u.2.8u.1.3kn.4.8s.5.8r.5.1j.1.77.7.1g.2.77.5.1i.1.79.2.1j.2.8u.1.8u.2.8u.2.8t.2.8t.2.8t.2' }
  }
  }
};

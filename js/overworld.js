/**
 * overworld.js
 * Shoulders of Giants — Adventure Mode Overworld
 *
 * Three connected regional maps with fade transitions between them:
 *   eastafrica → egypt → mesopotamia (and back)
 *
 * State persisted in localStorage:
 *   sog_overworld_map          → current map id
 *   sog_overworld_pos          → {x, y} in map %
 *   sog_overworld_visited_maps → array of map ids the player has been to
 */

var Overworld = (function () {
  'use strict';

  /* ── localStorage keys ──────────────────────────────────────── */
  var KEY_MAP           = 'sog_overworld_map';
  var KEY_POS           = 'sog_overworld_pos';
  var KEY_VISITED       = 'sog_overworld_visited_maps';
  var KEY_ADVENTURE_INTRO = 'sog_adventure_intro_complete';
  var KEY_ADVENTURER    = 'sog_selected_adventurer';
  var KEY_POST_NEANDERTHAL_DIALOGUE = 'sog_post_neanderthal_overworld_complete';
  var KEY_CARD_LUCY_UNLOCKED        = 'sog_card_lucy_unlocked';
  var KEY_BATTLE_OTZI_COMPLETE      = 'sog_battle_otzi_complete';
  var KEY_EASTAFRICA_POSTOTZI_DIALOGUE = 'sog_eastafrica_postotzi_dialogue_seen'; // one-time East Africa return dialogue (after beating Otzi)
  var KEY_TOEGYPT_GOODBYE              = 'sog_toegypt_goodbye_seen';              // one-time Hunter goodbye on first To Egypt click
  var KEY_EGYPT_ARRIVAL                = 'sog_egypt_arrival_seen';                // one-time Egypt arrival dialogue (manual flow)
  var KEY_MESOPOTAMIA_ARRIVAL       = 'sog_mesopotamia_arrival_complete';
  var KEY_BATTLE_GILGAMESH_COMPLETE = 'sog_battle_gilgamesh_complete'; // set on the Gilgamesh win
  var KEY_MARKET_FIRST_VISIT        = 'sog_market_first_visit_done';   // one-time auto-walk into the market
  var KEY_MARKET_INTRO_SEEN         = 'sog_market_intro_seen';         // one-time trader intro dialogue
  var KEY_DECKBUILDER_UNLOCKED      = 'sog_deckbuilder_unlocked';      // deck builder button un-greys after first marketplace return
  // Phase D2c
  var KEY_MET_GILGAMESH             = 'sog_met_gilgamesh';              // set after the "You will be." line
  var KEY_MESO_STARTER_GRANTED      = 'sog_mesopotamia_starter_granted'; // set after all 5 card grants complete
  // Phase D4 — Sargon encounter
  var KEY_FIRST_MARKET_INTERSTITIAL = 'sog_first_market_interstitial_seen'; // one-time "building a collection" beat on the first market return
  var KEY_SARGON_NODE_REVEALED      = 'sog_sargon_node_revealed';       // dust-storm reveal played → node persists, no replay
  var KEY_HAMMURABI_NODE_REVEALED   = 'sog_hammurabi_node_revealed';    // earth-rise reveal played (after beating Sargon) → node persists, no replay
  var KEY_HANGING_GARDENS_REVEALED  = 'sog_hanging_gardens_revealed';   // sparkle reveal played (after beating Hammurabi) → node persists, no replay
  // Egypt on-ramp (post-Nebuchadnezzar)
  var KEY_NEB_COMPLETE              = 'sog_battle_nebuchadnezzar_complete'; // set on the Nebuchadnezzar (Hanging Gardens) win
  var KEY_EGYPT_NODE_LIVE           = 'sog_egypt_node_live';            // post-Neb: Egypt Double Crown node is active + post-Neb beat has played (set once, at end of the beat)
  var KEY_EGYPT_NODE_ARRIVAL        = 'sog_egypt_node_arrival_seen';    // one-time Egypt "funny hat" arrival beat (fires when reaching Egypt with the node live)
  var KEY_MET_NARMER                = 'sog_met_narmer';                 // set after the first Double Crown encounter → later clicks skip straight to the battle

  /* ════════════════════════════════════════════════════════════
     ADVENTURE MODE INTRO — two separate dialogue phases
     ════════════════════════════════════════════════════════════
     PHASE 1: fires 3s after the player arrives at East Africa.
              All explorer lines. Player movement locked.
     PHASE 2: fires when the player clicks the Prehistory node
              (only the first time). Explorer + Lucy exchange.
              Walk to the node happens AFTER this dialogue. */

  var PHASE1_DIALOGUE = [
    { who: 'explorer', text: "Jumpin' jackrabbits..." },
    { who: 'explorer', text: "I don't think that was a normal doorway." },
    { who: 'explorer', text: 'Where am I?' },
    { who: 'explorer', text: 'What do I do?' },
    { who: 'explorer', text: "I think I'm gonna be late to soccer practice." }
  ];

  /* Post-Neanderthal-victory overworld dialogue \u2014 8 lines, click-to-advance.
     Fires once after the player wins the Neanderthal battle and returns to
     the overworld.  Ends with Lucy handing the player her card. */
  var POST_NEANDERTHAL_DIALOGUE = [
    { who: 'explorer', text: 'Wow, he gave me his card.' },
    { who: 'explorer', text: 'That was so nice of him.' },
    { who: 'lucy',     text: "That wasn't nice." },
    { who: 'lucy',     text: 'To the winners of history go the spoils.' },
    { who: 'explorer', text: "I'm not sure what that means." },
    { who: 'explorer', text: 'But it sounds really smart.' },
    { who: 'lucy',     text: "You'll learn." },
    { who: 'explorer', text: "With your help, I'll be home in no time." },
    { who: 'explorer', text: 'Where to next?' },
    { who: 'lucy',     text: 'About that.' },
    { who: 'lucy',     text: "I can walk, but these old bones don't migrate." },
    { who: 'explorer', text: "Wait. You're not coming?" },
    { who: 'explorer', text: "But I don't know anything about anything yet!" },
    { who: 'lucy',     text: 'Give yourself some credit.' },
    { who: 'lucy',     text: "You outsmarted a knuckle-draggin' Neanderthal." },
    { who: 'explorer', text: 'I guess...' },
    { who: 'lucy',     text: 'Here. Take this.' }
  ];
  // Second half of Lucy's goodbye — plays AFTER her card-acquisition reveal.
  var POST_NEANDERTHAL_DIALOGUE_B = [
    { who: 'explorer', text: 'Your card?' },
    { who: 'lucy',     text: 'Every time you stand on two legs and reach into your deck...' },
    { who: 'lucy',     text: 'I will be there.' }
  ];

  /* Otzi encounter dialogue — fires when the player first clicks the
     Egypt signpost (sog_battle_otzi_complete not yet set). Click-to-
     advance, portrait boxes, same runner as all other overworld dialogue. */
  var OTZI_PRE_BATTLE_DIALOGUE = [
    { who: "otzi",     text: "Where do you think you're going?" },
    { who: "explorer", text: "I'm trying to find my way home." },
    { who: "otzi",     text: "You look like you're trying to find an arrowhead to the back of the head." },
    { who: "explorer", text: "That's not nice." },
    { who: "otzi",     text: "The world isn't nice." },
    { who: "explorer", text: "Okay! Great talk! I'll just be on my way—" },
    { who: "otzi",     text: "No. You won't." },
    { who: "explorer", text: "Dancin' dingos..." },
    { who: "explorer", text: "I'm starting to sense a pattern here." }
  ];

  /* ── Phase D1 — Otzi→Mesopotamia travel dialogue ───────────────────
     Three scenes: East Africa (12 lines) → Egypt (11 lines) → Mesopotamia (5 lines).
     After each scene the Explorer walks off the right edge; a "Traveling…" transition
     swaps the map. Triggered once from the Otzi-victory "Back to Map" button when
     sog_mesopotamia_arrival_complete is not yet set.                              */
  var D1_SCENE1_DIALOGUE = [
    { who: 'hunter',   text: 'Hey, where are you going?' },
    { who: 'explorer', text: "I need to get home, so I'm going to explore beyond this area." },
    { who: 'hunter',   text: 'What do you mean beyond this area?' },
    { who: 'explorer', text: "It's a big world out there." },
    { who: 'hunter',   text: 'How big?' },
    { who: 'explorer', text: "I don't know how to answer that." },
    { who: 'hunter',   text: 'Big enough to get away from these other tribes.' },
    { who: 'explorer', text: 'I think so.' },
    { who: 'hunter',   text: "Alright, I'm coming with you." },
    { who: 'explorer', text: "Let's go!" }
  ];

  var D1_SCENE2_DIALOGUE = [
    { who: 'explorer', text: 'WOW. Look at that huge river!' },
    { who: 'hunter',   text: 'Ah, Kemet. The black land...' },
    { who: 'explorer', text: 'The black land? It looks pretty green to me.' },
    { who: 'hunter',   text: "Look at the soil. It's so rich, it's black." },
    { who: 'explorer', text: 'Ohhh. Rich soil, big river...' },
    { who: 'explorer', text: 'Wait. Is that the Nile?' },
    { who: 'explorer', text: 'I know Egypt!' },
    { who: 'explorer', text: 'It has pyramids and mummies and King Tut!' },
    { who: 'hunter',   text: "What's a pyramid?" },
    { who: 'explorer', text: "You're right. Where are all the pyramids?" },
    { who: 'explorer', text: "Am I so early there aren't even pyramids yet?" },
    { who: 'hunter',   text: "I cannot express enough that I have no idea what you're talking about." },
    { who: 'explorer', text: "Right. We'll have to come back later." },
    { who: 'explorer', text: "It's going to be so cool." },
    { who: 'hunter',   text: 'Whatever you say, stranger.' }
  ];

  var D1_SCENE3_DIALOGUE = [
    { who: 'hunter',   text: 'Mesopotamia!' },
    { who: 'explorer', text: 'Mess-o-potato?' },
    { who: 'hunter',   text: 'Mesopotamia. It means the land between the rivers.' },
    { who: 'explorer', text: "Ohhh. Two rivers! That must be why it's so green!" }
  ];

  /* ── Phase D2a — Mesopotamia extended arrival dialogue ─────────────
     Continues immediately after D1 Scene 3 ("It looks so green.").
     River walk → Hunter transformation → farming dialectic → Walls of
     Uruk node → Farmer departure → player regains control.           */
  var D2A_FARMING_DIALOGUE = [
    { who: 'explorer', text: 'You LOOK different.' },
    { who: 'farmer',   text: 'I am different.' },
    { who: 'farmer',   text: 'I no longer have a desire to hunt all the time.' },
    { who: 'explorer', text: "You don't?" },
    { who: 'farmer',   text: 'No. On this land, I can grow anything.' },
    { who: 'explorer', text: "If you grow your own food, you won't have to fight over antelope again!" },
    { who: 'farmer',   text: 'Exactly!' },
    { who: 'farmer',   text: 'And if I grow enough, I might have extra to trade.' },
    { who: 'explorer', text: 'I think they call that a surplus.' },
    { who: 'farmer',   text: "I don't care what you call it," },
    { who: 'farmer',   text: 'If I grow enough to trade someone else can make my tools and I can just focus on farming.' },
    { who: 'explorer', text: "I think you're talking about job specialization." },
    { who: 'farmer',   text: "I think we're talking about building something bigger than a tribe..." }
  ];

  /* \u2500\u2500 Phase D2b \u2014 Gilgamesh encounter dialogue \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  var D2B_GILGAMESH_DIALOGUE = [
    { who: 'gilgamesh', text: 'Welcome to my city, Uruk.'                          },
    { who: 'explorer',  text: 'Oh hi! You must be the mayor!' },
    { who: 'gilgamesh', text: 'How DARE you confuse me for a civil servant?!' },
    { who: 'explorer',  text: 'What?'                                              },
    { who: 'gilgamesh', text: 'I am Gilgamesh.' },
    { who: 'gilgamesh', text: 'KING Gilgamesh.' },
    { who: 'explorer',  text: 'But you said it was just a city.' },
    { who: 'gilgamesh', text: "Just a city? It's my city-STATE." },
    { who: 'explorer',  text: "Oh, I'm sorry..."                          },
    { who: 'gilgamesh', text: 'You will be.'                                       }
  ];

  /* ── Phase D3a — Gilgamesh "challenge again" + post-loss Farmer/Cuneiform ──
     The pre-battle Farmer 5-card-grant + Deck Builder sequence was removed in
     D3a; the candle + Farmer dialogue helpers are reused. The post-loss Cuneiform
     intervention now lives in the Gilgamesh battle module (_runCuneiformIntervention
     in sog-adventure-gilgamesh.js).                                          */
  var D3_GILGAMESH_CHALLENGE_AGAIN = [
    { who: 'gilgamesh', text: 'You dare to challenge me again?!' },
    { who: 'explorer',  text: "I'm not the same kid you beat last time." },
    { who: 'explorer',  text: "I've been reading." },
    { who: 'gilgamesh', text: 'You naive little puppet.' },
    { who: 'gilgamesh', text: 'Prepare to be swept into the dustbin of history.' }
  ];
  // Post-loss intervention dialogue, split around the Cuneiform card grant.
  var D3_FARMER_POSTLOSS_A = [
    { who: 'farmer',   text: 'Hey. That was a tough battle.' },
    { who: 'explorer', text: 'His cards were so much more advanced than mine.' },
    { who: 'farmer',   text: 'Of course they were. You were playing in Prehistory.' },
    { who: 'farmer',   text: "You didn't stand a chance." },
    { who: 'explorer', text: "Then what do I do? I can't get stuck here!" },
    { who: 'farmer',   text: 'You need to bring your cards up to date.' }
  ];
  // [Cuneiform card acquisition fires here]
  var D3_FARMER_POSTLOSS_B = [
    { who: 'explorer', text: "What's Cuneiform?" },
    { who: 'farmer',   text: 'The first written language.' },
    { who: 'explorer', text: 'Oh, how does it work?' },
    { who: 'farmer',   text: 'You should read it, obviously.' },
    { who: 'explorer', text: 'Oh, right.' },
    { who: 'farmer',   text: 'But in effect, it will empower those old prehistoric cards you have.' },
    { who: 'explorer', text: 'Thank you.' },
    { who: 'farmer',   text: "Don't mention it." },
    { who: 'farmer',   text: "Seriously, he'll kill me." }
  ];

  /* ── Phase D4 — Sargon encounter (DRAFT dialogue; edit freely) ────────────
     Lines are plain { who, text } entries. who maps to a HUD CHARACTERS entry
     ('sargon' already exists with sargonportrait.jpg). The reveal plays once on
     the first marketplace return (after the deck-builder unlock); the node-click
     branches on the active deck size (see onNodeClick 'sargon').                */
  // First-market interstitial — plays once on the FIRST market return (post-Serf-win
  // shopping). Sargon does NOT appear yet; the only forward path is back to Gilgamesh
  // for the Giant rematch. [source: overworld.js → D4_FIRST_MARKET_INTERSTITIAL]
  var D4_FIRST_MARKET_INTERSTITIAL = [
    { who: 'explorer', text: "Wow, I'm really starting to build a collection." },
    { who: 'explorer', text: "Let's go show Gilgamesh what I've got." }
  ];
  // (a) Reveal — bookend Explorer lines around the dust-storm node reveal.
  var D4_SARGON_REVEAL_INTRO = [
    { who: 'explorer', text: "Wow, I can't wait to try out these new cards!" }
  ];
  var D4_SARGON_REVEAL_OUTRO = [
    { who: 'explorer', text: 'Okay, that was mysterious.' },
    { who: 'explorer', text: 'I have to go check it out.' }
  ];
  // (b) Deck NOT ready (< 15 cards): Sargon turns the Explorer away. Split so
  //     Sargon's portrait can slide out before the Explorer's closing line.
  var D4_SARGON_TURNED_AWAY_A = [
    { who: 'sargon',   text: "You think you're ready to face Sargon?" },
    { who: 'explorer', text: 'I guess…'                          },
    { who: 'sargon',   text: 'Guess again.'                           },
    { who: 'sargon',   text: 'You need a deck of at least 15 cards before you can face Sargon, the Great.' }
  ];
  var D4_SARGON_TURNED_AWAY_B = [
    { who: 'explorer', text: '15 cards...' },
    { who: 'explorer', text: "I only have a handful. I need to grow my collection." },
    { who: 'explorer', text: "Gilgamesh — if I can best his Giant, he'll grant me his card and enough gold to stock up at the Marketplace." },
    { who: 'explorer', text: "Back to Uruk, then." }
  ];
  // (c) Deck ready (exactly 15 cards): the full Emperor encounter, then battle.
  var D4_SARGON_ENCOUNTER = [
    { who: 'sargon',   text: 'Who dares to cross Sargon the Great?' },
    { who: 'explorer', text: 'It is I! Just a humble explorer, trying to get home in time for soccer practice...' },
    { who: 'explorer', text: 'Great King Sargon.' },
    { who: 'sargon',   text: 'King?!' },
    { who: 'sargon',   text: 'Sargon is no King.' },
    { who: 'explorer', text: 'Uhh, what?' },
    { who: 'sargon',   text: "Sargon is the world's first EMPEROR!" },
    { who: 'explorer', text: "Isn't that like the same thing?" },
    { who: 'sargon',   text: "I don't rule over one measly city-state." },
    { who: 'sargon',   text: 'I rule over ALL the city-states of Mesopotamia!' },
    { who: 'explorer', text: 'Of course you do.' },
    { who: 'sargon',   text: 'That includes you!' },
    { who: 'explorer', text: 'Of course it does.' }
  ];
  // Closing reflection on the map after losing to Sargon (before defeating him).
  // The Sargon-side smack-talk plays on the battle screen (sog-adventure-sargon);
  // this Explorer line plays once back on the overworld via returnFromSargonLoss.
  var D4_SARGON_LOSS_REFLECT = [
    { who: 'explorer', text: 'Okay. Maybe I build up my deck before I take on an entire EMPIRE.' }
  ];
  // SARGON INTERSTITIAL — plays during the Serf-win return choreography (as the Serf
  // flag stamps, the Giant flag pops in, and the Hammurabi node rises), then hands the
  // player a free choice: advance to Hammurabi, or return for Sargon's Giant.
  // [source: overworld.js → D4_SARGON_WIN_REFLECT]
  var D4_SARGON_WIN_REFLECT = [
    { who: 'explorer', text: 'Oh wow…' },
    { who: 'explorer', text: "I'm at a crossroads." },
    { who: 'explorer', text: 'Do I take on the next Empire or return to the old?' },
    { who: 'explorer', text: 'Either way, I still have no idea how to get home.' }
  ];
  // After beating Hammurabi — bookend Explorer lines around the Hanging Gardens
  // sparkle reveal. REFLECT plays before the shimmer; REACTION after the node
  // sparkle-fades in. Editable.
  /* NEB (Hanging Gardens) SERF-WIN INTERSTITIAL — bookends the GIANT FLAG RAISE.
     Neb is the last Mesopotamia boss, so there is NO node reveal here: the raised
     Giant flag on his node IS the "come back and beat me properly" cue, and his
     Giant is the only remaining action on the map.
     [source: overworld.js → D5_NEB_WIN_INTERSTITIAL_A/_B] */
  var D5_NEB_WIN_INTERSTITIAL_A = [
    { who: 'explorer', text: 'Are all leaders so in love with themselves?' }
    // → [GIANT FLAG raises]
  ];
  var D5_NEB_WIN_INTERSTITIAL_B = [
    { who: 'explorer', text: "Looks like there's only one way forward." }
  ];

  /* NARMER (Double Crown) SERF-WIN INTERSTITIAL — bookends the GIANT FLAG RAISE.
     Same shape as Neb's above and for the same reason: Narmer is the last boss
     BUILT, so there is NO node reveal and no advance-or-stay choice — the raised
     Giant flag on the Double Crown IS the cue, and the River Market is the only
     other thing to do before the rematch (hence the Explorer's shopping line).
     [source: overworld.js → D6_NARMER_WIN_INTERSTITIAL_A/_B] */
  var D6_NARMER_WIN_INTERSTITIAL_A = [
    { who: 'explorer', text: 'He was calm.' },
    { who: 'explorer', text: 'Too calm.' }
    // → [GIANT FLAG raises]
  ];
  var D6_NARMER_WIN_INTERSTITIAL_B = [
    { who: 'explorer', text: 'I better see what I can add to my collection before I go back.' }
  ];

  /* HAMMURABI INTERSTITIAL — the post-Serf-win beat, bookending the Hanging
     Gardens node reveal: REFLECT plays before the shimmer, REACTION after the node
     sparkle-fades in. [source: overworld.js → D5_HANGING_GARDENS_REFLECT/_REACTION] */
  var D5_HANGING_GARDENS_REFLECT = [
    { who: 'explorer', text: 'I kind of think he prejudged me there.' },
    { who: 'explorer', text: "I'm not sure if I really want to go back." }
    // → [HANGING GARDENS node rise animation]
  ];
  var D5_HANGING_GARDENS_REACTION = [
    { who: 'explorer', text: 'Wow! That was magical.' },
    { who: 'explorer', text: 'Do I go back on trial or go see what that’s all about?' }
  ];
  // Hanging Gardens node-CLICK sequence (walk-up → dialogue + knock/door sfx → wipe
  // into the battle STUB). The lines come in two groups: group A, then knocking.m4a
  // plays in full, then group B, then opendoor.m4a plays in full, then the wipe.
  // Editable.
  var D5_HANGING_GARDENS_CLICK_A = [
    { who: 'explorer', text: 'This place is literally wonderful!' },
    { who: 'explorer', text: 'And no sign of a mean king anywhere.' }
  ];
  var D5_HANGING_GARDENS_CLICK_B = [
    { who: 'explorer', text: 'Well, if no one is going to answer the door...' }
  ];
  // ── Egypt on-ramp (post-Nebuchadnezzar) ──────────────────────────────────
  // Beat 1: plays on the Mesopotamia overworld after beating Nebuchadnezzar
  // (after a ~5s "looking around expectantly" idle). Then the To Egypt exit
  // flashes for 3s. EDITABLE.
  var EGYPT_ONRAMP_DIALOGUE = [
    { who: 'explorer', text: "Okay. I'm done, right?" },
    { who: 'explorer', text: 'Abracadabra?!' },
    { who: 'explorer', text: 'Open sesame?!' },
    { who: 'explorer', text: 'Come on... magic doorway home is now where you take me.' },
    { who: 'explorer', text: 'Well, no sense in just standing here.' },
    { who: 'explorer', text: 'Nebuchadnezzar did say something about Egypt.' },
    { who: 'explorer', text: 'Maybe the only way back is forward.' }
  ];
  // Beat 2: plays once when the player reaches the Egypt map with the Double
  // Crown node live (sog_egypt_node_live). EDITABLE.
  var EGYPT_NODE_ARRIVAL_DIALOGUE = [
    { who: 'explorer', text: 'STILL no pyramids?' },
    { who: 'explorer', text: 'How early am I?!' },
    { who: 'explorer', text: 'Oohh!' },
    { who: 'explorer', text: "Now that's a funny hat..." }
  ];

  // Narmer (Egypt) encounter — plays on every Double Crown node click (walk up
  // first), then hands off to the battle-start STUB (the Narmer battle isn't
  // built yet). EDITABLE.
  var NARMER_ENCOUNTER_DIALOGUE = [
    { who: 'narmer',   text: 'Hello, good traveler!' },
    { who: 'narmer',   text: 'Welcome, welcome…' },
    { who: 'explorer', text: 'Are you another mean ruler?' },
    { who: 'narmer',   text: 'Some like to call me Menes, but in Egypt, I am Narmer, the first pharaoh.' },
    { who: 'explorer', text: 'Thank goodness.' },
    { who: 'explorer', text: 'By the way, I love your hat.' },
    { who: 'narmer',   text: 'This is no hat, my friend.' },
    { who: 'narmer',   text: 'This is the Double Crown.' },
    { who: 'explorer', text: 'Double?' },
    { who: 'explorer', text: 'Why would you put a crown on a crown?' },
    { who: 'narmer',   text: 'It evokes unity.' },
    { who: 'narmer',   text: 'The White Crown of Upper Egypt to the south.' },
    { who: 'narmer',   text: 'The Red Crown of Lower Egypt to the north.' },
    { who: 'explorer', text: "Wouldn't Upper be north? And Lower be south?" },
    { who: 'narmer',   text: 'My people do not follow the compass. We follow the river.' },
    { who: 'narmer',   text: '"Upper" refers to upstream on the Nile River.' },
    { who: 'explorer', text: 'Ohhh.' },
    { who: 'explorer', text: 'I think I get it.' },
    { who: 'narmer',   text: 'It doesn’t matter whether or not you "get it."' },
    { who: 'narmer',   text: 'This crown is what holds this Kingdom together.' },
    { who: 'explorer', text: 'I’m sensing a turn…' },
    { who: 'narmer',   text: 'What does your crown represent?' },
    { who: 'explorer', text: 'This hat? It represents me not wanting to get sunburned.' },
    { who: 'narmer',   text: 'You belong to nothing?' },
    { who: 'explorer', text: 'I wouldn’t say that…' },
    { who: 'narmer',   text: 'An unknown. A crack in a perfect whole.' },
    { who: 'explorer', text: 'Yup. This took a turn.' },
    { who: 'narmer',   text: 'Unity does not exist unless we are all as one.' },
    { who: 'explorer', text: 'Gulp.' },
    { who: 'narmer',   text: 'And you are not one of us.' }
  ];

  // Hammurabi (Babylon) encounter — plays on node click when the active deck has
  // the full 15 cards, then the battle launches.
  var D4_HAMMURABI_ENCOUNTER = [
    { who: 'hammurabi', text: 'Halt.' },
    { who: 'hammurabi', text: 'State your business before the Law.' },
    { who: 'explorer',  text: 'What law?' },
    { who: 'explorer',  text: 'I was just admiring this big stone tablet.' },
    { who: 'hammurabi', text: 'That "tablet" is the Code.' },
    { who: 'explorer',  text: 'Code for what?' },
    { who: 'hammurabi', text: 'My code of 282 laws.' },
    { who: 'explorer',  text: "That's a lot of laws." },
    { who: 'hammurabi', text: 'Not if you want to keep order.' },
    { who: 'explorer',  text: 'And if someone breaks one?' },
    { who: 'hammurabi', text: 'They pay the price.' },
    { who: 'explorer',  text: 'Fair enough.' },
    { who: 'hammurabi', text: 'Now, time to put you on trial.' }
  ];
  // Turned away when the deck is under 15 cards (split so Hammurabi's portrait can
  // slide out before the Explorer's closing line). PLACEHOLDER — edit freely.
  var D4_HAMMURABI_TURNED_AWAY_A = [
    { who: 'hammurabi', text: 'The court is not yet in session.' },
    { who: 'hammurabi', text: 'Return when your deck is whole — fifteen cards.' }
  ];
  var D4_HAMMURABI_TURNED_AWAY_B = [
    { who: 'explorer',  text: 'I should finish building my deck first.' }
  ];
  var D2C_AUTO_DISMISS_MS    = 1500;
  var KEY_GILGAMESH_PHASE1   = 'sog_gilgamesh_phase1_complete';
  var KEY_CUNEIFORM_GRANTED  = 'sog_cuneiform_granted';

  var PHASE2_DIALOGUE = [
    { who: 'lucy',     text: 'Mmmhm...' },
    { who: 'lucy',     text: "I'm standing right here." },
    { who: 'explorer', text: 'Woah, you can talk?!' },
    { who: 'explorer', text: 'I thought you were an ape!' },
    { who: 'lucy',     text: 'Australopithecus, to the uninitiated.' },
    { who: 'explorer', text: 'Australo-what-now?' },
    { who: 'lucy',     text: "It means I'm one of your earliest bipedal human ancestors to stand on two legs." },
    { who: 'explorer', text: "My ancestor? Are you saying we're related?" },
    { who: 'lucy',     text: "I'm like your great aunt a million times over." },
    { who: 'explorer', text: 'Right. But how are you talking?' },
    { who: 'explorer', text: 'How am I even HERE?' },
    { who: 'explorer', text: 'Did I time travel? Is this...' },
    { who: 'lucy',     text: 'Relax.' },
    { who: 'lucy',     text: "I might be millions of years old, but I don't have all the answers." },
    { who: 'explorer', text: "That doesn't help my nerves." },
    { who: 'explorer', text: 'I have to get home for soccer practice.' },
    { who: 'lucy',     text: 'Huh?' },
    { who: 'explorer', text: "It's very important." },
    { who: 'lucy',     text: 'If you say so.' },
    { who: 'lucy',     text: 'All I know is that by standing upright on my own two feet...' },
    { who: 'lucy',     text: 'I always get to where I want to go.' },
    { who: 'explorer', text: 'Maybe I will find my way home.' },
    { who: 'lucy',     text: 'You do that.' },
    { who: 'lucy',     text: "Now, I'm going to use my bipedal powers to get myself a drink." }
  ];

  var PHASE1_WAIT_MS = 3000;    // 3s arrival pause before Phase 1 fires

  /* ── Post-Otzi East Africa flow dialogue (reuses the standard runner) ── */
  // One-time, first return to East Africa after beating Otzi.
  var EASTAFRICA_POSTOTZI_DIALOGUE = [
    { who: 'explorer', text: 'Who knew history had so much conflict?' },
    { who: 'hunter',   text: 'Tell me about it.' },
    { who: 'explorer', text: "Oh, hi. You're not going to want to fight me, are you?" },
    { who: 'hunter',   text: 'Are you from one of those tribes taking my antelope?' },
    { who: 'explorer', text: 'No. Definitely not.' },
    { who: 'hunter',   text: 'Alright, then.' },
    { who: 'explorer', text: "I'm so sorry people are stealing your pets." },
    { who: 'hunter',   text: "Pets? They're my lunch." },
    { who: 'explorer', text: 'Oh. I see.' },
    { who: 'explorer', text: "Well, couldn't you share?" },
    { who: 'hunter',   text: 'What does that mean?' }
  ];
  // One-time, on the FIRST return from the marketplace — un-greys the deck builder.
  var DECKBUILDER_UNLOCK_DIALOGUE = [
    { who: 'explorer', text: 'I’m starting to build quite a collection.' },
    { who: 'explorer', text: 'Let’s see if I can build a deck.'          }
  ];
  // One-time, first click of the To Egypt box — plays before the walk-off.
  var TOEGYPT_GOODBYE_DIALOGUE = [
    { who: 'hunter',   text: 'Hey, where are you going?'                               },
    { who: 'explorer', text: "I'm going to try and find my way home by exploring the rest of the world." },
    { who: 'hunter',   text: 'There’s more world out there?'                      },
    { who: 'explorer', text: 'Of course.'                                              },
    { who: 'hunter',   text: 'Maybe there are places where I won’t have to fight others for resources?' },
    { who: 'explorer', text: 'There’s only one way to find out...'               },
    { who: 'explorer', text: 'Let’s go!'                                          }
  ];

  // Walk-off target offset (relative to the explorer's current position) for
  // leaving East Africa toward Egypt: she walks up-and-right off the screen
  // edge, then the map transition fades in. Halved from the original 96/-96 to
  // cut the dead footstep tail (sprite already off-screen, footsteps still
  // playing) by ~half WITHOUT changing the visible walk's speed or direction —
  // same heading, just a shorter off-screen run. Shared by the D1 first-win
  // cinematic and the To Egypt exit box.
  var EGYPT_WALKOFF = { dx: 48, dy: -48 };

  /* ════════════════════════════════════════════════════════════
     MAP DATA — positions in data/map-data.js, behaviour here
     ════════════════════════════════════════════════════════════
     The map LAYOUT (which nodes exist, where they sit, their art, scale, and
     walk paths) was lifted out of this file into data/map-data.js so that
     tools/map-editor can rewrite it without ever touching game logic. See that
     file's header for the coordinate system and for why it is .js not .json.

     What stayed behind is everything function-valued — the showIf visibility
     gates and the to-Egypt onBeforeExit hook. Those close over the KEY_*
     constants, runDialogue, cancelIdle and isDialogueLocked, none of which
     exist outside this closure, so they can never be serialised out. They are
     keyed by node id (exits by 'mapId/exitId', because BOTH East Africa and
     Mesopotamia declare an exit called 'to-egypt') and merged in at load.

     Net effect: the editor owns WHERE things are, this file owns WHEN they
     appear and WHAT they do. ────── */
  var SPRITE_PATH = 'images/metaworld/character sprites/female/';
  var NODE_PATH   = 'images/metaworld/civilization nodes/';

  /* Visibility gates, by node id. A node with no entry here is always shown. */
  var NODE_BEHAVIOUR = {
    // Hidden until the player completes the Neanderthal battle and the
    // post-victory overworld sequence plays (_completePostVictorySequence sets
    // this flag then immediately calls _refreshNodes so the node appears).
    'egypt-signpost': {
      showIf: function () {
        try { return localStorage.getItem(KEY_POST_NEANDERTHAL_DIALOGUE) === 'true'; }
        catch (e) { return false; }
      }
    },

    // Both Egypt nodes go live on the SAME flag (set when Giant Neb falls):
    // reaching Egypt at all is the unlock, so the River Market is browsable the
    // instant the player can get there — it is NOT gated on Narmer progression.
    'double-crown': {
      showIf: function () {
        try { return localStorage.getItem(KEY_EGYPT_NODE_LIVE) === 'true'; }
        catch (e) { return false; }
      }
    },
    'egypt-market': {
      showIf: function () {
        try { return localStorage.getItem(KEY_EGYPT_NODE_LIVE) === 'true'; }
        catch (e) { return false; }
      }
    },

    'walls-of-uruk': {
      showIf: function () {
        try { return localStorage.getItem(KEY_MESOPOTAMIA_ARRIVAL) === 'true'; }
        catch (e) { return false; }
      }
    },
    // Appears only after the Gilgamesh win — the same completion-flag gating
    // the To Egypt box uses.
    'market': {
      showIf: function () {
        try { return localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true'; }
        catch (e) { return false; }
      }
    },
    // Dust-storm-revealed on the first marketplace return.
    'sargon': {
      showIf: function () {
        try { return localStorage.getItem(KEY_SARGON_NODE_REVEALED) === 'true'; }
        catch (e) { return false; }
      }
    },
    // Rises from the dirt on the first overworld return after Sargon falls.
    'hammurabi': {
      showIf: function () {
        try { return localStorage.getItem(KEY_HAMMURABI_NODE_REVEALED) === 'true'; }
        catch (e) { return false; }
      }
    },
    // Sparkle-revealed on the first overworld return after Hammurabi falls.
    'hanging-gardens': {
      showIf: function () {
        try { return localStorage.getItem(KEY_HANGING_GARDENS_REVEALED) === 'true'; }
        catch (e) { return false; }
      }
    }
  };

  /* Exit gates + pre-exit hooks, keyed 'mapId/exitId' — two maps both declare
     an exit called 'to-egypt', so a bare id would collide. */
  var EXIT_BEHAVIOUR = {
    'eastafrica/to-egypt': {
      // Gated on beating Otzi — the same flag the Otzi card grant and the
      // signpost checkmark use.
      showIf: function () {
        try { return localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true'; }
        catch (e) { return false; }
      },
      // First click only: Hunter's goodbye, then the walk-off + transition.
      // Subsequent clicks skip straight to the walk-off (flag already set).
      onBeforeExit: function (proceed) {
        var seen = false;
        try { seen = localStorage.getItem(KEY_TOEGYPT_GOODBYE) === 'true'; } catch (e) {}
        if (seen) { proceed(); return; }
        isDialogueLocked = true;
        cancelIdle();
        runDialogue(TOEGYPT_GOODBYE_DIALOGUE, function () {
          isDialogueLocked = false;
          try { localStorage.setItem(KEY_TOEGYPT_GOODBYE, 'true'); } catch (e) {}
          proceed();
        });
      }
    }
  };

  /* Merge layout + behaviour into the runtime MAPS the rest of this file reads.
     Copies each node/exit so runtime tweaks never write back into SOG_MAP_DATA. */
  function _buildMaps() {
    var data = window.SOG_MAP_DATA;
    if (!data) {
      // Loud on purpose. Without this the overworld just renders zero nodes,
      // which reads as an art bug rather than a missing script tag.
      console.error('[Overworld] data/map-data.js did not load — no maps available. ' +
                    'Check the script tag order in index.html.');
      return {};
    }
    function merge(src, behaviour) {
      var out = {}, k;
      for (k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]; }
      if (behaviour) {
        if (behaviour.showIf)       out.showIf       = behaviour.showIf;
        if (behaviour.onBeforeExit) out.onBeforeExit = behaviour.onBeforeExit;
      }
      return out;
    }
    var maps = {};
    Object.keys(data).forEach(function (mapId) {
      var src = data[mapId];
      maps[mapId] = {
        displayName:  src.displayName,
        image:        src.image,
        spawn:        src.spawn,
        startsFogged: src.startsFogged,
        nodes: (src.nodes || []).map(function (n) {
          return merge(n, NODE_BEHAVIOUR[n.id]);
        }),
        exits: (src.exits || []).map(function (x) {
          return merge(x, EXIT_BEHAVIOUR[mapId + '/' + x.id]);
        })
      };
    });
    return maps;
  }

  var MAPS = _buildMaps();

  /* ── Animation timing ──────────────────────────────────────── */
  var WALK_FRAME_MS = 125;    // 8 fps walk
  var MAP_FRAME_MS  = 1000;   // 1 s per map-reading frame
  var IDLE_DELAY_MS = 15000;

  var FRAME_COUNT = { right: 6, left: 6, up: 8, down: 4 };
  var MAP_FRAMES  = 9;

  /* ── Footstep SFX ──────────────────────────────────────────── */
  var footstepsHowl = null;
  function ensureFootsteps() {
    if (footstepsHowl || typeof Howl === 'undefined') return;
    footstepsHowl = new Howl({
      src: ['sfx/adventuresteps.m4a'],
      loop: true,
      volume: 0.7,
      html5: true
    });
  }
  function startFootsteps() {
    ensureFootsteps();
    if (footstepsHowl && !footstepsHowl.playing()) {
      footstepsHowl.volume(0.7 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1));   // SFX-slider scaled
      footstepsHowl.play();
    }
  }
  function stopFootsteps() {
    if (footstepsHowl && footstepsHowl.playing()) footstepsHowl.stop();
  }

  /* ── Wipe transition SFX (shared by all encounter radial wipes) ── */
  var _wooshHowl = null;
  function _ensureWoosh() {
    if (_wooshHowl || typeof Howl === 'undefined') return;
    _wooshHowl = new Howl({ src: ['sfx/woosh.m4a'], volume: 0.8, html5: true });
  }
  function _playWoosh() {
    _ensureWoosh();
    if (_wooshHowl) { try { _wooshHowl.volume(0.8 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1)); _wooshHowl.stop(); _wooshHowl.play(); } catch (e) {} }
  }

  /* ── DOM refs + state ──────────────────────────────────────── */
  var mapImgEl, overlayEl, charEl, fogEl, transitionEl, transitionTextEl;
  var currentMapId   = 'eastafrica';
  var currentPos     = { x: 0, y: 0 };
  var visitedMaps    = [];
  var isMoving       = false;
  var isTransitioning = false;
  var isDialogueLocked = false;   // set true during the adventure intro
  var walkInterval   = null;
  var idleTimer      = null;
  var idleRoutineTimer = null;

  // Urgent-pulse idle timer (30s after dialogue end → brighten prehistory node)
  var urgentPulseTimer = null;

  /* ── localStorage helpers ──────────────────────────────────── */
  function loadState() {
    currentMapId = localStorage.getItem(KEY_MAP) || 'eastafrica';
    if (!MAPS[currentMapId]) currentMapId = 'eastafrica';
    try {
      var p = localStorage.getItem(KEY_POS);
      currentPos = p ? JSON.parse(p) : { x: MAPS[currentMapId].spawn.x, y: MAPS[currentMapId].spawn.y };
    } catch (e) {
      currentPos = { x: MAPS[currentMapId].spawn.x, y: MAPS[currentMapId].spawn.y };
    }
    try {
      var v = localStorage.getItem(KEY_VISITED);
      visitedMaps = v ? JSON.parse(v) : [];
    } catch (e) { visitedMaps = []; }
    // Always mark East Africa as visited (it's the starting map, no fog)
    if (visitedMaps.indexOf('eastafrica') === -1) visitedMaps.push('eastafrica');
  }
  function saveState() {
    try {
      localStorage.setItem(KEY_MAP, currentMapId);
      // Strip any non-(x,y) properties before serializing. GSAP's
      // tween targets pick up a `_gsap` metadata object with cyclic
      // back-references, which previously crashed JSON.stringify
      // here — silently killing whatever callback was supposed to
      // run after walkPath (e.g. SOG.Adventure.Prehistory's battle
      // launch). Pinning to {x,y} sidesteps it without rewriting
      // every gsap.to(currentPos, ...) call site.
      localStorage.setItem(KEY_POS, JSON.stringify({
        x: currentPos.x,
        y: currentPos.y
      }));
      localStorage.setItem(KEY_VISITED, JSON.stringify(visitedMaps));
    } catch (e) {
      // Storage failure (quota, private mode, etc.) shouldn't crash
      // the walk's onComplete callback chain. Log and move on.
      console.warn('[Overworld] saveState failed:', e);
    }
  }

  /* ── Character rendering ───────────────────────────────────── */
  function positionChar(xPct, yPct) {
    charEl.style.left = xPct + '%';
    charEl.style.top  = yPct + '%';
  }

  function setWalkFrame(dir, frame) {
    var num = frame < 10 ? '0' + frame : '' + frame;
    var base = (dir === 'left') ? 'right' : dir;
    charEl.src = SPRITE_PATH + 'adventurer-female-' + base + '-' + num + '.png';
    charEl.style.transform = (dir === 'left')
      ? 'translate(-50%, -100%) scaleX(-1)'
      : 'translate(-50%, -100%)';
  }

  function startWalkAnim(dir) {
    if (walkInterval) clearInterval(walkInterval);
    var frame = 1;
    setWalkFrame(dir, frame);
    walkInterval = setInterval(function () {
      var fc = FRAME_COUNT[dir] || 4;
      frame = (frame % fc) + 1;
      setWalkFrame(dir, frame);
    }, WALK_FRAME_MS);
  }

  function setStanding() {
    if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
    charEl.src = SPRITE_PATH + 'adventurer-female-standing.png';
    charEl.style.transform = 'translate(-50%, -100%)';
  }

  /* ── Walking through waypoints ─────────────────────────────── */
  function walkPath(waypoints, onDone) {
    if (!waypoints || !waypoints.length) { if (onDone) onDone(); return; }
    isMoving = true;
    cancelIdle();
    startFootsteps();
    var i = 0;
    function next() {
      if (i >= waypoints.length) {
        isMoving = false;
        setStanding();
        stopFootsteps();
        saveState();
        if (onDone) onDone();
        return;
      }
      walkToWaypoint(waypoints[i], function () { i++; next(); });
    }
    next();
  }

  function walkToWaypoint(wp, onDone) {
    var from = { x: currentPos.x, y: currentPos.y };
    var dx = wp.x - from.x;
    var dy = wp.y - from.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    var dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
    else                              dir = dy > 0 ? 'down'  : 'up';

    startWalkAnim(dir);
    var duration = Math.max(0.6, distance * 0.08);

    if (typeof gsap !== 'undefined') {
      // Tween a disposable proxy rather than `currentPos` itself —
      // gsap attaches a non-trivial metadata object to its targets
      // and we want `currentPos` to stay a plain {x,y} (saveState
      // serializes it). Sync x/y back into currentPos each tick.
      var proxy = { x: currentPos.x, y: currentPos.y };
      gsap.to(proxy, {
        x: wp.x, y: wp.y,
        duration: duration,
        ease: 'none',
        onUpdate: function () {
          currentPos.x = proxy.x;
          currentPos.y = proxy.y;
          positionChar(currentPos.x, currentPos.y);
        },
        onComplete: function () {
          currentPos.x = wp.x; currentPos.y = wp.y;
          positionChar(wp.x, wp.y);
          if (onDone) onDone();
        }
      });
    } else {
      currentPos.x = wp.x; currentPos.y = wp.y;
      positionChar(wp.x, wp.y);
      if (onDone) onDone();
    }
  }

  /* ── Idle routine ──────────────────────────────────────────── */
  function scheduleIdle() {
    cancelIdle();
    idleTimer = setTimeout(startIdleRoutine, IDLE_DELAY_MS);
  }
  function cancelIdle() {
    if (idleTimer)        { clearTimeout(idleTimer);        idleTimer = null; }
    if (idleRoutineTimer) { clearTimeout(idleRoutineTimer); idleRoutineTimer = null; }
  }
  function startIdleRoutine() {
    if (isMoving || isTransitioning) return;
    playMapAnim(2, function () {
      playStanding(2, function () { startIdleRoutine(); });
    });
  }
  function playMapAnim(loops, onDone) {
    var loop = 0, frame = 1;
    function step() {
      if (isMoving || isTransitioning) { if (onDone) onDone(); return; }
      var num = frame < 10 ? '0' + frame : '' + frame;
      charEl.src = SPRITE_PATH + 'adventurer-female-map-' + num + '.png';
      charEl.style.transform = 'translate(-50%, -100%)';
      frame++;
      if (frame > MAP_FRAMES) { frame = 1; loop++; if (loop >= loops) { if (onDone) onDone(); return; } }
      idleRoutineTimer = setTimeout(step, MAP_FRAME_MS);
    }
    step();
  }
  function playStanding(loops, onDone) {
    var loop = 0, ticks = 0, TICKS_PER_LOOP = 8;
    function step() {
      if (isMoving || isTransitioning) { if (onDone) onDone(); return; }
      charEl.src = SPRITE_PATH + 'adventurer-female-standing.png';
      charEl.style.transform = 'translate(-50%, -100%)';
      ticks++;
      if (ticks >= TICKS_PER_LOOP) { ticks = 0; loop++; if (loop >= loops) { if (onDone) onDone(); return; } }
      idleRoutineTimer = setTimeout(step, WALK_FRAME_MS);
    }
    step();
  }

  /* ── Load a map (swap image, build overlay, place character) ── */
  // Every character sprite frame the overworld can swap in (walk cycles, the
  // map-reading idle, and the standing frames). Built from SPRITE_PATH so it tracks
  // the naming used by setWalkFrame / the idle routine. Preloaded on map load.
  function _walkFrameUrls() {
    var P = SPRITE_PATH, out = [], i;
    var dirs = { down: 4, right: 6, up: 8 };   // 'left' reuses the 'right' frames (scaleX -1)
    for (var d in dirs) { for (i = 1; i <= dirs[d]; i++) out.push(P + 'adventurer-female-' + d + '-' + (i < 10 ? '0' + i : i) + '.png'); }
    for (i = 1; i <= 6; i++) out.push(P + 'adventurer-female-idle-' + (i < 10 ? '0' + i : i) + '.png');
    for (i = 1; i <= 9; i++) out.push(P + 'adventurer-female-map-'  + (i < 10 ? '0' + i : i) + '.png');
    out.push(P + 'adventurer-female-standing.png');
    out.push(P + 'adventurer-female-standing-backward.png');
    return out;   // 35 frames
  }

  // Start (or keep) the overworld track for the current map. Idempotent via
  // SOG.music.playContext — safe to call from every map-entry / battle-return /
  // market-exit path; it only restarts when the map's context actually changes.
  function _playMapMusic() {
    // Some sequences borrow the overworld screen but want SILENCE (e.g. the
    // Gilgamesh cuneiform "shh" intervention) — they set this flag to opt out.
    if (window._sogSuppressMapMusic) return;
    if (window.SOG && SOG.music && typeof SOG.music.playContext === 'function') {
      SOG.music.playContext('overworld:' + currentMapId);
    }
  }

  function loadMap(mapId, opts) {
    opts = opts || {};
    var data = MAPS[mapId];
    if (!data) { console.warn('[Overworld] Unknown map:', mapId); return; }

    currentMapId = mapId;
    // Fix 4: toggle body class so Explorer dialogue box can be re-centred on foreign maps
    document.body.classList.toggle('overworld-away-from-home', mapId !== 'eastafrica');
    mapImgEl.src = data.image;

    // Stage 1 preload: warm ALL character walk frames (+ this map's background) so
    // the walk animation's 125ms src-swaps hit cache instead of racing the network
    // (the mid-walk frame stutter). De-duped, fire-and-forget — runs once in effect.
    if (window.SOG && SOG.preload && typeof SOG.preload.images === 'function') {
      SOG.preload.images(_walkFrameUrls());
      SOG.preload.images([data.image]);
      // Warm the woosh now (overworld entry) — it fires the side-locations entrance
      // in the Otzi/Neanderthal battle intros (always reached from here) and on
      // node->battle wipes. Warming this early guarantees it's cached before those
      // beats, so it plays in sync online instead of fetching on first play.
      if (typeof SOG.preload.audio === 'function') SOG.preload.audio(['sfx/woosh.m4a']);
      // Mesopotamia hosts the marketplace — warm its background + price-tag now so
      // the market's bg-load gate clears instantly when the player enters it.
      if (mapId === 'mesopotamia') {
        SOG.preload.images(['images/ui_images/mesomarket.jpg', 'images/ui_images/pricetag@0.5x.png']);
      }
    }
    // The Egypt map (egyptz.jpeg) is slightly taller than the 16:9 viewport, so
    // object-fit:cover alone would crop the Nile Delta at the top. Pin the image's
    // TOP edge to the screen top (delta fully visible), then zoom in from that top
    // anchor so the image grows DOWNWARD to cover the bottom all the way under the
    // HUD (no gap). The top stays framed; only extra map is cropped at the bottom.
    // Other maps keep their default centered framing.
    if (mapId === 'egypt') {
      mapImgEl.style.objectPosition  = 'center top';
      mapImgEl.style.transformOrigin = 'center top';
      mapImgEl.style.transform       = 'translateY(-4%) scale(1.08)';
    } else {
      mapImgEl.style.objectPosition  = '';
      mapImgEl.style.transformOrigin = '';
      mapImgEl.style.transform       = '';
    }

    // Update the HUD region label to the current map's display name (dynamic —
    // never hardcoded). Guarded: a no-op if the HUD isn't present/ready.
    if (window.SOG && SOG.HUD && typeof SOG.HUD.setRegion === 'function') {
      SOG.HUD.setRegion(data.displayName || mapId);
    }

    // Clear overlay. Character is re-appended LAST (after nodes and exits)
    // so it always paints on top in DOM order — prevents node images from
    // covering the character when she stands at the same position as a node.
    overlayEl.innerHTML = '';

    // Egypt early-settlement topography props (pre-Neb only; self-gates on map +
    // KEY_EGYPT_NODE_LIVE). Placed before the nodes so they sit behind them.
    _placeEgyptProps();

    // Place nodes
    data.nodes.forEach(function (n) {
      // Gate: skip nodes that have a showIf predicate that returns false.
      if (typeof n.showIf === 'function' && !n.showIf()) return;

      var nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = n.id;
      nodeEl.style.left = n.x + '%';
      nodeEl.style.top  = n.y + '%';
      if (n.scale) nodeEl.style.transform = 'translate(-50%,-50%) scale(' + n.scale + ')';
      var img = document.createElement('img');
      img.src = n.image;
      img.alt = n.name;
      img.draggable = false;
      if (n.flipX) img.style.transform = 'scaleX(-1)';
      nodeEl.appendChild(img);
      // Optional hover label (e.g. "To Egypt" on the signpost node).
      if (n.label) {
        var labelEl = document.createElement('div');
        labelEl.className = 'overworld-node-label';
        labelEl.textContent = n.label;
        nodeEl.appendChild(labelEl);
      }
      nodeEl.addEventListener('click', function () { onNodeClick(n); });
      // Adventure Mode completion badges
      if (n.id === 'prehistory' &&
          window.SOG && SOG.Adventure && SOG.Adventure.Prehistory &&
          SOG.Adventure.Prehistory.isBattleComplete()) {
        nodeEl.classList.add('overworld-node-complete');
      }
      if (n.id === 'egypt-signpost') {
        try {
          if (localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true') {
            nodeEl.classList.add('overworld-node-complete');
          }
        } catch (e) {}
      }
      overlayEl.appendChild(nodeEl);
      _renderNodeFlags(n);   // boss nodes: two tier flags (+ earned stamps)
    });

    // Land any freshly-earned victory stamp (post-win return) with a thunk.
    _animatePendingStamp();

    // Place exit zones
    data.exits.forEach(function (e) {
      // Gate: skip exits with a showIf predicate that returns false (mirrors nodes).
      if (typeof e.showIf === 'function' && !e.showIf()) return;
      var exitEl = document.createElement('div');
      exitEl.className = 'overworld-exit';
      exitEl.dataset.exitId = e.id;   // for flashExit() targeting
      exitEl.style.left   = e.zone.x + '%';
      exitEl.style.top    = e.zone.y + '%';
      exitEl.style.width  = e.zone.w + '%';
      exitEl.style.height = e.zone.h + '%';
      var label = document.createElement('span');
      label.className = 'overworld-exit-label';
      label.textContent = e.label;
      exitEl.appendChild(label);
      exitEl.addEventListener('click', function () { onExitClick(e); });
      overlayEl.appendChild(exitEl);
    });

    // Re-append character last so it sits on top of all nodes/exits in DOM order
    overlayEl.appendChild(charEl);

    // Position character
    var startPos = opts.entryAt || (opts.useSaved ? currentPos : data.spawn);
    currentPos.x = startPos.x; currentPos.y = startPos.y;
    positionChar(currentPos.x, currentPos.y);
    setStanding();

    // Fog handling — first visit to a fogged map rolls fog away
    var firstVisit = visitedMaps.indexOf(mapId) === -1;
    if (data.startsFogged && firstVisit) {
      showFog(true);
      if (typeof gsap !== 'undefined') {
        gsap.to(fogEl, {
          opacity: 0, duration: 2, ease: 'power2.out',
          onComplete: function () {
            fogEl.classList.remove('active');
            fogEl.style.opacity = '';
          }
        });
      } else {
        setTimeout(function () { showFog(false); }, 2000);
      }
    } else {
      showFog(false);
    }

    // Mark visited
    if (firstVisit) {
      visitedMaps.push(mapId);
    }
    saveState();

    // Context soundtrack — this map's track (fresh start when the map changes).
    _playMapMusic();
  }

  function showFog(on) {
    fogEl.classList.toggle('active', !!on);
    if (on) fogEl.style.opacity = '1';
  }

  /* ── Node click ────────────────────────────────────────────── */
  // Focus (focus) hard gate (Stage 3, adventure-only — the overworld IS adventure
  // mode): true when the player is out of Focus and must refill via a learning
  // check before acting. Drains clamp at 0, so "=== 0" is the gate condition.
  function _focusGated() {
    return !!(window.SOG && SOG.focus && SOG.focus.get() === 0);
  }

  // Focus-gate Explorer dialogue (editable). The FIRST attempt of a gate episode
  // explains the fix; SUBSEQUENT attempts (still at 0) play the lighter nudge.
  var FOCUS_GATE_FIRST = [
    { who: 'explorer', text: "I'm losing my focus." },
    { who: 'explorer', text: 'I think I need a learning check to keep going.' }
  ];
  var FOCUS_GATE_AGAIN = [
    { who: 'explorer', text: 'That place looks so cool.' },
    { who: 'explorer', text: 'If only there was a way to restore my focus.' }
  ];

  // Blocked-action feedback: play Explorer dialogue in the HUD, then raise the
  // persistent gold halo on the learning-check (book) button. The halo IS the
  // gate-episode flag — present means "already hit the gate this episode", so the
  // FIRST hit (halo absent) plays the full explanation and the rest play the
  // shorter nudge. The HUD clears the halo once Focus rises above 0
  // (SOG.HUD.refreshFocus), which also resets the episode.
  function _showFocusGate() {
    var book = document.getElementById('adv-hud-textbook');
    var firstHit = !(book && book.classList.contains('adv-hud-textbook--halo'));
    var lines = firstHit ? FOCUS_GATE_FIRST : FOCUS_GATE_AGAIN;
    isDialogueLocked = true;
    cancelIdle();
    runDialogue(lines, function () {
      isDialogueLocked = false;
      // Raise (or keep) the pulsing halo so the player always sees the fix.
      if (window.SOG && SOG.HUD && typeof SOG.HUD.showFocusHalo === 'function') SOG.HUD.showFocusHalo();
      scheduleIdle();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DIFFICULTY-PICKER SYSTEM (boss nodes)
     ────────────────────────────────────────────────────────────────────────
     First visit to a boss node → the scripted encounter dialogue → battle at that
     node's FIRST-ENCOUNTER TIER. Every visit AFTER that first battle completes
     (win OR lose) → a Serf/Giant difficulty picker → battle at the chosen tier
     (no encounter dialogue — it's a rematch).

     "Encountered" is stamped in game.js endGame (keyed by the battle's scriptHook)
     the moment the first battle finishes, so it's outcome-agnostic and persists in
     localStorage. Here we only READ it to branch first-visit vs rematch.
  ═════════════════════════════════════════════════════════════════════════════ */

  // Boss node id → the battle's scriptHook (the key the "encountered" stamp uses).
  var BOSS_NODE_KEY = {
    'walls-of-uruk':  'gilgamesh',
    'sargon':         'sargon',
    'hammurabi':      'hammurabi',
    'hanging-gardens':'hanging-gardens',
    'double-crown':   'narmer'
  };

  // First-encounter AI tier per boss — DATA-DRIVEN (not hardcoded branch logic).
  // Every boss (Gilgamesh included) starts at 'serf' — tier and flag ALIGN, no
  // decoupling. Gilgamesh's narrative (Farmer/Cuneiform on a loss) layers on top
  // without touching tier/flag.
  var FIRST_ENCOUNTER_TIER = {
    'gilgamesh':       'serf',
    'sargon':          'serf',
    'hammurabi':       'serf',
    'hanging-gardens': 'serf',
    'narmer':          'serf'
  };
  function _firstEncounterTier(key) { return FIRST_ENCOUNTER_TIER[key] || 'serf'; }

  // Legacy per-boss flags that ALSO imply "already encountered" — so existing saves
  // (progress made before this system) route straight to the picker instead of
  // replaying the first-encounter dialogue. New completions set the canonical
  // sog_node_encountered_<key> stamp (game.js endGame); these are the fallback.
  var LEGACY_ENCOUNTERED = {
    'gilgamesh':       ['sog_battle_gilgamesh_complete', 'sog_gilgamesh_phase1_complete'],
    'sargon':          ['sog_battle_sargon_complete'],
    'hammurabi':       ['sog_battle_hammurabi_complete'],
    'hanging-gardens': ['sog_battle_nebuchadnezzar_complete'],
    'narmer':          ['sog_met_narmer']   // "met" (intro seen) — good enough to skip a replay
  };
  function _nodeEncountered(key) {
    try {
      if (localStorage.getItem('sog_node_encountered_' + key) === 'true') return true;
      var legacy = LEGACY_ENCOUNTERED[key] || [];
      for (var i = 0; i < legacy.length; i++) {
        if (localStorage.getItem(legacy[i]) === 'true') return true;
      }
    } catch (e) {}
    return false;
  }

  // Bake the AI tier for the NEXT battle (initGame reads + clears window.__forceTier)
  // then fire the node's launch. Used by both the first-encounter and picker paths.
  // Tier and flag ALIGN for every boss now — game.js defaults flagTier to ai.tier, so
  // there is no separate flag override (the old Gilgamesh decoupling is gone).
  function _launchAtTier(tier, launchFn) {
    window.__forceTier = tier;
    launchFn();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FLAG / STAMP NODE PROGRESSION
     ────────────────────────────────────────────────────────────────────────
     Every boss node shows two flags — Serf and Giant — so the player sees both
     tiers exist. Beating a tier stamps THAT tier's flag with a victory stamp;
     the two tiers are tracked INDEPENDENTLY (a Giant win via the picker stamps the
     Giant flag even if Serf is still unbeaten). game.js endGame sets
     sog_node_<hook>_<tier>_beaten on a win (keyed by scriptHook, same space as the
     encounter stamp) and stashes window.__pendingStamp for the return-to-map thunk.
  ═════════════════════════════════════════════════════════════════════════════ */

  function _tierBeaten(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; } catch (e) { return false; }
  }

  /* Serf-track forward unlock: a boss's next node opens once its SERF is beaten —
     EXCEPT Gilgamesh, whose first encounter is Giant, so his Giant win ALSO counts
     (otherwise the very first boss could soft-lock the whole track). The Giant tier
     never gates forward progress for any other boss. */
  function _bossClearedForUnlock(hook) {
    if (hook === 'gilgamesh') return _tierBeaten('gilgamesh', 'serf') || _tierBeaten('gilgamesh', 'giant');
    return _tierBeaten(hook, 'serf');
  }

  // Per-boss flag-cluster anchor nudge, in map-% units, relative to the node CENTRE
  // (the flags plant behind the node and fan out from it — see the CSS knobs on
  // .node-flags for size/spread/tilt/rise/stamp). Default 0/0 = dead-centre on the
  // node; tune per node by eye if a particular node's art wants the flags shifted.
  var FLAG_LAYOUT = {
    'walls-of-uruk':   { dx: 0, dy: -2 },   // Gilgamesh — raise both flags up 2
    'sargon':          { dx: 0, dy: 0 },
    'hammurabi':       { dx: 0, dy: 0 },
    'hanging-gardens': { dx: 0, dy: -2 },   // Nebuchadnezzar — raise both flags up 2
    'double-crown':    { dx: 0, dy: 0 }
  };

  /* Render the two flags (+ any earned stamps) for a boss node, as a cluster
     positioned at the node's map %-coords. Appended to overlayEl (NOT the node
     element) so flag sizing is independent of each node's own scale. Reuses lowercase
     GitHub-Pages-safe art paths: images/ui_images/serfflag.png, giantflag.png, victorystamp.png. */
  function _renderNodeFlags(node) {
    var hook = BOSS_NODE_KEY[node.id];
    if (!hook || !overlayEl) return;
    var lay = FLAG_LAYOUT[node.id] || { dx: 0, dy: 8 };

    var cluster = document.createElement('div');
    cluster.className = 'node-flags';
    cluster.dataset.hook = hook;
    cluster.style.left = (node.x + lay.dx) + '%';
    cluster.style.top  = (node.y + lay.dy) + '%';

    [['serf', 'serfflag.png'], ['giant', 'giantflag.png']].forEach(function (pair) {
      var tier = pair[0], art = pair[1];
      // GENERAL two-tier template: a boss's GIANT flag is hidden until the player has
      // engaged its tiers — it "appears" (pops in) on the SERF-win return, its own
      // narrative beat. Hidden only while NEITHER tier is beaten; once either is
      // stamped the Giant flag stays (covers the edge case of a Giant win reached via
      // the picker after a Serf loss — the Giant flag then shows already-stamped).
      if (tier === 'giant' && !_tierBeaten(hook, 'serf') && !_tierBeaten(hook, 'giant')) return;
      // Gilgamesh's + Narmer's SERF flags are gated on ENGAGEMENT: their nodes are
      // visible on map arrival (unlike the reveal-animated bosses), so their Serf
      // flags would otherwise pre-show. Hold each until the player has actually
      // encountered the boss (encounter start sets sog_node_encountered_<hook>),
      // where it ERECTS as its own beat. The reveal-animated bosses (Sargon /
      // Hammurabi / Hanging Gardens) erect their Serf flag with the node reveal.
      if ((hook === 'gilgamesh' || hook === 'narmer') && tier === 'serf' && !_nodeEncountered(hook)) return;
      var flag = document.createElement('div');
      flag.className = 'node-flag node-flag-' + tier;
      flag.dataset.tier = tier;

      var img = document.createElement('img');
      img.className = 'node-flag-img';
      img.src = 'images/ui_images/' + art;      // lowercase — case-sensitive on GitHub Pages
      img.alt = tier + ' flag';
      img.draggable = false;
      flag.appendChild(img);

      if (_tierBeaten(hook, tier)) {
        var stamp = document.createElement('img');
        stamp.className = 'node-flag-stamp';
        stamp.src = 'images/ui_images/victorystamp.png';
        stamp.alt = 'victory';
        stamp.draggable = false;
        flag.appendChild(stamp);
      }
      cluster.appendChild(flag);
    });
    overlayEl.appendChild(cluster);
  }

  /* Consume window.__pendingStamp (set by game.js on the winning tier) once, after a
     return-to-map render: land the freshly-earned stamp with a "thunk" — over-scale +
     slight rotation settling in — plus the stamp sfx. Subsequent renders show it
     already-stamped (no animation). Reuses GSAP + SOG.sfx. */
  function _animatePendingStamp(onComplete) {
    var p = window.__pendingStamp;
    if (!p) { if (onComplete) onComplete(); return; }
    window.__pendingStamp = null;   // one-shot
    if (!overlayEl) { if (onComplete) onComplete(); return; }
    var cluster = overlayEl.querySelector('.node-flags[data-hook="' + p.hook + '"]');
    var stamp   = cluster && cluster.querySelector('.node-flag-' + p.tier + ' .node-flag-stamp');
    if (!stamp) { if (onComplete) onComplete(); return; }
    if (window.SOG && SOG.sfx && typeof SOG.sfx.play === 'function') SOG.sfx.play('sfx/cuneiformstamp.mp3');
    if (typeof gsap !== 'undefined') {
      // Settle to the SAME per-tier rest tilt the static CSS uses (--stamp-tilt,
      // mirrored: serf +, giant −), read from the element so the CSS knob stays the
      // single source of truth. Same scale-in "thunk" + 18° over-rotation as before —
      // xPercent/yPercent keep it centred on its anchor through the scale/rotation.
      var _tilt = parseFloat(getComputedStyle(stamp).getPropertyValue('--stamp-tilt')) || 0;
      var _rest = (p.tier === 'giant') ? -_tilt : _tilt;
      gsap.fromTo(stamp,
        { xPercent: -50, yPercent: -50, scale: 2.4, rotation: _rest - 18, opacity: 0 },
        { xPercent: -50, yPercent: -50, scale: 1, rotation: _rest, opacity: 1,
          duration: 0.34, ease: 'back.out(2.4)', transformOrigin: '50% 50%',
          onComplete: onComplete });
    } else { stamp.style.opacity = '1'; if (onComplete) onComplete(); }
  }

  /* Re-render every visible boss node's flag cluster (and animate any pending stamp).
     Post-win returns re-enter the overworld WITHOUT a full loadMap (the map DOM
     persists across a battle), so the flags rendered pre-battle are stale — this
     rebuilds them so a freshly-beaten tier shows its stamp + thunk, and any node that
     just unlocked gets its flags. Idempotent: clears then rebuilds; pending is one-shot. */
  function _refreshNodeFlags(deferStamp) {
    if (!overlayEl) return;
    overlayEl.querySelectorAll('.node-flags').forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    var data = MAPS[currentMapId];
    if (!data) return;
    data.nodes.forEach(function (n) {
      if (typeof n.showIf === 'function' && !n.showIf()) return;
      _renderNodeFlags(n);
    });
    if (deferStamp) {
      // The caller drives the stamp thunk on its own timed cue (return choreography).
      // Hide the freshly-won stamp so it doesn't flash static before that thunk.
      var p = window.__pendingStamp;
      if (p) {
        var st = overlayEl.querySelector('.node-flags[data-hook="' + p.hook + '"] .node-flag-' + p.tier + ' .node-flag-stamp');
        if (st) st.style.opacity = '0';
      }
    } else {
      _animatePendingStamp();
    }
  }

  /* Serf/Giant rematch picker. Reuses the parchment BattleRulesPopup (no rebuild) —
     injects two themed .btn-snes options into its HTML body and wires them. Choosing
     one bakes the tier + launches; the X / click-outside cancels back to the map. */
  function _showDifficultyPicker(launchFn) {
    if (!(window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function')) {
      // No popup available → fail safe: just launch at Serf so the node isn't dead.
      _launchAtTier('serf', launchFn);
      return;
    }
    var chosen = null;
    SOG.BattleRulesPopup.show({
      title: 'Choose Your Challenge',
      panelClass: 'difficulty-picker-popup',   // narrower than the wide boss-rules panel
      body: '<div class="tier-picker">'
          +   '<button type="button" class="btn-snes tier-pick-btn" data-tier="serf">'
          +     '<span class="tier-pick-name">Serf</span>'
          +     '<span class="tier-pick-sub">A gentler bout</span>'
          +   '</button>'
          +   '<button type="button" class="btn-snes tier-pick-btn" data-tier="giant">'
          +     '<span class="tier-pick-name">Giant</span>'
          +     '<span class="tier-pick-sub">A true test</span>'
          +   '</button>'
          + '</div>',
      onDismiss: function () {
        if (chosen) { _launchAtTier(chosen, launchFn); }
        else { isDialogueLocked = false; scheduleIdle(); }   // cancelled → stay on the map
      }
    });
    // Wire the two option buttons (BattleRulesPopup renders body as HTML, so query
    // the live nodes and attach handlers). A pick records the tier then closes the
    // popup, and onDismiss above launches at that tier.
    var bd = document.getElementById('battle-rules-backdrop');
    if (bd) {
      var btns = bd.querySelectorAll('.tier-pick-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', (function (b) {
          return function (e) { e.stopPropagation(); chosen = b.getAttribute('data-tier'); SOG.BattleRulesPopup.hide(); };
        })(btns[i]));
      }
    }
  }

  /* Shared boss-node tier routing — uniform across ALL five bosses. The picker is
     purely a REPLAY chooser for fully-cleared bosses, never a progression gate:
       BOTH tiers beaten  → difficulty picker (the ONLY state that shows it)
       Serf beaten only   → launch the GIANT directly (no picker; the boss's
                            in-battle rematch intro plays via its onBattleStart)
       encountered only   → retry the Serf directly (no first-encounter replay)
       never encountered  → the boss's scripted first encounter (caller-supplied)
     Progression therefore flows Serf → Giant automatically; Giant-before-Serf is
     unreachable (no picker exists before both flags are stamped). A legacy save
     that beat Giant first via the old picker routes to Serf until it's cleared. */
  function _routeBossTier(hook, launchFn, firstEncounter) {
    if (_tierBeaten(hook, 'serf') && _tierBeaten(hook, 'giant')) {
      _showDifficultyPicker(launchFn);
    } else if (_tierBeaten(hook, 'serf')) {
      _launchAtTier('giant', launchFn);
    } else if (_nodeEncountered(hook)) {
      _launchAtTier('serf', launchFn);
    } else {
      firstEncounter();
    }
  }

  function onNodeClick(node) {
    if (isMoving || isTransitioning || isDialogueLocked) return;
    // Focus gate: at 0 focus, every node action (battle start, marketplace
    // entry, replays) is blocked → show the refill prompt instead. The HUD book
    // icon + the prompt's button both still open the learning check, so the
    // player can always refill and escape (anti-softlock).
    if (_focusGated()) { _showFocusGate(); return; }
    // Clicking the Prehistory node ends the urgent idle pulse if active
    clearUrgentPulse();

    // ── Walls of Uruk — Gilgamesh (difficulty-picker system) ──────────
    if (node.id === 'walls-of-uruk' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath([{ x: node.x, y: node.y }], function () {
        // Shared routing (this WAS the bespoke Gilgamesh ladder — now the rule for
        // every boss): Serf win forces the Giant rematch (dominance intro plays
        // IN-BATTLE via onBattleStart), a Serf loss retries the Serf without the
        // one-time intro, and only a FULLY-cleared boss shows the replay picker.
        _routeBossTier('gilgamesh', _launchGilgameshBattle, function () {
          // First encounter: "Welcome to my city" → a NORMAL Serf battle. Winnable;
          // a loss triggers the Farmer/Cuneiform front-half beat, then a Serf retry.
          _runGilgameshEncounter(D2B_GILGAMESH_DIALOGUE, function () {
            _launchAtTier(_firstEncounterTier('gilgamesh'), _launchGilgameshBattle);
          });
        });
      });
      return;
    }

    // ── Mesopotamian Marketplace — revisit (the first visit auto-walks via
    //    returnFromGilgameshWin). Walk to the node, then open the market. ──
    if (node.id === 'market' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        _enterMarket();
      });
      return;
    }

    // ── Egypt · River Market — walk to the node, then open the shop. Mirrors the
    //    Mesopotamia market click exactly; _enterMarket('egypt') supplies the
    //    Egypt backdrop + (TBD) inventory + trader greeting. ──
    if (node.id === 'egypt-market' && currentMapId === 'egypt') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        _enterMarket('egypt');
      });
      return;
    }

    // ── Sargon (Akkad) — Phase D4: walk to the node, then GATE on active deck
    //    size. Full deck is 15; < 15 → "come back when you're ready" (no battle,
    //    sprite stays); exactly 15 → full encounter → battle STUB. ──
    if (node.id === 'sargon' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        // Serf→Giant flows automatically; picker only once BOTH tiers are cleared.
        // Rematches skip the deck gate + encounter dialogue (as the picker did).
        _routeBossTier('sargon', _launchSargonBattle, function () {
          _runSargonEncounter(node);   // first: deck gate → encounter → battle at first tier
        });
      });
      return;
    }

    // ── Hammurabi (Babylon) — walk to the node, then GATE on active deck size
    //    (15) → full encounter → battle. Under 15 → turned away (no battle). ──
    if (node.id === 'hammurabi' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        // Serf→Giant flows automatically; picker only once BOTH tiers are cleared.
        // Rematches skip the deck gate + encounter dialogue (as the picker did).
        _routeBossTier('hammurabi', _launchHammurabiBattle, function () {
          _runHammurabiEncounter(node);   // first: deck gate → encounter → battle at first tier
        });
      });
      return;
    }

    // ── The Hanging Gardens — walk up → dialogue + knock/door sfx → radial wipe →
    //    battle STUB. Each SFX must FULLY finish before the next line / the wipe:
    //      walk → A lines → knocking.m4a (wait) → B lines → opendoor.m4a (wait) →
    //      wipe centred on the node → _launchHangingGardensBattle (stub). ─────────
    if (node.id === 'hanging-gardens' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        // Serf→Giant flows automatically; picker only once BOTH tiers are cleared.
        // Rematches skip the intro (A lines → knock → B lines → door), as before.
        _routeBossTier('hanging-gardens', _launchHangingGardensBattle, function () {
          // First encounter → the intro dialogue, then the battle at Neb's
          // first-encounter tier (Serf).
          var firstLaunch = function () { _launchAtTier(_firstEncounterTier('hanging-gardens'), _launchHangingGardensBattle); };
          var hud = window.SOG && window.SOG.HUD;
          if (!hud || typeof hud.enterDialogueMode !== 'function') {
            firstLaunch();   // no HUD → skip straight to the wipe
            return;
          }
          hud.enterDialogueMode(null, function () {
            _runLinesKeepOpen(D5_HANGING_GARDENS_CLICK_A, function () {
              // Knock — WAIT for the sound to fully finish before the next lines.
              _playSfxThen('sfx/knocking.m4a', function () {
                _runLinesKeepOpen(D5_HANGING_GARDENS_CLICK_B, function () {
                  if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
                  // Door opening — WAIT for the sound to fully finish before the wipe.
                  _playSfxThen('sfx/opendoor.m4a', function () {
                    firstLaunch();
                  });
                });
              });
            });
          });
        });
      });
      return;
    }

    // ── The Double Crown (Egypt) — walk up to the node, then the Narmer advance
    //    battle. FIRST click plays the encounter dialogue → battle at Narmer's
    //    first-encounter tier (Serf); afterwards the shared _routeBossTier rule
    //    applies (Serf → Giant automatically, picker only when fully cleared). ──
    if (node.id === 'double-crown' && currentMapId === 'egypt') {
      isDialogueLocked = true;
      cancelIdle();
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        // Serf→Giant flows automatically; picker only once BOTH tiers are cleared.
        _routeBossTier('narmer', _launchNarmerBattle, function () {
          _runNarmerEncounter(NARMER_ENCOUNTER_DIALOGUE, function () {
            _launchAtTier(_firstEncounterTier('narmer'), _launchNarmerBattle);
          });
        });
      });
      return;
    }

    // Adventure Mode handoff: the Prehistory node launches the Neanderthal
    // tutorial battle. If the player has already won it, skip the walk
    // entirely and drop straight into the gameboard (spec: "skip the
    // overworld walk, the pre-battle dialogue, the radial wipe, and
    // Lucy's tutorial coaching" once sog_battle_neanderthal_complete is set).
    var isPrehistory = node.id === 'prehistory' && currentMapId === 'eastafrica';
    var preh         = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (isPrehistory && preh && preh.isBattleComplete()) {
      log('Prehistory node clicked — battle already won, launching directly (no walk)');
      preh.startNeanderthalBattle();
      return;
    }

    // ── Egypt signpost → Otzi encounter / replay ─────────────────
    var isEgyptSignpost = node.id === 'egypt-signpost' && currentMapId === 'eastafrica';
    if (isEgyptSignpost) {
      var otziBattle = window.SOG && window.SOG.OtziBattle;
      if (otziBattle && otziBattle.isBattleComplete()) {
        // Post-victory: skip pre-battle dialogue, go straight into the battle
        walkPath(node.path || [{ x: node.x, y: node.y }], function () {
          log('Egypt signpost post-victory — launching Otzi battle directly (skip intro)');
          _fireWipeFromNode('egypt-signpost', function () {
            if (otziBattle && typeof otziBattle.start === 'function') {
              otziBattle.start();
            } else {
              _clearWipe();
            }
          });
        });
        return;
      }
      walkPath(node.path || [{ x: node.x, y: node.y }], function () {
        log('Arrived at Egypt signpost — triggering Otzi encounter');
        startOtziEncounter(node);
      });
      return;
    }

    // ── Adventure-mode Phase 2 dialogue: first click on Prehistory
    //    node runs the Explorer+Lucy exchange BEFORE walking. The
    //    intro-complete flag isn't set until Phase 2 finishes, so
    //    this condition catches exactly the first click.
    var needPhase2 = isPrehistory &&
                     localStorage.getItem(KEY_ADVENTURE_INTRO) !== 'true';

    // After-walk callback: for the Prehistory node, hand off to the
    // adventure module (which decides whether to play the intro or skip
    // it based on its own session/localStorage state). For any other
    // node (e.g. Akkad, Hammurabi's Code in Mesopotamia), just resume
    // the idle character routine — those nodes don't have battles wired
    // up yet.
    var onArrived = function () {
      if (isPrehistory && preh) {
        log('Walk to Prehistory node complete — launching Neanderthal battle');
        preh.startNeanderthalBattle();
      } else {
        scheduleIdle();
      }
    };

    var doWalk = function () {
      var path = node.path || [{ x: node.x, y: node.y }];
      walkPath(path, onArrived);
    };

    if (needPhase2) {
      log('Prehistory clicked for the first time — triggering Phase 2 before walk');
      playPhase2Then(doWalk);
    } else {
      doWalk();
    }
  }

  /* ── Exit click — walk then transition ─────────────────────── */
  function onExitClick(exit) {
    if (isMoving || isTransitioning || isDialogueLocked) return;
    // Focus gate: block map-to-map travel at 0 focus (before any walk),
    // showing the refill prompt instead.
    if (_focusGated()) { _showFocusGate(); return; }
    // The actual departure: walk (off-screen if exit.walkOff, else to walkTo),
    // then fade-transition to the target map.
    var go = function () {
      var dest = exit.walkOff
        ? { x: currentPos.x + EGYPT_WALKOFF.dx, y: currentPos.y + EGYPT_WALKOFF.dy }
        : exit.walkTo;
      walkPath([dest], function () {
        transitionToMap(exit.target, exit.entryAt);
      });
    };
    // Optional one-time pre-departure dialogue (e.g. the To Egypt goodbye).
    if (typeof exit.onBeforeExit === 'function') exit.onBeforeExit(go);
    else go();
  }

  /* ── Map transition: fade black + 'Traveling...' + swap ───── */
  function transitionToMap(targetMapId, entryAt) {
    if (isTransitioning) return;
    isTransitioning = true;
    cancelIdle();
    stopFootsteps();

    // Focus drain (Stage 1): each map-to-map trip costs 15. The isTransitioning
    // guard above makes this fire exactly once per trip.
    if (window.SOG && SOG.focus) SOG.focus.spend(15);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshFocus === 'function') SOG.HUD.refreshFocus();

    if (typeof gsap === 'undefined') {
      loadMap(targetMapId, { entryAt: entryAt });
      isTransitioning = false;
      return;
    }

    var tl = gsap.timeline({
      onComplete: function () {
        isTransitioning = false;
        // Per-map arrival sequences (each self-guards on currentMapId + its
        // one-time flag): East Africa post-Otzi dialogue, Egypt arrival, or the
        // Mesopotamia arrival sequence (which plays through to the Uruk node).
        if (maybePlayEastAfricaReturnDialogue()) return;
        if (maybePlayEgyptNodeArrival()) return;   // post-Neb "funny hat" beat — wins over the generic arrival
        if (maybePlayEgyptArrival()) return;
        if (maybePlayMesopotamiaArrival()) return;
        scheduleIdle();
      }
    });

    // Fade to black (1s)
    tl.set(transitionEl, { visibility: 'visible' })
      .to(transitionEl, { opacity: 1, duration: 1, ease: 'power2.inOut' })
      // Show "Traveling..." text briefly while black
      .to(transitionTextEl, { opacity: 1, duration: 0.3 }, '-=0.2')
      // Swap map in the middle of the black period
      .call(function () { loadMap(targetMapId, { entryAt: entryAt }); })
      .to({}, { duration: 0.5 })          // hold on black with text
      .to(transitionTextEl, { opacity: 0, duration: 0.3 })
      // Fade out black (1s)
      .to(transitionEl, { opacity: 0, duration: 1, ease: 'power2.inOut' })
      .set(transitionEl, { visibility: 'hidden' });
  }

  /* ════════════════════════════════════════════════════════════
     ADVENTURE INTRO DIALOGUE — SNES-style typewriter
     ════════════════════════════════════════════════════════════ */

  function log(step) { if (window.SOG_DEBUG) console.log('[Adventure Intro] ' + step); }

  /* ── Thin HUD delegation ──────────────────────────────────────
     All overworld dialogue now routes through SOG.HUD.
     runDialogue and _d2aRunLinesNoFade are kept as local
     helpers so call-sites throughout this file don't need
     to be restructured.                                       */

  function runDialogue(lines, onDone) {
    var hud = window.SOG && window.SOG.HUD;
    if (hud && typeof hud.runDialogue === 'function') {
      hud.runDialogue(lines, onDone);
    } else {
      // HUD not available — fall back gracefully (skip dialogue)
      log('WARNING: SOG.HUD not available, skipping dialogue');
      if (onDone) setTimeout(onDone, 0);
    }
  }

  function _runLinesKeepOpen(lines, onDone) {
    var hud = window.SOG && window.SOG.HUD;
    if (hud && typeof hud.runLines === 'function') {
      hud.runLines(lines, onDone);
    } else {
      if (onDone) setTimeout(onDone, 0);
    }
  }

  /* ── Phase 1: 3s wait → Explorer monologue ────────────────── */
  function maybePlayAdventureIntro() {
    var introDone    = localStorage.getItem(KEY_ADVENTURE_INTRO) === 'true';
    var isEastAfrica = currentMapId === 'eastafrica';

    log('check | introAlreadyDone=' + introDone + ' currentMap=' + currentMapId);

    if (introDone)     { log('SKIP: intro flag already set'); return false; }
    if (!isEastAfrica) { log('SKIP: not on East Africa'); return false; }

    isDialogueLocked = true;
    cancelIdle();
    log('Phase 1 scheduled in ' + PHASE1_WAIT_MS + 'ms (player will stand still)');
    setTimeout(function () {
      log('Phase 1 starting — fading in Explorer box');
      runDialogue(PHASE1_DIALOGUE, onPhase1End);
    }, PHASE1_WAIT_MS);

    return true;
  }

  function onPhase1End() {
    log('Phase 1 ended — unlocking movement, node becomes clickable');
    isDialogueLocked = false;
    // Flag is NOT set yet — Phase 2 still has to play on node click.
    // The Prehistory node's base CSS pulse is already active by default.
    scheduleIdle();
  }

  /* ── First return to East Africa after beating Otzi ───────────
     One-time Explorer/Hunter exchange. Fires when the player is on
     East Africa with sog_battle_otzi_complete set and the dialogue
     not yet seen. Reuses the standard dialogue runner. Returns true
     if it started the dialogue (caller then skips scheduleIdle).   */
  function maybePlayEastAfricaReturnDialogue() {
    if (isDialogueLocked) return false;
    if (currentMapId !== 'eastafrica') return false;
    try {
      if (localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) !== 'true') return false;
      if (localStorage.getItem(KEY_EASTAFRICA_POSTOTZI_DIALOGUE) === 'true') return false;
    } catch (e) { return false; }

    isDialogueLocked = true;
    cancelIdle();
    runDialogue(EASTAFRICA_POSTOTZI_DIALOGUE, function () {
      isDialogueLocked = false;
      try { localStorage.setItem(KEY_EASTAFRICA_POSTOTZI_DIALOGUE, 'true'); } catch (e) {}
      flashExit('to-egypt', 1500);   // point the player at the now-relevant exit
      scheduleIdle();
    });
    return true;
  }

  /* Briefly reveal an exit box + label (border + label), then fade back to
     hover-only. Used after arrival dialogues to point at the next exit. */
  function flashExit(exitId, durationMs) {
    if (!overlayEl) return;
    var el = overlayEl.querySelector('.overworld-exit[data-exit-id="' + exitId + '"]');
    if (!el) return;
    el.classList.add('overworld-exit--flash');
    setTimeout(function () {
      if (el) el.classList.remove('overworld-exit--flash');
    }, durationMs || 1500);
  }

  /* ── Arrival in Egypt (manual flow) ───────────────────────────
     One-time. Places the Umm el-Qaab decoration + plays the Egypt
     dialogue, then STOPS (no auto walk-off). Flashes the To Mesopotamia
     box so the player knows where to go, then waits for their click.    */
  function maybePlayEgyptArrival() {
    if (isDialogueLocked) return false;
    if (currentMapId !== 'egypt') return false;
    try { if (localStorage.getItem(KEY_EGYPT_ARRIVAL) === 'true') return false; } catch (e) { return false; }

    isDialogueLocked = true;
    cancelIdle();
    // The Egypt topography props (incl. Umm el-Qaab) are placed by loadMap's
    // gated group when the Egypt map loads — no per-arrival placement needed.
    runDialogue(D1_SCENE2_DIALOGUE, function () {
      isDialogueLocked = false;
      try { localStorage.setItem(KEY_EGYPT_ARRIVAL, 'true'); } catch (e) {}
      flashExit('to-mesopotamia', 1500);
      scheduleIdle();
    });
    return true;
  }

  /* ── Egypt arrival with the Double Crown node LIVE (post-Neb) ──
     One-time "funny hat" beat. Fires when the player reaches Egypt while
     sog_egypt_node_live is set, then leaves control to the player (the live
     Double Crown node renders via loadMap's showIf). Gated once via
     KEY_EGYPT_NODE_ARRIVAL; the flag is set at the END so an interrupted beat
     replays. Runs BEFORE the generic Egypt arrival so the node-live beat wins. */
  function maybePlayEgyptNodeArrival() {
    if (isDialogueLocked) return false;
    if (currentMapId !== 'egypt') return false;
    try {
      if (localStorage.getItem(KEY_EGYPT_NODE_LIVE) !== 'true') return false;
      if (localStorage.getItem(KEY_EGYPT_NODE_ARRIVAL) === 'true') return false;
    } catch (e) { return false; }

    isDialogueLocked = true;
    cancelIdle();
    runDialogue(EGYPT_NODE_ARRIVAL_DIALOGUE, function () {
      isDialogueLocked = false;
      try { localStorage.setItem(KEY_EGYPT_NODE_ARRIVAL, 'true'); } catch (e) {}
      scheduleIdle();
    });
    return true;
  }

  /* ── Arrival in Mesopotamia (manual flow) ─────────────────────
     One-time. Plays the short arrival dialogue then runs the full D2a
     sequence (river walk → farming dialectic → Walls of Uruk node
     appears), which sets sog_mesopotamia_arrival_complete at its end.    */
  function maybePlayMesopotamiaArrival() {
    if (isDialogueLocked) return false;
    if (currentMapId !== 'mesopotamia') return false;
    try { if (localStorage.getItem(KEY_MESOPOTAMIA_ARRIVAL) === 'true') return false; } catch (e) { return false; }

    isDialogueLocked = true;
    cancelIdle();
    // Keep the lock through D1 Scene 3 into _d2aSequence, which unlocks the
    // player and sets the arrival-complete flag at its own end.
    runDialogue(D1_SCENE3_DIALOGUE, function () {
      _d2aSequence();
    });
    return true;
  }

  /* ── Post-Otzi return to the overworld (player stays on East Africa) ──
     Called by sog-adventure-otzi.js after an Otzi win. The battle return uses
     showScreen (not a map transition), so re-render East Africa in place — this
     paints the victory checkmark on the signpost node AND the now-unlocked
     To Egypt box (both gated on sog_battle_otzi_complete) — then play the
     one-time return dialogue. The player navigates to Egypt manually.         */
  function returnToEastAfricaAfterOtzi() {
    // Fresh-page-load guard (see resumeAfterBattle): without the DOM bound, the
    // loadMap below throws on mapImgEl. init() binds it (and loads East Africa,
    // which the explicit loadMap then re-applies with the saved position).
    if (!mapImgEl) init();
    loadMap('eastafrica', { useSaved: true });
    if (!maybePlayEastAfricaReturnDialogue()) scheduleIdle();
  }

  /* ── Phase 2: Explorer + Lucy exchange (on Prehistory click) ─ */
  function playPhase2Then(onFullyDone) {
    if (isDialogueLocked) { log('Phase 2 requested while dialogue active — ignoring'); return; }
    log('Phase 2 starting');
    isDialogueLocked = true;
    cancelIdle();
    runDialogue(PHASE2_DIALOGUE, function () {
      log('Phase 2 ended');
      isDialogueLocked = false;
      localStorage.setItem(KEY_ADVENTURE_INTRO, 'true');
      log('sog_adventure_intro_complete set to true');
      if (onFullyDone) onFullyDone();
    });
  }

  /* ── Post-victory overworld sequence ────────────────────────
     Called by SOG.Adventure.Prehistory's exitBattleToOverworld()
     after a Neanderthal win.  Gated by localStorage so it only
     runs once.  Runs the 8-line dialogue, then triggers the Lucy
     card-acquisition reveal via the shared component in
     sog-adventure-prehistory.js.                               */
  function startPostVictorySequence() {
    try {
      if (localStorage.getItem(KEY_POST_NEANDERTHAL_DIALOGUE) === 'true') return;
    } catch (e) {}

    isDialogueLocked = true;
    cancelIdle();

    // Lucy's goodbye plays in two halves around her card-acquisition reveal:
    // A (…"Take this.") → grant → B ("Your card?" … "I will be there.") → complete.
    runDialogue(POST_NEANDERTHAL_DIALOGUE, function () {
      var lucyCard = (typeof CARDS !== 'undefined') &&
                     CARDS.find(function (c) { return c.id === 33; });
      var preh = window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory;
      var afterGrant = function () {
        runDialogue(POST_NEANDERTHAL_DIALOGUE_B, function () {
          isDialogueLocked = false;
          _completePostVictorySequence();
        });
      };
      if (lucyCard && preh && typeof preh.showCardAcquisition === 'function') {
        preh.showCardAcquisition(lucyCard, null, afterGrant);
      } else {
        afterGrant();
      }
    });
  }

  function _completePostVictorySequence() {
    try { localStorage.setItem(KEY_POST_NEANDERTHAL_DIALOGUE, 'true'); } catch (e) {}
    try { localStorage.setItem(KEY_CARD_LUCY_UNLOCKED, 'true'); } catch (e) {}
    // Single source of truth: also record Lucy (33) in the player collection
    // (the standalone narrative flag stays as-is).
    if (window.SOG && SOG.collection && typeof SOG.collection.unlockCard === 'function') {
      SOG.collection.unlockCard(33);
    }
    // Signpost is now revealed — reload the node layer so it appears.
    // We only re-place nodes (not exits/character) to avoid resetting position.
    _refreshNodes();
    log('[PostVictory] complete — Lucy card unlocked, Egypt signpost revealed');
    scheduleIdle();
  }

  /* ════════════════════════════════════════════════════════════
     PHASE D1 — Otzi → Mesopotamia travel sequence
     ════════════════════════════════════════════════════════════
     Called by sog-adventure-otzi.js after the player wins the Otzi
     battle and clicks "Back to Map" for the first time (i.e. when
     sog_mesopotamia_arrival_complete is not yet set).

     Three scenes separated by "Traveling…" loading-screen transitions:
       Scene 1: East Africa  — Hunter + Explorer, 12 lines, then walk-off right
       Travel 1: East Africa → Egypt   (existing transitionToMap pattern)
       Scene 2: Egypt        — Hunter + Explorer, 11 lines + ummelqaab decoration, walk-off right
       Travel 2: Egypt → Mesopotamia
       Scene 3: Mesopotamia  — Hunter + Explorer, 5 lines, phase complete

     Sets sog_mesopotamia_arrival_complete = 'true' on completion.
     TODO (future phase): add re-entry behaviour when the player returns to East
     Africa after Mesopotamia arrival is already complete.                     */
  function startMesopotamiaArrival() {
    log('[D1] Starting Otzi→Mesopotamia transition sequence');

    isDialogueLocked = true;
    cancelIdle();

    // Apply the victory checkmark to the egypt-signpost node in-place
    // (the node DOM is already rendered since the player was just on East Africa).
    var nodeEl = overlayEl && overlayEl.querySelector('[data-id="egypt-signpost"]');
    if (nodeEl) nodeEl.classList.add('overworld-node-complete');

    // Place Explorer at the egypt-signpost node position — that's where she was
    // standing when the Otzi encounter was triggered (the walk-to-node path ends
    // at the node coords). Falls back to spawn if the node data is somehow absent.
    var _signpost = null;
    MAPS.eastafrica.nodes.forEach(function (n) { if (n.id === 'egypt-signpost') _signpost = n; });
    currentPos.x = _signpost ? _signpost.x : MAPS.eastafrica.spawn.x;
    currentPos.y = _signpost ? _signpost.y : MAPS.eastafrica.spawn.y;
    positionChar(currentPos.x, currentPos.y);
    setStanding();

    // === SCENE 1: East Africa ===
    runDialogue(D1_SCENE1_DIALOGUE, function () {
      // After "Let's go!" — Explorer walks off the right edge
      walkPath([{ x: currentPos.x + EGYPT_WALKOFF.dx, y: currentPos.y + EGYPT_WALKOFF.dy }], function () {
        // Travel transition 1: East Africa → Egypt
        _d1TravelTo('egypt', { x: 10, y: 85 }, function () {
          // === SCENE 2: Egypt ===
          // Egypt topography props (incl. Umm el-Qaab) are placed by loadMap's
          // gated group when the Egypt map loaded above — they stay on screen
          // through the walk-off and are cleared when loadMap swaps to the
          // Mesopotamia map below.
          runDialogue(D1_SCENE2_DIALOGUE, function () {
            // Explorer walks off the right edge.
            walkPath([{ x: 115, y: currentPos.y }], function () {
              // Travel transition 2: Egypt → Mesopotamia
              _d1TravelTo('mesopotamia', { x: 10, y: 85 }, function () {
                // === SCENE 3: Mesopotamia ===
                runDialogue(D1_SCENE3_DIALOGUE, function () {
                  // D1 Scene 3 done — continue immediately into D2a river walk.
                  // sog_mesopotamia_arrival_complete is set at the END of D2a.
                  _d2aSequence();
                });
              });
            });
          });
        });
      });
    });
  }

  /* ── Egypt early-settlement topography props (decorative, pre-Neb only) ──────
     Four non-interactive decorations on the Egypt map showing EARLY Egypt:
     simple settlements that exist UNTIL Nebuchadnezzar is beaten, then vanish
     (the dynastic era begins; advanced replacements come later). Placed by
     _placeEgyptProps() on every Egypt map load, behind the nodes/character.
     Inverse gating of the Narmer/Double-Crown node (which appears WHEN Neb is
     beaten) — these disappear when he is.

     ░░ FINE-TUNING ░░ Each prop's position is leftPct / topPct (percent of the
     map, same coordinate system as node x/y) plus a per-prop scale knob.
     Eyeball egyptz.jpeg (1380×800) and nudge. Reference geography: the Nile
     DELTA is the green northern fan (top-left of the map); the river runs
     down/south from it. "sides of the Nile" = west (lower left%) vs east
     (higher left%) banks; "below the delta starts" = just south of the fan. */
  var TOPO_PATH = 'images/metaworld/topography/';
  // Per-prop knobs — all freely editable: leftPct / topPct (map %, anchors the
  // prop's CENTER), scale, and rotation (degrees, applied around the center via
  // transform-origin:center, so rotation is predictable). Because rotation is
  // center-based, a rotated prop's visual footprint may shift slightly from its
  // left/top anchor — re-nudge leftPct/topPct if needed.
  var EGYPT_TOPO_PROPS = [
    // Umm el-Qaab necropolis — the original prop, now part of the gated group.
    { src: 'ummelqaab@0.25x.png', leftPct: 28, topPct: 87, scale: 0.35,  rotation:  0 },
    // River hut — ONE, in the delta (northern fan). Nudged up 2 / right 2 (matches ADV).
    { src: 'riverhut.png',        leftPct: 29, topPct: 18, scale: 0.21,  rotation:  -3 },
    // Granary — ONE, just south of where the delta starts.
    { src: 'granary.png',         leftPct: 27, topPct: 46, scale: 0.29,  rotation:   0 },
    // Mud huts — settlements dotted along the Nile, spread apart (not adjacent).
    { src: 'mudhut.png',          leftPct: 16, topPct: 24, scale: 0.20,  rotation: 20 },  // north (delta) — up 2 / left 2 (matches ADV)
    { src: 'mudhut.png',          leftPct: 21, topPct: 57, scale: 0.20,  rotation: 20 },  // west bank
    { src: 'mudhut.png',          leftPct: 29, topPct: 66, scale: 0.20,  rotation: 40 }   // east bank
  ];

  /* POST-Neb "advanced" settlement group — shown AFTER Nebuchadnezzar is beaten
     (KEY_EGYPT_NODE_LIVE set), replacing the early props above. Same positions /
     scale / rotation as the pre-Neb props, but the advanced (adv*) art and NO
     Umm el-Qaab. Same editable knobs. */
  var EGYPT_TOPO_PROPS_ADV = [
    // NOTE: the advanced RIVER HUT that used to sit at 29/18 is deliberately gone —
    // the clickable River Market NODE now occupies that spot (see the 'egypt-market'
    // node in MAPS.egypt, placed at the same 29/18). Both the ADV prop group and the
    // market node are gated on KEY_EGYPT_NODE_LIVE, so the swap is exact: pre-Neb the
    // player sees the humble riverhut.png scenery, post-Neb it becomes the market they
    // can walk into. Restore the prop here only if the market node moves elsewhere.
    // Granary (advanced) — just south of where the delta starts.
    { src: 'advgranary.png',      leftPct: 27, topPct: 46, scale: 0.26,  rotation:   0 },
    // Mud huts (advanced) — settlements dotted along the Nile.
    { src: 'advmudhouse3@0.25x.png', leftPct: 17, topPct: 24, scale: 0.30,  rotation: 20 },   // north (delta) — up 2 / left 2
    { src: 'advmudhouse3@0.25x.png', leftPct: 22, topPct: 57, scale: 0.30,  rotation: 20 },   // west bank
    { src: 'advmudhouse3@0.25x.png', leftPct: 27, topPct: 66, scale: 0.30,  rotation: -15, flipX: true }   // east bank — mirrored H
  ];

  /* Render the gated Egypt topography group. Decorative + non-interactive
     (pointer-events:none), sitting BEHIND the nodes/character. Clears any prior
     props, then renders ONLY on the Egypt map, choosing the set by progress:
     pre-Neb → early settlements (EGYPT_TOPO_PROPS); post-Neb (KEY_EGYPT_NODE_LIVE
     set) → the advanced settlements (EGYPT_TOPO_PROPS_ADV). Called from loadMap on
     every map entry, so the set is re-checked on each Egypt visit — robust for
     both fresh saves and already-beaten-Neb saves. */
  function _placeEgyptProps() {
    if (!overlayEl) return;
    // Always clear first (defensive — loadMap also wipes the overlay).
    overlayEl.querySelectorAll('.egypt-topo-prop').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    if (currentMapId !== 'egypt') return;                 // Egypt map only
    var nebBeaten = false;
    try { nebBeaten = localStorage.getItem(KEY_EGYPT_NODE_LIVE) === 'true'; } catch (e) {}
    // Pre-Neb: early settlements. Post-Neb: the advanced (adv*) settlements.
    var props = nebBeaten ? EGYPT_TOPO_PROPS_ADV : EGYPT_TOPO_PROPS;

    props.forEach(function (p) {
      var el = document.createElement('img');
      el.className = 'egypt-topo-prop';
      el.src = TOPO_PATH + p.src;
      el.alt = '';
      el.draggable = false;
      // flipX / flipY mirror the prop via a signed scale on that axis.
      var sx = p.scale * (p.flipX ? -1 : 1);
      var sy = p.scale * (p.flipY ? -1 : 1);
      el.style.cssText = [
        'position:absolute',
        'left:' + p.leftPct + '%',
        'top:'  + p.topPct  + '%',
        'transform:translate(-50%,-50%) rotate(' + (p.rotation || 0) + 'deg) scale(' + sx + ',' + sy + ')',
        'transform-origin:center center',
        'pointer-events:none',
        'user-select:none'
      ].join(';');
      // Prepend so the props paint at the BACK (behind nodes + character),
      // regardless of when this runs relative to node placement.
      overlayEl.insertBefore(el, overlayEl.firstChild);
    });
  }

  /* Map-swap with "Traveling…" loading screen — mirrors transitionToMap()
     but accepts an onComplete callback so the D1 sequence can chain scenes. */
  function _d1TravelTo(targetMapId, entryAt, onComplete) {
    if (isTransitioning) { if (onComplete) setTimeout(onComplete, 0); return; }
    isTransitioning = true;
    cancelIdle();
    stopFootsteps();

    if (typeof gsap === 'undefined') {
      loadMap(targetMapId, { entryAt: entryAt });
      isTransitioning = false;
      if (onComplete) onComplete();
      return;
    }

    var tl = gsap.timeline({
      onComplete: function () {
        isTransitioning = false;
        if (onComplete) onComplete();
      }
    });

    // Identical timing to transitionToMap: fade-in 1s, hold 0.5s, fade-out 1s
    tl.set(transitionEl, { visibility: 'visible' })
      .to(transitionEl, { opacity: 1, duration: 1, ease: 'power2.inOut' })
      .to(transitionTextEl, { opacity: 1, duration: 0.3 }, '-=0.2')
      .call(function () { loadMap(targetMapId, { entryAt: entryAt }); })
      .to({}, { duration: 0.5 })
      .to(transitionTextEl, { opacity: 0, duration: 0.3 })
      .to(transitionEl, { opacity: 0, duration: 1, ease: 'power2.inOut' })
      .set(transitionEl, { visibility: 'hidden' });
  }

  /* ════════════════════════════════════════════════════════════
     PHASE D2a — Mesopotamia extended arrival
     ════════════════════════════════════════════════════════════
     Continues directly after D1 Scene 3 ("It looks so green.").
     Flow:
       1. Explorer walks east to a stop between the two rivers
       2. Hunter: "I feel different…" (box stays visible)
       3. Hunter portrait crossfades → Farmer portrait (~800ms)
       4. Farming dialectic (8 click-to-advance lines)
       5. After line 8 — Walls of Uruk node fades in (~1s)
       6. "Cities!" + "Bye!" → Farmer portrait fades out
       7. "Lets go check out that city!" → all boxes fade out
       8. sog_mesopotamia_arrival_complete = 'true', player unlocked
     ════════════════════════════════════════════════════════════ */

  /* River-walk stop: central between the Tigris and Euphrates on the
     Mesopotamia map. Chosen to clear the southwest exit zone
     (x:0-20, y:70-100) and the existing nodes (Akkad 42,52; Hammurabi
     58,60) while leaving the Walls of Uruk node (40,72) unobscured. */
  var D2A_RIVER_STOP = { x: 66, y: 65 };

  function _d2aSequence() {
    log('[D2a] River walk beginning');
    walkPath([D2A_RIVER_STOP], function () {
      log('[D2a] Explorer at river stop — entering dialogue mode for full D2a sequence');
      var hud = window.SOG && window.SOG.HUD;
      if (!hud) { log('[D2a] HUD unavailable — skipping'); isDialogueLocked = false; scheduleIdle(); return; }

      hud.enterDialogueMode(null, function () {
        // Hunter "I feel different…" — HUD stays open for crossfade next
        _runLinesKeepOpen([{ who: 'hunter', text: 'I feel different…' }], function () {
          // Portrait crossfade: Hunter → Farmer (~800ms, NPC slot stays visible)
          hud.swapNpcPortrait({ character: 'farmer', transitionMs: 800, grow: true, sfx: 'sfx/transform.m4a' }, function () {
            log('[D2a] Hunter→Farmer transformation complete — starting farming dialectic');
            _runLinesKeepOpen(D2A_FARMING_DIALOGUE, function () {
              // After last farming line — fade in Walls of Uruk node
              _d2aFadeInUrukNode(function () {
                _d2aClosingSequence(hud);
              });
            });
          });
        });
      });
    });
  }

  /* Fade in the Walls of Uruk node element on the current map overlay.
     The node is inserted before charEl so the Explorer sprite stays on top.
     Position: x:72%, y:82% — deep south of Mesopotamia, below the Explorer spawn. */
  function _d2aFadeInUrukNode(onDone) {
    if (!overlayEl) { if (onDone) onDone(); return; }

    // Don't duplicate if already present (e.g. reload guard)
    if (overlayEl.querySelector('[data-id="walls-of-uruk"]')) {
      if (onDone) onDone();
      return;
    }

    var nodeEl = document.createElement('div');
    nodeEl.className = 'overworld-node';
    nodeEl.dataset.id = 'walls-of-uruk';
    nodeEl.style.left = '72%';
    nodeEl.style.top  = '82%';
    // Resting transform is translate(-50%,-50%) scale(1.35). When GSAP is present
    // the entrance below animates into that; otherwise set it directly (fallback).
    if (typeof gsap === 'undefined') nodeEl.style.transform = 'translate(-50%,-50%) scale(1.35)';

    var img = document.createElement('img');
    img.src = NODE_PATH + 'wallsofuruk@0.33x.png';
    img.alt = 'Walls of Uruk';
    img.draggable = false;
    nodeEl.appendChild(img);

    // Wire click to the same node data used by onNodeClick
    var nodeData = null;
    var mesNodes = MAPS.mesopotamia && MAPS.mesopotamia.nodes;
    if (mesNodes) {
      for (var ni = 0; ni < mesNodes.length; ni++) {
        if (mesNodes[ni].id === 'walls-of-uruk') { nodeData = mesNodes[ni]; break; }
      }
    }
    if (nodeData) {
      nodeEl.addEventListener('click', (function (nd) {
        return function () { onNodeClick(nd); };
      })(nodeData));
    }

    nodeEl.style.opacity = '0';
    // Insert before charEl so Explorer sprite paints above the node
    overlayEl.insertBefore(nodeEl, charEl);

    if (typeof gsap !== 'undefined') {
      // Entrance: starts at DOUBLE size (scale 2.7 = 1.35×2), raised up, then
      // FALLS DOWN and settles to its normal position/scale, playing uruk.mp3 as
      // it lands. xPercent/yPercent keep it centred on the 72%/82% point (the
      // translate(-50%,-50%) equivalent), so the final state is the resting one.
      // Tuning knobs: fallDistance (y:-110), fall duration (0.7s), start scale (2.7).
      gsap.set(nodeEl, { xPercent: -50, yPercent: -50, transformOrigin: '50% 50%' });
      gsap.fromTo(nodeEl,
        { opacity: 0, scale: 2.7, y: -110 },
        { opacity: 1, scale: 1.35, y: 0, duration: 0.7, ease: 'power2.in',
          onComplete: function () {
            log('[D2a] Walls of Uruk node dropped in');
            // Hold the Explorer's next line until BOTH the landing animation AND the
            // impact sfx have COMPLETELY finished — otherwise "Cities!" talks over them.
            var done = false;
            function proceed() { if (done) return; done = true; if (onDone) onDone(); }
            var settleDone = false, sfxDone = false;
            function maybeProceed() { if (settleDone && sfxDone) proceed(); }
            // Squash-settle on landing — wait for it to complete.
            gsap.fromTo(nodeEl, { scale: 1.55 },
              { scale: 1.35, duration: 0.22, ease: 'power2.out',
                onComplete: function () { settleDone = true; maybeProceed(); } });
            // Impact sfx — wait for the audio to fully end. Graceful fallbacks so a
            // blocked/erroring play() can't stall the arrival sequence.
            var sfx = null;
            try { sfx = new Audio('sfx/uruk.mp3'); if (sfx) sfx.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1; } catch (e) {}
            if (sfx) {
              sfx.addEventListener('ended', function () { sfxDone = true; maybeProceed(); });
              sfx.addEventListener('error', function () { sfxDone = true; maybeProceed(); });
              var pp = sfx.play();
              if (pp && pp.catch) pp.catch(function () { sfxDone = true; maybeProceed(); });
            } else { sfxDone = true; }
            maybeProceed();
            // Safety cap: never hang the sequence if 'ended' never fires (e.g. blocked autoplay).
            setTimeout(proceed, 7000);
          }
        });
    } else {
      nodeEl.style.opacity = '1';
      if (onDone) setTimeout(onDone, 0);
    }
  }

  /* Closing sequence: "Cities!" + Farmer departure + Explorer's final line. */
  function _d2aClosingSequence(hud) {
    hud = hud || (window.SOG && window.SOG.HUD);
    if (!hud) { isDialogueLocked = false; scheduleIdle(); return; }

    // "Cities!" and "Bye!" — Farmer still visible
    _runLinesKeepOpen([
      { who: 'explorer', text: "Leapin' llamas..." },
      { who: 'explorer', text: 'Did you just create a city?!' },
      { who: 'farmer',   text: 'I am but a humble farmer who needs to tend his land.' },
      { who: 'farmer',   text: 'So long.' }
    ], function () {
      // Farmer slides down — NPC gone, but dialogue mode stays active
      hud.slideOutNpc(function () {
        // Explorer delivers the final line alone
        _runLinesKeepOpen([
          { who: 'explorer', text: 'Wow, a real ancient city...' },
          { who: 'explorer', text: 'Maybe somebody there will help me get home.' },
          { who: 'explorer', text: "Let's go check it out!" }
        ], function () {
          // Exit dialogue mode (fades back to resting state)
          hud.exitDialogueMode(function () {
            try { localStorage.setItem(KEY_MESOPOTAMIA_ARRIVAL, 'true'); } catch (e) {}
            isDialogueLocked = false;
            log('[D2a] Complete — sog_mesopotamia_arrival_complete set, player unlocked');
            scheduleIdle();
          });
        });
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     PHASE D2b — Gilgamesh encounter
     ════════════════════════════════════════════════════════════
     Flow:
       1. Explorer walks to the Walls of Uruk node (72, 82)
       2. 300 ms settle
       3. Gilgamesh portrait slides up, 7-line encounter dialogue
       4. After "You will be." is dismissed: skip HUD exit animation,
          fire radial wipe + whoosh straight into battle
       5. SOG.GilgameshBattle.start()
     ════════════════════════════════════════════════════════════ */

  /* ── Phase D2c helpers ─────────────────────────────────────────── */

  /* ── Iris primitive (#adv-radial-wipe) ───────────────────────────
     Shared close: grows the black clip-circle to cover the screen and
     calls onClosed() at full black. Reused by _d2cIris and the candle
     transition below. */
  function _irisClose(onClosed) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    var cx = 50, cy = 50;
    var maxR = Math.max(window.innerWidth, window.innerHeight) * 1.4;
    if (typeof gsap === 'undefined' || !wipeEl) { if (onClosed) onClosed(); return; }
    wipeEl.style.opacity  = '1';
    wipeEl.style.clipPath = 'circle(0px at ' + cx + '% ' + cy + '%)';
    wipeEl.classList.add('active');
    var proxy = { r: 0 };
    gsap.to(proxy, {
      r: maxR, duration: 0.7, ease: 'power2.inOut',
      onUpdate: function () { wipeEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + cx + '% ' + cy + '%)'; },
      onComplete: function () { if (onClosed) onClosed(); }
    });
  }

  /* Iris transition: close → onClosed(reveal) at full black → reveal reopens
     and calls onOpened(). (D2c primitive; retained for reuse.) */
  function _d2cIris(onClosed, onOpened) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    var cx = 50, cy = 50;
    var maxR = Math.max(window.innerWidth, window.innerHeight) * 1.4;

    function reveal() {
      if (typeof gsap === 'undefined' || !wipeEl) { _clearWipe(); if (onOpened) onOpened(); return; }
      var p = { r: maxR };
      gsap.to(p, {
        r: 0, duration: 0.7, ease: 'power2.inOut', delay: 0.2,
        onUpdate: function () { wipeEl.style.clipPath = 'circle(' + p.r + 'px at ' + cx + '% ' + cy + '%)'; },
        onComplete: function () { _clearWipe(); if (onOpened) onOpened(); }
      });
    }

    if (typeof gsap === 'undefined' || !wipeEl) {
      if (onClosed) onClosed(function () { if (onOpened) onOpened(); });
      else if (onOpened) onOpened();
      return;
    }
    _irisClose(function () {
      if (onClosed) onClosed(reveal);
      else reveal();
    });
  }

  /* Candle-color ramp for the transition: white → warm yellow → orange →
     orange-red as t goes 0→1. Returns [r,g,b]. */
  function _candleColor(t) {
    var stops = [
      [0.00, 255, 255, 255],   // bright white
      [0.35, 255, 228, 150],   // warm yellow
      [0.70, 255, 150,  70],   // orange
      [1.00, 255,  95,  45]    // orange-red
    ];
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        var f = (t - a[0]) / (b[0] - a[0]);
        return [
          Math.round(a[1] + (b[1] - a[1]) * f),
          Math.round(a[2] + (b[2] - a[2]) * f),
          Math.round(a[3] + (b[3] - a[3]) * f)
        ];
      }
    }
    return [255, 95, 45];
  }

  /* Persistent dark-room + candle-glow backdrop shown for the whole Farmer
     conversation. z 100 keeps it below the HUD (150) and grant reveals
     (5000+) but above the overworld map (30), so the room reads as candlelit
     while the dialogue plays on top. Opaque (dark edges) so the map stays
     hidden. Removed by _removeCandleBackdrop() when the deck builder opens. */
  function _ensureCandleBackdrop() {
    var bg = document.getElementById('adv-candle-bg');
    if (bg) return bg;
    bg = document.createElement('div');
    bg.id = 'adv-candle-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:100;pointer-events:none;';
    var c    = _candleColor(1);
    var core = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    var mid  = 'rgb(' + Math.round(c[0] * 0.6) + ',' + Math.round(c[1] * 0.28) + ',' + Math.round(c[2] * 0.12) + ')';
    // Fully OPAQUE — a candle glow over BLACK, not the map tinted warm. The
    // overworld stays hidden for the whole conversation.
    bg.style.background =
      'radial-gradient(circle at 50% 48%, ' + core + ' 0%, ' + mid + ' 18%, rgb(28,12,4) 40%, #000 72%)';
    // Inside #sog-stage (transformed stacking context) at z 100 — below the
    // HUD (150) and grant reveals (5000+), above the overworld map (30).
    (document.getElementById('sog-stage') || document.body).appendChild(bg);
    return bg;
  }

  function _removeCandleBackdrop() {
    var bg = document.getElementById('adv-candle-bg');
    if (bg && bg.parentNode) bg.parentNode.removeChild(bg);
    var c = document.getElementById('adv-candle');
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }

  /* Gently fade the candlelit room (flame + dark backdrop) out so the
     overworld board behind it fades back in, then remove the layers. */
  function _fadeOutCandleBackdrop(cb) {
    var targets = ['adv-candle-bg', 'adv-candle']
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!targets.length || !window.gsap) { _removeCandleBackdrop(); if (cb) cb(); return; }
    gsap.to(targets, {
      opacity: 0, duration: 0.6, ease: 'power1.out',
      onComplete: function () { _removeCandleBackdrop(); if (cb) cb(); }
    });
  }

  /* Standalone Cuneiform candle for the Gilgamesh post-loss intervention
     (sog-adventure-gilgamesh.js drives it via window.Overworld). It's decoupled
     from the overworld iris/wipe: the caller has
     ALREADY faded the screen to black, so we just strike the match, bloom the
     flame, and hand off to the persistent candlelit backdrop (z 100, below the
     HUD 150) that carries the Farmer conversation. onLit() fires once the flame
     has settled and the backdrop is up. Reuses _candleColor + _ensureCandleBackdrop
     so the flame visual lives in exactly one place; pair with the exported
     fadeOutCuneiformCandle() to dismiss it. */
  function _runCuneiformCandle(onLit) {
    SOG.sfx.play('sfx/matchstrike.m4a');

    var existing = document.getElementById('adv-candle');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var candle = document.createElement('div');
    candle.id = 'adv-candle';
    candle.style.cssText = 'position:fixed;inset:0;z-index:10002;pointer-events:none;opacity:0;';
    (document.getElementById('sog-stage') || document.body).appendChild(candle);

    function setGlow(t, sizePct) {
      var c    = _candleColor(t);
      var core = 'rgb('  + c[0] + ',' + c[1] + ',' + c[2] + ')';
      var warm = 'rgba(' + c[0] + ',' + Math.round(c[1] * 0.5) + ',' + Math.round(c[2] * 0.3) + ',0.55)';
      candle.style.background =
        'radial-gradient(circle at 50% 48%, ' + core + ' 0%, ' + warm + ' ' + sizePct + '%, transparent ' + (sizePct * 2.2) + '%)';
    }

    setGlow(0, 5);
    if (typeof gsap === 'undefined') {
      _ensureCandleBackdrop();
      if (candle.parentNode) candle.parentNode.removeChild(candle);
      if (onLit) onLit();
      return;
    }
    gsap.to(candle, { opacity: 1, duration: 0.4, ease: 'power1.out' });
    var p = { t: 0, size: 5 };
    gsap.to(p, {
      t: 1, size: 24, duration: 2.6, ease: 'power1.inOut',
      onUpdate: function () { setGlow(p.t, p.size); }
    });
    gsap.delayedCall(3.1, function () {
      _ensureCandleBackdrop();
      if (onLit) onLit();
      gsap.to(candle, {
        opacity: 0, duration: 0.6, ease: 'power1.inOut',
        onComplete: function () { if (candle.parentNode) candle.parentNode.removeChild(candle); }
      });
    });
  }

  /* Grant a single card: unlock (idempotent) + card-acquisition reveal that
     auto-dismisses after ~1.5s (player can still click early). */
  function _d2cGrantCard(id, cb) {
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      SOG.Cards.unlock(id);   // locked:false + persist to sog_unlocked_cards
    }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === id; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (cb) cb(); },
                               { autoDismissMs: D2C_AUTO_DISMISS_MS });
    } else {
      if (cb) cb();
    }
  }

  /* Grant several cards back-to-back (the Soldier/Scribe/Priest cluster):
     each auto-shows ~1.5s, dismisses, then the next appears immediately. */
  function _d2cGrantCards(ids, cb) {
    var i = 0;
    (function next() {
      if (i >= ids.length) { if (cb) cb(); return; }
      _d2cGrantCard(ids[i++], next);
    })();
  }

  /* Full Farmer return sequence: candle transition (portrait swap behind the
     black hold) → dialogue with the 5 interleaved card grants → sets the
     starter-granted flag. */
  /* ── Phase D3a — Gilgamesh encounter + battle launch ─────────────── */

  /* Run a Gilgamesh/Explorer encounter exchange via the HUD, then onDone. */
  function _runGilgameshEncounter(lines, onDone) {
    var hud = window.SOG && window.SOG.HUD;
    if (!hud || typeof hud.enterDialogueMode !== 'function') { if (onDone) onDone(); return; }
    // Mark Gilgamesh ENGAGED at the encounter start (not just at battle end) and reveal
    // his Serf flag now — it's held off the map until this beat (see _renderNodeFlags's
    // gilgamesh serf gate), so it appears as the walk-up conversation begins.
    try { localStorage.setItem('sog_node_encountered_gilgamesh', 'true'); } catch (e) {}
    _refreshNodeFlags();
    // Erect the just-rendered Serf flag (planted-pole reveal) as the conversation begins.
    _erectSerfFlagFor('gilgamesh');
    hud.enterDialogueMode(null, function () {
      _runLinesKeepOpen(lines, function () {
        try { localStorage.setItem(KEY_MET_GILGAMESH, 'true'); } catch (e) {}
        if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
        if (onDone) onDone();
      });
    });
  }

  /* Narmer (Egypt) encounter — mirrors _runGilgameshEncounter. Sets KEY_MET_NARMER
     on completion so later Double Crown clicks skip straight into the battle. */
  function _runNarmerEncounter(lines, onDone) {
    var hud = window.SOG && window.SOG.HUD;
    if (!hud || typeof hud.enterDialogueMode !== 'function') { if (onDone) onDone(); return; }
    // Mark Narmer ENGAGED at the encounter start and reveal his Serf flag now — it's
    // held off the map until this beat (see _renderNodeFlags's engagement gate), so
    // it ERECTS as the walk-up conversation begins (mirrors Gilgamesh).
    try { localStorage.setItem('sog_node_encountered_narmer', 'true'); } catch (e) {}
    _refreshNodeFlags();
    _erectSerfFlagFor('narmer');
    hud.enterDialogueMode(null, function () {
      _runLinesKeepOpen(lines, function () {
        try { localStorage.setItem(KEY_MET_NARMER, 'true'); } catch (e) {}
        if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
        if (onDone) onDone();
      });
    });
  }

  /* First-market interstitial — one-time, fired from _exitMarket on the FIRST market
     return (post-Serf-win shopping). Sargon does NOT appear here; the only forward path
     is back to Gilgamesh for the Giant rematch. Gated so it plays exactly once. */
  function _maybePlayFirstMarketInterstitial(done) {
    var already = false;
    try { already = localStorage.getItem(KEY_FIRST_MARKET_INTERSTITIAL) === 'true'; } catch (e) {}
    if (already) { if (done) done(); return; }
    try { localStorage.setItem(KEY_FIRST_MARKET_INTERSTITIAL, 'true'); } catch (e) {}
    isDialogueLocked = true;
    cancelIdle();
    runDialogue(D4_FIRST_MARKET_INTERSTITIAL, function () {
      isDialogueLocked = false;
      if (done) done();
    });
  }

  /* ── Phase D4 — Sargon node reveal (dust storm) ──────────────────────────
     One-time, fired from returnFromGilgameshWin AFTER the Gilgamesh GIANT rematch win
     (moved here from the first-market return — the player can't enter Sargon until they
     have 15 cards, so the node shouldn't tease before the Giant is even beaten).
     Sequence: Explorer "can't wait" → sargonintro.mp3 + a swirling dust storm at the
     Sargon node's spot that dissipates to uncover the node (fades in) → Explorer
     "mysterious / go check it out" → set the flag so the node persists / never replays. */
  function _maybeRevealSargonNode(done) {
    var already = false;
    try { already = localStorage.getItem(KEY_SARGON_NODE_REVEALED) === 'true'; } catch (e) {}
    if (already || currentMapId !== 'mesopotamia') { if (done) done(); return; }

    isDialogueLocked = true;
    cancelIdle();
    runDialogue(D4_SARGON_REVEAL_INTRO, function () {
      // HUD closed → the map is visible for the storm. Fade the map music out
      // ENTIRELY so the storm (sargonintro.mp3) plays against silence, then fade
      // it back in once the reveal animation is done.
      if (window.SOG && SOG.music && typeof SOG.music.fadeOutAndStop === 'function') {
        SOG.music.fadeOutAndStop(600);
      }
      _dustStormRevealSargon(function () {
        _playMapMusic();   // reveal done → fade the map music back in
        // Set the revealed flag BEFORE refreshing (the node's showIf reads it —
        // without it the flag cluster won't render), then plant the Serf flag as
        // its own beat before the Explorer's outro reaction.
        try { localStorage.setItem(KEY_SARGON_NODE_REVEALED, 'true'); } catch (e) {}
        _refreshNodeFlags();   // give the freshly-revealed Sargon node its flags
        _erectSerfFlagFor('sargon', function () {
          runDialogue(D4_SARGON_REVEAL_OUTRO, function () {
            isDialogueLocked = false;
            if (done) done();
          });
        });
      });
    });
  }

  /* Dust-storm reveal: play the sfx, spawn swirling sand particles at the Sargon
     node's % position, fade the node in mid-storm, then let the storm dissipate.
     Self-cleaning (particle layer removed at the end). Mirrors _d2aFadeInUrukNode's
     node-element creation, but with a fade-in instead of a drop-in. */
  /* Run cb only once the audio element has finished playing. Resolves on the
     'ended' event, with a duration-based (or capped) fallback in case 'ended'
     never fires (load error / blocked autoplay). */
  function _afterAudioEnds(audio, cb) {
    if (!audio) { if (cb) cb(); return; }
    var done = false;
    var fin  = function () { if (done) return; done = true; if (cb) cb(); };
    if (audio.ended) { fin(); return; }
    audio.addEventListener('ended', fin, { once: true });
    var remainMs = (isFinite(audio.duration) && audio.duration > 0)
      ? Math.max(0, (audio.duration - audio.currentTime) * 1000) + 150
      : 8000;   // fallback cap when duration is unknown
    setTimeout(fin, remainMs);
  }

  /* Play a one-shot sfx and run cb only once it has FULLY finished (via
     _afterAudioEnds' 'ended' event + fallback cap). Used to gate a dialogue/
     transition on a sound completing. If the audio can't be created/played, cb
     runs immediately so the sequence can never stall. */
  function _playSfxThen(src, cb) {
    var audio = null;
    try { audio = new Audio(src); audio.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1; audio.play(); } catch (e) { audio = null; }
    _afterAudioEnds(audio, cb);
  }

  function _dustStormRevealSargon(onDone) {
    var node = _findMesoNode('sargon');
    if (!overlayEl || !node) { if (onDone) onDone(); return; }

    var introAudio = null;
    try { introAudio = new Audio('sfx/sargonintro.mp3'); introAudio.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1; introAudio.play(); } catch (e) {}

    // 1) Build (or find) the Sargon node element, hidden, ready to fade in.
    var nodeEl = overlayEl.querySelector('[data-id="sargon"]');
    if (!nodeEl) {
      nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = 'sargon';
      nodeEl.style.left = node.x + '%';
      nodeEl.style.top  = node.y + '%';
      nodeEl.style.transform = 'translate(-50%,-50%) scale(' + (node.scale || 1) + ')';
      var img = document.createElement('img');
      img.src = NODE_PATH + 'sargonshadow.png';
      img.alt = node.name || 'Akkad';
      img.draggable = false;
      nodeEl.appendChild(img);
      nodeEl.addEventListener('click', (function (nd) {
        return function () { onNodeClick(nd); };
      })(node));
      overlayEl.insertBefore(nodeEl, charEl);   // under the Explorer sprite
    }
    nodeEl.style.opacity = '0';

    // 2) Dust-storm particle layer at the node's position.
    var storm = document.createElement('div');
    storm.className = 'sargon-duststorm';
    storm.style.left = node.x + '%';
    storm.style.top  = node.y + '%';
    var GRAINS = 26;
    for (var i = 0; i < GRAINS; i++) {
      var g = document.createElement('span');
      g.className = 'sargon-duststorm-grain';
      var ang  = (Math.random() * 360);
      var dist = 26 + Math.random() * 44;          // px swirl radius
      var dur  = 0.9 + Math.random() * 0.7;        // s
      var delay = Math.random() * 0.5;             // s stagger
      var size = 3 + Math.random() * 5;            // px
      g.style.setProperty('--ang',  ang + 'deg');
      g.style.setProperty('--dist', dist + 'px');
      g.style.setProperty('--dur',  dur.toFixed(2) + 's');
      g.style.setProperty('--delay', delay.toFixed(2) + 's');
      g.style.width = g.style.height = size.toFixed(1) + 'px';
      storm.appendChild(g);
    }
    overlayEl.insertBefore(storm, charEl);

    // 3) Mid-storm: fade the node in (flourish kept). Over the LENGTH OF THE SFX,
    //    the node also GROWS to 3x its resting size then SHRINKS back to its spot —
    //    centred so it swells in place. End: remove the storm, finish.
    var STORM_MS   = 1700;
    var REST_SCALE = (node.scale || 1);
    var SFX_MS     = (introAudio && isFinite(introAudio.duration) && introAudio.duration > 0)
      ? introAudio.duration * 1000
      : 7372;   // sargonintro.mp3 length (fallback when duration isn't known yet)
    if (typeof gsap !== 'undefined') {
      gsap.to(nodeEl, { opacity: 1, duration: 0.8, delay: 0.6, ease: 'power1.out' });
      // Grow → shrink across the intro SFX, anchored on the node's centre/spot.
      gsap.set(nodeEl, { xPercent: -50, yPercent: -50, transformOrigin: '50% 50%', scale: REST_SCALE });
      var halfS = (SFX_MS / 1000) / 2;
      gsap.timeline()
        .to(nodeEl, { scale: REST_SCALE * 3, duration: halfS, ease: 'sine.inOut' })
        .to(nodeEl, { scale: REST_SCALE,     duration: halfS, ease: 'sine.inOut' });
    } else {
      setTimeout(function () { nodeEl.style.opacity = '1'; }, 600);
    }
    setTimeout(function () {
      if (storm.parentNode) storm.parentNode.removeChild(storm);
      nodeEl.style.opacity = '1';
      log('[D4] Sargon node dust-revealed');
      // Let the intro SFX fully finish before the Explorer's outro line.
      _afterAudioEnds(introAudio, function () { if (onDone) onDone(); });
    }, STORM_MS);
  }

  /* ── Phase D4+ — Hammurabi node reveal (rises from the dirt) ──────────────
     One-time, fired on the first overworld return AFTER defeating Sargon
     (Overworld.returnFromSargonWin). Plays earthspell.mp3 + a dirt-clod burst at
     the node's spot while the node rises out of the ground, then sets the flag so
     it persists and never replays. */
  function _maybeRevealHammurabiNode(done) {
    var already = false;
    try { already = localStorage.getItem(KEY_HAMMURABI_NODE_REVEALED) === 'true'; } catch (e) {}
    if (already || currentMapId !== 'mesopotamia') { if (done) done(); return; }
    _earthRiseRevealHammurabi(function () {
      try { localStorage.setItem(KEY_HAMMURABI_NODE_REVEALED, 'true'); } catch (e) {}
      _refreshNodeFlags();   // give the freshly-revealed Hammurabi node its flags
      _erectSerfFlagFor('hammurabi', done);   // planted-pole reveal, then continue
    });
  }

  /* Earth-rise reveal: play the sfx, kick up a burst of dirt clods at the node's
     % position, and rise the node up out of the ground (with a small settle pop).
     Self-cleaning (dirt layer removed at the end). Mirrors _dustStormRevealSargon's
     node-element creation, but rises from below instead of fading in. */
  function _earthRiseRevealHammurabi(onDone) {
    var node = _findMesoNode('hammurabi');
    if (!overlayEl || !node) { if (onDone) onDone(); return; }

    var riseAudio = null;
    try { riseAudio = new Audio('sfx/earthspell.mp3'); riseAudio.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1; riseAudio.play(); } catch (e) {}

    // 1) Build (or find) the Hammurabi node element, hidden, ready to rise.
    var nodeEl = overlayEl.querySelector('[data-id="hammurabi"]');
    if (!nodeEl) {
      nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = 'hammurabi';
      nodeEl.style.left = node.x + '%';
      nodeEl.style.top  = node.y + '%';
      nodeEl.style.transform = 'translate(-50%,-50%) scale(' + (node.scale || 1) + ')';
      var img = document.createElement('img');
      img.src = NODE_PATH + 'hammurabinode.png';
      img.alt = node.name || 'Babylon';
      img.draggable = false;
      nodeEl.appendChild(img);
      nodeEl.addEventListener('click', (function (nd) {
        return function () { onNodeClick(nd); };
      })(node));
      overlayEl.insertBefore(nodeEl, charEl);   // under the Explorer sprite
    }
    nodeEl.style.opacity = '0';

    // 2) Dirt-clod burst layer at the node's position.
    var dirt = document.createElement('div');
    dirt.className = 'hammurabi-dirt';
    dirt.style.left = node.x + '%';
    dirt.style.top  = node.y + '%';
    var CLODS = 24;
    for (var i = 0; i < CLODS; i++) {
      var c = document.createElement('span');
      c.className = 'hammurabi-dirt-grain';
      var spread = (Math.random() - 0.5) * 96;       // px horizontal scatter
      var peak   = -(22 + Math.random() * 40);       // px up at the arc's peak
      var dur    = 0.7 + Math.random() * 0.5;        // s
      var delay  = Math.random() * 0.22;             // s stagger
      var size   = 4 + Math.random() * 6;            // px
      var rot    = (Math.random() * 220) | 0;
      c.style.setProperty('--dx',  spread.toFixed(1) + 'px');
      c.style.setProperty('--dy',  peak.toFixed(1) + 'px');
      c.style.setProperty('--dur', dur.toFixed(2) + 's');
      c.style.setProperty('--delay', delay.toFixed(2) + 's');
      c.style.setProperty('--rot', rot + 'deg');
      c.style.width = c.style.height = size.toFixed(1) + 'px';
      dirt.appendChild(c);
    }
    overlayEl.insertBefore(dirt, charEl);

    // 3) Rise the node up out of the ground (slight delay so the dirt erupts
    //    first), with a small back-out settle. End: remove dirt, finish.
    var RISE_MS = 1850;   // a touch slower so the reveal doesn't rush by
    if (typeof gsap !== 'undefined') {
      gsap.set(nodeEl, { xPercent: -50, yPercent: -50, scale: node.scale || 1, transformOrigin: '50% 100%' });
      gsap.fromTo(nodeEl,
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.25, delay: 0.3, ease: 'back.out(1.3)' });
    } else {
      setTimeout(function () { nodeEl.style.opacity = '1'; }, 300);
    }
    setTimeout(function () {
      if (dirt.parentNode) dirt.parentNode.removeChild(dirt);
      nodeEl.style.opacity = '1';
      log('[D4] Hammurabi node earth-revealed');
      // Let the earth-rise sfx fully finish before the Explorer's reflection line
      // (mirrors the Sargon reveal), so the dialogue never talks over it.
      _afterAudioEnds(riseAudio, function () { if (onDone) onDone(); });
    }, RISE_MS);
  }

  /* ── Phase D5 — Hanging Gardens node reveal (magical sparkle/shimmer) ──────
     One-time, fired on the first overworld return AFTER defeating Hammurabi (see
     resumeAfterBattle's catch-up). Bookended like the Sargon reveal: REFLECT lines
     → magicshimmer + the node sparkle-fades in → REACTION lines → set the flag so
     it persists and never replays. */
  function _maybeRevealHangingGardensNode(done) {
    var already = false;
    try { already = localStorage.getItem(KEY_HANGING_GARDENS_REVEALED) === 'true'; } catch (e) {}
    if (already || currentMapId !== 'mesopotamia') { if (done) done(); return; }

    cancelIdle();
    runDialogue(D5_HANGING_GARDENS_REFLECT, function () {
      _shimmerRevealHangingGardens(function () {
        // Plant the Serf flag as its own beat right after the shimmer, BEFORE the
        // reaction lines (revealed flag must be set first — the node's showIf reads it).
        try { localStorage.setItem(KEY_HANGING_GARDENS_REVEALED, 'true'); } catch (e) {}
        _refreshNodeFlags();   // give the freshly-revealed Hanging Gardens node its flags
        _erectSerfFlagFor('hanging-gardens', function () {
          runDialogue(D5_HANGING_GARDENS_REACTION, function () {
            if (done) done();
          });
        });
      });
    });
  }

  /* Sparkle reveal: play magicshimmer, scatter twinkling sparkles at the node's
     % position, and FADE the node in with a soft magical glow. Distinct from the
     Sargon dust-storm and Hammurabi earth-rise — a gentle wonder-of-the-world
     shimmer. Self-cleaning (sparkle layer removed at the end). Mirrors the other
     two reveals' node-element creation. */
  function _shimmerRevealHangingGardens(onDone) {
    var node = _findMesoNode('hanging-gardens');
    if (!overlayEl || !node) { if (onDone) onDone(); return; }

    SOG.sfx.play('sfx/magicshimmer.m4a');

    // 1) Build (or find) the Hanging Gardens node element, hidden, ready to fade in.
    var nodeEl = overlayEl.querySelector('[data-id="hanging-gardens"]');
    if (!nodeEl) {
      nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = 'hanging-gardens';
      nodeEl.style.left = node.x + '%';
      nodeEl.style.top  = node.y + '%';
      nodeEl.style.transform = 'translate(-50%,-50%) scale(' + (node.scale || 1) + ')';
      var img = document.createElement('img');
      img.src = NODE_PATH + 'hanginggardens@0.33x.png';
      img.alt = node.name || 'The Hanging Gardens';
      img.draggable = false;
      nodeEl.appendChild(img);
      nodeEl.addEventListener('click', (function (nd) {
        return function () { onNodeClick(nd); };
      })(node));
      overlayEl.insertBefore(nodeEl, charEl);   // under the Explorer sprite
    }
    nodeEl.style.opacity = '0';

    // 2) Sparkle particle layer at the node's position (twinkle in → drift → fade).
    var sparkle = document.createElement('div');
    sparkle.className = 'hanging-gardens-sparkle';
    sparkle.style.left = node.x + '%';
    sparkle.style.top  = node.y + '%';
    var SPARKS = 32;
    for (var i = 0; i < SPARKS; i++) {
      var s = document.createElement('span');
      s.className = 'hanging-gardens-sparkle-grain';
      var sx   = (Math.random() - 0.5) * 160;        // px horizontal spread around the node
      var sy   = (Math.random() - 0.5) * 120;        // px vertical spread
      var dur  = 0.8 + Math.random() * 0.9;          // s twinkle
      var delay = Math.random() * 1.2;               // s stagger across the reveal
      var size = 5 + Math.random() * 9;              // px
      s.style.setProperty('--sx', sx.toFixed(1) + 'px');
      s.style.setProperty('--sy', sy.toFixed(1) + 'px');
      s.style.setProperty('--dur', dur.toFixed(2) + 's');
      s.style.setProperty('--delay', delay.toFixed(2) + 's');
      s.style.width = s.style.height = size.toFixed(1) + 'px';
      sparkle.appendChild(s);
    }
    overlayEl.insertBefore(sparkle, charEl);

    // 3) Soft magical fade-in + glow, then clean up the sparkles and finish.
    var SHIMMER_MS = 2100;
    if (typeof gsap !== 'undefined') {
      gsap.set(nodeEl, { xPercent: -50, yPercent: -50, scale: node.scale || 1, transformOrigin: '50% 50%' });
      nodeEl.classList.add('hanging-gardens-reveal-glow');           // CSS pulse-glow (filter only)
      gsap.fromTo(nodeEl, { opacity: 0 }, { opacity: 1, duration: 1.4, delay: 0.35, ease: 'sine.out' });
    } else {
      setTimeout(function () { nodeEl.style.opacity = '1'; }, 350);
    }
    setTimeout(function () {
      if (sparkle.parentNode) sparkle.parentNode.removeChild(sparkle);
      nodeEl.style.opacity = '1';
      nodeEl.classList.remove('hanging-gardens-reveal-glow');
      log('[D5] Hanging Gardens node sparkle-revealed');
      if (onDone) onDone();
    }, SHIMMER_MS);
  }

  /* ── Sargon node click → DECK-SIZE GATE ──────────────────────────────────
     Read the ACTIVE deck's card count (window.Decks). Full deck = 15. Under 15
     → Sargon turns the Explorer away (portrait slides out before the closing
     Explorer line), no battle, sprite stays on the map. Exactly 15 → the full
     Emperor encounter, then the battle STUB. */
  function _runSargonEncounter(node) {
    // Rematch (already encountered) is handled at the node-click level by the
    // difficulty picker — this runner only fires for the FIRST encounter, so no
    // "already-beaten" skip here.
    var hud = window.SOG && window.SOG.HUD;
    if (!hud || typeof hud.enterDialogueMode !== 'function') { isDialogueLocked = false; scheduleIdle(); return; }

    var full = 15, deckSize = 0;
    try {
      if (window.Decks) {
        full     = window.Decks.DECK_SIZE || 15;
        deckSize = (typeof window.Decks.getActiveCards === 'function')
          ? window.Decks.getActiveCards().length : 0;
      }
    } catch (e) {}
    log('[D4] Sargon clicked — active deck ' + deckSize + '/' + full);

    if (deckSize < full) {
      // NOT ready — turned away. Sargon talks, his portrait leaves, then the
      // Explorer gets one closing line; no battle, return to idle on the map.
      hud.enterDialogueMode(null, function () {
        _runLinesKeepOpen(D4_SARGON_TURNED_AWAY_A, function () {
          var afterSlide = function () {
            _runLinesKeepOpen(D4_SARGON_TURNED_AWAY_B, function () {
              if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
              isDialogueLocked = false;
              scheduleIdle();
            });
          };
          if (typeof hud.slideOutNpc === 'function') hud.slideOutNpc(afterSlide);
          else afterSlide();
        });
      });
      return;
    }

    // READY (15) — full encounter, then the battle at Sargon's first-encounter tier (Serf).
    hud.enterDialogueMode(null, function () {
      _runLinesKeepOpen(D4_SARGON_ENCOUNTER, function () {
        if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
        _launchAtTier(_firstEncounterTier('sargon'), _launchSargonBattle);
      });
    });
  }

  /* STUB — the real Sargon battle is not built yet. Reached only when the active
     deck has the full 15 cards and the encounter dialogue completes. Returns the
     player to the overworld idle. Replace this with the Sargon battle launch. */
  function _launchSargonBattle() {
    _fireWipeFromNode('sargon', function () {
      var sb = window.SOG && window.SOG.SargonBattle;
      if (sb && typeof sb.start === 'function') {
        sb.start();   // start() does showScreen('screen-battle') + initGame + fade the wipe out
      } else {
        console.warn('[Overworld] SOG.SargonBattle not found — aborting');
        _clearWipe();
        isDialogueLocked = false;
        scheduleIdle();
      }
    });
  }

  /* ── Hammurabi (Babylon) node click → DECK-SIZE GATE ─────────────────────
     Mirrors the Sargon encounter: full deck (15) → the Hammurabi encounter, then
     the battle; under 15 → turned away (no battle), sprite stays on the map. */
  function _runHammurabiEncounter(node) {
    var hud = window.SOG && window.SOG.HUD;
    if (!hud || typeof hud.enterDialogueMode !== 'function') { isDialogueLocked = false; scheduleIdle(); return; }

    // Rematch (already encountered) is handled at the node-click level by the
    // difficulty picker — this runner only fires for the FIRST encounter.
    var full = 15, deckSize = 0;
    try {
      if (window.Decks) {
        full     = window.Decks.DECK_SIZE || 15;
        deckSize = (typeof window.Decks.getActiveCards === 'function')
          ? window.Decks.getActiveCards().length : 0;
      }
    } catch (e) {}
    log('[D4] Hammurabi clicked — active deck ' + deckSize + '/' + full);

    if (deckSize < full) {
      // NOT ready — turned away. Hammurabi talks, his portrait leaves, then the
      // Explorer gets one closing line; no battle, return to idle on the map.
      hud.enterDialogueMode(null, function () {
        _runLinesKeepOpen(D4_HAMMURABI_TURNED_AWAY_A, function () {
          var afterSlide = function () {
            _runLinesKeepOpen(D4_HAMMURABI_TURNED_AWAY_B, function () {
              if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
              isDialogueLocked = false;
              scheduleIdle();
            });
          };
          if (typeof hud.slideOutNpc === 'function') hud.slideOutNpc(afterSlide);
          else afterSlide();
        });
      });
      return;
    }

    // READY (15) — full encounter, then the battle at Hammurabi's first-encounter tier (Serf).
    hud.enterDialogueMode(null, function () {
      _runLinesKeepOpen(D4_HAMMURABI_ENCOUNTER, function () {
        if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
        _launchAtTier(_firstEncounterTier('hammurabi'), _launchHammurabiBattle);
      });
    });
  }

  /* Fire the radial wipe from the node, then start the Hammurabi battle. The
     battle module isn't built yet — fall back to the map until SOG.HammurabiBattle
     exists (mirrors how the Sargon launch was a stub before its battle landed). */
  function _launchHammurabiBattle() {
    _fireWipeFromNode('hammurabi', function () {
      var hb = window.SOG && window.SOG.HammurabiBattle;
      if (hb && typeof hb.start === 'function') {
        hb.start();
      } else {
        console.warn('[Overworld] SOG.HammurabiBattle not found — battle not built yet');
        _clearWipe();
        isDialogueLocked = false;
        scheduleIdle();
      }
    });
  }

  /* Fire the radial wipe from the Hanging Gardens node, then start its battle. The
     battle module isn't built yet → this lands on a STUB: fall back to the map until
     SOG.HangingGardensBattle exists (mirrors the Sargon/Hammurabi pre-battle stubs). */
  function _launchHangingGardensBattle() {
    _fireWipeFromNode('hanging-gardens', function () {
      var gb = window.SOG && window.SOG.HangingGardensBattle;
      if (gb && typeof gb.start === 'function') {
        gb.start();
      } else {
        // TODO (Hanging Gardens battle): not built yet. Graceful no-op back to idle.
        console.warn('[Overworld] SOG.HangingGardensBattle not found — battle not built yet (STUB)');
        _clearWipe();
        isDialogueLocked = false;
        scheduleIdle();
      }
    });
  }

  /* Narmer Battle — fire the radial wipe from the Double Crown node, then start
     the advance-board battle (Stage 1/2 built: SOG.NarmerBattle). Mirrors
     _launchHammurabiBattle. Graceful fallback to idle if the module is missing.
     The battle's script (scriptHook 'narmer') fades the wipe cover out in
     onBattleStart to reveal the board. */
  function _launchNarmerBattle() {
    _fireWipeFromNode('double-crown', function () {
      var nb = window.SOG && window.SOG.NarmerBattle;
      if (nb && typeof nb.start === 'function') {
        nb.start();
      } else {
        console.warn('[Overworld] SOG.NarmerBattle not found — battle not built yet');
        _clearWipe();
        isDialogueLocked = false;
        scheduleIdle();
      }
    });
  }

  /* Fire the radial wipe from the node, then start the real Gilgamesh battle. */
  function _launchGilgameshBattle() {
    _fireWipeFromNode('walls-of-uruk', function () {
      var gb = window.SOG && window.SOG.GilgameshBattle;
      if (gb && typeof gb.start === 'function') {
        gb.start();   // start() does showScreen('screen-battle') + fadeOutCover
      } else {
        console.warn('[Overworld] SOG.GilgameshBattle not found — aborting');
        _clearWipe();
        isDialogueLocked = false;
        scheduleIdle();
      }
    });
  }

  function _findMesoNode(id) {
    var found = null;
    MAPS.mesopotamia.nodes.forEach(function (n) { if (n.id === id) found = n; });
    return found;
  }

  /* Post-Gilgamesh-win return, called by the battle module after the win
     dialogue + Gilgamesh-card grant. The battle module has faded to black and
     switched to the overworld screen; we land the Explorer at the Uruk node on
     the (still-loaded) Mesopotamia map, reveal the now-unlocked market node, fade
     the black out via onMapShown, then hand control back. The market node sits
     there clickable — the player walks into it on their own when ready. */
  function returnFromGilgameshWin(onMapShown) {
    // A battle launched on a FRESH page load (dev-panel launch) never initialized
    // the overworld — DOM refs unbound, currentMapId at its boot default — so the
    // loadMap below would throw on mapImgEl. init() binds the DOM and restores the
    // saved map/position. Same guard as resumeAfterBattle.
    if (!mapImgEl) init();
    isDialogueLocked = true;
    isTransitioning  = false;

    // The player came from Mesopotamia, so its map DOM is intact behind the
    // battle screen; make sure it's the current map (defensive).
    if (currentMapId !== 'mesopotamia') loadMap('mesopotamia', {});
    _playMapMusic();   // resume the overworld track (covers the path that skips loadMap)
    _refreshNodeFlags(true);   // render flags with the just-won stamp DEFERRED (the timed choreo thunks it)

    // First-win only: _refreshNodeFlags just rendered Gilgamesh's GIANT flag for the
    // first time (his Serf flag is now beaten). Hide it so it can ERECT as its own beat,
    // after the Serf stamp lands (shared with every boss's Serf-win return).
    var giantFlagEl = _consumePendingFlagReveal();

    // Land at the Uruk node.
    var uruk = _findMesoNode('walls-of-uruk');
    if (uruk) {
      currentPos.x = uruk.x; currentPos.y = uruk.y;
      positionChar(uruk.x, uruk.y);
      setStanding();
    }

    // Re-render nodes — the market node now passes its showIf (Gilgamesh beaten).
    // Start it hidden so it can fade in AFTER the map is revealed.
    _refreshNodes();
    var marketEl = overlayEl && overlayEl.querySelector('[data-id="market"]');
    if (marketEl) marketEl.style.opacity = '0';

    // Reveal the map + Uruk (battle module fades its black cover out).
    if (onMapShown) onMapShown();

    // Fade the market node in, then hand control back. The node is revealed but the
    // player walks into it on their own — clicking opens the market (trader intro
    // still plays on their first actual entry, gated on KEY_MARKET_INTRO_SEEN).
    var revealMarket = function () {
      if (marketEl) {
        if (typeof gsap !== 'undefined') gsap.to(marketEl, { opacity: 1, duration: 0.6, ease: 'power1.out' });
        else marketEl.style.opacity = '1';
      }
      try { localStorage.setItem(KEY_MARKET_FIRST_VISIT, 'true'); } catch (e) {}
      // GIANT rematch win → NOW dust-reveal the Sargon node (moved here from the first
      // market return). The Serf/fluke win (Giant not beaten yet) just hands control
      // back — Sargon stays hidden until the Giant is beaten.
      if (_tierBeaten('gilgamesh', 'giant')) {
        _maybeRevealSargonNode(function () { isDialogueLocked = false; scheduleIdle(); });
      } else {
        isDialogueLocked = false;
        scheduleIdle();
      }
    };

    // Flag choreography (AFTER the map is shown): 300ms → thunk the just-won stamp
    // (Serf on the first win / Giant on the rematch) → on a Serf win, 200ms → erect the
    // Giant flag → then reveal the market. See _playReturnFlagAnim.
    _playReturnFlagAnim(giantFlagEl, revealMarket);
  }

  /* Shared two-tier helper: consume the one-shot window.__pendingFlagReveal a boss's
     Serf-win sequence set ({ hook, tier:'giant' }). _refreshNodeFlags has just rendered
     the newly-visible Giant flag; hide it immediately and return the element so the
     caller can _erectFlagIn() it as its own beat. Returns null when nothing is pending. */
  function _consumePendingFlagReveal() {
    var fr = window.__pendingFlagReveal;
    window.__pendingFlagReveal = null;
    if (!fr || !overlayEl) return null;
    var cluster = overlayEl.querySelector('.node-flags[data-hook="' + fr.hook + '"]');
    var el = cluster && cluster.querySelector('.node-flag-' + fr.tier);
    if (el) el.style.opacity = '0';
    return el;
  }

  /* ── Flag "erected" reveal — editable knobs (tune by eye) ────────────────────
     The reveal reads as PLANTED: a pole rises straight up from its base, then
     pivots over to its resting tilt with a settling overshoot ("up, then over,
     settle"). Two phases, both anchored at the pole base (bottom-centre, sunk
     behind the node). The stamp "thunk" is separate/unchanged. */
  var FLAG_ERECT = {
    riseDur:        0.90,   // s  — PHASE 1: vertical rise duration
    riseEase:       'back.out(1.4)', // rise ease; back.out(1.x) adds a tiny peak overshoot ('power3.out' = none)
    pivotDur:       1.20,   // s  — PHASE 2: tilt-to-angle duration
    pivotOvershoot: 2.4,    // GSAP back.out strength on the pivot settle (higher = tilts further PAST, then back)
    overlap:        0.15,   // s  — pivot starts this long BEFORE the rise ends (keep small so phases stay legible)
    origin:         '50% 100%',   // pole base — both the rise (scaleY) and the pivot (rotation) hinge here
    // SFX (SOG.sfx named one-shots — obey Master/SFX volume + mute; null = silent):
    thudSfx:   'flagThud',  // pole PLANTING — fires at thudAtSec into the erect timeline
    flapSfx:   'flagFlap',  // flag BENDING/settling — fires at flapAtSec into the timeline
    thudAtSec: 0,           // s — thud trigger time (0 = the instant the rise starts)
    flapAtSec: null         // s — flap trigger time; null = AUTO-sync to the pivot start
                            //     (riseDur - overlap = 0.45s). Set a number to nudge by ear.
  };

  /* The flag's resting rotation (deg) — read from its computed CSS matrix so the
     pivot lands EXACTLY on whatever --flag-tilt / per-node --*-rot resolves to. */
  function _flagRestAngle(flagEl) {
    try {
      var t = getComputedStyle(flagEl).transform;
      var m = t && t.match(/matrix\(([^)]+)\)/);
      if (!m) return 0;
      var p = m[1].split(',').map(parseFloat);   // a,b,c,d,e,f
      return Math.atan2(p[1], p[0]) * 180 / Math.PI;
    } catch (e) { return 0; }
  }

  /* Erect a freshly-revealed flag (Serf at encounter-start, Giant after the Serf win).
     Animates the flag IMAGE — the .node-flag container keeps its positioning+tilt CSS,
     so the img COUNTER-rotates by -restAngle to read vertical during the rise, then
     rotates back to 0 (net = the resting tilt) with overshoot. Origin = pole base. */
  function _erectFlagIn(flagEl, onComplete) {
    if (!flagEl) { if (onComplete) onComplete(); return; }
    flagEl.style.opacity = '1';                 // container was hidden by the caller
    var img = flagEl.querySelector('.node-flag-img');
    if (!img || typeof gsap === 'undefined') { if (onComplete) onComplete(); return; }

    var rest = _flagRestAngle(flagEl);          // resting tilt in the flag's own frame
    // Start collapsed at the base + counter-rotated to VERTICAL (net angle 0), transparent.
    gsap.set(img, { scaleY: 0, rotation: -rest, opacity: 0, transformOrigin: FLAG_ERECT.origin });
    // On finish, WIPE all GSAP inline props so the img returns to its EXACT pristine CSS
    // state (size/position/rotation) — guarantees the rest pose matches what's established.
    var tl = gsap.timeline({ onComplete: function () { gsap.set(img, { clearProps: 'all' }); if (onComplete) onComplete(); } });
    // PHASE 1 — ERECT: rise straight up (scaleY 0→1) + fade in; rotation held vertical.
    tl.to(img, { scaleY: 1, opacity: 1, duration: FLAG_ERECT.riseDur, ease: FLAG_ERECT.riseEase });
    // PHASE 2 — PIVOT: tilt over to the resting angle (rotation −rest → 0 = net rest) with
    // a settling overshoot, starting slightly before the rise finishes.
    var pivotStart = Math.max(0, FLAG_ERECT.riseDur - FLAG_ERECT.overlap);
    tl.to(img, { rotation: 0, duration: FLAG_ERECT.pivotDur, ease: 'back.out(' + FLAG_ERECT.pivotOvershoot + ')' },
          pivotStart);
    // SFX ride the SAME timeline positions as the motion, so sound stays synced to
    // what's on screen: thud as the pole plants, flap as the bend begins.
    var _sfxOK = window.SOG && SOG.sfx && typeof SOG.sfx.playNamed === 'function';
    if (_sfxOK && FLAG_ERECT.thudSfx) {
      tl.call(function () { SOG.sfx.playNamed(FLAG_ERECT.thudSfx); }, null, FLAG_ERECT.thudAtSec || 0);
    }
    if (_sfxOK && FLAG_ERECT.flapSfx) {
      var flapAt = (FLAG_ERECT.flapAtSec == null) ? pivotStart : FLAG_ERECT.flapAtSec;
      tl.call(function () { SOG.sfx.playNamed(FLAG_ERECT.flapSfx); }, null, flapAt);
    }
  }

  /* Erect a boss's freshly-rendered SERF flag as its own beat (planted-pole reveal
     + thud/flap SFX). Used wherever a Serf flag first APPEARS: the Gilgamesh/Narmer
     encounter start, and the Sargon/Hammurabi/Hanging-Gardens node reveals — so no
     flag ever just pops in statically. Caller must have _refreshNodeFlags()'d first. */
  function _erectSerfFlagFor(hook, onDone) {
    var serf = overlayEl && overlayEl.querySelector('.node-flags[data-hook="' + hook + '"] .node-flag-serf');
    if (!serf) { if (onDone) onDone(); return; }
    serf.style.opacity = '0';
    _erectFlagIn(serf, onDone);
  }

  /* Shared return-to-map flag ANIMATION (ALL non-Prehistory boss wins). The caller must
     have already rendered the flags with a DEFERRED stamp (_refreshNodeFlags(true)) and
     consumed the pending Giant-flag reveal (_consumePendingFlagReveal → giantFlagEl) BEFORE
     the map fades in, so nothing flickers. This runs AFTER the map is shown:
       wait STAMP_DELAY_MS → thunk the freshly-won stamp (serf OR giant) → when it fully
       lands: if a Giant flag is pending (a SERF win), wait ERECT_GAP_MS → erect it → then
       onProceed; a GIANT win has no pending erect → onProceed right after the stamp.
     onProceed continues whatever is next (market fade / Hammurabi reveal / interstitial). */
  var STAMP_DELAY_MS = 1200;  // pause after arrival before the stamp thunk (editable)
  var ERECT_GAP_MS   = 500;   // pause between the stamp and the Giant erect beats (editable)
  function _playReturnFlagAnim(giantFlagEl, onProceed) {
    // A GIANT-FIRST win (difficulty-picker bosses) both REVEALS and STAMPS the same
    // Giant flag — erect it first, THEN land the stamp (a stamp can't thunk onto a
    // flag that isn't up yet). A Serf win keeps the established order: stamp → erect.
    var _ps = window.__pendingStamp;   // peek only — _animatePendingStamp consumes it
    var giantFirst = !!(giantFlagEl && _ps && _ps.tier === 'giant');
    setTimeout(function () {
      if (giantFirst) {
        _erectFlagIn(giantFlagEl, function () {
          setTimeout(function () {
            _animatePendingStamp(function () { if (onProceed) onProceed(); });
          }, ERECT_GAP_MS);
        });
      } else {
        _animatePendingStamp(function () {          // stamp thunk (serf/giant), then:
          if (giantFlagEl) {
            setTimeout(function () {
              _erectFlagIn(giantFlagEl, function () { if (onProceed) onProceed(); });
            }, ERECT_GAP_MS);
          } else if (onProceed) { onProceed(); }
        });
      }
    }, STAMP_DELAY_MS);
  }

  /* ════════════════════════════════════════════════════════════
     MESOPOTAMIAN MARKET SCREEN
     ────────────────────────────────────────────────────────────
     Visual layout only this session — no buying / gold spend yet.
       • Full-screen mesomarket.jpg backdrop at z-100 (BELOW the HUD at
         z-150, the same layering the candle intervention uses), so the
         adventure HUD bar + the trader portrait render on top.
       • 9 cards laid on three shelves matching samplefinishedmarket.jpg,
         each rendered with the in-game card face (SOG.board.buildCardFace →
         cost/IP corners) + a pricetag@0.5x.png tag with the gold price.
       • Clicking a card opens the shared in-game card-detail popup
         (SOG.ui.openBattlePopup) — buying is NOT wired.
       • Trader portrait (mesotrader) sits in the HUD conversation slot via
         enterDialogueMode + swapNpcPortrait('trader'); no dialogue yet.
       • Back button (top-right, above the HUD) exits to the overworld.
     Reached by the first-win auto-walk and by clicking the market node.
     TODO(market interior — later): wire gold + buying onto this layout. */

  // True once the trader intro has finished (or was already seen) — card clicks
  // are suppressed until then so the player can't shop over the intro.
  var _marketReady = false;

  /* Trader intro dialogue — plays once (first market visit), gated on
     KEY_MARKET_INTRO_SEEN. DRAFT — edit these lines here. {who} maps to the HUD
     CHARACTERS portraits ('trader' / 'explorer'). */
  var MARKET_TRADER_INTRO = [
    { who: 'trader',   text: 'Ah, a traveler with coin to spend!' },
    { who: 'trader',   text: 'Welcome to the Mesopotamian Marketplace.' },
    { who: 'explorer', text: 'What is all this?' },
    { who: 'trader',   text: 'The finest cards this civilization has to offer...' },
    { who: 'trader',   text: 'And they can all be yours, for the right price in gold.' },
    { who: 'explorer', text: 'How does it work?' },
    { who: 'trader',   text: 'Simple. Tap any card to take a closer look.' },
    { who: 'trader',   text: 'If you have enough gold, then click the Buy button and the card is yours.' },
    { who: 'trader',   text: 'If not, come back with more gold.' },
    { who: 'explorer', text: 'And then?' },
    { who: 'trader',   text: 'Then it joins your collection.' },
    { who: 'trader',   text: 'Ready for you in your deck builder.' },
    { who: 'trader',   text: 'Spend wisely.' },
    { who: 'trader',   text: "Gold doesn't grow on date palms." }
  ];

  // Positions match samplefinishedmarket.jpg over the (tighter-crop) mesomarket.jpg:
  // shelf 1 = 5 cards on the top shelf, shelf 2 = 4 cards on the lower shelf
  // (Enkidu is the last card on shelf 2 and stays 30 gold — there is no 3rd shelf).
  // `xs` are per-card horizontal CENTERS (%) and `topPct` is the card top (%);
  // per-card `price` drives the tag. Easy to fine-tune.
  var MARKET_SHELVES = [
    { topPct: 13.75, xs: [25, 34.5, 44, 53.5, 62.5], cards: [
        { id: 39, price: 10 },   // Farmer
        { id: 40, price: 10 },   // Scribe
        { id: 42, price: 10 },   // Soldier
        { id: 41, price: 10 },   // Canals
        { id: 38, price: 10 }    // Priest
    ] },
    { topPct: 39.75, xs: [26, 37.5, 49, 60], cards: [
        { id: 45, price: 15 },   // Ziggurat
        { id: 48, price: 15 },   // Chariot
        { id: 49, price: 15 },   // Phoenicians
        { id: 44, price: 25 }    // Enkidu (last on shelf 2)
    ] }
  ];
  /* ── EGYPT · River Market ────────────────────────────────────────────────
     The Egypt market reuses ALL of the Mesopotamia market machinery below
     (_enterMarket / _buildMarketCard / the buy popup / gold + ownership gating);
     only the region-specific DATA differs, and that lives in MARKETS.

     The backdrop (images/ui_images/egyptmarket.jpg) is a 3-row × 3-column shelf
     grid — 9 VISIBLE slots. Unlike Mesopotamia's fixed shelf, Egypt RESTOCKS:
     each row is a TIER with a 6-card queue behind its 3 visible slots.

     ── THE RESTOCK RULE (the mechanic) ──
     Buying empties that slot for the REST OF THE VISIT. The next card in that
     row's own tier queue backfills it only on the NEXT market ENTRY — never
     mid-visit, and never across tiers. When a tier's 6 are all bought, that row
     reads sold-out (empty). This makes leaving-and-returning meaningful.
     [source: overworld.js → EGYPT_TRADER_INTRO / EGYPT_TIERS] */
  var EGYPT_TRADER_INTRO = [
    { who: 'trader', text: 'Welcome to the River Market!' },
    { who: 'trader', text: 'Everything you see came down the Nile.' },
    { who: 'trader', text: 'When it rises, the black land grows rich.' },
    { who: 'trader', text: 'And if you want these premium assets, you must find a way to get rich too.' }
  ];

  /* ── SLOT ALIGNMENT KNOBS — tune by eye against egyptmarket.jpg ────────────
     Pure geometry, no logic (same spirit as the flag-position knobs). `colXs`
     are the 3 column CENTRES (% of stage width), `rowTops` the 3 row TOPS (%).
     Nudge one number to shift a whole column/row; cards + price tags follow.
     `cardW/H` override the shared Mesopotamia tile size — Egypt's grid is only
     3 wide, so its tiles can afford to be larger. */
  var EGYPT_GRID = {
    /* Derived for egyptmarket1.jpg by measuring the backdrop's mapping into the
       market screen (art 1280×800 drawn `center/cover`; at the current stage size
       it lands ~1:1 in stage px, cropped ~25px top/bottom). The painted 3×3 frame
       occupies roughly image x 225–767, y 63–601 → cells ≈ 181×179 each, giving
       the centres/tops below. Close, but still EYEBALL AND NUDGE — the shelf is
       baked into the art, so only a visual pass lands it perfectly. */
    colXs:   [26, 37.5, 49],   // 3 column centres (%)
    rowTops: [9.5, 33.25, 57.25],   // 3 row tops (%)
    /* Tile size in STAGE px. Each recess is ~181×179 stage px and the shared
       default tile is 86×126 (plus a ~24px price tag below it), so a card
       currently fills ~70% of its cell height with room to spare. Bump these to
       fill the recesses more — keep the ~0.68 w:h ratio, and keep
       cardH + ~24 under ~179 so the price tag doesn't spill into the row below
       (e.g. 96×140 is a safe step up). null = inherit MARKET_CARD_W/H. */
    cardW:   null,
    cardH:   null
  };

  /* ── TIERS — one per shelf row, top → bottom. Each is a 6-card QUEUE: the
     first 3 are what the player sees on a fresh market, the last 3 wait behind
     them and backfill (in order) as the visible ones sell.
     Ids verified against cards.js (Egypt block 54–71, all 18 distinct);
     tier subtotals 30 / 65 / 105 = 200 gold. */
  var EGYPT_TIERS = [
    { label: 'Tier 1', cards: [        // TOP row — 5g staples
      { id: 55, price:  5 },   // Farmer
      { id: 56, price:  5 },   // Scribe
      { id: 68, price:  5 },   // Trader
      { id: 70, price:  5 },   // Soldier
      { id: 71, price:  5 },   // Priest
      { id: 69, price:  5 }    // Chariots
    ] },
    { label: 'Tier 2', cards: [        // MIDDLE row
      { id: 54, price: 10 },   // Papyrus
      { id: 57, price: 10 },   // Pyramid
      { id: 59, price: 10 },   // Obelisk
      { id: 64, price: 10 },   // Sphinx
      { id: 61, price: 10 },   // King Tutankhamen
      { id: 66, price: 15 }    // Book of the Dead
    ] },
    { label: 'Tier 3', cards: [        // BOTTOM row — premium
      { id: 65, price: 15 },   // Imhotep
      { id: 62, price: 15 },   // Hieroglyphics
      { id: 63, price: 15 },   // Ra
      { id: 60, price: 20 },   // Khufu
      { id: 67, price: 20 },   // Hyksos
      { id: 58, price: 20 }    // Rosetta Stone
    ] }
    /* ── SEAM: future Nubian / Piye expansion ────────────────────────────────
       Two shapes are supported without touching the engine below:
         (a) DEEPEN a tier — append Nubian entries to that tier's `cards` queue
             behind its flag; they simply restock after the Egyptian stock runs
             out, which matches the "market replenishes" motif.
         (b) ADD a tier — push a 4th { label, cards } here AND a 4th entry to
             EGYPT_GRID.rowTops (the renderer is driven by these two arrays, so
             a bigger grid needs no code change — only the backdrop art).
       Do it inside _egyptTiers() below so it stays flag-gated and the persisted
       queue state migrates cleanly (see _egyptMarketState's length guard).
       NOT wired now. */
  ];
  /* Flag-gated tier source — the ONE place a future expansion mutates stock. */
  function _egyptTiers() {
    return EGYPT_TIERS;   // e.g. if (_nubianUnlocked()) return EGYPT_TIERS_WITH_NUBIAN;
  }

  /* ── PERSISTED QUEUE STATE ────────────────────────────────────────────────
     Shape: { tiers: [ { slots: [id|null ×3], next: <queue index> }, … ] }
     `slots` is what's on the shelf right now; `next` is how far into that tier's
     queue we've drawn. Progression state, so it survives reload/sessions. */
  var KEY_EGYPT_MARKET = 'sog_egypt_market_state';

  function _cardOwned(id) {
    return !!(window.SOG && SOG.collection && typeof SOG.collection.isUnlocked === 'function'
              && SOG.collection.isUnlocked(id));
  }

  function _egyptMarketState() {
    var tiers = _egyptTiers();
    var st = null;
    try { st = JSON.parse(localStorage.getItem(KEY_EGYPT_MARKET) || 'null'); } catch (e) {}
    if (!st || !Array.isArray(st.tiers)) st = { tiers: [] };
    // Length guard — also the migration path when a future expansion adds a tier.
    while (st.tiers.length < tiers.length) st.tiers.push({ slots: [null, null, null], next: 0 });
    st.tiers.length = tiers.length;
    st.tiers.forEach(function (t) {
      if (!Array.isArray(t.slots)) t.slots = [null, null, null];
      while (t.slots.length < 3) t.slots.push(null);
      t.slots.length = 3;
      if (typeof t.next !== 'number') t.next = 0;
    });
    return st;
  }
  function _saveEgyptMarketState(st) {
    try { localStorage.setItem(KEY_EGYPT_MARKET, JSON.stringify(st)); } catch (e) {}
  }

  /* RESTOCK — run ONCE per market entry, before the shelves render.
     For each tier: clear any slot whose card is now owned (bought last visit, or
     acquired elsewhere), then refill empty slots from that tier's queue, skipping
     cards the player already owns. Ownership is the source of truth, so a slot
     emptied by a purchase mid-visit naturally backfills on the NEXT entry — which
     is exactly the specified timing. */
  function _restockEgyptMarket() {
    var tiers = _egyptTiers();
    var st = _egyptMarketState();
    st.tiers.forEach(function (t, ti) {
      var queue = tiers[ti].cards;
      for (var s = 0; s < t.slots.length; s++) {
        if (t.slots[s] != null && _cardOwned(t.slots[s])) t.slots[s] = null;   // sold → clear
        if (t.slots[s] != null) continue;                                      // still stocked
        while (t.next < queue.length) {                                        // draw next unowned
          var cand = queue[t.next++];
          if (!_cardOwned(cand.id)) { t.slots[s] = cand.id; break; }
        }
      }
    });
    _saveEgyptMarketState(st);
    return st;
  }

  /* Build the display in the { topPct, xs, cards } shape _enterMarket consumes.
     Reads the RESTOCKED state — empty slots simply contribute no card, which the
     renderer already treats as a gap (that's the sold/sold-out look). */
  function _egyptShelves() {
    var tiers = _egyptTiers();
    var st = _restockEgyptMarket();
    return EGYPT_GRID.rowTops.slice(0, tiers.length).map(function (topPct, ti) {
      var queue = tiers[ti].cards;
      var row   = st.tiers[ti];
      var cards = [], xs = [];
      row.slots.forEach(function (id, s) {
        if (id == null) return;                       // empty slot → gap on the shelf
        var entry = null;
        for (var i = 0; i < queue.length; i++) if (queue[i].id === id) { entry = queue[i]; break; }
        if (!entry) return;                           // stale id (inventory edited) → skip
        cards.push(entry);
        xs.push(EGYPT_GRID.colXs[s]);                 // keep each card at ITS slot's column
      });
      return { topPct: topPct, xs: xs, cards: cards };
    }).filter(function (row) { return row.cards.length; });
  }

  /* ══ TRADER SPEECH BUBBLE — reusable, MARKET TRADERS ONLY ═══════════════════
     Each market's trader is painted into its backdrop, so his greeting appears
     in a bubble anchored to him instead of the detached HUD box. Boss-battle
     dialogue is untouched (it keeps the #adv-bubble-* HUD presentation).

     Presentation is the GIANTS' in-battle bubble, reused verbatim via the
     shared .giant-bubble class (factored out of body.<boss>-battle
     #adv-bubble-otzi in style.css — the Giants' own rules are untouched). The
     market instance adds .giant-bubble--tail-up, because the bubble sits BELOW
     the trader's mouth (over his chest) and must point back UP at him, whereas
     the Giants' tails point sideways at a portrait.

     ── TUNING VALUES (per market — nudge by eye) ──
       leftPct / topPct — the bubble box's TOP-LEFT corner, as % of the market
                          screen. Drop it just under the speaker's mouth.
       widthPx         — bubble width.
       tailXPct        — the tail's horizontal position along the bubble's own
                          width (0 = left edge, 100 = right edge). Slide this
                          until the tail tip sits under his mouth. */
  var TRADER_BUBBLE = {
    'mesopotamia': { leftPct: 63, topPct: 53, widthPx: 300, tailXPct: 62 },
    'egypt':       { leftPct: 67, topPct: 34, widthPx: 290, tailXPct: 45 }
  };

  /* Run `lines` through a click-to-advance bubble anchored per `cfg`, appended to
     `host` (the market screen). Calls onDone after the last line. Reusable for any
     future market/shopkeeper — pass a new TRADER_BUBBLE entry. */
  function _runTraderBubble(host, lines, cfg, onDone) {
    if (!host || !lines || !lines.length) { if (onDone) onDone(); return; }
    var bubble = document.createElement('div');
    // Same component the Giants use in battle, plus the upward-tail modifier.
    bubble.className = 'giant-bubble giant-bubble--tail-up market-trader-bubble';
    bubble.style.left  = cfg.leftPct + '%';
    bubble.style.top   = cfg.topPct + '%';
    bubble.style.width = cfg.widthPx + 'px';
    bubble.style.setProperty('--tail-x', (cfg.tailXPct != null ? cfg.tailXPct : 50) + '%');
    var textEl = document.createElement('div');
    var hintEl = document.createElement('div');
    hintEl.className = 'mtb-hint';
    hintEl.innerHTML = '&#9654; Click to continue';
    bubble.appendChild(textEl);
    bubble.appendChild(hintEl);
    host.appendChild(bubble);
    void bubble.offsetHeight;                 // reflow so the fade-in animates
    bubble.classList.add('is-visible');

    var i = 0;
    function render() {
      textEl.textContent = lines[i].text;
      hintEl.style.display = (i === lines.length - 1) ? 'none' : '';
    }
    function advance(e) {
      if (e) e.stopPropagation();
      if (++i >= lines.length) {
        bubble.classList.remove('is-visible');
        setTimeout(function () {
          if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
          if (onDone) onDone();
        }, 220);
        return;
      }
      render();
    }
    bubble.addEventListener('click', advance);
    render();
  }

  /* Region → market data. _enterMarket(regionId) reads this; 'mesopotamia' is the
     default so every existing call site is unchanged. Adding a future region's
     market is one entry here plus a node + click handler. */
  var MARKETS = {
    'mesopotamia': {
      bg:       'images/ui_images/mesomarket.jpg',
      hudTitle: 'Marketplace',   // HUD region label while inside; restored on exit
      shelves:  function () { return MARKET_SHELVES; },
      intro:    function () { return MARKET_TRADER_INTRO; },
      introKey: KEY_MARKET_INTRO_SEEN,
      postExit: true     // deck-builder unlock + first-market interstitial beats
    },
    'egypt': {
      bg:       'images/ui_images/egyptmarket1.jpg',   // v1: same 1280×800 canvas, shelf pulled in from the edges so the grid frames properly
      hudTitle: 'River Market',   // HUD region label while inside; restored to the map name on exit
      /* Push the BACKDROP up by this % of the market-screen height (positive =
         up). Purely a framing knob for the art — the card slots are positioned
         independently, so this does NOT move them. Any gap it opens at the
         bottom is fine: the HUD bar covers that strip. */
      bgShiftUpPct: 3,
      shelves:  _egyptShelves,
      intro:    function () { return EGYPT_TRADER_INTRO; },
      introKey: 'sog_egypt_market_intro_seen',   // its own one-time greeting gate
      postExit: false,   // those beats are Mesopotamia-specific
      get cardW() { return EGYPT_GRID.cardW; },  // live-read so the knobs stay editable
      get cardH() { return EGYPT_GRID.cardH; }
    }
  };
  var _activeMarket = 'mesopotamia';   // set by _enterMarket, read by _exitMarket

  var MARKET_CARD_W = 86;   // px (stage space); height follows the card aspect
  var MARKET_CARD_H = 126;

  /* sizeW/sizeH are OPTIONAL per-market tile-size overrides (Egypt's 3-wide grid
     can afford larger tiles than Mesopotamia's 5-wide). Omitted → the shared
     MARKET_CARD_W/H defaults, so existing call sites are unchanged. */
  function _buildMarketCard(cardId, leftPct, topPct, price, locked, sizeW, sizeH) {
    var CW = sizeW || MARKET_CARD_W;
    var CH = sizeH || MARKET_CARD_H;
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return null;

    var wrap = document.createElement('div');
    wrap.className = 'market-card' + (locked ? ' market-card-locked' : '');
    wrap.style.cssText = 'position:absolute;left:' + leftPct + '%;top:' + topPct + '%;' +
      'width:' + CW + 'px;height:' + CH + 'px;transform:translateX(-50%);' +
      'container-type:inline-size;cursor:pointer;border:2px solid #1a0a04;border-radius:4px;' +
      'box-shadow:0 4px 10px rgba(0,0,0,.55);overflow:hidden;background:#100a02;';

    // In-game card face (image + CC/IP corners) — same renderer as battle/deck.
    if (window.SOG && SOG.board && typeof SOG.board.buildCardFace === 'function') {
      // size:'sm' → the pre-rendered thumbnail (card.imageSm / @sm). Market tiles
      // are small; without this the full-size export gets downscaled and dithers.
      SOG.board.buildCardFace(wrap, card, card.ip, { size: 'sm' });
    } else if (window.buildCardImg) {
      wrap.appendChild(window.buildCardImg(card));
    }

    // Locked (Enkidu pre-Sargon): grey the card and stamp a padlock over it. The
    // badge is appended AFTER buildCardFace (which clears the wrap) so it survives.
    if (locked) {
      wrap.style.filter = 'grayscale(0.9) brightness(0.55)';
      var lockBadge = document.createElement('div');
      lockBadge.className = 'market-card-lock';
      lockBadge.textContent = '🔒';   // 🔒
      lockBadge.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'font-size:40px;pointer-events:none;z-index:2;text-shadow:0 2px 5px rgba(0,0,0,0.85);';
      wrap.appendChild(lockBadge);
    }

    wrap.dataset.marketCardId = String(cardId);

    // Click → the market-specific BUY popup (NOT the shared battle popup). A locked
    // card still opens the popup (so the player can read what they're working toward)
    // but the Buy button is replaced by an "unlock" hint. Suppressed until the trader
    // intro (first visit) has finished.
    wrap.addEventListener('click', function () {
      if (!_marketReady) return;
      _openMarketBuyPopup(card, price, locked);
    });

    // Price tag — built as a SIBLING of the card (positioned in screen space),
    // NOT a child: the card wrap's overflow:hidden (which clips the rounded card
    // image) would otherwise clip the tag away. Hangs just below the card bottom.
    var tag = document.createElement('div');
    tag.className = 'market-pricetag';
    tag.dataset.marketCardId = String(cardId);
    tag.style.cssText = 'position:absolute;left:' + (leftPct + 0.5) + '%;' +
      'top:calc(' + (topPct - 2) + '% + ' + (CH - 8) + 'px);transform:translateX(-50%);' +
      'width:115px;height:77px;background:url("images/ui_images/pricetag@0.5x.png") center/contain no-repeat;' +
      'display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:50;';
    var num = document.createElement('span');
    num.textContent = price;
    num.style.cssText = 'font-family:var(--font, sans-serif);font-size:32px;font-weight:bold;' +
      // Double-digit prices are wider, so they read as sitting too far right at the
      // single-digit offset — pull them back 2px to keep both optically centred.
      'color:#3a2400;text-shadow:0 1px 0 rgba(255,230,150,.6);transform:translate(' +
      (String(price).length > 1 ? -8 : -6) + 'px, 3px);';
    tag.appendChild(num);

    return { cardEl: wrap, tagEl: tag };
  }

  /* regionId: 'mesopotamia' (default — every existing call site) | 'egypt'. */
  function _enterMarket(regionId) {
    _activeMarket = MARKETS[regionId] ? regionId : 'mesopotamia';
    var _mk = MARKETS[_activeMarket];
    isDialogueLocked = true;
    cancelIdle();
    stopFootsteps();

    // Context soundtrack — marketplace track (constant 50%, no ducking).
    if (window.SOG && SOG.music && typeof SOG.music.playContext === 'function') {
      SOG.music.playContext('marketplace');
    }

    // Focus drain (Stage 1): each marketplace trip costs 5. _enterMarket runs
    // once per entry (node click, or the first-Gilgamesh-win auto-walk).
    // HUD region label → this market's name while inside (_exitMarket restores
    // the map's displayName). Markets without a hudTitle keep the region label.
    if (_mk.hudTitle && window.SOG && SOG.HUD && typeof SOG.HUD.setRegion === 'function') {
      SOG.HUD.setRegion(_mk.hudTitle);
    }
    if (window.SOG && SOG.focus) SOG.focus.spend(5);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshFocus === 'function') SOG.HUD.refreshFocus();
    var prev = document.getElementById('adv-market-screen');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    // Backdrop + cards live BELOW the HUD (z-150) so the HUD bar + trader
    // portrait render on top — same layering trick as the candle intervention.
    var screen = document.createElement('div');
    screen.id = 'adv-market-screen';
    var MARKET_BG_URL = _mk.bg;
    // Start HIDDEN: the background is a CSS background-image (no load event of its
    // own), so online the cards would otherwise show over a not-yet-painted bg
    // ("floating cards"). We reveal the whole screen — bg + cards together — only
    // once the bg is loaded (gate below).
    screen.style.cssText = 'position:absolute;inset:0;z-index:100;overflow:hidden;opacity:0;' +
      'background:url("' + MARKET_BG_URL + '") center/cover no-repeat;';

    // Lay out the cards on their two shelves (card + its price tag). Cards the
    // player already OWNS are skipped — only unowned cards are for sale, so a
    // bought card stays gone (the empty slot is the "you own it" feedback).
    // Enkidu (44) is purchase-locked until Sargon is beaten at EITHER tier — a
    // softlock safeguard. The economy is tight: a 25-gold Enkidu splurge before
    // Sargon could leave the player unable to afford the cheap (10–15 gold) cards
    // needed to reach Sargon's 15-card minimum. Locking it pre-Sargon keeps early
    // gold flowing to affordable cards, guaranteeing the deck can reach 15.
    var _enkiduUnlocked = _tierBeaten('sargon', 'serf') || _tierBeaten('sargon', 'giant');
    _mk.shelves().forEach(function (shelf) {
      shelf.cards.forEach(function (c, i) {
        if (window.SOG && SOG.collection && typeof SOG.collection.isUnlocked === 'function'
            && SOG.collection.isUnlocked(c.id)) return;   // owned → not for sale
        var leftPct = (shelf.xs[i] != null) ? shelf.xs[i] : (20 + i * 12);
        var locked  = (c.id === 44) && !_enkiduUnlocked;   // Enkidu gated on a Sargon win
        var built   = _buildMarketCard(c.id, leftPct, shelf.topPct, c.price, locked,
                                       _mk.cardW, _mk.cardH);   // per-market size (falsy → shared default)
        if (built) { screen.appendChild(built.cardEl); screen.appendChild(built.tagEl); }
      });
    });

    // Back-to-overworld button (top-right; its own z so it sits above the HUD).
    var btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.id = 'adv-market-back';
    btn.textContent = '← Leave Market';
    btn.style.cssText = 'position:absolute;top:14px;right:14px;z-index:160;font-size:15px;' +
      'padding:8px 16px;cursor:pointer;';
    btn.addEventListener('click', _exitMarket);
    screen.appendChild(btn);

    (document.getElementById('sog-stage') || document.body).appendChild(screen);

    // Optional per-market BACKDROP framing nudge (_mk.bgShiftUpPct — % of the
    // screen height, positive = push the art UP). Applied after the screen is in
    // the DOM so clientHeight is real. background-position % resolves against
    // (container − image), which is a tiny range under `cover`, so the shift is
    // expressed in px via calc() to be predictable. Card slots are positioned
    // separately, so this moves ONLY the art.
    if (_mk.bgShiftUpPct) {
      var _shiftPx = (_mk.bgShiftUpPct / 100) * screen.clientHeight;
      screen.style.backgroundPosition = 'center calc(50% - ' + _shiftPx.toFixed(1) + 'px)';
    }

    // Reveal the market only once the background image is loaded. A CSS
    // background-image has no onload, so detect via a parallel new Image() with the
    // SAME url — when it resolves the CSS bg is cached and paints together with the
    // cards (no floating-cards-over-blank online). Cached/already-warmed → instant.
    // Safety-capped so a slow/missing bg can never leave the market hidden.
    (function () {
      var revealed = false;
      function reveal() { if (revealed) return; revealed = true; screen.style.opacity = '1'; }
      var bg = new Image();
      bg.onload  = reveal;
      bg.onerror = reveal;                       // missing/failed bg must not hang the market
      bg.src = MARKET_BG_URL;
      if (bg.complete && bg.naturalWidth > 0) reveal();   // already cached → show now
      setTimeout(reveal, 2500);                  // safety cap
    })();

    // On the FIRST visit, play the trader intro dialogue (gated on
    // KEY_MARKET_INTRO_SEEN) before the player can shop. Once it finishes we drop
    // the HUD back to its NORMAL resting state so the player can see their gold
    // balance while shopping (the trader is still visible in the shelf scene). On
    // revisits we never enter dialogue mode at all. Shopping is suppressed via
    // _marketReady until the intro finishes. Degrades gracefully without the HUD.
    _marketReady = false;
    var hud = window.SOG && window.SOG.HUD;
    var introSeen = false;
    try { introSeen = localStorage.getItem(_mk.introKey) === 'true'; } catch (e) {}

    if (!introSeen) {
      // TRADER BUBBLE (both markets): the greeting appears anchored to the trader
      // in the art, NOT in the HUD box — so the HUD stays in its normal resting
      // state and the gold balance is visible throughout. Shopping stays blocked
      // via _marketReady until the last line is dismissed.
      if (hud && typeof hud.refreshGold === 'function') hud.refreshGold();
      _runTraderBubble(screen, _mk.intro(), TRADER_BUBBLE[_activeMarket] || TRADER_BUBBLE.mesopotamia, function () {
        try { localStorage.setItem(_mk.introKey, 'true'); } catch (e) {}
        _marketReady = true;
      });
    } else {
      // Revisit (or no HUD): normal HUD already showing — just refresh gold + shop.
      if (hud && typeof hud.refreshGold === 'function') hud.refreshGold();
      _marketReady = true;
    }
  }

  /* Leave the market → back to the Mesopotamia overworld. */
  function _exitMarket() {
    _closeMarketBuyPopup();
    var conf = document.getElementById('adv-market-confirm');
    if (conf && conf.parentNode) conf.parentNode.removeChild(conf);
    _marketReady = false;
    // If the player bails mid-intro (Leave Market is clickable during the trader
    // dialogue), make sure the HUD comes out of dialogue mode; once the intro is
    // done we're already back in the normal HUD, so this is a no-op.
    var hud = window.SOG && window.SOG.HUD;
    if (hud && typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(function () {});
    var screen = document.getElementById('adv-market-screen');
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    isDialogueLocked = false;
    // Restore the HUD region label (a market may have swapped in its own name).
    if (window.SOG && SOG.HUD && typeof SOG.HUD.setRegion === 'function' && MAPS[currentMapId]) {
      SOG.HUD.setRegion(MAPS[currentMapId].displayName || currentMapId);
    }
    _playMapMusic();   // back on the map — resume the overworld track
    // First time back from the marketplace: the deck builder un-greys, then the
    // Explorer notes the growing collection and resolves to return to Gilgamesh.
    // Sargon does NOT reveal here anymore — that moves to AFTER the Giant rematch win
    // (see returnFromGilgameshWin), since the player can't enter Sargon until 15 cards.
    // ...but ONLY for the Mesopotamia market — those two beats are that region's
    // story (deck-builder unlock + "back to Gilgamesh"). Egypt's market skips them.
    if (!(MARKETS[_activeMarket] && MARKETS[_activeMarket].postExit)) { scheduleIdle(); return; }
    _maybePlayDeckBuilderUnlock(function () {
      _maybePlayFirstMarketInterstitial(function () { scheduleIdle(); });
    });
  }

  // One-time deck-builder unlock: after the player has won Gilgamesh and visited
  // the marketplace, play the explorer's "let's build a deck" beat, set the
  // unlock flag, and refresh the HUD so the (previously greyed) deck button
  // becomes clickable. No-op once already unlocked or before the Gilgamesh win.
  function _maybePlayDeckBuilderUnlock(done) {
    var won = false, already = false;
    try {
      won     = localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true';
      already = localStorage.getItem(KEY_DECKBUILDER_UNLOCKED) === 'true';
    } catch (e) {}
    if (!won || already) { if (done) done(); return; }
    // SILENT unlock — no dialogue. The first-market beat is now ONLY the Explorer
    // interstitial (_maybePlayFirstMarketInterstitial); the old DECKBUILDER_UNLOCK_DIALOGUE
    // is retired. Just set the flag + un-grey the deck button, then continue.
    try { localStorage.setItem(KEY_DECKBUILDER_UNLOCKED, 'true'); } catch (e) {}
    var hud = window.SOG && window.SOG.HUD;
    if (hud && typeof hud.refreshDecks === 'function') hud.refreshDecks();  // un-grey
    if (done) done();
  }

  /* ── Market buy popup (market-specific; NOT the shared battle popup) ─────
     Clicked card renders large + left-of-centre; a detail box of the same
     height sits flush against its right edge so card+box read as one entity;
     a "Buy For <price> [coin]" button on the box's bottom edge (active only if
     SOG.gold.get() >= price). Buy → confirmation → transaction. */
  function _closeMarketBuyPopup() {
    var p = document.getElementById('adv-market-buy');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  // Card type → category-symbol class (mirrors the battle/deck-builder popups).
  // Labor / Economic have no symbol art yet → fall through to a text-only type.
  var MARKET_TYPE_ICON = {
    Political: 'political', Religious: 'religious', Military: 'military',
    Cultural: 'cultural', Exploration: 'exploration', Scientific: 'scientific',
    Prehistory: 'prehistory'
  };

  function _openMarketBuyPopup(card, price, locked) {
    _closeMarketBuyPopup();
    var gold = (window.SOG && SOG.gold) ? SOG.gold.get() : 0;
    var affordable = gold >= price;

    var overlay = document.createElement('div');
    overlay.id = 'adv-market-buy';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;background:rgba(8,4,0,0.72);';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeMarketBuyPopup(); });

    var unit = document.createElement('div');
    unit.style.cssText = 'display:flex;align-items:stretch;filter:drop-shadow(0 10px 30px rgba(0,0,0,0.6));';

    // Enlarged card (left of centre).
    var CARD_H = 440, CARD_W = Math.round(CARD_H * 123 / 184);
    var big = document.createElement('div');
    big.style.cssText = 'position:relative;width:' + CARD_W + 'px;height:' + CARD_H + 'px;flex-shrink:0;' +
      'container-type:inline-size;border:3px solid #1a0a04;border-radius:8px 0 0 8px;overflow:hidden;background:#100a02;';
    if (window.SOG && SOG.board && typeof SOG.board.buildCardFace === 'function') {
      SOG.board.buildCardFace(big, card, card.ip);
    } else if (window.buildCardImg) { big.appendChild(window.buildCardImg(card)); }

    // Detail box (flush against the card's right edge, same height → one entity).
    // Width brought in 15% (340 → 289); the unit stays centred via the overlay.
    var box = document.createElement('div');
    box.style.cssText = 'width:289px;height:' + CARD_H + 'px;flex-shrink:0;display:flex;flex-direction:column;' +
      'background:linear-gradient(180deg,#f6efdc 0%,#e8dcb8 100%);border:3px solid #1a0a04;border-left:none;' +
      'border-radius:0 8px 8px 0;color:#1a0a04;font-family:var(--font,sans-serif);';

    var content = document.createElement('div');
    content.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:18px 18px 10px;';

    var nameEl = document.createElement('div');
    nameEl.textContent = card.name;
    nameEl.style.cssText = 'font-size:26px;font-weight:bold;letter-spacing:0.02em;margin-bottom:4px;';
    // Type row: category symbol + "TYPE · ERA" (matches the battle/deck-builder
    // popups). Uses the shared .popup-card-type / .cat-icon styling.
    var typeEl = document.createElement('div');
    typeEl.className = 'popup-card-type';
    typeEl.style.cssText = 'font-size:14px;opacity:0.8;letter-spacing:0.08em;margin-bottom:14px;' +
      'color:inherit;text-shadow:none;';
    var _ic = MARKET_TYPE_ICON[card.type];
    var _icHTML = _ic ? '<span class="cat-icon cat-icon--' + _ic + '" aria-hidden="true"></span>' : '';
    var _lbl = (card.type || '');
    if (card.era && card.era !== card.type) _lbl += (_lbl ? ' · ' : '') + card.era;
    typeEl.innerHTML = _icHTML + '<span class="cat-label">' + _lbl.toUpperCase() + '</span>';
    content.appendChild(nameEl); content.appendChild(typeEl);
    if (card.abilityName) {
      var abNm = document.createElement('div');
      abNm.textContent = card.abilityName;
      abNm.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:4px;';
      content.appendChild(abNm);
    }
    var abTx = document.createElement('div');
    abTx.textContent = card.ability || 'No special ability.';
    abTx.style.cssText = 'font-size:15px;line-height:1.45;' + (card.ability ? '' : 'font-style:italic;opacity:0.7;');
    content.appendChild(abTx);

    // Locked (Enkidu pre-Sargon): the Buy button is replaced by a non-interactive
    // unlock hint so the player learns WHY it's unavailable and what unlocks it.
    var action;
    if (locked) {
      action = document.createElement('div');
      action.style.cssText = 'margin:0 14px 14px;padding:11px;font-size:16px;font-weight:bold;text-align:center;' +
        'color:#7a3010;border:2px dashed #7a3010;border-radius:6px;background:rgba(122,48,16,0.08);line-height:1.35;';
      action.innerHTML = '🔒 Locked' +
        '<div style="font-weight:normal;font-size:14px;margin-top:3px;">Defeat Sargon to unlock Enkidu.</div>';
    } else {
      action = document.createElement('button');
      action.className = 'btn-primary';
      action.style.cssText = 'margin:0 14px 14px;padding:12px;font-size:18px;font-weight:bold;display:flex;' +
        'align-items:center;justify-content:center;gap:8px;cursor:' + (affordable ? 'pointer' : 'not-allowed') + ';' +
        (affordable ? '' : 'opacity:0.45;filter:grayscale(0.7);');
      action.disabled = !affordable;
      action.innerHTML = 'Buy For ' + price +
        ' <img src="images/ui_images/coin.png" alt="gold" style="width:24px;height:24px;object-fit:contain;">';
      if (affordable) {
        action.addEventListener('click', function () {
          _openBuyConfirm(card, function () {
            _closeMarketBuyPopup();
            _doMarketPurchase(card, price);
          });
        });
      }
    }

    box.appendChild(content); box.appendChild(action);
    unit.appendChild(big); unit.appendChild(box);
    overlay.appendChild(unit);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
  }

  /* Purchase confirmation — Yes runs onYes (caller closes the buy popup + runs
     the transaction); No just dismisses back to the buy popup. */
  function _openBuyConfirm(card, onYes) {
    var ov = document.createElement('div');
    ov.id = 'adv-market-confirm';
    ov.style.cssText = 'position:fixed;inset:0;z-index:5100;display:flex;align-items:center;justify-content:center;background:rgba(8,4,0,0.5);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:linear-gradient(180deg,#f6efdc,#e8dcb8);border:3px solid #1a0a04;border-radius:10px;' +
      'padding:24px 28px;display:flex;flex-direction:column;align-items:center;gap:18px;color:#1a0a04;' +
      'font-family:var(--font,sans-serif);max-width:380px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.6);';
    var q = document.createElement('div');
    q.textContent = 'Are you sure you want to buy ' + card.name + '?';
    q.style.cssText = 'font-size:19px;line-height:1.4;';
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:16px;';
    var yes = document.createElement('button'); yes.className = 'btn-primary'; yes.textContent = 'Yes';
    yes.style.cssText = 'padding:9px 28px;font-size:17px;cursor:pointer;';
    var no = document.createElement('button'); no.className = 'btn-primary'; no.textContent = 'No';
    no.style.cssText = 'padding:9px 28px;font-size:17px;cursor:pointer;';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    no.addEventListener('click', close);
    yes.addEventListener('click', function () { close(); if (onYes) onYes(); });
    row.appendChild(yes); row.appendChild(no);
    panel.appendChild(q); panel.appendChild(row);
    ov.appendChild(panel);
    (document.getElementById('sog-stage') || document.body).appendChild(ov);
  }

  /* The purchase transaction (exact order): (a) spend gold (guard on false),
     (b) grant the card to the collection, (c) refresh the HUD gold number,
     (d) play the card-acquisition animation, (e) remove the card from the shelf. */
  function _doMarketPurchase(card, price) {
    // (a) spend — guard (button was active, but never trust it)
    if (!(window.SOG && SOG.gold && SOG.gold.spend(price))) return;
    // (b) grant to the collection (owned + persisted — same as battle-win grants)
    if (window.SOG && SOG.collection && typeof SOG.collection.unlockCard === 'function') {
      SOG.collection.unlockCard(card.id);
    } else if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      SOG.Cards.unlock(card.id);
    }
    // (c) update the HUD gold number
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    // (e) remove the purchased card (+ its tag) from the shelf
    function removeFromShelf() {
      var screen = document.getElementById('adv-market-screen');
      if (!screen) return;
      var els = screen.querySelectorAll('[data-market-card-id="' + card.id + '"]');
      Array.prototype.forEach.call(els, function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    }
    // (d) card-acquisition animation, then remove from the shelf when it settles
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, removeFromShelf, { autoDismissMs: 1500 });
    } else {
      removeFromShelf();
    }
  }

  /* Grant Cuneiform (id 46): idempotent flag + unlock + acquisition reveal. */
  function _grantCuneiform(cb) {
    try { localStorage.setItem(KEY_CUNEIFORM_GRANTED, 'true'); } catch (e) {}
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') SOG.Cards.unlock([46]);
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === 46; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (cb) cb(); }, { autoDismissMs: D2C_AUTO_DISMISS_MS });
    } else if (cb) { cb(); }
  }

  /* Tear down and re-place all node elements for the current map.
     Used after a flag change (e.g. post-victory) so newly-unlocked
     nodes like the Egypt signpost appear without a full map reload. */
  function _refreshNodes() {
    if (!overlayEl) return;
    overlayEl.querySelectorAll('.overworld-node').forEach(function (el) {
      el.parentNode.removeChild(el);
    });
    var data = MAPS[currentMapId];
    if (!data) return;
    data.nodes.forEach(function (n) {
      if (typeof n.showIf === 'function' && !n.showIf()) return;
      var nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = n.id;
      nodeEl.style.left = n.x + '%';
      nodeEl.style.top  = n.y + '%';
      if (n.scale) nodeEl.style.transform = 'translate(-50%,-50%) scale(' + n.scale + ')';
      var img = document.createElement('img');
      img.src = n.image;
      img.alt = n.name;
      img.draggable = false;
      if (n.flipX) img.style.transform = 'scaleX(-1)';
      nodeEl.appendChild(img);
      if (n.label) {
        var labelEl = document.createElement('div');
        labelEl.className = 'overworld-node-label';
        labelEl.textContent = n.label;
        nodeEl.appendChild(labelEl);
      }
      nodeEl.addEventListener('click', function () { onNodeClick(n); });
      if (n.id === 'prehistory' &&
          window.SOG && SOG.Adventure && SOG.Adventure.Prehistory &&
          SOG.Adventure.Prehistory.isBattleComplete()) {
        nodeEl.classList.add('overworld-node-complete');
      }
      if (n.id === 'egypt-signpost') {
        try {
          if (localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true') {
            nodeEl.classList.add('overworld-node-complete');
          }
        } catch (e) {}
      }
      overlayEl.appendChild(nodeEl);
    });
    _refreshNodeFlags();   // keep boss flags/stamps in sync with the re-rendered nodes
  }

  /* ── Otzi encounter ─────────────────────────────────────────────
     Fires when the player arrives at the Egypt signpost for the
     first time (sog_battle_otzi_complete not yet set).
     1. Otzi pops in near the signpost.
     2. Click-to-advance dialogue (8 lines, same runner as other phases).
     3. Radial wipe + whoosh → SOG.OtziBattle.start().              */
  function startOtziEncounter(node) {
    isDialogueLocked = true;
    cancelIdle();

    runDialogue(OTZI_PRE_BATTLE_DIALOGUE, function () {
      isDialogueLocked = false;
      _fireWipeFromNode('egypt-signpost', function () {
        var otziBattle = window.SOG && window.SOG.OtziBattle;
        if (otziBattle && typeof otziBattle.start === 'function') {
          otziBattle.start();
        } else {
          console.warn('[Overworld] SOG.OtziBattle not found — aborting');
          _clearWipe();
        }
      });
    });
  }

  /* Inject the Otzi portrait sprite onto the overlay, positioned
     slightly southeast of the signpost (between explorer and sign). */
  function _spawnOtziSprite(node) {
    _removeOtziSprite();
    var sprite = document.createElement('img');
    sprite.id        = 'overworld-otzi-sprite';
    sprite.src       = 'images/Otzi.jpg';
    sprite.alt       = 'Otzi';
    sprite.draggable = false;
    // Nudge 4% right and 7% down from the signpost so he stands
    // visually between the explorer (arriving from SE) and the sign.
    sprite.style.left = (node.x + 4) + '%';
    sprite.style.top  = (node.y + 7) + '%';
    overlayEl.appendChild(sprite);
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(sprite, { opacity: 0, scale: 0.7 },
                          { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.4)' });
    } else {
      sprite.style.opacity = '1';
    }
  }

  function _removeOtziSprite() {
    var existing = document.getElementById('overworld-otzi-sprite');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  /* Generic radial wipe centred on a named overworld node element.
     Replicates the same clip-path GSAP technique used in
     sog-adventure-prehistory.js without modifying that module.     */
  function _fireWipeFromNode(nodeId, onComplete) {
    var nodeEl = overlayEl && overlayEl.querySelector('[data-id="' + nodeId + '"]');
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onComplete) onComplete(); return; }

    var cx, cy;
    if (nodeEl) {
      var rect = nodeEl.getBoundingClientRect();
      cx = ((rect.left + rect.width  / 2) / window.innerWidth)  * 100;
      cy = ((rect.top  + rect.height / 2) / window.innerHeight) * 100;
    } else {
      cx = 50; cy = 50;
    }

    var maxR = Math.max(window.innerWidth, window.innerHeight) * 1.4;
    wipeEl.style.clipPath = 'circle(0px at ' + cx + '% ' + cy + '%)';
    wipeEl.classList.add('active');
    _playWoosh();

    if (typeof gsap === 'undefined') {
      wipeEl.style.clipPath = 'circle(' + maxR + 'px at ' + cx + '% ' + cy + '%)';
      setTimeout(function () { if (onComplete) onComplete(); }, 1000);
      return;
    }
    var proxy = { r: 0 };
    gsap.to(proxy, {
      r: maxR, duration: 1.0, ease: 'power2.inOut',
      onUpdate: function () {
        wipeEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + cx + '% ' + cy + '%)';
      },
      onComplete: function () { if (onComplete) onComplete(); }
    });
  }

  function _clearWipe() {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) return;
    wipeEl.classList.remove('active');
    wipeEl.style.clipPath = '';
  }

  /* runDialogue and _runLinesKeepOpen are defined earlier as thin
     HUD delegation wrappers. The old box-based engine has been
     removed — all dialogue now routes through SOG.HUD (Phase H2). */

  /* ── Prehistory node urgent-pulse escalation ───────────────── */
  function scheduleUrgentPulse() {
    clearUrgentPulse();
    urgentPulseTimer = setTimeout(function () {
      var nodeEl = overlayEl && overlayEl.querySelector('[data-id="prehistory"]');
      if (!nodeEl) return;
      nodeEl.classList.add('overworld-node-urgent');
    }, 30000);
  }
  function clearUrgentPulse() {
    if (urgentPulseTimer) { clearTimeout(urgentPulseTimer); urgentPulseTimer = null; }
    if (overlayEl) {
      var nodeEl = overlayEl.querySelector('.overworld-node-urgent');
      if (nodeEl) nodeEl.classList.remove('overworld-node-urgent');
    }
  }

  /* ── Canonical teardown ─────────────────────────────────────────────────
     Reset the adventure subsystems to a FRESH-LOAD-equivalent clean state. Run
     by the Settings "Back to Home" handler BEFORE showing home, and reusable by
     the forfeit "Back to Map" flow (call this, then re-show/re-init the
     overworld). Safe to call from any screen — every step is guarded. */
  function teardown() {
    // --- Overworld subsystem: stop timers + clear locks/guards ---
    cancelIdle();
    clearUrgentPulse();
    if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
    stopFootsteps();
    isMoving = false;
    isTransitioning = false;
    isDialogueLocked = false;
    _marketReady = false;

    // --- Remove the full-screen overlays showScreen can't hide (the VISIBLE
    //     breakage): the dynamic marketplace screen + its popups are removed from
    //     the DOM; the static reveal/dim overlays are re-hidden; the radial wipe is
    //     cleared; any open dialogue bubbles are hidden. ---
    _clearWipe();                                       // #adv-radial-wipe.active
    ['adv-market-screen', 'adv-market-buy', 'adv-market-confirm'].forEach(function (id) {
      var el = document.getElementById(id);             // dynamic → remove from DOM
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    ['adv-card-reveal', 'adv-post-battle-dim'].forEach(function (id) {
      var el = document.getElementById(id);             // static markup → just re-hide
      if (el) el.style.display = 'none';
    });
    ['adv-bubble-otzi', 'adv-bubble-explorer', 'adv-bubble-lucy', 'adv-bubble-neanderthal'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.classList.remove('is-visible', 'is-ready');
    });

    // --- Strip stale battle/mode body classes (FORWARD-PLAY corruption: a new
    //     battle inheriting a leftover class → wrong location art). ---
    ['gilgamesh-battle', 'hammurabi-battle', 'hanging-gardens-battle', 'sargon-battle',
     'otzi-battle', 'otzi-pre-deal', 'prehistory-battle', 'prehistory-pre-coaching',
     'overworld-away-from-home', 'tut-locked'].forEach(function (c) {
      document.body.classList.remove(c);
    });

    // --- HUD: exit dialogue mode (clears dialogue-mode + stops the typewriter),
    //     restore battle avatars, drop the Focus-gate halo. ---
    var hud = window.SOG && window.SOG.HUD;
    if (hud) {
      if (typeof hud.exitDialogueMode    === 'function') { try { hud.exitDialogueMode(function () {}); } catch (e) {} }
      if (typeof hud.restoreBattleAvatars === 'function') hud.restoreBattleAvatars();
    }
    var hudEl = document.getElementById('adv-hud');
    if (hudEl) hudEl.classList.remove('dialogue-mode');
    var book = document.getElementById('adv-hud-textbook');
    if (book) book.classList.remove('adv-hud-textbook--halo');

    // --- Battle engine: mark the battle ENDED so stale G can't drive forward
    //     play. G is a shared instance mutated in place by initGame, so we only
    //     flag the phase — the next initGame fully rebuilds it. ---
    if (window.SOG && SOG.state && SOG.state.G) SOG.state.G.phase = 'over';

    // --- Clear stale window mode flags (left at last-session values). ---
    window.deckBuilderFromOverworld = false;
    window._adventureVideoMode      = false;
    window.versusStudentMode        = false;
    window.multiplayerMode          = false;
  }

  /* ── Public init ───────────────────────────────────────────── */
  function init() {
    mapImgEl         = document.getElementById('overworld-map');
    overlayEl        = document.getElementById('overworld-overlay');
    charEl           = document.getElementById('overworld-character');
    fogEl            = document.getElementById('overworld-fog-full');
    transitionEl     = document.getElementById('overworld-transition');
    transitionTextEl = document.getElementById('overworld-transition-text');
    if (!mapImgEl || !overlayEl || !charEl) {
      console.warn('[Overworld] Missing DOM elements');
      return;
    }

    loadState();

    // If the adventure intro hasn't been seen yet, FORCE the player to
    // East Africa regardless of saved state. Otherwise a stale saved map
    // (e.g. Egypt from testing) would skip the East Africa check and
    // the intro would never fire.
    var introDone = localStorage.getItem(KEY_ADVENTURE_INTRO) === 'true';
    if (!introDone && currentMapId !== 'eastafrica') {
      if (window.SOG_DEBUG) console.log('[Overworld] Intro not yet seen — forcing start on East Africa');
      currentMapId = 'eastafrica';
      currentPos   = { x: MAPS.eastafrica.spawn.x, y: MAPS.eastafrica.spawn.y };
    }

    // Returning players (intro already seen) restore their saved position;
    // new Adventure Mode players always spawn at East Africa's default.
    loadMap(currentMapId, { useSaved: introDone });

    // If this is the player's first time on East Africa, play the
    // scripted intro dialogue (locks movement until it ends).
    var dialogueStarted = maybePlayAdventureIntro();
    if (!dialogueStarted) dialogueStarted = maybePlayEastAfricaReturnDialogue();
    if (!dialogueStarted) dialogueStarted = maybePlayEgyptNodeArrival();   // post-Neb "funny hat" beat
    if (!dialogueStarted) dialogueStarted = maybePlayEgyptArrival();
    if (!dialogueStarted) dialogueStarted = maybePlayMesopotamiaArrival();
    if (!dialogueStarted) scheduleIdle();
  }

  /* ── Expose ────────────────────────────────────────────────── */
  return {
    init: init,
    // Resume the current map's context soundtrack. Called from the showScreen hook
    // whenever the overworld is shown (covers every battle-return path) + market exit.
    playMapMusic: _playMapMusic,
    // Canonical adventure teardown → fresh-load-equivalent clean state. Used by
    // Settings "Back to Home" and (reusably) the forfeit "Back to Map" flow.
    teardown: teardown,
    reset: function () {
      localStorage.removeItem(KEY_MAP);
      localStorage.removeItem(KEY_POS);
      localStorage.removeItem(KEY_VISITED);
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      console.log('[Overworld] All state reset');
    },
    resetIntro: function () {
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      console.log('[Overworld] Intro flag cleared — intro will play next time you arrive on East Africa');
    },
    // Force-play Phase 1 (arrival dialogue) right now, bypassing all gates
    playIntro: function () {
      console.log('[Adventure Intro] Force-triggering Phase 1');
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      isDialogueLocked = true;
      cancelIdle();
      runDialogue(PHASE1_DIALOGUE, function () {
        isDialogueLocked = false;
        console.log('[Adventure Intro] Phase 1 ended (Phase 2 will fire when you click Prehistory)');
        scheduleIdle();
      });
    },
    // Force-play Phase 2 (Lucy meets Explorer) — for testing the second half
    playPhase2: function () {
      console.log('[Adventure Intro] Force-triggering Phase 2');
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      playPhase2Then(function () {
        console.log('[Adventure Intro] Phase 2 ended (character would now walk to node)');
      });
    },
    // Called by SOG.Adventure.Prehistory.playPreBattleDialogue() to run
    // the Neanderthal/Explorer pre-battle lines in the same .adv-dialogue
    // style as the Lucy/Explorer intro conversation.
    runPreBattleLines: function (lines, onDone) {
      isDialogueLocked = true;
      runDialogue(lines, function () {
        isDialogueLocked = false;
        if (onDone) onDone();
      });
    },
    // Post-victory sequence — called by sog-adventure-prehistory.js after
    // the player wins the Neanderthal battle and returns to the overworld.
    startPostVictorySequence: startPostVictorySequence,
    // Otzi encounter — exposed so the battle module can call back if needed
    startOtziEncounter: startOtziEncounter,
    // Phase D1 — Otzi→Mesopotamia travel cinematic. Called by sog-adventure-otzi.js
    // after the player wins the Otzi battle and clicks "Back to Map" for the first time.
    startMesopotamiaArrival: startMesopotamiaArrival,
    // First-return-to-East-Africa dialogue (after beating Otzi). Called by
    // sog-adventure-otzi.js when the player returns to the overworld and stays
    // on East Africa (replay path), since that return uses showScreen rather
    // than a map transition. No-op if not on East Africa / Otzi not beaten /
    // already seen. Returns true if it started the dialogue.
    maybePlayEastAfricaReturnDialogue: maybePlayEastAfricaReturnDialogue,
    // Post-Otzi-win return: re-render East Africa in place (checkmark + To Egypt
    // box) and play the one-time return dialogue. Replaces the old auto-travel.
    returnToEastAfricaAfterOtzi: returnToEastAfricaAfterOtzi,
    // Post-win return: land at Uruk, reveal the market node, first-time auto-walk
    // into the market. Called by the Gilgamesh battle after its win sequence.
    returnFromGilgameshWin: returnFromGilgameshWin,
    // Called by the Sargon battle module after a PRE-WIN loss: the Sargon-side
    // smack-talk has played on the battle screen; this returns to the Mesopotamia
    // map and plays the Explorer's closing reflection line, then resumes control.
    returnFromSargonLoss: function () {
      // Fresh-page-load guard (see resumeAfterBattle): bind the DOM + restore the
      // saved map, or a dev-panel-launched battle returns to a blank/East Africa map.
      if (!mapImgEl) init();
      isDialogueLocked = true;
      isTransitioning  = false;
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      _clearWipe();
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.show === 'function') hud.show();
      _playMapMusic();
      setTimeout(function () {
        runDialogue(D4_SARGON_LOSS_REFLECT, function () {
          isDialogueLocked = false;
          scheduleIdle();
        });
      }, 250);
    },
    // Called by the Sargon battle module after the FIRST victory: return to the
    // Mesopotamia map, then rise the Hammurabi node out of the dirt (one-time),
    // then restore player control.
    returnFromSargonWin: function () {
      // Fresh-page-load guard (see resumeAfterBattle): bind the DOM + restore the
      // saved map, or a dev-panel-launched battle returns to a blank/East Africa map.
      if (!mapImgEl) init();
      isDialogueLocked = true;
      isTransitioning  = false;
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      _clearWipe();
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.show === 'function') hud.show();
      _refreshNodeFlags(true);   // render flags with the just-won stamp DEFERRED (timed choreo thunks it)
      // Serf-win beat (general template): _refreshNodeFlags just rendered the GIANT flag
      // for the first time (Serf now beaten). Hide it so it can ERECT as its own beat,
      // after the Serf stamp lands — shared _playReturnFlagAnim choreography with Gilgamesh.
      var giantFlagEl = _consumePendingFlagReveal();
      // Hold the music: fade out whatever is playing (the Sargon battle track) so
      // the Hammurabi earth-rise plays against silence (its own earthspell.mp3),
      // then fade the map music back in once the reveal has fully finished.
      if (window.SOG && SOG.music && typeof SOG.music.fadeOutAndStop === 'function') {
        SOG.music.fadeOutAndStop(600);
      }
      // After the flags animate (300ms → Serf stamp → 200ms → Giant erect): Hammurabi
      // rises (serf-track gate) + the interstitial reflection, then control is restored.
      var proceed = function () {
        // Serf-track gate: a Giant win (e.g. lost the Serf first, then won the Giant)
        // must NOT open Hammurabi — only a Sargon SERF clear does.
        if (!_bossClearedForUnlock('sargon')) {
          _playMapMusic();
          isDialogueLocked = false;
          scheduleIdle();
          return;
        }
        _maybeRevealHammurabiNode(function () {
          _playMapMusic();   // node has risen — fade the overworld track back in
          runDialogue(D4_SARGON_WIN_REFLECT, function () {
            isDialogueLocked = false;
            scheduleIdle();
          });
        });
      };
      _playReturnFlagAnim(giantFlagEl, proceed);
    },

    /* Hammurabi SERF-win return — the same shape as returnFromSargonWin above,
       one step further along the serf track: stamp the Serf flag, ERECT the Giant
       flag, then rise the HANGING GARDENS node with the interstitial bookended
       around it (REFLECT → shimmer → REACTION, owned by
       _maybeRevealHangingGardensNode). Reuses the shared choreography — no new
       systems. Called by the Hammurabi module's _exitToOverworldAfterSerfWin. */
    returnFromHammurabiWin: function () {
      // Same guard resumeAfterBattle uses: a battle launched on a FRESH page load
      // (dev-panel launch) never initialized the overworld, so the DOM refs are
      // unbound and currentMapId is still the boot default — without this the
      // return strands the player on East Africa.
      if (!mapImgEl) init();
      isDialogueLocked = true;
      isTransitioning  = false;
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      _clearWipe();
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.show === 'function') hud.show();
      _refreshNodeFlags(true);   // render flags with the just-won stamp DEFERRED
      var giantFlagEl = _consumePendingFlagReveal();
      // Hold the music so the Gardens shimmer plays against silence (its own
      // magicshimmer.m4a), then fade the map track back in once it's done.
      if (window.SOG && SOG.music && typeof SOG.music.fadeOutAndStop === 'function') {
        SOG.music.fadeOutAndStop(600);
      }
      var proceed = function () {
        // Serf-track gate: only a Hammurabi SERF clear opens the Hanging Gardens
        // (a Giant-first win must not skip the track).
        if (!_bossClearedForUnlock('hammurabi')) {
          _playMapMusic();
          isDialogueLocked = false;
          scheduleIdle();
          return;
        }
        _maybeRevealHangingGardensNode(function () {
          _playMapMusic();   // node has risen — fade the overworld track back in
          isDialogueLocked = false;
          scheduleIdle();
        });
      };
      _playReturnFlagAnim(giantFlagEl, proceed);
    },
    /* Nebuchadnezzar SERF-win return — the END of the Mesopotamia serf track, so it
       differs from the Sargon/Hammurabi returns in one way: it raises the GIANT FLAG
       and nothing else. No node reveal (there is no further Mesopotamia node) and no
       advance-or-stay choice — Egypt is earned by his GIANT win, not this one.
       Beat order: 1200ms → Serf stamp → line A → Giant flag ERECTS → line B → control.
       Reuses _playReturnFlagAnim (stamp) + _erectFlagIn (raise) — no new systems.
       Called by the Neb module's _exitToOverworldAfterSerfWin. */
    returnFromNebWin: function () {
      // Fresh-page-load guard (see resumeAfterBattle): bind the DOM + restore the map.
      if (!mapImgEl) init();
      isDialogueLocked = true;
      isTransitioning  = false;
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      _clearWipe();
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.show === 'function') hud.show();
      _playMapMusic();
      _refreshNodeFlags(true);                       // render, DEFER the stamp
      var giantFlagEl = _consumePendingFlagReveal(); // hidden, ready to erect
      // Stamp the Serf flag first (no erect passed), then the line, then the raise.
      _playReturnFlagAnim(null, function () {
        runDialogue(D5_NEB_WIN_INTERSTITIAL_A, function () {
          _erectFlagIn(giantFlagEl, function () {
            runDialogue(D5_NEB_WIN_INTERSTITIAL_B, function () {
              isDialogueLocked = false;
              scheduleIdle();
            });
          });
        });
      });
    },
    /* Narmer SERF-win return — IDENTICAL in shape to returnFromNebWin above, and for
       the same reason: Narmer is the last boss BUILT, so this raises the GIANT FLAG
       and nothing else. No node reveal (the next Egypt node doesn't exist yet) and no
       advance-or-stay choice. Beat order: Serf stamp → lines A → Giant flag ERECTS →
       line B → control. Reuses _playReturnFlagAnim (stamp) + _erectFlagIn (raise) —
       no new systems. Called by the Narmer module's _exitToOverworldAfterSerfWin. */
    returnFromNarmerWin: function () {
      // Fresh-page-load guard (see resumeAfterBattle): bind the DOM + restore the map.
      if (!mapImgEl) init();
      isDialogueLocked = true;
      isTransitioning  = false;
      if (typeof showScreen === 'function') showScreen('screen-overworld');
      _clearWipe();
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.show === 'function') hud.show();
      _playMapMusic();
      _refreshNodeFlags(true);                       // render, DEFER the stamp
      var giantFlagEl = _consumePendingFlagReveal(); // hidden, ready to erect
      // Stamp the Serf flag first (no erect passed), then the lines, then the raise.
      _playReturnFlagAnim(null, function () {
        runDialogue(D6_NARMER_WIN_INTERSTITIAL_A, function () {
          _erectFlagIn(giantFlagEl, function () {
            runDialogue(D6_NARMER_WIN_INTERSTITIAL_B, function () {
              isDialogueLocked = false;
              scheduleIdle();
            });
          });
        });
      });
    },
    // Reusable candle visual for the Gilgamesh post-loss intervention (the
    // battle module fades to black itself, then drives these): bloom the flame
    // over the black + raise the candlelit backdrop, then dismiss it.
    showCuneiformCandle:    _runCuneiformCandle,
    fadeOutCuneiformCandle: _fadeOutCandleBackdrop,
    // Devtools helpers
    goToMap: function (mapId) {
      if (!MAPS[mapId]) { console.warn('No such map:', mapId); return; }
      transitionToMap(mapId, MAPS[mapId].spawn);
    },
    // Force-trigger Phase D1 for testing (bypasses the Mesopotamia arrival gate)
    playD1: function () {
      console.log('[D1] Force-triggering Mesopotamia arrival sequence');
      startMesopotamiaArrival();
    },
    // Called by battle stubs / battle modules when returning to the overworld.
    // Re-engages idle walk and refreshes the HUD without a full map reload.
    resumeAfterBattle: function () {
      // Guard: a battle launched on a FRESH page load (dev-menu scene jump) never
      // initialized the overworld — DOM refs unbound, currentMapId at its boot
      // default. Run the full init (binds DOM, restores the saved map + position),
      // or the battle exit strands the player on the wrong map.
      if (!mapImgEl) init();
      isTransitioning  = false;
      _clearWipe();
      _removeCandleBackdrop();   // defensive: clear any lingering candlelit backdrop
      var hud = window.SOG && window.SOG.HUD;
      if (hud) { hud.show(); }
      _playMapMusic();   // resume the overworld track (battle music was stopped at endGame)
      // Stamp a freshly-beaten tier's flag with a 300ms pause first (mainly the GIANT
      // rematch win, which returns through here). No pending stamp (a loss) → no-op.
      _refreshNodeFlags(true);   // render, DEFER the stamp
      // Consume a pending Giant-flag reveal (set centrally by game.js on a boss's
      // FIRST-ever tier win) so bosses returning through this generic path
      // (Hammurabi / Narmer / Hanging Gardens) get the same erect choreography
      // as the dedicated Gilgamesh/Sargon returns. Null when nothing is pending.
      _playReturnFlagAnim(_consumePendingFlagReveal(), null);

      // Catch-up Hammurabi node reveal. The node normally rises via
      // returnFromSargonWin (the FIRST Sargon win). But a save that beat Sargon
      // before this feature existed — and EVERY repeat Sargon win (which returns
      // through here, not returnFromSargonWin) — would otherwise never see it. So:
      // if Sargon is beaten, the node hasn't risen yet, and we're on the
      // Mesopotamia map, rise it now (+ the Explorer line), then resume.
      var _sargonDone = false, _hammRevealed = false;
      _sargonDone = _bossClearedForUnlock('sargon');   // Serf-track: only a Sargon SERF win reveals Hammurabi
      try { _hammRevealed = localStorage.getItem(KEY_HAMMURABI_NODE_REVEALED) === 'true'; } catch (e) {}
      if (_sargonDone && !_hammRevealed && currentMapId === 'mesopotamia') {
        isDialogueLocked = true;
        setTimeout(function () {
          _maybeRevealHammurabiNode(function () {
            runDialogue(D4_SARGON_WIN_REFLECT, function () {
              isDialogueLocked = false;
              scheduleIdle();
            });
          });
        }, 350);
        log('resumeAfterBattle() — Hammurabi catch-up reveal');
        return;
      }

      // Catch-up Hanging Gardens reveal. Same robust pattern as the Hammurabi node
      // above: fires on return to Mesopotamia whether it's the FIRST Hammurabi win
      // or a return on an already-beaten save. Gated once via the reveal flag. (By
      // the time Hammurabi is beaten his own node is already revealed, so this runs
      // after the Hammurabi catch-up above has been satisfied.)
      var _hammDone = false, _hgRevealed = false;
      _hammDone = _bossClearedForUnlock('hammurabi');   // Serf-track: only a Hammurabi SERF win reveals the Hanging Gardens
      try { _hgRevealed = localStorage.getItem(KEY_HANGING_GARDENS_REVEALED) === 'true'; } catch (e) {}
      if (_hammDone && !_hgRevealed && currentMapId === 'mesopotamia') {
        isDialogueLocked = true;
        setTimeout(function () {
          _maybeRevealHangingGardensNode(function () {
            isDialogueLocked = false;
            scheduleIdle();
          });
        }, 350);
        log('resumeAfterBattle() — Hanging Gardens catch-up reveal');
        return;
      }

      // Post-Nebuchadnezzar → Egypt on-ramp. Same robust catch-up pattern as the
      // Hammurabi / Hanging Gardens reveals above: fires on return to Mesopotamia
      // whether it's the FIRST Neb win or a return on an already-Neb-beaten save,
      // and exactly once (the flag is set at the END of the beat). Sequence:
      // ~5s "looking around expectantly" idle (alive, input locked) → the
      // "abracadabra" lines → set sog_egypt_node_live (Double Crown goes live) →
      // flash the To Egypt exit for 3s → restore control (normal travel takes over).
      var _nebDone = false, _egyptLive = false;
      // EGYPT IS EARNED BY NEB'S *GIANT* WIN — the one place the serf-track rule does
      // NOT apply. Neb is the last Mesopotamia boss and Egypt is a whole separate
      // region, so it must be fully earned: his SERF win only raises his Giant flag
      // (see returnFromNebWin), and this on-ramp — which SETS sog_egypt_node_live at
      // the end of its beat — waits for the Giant. That flag stays the SINGLE
      // Mesopotamia-complete / Egypt-ready signal (no parallel flag): the Double
      // Crown node's showIf, the Egypt topo-prop swap and the Egypt arrival beat all
      // already read it, and the future Egypt-advancement build should read it too.
      _nebDone = _tierBeaten('hanging-gardens', 'giant');
      try { _egyptLive = localStorage.getItem(KEY_EGYPT_NODE_LIVE) === 'true'; } catch (e) {}
      if (_nebDone && !_egyptLive && currentMapId === 'mesopotamia') {
        isDialogueLocked = true;          // clicks/travel locked for the whole beat
        cancelIdle();
        startIdleRoutine();               // map-reading idle → reads as ALIVE, not frozen
        setTimeout(function () {
          cancelIdle();
          setStanding();
          runDialogue(EGYPT_ONRAMP_DIALOGUE, function () {
            try { localStorage.setItem(KEY_EGYPT_NODE_LIVE, 'true'); } catch (e) {}
            isDialogueLocked = false;
            flashExit('to-egypt', 3000);  // 3s attention-grab on the EXISTING travel path
            scheduleIdle();
          });
        }, 5000);
        log('resumeAfterBattle() — post-Neb Egypt on-ramp');
        return;
      }

      isDialogueLocked = false;
      scheduleIdle();
      log('resumeAfterBattle() — player control restored');
    }
  };
})();

window.Overworld = Overworld;

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

  /* ════════════════════════════════════════════════════════════
     ADVENTURE MODE INTRO — two separate dialogue phases
     ════════════════════════════════════════════════════════════
     PHASE 1: fires 3s after the player arrives at East Africa.
              All explorer lines. Player movement locked.
     PHASE 2: fires when the player clicks the Prehistory node
              (only the first time). Explorer + Lucy exchange.
              Walk to the node happens AFTER this dialogue. */

  var PHASE1_DIALOGUE = [
    { who: 'explorer', text: 'Huh\u2026 That was strange.' },
    { who: 'explorer', text: 'I should probably be more careful about going through dark doorways.' },
    { who: 'explorer', text: 'At least this place looks familiar\u2026' },
    { who: 'explorer', text: 'Is that Mount Kilimanjaro?' },
    { who: 'explorer', text: 'I think that means I\u2019m in East Africa.' },
    { who: 'explorer', text: 'But where are all the people?' }
  ];

  /* Post-Neanderthal-victory overworld dialogue \u2014 8 lines, click-to-advance.
     Fires once after the player wins the Neanderthal battle and returns to
     the overworld.  Ends with Lucy handing the player her card. */
  var POST_NEANDERTHAL_DIALOGUE = [
    { who: 'explorer', text: 'Wow, I can\u2019t believe I just interacted with a real Neanderthal.' },
    { who: 'lucy',     text: 'That\u2019s an interesting way to describe a near-death experience.'  },
    { who: 'explorer', text: 'I couldn\u2019t have done it without you.'                            },
    { who: 'lucy',     text: 'You Homo sapiens wouldn’t exist if it weren’t for me.'             },
    { who: 'explorer', text: 'I can\u2019t wait to see the rest of the Ancient World.'             },
    { who: 'lucy',     text: 'About that.' },
    { who: 'lucy',     text: 'I can walk, but these old bones don\u2019t migrate.'    },
    { who: 'explorer', text: 'I guess this is goodbye?'                                            },
    { who: 'lucy',     text: 'Take this.'                                                          }
  ];

  /* Otzi encounter dialogue — fires when the player first clicks the
     Egypt signpost (sog_battle_otzi_complete not yet set). Click-to-
     advance, portrait boxes, same runner as all other overworld dialogue. */
  var OTZI_PRE_BATTLE_DIALOGUE = [
    { who: "otzi",     text: "Where do you think you’re going?"                              },
    { who: "explorer", text: "I’m ready to see the rest of the world."                       },
    { who: "otzi",     text: "You look like you’re ready to take an arrowhead to the back." },
    { who: "explorer", text: "That’s not very nice."                                          },
    { who: "otzi",     text: "The world isn’t very nice."                                    },
    { who: "explorer", text: "Okay, I’ll just be on my way..."                                      },
    { who: "otzi",     text: "No, you won’t."                                                       },
    { who: "explorer", text: "I’m starting to sense a pattern."                                     }
  ];

  /* ── Phase D1 — Otzi→Mesopotamia travel dialogue ───────────────────
     Three scenes: East Africa (12 lines) → Egypt (11 lines) → Mesopotamia (5 lines).
     After each scene the Explorer walks off the right edge; a "Traveling…" transition
     swaps the map. Triggered once from the Otzi-victory "Back to Map" button when
     sog_mesopotamia_arrival_complete is not yet set.                              */
  var D1_SCENE1_DIALOGUE = [
    { who: 'explorer', text: 'History seems to have a lot of conflict.'                                       },
    { who: 'hunter',   text: 'Tell me about it.'                                                               },
    { who: 'explorer', text: 'Oh, hey Hunter, why is that?'                                                    },
    { who: 'hunter',   text: "Don't you see these other tribes butting in on my territory?"                    },
    { who: 'explorer', text: 'Not really.'                                                                     },
    { who: 'hunter',   text: "How am I supposed to feed my tribe with these outlanders killing all my antelope?" },
    { who: 'explorer', text: 'Share?'                                                                          },
    { who: 'hunter',   text: 'Yeah, right.'                                                                    },
    { who: 'explorer', text: "Well, I'm going to travel east."                                                 },
    { who: 'explorer', text: 'Maybe you can settle somewhere new?'                                             },
    { who: 'hunter',   text: "That's so crazy, it just might work."                                           },
    { who: 'explorer', text: "Let's go!"                                                                       }
  ];

  var D1_SCENE2_DIALOGUE = [
    { who: 'explorer', text: 'Wow, look at that huge river!'                                   },
    { who: 'hunter',   text: 'Ah, Kemet, the black land...'                    },
    { who: 'explorer', text: "What's that supposed to mean?"                                                   },
    { who: 'hunter',   text: "Look at the soil. It's so rich. It's black."                                                  },
    { who: 'explorer', text: 'Oh okay.'                                                                        },
    { who: 'hunter',   text: "I'd heard rumors of this place along the Nile."                                   },
    { who: 'explorer', text: 'Oh right, the Nile.' },
    { who: 'explorer', text: 'This is Egypt!' },
    { who: 'explorer', text: 'But where are all the pyramids?'                                     },
    { who: 'hunter',   text: "What's a pyramid?"                                                               },
    { who: 'explorer', text: "I think we're too early." },
    { who: 'explorer', text: "Perhaps, we'll come back later."                },
    { who: 'hunter',   text: 'Whatever you say stranger.'                                                      }
  ];

  var D1_SCENE3_DIALOGUE = [
    { who: 'hunter',   text: 'Mesopotamia!' },
    { who: 'explorer', text: "What's a Meso-potato?" },
    { who: 'hunter',   text: 'Mesopotamia. It means the land between the rivers.' },
    { who: 'explorer', text: "That must be why it's so green." }
  ];

  /* ── Phase D2a — Mesopotamia extended arrival dialogue ─────────────
     Continues immediately after D1 Scene 3 ("It looks so green.").
     River walk → Hunter transformation → farming dialectic → Walls of
     Uruk node → Farmer departure → player regains control.           */
  var D2A_FARMING_DIALOGUE = [
    { who: 'explorer', text: 'You look different.'                                                             },
    { who: 'farmer',   text: 'I feel different.'                                                               },
    { who: 'farmer',   text: "Maybe I don't need to hunt animals all of the time."                            },
    { who: 'explorer', text: 'What will you do instead?'                                                       },
    { who: 'farmer',   text: 'On this land, I can grow anything.' },
    { who: 'explorer', text: 'I see.' },
    { who: 'farmer',   text: 'And if I grow enough, I could have a surplus to sell.' },
    { who: 'farmer',   text: 'And from there, people can specialize in different jobs.' },
    { who: 'farmer',   text: 'And with specialization, comes…' }
  ];

  /* \u2500\u2500 Phase D2b \u2014 Gilgamesh encounter dialogue \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  var D2B_GILGAMESH_DIALOGUE = [
    { who: 'gilgamesh', text: 'Welcome to my city, Uruk.'                          },
    { who: 'explorer',  text: 'Oh hi! You must be the mayor.'                      },
    { who: 'gilgamesh', text: 'How dare you confuse me for a civil servant?!'    },
    { who: 'explorer',  text: 'What?'                                              },
    { who: 'gilgamesh', text: 'I am Gilgamesh. King Gilgamesh.' },
    { who: 'explorer',  text: 'But you said it was just a city.' },
    { who: 'gilgamesh', text: 'Just a city? It’s my city-state.' },
    { who: 'explorer',  text: 'Oh, I\u2019m sorry\u2026'                          },
    { who: 'gilgamesh', text: 'You will be.'                                       }
  ];

  /* ── Phase D3a — Gilgamesh "challenge again" + post-loss Farmer/Cuneiform ──
     The pre-battle Farmer 5-card-grant + Deck Builder sequence was removed in
     D3a; the candle + Farmer dialogue helpers are reused. The post-loss Cuneiform
     intervention now lives in the Gilgamesh battle module (_runCuneiformIntervention
     in sog-adventure-gilgamesh.js).                                          */
  var D3_GILGAMESH_CHALLENGE_AGAIN = [
    { who: 'gilgamesh', text: 'You dare to challenge me again?!'                 },
    { who: 'explorer',  text: 'I have learned from my mistakes.'                 },
    { who: 'gilgamesh', text: 'Prepare to be swept into the dustbin of history.' }
  ];
  // Post-loss intervention dialogue, split around the Cuneiform card grant.
  var D3_FARMER_POSTLOSS_A = [
    { who: 'farmer',   text: 'Hey, that was a tough battle you lost.'      },
    { who: 'explorer', text: 'His cards were so much more advanced.'       },
    { who: 'farmer',   text: 'Of course. You were playing in Prehistory.'  },
    { who: 'farmer',   text: "You didn't stand a chance."                  },
    { who: 'explorer', text: 'What do I do?'                               },
    { who: 'farmer',   text: 'Bring your cards up to date.'                },
    { who: 'explorer', text: 'How?'                                        },
    { who: 'farmer',   text: 'With writing.'                               }
  ];
  // [Cuneiform card acquisition fires here]
  var D3_FARMER_POSTLOSS_B = [
    { who: 'farmer',   text: 'With Cuneiform, you give your cards the ability to record what we know and pass it on.' },
    { who: 'explorer', text: 'Thank you.'                                  }
  ];
  var D2C_AUTO_DISMISS_MS    = 1500;
  var KEY_GILGAMESH_PHASE1   = 'sog_gilgamesh_phase1_complete';
  var KEY_CUNEIFORM_GRANTED  = 'sog_cuneiform_granted';

  var PHASE2_DIALOGUE = [
    { who: 'lucy',     text: 'Mmmhm\u2026' },
    { who: 'lucy',     text: 'I\u2019m standing right here.' },
    { who: 'explorer', text: 'Woah, you can talk?' },
    { who: 'explorer', text: 'I thought you were an ape?' },
    { who: 'lucy',     text: 'Australopithecus to the uninitiated.' },
    { who: 'explorer', text: 'Uh, yeah... I totally know what that means.' },
    { who: 'lucy',     text: 'It means I\u2019m one of the earliest human ancestors to stand on two legs.' },
    { who: 'explorer', text: 'Congratulations!' },
    { who: 'lucy',     text: 'You\u2019re welcome.' },
    { who: 'explorer', text: 'But that doesn\u2019t explain why you can talk.' },
    { who: 'lucy',     text: 'Nothing will.' },
    { who: 'lucy',     text: 'Don\u2019t over think it.' },
    { who: 'explorer', text: 'Fair enough.' },
    { who: 'explorer', text: 'But that must mean I traveled back in time.' },
    { who: 'explorer', text: 'Like way back.' },
    { who: 'lucy',     text: 'Like I said, don\u2019t over think it.' },
    { who: 'explorer', text: 'Well then, I guess I better get going.' }
  ];

  var PHASE1_WAIT_MS = 3000;    // 3s arrival pause before Phase 1 fires

  /* ── Post-Otzi East Africa flow dialogue (reuses the standard runner) ── */
  // One-time, first return to East Africa after beating Otzi.
  var EASTAFRICA_POSTOTZI_DIALOGUE = [
    { who: 'explorer', text: 'Who knew history had so much conflict?'                  },
    { who: 'hunter',   text: 'Tell me about it.'                                       },
    { who: 'explorer', text: 'What do you mean?'                                       },
    { who: 'hunter',   text: 'These other tribes won’t leave my antelope alone.' },
    { who: 'explorer', text: 'Are they like your pets?' },
    { who: 'hunter',   text: 'They’re like my lunch.' },
    { who: 'explorer', text: 'Oh, right.' },
    { who: 'explorer', text: 'Couldn’t you share?'                                },
    { who: 'hunter',   text: 'What does that mean?'                                    }
  ];
  // One-time, on the FIRST return from the marketplace — un-greys the deck builder.
  var DECKBUILDER_UNLOCK_DIALOGUE = [
    { who: 'explorer', text: 'I’m starting to build quite a collection.' },
    { who: 'explorer', text: 'Let’s see if I can build a deck.'          }
  ];
  // One-time, first click of the To Egypt box — plays before the walk-off.
  var TOEGYPT_GOODBYE_DIALOGUE = [
    { who: 'hunter',   text: 'Hey, where are you going?'                               },
    { who: 'explorer', text: 'I want to see the rest of the world.'                    },
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
     MAP DATA — easy to extend for new regions
     ════════════════════════════════════════════════════════════
     Each map: image, spawn (default entry), startsFogged, nodes, exits.
     Nodes/exits coords are % of the map div (container). ────── */
  var SPRITE_PATH = 'images/metaworld/character sprites/female/';
  var NODE_PATH   = 'images/metaworld/civilization nodes/';
  var MAP_PATH    = 'images/metaworld/maps/';

  var MAPS = {
    'eastafrica': {
      displayName: 'East Africa',
      image: MAP_PATH + 'eastafrica.jpeg',
      // Spawn: at the foot of Kilimanjaro — right of the explorer dialogue box
      // (box is at left:35% viewport; character at x:65 puts her clearly east of it).
      spawn: { x: 70, y: 90 },
      startsFogged: false,
      nodes: [
        {
          id:     'egypt-signpost',
          name:   'To Egypt',
          // No label — the separate To Egypt box (visible post-victory) handles navigation.
          image:  NODE_PATH + 'toegypt.png',
          x: 20, y: 20,
          // Hidden until the player completes the Neanderthal battle and the
          // post-victory overworld sequence plays (_completePostVictorySequence
          // sets this flag then immediately calls _refreshNodes so the node appears).
          showIf: function () {
            try {
              return localStorage.getItem(KEY_POST_NEANDERTHAL_DIALOGUE) === 'true';
            } catch (e) { return false; }
          },
          // Short northwest walk from the Prehistory node area to the signpost.
          path: [
            { x: 28, y: 28 },
            { x: 20, y: 20 }
          ]
        },
        {
          id:    'prehistory',
          name:  'Prehistory',
          image: NODE_PATH + 'prehistory node.png',
          x: 38, y: 35,
          // Waypoints — a C-shape around the west side of Lake Victoria,
          // staying wide enough to avoid the lakes and mountains NW of it.
          //   wp1: turn left early, well south of the lake
          //   wp2: due west of the lake (far enough west to clear the NW lakes)
          //   wp3: arc east-northeast, staying south of the NW mountain range
          //   wp4: approach the node from below
          //   wp5: arrive at the node
          path: [
            { x: 45, y: 72 },   // step left and slightly up from Kilimanjaro
            { x: 28, y: 65 },   // continue northwest
            { x: 20, y: 50 },   // far west — clear of all western lakes
            { x: 22, y: 40 },   // northwest corner of the arc
            { x: 32, y: 38 },   // curve east, south of the mountains
            { x: 38, y: 35 }    // arrive at the node
          ]
        }
      ],
      exits: [
        {
          // Forward exit to Egypt. Sits at the top of the screen just right of
          // the egypt-signpost (Otzi) node at x:20,y:20. GATED: only rendered
          // once the player has beaten Otzi (sog_battle_otzi_complete) \u2014 same
          // flag the Otzi card grant / signpost checkmark use. Mirrors the
          // "To Mesopotamia"/"To East Africa" boxes exactly; entryAt matches the
          // D1 East Africa->Egypt arrival point (Egypt's west spawn).
          id:      'to-egypt',
          label:   'To Egypt \u2192',
          zone:    { x: 29, y: 5, w: 22, h: 24 },
          walkTo:  { x: 28, y: 16 },   // fallback target if gsap is unavailable
          walkOff: true,               // dramatic off-screen walk toward Egypt (reuses the D1 walk-off), not a short hop
          target:  'egypt',
          entryAt: { x: 10, y: 85 },
          showIf:  function () {
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
      ]
    },

    'egypt': {
      displayName: 'Egypt',
      image: MAP_PATH + 'egypt.jpeg',
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      nodes: [],   // placeholder for future
      exits: [
        {
          id:      'to-mesopotamia',
          label:   'To Mesopotamia \u2192',
          zone:    { x: 80, y:  5, w: 20, h: 30 },
          walkTo:  { x: 88, y: 15 },
          target:  'mesopotamia',
          entryAt: { x: 10, y: 85 }
        },
        {
          id:      'to-eastafrica',
          label:   '\u2190 To East Africa',
          zone:    { x: 0, y: 70, w: 20, h: 30 },
          walkTo:  { x: 10, y: 85 },
          target:  'eastafrica',
          entryAt: { x: 88, y: 15 }  // top-right of East Africa
        }
      ]
    },

    'mesopotamia': {
      displayName: 'Mesopotamia',
      image: MAP_PATH + 'mesopotamia.jpeg',
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      nodes: [
        {
          id:    'winged-akkad',
          name:  'Akkad',
          image: NODE_PATH + 'winged akkad node.png',
          x: 42, y: 52,
          // TODO (Phase D3+): remove this gate when Akkad content is ready
          showIf: function () {
            try { return localStorage.getItem('sog_full_mesopotamia_unlock') === 'true'; } catch (e) { return false; }
          }
        },
        {
          id:    'hammurabi',
          name:  'Hammurabi\u2019s Code',
          image: NODE_PATH + 'hammurabi code node.png',
          x: 58, y: 60,
          // TODO (Phase D3+): remove this gate when Hammurabi content is ready
          showIf: function () {
            try { return localStorage.getItem('sog_full_mesopotamia_unlock') === 'true'; } catch (e) { return false; }
          }
        },
        {
          // Phase D2a: visible after sog_mesopotamia_arrival_complete is set.
          // Click handler is a stub \u2014 the Gilgamesh encounter lives in Phase D2b.
          id:    'walls-of-uruk',
          name:  'Walls of Uruk',
          image: NODE_PATH + 'wallsofuruk@0.33x.png',
          x: 72, y: 82,
          scale: 1.35,
          showIf: function () {
            try { return localStorage.getItem(KEY_MESOPOTAMIA_ARRIVAL) === 'true'; } catch (e) { return false; }
          }
        },
        {
          // Mesopotamian Marketplace. GATED: appears only after the Gilgamesh win
          // (KEY_BATTLE_GILGAMESH_COMPLETE) — same completion-flag gating as the
          // To Egypt box. Placed near the Uruk node; position is provisional and
          // will be fine-tuned. First win auto-walks here (see returnFromGilgameshWin);
          // afterwards it's a clickable node that re-enters the market placeholder.
          id:    'market',
          name:  'Mesopotamian Marketplace',
          image: NODE_PATH + 'mesomarketnode@0.5x.png',
          x: 80, y: 66,
          scale: 2,   // node sprite rendered too small at natural size — double it
          flipX: true, // mirror the stall sprite horizontally to face the other way
          showIf: function () {
            try { return localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true'; } catch (e) { return false; }
          }
        }
      ],
      exits: [
        {
          id:      'to-egypt',
          label:   '\u2190 To Egypt',
          zone:    { x: 0, y: 70, w: 20, h: 30 },
          walkTo:  { x: 10, y: 85 },
          target:  'egypt',
          entryAt: { x: 88, y: 15 }
        }
      ]
    }
  };

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
    if (footstepsHowl && !footstepsHowl.playing()) footstepsHowl.play();
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
    if (_wooshHowl) { try { _wooshHowl.stop(); _wooshHowl.play(); } catch (e) {} }
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
  function loadMap(mapId, opts) {
    opts = opts || {};
    var data = MAPS[mapId];
    if (!data) { console.warn('[Overworld] Unknown map:', mapId); return; }

    currentMapId = mapId;
    // Fix 4: toggle body class so Explorer dialogue box can be re-centred on foreign maps
    document.body.classList.toggle('overworld-away-from-home', mapId !== 'eastafrica');
    mapImgEl.src = data.image;

    // Update the HUD region label to the current map's display name (dynamic —
    // never hardcoded). Guarded: a no-op if the HUD isn't present/ready.
    if (window.SOG && SOG.HUD && typeof SOG.HUD.setRegion === 'function') {
      SOG.HUD.setRegion(data.displayName || mapId);
    }

    // Clear overlay. Character is re-appended LAST (after nodes and exits)
    // so it always paints on top in DOM order — prevents node images from
    // covering the character when she stands at the same position as a node.
    overlayEl.innerHTML = '';

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
    });

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
  }

  function showFog(on) {
    fogEl.classList.toggle('active', !!on);
    if (on) fogEl.style.opacity = '1';
  }

  /* ── Node click ────────────────────────────────────────────── */
  function onNodeClick(node) {
    if (isMoving || isTransitioning || isDialogueLocked) return;
    // Clicking the Prehistory node ends the urgent idle pulse if active
    clearUrgentPulse();

    // ── Walls of Uruk — Phase D3a: Gilgamesh Battle 1 ──────────
    if (node.id === 'walls-of-uruk' && currentMapId === 'mesopotamia') {
      isDialogueLocked = true;
      cancelIdle();
      var battleDone = false, phase1Done = false, hasCuneiform = false;
      try { battleDone   = localStorage.getItem(KEY_BATTLE_GILGAMESH_COMPLETE) === 'true'; } catch (e) {}
      try { phase1Done   = localStorage.getItem(KEY_GILGAMESH_PHASE1) === 'true'; } catch (e) {}
      try { hasCuneiform = localStorage.getItem(KEY_CUNEIFORM_GRANTED) === 'true'; } catch (e) {}

      walkPath([{ x: node.x, y: node.y }], function () {
        if (battleDone || phase1Done) {
          // D3a placeholder — D3b replaces with the Battle 2 flow. For now,
          // re-enter Battle 1 directly (no encounter dialogue).
          log('[D3a] phase1/battle complete — placeholder re-entry to Battle 1');
          _launchGilgameshBattle();
        } else if (hasCuneiform) {
          // Attempt 2 re-entry: "challenge again" exchange → battle.
          _runGilgameshEncounter(D3_GILGAMESH_CHALLENGE_AGAIN, _launchGilgameshBattle);
        } else {
          // First run: "Welcome to my city" exchange → Battle 1 Attempt 1.
          _runGilgameshEncounter(D2B_GILGAMESH_DIALOGUE, _launchGilgameshBattle);
        }
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

  function log(step) { console.log('[Adventure Intro] ' + step); }

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
    _d1PlaceUmmelqaab();
    runDialogue(D1_SCENE2_DIALOGUE, function () {
      isDialogueLocked = false;
      try { localStorage.setItem(KEY_EGYPT_ARRIVAL, 'true'); } catch (e) {}
      flashExit('to-mesopotamia', 1500);
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

    runDialogue(POST_NEANDERTHAL_DIALOGUE, function () {
      isDialogueLocked = false;
      // runDialogue already faded out the boxes — now show Lucy's card.
      var lucyCard = (typeof CARDS !== 'undefined') &&
                     CARDS.find(function (c) { return c.id === 33; });
      var preh = window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory;
      if (lucyCard && preh && typeof preh.showCardAcquisition === 'function') {
        preh.showCardAcquisition(lucyCard, null, _completePostVictorySequence);
      } else {
        _completePostVictorySequence();
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
          _d1PlaceUmmelqaab();
          runDialogue(D1_SCENE2_DIALOGUE, function () {
            // Explorer walks off the right edge — keep the Umm el-Qaab
            // decoration on screen during the walk.
            walkPath([{ x: 115, y: currentPos.y }], function () {
              // Remove the Egypt decoration only now, as the travel
              // transition's loading screen comes up, so it doesn't linger
              // on the Mesopotamia map.
              var dec = overlayEl && overlayEl.querySelector('.d1-ummelqaab-decoration');
              if (dec && dec.parentNode) dec.parentNode.removeChild(dec);
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

  /* Place the Umm el-Qaab necropolis decoration on the Egypt map overlay.
     Non-interactive visual only — no click handler, no hover label. */
  function _d1PlaceUmmelqaab() {
    if (!overlayEl) return;
    // Remove any stale decoration from a previous D1 run (shouldn't happen,
    // but be defensive about it).
    var existing = overlayEl.querySelector('.d1-ummelqaab-decoration');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var dec = document.createElement('img');
    dec.className = 'd1-ummelqaab-decoration';
    dec.src = 'images/metaworld/topography/ummelqaab@0.25x.png';
    dec.alt = '';
    dec.draggable = false;
    // Position along the Nile — left side of the Egypt map
    dec.style.cssText = [
      'position:absolute',
      'left:16%',
      'top:37%',
      'transform:translate(-50%,-50%) scale(0.4)',
      'transform-origin:center center',
      'pointer-events:none',
      'user-select:none'
    ].join(';');
    overlayEl.insertBefore(dec, charEl);
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
  var D2A_RIVER_STOP = { x: 54, y: 65 };

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
            try { new Audio('sfx/uruk.mp3').play(); } catch (e) {}   // sound on impact
            // small squash-settle on landing
            gsap.fromTo(nodeEl, { scale: 1.55 }, { scale: 1.35, duration: 0.22, ease: 'power2.out' });
            log('[D2a] Walls of Uruk node dropped in');
            if (onDone) onDone();
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
      { who: 'explorer', text: 'Cities!' },
      { who: 'farmer',   text: "But the land isn't going to farm itself. Bye!" }
    ], function () {
      // Farmer slides down — NPC gone, but dialogue mode stays active
      hud.slideOutNpc(function () {
        // Explorer delivers the final line alone
        _runLinesKeepOpen([
          { who: 'explorer', text: "Lets go check out that city!" }
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

  /* Candle transition (Phase D2d-b). Extends the iris primitive:
       iris closes to black → ~1.2s silent hold (portrait swap happens here)
       → matchstrike SFX + a white point of light blooms center-screen,
       shifting white→orange-red and growing → the black wipe fades out so the
       scene returns lit by a warm radial glow → ~0.5s after the candle settles
       onDialogueReady() fires (HUD dialogue with Farmer) → the warm glow fades
       to normal so nothing lingers into the deck builder.
     onBlackHold(done) runs during the black hold (swap the portrait).        */
  function _d2cCandleTransition(onBlackHold, onDialogueReady) {
    var wipeEl = document.getElementById('adv-radial-wipe');

    if (typeof gsap === 'undefined' || !wipeEl) {
      if (onBlackHold) onBlackHold(function () {});
      _clearWipe();
      if (onDialogueReady) onDialogueReady();
      return;
    }

    _irisClose(function () {
      // Fully black. Swap the portrait now (hidden), hold ~1.2s in silence.
      if (onBlackHold) onBlackHold(function () {});
      gsap.delayedCall(1.2, function () { _runCandle(wipeEl, onDialogueReady); });
    });
  }

  function _runCandle(wipeEl, onDialogueReady) {
    try { var ms = new Audio('sfx/matchstrike.m4a'); ms.play(); } catch (e) {}

    var existing = document.getElementById('adv-candle');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var candle = document.createElement('div');
    candle.id = 'adv-candle';
    candle.style.cssText = 'position:fixed;inset:0;z-index:10002;pointer-events:none;opacity:0;';
    // Append INSIDE #sog-stage: it's a transformed (scaled) stacking context
    // holding the wipe/HUD/reveals, so the candle must live there to layer
    // against them (position:fixed resolves to the stage box).
    (document.getElementById('sog-stage') || document.body).appendChild(candle);

    function setGlow(t, sizePct) {
      var c    = _candleColor(t);
      var core = 'rgb('  + c[0] + ',' + c[1] + ',' + c[2] + ')';
      var warm = 'rgba(' + c[0] + ',' + Math.round(c[1] * 0.5) + ',' + Math.round(c[2] * 0.3) + ',0.55)';
      // Transparent edges — the room's darkness is the black wipe BEHIND this
      // layer, so the warm glow never obscures the HUD at the screen edges.
      candle.style.background =
        'radial-gradient(circle at 50% 48%, ' + core + ' 0%, ' + warm + ' ' + sizePct + '%, transparent ' + (sizePct * 2.2) + '%)';
    }

    setGlow(0, 5);
    gsap.to(candle, { opacity: 1, duration: 0.4, ease: 'power1.out' });

    // Color + size bloom: white point → warm orange-red, expanding (~2.6s).
    var p = { t: 0, size: 5 };
    gsap.to(p, {
      t: 1, size: 24, duration: 2.6, ease: 'power1.inOut',
      onUpdate: function () { setGlow(p.t, p.size); }
    });

    // ~0.5s after the candle settles: hand off to a PERSISTENT dark-room +
    // candle-glow backdrop that sits BELOW the HUD (z 100 < 150), so the
    // Farmer/Explorer dialogue shows on top and the warm glow STAYS for the
    // whole conversation. The bloom candle + black wipe (both above the HUD)
    // then fade out to reveal it. The backdrop is removed when the deck
    // builder opens (or on resumeAfterBattle, defensively).
    gsap.delayedCall(3.1, function () {
      _ensureCandleBackdrop();
      if (onDialogueReady) onDialogueReady();
      gsap.to(candle, {
        opacity: 0, duration: 0.6, ease: 'power1.inOut',
        onComplete: function () { if (candle.parentNode) candle.parentNode.removeChild(candle); }
      });
      gsap.to(wipeEl, {
        opacity: 0, duration: 0.6, ease: 'power1.inOut',
        onComplete: function () { _clearWipe(); wipeEl.style.opacity = '1'; }
      });
    });
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
     (sog-adventure-gilgamesh.js drives it via window.Overworld). Unlike
     _runCandle this is decoupled from the overworld iris/wipe: the caller has
     ALREADY faded the screen to black, so we just strike the match, bloom the
     flame, and hand off to the persistent candlelit backdrop (z 100, below the
     HUD 150) that carries the Farmer conversation. onLit() fires once the flame
     has settled and the backdrop is up. Reuses _candleColor + _ensureCandleBackdrop
     so the flame visual lives in exactly one place; pair with the exported
     fadeOutCuneiformCandle() to dismiss it. */
  function _runCuneiformCandle(onLit) {
    try { var ms = new Audio('sfx/matchstrike.m4a'); ms.play(); } catch (e) {}

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
    hud.enterDialogueMode(null, function () {
      _runLinesKeepOpen(lines, function () {
        try { localStorage.setItem(KEY_MET_GILGAMESH, 'true'); } catch (e) {}
        if (typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(null);
        if (onDone) onDone();
      });
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
     the black out via onMapShown, then — FIRST TIME ONLY — auto-walk her into the
     market. Afterwards the market node just sits there, clickable to revisit. */
  function returnFromGilgameshWin(onMapShown) {
    isDialogueLocked = true;
    isTransitioning  = false;

    // The player came from Mesopotamia, so its map DOM is intact behind the
    // battle screen; make sure it's the current map (defensive).
    if (currentMapId !== 'mesopotamia') loadMap('mesopotamia', {});

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

    // Beat 2: fade the market node in (~after the map fade-from-black).
    setTimeout(function () {
      if (marketEl) {
        if (typeof gsap !== 'undefined') gsap.to(marketEl, { opacity: 1, duration: 0.6, ease: 'power1.out' });
        else marketEl.style.opacity = '1';
      }

      var firstDone = false;
      try { firstDone = localStorage.getItem(KEY_MARKET_FIRST_VISIT) === 'true'; } catch (e) {}

      if (firstDone) {
        // Already visited once — just hand control back; the node is clickable.
        isDialogueLocked = false;
        scheduleIdle();
        return;
      }

      // Beat 3: FIRST TIME — auto-walk to the market node, then enter it.
      var market = _findMesoNode('market');
      var dest   = market ? (market.path || [{ x: market.x, y: market.y }]) : [];
      setTimeout(function () {
        walkPath(dest, function () {
          try { localStorage.setItem(KEY_MARKET_FIRST_VISIT, 'true'); } catch (e) {}
          _enterMarket();
        });
      }, 800);
    }, 650);
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
    { who: 'trader',   text: 'If you have enough gold, the Buy button lights up.' },
    { who: 'trader',   text: 'Tap it, confirm, and the card is yours.' },
    { who: 'explorer', text: 'And then?' },
    { who: 'trader',   text: 'Then it joins your collection — ready for you to build into your deck.' },
    { who: 'trader',   text: 'Spend wisely.' },
    { who: 'trader',   text: "Gold doesn't grow on date palms." }
  ];

  // Positions match samplefinishedmarket.jpg over the (tighter-crop) mesomarket.jpg:
  // shelf 1 = 5 cards on the top shelf, shelf 2 = 4 cards on the lower shelf
  // (Enkidu is the last card on shelf 2 and stays 30 gold — there is no 3rd shelf).
  // `xs` are per-card horizontal CENTERS (%) and `topPct` is the card top (%);
  // per-card `price` drives the tag. Easy to fine-tune.
  var MARKET_SHELVES = [
    { topPct: 14, xs: [25, 34.5, 44, 53.5, 62.5], cards: [
        { id: 39, price: 10 },   // Farmer
        { id: 40, price: 10 },   // Scribe
        { id: 42, price: 10 },   // Soldier
        { id: 41, price: 10 },   // Canals
        { id: 38, price: 10 }    // Priest
    ] },
    { topPct: 40, xs: [26, 37.5, 49, 60], cards: [
        { id: 45, price: 20 },   // Ziggurat
        { id: 48, price: 20 },   // Chariot
        { id: 49, price: 20 },   // Phoenicians
        { id: 44, price: 30 }    // Enkidu (last on shelf 2, stays 30 gold)
    ] }
  ];
  var MARKET_CARD_W = 86;   // px (stage space); height follows the card aspect
  var MARKET_CARD_H = 126;

  function _buildMarketCard(cardId, leftPct, topPct, price) {
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return null;

    var wrap = document.createElement('div');
    wrap.className = 'market-card';
    wrap.style.cssText = 'position:absolute;left:' + leftPct + '%;top:' + topPct + '%;' +
      'width:' + MARKET_CARD_W + 'px;height:' + MARKET_CARD_H + 'px;transform:translateX(-50%);' +
      'container-type:inline-size;cursor:pointer;border:2px solid #1a0a04;border-radius:4px;' +
      'box-shadow:0 4px 10px rgba(0,0,0,.55);overflow:hidden;background:#100a02;';

    // In-game card face (image + CC/IP corners) — same renderer as battle/deck.
    if (window.SOG && SOG.board && typeof SOG.board.buildCardFace === 'function') {
      SOG.board.buildCardFace(wrap, card, card.ip);
    } else if (window.buildCardImg) {
      wrap.appendChild(window.buildCardImg(card));
    }

    wrap.dataset.marketCardId = String(cardId);

    // Click → the market-specific BUY popup (NOT the shared battle popup).
    // Suppressed until the trader intro (first visit) has finished.
    wrap.addEventListener('click', function () {
      if (!_marketReady) return;
      _openMarketBuyPopup(card, price);
    });

    // Price tag — built as a SIBLING of the card (positioned in screen space),
    // NOT a child: the card wrap's overflow:hidden (which clips the rounded card
    // image) would otherwise clip the tag away. Hangs just below the card bottom.
    var tag = document.createElement('div');
    tag.className = 'market-pricetag';
    tag.dataset.marketCardId = String(cardId);
    tag.style.cssText = 'position:absolute;left:' + (leftPct + 0.5) + '%;' +
      'top:calc(' + (topPct - 2) + '% + ' + (MARKET_CARD_H - 8) + 'px);transform:translateX(-50%);' +
      'width:115px;height:77px;background:url("images/ui_images/pricetag@0.5x.png") center/contain no-repeat;' +
      'display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:50;';
    var num = document.createElement('span');
    num.textContent = price;
    num.style.cssText = 'font-family:var(--font, sans-serif);font-size:32px;font-weight:bold;' +
      'color:#3a2400;text-shadow:0 1px 0 rgba(255,230,150,.6);transform:translate(-10px, 3px);';
    tag.appendChild(num);

    return { cardEl: wrap, tagEl: tag };
  }

  function _enterMarket() {
    isDialogueLocked = true;
    cancelIdle();
    stopFootsteps();
    var prev = document.getElementById('adv-market-screen');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    // Backdrop + cards live BELOW the HUD (z-150) so the HUD bar + trader
    // portrait render on top — same layering trick as the candle intervention.
    var screen = document.createElement('div');
    screen.id = 'adv-market-screen';
    screen.style.cssText = 'position:absolute;inset:0;z-index:100;overflow:hidden;' +
      'background:url("images/ui_images/mesomarket.jpg") center/cover no-repeat;';

    // Lay out the cards on their two shelves (card + its price tag). Cards the
    // player already OWNS are skipped — only unowned cards are for sale, so a
    // bought card stays gone (the empty slot is the "you own it" feedback).
    MARKET_SHELVES.forEach(function (shelf) {
      shelf.cards.forEach(function (c, i) {
        if (window.SOG && SOG.collection && typeof SOG.collection.isUnlocked === 'function'
            && SOG.collection.isUnlocked(c.id)) return;   // owned → not for sale
        var leftPct = (shelf.xs[i] != null) ? shelf.xs[i] : (20 + i * 12);
        var built   = _buildMarketCard(c.id, leftPct, shelf.topPct, c.price);
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

    // On the FIRST visit, play the trader intro dialogue (gated on
    // KEY_MARKET_INTRO_SEEN) before the player can shop. Once it finishes we drop
    // the HUD back to its NORMAL resting state so the player can see their gold
    // balance while shopping (the trader is still visible in the shelf scene). On
    // revisits we never enter dialogue mode at all. Shopping is suppressed via
    // _marketReady until the intro finishes. Degrades gracefully without the HUD.
    _marketReady = false;
    var hud = window.SOG && window.SOG.HUD;
    var introSeen = false;
    try { introSeen = localStorage.getItem(KEY_MARKET_INTRO_SEEN) === 'true'; } catch (e) {}

    if (hud && !introSeen && typeof hud.enterDialogueMode === 'function'
        && typeof hud.runLines === 'function' && typeof hud.exitDialogueMode === 'function') {
      hud.enterDialogueMode(null, function () {
        hud.runLines(MARKET_TRADER_INTRO, function () {
          try { localStorage.setItem(KEY_MARKET_INTRO_SEEN, 'true'); } catch (e) {}
          // Back to the normal HUD — gold balance is now visible while shopping.
          hud.exitDialogueMode(function () {
            if (typeof hud.refreshGold === 'function') hud.refreshGold();
            _marketReady = true;
          });
        });
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
    // First time back from the marketplace, the explorer notes the growing
    // collection and the deck builder un-greys. One-time; gated below.
    _maybePlayDeckBuilderUnlock(function () { scheduleIdle(); });
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
    isDialogueLocked = true;
    cancelIdle();
    runDialogue(DECKBUILDER_UNLOCK_DIALOGUE, function () {
      try { localStorage.setItem(KEY_DECKBUILDER_UNLOCKED, 'true'); } catch (e) {}
      isDialogueLocked = false;
      var hud = window.SOG && window.SOG.HUD;
      if (hud && typeof hud.refreshDecks === 'function') hud.refreshDecks();  // un-grey
      if (done) done();
    });
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

  function _openMarketBuyPopup(card, price) {
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

    var buy = document.createElement('button');
    buy.className = 'btn-primary';
    buy.style.cssText = 'margin:0 14px 14px;padding:12px;font-size:18px;font-weight:bold;display:flex;' +
      'align-items:center;justify-content:center;gap:8px;cursor:' + (affordable ? 'pointer' : 'not-allowed') + ';' +
      (affordable ? '' : 'opacity:0.45;filter:grayscale(0.7);');
    buy.disabled = !affordable;
    buy.innerHTML = 'Buy For ' + price +
      ' <img src="images/ui_images/coin.png" alt="gold" style="width:24px;height:24px;object-fit:contain;">';
    if (affordable) {
      buy.addEventListener('click', function () {
        _openBuyConfirm(card, function () {
          _closeMarketBuyPopup();
          _doMarketPurchase(card, price);
        });
      });
    }

    box.appendChild(content); box.appendChild(buy);
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
      console.log('[Overworld] Intro not yet seen — forcing start on East Africa');
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
    if (!dialogueStarted) dialogueStarted = maybePlayEgyptArrival();
    if (!dialogueStarted) dialogueStarted = maybePlayMesopotamiaArrival();
    if (!dialogueStarted) scheduleIdle();
  }

  /* ── Expose ────────────────────────────────────────────────── */
  return {
    init: init,
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
      isDialogueLocked = false;
      isTransitioning  = false;
      _clearWipe();
      _removeCandleBackdrop();   // defensive: clear any lingering candlelit backdrop
      var hud = window.SOG && window.SOG.HUD;
      if (hud) { hud.show(); }
      scheduleIdle();
      log('resumeAfterBattle() — player control restored');
    }
  };
})();

window.Overworld = Overworld;

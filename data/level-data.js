/* ══════════════════════════════════════════════════════════════════════════
   window.SOG_LEVEL_DATA — data-driven battle/market levels, keyed by node id.

   SPIKE CONTENT. 'spike-sargon-shadow' mirrors SOG.SargonBattle field-for-
   field — including the full Serf→Giant two-tier ladder — to prove
   js/level-runtime.js's generic launcher can reproduce a real boss from pure
   data, without touching js/sog-adventure-sargon.js at all. Delete this entry
   once the spike is verified and superseded by real level-editor content — it
   shares Sargon's location art/AI deck on purpose, to prove the SAME visuals
   and battle render from a different node id and config object.

   Same file-format precedent as data/map-data.js: a .js file assigning a
   global, not JSON, so it loads synchronously over file:// on Chromebooks.

   ⚠ HAND-WRITTEN FOR NOW, BUT WON'T STAY THAT WAY. This file is going to get
   the same treatment map-data.js already has: a level editor that loads it,
   edits in memory, and re-serialises the whole file on save. That serialiser
   will almost certainly be schema/field-table driven the same way
   tools/map-editor/serve.js's serialise() is — which means, by construction,
   it will only write the fields the level schema actually declares. Any // or
   /* comment in this file — including this header — WILL be silently dropped
   the first time a level gets saved through that editor, the same failure
   map-data.js had for its milestones until this same session added a `note`
   field to carry exactly this kind of prose. When the level schema is built:
   give it its own `note`-equivalent field for anything that needs to survive
   a save, and do not rely on hand comments in this file past that point.
   ══════════════════════════════════════════════════════════════════════════ */
window.SOG_LEVEL_DATA = {
  levels: {
    'spike-sargon-shadow': {
      kind:  'battle',
      tiers: 2,   // Serf → Giant ladder, same meaning as map-data.js nodes' `tiers`

      structure: {
        turns:            4,
        locationsCount:   3,
        slotsPerLocation: 4,
        handStart:        4,
        maxHandSize:      7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: [38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 31, 36, 37, 32], shuffle: true }
      },

      locations: [
        { id: 8, name: 'Upper Sea — Mediterranean Coast', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/uppersea.jpg', thumbnailCrop: null },
        { id: 7, name: 'Akkad',                            region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/akkad.jpg',    thumbnailCrop: null },
        { id: 2, name: 'Lower Sea — Persian Gulf Coast',   region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/lowersea.jpg', thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass:              'sargon-battle',
        allyAvatar:              'player',   // selected adventurer, resolved at render time
        opponentAvatar:          'images/portraits/sargonportrait.jpg',
        opponentBubblePortrait:  'images/portraits/sargonportrait.jpg',
        popAlly:                 true
      },

      rulesPopup: {
        title: 'Shadow of Sargon (level-editor spike)',
        body: [
          '4 Turns',
          'Each card costs Capital (CC) to play.',
          '5 Capital to spend each turn.',
          '<u>Win Condition</u> — Gain the most IP at the most locations.'
        ]
      },

      bleep: {
        profiles: {
          sargon:   { freq: 440, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
          explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
        },
        defaultKey: 'sargon'
      },

      // Reward AMOUNTS come from SOG.rewards (generic, 15 gold/tier, card on
      // first Giant win only) — this just says WHICH card the Giant win grants.
      reward: { cardIdOnGiantWin: 37 },

      dialogue: {
        opening: [
          { who: 'sargon',   text: 'Before we begin, observe how an empire truly operates.' },
          { who: 'explorer', text: 'My cards look different!' },
          { who: 'sargon',   text: 'Exactly.' },
          { who: 'sargon',   text: 'Every card now comes with a price.' },
          { who: 'sargon',   text: 'This is the Capital cost.' },
          { who: 'explorer', text: "So I can't just play whatever I want?" },
          { who: 'sargon',   text: 'Welcome to Empire.' },
          { who: 'sargon',   text: 'You have five Capital each turn.' },
          { who: 'explorer', text: 'And what if I run out?' },
          { who: 'sargon',   text: "Then you wait 'til next turn." },
          { who: 'sargon',   text: 'If there is a next turn.' },
          { who: 'explorer', text: 'Five to spend, every turn.' },
          { who: 'explorer', text: 'Got it!' },
          { who: 'sargon',   text: "We'll see about that." }
        ],
        // SERF tier — first encounter.
        serfWinA: [
          { who: 'sargon',   text: 'Those who face the Akkadian line do not walk away.' },
          { who: 'explorer', text: 'I stand my ground.' },
          { who: 'explorer', text: 'With a smile.' },
          { who: 'sargon',   text: 'I do not.' },
          { who: 'sargon',   text: 'Here.' }
        ],
        serfWinB: [
          { who: 'sargon',   text: 'Your reward.' },
          { who: 'explorer', text: 'Much thanks.' },
          { who: 'sargon',   text: 'I built empire from nothing.' },
          { who: 'sargon',   text: 'When you return, you will feel the full might of Akkad.' }
        ],
        loss: [
          { who: 'sargon', text: "You're no match for Empire." },
          { who: 'sargon', text: 'Be gone with you.' }
        ],
        tie: [
          { who: 'sargon', text: "You're no match for Empire." },
          { who: 'sargon', text: 'Be gone with you.' }
        ],
        // GIANT tier — rematch, unlocked once the Serf tier is beaten.
        giantIntro: [
          { who: 'sargon',   text: 'So you return for the true contest?' },
          { who: 'explorer', text: "It's the right thing to do…" },
          { who: 'sargon',   text: 'No mercy.' }
        ],
        giantWinA: [
          { who: 'sargon',   text: 'I have conquered a thousand cities.' },
          { who: 'sargon',   text: 'Yet, today, the wanderer conquers me.' },
          { who: 'sargon',   text: 'Take this, the mark of Akkad.' }
        ],
        giantWinB: [
          { who: 'sargon',   text: "Few earn the Emperor's respect." },
          { who: 'sargon',   text: 'You have earned mine.' }
        ],
        giantLoss: [
          { who: 'sargon', text: 'As it must be.' },
          { who: 'sargon', text: 'Empire endures.' }
        ],
        giantDraw: [
          { who: 'sargon', text: "A stalemate? Against Akkad's finest?" },
          { who: 'sargon', text: 'We settle this again.' }
        ]
      }
    },

    'ramses': {
      kind:  'battle',
      tiers: 2,   // Serf → Giant ladder, matching every other real boss

      structure: {
        turns:            5,
        locationsCount:   3,
        slotsPerLocation: 4,
        handStart:        5,
        maxHandSize:      7
      },
      // Rising curve, not the usual flat 5/turn — deliberately makes Abu
      // Simbel's "fill all 4 slots" a real choice (cheap-now vs a big card
      // saved for Karnak) rather than trivially affordable turn 1.
      resource: { model: 'capital', capital: 6, resetEachTurn: true, capitalByTurn: [2, 3, 4, 5, 6] },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        // id 76 = Merchant (Egypt) — the real card (promoted from the old id-900
        // placeholder along with MERCHANT_ID and the CARD_ABILITIES key).
        ai: { source: 'explicit', ids: [53, 54, 55, 56, 57, 58, 59, 60, 62, 64, 65, 76, 70, 69, 74], shuffle: true }
      },

      locations: [
        { id: 131, name: 'Pi-Ramses',    region: 'The New Capital', abilityText: '+2 IP to the card with the most IP',                               abilityKey: 'HIGHEST_IP_PLUS_2_HERE',  image: 'images/locations/piramses.jpg',     thumbnailCrop: null },
        { id: 132, name: 'Karnak Temple', region: 'House of Amun',   abilityText: '2x IP to the card with the most IP',                               abilityKey: 'DOUBLE_HIGHEST_IP_HERE',  image: 'images/locations/karnaktemple.jpg', thumbnailCrop: null },
        { id: 133, name: 'Abu Simbel',    region: 'Nubian Frontier', abilityText: 'Fill all 4 slots here to gain +6 IP.',                              abilityKey: 'FULL_SLOTS_PLUS_6_HERE',  image: 'images/locations/abusimbel.jpg',    thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass:              'ramses-battle',
        allyAvatar:              'player',   // selected adventurer, resolved at render time
        opponentAvatar:          'images/portraits/ramsesIIportrait.jpeg',
        opponentBubblePortrait:  'images/portraits/ramsesIIportrait.jpeg',
        popAlly:                 true
      },

      rulesPopup: {
        title: 'Ramses II',
        body: [
          '5 Turns',
          'Each card costs Capital (CC) to play.',
          'Capital increases each turn: 2, 3, 4, 5, 6.',
          '<u>Win Condition</u> — Gain the most IP at the most locations.'
        ]
      },

      // Beating the Giant tier unlocks Ramses II (id 53) into the player's
      // collection, matching every other named boss (Sargon → 37, Narmer →
      // 51, Hatshepsut → 52).
      reward: { cardIdOnGiantWin: 53 },

      // Dialogue intentionally left empty — drafted separately.
      dialogue: { opening: [], serfWinA: [], serfWinB: [], loss: [], tie: [], giantIntro: [], giantWinA: [], giantWinB: [], giantLoss: [], giantDraw: [] }
    }
  }
};

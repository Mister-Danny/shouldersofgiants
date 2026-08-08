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
        allyAvatar:              'images/portraits/femaleexplorer%20portrait.jpeg',
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
    }
  }
};

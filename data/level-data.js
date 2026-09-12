/* ══════════════════════════════════════════════════════════════════════════
   LEVEL DATA — battle/market configuration, keyed by node id.
   ══════════════════════════════════════════════════════════════════════════

   ⚠ THIS FILE IS WRITTEN BY tools/map-editor. Comments you add here WILL BE
   LOST the next time someone saves from the editor. Put durable prose in a
   level's `note` field (it round-trips).

   WHY A .js FILE AND NOT .json — the game is opened straight off disk on
   Chromebooks (file://), and fetch() of a local .json is CORS-blocked there.
   A plain script tag assigning a global works everywhere and stays
   synchronous, matching data/map-data.js's own precedent.

   WHAT LIVES HERE — a level entry is looked up by node id from
   js/overworld.js's onNodeClick and launched by js/level-runtime.js, which
   builds a full battle-engine config from it (structure/resource/draw/decks/
   locations/scoring/presentation/reward/dialogue) and registers a generic
   two-tier script with SOG.BattleHooks — no boss-specific code required.
   Only `kind: 'battle'` is wired so far; `kind: 'market'` is recorded but not
   yet consumed.

   abilityKey (per location) and deck ids (in decks.player.ids / decks.ai.ids)
   are both closed sets, validated on save: abilityKey against every
   abilityKey the battle engine actually checks for (js/game/abilities.js and
   friends — see validateLevel() in serve.js), deck ids against CARDS in
   js/cards.js. A value outside either set fails the save with the specific
   field named, the same way an unknown field does.

   To edit:  node tools/map-editor/serve.js  →  localhost:8750/tools/map-editor/
   ══════════════════════════════════════════════════════════════════════════ */

window.SOG_LEVEL_DATA = {
  levels: {
    'spike-sargon-shadow': {
      kind:  'battle',
      tiers: 2,

      structure: {
        turns: 4,
        locationsCount: 3,
        slotsPerLocation: 4,
        handStart: 4,
        maxHandSize: 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: [38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 31, 36, 37, 32], shuffle: true }
      },

      locations: [
        { id: 8, name: 'Upper Sea — Mediterranean Coast', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/uppersea.jpg', thumbnailCrop: null },
        { id: 7, name: 'Akkad', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/akkad.jpg', thumbnailCrop: null },
        { id: 2, name: 'Lower Sea — Persian Gulf Coast', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/lowersea.jpg', thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass: 'sargon-battle',
        allyAvatar: 'player',
        opponentAvatar: 'images/portraits/sargonportrait.jpg',
        opponentBubblePortrait: 'images/portraits/sargonportrait.jpg',
        popAlly: true
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
          sargon: { freq: 440, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
          explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
        },
        defaultKey: 'sargon'
      },

      reward: { cardIdOnGiantWin: 37 },

      dialogue: {
        opening: [
      { who: 'sargon', text: 'Before we begin, observe how an empire truly operates.' },
      { who: 'explorer', text: 'My cards look different!' },
      { who: 'sargon', text: 'Exactly.' },
      { who: 'sargon', text: 'Every card now comes with a price.' },
      { who: 'sargon', text: 'This is the Capital cost.' },
      { who: 'explorer', text: 'So I can\'t just play whatever I want?' },
      { who: 'sargon', text: 'Welcome to Empire.' },
      { who: 'sargon', text: 'You have five Capital each turn.' },
      { who: 'explorer', text: 'And what if I run out?' },
      { who: 'sargon', text: 'Then you wait \'til next turn.' },
      { who: 'sargon', text: 'If there is a next turn.' },
      { who: 'explorer', text: 'Five to spend, every turn.' },
      { who: 'explorer', text: 'Got it!' },
      { who: 'sargon', text: 'We\'ll see about that.' }
    ],
        serfWinA: [
      { who: 'sargon', text: 'Those who face the Akkadian line do not walk away.' },
      { who: 'explorer', text: 'I stand my ground.' },
      { who: 'explorer', text: 'With a smile.' },
      { who: 'sargon', text: 'I do not.' },
      { who: 'sargon', text: 'Here.' }
    ],
        serfWinB: [
      { who: 'sargon', text: 'Your reward.' },
      { who: 'explorer', text: 'Much thanks.' },
      { who: 'sargon', text: 'I built empire from nothing.' },
      { who: 'sargon', text: 'When you return, you will feel the full might of Akkad.' }
    ],
        loss: [
      { who: 'sargon', text: 'You\'re no match for Empire.' },
      { who: 'sargon', text: 'Be gone with you.' }
    ],
        tie: [
      { who: 'sargon', text: 'You\'re no match for Empire.' },
      { who: 'sargon', text: 'Be gone with you.' }
    ],
        giantIntro: [
      { who: 'sargon', text: 'So you return for the true contest?' },
      { who: 'explorer', text: 'It\'s the right thing to do…' },
      { who: 'sargon', text: 'No mercy.' }
    ],
        giantWinA: [
      { who: 'sargon', text: 'I have conquered a thousand cities.' },
      { who: 'sargon', text: 'Yet, today, the wanderer conquers me.' },
      { who: 'sargon', text: 'Take this, the mark of Akkad.' }
    ],
        giantWinB: [
      { who: 'sargon', text: 'Few earn the Emperor\'s respect.' },
      { who: 'sargon', text: 'You have earned mine.' }
    ],
        giantLoss: [
      { who: 'sargon', text: 'As it must be.' },
      { who: 'sargon', text: 'Empire endures.' }
    ],
        giantDraw: [
      { who: 'sargon', text: 'A stalemate? Against Akkad\'s finest?' },
      { who: 'sargon', text: 'We settle this again.' }
    ]
      }
    },
    'ramses': {
      kind:  'battle',
      tiers: 2,

      structure: {
        turns: 5,
        locationsCount: 3,
        slotsPerLocation: 4,
        handStart: 5,
        maxHandSize: 7
      },
      resource: { model: 'capital', capital: 6, resetEachTurn: true, capitalByTurn: [2, 3, 4, 5, 6] },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: [53, 54, 55, 56, 57, 58, 59, 60, 62, 64, 65, 76, 70, 69, 74], shuffle: true }
      },

      locations: [
        { id: 131, name: 'Pi-Ramses', region: 'The New Capital', abilityText: '+2 IP to the card with the most IP', abilityKey: 'HIGHEST_IP_PLUS_2_HERE', image: 'images/locations/piramses.jpg', thumbnailCrop: null },
        { id: 132, name: 'Karnak Temple', region: 'House of Amun', abilityText: '2x IP to the card with the most IP', abilityKey: 'DOUBLE_HIGHEST_IP_HERE', image: 'images/locations/karnaktemple.jpg', thumbnailCrop: null },
        { id: 133, name: 'Abu Simbel', region: 'Nubian Frontier', abilityText: 'Fill all 4 slots here to gain +6 IP.', abilityKey: 'FULL_SLOTS_PLUS_6_HERE', image: 'images/locations/abusimbel.jpg', thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass: 'ramses-battle',
        allyAvatar: 'player',
        opponentAvatar: 'images/portraits/ramsesIIportrait.jpeg',
        opponentBubblePortrait: 'images/portraits/ramsesIIportrait.jpeg',
        popAlly: true
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

      reward: { cardIdOnGiantWin: 53 },

      dialogue: {
        nodeIntro: [
      { who: 'explorer', text: 'Sproutin\' sparrows!' },
      { who: 'explorer', text: 'Look at those giants.' },
      { who: 'explorer', text: 'And there\'s four of them.' },
      { who: 'ramses', text: 'You\'re welcome.' },
      { who: 'explorer', text: 'Hey, they kind of look like you.' },
      { who: 'ramses', text: 'Thank you.' },
      { who: 'ramses', text: 'And you\'re welcome, again.' },
      { who: 'explorer', text: 'Um. Who are you?' },
      { who: 'ramses', text: 'You don\'t know The Great Ramses?' },
      { who: 'explorer', text: 'If it\'s any consolation, I do now!' },
      { who: 'ramses', text: 'Oh, you will never forget.' }
    ],
        opening: [
      { who: 'ramses', text: 'Behold my kingdom.' },
      { who: 'ramses', text: 'My city, my temple, and my face carved in stone.' },
      { who: 'explorer', text: 'Faces. Four of them. Why?' },
      { who: 'ramses', text: 'A warning to unwanted visitors.' },
      { who: 'explorer', text: 'Oh…' },
      { who: 'explorer', text: 'Is it too late to tell you how grateful I am?' },
      { who: 'ramses', text: 'Yes.' },
      { who: 'explorer', text: 'But I--' },
      { who: 'ramses', text: 'Enough!' },
      { who: 'ramses', text: 'Build yourself a monument worth remembering…' },
      { who: 'ramses', text: 'Or be left to the sands of time.' }
    ],
        turn1: [
      { who: 'explorer', text: 'Wait. Why do I only have 2 Capital to spend?' },
      { who: 'explorer', text: 'I usually get 5.' },
      { who: 'ramses', text: 'Such entitlement.' },
      { who: 'ramses', text: 'You cannot build monuments that last the test of time in one turn.' },
      { who: 'ramses', text: 'In my kingdom, you build your way up.' },
      { who: 'explorer', text: 'So I get more each turn?' },
      { who: 'ramses', text: 'If you play your cards right…' }
    ],
        serfWinA: [
      { who: 'explorer', text: 'That win was monumental!' },
      { who: 'ramses', text: 'It was pity.' },
      { who: 'ramses', text: 'I barely tried.' },
      { who: 'explorer', text: 'My mom says you should always try your best.' },
      { who: 'ramses', text: 'Return again and you will be crying for your mother.' }
    ],
        serfWinB: [],
        loss: [
      { who: 'ramses', text: 'As expected.' },
      { who: 'ramses', text: 'I outlast them all.' },
      { who: 'explorer', text: 'But I just want to get home.' }
    ],
        tie: [
      { who: 'ramses', text: 'A draw. How forgettable.' },
      { who: 'explorer', text: 'I\'ll take it.' },
      { who: 'ramses', text: 'It gets you nothing.' }
    ],
        giantIntro: [
      { who: 'ramses', text: 'You\'ve come back to etch your name alongside mine?' },
      { who: 'explorer', text: 'I guess...' },
      { who: 'explorer', text: 'Where I\'m from, you\'re not exactly a household name.' },
      { who: 'ramses', text: 'When I\'m done, your household will be but nothing.' }
    ],
        giantWinA: [
      { who: 'explorer', text: 'Wow! Good game.' },
      { who: 'ramses', text: 'This is my greatest failure.' },
      { who: 'ramses', text: 'Please don\'t tell the Kushites.' },
      { who: 'explorer', text: 'Cushionmites?' },
      { who: 'ramses', text: 'Our rivals upriver.' },
      { who: 'explorer', text: 'Right.' },
      { who: '', text: 'I can\'t believe I lost to you.' },
      { who: '', text: 'Twice.' }
    ],
        giantWinB: [],
        giantLoss: [
      { who: 'ramses', text: 'Ye Mighty, and despair.' },
      { who: 'explorer', text: 'I don\'t know what that means.' },
      { who: 'ramses', text: 'You will.' }
    ],
        giantDraw: [
      { who: 'ramses', text: 'A draw.' },
      { who: 'ramses', text: 'At Kadesh I fought a draw. Do you know what I carved on the walls?' },
      { who: 'explorer', text: '…that you won?' },
      { who: 'ramses', text: 'That I won.' }
    ]
      }
    },
    'akhenaten': {
      kind:  'battle',
      tiers: 2,

      structure: {
        turns: 5,
        locationsCount: 3,
        slotsPerLocation: 4,
        handStart: 5,
        maxHandSize: 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: [77, 63, 66, 71, 38, 61, 57, 62, 54, 74, 59, 70, 55, 41, 69], shuffle: true }
      },

      locations: [
        { id: 141, name: 'The Closed Temples', region: 'Thebes', abilityText: 'When you play a Religious card here, discard a card.', abilityKey: 'RELIGIOUS_PLAY_DISCARDS', image: 'images/locations/closed_temples.jpg', thumbnailCrop: null },
        { id: 142, name: 'The Great Temple of the Aten', region: 'Akhetaten', abilityText: 'If you only have one card here, receive +4 IP.', abilityKey: 'SOLO_CARD_PLUS_4_HERE', image: 'images/locations/temple_of_aten.jpg', thumbnailCrop: null },
        { id: 143, name: 'The Royal Tomb', region: 'Amarna', abilityText: 'Game end: summon a card from your discard here.', abilityKey: 'SUMMON_FROM_DISCARD_AT_END', image: 'images/locations/royal_tomb.jpg', thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass: 'akhenaten-battle',
        allyAvatar: 'player',
        opponentAvatar: 'images/portraits/akhenaten.jpg',
        opponentBubblePortrait: 'images/portraits/akhenaten.jpg',
        popAlly: true
      },

      rulesPopup: {
        title: 'Akhenaten',
        body: [
          '5 Turns',
          'Each card costs Capital (CC) to play.',
          '<u>Win Condition</u> — Gain the most IP at the most locations.'
        ]
      },

      reward: { cardIdOnGiantWin: 77 },

      dialogue: {
        nodeIntro: [
      { who: 'explorer', text: 'Oh look…' },
      { who: 'explorer', text: 'There\'s snacks on this mysteriously sunny table.' },
      { who: 'akhenaten', text: 'Those offerings are not for you.' },
      { who: 'explorer', text: 'If they\'re not being offered to me, then who are they for?' },
      { who: 'akhenaten', text: 'The Aten.' },
      { who: 'explorer', text: 'Ah huh?' },
      { who: 'akhenaten', text: 'The sun. The one and only true god.' },
      { who: 'explorer', text: 'I think god would share.' },
      { who: 'explorer', text: 'Also, I thought Egypt had many gods?' },
      { who: 'akhenaten', text: 'It did.' }
    ],
        opening: [
      { who: 'akhenaten', text: 'This is Akhetaten.' },
      { who: 'akhenaten', text: 'The Horizon of Aten.' },
      { who: 'akhenaten', text: 'Risen from the sand.' },
      { who: 'explorer', text: 'You built this from nothing?' },
      { who: 'akhenaten', text: 'From the light.' },
      { who: 'explorer', text: 'I don\'t think that\'s how things work.' },
      { who: 'akhenaten', text: 'Your heresy will not be looked upon kindly.' },
      { who: 'akhenaten', text: 'Like the old gods who came before, you will be dealt with.' },
      { who: 'explorer', text: 'Wait. What happened to the old gods?' },
      { who: 'akhenaten', text: 'They were discarded.' }
    ],
        turn1: [],
        serfWinA: [
      { who: 'explorer', text: 'The sun shined upon me!' },
      { who: 'akhenaten', text: 'Aten offered grace today.' },
      { who: 'akhenaten', text: 'But tomorrow will be a new day.' },
      { who: 'akhenaten', text: 'And I will be ready.' }
    ],
        serfWinB: [],
        loss: [
      { who: 'akhenaten', text: 'The old ways lose again.' },
      { who: 'explorer', text: 'My ways are a lot newer than you realize.' },
      { who: 'akhenaten', text: 'Then you must prove it.' }
    ],
        tie: [
      { who: 'akhenaten', text: 'How strange.' },
      { who: 'explorer', text: 'What?' },
      { who: 'akhenaten', text: 'Aten has shown his light on both sides.' },
      { who: 'explorer', text: 'Is that bad?' },
      { who: 'akhenaten', text: 'It is for your progress.' }
    ],
        giantIntro: [
      { who: 'akhenaten', text: 'You returned to seek favor a second time?' },
      { who: 'explorer', text: 'I\'m really just trying to get home.' },
      { who: 'akhenaten', text: 'Home is wherever the light falls.' },
      { who: 'explorer', text: 'But my home has a roof.' },
      { who: 'akhenaten', text: 'In darkness you cannot see.' },
      { who: 'akhenaten', text: 'And with the light, I will see victory.' }
    ],
        giantWinA: [
      { who: 'explorer', text: 'I win again!' },
      { who: 'akhenaten', text: 'I have been undone.' },
      { who: 'explorer', text: 'It was just a game.' },
      { who: 'explorer', text: 'The sun will come up again.' },
      { who: 'akhenaten', text: 'I have fallen out of favor with Aten.' },
      { who: 'akhenaten', text: 'So it will all fall.' },
      { who: 'explorer', text: 'What?' },
      { who: 'akhenaten', text: 'All of it.' },
      { who: 'akhenaten', text: 'My city. My name. The one god.' },
      { who: 'explorer', text: 'That got dark.' },
      { who: 'akhenaten', text: 'Take me away.' }
    ],
        giantWinB: [],
        giantLoss: [
      { who: 'akhenaten', text: 'You threw away too little.' },
      { who: 'explorer', text: 'I didn\'t want to lose my cards.' },
      { who: 'akhenaten', text: 'Then you never wanted to win.' }
    ],
        giantDraw: [
      { who: 'akhenaten', text: 'A balance.' },
      { who: 'explorer', text: 'Is that good?' },
      { who: 'akhenaten', text: 'I spent my life ending balance.' }
    ]
      }
    },
    'kush': {
      kind:  'battle',
      tiers: 2,

      structure: {
        turns: 5,
        locationsCount: 3,
        slotsPerLocation: 4,
        handStart: 5,
        maxHandSize: 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },

      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 70, 74, 55, 62, 59], shuffle: true }
      },

      locations: [
        { id: 151, name: 'Meroe', region: 'The Island of Meroe', abilityText: 'Repeat the At Once of Labor and Economic cards.', abilityKey: 'REPEAT_LABOR_ECONOMIC_AT_ONCE', image: 'images/locations/meroe.jpg', thumbnailCrop: null },
        { id: 152, name: 'Napata', region: 'Below the Fourth Cataract', abilityText: 'Political cards gain +1 IP.', abilityKey: 'POLITICAL_PLUS_1_STAMP', image: 'images/locations/napata.jpg', thumbnailCrop: null },
        { id: 153, name: 'Nubian Gold Mines', region: 'The Eastern Desert', abilityText: '33% chance of gold when you play a card here.', abilityKey: 'GOLD_CHANCE_ON_PLAY', image: 'images/locations/nubian_gold_mines.jpg', thumbnailCrop: null }
      ],
      scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },

      presentation: {
        bodyClass: 'kush-battle',
        allyAvatar: 'player',
        opponentAvatar: 'images/portraits/piye.jpeg',
        opponentBubblePortrait: 'images/portraits/piye.jpeg',
        popAlly: true
      },

      rulesPopup: {
        title: 'The Lord of Two Lands',
        body: [
          '5 Turns',
          '5 Capital per turn',
          'Each card costs Capital (CC) to play.',
          '<u>Win Condition</u> — Gain the most IP at the most locations.'
        ]
      },

      reward: { cardIdOnGiantWin: 78 },

      dialogue: {
        nodeIntro: [
      { who: 'piye', text: 'This is Napata.' },
      { who: 'explorer', text: 'Is that in Egypt?' },
      { who: 'piye', text: 'No. Egypt is that way. I own it.' },
      { who: 'explorer', text: 'You own Egypt but you live here?' },
      { who: 'piye', text: 'I am Lord of the Two Lands.' },
      { who: 'explorer', text: 'Okay, but which two?' },
      { who: 'piye', text: 'Kush. And Egypt.' },
      { who: 'explorer', text: 'Oh! Oh, that makes way more sense.' },
      { who: 'piye', text: 'It usually does, eventually.' }
    ],
        opening: [
      { who: 'piye', text: 'Now that you understand, we can begin.' },
      { who: 'explorer', text: 'Begin what?' },
      { who: 'piye', text: 'You want to pass through Egypt. Egypt is mine.' },
      { who: 'explorer', text: 'Do I have to fight you for it?' },
      { who: 'piye', text: 'You have to convince me.' },
      { who: 'explorer', text: 'Of what?' },
      { who: 'piye', text: 'That you belong on the road.' }
    ],
        turn1: [],
        serfWinA: [
      { who: 'explorer', text: 'I won!' },
      { who: 'piye', text: 'You did. That was well played.' },
      { who: 'explorer', text: 'You\'re being nice about it.' },
      { who: 'piye', text: 'Why would I not be?' },
      { who: 'piye', text: 'Come back. I will still be here.' }
    ],
        serfWinB: [],
        loss: [
      { who: 'piye', text: 'Not yet.' },
      { who: 'explorer', text: 'I really tried.' },
      { who: 'piye', text: 'I know. Trying is most of it.' }
    ],
        tie: [
      { who: 'piye', text: 'Even.' },
      { who: 'explorer', text: 'Is that okay?' },
      { who: 'piye', text: 'It is honest. It is not enough.' }
    ],
        giantIntro: [
      { who: 'piye', text: 'You came back.' },
      { who: 'explorer', text: 'I said I would.' },
      { who: 'piye', text: 'People say many things at my gate.' },
      { who: 'explorer', text: 'I\'m not people. I\'m trying to get home.' },
      { who: 'piye', text: 'Then you already understand the road.' },
      { who: 'piye', text: 'Everyone on it is going somewhere else.' }
    ],
        giantWinA: [
      { who: 'explorer', text: 'I made it!' },
      { who: 'piye', text: 'You did.' },
      { who: 'piye', text: 'Remember who let you through.' },
      { who: 'explorer', text: 'You didn\'t let me. I won.' },
      { who: 'piye', text: 'I know. Remember it anyway.' },
      { who: 'piye', text: 'The road is open. Go carefully.' }
    ],
        giantWinB: [],
        giantLoss: [
      { who: 'piye', text: 'The road stays closed.' },
      { who: 'explorer', text: 'For how long?' },
      { who: 'piye', text: 'Until you are ready. Not a day sooner.' }
    ],
        giantDraw: [
      { who: 'piye', text: 'Even again.' },
      { who: 'explorer', text: 'I\'m getting closer.' },
      { who: 'piye', text: 'You are. That is not the same as arriving.' }
    ]
      }
    }
  }
};

/**
 * cards.js
 * Shoulders of Giants — Card Data
 *
 * Each card object contains:
 *   id         {number}      Unique card identifier
 *   name       {string}      Display name
 *   cc         {number}      Capital Cost — the cost to play this card
 *   ip         {number}      Influence Points — base scoring value
 *   type       {string}      Card type: "Political" | "Religious" | "Military" | "Cultural" | "Exploration" | "Scientific"
 *   type2      {string|null} Secondary type for future dual-type cards (null for single-type)
 *   era        {string|null} Historical era label (null if not era-specific)
 *   abilityName{string|null} Short name for the card's ability (null for vanilla cards)
 *   ability    {string|null} Full ability description (null for vanilla cards)
 *   image      {string}      Path to the card's artwork image
 *   locked            {boolean}  If true, card is hidden from the demo deck builder (future content)
 *   attributionPattern{string}   Bonus-attribution pattern for the IP breakdown display:
 *     'A' — Direct: the card's own portrait is the thumbnail source (default)
 *     'B' — Destruction-chain: each destroyed card's portrait is a separate thumbnail
 *     'C' — Trigger-source: the card that caused the triggering event is the thumbnail
 *     'D' — Affected-target: the ability owner's portrait appears on each target card
 *
 * Ability trigger keywords (used by the ability engine in game.js):
 *   "At Once"       — fires immediately when the card is revealed
 *   "Continuous"    — passive, re-evaluated whenever board state changes
 *   "Next Turn"     — delayed effect that resolves on the following turn (e.g. Tribe 36)
 *   "End of turn"   — fires once per turn after ALL reveals complete (e.g. Megalith 31)
 *   "If / When"     — conditional, fires when the described event occurs
 */

const CARDS = [

  // ─── POLITICAL ────────────────────────────────────────────────────────────
  {
    id: 1, name: "Citizens", cc: 1, ip: 1,
    type: "Political", type2: null, era: "Rome",
    abilityName: null, ability: null,
    image: "images/cards/first25/Citizens.jpg", locked: false
  },
  {
    id: 2, name: "Scholar-Officials", cc: 2, ip: 1,
    type: "Political", type2: null, era: "China",
    abilityName: "Civil Service",
    ability: "At Once:\nFor every other card you have here, Scholar-Officials gain +1 Capital next turn.",
    image: "images/cards/first25/Scholar-Officials.jpg", locked: false
  },
  {
    id: 3, name: "Justinian", cc: 3, ip: 3,
    type: "Political", type2: null, era: "Rome",
    abilityName: "Code of Justinian",
    ability: "At Once:\nJustinian resets all cards here back to their original IP.",
    image: "images/cards/first25/Justinian.jpg", locked: false
  },
  {
    id: 4, name: "Empress Wu", cc: 4, ip: 4,
    type: "Political", type2: null, era: "China",
    abilityName: "Iron Fist",
    ability: "At Once:\nEmpress Wu pushes your opponent's Political or Military card with the highest IP away from here, if she can't, she destroys it.",
    image: "images/cards/first25/Empress Wu.jpg", locked: false
  },
  {
    id: 5, name: "Pacal the Great", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesoamerica",
    abilityName: "Temple of Inscriptions",
    ability: "At Once:\nPacal triggers the 'At Once' abilities of all your cards at this location.",
    image: "images/cards/first25/Pacal the Great.jpg", locked: false
  },

  // ─── RELIGIOUS ────────────────────────────────────────────────────────────
  {
    id: 6, name: "Priests", cc: 1, ip: 1,
    type: "Religious", type2: null, era: null,
    abilityName: null, ability: null,
    image: "images/cards/first25/Priests.jpg", locked: false
  },
  {
    id: 7, name: "Jan Hus", cc: 2, ip: 1,
    type: "Religious", type2: null, era: "Reformation",
    abilityName: "Martyr for Reform",
    ability: "If Jan Hus is discarded, he gives all your cards currently in play +1 IP.",
    image: "images/cards/first25/Jan Hus.jpg", locked: false
  },
  {
    id: 8, name: "Francis of Assisi", cc: 3, ip: 4,
    type: "Religious", type2: null, era: "Middle Ages",
    abilityName: "Vow of Poverty",
    ability: "At Once:\nFrancis of Assisi discards the highest cost Religious card in your hand.",
    image: "images/cards/first25/Francis of Assisi.jpg", locked: false
  },
  {
    id: 9, name: "Erasmus", cc: 4, ip: 3,
    type: "Religious", type2: null, era: "Reformation",
    abilityName: "On Free Will",
    ability: "At Once:\nErasmus allows you to choose any card from your hand to discard.",
    image: "images/cards/first25/Erasmus.jpg", locked: false
  },
  {
    id: 10, name: "Jesus Christ", cc: 5, ip: 5,
    type: "Religious", type2: null, era: "Early Christianity",
    abilityName: "King of Martyrs",
    ability: "If Jesus is discarded, he gains +3 IP and returns to your hand.",
    image: "images/cards/first25/Jesus Christ.jpg", locked: false,
    attributionPattern: 'C'   // thumbnail = the card that did the discarding
  },

  // ─── MILITARY ─────────────────────────────────────────────────────────────
  {
    id: 11, name: "Knight", cc: 1, ip: 1,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: null, ability: null,
    image: "images/cards/first25/Knight.jpg", locked: false
  },
  {
    id: 12, name: "Samurai", cc: 2, ip: 2,
    type: "Military", type2: null, era: "Japan",
    abilityName: "Bushido Code",
    ability: "Any time the Samurai is destroyed, it gains +2 IP and returns to the same location.",
    image: "images/cards/first25/Samurai.jpg", locked: false
  },
  {
    id: 13, name: "Hernan Cortes", cc: 3, ip: 3,
    type: "Military", type2: null, era: "Age of Exploration",
    abilityName: "Conquistador",
    ability: "At Once:\nCortes destroys all of your cards at this location and gains +1 IP for each one destroyed.",
    image: "images/cards/first25/Hernan Cortes.jpg", locked: false
  },
  {
    id: 14, name: "Joan of Arc", cc: 4, ip: 4,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: "Maid of Orleans",
    ability: "If Joan of Arc is destroyed, she summons a Religious card from your hand.",
    image: "images/cards/first25/Joan of Arc.jpg", locked: false
  },
  {
    id: 15, name: "William the Conqueror", cc: 5, ip: 1,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: "The Norman Conquest",
    ability: "Continuous:\nAccumulates the IP from all cards you destroyed this game.",
    image: "images/cards/first25/William the Conqueror.jpg", locked: false,
    attributionPattern: 'B'   // each destroyed card's portrait = separate thumbnail
  },

  // ─── CULTURAL ─────────────────────────────────────────────────────────────
  {
    id: 16, name: "Griots", cc: 1, ip: 1,
    type: "Cultural", type2: null, era: "West African Societies",
    abilityName: null, ability: null,
    image: "images/cards/first25/Griots.jpg", locked: false
  },
  {
    id: 17, name: "Kente", cc: 2, ip: 2,
    type: "Cultural", type2: null, era: "West African Societies",
    abilityName: "Woven Heritage",
    ability: "Continuous:\nKente prevents all cards here from being destroyed.",
    image: "images/cards/first25/Kente.jpg", locked: false
  },
  {
    id: 18, name: "Juvenal", cc: 3, ip: 3,
    type: "Cultural", type2: null, era: "Rome",
    abilityName: "Satire",
    ability: "Continuous:\nJuvenal reduces all 4 and 5 CC cards here by -2 IP.",
    image: "images/cards/first25/Juvenal.jpg", locked: false
  },
  {
    id: 19, name: "Cosimo de'Medici", cc: 4, ip: 4,
    type: "Cultural", type2: null, era: "Renaissance",
    abilityName: "Patron of the Arts",
    ability: "Continuous:\nCosimo de\u2019Medici reduces your cost to play Cultural cards by -1.",
    image: "images/cards/first25/Cosimo de'Medici.jpg", locked: false
  },
  {
    id: 20, name: "Voltaire", cc: 5, ip: 5,
    type: "Cultural", type2: null, era: "Enlightenment",
    abilityName: "Candide",
    ability: "Continuous:\nIf Voltaire is your only card here, he receives +4 IP.",
    image: "images/cards/first25/Voltaire.jpg", locked: false
  },

  // ─── EXPLORATION ──────────────────────────────────────────────────────────
  {
    id: 21, name: "Nomad", cc: 1, ip: 1,
    type: "Exploration", type2: null, era: "Islamic Empires",
    abilityName: null, ability: null,
    image: "images/cards/first25/Nomad.jpg", locked: false
  },
  {
    id: 22, name: "Henry the Navigator", cc: 2, ip: 1,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Navigation Patron",
    ability: "Continuous:\nHenry reduces your cost of playing Exploration cards by -1.",
    image: "images/cards/first25/Henry the Navigator.jpg", locked: false
  },
  {
    id: 23, name: "Zheng He", cc: 3, ip: 1,
    type: "Exploration", type2: null, era: "China",
    abilityName: "Treasure Fleet",
    ability: "At Once:\nZheng He delivers +2 IP to 1 card at each adjacent location.",
    image: "images/cards/first25/Zheng He.jpg", locked: false,
    attributionPattern: 'D'   // Zheng He's portrait appears on each target card's breakdown
  },
  {
    id: 24, name: "Magellan", cc: 4, ip: 4,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Circumnavigation",
    ability: "Magellan can move each turn and gains +1 IP with each move.",
    image: "images/cards/first25/Magellan.jpg", locked: false
  },
  {
    id: 25, name: "Christopher Columbus", cc: 5, ip: 5,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Columbian Exchange",
    ability: "Columbus can move once on his own. When he arrives at a new location, he reduces your opponent's Cultural and Political cards at the new location by -1 IP.",
    image: "images/cards/first25/Christopher Columbus.jpg", locked: false
  },

  // ─── PREHISTORY (Adventure Mode — locked) ────────────────────────────────
  {
    id: 26, name: "Tool", cc: 1, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Ancient Tech",
    ability: "At Once:\nTool draws 1 card.",
    image: "images/cards/prehistorycards/toolcard.jpg", locked: true
  },
  {
    id: 27, name: "Hunter", cc: 2, ip: 2,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/cards/prehistorycards/huntercard.jpg", locked: true
  },
  {
    id: 28, name: "Gatherer", cc: 2, ip: 2,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/cards/prehistorycards/gatherercard.jpg", locked: true
  },
  {
    id: 29, name: "Fire", cc: 2, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Cooked",
    ability: "Continuous:\nCards played here after Fire gain +1 IP.",
    image: "images/cards/prehistorycards/firecard.jpg", locked: true
  },
  {
    id: 30, name: "Cave Art", cc: 2, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Ancient Storytelling",
    ability: "Continuous:\nCards played here before Cave Art gain +1 IP.",
    image: "images/cards/prehistorycards/caveartcard.jpg", locked: true
  },
  {
    id: 31, name: "Megalith", cc: 2, ip: 0,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Monument",
    ability: "End of turn:\nGain +1 IP.",
    image: "images/cards/prehistorycards/megalithcard.jpg", locked: true
  },
  {
    id: 32, name: "Domesticated Animal", cc: 2, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Man's Best Friend",
    ability: "Continuous:\nCards next to Domesticated Animal gain +1 IP.",
    image: "images/cards/prehistorycards/domesticatedanimalcard.jpg", locked: true
  },
  {
    id: 33, name: "Lucy", cc: 4, ip: 4,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "First Steps",
    ability: "Lucy can move once.",
    image: "images/cards/prehistorycards/lucycard.jpg", locked: true
  },
  {
    id: 34, name: "Neanderthal", cc: 3, ip: 3,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/cards/prehistorycards/neanderthalcard.jpg", locked: true
  },
  {
    id: 35, name: "Otzi", cc: 4, ip: 4,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Migrate",
    ability: "When a card is played here, Otzi moves to a random location.",
    image: "images/cards/prehistorycards/otzicard.jpg", locked: true
  },
  {
    id: 36, name: "Tribe", cc: 2, ip: 2,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Strength In Numbers",
    ability: "Next Turn:\nGain +1 IP for every card you play here.",
    image: "images/cards/prehistorycards/tribecard.jpg", locked: true
  },

  /* ── Mesopotamia era (ids 37–50) ─────────────────────────────────
     Art lives at images/cards/mesopotamiacards/[name]@0.5x.jpg.
     @0.5x files used for all render contexts; the @sm thumbnail
     fallback in buildCardImg will gracefully fall back to the @0.5x
     file when no @sm variant exists.
     Abilities are stubbed in Phase A — no gameplay logic yet.       */
  {
    id: 37, name: "Sargon", cc: 5, ip: 3,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "The Empire State",
    ability: "Continuous:\nSargon grants +3 IP to adjacent location(s).",
    image: "images/cards/mesopotamiacards/sargon@0.5x.jpg", locked: true
  },
  {
    id: 38, name: "Priest", cc: 1, ip: 2,
    type: "Religious", type2: null, era: "Mesopotamia",
    abilityName: "Spiritual Sacrifice",
    ability: "At Once:\nDiscard the card in your hand with lowest CC.",
    image: "images/cards/mesopotamiacards/priest@0.5x.jpg", locked: true
  },
  {
    id: 39, name: "Farmer", cc: 1, ip: 1,
    type: "Labor", type2: null, era: "Mesopotamia",
    abilityName: "Harvest", ability: "At Once:\nProvides +1 Capital next turn.",
    image: "images/cards/mesopotamiacards/farmer@0.5x.jpg", locked: true
  },
  {
    id: 40, name: "Scribe", cc: 2, ip: 2,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Record Keeper",
    ability: "At Once:\nProvide +1 IP to your other cards at this location.",
    image: "images/cards/mesopotamiacards/scribe@0.5x.jpg", locked: true
  },
  {
    id: 41, name: "Canals", cc: 1, ip: 1,
    type: "Scientific", type2: null, era: "Mesopotamia",
    abilityName: "Irrigation",
    ability: "Continuous:\nBoosts all Labor cards here by +1 IP.",
    image: "images/cards/mesopotamiacards/canals@0.5x.jpg", locked: true
  },
  {
    id: 42, name: "Soldier", cc: 1, ip: 1,
    type: "Military", type2: null, era: "Mesopotamia",
    abilityName: "Military Service",
    ability: "At Once:\nStrike an opponent's cards here and reduce it by -1 IP.",
    image: "images/cards/mesopotamiacards/soldier@0.5x.jpg", locked: true
  },
  {
    id: 43, name: "Gilgamesh", cc: 5, ip: 5,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Epic Hero",
    ability: "Continuous:\nGains +1 IP for each Cultural card you've played.",
    image: "images/cards/mesopotamiacards/gilgamesh@0.5x.jpg", locked: true
  },
  {
    id: 44, name: "Enkidu", cc: 4, ip: 4,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Wild Ally",
    ability: "Continuous:\nCards next to Enkidu gain +1 IP.",
    image: "images/cards/mesopotamiacards/enkidu@0.5x.jpg", locked: true
  },
  {
    id: 45, name: "Ziggurat", cc: 3, ip: 3,
    type: "Religious", type2: null, era: "Mesopotamia",
    abilityName: "Sacred Space",
    ability: "Continuous:\nProvides +1 IP to other Religious cards at this location.",
    image: "images/cards/mesopotamiacards/ziggurat@0.5x.jpg", locked: true
  },
  {
    /* Filename on disk is misspelled "cunieform" — to be renamed in a later pass */
    id: 46, name: "Cuneiform", cc: 1, ip: 0,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Writing",
    ability: "At Once:\n+1 IP to all of your Prehistory cards in play.",
    image: "images/cards/mesopotamiacards/cunieform@0.5x.jpg", locked: true
  },
  {
    id: 47, name: "Hammurabi", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "Eye For An Eye",
    ability: "At Once:\nDestroy your lowest-CC card here in order to destroy your opponent's lowest-CC card here.",
    image: "images/cards/mesopotamiacards/hammurabi@0.5x.jpg", locked: true
  },
  {
    id: 48, name: "Chariot", cc: 2, ip: 3,
    type: "Military", type2: null, era: "Mesopotamia",
    abilityName: "Wheels of Conquest",
    ability: "Can move once on its own.\nWhen it moves, strike an opposing card and reduce it by -1 IP.",
    image: "images/cards/mesopotamiacards/chariot@0.5x.jpg", locked: true
  },
  {
    /* Display name includes the article; filename does not */
    id: 49, name: "The Phoenicians", cc: 3, ip: 3,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Alphabet",
    ability: "At Once:\nAttaches to one of your cards here.\n+1 IP if it's a Cultural card.",
    image: "images/cards/mesopotamiacards/phoenicians@0.5x.jpg", locked: true
  },
  {
    id: 50, name: "Nebuchadnezzar", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "Builder of Babylon",
    ability: "At Once:\nReduce your in-hand Mesopotamian cards by -1 CC.",
    image: "images/cards/mesopotamiacards/nebuchadnezzar@0.5x.jpg", locked: true
  },

  // ─── EGYPT ─────────────────────────────────────────────────────────────────
  // Card DATA for the (still-stubbed) Egypt battle. UNREACHABLE until decked —
  // none are added to any deck, all locked:true, so entering them is inert.
  // WIRED = ability implemented via existing machinery (has a CARD_ABILITIES
  // entry or is handled in evaluateContinuous/effectiveCost). NOT-YET-WIRED =
  // data + text only; NO ability logic, must not be decked until wired.
  // NOTE: type "Economic" (Trader) is NEW — no icon art yet, so the popup shows a
  // text-only type (existing guarded fallback, same as Labor). ip may be negative
  // (Hyksos).
  {
    id: 51, name: "Narmer", cc: 5, ip: 6,                       // WIRED (continuous averaging)
    type: "Political", type2: null, era: "Egypt",
    abilityName: "The Unifier",
    ability: "Continuous:\nShares your total IP equally across this location and those adjacent to it.",
    image: "images/cards/egyptcards/narmer.jpg", locked: true
  },
  {
    id: 52, name: "Hatshepsut", cc: 5, ip: 5,                   // TODO (Egypt): NOT YET WIRED — trade/movement
    type: "Political", type2: null, era: "Egypt",
    abilityName: "Trading Queen",
    ability: "Trade one of your cards with an adjacent location.\n(Not yet wired.)",
    image: "images/cards/egyptcards/hatshepsut.jpg", locked: true
  },
  {
    id: 53, name: "Ramses II", cc: 5, ip: 4,                    // WIRED (Next Turn: 2x IP to next turn's Cultural plays)
    type: "Political", type2: null, era: "Egypt",
    abilityName: "Monuments Man",
    ability: "Next Turn:\nDouble the IP of Cultural cards you play.",
    image: "images/cards/egyptcards/ramses.jpg", locked: true
  },
  {
    id: 54, name: "Papyrus", cc: 2, ip: 2,                      // WIRED (At Once: copy last-played card to hand)
    type: "Scientific", type2: null, era: "Egypt",             // (was "Technology" — dropped; Imhotep's Scientific discount now covers it)
    abilityName: "For the Record",
    ability: "At Once:\nCopy the last card you played and add it to your hand.",
    image: "images/cards/egyptcards/papyrus.jpg", locked: true
  },
  {
    id: 55, name: "Farmer", cc: 1, ip: 1,                       // WIRED (grantCapitalNextTurn) — distinct from Meso Farmer(39)
    type: "Labor", type2: null, era: "Egypt",
    abilityName: "Harvest",
    ability: "At Once:\n+1 Capital next turn.",
    image: "images/cards/egyptcards/farmer.jpg", locked: true
  },
  {
    id: 56, name: "Scribe", cc: 2, ip: 2,                       // WIRED (capital per prior card here) — distinct from Meso Scribe(40)
    type: "Labor", type2: null, era: "Egypt",
    abilityName: "Accounting",
    ability: "At Once:\nFor every other card you have here, gain +1 Capital next turn.",
    image: "images/cards/egyptcards/scribe.jpg", locked: true
  },
  {
    id: 57, name: "Pyramid", cc: 3, ip: 0,                      // WIRED (continuous double-last-Political)
    type: "Scientific", type2: null, era: "Egypt",
    abilityName: "Monumental Legacy",
    ability: "Continuous:\nDoubles the IP of the last Political card you played here.",
    image: "images/cards/egyptcards/pyramid.jpg", locked: true
  },
  {
    id: 58, name: "Rosetta Stone", cc: 3, ip: 3,               // WIRED (adopts ability of the first card you played here)
    type: "Scientific", type2: null, era: "Egypt",
    abilityName: "Decipher The Past",
    ability: "Adopt the ability of the first card you played at this location.",
    image: "images/cards/egyptcards/rosettastone.jpg", locked: true
  },
  {
    id: 59, name: "Obelisk", cc: 3, ip: 1,                      // WIRED (End of turn: +1 IP — Megalith key)
    type: "Cultural", type2: null, era: "Egypt",
    abilityName: "Monolith",
    ability: "End of turn:\nGain +1 IP.",
    image: "images/cards/egyptcards/obelisk.jpg", locked: true
  },
  {
    id: 60, name: "Khufu", cc: 4, ip: 4,                        // WIRED (draw a Scientific card)
    type: "Political", type2: null, era: "Egypt",
    abilityName: "Great Pyramid",
    ability: "At Once:\nDraw a Scientific card.",
    image: "images/cards/egyptcards/khufu.jpg", locked: true
  },
  {
    id: 61, name: "King Tutankhamen", cc: 3, ip: 3,            // TODO (Egypt): NOT YET WIRED — resurrection
    type: "Political", type2: null, era: "Egypt",
    abilityName: "Sacred Tomb",
    ability: "If resurrected, gains double IP.\n(Not yet wired.)",
    image: "images/cards/egyptcards/tutankhamen.jpg", locked: true
  },
  {
    id: 62, name: "Hieroglyphics", cc: 2, ip: 0,               // WIRED (continuous type-boost)
    type: "Cultural", type2: null, era: "Egypt",
    abilityName: "Sacred Symbols",
    ability: "Continuous:\n+2 IP to your Religious and Political cards here.",
    image: "images/cards/egyptcards/hieroglyphics.jpg", locked: true
  },
  {
    id: 63, name: "Ra", cc: 4, ip: 2,                           // WIRED (discard lowest → addIPMod)
    type: "Religious", type2: null, era: "Egypt",
    abilityName: "Sun God",
    ability: "At Once:\nDiscard your lowest-CC card in hand; Ra permanently gains its IP.",
    image: "images/cards/egyptcards/ra.jpg", locked: true
  },
  {
    id: 64, name: "Sphinx", cc: 3, ip: 2,                       // WIRED (Kente-style protection)
    type: "Cultural", type2: null, era: "Egypt",
    abilityName: "Monumental Guardian",
    ability: "Continuous:\nYour cards here cannot have their IP reduced.",
    image: "images/cards/egyptcards/sphinx.jpg", locked: true
  },
  {
    id: 65, name: "Imhotep", cc: 3, ip: 3,                      // WIRED (effectiveCost -1 Scientific here)
    type: "Scientific", type2: null, era: "Egypt",
    abilityName: "Ancient Engineering",
    ability: "Continuous:\nReduces the cost to play Scientific cards at this location by -1 CC.",
    image: "images/cards/egyptcards/imhotep.jpg", locked: true
  },
  {
    id: 66, name: "Book of the Dead", cc: 3, ip: 3,            // TODO (Egypt): NOT YET WIRED — resurrection
    type: "Religious", type2: null, era: "Egypt",
    abilityName: "Weighing of the Heart",
    ability: "Resurrects a fallen card.\n(Not yet wired.)",
    image: "images/cards/egyptcards/bookofthedead.jpg", locked: true
  },
  {
    id: 67, name: "Hyksos", cc: 3, ip: -2,                      // TODO (Egypt): NOT YET WIRED
    type: "Political", type2: null, era: "Egypt",
    abilityName: "Foreign Kings",
    ability: "Foreign rulers seize the land.\n(Not yet wired.)",
    image: "images/cards/egyptcards/hyksos.jpg", locked: true
  },
  {
    id: 68, name: "Trader", cc: 1, ip: 1,                       // TODO (Egypt): NOT YET WIRED — trade; NEW "Economic" type
    type: "Economic", type2: null, era: "Egypt",
    abilityName: "Barter",
    ability: "Trade goods for advantage.\n(Not yet wired.)",
    image: "images/cards/egyptcards/trader.jpg", locked: true
  },
  {
    id: 69, name: "Chariots", cc: 2, ip: 2,                     // TODO (Egypt): NOT YET WIRED — movement
    type: "Military", type2: null, era: "Egypt",
    abilityName: "Chariot of Ra",
    ability: "Move to an adjacent location.\n(Not yet wired.)",
    image: "images/cards/egyptcards/chariots.jpg", locked: true
  },
  {
    id: 70, name: "Soldier", cc: 1, ip: 1,                      // WIRED (strike -1 IP) — distinct from Meso Soldier(42)
    type: "Military", type2: null, era: "Egypt",
    abilityName: "Military Service",
    ability: "At Once:\nStrike an opponent's card here and reduce it by -1 IP.",
    image: "images/cards/egyptcards/soldier.jpg", locked: true
  },
  {
    id: 71, name: "Priest", cc: 1, ip: 1,                       // TODO (Egypt): NOT YET WIRED — resurrection; distinct from Meso Priest(38)
    type: "Religious", type2: null, era: "Egypt",
    abilityName: "Embalming",
    ability: "Prepares a fallen card for resurrection.\n(Not yet wired.)",
    image: "images/cards/egyptcards/priest.jpg", locked: true
  },
  {
    // TOKEN — NOT DECKABLE. Created by the (unbuilt) resurrection system; it
    // inherits the revived card's stats at creation, so cc/ip here are just
    // placeholders. No ability, never in a deck, never drawn.
    id: 72, name: "Mummy", cc: 0, ip: 0,                        // TOKEN (placeholder stats)
    type: null, type2: null, era: "Egypt",
    abilityName: null, ability: null,
    image: "images/cards/egyptcards/mummy.jpg", locked: true, token: true
  },
  {
    // TOKEN — NOT DECKABLE. Granted to a side's hand by the NUBIAN_GOLD_ON_PLAY
    // location key (see applyNubianGoldOnPlay). Free to play (cc 0); on reveal it
    // grants +1 Capital next turn via the Farmer machinery (grantCapitalNextTurn).
    // Type "Economic" (chosen over typeless so the popup shows a consistent type).
    id: 73, name: "Nubian Gold", cc: 0, ip: 1,                  // TOKEN (WIRED: +1 capital next turn)
    type: "Economic", type2: null, era: "Egypt",
    abilityName: "Tribute",
    ability: "Next Turn:\nReceive +1 Capital.",
    image: "images/cards/egyptcards/nubiangold.jpg", locked: true, token: true
  }

];

/* ── Adventure-Mode card unlocks ─────────────────────────────────────
   Card OWNERSHIP now lives in SOG.collection (js/sog-collection.js) — the
   single source of truth that owns the `sog_unlocked_cards` storage, the
   starter set, and the CARDS[].locked view (it applies locked:false to owned
   cards on boot). SOG.Cards.unlock/isUnlocked remain here as thin DELEGATES
   so every existing caller keeps working unchanged.

   laneOf / ADVENTURE_ERAS stay here — they are pure card metadata (lane is
   derived from era), not ownership.

   SOG.Cards.unlock(idOrIds)  → SOG.collection.unlockCard(idOrIds)
   SOG.Cards.isUnlocked(id)   → SOG.collection.isUnlocked(id)               */
(function () {
  'use strict';

  /* Card progression lanes (Phase D2d-a). Two fully separate lanes:
       'adventure' — Prehistory + Mesopotamia (and future Adventure eras).
                     Owned via the player collection (sog_unlocked_cards); no
                     type-locks.
       'arcadium'  — everything else. Unlocked via the existing Arcadium
                     Progression (Serf/Giant wins, type-locks).
     Lane is DERIVED FROM era rather than stored per-card: every Adventure
     card already carries a distinct era string, and no Arcadium card uses
     these eras (verified: Rome/China/Reformation/… etc.). Adding a future
     Adventure era is a one-line change here instead of editing every card. */
  var ADVENTURE_ERAS = ['Prehistory', 'Mesopotamia']; // future: 'Egypt', 'Greece', …

  function laneOf(idOrCard) {
    var card = (idOrCard && typeof idOrCard === 'object')
      ? idOrCard
      : CARDS.find(function (c) { return c.id === idOrCard; });
    if (!card) return 'arcadium';
    return ADVENTURE_ERAS.indexOf(card.era) !== -1 ? 'adventure' : 'arcadium';
  }

  // Delegates to the collection (the single source of truth). The collection
  // module loads right after this file; these resolve it at call time.
  function unlock(idOrIds) {
    if (window.SOG && SOG.collection && typeof SOG.collection.unlockCard === 'function') {
      return SOG.collection.unlockCard(idOrIds);
    }
  }
  function isUnlocked(id) {
    return !!(window.SOG && SOG.collection && typeof SOG.collection.isUnlocked === 'function'
              && SOG.collection.isUnlocked(id));
  }

  window.SOG = window.SOG || {};
  window.SOG.Cards = window.SOG.Cards || {};
  window.SOG.Cards.unlock         = unlock;
  window.SOG.Cards.isUnlocked     = isUnlocked;
  window.SOG.Cards.laneOf         = laneOf;
  window.SOG.Cards.ADVENTURE_ERAS = ADVENTURE_ERAS;
})();

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
 *   locked     {boolean}     If true, card is hidden from the demo deck builder (future content)
 *
 * Ability trigger keywords (used by the ability engine in game.js):
 *   "At Once"       — fires immediately when the card is revealed
 *   "Continuous"    — passive, re-evaluated whenever board state changes
 *   "If / When"     — conditional, fires when the described event occurs
 */

const CARDS = [

  // ─── POLITICAL ────────────────────────────────────────────────────────────
  {
    id: 1, name: "Citizens", cc: 1, ip: 1,
    type: "Political", type2: null, era: "Rome",
    abilityName: null, ability: null,
    image: "images/cards/Citizens.jpg", locked: false
  },
  {
    id: 2, name: "Scholar-Officials", cc: 2, ip: 1,
    type: "Political", type2: null, era: "China",
    abilityName: "Civil Service",
    ability: "At Once: For every other card you have here, Scholar-Officials gain +1 Capital next turn.",
    image: "images/cards/Scholar-Officials.jpg", locked: false
  },
  {
    id: 3, name: "Justinian", cc: 3, ip: 3,
    type: "Political", type2: null, era: "Rome",
    abilityName: "Code of Justinian",
    ability: "At Once: Justinian resets all cards here back to their original IP.",
    image: "images/cards/Justinian.jpg", locked: false
  },
  {
    id: 4, name: "Empress Wu", cc: 4, ip: 4,
    type: "Political", type2: null, era: "China",
    abilityName: "Iron Fist",
    ability: "At Once: Empress Wu pushes your opponent's Political or Military card with the highest IP away from here, if she can't, she destroys it.",
    image: "images/cards/Empress Wu.jpg", locked: false
  },
  {
    id: 5, name: "Pacal the Great", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesoamerica",
    abilityName: "Temple of Inscriptions",
    ability: "At Once: Pacal triggers the 'At Once' abilities of all your cards at this location.",
    image: "images/cards/Pacal the Great.jpg", locked: false
  },

  // ─── RELIGIOUS ────────────────────────────────────────────────────────────
  {
    id: 6, name: "Priests", cc: 1, ip: 1,
    type: "Religious", type2: null, era: null,
    abilityName: null, ability: null,
    image: "images/cards/Priests.jpg", locked: false
  },
  {
    id: 7, name: "Jan Hus", cc: 2, ip: 1,
    type: "Religious", type2: null, era: "Reformation",
    abilityName: "Martyr for Reform",
    ability: "If Jan Hus is discarded, he gives all your cards currently in play +1 IP.",
    image: "images/cards/Jan Hus.jpg", locked: false
  },
  {
    id: 8, name: "Francis of Assisi", cc: 3, ip: 4,
    type: "Religious", type2: null, era: "Middle Ages",
    abilityName: "Vow of Poverty",
    ability: "At Once: Francis of Assisi discards the highest cost Religious card in your hand.",
    image: "images/cards/Francis of Assisi.jpg", locked: false
  },
  {
    id: 9, name: "Erasmus", cc: 4, ip: 3,
    type: "Religious", type2: null, era: "Reformation",
    abilityName: "On Free Will",
    ability: "At Once: Erasmus allows you to choose any card from your hand to discard.",
    image: "images/cards/Erasmus.jpg", locked: false
  },
  {
    id: 10, name: "Jesus Christ", cc: 5, ip: 5,
    type: "Religious", type2: null, era: "Early Christianity",
    abilityName: "King of Martyrs",
    ability: "If Jesus is discarded, he gains +3 IP and returns to your hand.",
    image: "images/cards/Jesus Christ.jpg", locked: false
  },

  // ─── MILITARY ─────────────────────────────────────────────────────────────
  {
    id: 11, name: "Knight", cc: 1, ip: 1,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: null, ability: null,
    image: "images/cards/Knight.jpg", locked: false
  },
  {
    id: 12, name: "Samurai", cc: 2, ip: 2,
    type: "Military", type2: null, era: "Japan",
    abilityName: "Bushido Code",
    ability: "Any time the Samurai is destroyed, it gains +2 IP and returns to the same location.",
    image: "images/cards/Samurai.jpg", locked: false
  },
  {
    id: 13, name: "Hernan Cortes", cc: 3, ip: 3,
    type: "Military", type2: null, era: "Age of Exploration",
    abilityName: "Conquistador",
    ability: "At Once: Cortes destroys all of your cards at this location and gains +1 IP for each one destroyed.",
    image: "images/cards/Hernan Cortes.jpg", locked: false
  },
  {
    id: 14, name: "Joan of Arc", cc: 4, ip: 4,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: "Maid of Orleans",
    ability: "If Joan of Arc is destroyed, she summons a Religious card from your hand.",
    image: "images/cards/Joan of Arc.jpg", locked: false
  },
  {
    id: 15, name: "William the Conqueror", cc: 5, ip: 1,
    type: "Military", type2: null, era: "Middle Ages",
    abilityName: "The Norman Conquest",
    ability: "Continuous: Accumulates the IP from all cards you destroyed this game.",
    image: "images/cards/William the Conqueror.jpg", locked: false
  },

  // ─── CULTURAL ─────────────────────────────────────────────────────────────
  {
    id: 16, name: "Griots", cc: 1, ip: 1,
    type: "Cultural", type2: null, era: "West African Societies",
    abilityName: null, ability: null,
    image: "images/cards/Griots.jpg", locked: false
  },
  {
    id: 17, name: "Kente", cc: 2, ip: 2,
    type: "Cultural", type2: null, era: "West African Societies",
    abilityName: "Woven Heritage",
    ability: "Continuous: Kente prevents all cards here from being destroyed.",
    image: "images/cards/Kente.jpg", locked: false
  },
  {
    id: 18, name: "Juvenal", cc: 3, ip: 3,
    type: "Cultural", type2: null, era: "Rome",
    abilityName: "Satire",
    ability: "Continuous: Juvenal reduces all 4 and 5 CC cards here by -2 IP.",
    image: "images/cards/Juvenal.jpg", locked: false
  },
  {
    id: 19, name: "Cosimo de'Medici", cc: 4, ip: 4,
    type: "Cultural", type2: null, era: "Renaissance",
    abilityName: "Patron of the Arts",
    ability: "Continuous: Cosimo de\u2019Medici reduces your cost to play Cultural cards by -1.",
    image: "images/cards/Cosimo de'Medici.jpg", locked: false
  },
  {
    id: 20, name: "Voltaire", cc: 5, ip: 5,
    type: "Cultural", type2: null, era: "Enlightenment",
    abilityName: "Candide",
    ability: "Continuous: If Voltaire is your only card here, he receives +4 IP.",
    image: "images/cards/Voltaire.jpg", locked: false
  },

  // ─── EXPLORATION ──────────────────────────────────────────────────────────
  {
    id: 21, name: "Nomad", cc: 1, ip: 1,
    type: "Exploration", type2: null, era: "Islamic Empires",
    abilityName: null, ability: null,
    image: "images/cards/Nomad.jpg", locked: false
  },
  {
    id: 22, name: "Henry the Navigator", cc: 2, ip: 1,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Navigation Patron",
    ability: "Continuous: Henry reduces your cost of playing Exploration cards by -1.",
    image: "images/cards/Henry the Navigator.jpg", locked: false
  },
  {
    id: 23, name: "Zheng He", cc: 3, ip: 1,
    type: "Exploration", type2: null, era: "China",
    abilityName: "Treasure Fleet",
    ability: "At Once: Zheng He delivers +2 IP to 1 card at each adjacent location.",
    image: "images/cards/Zheng He.jpg", locked: false
  },
  {
    id: 24, name: "Magellan", cc: 4, ip: 4,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Circumnavigation",
    ability: "Magellan can move each turn and gains +1 IP with each move.",
    image: "images/cards/Magellan.jpg", locked: false
  },
  {
    id: 25, name: "Christopher Columbus", cc: 5, ip: 5,
    type: "Exploration", type2: null, era: "Age of Exploration",
    abilityName: "Columbian Exchange",
    ability: "Columbus can move once on his own. When he arrives at a new location, he reduces your opponent's Cultural and Political cards at the new location by -1 IP.",
    image: "images/cards/Christopher Columbus.jpg", locked: false
  },

  // ─── PREHISTORY (Adventure Mode — locked) ────────────────────────────────
  {
    id: 26, name: "Tool", cc: 1, ip: 1,
    type: "Scientific", type2: null, era: "Prehistory",
    abilityName: "Ancient Tech",
    ability: "At Once: Tool draws 1 card.",
    image: "images/prehistorycards/toolcard.jpg", locked: true
  },
  {
    id: 27, name: "Hunter", cc: 2, ip: 2,
    type: "Military", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/prehistorycards/huntercard.jpg", locked: true
  },
  {
    id: 28, name: "Gatherer", cc: 2, ip: 2,
    type: "Cultural", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/prehistorycards/gatherercard.jpg", locked: true
  },
  {
    id: 29, name: "Fire", cc: 2, ip: 1,
    type: "Scientific", type2: null, era: "Prehistory",
    abilityName: "Cooked",
    ability: "Continuous: Cards played after Fire here gain +1 IP.",
    image: "images/prehistorycards/firecard.jpg", locked: true
  },
  {
    id: 30, name: "Cave Art", cc: 2, ip: 1,
    type: "Cultural", type2: null, era: "Prehistory",
    abilityName: "Ancient Storytelling",
    ability: "Continuous: Cards played before Cave Art here gain +1 IP.",
    image: "images/prehistorycards/caveartcard.jpg", locked: true
  },
  {
    id: 31, name: "Megalith", cc: 2, ip: 3,
    type: "Cultural", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/prehistorycards/megalithcard.jpg", locked: true
  },
  {
    id: 32, name: "Domesticated Animal", cc: 2, ip: 1,
    type: "Scientific", type2: null, era: "Prehistory",
    abilityName: "Man's Best Friend",
    ability: "Continuous: Cards in adjacent slots here gain +1 IP.",
    image: "images/prehistorycards/domesticatedanimalcard.jpg", locked: true
  },
  {
    id: 33, name: "Lucy", cc: 4, ip: 4,
    type: "Scientific", type2: null, era: "Prehistory",
    abilityName: "First Steps",
    ability: "Lucy can move once.",
    image: "images/prehistorycards/lucycard.jpg", locked: true
  },
  {
    id: 34, name: "Neanderthal", cc: 4, ip: 4,
    type: "Scientific", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/prehistorycards/neanderthalcard.jpg", locked: true
  },
  {
    id: 35, name: "Otzi", cc: 4, ip: 4,
    type: "Exploration", type2: null, era: "Prehistory",
    abilityName: "Migrate",
    ability: "When a card is played here, Otzi moves to a random location.",
    image: "images/prehistorycards/otzicard.jpg", locked: true
  },
  {
    id: 36, name: "Tribe", cc: 2, ip: 2,
    type: "Political", type2: null, era: "Prehistory",
    abilityName: "Strength In Numbers",
    ability: "At Once: If you play a card here next turn, Tribe gains +1 IP.",
    image: "images/prehistorycards/tribecard.jpg", locked: true
  }

];

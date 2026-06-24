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
    image: "images/cards/Jesus Christ.jpg", locked: false,
    attributionPattern: 'C'   // thumbnail = the card that did the discarding
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
    image: "images/cards/William the Conqueror.jpg", locked: false,
    attributionPattern: 'B'   // each destroyed card's portrait = separate thumbnail
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
    image: "images/cards/Zheng He.jpg", locked: false,
    attributionPattern: 'D'   // Zheng He's portrait appears on each target card's breakdown
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
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Ancient Tech",
    ability: "At Once: Tool draws 1 card.",
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
    ability: "Continuous: Cards played after Fire here gain +1 IP.",
    image: "images/cards/prehistorycards/firecard.jpg", locked: true
  },
  {
    id: 30, name: "Cave Art", cc: 2, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Ancient Storytelling",
    ability: "Continuous: Cards played before Cave Art here gain +1 IP.",
    image: "images/cards/prehistorycards/caveartcard.jpg", locked: true
  },
  {
    id: 31, name: "Megalith", cc: 2, ip: 2,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: null, ability: null,
    image: "images/cards/prehistorycards/megalithcard.jpg", locked: true
  },
  {
    id: 32, name: "Domesticated Animal", cc: 2, ip: 1,
    type: "Prehistory", type2: null, era: "Prehistory",
    abilityName: "Man's Best Friend",
    ability: "Continuous: Cards in adjacent slots here gain +1 IP.",
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
    ability: "At Once: Tribe gains +1 IP for every card you play here next turn.",
    image: "images/cards/prehistorycards/tribecard.jpg", locked: true
  },

  /* ── Mesopotamia era (ids 37–50) ─────────────────────────────────
     Art lives at images/mesopotamiacards/[name]@0.5x.jpg.
     @0.5x files used for all render contexts; the @sm thumbnail
     fallback in buildCardImg will gracefully fall back to the @0.5x
     file when no @sm variant exists.
     Abilities are stubbed in Phase A — no gameplay logic yet.       */
  {
    id: 37, name: "Sargon", cc: 5, ip: 3,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "The Empire State",
    ability: "Continuous: Sargon grants +3 IP to adjacent location(s).",
    image: "images/mesopotamiacards/sargon@0.5x.jpg", locked: true
  },
  {
    id: 38, name: "Priest", cc: 1, ip: 2,
    type: "Religious", type2: null, era: "Mesopotamia",
    abilityName: "Spiritual Sacrifice",
    ability: "At Once: Discard the card in your hand with lowest CC.",
    image: "images/mesopotamiacards/priest@0.5x.jpg", locked: true
  },
  {
    id: 39, name: "Farmer", cc: 1, ip: 1,
    type: "Labor", type2: null, era: "Mesopotamia",
    abilityName: "Harvest", ability: "At Once: Provides +1 Capital next turn.",
    image: "images/mesopotamiacards/farmer@0.5x.jpg", locked: true
  },
  {
    id: 40, name: "Scribe", cc: 2, ip: 2,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Record Keeper",
    ability: "At Once: Provides +1 IP to all of your other cards at this location.",
    image: "images/mesopotamiacards/scribe@0.5x.jpg", locked: true
  },
  {
    id: 41, name: "Canals", cc: 1, ip: 1,
    type: "Scientific", type2: null, era: "Mesopotamia",
    abilityName: "Irrigation",
    ability: "Continuous: Boosts all Labor cards here by +1 IP.",
    image: "images/mesopotamiacards/canals@0.5x.jpg", locked: true
  },
  {
    id: 42, name: "Soldier", cc: 1, ip: 1,
    type: "Military", type2: null, era: "Mesopotamia",
    abilityName: "Military Service",
    ability: "At Once: Strike one of your opponent's cards here and reduce it by -1 IP.",
    image: "images/mesopotamiacards/soldier@0.5x.jpg", locked: true
  },
  {
    id: 43, name: "Gilgamesh", cc: 5, ip: 5,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Epic Hero",
    ability: "Continuous: Gains +1 IP for all other Cultural cards you've played.",
    image: "images/mesopotamiacards/gilgamesh@0.5x.jpg", locked: true
  },
  {
    id: 44, name: "Enkidu", cc: 3, ip: 3,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Wild Ally",
    ability: "Continuous: Cards next to Enkidu gain +1 IP.",
    image: "images/mesopotamiacards/enkidu@0.5x.jpg", locked: true
  },
  {
    id: 45, name: "Ziggurat", cc: 3, ip: 3,
    type: "Religious", type2: null, era: "Mesopotamia",
    abilityName: "Sacred Space",
    ability: "Continuous: Provides +1 IP to other Religious cards at this location.",
    image: "images/mesopotamiacards/ziggurat@0.5x.jpg", locked: true
  },
  {
    /* Filename on disk is misspelled "cunieform" — to be renamed in a later pass */
    id: 46, name: "Cuneiform", cc: 1, ip: 1,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Writing",
    ability: "At Once: +1 IP to all of your Prehistory cards in play.",
    image: "images/mesopotamiacards/cunieform@0.5x.jpg", locked: true
  },
  {
    id: 47, name: "Hammurabi", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "Eye For An Eye",
    ability: "At Once: Destroy your lowest CC card here in order to destroy your opponent's lowest CC card.",
    image: "images/mesopotamiacards/hammurabi@0.5x.jpg", locked: true
  },
  {
    id: 48, name: "Chariot", cc: 2, ip: 3,
    type: "Military", type2: null, era: "Mesopotamia",
    abilityName: "Wheels of Conquest",
    ability: "Can move once on its own.\nWhen it moves, strike an opposing card and reduce it by -1 IP.",
    image: "images/mesopotamiacards/chariot@0.5x.jpg", locked: true
  },
  {
    /* Display name includes the article; filename does not */
    id: 49, name: "The Phoenicians", cc: 3, ip: 3,
    type: "Cultural", type2: null, era: "Mesopotamia",
    abilityName: "Alphabet",
    ability: "At Once: Attaches itself to one of your Cultural cards here.",
    image: "images/mesopotamiacards/phoenicians@0.5x.jpg", locked: true
  },
  {
    id: 50, name: "Nebuchadnezzar", cc: 5, ip: 5,
    type: "Political", type2: null, era: "Mesopotamia",
    abilityName: "Builder of Babylon",
    ability: "Continuous: Mesopotamia cards cost -1 CC to play.",
    image: "images/mesopotamiacards/nebuchadnezzar@0.5x.jpg", locked: true
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

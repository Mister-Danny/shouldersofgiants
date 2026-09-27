/**
 * locations.js
 * Shoulders of Giants — Location Data
 *
 * Each location object contains:
 *   id             {number}      Unique location identifier
 *   name           {string}      Display name of the location
 *   region         {string}      Region subtitle shown on the location tile
 *   abilityText    {string}      Plain-English description of the location's ability
 *   abilityKey     {string}      Machine-readable key used by game.js to apply the ability effect
 *   image          {string}      Path to the location's artwork image
 *   thumbnailCrop  {object|null} CSS crop hint for IP-breakdown thumbnail rendering:
 *                                  { bgSize: string, bgPos: string }
 *                                Only locations that currently grant IP bonuses need a
 *                                thumbnailCrop defined; others may set null. Future locations
 *                                with IP effects just need this field filled in.
 *
 * Ability keys and their effects (implemented in game.js):
 *
 *   "MILITARY_FREE_MOVE_AWAY"
 *       Scandinavia — Military cards may move away from this location at no capital cost.
 *
 *   "FIRST_CARD_HERE"
 *       The Great Rift Valley — Each player must play their very first card of the game
 *       to this location (enforced during the selection phase of Turn 1).
 *
 *   "MOVE_IN_GAINS_IP"
 *       The Cape of Good Hope — Any card that moves TO this location gains +1 IP
 *       (applied at the moment the move is executed during the reveal phase).
 *
 *   "RELIGIOUS_DISCOUNT"
 *       The Levant — Religious cards cost 1 less Capital (minimum 1) to play here.
 *
 *   "CULTURAL_FREE_MOVE_HERE"
 *       Timbuktu — Cultural cards may move TO this location at no capital cost.
 *
 *   "ALL_MINUS_ONE_IP"
 *       The Sahara — All cards at this location receive -1 IP (continuous debuff).
 *
 * ARCADIUM POOL: game.js pickLocations draws 3 of every catalog location that
 * carries an abilityKey (Savannah 7 / Desert 8 are Ötzi-only, no ability, and
 * are skipped). Two locations sharing a name (the two Thebes) never draw
 * together.
 *
 * The entries from id 101 up are COPIES of boss-battle locations (Nebuchadnezzar,
 * Hatshepsut, Ramses, Akhenaten, Kush, Hyksos) so Arcadium can use them. The
 * boss battles keep their own definitions (their scripts / data/level-data.js)
 * — if one changes there, mirror it here. Ids match the boss's ids EXCEPT
 * Hyksos (his script uses 131-133, which Ramses also uses): here he is 161-163.
 * Column art per id lives in css/style.css ("ARCADIUM location art").
 *
 *   floods {boolean}  optional — in Arcadium this location rolls to FLOOD at the
 *                     start of every turn (js/game.js _rollArcadiumFloods, shared
 *                     SOG.flood). A flooded location takes no new plays that turn.
 */

const LOCATIONS = [
  {
    id: 1,
    name: "Scandinavia",
    region: "Fjordlandia",
    abilityText: "Military cards can freely move away from here.",
    abilityKey: "MILITARY_FREE_MOVE_AWAY",
    image: "images/locations/scandinavia.jpg",
    thumbnailCrop: null   // no IP bonus — no thumbnail needed
  },
  {
    id: 2,
    name: "The Great Rift Valley",
    region: "Cradle of Humanity",
    abilityText: "You must play your first card of the game here.",
    abilityKey: "FIRST_CARD_HERE",
    image: "images/locations/greatriftvalley.jpg",
    thumbnailCrop: null
  },
  {
    id: 3,
    name: "The Cape of Good Hope",
    region: "Waypoint",
    abilityText: "When a card moves here it gains +1 IP.",
    abilityKey: "MOVE_IN_GAINS_IP",
    image: "images/locations/capeofgoodhope.jpg",
    // Traders-on-the-dock region: lower portion of the image.
    // Adjust bgPos if the dock area falls in a different spot after reviewing the image.
    thumbnailCrop: { bgSize: '200%', bgPos: '40% 80%' }
  },
  {
    id: 4,
    name: "The Levant",
    region: "Monotheism",
    abilityText: "Religious cards cost -1 CC to play here.",
    abilityKey: "RELIGIOUS_DISCOUNT",
    image: "images/locations/levant.jpg",
    thumbnailCrop: null
  },
  {
    id: 5,
    name: "Timbuktu",
    region: "Beacon of Culture",
    abilityText: "Cultural cards can freely move here.",
    abilityKey: "CULTURAL_FREE_MOVE_HERE",
    image: "images/locations/timbuktu.jpg",
    thumbnailCrop: null
  },
  {
    id: 6,
    name: "The Sahara",
    region: "Endless Sands",
    abilityText: "-1 IP to all cards here.",
    abilityKey: "ALL_MINUS_ONE_IP",
    image: "images/locations/sahara.jpg",
    // Travelers-on-the-camels region: centre of the image.
    // Adjust bgPos after reviewing the image.
    thumbnailCrop: { bgSize: '200%', bgPos: '50% 45%' }
  },
  {
    id: 7,
    name: "The Savannah",
    region: "Heart of Africa",
    abilityText: "",
    abilityKey: null,
    image: "images/locations/savannah.jpg",
    thumbnailCrop: null
  },
  {
    id: 8,
    name: "The Desert",
    region: "Ancient Sands",
    abilityText: "",
    abilityKey: null,
    image: "images/locations/desert.jpg",
    thumbnailCrop: null
  },

  // ─── Nebuchadnezzar (js/sog-adventure-hanginggardens.js) ───────────────────
  { id: 101, name: "Euphrates River", region: "Babylon", abilityText: "Labor cards reveal here with +2 IP",    abilityKey: "LABOR_PLUS_2_HERE",    image: "images/locations/euphrates.jpg", thumbnailCrop: null, floods: true },
  { id: 102, name: "Babylon",         region: "Babylon", abilityText: "5-CC cards cost -1 CC",                 abilityKey: "BABYLON_COST_5",       image: "images/locations/babylon.jpg",   thumbnailCrop: null },
  { id: 103, name: "Tigris River",    region: "Babylon", abilityText: "Military cards reveal here with +1 IP", abilityKey: "MILITARY_PLUS_1_HERE", image: "images/locations/tigris.jpg",    thumbnailCrop: null, floods: true },

  // ─── Hatshepsut (js/sog-adventure-hatshepsut.js) ────────────────────────────
  { id: 121, name: "Thebes",      region: "City of a Hundred Gates", abilityText: "When a card moves here this turn, gain +1 Capital next turn.", abilityKey: "MOVE_HERE_CAPITAL",  image: "images/locations/thebes.jpg", thumbnailCrop: null },
  { id: 122, name: "The Red Sea", region: "Trade Route to Punt",     abilityText: "You can move one card from here each turn.",                  abilityKey: "ANY_FREE_MOVE_AWAY", image: "images/locations/redsea.jpg", thumbnailCrop: null },
  { id: 123, name: "Punt",        region: "Land of Incense",         abilityText: "When a card moves here, it gains +1 IP.",                     abilityKey: "MOVE_HERE_IP",       image: "images/locations/punt.jpg",   thumbnailCrop: null },

  // ─── Ramses (data/level-data.js 'ramses') ───────────────────────────────────
  { id: 131, name: "Pi-Ramses",     region: "The New Capital",  abilityText: "+2 IP to the card with the most IP",  abilityKey: "HIGHEST_IP_PLUS_2_HERE", image: "images/locations/piramses.jpg",     thumbnailCrop: null },
  { id: 132, name: "Karnak Temple", region: "House of Amun",    abilityText: "2x IP to the card with the most IP",  abilityKey: "DOUBLE_HIGHEST_IP_HERE", image: "images/locations/karnaktemple.jpg", thumbnailCrop: null },
  { id: 133, name: "Abu Simbel",    region: "Nubian Frontier",  abilityText: "Fill all 4 slots here to gain +6 IP.", abilityKey: "FULL_SLOTS_PLUS_6_HERE", image: "images/locations/abusimbel.jpg",    thumbnailCrop: null },

  // ─── Akhenaten (data/level-data.js 'akhenaten') ─────────────────────────────
  { id: 141, name: "The Closed Temples",           region: "Thebes",    abilityText: "When you play a Religious card here, discard a card.", abilityKey: "RELIGIOUS_PLAY_DISCARDS",    image: "images/locations/closed_temples.jpg", thumbnailCrop: null },
  { id: 142, name: "The Great Temple of the Aten", region: "Akhetaten", abilityText: "If you only have one card here, receive +4 IP.",      abilityKey: "SOLO_CARD_PLUS_4_HERE",      image: "images/locations/temple_of_aten.jpg", thumbnailCrop: null },
  { id: 143, name: "The Royal Tomb",               region: "Amarna",    abilityText: "Game end: summon a card from your discard here.",    abilityKey: "SUMMON_FROM_DISCARD_AT_END", image: "images/locations/royal_tomb.jpg",     thumbnailCrop: null },

  // ─── Kush / Piye (data/level-data.js 'kush') ────────────────────────────────
  { id: 151, name: "Meroe",             region: "The Island of Meroe",       abilityText: "Repeat the At Once of Labor and Economic cards.", abilityKey: "REPEAT_LABOR_ECONOMIC_AT_ONCE", image: "images/locations/meroe.jpg",             thumbnailCrop: null },
  { id: 152, name: "Napata",            region: "Below the Fourth Cataract", abilityText: "Political cards gain +1 IP.",                     abilityKey: "POLITICAL_PLUS_1_STAMP",        image: "images/locations/napata.jpg",            thumbnailCrop: null },
  { id: 153, name: "Nubian Gold Mines", region: "The Eastern Desert",        abilityText: "33% chance of gold when you play a card here.",   abilityKey: "GOLD_CHANCE_ON_PLAY",           image: "images/locations/nubian_gold_mines.jpg", thumbnailCrop: null },

  // ─── Hyksos (js/sog-adventure-hyksos.js — his ids 131-133 clash with Ramses; re-id'd here) ──
  { id: 161, name: "The Nile Delta", region: "The Hyksos Seat",       abilityText: "+1 IP for each 1-CC card you have here.",                    abilityKey: "ONE_CC_PLUS_ONE_HERE",    image: "images/locations/nile_delta.jpg",     thumbnailCrop: null },
  { id: 162, name: "Thebes",         region: "The Egyptian Holdout",  abilityText: "If you're winning here, give the other locations +2 IP.",   abilityKey: "LEAD_HERE_BOOSTS_OTHERS", image: "images/locations/thebes.jpg",         thumbnailCrop: null },
  { id: 163, name: "Aswan Cataract", region: "The Southern Frontier", abilityText: "Cards cannot move here.",                                   abilityKey: "NO_MOVE_HERE",            image: "images/locations/aswan_cataract.jpg", thumbnailCrop: null }
];

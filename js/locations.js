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
 * Three of these six locations are randomly selected at the start of each game.
 * Selection logic lives in game.js.
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
  }
];

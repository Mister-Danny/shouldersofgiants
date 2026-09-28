'use strict';
/* Load the REAL battle engine into a fresh VM with a null DOM, for behaviour
   tests against SOG.board / SOG.abilities (and optionally SOG.ai).

     const { engine, place } = require('./support/engine-vm');
     const { G, board, abilities, CARDS } = engine();

   The board is three empty locations (ids 101/102/103), both sides, with the
   boost table built and the hands/decks empty. Objects created inside the VM
   carry that realm's prototypes, so compare them with the LOOSE deepEqual
   (require('node:assert').deepEqual), never the strict one. */
const fs   = require('node:fs');
const path = require('node:path');
const vm   = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function engine(opts) {
  opts = opts || {};
  const nullEl = () => null;
  const el = () => ({ style: {}, dataset: {}, textContent: '', innerHTML: '',
                      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                      appendChild() {}, removeChild() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {},
                      querySelector: nullEl, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) });
  // getElementById hands back an inert element (not null): the board's DOM refresh
  // passes call .querySelector on the board element unguarded, and get null from it.
  const document = { getElementById: el, querySelector: nullEl, querySelectorAll: () => [], createElement: el,
                     body: el(), addEventListener() {} };
  const window = { document, addEventListener() {} };
  const ctx = { window, document, console, setTimeout, clearTimeout,
                localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.globalThis = ctx; window.SOG = {}; ctx.SOG = window.SOG;
  vm.createContext(ctx);
  const load = (p, extra = '') => vm.runInContext(fs.readFileSync(path.join(ROOT, p), 'utf8') + extra, ctx, { filename: p });
  load('js/cards.js', ';globalThis.CARDS=CARDS');
  load('js/locations.js', ';globalThis.LOCATIONS=LOCATIONS');
  load('js/game/state.js');
  ctx.SOG.input = {};
  // The UI surface the engine touches on repaint (score flash, IP floats, deny
  // flash, popup refresh): inert stubs so state code runs without a DOM.
  ctx.SOG.ui = { flashScore() {}, showIPFloat() {}, flashDeny() {}, refreshBattlePopup() {}, updateOppHand() {} };
  // The AI module reads a few engine helpers through SOG.game at call time.
  ctx.SOG.game = { shuffle: (a) => a, getSlotEl: nullEl, setSlotFaceDown() {}, flipSlot() {}, isKenteProtected: () => false };
  load('js/game/battle-hooks.js');
  load('js/game/board.js');
  load('js/game/abilities.js');
  ctx.SOG.game.effectiveIP = ctx.SOG.board.effectiveIP;
  if (opts.ai) load('js/game/ai.js');
  const G = ctx.SOG.state.G;
  G.locations = [101, 102, 103].map((id) => ({ id, name: 'L' + id, abilityKey: null }));
  G.playerSlots = {}; G.aiSlots = {};
  G.locations.forEach((l) => { G.playerSlots[l.id] = [null, null, null, null]; G.aiSlots[l.id] = [null, null, null, null]; });
  G.locationBoosts = {}; G.locations.forEach((l) => { G.locationBoosts[l.id] = { player: [], opp: [] }; });
  G.playerDeck = []; G.aiDeck = []; G.playerHand = []; G.aiHand = [];
  G.playerDiscard = []; G.aiDiscard = []; G.playerDestroyed = []; G.aiDestroyed = [];
  G.borrowedAbility = { player: {}, opp: {} };
  G.config = { structure: { slotsPerLocation: 4, maxHandSize: 7 }, resource: { model: 'capital' }, ai: {} };
  /* The VM has its own Math. setRandom(fn) makes the engine's Math.random call
     fn; resetRandom() restores it. Overriding the host's Math.random does nothing. */
  const setRandom = (fn) => { ctx.__rnd = fn; vm.runInContext('Math.random = function () { return __rnd(); };', ctx); };
  const resetRandom = () => { vm.runInContext('delete Math.random;', ctx); delete ctx.__rnd; };
  return { G, board: ctx.SOG.board, abilities: ctx.SOG.abilities, ai: ctx.SOG.ai, CARDS: ctx.CARDS, ctx, setRandom, resetRandom };
}

/* A revealed slot record for card `id` in the first free slot on `owner`'s side. */
function place(G, owner, locId, id, CARDS, extra) {
  const c = CARDS.find((x) => x.id === id);
  const sd = Object.assign({ cardId: id, ip: c.ip, cc: c.cc, revealed: true, ipMod: 0, contMod: 0,
                             ipModSources: [], contModSources: [], bonuses: [], turnPlayed: 1 }, extra || {});
  const arr = owner === 'player' ? G.playerSlots[locId] : G.aiSlots[locId];
  arr[arr.indexOf(null)] = sd;
  return sd;
}

/* Fire a registry At-Once handler synchronously and return whether done() ran. */
function atOnce(abilities, id, owner, locId, slotIndex, sd) {
  let done = false;
  abilities.CARD_ABILITIES[id].onAtOnce(owner, locId, slotIndex, sd, () => { done = true; });
  return done;
}
function endOfTurn(abilities, id, owner, locId, slotIndex, sd) {
  let done = false;
  abilities.CARD_ABILITIES[id].endOfTurn(owner, locId, slotIndex, sd, () => { done = true; });
  return done;
}

module.exports = { engine, place, atOnce, endOfTurn, ROOT };

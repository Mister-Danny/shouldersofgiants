/**
 * game/state.js — Shoulders of Giants · Shared game state + constants
 *
 * Single source of truth for battle state. Loads FIRST among the game
 * modules so that SOG.state is populated before game.js and the other
 * split files (game/ai.js, game/ui.js) try to alias it.
 *
 * The G object is mutated in place by game.js and other modules — since
 * it's an object, all consumers see the same instance via SOG.state.G.
 * Constants are immutable, exposed for any module that needs them.
 *
 * Exposes: SOG.state.{ G, TURNS, CAPITAL, HAND_START, MAX_HAND_SIZE,
 *                       SLOTS_PER_LOC, REVEAL_DELAY, POST_REVEAL,
 *                       TYPE_ORDER }
 *
 * NOTE: Extracted from game.js as part of the "split game.js" refactor
 * (Pass 3a). Behavior is unchanged.
 */

(function () {
  'use strict';

  /* ── SOG namespace bootstrap (this file loads first) ────────── */
  window.SOG = window.SOG || {};

  /* ── Constants ───────────────────────────────────────────────── */
  var TURNS         = 5;
  var CAPITAL       = 5;
  var HAND_START    = 5;
  var MAX_HAND_SIZE = 7;
  var SLOTS_PER_LOC = 4;
  var REVEAL_DELAY  = 800;
  var POST_REVEAL   = 1200;
  // Active deck IDs come from window.Decks (multi-slot save layer).
  var TYPE_ORDER    = ['Political','Religious','Military','Cultural','Exploration'];

  /* ── Game state ──────────────────────────────────────────────── */
  var G = {
    turn:        1,
    phase:       'select',
    capital:     CAPITAL,
    playerFirst: true,

    playerDeck:  [],
    playerHand:  [],
    aiDeck:      [],
    aiHand:      [],

    turnStartCapital: CAPITAL,  // capital at the start of this turn (may exceed CAPITAL with bonus)

    // locId → [ null | {cardId,ip,revealed,ipMod,contMod} ]  ×4, always compacted
    playerSlots: {},
    aiSlots:     {},

    playerRevealQueue: [],
    aiRevealQueue:     [],

    locations: [],

    // ── Ability state ──────────────────────────────────────────
    bonusCapitalNextTurn:   0,   // Scholar-Officials (player)
    aiBonusCapitalNextTurn: 0,   // Scholar-Officials (AI)
    cardIPBonus:            {},  // player cardId → cumulative bonus IP (Samurai, Jesus)
    aiCardIPBonus:          {},  // AI    cardId → cumulative bonus IP (Samurai, Jesus)
    destroyedIPTotal:       0,   // total IP of cards destroyed by player (William)
    aiDestroyedIPTotal:     0,   // total IP of cards destroyed by AI   (William)
    columbusMoved:          false,
    aiColumbusMoved:        false,
    movedThisTurn:          {},  // cardId → bool  (Magellan, per-turn reset)
    aiMovedThisTurn:        {},
    moveLog:                [],  // player moves this turn [{cardId,fromLocId,toLocId,toSlotIndex,ipModAdded,isColumbus,queued}]
    playerActionLog:        [],  // ordered: {type:'play'|'move', cardId, fromLocId?, fromSlotIndex?, toLocId?}
    aiActionLog:            [],  // ordered: {type:'play',cardId} and {type:'move',cardId,fromLocId,fromSlotIndex,toLocId} entries — mirrors playerActionLog for buildRevealSequence symmetry (bug 16)
    locationSnapshots:      {},  // locId → slot-array copy taken at first queueMove from that loc
    reservedSlotsPerLoc:    {},  // locId → count of snap-back slots reserved (one per queued move FROM that loc)
    deferredPlays:          {},  // locId → [slotData] new plays that couldn't fit at snap-back; inserted after queued card moves away

    // ── Adventure Mode ────────────────────────────────────────
    prehistoryMode:         false  // when true, all CC costs are overridden to 0
  };

  /* ── Public exports ──────────────────────────────────────────── */
  SOG.state = {
    G:             G,
    TURNS:         TURNS,
    CAPITAL:       CAPITAL,
    HAND_START:    HAND_START,
    MAX_HAND_SIZE: MAX_HAND_SIZE,
    SLOTS_PER_LOC: SLOTS_PER_LOC,
    REVEAL_DELAY:  REVEAL_DELAY,
    POST_REVEAL:   POST_REVEAL,
    TYPE_ORDER:    TYPE_ORDER
  };

})();

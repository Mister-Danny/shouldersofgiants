/* ═══════════════════════════════════════════════════════════════════════════
   INDIA DECKS — the three India boss decks, from india_cards.csv (`decks` and
   `copies` columns). A card that runs 2 copies is simply its id listed twice —
   the engine is duplicate-id safe throughout. Every deck is exactly 15 slots;
   the check at the bottom THROWS at load if one is not, so a bad edit cannot
   ship quietly.

   The three level entries live in data/level-data.js (greatbath / siddhartha /
   gupta); each level's decks.ai.ids is the matching list here and its
   reward.cardIdOnGiantWin is giantWinCardId — keep the two in step.

     deck          node          Giant          Giant-win card
     priest_king   greatbath     Priest-King    india_priest_king
     siddhartha    siddhartha    The Buddha     india_the_buddha
     gupta         gupta         The Gupta      india_the_gupta

   Card ids are the integer ids in js/cards.js (88-120, INDIA section).
   ═══════════════════════════════════════════════════════════════════════════ */

window.SOG_INDIA_DECKS = (function () {
  'use strict';
  var DECKS = {
    priest_king: {
      node:           "greatbath",   // The Great Bath node
      giant:          "Priest-King",
      giantWinCardId: 88,   // india_priest_king
      ids: [88, 89, 90, 91, 92, 94, 95, 96, 97, 98, 98, 99, 99, 100, 100]
      // Priest-King, Great Bath, Granary, Drainage System, Lord of the Beasts, Cotton, Indus Seals, Fired Brick, Standardized Weights, Farmer, Farmer, Merchant, Merchant, Priest, Priest
    },
    siddhartha: {
      node:           "siddhartha",   // The Siddhartha node
      giant:          "The Buddha",
      giantWinCardId: 101,   // india_the_buddha
      ids: [94, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114]
      // Cotton, The Buddha, Asoka, Stupa, Jain, Missionary, Upanishads, Brahmin, Kshatriya, Shudra, Dalit, Vaishya, Vaishya, Caste System, Sanskrit
    },
    gupta: {
      node:           "gupta",   // The Gupta node (the former Ashoka node, renamed)
      giant:          "The Gupta",
      giantWinCardId: 115,   // india_the_gupta
      ids: [94, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120]
      // Cotton, Brahmin, Kshatriya, Shudra, Dalit, Vaishya, Vaishya, Caste System, Sanskrit, The Gupta, Bhagavad Gita, Number Zero, Inoculation, Alloy, Vedas
    }
  };

  var SLOTS = 15;
  Object.keys(DECKS).forEach(function (k) {
    var d = DECKS[k];
    if (d.ids.length !== SLOTS) {
      throw new Error('India deck "' + k + '" has ' + d.ids.length + ' slots, expected ' + SLOTS);
    }
    if (typeof CARDS !== 'undefined') {
      d.ids.forEach(function (id) {
        var c = CARDS.find(function (x) { return x.id === id; });
        if (!c)      throw new Error('India deck "' + k + '" lists unknown card id ' + id);
        if (c.token) throw new Error('India deck "' + k + '" lists token card ' + id + ' (' + c.name + ')');
      });
      if (d.ids.indexOf(d.giantWinCardId) === -1) {
        throw new Error('India deck "' + k + '": Giant-win card ' + d.giantWinCardId + ' is not in the deck');
      }
    }
  });
  return DECKS;
})();

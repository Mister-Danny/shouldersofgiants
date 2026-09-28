/**
 * game/board.js — Shoulders of Giants · Board / Slot management
 *
 * The board is the set of 4-slot rows per location for both players, plus
 * the data and DOM that represent them. This module owns:
 *   • Slot DOM lookup and shape (getSlotEl, findSlotEl, getCardLocId,
 *     setSlotFaceDown, buildCardFace, placeRevealedCard, clearSlotDOM)
 *   • DOM ghost utilities for slide animations (makeBoardGhost, removeGhost,
 *     removeEl)
 *   • Per-location slot compaction + DOM resync (compactPlayerSlots,
 *     syncPlayerSlots, compactOppSlots, syncOppSlots)
 *   • IP and cost math (effectiveCost, effectiveIP, addIPMod)
 *   • Score readouts (updateScores, refreshSlotIPDisplays)
 *   • Header readout (updateHeader)
 *   • shuffle (general utility, lives here because everything else
 *     that uses it is board-adjacent)
 *
 * Deliberately NOT moved in this pass:
 *   • flipSlot — bridges board + ability dispatch (Kente / Juvenal /
 *     Cosimo / Henry reveal animations baked in). Pass 4 (the abilities
 *     registry) is where that gets cleanly separated.
 *   • refreshMoveableCards — input-driven (player drag affordances).
 *     Will move in Pass 3c. Until then it stays in game.js and this
 *     module's syncPlayerSlots calls into SOG.game.refreshMoveableCards.
 *   • refreshHandIPDisplays / refreshHandCostDisplays — hand concerns,
 *     Pass 3c.
 *
 * Reads:  SOG.state.G, SOG.state.SLOTS_PER_LOC, SOG.state.TURNS,
 *         window.CARDS, window.buildCardImg
 * Calls:  SOG.ui.flashScore, SOG.game.refreshMoveableCards
 * Exposes: SOG.board.{ shuffle, getSlotEl, findSlotEl, getCardLocId,
 *                      setSlotFaceDown, buildCardFace, placeRevealedCard,
 *                      removeEl, makeBoardGhost, removeGhost, clearSlotDOM,
 *                      compactPlayerSlots, syncPlayerSlots,
 *                      compactOppSlots, syncOppSlots,
 *                      effectiveCost, effectiveIP, addIPMod,
 *                      updateScores, refreshSlotIPDisplays,
 *                      updateHeader }
 *
 * NOTE: Extracted from game.js as part of the "split game.js" refactor
 * (Pass 3b). Behavior is unchanged.
 */

(function () {
  'use strict';

  var G             = SOG.state.G;
  var SLOTS_PER_LOC = SOG.state.SLOTS_PER_LOC;
  var TURNS         = SOG.state.TURNS;

  /* ── DOM refs (queried at module load) ──────────────────────── */
  var boardEl       = document.getElementById('battle-board');
  var headerTurnEl  = document.getElementById('battle-turn-info');
  var headerPhaseEl = document.getElementById('battle-phase-info');
  // capitalNumEl is built lazily inside initBattleUI (called from game.js
  // initGame), so we look it up on each updateHeader call.

  /* ═══════════════════════════════════════════════════════════════
     UTILITY
  ═══════════════════════════════════════════════════════════════ */

  /** In-place Fisher-Yates shuffle. Returns the same array. */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ═══════════════════════════════════════════════════════════════
     SLOT DOM LOOKUP
  ═══════════════════════════════════════════════════════════════ */

  /** Direct slot-element lookup by (owner, locId, slotIndex). */
  function getSlotEl(owner, locId, slotIndex) {
    return boardEl.querySelector(
      '.battle-card-slot[data-owner="' + owner + '"]' +
      '[data-loc-id="'     + locId     + '"]' +
      '[data-slot-index="' + slotIndex + '"]'
    );
  }

  /** Find a card's slot element by searching all locations for that owner. */
  function findSlotEl(owner, cardId) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    for (var li = 0; li < G.locations.length; li++) {
      var locId = G.locations[li].id;
      for (var si = 0; si < SLOTS_PER_LOC; si++) {
        if (slots[locId][si] && slots[locId][si].cardId === cardId)
          return getSlotEl(owner, locId, si);
      }
    }
    return null;
  }

  /* NO_MOVE_HERE (The Cataracts, Hyksos battle): nothing may MOVE INTO this
     location. Both sides, every path — the player's drag/click, the AI's post-reveal
     movers, and any ability-driven relocation (the Merchant's trade, a Chariot's
     roll). Enforced at the UI gate so the affordance never offers it, at the AI's
     destination choosers so a Chariot cannot burn its once-per-battle move on a
     refusal, and finally inside executeMove / executeMoveAnimated, which every real
     relocation passes through.

     WHAT IT DOES NOT BLOCK — three things, all deliberately:
       • PLAYING a card here from hand. It says cards cannot MOVE here.
       • SPAWNING a card here (Hatshepsut's Merchant, a Book of the Dead Mummy,
         Joan's summon). A card appearing is not a card moving.
       • The HYKSOS (67) side-crossing. He crosses to the opponent's side OF HIS OWN
         LOCATION — he is already here, and his transfer never goes through
         executeMove at all (it is an array-to-array move inside abilityHyksos). So a
         Hyksos played at the Cataracts still defects. This is the ruling, and it
         falls out of the architecture rather than needing a special case.
     Inert in every battle whose locations don't carry the key. */
  function isMoveBlockedInto(locId) {
    if (!G.locations) return false;
    var loc = G.locations.find(function (l) { return l.id === locId; });
    return !!(loc && loc.abilityKey === 'NO_MOVE_HERE');
  }

  /** Return the locId where a card currently lives, or null. */
  function getCardLocId(owner, cardId) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    for (var li = 0; li < G.locations.length; li++) {
      var locId = G.locations[li].id;
      for (var si = 0; si < SLOTS_PER_LOC; si++) {
        if (slots[locId][si] && slots[locId][si].cardId === cardId) return locId;
      }
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════
     SLOT VISUAL HELPERS (face-down / face-up / clear / DOM ghosts)
  ═══════════════════════════════════════════════════════════════ */

  function setSlotFaceDown(slotEl) {
    slotEl.classList.add('occupied', 'face-down');
    if (slotEl.dataset.owner === 'player') slotEl.draggable = true;
  }

  /* Art size for a board slot. A slot is ~91x136 layout px, so full-size art
     (731x1054 for the prehistory set) arrives at roughly an 8x downscale on a
     dpr-1 Chromebook — the harshest ratio anywhere in the game, and it shows:
     the card in play looked visibly worse than the same card in hand, which
     pulls the @sm tier at ~2.7x. Every slot render passes this.

     Not used by the reveal-fx flyers: those are sized from a slot rect but
     scale up mid-flight, so they keep full-size art deliberately. */
  var SLOT_ART = { size: 'sm' };

  /** Build card-face HTML inside slotEl (used by flipSlot and placeRevealedCard). */
  /* opts is passed straight through to buildCardImg — notably { size: 'sm' },
     which loads the pre-rendered thumbnail (card.imageSm / the @sm variant)
     instead of full-size art. Small surfaces (board slots via SLOT_ART, the
     market shelves) pass it, or the browser downscales the big export and the
     result aliases. buildCardImg's onerror falls back to the full-size
     original, so cards with no @sm variant still render. */
  function buildCardFace(slotEl, card, displayIP, opts) {
    slotEl.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'db-card-img-wrap';
    var ph = document.createElement('div');
    ph.className   = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);
    var img = window.buildCardImg(card, opts);
    wrap.appendChild(ph);
    wrap.appendChild(img);
    var ccEl = document.createElement('div');
    ccEl.className   = 'db-overlay-cc';
    ccEl.textContent = card.cc;
    var ipEl = document.createElement('div');
    ipEl.className   = 'db-overlay-ip';
    ipEl.textContent = displayIP;
    slotEl.appendChild(wrap);
    slotEl.appendChild(ccEl);
    slotEl.appendChild(ipEl);

    // The delegated click handler on boardEl handles popup / select / commit
    // for all slots; the per-slot onclick that used to live here was removed
    // when the click + keyboard input path was added. Player-owned slots are
    // made tab-focusable here so Enter can target them.
    if (slotEl.dataset.owner === 'player' && slotEl.tabIndex < 0) {
      slotEl.tabIndex = 0;
    }
  }

  /* Card object to RENDER for a slot. Normally the card def, but a created Mummy
     (id 72 token, Batch C) inherits its source card's CC on its slot data (sd.cc) —
     tokens share one card def so the inherited stats must live on the sd. Return a
     shallow clone with the CC overridden so the badge shows the inherited value and
     survives re-renders. This is the DISPLAY side of CC inheritance; game logic reads
     the same sd.cc via abilities.effectiveCC(sd) (Juvenal, Hammurabi, AI scoring), and
     IP flows through effectiveIP(sd) everywhere — so inherited stats are honored in
     both rendering and rules. */
  /* Exported as SOG.board.faceCard: the MOVE re-render paths (game.js executeMove /
     applyMove, input.js queueMove) rebuild a slot's face from the card DEFINITION,
     which for a Mummy (72) is 0/0 — so a moved Mummy's CC badge dropped to 0 while
     its real sd.cc was untouched. Those paths now route through here too. */
  function _faceCard(sd, card) {
    if (card && sd && sd.cc != null && sd.cc !== card.cc) {
      return Object.assign({}, card, { cc: sd.cc });
    }
    return card;
  }

  /**
   * Place a card face-up at a location (Samurai return, Joan summon, Wu push,
   * Piye's copy, Ezana's convert, Trade Network's swap-in).
   * @param {number}  [extraIpMod]  Legacy lump — recorded as an UNATTRIBUTED
   *                                entry so it can never be invisible. Prefer
   *                                opts.carrySources.
   * @param {boolean} [opts.skipLocationAbility] skip MOVE_IN_GAINS_IP
   * @param {Array}   [opts.carrySources]  ipModSources entries from another slot
   *                                to REPLAY here one by one, each under its own
   *                                attribution (Piye's copy takes everything the
   *                                original had at that moment).
   * @param {boolean} [opts.skipHandBonus] do not fold the id-keyed in-hand
   *                                accumulators (a copy of a card already on the
   *                                board must not take a stamp that belongs to a
   *                                twin still in hand).
   */
  function placeRevealedCard(owner, locId, cardId, extraIpMod, opts) {
    opts = opts || {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var si    = slots[locId].indexOf(null);
    if (si === -1) return false;
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    // sd.ip stays at the card's immutable base so the popup breakdown is honest;
    // every bonus below goes through addIPMod and lands with a record.
    var sd = { cardId: cardId, ip: card.ip, revealed: true, ipMod: 0, contMod: 0, ipModSources: [], bonuses: [], turnPlayed: G.turn };
    // A copy of a TRANSCRIBED Rosetta (Piye's At Once fired by a Rosetta that
    // adopted him) keeps the adoption, so it lands showing the same text as the
    // card it was copied from. Set before the face is built below.
    if (opts.transcribedFrom != null) sd.transcribedFrom = opts.transcribedFrom;
    // Chain accumulator (Jesus / Samurai) and in-hand stamps. Callers that
    // assemble their own ipMod afterward (triggerSamurai) zero the dict first.
    if (!opts.skipHandBonus) applyPrePlayBonuses(sd, owner, cardId, {});
    if (opts.carrySources && opts.carrySources.length) {
      opts.carrySources.forEach(function (e) {
        if (!e || !e.delta) return;
        addIPMod(sd, e.delta, entrySource(e), undefined, e.kind ? { kind: e.kind } : undefined);
      });
    }
    if (extraIpMod) addIPMod(sd, extraIpMod, { type: 'unknown', name: 'Bonus' });
    if (!opts.skipLocationAbility) {
      var dl = G.locations.find(function (l) { return l.id === locId; });
      if (dl && dl.abilityKey === 'MOVE_IN_GAINS_IP') addIPMod(sd, 1, dl);
    }
    slots[locId][si] = sd;
    var slotEl = getSlotEl(owner, locId, si);
    if (slotEl) {
      slotEl.dataset.cardId = cardId;
      slotEl.className      = 'battle-card-slot occupied face-up';
      slotEl.removeAttribute('draggable');
      buildCardFace(slotEl, _faceCard(sd, card), effectiveIP(sd), SLOT_ART);
    }
    return true;
  }

  /** Remove an element from the DOM if still attached. */
  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /** Clone a DOM element as a position:fixed ghost for independent animation. */
  function makeBoardGhost(el, zIndex) {
    if (!el) return null;
    var rect  = el.getBoundingClientRect();
    var ghost = el.cloneNode(true);
    ghost.style.cssText =
      'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
      'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
      'margin:0;z-index:' + (zIndex || 300) + ';pointer-events:none;';
    document.body.appendChild(ghost);
    return ghost;
  }

  function removeGhost(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function clearSlotDOM(owner, locId, slotIndex) {
    var slotEl = getSlotEl(owner, locId, slotIndex);
    if (slotEl) {
      slotEl.className = 'battle-card-slot';
      slotEl.innerHTML = '';
      slotEl.removeAttribute('draggable');
      delete slotEl.dataset.cardId;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PER-LOCATION COMPACTION + DOM RESYNC
     compact*: removes nulls from slot data, leaves DOM untouched
     sync*:    rebuilds the 4 DOM elements to match data state
  ═══════════════════════════════════════════════════════════════ */

  function compactPlayerSlots(locId) {
    var f = G.playerSlots[locId].filter(function (s) { return s !== null; });
    while (f.length < SLOTS_PER_LOC) f.push(null);
    G.playerSlots[locId] = f;
  }

  /**
   * Full DOM sync for all 4 player slots at locId.
   * Handles empty, face-down, and revealed (rebuilds face-up after compaction).
   */
  function syncPlayerSlots(locId) {
    for (var i = 0; i < SLOTS_PER_LOC; i++) {
      var sd    = G.playerSlots[locId][i];
      var slotEl = getSlotEl('player', locId, i);
      if (!slotEl) continue;

      if (!sd) {
        slotEl.className = 'battle-card-slot';
        slotEl.innerHTML = '';
        slotEl.removeAttribute('draggable');
        delete slotEl.dataset.cardId;
      } else if (!sd.revealed) {
        if (G.phase === 'reveal') {
          // During the reveal sequence, a not-yet-revealed player card must
          // stay hidden — startReveal already flipped it face-down and it
          // reveals at its own turn in the sequence. Without this guard, any
          // syncPlayerSlots call triggered by a preceding card's ability or
          // move (Cortes sweep, destroyCard compaction, executeMoveAnimated
          // applyMove, snapBack, deferred-plays pop) would prematurely flip
          // it face-up with its identity visible. Mirrors syncOppSlots's
          // unrevealed branch.
          slotEl.dataset.cardId = sd.cardId;
          slotEl.className      = 'battle-card-slot occupied face-down';
          slotEl.removeAttribute('draggable');
          slotEl.innerHTML      = '';
        } else {
          // Select phase: show face-up so the player can see and undo their
          // own plays before ending the turn.
          var uCard = CARDS.find(function (c) { return c.id === sd.cardId; });
          slotEl.dataset.cardId = sd.cardId;
          slotEl.className      = 'battle-card-slot occupied face-up unplayed';
          slotEl.draggable      = true;
          if (uCard) buildCardFace(slotEl, _faceCard(sd, uCard), effectiveIP(sd), SLOT_ART);
        }
      } else {
        var card = CARDS.find(function (c) { return c.id === sd.cardId; });
        if (card) {
          slotEl.dataset.cardId = sd.cardId;
          slotEl.className      = 'battle-card-slot occupied face-up';
          slotEl.removeAttribute('draggable');
          buildCardFace(slotEl, _faceCard(sd, card), effectiveIP(sd), SLOT_ART);
        }
      }
    }
    // refreshMoveableCards lives in game.js until Pass 3c (input concern).
    if (SOG.game && typeof SOG.game.refreshMoveableCards === 'function') {
      SOG.game.refreshMoveableCards();
    }
  }

  function compactOppSlots(locId) {
    var f = G.aiSlots[locId].filter(function (s) { return s !== null; });
    while (f.length < SLOTS_PER_LOC) f.push(null);
    G.aiSlots[locId] = f;
  }

  function syncOppSlots(locId) {
    for (var i = 0; i < SLOTS_PER_LOC; i++) {
      var sd     = G.aiSlots[locId][i];
      var slotEl = getSlotEl('opp', locId, i);
      if (!slotEl) continue;
      if (!sd) {
        slotEl.className = 'battle-card-slot';
        slotEl.innerHTML = '';
        slotEl.removeAttribute('draggable');
        delete slotEl.dataset.cardId;
      } else if (!sd.revealed) {
        slotEl.dataset.cardId = sd.cardId;
        slotEl.className      = 'battle-card-slot occupied face-down';
        slotEl.innerHTML      = '';
      } else {
        var card = CARDS.find(function (c) { return c.id === sd.cardId; });
        if (card) {
          slotEl.dataset.cardId = sd.cardId;
          slotEl.className      = 'battle-card-slot occupied face-up';
          slotEl.removeAttribute('draggable');
          buildCardFace(slotEl, _faceCard(sd, card), effectiveIP(sd), SLOT_ART);
        }
      }
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     BONUS ATTRIBUTION
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Maps source-name strings (as passed to addIPMod / addBonus calls) to
   * the canonical { type, id, pattern } descriptor used by the bonus display.
   *   type:    'card' | 'location'
   *   id:      card id (from CARDS) or location id (from LOCATIONS)
   *   pattern: 'A' (self) | 'B' (destruction-chain) | 'C' (trigger) | 'D' (target)
   */
  var SOURCE_ID_MAP = {
    'The Cape of Good Hope': { type: 'location', id: 3,  pattern: 'A' },
    'The Sahara':            { type: 'location', id: 6,  pattern: 'A' },
    'Scholar-Officials':     { type: 'card',     id: 2,  pattern: 'A' },
    'Jan Hus':               { type: 'card',     id: 7,  pattern: 'A' },
    'Jesus':                 { type: 'card',     id: 10, pattern: 'A' },
    'Samurai':               { type: 'card',     id: 12, pattern: 'A' },
    'Cortes':                { type: 'card',     id: 13, pattern: 'A' },
    'William the Conqueror': { type: 'card',     id: 15, pattern: 'B' },
    'Kente':                 { type: 'card',     id: 17, pattern: 'A' },
    'Juvenal':               { type: 'card',     id: 18, pattern: 'A' },
    'Voltaire':              { type: 'card',     id: 20, pattern: 'A' },
    'Magellan':              { type: 'card',     id: 24, pattern: 'A' },
    'Zheng He':              { type: 'card',     id: 23, pattern: 'D' },
    'Fire':                  { type: 'card',     id: 29, pattern: 'A' },
    'Cave Art':              { type: 'card',     id: 30, pattern: 'A' },
    'Megalith':              { type: 'card',     id: 31, pattern: 'A' },
    // Egypt (era) — bonus attributions for the wired Egypt abilities.
    'Ramses II':             { type: 'card',     id: 53, pattern: 'A' },
    // Egypt Farmer (55) stamps +1 on ANOTHER card (the next one played), so it
    // attributes like Zheng He — pattern 'D' (the source card's portrait on the
    // target's breakdown), not 'A' (self).
    'Farmer':                { type: 'card',     id: 55, pattern: 'D' },
    'Narmer':                { type: 'card',     id: 51, pattern: 'A' },
    'Pyramid':               { type: 'card',     id: 57, pattern: 'A' },
    'Obelisk':               { type: 'card',     id: 59, pattern: 'A' },
    'Hieroglyphics':         { type: 'card',     id: 62, pattern: 'A' },
    'Ra':                    { type: 'card',     id: 63, pattern: 'A' },
    'Domesticated Animal':   { type: 'card',     id: 32, pattern: 'A' },
    'Tribe':                 { type: 'card',     id: 36, pattern: 'A' },
    'Sargon':                { type: 'card',     id: 37, pattern: 'A' },
    'Scribe':                { type: 'card',     id: 40, pattern: 'A' },
    'Gilgamesh':             { type: 'card',     id: 43, pattern: 'A' },
    'Canals':                { type: 'card',     id: 41, pattern: 'A' },
    'Soldier':               { type: 'card',     id: 42, pattern: 'A' },
    'Enkidu':                { type: 'card',     id: 44, pattern: 'A' },
    'Ziggurat':              { type: 'card',     id: 45, pattern: 'A' },
    'Cuneiform':             { type: 'card',     id: 46, pattern: 'A' },
    'Hammurabi':             { type: 'card',     id: 47, pattern: 'A' },
    'Chariot':               { type: 'card',     id: 48, pattern: 'A' },
    'The Phoenicians':       { type: 'card',     id: 49, pattern: 'A' },
    'Nebuchadnezzar':        { type: 'card',     id: 50, pattern: 'A' },
    // At-Once river boosts (Hammurabi + Nebuchadnezzar battles both use loc 101/103)
    'Euphrates River':       { type: 'location', id: 101, pattern: 'A' },
    'Tigris River':          { type: 'location', id: 103, pattern: 'A' },
    // Names that used to fall through to 'unknown' (blank thumbnail). Every live
    // call site now passes an id descriptor (see addIPMod), so these only serve
    // string sources that survive in saved ipModSources entries.
    'Christopher Columbus':  { type: 'card',     id: 25, pattern: 'A' },
    'Merchant':              { type: 'card',     id: 76, pattern: 'A' },
    'Purple Dye':            { type: 'card',     id: 75, pattern: 'A' },
    'Papyrus':               { type: 'card',     id: 54, pattern: 'A' },   // the copier (54), not the resource (74)
    'Amenirdis I':           { type: 'card',     id: 80, pattern: 'A' },
    'Queen Shanakhdakheto':  { type: 'card',     id: 82, pattern: 'A' },
    'Nubian Archers':        { type: 'card',     id: 85, pattern: 'A' },
    'The Iron Furnace':      { type: 'card',     id: 87, pattern: 'A' }
    // Battle-local locations (Punt, Napata, Thebes, …) are not listed: resolveSource
    // finds them by name in G.locations, which is the only table that has them.
  };

  /* ── Source descriptors ──────────────────────────────────────────
     addIPMod attributes every permanent IP change to a SOURCE DESCRIPTOR,
     never to a name string. Names collide (a Meso and an Egypt 'Scribe', a
     'Farmer' in each era, 'Papyrus' twice) and the old string→id map could only
     ever pick one of them; a descriptor names the exact card or location.
       number            → { type: 'card', id }
       { type, id }      → as given ('card' | 'location' | 'unknown')
       location object   → { type: 'location', id: loc.id }  (has abilityKey/name)
       string            → legacy: SOURCE_ID_MAP, then a card / location by name
     `name` is derived for the legacy ipModSources readers that still key on it
     (the Samurai chain filter; the debug logs). */
  function _cardName(id) {
    var c = (typeof CARDS !== 'undefined') && CARDS.find(function (x) { return x.id === id; });
    return c ? c.name : null;
  }
  function _locName(id) {
    var l = (G.locations || []).find(function (x) { return x.id === id; });
    if (!l && typeof LOCATIONS !== 'undefined') l = LOCATIONS.find(function (x) { return x.id === id; });
    return l ? l.name : null;
  }
  function resolveSource(source) {
    if (typeof source === 'number') {
      return { type: 'card', id: source, name: _cardName(source) || ('card ' + source) };
    }
    if (source && typeof source === 'object') {
      if (source.type === 'card' || source.type === 'location') {
        var nm = source.name || (source.type === 'card' ? _cardName(source.id) : _locName(source.id));
        return { type: source.type, id: source.id, name: nm || (source.type + ' ' + source.id) };
      }
      if (source.type === 'unknown') return { type: 'unknown', id: null, name: source.name || 'Bonus' };
      // A live location object (has an id and either abilityKey or region/name).
      if (source.id != null && (source.abilityKey !== undefined || source.region !== undefined)) {
        return { type: 'location', id: source.id, name: source.name || _locName(source.id) || ('location ' + source.id) };
      }
    }
    if (typeof source === 'string') {
      var info = SOURCE_ID_MAP[source];
      if (info) return { type: info.type, id: info.id, name: source };
      var c = (typeof CARDS !== 'undefined') && CARDS.find(function (x) { return x.name === source; });
      if (c) return { type: 'card', id: c.id, name: source };
      var l = (G.locations || []).find(function (x) { return x.name === source; });
      if (!l && typeof LOCATIONS !== 'undefined') l = LOCATIONS.find(function (x) { return x.name === source; });
      if (l) return { type: 'location', id: l.id, name: source };
      return { type: 'unknown', id: null, name: source };
    }
    return { type: 'unknown', id: null, name: 'Bonus' };
  }
  /* The descriptor stored on an ipModSources entry — what carry / restore paths
     replay through addIPMod so the entry keeps its exact attribution. */
  function entrySource(e) {
    if (!e) return { type: 'unknown' };
    if (e.type === 'card' || e.type === 'location') return { type: e.type, id: e.id, name: e.source };
    if (typeof e.source === 'string') return e.source;      // legacy name-only entry
    return { type: 'unknown', name: e.source };
  }
  /* The ACTOR as a source: the slot that is doing the modifying. A Rosetta Stone
     carrying a transcribed ability is the actor, so the attribution names HER
     (the transcribed text is readable on her popup). fallbackId covers callers
     that have no slot in hand. */
  function srcOf(sd, fallbackId) {
    return { type: 'card', id: (sd && sd.cardId != null) ? sd.cardId : fallbackId };
  }

  /**
   * Return a unique event ID string.  Monotonic counter in G.nextEventId.
   * Each distinct trigger event gets its own ID; multiple addBonus calls
   * that share one ID collapse into a single thumbnail column in the IP grid.
   */
  function nextEventId() {
    G.nextEventId = (G.nextEventId || 0) + 1;
    return 'e' + G.nextEventId;
  }

  /**
   * Push a single bonus record onto sd.bonuses[].
   * Low-level primitive; addIPMod calls this automatically for known sources.
   *
   * @param {object}      sd           Slot data
   * @param {number}      amount       IP delta (positive or negative)
   * @param {string}      sourceType   'card' | 'location' | 'unknown'
   * @param {number|null} sourceId     Card or location id (null = unknown)
   * @param {string}      eventId      From nextEventId() — groups thumbnails
   * @param {string}      pattern      'A' | 'B' | 'C' | 'D'
   * @param {boolean}     isContinuous True for evaluateContinuous-driven bonuses
   */
  function addBonus(sd, amount, sourceType, sourceId, eventId, pattern, isContinuous) {
    if (!sd.bonuses) sd.bonuses = [];
    sd.bonuses.push({
      sourceType:  sourceType,
      sourceId:    (sourceId !== undefined) ? sourceId : null,
      amount:      amount,
      eventId:     eventId,
      pattern:     pattern      || 'A',
      continuous:  !!isContinuous,
      reset:       false,
      resetBy:     null
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     COST / IP MATH
  ═══════════════════════════════════════════════════════════════ */

  /* Effective ABILITY id for a slot — mirrors abilities.js abilityIdOf so the
     card-scoped cost clauses below dispatch by ABILITY, not card id (a Rosetta
     that transcribed a discount card projects it). Identical to sd.cardId for any
     non-transcribed card, so normal cost behaviour is unchanged. Local mirror
     avoids a load-order dependency on SOG.abilities. */
  function abilityIdOf(s) {
    if (!s) return null;
    return (s.transcribedFrom != null) ? s.transcribedFrom : s.cardId;
  }

  /**
   * Effective capital cost for `card` played at `locId`, for `owner`.
   * `owner` is 'player' (default) or 'ai'. Cost DISCOUNTS that read the board
   * (Cosimo/Henry/Imhotep revealed cards) or a per-owner stamp (Neb) resolve
   * against THAT owner's side, so the AI and player see the same discounts
   * symmetrically. Passing no owner is byte-for-byte identical to the old
   * player-only behaviour. Location-based discounts (Levant religious, Babylon
   * base-5) are owner-agnostic.
   */
  function effectiveCost(card, locId, owner) {
    if (G.prehistoryMode) return 0;
    var forAi   = owner === 'ai';
    var slots   = forAi ? G.aiSlots : G.playerSlots;
    var nebSide = forAi ? 'opp' : 'player';
    var loc  = G.locations.find(function (l) { return l.id === locId; });
    var cost = card.cc;
    if (loc && loc.abilityKey === 'RELIGIOUS_DISCOUNT' && card.type === 'Religious')
      cost = Math.max(0, cost - 1);
    if (card.type === 'Cultural' &&
        G.locations.some(function (l) {
          return slots[l.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 19; });
        }))
      cost = Math.max(0, cost - 1);
    if (card.type === 'Exploration' &&
        G.locations.some(function (l) {
          return slots[l.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 22; });
        }))
      cost = Math.max(0, cost - 1);
    // Nebuchadnezzar (id 50) — "Builder of Babylon": At Once, his owner's in-hand
    // Mesopotamia cards get a ONE-TIME -1 CC stamp (set in abilities.js when Neb
    // reveals). Read the stamp for THIS owner (player charge/display vs AI budget).
    // The stamp persists on the card while it sits in hand; later-drawn cards aren't
    // stamped. (Not continuous — leaving the cheaper aura was too strong.)
    if (card.era === 'Mesopotamia' && G.nebCCDiscount && G.nebCCDiscount[nebSide] && G.nebCCDiscount[nebSide][card.id])
      cost = Math.max(0, cost - 1);
    // Ramses II (id 53) — "Ozymandias": same one-time in-hand -1 CC stamp mechanism
    // as Nebuchadnezzar above, keyed on era "Egypt" instead of "Mesopotamia".
    // `nebSide` is just the owner-side key ('player'/'opp'), reused as-is.
    if (card.era === 'Egypt' && G.ramsesCCDiscount && G.ramsesCCDiscount[nebSide] && G.ramsesCCDiscount[nebSide][card.id])
      cost = Math.max(0, cost - 1);
    /* Kashta (79) — "Tablesetter": a per-card CC stamp on Piye (78) only, keyed
       by ID rather than era. Cumulative (two Kashtas = -2) and floored at 0 by
       the caller, same as the two era stamps above. Mirrored in input.js
       refreshHandCostDisplays — the badge and the charge must resolve the same
       way or they disagree. */
    if (G.kushCCDiscount && G.kushCCDiscount[nebSide] && G.kushCCDiscount[nebSide][card.id])
      cost -= G.kushCCDiscount[nebSide][card.id];
    // Babylon (BABYLON_COST_5 location, Nebuchadnezzar battle): BASE-cost-5 cards cost
    // -1 while a Babylon location is present. Global (not at-Babylon-only). Keyed off
    // card.cc (base), so it STACKS with the Neb-50 discount above. Inert in battles
    // with no Babylon location. Owner-agnostic (location-based).
    if (card.cc === 5 &&
        G.locations.some(function (l) { return l.abilityKey === 'BABYLON_COST_5'; }))
      cost = Math.max(0, cost - 1);
    // (Imhotep (65) used to sit here with a global -1 CC to Scientific. He is now an
    // At-Once that CREATES a Pyramid in hand, so there is no Scientific discount in
    // the game any more — and none in refreshHandCostDisplays either. The two must
    // always agree: the hand badge, the play charge and Book of the Dead's weighing
    // all read this one function.)
    return cost;
  }

  function effectiveIP(sd) {
    return sd.ip + (sd.ipMod || 0) + (sd.contMod || 0);
  }

  /* Is a location currently open to NEW plays? False when a battle has marked
     the location's `flooded` flag (the Nebuchadnezzar flood mechanic sets it via its
     onTurnStart scheduler), or when the battle's ADVANCE GATE locks it for `owner`
     (the Narmer advance-board mechanic — see below). Inert everywhere else — no
     other battle sets the flag or the config rule, so this returns true. Read by
     the play-gates (player + AI) to block plays without touching revealed cards.

     `owner` ('player' | 'ai', default 'player') matters only for the advance gate,
     which is per-side; the flood check is symmetric and ignores it. */
  function isLocationPlayable(locId, owner, cardId) {
    if (!G.locations) return true;
    var loc = G.locations.find(function (l) { return l.id === locId; });
    if (loc && loc.flooded) return false;
    if (!isAdvanceUnlocked(locId, owner)) return false;
    /* PLAY GATE BY TYPE (India set, e.g. Jain): a card IN PLAY here can block
       plays of a given type at its location, for BOTH sides. Only consulted
       when the caller names the card being played — the two-argument form
       ("is this location open at all?") is unchanged. Movement into the
       location is deliberately NOT gated (isLegalMoveTarget never calls this).
       The rule itself lives with the abilities (registry `blocksPlayOfType`). */
    if (cardId != null && SOG.abilities && typeof SOG.abilities.isPlayTypeBlockedAt === 'function') {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (card && SOG.abilities.isPlayTypeBlockedAt(locId, card.type)) return false;
    }
    return true;
  }

  /* ── DAMAGE ────────────────────────────────────────────────────────────────
     Damage is any reduction of a card's current IP, from ANY source — an
     opponent's card, a location, the controller's own cards (self-inflicted
     counts). It is not a separate stat: it is read off the mod ledgers the
     engine already keeps, so every existing minus (Juvenal, Nubian Archers,
     the Sahara, a Dalit) is damage without any writer changing.
       damageOn(sd)        total damage on a card: the sum of every negative
                           permanent delta (sd.ipModSources) and every negative
                           continuous delta (sd.contModSources), as a positive
                           number. 0 when undamaged.
       hasDamage(sd)       the card's IP is below what it would otherwise be.
       cardsWithDamage(owner)  every revealed card `owner` controls, anywhere on
                           the board, that has damage.
     IP may go below zero — nothing clamps effectiveIP, and reaching 0 or less
     has no consequence (no destroy). The badge renders the minus sign.
     EXEMPTION: an ADJUST-TO-VALUE delta (addIPMod kind 'adjust', below) is NOT
     damage even when negative. It moves a card toward a target value; counting
     it would make the Great Bath damage the card it is healing. */
  function damageOn(sd) {
    if (!sd) return 0;
    var d = 0;
    (sd.ipModSources || []).forEach(function (e) {
      if (e && e.delta < 0 && e.kind !== 'adjust') d -= e.delta;
    });
    (sd.contModSources || []).forEach(function (e) {
      if (e && e.delta < 0) d -= e.delta;
    });
    return d;
  }
  function hasDamage(sd) { return damageOn(sd) > 0; }
  function cardsWithDamage(owner) {
    var out = [];
    if (!G.locations) return out;
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    G.locations.forEach(function (loc) {
      (slots[loc.id] || []).forEach(function (s, i) {
        if (!s || !s.revealed) return;
        var d = damageOn(s);
        if (d > 0) out.push({ locId: loc.id, slotIndex: i, sd: s, damage: d });
      });
    });
    return out;
  }

  /* ── ADJUST-TO-VALUE ───────────────────────────────────────────────────────
     Move a card's CURRENT IP toward `target` by applying the difference as one
     permanent delta through addIPMod, tagged kind 'adjust'. Existing buffs and
     damage stay on the ledger untouched (nothing is reset), the popup shows the
     adjustment under `source` like any other bonus, and a later call adjusts
     again from wherever the card then stands. Returns the delta applied (0 when
     the card is already at target). Two intended users: the Great Bath
     (restoreToBaseIP — target is the printed sd.ip) and Standardized Weights
     (adjustIPToward(sd, 3, …) on both sides' cards at its location).
     Note the target is measured against effectiveIP, which includes the
     continuous layer; a continuous change afterwards moves the card off target
     until something adjusts it again — that is the "delta, not reset" contract. */
  function adjustIPToward(sd, target, source, eventId) {
    if (!sd) return 0;
    var delta = target - effectiveIP(sd);
    if (!delta) return 0;
    addIPMod(sd, delta, source, eventId, { kind: 'adjust' });
    return delta;
  }
  function restoreToBaseIP(sd, source, eventId) {
    return sd ? adjustIPToward(sd, sd.ip, source, eventId) : 0;
  }

  /* ── ADVANCE GATE (Narmer battle) ──────────────────────────────────
     Config-gated: active only when G.config.rules.advanceGate is set —
       { playerHome, contested, aiHome }  (location ids)
     Symmetric, LIVE rule, re-evaluated at every play-time check:
       • a side's own home is always playable;
       • the contested location unlocks only while that side's home is FULL
         (all slots occupied — face-down cards count);
       • the opponent's home unlocks only while the home is full AND the side
         has at least one card at the contested location.
     Because it reads the live slot arrays, a card LEAVING a home slot (Chariot
     move) re-locks forward play until the home is refilled — there is no
     stored "unlocked" state. Movement placement deliberately does NOT consult
     this predicate (isLegalMoveTarget / runAdventureMovements), so moves can
     break through the gate; only NEW plays are gated. */
  function isAdvanceUnlocked(locId, owner) {
    var ag = G.config && G.config.rules && G.config.rules.advanceGate;
    if (!ag) return true;
    var side     = owner === 'ai' ? 'ai' : 'player';
    var homeId   = side === 'ai' ? ag.aiHome : ag.playerHome;
    var oppHome  = side === 'ai' ? ag.playerHome : ag.aiHome;
    var slots    = side === 'ai' ? G.aiSlots : G.playerSlots;
    if (!slots) return true;
    function homeFull()   { var s = slots[homeId];       return !!s && s.indexOf(null) === -1; }
    function atContested(){ var s = slots[ag.contested]; return !!s && s.some(function (x) { return !!x; }); }
    if (locId === ag.contested) return homeFull();
    if (locId === oppHome)      return homeFull() && atContested();
    return true;   // own home (and anything else) — always playable
  }

  /**
   * Add a modifier to a slot's permanent IP, attributed to `source`.
   * THE ONLY WRITER of sd.ipMod outside the reset/restore paths. Every call
   * records the same delta three ways so the popup can never disagree with
   * the badge: sd.ipMod (the number), sd.ipModSources (name + descriptor, the
   * carry/undo ledger) and sd.bonuses[] (the popup grid record).
   * @param {number|object|string} source  See resolveSource. Pass srcOf(sd) for
   *                            "the acting card", a location object for a
   *                            location grant, a card id for a fixed source.
   * @param {string} [eventId]  Pre-allocated event ID to share across multiple
   *                            simultaneous addIPMod calls from one trigger.
   *                            Auto-generated when omitted.
   * @param {object} [opts]     { kind } — 'stamp' (in-hand bonus consumed at
   *                            play, re-credited on undo), 'copy' (Papyrus
   *                            inheritance, likewise), 'chain' (Jesus / Samurai
   *                            resurrection accumulator — never consumed),
   *                            'adjust' (adjust-to-value delta — excluded from
   *                            damageOn even when negative).
   */
  /* The location a slot record currently sits at (by identity, either side), or
     null when the record is not on the board (a hand-popup dry run, a pile). */
  function _locOfSlot(sd) {
    if (!sd || !G.locations) return null;
    for (var li = 0; li < G.locations.length; li++) {
      var loc = G.locations[li];
      var p = G.playerSlots[loc.id], a = G.aiSlots[loc.id];
      if ((p && p.indexOf(sd) !== -1) || (a && a.indexOf(sd) !== -1)) return loc;
    }
    return null;
  }

  function addIPMod(sd, delta, source, eventId, opts) {
    var kind = opts && opts.kind;
    /* THE CITADEL (NO_DAMAGE_HERE, India): cards here can't be damaged — a
       permanent negative delta (anything but an adjust-to-value) is simply not
       applied to a card standing there. The continuous layer's negatives are
       stripped by evaluateContinuous (abilities.js, the immunity pass). */
    if (delta < 0 && kind !== 'adjust') {
      var _shield = _locOfSlot(sd);
      if (_shield && _shield.abilityKey === 'NO_DAMAGE_HERE') return;
    }
    var desc = resolveSource(source);
    sd.ipMod = (sd.ipMod || 0) + delta;
    if (!sd.ipModSources) sd.ipModSources = [];
    var entry = { source: desc.name, delta: delta, type: desc.type, id: desc.id };
    if (opts && opts.kind) entry.kind = opts.kind;
    sd.ipModSources.push(entry);
    var eid = eventId || nextEventId();
    addBonus(sd, delta, desc.type, desc.id, eid, 'A', false);
    // The popup record carries the ledger kind too, so clearDamage can drop the
    // grid entries that belong to the ledger entries it removes (and only those).
    if (opts && opts.kind) sd.bonuses[sd.bonuses.length - 1].kind = opts.kind;
    /* PATALIPUTRA (ECHO_GAINS_PLUS_ONE, India): when a card gains IP here, it
       gains +1 more, attributed to the location. Every permanent gain through
       this funnel qualifies — an At Once, a stamp folded in at play, an end-of-
       turn buff — except an adjust-to-value (that would overshoot its target).
       LOOP GUARD: the echo is written with kind 'echo' and under a re-entrancy
       flag, so the +1 never echoes itself. Continuous mods never pass through
       here, so an aura's per-pass rebuild cannot compound. */
    if (delta > 0 && kind !== 'adjust' && kind !== 'echo' && !G._echoingGain) {
      var _echoLoc = _locOfSlot(sd);
      if (_echoLoc && _echoLoc.abilityKey === 'ECHO_GAINS_PLUS_ONE') {
        G._echoingGain = true;
        try { addIPMod(sd, 1, _echoLoc, eid, { kind: 'echo' }); }
        finally { G._echoingGain = false; }
      }
    }
  }

  /* ── CLEAR DAMAGE (heal) ───────────────────────────────────────────────────
     The ONE thing that reduces the damage ledger. Removes every PERMANENT
     negative entry from sd.ipModSources (kind 'adjust' excluded — those are
     adjustments, not damage), adds the removed total back onto sd.ipMod, and
     drops the matching popup records. Returns the total removed (>= 0).
     It never touches contModSources: continuous minuses are rebuilt on every
     evaluateContinuous pass from a standing aura (Dalit, Juvenal, the Sahara),
     so "clearing" one would only reappear next pass — and a repeatable heal
     paid per point cleared could farm IP off it forever. Damage from auras
     therefore stays, and hasDamage/damageOn keep reporting it. */
  function clearDamage(sd) {
    if (!sd || !sd.ipModSources || !sd.ipModSources.length) return 0;
    var removed = 0, keep = [];
    sd.ipModSources.forEach(function (e) {
      if (e && e.delta < 0 && e.kind !== 'adjust') removed -= e.delta;
      else keep.push(e);
    });
    if (!removed) return 0;
    sd.ipModSources = keep;
    sd.ipMod = (sd.ipMod || 0) + removed;
    if (sd.bonuses) {
      sd.bonuses = sd.bonuses.filter(function (b) {
        return !(b && !b.continuous && b.amount < 0 && b.kind !== 'adjust');
      });
    }
    return removed;
  }

  /* ── Pre-play bonuses (the id-keyed accumulators a card carries IN HAND) ──
     Three kinds live on a card id before it reaches the board:
       chain  — G.cardIPBonus[id] for Jesus (10) / Samurai (12): the resurrection
                accumulator. Self-attributed, NEVER consumed (it must grow across
                deaths), zeroed only by Justinian.
       stamp  — G.cardIPBonus[id] with matching entries in G.cardIPBonusSource
                [side][id]: an in-hand buff placed by ANOTHER card (Amenirdis → Piye).
                Attributed to the stamper, one entry per stamp, CONSUMED when the
                card enters the board so a later card of the same id (a copy, a
                convert, a deck draw) never inherits it. Undo re-credits.
       copy   — G.copyIPBonus[side][id]: a Papyrus (54) copy's inherited
                permanent IP. Attributed to Papyrus, consumed at play, re-credited
                on undo.
     applyPrePlayBonuses folds all three into a fresh slot THROUGH addIPMod, so
     each arrives with its own attribution record. Called by every slot-creation
     path (player commit, AI commit, 2P remote commit, placeRevealedCard). */
  function _sideOf(owner) { return owner === 'player' ? 'player' : 'opp'; }
  function _bonusDictOf(owner) { return owner === 'player' ? G.cardIPBonus : G.aiCardIPBonus; }
  function _stampBagOf(owner) {
    if (!G.cardIPBonusSource) G.cardIPBonusSource = { player: {}, opp: {} };
    var side = _sideOf(owner);
    if (!G.cardIPBonusSource[side]) G.cardIPBonusSource[side] = {};
    return G.cardIPBonusSource[side];
  }
  /** Record an in-hand stamp: +delta on cardId for owner, attributed to `source`. */
  function stampHandBonus(owner, cardId, delta, source, opts) {
    var dict = _bonusDictOf(owner);
    dict[cardId] = (dict[cardId] || 0) + delta;
    var desc = resolveSource(source);
    var bag  = _stampBagOf(owner);
    if (!bag[cardId]) bag[cardId] = [];
    var entry = { type: desc.type, id: desc.id, delta: delta };
    // opts.kind: 'adjust' for a set-toward-a-value stamp (Fired Brick) so the
    // ledger entry it becomes at play is not counted as damage.
    if (opts && opts.kind) entry.kind = opts.kind;
    bag[cardId].push(entry);
  }
  /**
   * @param {object} opts  { copy: true }   also fold the Papyrus copy bonus
   *                       { dryRun: true } attribute but do not consume (hand popup)
   */
  function applyPrePlayBonuses(sd, owner, cardId, opts) {
    opts = opts || {};
    var side   = _sideOf(owner);
    var dict   = _bonusDictOf(owner);
    var bag    = _stampBagOf(owner);
    var total  = dict[cardId] || 0;
    var stamps = (bag[cardId] || []).slice();
    var stampSum = stamps.reduce(function (s, e) { return s + (e.delta || 0); }, 0);
    var chain  = total - stampSum;
    if (chain) {
      var chainSrc = (cardId === 10 || cardId === 12) ? { type: 'card', id: cardId } : { type: 'unknown', name: 'Bonus' };
      addIPMod(sd, chain, chainSrc, undefined, { kind: 'chain' });
    }
    stamps.forEach(function (e) {
      addIPMod(sd, e.delta, { type: e.type, id: e.id }, undefined, { kind: e.kind || 'stamp' });
    });
    if (!opts.dryRun && stamps.length) {
      dict[cardId] = chain;
      delete bag[cardId];
    }
    if (opts.copy) {
      var copyB = (G.copyIPBonus && G.copyIPBonus[side] && G.copyIPBonus[side][cardId]) || 0;
      if (copyB) {
        addIPMod(sd, copyB, 54, undefined, { kind: 'copy' });
        if (!opts.dryRun) delete G.copyIPBonus[side][cardId];
      }
    }
    /* BORROWED ABILITY (India: Priest-King). An ability borrowed while the card
       was IN HAND (G.borrowedAbility, written by
       SOG.abilities.borrowAbilityFromDeckBottom) rides onto the slot the same way
       Rosetta's transcription does — sd.transcribedFrom — so evaluateContinuous
       and fireEndOfTurn pick it up through abilityIdOf with no new dispatch path;
       the At-Once case is the card's own registry handler firing the borrowed
       onAtOnce, exactly as abilityRosetta does. sd.borrowed keeps the record so
       the popup can keep the card's OWN ability name and undo can re-credit it.
       A borrow that resolved to nothing (empty deck, vanilla bottom card) leaves
       transcribedFrom unset — the card plays as a plain body — but still marks
       sd.borrowed so the popup shows "No special ability". Consumed at play
       like a stamp; the dry-run (hand popup) only reads it. */
    var bor = G.borrowedAbility && G.borrowedAbility[side] && G.borrowedAbility[side][cardId];
    if (bor) {
      if (bor.srcId != null) sd.transcribedFrom = bor.srcId;
      sd.borrowed = { srcId: (bor.srcId != null) ? bor.srcId : null };
      if (!opts.dryRun) delete G.borrowedAbility[side][cardId];
    }
    return sd;
  }
  /** Undo of a play: return consumed stamps / copy bonus / borrowed ability to the in-hand tables. */
  function recreditPrePlayBonuses(sd, owner) {
    if (!sd) return;
    var side = _sideOf(owner);
    if (sd.borrowed) {
      if (!G.borrowedAbility) G.borrowedAbility = { player: {}, opp: {} };
      if (!G.borrowedAbility[side]) G.borrowedAbility[side] = {};
      G.borrowedAbility[side][sd.cardId] = { srcId: sd.borrowed.srcId };
    }
    (sd.ipModSources || []).forEach(function (e) {
      if (!e || !e.delta) return;
      if (e.kind === 'stamp' || e.kind === 'adjust') {
        stampHandBonus(owner, sd.cardId, e.delta, { type: e.type, id: e.id }, e.kind === 'adjust' ? { kind: 'adjust' } : undefined);
      } else if (e.kind === 'copy') {
        if (!G.copyIPBonus) G.copyIPBonus = { player: {}, opp: {} };
        if (!G.copyIPBonus[side]) G.copyIPBonus[side] = {};
        G.copyIPBonus[side][sd.cardId] = (G.copyIPBonus[side][sd.cardId] || 0) + e.delta;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SCORE / DISPLAY REFRESH
  ═══════════════════════════════════════════════════════════════ */

  /* THE DISPLAYED IP of a revealed slot.
     Normally just effectiveIP. While a flourish holds the slot (_ipDisplayHold),
     it is the value that was on the badge when the hold began (_ipHeldAt) — so the
     badge and the location total defer the SAME pending delta and arrive together
     on the flourish's beat. Without this the score moved with the state while the
     badge waited, and a location total climbed with no visible source.
     STATE IS NEVER DELAYED: effectiveIP is still the truth, and every rule that
     reads IP (scoring at end of turn, Pyramid's absorb, Book's weighing) goes
     through effectiveIP, not this. This is a display function only.
     Defensive fallback: a hold without a captured value shows the live number
     rather than 0, so a mis-set flag can never zero a card out of the score. */
  function displayedIP(s) {
    if (s._ipDisplayHold && typeof s._ipHeldAt === 'number') return s._ipHeldAt;
    return effectiveIP(s);
  }

  function updateScores() {
    G.locations.forEach(function (loc) {
      var pIP = 0, aIP = 0;
      G.playerSlots[loc.id].forEach(function (s) { if (s && s.revealed) pIP += displayedIP(s); });
      G.aiSlots[loc.id].forEach(    function (s) { if (s && s.revealed) aIP += displayedIP(s); });
      // Add per-location external boosts (e.g., Sargon's adjacent-location bonus)
      if (G.locationBoosts && G.locationBoosts[loc.id]) {
        G.locationBoosts[loc.id].player.forEach(function (b) { pIP += b.amount; });
        G.locationBoosts[loc.id].opp.forEach(    function (b) { aIP += b.amount; });
      }
      var pEl = document.getElementById('loc-score-player-' + loc.id);
      var aEl = document.getElementById('loc-score-opp-'    + loc.id);
      if (pEl) { var o = parseInt(pEl.textContent,10)||0; pEl.textContent=pIP; if(pIP!==o)SOG.ui.flashScore(pEl); }
      if (aEl) { var o = parseInt(aEl.textContent,10)||0; aEl.textContent=aIP; if(aIP!==o)SOG.ui.flashScore(aEl); }
    });
    _refreshOpenPopup();
  }

  /* The card-info modal is a LIVE view of its slot, not a snapshot: whenever
     the badges repaint, an open popup re-renders its IP breakdown from the same
     slot data (and the same displayedIP hold), so the grid it shows always sums
     to the badge on the board. ui.js loads after this module — resolved at call
     time. */
  function _refreshOpenPopup() {
    if (SOG.ui && typeof SOG.ui.refreshBattlePopup === 'function') SOG.ui.refreshBattlePopup();
  }

  function refreshSlotIPDisplays() {
    G.locations.forEach(function (loc) {
      ['player','opp'].forEach(function (owner) {
        var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
        slots[loc.id].forEach(function (s, si) {
          if (!s || !s.revealed) return;
          var slotEl = getSlotEl(owner, loc.id, si);
          if (!slotEl) return;
          /* displayedIP, not effectiveIP: a flourish may OWN this badge for the
             length of its beat (see above). Akhenaten (77) sets the hold while a
             discard's source animation plays and clears it inside the ipBadgeSwap
             that reveals the new total — badge and location score release on that
             same beat. Same "state first, visibility deferred" contract the hand
             flourishes use. */
          var ipEl = slotEl.querySelector('.db-overlay-ip');
          if (ipEl) {
            var shown = displayedIP(s);
            ipEl.textContent = shown;
            // Negative IP is legal (damage has no floor); tint the badge so the
            // minus sign reads at a glance rather than looking like a smudge.
            ipEl.classList.toggle('ip-negative', shown < 0);
          }
        });
      });
    });
    _refreshOpenPopup();
  }

  /* ═══════════════════════════════════════════════════════════════
     HEADER
  ═══════════════════════════════════════════════════════════════ */

  function updateHeader() {
    // Step 3: turns count via G.config (same value as the TURNS constant).
    var totalTurns = (G.config && G.config.structure) ? G.config.structure.turns : TURNS;
    headerTurnEl.textContent  = 'TURN ' + G.turn + ' / ' + totalTurns;
    headerPhaseEl.textContent = G.phase === 'select' ? 'SELECT CARDS' : 'REVEAL';

    /* THE TICKER ROW (top-left box, under the turn). A battle with capital shows
       CAPITAL and what is left to spend. A battle with NO capital and a per-turn play
       cap instead — structure.cardsPerTurn, set only by Neanderthal (1), Ötzi (2) and
       Gilgamesh (2) — shows CARDS TO PLAY and how many it may still place, in the
       same element and style, so young players see that a second card is allowed.
       The count reads the same two functions the play check uses
       (SOG.input.cardsPerTurnCap / cardsPlayedThisTurn), so the number and the rule
       cannot disagree: it drops on each placement, and undo, RESET TURN and the next
       turn restore it because each of them changes the plays those functions count.
       Every one of those paths already calls updateHeader. */
    var inp  = window.SOG && SOG.input;
    var cap  = (inp && typeof inp.cardsPerTurnCap === 'function') ? inp.cardsPerTurnCap() : null;
    var free = !!(G.config && G.config.resource && G.config.resource.model === 'none');
    if (cap != null && free && typeof inp.cardsPlayedThisTurn === 'function') {
      _renderTicker('CARDS TO PLAY', Math.max(0, cap - inp.cardsPlayedThisTurn()));
    } else {
      _renderTicker('CAPITAL', G.capital);
    }
  }

  /* Write the ticker row: a small label over the big number, the markup
     js/ui.js resetHeader builds for CAPITAL. Rebuilt only if something replaced
     it, so for capital battles this is exactly the old single textContent write. */
  function _renderTicker(label, value) {
    var box = document.getElementById('battle-capital-info');
    if (!box) return;
    var labelEl = box.querySelector('.battle-capital-label');
    var numEl   = box.querySelector('#battle-capital-num');
    if (!labelEl || !numEl) {
      box.innerHTML = '<span class="battle-capital-label"></span>' +
                      '<span class="battle-capital-num" id="battle-capital-num"></span>';
      labelEl = box.querySelector('.battle-capital-label');
      numEl   = box.querySelector('#battle-capital-num');
    }
    if (labelEl.textContent !== label) labelEl.textContent = label;
    numEl.textContent = value;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.board = {
    shuffle:               shuffle,
    getSlotEl:             getSlotEl,
    findSlotEl:            findSlotEl,
    getCardLocId:          getCardLocId,
    setSlotFaceDown:       setSlotFaceDown,
    buildCardFace:         buildCardFace,
    faceCard:              _faceCard,
    placeRevealedCard:     placeRevealedCard,
    removeEl:              removeEl,
    makeBoardGhost:        makeBoardGhost,
    removeGhost:           removeGhost,
    clearSlotDOM:          clearSlotDOM,
    compactPlayerSlots:    compactPlayerSlots,
    syncPlayerSlots:       syncPlayerSlots,
    compactOppSlots:       compactOppSlots,
    syncOppSlots:          syncOppSlots,
    SOURCE_ID_MAP:         SOURCE_ID_MAP,
    SLOT_ART:              SLOT_ART,
    effectiveCost:         effectiveCost,
    effectiveIP:           effectiveIP,
    displayedIP:           displayedIP,
    isLocationPlayable:    isLocationPlayable,
    isMoveBlockedInto:     isMoveBlockedInto,
    damageOn:              damageOn,
    hasDamage:             hasDamage,
    clearDamage:           clearDamage,
    cardsWithDamage:       cardsWithDamage,
    adjustIPToward:        adjustIPToward,
    restoreToBaseIP:       restoreToBaseIP,
    nextEventId:           nextEventId,
    addBonus:              addBonus,
    addIPMod:              addIPMod,
    resolveSource:         resolveSource,
    entrySource:           entrySource,
    srcOf:                 srcOf,
    stampHandBonus:        stampHandBonus,
    applyPrePlayBonuses:   applyPrePlayBonuses,
    recreditPrePlayBonuses: recreditPrePlayBonuses,
    updateScores:          updateScores,
    refreshSlotIPDisplays: refreshSlotIPDisplays,
    updateHeader:          updateHeader
  };

})();

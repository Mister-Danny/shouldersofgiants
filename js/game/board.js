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

  /** Build card-face HTML inside slotEl (used by flipSlot and placeRevealedCard). */
  /* opts is passed straight through to buildCardImg — notably { size: 'sm' },
     which loads the pre-rendered thumbnail (card.imageSm / the @sm variant)
     instead of full-size art. Callers that render SMALL tiles (the market
     shelves) should pass it, or the browser downscales the big export and the
     result dithers. Omitted → unchanged full-size behaviour for the board. */
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
  function _faceCard(sd, card) {
    if (card && sd && sd.cc != null && sd.cc !== card.cc) {
      return Object.assign({}, card, { cc: sd.cc });
    }
    return card;
  }

  /**
   * Place a card face-up at a location (for Samurai return, Joan summon, Wu push).
   * @param {boolean} [opts.skipLocationAbility] skip MOVE_IN_GAINS_IP
   */
  function placeRevealedCard(owner, locId, cardId, extraIpMod, opts) {
    opts = opts || {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var si    = slots[locId].indexOf(null);
    if (si === -1) return false;
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    // Resurrection bonus stored as named ipMod entry; sd.ip stays at the
    // card's immutable base so the popup breakdown is honest. Callers that
    // need to suppress this (e.g. triggerSamurai, which assembles its own
    // ipMod afterward) zero bonusDict[cardId] before calling.
    var bonusDict = owner === 'player' ? G.cardIPBonus : G.aiCardIPBonus;
    var resBonus  = bonusDict[cardId] || 0;
    var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai' : 'Bonus';
    var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
    var sd     = { cardId: cardId, ip: card.ip, revealed: true, ipMod: (extraIpMod || 0) + resBonus, contMod: 0, ipModSources: resSources, bonuses: [], turnPlayed: G.turn };
    // Populate bonuses[] for the resurrection IP so the popup breakdown shows it.
    // Pattern 'A' (own portrait) is used here since we don't have the original
    // discard-trigger context; abilities.js may add a more accurate 'C' record.
    if (resBonus > 0) {
      var resInfo = SOURCE_ID_MAP[resLabel];
      if (resInfo) addBonus(sd, resBonus, resInfo.type, resInfo.id, nextEventId(), resInfo.pattern, false);
    }
    if (!opts.skipLocationAbility) {
      var dl = G.locations.find(function (l) { return l.id === locId; });
      if (dl && dl.abilityKey === 'MOVE_IN_GAINS_IP') addIPMod(sd, 1, 'The Cape of Good Hope');
    }
    slots[locId][si] = sd;
    var slotEl = getSlotEl(owner, locId, si);
    if (slotEl) {
      slotEl.dataset.cardId = cardId;
      slotEl.className      = 'battle-card-slot occupied face-up';
      slotEl.removeAttribute('draggable');
      buildCardFace(slotEl, card, effectiveIP(sd));
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
          if (uCard) buildCardFace(slotEl, uCard, effectiveIP(sd));
        }
      } else {
        var card = CARDS.find(function (c) { return c.id === sd.cardId; });
        if (card) {
          slotEl.dataset.cardId = sd.cardId;
          slotEl.className      = 'battle-card-slot occupied face-up';
          slotEl.removeAttribute('draggable');
          buildCardFace(slotEl, _faceCard(sd, card), effectiveIP(sd));
        }
      }
    }
    _applyTraderPreview(locId);   // display-only barter overlay (no-op unless active)
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
          buildCardFace(slotEl, _faceCard(sd, card), effectiveIP(sd));
        }
      }
    }
  }

  /* Trader (68) barter PREVIEW — DISPLAY-ONLY. The barter never mutates G during
     selection; this re-skins the two swapped slots' FACES on top of the true
     render (leaving each slot's real dataset.cardId, and therefore scoring /
     costs / continuous effects / interactions, UNCHANGED). Re-applied at the end
     of every syncPlayerSlots so it survives selection-phase re-renders. Guarded by
     G.traderBarter (null in every non-Trader battle → zero cost) and the SELECT
     phase; at reveal the guard fails so the slots render their true faces. */
  function _applyTraderPreview(locId) {
    var tb = G.traderBarter;
    if (!tb || G.phase !== 'select') return;
    var atCardId, showCardId;
    if      (locId === tb.traderLocId)  { atCardId = tb.traderCardId;  showCardId = tb.partnerCardId; }
    else if (locId === tb.partnerLocId) { atCardId = tb.partnerCardId; showCardId = tb.traderCardId;  }
    else return;
    var arr = G.playerSlots[locId] || [], idx = -1;
    for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].cardId === atCardId) { idx = i; break; } }
    if (idx === -1) return;                     // the real card left this slot → no preview
    var slotEl   = getSlotEl('player', locId, idx);
    var showCard = CARDS.find(function (c) { return c.id === showCardId; });
    if (!slotEl || !showCard) return;
    // Badge = the SHOWN card's true effectiveIP (from its real slot elsewhere).
    var showSd = null;
    G.locations.forEach(function (l) {
      (G.playerSlots[l.id] || []).forEach(function (s) { if (s && s.cardId === showCardId) showSd = s; });
    });
    buildCardFace(slotEl, showCard, showSd ? effectiveIP(showSd) : showCard.ip);
    slotEl.classList.add('trader-preview');
    slotEl.dataset.cardId = atCardId;           // keep the REAL identity (interactions/scoring)
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
    'Tigris River':          { type: 'location', id: 103, pattern: 'A' }
  };

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
    // Babylon (BABYLON_COST_5 location, Nebuchadnezzar battle): BASE-cost-5 cards cost
    // -1 while a Babylon location is present. Global (not at-Babylon-only). Keyed off
    // card.cc (base), so it STACKS with the Neb-50 discount above. Inert in battles
    // with no Babylon location. Owner-agnostic (location-based).
    if (card.cc === 5 &&
        G.locations.some(function (l) { return l.abilityKey === 'BABYLON_COST_5'; }))
      cost = Math.max(0, cost - 1);
    // Imhotep (id 65) — "Ancient Engineering": -1 CC to the owner's SCIENTIFIC
    // cards at ALL locations while a revealed Imhotep is on THIS owner's side
    // anywhere (GLOBAL — was location-scoped). Layered like Babylon; owner-aware
    // (a player Imhotep never discounts the AI, and vice versa).
    if (card.type === 'Scientific' &&
        G.locations.some(function (l) {
          return slots[l.id] && slots[l.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 65; });
        }))
      cost = Math.max(0, cost - 1);
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
  function isLocationPlayable(locId, owner) {
    if (!G.locations) return true;
    var loc = G.locations.find(function (l) { return l.id === locId; });
    if (loc && loc.flooded) return false;
    if (!isAdvanceUnlocked(locId, owner)) return false;
    return true;
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
   * Add a named modifier to a slot's permanent IP.
   * Also pushes a bonus record onto sd.bonuses[] for the display system.
   * @param {string} [eventId]  Pre-allocated event ID to share across multiple
   *                            simultaneous addIPMod calls from one trigger.
   *                            Auto-generated when omitted.
   */
  function addIPMod(sd, delta, sourceName, eventId) {
    sd.ipMod = (sd.ipMod || 0) + delta;
    if (!sd.ipModSources) sd.ipModSources = [];
    sd.ipModSources.push({ source: sourceName, delta: delta });
    var info = SOURCE_ID_MAP[sourceName];
    var eid  = eventId || nextEventId();
    if (info) {
      addBonus(sd, delta, info.type, info.id, eid, info.pattern, false);
    } else {
      addBonus(sd, delta, 'unknown', null, eid, 'A', false);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SCORE / DISPLAY REFRESH
  ═══════════════════════════════════════════════════════════════ */

  function updateScores() {
    G.locations.forEach(function (loc) {
      var pIP = 0, aIP = 0;
      G.playerSlots[loc.id].forEach(function (s) { if (s && s.revealed) pIP += effectiveIP(s); });
      G.aiSlots[loc.id].forEach(    function (s) { if (s && s.revealed) aIP += effectiveIP(s); });
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
  }

  function refreshSlotIPDisplays() {
    G.locations.forEach(function (loc) {
      ['player','opp'].forEach(function (owner) {
        var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
        slots[loc.id].forEach(function (s, si) {
          if (!s || !s.revealed) return;
          var slotEl = getSlotEl(owner, loc.id, si);
          if (!slotEl) return;
          var ipEl = slotEl.querySelector('.db-overlay-ip');
          if (ipEl) ipEl.textContent = effectiveIP(s);
        });
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     HEADER
  ═══════════════════════════════════════════════════════════════ */

  function updateHeader() {
    // Step 3: turns count via G.config (same value as the TURNS constant).
    var totalTurns = (G.config && G.config.structure) ? G.config.structure.turns : TURNS;
    headerTurnEl.textContent  = 'TURN ' + G.turn + ' / ' + totalTurns;
    headerPhaseEl.textContent = G.phase === 'select' ? 'SELECT CARDS' : 'REVEAL';
    var capitalNumEl = document.getElementById('battle-capital-num');
    if (capitalNumEl) capitalNumEl.textContent = G.capital;
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
    effectiveCost:         effectiveCost,
    effectiveIP:           effectiveIP,
    isLocationPlayable:    isLocationPlayable,
    nextEventId:           nextEventId,
    addBonus:              addBonus,
    addIPMod:              addIPMod,
    updateScores:          updateScores,
    refreshSlotIPDisplays: refreshSlotIPDisplays,
    updateHeader:          updateHeader
  };

})();

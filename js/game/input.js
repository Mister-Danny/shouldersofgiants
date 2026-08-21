/**
 * game/input.js — Shoulders of Giants · Player Input + Play/Move Actions
 *
 * Owns everything the player can directly trigger during the SELECT phase:
 *   • Hand-card event handlers (click, dblclick, drag, keyboard)
 *   • Selection state + helpers (parallel click and drag flows)
 *   • Board click/dblclick handlers (slot commit, slot select, popup)
 *   • Document-level click/keyboard handlers (Escape, click-outside)
 *   • Drag/drop event listeners on boardEl and playerHandEl
 *   • Touch drag support (mirrors mouse drag for touch devices)
 *   • Legality predicates (isLegalPlayTarget / Undo / Move)
 *   • Terminal actions: commitPlay, undoPlay, queueMove
 *   • Reveal-phase entry helpers: snapBack, resetTurn
 *   • Hand display refresh: rebuildPlayerHand, refreshHandIPDisplays,
 *     refreshHandCostDisplays
 *   • Moveable affordance: refreshMoveableCards
 *
 * Selection-state primitives (selectedCardId, selectedSource,
 * selectedFromLocId, selectedFromSlotIndex, pendingPopupTimer, dragInfo)
 * live as module-local closure state because they're primitives that get
 * reassigned — aliasing them via SOG.input wouldn't work across modules.
 * No code outside this module needs to read them.
 *
 * Reads:  SOG.state.G + constants, window.CARDS, window.tutorialActive
 * Calls:  SOG.board.{ getSlotEl, buildCardFace, clearSlotDOM,
 *                     compactPlayerSlots, syncPlayerSlots, compactOppSlots,
 *                     syncOppSlots, effectiveCost, effectiveIP, addIPMod,
 *                     refreshSlotIPDisplays, updateScores, updateHeader }
 *         SOG.ui.{ openBattlePopup, flashDeny }
 *         window.setPlayerHand
 *         SFX.* (capitalSpent), Analytics.*, Anim.* — optional
 *
 * Exposes: SOG.input.{ rebuildPlayerHand, refreshHandIPDisplays,
 *                      refreshHandCostDisplays, refreshMoveableCards,
 *                      commitPlay, queueMove, snapBack, resetTurn,
 *                      clearSelection, resetDragInfo }
 *
 * NOTE: Extracted from game.js as part of the "split game.js" refactor
 * (Pass 3c — the largest sub-pass). Behavior is unchanged.
 */

(function () {
  'use strict';

  var G             = SOG.state.G;
  var SLOTS_PER_LOC = SOG.state.SLOTS_PER_LOC;

  /* ── Board helper aliases (game/board.js, Pass 3b) ────────────── */
  var getSlotEl             = SOG.board.getSlotEl;
  var buildCardFace         = SOG.board.buildCardFace;
  /* Renders a slot with the slot-data's OWN cc when it differs from the card
     definition — a Mummy (72) is defined 0/0 but carries its source's frozen cc.
     Every path that rebuilds a face must go through this or the badge regresses. */
  var faceCard              = SOG.board.faceCard;
  var clearSlotDOM          = SOG.board.clearSlotDOM;
  var compactPlayerSlots    = SOG.board.compactPlayerSlots;
  var syncPlayerSlots       = SOG.board.syncPlayerSlots;
  var effectiveCost         = SOG.board.effectiveCost;
  var effectiveIP           = SOG.board.effectiveIP;
  var isLocationPlayable    = SOG.board.isLocationPlayable;
  var nextEventId           = SOG.board.nextEventId;
  var addBonus              = SOG.board.addBonus;
  var SOURCE_ID_MAP         = SOG.board.SOURCE_ID_MAP;
  var refreshSlotIPDisplays = SOG.board.refreshSlotIPDisplays;
  var updateScores          = SOG.board.updateScores;
  var updateHeader          = SOG.board.updateHeader;

  /* ── DOM refs (queried at module load) ──────────────────────── */
  var boardEl      = document.getElementById('battle-board');
  var playerHandEl = document.getElementById('battle-player-hand');

  /* ── Drag state ──────────────────────────────────────────────── */
  var dragInfo = null;
  var lastHoveredIllegalSlot = null;  // tracked during mouse dragover; flashed if drop is refused

  /* ── Click/keyboard selection state (parallel to dragInfo) ──── */
  var selectedCardId        = null;
  var selectedSource        = null;   // 'hand' | 'slot' | 'move'
  var selectedFromLocId     = null;
  var selectedFromSlotIndex = null;
  var pendingPopupTimer     = null;   // setTimeout id for click → popup race
  var DBLCLICK_MS           = 350;    // matches deckbuilder.js

  /* ── Dialogue guard ─────────────────────────────────────────── */
  /* Returns true when ANY dialogue system is active — card placement
     is disabled until ALL dialogue finishes.
     Covers two separate systems:
       1. SOG.HUD          — overworld adventure HUD dialogue
       2. SOG.Adventure.Prehistory — in-game coaching / post-battle bubbles */
  function _dialogueActive() {
    if (window.SOG && window.SOG.HUD && window.SOG.HUD.isDialogueActive()) return true;
    var P = window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory;
    if (P && P.isCoachingActive()) return true;
    /* Script-hook input gate (isInputBlocked predicate / services.blockInput).
       No script → returns false → behaviour unchanged. */
    if (window.SOG && SOG.BattleHooks && SOG.BattleHooks.isInputBlocked()) return true;
    // Options panel open mid-battle → board is not interactable behind it.
    if (window.SOG && SOG.OptionsPanel && SOG.OptionsPanel.isOpen()) return true;
    return false;
  }

  /* ═══════════════════════════════════════════════════════════════
     HAND EVENTS
  ═══════════════════════════════════════════════════════════════ */

  function bindHandEvents() {
    // The hand is rebuilt from scratch on every render, so any panel anchored to
    // an element that's about to be discarded must go with it — AND any gesture
    // suppression must be released. Playing a card by double-click suppresses and
    // then destroys the element before mouseleave can fire, which left the latch
    // stuck and killed hover for the rest of the battle. A rebuild means the
    // gesture is over, so this is the correct release point.
    if (SOG.cardHover) { SOG.cardHover.hide(); SOG.cardHover.unsuppress(); }
    playerHandEl.querySelectorAll('.battle-hand-card').forEach(function (el) {
      el.draggable = true;
      if (el.tabIndex < 0) el.tabIndex = 0;
      el.addEventListener('click',     onHandCardClick);
      el.addEventListener('dblclick',  onHandCardDblClick);
      el.addEventListener('dragstart', onHandCardDragStart);
      el.addEventListener('dragend',   onHandCardDragEnd);
      el.addEventListener('keydown',   onHandCardKeyDown);
      // Hover info (SOG.cardHover). Inert when the setting is off or the device
      // can't hover — the module gates both, so no branch is needed here.
      el.addEventListener('mouseenter', onHandCardMouseEnter);
      el.addEventListener('mouseleave', onHandCardMouseLeave);
      // Click-and-hold to play: dismiss on press, before the drag even starts.
      el.addEventListener('mousedown',  onHandCardMouseDown);
    });
  }

  /* ── Hover info handlers ─────────────────────────────────────────────────
     These only ever SHOW/HIDE the panel; SOG.cardHover owns the enable check,
     the touch-device check and the suppression state. */
  function onHandCardMouseEnter() {
    if (!SOG.cardHover) return;
    var cardId = parseInt(this.dataset.id, 10);
    if (isNaN(cardId)) return;
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return;
    SOG.cardHover.show(card, buildHandPopupSd(card), this);
  }
  function onHandCardMouseLeave() {
    if (!SOG.cardHover) return;
    SOG.cardHover.unsuppress();   // gesture (if any) is over once the cursor leaves
    SOG.cardHover.hide();
  }
  function onHandCardMouseDown() {
    // Press = the start of a play gesture (click-and-hold drag). Get out of the way
    // immediately and stay away until the pointer leaves or the drag ends.
    if (SOG.cardHover) SOG.cardHover.suppress();
  }

  /* Build the synthetic slot used to render a hand card in the info popup. */
  function buildHandPopupSd(card) {
    var bonus = (card.id === 15) ? G.destroyedIPTotal : (G.cardIPBonus[card.id] || 0);
    // Papyrus state-copy: a pending copy's inherited IP shows in the hand popup.
    bonus += (G.copyIPBonus && G.copyIPBonus.player && G.copyIPBonus.player[card.id]) || 0;
    var sources = [];
    var bonuses = [];
    if (bonus) {
      var label = card.id === 15 ? 'Destroyed cards (William)' :
                  card.id === 10 ? 'Jesus'                     :
                  card.id === 12 ? 'Samurai'                   : 'Bonus';
      sources.push({ source: label, delta: bonus });
    }
    var sd = { cardId: card.id, ip: card.ip, ipMod: bonus, ipModSources: sources, contMod: 0, contModSources: [], revealed: true, bonuses: bonuses, turnPlayed: G.turn };
    // William (Pattern B): one thumbnail per destroyed card
    if (card.id === 15 && G.destroyedIPTotal > 0) {
      G.destroyedCards.forEach(function (dc) {
        addBonus(sd, dc.ip, 'card', dc.cardId, dc.eventId, 'B', false);
      });
    } else if (bonus > 0) {
      // Jesus / Samurai resurrection chain (Pattern A — own portrait)
      var info = SOURCE_ID_MAP[label];
      if (info) addBonus(sd, bonus, info.type, info.id, nextEventId(), info.pattern, false);
    }
    return sd;
  }

  function openHandCardPopup(cardId) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return;
    SOG.ui.openBattlePopup(card, buildHandPopupSd(card), 'player', false);
  }

  /* Click on a hand card. Schedule the info popup with a 350ms delay
     so a follow-up click within the window can promote to dblclick →
     select-to-play without first flashing the popup.

     HOVER MODE: the panel is already showing this card's info, so a single click
     does nothing — and skipping the timer means double-click-to-play fires without
     the 350ms wait. Switching the setting off restores this path exactly. */
  function onHandCardClick(e) {
    if (e.detail > 1) return;  // dblclick path handled separately
    if (SOG.cardHover && SOG.cardHover.isEnabled()) return;
    var cardId = parseInt(this.dataset.id, 10);
    if (isNaN(cardId)) return;
    if (pendingPopupTimer) { clearTimeout(pendingPopupTimer); pendingPopupTimer = null; }
    pendingPopupTimer = setTimeout(function () {
      pendingPopupTimer = null;
      openHandCardPopup(cardId);
    }, DBLCLICK_MS);
  }

  /* Double-click on a hand card → toggle select-for-play. */
  function onHandCardDblClick(e) {
    if (pendingPopupTimer) { clearTimeout(pendingPopupTimer); pendingPopupTimer = null; }
    if (SOG.cardHover) SOG.cardHover.suppress();   // committing to play — panel out of the way
    var cardId = parseInt(this.dataset.id, 10);
    if (isNaN(cardId)) return;
    e.preventDefault();
    if (G.phase !== 'select') return;
    // Re-double-clicking the same card deselects.
    if (selectedSource === 'hand' && selectedCardId === cardId) {
      clearSelection();
      return;
    }
    selectHand(cardId);
  }

  function onHandCardKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    if (window.tutorialActive) return;  // tutorial owns its own keyboard flow
    if (G.phase !== 'select') return;
    var cardId = parseInt(this.dataset.id, 10);
    if (isNaN(cardId)) return;
    e.preventDefault();
    if (selectedSource === 'hand' && selectedCardId === cardId) {
      clearSelection();
      return;
    }
    selectHand(cardId);
  }

  function onHandCardDragStart(e) {
    if (SOG.cardHover) SOG.cardHover.suppress();   // dragging to play — panel out of the way
    if (G.phase !== 'select' || _dialogueActive()) { e.preventDefault(); return; }
    var id   = parseInt(this.dataset.id, 10);
    var card = CARDS.find(function (c) { return c.id === id; });
    if (!card) return;
    dragInfo = { cardId: id, source: 'hand' };
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
  }

  function onHandCardDragEnd(e) {
    this.classList.remove('dragging');
    if (SOG.cardHover) SOG.cardHover.unsuppress();   // gesture over — hover may show again
    // If the browser refused the drop (no preventDefault on any dragover),
    // dropEffect ends up 'none'. Flash the last-hovered illegal slot to
    // give the same feedback the click path produces via commitPlay.
    var refused = false;
    try {
      if (e && e.dataTransfer && e.dataTransfer.dropEffect === 'none') refused = true;
    } catch (err) { /* dropEffect access can throw in some browsers — ignore */ }
    if (refused && lastHoveredIllegalSlot) SOG.ui.flashDeny(lastHoveredIllegalSlot);
    lastHoveredIllegalSlot = null;
    dragInfo = null;
    clearDragOver();
  }

  /* ═══════════════════════════════════════════════════════════════
     BOARD DRAG EVENTS
  ═══════════════════════════════════════════════════════════════ */

  boardEl.addEventListener('dragstart', function (e) {
    // Unplayed (face-up but not yet revealed) slot → undo-play drag
    var fdSlot = e.target.closest('.battle-card-slot.unplayed[data-owner="player"]');
    if (fdSlot) {
      dragInfo = {
        source:    'slot',
        cardId:    parseInt(fdSlot.dataset.cardId,    10),
        locId:     parseInt(fdSlot.dataset.locId,     10),
        slotIndex: parseInt(fdSlot.dataset.slotIndex, 10)
      };
      e.dataTransfer.effectAllowed = 'move';
      fdSlot.classList.add('dragging');
      return;
    }
    // Moveable revealed card → move drag (Magellan / Columbus)
    var mvSlot = e.target.closest('.battle-card-slot.moveable[data-owner="player"]');
    if (mvSlot && G.phase === 'select') {
      dragInfo = {
        source:        'move',
        cardId:        parseInt(mvSlot.dataset.cardId,    10),
        fromLocId:     parseInt(mvSlot.dataset.locId,     10),
        fromSlotIndex: parseInt(mvSlot.dataset.slotIndex, 10)
      };
      e.dataTransfer.effectAllowed = 'move';
      mvSlot.classList.add('dragging');
    }
  });

  boardEl.addEventListener('dragover', function (e) {
    if (!dragInfo) return;

    if (dragInfo.source === 'hand') {
      var col = e.target.closest('.battle-card-slot[data-owner="player"]');
      if (!col) { clearDragOver(); return; }
      var locId = parseInt(col.dataset.locId, 10);
      if (!isLegalPlayTarget(dragInfo.cardId, locId)) {
        clearDragOver();
        // Track the slot the user is hovering over so dragend can flash it
        // if the drop is refused.
        var firstEmptyDeny = G.playerSlots[locId].indexOf(null);
        lastHoveredIllegalSlot = firstEmptyDeny !== -1
          ? getSlotEl('player', locId, firstEmptyDeny)
          : getSlotEl('player', locId, 0);
        return;
      }
      e.preventDefault();
      clearDragOver();
      var firstEmpty = G.playerSlots[locId].indexOf(null);
      var t = getSlotEl('player', locId, firstEmpty);
      if (t) t.classList.add('drag-over');
      lastHoveredIllegalSlot = null;
      return;
    }

    if (dragInfo.source === 'move') {
      var col2 = e.target.closest('.battle-card-slot[data-owner="player"]');
      if (!col2) { clearDragOver(); return; }
      var toLocId = parseInt(col2.dataset.locId, 10);
      if (!isLegalMoveTarget(dragInfo.cardId, dragInfo.fromLocId, toLocId)) {
        clearDragOver();
        var firstEmptyDenyMv = G.playerSlots[toLocId].indexOf(null);
        lastHoveredIllegalSlot = firstEmptyDenyMv !== -1
          ? getSlotEl('player', toLocId, firstEmptyDenyMv)
          : getSlotEl('player', toLocId, 0);
        return;
      }
      e.preventDefault();
      clearDragOver();
      var firstEmptyMv = G.playerSlots[toLocId].indexOf(null);
      var t2 = getSlotEl('player', toLocId, firstEmptyMv);
      if (t2) t2.classList.add('drag-over');
      lastHoveredIllegalSlot = null;
    }
  });

  boardEl.addEventListener('dragleave', function (e) {
    var s = e.target.closest('.battle-card-slot');
    if (s) s.classList.remove('drag-over');
  });

  boardEl.addEventListener('drop', function (e) {
    var anySlot = e.target.closest('.battle-card-slot[data-owner="player"]');
    if (!anySlot || !dragInfo) return;
    e.preventDefault();
    anySlot.classList.remove('drag-over');

    if (dragInfo.source === 'hand') {
      commitPlay(dragInfo.cardId, parseInt(anySlot.dataset.locId, 10));
    } else if (dragInfo.source === 'move') {
      var toLocId = parseInt(anySlot.dataset.locId, 10);
      if (toLocId !== dragInfo.fromLocId)
        queueMove(dragInfo.fromLocId, dragInfo.fromSlotIndex, toLocId);
    }
    dragInfo = null;
  });

  boardEl.addEventListener('dragend', function (e) {
    var s = e.target.closest('.battle-card-slot');
    if (s) { s.classList.remove('dragging'); s.classList.remove('drag-over'); }
    var refused = false;
    try {
      if (e && e.dataTransfer && e.dataTransfer.dropEffect === 'none') refused = true;
    } catch (err) { /* ignore */ }
    if (refused && lastHoveredIllegalSlot) SOG.ui.flashDeny(lastHoveredIllegalSlot);
    lastHoveredIllegalSlot = null;
    dragInfo = null;
    clearDragOver();
  });

  /* ═══════════════════════════════════════════════════════════════
     HAND AREA DROP (undo-play)
  ═══════════════════════════════════════════════════════════════ */

  playerHandEl.addEventListener('dragover', function (e) {
    if (dragInfo && dragInfo.source === 'slot') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });

  playerHandEl.addEventListener('drop', function (e) {
    if (!dragInfo || dragInfo.source !== 'slot') return;
    e.preventDefault();
    undoPlay(dragInfo.locId, dragInfo.slotIndex);
    dragInfo = null;
  });

  /* ═══════════════════════════════════════════════════════════════
     CLICK / KEYBOARD SELECTION
     Selection state (selectedSource/selectedCardId/etc.) parallels
     dragInfo. A "selection" is a *pending* action: the user double-
     clicked a hand card (selected for play), double-clicked a face-
     down slot (selected for undo), or double-clicked a moveable
     revealed slot (selected for move). The next single-click on a
     legal target commits the action.
  ═══════════════════════════════════════════════════════════════ */

  function setSelected(source, cardId, fromLocId, fromSlotIndex) {
    selectedSource        = source;
    selectedCardId        = cardId;
    selectedFromLocId     = (fromLocId  != null) ? fromLocId  : null;
    selectedFromSlotIndex = (fromSlotIndex != null) ? fromSlotIndex : null;
  }

  function clearSelection() {
    if (pendingPopupTimer) { clearTimeout(pendingPopupTimer); pendingPopupTimer = null; }
    if (selectedSource === null) return;   // nothing to clear
    setSelected(null, null, null, null);
    document.querySelectorAll('.battle-hand-card.selected, .battle-card-slot.selected')
      .forEach(function (el) { el.classList.remove('selected'); });
    clearLegalTargets();
  }

  function clearLegalTargets() {
    boardEl.querySelectorAll('.battle-card-slot.legal-target')
      .forEach(function (el) { el.classList.remove('legal-target'); });
    if (playerHandEl) playerHandEl.classList.remove('legal-target-zone');
  }

  /* Highlight every slot that's a legal target for the current selection. */
  function highlightLegalTargets() {
    clearLegalTargets();
    if (selectedSource === 'hand' && selectedCardId !== null) {
      G.locations.forEach(function (loc) {
        if (!isLegalPlayTarget(selectedCardId, loc.id)) return;
        var fi = G.playerSlots[loc.id].indexOf(null);
        var t  = getSlotEl('player', loc.id, fi);
        if (t) t.classList.add('legal-target');
      });
    } else if (selectedSource === 'move' && selectedCardId !== null) {
      G.locations.forEach(function (loc) {
        if (!isLegalMoveTarget(selectedCardId, selectedFromLocId, loc.id)) return;
        var fi = G.playerSlots[loc.id].indexOf(null);
        var t  = getSlotEl('player', loc.id, fi);
        if (t) t.classList.add('legal-target');
      });
    } else if (selectedSource === 'slot' && selectedFromLocId !== null) {
      // Undo: dropping into the hand area — mark the hand zone instead of slots.
      if (playerHandEl) playerHandEl.classList.add('legal-target-zone');
    }
  }

  function selectHand(cardId) {
    clearSelection();
    setSelected('hand', cardId, null, null);
    var el = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
    if (el) el.classList.add('selected');
    highlightLegalTargets();
  }

  function selectSlotForUndo(locId, slotIndex) {
    clearSelection();
    var sd = G.playerSlots[locId] && G.playerSlots[locId][slotIndex];
    if (!sd) return;
    setSelected('slot', sd.cardId, locId, slotIndex);
    var el = getSlotEl('player', locId, slotIndex);
    if (el) el.classList.add('selected');
    highlightLegalTargets();
  }

  function selectMoveable(cardId, fromLocId, fromSlotIndex) {
    clearSelection();
    setSelected('move', cardId, fromLocId, fromSlotIndex);
    var el = getSlotEl('player', fromLocId, fromSlotIndex);
    if (el) el.classList.add('selected');
    highlightLegalTargets();
  }

  /* Delegated single-click handler on the board:
     - empty slot while hand-selected → commitPlay
     - empty slot while move-selected → queueMove
     - revealed slot → open info popup
     Single-click only (e.detail === 1) for the popup branches; dblclick
     handled separately. */
  boardEl.addEventListener('click', function (e) {
    if (window.tutorialActive) return;     // tutorial owns its own flow
    if (_dialogueActive()) return;         // HUD dialogue in progress — no placement
    // Allow 'over' phase through for board review popups; block all other non-select phases
    if (G.phase !== 'select' && G.phase !== 'over') return;
    if (dragInfo) return;                  // mid-drag
    if (e.detail > 1) return;             // 2nd click of a dblclick burst — let dblclick handler run instead

    var slotEl = e.target.closest('.battle-card-slot');
    if (!slotEl) return;
    var locId = parseInt(slotEl.dataset.locId, 10);
    if (isNaN(locId)) return;
    var owner = slotEl.dataset.owner;
    var siRaw = slotEl.dataset.slotIndex;
    var slotIndex = siRaw != null ? parseInt(siRaw, 10) : NaN;

    // ── Selection commit branches (select phase only) ────────────
    // A click on a revealed-occupied slot is transparent to selection
    // so the popup branch below can open card info without committing
    // (selection persists; user can still click an empty slot to play).
    var isRevealed = slotEl.classList.contains('face-up') &&
                     slotEl.classList.contains('occupied');
    if (G.phase === 'select') {
      if (!isRevealed && selectedSource === 'hand' && owner === 'player') {
        if (isLegalPlayTarget(selectedCardId, locId)) {
          var cid = selectedCardId;
          clearSelection();
          commitPlay(cid, locId);
        } else {
          SOG.ui.flashDeny(slotEl);
        }
        return;
      }
      if (!isRevealed && selectedSource === 'move' && owner === 'player') {
        if (isLegalMoveTarget(selectedCardId, selectedFromLocId, locId)) {
          var fromLoc = selectedFromLocId;
          var fromIdx = selectedFromSlotIndex;
          clearSelection();
          queueMove(fromLoc, fromIdx, locId);
        } else {
          SOG.ui.flashDeny(slotEl);
        }
        return;
      }
    }
    // ── No selection: revealed slot opens popup; other branches no-op
    //    (selection is initiated via dblclick / Enter, not click).
    if (slotEl.classList.contains('face-up') &&
        slotEl.classList.contains('occupied') &&
        !isNaN(slotIndex)) {
      var slotsRef = owner === 'player' ? G.playerSlots : G.aiSlots;
      var sd = slotsRef[locId] && slotsRef[locId][slotIndex];
      if (!sd) return;
      var card = CARDS.find(function (c) { return c.id === sd.cardId; });
      if (!card) return;
      // Delay the popup so a follow-up click within DBLCLICK_MS can promote
      // to dblclick (select-for-move on .moveable slots, select-for-undo on
      // .unplayed slots) without first flashing the popup overlay that would
      // otherwise absorb the second click. Mirrors onHandCardClick's pattern.
      if (pendingPopupTimer) { clearTimeout(pendingPopupTimer); pendingPopupTimer = null; }
      pendingPopupTimer = setTimeout(function () {
        pendingPopupTimer = null;
        SOG.ui.openBattlePopup(card, sd, owner, true);
      }, DBLCLICK_MS);
    }
  });

  /* Delegated dblclick handler on the board. Toggles select-for-undo
     on own face-down slots, and select-for-move on .moveable slots. */
  boardEl.addEventListener('dblclick', function (e) {
    if (window.tutorialActive) return;
    if (G.phase !== 'select') return;
    if (pendingPopupTimer) { clearTimeout(pendingPopupTimer); pendingPopupTimer = null; }
    var slotEl = e.target.closest('.battle-card-slot[data-owner="player"]');
    if (!slotEl) return;
    var locId     = parseInt(slotEl.dataset.locId,     10);
    var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
    if (isNaN(locId) || isNaN(slotIndex)) return;

    // Trader (68) barter affordance → open the picker (not a move).
    if (slotEl.classList.contains('trader-barterable')) {
      e.preventDefault();
      openTraderBarter(locId, slotIndex);
      return;
    }

    // Moveable revealed slot → toggle select-for-move
    if (slotEl.classList.contains('moveable')) {
      var mvCardId = parseInt(slotEl.dataset.cardId, 10);
      e.preventDefault();
      if (selectedSource === 'move' &&
          selectedFromLocId === locId &&
          selectedFromSlotIndex === slotIndex) {
        clearSelection();
      } else {
        selectMoveable(mvCardId, locId, slotIndex);
      }
      return;
    }

    // Face-down player slot (unplayed) → toggle select-for-undo
    if (slotEl.classList.contains('unplayed')) {
      e.preventDefault();
      if (selectedSource === 'slot' &&
          selectedFromLocId === locId &&
          selectedFromSlotIndex === slotIndex) {
        clearSelection();
      } else {
        selectSlotForUndo(locId, slotIndex);
      }
    }
  });

  /* Click on the hand area while a face-down slot is selected → undo. */
  playerHandEl.addEventListener('click', function (e) {
    if (window.tutorialActive) return;
    if (G.phase !== 'select') return;
    if (dragInfo) return;
    if (selectedSource !== 'slot') return;
    // Allow undo whether the click landed on a hand-card or empty hand zone:
    // the selected slot is the source of truth.
    var fromLoc = selectedFromLocId;
    var fromIdx = selectedFromSlotIndex;
    clearSelection();
    undoPlay(fromLoc, fromIdx);
  });

  /* Document-level click → clear selection if the click landed
     outside any card / slot. Bound in capture-light by listening
     after the bubbling has resolved. */
  document.addEventListener('click', function (e) {
    if (selectedSource === null) return;
    if (e.target.closest('.battle-hand-card')) return;
    if (e.target.closest('.battle-card-slot')) return;
    if (e.target.closest('#battle-player-hand')) return;
    clearSelection();
  });

  /* Battle-screen keyboard handler: Tab/Enter/Escape for selection +
     commit. Browser handles the actual focus traversal — we only react
     to Enter on a focused element and global Escape. */
  document.addEventListener('keydown', function (e) {
    if (window.tutorialActive) return;
    if (_dialogueActive()) return;         // HUD dialogue in progress — no placement
    if (G.phase !== 'select') return;
    if (e.key === 'Escape') {
      if (selectedSource !== null) { clearSelection(); e.preventDefault(); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target;
    if (!t || !t.classList) return;
    // Hand cards already have their own keydown handler.
    if (t.classList.contains('battle-hand-card')) return;
    var slotEl = t.closest && t.closest('.battle-card-slot[data-owner="player"]');
    if (!slotEl) return;
    var locId     = parseInt(slotEl.dataset.locId,     10);
    var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
    if (isNaN(locId) || isNaN(slotIndex)) return;

    if (selectedSource === 'hand') {
      if (isLegalPlayTarget(selectedCardId, locId)) {
        var cid = selectedCardId;
        clearSelection();
        commitPlay(cid, locId);
        e.preventDefault();
      } else {
        SOG.ui.flashDeny(slotEl);
        e.preventDefault();
      }
      return;
    }
    if (selectedSource === 'move') {
      if (isLegalMoveTarget(selectedCardId, selectedFromLocId, locId)) {
        var fromLoc = selectedFromLocId;
        var fromIdx = selectedFromSlotIndex;
        clearSelection();
        queueMove(fromLoc, fromIdx, locId);
        e.preventDefault();
      } else {
        SOG.ui.flashDeny(slotEl);
        e.preventDefault();
      }
      return;
    }
    // No selection: Enter on own moveable / face-down slot toggles select.
    if (slotEl.classList.contains('moveable')) {
      var mvCardId = parseInt(slotEl.dataset.cardId, 10);
      selectMoveable(mvCardId, locId, slotIndex);
      e.preventDefault();
    } else if (slotEl.classList.contains('unplayed')) {
      selectSlotForUndo(locId, slotIndex);
      e.preventDefault();
    }
  });

  /* ═══════════════════════════════════════════════════════════════
     LEGALITY PREDICATES
     Single source of truth for whether a play / undo / move is
     legal right now. Called by both the drag-and-drop validators
     (boardEl dragover) and the click + keyboard flows so the two
     paths can never disagree.
  ═══════════════════════════════════════════════════════════════ */

  /* ── Battle-config-driven gating ──
     Cost-free play and the per-turn play cap read G.config, so every battle —
     Arcadium and the migrated adventure battles (Prehistory/Ötzi/Gilgamesh) —
     runs the same config-driven path. */
  function _resourceFree() {
    // Cost-zero battle (resource.model 'none'); Arcadium's 'capital' is not free.
    return !!(G.config && G.config.resource && G.config.resource.model === 'none');
  }
  function _cardsPerTurnCap() {
    // Per-turn play cap (cfg.structure.cardsPerTurn); null = no cap (Arcadium).
    return (G.config && G.config.structure && G.config.structure.cardsPerTurn != null)
      ? G.config.structure.cardsPerTurn : null;
  }
  function _cardsPlayedThisTurn() {
    // Cards placed but not yet revealed this turn — the canonical per-turn
    // signal both the engine flow and the bespoke Prehistory loop maintain.
    // (playerRevealQueue is NOT per-turn in the bespoke loop: it never resets
    // between turns, so it accumulates across the whole battle.)
    var n = 0;
    for (var locId in G.playerSlots) {
      var slots = G.playerSlots[locId];
      if (!slots) continue;
      for (var i = 0; i < slots.length; i++) {
        // Count only cards PLAYED this turn (turnPlayed === current turn), not
        // moved cards (which keep their original earlier turnPlayed) nor stale
        // revealed:false slots left by a prior turn. A move must not consume one
        // of the per-turn plays. (Was: any unrevealed slot — which conflated
        // moves/stale cards with this-turn plays.)
        if (slots[i] && !slots[i].revealed && slots[i].turnPlayed === G.turn) n++;
      }
    }
    return n;
  }

  function isLegalPlayTarget(cardId, locId) {
    if (G.phase !== 'select') return false;
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    if (!G.playerSlots[locId]) return false;
    var firstEmpty   = G.playerSlots[locId].indexOf(null);
    if (firstEmpty === -1) return false;
    // Flooded location (Nebuchadnezzar flood mechanic) blocks NEW plays. Inert
    // elsewhere — no location is ever flooded outside that battle.
    if (!isLocationPlayable(locId)) return false;
    // Cost-zero via config (resource.model 'none').
    if (!_resourceFree() && effectiveCost(card, locId) > G.capital) return false;
    // Cards-per-turn cap via config (cfg.structure.cardsPerTurn; null = no cap).
    // The migrated adventure battles set cardsPerTurn (e.g. 2); the cap is counted
    // via unrevealed slots (_cardsPlayedThisTurn).
    var _cap = _cardsPerTurnCap();
    if (_cap != null && _cardsPlayedThisTurn() >= _cap) return false;
    // Turn-1 first-card-here: first play of turn 1 must go to the Great Rift Valley
    var riftLoc = G.locations.find(function (l) { return l.abilityKey === 'FIRST_CARD_HERE'; });
    if (riftLoc && G.turn === 1 && G.playerRevealQueue.length === 0 && locId !== riftLoc.id) {
      return false;
    }
    return true;
  }

  /* Is the player's slot at (locId, slotIndex) currently un-playable? */
  function isLegalUndoTarget(locId, slotIndex) {
    if (G.phase !== 'select') return false;
    if (!G.playerSlots[locId]) return false;
    var sd = G.playerSlots[locId][slotIndex];
    if (!sd || sd.revealed) return false;
    return true;
  }

  /* Can the moveable card `cardId` at `fromLocId` move to `toLocId`? */
  function isLegalMoveTarget(cardId, fromLocId, toLocId) {
    if (G.phase !== 'select') return false;
    if (fromLocId === toLocId) return false;
    if (!G.playerSlots[toLocId]) return false;
    /* DESTINATION CAPACITY — reservations are deliberately NOT subtracted here.
       reservedSlotsPerLoc[X] counts cards that have LEFT X this turn (queueMove
       increments it for fromLocId), and each of those departures already emptied a
       real slot, which the null-count below therefore includes. Subtracting the
       reservation as well counted the same slot twice and made a visibly-open slot
       unusable — the Red Sea bug: ferry a card off a full Red Sea using its own
       "move one card from here each turn" ability, and nothing could move in for
       the rest of the turn.

       Safe because snapBack is ARRIVAL-FIRST: step 1 removes EVERY queued preview
       from its destination, and only then does step 2 restore each origin from its
       snapshot. So an arrival occupying a departure's slot is already gone before
       that location is rebuilt, and the snapshot cannot overflow. Plays never
       subtracted reservations either, so this brings moves in line with them. */
    var availForMove = G.playerSlots[toLocId].filter(function (s) { return s === null; }).length;
    if (availForMove <= 0) return false;
    // CULTURAL_FREE_MOVE_HERE: Cultural cards (not Magellan/Columbus) can only move to Timbuktu
    var movingCard  = CARDS.find(function (c) { return c.id === cardId; });
    var timbuktuLoc = G.locations.find(function (l) { return l.abilityKey === 'CULTURAL_FREE_MOVE_HERE'; });
    // ...UNLESS the card is leaving an ANY_FREE_MOVE_AWAY location (Red Sea),
    // whose whole point is "move one card from here each turn" — to ANYWHERE.
    // Without this exemption a Cultural card could be flagged moveable on Red Sea
    // and then have every destination refused, in a battle with no Timbuktu.
    var fromLoc     = G.locations.find(function (l) { return l.id === fromLocId; });
    var freeAway    = fromLoc && fromLoc.abilityKey === 'ANY_FREE_MOVE_AWAY';
    if (!freeAway && movingCard && movingCard.type === 'Cultural' && cardId !== 24 && cardId !== 25) {
      if (!timbuktuLoc || toLocId !== timbuktuLoc.id) return false;
    }
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAY / UNDO / RESET
  ═══════════════════════════════════════════════════════════════ */

  function commitPlay(cardId, locId) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return;
    // Flooded location → reject the play defensively (mirrors isLegalPlayTarget).
    if (!isLocationPlayable(locId)) { var df = getSlotEl('player', locId, 0); if (df) SOG.ui.flashDeny(df); return; }
    // Cost-zero via config (resource.model 'none').
    var cost = _resourceFree() ? 0 : effectiveCost(card, locId);
    if (cost > G.capital) { var d = getSlotEl('player', locId, 0); if (d) SOG.ui.flashDeny(d); return; }
    var si = G.playerSlots[locId].indexOf(null);
    if (si === -1) { var d2 = getSlotEl('player', locId, 0); if (d2) SOG.ui.flashDeny(d2); return; }
    // FIRST_CARD_HERE: first play on Turn 1 must go to the Great Rift Valley
    var riftLoc = G.locations.find(function (l) { return l.abilityKey === 'FIRST_CARD_HERE'; });
    if (riftLoc && G.turn === 1 && G.playerRevealQueue.length === 0 && locId !== riftLoc.id) {
      var d2 = getSlotEl('player', locId, 0); if (d2) SOG.ui.flashDeny(d2); return;
    }
    clearSelection();  // any click/keyboard selection becomes stale after commit

    // Resurrection-chain bonus (Jesus +3/return, Samurai +2/return) lives in
    // G.cardIPBonus[cardId]. Store it as a named ipMod entry so the popup
    // breakdown shows "Base IP: 5  |  Jesus: +3  |  Total: 8" instead of
    // collapsing it into base IP. sd.ip stays at the card's immutable base.
    var resBonus  = G.cardIPBonus[cardId] || 0;
    // Carry-forward bonus attribution: Jesus/Samurai are id-specific; a
    // Cuneiform hand-boost (G.cardIPBonusSource) attributes to Cuneiform so
    // the IP breakdown shows its portrait; otherwise a generic "Bonus".
    var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai'
                  : (G.cardIPBonusSource && G.cardIPBonusSource[cardId]) || 'Bonus';
    var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
    // Papyrus (54) state-copy inheritance: a pending copy's inherited PERMANENT
    // IP rides G.copyIPBonus until played — fold it into this play's ipMod
    // (labelled 'Papyrus') and CONSUME the entry (once; undoPlay re-credits it).
    // With a plain twin of the same id also in hand, the first play of that id
    // takes the bonus — conserved, never duplicated.
    var _copyB = (G.copyIPBonus && G.copyIPBonus.player && G.copyIPBonus.player[cardId]) || 0;
    if (_copyB) {
      resBonus += _copyB;
      resSources.push({ source: 'Papyrus', delta: _copyB });
      delete G.copyIPBonus.player[cardId];
    }
    // Capture hand position so undoPlay can restore the card to the slot it
    // came from rather than appending to the end of the hand.
    var handIndex = G.playerHand.indexOf(cardId);
    var newSd = { cardId: cardId, ip: card.ip, revealed: false, ipMod: resBonus, contMod: 0, ipModSources: resSources, bonuses: [], handIndex: handIndex, turnPlayed: G.turn };
    if (resBonus > 0) {
      var resInfo = SOURCE_ID_MAP[resLabel];
      if (resInfo) addBonus(newSd, resBonus, resInfo.type, resInfo.id, nextEventId(), resInfo.pattern, false);
    }
    G.playerSlots[locId][si] = newSd;
    G.capital -= cost;
    if (typeof SFX !== 'undefined') SFX.capitalSpent();
    G.playerRevealQueue.push(cardId);
    // slotIndex recorded so the reveal pipeline can resolve THIS play's slot by
    // coordinates — cardId alone is ambiguous once duplicates exist (Papyrus
    // copies, Nubian Gold tokens). A queued-move snapback may shift the index;
    // revealNext validates it and falls back to an unrevealed-cardId scan.
    G.playerActionLog.push({ type: 'play', cardId: cardId, toLocId: locId, slotIndex: si });

    // Remove ONE instance from hand (filter would delete BOTH copies of a
    // duplicated id — e.g. two Nubian Gold tokens — when playing just one).
    var _hi = G.playerHand.indexOf(cardId);
    if (_hi !== -1) G.playerHand.splice(_hi, 1);
    var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
    if (hEl) hEl.remove();

    var slotEl = getSlotEl('player', locId, si);
    if (slotEl) {
      slotEl.dataset.cardId = cardId;
      slotEl.className = 'battle-card-slot occupied face-up unplayed';
      slotEl.draggable = true;
      buildCardFace(slotEl, card, card.ip + resBonus);
    }
    updateHeader();

    /* onPlayerPlayed (script hook): every migrated battle (Prehistory/Ötzi/
       Gilgamesh) reacts to a committed card here (e.g. enabling End Turn) — the
       old per-battle notify bridge is gone. Sync, fire-and-forget. No script
       (scriptHook null / no G.config) → no-op. */
    if (window.SOG && SOG.BattleHooks) {
      SOG.BattleHooks.fire('onPlayerPlayed', [{ cardId: cardId, locId: locId, turn: G.turn }]);
    }
  }

  function undoPlay(locId, slotIndex) {
    var sd = G.playerSlots[locId][slotIndex];
    if (!sd || sd.revealed) return;
    clearSelection();  // any click/keyboard selection becomes stale after undo
    // The per-turn cap counts unrevealed slots (_cardsPlayedThisTurn), so undoing
    // a play frees up a slot automatically — no counter to decrement.
    var card = CARDS.find(function (c) { return c.id === sd.cardId; });
    if (card) G.capital += effectiveCost(card, locId);
    // Cap to this turn's starting capital — preserves bonus capital
    // granted by Scholar-Officials (or any future "+N capital next
    // turn" ability) instead of clamping back to the base 5.
    G.capital = Math.min(G.capital, G.turnStartCapital);
    G.playerRevealQueue = G.playerRevealQueue.filter(function (id) { return id !== sd.cardId; });
    // Remove THIS play's entry from the action log too — the reveal sequence is
    // built from playerActionLog in play order (buildRevealSequence), so a stale
    // entry left by an undone play mis-orders the reveal: its cardId-scan fallback
    // resolves to a LATER re-play of the same card, flipping it out of turn (e.g.
    // Pyramid revealing before the Phoenicians that should buff its target first).
    // Splice the entry matching this card at this slot (commit-time slotIndex may
    // have shifted via a queued-move snapback, so fall back to cardId + locId).
    (function removeActionLogEntry() {
      var log = G.playerActionLog;
      for (var k = log.length - 1; k >= 0; k--) {
        var e = log[k];
        if (e && e.type === 'play' && e.cardId === sd.cardId && e.toLocId === locId &&
            e.slotIndex === slotIndex) { log.splice(k, 1); return; }
      }
      for (var j = log.length - 1; j >= 0; j--) {
        var e2 = log[j];
        if (e2 && e2.type === 'play' && e2.cardId === sd.cardId && e2.toLocId === locId) {
          log.splice(j, 1); return;
        }
      }
    })();
    // Restore to the slot the card occupied at play time, clamped to the
    // current hand length in case the hand has shrunk since.
    var insertIdx = (typeof sd.handIndex === 'number')
      ? Math.min(sd.handIndex, G.playerHand.length)
      : G.playerHand.length;
    G.playerHand.splice(insertIdx, 0, sd.cardId);
    // Re-credit a consumed Papyrus copy-bonus: if this play folded an inherited
    // 'Papyrus' amount into its ipMod (see commitPlay), return it to the pending
    // table so the copy keeps its buffed state back in hand.
    (sd.ipModSources || []).forEach(function (src) {
      if (src && src.source === 'Papyrus' && src.delta) {
        if (!G.copyIPBonus) G.copyIPBonus = { player: {}, opp: {} };
        G.copyIPBonus.player[sd.cardId] = (G.copyIPBonus.player[sd.cardId] || 0) + src.delta;
      }
    });
    G.playerSlots[locId][slotIndex] = null;
    compactPlayerSlots(locId);
    syncPlayerSlots(locId);
    rebuildPlayerHand();
    updateHeader();
  }

  /**
   * Snap back all queued-move previews to their true origin slots.
   * Called at the start of every reveal phase AND from resetTurn.
   *
   * After this call:
   *   - Every queued card is back at its snapshot-position in fromLocId (face-up)
   *   - Cards that compacted during selection are back at their original slots
   *   - Newly played (face-down) cards are in the remaining null slots
   *   - locationSnapshots and reservedSlotsPerLoc are cleared
   */
  function snapBack() {
    var queued = G.moveLog.filter(function (mv) { return mv.queued; });
    if (!queued.length) return;

    // Step 1: remove every preview card from its destination location.
    // PRIMARY: the exact slot recorded at queue time (previewToIdx), validated —
    // a cardId scan could null a revealed TWIN already living at the destination
    // (duplicate ids exist via Papyrus copies / Nubian Gold). Fallback: the old
    // first-match scan (entries queued before previewToIdx existed).
    var toSeen = {};
    queued.forEach(function (mv) {
      var idx = -1;
      if (mv.previewToIdx != null) {
        var ps = G.playerSlots[mv.toLocId][mv.previewToIdx];
        if (ps && ps.cardId === mv.cardId) idx = mv.previewToIdx;
      }
      if (idx === -1) {
        idx = G.playerSlots[mv.toLocId].findIndex(function (s) { return s && s.cardId === mv.cardId; });
      }
      if (idx !== -1) {
        G.playerSlots[mv.toLocId][idx] = null;
        clearSlotDOM('player', mv.toLocId, idx);
      }
      toSeen[mv.toLocId] = true;
    });
    // Sync destination locations — but do NOT compact them. Removing a moved-in
    // preview must leave ITS slot open right where it was, so that:
    //   (a) any card played into a LATER slot at this destination stays put, and
    //   (b) the queued move re-fills its own gap during reveal (executeMoveAnimated
    //       → slots[toLocId].indexOf(null) finds the preview's slot first).
    // Compacting here pulled later plays up into the vacated slot, so the move then
    // landed in the wrong (later) slot — e.g. move Lucy → slot 3, then play a card
    // behind her in slot 4: snapBack compacted the card up to slot 3 and Lucy
    // re-entered slot 4. Selection keeps slots left-packed, so the preview's gap is
    // the only one — exactly where the move should return. Applies to every
    // player-moved card (Lucy, Chariot, …), not just this example.
    Object.keys(toSeen).forEach(function (idStr) {
      var lid = parseInt(idStr, 10);
      syncPlayerSlots(lid);
    });

    // Step 2: restore each fromLocation from its snapshot, placing new plays in remaining null slots
    var fromSeen = {};
    queued.forEach(function (mv) { fromSeen[mv.fromLocId] = true; });
    Object.keys(fromSeen).forEach(function (idStr) {
      var lid      = parseInt(idStr, 10);
      var snapshot = G.locationSnapshots[lid];
      if (!snapshot) return;

      // New plays are unrevealed cards NOT present in the snapshot
      var snapIds  = snapshot.filter(Boolean).map(function (s) { return s.cardId; });
      var newPlays = [];
      G.playerSlots[lid].forEach(function (s) {
        if (s && !s.revealed && snapIds.indexOf(s.cardId) === -1) newPlays.push(s);
      });

      // Restore snapshot (same object references — card data unchanged)
      G.playerSlots[lid] = snapshot.slice();

      // Append new plays into remaining null slots (in order).
      // If the snapshot was full (e.g. all 4 slots were revealed cards and one
      // queued away), there may not be room for all new plays yet.  Any that
      // don't fit are stored as deferredPlays and inserted after the queued
      // card animates away during the reveal sequence.
      for (var i = 0; i < G.playerSlots[lid].length && newPlays.length; i++) {
        if (G.playerSlots[lid][i] === null) G.playerSlots[lid][i] = newPlays.shift();
      }
      if (newPlays.length > 0) {
        G.deferredPlays[lid] = newPlays;
      }

      syncPlayerSlots(lid);
    });

    // Clear reservation / snapshot state
    G.locationSnapshots     = {};
    G.reservedSlotsPerLoc   = {};
  }

  function resetTurn() {
    // A committed card returning to hand must give back any Papyrus copy bonus it
    // consumed at commit — otherwise cancelling the turn silently loses the buff
    // (the copy re-enters hand at base IP). Mirrors undoPlay's re-credit exactly:
    // read the Papyrus source(s) off the sd's ipModSources and route the delta back
    // to the id-keyed side-table. resetTurn only ever returns PLAYER cards.
    function recreditCopyBonus(sd) {
      (sd && sd.ipModSources || []).forEach(function (src) {
        if (src && src.source === 'Papyrus' && src.delta) {
          if (!G.copyIPBonus) G.copyIPBonus = { player: {}, opp: {} };
          G.copyIPBonus.player[sd.cardId] = (G.copyIPBonus.player[sd.cardId] || 0) + src.delta;
        }
      });
    }

    // 1. Reset move-tracking flags for any queued moves
    G.moveLog.forEach(function (mv) {
      if (mv.queued) {
        G.movedThisTurn[mv.cardId] = false;
        if (mv.isColumbus) G.columbusMoved = false;
        // Red Sea's per-LOCATION budget is refunded too — the move is being
        // snapped back, so the location's one move for this turn was not spent.
        var _fl = G.locations.find(function (l) { return l.id === mv.fromLocId; });
        if (_fl && _fl.abilityKey === 'ANY_FREE_MOVE_AWAY' && G.locMoveUsedThisTurn) {
          G.locMoveUsedThisTurn[mv.fromLocId] = false;
        }
        // Undoing the move also returns any once-per-BATTLE persistent move flag
        // the move SET this turn (Lucy 33 / Chariot 48), so the card regains its
        // move. Only mv.queued (this-turn, not-yet-resolved) moves reach here, and
        // a once-per-battle card can only be queued if its flag wasn't already set
        // — so this can never clear a flag from a prior-turn resolved move. The sd
        // still sits at the destination preview (snapBack runs in step 2). This
        // belongs in resetTurn, NOT snapBack: snapBack also runs at reveal-start,
        // where a resolving move's flag must survive.
        // Resolve the preview sd by its recorded slot (previewToIdx) — a cardId
        // find could clear the flag on a revealed TWIN already living at the
        // destination (restoring a move that twin legitimately spent).
        var movedSd = null;
        if (mv.previewToIdx != null) {
          var pvs = (G.playerSlots[mv.toLocId] || [])[mv.previewToIdx];
          if (pvs && pvs.cardId === mv.cardId) movedSd = pvs;
        }
        if (!movedSd) {
          movedSd = (G.playerSlots[mv.toLocId] || []).find(function (s) {
            return s && s.cardId === mv.cardId;
          });
        }
        if (movedSd) { delete movedSd._advLucyMoved; delete movedSd._advChariotMoved; }
      }
    });

    // 2. Snap queued-move previews back to their origin slots
    snapBack();

    // 2b. Clear any Trader barter (display-only preview + queued action-log entry).
    clearTraderBarter();

    // 3. Return any deferred new plays (didn't fit at snap-back) to hand
    Object.keys(G.deferredPlays).forEach(function (lidStr) {
      var lid = parseInt(lidStr, 10);
      G.deferredPlays[lid].forEach(function (sd) {
        var card = CARDS.find(function (c) { return c.id === sd.cardId; });
        if (card) G.capital += effectiveCost(card, lid);
        recreditCopyBonus(sd);
        G.playerHand.push(sd.cardId);
      });
    });
    G.deferredPlays = {};

    // 4. Return face-down (played-but-not-revealed) cards back to hand
    G.locations.forEach(function (loc) {
      for (var i = 0; i < SLOTS_PER_LOC; i++) {
        var sd = G.playerSlots[loc.id][i];
        if (!sd || sd.revealed) continue;
        var card = CARDS.find(function (c) { return c.id === sd.cardId; });
        if (card) G.capital += effectiveCost(card, loc.id);
        recreditCopyBonus(sd);
        G.playerHand.push(sd.cardId);
        G.playerSlots[loc.id][i] = null;
      }
      compactPlayerSlots(loc.id);
      syncPlayerSlots(loc.id);
    });

    G.capital           = Math.min(G.capital, G.turnStartCapital);
    G.playerRevealQueue = [];
    G.moveLog           = [];
    G.playerActionLog   = [];

    rebuildPlayerHand();
    updateHeader();
  }

  /* ═══════════════════════════════════════════════════════════════
     HAND DISPLAY REFRESH
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Refresh IP overlays on hand cards.
   * Accounts for G.cardIPBonus (Jesus, Samurai, Magellan) and
   * G.destroyedIPTotal (William the Conqueror, id 15).
   */
  function refreshHandIPDisplays() {
    G.playerHand.forEach(function (cardId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      var displayIP = card.ip + (G.cardIPBonus[cardId] || 0);
      if (cardId === 15) displayIP += G.destroyedIPTotal;
      // Papyrus state-copy: a pending copy's inherited IP shows on the hand card.
      displayIP += (G.copyIPBonus && G.copyIPBonus.player && G.copyIPBonus.player[cardId]) || 0;
      var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"] .db-overlay-ip');
      if (hEl) hEl.textContent = displayIP;
    });
  }

  /**
   * Refresh CC overlays on hand cards.
   * Henry the Navigator (id 22): global -1 CC for all Exploration cards.
   * Cosimo de'Medici (id 19): global -1 CC for all Cultural cards.
   */
  function refreshHandCostDisplays() {
    var henryOnBoard          = G.locations.some(function (l) {
      return G.playerSlots[l.id].some(function (s) { return s && s.revealed && s.cardId === 22; });
    });
    var cosimoOnBoard         = G.locations.some(function (l) {
      return G.playerSlots[l.id].some(function (s) { return s && s.revealed && s.cardId === 19; });
    });
    // Nebuchadnezzar (id 50): At Once, the owner's in-hand Mesopotamia cards get a
    // one-time -1 CC stamp (G.nebCCDiscount, set in abilities.js). Read per-card below
    // (not a board scan) — only cards stamped at Neb's reveal display the discount.
    var nebDiscount = (G.nebCCDiscount && G.nebCCDiscount.player) || {};
    // Ramses II (id 53): the SAME one-time in-hand -1 CC stamp mechanism as
    // Nebuchadnezzar above, keyed on era "Egypt" (G.ramsesCCDiscount). This clause was
    // MISSING while board.js effectiveCost had it, so a Ramses-stamped Egypt card
    // displayed its full cost and was then charged one less — the badge disagreed with
    // the charge. Mirrors effectiveCost so the in-hand number is the truth.
    var ramsesDiscount = (G.ramsesCCDiscount && G.ramsesCCDiscount.player) || {};
    // Babylon location (BABYLON_COST_5) present → base-cost-5 cards display -1. Keyed
    // off the LOCATION (present its whole battle), not a card. Stacks with the Neb-50
    // Mesopotamia discount. Inert in battles with no Babylon location. Mirrors
    // effectiveCost so the in-hand number matches the on-play charge.
    var babylonOnBoard        = G.locations.some(function (l) { return l.abilityKey === 'BABYLON_COST_5'; });
    // Imhotep (id 65) — "Ancient Engineering": -1 CC to the owner's SCIENTIFIC cards
    // at ALL locations while a revealed Imhotep sits on THIS (player) side. Global,
    // so it belongs in the hand display; mirrors the effectiveCost clause exactly
    // (ability-id via transcribedFrom ?? cardId, so a Rosetta-transcribed Imhotep or
    // a Papyrus copy discounts the display just as it discounts the on-play charge).
    var imhotepOnBoard        = G.locations.some(function (l) {
      return G.playerSlots[l.id].some(function (s) {
        return s && s.revealed && (s.transcribedFrom != null ? s.transcribedFrom : s.cardId) === 65;
      });
    });
    G.playerHand.forEach(function (cardId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      var displayCC = card.cc;
      if (card.type === 'Exploration' && henryOnBoard)           displayCC = Math.max(0, displayCC - 1);
      if (card.type === 'Cultural'    && cosimoOnBoard)          displayCC = Math.max(0, displayCC - 1);
      if (card.era  === 'Mesopotamia' && nebDiscount[cardId])    displayCC = Math.max(0, displayCC - 1);
      if (card.era  === 'Egypt'        && ramsesDiscount[cardId]) displayCC = Math.max(0, displayCC - 1);
      if (card.cc   === 5             && babylonOnBoard)         displayCC = Math.max(0, displayCC - 1);
      if (card.type === 'Scientific'  && imhotepOnBoard)         displayCC = Math.max(0, displayCC - 1);
      var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"] .db-overlay-cc');
      if (hEl) hEl.textContent = displayCC;
    });
  }

  /**
   * Rebuild the player hand DOM and re-apply every overlay that depends
   * on board state. setPlayerHand recreates each card element with the
   * raw card.cc / card.ip — Medici/Henry cost discounts and the
   * G.cardIPBonus accumulators are layered back on by the refresh
   * functions. Calling these four together is the only correct sequence;
   * call this helper instead of setPlayerHand directly so they can't
   * drift apart.
   */
  function rebuildPlayerHand() {
    window.setPlayerHand(G.playerHand, G.playerDeck.length);
    bindHandEvents();
    refreshHandIPDisplays();
    refreshHandCostDisplays();
  }

  /* ═══════════════════════════════════════════════════════════════
     MOVEABLE AFFORDANCE
  ═══════════════════════════════════════════════════════════════ */

  function refreshMoveableCards() {
    boardEl.querySelectorAll('.battle-card-slot.moveable').forEach(function (el) {
      el.classList.remove('moveable');
      if (!el.classList.contains('face-down')) el.removeAttribute('draggable');
    });
    if (G.phase !== 'select') return;
    var scandinaviaLoc   = G.locations.find(function (l) { return l.abilityKey === 'MILITARY_FREE_MOVE_AWAY'; });
    var timbuktuLoc      = G.locations.find(function (l) { return l.abilityKey === 'CULTURAL_FREE_MOVE_HERE'; });
    // Red Sea (ANY_FREE_MOVE_AWAY): "You can move one card from here each turn."
    // Unlike Scandinavia/Timbuktu — which are per-CARD budgets keyed on
    // G.movedThisTurn[cardId] — this is a per-LOCATION budget: ONE card total may
    // leave, whichever it is. Tracked in G.locMoveUsedThisTurn[locId], reset with
    // the rest of the per-turn state in game.js.
    var freeMoveAwayLoc  = G.locations.find(function (l) { return l.abilityKey === 'ANY_FREE_MOVE_AWAY'; });
    var freeMoveAwayOpen = freeMoveAwayLoc && !(G.locMoveUsedThisTurn || {})[freeMoveAwayLoc.id];
    var timbuktuHasSpace = timbuktuLoc && (
      G.playerSlots[timbuktuLoc.id].indexOf(null) !== -1
    );
    G.locations.forEach(function (loc) {
      G.playerSlots[loc.id].forEach(function (s, si) {
        if (!s || !s.revealed) return;
        var card = CARDS.find(function (x) { return x.id === s.cardId; });
        var mv = (s.cardId === 24 && !G.movedThisTurn[24]) ||   // Magellan
                 (s.cardId === 25 && !G.columbusMoved)    ||    // Columbus
                 (s.cardId === 33 && !s._advLucyMoved) ||       // Lucy — First Steps: move once per BATTLE (persistent slot flag, mirrors Chariot's _advChariotMoved)
                 (s.cardId === 48 && !s._advChariotMoved) ||    // Chariot — moves once per BATTLE on its own (persistent slot flag, like Lucy); the move-enabler locations/cards below can still grant extra moves
                 (s.cardId === 69 && !s._advChariotMoved) ||    // Chariots (Egypt) — same once-per-BATTLE move as Chariot (48); arrival -2 strike wired in executeMoveAnimated
                 // Scandinavia: Military cards can move away for free (once per turn)
                 (scandinaviaLoc && loc.id === scandinaviaLoc.id && card && card.type === 'Military' && !G.movedThisTurn[s.cardId]) ||
                 // Timbuktu: Cultural cards elsewhere can move to Timbuktu for free (once per turn)
                 (timbuktuHasSpace && timbuktuLoc && loc.id !== timbuktuLoc.id && card && card.type === 'Cultural' && !G.movedThisTurn[s.cardId]) ||
                 // Red Sea: ANY card sitting here may leave, but only one per turn
                 // (the budget is the LOCATION's, so it is not keyed on the card).
                 (freeMoveAwayOpen && loc.id === freeMoveAwayLoc.id);
        if (mv) {
          var el = getSlotEl('player', loc.id, si);
          if (el) { el.classList.add('moveable'); el.draggable = true; }
        }
      });
    });

    // Trader (68, Egypt) — barter affordance. Distinct from a move: tagged
    // '.trader-barterable' (its own pulse, NOT '.moveable' — so it never enters
    // the drag / move-select machinery); the dblclick handler opens the picker.
    // Eligible when revealed, hasn't bartered this battle (_advTraderBartered),
    // and has a revealed partner card at ANOTHER location.
    G.locations.forEach(function (loc) {
      (G.playerSlots[loc.id] || []).forEach(function (s, si) {
        if (!s || !s.revealed || s.cardId !== 68 || s._advTraderBartered) return;
        if (!_traderHasPartner(loc.id)) return;
        var el = getSlotEl('player', loc.id, si);
        if (el) el.classList.add('trader-barterable');
      });
    });
  }

  /* True if the player has any revealed card at a location OTHER than traderLocId
     (a valid Trader barter partner). */
  function _traderHasPartner(traderLocId) {
    var has = false;
    G.locations.forEach(function (loc) {
      if (has || loc.id === traderLocId) return;
      (G.playerSlots[loc.id] || []).forEach(function (s) { if (s && s.revealed) has = true; });
    });
    return has;
  }

  /* Open the Trader barter picker: the player's OWN revealed cards at OTHER
     locations are the valid swap partners. Picking one defines the swap. Reuses
     the shared showDiscardChooser. Re-opening replaces any prior choice. */
  function openTraderBarter(traderLocId, traderIdx) {
    var traderSd = G.playerSlots[traderLocId] && G.playerSlots[traderLocId][traderIdx];
    if (!traderSd || traderSd.cardId !== 68 || traderSd._advTraderBartered) return;
    var partners = [];
    G.locations.forEach(function (loc) {
      if (loc.id === traderLocId) return;
      (G.playerSlots[loc.id] || []).forEach(function (s) { if (s && s.revealed) partners.push(s.cardId); });
    });
    if (!partners.length) return;
    clearSelection();
    if (SOG.abilities && typeof SOG.abilities.showDiscardChooser === 'function') {
      SOG.abilities.showDiscardChooser('Choose a card to barter with Trader', partners, function (chosenId) {
        _setTraderBarter(traderLocId, traderIdx, traderSd.cardId, chosenId);
      });
    }
  }

  /* Record/replace the barter choice: queue a {type:'barter'} action-log entry
     (executes at reveal) and let the display-only preview re-skin the two slots
     (via syncPlayerSlots → _applyTraderPreview). G is NOT mutated. */
  function _setTraderBarter(traderLocId, traderIdx, traderCardId, partnerCardId) {
    // Resolve the partner's slot COORDINATES now (first match — the same slot the
    // preview skins) and carry them through the action log, so execution swaps
    // the exact previewed slot even with duplicate cardIds on board. (The picker
    // itself is id-based, so twin partners are indistinguishable in the chooser —
    // first-match keeps preview and execution consistent.)
    var partnerLocId = null, partnerIdx = null;
    G.locations.forEach(function (loc) {
      (G.playerSlots[loc.id] || []).forEach(function (s, i) {
        if (partnerLocId === null && s && s.cardId === partnerCardId) { partnerLocId = loc.id; partnerIdx = i; }
      });
    });
    if (partnerLocId === null) return;
    var prev = G.traderBarter;
    // Replace-old: drop any prior barter entry (queuing a new choice replaces it).
    G.playerActionLog = G.playerActionLog.filter(function (a) { return a.type !== 'barter'; });
    G.traderBarter = { traderCardId: traderCardId, partnerCardId: partnerCardId,
                       traderLocId: traderLocId, partnerLocId: partnerLocId };
    G.playerActionLog.push({ type: 'barter', cardId: traderCardId, partnerCardId: partnerCardId,
                             barterCoords: { traderLocId: traderLocId, traderIdx: traderIdx,
                                             partnerLocId: partnerLocId, partnerIdx: partnerIdx } });
    // Re-render the involved locations (+ the previous choice's locs, to restore
    // their true faces) so the preview shows the current swap only.
    var locs = [traderLocId, partnerLocId];
    if (prev) { locs.push(prev.traderLocId); locs.push(prev.partnerLocId); }
    locs.filter(function (v, i) { return locs.indexOf(v) === i; })
        .forEach(function (lid) { syncPlayerSlots(lid); });
    updateScores();
    refreshMoveableCards();
  }

  /* Clear the barter (reset / re-choose teardown): drop the action-log entry +
     preview state and restore the two slots' true faces. */
  function clearTraderBarter() {
    var tb = G.traderBarter;
    if (!tb) return;
    G.traderBarter = null;
    G.playerActionLog = G.playerActionLog.filter(function (a) { return a.type !== 'barter'; });
    syncPlayerSlots(tb.traderLocId);
    syncPlayerSlots(tb.partnerLocId);
  }

  /* ═══════════════════════════════════════════════════════════════
     QUEUE MOVE
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Queue a player card movement during the select phase.
   * The card immediately appears at its destination (face-up, with a pulsing
   * gold border) so the player can see where it's going.  The origin slot is
   * compacted so the next available slot opens up for new plays.
   * At reveal-start, snapBack() restores every card to its true origin before
   * executeMoveAnimated slides it in queue order.
   */
  function queueMove(fromLocId, fromSlotIndex, toLocId) {
    var sd = G.playerSlots[fromLocId][fromSlotIndex];
    if (!sd) return;
    var cardId = sd.cardId;
    var card   = CARDS.find(function (c) { return c.id === cardId; });

    // Destination must have a null slot. Reservations are NOT subtracted — see the
    // full reasoning in isLegalMoveTarget; this is the same rule at the commit
    // point, and the two must agree or the drag would preview a move it then refuses.
    var toAvail = G.playerSlots[toLocId].filter(function (s) { return s === null; }).length;
    if (toAvail <= 0) return;
    clearSelection();  // any click/keyboard selection becomes stale after move

    // Snapshot fromLocId before removing the card (first queue from this loc only).
    // Exclude any cards that are themselves queued-move previews from another
    // location — those will be restored from THEIR origin's snapshot at
    // snapBack time, and including them here would cause double-restoration
    // (duplicate cards on the board after reveal). See bug 7.
    if (!G.locationSnapshots[fromLocId]) {
      var previewCardIdsAtThisLoc = G.moveLog
        .filter(function (mv) { return mv.queued && mv.toLocId === fromLocId; })
        .map(function (mv) { return mv.cardId; });
      G.locationSnapshots[fromLocId] = G.playerSlots[fromLocId].map(function (s) {
        if (!s) return null;
        if (previewCardIdsAtThisLoc.indexOf(s.cardId) !== -1) return null;
        return s;
      });
    }
    // Reserve a snap-back slot so new plays can't overfill this location
    G.reservedSlotsPerLoc[fromLocId] = (G.reservedSlotsPerLoc[fromLocId] || 0) + 1;

    // Move card from origin to destination (show at destination during select phase)
    G.playerSlots[fromLocId][fromSlotIndex] = null;
    clearSlotDOM('player', fromLocId, fromSlotIndex);
    compactPlayerSlots(fromLocId);
    syncPlayerSlots(fromLocId);

    var toIdx = G.playerSlots[toLocId].indexOf(null);
    G.playerSlots[toLocId][toIdx] = sd;
    var destSlotEl = getSlotEl('player', toLocId, toIdx);
    if (destSlotEl && card) {
      destSlotEl.dataset.cardId = cardId;
      destSlotEl.className      = 'battle-card-slot occupied face-up queued-dest';
      destSlotEl.removeAttribute('draggable');
      buildCardFace(destSlotEl, faceCard(sd, card), effectiveIP(sd));
    }

    G.movedThisTurn[cardId] = true;
    // Red Sea (ANY_FREE_MOVE_AWAY): spend the LOCATION's one move for this turn.
    // Recorded at QUEUE time like movedThisTurn above, so resetTurn's snap-back
    // restores it along with everything else.
    var _fromLocDef = G.locations.find(function (l) { return l.id === fromLocId; });
    if (_fromLocDef && _fromLocDef.abilityKey === 'ANY_FREE_MOVE_AWAY') {
      if (!G.locMoveUsedThisTurn) G.locMoveUsedThisTurn = {};
      G.locMoveUsedThisTurn[fromLocId] = true;
    }
    if (cardId === 25) G.columbusMoved = true;
    if (cardId === 33) sd._advLucyMoved = true;   // Lucy: once per BATTLE — flag rides the slot data (mirrors Chariot's _advChariotMoved). Set at QUEUE time, so resetTurn clears it when it snaps this move back (the move never happened); it only persists once the move RESOLVES at reveal.
    if (cardId === 48 || cardId === 69) sd._advChariotMoved = true;   // Chariot (48) / Chariots (69, Egypt): once per BATTLE on its own — same persistent-slot-flag pattern as Lucy (resetTurn clears it on snap-back; persists once the move resolves)

    G.playerActionLog.push({ type: 'move', cardId: cardId, fromLocId: fromLocId, fromSlotIndex: fromSlotIndex, toLocId: toLocId });
    // previewToIdx: the destination slot the preview occupies during the select
    // phase — snapBack removes exactly THAT slot (a cardId scan could null a
    // revealed twin already living at the destination). moveLog is local-only
    // (never serialised), so the index is safe to carry here.
    G.moveLog.push({ cardId: cardId, fromLocId: fromLocId, fromSlotIndex: fromSlotIndex, toLocId: toLocId, previewToIdx: toIdx, queued: true, isColumbus: cardId === 25 });

    refreshMoveableCards();
    updateScores();
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAG OVER CLEANUP
  ═══════════════════════════════════════════════════════════════ */

  function clearDragOver() {
    boardEl.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
  }

  /* ═══════════════════════════════════════════════════════════════
     TOUCH DRAG SUPPORT
     Mirrors the mouse drag-and-drop system using touch events.
     Works alongside existing dragstart/dragover/drop without conflict.
  ═══════════════════════════════════════════════════════════════ */

  function initTouchDrag() {
    var THRESHOLD = 8;       // px — tap vs drag discrimination
    var clone     = null;    // floating visual clone during drag
    var cloneW    = 0;
    var cloneH    = 0;
    var active    = false;   // true once threshold crossed
    var srcEl     = null;    // the element the touch started on
    var srcType   = null;    // 'hand' | 'slot' | 'move'
    var startX    = 0;
    var startY    = 0;

    /* Find the draggable element (if any) under an initial touch target */
    function findSource(el) {
      if (window.tutorialActive) return null;  // tutorial handles its own touch drag
      if (_dialogueActive())     return null;  // HUD dialogue in progress — no placement
      if (G.phase !== 'select') return null;
      var hc = el.closest('.battle-hand-card');
      if (hc) return { type: 'hand', el: hc };
      var fd = el.closest('.battle-card-slot.face-down[data-owner="player"]');
      if (fd) return { type: 'slot', el: fd };
      var mv = el.closest('.battle-card-slot.moveable[data-owner="player"]');
      if (mv) return { type: 'move', el: mv };
      return null;
    }

    /* Build a semi-transparent floating clone that follows the finger */
    function createClone(el) {
      var r = el.getBoundingClientRect();
      cloneW = r.width;
      cloneH = r.height;
      var c = el.cloneNode(true);
      c.style.cssText =
        'position:fixed;' +
        'width:'  + cloneW + 'px;' +
        'height:' + cloneH + 'px;' +
        'top:'    + r.top  + 'px;' +
        'left:'   + r.left + 'px;' +
        'pointer-events:none;' +
        'z-index:9999;' +
        'opacity:0.85;' +
        'transform:scale(1.06);' +
        'transition:none;';
      document.body.appendChild(c);
      return c;
    }

    /* Move clone so it's centred under the finger */
    function positionClone(cx, cy) {
      clone.style.left = (cx - cloneW / 2) + 'px';
      clone.style.top  = (cy - cloneH / 2) + 'px';
    }

    /* Return the element under (cx, cy), hiding clone first so it doesn't block */
    function elUnder(cx, cy) {
      clone.style.visibility = 'hidden';
      var el = document.elementFromPoint(cx, cy);
      clone.style.visibility = '';
      return el;
    }

    /* Highlight the valid drop target slot. Same legality predicates
       used by the mouse dragover validator. */
    function highlightDropTarget(cx, cy) {
      clearDragOver();
      if (!dragInfo) return;
      var under = elUnder(cx, cy);
      if (!under) return;

      var slot = under.closest('.battle-card-slot[data-owner="player"]');
      if (!slot) return;
      var locId = parseInt(slot.dataset.locId, 10);

      if (dragInfo.source === 'hand') {
        if (!isLegalPlayTarget(dragInfo.cardId, locId)) return;
      } else if (dragInfo.source === 'move') {
        if (!isLegalMoveTarget(dragInfo.cardId, dragInfo.fromLocId, locId)) return;
      } else {
        return;
      }
      var fi = G.playerSlots[locId].indexOf(null);
      var t  = getSlotEl('player', locId, fi);
      if (t) t.classList.add('drag-over');
    }

    /* Reset all touch drag state */
    function reset() {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      clone  = null;
      active = false;
      srcEl  = null;
      srcType = null;
    }

    /* ── touchstart ───────────────────────────────────────────── */
    document.addEventListener('touchstart', function (e) {
      var src = findSource(e.touches[0].target);
      if (!src) { srcEl = null; return; }
      srcEl   = src.el;
      srcType = src.type;
      active  = false;
      clone   = null;
      startX  = e.touches[0].clientX;
      startY  = e.touches[0].clientY;
    }, { passive: true });

    /* ── touchmove ────────────────────────────────────────────── */
    document.addEventListener('touchmove', function (e) {
      if (!srcEl) return;
      var t  = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;

      if (!active) {
        if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) return;
        // Threshold crossed — begin drag
        active = true;
        clone  = createClone(srcEl);
        srcEl.classList.add('dragging');

        if (srcType === 'hand') {
          dragInfo = { cardId: parseInt(srcEl.dataset.id, 10), source: 'hand' };
        } else if (srcType === 'slot') {
          dragInfo = {
            source:    'slot',
            cardId:    parseInt(srcEl.dataset.cardId,    10),
            locId:     parseInt(srcEl.dataset.locId,     10),
            slotIndex: parseInt(srcEl.dataset.slotIndex, 10)
          };
        } else {
          dragInfo = {
            source:        'move',
            cardId:        parseInt(srcEl.dataset.cardId,    10),
            fromLocId:     parseInt(srcEl.dataset.locId,     10),
            fromSlotIndex: parseInt(srcEl.dataset.slotIndex, 10)
          };
        }
      }

      e.preventDefault();  // suppress scroll / zoom during active drag
      positionClone(t.clientX, t.clientY);
      highlightDropTarget(t.clientX, t.clientY);
    }, { passive: false });

    /* ── touchend ─────────────────────────────────────────────── */
    document.addEventListener('touchend', function (e) {
      if (!srcEl) return;

      if (!active) {
        // Tap (no drag): let the browser fire the natural click event
        srcEl = null;
        return;
      }

      var t = e.changedTouches[0];
      clearDragOver();

      // Identify what is under the lifted finger
      var dropEl     = elUnder(t.clientX, t.clientY);
      var slotTarget = dropEl ? dropEl.closest('.battle-card-slot[data-owner="player"]') : null;
      var handTarget = dropEl ? dropEl.closest('#battle-player-hand') : null;

      if (slotTarget && dragInfo) {
        if (dragInfo.source === 'hand') {
          commitPlay(dragInfo.cardId, parseInt(slotTarget.dataset.locId, 10));
        } else if (dragInfo.source === 'move') {
          var toLocId = parseInt(slotTarget.dataset.locId, 10);
          if (toLocId === dragInfo.fromLocId) {
            // Dropped back on the source location — silently no-op.
          } else if (!isLegalMoveTarget(dragInfo.cardId, dragInfo.fromLocId, toLocId)) {
            // Illegal move target on touch — flash the slot under the finger.
            SOG.ui.flashDeny(slotTarget);
          } else {
            queueMove(dragInfo.fromLocId, dragInfo.fromSlotIndex, toLocId);
          }
        }
      } else if (handTarget && dragInfo && dragInfo.source === 'slot') {
        undoPlay(dragInfo.locId, dragInfo.slotIndex);
      }

      srcEl.classList.remove('dragging');
      dragInfo = null;
      reset();
    }, { passive: true });

    /* ── touchcancel ──────────────────────────────────────────── */
    document.addEventListener('touchcancel', function () {
      if (srcEl) srcEl.classList.remove('dragging');
      dragInfo = null;
      reset();
    }, { passive: true });
  }

  /* ── One-time init ─────────────────────────────────────────── */
  initTouchDrag();

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.input = {
    rebuildPlayerHand:       rebuildPlayerHand,
    refreshHandIPDisplays:   refreshHandIPDisplays,
    refreshHandCostDisplays: refreshHandCostDisplays,
    refreshMoveableCards:    refreshMoveableCards,
    commitPlay:              commitPlay,
    undoPlay:                undoPlay,
    queueMove:               queueMove,
    snapBack:                snapBack,
    resetTurn:               resetTurn,
    clearSelection:          clearSelection,
    /* Used by game.js's initGame to reset transient drag state at
       the start of a new game. Selection state resets automatically
       (no game starts with a selection active). */
    resetDragInfo:           function () { dragInfo = null; }
  };

})();

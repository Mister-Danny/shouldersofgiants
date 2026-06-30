/**
 * ui.js
 * Shoulders of Giants — UI Rendering
 *
 * Exposes:
 *   window.initBattleUI(locations)          — builds the battle screen scaffold
 *   window.setPlayerHand(cardIds, deckCount) — rebuilds the player hand area
 *
 * Both are called by game.js after game state is initialised.
 *
 * Depends on: CARDS (js/cards.js), LOCATIONS (js/locations.js)
 */

(function () {
  'use strict';

  /* ── Constants ───────────────────────────────────────────────── */
  const OPP_HAND_SIZE  = 5;    // face-down cards shown in opponent hand
  const OPP_DECK_START = 10;   // opponent deck remaining after initial deal
  const SLOTS_PER_LOC  = 4;    // card slots per location per player

  /* ── DOM refs ────────────────────────────────────────────────── */
  const headerTurnEl  = document.getElementById('battle-turn-info');
  const headerPhaseEl = document.getElementById('battle-phase-info');
  const headerCapEl   = document.getElementById('battle-capital-info');
  const oppHandEl     = document.getElementById('battle-opp-hand');
  const boardEl       = document.getElementById('battle-board');
  const playerHandEl  = document.getElementById('battle-player-hand');

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC ENTRY POINTS
  ═══════════════════════════════════════════════════════════════ */

  /**
   * initBattleUI(locations)
   * Builds the static battle scaffold: header · opp hand · board columns.
   * Leaves the player hand area empty; game.js fills it via setPlayerHand().
   * @param {Array} locations  3 Location objects chosen by game.js
   */
  function initBattleUI(locations) {
    resetHeader();
    buildOppHand();
    buildBoard(locations);
    playerHandEl.innerHTML = '';
  }

  /**
   * setPlayerHand(cardIds, deckCount)
   * Rebuilds the player hand display with the given card ids and deck count.
   * Called by game.js at game start and at the start of each new turn.
   * @param {number[]} cardIds   IDs of cards currently in hand
   * @param {number}   deckCount Cards remaining in the draw pile
   */
  function setPlayerHand(cardIds, deckCount) {
    playerHandEl.innerHTML = '';

    cardIds.forEach(function (id) {
      var card = CARDS.find(function (c) { return c.id === id; });
      if (card) playerHandEl.appendChild(buildHandCard(card));
    });

    var sep = document.createElement('div');
    sep.className = 'battle-hand-sep';
    playerHandEl.appendChild(sep);

    playerHandEl.appendChild(buildDeckPile(deckCount));

    layoutHand();   // size + space the cards for the current hand count
  }

  /* ── Dynamic hand layout ─────────────────────────────────────────
     The hand row is flex-centred with a fixed separator + deck pile on
     the right (balanced by a ::before ghost on the left). Card spacing
     and size are computed from the LIVE card count and the available
     width so the cards always sit fully side-by-side with ZERO overlap at
     any count: at low counts they keep a comfortable gap and full size;
     as the hand grows the gap tightens first, then — only if the gap has
     bottomed out and they still don't fit — the cards scale down (bounded).

     HARD RIGHT BOUNDARY: the cards AND the deck pile must hard-stop before
     the fixed bottom-right control cluster (deck/reset/gear/End Turn). We
     measure that cluster's left edge and cap the cards' width so the
     rightmost item — the deck pile — never crosses it. Because the row is
     centre-balanced, the pile's right edge sits at
        pileRight = padLeft + (inner + RESERVED + cardsW) / 2,
     so the cap is  cardsW ≤ 2·(boundary − margin − padLeft) − inner − RESERVED.

     Recomputed on every hand change via the MutationObserver below (draws,
     plays, discards, undo). The default (giant/Arcadium) layout is the one
     that overlapped; prehistory + Ötzi keep their own tuned CSS. */
  var HAND_RESERVED     = 230;        // ghost 115 + sep (1+14+4) + pile (82+14)
  var HAND_ASPECT       = 184 / 123;  // card height / width
  var HAND_CARD_MAX     = 123;        // comfortable full size
  var HAND_CARD_MIN     = 88;         // smallest still-readable width
  var HAND_GAP_MAX      = 12;         // comfortable gap at low counts
  var HAND_GAP_MIN      = 4;          // tightest gap before cards shrink
  var HAND_RIGHT_MARGIN = 16;         // safety gap kept between deck pile + control cluster

  function layoutHand() {
    if (!playerHandEl) return;
    // Prehistory + Ötzi battles tune the hand via their own CSS — leave them be.
    if (document.body.classList.contains('prehistory-battle') ||
        document.body.classList.contains('otzi-battle')) return;

    var cards = playerHandEl.querySelectorAll('.battle-hand-card');
    var n = cards.length;
    if (!n) return;

    var cs    = getComputedStyle(playerHandEl);
    var padL  = parseFloat(cs.paddingLeft)  || 0;
    var padX  = padL + (parseFloat(cs.paddingRight) || 0);
    var inner = playerHandEl.clientWidth - padX;
    if (inner <= 0) inner = 1280 - padX;       // fallback if measured pre-layout (stage is 1280)

    // Default available width = full content box minus the reserved right side.
    // Then cap it at the right-corner control cluster's left edge so neither the
    // cards nor the deck pile can ever push into / crowd those controls.
    var avail   = inner - HAND_RESERVED;
    var cluster = document.querySelector('.battle-hud-bottomright');
    if (cluster) {
      var crect = cluster.getBoundingClientRect();
      if (crect.width > 0) {                    // measurable (not display:none)
        var scale    = (window.SOG && SOG.Stage && typeof SOG.Stage.getScale === 'function')
                         ? (SOG.Stage.getScale() || 1) : 1;
        var boundary = (crect.left - playerHandEl.getBoundingClientRect().left) / scale;  // stage-local px
        var capAvail = 2 * (boundary - HAND_RIGHT_MARGIN - padL) - inner - HAND_RESERVED;
        if (capAvail < avail) avail = capAvail;
      }
    }

    var w = HAND_CARD_MAX, gap = HAND_GAP_MAX;
    var total = function (cw, cg) { return n * cw + (n - 1) * cg; };

    if (total(w, gap) > avail) {
      // 1) Tighten the gap (toward the minimum) before shrinking cards.
      gap = n > 1 ? (avail - n * w) / (n - 1) : 0;
      if (gap < HAND_GAP_MIN) {
        // 2) Still too wide — shrink the cards, bounded by the min width.
        gap = HAND_GAP_MIN;
        w = (avail - (n - 1) * gap) / n;
        if (w < HAND_CARD_MIN) w = HAND_CARD_MIN;   // floor; only overflows past ~11 cards
        if (w > HAND_CARD_MAX) w = HAND_CARD_MAX;
      }
    }
    if (gap > HAND_GAP_MAX) gap = HAND_GAP_MAX;
    if (gap < 0)            gap = 0;

    w = Math.floor(w);             // floor so rounding never pushes the row past `avail`
    var h  = Math.round(w * HAND_ASPECT);
    var mg = Math.floor(gap);
    cards.forEach(function (el, i) {
      el.style.width      = w + 'px';
      el.style.height     = h + 'px';
      el.style.marginLeft = (i === 0 ? 0 : mg) + 'px';
    });
  }

  /* Recompute on any hand change. childList-only + rAF-debounced so our own
     inline-style writes don't retrigger it and a full rebuild coalesces into
     a single pass. Covers the direct DOM removals on play/discard that bypass
     setPlayerHand (input.js + abilities.js). */
  var _handLayoutPending = false;
  function scheduleHandLayout() {
    if (_handLayoutPending) return;
    _handLayoutPending = true;
    requestAnimationFrame(function () { _handLayoutPending = false; layoutHand(); });
  }
  if (playerHandEl && typeof MutationObserver !== 'undefined') {
    new MutationObserver(scheduleHandLayout).observe(playerHandEl, { childList: true });
  }

  /* ── Header ──────────────────────────────────────────────────── */

  function resetHeader() {
    headerTurnEl.textContent  = 'TURN 1 / 4';
    headerPhaseEl.textContent = 'SELECT CARDS';
    headerCapEl.innerHTML =
      '<span class="battle-capital-label">CAPITAL</span>' +
      '<span class="battle-capital-num" id="battle-capital-num">6</span>';
  }

  /* ── Opponent hand ───────────────────────────────────────────── */

  function buildOppHand() {
    oppHandEl.innerHTML = '';

    oppHandEl.appendChild(buildDeckPile(OPP_DECK_START));

    var sep = document.createElement('div');
    sep.className = 'battle-hand-sep';
    oppHandEl.appendChild(sep);

    for (var i = 0; i < OPP_HAND_SIZE; i++) {
      var back = document.createElement('div');
      back.className = 'battle-card-back';
      oppHandEl.appendChild(back);
    }
  }

  function buildDeckPile(count) {
    var pile = document.createElement('div');
    pile.className = 'battle-deck-pile';

    var label = document.createElement('div');
    label.className   = 'battle-deck-label';
    label.textContent = 'DECK';
    pile.appendChild(label);

    var countEl = document.createElement('div');
    countEl.className   = 'battle-deck-count';
    countEl.textContent = count;
    pile.appendChild(countEl);

    return pile;
  }

  /* ── Play board ──────────────────────────────────────────────── */

  function buildBoard(locations) {
    boardEl.innerHTML = '';
    locations.forEach(function (loc) {
      boardEl.appendChild(buildLocationCol(loc));
    });
  }

  function buildLocationCol(loc) {
    var col = document.createElement('div');
    col.className    = 'battle-col';
    col.dataset.locId = loc.id;

    col.appendChild(buildSlotArea('opp',    loc.id));
    col.appendChild(buildLocationTile(loc));
    col.appendChild(buildSlotArea('player', loc.id));

    return col;
  }

  function buildSlotArea(owner, locId) {
    var area = document.createElement('div');
    area.className     = owner === 'opp' ? 'battle-slots-opp' : 'battle-slots-player';
    area.dataset.owner = owner;

    for (var i = 0; i < SLOTS_PER_LOC; i++) {
      var slot = document.createElement('div');
      slot.className         = 'battle-card-slot';
      slot.dataset.locId     = locId;
      slot.dataset.owner     = owner;
      slot.dataset.slotIndex = i;
      area.appendChild(slot);
    }

    return area;
  }

  function buildLocationTile(loc) {
    var tile = document.createElement('div');
    tile.className    = 'battle-location';
    tile.dataset.locId = loc.id;

    var scoreOpp = document.createElement('div');
    scoreOpp.className   = 'battle-loc-score-opp';
    scoreOpp.textContent = '0';
    scoreOpp.id          = 'loc-score-opp-' + loc.id;

    var info = document.createElement('div');
    info.className = 'battle-loc-info battle-loc-info--clickable';
    // Lazily delegate to SOG.ui.openLocationPopup (loaded after ui.js)
    info.addEventListener('click', function () {
      if (SOG.ui && typeof SOG.ui.openLocationPopup === 'function') {
        SOG.ui.openLocationPopup(loc.id);
      }
    });

    var name = document.createElement('div');
    name.className   = 'battle-loc-name';
    name.textContent = loc.name;

    var ability = document.createElement('div');
    ability.className   = 'battle-loc-ability';
    ability.textContent = loc.abilityText;

    info.appendChild(name);
    info.appendChild(ability);

    var scorePlayer = document.createElement('div');
    scorePlayer.className   = 'battle-loc-score-player';
    scorePlayer.textContent = '0';
    scorePlayer.id          = 'loc-score-player-' + loc.id;

    tile.appendChild(scoreOpp);
    tile.appendChild(info);
    tile.appendChild(scorePlayer);

    return tile;
  }

  /* ── Player hand cards ───────────────────────────────────────── */

  /**
   * buildHandCard(card)
   * Builds a hand card element reusing the deck-builder image/overlay
   * structure (.db-card-img-wrap, .db-overlay-cc, .db-overlay-ip).
   * CSS on .battle-hand-card scales the overlays to hand size.
   */
  function buildHandCard(card) {
    var el = document.createElement('div');
    el.className  = 'battle-hand-card';
    el.dataset.id = card.id;

    var imgWrap = document.createElement('div');
    imgWrap.className = 'db-card-img-wrap';

    var ph = document.createElement('div');
    ph.className  = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);

    var img = buildCardImg(card, { size: 'sm' });

    imgWrap.appendChild(ph);
    imgWrap.appendChild(img);

    var ccEl = document.createElement('div');
    ccEl.className   = 'db-overlay-cc';
    ccEl.textContent = card.cc;

    var ipEl = document.createElement('div');
    ipEl.className   = 'db-overlay-ip';
    ipEl.textContent = card.ip;

    el.appendChild(imgWrap);
    el.appendChild(ccEl);
    el.appendChild(ipEl);

    // GSAP hover: pop card to full original size on enter, smooth return on leave.
    if (typeof gsap !== 'undefined') {
      // True while a NON-hover tween (the deal-in fly-up, a reveal fx, etc.) is still
      // running on this card. Hover must not hijack those: if the cursor happens to be
      // over a slot as the board loads, the deal-in animates the card up UNDER the
      // cursor, firing mouseenter — and killing the deal mid-flight left the card stuck
      // raised + displaced (only `scale` was reset on leave) until the next turn.
      // Hover tweens tag themselves `data:'hover'` so they're excluded from this check.
      function _entranceActive() {
        var tweens = gsap.getTweensOf(el);
        for (var i = 0; i < tweens.length; i++) {
          if (tweens[i].isActive() && tweens[i].data !== 'hover') return true;
        }
        return false;
      }
      el.addEventListener('mouseenter', function () {
        if (el.classList.contains('selected')) return;
        if (_entranceActive()) return;            // let the deal-in / fx settle first
        gsap.killTweensOf(el);
        gsap.set(el, { zIndex: 100 });
        gsap.to(el, { scale: 1.35, duration: 0.14, ease: 'power2.out', data: 'hover' });
      });
      el.addEventListener('mouseleave', function () {
        if (_entranceActive()) return;            // don't interrupt the deal-in / fx
        gsap.killTweensOf(el);
        gsap.to(el, {
          scale: 1, duration: 0.22, ease: 'power2.inOut', data: 'hover',
          onComplete: function () { gsap.set(el, { zIndex: 1 }); }
        });
      });
    }

    return el;
  }

  /* ── Card art helper ─────────────────────────────────────────────
     Single source of truth for rendering a card's <img> element.
     Compact surfaces (hand row, discard chooser) pass { size: 'sm' }
     to load a pre-rendered 123x184 variant — see images/cards/first25/<Name>@sm.jpg.
     If the @sm variant doesn't exist on disk, onerror transparently
     falls back to the full-size original, then to display:none if
     even that is missing. Callers don't need to know which assets
     exist; the @sm files can be added incrementally over time. */
  function buildCardImg(card, opts) {
    var img = document.createElement('img');
    img.className = 'db-card-img';
    img.alt = card.name;
    var useSm = opts && opts.size === 'sm';
    if (useSm) {
      img.src = card.image.replace(/\.jpg$/, '@sm.jpg');
      img.onerror = function () {
        // @sm variant missing → fall back to full-size; hide if that's missing too.
        this.onerror = function () { this.style.display = 'none'; };
        this.src = card.image;
      };
    } else {
      img.src = card.image;
      img.onerror = function () { this.style.display = 'none'; };
    }
    return img;
  }

  /* ── Global exports ──────────────────────────────────────────── */
  window.initBattleUI  = initBattleUI;
  window.setPlayerHand = setPlayerHand;
  window.buildCardImg  = buildCardImg;
  window.layoutHand    = layoutHand;

})();

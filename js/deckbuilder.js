/**
 * deckbuilder.js
 * Shoulders of Giants — Deck Builder Module
 *
 * Multi-deck support:
 *   The active deck is whichever slot is currently selected in
 *   window.Decks. All add/remove/rename operations auto-save through
 *   that module — there is no Save button.
 *
 * Layout: one top bar (back · title | deck tabs · ? · counter · play), a left
 *   column with search, sort and filters, and a flat 5-across card grid.
 *
 * Card interactions:
 *   Single click        → opens read-only ability popup
 *   Double click        → toggles card in/out of active slot's deck
 *   Click the circle    → same toggle, in one click
 *
 * Which cards show:
 *   owned cards          → selectable
 *   cards not yet owned  → shown greyed out with a padlock, after the owned ones
 *   7th-grade history    → hidden until owned (they unlock as a set)
 *
 * Slot row interactions:
 *   Click slot card        → switches active slot (re-renders grid + counter)
 *   Click pencil icon      → opens Rename Deck modal
 *
 * Depends on: window.Decks (js/decks.js), CARDS (js/cards.js),
 *             showScreen() (index.html)
 */

(function () {
  'use strict';

  /* ── Constants ───────────────────────────────────────────────── */
  var DECK_SIZE  = (window.Decks && window.Decks.DECK_SIZE) || 15;
  // Effective target size — Adventure Mode uses 12, Arcadium/multiplayer 15.
  function deckSize() {
    return (window.Decks && typeof window.Decks.effectiveDeckSize === 'function')
      ? window.Decks.effectiveDeckSize() : DECK_SIZE;
  }
  var SLOT_COUNT = (window.Decks && window.Decks.SLOT_COUNT) || 3;
  var TYPE_ORDER = ['Prehistory', 'Political', 'Religious', 'Military', 'Cultural', 'Exploration', 'Scientific', 'Labor', 'Economic'];

  /* Era filter groups. Several card eras fold into one button so the column
     stays short; every era not named here belongs to the 7th-grade history set. */
  var ERA_GROUPS = ['Prehistory', 'Mesopotamia', 'Egypt', 'Kush', 'India', 'World History'];
  function eraGroup(card) {
    var e = card.era || '';
    if (e === 'Prehistory' || e === 'Mesopotamia' || e === 'Egypt') return e;
    if (e === 'Kush' || e === 'Aksumite') return 'Kush';
    if (e === 'Harappan' || e === 'Early India') return 'India';
    return 'World History';
  }

  /* Sort keys. Each leads with itself and breaks ties with the others, so the
     default "Type" order is Type, then CC, then IP. All run low to high;
     clicking the active key again reverses the LEADING key only. */
  var SORTS = [
    { key: 'type', label: 'Type', chain: ['type', 'cc', 'ip'] },
    { key: 'cc',   label: 'CC',   chain: ['cc', 'ip', 'type'] },
    { key: 'ip',   label: 'IP',   chain: ['ip', 'cc', 'type'] }
  ];

  /* Heading over the greyed-out cards the player does not own yet. Editable. */
  var LOCKED_HEADING = '\uD83D\uDD12 Locked cards \u2014 collect them in Adventure Mode';

  /* ── State ───────────────────────────────────────────────────── */
  var popupCardId = null;       // ID of card currently shown in popup
  var renameSlot  = null;       // slot currently being renamed (1/2/3)
  // What the grid is showing. Reset each time the builder opens; kept when
  // the player switches deck slots.
  var view = { q: '', types: {}, eras: {}, sort: 'type', dir: 1 };

  /* ── DOM refs ────────────────────────────────────────────────── */
  var mainEl    = document.getElementById('db-main');
  var counterEl = document.getElementById('db-counter');
  var saveBtn   = document.getElementById('db-save');
  var saveHint  = document.getElementById('db-save-hint');
  var backBtn   = document.getElementById('db-back');
  var slotRowEl = document.getElementById('db-slot-row');
  var headerEl  = document.querySelector('#screen-deckbuilder .db-header');

  // Search / sort / filter column
  var sideEl        = document.getElementById('db-side');
  var searchBoxEl   = document.getElementById('db-search');
  var searchInputEl = document.getElementById('db-search-input');
  var searchClearEl = document.getElementById('db-search-clear');
  var sortEl        = document.getElementById('db-sort');
  var typeGroupEl   = document.getElementById('db-type-group');
  var typeChipsEl   = document.getElementById('db-type-chips');
  var eraGroupEl    = document.getElementById('db-era-group');
  var eraChipsEl    = document.getElementById('db-era-chips');
  var clearFiltersEl = document.getElementById('db-clear-filters');
  var resultCountEl = document.getElementById('db-result-count');

  // Card-detail popup (read-only)
  var backdropEl      = document.getElementById('card-popup-backdrop');
  var popupNameEl     = document.getElementById('popup-name');
  var popupTypeEl     = document.getElementById('popup-type');
  var popupAbilNameEl = document.getElementById('popup-ability-name');
  var popupAbilTextEl = document.getElementById('popup-ability-text');
  var popupCloseBtn   = document.getElementById('popup-close-btn');

  // Per-category modifier class for the icon span in the type label.
  // Mirrors the map in game.js → openBattlePopup so both popup surfaces
  // render the same symbol+label. Scientific has no PNG yet → falls
  // through to a label-only display.
  var TYPE_ICON_CLASS = {
    Political:   'political',
    Religious:   'religious',
    Military:    'military',
    Cultural:    'cultural',
    Exploration: 'exploration',
    Scientific:  'scientific',
    Prehistory:  'prehistory'
    // Labor / Economic have no symbol art yet — omitted so the popup shows a
    // text-only type (no empty icon slot) until art is added.
  };

  // Rename modal
  var renameBackdrop  = document.getElementById('rename-deck-backdrop');
  var renameInput     = document.getElementById('rename-deck-input');
  var renameCounter   = document.getElementById('rename-deck-counter-num');
  var renameSaveBtn   = document.getElementById('rename-deck-save');
  var renameCancelBtn = document.getElementById('rename-deck-cancel');

  /* ── Selection helpers (delegate to Decks) ───────────────────── */

  function isSelected(cardId)    { return window.Decks.hasCard(cardId); }
  function activeCards()         { return window.Decks.getActiveCards(); }
  function activeCardCount()     { return activeCards().length; }

  function isCardUnlocked(id)    { return !!(window.SOG && SOG.Cards && SOG.Cards.isUnlocked && SOG.Cards.isUnlocked(id)); }

  /* DEV-ONLY testing override. When the "Unlock All Cards (dev)" toggle in the dev
     menu is ON (localStorage sog_dev_unlock_all === 'true'), the builder treats every
     non-token card as available so any deck can be built for testing. This is a pure
     VIEW override at the availability gate — it NEVER writes to SOG.collection (the
     earned-card list) or grants cards, so the player's real unlocked collection and
     saved progress are untouched; flip it off and normal ownership rules return. */
  function devUnlockAll() {
    try { return localStorage.getItem('sog_dev_unlock_all') === 'true'; } catch (e) { return false; }
  }

  /* UNIFIED POOL — every context (Arcadium, multiplayer, adventure): the deck
     builder offers ONLY the cards the player has collected (SOG.collection).
     Adventure Mode is the only way to gain cards, so Arcadium/multiplayer build
     from that same owned-card collection — there is no longer an "Arcadium full
     pool vs adventure pool" distinction, and no Progression type-locks (owning a
     card IS the gate now). Battle/AI/challenge decks source cards elsewhere
     (e.g. game.js buildAiDeck, fixed adventure-battle decks) and are unaffected. */
  function isCardAvailable(card) {
    if (!card) return false;
    // Tokens (the Mummy 72, flagged token:true) are in-game-created, non-deckable
    // placeholder cards — never selectable, even under the dev override.
    // Nubian Gold (73) USED to be one; the flag was lifted when it became a real
    // deckable/purchasable Kush card. It is still generated by
    // NUBIAN_GOLD_ON_PLAY, which pushes it straight to hand and never consults
    // this gate — so both paths coexist.
    if (card.token) return false;
    if (devUnlockAll()) return true;               // dev testing override (collection untouched)
    return isCardUnlocked(card.id);
  }

  /* ── Entry point ─────────────────────────────────────────────── */

  function initDeckBuilder() {
    // NON-DESTRUCTIVE: we no longer prune saved decks to the current pool. The
    // old Decks.filterAllCards() call mutated AND persisted every slot, stripping
    // any card not in the pool — under the collection-only pool that would have
    // permanently deleted not-yet-collected cards from existing saved decks.
    // Instead we only filter what's DISPLAYED/addable (see isCardAvailable); a
    // card already saved in a deck is preserved even if it's not in the
    // collection (it just won't appear as a selectable tile in the grid).
    // Left button label follows context: "Back to Map" from the overworld HUD,
    // "← Home" from Arcadium / versus / multiplayer entries.
    // A scripted return context names its own destination (the label matters:
    // the loss-path delivery goes back to the BATTLE, not the map).
    backBtn.innerHTML = window.__deckBuilderReturnLabel
      ? window.__deckBuilderReturnLabel
      : window.deckBuilderFromOverworld
        ? '&#8592; Back to Map'
        : '&#8592; Home';
    // A longer back label ("Back to Map") leaves less room for the title.
    if (headerEl) headerEl.classList.toggle('long-back', backBtn.textContent.length > 8);
    resetView();
    renderSlotRow();
    renderControls();
    renderAllGroups();
    updateUI();
    mainEl.scrollTop = 0;
    // Fire the deck-builder tutorial only for the Online Versus entry (self-guards
    // on the per-user "seen" flag + already-active in-game tutorial). It's
    // suppressed in Adventure mode (overworld HUD) — being rebuilt — and removed
    // from Arcadium, which now opens a clean deck builder. multiplayerMode is true
    // only for Versus; the module is left intact so we can re-enable elsewhere later.
    if (window.multiplayerMode && !window.deckBuilderFromOverworld &&
        window.DeckBuilderTutorial && typeof window.DeckBuilderTutorial.startIfNew === 'function') {
      window.DeckBuilderTutorial.startIfNew();
    }
  }

  /* ── Slot row rendering ──────────────────────────────────────── */

  function renderSlotRow() {
    if (!slotRowEl) return;
    slotRowEl.innerHTML = '';
    var active = window.Decks.getActiveSlot();
    for (var slot = 1; slot <= SLOT_COUNT; slot++) {
      slotRowEl.appendChild(buildSlotCard(slot, slot === active));
    }
  }

  function buildSlotCard(slot, isActive) {
    var deck = window.Decks.getDeck(slot);
    var el = document.createElement('div');
    el.className = 'db-slot-card' + (isActive ? ' active' : '');
    el.dataset.slot = String(slot);

    var name = document.createElement('span');
    name.className = 'db-slot-name';
    name.textContent = deck.name;

    var edit = document.createElement('button');
    edit.className = 'db-slot-edit';
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Rename ' + deck.name);
    edit.innerHTML = '✎'; // pencil ✎

    // Whole card switches active slot (except clicks on the pencil)
    el.addEventListener('click', function (e) {
      if (e.target.closest('.db-slot-edit')) return; // pencil handles itself
      switchToSlot(slot);
    });

    // Pencil opens rename modal
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      openRenameModal(slot);
    });

    el.appendChild(name);
    el.appendChild(edit);
    return el;
  }

  function switchToSlot(slot) {
    if (slot === window.Decks.getActiveSlot()) return;
    window.Decks.setActiveSlot(slot);
    // Full re-render so all "selected" / "in-deck" states reflect the new slot
    renderSlotRow();
    renderAllGroups();
    updateUI();
  }

  /* ── Rendering ───────────────────────────────────────────────── */

  /* ── Which cards the builder shows ───────────────────────────── */

  function isHistoryCard(id) {
    var col = window.SOG && SOG.collection;
    return !!(col && col.HISTORY_CARD_IDS && col.HISTORY_CARD_IDS.indexOf(id) !== -1);
  }

  /* Every card the builder lists, as { card, locked }.
       owned (isCardAvailable)  → listed, selectable
       7th-grade history card   → listed ONLY once owned; never shown locked
       any other unowned card   → listed greyed out (locked: true)
       tokens                   → never listed */
  function shownCards() {
    var out = [];
    CARDS.forEach(function (card) {
      if (card.token) return;
      if (isCardAvailable(card)) { out.push({ card: card, locked: false }); return; }
      if (isHistoryCard(card.id)) return;
      out.push({ card: card, locked: true });
    });
    return out;
  }

  /* ── Search, filters and sort ────────────────────────────────── */

  function resetView() {
    view.q = ''; view.types = {}; view.eras = {}; view.sort = 'type'; view.dir = 1;
    if (searchInputEl) searchInputEl.value = '';
    if (searchBoxEl) searchBoxEl.classList.remove('has-text');
  }

  function activeKeys(bag) { return Object.keys(bag).filter(function (k) { return bag[k]; }); }
  function isFiltering() { return !!(view.q || activeKeys(view.types).length || activeKeys(view.eras).length); }

  // Everything the search box looks through for one card.
  function haystack(card) {
    return [card.name, card.abilityName, card.ability, card.type, card.type2,
            card.era, card.civilization, eraGroup(card)]
      .filter(Boolean).join(' ').toLowerCase();
  }

  /* OR inside a category (Military or Religious), AND across categories
     (…and Egypt), AND every word typed in the search box. */
  function matchesView(card) {
    var ts = activeKeys(view.types), es = activeKeys(view.eras);
    if (ts.length && ts.indexOf(card.type) === -1 && ts.indexOf(card.type2) === -1) return false;
    if (es.length && es.indexOf(eraGroup(card)) === -1) return false;
    if (view.q) {
      var h = haystack(card);
      var words = view.q.split(/\s+/);
      for (var i = 0; i < words.length; i++) { if (h.indexOf(words[i]) === -1) return false; }
    }
    return true;
  }

  function sortValue(card, key) { return key === 'type' ? TYPE_ORDER.indexOf(card.type) : card[key]; }
  function sortCards(list) {
    var chain = SORTS.filter(function (x) { return x.key === view.sort; })[0].chain;
    return list.slice().sort(function (a, b) {
      for (var i = 0; i < chain.length; i++) {
        var d = sortValue(a.card, chain[i]) - sortValue(b.card, chain[i]);
        if (d) return i === 0 ? d * view.dir : d;
      }
      return a.card.name.localeCompare(b.card.name);
    });
  }

  function typeColor(type) {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--c-' + type.toLowerCase());
    return (v && v.trim()) || '#d4aa50';
  }

  function buildChip(label, kind, count, bag) {
    var el = document.createElement('div');
    el.className = 'db-chip db-chip-' + kind + (bag[label] ? ' on' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-pressed', bag[label] ? 'true' : 'false');
    if (kind === 'type') el.style.setProperty('--c', typeColor(label));
    var name = document.createElement('span'); name.className = 'db-chip-label'; name.textContent = label;
    var n = document.createElement('span');    n.className = 'db-chip-count';    n.textContent = count;
    el.appendChild(name); el.appendChild(n);
    el.addEventListener('click', function () {
      bag[label] = !bag[label];
      el.classList.toggle('on', !!bag[label]);
      el.setAttribute('aria-pressed', bag[label] ? 'true' : 'false');
      renderAllGroups();
      mainEl.scrollTop = 0;
    });
    return el;
  }

  function paintSort() {
    if (!sortEl) return;
    Array.prototype.forEach.call(sortEl.querySelectorAll('.db-sort-btn'), function (b) {
      var on = b.dataset.key === view.sort;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('.db-sort-arrow').textContent = (on && view.dir < 0) ? '▼' : '▲';
      b.title = on ? (view.dir > 0 ? 'Low to high. Click to reverse.' : 'High to low. Click to reverse.')
                   : 'Sort by ' + b.dataset.label;
    });
  }

  /* Builds the sort buttons and the filter chips. A chip appears only when at
     least one listed card would match it, so a new player is not shown filters
     for cards that are hidden from them. */
  function renderControls() {
    if (!sideEl) return;
    var shown = shownCards();

    sortEl.innerHTML = '';
    SORTS.forEach(function (x) {
      var b = document.createElement('div');
      b.className = 'db-sort-btn';
      b.dataset.key = x.key; b.dataset.label = x.label;
      b.setAttribute('role', 'button');
      var name = document.createElement('span'); name.textContent = x.label;
      var arrow = document.createElement('span'); arrow.className = 'db-sort-arrow';
      b.appendChild(name); b.appendChild(arrow);
      b.addEventListener('click', function () {
        if (view.sort === x.key) view.dir = -view.dir;
        else { view.sort = x.key; view.dir = 1; }
        paintSort();
        renderAllGroups();
        mainEl.scrollTop = 0;
      });
      sortEl.appendChild(b);
    });
    paintSort();

    typeChipsEl.innerHTML = '';
    TYPE_ORDER.forEach(function (t) {
      var n = shown.filter(function (x) { return x.card.type === t || x.card.type2 === t; }).length;
      if (n) typeChipsEl.appendChild(buildChip(t, 'type', n, view.types));
    });
    typeGroupEl.style.display = typeChipsEl.children.length ? '' : 'none';

    eraChipsEl.innerHTML = '';
    ERA_GROUPS.forEach(function (e) {
      var n = shown.filter(function (x) { return eraGroup(x.card) === e; }).length;
      if (n) eraChipsEl.appendChild(buildChip(e, 'era', n, view.eras));
    });
    eraGroupEl.style.display = eraChipsEl.children.length ? '' : 'none';
  }

  function clearFilters() {
    view.q = ''; view.types = {}; view.eras = {};
    searchInputEl.value = '';
    searchBoxEl.classList.remove('has-text');
    renderControls();          // chips hold the old filter bags — rebuild them
    renderAllGroups();
    mainEl.scrollTop = 0;
  }

  function setSearch(text) {
    view.q = String(text || '').trim().toLowerCase();
    searchBoxEl.classList.toggle('has-text', !!searchInputEl.value);
    renderAllGroups();
    mainEl.scrollTop = 0;
  }

  /* ── Rendering ───────────────────────────────────────────────── */

  /* One flat grid: the player's cards first, then (under a heading) the cards
     they have not collected yet, both in the chosen sort order. */
  function renderAllGroups() {
    mainEl.innerHTML = '';
    var all     = shownCards();
    var matched = all.filter(function (x) { return matchesView(x.card); });
    var owned   = sortCards(matched.filter(function (x) { return !x.locked; }));
    var locked  = sortCards(matched.filter(function (x) { return x.locked; }));

    if (matched.length) {
      var grid = document.createElement('div');
      grid.className = 'db-grid';
      owned.forEach(function (x) { grid.appendChild(buildCardEl(x.card, false)); });
      if (locked.length) {
        var divider = document.createElement('div');
        divider.className = 'db-locked-divider';
        divider.textContent = LOCKED_HEADING + ' (' + locked.length + ')';
        grid.appendChild(divider);
        locked.forEach(function (x) { grid.appendChild(buildCardEl(x.card, true)); });
      }
      mainEl.appendChild(grid);
    } else {
      var empty = document.createElement('div');
      empty.className = 'db-empty';
      empty.textContent = 'No cards match. Clear a filter or change the search.';
      mainEl.appendChild(empty);
    }

    renderResultCount(all.length, owned.length, locked.length);
  }

  /* The strip above the grid says what is showing, in words:
       "Egypt or India · Military or Religious · "move" — 3 of 92 cards (1 locked)" */
  function renderResultCount(total, ownedShown, lockedShown) {
    if (sideEl) sideEl.classList.toggle('filtering', isFiltering());
    if (!resultCountEl) return;
    var parts = [];
    if (activeKeys(view.eras).length)  parts.push(activeKeys(view.eras).join(' or '));
    if (activeKeys(view.types).length) parts.push(activeKeys(view.types).join(' or '));
    if (view.q) parts.push('“' + view.q + '”');
    resultCountEl.textContent = '';
    resultCountEl.appendChild(document.createTextNode((parts.length ? parts.join(' · ') : 'All cards') + ' — '));
    var b = document.createElement('b');
    b.textContent = String(ownedShown + lockedShown);
    resultCountEl.appendChild(b);
    resultCountEl.appendChild(document.createTextNode(
      ' of ' + total + ' cards' + (lockedShown ? ' (' + lockedShown + ' locked)' : '')));
  }

  function buildCardEl(card, locked) {
    var el = document.createElement('div');
    el.className = 'db-card type-' + card.type.toLowerCase() +
                   // A locked tile never shows as picked, even if a saved deck
                   // still holds the card (e.g. one built under the dev override).
                   (!locked && isSelected(card.id) ? ' selected' : '') +
                   (locked ? ' db-card-locked' : '');
    el.dataset.id = card.id;

    // Image + overlays
    var imgWrap = document.createElement('div');
    imgWrap.className = 'db-card-img-wrap';

    var ph = document.createElement('div');
    ph.className = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);

    var img = window.buildCardImg(card);
    img.loading  = 'lazy';      // the grid can hold 100+ cards; load art as it scrolls in
    img.decoding = 'async';

    imgWrap.appendChild(ph);
    imgWrap.appendChild(img);

    var ccEl = document.createElement('div');
    ccEl.className = 'db-overlay-cc';
    ccEl.textContent = card.cc;

    var ipEl = document.createElement('div');
    ipEl.className = 'db-overlay-ip';
    ipEl.textContent = card.ip;

    el.appendChild(imgWrap);
    el.appendChild(ccEl);
    el.appendChild(ipEl);

    /* Pick circle (selectable cards only): empty when the card is out of the
       deck, a green check when it is in. One click on it toggles the card —
       the same toggle a double-click on the card performs. It swallows its own
       clicks so they never reach the card's single/double-click handler (no
       popup, no second toggle), and it ignores a click that lands within
       DBLCLICK_MS of the last one, so double-clicking the circle toggles once. */
    if (!locked) {
      var pick = document.createElement('div');
      pick.className = 'db-pick';
      pick.setAttribute('role', 'checkbox');
      paintPick(pick, isSelected(card.id));
      var lastPickAt = 0;
      pick.addEventListener('click', function (e) {
        e.stopPropagation();
        var now = Date.now();
        if (now - lastPickAt < 350) return;
        lastPickAt = now;
        toggleFromCard(el, card);
      });
      pick.addEventListener('dblclick', function (e) { e.stopPropagation(); });
      el.appendChild(pick);
    }

    if (locked) {
      var lockOverlay = document.createElement('div');
      lockOverlay.className = 'db-card-lock-overlay';
      var lockIcon = document.createElement('span');
      lockIcon.className = 'lock-icon';
      lockIcon.textContent = '🔒';
      lockOverlay.appendChild(lockIcon);
      el.appendChild(lockOverlay);
    }

    // Single vs double-click distinction
    var clickTimer = null;
    var DBLCLICK_MS = 350;

    el.addEventListener('click', function () {
      if (locked) {
        openPopup(card, true);
        return;
      }

      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        toggleFromCard(el, card);
      } else {
        clickTimer = setTimeout(function () {
          clickTimer = null;
          openPopup(card);
          if (window.DeckBuilderTutorial &&
              typeof window.DeckBuilderTutorial.notifyCardClick === 'function') {
            window.DeckBuilderTutorial.notifyCardClick(card.id);
          }
        }, DBLCLICK_MS);
      }
    });

    return el;
  }

  /* ── Selection logic ─────────────────────────────────────────── */

  /* The one add/remove path for a tile, shared by the double-click and the
     pick circle: toggle, flash the tile (or the counter when the deck is
     full), and tell the tutorial — its "double-click a card" step advances on
     either gesture. */
  function toggleFromCard(el, card) {
    var wasSelected = isSelected(card.id);
    var ok = toggleCard(card.id);
    if (ok) {
      flashCard(el, !wasSelected);
      if (window.DeckBuilderTutorial &&
          typeof window.DeckBuilderTutorial.notifyCardDblClick === 'function') {
        window.DeckBuilderTutorial.notifyCardDblClick(card.id);
      }
    } else {
      flashCounter();
    }
    return ok;
  }

  function paintPick(pick, on) {
    pick.setAttribute('aria-checked', on ? 'true' : 'false');
    pick.title = on ? 'In deck. Click to remove.' : 'Click to add to deck.';
  }

  /**
   * Adds or removes the card from the active slot.
   * Returns false (and does nothing) when trying to add beyond DECK_SIZE
   * or when the card type is locked.
   */
  function toggleCard(id) {
    // Every displayed card is owned (in the collection), so it's selectable —
    // no Progression type-locks. (Pool is gated by ownership in isCardAvailable.)
    var ok;
    if (isSelected(id)) {
      ok = window.Decks.removeCard(id);
      if (ok) setCardSelected(id, false);
    } else {
      ok = window.Decks.addCard(id);
      if (ok) setCardSelected(id, true);
    }
    if (ok) updateUI();
    return ok;
  }

  function setCardSelected(id, on) {
    var el = mainEl.querySelector('[data-id="' + id + '"]');
    if (!el) return;
    el.classList.toggle('selected', on);
    var pick = el.querySelector('.db-pick');
    if (pick) paintPick(pick, on);
  }

  /* ── Visual feedback ─────────────────────────────────────────── */

  function flashCard(el, wasAdded) {
    var cls = wasAdded ? 'flash-add' : 'flash-remove';
    el.classList.remove('flash-add', 'flash-remove');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 400);
  }

  function flashCounter() {
    counterEl.classList.remove('flash');
    void counterEl.offsetWidth;
    counterEl.classList.add('flash');
    setTimeout(function () { counterEl.classList.remove('flash'); }, 460);
  }

  /* ── UI state ────────────────────────────────────────────────── */

  function updateUI() {
    var count = activeCardCount();
    var size  = deckSize();
    counterEl.textContent = count + ' / ' + size;
    counterEl.classList.toggle('complete', count === size);
    if (window.deckBuilderFromOverworld) {
      // Adventure context: decks are managed here, not played. "Save Decks" is
      // always available (changes already auto-persist); the player leaves via
      // "Back to Map". No "must have N cards" gate.
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Decks';
      if (saveHint) saveHint.style.visibility = 'hidden';
    } else {
      saveBtn.disabled    = count !== size;
      saveBtn.textContent = window.versusStudentMode ? 'Lock In Deck'
                          : window.multiplayerMode    ? 'Enter Lobby'
                          : "Let's Play";
      if (saveHint) saveHint.style.visibility = '';
    }
  }

  /* ── Popup (read-only ability viewer) ────────────────────────── */

  function openPopup(card, isLocked) {
    popupCardId = card.id;
    popupNameEl.textContent = card.name;

    // Header row: type label.
    if (popupTypeEl) {
      if (card.type) {
        var iconCls = TYPE_ICON_CLASS[card.type];
        var iconHTML = iconCls
          ? '<span class="cat-icon cat-icon--' + iconCls + '" aria-hidden="true"></span>'
          : '';
        popupTypeEl.innerHTML =
          iconHTML + '<span class="cat-label">' + card.type.toUpperCase() + '</span>';
        popupTypeEl.style.display = '';
      } else {
        popupTypeEl.style.display = 'none';
      }
    }

    if (card.ability) {
      popupAbilNameEl.textContent = card.abilityName;
      popupAbilNameEl.style.display = '';
      popupAbilTextEl.textContent   = card.ability;
      popupAbilTextEl.className     = 'popup-ability-text';
    } else {
      popupAbilNameEl.style.display = 'none';
      popupAbilTextEl.textContent   = 'No special ability.';
      popupAbilTextEl.className     = 'popup-ability-text vanilla';
    }
    backdropEl.classList.toggle('popup-locked', !!isLocked);
    backdropEl.classList.add('visible');
  }

  function closePopup() {
    backdropEl.classList.remove('visible');
    popupCardId = null;
  }

  /* ── Rename modal ────────────────────────────────────────────── */

  function openRenameModal(slot) {
    var deck = window.Decks.getDeck(slot);
    if (!deck) return;
    renameSlot = slot;
    renameInput.value = deck.name;
    renameCounter.textContent = renameInput.value.length;
    renameBackdrop.classList.add('visible');
    // Focus + select the text on next tick so the popup transition completes
    setTimeout(function () {
      renameInput.focus();
      renameInput.select();
    }, 30);
  }

  function closeRenameModal() {
    renameBackdrop.classList.remove('visible');
    renameSlot = null;
  }

  function commitRename() {
    if (renameSlot === null) return;
    window.Decks.rename(renameSlot, renameInput.value);
    renderSlotRow(); // re-render shows the new name
    closeRenameModal();
  }

  /* ── Persistence (now thin — Decks owns it) ──────────────────── */

  // Deck-select background music (Howler for reliable cross-browser playback)
  var _deckHowl = null;
  // Mutable live volume — read from localStorage on Howl creation
  // (sog_music_volume) and updated by the global music widget. Bug 14.
  var _deckMusicVolLive = 0.8;

  function getDeckMusic() {
    // Apply any persisted volume before creating the Howl (bug 14).
    var storedVol = parseInt(localStorage.getItem('sog_music_volume'), 10);
    if (!isNaN(storedVol)) {
      _deckMusicVolLive = Math.max(0, Math.min(100, storedVol)) / 100;
    }
    if (!_deckHowl && typeof Howl !== 'undefined') {
      _deckHowl = new Howl({
        src:    ['music/dozingoffselect.mp3'],
        volume: _deckMusicVolLive,
        loop:   false,
        html5:  true
      });
    }
    return _deckHowl;
  }

  function playDeckMusic(fadeMs) {
    var m = getDeckMusic();
    if (!m) return;
    if (!m.playing()) {
      m.seek(0);
      if (typeof fadeMs === 'number' && fadeMs > 0) {
        m.volume(0);
        m.play();
        m.fade(0, _deckMusicVolLive, fadeMs);
      } else {
        m.play();
      }
    }
  }

  function stopDeckMusic() {
    if (_deckHowl && _deckHowl.playing()) { _deckHowl.stop(); }
  }

  /* ── Music widget integration (bug 14) ───────────────────────── */
  function pauseDeckMusic() {
    if (!_deckHowl || !_deckHowl.playing()) return;
    _deckHowl.pause();
  }
  function resumeDeckMusic() {
    var m = getDeckMusic();
    if (!m) return;
    if (!m.playing()) m.play();
  }
  function toggleDeckMusic() {
    if (!_deckHowl || !_deckHowl.playing()) resumeDeckMusic();
    else pauseDeckMusic();
  }
  function setDeckMusicVolume(vol) {
    _deckMusicVolLive = vol;
    if (_deckHowl) _deckHowl.volume(vol);
  }

  /* ── Difficulty modal ────────────────────────────────────────── */

  var diffBackdropEl = document.getElementById('difficulty-backdrop');

  function openDifficultyModal() {
    // Adventure context: this button is "Save Decks", not "Let's Play".
    // Deck mutations already auto-persist via the Decks API, so this is an
    // explicit confirmation — flash feedback and stay in the builder.
    if (window.deckBuilderFromOverworld) {
      var prev = saveBtn.textContent;
      saveBtn.textContent = 'Saved ✓';
      saveBtn.classList.add('db-saved-flash');
      setTimeout(function () {
        saveBtn.classList.remove('db-saved-flash');
        // updateUI restores the correct label ("Save Decks") for the context.
        updateUI();
      }, 1000);
      return;
    }
    if (activeCardCount() !== deckSize()) return;
    // Notify the deck-builder tutorial that a real Let's Play happened
    // with a complete deck. The tutorial marks completion here — clicking
    // disabled or partial-deck has already been filtered above.
    if (window.DeckBuilderTutorial &&
        typeof window.DeckBuilderTutorial.notifyLetsPlay === 'function') {
      window.DeckBuilderTutorial.notifyLetsPlay(activeCardCount());
    }
    // Adventure Mode: route Let's Play to the battle named by the flag.
    // Future battles reuse the same flag with different values ('sargon', …).
    var advTarget = window.adventureBattleTarget;
    if (advTarget) {
      window.adventureBattleTarget = null;
      if (advTarget === 'gilgamesh') {
        stopDeckMusic();
        var gb = window.SOG && window.SOG.GilgameshBattle;
        if (gb && typeof gb.start === 'function') {
          gb.start();
        } else {
          console.warn('[DeckBuilder] SOG.GilgameshBattle not found — cannot start battle');
        }
        return;
      }
      // Unknown target (not yet wired) — defensive fall-through to Arcadium.
      console.warn('[DeckBuilder] Unknown adventureBattleTarget "' + advTarget + '" — falling back to Arcadium flow');
    }
    if (window.versusStudentMode) {
      stopDeckMusic();
      if (window.BattleLobby && typeof window.BattleLobby.onLockInDeck === 'function') {
        window.BattleLobby.onLockInDeck(activeCards());
      }
      return;
    }
    if (window.multiplayerMode) {
      stopDeckMusic();
      if (window.Multiplayer && typeof window.Multiplayer.showLobbyEntry === 'function') {
        window.Multiplayer.showLobbyEntry();
      }
      return;
    }
    diffBackdropEl.classList.add('visible');
  }

  function chooseDifficulty(difficulty) {
    diffBackdropEl.classList.remove('visible');
    window.aiDifficulty = difficulty;
    stopDeckMusic();
    showScreen('screen-battle');
    if (typeof initGame === 'function') initGame();
  }

  document.getElementById('btn-difficulty-easy').addEventListener('click', function () {
    chooseDifficulty('easy');
  });
  document.getElementById('btn-difficulty-hard').addEventListener('click', function () {
    chooseDifficulty('hard');
  });
  diffBackdropEl.addEventListener('click', function (e) {
    if (e.target === diffBackdropEl) diffBackdropEl.classList.remove('visible');
  });

  /* ── Event wiring ────────────────────────────────────────────── */

  popupCloseBtn.addEventListener('click', closePopup);
  backdropEl.addEventListener('click', function (e) {
    if (e.target === backdropEl) closePopup();
  });

  // Search / filter wiring
  if (searchInputEl) {
    searchInputEl.addEventListener('input', function () { setSearch(searchInputEl.value); });
    searchInputEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();                 // Escape here clears the search, nothing else
      searchInputEl.value = '';
      setSearch('');
    });
    searchClearEl.addEventListener('click', function () {
      searchInputEl.value = '';
      setSearch('');
      searchInputEl.focus();
    });
    clearFiltersEl.addEventListener('click', clearFilters);
  }

  // Rename modal wiring
  renameSaveBtn.addEventListener('click', commitRename);
  renameCancelBtn.addEventListener('click', closeRenameModal);
  renameBackdrop.addEventListener('click', function (e) {
    if (e.target === renameBackdrop) closeRenameModal();
  });
  renameInput.addEventListener('input', function () {
    renameCounter.textContent = renameInput.value.length;
  });
  renameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')      { e.preventDefault(); commitRename(); }
    else if (e.key === 'Escape'){ e.preventDefault(); closeRenameModal(); }
  });

  // Global Escape — close whichever popup is open
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (renameBackdrop.classList.contains('visible')) closeRenameModal();
    else if (popupCardId !== null) closePopup();
  });

  saveBtn.addEventListener('click', openDifficultyModal);
  backBtn.addEventListener('click', function () {
    if (window.DeckBuilderTutorial && typeof window.DeckBuilderTutorial.notifyExit === 'function') {
      window.DeckBuilderTutorial.notifyExit();
    }
    /* Explicit one-shot return context, checked FIRST because it is the only
       caller-supplied destination — everything below infers where to go from
       sticky mode flags, which cannot distinguish "opened mid-battle" from
       "opened from the map". A scripted beat that opens the builder sets
       window.__deckBuilderReturn to the function that resumes it (see
       Overworld.openDeckBuilderThen). Cleared before invoking so an exception
       in the callback can't strand the flag and hijack the next plain exit. */
    if (typeof window.__deckBuilderReturn === 'function') {
      var _resume = window.__deckBuilderReturn;
      window.__deckBuilderReturn = null;
      window.__deckBuilderReturnLabel = null;
      window.deckBuilderFromOverworld = false;
      stopDeckMusic();
      if (window.SOG && window.SOG.HUD && typeof window.SOG.HUD.refreshDecks === 'function') {
        window.SOG.HUD.refreshDecks();
      }
      _resume();
      return;
    }
    // Adventure (overworld HUD) context: "Back to Map" returns the player to the
    // overworld where they were. The currently-open (active) deck is already the
    // carried deck — refreshing the HUD shows its name on the deck card-back.
    if (window.deckBuilderFromOverworld) {
      window.deckBuilderFromOverworld = false;
      stopDeckMusic();
      showScreen('screen-overworld');
      if (window.SOG && window.SOG.HUD && typeof window.SOG.HUD.refreshDecks === 'function') {
        window.SOG.HUD.refreshDecks();
      }
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
      return;
    }
    // Adventure Mode: Back returns to the Mesopotamia overworld (player can
    // re-click Walls of Uruk to re-enter the battle path).
    if (window.adventureBattleTarget) {
      window.adventureBattleTarget = null;
      stopDeckMusic();
      showScreen('screen-overworld');
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
      return;
    }
    stopDeckMusic();
    showScreen('screen-home');
    if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') {
      window.HomeFlow.reset();   // re-sync home-state (btn-account opacity/display, etc.)
    }
    if (window.HomeFlow && typeof window.HomeFlow.playMusic === 'function') {
      window.HomeFlow.playMusic();
    }
  });

  // Export so tutorial.js can re-enter the deck builder after tutorial ends
  window.initDeckBuilder = initDeckBuilder;

  // Expose deck music so HomeFlow can start it when routing to the deck builder
  window.playDeckMusic = playDeckMusic;
  // Bug 14: expose toggle + volume setter for the global music widget.
  window.toggleDeckMusic    = toggleDeckMusic;
  window.setDeckMusicVolume = setDeckMusicVolume;

  // "About the Game" — open the About screen, no music change
  var btnAbout = document.getElementById('btn-about');
  if (btnAbout) {
    btnAbout.addEventListener('click', function () {
      showScreen('screen-about');
      var aboutMain = document.querySelector('#screen-about .about-main');
      if (aboutMain) aboutMain.scrollTop = 0;
    });
  }
  var btnAboutBack = document.getElementById('about-back');
  if (btnAboutBack) {
    btnAboutBack.addEventListener('click', function () {
      showScreen('screen-home');
      if (window.HomeFlow && typeof window.HomeFlow.reset === 'function') {
        window.HomeFlow.reset();   // re-sync home-state (btn-account opacity/display, etc.)
      }
      if (window.HomeFlow && typeof window.HomeFlow.playMusic === 'function') {
        window.HomeFlow.playMusic();
      }
    });
  }

  document.getElementById('btn-learn').addEventListener('click', function () {
    window.multiplayerMode = false;
    localStorage.removeItem('sog_tutorial_complete');
    // Silence the home-screen music before the tutorial intro begins
    if (window.HomeFlow && typeof window.HomeFlow.stopMusic === 'function') {
      window.HomeFlow.stopMusic(500);
    }
    if (typeof window.startHomeIntro === 'function') {
      window.startHomeIntro(function () {
        var video = document.getElementById('intro-video');
        video.currentTime = 0;
        video.play().catch(function () {});
        showScreen('screen-video');
      });
    }
  });

  // Video ended → matchup screen → battle + tutorial
  // (Skipped when HomeFlow is playing the video for the Adventure path,
  //  signaled via window._adventureVideoMode.)
  document.getElementById('intro-video').addEventListener('ended', function () {
    if (window._adventureVideoMode) return;
    if (typeof window.showMatchupScreen === 'function') {
      window.showMatchupScreen(function () {
        showScreen('screen-battle');
        if (typeof window.startTutorial === 'function') window.startTutorial();
      });
    } else {
      showScreen('screen-battle');
      if (typeof window.startTutorial === 'function') window.startTutorial();
    }
  });

  document.getElementById('coming-soon-close').addEventListener('click', function () {
    document.getElementById('coming-soon-backdrop').classList.remove('visible');
  });

  document.getElementById('coming-soon-backdrop').addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('visible');
  });

  // Page always lands on the home screen (the HTML default is
  // <div id="screen-home" class="screen active">). Returning players
  // still skip the Lucy intro + video — that's handled inside the
  // "I'm Ready" handler via the sog_tutorial_complete flag — but the
  // initial landing is now always Home, regardless of prior progress.

})();

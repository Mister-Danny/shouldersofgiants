/**
 * deckbuilder.js
 * Shoulders of Giants — Deck Builder Module
 *
 * Multi-deck support:
 *   The active deck is whichever slot is currently selected in
 *   window.Decks. All add/remove/rename operations auto-save through
 *   that module — there is no Save button.
 *
 * Card interactions:
 *   Single click  → opens read-only ability popup
 *   Double click  → toggles card in/out of active slot's deck
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

  /* ── State ───────────────────────────────────────────────────── */
  var popupCardId = null;       // ID of card currently shown in popup
  var renameSlot  = null;       // slot currently being renamed (1/2/3)

  /* ── DOM refs ────────────────────────────────────────────────── */
  var mainEl    = document.getElementById('db-main');
  var counterEl = document.getElementById('db-counter');
  var saveBtn   = document.getElementById('db-save');
  var saveHint  = document.getElementById('db-save-hint');
  var backBtn   = document.getElementById('db-back');
  var slotRowEl = document.getElementById('db-slot-row');

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

  /* UNIFIED POOL — every context (Arcadium, multiplayer, adventure): the deck
     builder offers ONLY the cards the player has collected (SOG.collection).
     Adventure Mode is the only way to gain cards, so Arcadium/multiplayer build
     from that same owned-card collection — there is no longer an "Arcadium full
     pool vs adventure pool" distinction, and no Progression type-locks (owning a
     card IS the gate now). Battle/AI/challenge decks source cards elsewhere
     (e.g. game.js buildAiDeck, fixed adventure-battle decks) and are unaffected. */
  function isCardAvailable(card) {
    return !!card && isCardUnlocked(card.id);
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
    backBtn.innerHTML = window.deckBuilderFromOverworld
      ? '&#8592; Back to Map'
      : '&#8592; Home';
    renderSlotRow();
    renderAllGroups();
    updateUI();
    mainEl.scrollTop = 0;
    // Fire the deck-builder tutorial if the user hasn't completed it yet.
    // Self-guards on already-active in-game tutorial.
    // NOTE: suppressed in Adventure mode (opened from the overworld HUD) — the
    // adventure deck-builder tutorial is being rebuilt; the module is left intact
    // so other entry points keep working and we can re-enable it here later.
    if (!window.deckBuilderFromOverworld &&
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

  function renderAllGroups() {
    mainEl.innerHTML = '';
    renderCardGroups();
  }

  /* Single unified layout for every context: the collection grouped by type,
     in TYPE_ORDER. No Progression type-locks — every shown card is owned, so
     every shown card is selectable. */
  function renderCardGroups() {
    TYPE_ORDER.forEach(function (type) {
      var cards = CARDS.filter(function (c) { return c.type === type && isCardAvailable(c); });
      // Empty groups never render.
      if (!cards.length) return;

      var section = document.createElement('section');
      section.className = 'db-type-group type-' + type.toLowerCase();

      var header = document.createElement('div');
      header.className = 'db-type-header';
      header.innerHTML =
        '<div class="db-type-pip"></div>' +
        '<span class="db-type-label">' + type + '</span>' +
        '<span class="db-type-count">(' + cards.length + ')</span>';

      var row = document.createElement('div');
      row.className = 'db-card-row';
      cards.forEach(function (card) { row.appendChild(buildCardEl(card, false)); });

      section.appendChild(header);
      section.appendChild(row);
      mainEl.appendChild(section);
    });
  }

  function buildCardEl(card, locked) {
    var el = document.createElement('div');
    el.className = 'db-card type-' + card.type.toLowerCase() +
                   (isSelected(card.id) ? ' selected' : '') +
                   (locked ? ' db-card-locked' : '');
    el.dataset.id = card.id;

    // Image + overlays
    var imgWrap = document.createElement('div');
    imgWrap.className = 'db-card-img-wrap';

    var ph = document.createElement('div');
    ph.className = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);

    var img = window.buildCardImg(card);

    imgWrap.appendChild(ph);
    imgWrap.appendChild(img);

    var ccEl = document.createElement('div');
    ccEl.className = 'db-overlay-cc';
    ccEl.textContent = card.cc;

    var ipEl = document.createElement('div');
    ipEl.className = 'db-overlay-ip';
    ipEl.textContent = card.ip;

    var badge = document.createElement('div');
    badge.className = 'db-card-in-deck';
    badge.textContent = 'IN DECK';

    el.appendChild(imgWrap);
    el.appendChild(ccEl);
    el.appendChild(ipEl);
    el.appendChild(badge);

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
    if (el) el.classList.toggle('selected', on);
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
  var _deckMusicVolLive = 0.5;

  function getDeckMusic() {
    // Apply any persisted volume before creating the Howl (bug 14).
    var storedVol = parseInt(localStorage.getItem('sog_music_volume'), 10);
    if (!isNaN(storedVol)) {
      _deckMusicVolLive = Math.max(0, Math.min(100, storedVol)) / 100;
    }
    if (!_deckHowl && typeof Howl !== 'undefined') {
      _deckHowl = new Howl({
        src:    ['music/Dozing Off Card Select.m4a'],
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

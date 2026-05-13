/**
 * game/ui.js — Shoulders of Giants · Battle-screen UI helpers
 *
 * Pure display/feedback helpers that read game state but don't mutate it.
 * Responsibilities:
 *   • Background music playlist + control widget
 *   • Battle card info popup (open/close + IP breakdown text)
 *   • Opponent hand display (deck count + face-down card backs)
 *   • Small visual feedback (flashScore, flashDeny, showIPFloat)
 *
 * Reads:  SOG.state.G
 * Calls:  SOG.game.{ effectiveIP, findSlotEl }
 * Exposes: SOG.ui.{ openBattlePopup, updateOppHand, showIPFloat,
 *                   flashScore, flashDeny, startBgMusic, stopBgMusic }
 *          window.openBattlePopup (preserved for legacy compat)
 *
 * NOTE: Extracted from game.js as part of the "split game.js" refactor
 * (Pass 2). Behavior is unchanged.
 */

(function () {
  'use strict';

  var G       = SOG.state.G;
  var helpers = SOG.game;

  /* ═══════════════════════════════════════════════════════════════
     DOM refs (queried at module load; index.html guarantees ui.js
     loads after the battle/music DOM exists)
  ═══════════════════════════════════════════════════════════════ */

  var battlePopupEl        = document.getElementById('battle-popup-backdrop');
  var battlePopupNameEl    = document.getElementById('battle-popup-name');
  var battlePopupTypeEl    = document.getElementById('battle-popup-type');
  var battlePopupAbilNmEl  = document.getElementById('battle-popup-ability-name');
  var battlePopupAbilTxEl  = document.getElementById('battle-popup-ability-text');
  var battlePopupIPBrkEl   = document.getElementById('battle-popup-ip-breakdown');
  var battlePopupHintEl    = document.getElementById('battle-popup-hint');
  var battlePopupCloseBtn  = document.getElementById('battle-popup-close');
  var oppHandEl            = document.getElementById('battle-opp-hand');

  /* ═══════════════════════════════════════════════════════════════
     BACKGROUND MUSIC PLAYLIST
  ═══════════════════════════════════════════════════════════════ */

  var _musicTracks = [
    { src: 'music/Cupids Revenge.mp3',     name: 'Cupids Revenge — Kevin MacLeod' },
    { src: 'music/Crossing the Chasm.mp3', name: 'Crossing the Chasm — Kevin MacLeod' },
    { src: 'music/Mountain Emperor.mp3',   name: 'Mountain Emperor — Kevin MacLeod' }
  ];
  var _musicIdx   = 0;
  var _musicHowl  = null;
  var _bgMusicVol = 0.10;  // persists across Play Again

  function _musicUpdateUI() {
    var nameEl  = document.getElementById('music-track-name');
    var playBtn = document.getElementById('music-play-btn');
    if (nameEl)  nameEl.textContent  = _musicTracks[_musicIdx].name;
    if (playBtn) playBtn.textContent = (_musicHowl && _musicHowl.playing()) ? '\u258c\u258c' : '\u25b6';
  }

  function _musicLoadTrack(idx, autoplay) {
    if (_musicHowl) { _musicHowl.stop(); _musicHowl.unload(); _musicHowl = null; }
    _musicIdx = ((idx % _musicTracks.length) + _musicTracks.length) % _musicTracks.length;
    if (typeof Howl === 'undefined') { _musicUpdateUI(); return; }
    _musicHowl = new Howl({
      src:    [_musicTracks[_musicIdx].src],
      volume: _bgMusicVol,
      html5:  true,
      onend:  function () { _musicLoadTrack(_musicIdx + 1, true); },
      onplay: function () { _musicUpdateUI(); },
      onpause: function () { _musicUpdateUI(); },
      onstop: function () { _musicUpdateUI(); }
    });
    if (autoplay) _musicHowl.play();
    _musicUpdateUI();
  }

  function startBgMusic() {
    _musicLoadTrack(0, true);
  }

  function stopBgMusic() {
    if (_musicHowl) { _musicHowl.stop(); _musicHowl.unload(); _musicHowl = null; }
    _musicUpdateUI();
  }

  /* ── Music control widget (prev/play/next/volume buttons) ───── */
  (function () {
    var prevBtn = document.getElementById('music-prev-btn');
    var playBtn = document.getElementById('music-play-btn');
    var nextBtn = document.getElementById('music-next-btn');
    var slider  = document.getElementById('music-volume-slider');
    if (!prevBtn || !playBtn || !nextBtn || !slider) return;

    slider.value = Math.round(_bgMusicVol * 100);

    prevBtn.addEventListener('click', function () {
      _musicLoadTrack(_musicIdx - 1, true);
    });

    playBtn.addEventListener('click', function () {
      if (!_musicHowl) { _musicLoadTrack(_musicIdx, true); return; }
      if (_musicHowl.playing()) {
        _musicHowl.pause();
      } else {
        _musicHowl.volume(_bgMusicVol);
        _musicHowl.play();
      }
      _musicUpdateUI();
    });

    nextBtn.addEventListener('click', function () {
      _musicLoadTrack(_musicIdx + 1, true);
    });

    slider.addEventListener('input', function () {
      _bgMusicVol = parseInt(slider.value, 10) / 100;
      if (_musicHowl) _musicHowl.volume(_bgMusicVol);
    });
  }());

  /* ═══════════════════════════════════════════════════════════════
     BATTLE CARD INFO POPUP
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Build the human-readable IP breakdown line shown in the battle popup.
   * Lists Base IP, each permanent modifier source, any continuous modifiers
   * derived from current board state (Juvenal/Voltaire/William), and total.
   */
  function buildIPBreakdown(sd, owner) {
    var parts = ['Base IP: ' + sd.ip];

    // Permanent modifier sources (tracked per-card)
    if (sd.ipModSources && sd.ipModSources.length > 0) {
      sd.ipModSources.forEach(function (entry) {
        parts.push(entry.source + ': ' + (entry.delta >= 0 ? '+' : '') + entry.delta);
      });
    } else if (sd.ipMod) {
      parts.push('Bonus: ' + (sd.ipMod > 0 ? '+' : '') + sd.ipMod);
    }

    // Continuous modifier labels derived from current board state
    var slots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    var locId  = null;
    G.locations.forEach(function (loc) {
      slots[loc.id].forEach(function (s) { if (s && s.cardId === sd.cardId) locId = loc.id; });
    });

    if (locId !== null) {
      var card = CARDS.find(function (c) { return c.id === sd.cardId; });

      // Juvenal (id 18): -2 to CC≥4 cards at this location (either side)
      var juvenalHere = ['player', 'opp'].some(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        return sl[locId].some(function (s) { return s && s.revealed && s.cardId === 18; });
      });
      if (juvenalHere && card && card.cc >= 4) parts.push('Juvenal: -2');

      // Voltaire (id 20): +4 if sole revealed card for this owner
      var ownerRev = slots[locId].filter(function (s) { return s && s.revealed; });
      if (ownerRev.length === 1 && sd.cardId === 20) parts.push('Voltaire (Candide): +4');

      // William the Conqueror (id 15): contMod equals total destroyed IP
      if (sd.cardId === 15) {
        var dt = owner === 'player' ? G.destroyedIPTotal : G.aiDestroyedIPTotal;
        if (dt > 0) parts.push('William: +' + dt);
      }
    }

    parts.push('Total: ' + helpers.effectiveIP(sd));
    return parts.join('  |  ');
  }

  // Per-category modifier class for the icon span. The actual PNG mask
  // is wired in CSS (.cat-icon--<class>); CSS mask + currentColor ensures
  // the symbol renders in the same paler-gold as the label text on every
  // platform, with no per-category tinting.
  // Note: Political's filename is "politcal.png" (typo preserved).
  // No PNG exists yet for Scientific; that key falls through and renders
  // the label without a symbol prefix until the asset lands.
  var TYPE_ICON_CLASS = {
    Political:   'political',
    Religious:   'religious',
    Military:    'military',
    Cultural:    'cultural',
    Exploration: 'exploration'
  };

  /**
   * Open the battle card info popup.
   * @param {object} card      Card data from CARDS array
   * @param {object} [sd]      Slot data (for revealed board cards — shows IP breakdown)
   * @param {string} [owner]   'player' | 'opp' (required when sd is provided)
   * @param {boolean} [isBoard] True when called from a board slot (changes hint text)
   */
  function openBattlePopup(card, sd, owner, isBoard) {
    battlePopupNameEl.textContent = card.name;

    // Category-type label. Single-type for now; when card.type2 ships,
    // render both here (icon + "RELIGIOUS · MILITARY") rather than per-card.
    if (battlePopupTypeEl) {
      if (card.type) {
        var iconCls = TYPE_ICON_CLASS[card.type];
        var iconHTML = iconCls
          ? '<span class="cat-icon cat-icon--' + iconCls + '" aria-hidden="true"></span>'
          : '';
        battlePopupTypeEl.innerHTML =
          iconHTML + '<span class="cat-label">' + card.type.toUpperCase() + '</span>';
        battlePopupTypeEl.style.display = '';
      } else {
        battlePopupTypeEl.style.display = 'none';
      }
    }

    if (sd && battlePopupIPBrkEl) {
      battlePopupIPBrkEl.textContent = buildIPBreakdown(sd, owner);
      battlePopupIPBrkEl.style.display = '';
    } else if (battlePopupIPBrkEl) {
      battlePopupIPBrkEl.style.display = 'none';
    }

    if (battlePopupHintEl) {
      battlePopupHintEl.textContent = isBoard ? 'CLICK CARD FOR INFO' : 'DRAG CARD TO A SLOT TO PLAY';
    }

    if (card.ability) {
      battlePopupAbilNmEl.textContent   = card.abilityName;
      battlePopupAbilNmEl.style.display = '';
      battlePopupAbilTxEl.textContent   = card.ability;
      battlePopupAbilTxEl.className     = 'popup-ability-text';
    } else {
      battlePopupAbilNmEl.style.display = 'none';
      battlePopupAbilTxEl.textContent   = 'No special ability.';
      battlePopupAbilTxEl.className     = 'popup-ability-text vanilla';
    }
    battlePopupEl.classList.add('visible');
  }

  function closeBattlePopup() { battlePopupEl.classList.remove('visible'); }

  battlePopupCloseBtn.addEventListener('click', closeBattlePopup);
  battlePopupEl.addEventListener('click', function (e) { if (e.target === battlePopupEl) closeBattlePopup(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBattlePopup(); });

  /* ═══════════════════════════════════════════════════════════════
     OPPONENT HAND DISPLAY
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Rebuild the opponent hand display to match the actual AI hand count + deck count.
   */
  function updateOppHand() {
    if (!oppHandEl) return;
    oppHandEl.innerHTML = '';

    var pile = document.createElement('div');
    pile.className = 'battle-deck-pile';
    var lbl = document.createElement('div');
    lbl.className = 'battle-deck-label';
    lbl.textContent = 'DECK';
    pile.appendChild(lbl);
    var cnt = document.createElement('div');
    cnt.className = 'battle-deck-count';
    cnt.textContent = G.aiDeck.length;
    pile.appendChild(cnt);
    oppHandEl.appendChild(pile);

    var sep = document.createElement('div');
    sep.className = 'battle-hand-sep';
    oppHandEl.appendChild(sep);

    for (var i = 0; i < G.aiHand.length; i++) {
      var back = document.createElement('div');
      back.className = 'battle-card-back';
      oppHandEl.appendChild(back);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     VISUAL FEEDBACK HELPERS
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Show a floating +/- number on a board slot and play the IP sound.
   * Safe to call speculatively — silently skips if element not found.
   */
  function showIPFloat(owner, cardId, delta) {
    if (delta === 0) return;
    var slotEl = helpers.findSlotEl(owner, cardId);
    if (slotEl && typeof Anim !== 'undefined') Anim.floatNumber(slotEl, delta);
    if (typeof SFX !== 'undefined') {
      if (delta > 0) SFX.ipGained();
      else           SFX.ipLost();
    }
  }

  /** Brief animated pulse on a location-score number when it changes. */
  function flashScore(el) {
    el.classList.remove('score-pop');
    void el.offsetWidth;
    el.classList.add('score-pop');
    setTimeout(function () { el.classList.remove('score-pop'); }, 350);
  }

  /** Red flash on a slot/element to indicate a denied/illegal action. */
  function flashDeny(el) {
    el.classList.remove('flash-deny');
    void el.offsetWidth;
    el.classList.add('flash-deny');
    setTimeout(function () { el.classList.remove('flash-deny'); }, 400);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.ui = {
    openBattlePopup: openBattlePopup,
    updateOppHand:   updateOppHand,
    showIPFloat:     showIPFloat,
    flashScore:      flashScore,
    flashDeny:       flashDeny,
    startBgMusic:    startBgMusic,
    stopBgMusic:     stopBgMusic
  };

  // Legacy global export — preserved for backwards compat. Nothing
  // currently calls window.openBattlePopup from outside game.js, but
  // game.js was exporting it, so we preserve the surface.
  window.openBattlePopup = openBattlePopup;

})();

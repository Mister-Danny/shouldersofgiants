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
    // Notify HUD to refresh its compact play button (Phase H1)
    var hudMusic = window.SOG && window.SOG.music;
    if (hudMusic && typeof hudMusic.onUpdate === 'function') hudMusic.onUpdate();
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

  /* ── Music control widget (shared across home / deckbuilder / battle) ──
     Volume is the single source of truth: localStorage('sog_music_volume') in
     percent (0-100). Play/Pause routes to the current screen's audio source
     via body.dataset.screen. Prev/Next are battle-only (CSS hides them on
     other screens, but the click handlers are no-ops outside battle anyway). */
  (function () {
    var prevBtn = document.getElementById('music-prev-btn');
    var playBtn = document.getElementById('music-play-btn');
    var nextBtn = document.getElementById('music-next-btn');
    var slider  = document.getElementById('music-volume-slider');
    if (!prevBtn || !playBtn || !nextBtn || !slider) return;

    // Read persisted volume; fallback to 10%
    var stored = parseInt(localStorage.getItem('sog_music_volume'), 10);
    var initialPct = isNaN(stored) ? 10 : Math.max(0, Math.min(100, stored));
    _bgMusicVol = initialPct / 100;
    slider.value = initialPct;

    // Helper: apply current volume to whichever audio sources exist
    function applyVolumeToAll() {
      if (_musicHowl) _musicHowl.volume(_bgMusicVol);
      if (typeof window.setHomeMusicVolume === 'function') window.setHomeMusicVolume(_bgMusicVol);
      if (typeof window.setDeckMusicVolume === 'function') window.setDeckMusicVolume(_bgMusicVol);
    }

    // Helper: route play/pause by current screen
    function togglePlayPauseForCurrentScreen() {
      var screen = document.body.dataset.screen;
      if (screen === 'battle') {
        if (!_musicHowl) { _musicLoadTrack(_musicIdx, true); return; }
        if (_musicHowl.playing()) _musicHowl.pause();
        else { _musicHowl.volume(_bgMusicVol); _musicHowl.play(); }
        _musicUpdateUI();
      } else if (screen === 'home') {
        if (window.HomeFlow && typeof window.HomeFlow.toggleMusic === 'function') {
          window.HomeFlow.toggleMusic();
        }
        _musicUpdateUI();
      } else if (screen === 'deckbuilder') {
        if (typeof window.toggleDeckMusic === 'function') {
          window.toggleDeckMusic();
        }
        _musicUpdateUI();
      } else if (screen === 'overworld') {
        // Adventure Mode overworld — route to the shared _musicHowl playlist
        if (!_musicHowl) { _musicLoadTrack(_musicIdx, true); return; }
        if (_musicHowl.playing()) _musicHowl.pause();
        else { _musicHowl.volume(_bgMusicVol); _musicHowl.play(); }
        _musicUpdateUI();
      }
      // Other screens (about, result, video, etc.) don't have music
    }

    prevBtn.addEventListener('click', function () { _musicLoadTrack(_musicIdx - 1, true); });
    playBtn.addEventListener('click', togglePlayPauseForCurrentScreen);
    nextBtn.addEventListener('click', function () { _musicLoadTrack(_musicIdx + 1, true); });

    slider.addEventListener('input', function () {
      _bgMusicVol = parseInt(slider.value, 10) / 100;
      localStorage.setItem('sog_music_volume', slider.value);
      applyVolumeToAll();
    });

    /* ── SOG.music — public API consumed by HUD and future modules ──
       Defined inside this IIFE so it has closure access to
       applyVolumeToAll, togglePlayPauseForCurrentScreen, and the
       private music state variables. Phase H1. */
    window.SOG = window.SOG || {};
    SOG.music = {
      /** Toggle play/pause for the current screen's audio source. */
      toggle: function () { togglePlayPauseForCurrentScreen(); },

      /**
       * Set volume (0–100 integer). Updates localStorage, all active
       * Howl sources, and keeps the floating widget slider in sync.
       */
      setVolume: function (pct) {
        var v = Math.max(0, Math.min(100, Math.round(pct)));
        _bgMusicVol = v / 100;
        localStorage.setItem('sog_music_volume', String(v));
        slider.value = v;
        applyVolumeToAll();
        _musicUpdateUI();
      },

      /** Return current volume as integer 0–100. */
      getVolume: function () { return Math.round(_bgMusicVol * 100); },

      /** Return true if the shared music Howl is currently playing. */
      isPlaying: function () { return !!(_musicHowl && _musicHowl.playing()); },

      /**
       * Return the current track's display metadata.
       * The track name field uses the convention "Title — Artist".
       * @returns {{ title: string, artist: string, full: string }}
       */
      getCurrentTrack: function () {
        var t = _musicTracks[_musicIdx];
        if (!t) return { title: '—', artist: '', full: '—' };
        // Split on " — " (em-dash with spaces) to separate title from attribution
        var sep   = t.name.indexOf(' — ');
        var title  = sep !== -1 ? t.name.slice(0, sep) : t.name;
        var artist = sep !== -1 ? t.name.slice(sep + 3) : '';
        return { title: title, artist: artist, full: t.name };
      },

      /**
       * Callback invoked by _musicUpdateUI whenever play state changes.
       * Set by SOG.HUD to refresh its compact play/pause button icon.
       */
      onUpdate: null
    };
  }());

  /* ═══════════════════════════════════════════════════════════════
     IMAGE CACHES — built once at module load
     _cardById:     id → { image, name }
     _locationById: id → { image, thumbnailCrop }
     _cardNameToImage: name → image  (legacy fallback only)
  ═══════════════════════════════════════════════════════════════ */

  var _cardById     = {};
  var _locationById = {};
  var _cardNameToImage = {};

  (function () {
    if (typeof CARDS !== 'undefined') {
      CARDS.forEach(function (c) {
        _cardById[c.id]          = { image: c.image, name: c.name };
        _cardNameToImage[c.name] = c.image;
      });
    }
    if (typeof LOCATIONS !== 'undefined') {
      LOCATIONS.forEach(function (l) {
        _locationById[l.id] = { image: l.image, thumbnailCrop: l.thumbnailCrop || null };
      });
    }
  }());

  /**
   * Build the thumbnail HTML for a bonus source.
   * @param {string}      sourceType  'card' | 'location' | 'unknown'
   * @param {number|null} sourceId    Card or location id
   * @param {object|null} [crop]      { bgSize, bgPos } — overrides location's thumbnailCrop
   */
  function _thumbHTML(sourceType, sourceId, crop) {
    if (sourceType === 'card' && sourceId != null && _cardById[sourceId]) {
      var safePath = _cardById[sourceId].image.replace(/'/g, '%27');
      return '<div class="ip-thumb" style="background-image:url(\'' + safePath + '\')" aria-hidden="true"></div>';
    }
    if (sourceType === 'location' && sourceId != null && _locationById[sourceId]) {
      var locData  = _locationById[sourceId];
      var locCrop  = crop || locData.thumbnailCrop;
      var safePath = locData.image.replace(/'/g, '%27');
      var styleStr = 'background-image:url(\'' + safePath + '\')';
      if (locCrop) styleStr += ';background-size:' + locCrop.bgSize + ';background-position:' + locCrop.bgPos;
      return '<div class="ip-thumb ip-thumb-loc" style="' + styleStr + '" aria-hidden="true"></div>';
    }
    return '<div class="ip-thumb ip-thumb-empty" aria-hidden="true"></div>';
  }

  /** Legacy thumbnail builder for ipModSources / contModSources fallback path. */
  function _thumbHTMLLegacy(sourceName, fallbackImg) {
    var img = _cardNameToImage[sourceName] || fallbackImg || null;
    if (!img) return '<div class="ip-thumb ip-thumb-empty" aria-hidden="true"></div>';
    var safePath = img.replace(/'/g, '%27');
    return '<div class="ip-thumb" style="background-image:url(\'' + safePath + '\')" aria-hidden="true"></div>';
  }

  /* ═══════════════════════════════════════════════════════════════
     BATTLE CARD INFO POPUP
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Build the IP breakdown grid shown in the battle popup footer.
   * Returns an HTML string (ip-grid) set via innerHTML.
   *
   * New path: reads sd.bonuses[] (per-bonus records with attribution metadata).
   * Legacy fallback: reads sd.ipModSources / sd.contModSources when bonuses[]
   *   is absent (cards created before the refactor land here).
   *
   * Grid cols: [IP label / base] [thumb-wrap / ±delta per bonus]... [total]
   */
  function buildIPBreakdown(sd, owner, card /* card whose popup this is */) {
    var baseIP  = sd.ip;
    var total   = helpers.effectiveIP(sd);
    var selfImg = (card && card.image) ? card.image : null;

    var html = '<div class="ip-grid">'
      + '<div class="ip-col ip-col-base">'
      +   '<span class="ip-label">IP</span>'
      +   '<span class="ip-basenum">' + baseIP + '</span>'
      + '</div>';

    // ── New system: bonuses[] ─────────────────────────────────
    if (sd.bonuses && sd.bonuses.length > 0) {
      sd.bonuses.forEach(function (b) {
        var isReset = !!b.reset;
        var modCls  = isReset ? ' ip-col-mod--reset' : '';
        var dltCls  = isReset ? ' ip-delta--reset'   : '';
        var sign    = b.amount >= 0 ? '+' : '−';

        var thumbHtml = _thumbHTML(b.sourceType, b.sourceId, null);

        // Reset badge: first letter of the resetting card (e.g. 'J' for Justinian)
        var badgeHtml = '';
        if (isReset && b.resetBy != null && _cardById[b.resetBy]) {
          var initial = _cardById[b.resetBy].name.charAt(0).toUpperCase();
          var rName   = _cardById[b.resetBy].name;
          badgeHtml   = '<span class="ip-reset-badge" title="Reset by ' + rName + '">' + initial + '</span>';
        }

        html += '<div class="ip-col ip-col-mod' + modCls + '">'
              +   '<div class="ip-thumb-wrap">' + thumbHtml + badgeHtml + '</div>'
              +   '<span class="ip-delta' + dltCls + '">' + sign + Math.abs(b.amount) + '</span>'
              + '</div>';
      });

    // ── Legacy fallback: ipModSources / contModSources ────────
    } else {
      var legacyBonuses = [];
      if (sd.ipModSources && sd.ipModSources.length > 0) {
        sd.ipModSources.forEach(function (e) { legacyBonuses.push(e); });
      } else if (sd.ipMod) {
        legacyBonuses.push({ delta: sd.ipMod, source: 'Bonus' });
      }
      if (sd.contModSources && sd.contModSources.length > 0) {
        sd.contModSources.forEach(function (e) { legacyBonuses.push(e); });
      } else if (sd.contMod) {
        legacyBonuses.push({ delta: sd.contMod, source: 'Bonus' });
      }
      legacyBonuses.forEach(function (b) {
        var sign = b.delta >= 0 ? '+' : '−';
        html += '<div class="ip-col ip-col-mod">'
              +   '<div class="ip-thumb-wrap">' + _thumbHTMLLegacy(b.source, selfImg) + '</div>'
              +   '<span class="ip-delta">' + sign + Math.abs(b.delta) + '</span>'
              + '</div>';
      });
    }

    html += '<div class="ip-col ip-col-total">'
          +   '<span class="ip-total">' + total + '</span>'
          + '</div>'
          + '</div>';
    return html;
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
    Exploration: 'exploration',
    Scientific:  'scientific',
    Prehistory:  'prehistory'
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

    // Header row: type label (shown whenever the card has a type — every type
    // now has a symbol, including Prehistory).
    if (battlePopupTypeEl) {
      var showType = !!card.type;
      if (showType) {
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

    // Footer row: board cards get the IP breakdown; hand cards get the hint.
    if (sd && battlePopupIPBrkEl) {
      battlePopupIPBrkEl.innerHTML = buildIPBreakdown(sd, owner, card);
      battlePopupIPBrkEl.style.display = '';
      if (battlePopupHintEl) battlePopupHintEl.style.display = 'none';
    } else {
      if (battlePopupIPBrkEl) battlePopupIPBrkEl.style.display = 'none';
      if (battlePopupHintEl) {
        battlePopupHintEl.style.display = '';
        battlePopupHintEl.textContent = isBoard
          ? 'CLICK CARD FOR INFO'
          : 'DRAG CARD TO A SLOT TO PLAY';
      }
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
     LOCATION NAMEPLATE POPUP
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Open the location popup for a given location.
   * Shows both sides' contributor rows (cards at the location + external boosts
   * such as Sargon's adjacent-location bonus), with the enlarged location nameplate
   * in the centre.  Thumbnails are clickable and drill down to openBattlePopup.
   */
  function openLocationPopup(locId) {
    closeLocationPopup();   // dismiss any existing instance first

    var loc = G.locations.find(function (l) { return l.id === locId; });
    if (!loc) return;

    // ── Collect contributor entries for each side ────────────────
    // Each entry: { cardId, owner, sd, ipDisplay, isExternal, sourceLocId }
    function buildContributors(owner) {
      var slots   = owner === 'player' ? G.playerSlots : G.aiSlots;
      var entries = [];
      // Cards physically at this location (slot order)
      slots[locId].forEach(function (s) {
        if (!s || !s.revealed) return;
        entries.push({
          cardId:      s.cardId,
          owner:       owner,
          sd:          s,
          ipDisplay:   helpers.effectiveIP(s),
          isExternal:  false,
          sourceLocId: null
        });
      });
      // External boosts targeting this location
      if (G.locationBoosts && G.locationBoosts[locId]) {
        G.locationBoosts[locId][owner].forEach(function (boost) {
          entries.push({
            cardId:      boost.sourceCardId,
            owner:       boost.sourceOwner,
            sd:          null,   // looked up lazily at click time
            ipDisplay:   boost.amount,
            isExternal:  true,
            sourceLocId: boost.sourceLocId
          });
        });
      }
      return entries;
    }

    var oppEntries    = buildContributors('opp');
    var playerEntries = buildContributors('player');

    function sideTotal(entries) {
      return entries.reduce(function (sum, e) { return sum + e.ipDisplay; }, 0);
    }
    var oppTotal    = sideTotal(oppEntries);
    var playerTotal = sideTotal(playerEntries);

    // ── Build DOM ────────────────────────────────────────────────
    var overlay = document.createElement('div');
    overlay.id        = 'location-popup-overlay';
    overlay.className = 'location-popup-overlay';

    var popup = document.createElement('div');
    popup.className = 'location-popup';

    // Close button (×)
    var closeBtn = document.createElement('button');
    closeBtn.className   = 'location-popup-close';
    closeBtn.innerHTML   = '&#x2715;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', closeLocationPopup);
    popup.appendChild(closeBtn);

    // Build a contributor row (array of entries → div)
    function buildRow(entries, side) {
      var row = document.createElement('div');
      row.className = 'location-popup-contributors location-popup-contributors-' + side;

      entries.forEach(function (e) {
        var card = CARDS.find(function (c) { return c.id === e.cardId; });
        var thumb = document.createElement('div');
        thumb.className  = 'location-popup-thumb';
        thumb.tabIndex   = 0;
        thumb.setAttribute('role', 'button');

        if (card) {
          var img = document.createElement('div');
          img.className          = 'location-popup-thumb-img';
          img.style.backgroundImage = "url('" + card.image.replace(/'/g, '%27') + "')";
          thumb.appendChild(img);
        }

        var ipLabel = document.createElement('div');
        ipLabel.className   = 'location-popup-thumb-ip';
        ipLabel.textContent = (e.ipDisplay >= 0 ? '+' : '') + e.ipDisplay;
        thumb.appendChild(ipLabel);

        // Click → drill down into existing card popup
        function openDrill() {
          if (!card) return;
          var sd    = e.sd;
          var owner = e.owner;
          // External boost: find the source card's sd at its source location
          if (e.isExternal && e.sourceLocId !== null) {
            var srcSlots = (owner === 'player') ? G.playerSlots : G.aiSlots;
            (srcSlots[e.sourceLocId] || []).forEach(function (s) {
              if (s && s.cardId === e.cardId) sd = s;
            });
          }
          closeLocationPopup();
          openBattlePopup(card, sd, owner, true);
        }
        thumb.addEventListener('click', openDrill);
        thumb.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDrill(); }
        });

        row.appendChild(thumb);
      });

      return row;
    }

    // Side label builder
    function sideLabel(text, total) {
      var lbl = document.createElement('div');
      lbl.className = 'location-popup-side-label';
      var span = document.createElement('span');
      span.textContent = text;
      var tot = document.createElement('span');
      tot.className   = 'location-popup-side-total';
      tot.textContent = total;
      lbl.appendChild(span);
      lbl.appendChild(tot);
      return lbl;
    }

    // Opponent section (top)
    popup.appendChild(sideLabel('OPPONENT', oppTotal));
    popup.appendChild(buildRow(oppEntries, 'opp'));

    // Enlarged location nameplate
    var nameplate = document.createElement('div');
    nameplate.className = 'location-popup-nameplate';
    var nameLarge = document.createElement('div');
    nameLarge.className   = 'location-popup-name';
    nameLarge.textContent = loc.name;
    nameplate.appendChild(nameLarge);
    if (loc.abilityText) {
      var abilEl = document.createElement('div');
      abilEl.className   = 'location-popup-abilitytext';
      abilEl.textContent = loc.abilityText;
      nameplate.appendChild(abilEl);
    }
    popup.appendChild(nameplate);

    // Player section (bottom)
    popup.appendChild(buildRow(playerEntries, 'player'));
    popup.appendChild(sideLabel('YOU', playerTotal));

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Dismiss on backdrop click
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeLocationPopup();
    });
    // ESC key
    var escHandler = function (ev) {
      if (ev.key === 'Escape') closeLocationPopup();
    };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    // Animate in (next tick so CSS transition fires)
    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });
  }

  function closeLocationPopup() {
    var el = document.getElementById('location-popup-overlay');
    if (!el) return;
    if (el._escHandler) document.removeEventListener('keydown', el._escHandler);
    el.classList.remove('active');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 280);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.ui = {
    openBattlePopup:    openBattlePopup,
    openLocationPopup:  openLocationPopup,
    closeLocationPopup: closeLocationPopup,
    updateOppHand:      updateOppHand,
    showIPFloat:        showIPFloat,
    flashScore:         flashScore,
    flashDeny:          flashDeny,
    startBgMusic:       startBgMusic,
    stopBgMusic:        stopBgMusic
  };

  // Legacy global export — preserved for backwards compat. Nothing
  // currently calls window.openBattlePopup from outside game.js, but
  // game.js was exporting it, so we preserve the surface.
  window.openBattlePopup = openBattlePopup;

})();

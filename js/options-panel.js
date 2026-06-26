/**
 * options-panel.js — SOG.OptionsPanel
 *
 * One shared Options overlay, opened from two triggers (overworld HUD gear +
 * a battle HUD gear) — only the trigger's placement differs; the panel is
 * identical. Clones the BattleRulesPopup parchment/backdrop pattern so it
 * matches the SNES aesthetic and the backdrop blocks clicks behind it.
 *
 * Contents:
 *   • Back to Home   — relocated from the floating #overworld-back button.
 *   • Sounds         — Master / Music / SFX sliders (Part C).
 *   • How to Play    — static battle + overworld breakdown.
 *   • Music player    — the EXISTING #music-ctrl widget, relocated into the
 *                       bottom bar (controls reused verbatim) + artist credit.
 *
 * Built once (lazily) and shown/hidden — NOT destroyed — because #music-ctrl
 * lives inside it; destroying the panel would destroy the music widget.
 *
 *   SOG.OptionsPanel.open() / .close() / .isOpen()
 */
window.SOG = window.SOG || {};
SOG.OptionsPanel = (function () {
  'use strict';

  var BACKDROP_ID = 'options-backdrop';
  var _built = false;

  function isOpen() {
    var el = document.getElementById(BACKDROP_ID);
    return !!(el && el.classList.contains('visible'));
  }

  /* ── How-to-Play slides (EDITABLE) ───────────────────────────────────────
     Each slide: { heading, body, image }. `image` is a path to drop in later;
     null shows the reserved placeholder box. Slide count drives the dots. */
  var HOWTO_SLIDES = [
    { heading: 'Welcome, Explorer!',  image: null,
      body: "You're an explorer traveling through history! Battle famous figures from the past by playing cards, and learn how civilization was built along the way." },
    { heading: 'The Battle Board',    image: null,
      body: "Each battle has three locations. Play cards into them — every card adds its Influence Points (IP) to the location it's in. The numbers on the location show each side's total." },
    { heading: 'Winning a Location',  image: null,
      body: "Whoever has the higher IP at a location wins it. Win 2 of the 3 locations, and you win the battle!" },
    { heading: 'Capital',             image: null,
      body: "Each turn you get Capital to spend. Every card costs Capital to play (its CC), so choose wisely — you can't play everything at once." },
    { heading: 'Card Abilities',      image: null,
      body: "Many cards do something special when they're revealed — boosting nearby cards, moving around, or changing the board. Tap a card to read what it does." },
    { heading: 'The Overworld',       image: null,
      body: "Between battles, walk the map and click a node to start the next challenge. New places unlock as you win." },
    { heading: 'Deck & Marketplace',  image: null,
      body: "Win battles to earn gold, then spend it at the Marketplace to buy new cards. Build your deck to get stronger for the tougher figures ahead!" }
  ];

  var _slideIdx = 0;

  /* The slideshow + the main options are two states of the SAME panel. */
  /* The top toggle drives which body the panel shows — two views, one panel. */
  var _tab = 'settings';
  function _selectTab(tab) {
    _tab = (tab === 'howto') ? 'howto' : 'settings';
    var isSettings = (_tab === 'settings');
    var tog = document.getElementById('opt-view-toggle');
    if (tog) {
      var ts = tog.querySelector('[data-view="settings"]');
      var th = tog.querySelector('[data-view="howto"]');
      if (ts) ts.classList.toggle('is-active', isSettings);
      if (th) th.classList.toggle('is-active', !isSettings);
    }
    var mv = document.getElementById('opt-main-view');
    var mb = document.getElementById('opt-music-bar');
    var ss = document.getElementById('opt-slideshow');
    if (mv) mv.style.display = isSettings ? '' : 'none';
    if (mb) mb.style.display = isSettings ? '' : 'none';   // music player: Settings tab only
    if (ss) ss.style.display = isSettings ? 'none' : '';
    if (!isSettings) { _slideIdx = 0; _renderSlide(); }    // How-to-Play always starts at slide 1
  }
  function _renderSlide() {
    var s = HOWTO_SLIDES[_slideIdx];
    if (!s) return;
    var b = document.getElementById('opt-slide-body');
    var img = document.getElementById('opt-slide-image');
    var dots = document.getElementById('opt-slide-dots');
    var prev = document.getElementById('opt-slide-prev');
    var next = document.getElementById('opt-slide-next');
    if (b) b.textContent = s.body;
    if (img) {
      if (s.image) { img.style.backgroundImage = 'url("' + s.image + '")'; img.classList.remove('is-placeholder'); }
      else         { img.style.backgroundImage = '';                       img.classList.add('is-placeholder'); }
    }
    if (dots) {
      dots.innerHTML = '';
      for (var i = 0; i < HOWTO_SLIDES.length; i++) {
        var d = document.createElement('span');
        d.className = 'slideshow-dot' + (i === _slideIdx ? ' is-active' : '');
        dots.appendChild(d);
      }
    }
    if (prev) prev.disabled = (_slideIdx === 0);
    if (next) next.disabled = (_slideIdx === HOWTO_SLIDES.length - 1);
  }
  function _step(delta) {
    var n = _slideIdx + delta;
    if (n < 0 || n >= HOWTO_SLIDES.length) return;
    _slideIdx = n;
    _renderSlide();
  }

  function _sliderRow(label, id) {
    return '<div class="options-slider-row">' +
      '<span class="options-slider-label">' + label + '</span>' +
      '<input type="range" class="options-slider" id="' + id + '" min="0" max="100" value="100">' +
      '<span class="options-vol-num" id="' + id + '-num">100</span>' +
    '</div>';
  }

  function _wireSlider(id, onInput) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var v = parseInt(el.value, 10);
      var num = document.getElementById(id + '-num');
      if (num) num.textContent = v;
      onInput(v);
    });
  }

  function _updateMusicUI() {
    if (!(window.SOG && SOG.music && SOG.music.getCurrentTrack)) return;
    var t = SOG.music.getCurrentTrack();
    var titleEl  = document.getElementById('opt-music-title');
    var creditEl = document.getElementById('opt-music-credit');
    var playEl   = document.getElementById('opt-music-play');
    if (titleEl)  titleEl.textContent  = t.title || '';
    if (creditEl) creditEl.textContent = t.artist || '';
    if (playEl)   playEl.textContent   = (SOG.music.isPlaying && SOG.music.isPlaying()) ? '▌▌' : '▶';
  }

  function _installMusicHook() {
    if (!(window.SOG && SOG.music)) return;
    if (SOG.music.onUpdate && SOG.music.onUpdate.__optWrap) return;   // already wrapped
    var prev = SOG.music.onUpdate;
    var wrap = function () { if (prev) prev(); _updateMusicUI(); };
    wrap.__optWrap = true;
    SOG.music.onUpdate = wrap;
  }

  /* ── Forfeit ("Back to Map") ───────────────────────────────────────────────
     Battle-context detection: the panel is the SAME overlay on the overworld and
     in battle (only the trigger gear differs). showScreen sets body.dataset.screen
     to the active screen id sans "screen-", so an ADVENTURE battle is screen
     'battle' WITH a live scripted battle (G.config.scriptHook — truthy for the
     adventure bosses/prehistory/otzi, null for Arcadium/2P). The overworld (and
     its marketplace overlay) is screen 'overworld', so the button stays hidden
     there. Gating on scriptHook also keeps it off non-adventure battles. */
  function _inAdventureBattle() {
    var inBattle = !!(document.body && document.body.dataset && document.body.dataset.screen === 'battle');
    var G = window.SOG && SOG.state && SOG.state.G;
    return !!(inBattle && G && G.config && G.config.scriptHook);
  }

  /* Small parchment Yes/No confirm — same look as the marketplace buy-confirm
     (_openBuyConfirm in overworld.js). z-index sits above the options backdrop
     (9000). No → just dismiss (stay in Settings/the battle). Yes → forfeit. */
  function _openForfeitConfirm() {
    if (document.getElementById('opt-forfeit-confirm')) return;   // already open
    var ov = document.createElement('div');
    ov.id = 'opt-forfeit-confirm';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(8,4,0,0.5);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:linear-gradient(180deg,#f6efdc,#e8dcb8);border:3px solid #1a0a04;border-radius:10px;' +
      'padding:24px 28px;display:flex;flex-direction:column;align-items:center;gap:18px;color:#1a0a04;' +
      'font-family:var(--font,sans-serif);max-width:380px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.6);';
    var q = document.createElement('div');
    q.textContent = "Are you sure you'd like to forfeit this battle?";
    q.style.cssText = 'font-size:19px;line-height:1.4;';
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:16px;';
    var yes = document.createElement('button'); yes.className = 'btn-primary'; yes.textContent = 'Yes';
    yes.style.cssText = 'padding:9px 28px;font-size:17px;cursor:pointer;';
    var no = document.createElement('button'); no.className = 'btn-primary'; no.textContent = 'No';
    no.style.cssText = 'padding:9px 28px;font-size:17px;cursor:pointer;';
    function closeConfirm() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    no.addEventListener('click', closeConfirm);
    yes.addEventListener('click', function () { closeConfirm(); _doForfeit(); });
    row.appendChild(yes); row.appendChild(no);
    panel.appendChild(q); panel.appendChild(row);
    ov.appendChild(panel);
    document.body.appendChild(ov);
  }

  /* The forfeit itself — a QUIET exit (no defeat scoreboard, no loss dialogue, no
     fanfare; the player chose to leave). −20 Focus (a deterrent: MORE than the
     normal −10 loss; always applies, even to 0 — the gate then triggers on the
     next blocked action via the existing system). Reuses the canonical
     Overworld.teardown() (same fresh-load-equivalent reset as Back-to-Home), then
     the normal battle→overworld return path (showScreen + resumeAfterBattle, as
     deckbuilder.js / the battle modules use). The battle is ABANDONED: nothing is
     marked won/beaten and nothing is granted, so the boss node stays active. */
  function _doForfeit() {
    if (window.SOG && SOG.focus && typeof SOG.focus.spend === 'function') SOG.focus.spend(20);
    // Stop the battle music. The quiet forfeit skips endGame() — which is what
    // normally stops it — so without this the battle track keeps playing on the
    // (otherwise silent) overworld. No overworld music to start: the map is silent
    // between battles, same as the normal battle→map return.
    if (window.SOG && SOG.ui && typeof SOG.ui.stopBgMusic === 'function') SOG.ui.stopBgMusic();
    close();
    if (window.Overworld && typeof window.Overworld.teardown === 'function') window.Overworld.teardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshDecks === 'function') SOG.HUD.refreshDecks();
    if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') window.Overworld.resumeAfterBattle();
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshFocus === 'function') SOG.HUD.refreshFocus();
  }

  function _build() {
    if (_built) return;

    var backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.className = 'popup-backdrop options-backdrop';

    var panel = document.createElement('div');
    panel.className = 'card-popup options-panel';
    panel.innerHTML =
      // ── HEADER ROW: Home (top-left) · Settings title · ✕ (top-right) ─────
      '<button class="options-home-btn" id="opt-home-btn">&#8592; Home</button>' +
      // Top-right corner control. Overworld → the close ✕. In an adventure battle
      // → the "Back to Map" forfeit takes the corner instead (the ✕ is hidden);
      // open() swaps which one shows. The panel still closes via the backdrop.
      '<button class="popup-close-x" aria-label="Close">&#x2715;</button>' +
      '<button class="options-map-corner" id="opt-map-btn" style="display:none">Back to Map</button>' +
      // ── TOP TOGGLE — one joined button that flips between the two views ──
      '<div class="options-tabs">' +
        '<button class="options-toggle" id="opt-view-toggle">' +
          '<span class="options-toggle-seg is-active" data-view="settings">Settings</span>' +
          '<span class="options-toggle-seg" data-view="howto">How-to-Play</span>' +
        '</button>' +
      '</div>' +
      // ── SETTINGS VIEW (sliders) ─────────────────────────────────────────
      '<div class="options-scroll" id="opt-main-view">' +
        '<div class="options-section">' +
          '<div class="options-section-title">Sounds</div>' +
          _sliderRow('Master', 'opt-vol-master') +
          _sliderRow('Music',  'opt-vol-music') +
          _sliderRow('SFX',    'opt-vol-sfx') +
        '</div>' +
      '</div>' +
      // ── MUSIC BAR (Settings tab only) ──────────────────────────────────
      '<div class="options-music-bar" id="opt-music-bar">' +
        '<div class="options-music-title" id="opt-music-title"></div>' +
        '<div class="options-music-credit" id="opt-music-credit"></div>' +
        '<div class="options-music-controls">' +
          '<button class="options-music-btn" id="opt-music-prev" title="Previous">&#9664;&#9664;</button>' +
          '<button class="options-music-btn" id="opt-music-play" title="Play/Pause">&#9654;</button>' +
          '<button class="options-music-btn" id="opt-music-next" title="Next">&#9654;&#9654;</button>' +
        '</div>' +
      '</div>' +
      // ── HOW-TO-PLAY VIEW (slideshow; toggled by the top tab) ────────────
      '<div class="options-slideshow" id="opt-slideshow" style="display:none">' +
        '<div class="slideshow-image is-placeholder" id="opt-slide-image"></div>' +
        '<div class="slideshow-body" id="opt-slide-body"></div>' +
        '<div class="slideshow-nav">' +
          '<button class="slideshow-arrow" id="opt-slide-prev" title="Previous">&#9664;</button>' +
          '<div class="slideshow-dots" id="opt-slide-dots"></div>' +
          '<button class="slideshow-arrow" id="opt-slide-next" title="Next">&#9654;</button>' +
        '</div>' +
      '</div>';

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // Music controls — drive the shared playlist via the SOG.music API (the corner
    // #music-ctrl widget stays on the home/deckbuilder screens; this is independent).
    panel.querySelector('#opt-music-prev').addEventListener('click', function () { if (window.SOG && SOG.music && SOG.music.prev)   SOG.music.prev();   _updateMusicUI(); });
    panel.querySelector('#opt-music-play').addEventListener('click', function () { if (window.SOG && SOG.music && SOG.music.toggle) SOG.music.toggle(); _updateMusicUI(); });
    panel.querySelector('#opt-music-next').addEventListener('click', function () { if (window.SOG && SOG.music && SOG.music.next)   SOG.music.next();   _updateMusicUI(); });

    // Dismiss: X button or click on the backdrop (outside the panel).
    panel.querySelector('.popup-close-x').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    // Back to Home — relocated action from the (now-removed) floating button.
    panel.querySelector('#opt-home-btn').addEventListener('click', function () {
      close();
      // Stop the battle/overworld playlist before handing off to the home music,
      // otherwise it keeps playing under the home screen.
      if (window.SOG && SOG.ui && typeof SOG.ui.stopBgMusic === 'function') SOG.ui.stopBgMusic();
      // Comprehensive teardown FIRST → fresh-load-equivalent clean state (removes
      // leftover overlays like the marketplace backdrop, strips battle body
      // classes, clears overworld locks/timers + window flags). Then show home.
      if (window.Overworld && typeof window.Overworld.teardown === 'function') window.Overworld.teardown();
      if (typeof window.showScreen === 'function') window.showScreen('screen-home');
      if (window.HomeFlow && typeof window.HomeFlow.reset    === 'function') window.HomeFlow.reset();
      if (window.HomeFlow && typeof window.HomeFlow.playMusic === 'function') window.HomeFlow.playMusic();
    });

    // Back to Map (forfeit) — battle-context only (shown/hidden by open()).
    panel.querySelector('#opt-map-btn').addEventListener('click', function () { _openForfeitConfirm(); });

    // Sliders (Part C). Master scales BOTH music and SFX (SOG.sfx.setMaster
    // re-applies music via SOG.music.refresh); Music/SFX are independent axes.
    _wireSlider('opt-vol-master', function (v) { if (window.SOG && SOG.sfx)   SOG.sfx.setMaster(v); });
    _wireSlider('opt-vol-music',  function (v) { if (window.SOG && SOG.music) SOG.music.setVolume(v); });
    _wireSlider('opt-vol-sfx',    function (v) { if (window.SOG && SOG.sfx)   SOG.sfx.setVolume(v); });

    // Top toggle — one joined button that flips between Settings and How-to-Play.
    panel.querySelector('#opt-view-toggle').addEventListener('click', function () {
      _selectTab(_tab === 'settings' ? 'howto' : 'settings');
    });
    panel.querySelector('#opt-slide-prev').addEventListener('click', function () { _step(-1); });
    panel.querySelector('#opt-slide-next').addEventListener('click', function () { _step(1); });

    _installMusicHook();
    _built = true;
  }

  function _syncFromStorage() {
    function set(id, val) {
      var el  = document.getElementById(id);
      var num = document.getElementById(id + '-num');
      if (el)  el.value = val;
      if (num) num.textContent = val;
    }
    set('opt-vol-master', (window.SOG && SOG.sfx)   ? SOG.sfx.getMaster()   : 100);
    set('opt-vol-music',  (window.SOG && SOG.music) ? SOG.music.getVolume() : 100);
    set('opt-vol-sfx',    (window.SOG && SOG.sfx)   ? SOG.sfx.getVolume()   : 100);
  }

  function open() {
    _build();
    _selectTab('settings');   // always open on the Settings tab (never mid-slideshow)
    // Top-right corner control: "Back to Map" (forfeit) in an adventure battle,
    // otherwise the close ✕. Exactly one shows at a time.
    var inBattle = _inAdventureBattle();
    var mapBtn = document.getElementById('opt-map-btn');
    var closeX = document.querySelector('#' + BACKDROP_ID + ' .popup-close-x');
    if (mapBtn) mapBtn.style.display = inBattle ? '' : 'none';
    if (closeX) closeX.style.display = inBattle ? 'none' : '';
    _syncFromStorage();
    _updateMusicUI();
    var backdrop = document.getElementById(BACKDROP_ID);
    if (!backdrop) return;
    void backdrop.offsetHeight;          // commit start state so the fade/scale runs
    backdrop.classList.add('visible');
  }

  function close() {
    var backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) backdrop.classList.remove('visible');
    if (_built) _selectTab('settings');  // reset so the next open starts on Settings
  }

  /* Wire the two triggers. The overworld gear (#adv-hud-btn-options) is wired in
     sog-adventure-hud.js; here we wire the new battle gear (#battle-btn-options). */
  function _wireTriggers() {
    var bt = document.getElementById('battle-btn-options');
    if (bt && !bt._optWired) { bt._optWired = true; bt.addEventListener('click', open); }
  }
  _wireTriggers();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wireTriggers);

  return { open: open, close: close, isOpen: isOpen };
})();

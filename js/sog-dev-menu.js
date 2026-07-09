/**
 * sog-dev-menu.js  (Phase Dev-1)
 *
 * Hidden floating developer checkpoint menu. Toggle with the backtick key (`).
 * Each checkpoint sets the localStorage flags + card unlocks needed for a
 * scene, then navigates there — so you don't have to replay upstream content
 * while testing.
 *
 * Public API:  SOG.DevMenu.show() / hide() / toggle() / isOpen()
 *
 * Adding a checkpoint = add one entry to the CHECKPOINTS array below. Each is:
 *   { section, label, description?, run }
 *   - section:     group header it appears under
 *   - label:       button text
 *   - description: optional small sub-line
 *   - run():       sets flags / unlocks cards / navigates (see helpers)
 *
 * Always-loaded for now; pre-launch this will be gated behind a build flag.
 */
window.SOG = window.SOG || {};
SOG.DevMenu = (function () {
  'use strict';

  var VIS_KEY      = 'sog_dev_menu_visible';
  var PANEL_ID     = 'sog-dev-menu';
  var UNLOCKED_KEY = 'sog_unlocked_cards';

  /* ── State helpers ──────────────────────────────────────────────── */

  // Upstream prerequisites: everything before the Mesopotamia arrival.
  var PREREQS_PREHISTORY = {
    'sog_adventure_intro_complete':            'true',
    'sog_post_neanderthal_overworld_complete': 'true',
    'sog_card_lucy_unlocked':                  'true',
    'sog_battle_otzi_complete':                'true'
  };

  function setFlags(map) {
    try { Object.keys(map).forEach(function (k) { localStorage.setItem(k, map[k]); }); } catch (e) {}
  }
  function removeFlags(keys) {
    try { keys.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }
  function ensureAdventurer() {
    try { if (!localStorage.getItem('sog_selected_adventurer')) localStorage.setItem('sog_selected_adventurer', 'female'); } catch (e) {}
  }
  function unlockCards(ids) {
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') SOG.Cards.unlock(ids);
  }
  // Re-lock cards: drop them from sog_unlocked_cards and flip the in-memory flag.
  function relockCards(ids) {
    try {
      var arr = JSON.parse(localStorage.getItem(UNLOCKED_KEY) || '[]');
      if (!Array.isArray(arr)) arr = [];
      arr = arr.filter(function (id) { return ids.indexOf(id) === -1; });
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify(arr));
    } catch (e) {}
    if (typeof CARDS !== 'undefined') {
      ids.forEach(function (id) { var c = CARDS.find(function (x) { return x.id === id; }); if (c) c.locked = true; });
    }
  }
  // Defensive: tear down any in-progress battle before a scene jump so we don't
  // leave battle DOM / event listeners / stale flags behind. Guarded so a
  // missing module never throws. Add new battle modules here as they ship.
  function teardownBattles() {
    ['GilgameshBattle', 'OtziBattle', 'NarmerBattle'].forEach(function (name) {
      try {
        if (window.SOG && SOG[name] && typeof SOG[name].teardown === 'function') SOG[name].teardown();
      } catch (e) { console.warn('[DevMenu] teardown failed for', name, e); }
    });
  }

  // Scene jumps leave the home screen, but bypass the normal "play" button that
  // fades home music out — so kill it here or it bleeds into the overworld/battle.
  function stopHomeMusic() {
    try {
      if (window.HomeFlow && typeof window.HomeFlow.stopMusic === 'function') window.HomeFlow.stopMusic(300);
    } catch (e) {}
  }

  // Land on an overworld map instantly (no travel animation), nodes gated by flags.
  function gotoOverworld(mapId) {
    stopHomeMusic();
    teardownBattles();
    try {
      localStorage.setItem('sog_overworld_map', mapId);
      localStorage.removeItem('sog_overworld_pos');   // spawn position
    } catch (e) {}
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    if (window.Overworld && typeof window.Overworld.init === 'function') window.Overworld.init();
  }

  /* ── Checkpoints ────────────────────────────────────────────────── */

  var CHECKPOINTS = [
    // ── 🌍 Adventure Mode — Scene Jumps ──
    {
      section: '🌍 Adventure Mode — Scene Jumps',
      label: 'Mesopotamia Arrival (D1)',
      description: 'Otzi defeated, walking off East Africa → D1 transition',
      run: function () {
        ensureAdventurer();
        setFlags(PREREQS_PREHISTORY);
        removeFlags(['sog_mesopotamia_arrival_complete']); // arrival must replay
        stopHomeMusic();
        teardownBattles();
        try { localStorage.setItem('sog_overworld_map', 'eastafrica'); localStorage.removeItem('sog_overworld_pos'); } catch (e) {}
        if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
        if (window.Overworld && window.Overworld.init) window.Overworld.init();
        hide();
        setTimeout(function () { if (window.Overworld && window.Overworld.playD1) window.Overworld.playD1(); }, 200);
      }
    },
    {
      section: '🌍 Adventure Mode — Scene Jumps',
      label: 'Walls of Uruk Ready (post-D2a)',
      description: 'Mesopotamia overworld, Walls of Uruk node visible',
      run: function () {
        ensureAdventurer();
        setFlags(PREREQS_PREHISTORY);
        setFlags({ 'sog_mesopotamia_arrival_complete': 'true' });
        gotoOverworld('mesopotamia');
        hide();
      }
    },
    {
      section: '🌍 Adventure Mode — Scene Jumps',
      label: 'Gilgamesh Battle — Direct Entry',
      description: 'Skip walk + Welcome + opening dialogue; start the battle now',
      run: function () {
        ensureAdventurer();
        setFlags(PREREQS_PREHISTORY);
        setFlags({
          'sog_mesopotamia_arrival_complete': 'true',
          'sog_met_gilgamesh':                'true',
          'sog_gilgamesh_opening_seen':       'true'   // skip in-battle opening dialogue
        });
        removeFlags(['sog_gilgamesh_phase1_complete']); // Battle 1 (fixed deck), not the rematch
        hide();
        stopHomeMusic();
        teardownBattles();   // clean up any in-progress battle so we start fresh
        if (window.SOG && SOG.GilgameshBattle && SOG.GilgameshBattle.start) SOG.GilgameshBattle.start();
      }
    },
    {
      section: '🌍 Adventure Mode — Scene Jumps',
      label: 'Post-Cuneiform Ready',
      description: 'Cuneiform granted; Walls re-click → "challenge again" → Attempt 2',
      run: function () {
        ensureAdventurer();
        setFlags(PREREQS_PREHISTORY);
        setFlags({
          'sog_mesopotamia_arrival_complete': 'true',
          'sog_met_gilgamesh':                'true',
          'sog_cuneiform_granted':            'true',
          'sog_deckbuilder_unlocked':         'true'   // deck builder usable for testing
        });
        unlockCards([46]);
        gotoOverworld('mesopotamia');
        hide();
      }
    },

    {
      section: '🌍 Adventure Mode — Scene Jumps',
      label: 'Narmer Battle — Direct Entry (Stage 1)',
      description: 'Advance-gate mechanic test board (placeholder decks, no dialogue)',
      run: function () {
        ensureAdventurer();
        hide();
        stopHomeMusic();
        teardownBattles();
        if (window.SOG && SOG.NarmerBattle && SOG.NarmerBattle.start) SOG.NarmerBattle.start();
      }
    },

    // ── 🎴 Card / State Toggles ──
    {
      section: '🎴 Card / State Toggles',
      label: 'Toggle Deck Builder Lock',
      description: 'Flip sog_deckbuilder_unlocked (greys / un-greys the HUD deck button)',
      run: function () {
        var on = false;
        try { on = localStorage.getItem('sog_deckbuilder_unlocked') === 'true'; } catch (e) {}
        setFlags({ 'sog_deckbuilder_unlocked': on ? 'false' : 'true' });
        var hud = window.SOG && window.SOG.HUD;
        if (hud && typeof hud.refreshDecks === 'function') hud.refreshDecks();
        flash('Deck builder ' + (on ? 'LOCKED' : 'UNLOCKED'));
      }
    },
    {
      section: '🎴 Card / State Toggles',
      label: 'Grant Cuneiform',
      description: 'Unlock card 46 + set sog_cuneiform_granted',
      run: function () { unlockCards([46]); setFlags({ 'sog_cuneiform_granted': 'true' }); flash('Cuneiform granted'); }
    },
    {
      section: '🎴 Card / State Toggles',
      label: 'Reset Cuneiform State',
      description: 'Lock card 46 + clear sog_cuneiform_granted (re-test Farmer intervention)',
      run: function () { setFlags({ 'sog_cuneiform_granted': 'false' }); relockCards([46]); flash('Cuneiform reset'); }
    },
    {
      section: '🎴 Card / State Toggles',
      label: 'Reset Gilgamesh Battle Progress',
      description: 'Clear the whole Gilgamesh arc (flags + arc card grants). Upstream untouched.',
      run: function () {
        removeFlags([
          'sog_battle_gilgamesh_complete',
          'sog_gilgamesh_phase1_complete',
          'sog_cuneiform_granted',
          'sog_met_gilgamesh',
          'sog_gilgamesh_opening_seen',
          'sog_mesopotamia_starter_granted',
          'sog_deckbuilder_unlocked',
          'sog_market_first_visit_done',
          'sog_market_intro_seen'
        ]);
        relockCards([46, 38, 39, 40, 41, 42]); // Cuneiform + the 5 Mesopotamia starters
        flash('Gilgamesh arc reset');
      }
    },

    // ── 🧨 Nuclear ──
    {
      section: '🧨 Nuclear',
      label: 'Clear All Adventure Progress',
      description: 'Wipe sog_* progress keys (keeps audio settings) + reload',
      run: function () {
        if (!window.confirm('Clear ALL adventure progress? (audio settings kept)')) return;
        // Keep audio settings + this menu’s own visibility.
        var keep = /^(sog_dev_menu_visible|sog_music|sog_sfx|sog_volume|sog_muted)/i;
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && /^sog_/.test(k) && !keep.test(k)) toRemove.push(k);
        }
        toRemove.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        location.reload();
      }
    },
    {
      section: '🧨 Nuclear',
      label: 'Clear Everything',
      description: 'localStorage.clear() + reload (full wipe)',
      run: function () {
        if (!window.confirm('Wipe ALL localStorage? (full reset)')) return;
        try { localStorage.clear(); } catch (e) {}
        location.reload();
      }
    }
  ];

  /* ── UI ─────────────────────────────────────────────────────────── */

  var _panel = null, _statusEl = null, _statusTimer = null;

  function _injectStyles() {
    if (document.getElementById('sog-dev-menu-style')) return;
    var css =
      '#' + PANEL_ID + '{position:fixed;top:10px;right:10px;width:320px;max-height:600px;overflow-y:auto;' +
        'z-index:99999;background:rgba(8,6,4,0.92);border:2px solid #d4aa50;border-radius:6px;' +
        'padding:10px 12px 8px;box-shadow:0 6px 28px rgba(0,0,0,.6);' +
        'font-family:"Courier New",monospace;font-size:12px;color:#e8d8a0;' +
        'opacity:0;pointer-events:none;transition:opacity .15s ease;}' +
      '#' + PANEL_ID + '.visible{opacity:1;pointer-events:auto;}' +
      '#' + PANEL_ID + ' .dm-head{display:flex;align-items:center;justify-content:space-between;' +
        'margin-bottom:8px;border-bottom:1px solid rgba(212,170,80,.4);padding-bottom:6px;}' +
      '#' + PANEL_ID + ' .dm-title{color:#f8d000;font-weight:bold;letter-spacing:1px;}' +
      '#' + PANEL_ID + ' .dm-x{cursor:pointer;color:#caa84e;font-size:15px;line-height:1;padding:0 4px;background:none;border:none;font-family:inherit;}' +
      '#' + PANEL_ID + ' .dm-x:hover{color:#fff;}' +
      '#' + PANEL_ID + ' .dm-section{color:#caa84e;margin:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;}' +
      '#' + PANEL_ID + ' .dm-btn{display:block;width:100%;text-align:left;margin:3px 0;padding:6px 8px;' +
        'background:rgba(212,170,80,.07);border:1px solid rgba(212,170,80,.35);border-radius:4px;' +
        'color:#e8d8a0;font-family:inherit;font-size:12px;cursor:pointer;transition:background .1s;}' +
      '#' + PANEL_ID + ' .dm-btn:hover{background:rgba(212,170,80,.22);border-color:#d4aa50;}' +
      '#' + PANEL_ID + ' .dm-btn .dm-desc{display:block;color:#9c8a55;font-size:10px;margin-top:2px;line-height:1.25;}' +
      '#' + PANEL_ID + ' .dm-foot{margin-top:10px;padding-top:6px;border-top:1px solid rgba(212,170,80,.3);' +
        'color:#9c8a55;font-size:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;}' +
      '#' + PANEL_ID + ' .dm-status{color:#8ad08a;font-size:10px;min-height:12px;flex:1;text-align:right;}';
    var s = document.createElement('style');
    s.id = 'sog-dev-menu-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function _build() {
    if (_panel) return;
    _injectStyles();
    _panel = document.createElement('div');
    _panel.id = PANEL_ID;

    var head = document.createElement('div');
    head.className = 'dm-head';
    var title = document.createElement('span');
    title.className = 'dm-title';
    title.textContent = '🛠 DEV MENU';
    var x = document.createElement('button');
    x.className = 'dm-x';
    x.innerHTML = '&#x2715;';
    x.title = 'Close (`)';
    x.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    head.appendChild(title); head.appendChild(x);
    _panel.appendChild(head);

    // Group checkpoints by section, preserving order.
    var sections = [];
    CHECKPOINTS.forEach(function (cp) { if (sections.indexOf(cp.section) === -1) sections.push(cp.section); });
    sections.forEach(function (sec) {
      var h = document.createElement('div');
      h.className = 'dm-section';
      h.textContent = sec;
      _panel.appendChild(h);
      CHECKPOINTS.filter(function (cp) { return cp.section === sec; }).forEach(function (cp) {
        var b = document.createElement('button');
        b.className = 'dm-btn';
        b.type = 'button';
        var lbl = document.createElement('span');
        lbl.textContent = cp.label;
        b.appendChild(lbl);
        if (cp.description) {
          var d = document.createElement('span');
          d.className = 'dm-desc';
          d.textContent = cp.description;
          b.appendChild(d);
        }
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          try { cp.run(); }
          catch (err) { console.error('[DevMenu] checkpoint failed:', cp.label, err); flash('ERROR: ' + cp.label); }
        });
        _panel.appendChild(b);
      });
    });

    var foot = document.createElement('div');
    foot.className = 'dm-foot';
    var hint = document.createElement('span');
    hint.textContent = 'Press ` to toggle';
    _statusEl = document.createElement('span');
    _statusEl.className = 'dm-status';
    foot.appendChild(hint); foot.appendChild(_statusEl);
    _panel.appendChild(foot);

    document.body.appendChild(_panel);
  }

  function flash(msg) {
    if (!_statusEl) return;
    _statusEl.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    _statusTimer = setTimeout(function () { if (_statusEl) _statusEl.textContent = ''; }, 1800);
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  function show() {
    _build();
    _panel.classList.add('visible');
    try { localStorage.setItem(VIS_KEY, 'true'); } catch (e) {}
  }
  function hide() {
    if (_panel) _panel.classList.remove('visible');
    try { localStorage.setItem(VIS_KEY, 'false'); } catch (e) {}
  }
  function isOpen() { return !!(_panel && _panel.classList.contains('visible')); }
  function toggle() { isOpen() ? hide() : show(); }

  /* ── Boot ───────────────────────────────────────────────────────── */

  function _boot() {
    _build();
    // Restore persisted visibility.
    var vis = false;
    try { vis = localStorage.getItem(VIS_KEY) === 'true'; } catch (e) {}
    if (vis) show();

    // Backtick toggles — ignore while typing in a field.
    document.addEventListener('keydown', function (e) {
      if (e.key !== '`' && e.code !== 'Backquote') return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });
  }

  if (document.body) _boot();
  else document.addEventListener('DOMContentLoaded', _boot);

  return { show: show, hide: hide, toggle: toggle, isOpen: isOpen };
})();

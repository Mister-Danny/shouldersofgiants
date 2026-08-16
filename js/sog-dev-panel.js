/**
 * sog-dev-panel.js — Developer State Panel (REPLACES sog-dev-menu.js)
 *
 * A dev-only popup for building arbitrary, CONSISTENT game state and launching
 * anywhere from it. Toggle with the backtick key (`).
 *
 * Why this exists: the old dev menu was fire-and-forget — actions gave no
 * feedback and left partial state (e.g. jumping to Sargon without the cards a
 * real player would hold). This panel's contract is the opposite:
 *
 *   1. STATE-REFLECTING — on open it READS the real game state and every
 *      control shows its current value (which cards are owned, current gold,
 *      which tier flags are set). You never guess whether something took.
 *   2. REAL KEYS ONLY — it writes through the same modules/keys the game reads
 *      (SOG.collection, SOG.gold, sog_node_<hook>_<tier>_beaten, …). There is
 *      no parallel dev state.
 *   3. ONE APPLY — every edit (cards, gold, progression) stages in memory and
 *      is written by the single APPLY ALL CHANGES button at the bottom. While
 *      anything is staged the panel shows an UNAPPLIED banner, so a change can
 *      never be silently lost. (Launch buttons auto-apply first — see _launch*.)
 *
 * Layout: NUCLEAR (top) · CARDS · GOLD · PROGRESSION · LAUNCH · APPLY (bottom).
 *
 * PRESET SEAM (not built yet — see _readSnapshot / _applySnapshot near the
 * bottom): a preset is just a snapshot object
 *     { cards: [ids…], gold: n, flags: { key: bool } }
 * so a future preset list can call _applySnapshot(preset) and reuse every
 * writer below. _readSnapshot() gives you "save current state as a preset"
 * for free.
 *
 * Public API: SOG.DevPanel.show() / hide() / toggle() / isOpen()
 * Pre-launch this whole file should be excluded from the build.
 */
window.SOG = window.SOG || {};
SOG.DevPanel = (function () {
  'use strict';

  var PANEL_ID = 'sog-dev-panel';
  var VIS_KEY  = 'sog_dev_menu_visible';   // reuse the old key (same intent)

  /* ── Password gate ─────────────────────────────────────────────────────
     This panel is far more destructive than the teacher bypass menu (it can
     rewrite the collection, gold and every progression flag, and wipe the save),
     so on the LIVE site the backtick key no longer opens it directly — it asks
     for a password first, EVERY time, exactly like BypassAuth (bypass.js): no
     persisted "already authed" state, wrong entry shows Access Denied and
     closes. Same password as the teacher menu by request.

     On localhost / file:// the prompt is skipped entirely so local testing stays
     frictionless — a dev machine is already trusted (devtools can do all of this
     anyway). Note this gate stops casual discovery of the panel; it is NOT a
     security boundary against someone with the browser console open. */
  var DEV_PASSWORD = 'Swift';
  var PW_ID = 'sog-dev-pw';

  function _isTrustedHost() {
    try {
      if (location.protocol === 'file:') return true;
      var h = location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
    } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     STATE MODEL — every key this panel reads/writes is a REAL game key.
     ══════════════════════════════════════════════════════════════════════ */

  var BOSSES = [
    { hook: 'gilgamesh',       label: 'Gilgamesh (Uruk)',      module: 'GilgameshBattle',      skipFlag: 'sog_gilgamesh_opening_seen' },
    { hook: 'sargon',          label: 'Sargon (Akkad)',        module: 'SargonBattle',         skipFlag: 'sog_sargon_opening_seen' },
    { hook: 'hammurabi',       label: 'Hammurabi (Babylon)',   module: 'HammurabiBattle',      skipFlag: 'sog_hammurabi_opening_seen' },
    { hook: 'hanging-gardens', label: 'Nebuchadnezzar (HG)',   module: 'HangingGardensBattle', skipFlag: 'sog_hanging_gardens_battle_opening_seen' },
    { hook: 'narmer',          label: 'Narmer (Egypt)',        module: 'NarmerBattle',         skipFlag: 'sog_narmer_battle_opening_seen' }
  ];

  var MAPS = [
    { id: 'eastafrica',  label: 'East Africa' },
    { id: 'mesopotamia', label: 'Mesopotamia' },
    { id: 'egypt',       label: 'Egypt' }
  ];

  /* Card grouping for the collapsible checklist. Cards 1–25 are the original
     teaching set; everything else groups by era. Tokens get their own group and
     are never selectable (the deck builder hard-refuses token:true cards). */
  function _groupOf(card) {
    if (card.token) return 'Tokens (not deckable)';
    if (card.id <= 25) return '7th Grade Curriculum';
    return card.era || 'Other';
  }
  var GROUP_ORDER = ['7th Grade Curriculum', 'Prehistory', 'Mesopotamia', 'Egypt', 'Other', 'Tokens (not deckable)'];

  /* ── Small storage helpers ─────────────────────────────────────────── */
  function _getFlag(k) { try { return localStorage.getItem(k) === 'true'; } catch (e) { return false; } }
  function _setFlag(k, on) {
    try { if (on) localStorage.setItem(k, 'true'); else localStorage.removeItem(k); } catch (e) {}
  }
  function _starters() {
    return (window.SOG && SOG.collection && SOG.collection.STARTER_CARD_IDS) || [];
  }
  function _allCards() { return (typeof CARDS !== 'undefined') ? CARDS : []; }

  /* ══════════════════════════════════════════════════════════════════════
     READERS
     ══════════════════════════════════════════════════════════════════════ */
  function _readOwnedCardIds() {
    if (window.SOG && SOG.collection && typeof SOG.collection.getUnlockedCards === 'function') {
      return SOG.collection.getUnlockedCards().slice();
    }
    return [];
  }
  function _readGold() {
    return (window.SOG && SOG.gold && typeof SOG.gold.get === 'function') ? SOG.gold.get() : 0;
  }

  /* ══════════════════════════════════════════════════════════════════════
     WRITERS — all go through the game's own modules/keys.
     ══════════════════════════════════════════════════════════════════════ */

  /* Set the collection to EXACTLY `ids` (plus starters, which are config and
     always owned), using the collection's public API only. Ownership
     (sog_unlocked_cards) is what the deck builder gates on
     (isCardAvailable → SOG.Cards.isUnlocked), so this alone makes the builder
     show exactly this set.

     We deliberately do NOT blanket-write CARDS[].locked: that legacy view field
     is also read by game.js buildAiDeck and progression.js to pick ARCADIUM-lane
     cards, so force-locking unowned arcadium cards would starve AI deck building.
     resetCollection/unlockCard already maintain the lane-correct locked view. */
  function _applyCards(ids) {
    var col = window.SOG && SOG.collection;
    if (!col) return;
    var starters = _starters();
    var want = ids.slice();
    starters.forEach(function (id) { if (want.indexOf(id) === -1) want.push(id); });

    if (typeof col.resetCollection === 'function') col.resetCollection();
    var earned = want.filter(function (id) { return starters.indexOf(id) === -1; });
    if (earned.length && typeof col.unlockCard === 'function') col.unlockCard(earned);

    if (typeof col.syncDefaultDeck === 'function') col.syncDefaultDeck();
  }

  function _applyGold(amount) {
    var g = window.SOG && SOG.gold;
    if (!g) return;
    var n = Math.max(0, Math.floor(Number(amount) || 0));
    if (typeof g.reset === 'function') g.reset();
    if (n > 0 && typeof g.add === 'function') g.add(n);
  }

  function _applyFlags(map) {
    Object.keys(map).forEach(function (k) { _setFlag(k, !!map[k]); });
  }

  function _refreshHud() {
    var hud = window.SOG && SOG.HUD;
    if (!hud) return;
    try {
      if (typeof hud.refreshGold  === 'function') hud.refreshGold();
      if (typeof hud.refreshDecks === 'function') hud.refreshDecks();
      if (typeof hud.refreshFocus === 'function') hud.refreshFocus();
    } catch (e) {}
  }

  /* THE single write path. Everything staged lands here.

     The progression scrub's card delta is folded in ON TOP of the Cards
     section's staged list rather than written separately: _applyCards sets
     the collection to EXACTLY what it's handed, so a second pass would just
     undo the first. The scrub wins on conflict — it is the more specific
     intent (you moved the story to a point that either includes that card or
     doesn't). */
  function _applyAll() {
    if (_stagedCards) {
      var ids = _stagedCards.filter(function (id) { return _stagedCardDrop.indexOf(id) === -1; });
      _stagedCardAdd.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
      _applyCards(ids);
    }
    if (_stagedGold != null) _applyGold(_stagedGold);
    if (_stagedFlags) _applyFlags(_stagedFlags);
    _refreshHud();
    _dirty = false;
  }

  /* ══════════════════════════════════════════════════════════════════════
     LAUNCHERS
     ══════════════════════════════════════════════════════════════════════ */
  function _ensureAdventurer() {
    try { if (!localStorage.getItem('sog_selected_adventurer')) localStorage.setItem('sog_selected_adventurer', 'female'); } catch (e) {}
  }
  function _stopHomeMusic() {
    try { if (window.HomeFlow && typeof window.HomeFlow.stopMusic === 'function') window.HomeFlow.stopMusic(300); } catch (e) {}
  }
  function _teardownBattles() {
    ['GilgameshBattle', 'OtziBattle', 'NarmerBattle', 'HammurabiBattle', 'SargonBattle', 'HangingGardensBattle']
      .forEach(function (name) {
        try { if (window.SOG && SOG[name] && typeof SOG[name].teardown === 'function') SOG[name].teardown(); }
        catch (e) { console.warn('[DevPanel] teardown failed for', name, e); }
      });
  }
  /* Launching always commits staged edits first — you configure state in order
     to launch into it, so silently launching into the OLD state would be the
     same trap the single-apply model exists to remove. */
  function _commitBeforeLaunch() { if (_dirty) _applyAll(); }

  function _launchBattle(boss, tier, skipIntro) {
    _commitBeforeLaunch();
    _ensureAdventurer();
    // Actively set the flag BOTH ways — not just when skipping. Each boss's
    // own opening-dialogue gate reads this same key (e.g. narmer.js's
    // KEY_NARMER_OPENING_SEEN, checked in onNodeClick before OPENING_DIALOGUE
    // runs), so if it was left 'true' by an earlier launch, real gameplay, or
    // a previous test, only setting it when skipIntro is true would leave
    // that stale value in place the moment you uncheck the box — the
    // checkbox would look off while the opening still silently skipped.
    if (boss.skipFlag) _setFlag(boss.skipFlag, !!skipIntro);
    hide();
    _stopHomeMusic();
    _teardownBattles();
    window.__forceTier = tier;
    var mod = window.SOG && SOG[boss.module];
    if (mod && typeof mod.start === 'function') { mod.start(); }
    else { window.__forceTier = null; console.warn('[DevPanel] ' + boss.module + ' not found'); }
  }

  function _launchOverworld(mapId) {
    _commitBeforeLaunch();
    _ensureAdventurer();
    hide();
    _stopHomeMusic();
    _teardownBattles();
    try {
      localStorage.setItem('sog_overworld_map', mapId);
      localStorage.removeItem('sog_overworld_pos');
    } catch (e) {}
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    if (window.Overworld && typeof window.Overworld.init === 'function') window.Overworld.init();
  }

  function _playD1() {
    _commitBeforeLaunch();
    _ensureAdventurer();
    _setFlag('sog_mesopotamia_arrival_complete', false);
    _launchOverworld('eastafrica');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.playD1 === 'function') window.Overworld.playD1();
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════════════════
     UI
     ══════════════════════════════════════════════════════════════════════ */

  var _panel = null, _statusEl = null, _statusTimer = null, _bodyEl = null, _applyBtn = null;
  // Staged (unapplied) edits — written only by _applyAll().
  var _stagedCards = null, _stagedGold = null, _stagedFlags = null;
  var _dirty = false;
  // Collapse state persists across re-renders so applying doesn't fold your groups.
  var _groupOpen = {};
  // Launch controls (Section 4) aren't staged/applied state at all — they're
  // read live at boss-launch-click time (_launchBattle(b, tierSel.value,
  // skipCb.checked)) — but _render() rebuilds the whole panel from scratch
  // on every open AND after every Apply (see _applyBtn's click handler), and
  // a freshly-created <input>/<select> has no memory of what you last set
  // it to. Without these, "skip intro dialogue" silently snapped back to
  // its hardcoded default the moment you hit Apply, making it impossible to
  // turn off for more than one battle launch. Same fix _groupOpen already
  // uses for section collapse state: a module-level variable that survives
  // the rebuild, read on create and written on change.
  var _skipIntro = true;
  var _launchTier = 'serf';

  function _markDirty() {
    _dirty = true;
    if (_applyBtn) _applyBtn.classList.add('dp-pending');
    var b = document.getElementById('dp-dirty-banner');
    if (b) b.style.display = 'block';
  }

  function _injectStyles() {
    if (document.getElementById('sog-dev-panel-style')) return;
    var P = '#' + PANEL_ID;
    var css =
      P + '{position:fixed;top:10px;right:10px;width:440px;max-height:92vh;display:flex;flex-direction:column;' +
        'z-index:99999;background:rgba(8,6,4,0.96);border:2px solid #d4aa50;border-radius:6px;' +
        'box-shadow:0 6px 28px rgba(0,0,0,.7);font-family:"Courier New",monospace;font-size:12px;color:#e8d8a0;' +
        'opacity:0;pointer-events:none;transition:opacity .15s ease;}' +
      P + '.visible{opacity:1;pointer-events:auto;}' +
      P + ' .dp-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 6px;' +
        'border-bottom:1px solid rgba(212,170,80,.4);flex:0 0 auto;}' +
      P + ' .dp-title{color:#f8d000;font-weight:bold;letter-spacing:1px;}' +
      P + ' .dp-x{cursor:pointer;color:#caa84e;font-size:15px;background:none;border:none;font-family:inherit;}' +
      P + ' .dp-x:hover{color:#fff;}' +
      P + ' .dp-body{overflow-y:auto;padding:0 12px 8px;flex:1 1 auto;}' +
      P + ' .dp-sec{margin:12px 0 4px;color:#f8d000;font-size:11px;text-transform:uppercase;letter-spacing:.8px;' +
        'border-bottom:1px solid rgba(212,170,80,.25);padding-bottom:3px;}' +
      P + ' .dp-note{color:#9c8a55;font-size:10px;line-height:1.35;margin:3px 0 5px;}' +
      P + ' .dp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:5px 0;}' +
      P + ' .dp-btn{padding:5px 9px;background:rgba(212,170,80,.09);border:1px solid rgba(212,170,80,.4);' +
        'border-radius:4px;color:#e8d8a0;font-family:inherit;font-size:11px;cursor:pointer;}' +
      P + ' .dp-btn:hover{background:rgba(212,170,80,.24);border-color:#d4aa50;}' +
      P + ' .dp-btn.dp-danger{background:rgba(220,90,70,.12);border-color:#b5563f;color:#f0b9ac;}' +
      P + ' .dp-btn.dp-danger:hover{background:rgba(220,90,70,.28);}' +
      // group header (checkbox + arrow + title)
      P + ' .dp-ghead{display:flex;align-items:center;gap:6px;margin:6px 0 2px;padding:3px 5px;cursor:pointer;' +
        'background:rgba(212,170,80,.07);border:1px solid rgba(212,170,80,.22);border-radius:4px;}' +
      P + ' .dp-ghead:hover{background:rgba(212,170,80,.15);}' +
      P + ' .dp-arrow{width:10px;display:inline-block;color:#caa84e;}' +
      P + ' .dp-gname{flex:1;color:#e8d8a0;font-size:11px;}' +
      P + ' .dp-gcount{color:#9c8a55;font-size:10px;}' +
      P + ' .dp-glist{display:grid;grid-template-columns:1fr 1fr;gap:0 8px;padding:3px 6px 5px 22px;}' +
      P + ' label.dp-chk{display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:1px 0;line-height:1.3;}' +
      P + ' label.dp-chk.dp-fixed{opacity:.55;cursor:not-allowed;}' +
      P + ' label.dp-chk input{margin:0;flex:0 0 auto;}' +
      P + ' .dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 8px;' +
        'border:1px solid rgba(212,170,80,.2);border-radius:4px;padding:5px 6px;background:rgba(0,0,0,.25);}' +
      P + ' .dp-eragrp{color:#caa84e;font-size:10px;margin:7px 0 2px;text-transform:uppercase;letter-spacing:.5px;}' +
      P + ' input[type=number],select{background:rgba(0,0,0,.4);border:1px solid rgba(212,170,80,.4);color:#e8d8a0;' +
        'font-family:inherit;font-size:11px;padding:4px 6px;border-radius:3px;}' +
      P + ' .dp-cur{color:#8ad08a;font-size:10px;}' +
      P + ' .dp-bosstbl{width:100%;border-collapse:collapse;font-size:11px;}' +
      P + ' .dp-bosstbl td,' + P + ' .dp-bosstbl th{padding:2px 4px;text-align:left;}' +
      P + ' .dp-bosstbl th{color:#caa84e;font-size:10px;font-weight:normal;}' +
      // footer + apply
      P + ' .dp-foot{flex:0 0 auto;padding:7px 12px;border-top:1px solid rgba(212,170,80,.35);' +
        'background:rgba(0,0,0,.35);display:flex;flex-direction:column;gap:5px;}' +
      P + ' .dp-applybtn{width:100%;padding:9px;background:rgba(120,200,120,.15);border:1px solid #6db76d;' +
        'border-radius:4px;color:#bdf0bd;font-family:inherit;font-size:13px;font-weight:bold;cursor:pointer;' +
        'letter-spacing:.5px;}' +
      P + ' .dp-applybtn:hover{background:rgba(120,200,120,.32);}' +
      P + ' .dp-applybtn.dp-pending{background:rgba(240,190,60,.2);border-color:#e0b93c;color:#ffe9a8;' +
        'animation:dpPulse 1.4s ease-in-out infinite;}' +
      '@keyframes dpPulse{0%,100%{opacity:1}50%{opacity:.72}}' +
      P + ' .dp-dirty{display:none;color:#ffd97a;font-size:10px;text-align:center;}' +
      P + ' .dp-status{color:#8ad08a;font-size:10px;text-align:center;min-height:12px;}';
    var s = document.createElement('style');
    s.id = 'sog-dev-panel-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function _btn(label, cls, onClick) {
    var b = _el('button', 'dp-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return b;
  }
  function _sec(title) { return _el('div', 'dp-sec', title); }
  function _note(text) { return _el('div', 'dp-note', text); }

  /* ── SECTION 0 · NUCLEAR (top, per request) ────────────────────────── */
  function _buildNuclearSection(frag) {
    frag.appendChild(_sec('☢ Reset everything'));
    var row = _el('div', 'dp-row');
    row.appendChild(_btn('Clear adventure progress + reload', 'dp-danger', function () {
      if (!window.confirm('Clear ALL adventure progress? (audio settings kept)')) return;
      var keep = /^(sog_dev_menu_visible|sog_music|sog_sfx|sog_volume|sog_muted|sog_master)/i;
      var rm = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sog_/.test(k) && !keep.test(k)) rm.push(k);
      }
      rm.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      location.reload();
    }));
    row.appendChild(_btn('Wipe everything + reload', 'dp-danger', function () {
      if (!window.confirm('Wipe ALL localStorage? (full reset)')) return;
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    }));
    frag.appendChild(row);
  }

  /* ── SECTION 1 · CARDS ─────────────────────────────────────────────── */
  function _buildCardsSection(frag) {
    frag.appendChild(_sec('1 · Cards — collection'));
    _stagedCards = _readOwnedCardIds();
    var starters = _starters();

    frag.appendChild(_note('Boxes show what is ACTUALLY owned right now. Starters are dimmed ' +
      '(always owned). Tokens are not deckable. Click a group name to expand; the box beside ' +
      'it toggles that whole group. Nothing is saved until APPLY ALL CHANGES.'));

    // Build the groups
    var groups = {}, present = [];
    _allCards().forEach(function (c) {
      var g = _groupOf(c);
      if (!groups[g]) { groups[g] = []; present.push(g); }
      groups[g].push(c);
    });
    var ordered = GROUP_ORDER.filter(function (g) { return groups[g]; })
      .concat(present.filter(function (g) { return GROUP_ORDER.indexOf(g) === -1; }));

    function _selectable(list) {
      return list.filter(function (c) { return !c.token && starters.indexOf(c.id) === -1; });
    }
    function _stagedHas(id) { return _stagedCards.indexOf(id) !== -1; }
    function _stage(id, on) {
      var i = _stagedCards.indexOf(id);
      if (on && i === -1) _stagedCards.push(id);
      else if (!on && i !== -1) _stagedCards.splice(i, 1);
    }

    var unlockAllCb;                     // forward ref for sync
    var groupCbs = {};                   // group name → checkbox
    var countEl = _el('span', 'dp-cur');

    function _syncHeaders() {
      var totalSel = 0, totalAll = 0;
      ordered.forEach(function (g) {
        var sel = _selectable(groups[g]);
        var on  = sel.filter(function (c) { return _stagedHas(c.id); }).length;
        totalSel += on; totalAll += sel.length;
        var cb = groupCbs[g];
        if (cb) {
          cb.checked       = sel.length > 0 && on === sel.length;
          cb.indeterminate = on > 0 && on < sel.length;
        }
        var cnt = document.getElementById('dp-gcount-' + g.replace(/\W/g, ''));
        if (cnt) cnt.textContent = on + '/' + sel.length;
      });
      if (unlockAllCb) {
        unlockAllCb.checked       = totalAll > 0 && totalSel === totalAll;
        unlockAllCb.indeterminate = totalSel > 0 && totalSel < totalAll;
      }
      countEl.textContent = 'owned now: ' + _readOwnedCardIds().length + '  ·  staged: ' + _stagedCards.length;
    }

    // ── Unlock All (top of the card section) ──
    var allRow = _el('div', 'dp-row');
    var allLab = _el('label', 'dp-chk');
    unlockAllCb = document.createElement('input');
    unlockAllCb.type = 'checkbox';
    unlockAllCb.id = 'dp-unlock-all';
    unlockAllCb.addEventListener('change', function () {
      var on = unlockAllCb.checked;
      ordered.forEach(function (g) {
        _selectable(groups[g]).forEach(function (c) { _stage(c.id, on); });
      });
      // repaint every card box
      _bodyEl.querySelectorAll('input[data-card-id]').forEach(function (cb) {
        if (cb.disabled) return;
        cb.checked = _stagedHas(parseInt(cb.dataset.cardId, 10));
      });
      _syncHeaders();
      _markDirty();
    });
    allLab.appendChild(unlockAllCb);
    allLab.appendChild(_el('span', null, 'UNLOCK ALL'));
    allRow.appendChild(allLab);
    allRow.appendChild(countEl);
    frag.appendChild(allRow);

    // ── Collapsible groups ──
    ordered.forEach(function (g) {
      var list = groups[g];
      var sel  = _selectable(list);
      var safeId = g.replace(/\W/g, '');
      if (_groupOpen[g] === undefined) _groupOpen[g] = false;   // collapsed by default

      var head = _el('div', 'dp-ghead');
      var gcb  = document.createElement('input');
      gcb.type = 'checkbox';
      gcb.disabled = sel.length === 0;                 // tokens group has nothing selectable
      gcb.addEventListener('click', function (e) { e.stopPropagation(); });
      gcb.addEventListener('change', function () {
        sel.forEach(function (c) { _stage(c.id, gcb.checked); });
        listEl.querySelectorAll('input[data-card-id]').forEach(function (cb) {
          if (cb.disabled) return;
          cb.checked = _stagedHas(parseInt(cb.dataset.cardId, 10));
        });
        _syncHeaders();
        _markDirty();
      });
      groupCbs[g] = gcb;

      var arrow = _el('span', 'dp-arrow', _groupOpen[g] ? '▼' : '▶');
      var cnt   = _el('span', 'dp-gcount');
      cnt.id = 'dp-gcount-' + safeId;

      head.appendChild(gcb);
      head.appendChild(arrow);
      head.appendChild(_el('span', 'dp-gname', g));
      head.appendChild(cnt);
      frag.appendChild(head);

      var listEl = _el('div', 'dp-glist');
      listEl.style.display = _groupOpen[g] ? 'grid' : 'none';
      list.forEach(function (c) {
        var fixed = c.token || starters.indexOf(c.id) !== -1;
        var lab = _el('label', 'dp-chk' + (fixed ? ' dp-fixed' : ''));
        var cb  = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked  = _stagedHas(c.id);
        cb.disabled = fixed;
        cb.dataset.cardId = String(c.id);
        cb.addEventListener('change', function () {
          _stage(c.id, cb.checked);
          _syncHeaders();
          _markDirty();
        });
        lab.appendChild(cb);
        lab.appendChild(_el('span', null, c.id + ' ' + c.name));
        listEl.appendChild(lab);
      });
      frag.appendChild(listEl);

      head.addEventListener('click', function () {
        _groupOpen[g] = !_groupOpen[g];
        listEl.style.display = _groupOpen[g] ? 'grid' : 'none';
        arrow.textContent = _groupOpen[g] ? '▼' : '▶';
      });
    });

    _syncHeaders();
  }

  /* ── SECTION 2 · GOLD ──────────────────────────────────────────────── */
  function _buildGoldSection(frag) {
    frag.appendChild(_sec('2 · Gold'));
    var cur = _readGold();
    _stagedGold = cur;
    var row = _el('div', 'dp-row');
    row.appendChild(_el('span', null, 'Set gold to:'));
    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.style.width = '90px';
    inp.value = String(cur);
    inp.addEventListener('input', function () { _stagedGold = inp.value; _markDirty(); });
    row.appendChild(inp);
    row.appendChild(_el('span', 'dp-cur', 'current: ' + cur));
    frag.appendChild(row);
  }

  /* ── SECTION 3 · PROGRESSION — battle-tier scrubber ─────────────────────
     Deliberately does NOT read window.SOG_MAP_DATA.milestones — that list is
     node-REVEAL granularity ("Babylon revealed"), the wrong unit for
     battle-state testing, and the map editor's own Story-point slider still
     owns it; this panel must never write to it. Each stop here is one
     battle TIER instead: most bosses get two stops ("<Boss> — Serf" /
     "— Giant"), a handful get one (no Serf/Giant split).

     BATTLE_ORDER below is the only hand-curated part — a flat list of which
     node, on which map, comes next. It has to be curated: the underlying
     showFrom gates mix boss-beaten flags, node-REVEAL flags (sog_sargon_
     node_revealed, ...) and region-"complete" flags (egypt-complete, ...) in
     ways that don't reduce to one mechanical rule off a single node's own
     fields — e.g. Jesus/Paul sit in the 'levant' map's node array but their
     showFrom chain places them after Rome's Augustus. Traced by hand once
     by walking every battle node's showFrom back to its origin and
     cross-checked against every existing milestones.js "-complete" entry.

     Everything ELSE about a stop is read LIVE off the node object — name,
     hook, tiers, victoryFlag — nothing about an individual boss is
     duplicated here. A new TWO-TIER boss slotted into an existing map needs
     one [mapId, nodeId] line added below; its label/tiers/flags are then
     pulled fresh every time the panel opens, same as every other boss.
     Single- vs two-tier is the tiers:2 check in _battleStops — purely
     generic, no boss name hardcoded as "the exception": Darius and Hannibal
     read as single-tier today because their OWN node data says tiers:1, and
     a future Attila (or anyone else) would read the same way the moment his
     node exists — nothing here needs to change. The two Prehistory nodes
     are the one true exception: they carry no `hook` field at all (their
     battle modules use bespoke completion flags, not the
     sog_node_<hook>_<tier>_beaten pattern), so NO_HOOK_FLAGS below is the
     only per-boss hardcoding in this file. */
  var BATTLE_ORDER = [
    ['eastafrica',  'prehistory'],
    ['eastafrica',  'egypt-signpost'],
    ['mesopotamia', 'walls-of-uruk'],
    ['mesopotamia', 'sargon'],
    ['mesopotamia', 'hammurabi'],
    ['mesopotamia', 'hanging-gardens'],
    ['egypt',       'narmer'],
    ['upper-egypt', 'hatshepsut'],
    ['upper-egypt', 'ramses'],
    ['upper-egypt', 'akhenaten'],
    ['upper-egypt', 'kush'],
    ['india',       'greatbath'],
    ['india',       'siddhartha'],
    ['india',       'ashoka'],
    ['china',       'confucius'],
    ['china',       'shihuangdi'],
    ['china',       'zhangqian'],
    ['persia',      'darius'],
    ['levant',      'abraham'],
    ['levant',      'moses'],
    ['levant',      'david'],
    ['greece',      'leonidas'],
    ['greece',      'pericles'],
    ['greece',      'socrates'],
    ['greece',      'alexander'],
    ['rome',        'romulus'],
    ['rome',        'cincinnatus'],
    ['rome',        'hannibal'],
    ['rome',        'julius'],
    ['rome',        'augustus'],
    ['levant',      'jesus'],
    ['levant',      'paul'],
    ['rome',        'constantine']
  ];
  var NO_HOOK_FLAGS = {
    'prehistory':     'sog_battle_neanderthal_complete',
    'egypt-signpost': 'sog_battle_otzi_complete'
  };
  /* node.name is a MAP label, not the boss identity — it's "Akkad"/"Babylon"/
     "The Hanging Gardens" for the three Mesopotamia Giants, and "To Egypt"/
     "Prehistory" for the two structural nodes (Otzi's node has no label at
     all: see its own note in map-data.js). Override with the boss's actual
     name — same names already shown elsewhere in this panel's own BOSSES
     list and in the shipped card names (cards.js #34/#35) — everywhere else
     node.name already IS the boss name, so this stays a short exception
     table, not a parallel name database. */
  var NAME_OVERRIDES = {
    'egypt-signpost':  'Otzi',
    'prehistory':      'Neanderthal',
    'walls-of-uruk':   'Gilgamesh',
    'sargon':          'Sargon',
    'hammurabi':       'Hammurabi',
    'hanging-gardens': 'Nebuchadnezzar'
  };

  /* Build the ordered stop list fresh every call — reads LIVE node data, so
     a renamed/retiered boss (or one BATTLE_ORDER references that's since
     been removed) always reflects current data/map-data.js, not a snapshot. */
  function _battleStops() {
    var maps = (window.SOG_MAP_DATA && window.SOG_MAP_DATA.maps) || {};
    var stops = [];
    BATTLE_ORDER.forEach(function (ref) {
      var mapId = ref[0], nodeId = ref[1];
      var nodes = (maps[mapId] && maps[mapId].nodes) || [];
      var node = null;
      for (var i = 0; i < nodes.length; i++) { if (nodes[i].id === nodeId) { node = nodes[i]; break; } }
      if (!node) return;   // renamed/removed out from under this order entry — skip, don't throw
      var label = NAME_OVERRIDES[node.id] || node.name || node.id;
      var noHookFlag = NO_HOOK_FLAGS[nodeId];
      if (noHookFlag) { stops.push({ label: label, flag: noHookFlag, nar: _narrative(nodeId, 'single') }); return; }
      if (!node.hook) return;
      if (node.tiers === 2) {
        stops.push({ label: label + ' — Serf',  flag: 'sog_node_' + node.hook + '_serf_beaten',
                     nar: _narrative(nodeId, 'serf',  node.hook) });
        stops.push({ label: label + ' — Giant', flag: 'sog_node_' + node.hook + '_giant_beaten',
                     nar: _narrative(nodeId, 'giant', node.hook) });
      } else {
        stops.push({ label: label, flag: 'sog_node_' + node.hook + '_giant_beaten',
                     nar: _narrative(nodeId, 'single', node.hook) });
      }
    });
    return stops;
  }

  /* ── NARRATIVE / "SEEN" STATE PER STOP ─────────────────────────────────
     Beaten flags alone are NOT the game's state. Two separate problems:

     BACKWARD — the one-time "seen" flags (battle openings, overworld
     encounters, arrival beats) survive a rewind, so scrubbing back and
     re-beating a boss skips every piece of dialogue: the state says beaten
     is false but met/opening/encountered are still true.

     FORWARD — worse, and non-obvious: the early game's node VISIBILITY does
     not key off beaten flags at all. data/map-data.js's showFrom chain runs
     through milestones whose flags are narrative (see its `milestones`
     array): mesopotamia-arrival → sog_mesopotamia_arrival_complete,
     gilgamesh-beaten → sog_battle_gilgamesh_complete, sargon-revealed →
     sog_sargon_node_revealed, neb-beaten → sog_egypt_node_live. Setting only
     sog_node_*_beaten leaves every stop up to Narmer cosmetic — flags
     stamped, nodes still invisible. Both directions are handled here.

     This table is hand-written because the flags genuinely do not reduce to
     a pattern — confirmed by reading every setter:
       · opening-seen is sog_<hook>_opening_seen for gilgamesh/sargon/
         hammurabi/hatshepsut/otzi, but narmer and hanging-gardens insert an
         extra _battle_, and hanging-gardens ALSO spells its hook with
         underscores (its beaten flag keeps the hyphen:
         sog_node_hanging-gardens_giant_beaten). Prehistory has none at all.
       · only 3 of 8 bosses have a sog_met_* flag (gilgamesh/narmer/
         hatshepsut); sargon and hammurabi gate on the generic encountered
         stamp alone.
       · the legacy sog_battle_*_complete fallbacks (overworld.js
         LEGACY_ENCOUNTERED) rename two bosses outright — hanging-gardens →
         _nebuchadnezzar_, prehistory → _neanderthal_.
       · transition/arrival/reveal flags are per-beat one-offs with no
         relation to any hook name.
     sog_node_encountered_<hook> is the ONE genuinely generic key (game.js
     endGame writes it from the raw hook), so it is derived below, not listed.

     Each transition attaches to the stop that PRECEDES it — the reveal that
     fires on a Giant win lives on that Giant stop, so stepping one stop back
     from it re-hides the node it revealed.

     `set`   — bidirectional: true at/before this stop, cleared after it.
     `cards` — a card DELIVERED at this stop, {id, flag}: bidirectional, with
               the collection kept in sync so the flag and the card never
               disagree (the whole point of tracking them together).
     `clear` — cleared after this stop but never set going forward, for
               CONDITIONAL beats that aren't part of linear progress.
               Cuneiform is the only one: it's granted by the Farmer
               intervention after LOSING to Gilgamesh, so scrubbing forward
               must not fabricate it, while scrubbing back must undo it.

     The six BOSS cards (Sargon 37, Gilgamesh 43, Hammurabi 47, Neb 50,
     Narmer 51, Hatshepsut 52) are deliberately absent: they have no
     delivered-flag, gating instead on sog_node_<hook>_giant_beaten through
     SOG.rewards.consume — clearing the beaten flag already re-arms the
     grant, so the card is re-won on the replay rather than confiscated. */
  var NARRATIVE = {
    'prehistory': { single: {
      // The intro gates the whole map; beating Neanderthal implies it ran.
      set: ['sog_adventure_intro_complete', 'sog_post_neanderthal_overworld_complete'],
      cards: [{ id: 33, flag: 'sog_card_lucy_unlocked' }]     // Lucy — post-victory goodbye
    } },
    'egypt-signpost': { single: {
      set: ['sog_otzi_opening_seen',
            'sog_eastafrica_postotzi_dialogue_seen',           // East Africa return beat
            'sog_toegypt_goodbye_seen',                        // Hunter's goodbye on the To Egypt click
            'sog_mesopotamia_arrival_complete'],               // gates walls-of-uruk (mesopotamia-arrival)
      cards: [{ id: 35, flag: 'sog_card_otzi_unlocked' }]
    } },
    'walls-of-uruk': {
      serf: {
        set: ['sog_met_gilgamesh', 'sog_gilgamesh_opening_seen',
              'sog_battle_gilgamesh_complete',                 // gilgamesh-beaten milestone
              'sog_gilgamesh_phase1_complete',
              // First market return is the post-Serf-win shopping trip.
              'sog_market_first_visit_done', 'sog_market_intro_seen',
              'sog_first_market_interstitial_seen', 'sog_deckbuilder_unlocked'],
        clear: [{ flag: 'sog_cuneiform_granted', card: 46 }]
      },
      giant: { set: ['sog_sargon_node_revealed'] }             // dust-storm reveal fires on the Giant win
    },
    'sargon': {
      serf:  { set: ['sog_sargon_opening_seen', 'sog_battle_sargon_complete'] },
      giant: { set: ['sog_hammurabi_node_revealed'] }
    },
    'hammurabi': {
      serf:  { set: ['sog_hammurabi_opening_seen', 'sog_battle_hammurabi_complete'] },
      giant: { set: ['sog_hanging_gardens_revealed'] }
    },
    'hanging-gardens': {
      serf:  { set: ['sog_hanging_gardens_battle_opening_seen',   // NOT sog_hanging-gardens_opening_seen
                     'sog_hanging_gardens_flood_intro_seen',
                     'sog_battle_nebuchadnezzar_complete'] },     // legacy key renames the boss
      giant: { set: ['sog_egypt_node_live',                       // neb-beaten → opens Egypt + Narmer
                     'sog_egypt_arrival_seen', 'sog_egypt_node_arrival_seen',
                     'sog_egypt_market_intro_seen'] }
    },
    'narmer': {
      serf:  { set: ['sog_met_narmer', 'sog_narmer_battle_opening_seen',  // extra _battle_
                     'sog_battle_narmer_complete'] },
      // The journey south fires off the GIANT win, so it belongs to that stop —
      // rewinding one stop back re-arms it, same rule as the node reveals above.
      giant: { set: ['sog_hatshepsut_transition_seen'] }
    },
    'hatshepsut': {
      // The Merchant's two cards are delivered on the first SERF result (win or
      // loss). Declared as `cards` rather than a plain flag so the gate and the
      // cards move together: a rewind that re-arms the delivery also takes the
      // gift back, instead of leaving a cleared flag beside cards you still own.
      serf:  { set: ['sog_met_hatshepsut', 'sog_hatshepsut_opening_seen'],
               cards: [{ id: 900, flag: 'sog_hatshepsut_cards_delivered' },
                       { id: 75,  flag: 'sog_hatshepsut_cards_delivered' }] },
      giant: { set: [] }
    }
  };

  /* Resolve one stop's narrative payload: the table entry (if any) plus the
     generic encountered stamp. The stamp belongs on the FIRST stop of a boss
     — it means "this node's battle has been completed at least once", which
     is exactly what the Serf (or single) stop represents. */
  function _narrative(nodeId, tier, hook) {
    var e = (NARRATIVE[nodeId] && NARRATIVE[nodeId][tier]) || {};
    var set = (e.set || []).slice();
    if (hook && tier !== 'giant') set.push('sog_node_encountered_' + hook);
    return { set: set, cards: e.cards || [], clear: e.clear || [] };
  }

  /* Reflect real state on open: the furthest-along stop whose beaten flag is
     already set. Assumes normal (monotonic) progression. */
  function _currentBattleIdx(stops) {
    var idx = 0;
    stops.forEach(function (s, i) { if (_getFlag(s.flag)) idx = i; });
    return idx;
  }

  /* Staged card delta from the progression scrub, folded into the card set at
     apply time (see _applyAll). Kept separate from _stagedCards so the Cards
     section's own checkboxes stay independent of the scrub. */
  var _stagedCardAdd = [], _stagedCardDrop = [];

  /* Stage the FULL state for stop `idx` — beaten + narrative + delivered
     cards, in both directions. Two passes so a flag listed on more than one
     stop can never be cleared by a later stop's pass: collect every flag this
     scrubber owns as false, then turn on everything at/before idx. */
  function _stageBattle(stops, idx) {
    var flags = {};
    _stagedCardAdd = []; _stagedCardDrop = [];
    stops.forEach(function (s) {
      flags[s.flag] = false;
      s.nar.set.forEach(function (f) { flags[f] = false; });
      s.nar.cards.forEach(function (c) { flags[c.flag] = false; });
      s.nar.clear.forEach(function (c) { flags[c.flag] = false; });
    });
    stops.forEach(function (s, i) {
      if (i > idx) {
        // After the scrub point: the conditional beats get undone too.
        s.nar.clear.forEach(function (c) {
          if (c.card != null && _stagedCardDrop.indexOf(c.card) === -1) _stagedCardDrop.push(c.card);
        });
        s.nar.cards.forEach(function (c) {
          if (_stagedCardDrop.indexOf(c.id) === -1) _stagedCardDrop.push(c.id);
        });
        return;
      }
      flags[s.flag] = true;
      s.nar.set.forEach(function (f) { flags[f] = true; });
      s.nar.cards.forEach(function (c) {
        flags[c.flag] = true;
        if (_stagedCardAdd.indexOf(c.id) === -1) _stagedCardAdd.push(c.id);
      });
      // `clear` entries are left exactly as the save already has them.
      s.nar.clear.forEach(function (c) { delete flags[c.flag]; });
    });
    _stagedFlags = flags;
  }

  /* What APPLY is about to do, in the player's terms — surfaced under the
     slider and again in the confirm() when cards would actually be taken
     away, so a rewind can never quietly shrink the collection. */
  function _scrubSummary() {
    var set = 0, cleared = 0;
    Object.keys(_stagedFlags || {}).forEach(function (k) {
      var want = !!_stagedFlags[k], now = _getFlag(k);
      if (want && !now) set++;
      else if (!want && now) cleared++;
    });
    var owned = _readOwnedCardIds();
    var starters = _starters();
    var drop = _stagedCardDrop.filter(function (id) {
      return owned.indexOf(id) !== -1 && starters.indexOf(id) === -1;
    });
    var add = _stagedCardAdd.filter(function (id) { return owned.indexOf(id) === -1; });
    return { set: set, cleared: cleared, drop: drop, add: add };
  }

  function _cardName(id) {
    var c = _allCards().filter(function (x) { return x.id === id; })[0];
    return c ? c.name : ('#' + id);
  }

  function _buildProgressionSection(frag) {
    frag.appendChild(_sec('3 · Progression — battle-tier scrubber'));

    var stops = _battleStops();
    if (!stops.length) {
      frag.appendChild(_note('No battle stops resolved — is data/map-data.js loaded?'));
      _stagedFlags = {};
      return;
    }

    frag.appendChild(_note('One stop per battle TIER (Serf/Giant split where the boss has one), in ' +
      'game order. Drag or step ◀▶ to a stop, then APPLY: the save is rewritten to that exact point — ' +
      'beaten flags AND narrative state (openings, encounters, arrivals, node reveals) both directions, ' +
      'so nodes actually appear going forward and dialogue replays going back.'));

    var idx = Math.min(_currentBattleIdx(stops), stops.length - 1);
    _stageBattle(stops, idx);

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min  = '0';
    slider.max  = String(stops.length - 1);
    slider.step = '1';
    slider.value = String(idx);
    slider.style.flex = '1';

    var labelEl = _el('div', 'dp-cur', stops[idx].label);
    var sumEl   = _el('div', 'dp-note');

    function _sync() {
      slider.value = String(idx);
      labelEl.textContent = stops[idx] ? stops[idx].label : '—';
      prevBtn.disabled = idx <= 0;
      nextBtn.disabled = idx >= stops.length - 1;
      prevBtn.style.opacity = prevBtn.disabled ? '.35' : '1';
      nextBtn.style.opacity = nextBtn.disabled ? '.35' : '1';
      var s = _scrubSummary();
      var bits = [];
      if (s.set)     bits.push(s.set + ' flag' + (s.set === 1 ? '' : 's') + ' set');
      if (s.cleared) bits.push(s.cleared + ' cleared');
      if (s.add.length)  bits.push('grant ' + s.add.map(_cardName).join(', '));
      if (s.drop.length) bits.push('REMOVE ' + s.drop.map(_cardName).join(', '));
      sumEl.textContent = bits.length ? ('On apply: ' + bits.join(' · ')) : 'On apply: no change.';
      sumEl.style.color = s.drop.length ? '#ffb4a8' : '';
    }
    /* Stepping only moves the staged selection (same _stageBattle as a drag)
       — it never touches localStorage itself. APPLY ALL CHANGES is still the
       only write path, so free-stepping to a target can't thrash game state. */
    function _setIdx(i) {
      idx = Math.max(0, Math.min(stops.length - 1, i));
      _stageBattle(stops, idx);
      _sync();
      _markDirty();
    }

    var prevBtn = _btn('◀', null, function () { _setIdx(idx - 1); });
    var nextBtn = _btn('▶', null, function () { _setIdx(idx + 1); });
    _sync();   // initial disabled state — idx is already staged above, so no _markDirty here

    var row = _el('div', 'dp-row');
    row.appendChild(prevBtn);
    row.appendChild(slider);
    row.appendChild(nextBtn);
    frag.appendChild(row);
    frag.appendChild(labelEl);
    frag.appendChild(sumEl);

    slider.addEventListener('input', function () { _setIdx(Number(slider.value)); });
  }

  /* ── SECTION 4 · LAUNCH ────────────────────────────────────────────── */
  function _buildLaunchSection(frag) {
    frag.appendChild(_sec('4 · Launch'));
    frag.appendChild(_note('Launching APPLIES any staged changes first, then goes — so you always ' +
      'land in the state shown above. Battles bake window.__forceTier, the same one-shot the real ' +
      'node click uses.'));

    var ctl = _el('div', 'dp-row');
    ctl.appendChild(_el('span', null, 'Tier:'));
    var tierSel = document.createElement('select');
    [['serf', 'Serf'], ['giant', 'Giant']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      tierSel.appendChild(op);
    });
    tierSel.value = _launchTier;
    tierSel.addEventListener('change', function () { _launchTier = tierSel.value; });
    ctl.appendChild(tierSel);
    var skipLab = _el('label', 'dp-chk');
    var skipCb  = document.createElement('input');
    skipCb.type = 'checkbox'; skipCb.checked = _skipIntro;
    skipCb.addEventListener('change', function () { _skipIntro = skipCb.checked; });
    skipLab.appendChild(skipCb);
    skipLab.appendChild(_el('span', null, 'skip intro dialogue'));
    ctl.appendChild(skipLab);
    frag.appendChild(ctl);

    var brow = _el('div', 'dp-row');
    BOSSES.forEach(function (b) {
      brow.appendChild(_btn(b.label, null, function () {
        _launchBattle(b, tierSel.value, skipCb.checked);
      }));
    });
    frag.appendChild(brow);

    frag.appendChild(_el('div', 'dp-eragrp', 'Overworld'));
    var mrow = _el('div', 'dp-row');
    MAPS.forEach(function (m) {
      mrow.appendChild(_btn(m.label, null, function () { _launchOverworld(m.id); }));
    });
    mrow.appendChild(_btn('Mesopotamia arrival (D1)', null, _playD1));
    frag.appendChild(mrow);

    frag.appendChild(_el('div', 'dp-eragrp', 'AI battle log'));
    var lrow = _el('div', 'dp-row');
    lrow.appendChild(_btn('Summary', null, function () {
      if (window.SOG && SOG.aiLog) SOG.aiLog.summary(); _flash('AI summary → console');
    }));
    lrow.appendChild(_btn('Dump', null, function () {
      if (window.SOG && SOG.aiLog) SOG.aiLog.dump(); _flash('AI log → console');
    }));
    lrow.appendChild(_btn('Clear log', null, function () {
      if (window.SOG && SOG.aiLog) SOG.aiLog.clear(); _flash('AI log cleared');
    }));
    frag.appendChild(lrow);
  }

  /* ══════════════════════════════════════════════════════════════════════
     PRESET SEAM — a preset is exactly the shape _readSnapshot() returns:
       • "save current state as preset"  → _readSnapshot()
       • "apply preset P"                → _applySnapshot(P) then _render()
     Add a PRESETS array + a row of buttons (its own section) calling
     _applySnapshot; every writer it needs already exists.
     ══════════════════════════════════════════════════════════════════════ */
  function _readSnapshot() {
    var flags = {};
    BOSSES.forEach(function (b) {
      flags['sog_node_' + b.hook + '_serf_beaten']  = _getFlag('sog_node_' + b.hook + '_serf_beaten');
      flags['sog_node_' + b.hook + '_giant_beaten'] = _getFlag('sog_node_' + b.hook + '_giant_beaten');
      flags['sog_node_encountered_' + b.hook]       = _getFlag('sog_node_encountered_' + b.hook);
    });
    // Every key the scrubber owns — beaten AND narrative — so a snapshot
    // round-trips the same state an APPLY writes, not just the beaten half.
    _battleStops().forEach(function (s) {
      flags[s.flag] = _getFlag(s.flag);
      s.nar.set.forEach(function (f) { flags[f] = _getFlag(f); });
      s.nar.cards.forEach(function (c) { flags[c.flag] = _getFlag(c.flag); });
      s.nar.clear.forEach(function (c) { flags[c.flag] = _getFlag(c.flag); });
    });
    return { cards: _readOwnedCardIds(), gold: _readGold(), flags: flags };
  }
  function _applySnapshot(snap) {
    if (!snap) return;
    if (snap.cards) _applyCards(snap.cards);
    if (snap.gold != null) _applyGold(snap.gold);
    if (snap.flags) _applyFlags(snap.flags);
    _refreshHud();
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER / SHELL
     ══════════════════════════════════════════════════════════════════════ */

  function _build() {
    if (_panel) return;
    _injectStyles();
    _panel = _el('div');
    _panel.id = PANEL_ID;

    var head = _el('div', 'dp-head');
    head.appendChild(_el('span', 'dp-title', '🛠 DEV STATE PANEL'));
    var x = _el('button', 'dp-x');
    x.innerHTML = '&#x2715;';
    x.title = 'Close (`)';
    x.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    head.appendChild(x);
    _panel.appendChild(head);

    _bodyEl = _el('div', 'dp-body');
    _panel.appendChild(_bodyEl);

    var foot = _el('div', 'dp-foot');
    var dirty = _el('div', 'dp-dirty', '⚠ unapplied changes');
    dirty.id = 'dp-dirty-banner';
    foot.appendChild(dirty);
    _applyBtn = _el('button', 'dp-applybtn', 'APPLY ALL CHANGES');
    _applyBtn.type = 'button';
    _applyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      /* Losing a card is the one thing here that can't be undone by scrubbing
         back, so it is the one thing that stops and asks. Everything else the
         panel does is a flag write the next apply can reverse. */
      var s = _scrubSummary();
      if (s.drop.length) {
        var msg = 'Rewinding the story removes ' + s.drop.length + ' card' +
                  (s.drop.length === 1 ? '' : 's') + ' from your collection:\n\n  ' +
                  s.drop.map(_cardName).join('\n  ') + '\n\n' +
                  'Flags: ' + s.set + ' set, ' + s.cleared + ' cleared' +
                  (s.add.length ? '\nAlso granting: ' + s.add.map(_cardName).join(', ') : '') +
                  '\n\nApply?';
        if (!window.confirm(msg)) return;
      }
      _applyAll();
      _flash('Applied — ' + _readOwnedCardIds().length + ' cards, ' + _readGold() + ' gold');
      _render();                      // re-read real state
    });
    foot.appendChild(_applyBtn);
    _statusEl = _el('div', 'dp-status');
    foot.appendChild(_statusEl);
    _panel.appendChild(foot);

    document.body.appendChild(_panel);
  }

  /* Rebuild the body from CURRENT REAL STATE. Called on open and after apply —
     this is what guarantees the panel never shows stale values. */
  function _render() {
    if (!_bodyEl) return;
    var scroll = _bodyEl.scrollTop;
    _bodyEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    _buildNuclearSection(frag);
    _buildCardsSection(frag);
    _buildGoldSection(frag);
    _buildProgressionSection(frag);
    _buildLaunchSection(frag);
    _bodyEl.appendChild(frag);
    _bodyEl.scrollTop = scroll;
    _dirty = false;
    if (_applyBtn) _applyBtn.classList.remove('dp-pending');
    var b = document.getElementById('dp-dirty-banner');
    if (b) b.style.display = 'none';
  }

  function _flash(msg) {
    if (!_statusEl) return;
    _statusEl.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    _statusTimer = setTimeout(function () { if (_statusEl) _statusEl.textContent = ''; }, 2500);
  }

  function show() {
    _build();
    _render();
    _panel.classList.add('visible');
    try { localStorage.setItem(VIS_KEY, 'true'); } catch (e) {}
  }
  function hide() {
    if (_panel) _panel.classList.remove('visible');
    try { localStorage.setItem(VIS_KEY, 'false'); } catch (e) {}
  }
  function isOpen() { return !!(_panel && _panel.classList.contains('visible')); }
  function toggle() { isOpen() ? hide() : show(); }

  /* Password prompt — self-contained (built here, not in index.html) so this whole
     file stays deletable in one move. Mirrors BypassAuth's behaviour: Enter or
     SUBMIT to try, Escape / click-outside to cancel, wrong entry shakes + shows
     ACCESS DENIED then closes. Never persists an unlocked state. */
  function _promptForPassword(onGranted) {
    var old = document.getElementById(PW_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var back = _el('div');
    back.id = PW_ID;
    back.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,.72);font-family:"Courier New",monospace;';
    var box = _el('div');
    box.style.cssText = 'background:rgba(8,6,4,.97);border:2px solid #d4aa50;border-radius:6px;' +
      'padding:16px 18px;min-width:260px;text-align:center;color:#e8d8a0;box-shadow:0 6px 28px rgba(0,0,0,.7);';
    box.appendChild(_el('div', null, '🛠 DEV PANEL')).style.cssText =
      'color:#f8d000;font-weight:bold;letter-spacing:1px;margin-bottom:8px;';
    var inp = document.createElement('input');
    inp.type = 'password';
    inp.placeholder = 'password';
    inp.style.cssText = 'width:100%;background:rgba(0,0,0,.5);border:1px solid rgba(212,170,80,.5);' +
      'color:#e8d8a0;font-family:inherit;font-size:13px;padding:6px 8px;border-radius:3px;text-align:center;';
    box.appendChild(inp);
    var msg = _el('div', null, '');
    msg.style.cssText = 'min-height:14px;font-size:11px;margin-top:7px;color:#f0857a;';
    box.appendChild(msg);
    back.appendChild(box);
    document.body.appendChild(back);
    setTimeout(function () { inp.focus(); }, 40);

    function close() { if (back.parentNode) back.parentNode.removeChild(back); }
    function submit() {
      if (inp.value === DEV_PASSWORD) { close(); onGranted(); return; }
      inp.value = '';
      msg.textContent = 'ACCESS DENIED';
      setTimeout(close, 1200);      // wrong/empty → nothing opens
    }
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();          // keep the backtick handler out of this field
      if (e.key === 'Enter')  { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
  }

  /* The backtick entry point. Closing never needs a password; OPENING does —
     unless we're on a trusted (local) host. */
  function _requestToggle() {
    if (isOpen()) { hide(); return; }
    if (_isTrustedHost()) { show(); return; }
    if (document.getElementById(PW_ID)) return;   // prompt already up
    _promptForPassword(show);
  }

  function _boot() {
    _build();
    document.addEventListener('keydown', function (e) {
      if (e.key !== '`' && e.code !== 'Backquote') return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      _requestToggle();
    });
  }

  if (document.body) _boot();
  else document.addEventListener('DOMContentLoaded', _boot);

  return {
    show: show, hide: hide, toggle: toggle, isOpen: isOpen,
    readSnapshot: _readSnapshot,
    applySnapshot: function (s) { _applySnapshot(s); _render(); }
  };
})();

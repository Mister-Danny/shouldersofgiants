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
 *   3. NON-DESTRUCTIVE TO BROWSE — toggling controls stages changes in memory;
 *      nothing is written until you press an APPLY button. Closing without
 *      applying changes nothing.
 *
 * Sections: CARDS · GOLD · PROGRESSION · LAUNCH.
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

  /* ══════════════════════════════════════════════════════════════════════
     STATE MODEL — every key this panel reads/writes is a REAL game key.
     ══════════════════════════════════════════════════════════════════════ */

  // The five two-tier bosses. `hook` matches scriptHook / the flag namespace
  // (sog_node_<hook>_<tier>_beaten) and `module` is the SOG.* battle module.
  var BOSSES = [
    { hook: 'gilgamesh',       label: 'Gilgamesh (Uruk)',      module: 'GilgameshBattle',      skipFlag: 'sog_gilgamesh_opening_seen' },
    { hook: 'sargon',          label: 'Sargon (Akkad)',        module: 'SargonBattle',         skipFlag: 'sog_sargon_opening_seen' },
    { hook: 'hammurabi',       label: 'Hammurabi (Babylon)',   module: 'HammurabiBattle',      skipFlag: 'sog_hammurabi_opening_seen' },
    { hook: 'hanging-gardens', label: 'Nebuchadnezzar (HG)',   module: 'HangingGardensBattle', skipFlag: 'sog_hanging_gardens_battle_opening_seen' },
    { hook: 'narmer',          label: 'Narmer (Egypt)',        module: 'NarmerBattle',         skipFlag: 'sog_narmer_battle_opening_seen' }
  ];

  // Boolean progression flags, grouped for display. Every one is a real key the
  // game reads (node showIf predicates, dialogue gates, HUD gates).
  var FLAG_GROUPS = [
    { title: 'Milestones', flags: [
      { key: 'sog_adventure_intro_complete',            label: 'Adventure intro done' },
      { key: 'sog_battle_neanderthal_complete',         label: 'Neanderthal beaten' },
      { key: 'sog_post_neanderthal_overworld_complete', label: 'Post-Neanderthal beat done' },
      { key: 'sog_battle_otzi_complete',                label: 'Ötzi beaten' },
      { key: 'sog_mesopotamia_arrival_complete',        label: 'Mesopotamia arrival done' },
      { key: 'sog_cuneiform_granted',                   label: 'Cuneiform granted' },
      { key: 'sog_deckbuilder_unlocked',                label: 'Deck builder unlocked' }
    ]},
    { title: 'Node reveals', flags: [
      { key: 'sog_sargon_node_revealed',     label: 'Sargon node revealed' },
      { key: 'sog_hammurabi_node_revealed',  label: 'Hammurabi node revealed' },
      { key: 'sog_hanging_gardens_revealed', label: 'Hanging Gardens revealed' },
      { key: 'sog_egypt_node_live',          label: 'Egypt / Double Crown live' }
    ]},
    { title: 'Encounter + misc', flags: [
      { key: 'sog_met_gilgamesh',                label: 'Met Gilgamesh' },
      { key: 'sog_met_narmer',                   label: 'Met Narmer' },
      { key: 'sog_first_market_interstitial_seen', label: 'First-market beat seen' },
      { key: 'sog_dev_unlock_all',               label: 'DEV: deck builder shows ALL cards (view-only)' }
    ]}
  ];

  var MAPS = [
    { id: 'eastafrica',  label: 'East Africa' },
    { id: 'mesopotamia', label: 'Mesopotamia' },
    { id: 'egypt',       label: 'Egypt' }
  ];

  /* ── Small storage helpers ─────────────────────────────────────────── */
  function _getFlag(k) { try { return localStorage.getItem(k) === 'true'; } catch (e) { return false; } }
  function _setFlag(k, on) {
    try { if (on) localStorage.setItem(k, 'true'); else localStorage.removeItem(k); } catch (e) {}
  }
  function _starters() {
    return (window.SOG && SOG.collection && SOG.collection.STARTER_CARD_IDS) || [];
  }
  function _isToken(c) { return !!c.token; }

  /* ══════════════════════════════════════════════════════════════════════
     READERS — the panel's single source of truth for what it displays.
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
     always owned). Uses the collection's public API only: resetCollection()
     clears the earned list, then unlockCard() re-adds the wanted non-starters.
     Ownership (sog_unlocked_cards) is what the deck builder actually gates on
     (isCardAvailable → SOG.Cards.isUnlocked → SOG.collection.isUnlocked), so
     this alone makes the builder show exactly this set.

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
    _refreshHud();
  }

  /* Set gold to an exact amount via the real store (reset + add). */
  function _applyGold(amount) {
    var g = window.SOG && SOG.gold;
    if (!g) return;
    var n = Math.max(0, Math.floor(Number(amount) || 0));
    if (typeof g.reset === 'function') g.reset();
    if (n > 0 && typeof g.add === 'function') g.add(n);
    _refreshHud();
  }

  /* Write the boolean progression map: { realKey: true|false }. */
  function _applyFlags(map) {
    Object.keys(map).forEach(function (k) { _setFlag(k, !!map[k]); });
    _refreshHud();
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

  /* ══════════════════════════════════════════════════════════════════════
     LAUNCHERS (migrated from the old menu)
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

  /* Launch a boss battle at a chosen tier. window.__forceTier is the same
     one-shot initGame honours for the node-click path, so the launched battle
     is indistinguishable from a real one at that tier. */
  function _launchBattle(boss, tier, skipIntro) {
    _ensureAdventurer();
    if (skipIntro && boss.skipFlag) _setFlag(boss.skipFlag, true);
    hide();
    _stopHomeMusic();
    _teardownBattles();
    window.__forceTier = tier;
    var mod = window.SOG && SOG[boss.module];
    if (mod && typeof mod.start === 'function') { mod.start(); }
    else { window.__forceTier = null; console.warn('[DevPanel] ' + boss.module + ' not found'); _flash('MISSING: ' + boss.module); }
  }

  function _launchOverworld(mapId) {
    _ensureAdventurer();
    hide();
    _stopHomeMusic();
    _teardownBattles();
    try {
      localStorage.setItem('sog_overworld_map', mapId);
      localStorage.removeItem('sog_overworld_pos');   // spawn fresh on that map
    } catch (e) {}
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    if (window.Overworld && typeof window.Overworld.init === 'function') window.Overworld.init();
  }

  /* Mesopotamia arrival cinematic (D1) — a scripted beat, not reachable by
     simply landing on a map, so it keeps a dedicated button. */
  function _playD1() {
    _ensureAdventurer();
    _setFlag('sog_mesopotamia_arrival_complete', false);   // must replay
    _launchOverworld('eastafrica');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.playD1 === 'function') window.Overworld.playD1();
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════════════════
     UI
     ══════════════════════════════════════════════════════════════════════ */

  var _panel = null, _statusEl = null, _statusTimer = null, _bodyEl = null;
  // Staged (unapplied) edits — nothing here touches real state until APPLY.
  var _stagedCards = null;   // array of ids
  var _stagedGold  = null;   // number
  var _stagedFlags = null;   // { key: bool }

  function _injectStyles() {
    if (document.getElementById('sog-dev-panel-style')) return;
    var P = '#' + PANEL_ID;
    var css =
      P + '{position:fixed;top:10px;right:10px;width:430px;max-height:92vh;display:flex;flex-direction:column;' +
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
      P + ' .dp-btn.dp-apply{background:rgba(120,200,120,.14);border-color:#6db76d;color:#bdf0bd;font-weight:bold;}' +
      P + ' .dp-btn.dp-apply:hover{background:rgba(120,200,120,.3);}' +
      P + ' .dp-btn.dp-danger{background:rgba(220,90,70,.12);border-color:#b5563f;color:#f0b9ac;}' +
      P + ' .dp-btn.dp-danger:hover{background:rgba(220,90,70,.28);}' +
      P + ' .dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 8px;max-height:230px;overflow-y:auto;' +
        'border:1px solid rgba(212,170,80,.2);border-radius:4px;padding:5px 6px;background:rgba(0,0,0,.25);}' +
      P + ' label.dp-chk{display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:1px 0;line-height:1.3;}' +
      P + ' label.dp-chk.dp-fixed{opacity:.55;cursor:not-allowed;}' +
      P + ' label.dp-chk input{margin:0;flex:0 0 auto;}' +
      P + ' .dp-eragrp{grid-column:1 / -1;color:#caa84e;font-size:10px;margin-top:5px;text-transform:uppercase;letter-spacing:.5px;}' +
      P + ' .dp-eragrp:first-child{margin-top:0;}' +
      P + ' input[type=number],select{background:rgba(0,0,0,.4);border:1px solid rgba(212,170,80,.4);color:#e8d8a0;' +
        'font-family:inherit;font-size:11px;padding:4px 6px;border-radius:3px;}' +
      P + ' .dp-cur{color:#8ad08a;font-size:10px;}' +
      P + ' .dp-bosstbl{width:100%;border-collapse:collapse;font-size:11px;}' +
      P + ' .dp-bosstbl td,' + P + ' .dp-bosstbl th{padding:2px 4px;text-align:left;}' +
      P + ' .dp-bosstbl th{color:#caa84e;font-size:10px;font-weight:normal;}' +
      P + ' .dp-foot{flex:0 0 auto;padding:6px 12px;border-top:1px solid rgba(212,170,80,.3);' +
        'color:#9c8a55;font-size:10px;display:flex;justify-content:space-between;gap:8px;}' +
      P + ' .dp-status{color:#8ad08a;text-align:right;flex:1;}';
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

  /* ── SECTION 1 · CARDS ─────────────────────────────────────────────── */
  function _buildCardsSection(frag) {
    frag.appendChild(_sec('1 · Cards — collection'));
    var owned = _readOwnedCardIds();
    _stagedCards = owned.slice();
    var starters = _starters();

    var count = _el('div', 'dp-note');
    function _updCount() {
      count.innerHTML = '';
      count.appendChild(_el('span', 'dp-cur', 'Owned now: ' + _readOwnedCardIds().length +
        '  ·  staged: ' + _stagedCards.length + ' cards'));
    }

    frag.appendChild(_note('Checkboxes show what is ACTUALLY owned right now. ' +
      'Starters (always owned, cannot be removed) are dimmed. Tokens are not deckable ' +
      'and are excluded. Changes apply only on “Apply cards”.'));
    frag.appendChild(count);

    var grid = _el('div', 'dp-grid');
    // Group by era so the list is scannable.
    var groups = {}, order = [];
    (typeof CARDS !== 'undefined' ? CARDS : []).forEach(function (c) {
      var g = _isToken(c) ? 'Tokens (not deckable)' : (c.era || 'Other');
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(c);
    });
    order.forEach(function (g) {
      grid.appendChild(_el('div', 'dp-eragrp', g));
      groups[g].forEach(function (c) {
        var fixed = starters.indexOf(c.id) !== -1 || _isToken(c);
        var lab = _el('label', 'dp-chk' + (fixed ? ' dp-fixed' : ''));
        var cb  = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked  = _stagedCards.indexOf(c.id) !== -1;
        cb.disabled = fixed;
        cb.dataset.cardId = String(c.id);
        cb.addEventListener('change', function () {
          var i = _stagedCards.indexOf(c.id);
          if (cb.checked && i === -1) _stagedCards.push(c.id);
          else if (!cb.checked && i !== -1) _stagedCards.splice(i, 1);
          _updCount();
        });
        lab.appendChild(cb);
        lab.appendChild(_el('span', null, c.id + ' ' + c.name));
        grid.appendChild(lab);
      });
    });
    frag.appendChild(grid);

    function _setAll(on) {
      _stagedCards = on
        ? (typeof CARDS !== 'undefined' ? CARDS : []).filter(function (c) { return !_isToken(c); })
            .map(function (c) { return c.id; })
        : starters.slice();
      grid.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        if (cb.disabled) return;
        cb.checked = _stagedCards.indexOf(parseInt(cb.dataset.cardId, 10)) !== -1;
      });
      _updCount();
    }

    var row = _el('div', 'dp-row');
    row.appendChild(_btn('Select all', null, function () { _setAll(true); }));
    row.appendChild(_btn('Clear (starters only)', null, function () { _setAll(false); }));
    row.appendChild(_btn('APPLY CARDS', 'dp-apply', function () {
      _applyCards(_stagedCards);
      _flash('Cards applied: ' + _readOwnedCardIds().length + ' owned');
      _render();   // re-read real state
    }));
    frag.appendChild(row);
    _updCount();
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
    inp.addEventListener('input', function () { _stagedGold = inp.value; });
    row.appendChild(inp);
    row.appendChild(_btn('APPLY GOLD', 'dp-apply', function () {
      _applyGold(_stagedGold);
      _flash('Gold set to ' + _readGold());
      _render();
    }));
    row.appendChild(_el('span', 'dp-cur', 'current: ' + cur));
    frag.appendChild(row);
    frag.appendChild(_note('Writes the real SOG.gold store (sog_gold).'));
  }

  /* ── SECTION 3 · PROGRESSION ───────────────────────────────────────── */
  function _buildProgressionSection(frag) {
    frag.appendChild(_sec('3 · Progression — beaten state & flags'));
    frag.appendChild(_note('Serf/Giant write sog_node_<boss>_<tier>_beaten; “Met” writes ' +
      'sog_node_encountered_<boss>. These drive flag stamps, node visibility and the ' +
      'replay picker (picker shows only when BOTH tiers are beaten).'));

    _stagedFlags = {};

    // Boss tier table
    var tbl = _el('table', 'dp-bosstbl');
    var hr = document.createElement('tr');
    ['Boss', 'Serf beaten', 'Giant beaten', 'Encountered'].forEach(function (h) {
      hr.appendChild(_el('th', null, h));
    });
    tbl.appendChild(hr);
    BOSSES.forEach(function (b) {
      var tr = document.createElement('tr');
      tr.appendChild(_el('td', null, b.label));
      [['serf', 'sog_node_' + b.hook + '_serf_beaten'],
       ['giant', 'sog_node_' + b.hook + '_giant_beaten'],
       ['enc',  'sog_node_encountered_' + b.hook]].forEach(function (pair) {
        var key = pair[1];
        var td  = document.createElement('td');
        var cb  = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = _getFlag(key);              // ← reflects REAL current state
        _stagedFlags[key] = cb.checked;
        cb.addEventListener('change', function () { _stagedFlags[key] = cb.checked; });
        td.appendChild(cb);
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    frag.appendChild(tbl);

    // Grouped boolean flags
    FLAG_GROUPS.forEach(function (grp) {
      frag.appendChild(_el('div', 'dp-eragrp', grp.title));
      var grid = _el('div', 'dp-grid');
      grid.style.maxHeight = 'none';
      grp.flags.forEach(function (f) {
        var lab = _el('label', 'dp-chk');
        var cb  = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = _getFlag(f.key);            // ← reflects REAL current state
        _stagedFlags[f.key] = cb.checked;
        cb.addEventListener('change', function () { _stagedFlags[f.key] = cb.checked; });
        lab.appendChild(cb);
        lab.appendChild(_el('span', null, f.label));
        grid.appendChild(lab);
      });
      frag.appendChild(grid);
    });

    var row = _el('div', 'dp-row');
    row.appendChild(_btn('APPLY PROGRESSION', 'dp-apply', function () {
      _applyFlags(_stagedFlags);
      _flash('Progression applied');
      _render();
    }));
    row.appendChild(_btn('Clear ALL progression', 'dp-danger', function () {
      if (!window.confirm('Clear every boss tier/encounter flag, node reveal and milestone?')) return;
      var cleared = {};
      Object.keys(_stagedFlags).forEach(function (k) { cleared[k] = false; });
      _applyFlags(cleared);
      _flash('All progression flags cleared');
      _render();
    }));
    frag.appendChild(row);
  }

  /* ── SECTION 4 · LAUNCH ────────────────────────────────────────────── */
  function _buildLaunchSection(frag) {
    frag.appendChild(_sec('4 · Launch'));
    frag.appendChild(_note('Launches use the state above as-is — APPLY your changes first. ' +
      'Battles bake window.__forceTier, the same one-shot the real node click uses.'));

    // Battle launcher: tier + skip-intro + one button per boss
    var ctl = _el('div', 'dp-row');
    ctl.appendChild(_el('span', null, 'Tier:'));
    var tierSel = document.createElement('select');
    [['serf', 'Serf'], ['giant', 'Giant']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      tierSel.appendChild(op);
    });
    ctl.appendChild(tierSel);
    var skipLab = _el('label', 'dp-chk');
    var skipCb  = document.createElement('input');
    skipCb.type = 'checkbox'; skipCb.checked = true;
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
    mrow.appendChild(_btn('Mesopotamia arrival (D1 cinematic)', null, _playD1));
    frag.appendChild(mrow);

    // Migrated utilities from the old menu.
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

    frag.appendChild(_el('div', 'dp-eragrp', 'Nuclear'));
    var nrow = _el('div', 'dp-row');
    nrow.appendChild(_btn('Clear adventure progress + reload', 'dp-danger', function () {
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
    nrow.appendChild(_btn('Wipe everything + reload', 'dp-danger', function () {
      if (!window.confirm('Wipe ALL localStorage? (full reset)')) return;
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    }));
    frag.appendChild(nrow);
  }

  /* ══════════════════════════════════════════════════════════════════════
     PRESET SEAM — nothing built yet, but this is where presets plug in.
     A preset is exactly the shape _readSnapshot() returns, so:
       • "save current state as preset"  → _readSnapshot()
       • "apply preset P"                → _applySnapshot(P) then _render()
     Add a PRESETS array + a row of buttons in _buildLaunchSection (or its own
     section) calling _applySnapshot; every writer it needs already exists.
     ══════════════════════════════════════════════════════════════════════ */
  function _readSnapshot() {
    var flags = {};
    BOSSES.forEach(function (b) {
      flags['sog_node_' + b.hook + '_serf_beaten']  = _getFlag('sog_node_' + b.hook + '_serf_beaten');
      flags['sog_node_' + b.hook + '_giant_beaten'] = _getFlag('sog_node_' + b.hook + '_giant_beaten');
      flags['sog_node_encountered_' + b.hook]       = _getFlag('sog_node_encountered_' + b.hook);
    });
    FLAG_GROUPS.forEach(function (g) {
      g.flags.forEach(function (f) { flags[f.key] = _getFlag(f.key); });
    });
    return { cards: _readOwnedCardIds(), gold: _readGold(), flags: flags };
  }
  function _applySnapshot(snap) {
    if (!snap) return;
    if (snap.cards) _applyCards(snap.cards);
    if (snap.gold != null) _applyGold(snap.gold);
    if (snap.flags) _applyFlags(snap.flags);
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
    foot.appendChild(_el('span', null, '` toggles · re-reads state on open'));
    _statusEl = _el('span', 'dp-status');
    foot.appendChild(_statusEl);
    _panel.appendChild(foot);

    document.body.appendChild(_panel);
  }

  /* Rebuild the whole body from CURRENT REAL STATE. Called on open and after
     every apply — this is what guarantees the panel never shows stale values. */
  function _render() {
    if (!_bodyEl) return;
    var scroll = _bodyEl.scrollTop;
    _bodyEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    _buildCardsSection(frag);
    _buildGoldSection(frag);
    _buildProgressionSection(frag);
    _buildLaunchSection(frag);
    _bodyEl.appendChild(frag);
    _bodyEl.scrollTop = scroll;
  }

  function _flash(msg) {
    if (!_statusEl) return;
    _statusEl.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    _statusTimer = setTimeout(function () { if (_statusEl) _statusEl.textContent = ''; }, 2200);
  }

  function show() {
    _build();
    _render();                       // ALWAYS re-read real state on open
    _panel.classList.add('visible');
    try { localStorage.setItem(VIS_KEY, 'true'); } catch (e) {}
  }
  function hide() {
    if (_panel) _panel.classList.remove('visible');
    try { localStorage.setItem(VIS_KEY, 'false'); } catch (e) {}
  }
  function isOpen() { return !!(_panel && _panel.classList.contains('visible')); }
  function toggle() { isOpen() ? hide() : show(); }

  function _boot() {
    _build();
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

  return {
    show: show, hide: hide, toggle: toggle, isOpen: isOpen,
    // Preset seam (see above) — exposed for console use / future preset UI.
    readSnapshot: _readSnapshot,
    applySnapshot: function (s) { _applySnapshot(s); _render(); }
  };
})();

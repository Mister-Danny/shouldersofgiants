/**
 * sog-adventure-hanginggardens.js — SOG.HangingGardensBattle (Phase D5, STAGE 1/2).
 *
 * The FOURTH boss (after Gilgamesh, Sargon, Hammurabi): Nebuchadnezzar, guardian of
 * the Hanging Gardens. A SCRIPTED capital battle (scriptHook: 'hanging-gardens'),
 * modeled on SOG.HammurabiBattle but pared back to the foundation:
 *   • Nebuchadnezzar's 15-card AI deck.
 *   • The in-battle OPENING DIALOGUE (Nebuchadnezzar ↔ Explorer), first-time only.
 *   • PLACEHOLDER locations (no special abilities yet); Nebuchadnezzar's portrait
 *     is now wired (images/portraits/nebuchadnezzar.jpg).
 * Win/loss/tie are STUBBED to the engine's default scoreboard for now (a later
 * stage adds the scoreboard / rewards / post-game dialogue, like Hammurabi did).
 *
 * Launched by overworld._launchHangingGardensBattle() after the radial wipe covers
 * the screen (it looks for SOG.HangingGardensBattle.start).
 */
window.SOG = window.SOG || {};
SOG.HangingGardensBattle = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[HangingGardensBattle] ' + msg); }
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  var TYPE_SPEED_MS = 32;   // matches the Hammurabi/Sargon/Gilgamesh typewriter

  var KEY_HG_COMPLETE     = 'sog_battle_nebuchadnezzar_complete';   // boss-name convention (sargon/hammurabi)
  // In-battle opening plays FIRST-TIME ONLY (clear to replay). Distinct from the
  // overworld node-reveal flag 'sog_hanging_gardens_revealed'.
  var KEY_HG_OPENING_SEEN = 'sog_hanging_gardens_battle_opening_seen';
  // First-flood dialogue interjection — FIRST-TIME ONLY (clear to replay).
  var KEY_HG_FLOOD_INTRO_SEEN = 'sog_hanging_gardens_flood_intro_seen';

  // ── Stage 5 reward knobs (mirror Hammurabi/Sargon). Editable. ──
  var NEB_CARD_ID     = 50;    // first-win reward (the Nebuchadnezzar card)
  var GOLD_FIRST_WIN  = 25;    // gold on first win
  var GOLD_REPEAT_WIN = 10;    // gold on a repeat win
  var RESULT_ID       = 'adv-nebuchadnezzar-result';
  var SHOW_RESULTS_ID = 'adv-nebuchadnezzar-show-results';
  var OPP_NAME        = 'Nebuchadnezzar';   // scoreboard opponent score label
  var OPP_BADGE       = 'NEB';              // scoreboard winner badge (full name overflows)

  // Nebuchadnezzar's portrait — used for the opponent avatar + speech-bubble face.
  var NEB_BUBBLE_PORTRAIT = 'images/portraits/nebuchadnezzar.jpg';

  // ── Nebuchadnezzar's AI deck (ids). 15-card Mesopotamia boss deck that INCLUDES
  //    Nebuchadnezzar (50):
  //    37 Sargon, 38 Priest, 39 Farmer, 40 Scribe, 41 Canals, 42 Soldier,
  //    43 Gilgamesh, 44 Enkidu, 45 Ziggurat, 46 Cuneiform, 47 Hammurabi,
  //    48 Chariot, 49 The Phoenicians, 50 Nebuchadnezzar, 31 Megalith.
  var NEB_AI_IDS = [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 31];

  var HG_PRESENTATION = {
    bodyClass:      'hanging-gardens-battle',
    allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
    opponentAvatar: NEB_BUBBLE_PORTRAIT,
    popAlly:        true
  };

  // ── The 3 real locations (left → center → right). Loc ids 101/102/103 (one battle
  //    runs at a time, so no collision with Hammurabi). The two RIVERS use the shared
  //    AT-ONCE engine keys. Babylon carries BABYLON_COST_5 — a marker the cost system
  //    keys off (effectiveCost + refreshHandCostDisplays): while a Babylon location is
  //    present, base-cost-5 cards cost -1 (global, stacks with Neb-50). The key is
  //    inert in any battle whose locations don't carry it (Hammurabi/Sargon untouched).
  //    Floods are Stage 4. Backgrounds wired in style.css (body.hanging-gardens-battle
  //    .battle-col[data-loc-id] → euphrates/babylon/tigris).
  function _hgLocations() {
    return [
      { id: 101, name: 'Euphrates River', region: 'Babylon', abilityText: 'Labor cards reveal here with +2 IP',    abilityKey: 'LABOR_PLUS_2_HERE',    image: 'images/locations/euphrates.jpg', thumbnailCrop: null },
      { id: 102, name: 'Babylon',         region: 'Babylon', abilityText: '5-CC cards cost -1 CC',                 abilityKey: 'BABYLON_COST_5',       image: 'images/locations/babylon.jpg',   thumbnailCrop: null },
      { id: 103, name: 'Tigris River',    region: 'Babylon', abilityText: 'Military cards reveal here with +1 IP', abilityKey: 'MILITARY_PLUS_1_HERE', image: 'images/locations/tigris.jpg',    thumbnailCrop: null }
    ];
  }

  /* ── Presentation helpers ─────────────────────────────────────────── */
  function _applyPresentationClasses(p) {
    if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
  }

  function fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onDone) onDone(); return; }
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
      if (onDone) onDone();
      return;
    }
    gsap.to(wipeEl, {
      opacity: 0, duration: 0.45, ease: 'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  /* Reset the flood system so nothing lingers past battle exit. The battle BOARD is
     rebuilt fresh each entry (so flooded nameplate/ability/art on .battle-col can't
     leak), but the _floodedRiver module state + any Stage-4c flood overlay elements
     must be cleared explicitly. Safe/idempotent — inert if no flood ever happened. */
  function _clearFloodState() {
    _floodedRiver = null;
    var G = (window.SOG && SOG.state && SOG.state.G);
    if (G && G.locations) G.locations.forEach(function (l) { l.flooded = false; });
    // Stage 4c flood presentation — strip the crossfade class + any overlay elements.
    Array.prototype.forEach.call(document.querySelectorAll('.battle-col.hg-flooded'),
      function (col) { col.classList.remove('hg-flooded'); });
    Array.prototype.forEach.call(document.querySelectorAll('.hg-flood-overlay, .hg-flood-rush, .hg-flood-tint'),
      function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
  }

  /* ── Battle rules popup + click-opponent trigger (standardized across bosses).
     [CREATED rules copy — refine.] Core rules only (no per-location abilities);
     the flood is kept as it's a battle-wide mechanic, not a location ability. ── */
  var RULES_TITLE = 'In The Garden';
  var RULES_BODY  = [
    '5 Turns',
    'Each card costs Capital (CC) to play.',
    '5 Capital to spend each turn.',
    "Watch out for flooding rivers!",
    '<u>Win Condition</u> — Gain the most IP at the most locations to defeat Nebuchadnezzar.'
  ];
  function _openRulesPopup(onDismiss) {
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function') {
      SOG.BattleRulesPopup.show({ title: RULES_TITLE, body: RULES_BODY, onDismiss: onDismiss });
    } else if (onDismiss) { onDismiss(); }
  }
  function _opponentAvatarEl() { return document.querySelector('.battle-avatar-opponent'); }
  var _portraitClickHandler = null;
  function _wireOpponentPortraitClick() {
    var el = _opponentAvatarEl();
    if (!el || _portraitClickHandler) return;
    el.classList.add('rules-clickable');
    _portraitClickHandler = function () { _openRulesPopup(); };
    el.addEventListener('click', _portraitClickHandler);
  }
  function _unwireOpponentPortraitClick() {
    var el = _opponentAvatarEl();
    if (el && _portraitClickHandler) el.removeEventListener('click', _portraitClickHandler);
    if (el) el.classList.remove('rules-clickable');
    _portraitClickHandler = null;
  }

  function _hgTeardown() {
    document.body.classList.remove('hanging-gardens-battle');
    _unwireOpponentPortraitClick();
    _restoreOpponentBubblePortrait();
    hideBubbles();
    _clearFloodState();                     // reset flood state + remove flood DOM
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') {
      SOG.HUD.restoreBattleAvatars();
    }
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE 5 — WIN / LOSS / TIE + REWARDS (mirrors the Hammurabi end-game flow)
       • First win  → scoreboard (CONTINUE → grant Neb card 50 + 25 gold → exit;
                      GAME BOARD reviews the board).
       • Repeat win → VICTORY flourish → +10 gold → Play Again / Gameboard / Back To
                      Map scoreboard (card 50 NOT re-granted).
       • Loss / tie → that same 3-button scoreboard (standard retry, no intervention).
     Reuses the SHARED card-acquisition (preh.showCardAcquisition) + gold-reward
     animations. Win/loss/tie DIALOGUE is left as [STUB]s (none written yet). */
  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  function _removeFloatingResultsBtn() {
    var b = document.getElementById(SHOW_RESULTS_ID);
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function _removeResultPopup() {
    var el = document.getElementById(RESULT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _removeFloatingResultsBtn();
  }
  // "Game Board" — hide the scoreboard to review the final board; float a
  // "Show Results" button to bring it back.
  function _hideResultForReview() {
    var el = document.getElementById(RESULT_ID);
    if (el) el.style.display = 'none';
    if (document.getElementById(SHOW_RESULTS_ID)) return;
    var btn = document.createElement('button');
    btn.id = SHOW_RESULTS_ID;
    btn.className = 'btn-primary';
    btn.textContent = 'SHOW RESULTS';
    btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10060;';
    btn.addEventListener('click', function () {
      var r = document.getElementById(RESULT_ID);
      if (r) r.style.display = '';
      _removeFloatingResultsBtn();
    });
    document.body.appendChild(btn);
  }

  function _buildLocRow(locName, pIP, aIP) {
    var winner = pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie';
    var row = document.createElement('div'); row.className = 'result-loc-row';
    var nm  = document.createElement('div'); nm.className  = 'result-loc-name'; nm.textContent = locName;
    var sc  = document.createElement('div'); sc.className  = 'result-loc-scores';
    var yu  = document.createElement('span');
    yu.className   = 'result-loc-you'  + (winner === 'player' ? ' result-loc-winner' : '');
    yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className   = 'result-loc-opp'  + (winner === 'ai' ? ' result-loc-winner' : '');
    op.textContent = OPP_NAME + ': ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? OPP_BADGE : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  function _restartBattle() {
    _removeResultPopup();
    _hgTeardown();
    start();
  }
  function _exitToOverworld() {
    _removeResultPopup();
    _hgTeardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* Grant Nebuchadnezzar's card (50) via the shared card-acquisition reveal — FIRST
     WIN ONLY: SOG.Cards.unlock returns truthy only on a NEW unlock, so a repeat win
     (already owned) skips the acquisition animation entirely. */
  function _grantNebCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newly = !!SOG.Cards.unlock([NEB_CARD_ID]);
    }
    if (!newly) { if (done) done(); return; }   // already owned → no card reveal
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === NEB_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Bank `amount` gold, refresh the HUD number, then play the coin-drop animation. */
  function _grantGold(amount, done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(amount, function () { if (done) done(); });
  }
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'nebuchadnezzar-gold-reward';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;pointer-events:none;';
    var dim = document.createElement('div');
    dim.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.80);transition:opacity 0.4s ease;';
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;' +
      'transform:translateY(-110px);transition:opacity 0.45s ease, transform 0.7s cubic-bezier(0.2,0.9,0.3,1);';
    var coin = document.createElement('img');
    coin.src = 'images/ui_images/coin.png'; coin.alt = ''; coin.draggable = false;
    coin.style.cssText = 'width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6));';
    var label = document.createElement('div');
    label.textContent = amount + ' Gold';
    label.style.cssText = 'font-family:var(--font, sans-serif);font-size:46px;font-weight:bold;color:#f3d574;' +
      '-webkit-text-stroke:2px #1a0a04;' +
      'text-shadow:-2px -2px 0 #1a0a04, 2px -2px 0 #1a0a04, -2px 2px 0 #1a0a04, 2px 2px 0 #1a0a04, 0 4px 6px rgba(0,0,0,0.55);';
    box.appendChild(coin); box.appendChild(label);
    overlay.appendChild(dim); overlay.appendChild(box);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void box.offsetHeight;
    box.style.opacity = '1'; box.style.transform = 'translateY(0)';
    setTimeout(function () { _playSfx('sfx/demedici-money.mp3'); }, 300);
    setTimeout(function () {
      box.style.transition = 'opacity 0.4s ease';
      box.style.opacity = '0'; dim.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 420);
    }, 1900);
  }

  /* Repeat-win flourish: VICTORY pops in with the chime, holds 2.5s, fades → gold. */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'nebuchadnezzar-victory-flourish';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10045;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity 0.3s ease;';
    var txt = document.createElement('div');
    txt.className   = 'result-headline result-player';
    txt.textContent = 'VICTORY';
    txt.style.cssText = 'opacity:0;transform:scale(0.7);transition:opacity 0.3s ease, transform 0.45s cubic-bezier(0.2,0.9,0.3,1);';
    overlay.appendChild(txt);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void txt.offsetHeight;
    txt.style.opacity = '1'; txt.style.transform = 'scale(1)';
    setTimeout(function () {
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 300);
    }, 2500);
  }

  /* FIRST-WIN victory sequence: VICTORY flourish → Neb's win dialogue → on the final
     line ("Take this…") fire the card 50 + 25 gold grant → then the scoreboard.
     First-win only (a repeat win never reaches here — see _onWin's owned guard). */
  function _runFirstWinSequence(locResults) {
    // First win plays the STORY FIRST (mirrors Sargon): Neb's win dialogue → grant
    // card 50 + 25 gold on the "Take this…" line → THEN the VICTORY scoreboard
    // (whose CONTINUE exits to the overworld).
    _removeResultPopup();
    runLines(WIN_DIALOGUE, function () {
      // "Take this…" is WIN_DIALOGUE's last line, so the grant fires on that beat.
      _grantNebCard(function () {
        _grantGold(GOLD_FIRST_WIN, function () {
          _showResultScoreboard(true, false, locResults, { firstWin: true });
        });
      });
    });
  }

  /* Build + show the end-game scoreboard.
       opts.firstWin — shown AFTER the win dialogue + card + gold: CONTINUE (→ map) + GAME BOARD.
       otherwise     — PLAY AGAIN + GAMEBOARD + BACK TO MAP (CONTINUE on wins). */
  function _showResultScoreboard(won, isTie, locResults, opts) {
    opts = opts || {};
    _removeResultPopup();
    var overlay = document.createElement('div');
    overlay.id = RESULT_ID;
    overlay.className = 'adv-result';

    var wrap = document.createElement('div');
    wrap.className = 'result-wrap';

    var headline = document.createElement('div');
    headline.className = 'result-headline ' + (won ? 'result-player' : isTie ? 'result-tie' : 'result-ai');
    headline.textContent = won ? 'VICTORY' : isTie ? 'A TIE' : 'DEFEAT';

    var locs = document.createElement('div');
    locs.className = 'result-locs';
    (locResults || []).forEach(function (r) { locs.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP)); });

    var actions = document.createElement('div');
    actions.className = 'result-actions';
    function mkBtn(label, cb) {
      var b = document.createElement('button');
      b.className = 'btn-primary';
      b.textContent = label;
      b.addEventListener('click', cb);
      return b;
    }
    if (opts.firstWin) {
      // Shown AFTER the first-win victory sequence (dialogue + card + gold), so
      // CONTINUE simply exits to the map.
      actions.appendChild(mkBtn('CONTINUE',   function () { _exitToOverworld(); }));
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn(won ? 'CONTINUE' : 'BACK TO MAP', function () { _exitToOverworld(); }));
    }

    wrap.appendChild(headline);
    wrap.appendChild(locs);
    wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  /* Outcome routing — own the screen (never proceed()).
       • First win  → scoreboard (CONTINUE → card 50 + 25 gold → exit).
       • Repeat win → VICTORY flourish → +10 gold → 3-button scoreboard.
       • Loss / tie → 3-button scoreboard (standard retry; no intervention). */
  function _onWin(locResults) {
    var firstWin = !_has(KEY_HG_COMPLETE);   // capture BEFORE setting the flag
    _set(KEY_HG_COMPLETE);
    if (firstWin) {
      // First win: victory dialogue + card acquisition + gold play FIRST, then the
      // VICTORY scoreboard appears (CONTINUE → exit to map).
      _runFirstWinSequence(locResults);
    } else {
      // Repeat win: skip the full story beat → flourish → +10 gold → scoreboard.
      _victoryFlourish(function () {
        _grantGold(GOLD_REPEAT_WIN, function () {
          _showResultScoreboard(true, false, locResults, {});
        });
      });
    }
  }
  function _onLoss(locResults) { _onDefeatOrTie(false, locResults); }
  function _onTie(locResults)  { _onDefeatOrTie(true,  locResults); }
  function _onDefeatOrTie(isTie, locResults) {
    // Neb taunts, then the standard retry scoreboard (mirrors Hammurabi).
    runLines(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, function () {
      _showResultScoreboard(false, isTie, locResults, {});
    });
  }

  /* ══════════════════════════════════════════════════════════════
     IN-BATTLE OPENING DIALOGUE (editable)
     Nebuchadnezzar speaks through the shared opponent bubble (#adv-bubble-otzi,
     portrait swapped to Neb); the Explorer through #adv-bubble-explorer.
  ══════════════════════════════════════════════════════════════ */
  var OPENING_DIALOGUE = [
    { who: 'nebuchadnezzar', text: 'Welcome, welcome!' },
    { who: 'nebuchadnezzar', text: 'Foreign traveler in the funny head covering...' },
    { who: 'explorer',       text: 'You think my hat is funny?' },
    { who: 'nebuchadnezzar', text: '...take awe in the splendor of my gardens!' },
    { who: 'explorer',       text: 'Your gardens?' },
    { who: 'nebuchadnezzar', text: 'I built them.' },
    { who: 'nebuchadnezzar', text: 'Every terrace, every bloom, every falling stream.' },
    { who: 'explorer',       text: 'You must be so proud!' },
    { who: 'nebuchadnezzar', text: 'I built the greatest city the world has ever seen.' },
    { who: 'explorer',       text: 'So far...' },
    { who: 'nebuchadnezzar', text: 'Then tell me, young traveler in the bizarre bonnet...' },
    { who: 'nebuchadnezzar', text: '...who gave you permission to enter the garden of a king?' },
    { who: 'explorer',       text: 'Uh. The door was kind of open?' },
    { who: 'nebuchadnezzar', text: 'No one walks my paradise uninvited.' },
    { who: 'nebuchadnezzar', text: 'No one.' },
    { who: 'explorer',       text: "I guess that means I'm a fried ferret." }
  ];

  /* ── Outcome dialogue (editable) — Nebuchadnezzar via the opponent bubble. ──────
     WIN is FIRST-WIN-ONLY (a repeat win skips straight to flourish + gold). The LAST
     WIN line ("Take this…") is the beat the card 50 + 25 gold grant fires on. */
  var WIN_DIALOGUE = [
    { who: 'nebuchadnezzar', text: 'Hmm... How unexpected.' },
    { who: 'explorer',       text: 'I won?' },
    { who: 'nebuchadnezzar', text: 'Yes, somehow the stranger in the tawdry hat prevailed.' },
    { who: 'explorer',       text: 'Hey, I like my hat.' },
    { who: 'nebuchadnezzar', text: 'How unfortunate.' },
    { who: 'nebuchadnezzar', text: 'But perhaps, the Egyptians will find it more amusing.' },
    { who: 'explorer',       text: 'Egyptians?' },
    { who: 'nebuchadnezzar', text: 'Take this and be gone, will you?' }
  ];
  var LOSS_DIALOGUE = [
    { who: 'nebuchadnezzar', text: 'Predictable.' },
    { who: 'nebuchadnezzar', text: 'Your play was as putrid as the pileus on your head.' },
    { who: 'explorer',       text: 'Can I have another shot?' },
    { who: 'explorer',       text: 'My road home cannot stop here.' },
    { who: 'nebuchadnezzar', text: 'But your tears will make fantastic fertilizer.' }
  ];
  var TIE_DIALOGUE = [
    { who: 'nebuchadnezzar', text: 'A stalemate?' },
    { who: 'nebuchadnezzar', text: 'How unrefined.' },
    { who: 'nebuchadnezzar', text: 'We shall do this again.' },
    { who: 'nebuchadnezzar', text: 'Properly this time.' }
  ];

  // Semantic speaker → shared bubble element id (Neb borrows the opponent box).
  function _bubbleId(who) { return who === 'explorer' ? 'explorer' : 'otzi'; }

  /* ── Web Audio bleeps ────────────────────────────────────────── */
  var _bleepCtx = null;
  function getBleepCtx() {
    if (_bleepCtx) return _bleepCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _bleepCtx = new Ctx();
    } catch (e) {}
    return _bleepCtx;
  }
  // Nebuchadnezzar's bleep — a deep, regal square-wave tone (lower than Hammurabi).
  var BLEEP_PROFILES = {
    nebuchadnezzar: { freq: 200, wobble: 26, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer:       { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  function playBleep(who) {
    var ctx = getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.nebuchadnezzar;
    var now = ctx.currentTime;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var freq = p.freq + (Math.random() - 0.5) * p.wobble;
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
  }

  /* ── Bubble helpers ──────────────────────────────────────────── */
  function getBubbleEl(id) { return document.getElementById('adv-bubble-' + id); }
  function hideBubbles() {
    ['otzi', 'explorer'].forEach(function (id) {
      var el = getBubbleEl(id);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }

  var _origOtziBubbleSrc = null;
  function _swapOpponentBubblePortrait() {
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (_origOtziBubbleSrc === null) _origOtziBubbleSrc = img.getAttribute('src');
    img.setAttribute('src', NEB_BUBBLE_PORTRAIT);
  }
  function _restoreOpponentBubblePortrait() {
    if (_origOtziBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) img.setAttribute('src', _origOtziBubbleSrc);
    _origOtziBubbleSrc = null;
  }

  /* ── Dialogue runner (click-to-advance typewriter) ───────────── */
  var _dlg = {
    lines: null, lineIdx: 0, isTyping: false, timer: null,
    fullText: '', textEl: null, activeEl: null, clickHandler: null, onAllDone: null
  };
  var _dialogueActive = false;   // input blocked across the whole opening dialogue

  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }

  function runLines(lines, onAllDone) {
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(true);   // duck battle music during dialogue
    _dlg.lines     = lines;
    _dlg.lineIdx   = 0;
    _dlg.onAllDone = onAllDone;
    _dlg.clickHandler = function (e) {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      advanceLine();
    };
    // Defer so the click that ended the previous phase doesn't skip line 1.
    setTimeout(function () {
      document.addEventListener('click',   _dlg.clickHandler);
      document.addEventListener('keydown', _dlg.clickHandler);
    }, 0);
    showLine();
  }

  function showLine() {
    var line = _dlg.lines[_dlg.lineIdx];
    if (!line) { finishRunner(); return; }

    var thisId  = _bubbleId(line.who);
    var otherId = (thisId === 'explorer') ? 'otzi' : 'explorer';
    var otherEl = getBubbleEl(otherId);
    if (otherEl) otherEl.classList.remove('is-visible', 'is-ready');

    var el = getBubbleEl(thisId);
    if (!el)     { _dlg.lineIdx++; showLine(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { _dlg.lineIdx++; showLine(); return; }

    textEl.textContent = '';
    el.classList.add('is-visible');
    el.classList.remove('is-ready');

    _dlg.fullText = line.text;
    _dlg.textEl   = textEl;
    _dlg.isTyping = true;
    _dlg.activeEl = el;

    var i = 0, bleepCount = 0;
    if (_dlg.timer) clearInterval(_dlg.timer);
    _dlg.timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
      var c = line.text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.nebuchadnezzar;
        bleepCount++;
        if (bleepCount >= p.every) { bleepCount = 0; playBleep(line.who); }
      }
      if (i >= line.text.length) {
        clearInterval(_dlg.timer);
        _dlg.timer    = null;
        _dlg.isTyping = false;
        el.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  function advanceLine() {
    if (_dlg.isTyping) {
      if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
      if (_dlg.textEl) _dlg.textEl.textContent = _dlg.fullText;
      _dlg.isTyping = false;
      if (_dlg.activeEl) _dlg.activeEl.classList.add('is-ready');
      return;
    }
    _dlg.lineIdx++;
    if (_dlg.lineIdx >= _dlg.lines.length) { finishRunner(); return; }
    showLine();
  }

  function finishRunner() {
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(false);   // restore battle music after dialogue
    if (_dlg.clickHandler) {
      document.removeEventListener('click',   _dlg.clickHandler);
      document.removeEventListener('keydown', _dlg.clickHandler);
      _dlg.clickHandler = null;
    }
    if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
    _dlg.isTyping = false;
    hideBubbles();
    var onDone     = _dlg.onAllDone;
    _dlg.onAllDone = null;
    _dlg.lines     = null;
    if (onDone) onDone();
  }

  /* Opening dialogue (first-time only; skipped → immediate onComplete on re-entry). */
  function _runOpeningDialogue(onComplete) {
    if (_has(KEY_HG_OPENING_SEEN) || _has(KEY_HG_COMPLETE)) { if (onComplete) onComplete(); return; }
    runLines(OPENING_DIALOGUE, function () {
      _set(KEY_HG_OPENING_SEEN);
      if (onComplete) onComplete();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FLOOD SCHEDULER (Stage 4) — NEBUCHADNEZZAR-BATTLE-ONLY
     ──────────────────────────────────────────────────────────────
     On turns 3/4/5 exactly one river floods: turn 3 a FRESH random pick (Tigris or
     Euphrates), turns 4/5 STRICT alternation to the other river (3→A, 4→B, 5→A).
     None on turns 1/2. The schedule sets/clears the `flooded` flag on the river
     LOCATION objects in G.locations; the engine's SOG.board.isLocationPlayable reads
     it (play-block wired in Stage 4b; presentation in Stage 4c). _floodedRiver is
     reset per battle (onBattleStart) so each battle rolls fresh. This logic lives ONLY
     in this script, so the flood is inert in every other battle.
  ══════════════════════════════════════════════════════════════ */
  var RIVER_EUPHRATES = 101;   // left river loc id
  var RIVER_TIGRIS    = 103;   // right river loc id
  var _floodedRiver   = null;  // loc id of the currently-flooded river, or null

  function _floodTargetForTurn(turn) {
    if (turn < 3) return null;                                                    // no flood turns 1/2
    if (turn === 3) return (Math.random() < 0.5) ? RIVER_EUPHRATES : RIVER_TIGRIS; // fresh random roll
    return (_floodedRiver === RIVER_EUPHRATES) ? RIVER_TIGRIS : RIVER_EUPHRATES;   // alternate to the other
  }

  // Apply the schedule for `turn`: exactly one river flooded (or none on 1/2).
  function _applyFloodSchedule(turn) {
    var G = (window.SOG && SOG.state && SOG.state.G);
    if (!G || !G.locations) return;
    var prev   = _floodedRiver;                 // previously-flooded river (or null)
    var target = _floodTargetForTurn(turn);     // reads _floodedRiver (= prev) for alternation
    G.locations.forEach(function (l) { l.flooded = (l.id === target); });   // exactly one, others cleared
    // Presentation (Stage 4c): revert the river that just un-flooded, flood the new one.
    if (prev   != null && prev   !== target) _unfloodPresentation(prev);
    if (target != null && target !== prev)   _floodPresentation(target);
    _floodedRiver = target;
    // First-flood interjection (first-time only): block input, run the exchange,
    // then release. Fires only when a river actually floods (target != null), and
    // never once the battle's been beaten (skip all intros on a victorious rematch).
    if (target != null && !_has(KEY_HG_FLOOD_INTRO_SEEN) && !_has(KEY_HG_COMPLETE)) {
      _set(KEY_HG_FLOOD_INTRO_SEEN);
      _dialogueActive = true;
      _disableButtons();
      _runFloodIntro(target, function () {
        _dialogueActive = false;
        _enableButtons();
      });
    }
    var nm = (target == null) ? 'none' : (target === RIVER_EUPHRATES ? 'Euphrates River (101)' : 'Tigris River (103)');
    log('[FLOOD] turn ' + turn + ' → flooded: ' + nm + (_floodedRiver != null ? '  (playable check: 101=' + SOG.board.isLocationPlayable(101) + ', 103=' + SOG.board.isLocationPlayable(103) + ')' : ''));
  }

  /* ── Flood PRESENTATION (Stage 4c) ──────────────────────────────────────────
     A river floods → crossfade its art to the flood image (CSS .hg-flooded toggles
     the ::after layer), nameplate → "[River] River - Flooded", ability → "No cards
     can be played here", play waterflow.m4a. Un-flood → reverse, restoring the
     location's original name + abilityText (read from the live loc object, never
     mutated). The board rebuilds fresh each battle, so nothing leaks. */
  function _floodColEl(locId) { return document.querySelector('.battle-col[data-loc-id="' + locId + '"]'); }

  /* A transient blue water surge that sweeps down over the column the instant it
     floods (CSS .hg-flood-rush + @keyframes hgFloodRushIn), then self-removes,
     leaving the persistent .hg-flooded art behind. */
  function _spawnFloodRush(col) {
    if (!col) return;
    var rush = document.createElement('div');
    rush.className = 'hg-flood-rush';
    rush.setAttribute('aria-hidden', 'true');
    col.appendChild(rush);
    setTimeout(function () { if (rush.parentNode) rush.parentNode.removeChild(rush); }, 2250);  // outlast the 1.875s wipe
  }

  /* A persistent 20% blue tint over the flooded location (CSS .hg-flood-tint), kept
     for the whole time the river stays flooded and removed on un-flood / teardown. */
  function _spawnFloodTint(col) {
    if (!col || col.querySelector('.hg-flood-tint')) return;   // idempotent
    var tint = document.createElement('div');
    tint.className = 'hg-flood-tint';
    tint.setAttribute('aria-hidden', 'true');
    col.appendChild(tint);
  }
  function _removeFloodTint(col) {
    if (!col) return;
    var tint = col.querySelector('.hg-flood-tint');
    if (tint && tint.parentNode) tint.parentNode.removeChild(tint);
  }

  function _floodPresentation(locId) {
    var G = (window.SOG && SOG.state && SOG.state.G);
    var loc = G && G.locations && G.locations.find(function (l) { return l.id === locId; });
    var col = _floodColEl(locId);
    if (col) {
      col.classList.add('hg-flooded');                                        // art crossfade
      var nm = col.querySelector('.battle-loc-name');    if (nm && loc) nm.textContent = loc.name + ' - Flooded';
      var ab = col.querySelector('.battle-loc-ability'); if (ab)        ab.textContent = 'No cards can be played here';
      _spawnFloodRush(col);                                                   // blue water surge sweeps over it
      _spawnFloodTint(col);                                                   // persistent 20% blue tint
    }
    _playSfx('sfx/waterflow.m4a');
  }
  function _unfloodPresentation(locId) {
    var G = (window.SOG && SOG.state && SOG.state.G);
    var loc = G && G.locations && G.locations.find(function (l) { return l.id === locId; });
    var col = _floodColEl(locId);
    if (col) {
      col.classList.remove('hg-flooded');                                     // crossfade back
      var nm = col.querySelector('.battle-loc-name');    if (nm && loc) nm.textContent = loc.name;
      var ab = col.querySelector('.battle-loc-ability'); if (ab && loc) ab.textContent = loc.abilityText;
      _removeFloodTint(col);                                                  // drop the blue tint
    }
  }

  /* First-flood interjection (FIRST-TIME ONLY) — a short exchange the first time a
     river floods, naming the actual flooded river. Play resumes when it's dismissed.
     Input is blocked across it (_dialogueActive + disabled buttons), and the flood
     art/water-surge are already on-screen so the lines reference a live flood. */
  function _runFloodIntro(riverLocId, onComplete) {
    var river = (riverLocId === RIVER_EUPHRATES) ? 'Euphrates' : 'Tigris';
    runLines([
      { who: 'explorer',       text: 'What happened?!' },
      { who: 'nebuchadnezzar', text: 'The ' + river + ' flooded.' },
      { who: 'explorer',       text: "But I can't play cards there while it's flooded!" },
      { who: 'nebuchadnezzar', text: 'Welcome to Mesopotamia.' }
    ], function () { if (onComplete) onComplete(); });
  }

  /* ══════════════════════════════════════════════════════════════
     HANGING GARDENS SCRIPT — registered as 'hanging-gardens'
  ══════════════════════════════════════════════════════════════ */
  var HG_SCRIPT = {
    onIntro: function (ctx, done) {
      _applyPresentationClasses(ctx.config && ctx.config.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    onBattleStart: function (ctx, done) {
      _floodedRiver = null;   // fresh flood roll each battle (turn 3 re-randomizes)
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _swapOpponentBubblePortrait();

      if (_has(KEY_HG_OPENING_SEEN) || _has(KEY_HG_COMPLETE)) {
        // Repeat entry (or a victorious rematch) — skip the dialogue, go straight to turn 1.
        fadeOutCover(function () { _wireOpponentPortraitClick(); done(); });
        return;
      }

      _disableButtons();
      _dialogueActive = true;                // block plays/drags through the dialogue
      fadeOutCover(function () {
        _runOpeningDialogue(function () {
          _dialogueActive = false;
          _enableButtons();
          _wireOpponentPortraitClick();
          done();
        });
      });
    },

    isInputBlocked: function (ctx) { return !!_dialogueActive; },

    // FLOOD scheduler (Stage 4a): runs the per-turn flood schedule. Fires turns 2+;
    // 1/2 clear all flags (none flooded), 3 rolls random, 4/5 alternate. State only —
    // play-block (4b) + presentation (4c) come next.
    onTurnStart: function (ctx, turn) { _applyFloodSchedule(turn); },

    // Win/loss/tie — own the screen (never proceed). See Stage 5 routing above.
    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onLoss(result.locResults); },
    onTie:  function (ctx, result, proceed) { _onTie(result.locResults); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hanging-gardens', HG_SCRIPT);
  }

  /* Capital-aware AI selector (same spread heuristic as Hammurabi/Sargon): plays the
     strongest affordable cards, each into the location where the AI is currently
     weakest, so it contests all three instead of stacking one. */
  function hgSelectPlays(ctx) {
    var G   = ctx.G;
    var baseCap = (G.config && G.config.resource && typeof G.config.resource.capital === 'number')
      ? G.config.resource.capital : 5;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : baseCap;
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    // AI-side effective cost — the SAME path the player uses, so the Neb-50
    // Mesopotamia stamp + Babylon base-5 discount apply to the AI's affordability
    // + budget (both are GLOBAL here, so any locId gives the same value). Falls
    // back to base CC if the engine helper is unavailable.
    var _repLoc = (G.locations && G.locations[0]) ? G.locations[0].id : null;
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, (locId != null ? locId : _repLoc), 'ai') : card.cc;
    }

    var hand      = G.aiHand.slice();
    var simFilled = {};
    var simIP     = {};
    function slotsLeft(locId) {
      var arr = G.aiSlots[locId] || [], open = 0;
      for (var i = 0; i < arr.length; i++) if (arr[i] === null) open++;
      return open - (simFilled[locId] || 0);
    }
    function aiCommittedIP(locId) {
      var ip = 0, arr = G.aiSlots[locId] || [];
      for (var i = 0; i < arr.length; i++) { var s = arr[i]; if (s) ip += (s.ip || 0); }
      return ip + (simIP[locId] || 0);
    }
    function weakestOpenLoc(locs) {
      var best = locs[0], bestIP = aiCommittedIP(best.id);
      for (var i = 1; i < locs.length; i++) {
        var ip = aiCommittedIP(locs[i].id);
        if (ip < bestIP) { bestIP = ip; best = locs[i]; }
      }
      return best.id;
    }

    // Shared card-placement heuristics (ai.js): Megalith early (sort bias) +
    // Soldier/Phoenicians/Priest/Ziggurat placement (location bias). No-op if
    // SOG.ai is absent. plays = this turn's tentative context.
    var _turns    = (G.config && G.config.structure && G.config.structure.turns) || 4;
    var turnsLeft = Math.max(1, _turns - (G.turn || 1) + 1);
    var _ai = (window.SOG && SOG.ai) || null;
    function turnBias(id)  { return _ai && _ai.cardTurnBias ? _ai.cardTurnBias(id, turnsLeft) : 0; }
    function biasedLoc(cardId, openLocs, fallbackId) {
      if (!_ai || !_ai.cardLocBias) return fallbackId;
      var best = fallbackId, bestB = _ai.cardLocBias(cardId, fallbackId, G, 'opp', plays);
      for (var i = 0; i < openLocs.length; i++) {
        var id = openLocs[i].id, b = _ai.cardLocBias(cardId, id, G, 'opp', plays);
        if (b > bestB) { bestB = b; best = id; }
      }
      return best;
    }

    var plays = [], guard = 0;
    while (guard++ < 24) {
      var aff = [];
      for (var h = 0; h < hand.length; h++) {
        var c = cardById(hand[h]);
        if (c && aiCost(c) <= capital) aff.push(c);   // affordability honors discounts
      }
      if (!aff.length) break;
      // Exclude FLOODED rivers so the AI never even considers placing there.
      var openLocs = G.locations.filter(function (loc) {
        return slotsLeft(loc.id) > 0 && SOG.board.isLocationPlayable(loc.id);
      });
      if (!openLocs.length) break;

      // strongest first — IP + early-turn bias (Megalith), then CC tiebreak
      // Scribe (40) is a late-bloomer: hold him before the final turn unless he is
      // the ONLY way to keep spending capital AND an open location already has 2+
      // AI cards for his +1 stamps.
      if (turnsLeft > 1) {
        var _nonScribe = aff.filter(function (c) { return c.id !== 40; });
        if (_nonScribe.length !== aff.length) {
          if (_nonScribe.length) {
            aff = _nonScribe;
          } else {
            var _scribeOk = openLocs.some(function (loc) {
              var _arr = G.aiSlots[loc.id] || [], _n = 0;
              for (var _q = 0; _q < _arr.length; _q++) if (_arr[_q]) _n++;
              return (_n + (simFilled[loc.id] || 0)) >= 2 && slotsLeft(loc.id) > 0;
            });
            if (!_scribeOk) break;   // hold Scribe — leftover capital is by design
          }
        }
      }
      aff.sort(function (a, b) { return ((b.ip + turnBias(b.id)) - (a.ip + turnBias(a.id))) || (b.cc - a.cc); });
      // Nebuchadnezzar (50) — get him onto the board as EARLY as possible: whenever
      // he's affordable, play him before other cards, so he lands on the first turn
      // the AI can afford him.
      var pick = aff[0];
      for (var n = 0; n < aff.length; n++) { if (aff[n].id === 50) { pick = aff[n]; break; } }
      // Card-specific heuristic loc (Soldier/Phoenicians/Priest/Ziggurat) else spread.
      var locId = biasedLoc(pick.id, openLocs, weakestOpenLoc(openLocs));

      plays.push({ cardId: pick.id, locId: locId });
      capital -= aiCost(pick, locId);   // spend the discounted cost
      simFilled[locId] = (simFilled[locId] || 0) + 1;
      simIP[locId]     = (simIP[locId] || 0) + (pick.ip || 0);
      var idx = hand.indexOf(pick.id);
      if (idx !== -1) hand.splice(idx, 1);
    }
    return plays;
  }

  /* The Hanging Gardens battle config — Arcadium-style capital battle with three
     PLACEHOLDER locations. Mirrors buildHammurabiConfig. */
  function buildHangingGardensConfig() {
    var st = (window.SOG && SOG.state) || {};
    return {
      structure: {
        turns:            5,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: NEB_AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _hgLocations() } },
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', movement: 'adventure', settings: { selectPlays: hgSelectPlays } },
      presentation: HG_PRESENTATION,
      rewards:  {},                       // none yet (placeholder build)
      scriptHook: 'hanging-gardens'
    };
  }

  /* Entry point — called by overworld._launchHangingGardensBattle after the wipe. */
  function start() {
    log('start() → initGame(buildHangingGardensConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHangingGardensConfig());
  }

  function isBattleComplete() { return _has(KEY_HG_COMPLETE); }

  return {
    start:                    start,
    buildHangingGardensConfig: buildHangingGardensConfig,
    isBattleComplete:         isBattleComplete,
    teardown:                 _hgTeardown
  };
})();

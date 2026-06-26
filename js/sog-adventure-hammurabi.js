/**
 * sog-adventure-hammurabi.js — SOG.HammurabiBattle (Phase D4+, STAGE 2).
 *
 * A SCRIPTED capital battle (scriptHook: 'hammurabi'), mirroring SOG.SargonBattle.
 * This is the third boss (after Gilgamesh and Sargon). Its wrinkle is THREE
 * locations that each carry a per-location ability (the engine keys built in
 * Stage 1, all SYMMETRIC):
 *   • Euphrates River (left)      → LABOR_PLUS_2_HERE    (Labor cards reveal here +2 IP, AT-ONCE)
 *   • The Fertile Crescent (center) → CAPITAL_WHEN_FULL  (+1 capital next turn when a side is full)
 *   • Tigris River (right)        → MILITARY_PLUS_1_HERE (Military cards reveal here +1 IP, AT-ONCE)
 *
 * STAGE 2 scope: the battle MODULE + CONFIG only. The location abilities FIRE
 * (the engine keys do the work), but their text is NOT shown yet — abilityText is
 * '' (Stage 3 = nameplate display; Stage 4 = the shake-reveal that populates it).
 * The registered 'hammurabi' script is MINIMAL: presentation (body class / screen /
 * avatars / cover-fade) + teardown only. The opening dialogue + shake-reveal land
 * in Stage 4; the win/loss/tie flow + rewards + post-game dialogue are in Stage 5.
 *
 * Hammurabi's card (id 47, "Eye For An Eye") sits in the AI deck and will be the
 * Stage-5 victory reward.
 */
window.SOG = window.SOG || {};
SOG.HammurabiBattle = (function () {
  'use strict';

  function log(msg) { console.log('[HammurabiBattle] ' + msg); }
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  var TYPE_SPEED_MS = 32;   // matches the Sargon/Gilgamesh battle typewriter

  // Set on the first Hammurabi victory (Stage 5 will set it). Drives the
  // post-win encounter-skip + scoreboard later — read-only stub for now.
  var KEY_HAMMURABI_COMPLETE = 'sog_battle_hammurabi_complete';

  // The IN-BATTLE opening dialogue plays FIRST-TIME ONLY (mirrors Sargon/Gilgamesh,
  // which gate their openings so the player doesn't re-watch every rematch). Clear
  // this key to replay. On repeat entries the dialogue is skipped and the location
  // ability text just shows statically (names + effects, no shake).
  var KEY_HAMMURABI_OPENING_SEEN = 'sog_hammurabi_opening_seen';
  var HAMMURABI_BUBBLE_PORTRAIT  = 'images/portraits/hammurabi.jpg';

  // ── Hammurabi's AI deck (ids). PLACEHOLDER 15-card Mesopotamia boss deck that
  //    INCLUDES Hammurabi (47). Finalized 15-card list:
  //    40 Scribe, 41 Canals, 42 Soldier, 43 Gilgamesh, 44 Enkidu, 45 Ziggurat,
  //    46 Cuneiform, 47 Hammurabi, 48 Chariot, 49 The Phoenicians, 37 Sargon,
  //    38 Priest, 39 Farmer, 31 Megalith, 32 Domesticated Animal.
  var HAMMURABI_AI_IDS = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 37, 38, 39, 31, 32];

  // ── Presentation (Hammurabi portrait + a hammurabi-battle body class). The body
  //    class supplies the location backgrounds (PLACEHOLDER art for now — see the
  //    CSS note below) and does NOT hide the hand / CC overlays.
  var HAMMURABI_PRESENTATION = {
    bodyClass:      'hammurabi-battle',
    allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
    opponentAvatar: 'images/portraits/hammurabi.jpg',
    popAlly:        true
  };

  // ── The 3 NEW locations (own ids 101/102/103 so they don't collide with the
  //    real locations or the Sargon/Gilgamesh battles). Each carries its Stage-1
  //    ability key. abilityText is '' on purpose this stage (Stage 4's shake-reveal
  //    populates it; Stage 3 styles the nameplate area).
  //    Left = Euphrates, center = Fertile Crescent, right = Tigris.
  //
  //    BACKGROUNDS: the `image` paths here + the body.hammurabi-battle CSS rules
  //    (style.css, .battle-col[data-loc-id]) both point at the real location art —
  //    euphrates.jpg / fertilecrescent.jpg / tigris.jpg. Keep the two in sync.
  function _hammurabiLocations() {
    return [
      { id: 101, name: 'Euphrates River',      region: 'Mesopotamia', abilityText: 'Labor cards reveal here with +2 IP',    abilityKey: 'LABOR_PLUS_2_HERE',    image: 'images/locations/euphrates.jpg',      thumbnailCrop: null },
      { id: 102, name: 'The Fertile Crescent', region: 'Mesopotamia', abilityText: '+1 Capital next turn when full.', abilityKey: 'CAPITAL_WHEN_FULL',    image: 'images/locations/fertilecrescent.jpg', thumbnailCrop: null },
      { id: 103, name: 'Tigris River',         region: 'Mesopotamia', abilityText: 'Military cards reveal here with +1 IP', abilityKey: 'MILITARY_PLUS_1_HERE', image: 'images/locations/tigris.jpg',         thumbnailCrop: null }
    ];
  }

  /* ── Presentation helpers (mirror Sargon) ─────────────────────────── */
  function _applyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass) document.body.classList.add(p.bodyClass);
  }

  /* Fade the overworld radial-wipe cover out to reveal the board. */
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

  /* Battle-exit teardown — removes the body class so it can't leak into a later
     battle, restores avatars, clears any lingering wipe. (Stage 4/5 will extend
     this for bubbles / popups.) */
  /* ── Battle rules popup + click-opponent trigger (standardized across bosses).
     [CREATED rules copy — refine.] Core rules only (no per-location abilities). ── */
  var RULES_TITLE = 'The Law of the Land';
  var RULES_BODY  = [
    '4 Turns',
    'Each card costs Capital (CC) to play.',
    '5 Capital to spend each turn.',
    '<u>Win Condition</u> — Gain the most IP at the most locations to defeat Hammurabi.'
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

  function _hammurabiTeardown() {
    document.body.classList.remove('hammurabi-battle');
    _unwireOpponentPortraitClick();
    _restoreOpponentBubblePortrait();
    hideBubbles();
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') {
      SOG.HUD.restoreBattleAvatars();
    }
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE 5 — WIN / LOSS / TIE + REWARDS (mirrors the Sargon end-game flow)
       • First win  → scoreboard (CONTINUE → victory dialogue → grant Hammurabi
                      card 47 + 25 gold → closing line → exit; GAME BOARD reviews).
       • Repeat win → VICTORY chime/pop-up → +10 gold → Play Again / Gameboard /
                      Back To Map scoreboard (card 47 NOT re-granted, no dialogue).
       • Loss / tie → BEFORE Hammurabi has been beaten, he delivers a verdict line
                      first, THEN the 3-button scoreboard; after he's been beaten,
                      losses/ties go straight to the scoreboard.
     Reuses the SHARED card-acquisition (preh.showCardAcquisition) + gold-reward
     animations and the in-battle dialogue runner — no new mechanisms.
     Gold: 25 first win / 10 repeat. Card 47 is the first-win reward. */
  var HAMMURABI_CARD_ID = 47;
  var GOLD_FIRST_WIN    = 25;
  var GOLD_REPEAT_WIN   = 10;

  /* Post-game dialogue (Hammurabi speaks through the shared opponent bubble, its
     portrait swapped to Hammurabi; same runner/bubbles as the opening). Editable. */
  // First-win victory exchange — his reaction to losing the "trial"; the last line
  // ("…entered into the record") pairs with granting card 47 right after.
  var WIN_DIALOGUE = [
    { who: 'hammurabi', text: 'Impossible.' },
    { who: 'hammurabi', text: 'The law was clearly on my side.' },
    { who: 'explorer',  text: 'Maybe you need to study your own Code.' },
    { who: 'hammurabi', text: 'If you have won, then the law must recognize it.' },
    { who: 'hammurabi', text: 'Take this' },
    { who: 'hammurabi', text: 'Let it be entered into the record.' }
  ];
  // First-win sendoff — plays after the card + gold are granted.
  var WIN_DIALOGUE_CLOSER = [
    { who: 'hammurabi', text: 'You have been found innocent.' },
    { who: 'hammurabi', text: 'For now.' }
  ];
  // Pre-victory loss exchange — plays before the defeat scoreboard.
  var LOSS_DIALOGUE = [
    { who: 'hammurabi', text: 'The verdict stands.' },
    { who: 'hammurabi', text: 'The law does not make exceptions.' },
    { who: 'explorer',  text: 'Can I appeal?' },
    { who: 'hammurabi', text: 'You may.' },
    { who: 'hammurabi', text: 'The law is patient.' }
  ];
  // Pre-victory tie exchange — plays before the tie scoreboard.
  var TIE_DIALOGUE = [
    { who: 'hammurabi', text: 'A hung verdict.' },
    { who: 'hammurabi', text: 'The law abhors an unresolved case.' },
    { who: 'hammurabi', text: 'We will try this again' },
    { who: 'hammurabi', text: 'Until judgment is clear.' }
  ];

  var RESULT_ID       = 'adv-hammurabi-result';
  var SHOW_RESULTS_ID = 'adv-hammurabi-show-results';

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
    op.textContent = 'Hammurabi: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'HAMMURABI' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  function _restartBattle() {
    _removeResultPopup();
    _hammurabiTeardown();
    start();
  }
  function _exitToOverworld() {
    _removeResultPopup();
    _hammurabiTeardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* ── Rewards (SHARED card-acquisition + gold animations) ─────────── */
  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  /* Grant Hammurabi's card (47) via the shared card-acquisition reveal — FIRST WIN
     ONLY: SOG.Cards.unlock returns truthy only on a NEW unlock, so on a repeat win
     (already owned) we skip the acquisition animation entirely. */
  function _grantHammurabiCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newly = !!SOG.Cards.unlock([HAMMURABI_CARD_ID]);
    }
    if (!newly) { if (done) done(); return; }   // already owned → no card reveal
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === HAMMURABI_CARD_ID; });
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
    overlay.id = 'hammurabi-gold-reward';
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

  /* Repeat-win flourish: VICTORY (same gold colour/font/glow as the scoreboard
     headline) pops in with the victory chime, holds 2.5s, fades → gold acquisition. */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'hammurabi-victory-flourish';
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

  /* CONTINUE on the first-win scoreboard: victory dialogue → grant Hammurabi's card
     (47) → +25 gold → closing line → exit to the map. */
  function _runFirstWinSequence() {
    _removeResultPopup();
    _swapOpponentBubblePortrait();
    runLines(WIN_DIALOGUE, function () {
      _grantHammurabiCard(function () {
        _grantGold(GOLD_FIRST_WIN, function () {
          runLines(WIN_DIALOGUE_CLOSER, function () {
            _exitToOverworld();
          });
        });
      });
    });
  }

  /* Build + show the end-game scoreboard.
       opts.firstWin — CONTINUE (→ card + gold) + GAME BOARD.
       otherwise     — PLAY AGAIN + GAMEBOARD + BACK TO MAP. */
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
      actions.appendChild(mkBtn('CONTINUE',   function () { _runFirstWinSequence(); }));
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn('BACK TO MAP', function () { _exitToOverworld(); }));
    }

    wrap.appendChild(headline);
    wrap.appendChild(locs);
    wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  /* Outcome routing — own the screen (never proceed()).
       • First win  → scoreboard (CONTINUE → card 47 + 25 gold → exit).
       • Repeat win → VICTORY flourish → +10 gold → 3-button scoreboard.
       • Loss / tie → 3-button scoreboard (standard retry; no intervention). */
  function _onWin(locResults) {
    var firstWin = !_has(KEY_HAMMURABI_COMPLETE);   // capture BEFORE setting the flag
    _set(KEY_HAMMURABI_COMPLETE);
    if (firstWin) {
      _showResultScoreboard(true, false, locResults, { firstWin: true });
    } else {
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
    // Before the player has ever beaten Hammurabi, he delivers a verdict line FIRST,
    // then the scoreboard. Once he's been beaten, losses/ties skip straight to it.
    var show = function () { _showResultScoreboard(false, isTie, locResults, {}); };
    if (_has(KEY_HAMMURABI_COMPLETE)) { show(); return; }
    _swapOpponentBubblePortrait();
    runLines(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, show);
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE 4 — location-ability shake-reveal
     ──────────────────────────────────────────────────────────────
     The battle opens showing NAMES ONLY: the ability text is already in the
     nameplate DOM (.battle-loc-ability, populated from each location's
     abilityText), but held at opacity 0 — so its HEIGHT is reserved and nothing
     shifts when it appears. On the opening beat each nameplate SHAKES (left→right
     stagger) and its ability line fades in, then stays for the rest of the battle.
  ══════════════════════════════════════════════════════════════ */
  var _dialogueActive = false;   // input blocked across the whole opening dialogue
  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }
  function _hideLocationAbilities() {
    var els = document.querySelectorAll('.battle-location .battle-loc-ability');
    Array.prototype.forEach.call(els, function (el) { el.style.opacity = '0'; });
  }
  function _revealLocationAbilities(onDone) {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.battle-location'));
    if (!tiles.length) { if (onDone) onDone(); return; }
    // All three laws are struck into the Code at ONCE — a single stone-stamp, every
    // tile shaking and its ability fading in together (no left→right stagger).
    SOG.sfx.play('sfx/cuneiformstamp.mp3');
    tiles.forEach(function (tile) {
      var ab = tile.querySelector('.battle-loc-ability');
      if (typeof gsap !== 'undefined') {
        gsap.timeline()
          .to(tile, { x: -5, duration: 0.05, ease: 'none' })
          .to(tile, { x:  5, duration: 0.06, ease: 'none' })
          .to(tile, { x: -3, duration: 0.05, ease: 'none' })
          .to(tile, { x:  3, duration: 0.05, ease: 'none' })
          .to(tile, { x:  0, duration: 0.05, ease: 'none' });
        if (ab) gsap.fromTo(ab, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      } else if (ab) {
        ab.style.opacity = '1';
      }
    });
    setTimeout(function () { if (onDone) onDone(); }, 1000);   // after the shake + fade
  }

  /* ══════════════════════════════════════════════════════════════
     IN-BATTLE OPENING DIALOGUE (editable)
     ──────────────────────────────────────────────────────────────
     Hammurabi speaks through the shared opponent bubble (#adv-bubble-otzi, its
     portrait swapped to Hammurabi); the Explorer through #adv-bubble-explorer —
     same boxes Sargon/Gilgamesh use, with the hammurabi-battle comic styling.
     The Code is REVEALED — nameplates shake + ability text fades in + stamp sfx
     (exactly _revealLocationAbilities) — and plays to COMPLETION *before* the line
     flagged `revealBefore: true` is delivered (Hammurabi's "As Shamash…").
  ══════════════════════════════════════════════════════════════ */
  var OPENING_DIALOGUE = [
    { who: 'explorer',  text: 'What did I do?' },
    { who: 'hammurabi', text: 'You answer to no city.' },
    { who: 'explorer',  text: 'Sure, I do.' },
    { who: 'hammurabi', text: 'Then name the law of the land of the Fertile Crescent.' },
    { who: 'explorer',  text: 'The… land has laws?' },
    { who: 'hammurabi', text: 'As Shamash, the God of Justice, has declared it.', revealBefore: true },
    { who: 'explorer',  text: 'I see. Every location plays by its own rules.' },
    { who: 'hammurabi', text: 'No, they play by my rules.' },
    { who: 'hammurabi', text: 'Now, you will obey.' }
  ];

  // Semantic speaker → shared bubble element id (Hammurabi borrows the opponent box).
  function _bubbleId(who) { return who === 'explorer' ? 'explorer' : 'otzi'; }

  var _bleepCtx = null;
  function getBleepCtx() {
    if (_bleepCtx) return _bleepCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _bleepCtx = new Ctx();
    } catch (e) {}
    return _bleepCtx;
  }
  // Hammurabi's bleep matches his overworld HUD tone (square wave, 240 Hz).
  var BLEEP_PROFILES = {
    hammurabi: { freq: 240, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer:  { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  function playBleep(who) {
    var ctx = getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.hammurabi;
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

  function getBubbleEl(id) { return document.getElementById('adv-bubble-' + id); }
  function hideBubbles() {
    ['otzi', 'explorer'].forEach(function (id) {
      var el = getBubbleEl(id);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }

  // Swap the shared opponent bubble's portrait to Hammurabi for the battle; restore
  // it on teardown so other battles are unaffected.
  var _origOtziBubbleSrc = null;
  function _swapOpponentBubblePortrait() {
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (_origOtziBubbleSrc === null) _origOtziBubbleSrc = img.getAttribute('src');
    img.setAttribute('src', HAMMURABI_BUBBLE_PORTRAIT);
  }
  function _restoreOpponentBubblePortrait() {
    if (_origOtziBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) img.setAttribute('src', _origOtziBubbleSrc);
    _origOtziBubbleSrc = null;
  }

  var _dlg = {
    lines: null, lineIdx: 0, isTyping: false, timer: null,
    fullText: '', textEl: null, activeEl: null, clickHandler: null, onAllDone: null
  };

  // Reveal-before-line gating: when a line is flagged `revealBefore`, the location
  // ability reveal plays to COMPLETION before that line is delivered. _revealFired
  // makes it fire once; _revealInProgress blocks input so the player can't click
  // past the reveal (or skip the upcoming line) while it animates.
  var _revealFired = false;
  var _revealInProgress = false;

  function runLines(lines, onAllDone) {
    _dlg.lines     = lines;
    _dlg.lineIdx   = 0;
    _dlg.onAllDone = onAllDone;
    _revealFired      = false;
    _revealInProgress = false;
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

    // Reveal-BEFORE-line: the location-ability reveal must COMPLETELY FINISH before
    // this line is delivered. The prior bubble lingers while the nameplates shake +
    // the laws fade in; once the reveal's onDone fires we re-enter and Hammurabi
    // speaks. Input stays blocked (advanceLine guards on _revealInProgress) so the
    // player can't click past the reveal or skip the upcoming line.
    if (line.revealBefore && !_revealFired) {
      _revealFired      = true;
      _revealInProgress = true;
      _revealLocationAbilities(function () {
        _revealInProgress = false;
        showLine();   // _revealFired now set → falls through to deliver the line
      });
      return;
    }

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
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.hammurabi;
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
    if (_revealInProgress) return;   // ignore clicks while the reveal plays to completion
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
    if (_has(KEY_HAMMURABI_OPENING_SEEN)) { if (onComplete) onComplete(); return; }
    runLines(OPENING_DIALOGUE, function () {
      _set(KEY_HAMMURABI_OPENING_SEEN);
      if (onComplete) onComplete();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     HAMMURABI SCRIPT — registered as 'hammurabi'
  ══════════════════════════════════════════════════════════════ */
  var HAMMURABI_SCRIPT = {
    // Pre-board: context body class + switch to the battle screen under the
    // overworld's radial-wipe cover (onBattleStart fades it).
    onIntro: function (ctx, done) {
      _applyPresentationClasses(ctx.config && ctx.config.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    // Board built + hands dealt by the engine; apply the Hammurabi avatars + bubble
    // portrait. FIRST TIME: open with NAMES ONLY, play the opening dialogue (the
    // Code reveals on the Shamash line), input gated across the whole dialogue,
    // then turn 1. REPEAT: skip the dialogue — the ability text just shows
    // statically (not hidden), turn 1 activates immediately.
    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _swapOpponentBubblePortrait();

      if (_has(KEY_HAMMURABI_OPENING_SEEN)) {
        // Repeat entry — no dialogue; ability text shows statically (names + effects).
        fadeOutCover(function () { _wireOpponentPortraitClick(); done(); });
        return;
      }

      _hideLocationAbilities();              // names only (text held at opacity 0)
      _disableButtons();
      _dialogueActive = true;                // block plays/drags through the dialogue
      fadeOutCover(function () {
        _runOpeningDialogue(function () {     // reveal fires mid-dialogue on the Shamash line
          _dialogueActive = false;
          _enableButtons();
          _wireOpponentPortraitClick();
          done();
        });
      });
    },

    // Block plays/drags while the opening dialogue is on screen.
    isInputBlocked: function (ctx) { return !!_dialogueActive; },

    // Win/loss/tie — STUBS (Stage 5). Default scoreboard + teardown.
    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onLoss(result.locResults); },
    onTie:  function (ctx, result, proceed) { _onTie(result.locResults); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hammurabi', HAMMURABI_SCRIPT);
  }

  /* Capital-aware AI selector behind game.js's 'heuristic' seam. Greedily plays
     the highest-IP affordable cards until the per-turn capital budget runs out.
     KEY DIFFERENCE from Sargon: the budget is ctx.capital — the value ai.js
     already computed as (CAPITAL + G.aiBonusCapitalNextTurn) with the accumulator
     then zeroed — so the AI actually SPENDS the Fertile-Crescent (CAPITAL_WHEN_FULL)
     bonus capital it earned. Falls back to config.resource.capital if ctx.capital
     is absent. (Sargon's selector reads the static config value and ignores it.) */
  function hammurabiSelectPlays(ctx) {
    var G   = ctx.G;
    var baseCap = (G.config && G.config.resource && typeof G.config.resource.capital === 'number')
      ? G.config.resource.capital : 5;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : baseCap;
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }

    var hand      = G.aiHand.slice();
    var simFilled = {};   // locId → placements simulated this turn (so we don't over-fill a slot)
    var simIP     = {};   // locId → IP the AI has committed THIS turn (for spreading)
    function slotsLeft(locId) {
      var arr = G.aiSlots[locId] || [], open = 0;
      for (var i = 0; i < arr.length; i++) if (arr[i] === null) open++;
      return open - (simFilled[locId] || 0);
    }
    // The AI's committed IP at a location: cards placed in prior turns + this turn's
    // simulated plays. Driving placement off this SPREADS the AI across locations.
    function aiCommittedIP(locId) {
      var ip = 0, arr = G.aiSlots[locId] || [];
      for (var i = 0; i < arr.length; i++) { var s = arr[i]; if (s) ip += (s.ip || 0); }
      return ip + (simIP[locId] || 0);
    }
    // Pick the open location where the AI is currently WEAKEST, so each play
    // contests a different location instead of piling into the leftmost one.
    function weakestOpenLoc(locs) {
      var best = locs[0], bestIP = aiCommittedIP(best.id);
      for (var i = 1; i < locs.length; i++) {
        var ip = aiCommittedIP(locs[i].id);
        if (ip < bestIP) { bestIP = ip; best = locs[i]; }
      }
      return best.id;
    }

    var plays = [], guard = 0;
    while (guard++ < 24) {
      // Affordable cards still in hand (cc ≤ remaining capital).
      var aff = [];
      for (var h = 0; h < hand.length; h++) {
        var c = cardById(hand[h]);
        if (c && c.cc <= capital) aff.push(c);
      }
      if (!aff.length) break;
      var openLocs = G.locations.filter(function (loc) { return slotsLeft(loc.id) > 0; });
      if (!openLocs.length) break;

      aff.sort(function (a, b) { return (b.ip - a.ip) || (b.cc - a.cc); });   // strongest first

      // Hammurabi (47) — Eye-for-an-Eye only does work at a location where the AI
      // has BOTH a card to SACRIFICE (an own card here other than Hammurabi) AND an
      // opposing card to DESTROY. Find such an open location; if none exists, don't
      // waste Hammurabi this turn (hold him / play other cards instead).
      var has47 = false;
      for (var a47 = 0; a47 < aff.length; a47++) { if (aff[a47].id === 47) { has47 = true; break; } }
      var hammTarget = null;
      if (has47) {
        for (var L = 0; L < openLocs.length; L++) {
          var lid = openLocs[L].id, own = G.aiSlots[lid] || [], opp = G.playerSlots[lid] || [];
          var ownSac = false, oppHit = false;
          for (var oi = 0; oi < own.length; oi++) { if (own[oi] && own[oi].cardId !== 47) { ownSac = true; break; } }
          for (var pi = 0; pi < opp.length; pi++) { if (opp[pi]) { oppHit = true; break; } }
          if (ownSac && oppHit) { hammTarget = lid; break; }
        }
      }

      var pick, locId;
      if (has47 && hammTarget !== null) {
        pick  = cardById(47);                 // play Hammurabi where it actually triggers
        locId = hammTarget;
      } else {
        // Never play Hammurabi without a valid sacrifice + target.
        var pool = [];
        for (var p = 0; p < aff.length; p++) { if (aff[p].id !== 47) pool.push(aff[p]); }
        if (!pool.length) break;              // only Hammurabi affordable but no target → hold it
        pick  = pool[0];
        locId = weakestOpenLoc(openLocs);     // strongest card → weakest location (spread)
      }

      plays.push({ cardId: pick.id, locId: locId });
      capital -= pick.cc;
      simFilled[locId] = (simFilled[locId] || 0) + 1;
      simIP[locId]     = (simIP[locId] || 0) + (pick.ip || 0);
      var idx = hand.indexOf(pick.id);
      if (idx !== -1) hand.splice(idx, 1);
    }
    return plays;
  }

  /* The Hammurabi battle config — Arcadium-style capital battle with the three
     ability-carrying locations. Mirrors buildSargonConfig. */
  function buildHammurabiConfig() {
    var st = (window.SOG && SOG.state) || {};
    return {
      // Arcadium-style structure: 4 turns, 3 locations, standard slots/hands.
      structure: {
        turns:            4,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        4,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },   // capital ON, 5/turn
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },                // the player's built 15-card deck
        ai:     { source: 'explicit', ids: HAMMURABI_AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _hammurabiLocations() } },
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', movement: 'adventure', settings: { selectPlays: hammurabiSelectPlays } },
      presentation: HAMMURABI_PRESENTATION,
      rewards:  {},                 // none yet — card-47 grant + gold come in Stage 5
      scriptHook: 'hammurabi'       // scripted battle (presentation now; dialogue/scoreboard in Stage 4/5)
    };
  }

  /* Entry point (called by overworld _launchHammurabiBattle after the radial wipe
     covers the screen). The 'hammurabi' script owns presentation via its hooks;
     here we only kick off the engine's build (which fires onIntro → onBattleStart). */
  function start() {
    log('start() → initGame(buildHammurabiConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHammurabiConfig());
  }

  function isBattleComplete() { return _has(KEY_HAMMURABI_COMPLETE); }

  return {
    start:                start,
    buildHammurabiConfig: buildHammurabiConfig,
    isBattleComplete:     isBattleComplete,
    teardown:             _hammurabiTeardown
  };
})();

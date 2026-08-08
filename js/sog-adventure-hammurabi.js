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

  function log(msg) { if (window.SOG_DEBUG) console.log('[HammurabiBattle] ' + msg); }
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
  var GOLD_FIRST_WIN    = 15;   // two-tier economy: 15 gold on the FIRST win of a tier (serf OR giant)
  var GOLD_REPEAT_WIN   = 0;    // replays of an already-beaten tier pay nothing (anti-farming)

  /* Post-game dialogue (Hammurabi speaks through the shared opponent bubble, its
     portrait swapped to Hammurabi; same runner/bubbles as the opening). Editable.
     The WIN beats live in the two-tier block below (HAMMURABI_SERF_WIN_* /
     HAMMURABI_GIANT_WIN_*); only the pre-win loss/tie exchanges are here. */
  // Pre-victory loss exchange — plays before the defeat scoreboard.
  var LOSS_DIALOGUE = [
    { who: 'hammurabi', text: 'The verdict stands.' },
    { who: 'hammurabi', text: 'The law does not make exceptions.' },
    { who: 'explorer',  text: "Can I appeal? Please? I'm kind of on a deadline to get home." },
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

  /* ══════════════════════════════════════════════════════════════════════════
     HAMMURABI TWO-TIER TEMPLATE — follows the SARGON pattern exactly:
       existing intro (untouched) → SERF WIN → interstitial (overworld) →
       GIANT rematch intro (in-battle) → GIANT win / loss / draw.
     who: 'hammurabi' = his portrait through the shared opponent bubble;
     'explorer' = the player. Acquisition animations fire INLINE at the marked
     beats (see the sequences below), not before/after the whole block.
     [source: sog-adventure-hammurabi.js → the constants in this block]
  ══════════════════════════════════════════════════════════════════════════ */

  // SERF WIN — grants 15 gold at the "restitution" beat, NO card. Split around the gold.
  var HAMMURABI_SERF_WIN_A = [
    { who: 'hammurabi', text: 'The verdict was in. And yet you overturned it.' },
    { who: 'explorer',  text: 'Is that a good thing?' },
    { who: 'hammurabi', text: 'You have been found innocent.' },
    { who: 'explorer',  text: 'That sounds good.' },
    { who: 'hammurabi', text: 'For now.' },
    { who: 'hammurabi', text: 'Here is your restitution.' }
    // → [GOLD — 15]
  ];
  var HAMMURABI_SERF_WIN_B = [
    { who: 'hammurabi', text: 'But one ruling does not settle the case.' },
    { who: 'hammurabi', text: 'Return, and I will try you by the full weight of the law.' }
  ];

  // GIANT REMATCH INTRO — in-battle, before the Giant rematch (onBattleStart).
  var HAMMURABI_GIANT_INTRO = [
    { who: 'hammurabi', text: 'The defendant returns.' },
    { who: 'explorer',  text: 'I brought my winning smile.' },
    { who: 'hammurabi', text: 'This does not please the court.' },
    { who: 'hammurabi', text: 'Prepare for judgment to be rendered.' }
  ];

  // GIANT WIN — grants the Hammurabi card THEN 15 gold at the "set in stone" beat.
  var HAMMURABI_GIANT_WIN_A = [
    { who: 'hammurabi', text: 'The law has spoken. And it speaks in your favor.' },
    { who: 'explorer',  text: 'And…' },
    { who: 'hammurabi', text: 'And it speaks in your favor.' },
    { who: 'explorer',  text: 'Yay! I love favors! What do I get?' },
    { who: 'hammurabi', text: 'The Code, set in stone.' }
    // → [CARD — Hammurabi 47] THEN [GOLD — 15]
  ];
  var HAMMURABI_GIANT_WIN_B = [
    { who: 'explorer',  text: "I was hoping for a ticket home, but I'll take it." },
    { who: 'hammurabi', text: 'Carry the law, wanderer. Few are fit to.' }
  ];

  // GIANT LOSS — dismissive, replayable (no grant).
  var HAMMURABI_GIANT_LOSS = [
    { who: 'hammurabi', text: 'The verdict stands. You are found wanting.' },
    { who: 'explorer',  text: 'But my only want is to get home.' },
    { who: 'hammurabi', text: 'The law does not bend for the unworthy.' },
    { who: 'hammurabi', text: 'Appeal when you are ready to be judged again.' }
  ];

  // GIANT DRAW — a stalemate is not a win, replayable (no grant).
  var HAMMURABI_GIANT_DRAW = [
    { who: 'hammurabi', text: 'A hung verdict. Neither guilty nor acquitted.' },
    { who: 'hammurabi', text: 'We will reconvene.' }
  ];

  /* The flag slot of the current battle (aligned with AI tier — no decoupling).
     The game state lives at SOG.state.G — there is no window.G global, so a
     window.G read is always undefined and would silently default to 'serf'. */
  function _flagTier() {
    var _G = (window.SOG && SOG.state && SOG.state.G) || null;
    return (_G && _G.config && (_G.config.flagTier
        || (_G.config.ai && _G.config.ai.tier))) || 'serf';
  }
  /* This battle is the Giant REMATCH (Giant flag, not yet beaten) → the in-battle
     intro (HAMMURABI_GIANT_INTRO) plays instead of the Serf opening tutorial. */
  function _isHammurabiGiantRematch() {
    return _flagTier() === 'giant' && !_tierBeatenLocal('hammurabi', 'giant');
  }

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

  /* SERF-win exit (mirrors Sargon's): tear down, then hand off to the overworld's
     Hammurabi-win return, which stamps the Serf flag, erects the Giant flag, rises
     the Hanging Gardens node and plays the interstitial. Sets the one-shot
     __pendingFlagReveal that return consumes. Plain exit as the fallback. */
  function _exitToOverworldAfterSerfWin() {
    _removeResultPopup();
    _hammurabiTeardown();
    window.__pendingFlagReveal = { hook: 'hammurabi', tier: 'giant' };   // Giant flag pops on the return
    if (window.Overworld && typeof window.Overworld.returnFromHammurabiWin === 'function') {
      window.Overworld.returnFromHammurabiWin();
    } else {
      _exitToOverworld();
    }
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

  /* Build + show the end-game scoreboard.
       opts.firstWin — CONTINUE (→ opts.onContinue, this stage's exit) + GAME BOARD.
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
      // Two-tier flow: the dialogue + acquisitions ALREADY ran on the battle screen,
      // so CONTINUE is just this stage's exit — opts.onContinue is
      // _exitToOverworldAfterSerfWin on the Serf win (Giant flag erect + Gardens
      // reveal + interstitial) and _exitToOverworld on the Giant win.
      var _cont = opts.onContinue || _exitToOverworld;
      actions.appendChild(mkBtn('CONTINUE',   function () { _cont(); }));
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
       • First win  → scoreboard (CONTINUE → card 47 + 25 gold → exit).
       • Repeat win → VICTORY flourish → +10 gold → 3-button scoreboard.
       • Loss / tie → 3-button scoreboard (standard retry; no intervention). */
  /* SERF WIN — [source: HAMMURABI_SERF_WIN_A/_B]. Block A → 15 gold at the
     "restitution" beat (NO card) → block B → scoreboard. CONTINUE runs the SERF-win
     return (Giant flag erect + Hanging Gardens reveal + interstitial). Dialogue plays
     on the battle screen BEFORE the scoreboard, matching Sargon. */
  function _runSerfWinSequence(locResults) {
    _removeResultPopup();
    _swapOpponentBubblePortrait();
    runLines(HAMMURABI_SERF_WIN_A, function () {
      _grantGold(GOLD_FIRST_WIN, function () {                 // 15 gold, NO card
        runLines(HAMMURABI_SERF_WIN_B, function () {
          _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworldAfterSerfWin });
        });
      });
    });
  }

  /* GIANT WIN — [source: HAMMURABI_GIANT_WIN_A/_B]. Block A → Hammurabi card THEN
     15 gold at the "set in stone" beat → block B → scoreboard. CONTINUE = plain exit
     (the Giant flag stamps via resumeAfterBattle; the Gardens were already revealed
     on the Serf win). */
  function _runGiantWinSequence(locResults) {
    _removeResultPopup();
    _swapOpponentBubblePortrait();
    runLines(HAMMURABI_GIANT_WIN_A, function () {
      _grantHammurabiCard(function () {                        // card first
        _grantGold(GOLD_FIRST_WIN, function () {               // then 15 gold
          runLines(HAMMURABI_GIANT_WIN_B, function () {
            _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworld });
          });
        });
      });
    });
  }

  function _onWin(locResults) {
    // Two-tier reward gate (SOG.rewards): first SERF win → 15 gold, NO card; first
    // GIANT win → 15 gold + the Hammurabi card; replay of a beaten flag → 0 gold.
    var r = (window.SOG && SOG.rewards)
          ? SOG.rewards.consume('hammurabi')
          : { firstTierWin: !_has(KEY_HAMMURABI_COMPLETE), gold: GOLD_FIRST_WIN,
              grantCard: (_flagTier() === 'giant' && !_tierBeatenLocal('hammurabi', 'giant')) };
    _set(KEY_HAMMURABI_COMPLETE);   // any-tier "beaten" — kept for node-reveal / narrative gates
    if (r.grantCard) {
      // FIRST GIANT win → judgment dialogue + card 47 + 15 gold.
      _runGiantWinSequence(locResults);
    } else if (r.firstTierWin) {
      // FIRST SERF win → serf-win dialogue + 15 gold (NO card) → serf-win return
      // (Giant flag erect + Hanging Gardens reveal + interstitial).
      _runSerfWinSequence(locResults);
    } else {
      // Replay of an already-beaten tier → flourish only, ZERO gold (anti-farming).
      _victoryFlourish(function () {
        _showResultScoreboard(true, false, locResults, {});
      });
    }
  }
  function _onLoss(locResults) { _onDefeatOrTie(false, locResults); }
  function _onTie(locResults)  { _onDefeatOrTie(true,  locResults); }
  function _onDefeatOrTie(isTie, locResults) {
    // GIANT REMATCH loss/draw (Giant flag, not yet beaten) → dedicated dialogue, then a
    // replayable scoreboard. No grant (the gold rules already pay nothing on a loss).
    if (_flagTier() === 'giant' && !_tierBeatenLocal('hammurabi', 'giant')) {
      _swapOpponentBubblePortrait();
      runLines(isTie ? HAMMURABI_GIANT_DRAW : HAMMURABI_GIANT_LOSS, function () {
        _showResultScoreboard(false, isTie, locResults, {});
      });
      return;
    }
    // SERF loss/tie (FRONT-HALF, UNCHANGED): before the player has ever beaten
    // Hammurabi he delivers a verdict line FIRST, then the scoreboard. Once he's
    // been beaten, losses/ties skip straight to it.
    var show = function () { _showResultScoreboard(false, isTie, locResults, {}); };
    if (_has(KEY_HAMMURABI_COMPLETE)) { show(); return; }
    _swapOpponentBubblePortrait();
    runLines(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, function () {
      // Loss verdict lands with a gavel strike before the scoreboard (tie: none).
      if (!isTie) { _playSfx('sfx/gavel.m4a'); setTimeout(show, 600); return; }
      show();
    });
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
  /* gavel.m4a has TWO pounds — measured onsets at ~30ms and ~520ms. Both opening
     beats sync their tile motion to these timestamps. */
  var GAVEL_POUND_1_MS = 30;
  var GAVEL_POUND_2_MS = 520;

  /* One bounce of every location tile (drop up + bounce-settle). mag = pixels. */
  function _bounceTiles(tiles, mag) {
    tiles.forEach(function (tile) {
      if (typeof gsap === 'undefined') return;
      gsap.timeline()
        .to(tile, { y: -mag, duration: 0.12, ease: 'power2.out' })
        .to(tile, { y: 0,    duration: 0.3,  ease: 'bounce.out' });
    });
  }

  /* First gavel beat (before "Does the accused understand…"): the location tiles
     BOUNCE INTO PLACE — one bounce on each of the gavel's two pounds. The ability
     text stays hidden (that's the second beat). */
  function _slamLocations(onDone) {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.battle-location'));
    if (!tiles.length) { if (onDone) onDone(); return; }
    _playSfx('sfx/gavel.m4a');
    setTimeout(function () { _bounceTiles(tiles, 16); }, GAVEL_POUND_1_MS);
    setTimeout(function () { _bounceTiles(tiles, 9);  }, GAVEL_POUND_2_MS);
    setTimeout(function () { if (onDone) onDone(); }, GAVEL_POUND_2_MS + 600);
  }

  /* Second gavel beat (before "I see now…"): the ability text FALLS INTO PLACE on
     each nameplate on the first pound, and the tiles bounce on the second pound. */
  function _revealLocationAbilities(onDone) {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.battle-location'));
    if (!tiles.length) { if (onDone) onDone(); return; }
    _playSfx('sfx/gavel.m4a');
    setTimeout(function () {
      tiles.forEach(function (tile) {
        var ab = tile.querySelector('.battle-loc-ability');
        if (!ab) return;
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(ab, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
        } else {
          ab.style.opacity = '1';
        }
      });
    }, GAVEL_POUND_1_MS);
    setTimeout(function () { _bounceTiles(tiles, 9); }, GAVEL_POUND_2_MS);
    setTimeout(function () { if (onDone) onDone(); }, GAVEL_POUND_2_MS + 600);
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
    { who: 'hammurabi', text: 'Order. Order.' },
    { who: 'hammurabi', text: 'The Court of Hammurabi is now in session.' },
    { who: 'explorer',  text: 'What did I do?!' },
    { who: 'hammurabi', text: 'The stranger before me is in violation of Law 7.' },
    { who: 'explorer',  text: "I'm innocent." },
    { who: 'hammurabi', text: 'You answer to no city--' },
    { who: 'hammurabi', text: 'Arriving with no witness, no contract, no account of oneself.' },
    { who: 'explorer',  text: "That doesn't make me a criminal!" },
    { who: 'hammurabi', text: 'Under the Code, a stranger who cannot account for himself is judged as a thief.' },
    { who: 'explorer',  text: "A thief?! But I didn't take anything!" },
    { who: 'hammurabi', text: 'Then where did you get that funny hat?' },
    { who: 'explorer',  text: "I don't know. Costco?" },
    { who: 'hammurabi', text: 'This is not the Costco.' },
    { who: 'hammurabi', text: 'Without a receipt, you stand trial.' },
    { who: 'hammurabi', text: 'As Shamash, the God of Justice, has declared it.' },
    { who: 'hammurabi', text: 'Does the accused understand the law of the land?', slamBefore: true },
    { who: 'explorer',  text: 'Maybe' },
    { who: 'explorer',  text: 'I see now. Each location plays by its own rules.', revealBefore: true },
    { who: 'hammurabi', text: 'No, they play by my rules.' },
    { who: 'hammurabi', text: 'Now, you will obey.' }
  ];

  // Hammurabi's bleep matches his overworld HUD tone (square wave, 240 Hz).
  var BLEEP_PROFILES = {
    hammurabi: { freq: 240, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer:  { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };

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

  // Reveal-before-line gating: when a line is flagged `revealBefore`, the location
  // ability reveal plays to COMPLETION before that line is delivered. _revealFired
  // makes it fire once; _revealInProgress blocks input so the player can't click
  // past the reveal (or skip the upcoming line) while it animates. Slam-before-line
  // is the same idea for the first gavel (tiles slam into place, no abilities yet).
  // This gate is Hammurabi-only — every other boss's onLineGate is a no-op.
  var _revealFired = false;
  var _slamFired  = false;
  var _revealInProgress = false;

  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'hammurabi',
    typeSpeedMs:       TYPE_SPEED_MS,
    onLineGate: function (line, next) {
      if (line.slamBefore && !_slamFired) {
        _slamFired        = true;
        _revealInProgress = true;
        _slamLocations(function () {
          _revealInProgress = false;
          next();   // _slamFired now set → falls through to deliver the line
        });
        return true;
      }
      if (line.revealBefore && !_revealFired) {
        _revealFired      = true;
        _revealInProgress = true;
        _revealLocationAbilities(function () {
          _revealInProgress = false;
          next();   // _revealFired now set → falls through to deliver the line
        });
        return true;
      }
      return false;
    },
    isAdvanceBlocked: function () { return _revealInProgress; }   // ignore clicks while the reveal plays to completion
  });
  function runLines(lines, onAllDone) {
    _revealFired = false;
    _slamFired = false;
    _revealInProgress = false;
    _runner.runLines(lines, onAllDone);
  }
  function hideBubbles()   { _runner.hideBubbles(); }
  function getBubbleEl(id) { return _runner.getBubbleEl(id); }

  /* Opening dialogue (first-time only; skipped → immediate onComplete on re-entry). */
  function _runOpeningDialogue(onComplete) {
    // Skip once seen OR once Hammurabi is beaten (entry dialogue never replays after a win).
    if (_has(KEY_HAMMURABI_OPENING_SEEN) || _has(KEY_HAMMURABI_COMPLETE)) { if (onComplete) onComplete(); return; }
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

      // GIANT rematch → in-battle intro (HAMMURABI_GIANT_INTRO), then straight to
      // play (no rules/ability tutorial — that was the Serf battle). Takes precedence
      // over the repeat-entry skip below. Mirrors Sargon's onBattleStart.
      if (_isHammurabiGiantRematch()) {
        _disableButtons();
        _dialogueActive = true;
        fadeOutCover(function () {
          runLines(HAMMURABI_GIANT_INTRO, function () {
            _dialogueActive = false;
            _enableButtons();
            _wireOpponentPortraitClick();
            done();
          });
        });
        return;
      }

      if (_has(KEY_HAMMURABI_OPENING_SEEN) || _has(KEY_HAMMURABI_COMPLETE)) {
        // Repeat entry (seen before, or Hammurabi already beaten) — no dialogue;
        // ability text shows statically (names + effects).
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
    // AI-side effective cost — the SAME path the player uses (owner 'ai'), so any
    // location/card discount applies to the AI's affordability + budget. Hammurabi's
    // deck/locations carry NO cost discounts today, so this equals base CC — it's a
    // no-op that keeps the selector uniform + correct if a discount card is decked.
    var _repLoc = (G.locations && G.locations[0]) ? G.locations[0].id : null;
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, (locId != null ? locId : _repLoc), 'ai') : card.cc;
    }

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

    // Card-placement heuristics shared with the engine (ai.js): Megalith early
    // (turn bias in the sort) + Soldier/Phoenicians/Priest/Ziggurat placement
    // (location bias). No-ops if SOG.ai isn't present. plays = this turn's
    // tentative context so co-location / hosts count.
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
      // Affordable cards still in hand (cc ≤ remaining capital).
      var aff = [];
      for (var h = 0; h < hand.length; h++) {
        var c = cardById(hand[h]);
        if (c && aiCost(c) <= capital) aff.push(c);
      }
      if (!aff.length) break;
      var openLocs = G.locations.filter(function (loc) { return slotsLeft(loc.id) > 0; });
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
        // Location: card-specific heuristic (Soldier→target, Phoenicians→host,
        // Priest/Ziggurat→pair) if it applies, else the weakest loc (spread).
        locId = biasedLoc(pick.id, openLocs, weakestOpenLoc(openLocs));
      }

      plays.push({ cardId: pick.id, locId: locId });
      capital -= aiCost(pick, locId);
      simFilled[locId] = (simFilled[locId] || 0) + 1;
      simIP[locId]     = (simIP[locId] || 0) + (pick.ip || 0);
      var idx = hand.indexOf(pick.id);
      if (idx !== -1) hand.splice(idx, 1);
    }
    return plays;
  }

  /* The Hammurabi battle config — Arcadium-style capital battle with the three
     ability-carrying locations. Mirrors buildSargonConfig. */
  /* Read a persisted tier-beaten flag (game.js stamps sog_node_<hook>_<tier>_beaten
     on a win). Mirrors Gilgamesh/Sargon — drives the config-default tier below. */
  function _tierBeatenLocal(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }

  function buildHammurabiConfig() {
    var st = (window.SOG && SOG.state) || {};
    // Tier derived from SAVE STATE (mirrors Gilgamesh): SERF until the Serf flag is
    // beaten, GIANT for the rematch. Restarts (PLAY AGAIN) rebuild this config with
    // __forceTier already consumed, so the default MUST be honest — a hardcoded
    // 'giant' here silently turned Serf retries into Giant battles.
    var _aiTier = _tierBeatenLocal('hammurabi', 'serf') ? 'giant' : 'serf';
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
      // Two-tier AI, tier derived from state (_aiTier above): SERF for the first
      // battle + retries, GIANT for the rematch ('hammurabi' signature: destruction
      // targeting + self-sacrifice bait + hold-for-target). Bespoke
      // hammurabiSelectPlays stays as the untiered fallback; __forceTier overrides.
      ai:       { profile: 'heuristic', tier: _aiTier, movement: 'adventure', settings: { selectPlays: hammurabiSelectPlays } },
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

  /* ── Snapshot (save-state.js) ── */
  function _setValue(key, v) {
    try {
      if (v) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function getSnapshot() {
    return {
      battleComplete: _has(KEY_HAMMURABI_COMPLETE),
      openingSeen: _has(KEY_HAMMURABI_OPENING_SEEN)
    };
  }
  function applySnapshot(snap) {
    if (!snap) return;
    _setValue(KEY_HAMMURABI_COMPLETE, snap.battleComplete);
    _setValue(KEY_HAMMURABI_OPENING_SEEN, snap.openingSeen);
  }

  return {
    start:                start,
    buildHammurabiConfig: buildHammurabiConfig,
    isBattleComplete:     isBattleComplete,
    teardown:             _hammurabiTeardown,
    getSnapshot:          getSnapshot,
    applySnapshot:        applySnapshot
  };
})();

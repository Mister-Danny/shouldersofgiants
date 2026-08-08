/**
 * sog-adventure-sargon.js — SOG.SargonBattle (Phase D4).
 *
 * A SCRIPTED capital battle (scriptHook: 'sargon'), modeled on the Gilgamesh
 * 'gilgamesh' script. start() just switches to the battle screen + calls the
 * engine's initGame(config); the registered 'sargon' script owns presentation:
 *   • onIntro       — context body class + showScreen, BEFORE the board builds.
 *   • onBattleStart — Sargon portrait avatars, fade the overworld radial-wipe
 *                     cover away, then the opening capital-tutorial dialogue +
 *                     rules popup, gating turn 1 until done().
 *   • onWin/onLoss/onTie — route to the Sargon end-game scoreboard (own the
 *                     screen; never proceed()). Buttons differ for the first
 *                     win (Continue / Game Board) vs every subsequent battle
 *                     (Play Again / Gameboard / Back To Map).
 *
 * Dialogue uses the SHARED battle speech bubbles (#adv-bubble-otzi as the
 * opponent bubble, #adv-bubble-explorer as the player bubble) — the exact same
 * boxes Gilgamesh and the other battles use — with the opponent bubble's portrait
 * swapped to Sargon for the duration of the battle. Sargon's typewriter bleep is
 * the same square-wave 440 Hz tone the overworld HUD uses for him.
 *
 * The Sargon CARD's continuous ability (id 37: +3 IP to each adjacent location
 * for its owner) is ALREADY implemented in evaluateContinuous → G.locationBoosts
 * → updateScores/tallyResult. It activates simply by Sargon (37) being in the
 * AI deck below — nothing here re-implements it.
 */
window.SOG = window.SOG || {};
SOG.SargonBattle = (function () {
  'use strict';

  var TYPE_SPEED_MS = 32;   // matches the Gilgamesh battle typewriter

  function log(msg) { if (window.SOG_DEBUG) console.log('[SargonBattle] ' + msg); }
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  // Set on the first Sargon victory — drives the scoreboard button set.
  var KEY_SARGON_COMPLETE = 'sog_battle_sargon_complete';

  // ── Sargon's AI deck (ids). Sargon (37) is included → his location boost
  //    activates. Hammurabi (47) intentionally excluded. 15 cards.
  var SARGON_AI_IDS = [38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 31, 36, 37, 32];

  // ── Presentation (Sargon portrait + Sargon's location art). The body class
  //    'sargon-battle' only paints the loc 8/7/2 backgrounds — it does NOT hide
  //    the hand / CC overlays (those are the 'otzi-*' classes, deliberately absent
  //    so this plays with the normal capital-battle UI).
  var SARGON_PRESENTATION = {
    bodyClass:      'sargon-battle',
    allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
    opponentAvatar: 'images/portraits/sargonportrait.jpg',
    popAlly:        true
  };
  var SARGON_BUBBLE_PORTRAIT = 'images/portraits/sargonportrait.jpg';

  // ── 3 locations (no abilities) — Left: Upper Sea (Mediterranean Coast),
  //    Center: Akkad, Right: Lower Sea (Persian Gulf Coast). Ids 8/7/2 so the
  //    body.sargon-battle CSS supplies their backgrounds. Sargon's ability
  //    favours the centre (Akkad) for adjacency to both seas.
  function _sargonLocations() {
    return [
      { id: 8, name: 'Upper Sea — Mediterranean Coast', region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/uppersea.jpg', thumbnailCrop: null },
      { id: 7, name: 'Akkad',                            region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/akkad.jpg',    thumbnailCrop: null },
      { id: 2, name: 'Lower Sea — Persian Gulf Coast',   region: 'Mesopotamia', abilityText: '', abilityKey: null, image: 'images/locations/lowersea.jpg', thumbnailCrop: null }
    ];
  }

  /* ── Opening capital-tutorial dialogue (editable) ───────────────────
     Sargon (the 'sargon' character/portrait) walks the player through the
     Capital resource the first time they fight him. Plays once per browser
     (gated by localStorage KEY_OPENING_SEEN, mirroring Gilgamesh); clear that
     key to replay. who: 'sargon' (opponent bubble) | 'explorer' (player). */
  var KEY_OPENING_SEEN = 'sog_sargon_opening_seen';
  var OPENING_DIALOGUE = [
    { who: 'sargon',   text: 'Before we begin, observe how an empire truly operates.' },
    { who: 'explorer', text: 'My cards look different!' },
    { who: 'sargon',   text: 'Exactly.' },
    { who: 'sargon',   text: 'Every card now comes with a price.' },
    { who: 'sargon',   text: 'This is the Capital cost.' },
    { who: 'explorer', text: "So I can't just play whatever I want?" },
    { who: 'sargon',   text: 'Welcome to Empire.' },
    { who: 'sargon',   text: 'You have five Capital each turn.' },
    { who: 'explorer', text: 'And what if I run out?' },
    { who: 'sargon',   text: "Then you wait 'til next turn." },
    { who: 'sargon',   text: 'If there is a next turn.' },
    { who: 'explorer', text: 'Five to spend, every turn.' },
    { who: 'explorer', text: 'Got it!' },
    { who: 'sargon',   text: "We'll see about that." }
  ];

  // ── Rules popup (mirrors Gilgamesh's format; bullet array, with one nested
  //    sub-bullet under the "carry over" line). ─────────────────────────
  var RULES_TITLE = 'The Empire of Sargon';
  var RULES_BODY  = [
    '4 Turns',
    'Each card costs Capital (CC) to play.',
    '5 Capital to spend each turn.',
    '<u>Win Condition</u> — Gain the most IP at the most locations to defeat Sargon.'
  ];

  // ── Post-game dialogue (editable). Battle-screen speech bubbles. ────
  var SARGON_CARD_ID = 37;
  var GOLD_FIRST_WIN = 15;   // two-tier economy: 15 gold on the FIRST win of a tier (serf OR giant)
  var GOLD_REPEAT_WIN = 0;   // replays of an already-beaten tier pay nothing (anti-farming)
  // Pre-win loss smack-talk — runs on the battle screen when the player chooses
  // BACK TO MAP after losing the FIRST (Serf) encounter (UNCHANGED front-half beat;
  // the Explorer's reflection line then plays on the map).
  var LOSS_SMACK = [
    { who: 'sargon', text: "You're no match for Empire." },
    { who: 'sargon', text: 'Be gone with you.' }
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     SARGON TWO-TIER TEMPLATE — the GENERAL pattern (Hammurabi/Neb/Narmer follow):
       existing intro (untouched) → SERF WIN → interstitial (overworld) →
       GIANT rematch intro (in-battle) → GIANT win / loss / draw.
     who: 'sargon' = Sargon's portrait; 'explorer' = the player. Acquisition
     animations fire INLINE at the marked beats (see the sequences below).
  ══════════════════════════════════════════════════════════════════════════ */

  // SERF WIN — grants 15 gold at the "Here." beat, NO card. Split around the gold.
  var SARGON_SERF_WIN_A = [
    { who: 'sargon',   text: 'Those who face the Akkadian line do not walk away.' },
    { who: 'explorer', text: 'I stand my ground.' },
    { who: 'explorer', text: 'With a smile.' },
    { who: 'sargon',   text: 'I do not.' },
    { who: 'sargon',   text: 'Here.' }
    // → [GOLD — 15]
  ];
  var SARGON_SERF_WIN_B = [
    { who: 'sargon',   text: 'Your reward.' },
    { who: 'explorer', text: 'Much thanks.' },
    { who: 'sargon',   text: 'I built empire from nothing.' },
    { who: 'sargon',   text: 'When you return, you will feel the full might of Akkad.' }
  ];

  // GIANT REMATCH INTRO — in-battle, before the Giant rematch (onBattleStart).
  var SARGON_GIANT_INTRO = [
    { who: 'sargon',   text: 'So you return for the true contest?' },
    { who: 'explorer', text: "It's the right thing to do…" },
    { who: 'explorer', text: 'Right?' },
    { who: 'sargon',   text: 'No mercy.' },
    { who: 'sargon',   text: 'You face the man who made the world kneel.' }
  ];

  // GIANT WIN — grants the Sargon card THEN 15 gold at the "Take this…" beat.
  var SARGON_GIANT_WIN_A = [
    { who: 'sargon',   text: 'I have conquered a thousand cities.' },
    { who: 'sargon',   text: 'Yet, today, the wanderer conquers me.' },
    { who: 'explorer', text: 'For what it’s worth, you were very intimidating.' },
    { who: 'sargon',   text: 'Take this, the mark of Akkad.' }
    // → [CARD — Sargon] THEN [GOLD — 15]
  ];
  var SARGON_GIANT_WIN_B = [
    { who: 'sargon',   text: "Few earn the Emperor's respect." },
    { who: 'sargon',   text: 'You have earned mine.' }
  ];

  // GIANT LOSS — dismissive, replayable (no grant).
  var SARGON_GIANT_LOSS = [
    { who: 'sargon',   text: 'As it must be.' },
    { who: 'sargon',   text: 'Empire endures.' },
    { who: 'sargon',   text: 'Return when you are ready to lose again.' }
  ];

  // GIANT DRAW — a stalemate is not a win, replayable (no grant).
  var SARGON_GIANT_DRAW = [
    { who: 'sargon',   text: "A stalemate? Against Akkad's finest?" },
    { who: 'sargon',   text: 'You are… stubborn.' },
    { who: 'sargon',   text: 'We settle this…' },
    { who: 'sargon',   text: 'Again.' }
  ];

  /* Read a persisted tier-beaten flag (game.js stamps sog_node_<hook>_<tier>_beaten
     on a win). Distinguishes the Giant REMATCH from a later Giant replay. */
  function _tierBeatenLocal(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }
  /* The flag slot of the current battle (Sargon: aligned with AI tier — no decoupling).
     The game state lives at SOG.state.G — there is no window.G global, so a window.G
     read is always undefined and would silently default to 'serf'. */
  function _flagTier() {
    var _G = (window.SOG && SOG.state && SOG.state.G) || null;
    return (_G && _G.config && (_G.config.flagTier
        || (_G.config.ai && _G.config.ai.tier))) || 'serf';
  }
  /* This battle is the Giant REMATCH (Giant flag, not yet beaten) → the in-battle
     dominance intro (SARGON_GIANT_INTRO) plays instead of the Serf opening tutorial. */
  function _isSargonGiantRematch() {
    return _flagTier() === 'giant' && !_tierBeatenLocal('sargon', 'giant');
  }

  /* ══════════════════════════════════════════════════════════════
     Opening dialogue runner — SHARED battle speech bubbles.
     Sargon speaks through the opponent bubble (#adv-bubble-otzi); the
     Explorer through #adv-bubble-explorer — the same boxes Gilgamesh uses.
     Sargon's bleep is the overworld HUD's square-wave 440 Hz tone.
  ══════════════════════════════════════════════════════════════ */
  // Matches SOG.HUD._playBleep generic branch (square wave, ±30 Hz wobble, fast
  // attack, exp decay) — so Sargon sounds identical in the overworld and battle.
  var BLEEP_PROFILES = {
    sargon:   { freq: 440, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };

  // Shared bubble/typewriter/bleep engine (js/game/dialogue-runner.js) — one
  // instance per boss, parameterized by this boss's bleep profiles.
  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'sargon',
    typeSpeedMs:       TYPE_SPEED_MS
  });
  function runLines(lines, onAllDone) { _runner.runLines(lines, onAllDone); }
  function hideBubbles()              { _runner.hideBubbles(); }
  function getBubbleEl(id)            { return _runner.getBubbleEl(id); }

  // Swap the shared opponent bubble's portrait to Sargon for the battle, and
  // restore the original (Otzi) on teardown so other battles are unaffected.
  var _origOtziBubbleSrc = null;
  function _swapOpponentBubblePortrait() {
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (_origOtziBubbleSrc === null) _origOtziBubbleSrc = img.getAttribute('src');
    img.setAttribute('src', SARGON_BUBBLE_PORTRAIT);
  }
  function _restoreOpponentBubblePortrait() {
    if (_origOtziBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) img.setAttribute('src', _origOtziBubbleSrc);
    _origOtziBubbleSrc = null;
  }

  /* Rules popup (shared component). */
  function _openRulesPopup(onDismiss) {
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function') {
      SOG.BattleRulesPopup.show({ title: RULES_TITLE, body: RULES_BODY, onDismiss: onDismiss });
    } else if (onDismiss) { onDismiss(); }
  }

  /* Click the opponent portrait → open the rules popup (standardized across bosses,
     mirrors Gilgamesh). Wired at the end of onBattleStart, unwired on teardown. */
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

  /* Opening capital tutorial: dialogue → rules popup → onComplete. Plays once
     per browser; skipped (immediate onComplete) on re-entry. */
  function _runOpeningDialogue(onComplete) {
    // Skip once seen OR once Sargon is beaten (entry dialogue never replays after a win).
    if (_has(KEY_OPENING_SEEN) || _has(KEY_SARGON_COMPLETE)) { if (onComplete) onComplete(); return; }
    runLines(OPENING_DIALOGUE, function () {
      _openRulesPopup(function () {
        _set(KEY_OPENING_SEEN);
        if (onComplete) onComplete();
      });
    });
  }

  /* ── Presentation helpers ─────────────────────────────────────── */
  function _applyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass) document.body.classList.add(p.bodyClass);
  }

  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }

  /* Fade the overworld radial-wipe cover out to reveal the board (mirrors the
     gilgamesh script's fadeOutCover). */
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

  /* Battle-exit teardown — removes the Mesopotamia body class so it can't leak
     into a later battle, restores the swapped opponent-bubble portrait + avatars,
     and clears any lingering popup / bubbles / wipe. Called from the scoreboard
     button actions (Play Again / Back To Map / Continue), the way Gilgamesh's
     outcome routing does. */
  function _sargonTeardown() {
    document.body.classList.remove('sargon-battle');
    _unwireOpponentPortraitClick();
    _restoreOpponentBubblePortrait();
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') {
      SOG.HUD.restoreBattleAvatars();
    }
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.hide === 'function') {
      SOG.BattleRulesPopup.hide();
    }
    hideBubbles();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* ══════════════════════════════════════════════════════════════
     END-GAME SCOREBOARD (mirrors the Gilgamesh / Otzi parchment scoreboard).
       • First win  → shown AFTER the victory sequence → BACK TO MAP + GAME BOARD.
       • Otherwise (any subsequent battle, win or loss; or a pre-win loss)
                    → PLAY AGAIN + GAMEBOARD + BACK TO MAP.
  ══════════════════════════════════════════════════════════════ */
  var RESULT_ID       = 'adv-sargon-result';
  var SHOW_RESULTS_ID = 'adv-sargon-show-results';

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
    op.textContent = 'Sargon: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'SARGON' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  function _restartBattle() {
    _removeResultPopup();
    _sargonTeardown();
    start();
  }
  function _exitToOverworld() {
    _removeResultPopup();
    _sargonTeardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') {
        window.Overworld.resumeAfterBattle();
      }
    }, 100);
  }

  /* SERF-win exit: tear down, then hand off to the overworld's Sargon-win return,
     which pops the Giant flag in + rises the Hammurabi node + plays the interstitial.
     Sets the one-shot __pendingFlagReveal the return consumes. Plain exit fallback. */
  function _exitToOverworldAfterSerfWin() {
    _removeResultPopup();
    _sargonTeardown();
    window.__pendingFlagReveal = { hook: 'sargon', tier: 'giant' };   // Giant flag pops on the return
    if (window.Overworld && typeof window.Overworld.returnFromSargonWin === 'function') {
      window.Overworld.returnFromSargonWin();
    } else {
      _exitToOverworld();
    }
  }

  /* ── Rewards ───────────────────────────────────────────────────── */
  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  /* Grant the Sargon card (37) via the shared card-acquisition reveal. If the
     player somehow already owns it, skip the reveal (SOG.Cards.unlock returns
     truthy only on a NEW unlock). */
  function _grantSargonCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newly = !!SOG.Cards.unlock([SARGON_CARD_ID]);
    }
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === SARGON_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Bank `amount` gold, refresh the HUD number, then play the coin-drop
     acquisition animation (copied from the Gilgamesh win path). */
  function _grantGold(amount, done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(amount, function () { if (done) done(); });
  }
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'sargon-gold-reward';
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

  /* SERF WIN — [source: SARGON_SERF_WIN_A/_B]. Block A → 15 gold at the "Here." beat
     (NO card) → block B → scoreboard. CONTINUE runs the SERF-win return (Giant flag
     pop + Hammurabi reveal + interstitial). Runs on the battle screen before the board. */
  function _runSerfWinSequence(locResults) {
    _removeResultPopup();
    runLines(SARGON_SERF_WIN_A, function () {
      _grantGold(GOLD_FIRST_WIN, function () {                 // 15 gold, NO card
        runLines(SARGON_SERF_WIN_B, function () {
          _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworldAfterSerfWin });
        });
      });
    });
  }

  /* GIANT WIN — [source: SARGON_GIANT_WIN_A/_B]. Block A → Sargon card THEN 15 gold at
     the "Take this…" beat → block B → scoreboard. CONTINUE = plain exit (the Giant flag
     stamps via resumeAfterBattle; Hammurabi was already revealed on the Serf win). */
  function _runGiantWinSequence(locResults) {
    _removeResultPopup();
    runLines(SARGON_GIANT_WIN_A, function () {
      _grantSargonCard(function () {                           // card first
        _grantGold(GOLD_FIRST_WIN, function () {               // then 15 gold
          runLines(SARGON_GIANT_WIN_B, function () {
            _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworld });
          });
        });
      });
    });
  }

  /* BACK TO MAP after a pre-win loss/tie: the Sargon smack-talk already played on
     the board (before the scoreboard), so just hand off to the overworld for the
     Explorer's closing reflection line. */
  function _returnToMapWithReflection() {
    _removeResultPopup();
    _sargonTeardown();
    if (window.Overworld && typeof window.Overworld.returnFromSargonLoss === 'function') {
      window.Overworld.returnFromSargonLoss();
    } else {
      _exitToOverworld();
    }
  }

  /* Build + show the end-game scoreboard.
       opts.firstWin     — Continue (→ victory sequence) + Game Board.
       opts.lossBeforeWin — Back To Map runs the pre-win loss sequence. */
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
      // Shown AFTER a tier-win sequence (dialogue + gold [+ card]). CONTINUE runs the
      // stage's exit: opts.onContinue = _exitToOverworldAfterSerfWin on the Serf win
      // (Giant flag pop + Hammurabi reveal + interstitial), _exitToOverworld on the
      // Giant win (plain — Giant flag stamps via resumeAfterBattle).
      var _cont = opts.onContinue || _exitToOverworld;
      actions.appendChild(mkBtn('CONTINUE', function () { _cont(); }));
      actions.appendChild(mkBtn('GAME BOARD',  function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn(won ? 'CONTINUE' : 'BACK TO MAP', function () {
        if (opts.lossBeforeWin) { _returnToMapWithReflection(); }
        else { _exitToOverworld(); }
      }));
    }

    wrap.appendChild(headline);
    wrap.appendChild(locs);
    wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  /* Outcome routing — own the screen (never proceed()).
       • First win   → scoreboard (Continue → victory sequence + Sargon card +25g).
       • Repeat win  → +10 gold, then the Play Again / Gameboard / Back To Map board.
       • Loss/tie    → Play Again / Gameboard / Back To Map; a pre-win loss runs the
                       Sargon smack-talk + map reflection off BACK TO MAP. */
  /* Repeat-win flourish: the word VICTORY — same gold colour / font / glow as the
     scoreboard headline (.result-headline.result-player) — pops in with the victory
     chime, holds 2.5s, then fades and hands off to the gold acquisition. Only the
     REPEAT-win path uses it (the first win has its full victory sequence instead). */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'sargon-victory-flourish';
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

  function _onWin(locResults) {
    // Two-tier reward gate (SOG.rewards): first SERF win → 15 gold, NO card; first
    // GIANT win → 15 gold + the Sargon card; replay of a beaten flag → 0 gold.
    var r = (window.SOG && SOG.rewards)
          ? SOG.rewards.consume('sargon')
          : { firstTierWin: !_has(KEY_SARGON_COMPLETE), gold: GOLD_FIRST_WIN,
              grantCard: (_flagTier() === 'giant' && !_tierBeatenLocal('sargon', 'giant')) };
    _set(KEY_SARGON_COMPLETE);   // any-tier "beaten" — kept for node-reveal / narrative gates
    if (r.grantCard) {
      // FIRST GIANT win → dominance-respect dialogue + Sargon card + 15 gold.
      _runGiantWinSequence(locResults);
    } else if (r.firstTierWin) {
      // FIRST SERF win → serf-win dialogue + 15 gold (NO card) → serf-win return
      // (Giant flag pop + Hammurabi reveal + interstitial).
      _runSerfWinSequence(locResults);
    } else {
      // Replay of an already-beaten flag → flourish only, ZERO gold (anti-farming).
      _victoryFlourish(function () {
        _showResultScoreboard(true, false, locResults, {});
      });
    }
  }
  function _onLoss(locResults) { _onDefeatOrTie(false, locResults); }
  function _onTie(locResults)  { _onDefeatOrTie(true,  locResults); }

  /* Loss / tie. Before the first Sargon win, he dismisses the challenger on the
     board FIRST — so the dialogue ALWAYS fires (not gated behind a scoreboard
     button the player might not click) — THEN the scoreboard appears; BACK TO MAP
     returns to the map with the Explorer's reflection. Once Sargon has been
     beaten, a later loss/tie goes straight to the scoreboard with no dialogue. */
  function _onDefeatOrTie(isTie, locResults) {
    // GIANT REMATCH loss/draw (Giant flag, not yet beaten) → dedicated dialogue, then a
    // replayable scoreboard. No grant (the gold rules already pay nothing on a loss).
    if (_flagTier() === 'giant' && !_tierBeatenLocal('sargon', 'giant')) {
      runLines(isTie ? SARGON_GIANT_DRAW : SARGON_GIANT_LOSS, function () {
        _showResultScoreboard(false, isTie, locResults, {});
      });
      return;
    }
    // SERF loss/tie (FRONT-HALF, UNCHANGED): before any win Sargon dismisses the
    // challenger on the board first, then the scoreboard; afterwards straight to it.
    var beforeWin = !_has(KEY_SARGON_COMPLETE);
    if (beforeWin) {
      runLines(LOSS_SMACK, function () {
        _showResultScoreboard(false, isTie, locResults, { lossBeforeWin: true });
      });
    } else {
      _showResultScoreboard(false, isTie, locResults, {});
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SARGON SCRIPT — registered as 'sargon'
  ══════════════════════════════════════════════════════════════ */
  var _dialogueActive = false;

  var SARGON_SCRIPT = {
    // Pre-board: context body class + switch to the battle screen under the
    // overworld's radial-wipe cover (onBattleStart fades it).
    onIntro: function (ctx, done) {
      _applyPresentationClasses(ctx.config && ctx.config.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    // Board is built + hands dealt by the engine; apply the Sargon avatars +
    // bubble portrait, reveal the board, then run the opening capital tutorial.
    // Gate turn 1 (done) until the dialogue + rules popup finish.
    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _swapOpponentBubblePortrait();
      _disableButtons();
      fadeOutCover(function () {
        var finish = function () {
          _dialogueActive = false;
          _enableButtons();
          _wireOpponentPortraitClick();
          done();
        };
        _dialogueActive = true;
        // GIANT rematch → in-battle dominance intro (SARGON_GIANT_INTRO), straight to
        // play (no rules popup — the player learned the rules in the Serf battle). The
        // EXISTING Serf opening tutorial (_runOpeningDialogue) is left untouched.
        var _rematch = _isSargonGiantRematch();
        if (_rematch) { runLines(SARGON_GIANT_INTRO, finish); }
        else { _runOpeningDialogue(finish); }
      });
    },

    // Block plays/drags while the opening dialogue is on screen.
    isInputBlocked: function (ctx) { return !!_dialogueActive; },

    // Win/loss/tie — own the end-game scoreboard + post-game narrative.
    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onLoss(result.locResults); },
    onTie:  function (ctx, result, proceed) { _onTie(result.locResults); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('sargon', SARGON_SCRIPT);
  }

  /* Capital-aware AI selector behind game.js's 'heuristic' seam. Receives
     ctx = { G, turn, hand, locations } and RETURNS [{cardId, locId}] in play
     order; the engine commits each via its own commitPlay. Greedily plays the
     highest-IP affordable cards until the per-turn capital budget runs out (so it
     respects capital instead of the Adventure 2-card cap), preferring to place
     Sargon (37) in the MIDDLE location for maximum adjacency value. */
  function sargonSelectPlays(ctx) {
    var G   = ctx.G;
    var CAP = (G.config && G.config.resource && typeof G.config.resource.capital === 'number')
      ? G.config.resource.capital : 5;
    var capital = CAP;
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    // AI-side effective cost — the SAME path the player uses (owner 'ai'), so any
    // location/card discount applies to the AI's affordability + budget. Sargon's
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

      // Sargon (37) — ALWAYS into the MIDDLE location (his +3 boosts BOTH flanks
      // there). Prioritize him so he claims the middle slot before other cards
      // spread into it; only fall back if the middle is full.
      var mid = G.locations[Math.floor(G.locations.length / 2)];
      var sargonAff = null;
      for (var s = 0; s < aff.length; s++) { if (aff[s].id === 37) { sargonAff = aff[s]; break; } }
      var pick, locId;
      if (sargonAff && mid && slotsLeft(mid.id) > 0) {
        pick  = sargonAff;
        locId = mid.id;
      } else {
        pick  = aff[0];
        // Card-specific heuristic loc (Soldier/Phoenicians/Priest/Ziggurat) else spread.
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

  /* The Sargon battle config — Arcadium-style capital battle with the Sargon deck. */
  function buildSargonConfig() {
    var st = (window.SOG && SOG.state) || {};
    // Tier derived from SAVE STATE (mirrors Gilgamesh): SERF until the Serf flag is
    // beaten, GIANT for the rematch. Restarts (PLAY AGAIN) rebuild this config with
    // __forceTier already consumed, so the default MUST be honest — a hardcoded
    // 'giant' here silently turned Serf retries into Giant battles (wrong flag
    // stamp, wrong card grant, phantom Giant intro).
    var _aiTier = _tierBeatenLocal('sargon', 'serf') ? 'giant' : 'serf';
    return {
      // Arcadium-style structure: 4 turns, 3 locations, standard slots/hands.
      // NO cardsPerTurn cap (capital governs how many cards you can play).
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
        player: { source: 'active-deck', shuffle: true },                // the player's built deck
        ai:     { source: 'explicit', ids: SARGON_AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _sargonLocations() } },
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      // Two-tier AI, tier derived from state (_aiTier above): SERF for the first
      // battle + retries, GIANT for the rematch. Bespoke sargonSelectPlays stays as
      // the untiered fallback; window.__forceTier (node click / dev menu) still
      // overrides this in initGame.
      ai:       { profile: 'heuristic', tier: _aiTier, movement: 'adventure', settings: { selectPlays: sargonSelectPlays } },
      presentation: SARGON_PRESENTATION,
      rewards:  {},                 // none yet — win/loss/reward flow comes with the script later
      scriptHook: 'sargon'          // scripted battle (presentation + opening tutorial + scoreboard)
    };
  }

  /* Entry point (called by overworld _launchSargonBattle after the radial wipe
     covers the screen). The 'sargon' script owns presentation via its hooks; here
     we only kick off the engine's build (which fires onIntro → onBattleStart). */
  function start() {
    log('start() → initGame(buildSargonConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildSargonConfig());
  }

  function isBattleComplete() { return _has(KEY_SARGON_COMPLETE); }

  /* ── Snapshot (save-state.js) ── */
  function _setValue(key, v) {
    try {
      if (v) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function getSnapshot() {
    return {
      battleComplete: _has(KEY_SARGON_COMPLETE),
      openingSeen: _has(KEY_OPENING_SEEN)
    };
  }
  function applySnapshot(snap) {
    if (!snap) return;
    _setValue(KEY_SARGON_COMPLETE, snap.battleComplete);
    _setValue(KEY_OPENING_SEEN, snap.openingSeen);
  }

  return {
    start:             start,
    buildSargonConfig: buildSargonConfig,
    isBattleComplete:  isBattleComplete,
    teardown:          _sargonTeardown,
    getSnapshot:       getSnapshot,
    applySnapshot:     applySnapshot
  };
})();

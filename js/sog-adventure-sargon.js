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

  function log(msg) { console.log('[SargonBattle] ' + msg); }
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
    { who: 'explorer', text: 'Wait.' },
    { who: 'explorer', text: 'My cards look different.' },
    { who: 'sargon',   text: 'Exactly.' },
    { who: 'sargon',   text: 'Every card now comes with a price.' },
    { who: 'sargon',   text: 'This is the Capital cost.' },
    { who: 'explorer', text: "So I can't just play whatever I want?" },
    { who: 'sargon',   text: 'Welcome to Empire.' },
    { who: 'sargon',   text: 'Everything has a cost.' },
    { who: 'sargon',   text: 'You have five Capital each turn.' },
    { who: 'explorer', text: 'And what if I run out?' },
    { who: 'sargon',   text: "Then you wait 'til next turn." },
    { who: 'sargon',   text: 'If there is a next turn.' },
    { who: 'explorer', text: 'Five to spend, every turn.' },
    { who: 'explorer', text: 'Got it.' },
    { who: 'sargon',   text: "We'll see about that." }
  ];

  // ── Rules popup (mirrors Gilgamesh's format; bullet array, with one nested
  //    sub-bullet under the "carry over" line). ─────────────────────────
  var RULES_TITLE = 'The Empire of Sargon';
  var RULES_BODY  = [
    'Each card costs Capital (CC) to play it.',
    'You have 5 Capital to spend each turn.',
    'Unspent Capital does not carry over.<ul class="rules-popup-list"><li>It refreshes to 5 each turn.</li></ul>',
    '4 turns.',
    'Win the most locations to defeat Sargon.'
  ];

  // ── Post-game dialogue (editable). Battle-screen speech bubbles. ────
  var SARGON_CARD_ID = 37;
  var GOLD_FIRST_WIN = 25;
  var GOLD_REPEAT_WIN = 10;
  // First-win victory dialogue — runs after CONTINUE, before the Sargon card grant.
  var WIN_DIALOGUE = [
    { who: 'sargon',   text: "You've bested me." },
    { who: 'sargon',   text: 'But how?' },
    { who: 'explorer', text: "I've learned from the past…" },
    { who: 'explorer', text: 'And the future.' },
    { who: 'sargon',   text: "I don't understand." },
    { who: 'explorer', text: "I've heard its best not to overthink it." },
    { who: 'sargon',   text: 'You are wise.' },
    { who: 'sargon',   text: 'And so am I.' },
    { who: 'sargon',   text: 'Take this as a symbol of our budding alliance.' }
  ];
  // First-win closing line — runs after the Sargon card + gold, before exiting to the map.
  var WIN_DIALOGUE_CLOSER = [
    { who: 'explorer', text: 'I see why they call you The Great.' }
  ];
  // Pre-win loss smack-talk — runs on the battle screen when the player chooses
  // BACK TO MAP after losing (the Explorer's reflection line then plays on the map).
  var LOSS_SMACK = [
    { who: 'sargon', text: "You're no match for Empire." },
    { who: 'sargon', text: 'Be gone with you.' }
  ];

  /* ══════════════════════════════════════════════════════════════
     Opening dialogue runner — SHARED battle speech bubbles.
     Sargon speaks through the opponent bubble (#adv-bubble-otzi); the
     Explorer through #adv-bubble-explorer — the same boxes Gilgamesh uses.
     Sargon's bleep is the overworld HUD's square-wave 440 Hz tone.
  ══════════════════════════════════════════════════════════════ */
  // Semantic speaker → shared bubble element id (Sargon borrows the opponent box).
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
  // Matches SOG.HUD._playBleep generic branch (square wave, ±30 Hz wobble, fast
  // attack, exp decay) — so Sargon sounds identical in the overworld and battle.
  var BLEEP_PROFILES = {
    sargon:   { freq: 440, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  function playBleep(who) {
    var ctx = getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.sargon;
    var now = ctx.currentTime;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var freq = p.freq + (Math.random() - 0.5) * p.wobble;
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(p.peak, now + 0.005);
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

  var _dlg = {
    lines: null, lineIdx: 0, isTyping: false, timer: null,
    fullText: '', textEl: null, activeEl: null, clickHandler: null, onAllDone: null
  };

  function runLines(lines, onAllDone) {
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
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.sargon;
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

  /* Rules popup (shared component). */
  function _openRulesPopup(onDismiss) {
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function') {
      SOG.BattleRulesPopup.show({ title: RULES_TITLE, body: RULES_BODY, onDismiss: onDismiss });
    } else if (onDismiss) { onDismiss(); }
  }

  /* Opening capital tutorial: dialogue → rules popup → onComplete. Plays once
     per browser; skipped (immediate onComplete) on re-entry. */
  function _runOpeningDialogue(onComplete) {
    if (_has(KEY_OPENING_SEEN)) { if (onComplete) onComplete(); return; }
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
       • First win  → CONTINUE + GAME BOARD.
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

  /* First-win exit: tear down, then hand off to the overworld's Sargon-win return,
     which rises the Hammurabi node out of the dirt. Falls back to the plain exit. */
  function _exitToOverworldAfterFirstWin() {
    _removeResultPopup();
    _sargonTeardown();
    if (window.Overworld && typeof window.Overworld.returnFromSargonWin === 'function') {
      window.Overworld.returnFromSargonWin();
    } else {
      _exitToOverworld();
    }
  }

  /* ── Rewards ───────────────────────────────────────────────────── */
  function _playSfx(src) { try { var a = new Audio(src); a.play(); } catch (e) {} }

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

  /* CONTINUE on the first-win scoreboard: victory dialogue → Sargon card grant
     → +25 gold → closing line → exit to the map (all on the battle screen). */
  function _runFirstWinSequence() {
    _removeResultPopup();
    runLines(WIN_DIALOGUE, function () {
      _grantSargonCard(function () {
        _grantGold(GOLD_FIRST_WIN, function () {
          runLines(WIN_DIALOGUE_CLOSER, function () {
            _exitToOverworldAfterFirstWin();
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
      actions.appendChild(mkBtn('CONTINUE',   function () { _runFirstWinSequence(); }));
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn('BACK TO MAP', function () {
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
    var firstWin = !_has(KEY_SARGON_COMPLETE);
    _set(KEY_SARGON_COMPLETE);
    if (firstWin) {
      _showResultScoreboard(true, false, locResults, { firstWin: true });
    } else {
      // Repeat win: VICTORY chime + pop-up (2.5s) → +10 gold acquisition → scoreboard.
      _victoryFlourish(function () {
        _grantGold(GOLD_REPEAT_WIN, function () {
          _showResultScoreboard(true, false, locResults, {});
        });
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
        _dialogueActive = true;
        _runOpeningDialogue(function () {
          _dialogueActive = false;
          _enableButtons();
          done();
        });
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
      var pick = aff[0], locId;
      if (pick.id === 37) {
        var mid = G.locations[Math.floor(G.locations.length / 2)];           // Sargon → middle
        locId = (mid && slotsLeft(mid.id) > 0) ? mid.id : weakestOpenLoc(openLocs);
      } else {
        locId = weakestOpenLoc(openLocs);   // strongest card → weakest location (spread)
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

  /* The Sargon battle config — Arcadium-style capital battle with the Sargon deck. */
  function buildSargonConfig() {
    var st = (window.SOG && SOG.state) || {};
    return {
      // Arcadium-style structure: 4 turns, 3 locations, standard slots/hands.
      // NO cardsPerTurn cap (capital governs how many cards you can play).
      structure: {
        turns:            4,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
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
      ai:       { profile: 'heuristic', movement: 'adventure', settings: { selectPlays: sargonSelectPlays } },
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

  return {
    start:             start,
    buildSargonConfig: buildSargonConfig,
    isBattleComplete:  isBattleComplete,
    teardown:          _sargonTeardown
  };
})();

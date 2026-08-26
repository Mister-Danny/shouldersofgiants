/* ══════════════════════════════════════════════════════════════════════════
   SOG.LevelRuntime — generic, data-driven battle/market launcher.

   SPIKE. Proves that a level defined purely as data in data/level-data.js
   (window.SOG_LEVEL_DATA.levels[nodeId]) can be launched through the SAME
   engine (initGame + BattleHooks) the five hand-authored bosses use, with
   NO boss-specific JS of its own — only what SOG_LEVEL_DATA supplies plus
   the shared SOG.DialogueRunner, SOG.ai.{serfSelectPlays,giantSelectPlaysFor},
   and SOG.rewards the engine already exposes generically.

   Reproduces the full two-tier (Serf → Giant) capital-battle template every
   boss but Gilgamesh follows: turns/locations/deck/resource/dialogue/reward/
   rules-popup/tier-ladder, including the sog_node_<hook>_<tier>_beaten flag
   stamp — that stamp happens entirely inside js/game.js's endGame(), keyed
   only off G.config.scriptHook + G.config.ai.tier, so it required NO code
   here beyond setting those two fields correctly per tier.

   Still out of scope, deliberately: anything like Nebuchadnezzar's flood —
   real bespoke JS hung off a lifecycle hook, not data a generic launcher can
   reproduce (see MAP_EDITOR_SPEC investigation). A level needing that stays
   a hand-authored boss file, same as today.
   ══════════════════════════════════════════════════════════════════════════ */
window.SOG = window.SOG || {};
SOG.LevelRuntime = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[LevelRuntime] ' + msg); }
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  var _registered = {};   // levelId -> true, once its BattleHooks script is registered

  function _levelOf(levelId) {
    var d = window.SOG_LEVEL_DATA;
    return (d && d.levels && d.levels[levelId]) || null;
  }

  /* ── Presentation helpers (mirror the boss files' identical copies) ──── */
  function _applyPresentationClasses(p) {
    if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
  }
  function _removePresentationClasses(p) {
    if (p && p.bodyClass) document.body.classList.remove(p.bodyClass);
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
  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }
  function _opponentAvatarEl() { return document.querySelector('.battle-avatar-opponent'); }

  /* ── One dialogue-runner + one set of per-level teardown state, keyed by levelId ── */
  var _state = {};   // levelId -> { runner, origBubbleSrc, portraitClickHandler }

  function _stateFor(levelId) {
    if (!_state[levelId]) _state[levelId] = { runner: null, origBubbleSrc: null, portraitClickHandler: null, turn1Timer: null };
    return _state[levelId];
  }

  function _swapOpponentBubblePortrait(levelId, portraitSrc) {
    if (!portraitSrc) return;
    var st  = _stateFor(levelId);
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (st.origBubbleSrc === null) st.origBubbleSrc = img.getAttribute('src');
    img.setAttribute('src', portraitSrc);
  }
  function _restoreOpponentBubblePortrait(levelId) {
    var st = _stateFor(levelId);
    if (st.origBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) img.setAttribute('src', st.origBubbleSrc);
    st.origBubbleSrc = null;
  }
  function _wireOpponentPortraitClick(levelId, level) {
    var st = _stateFor(levelId);
    var el = _opponentAvatarEl();
    if (!el || st.portraitClickHandler) return;
    el.classList.add('rules-clickable');
    st.portraitClickHandler = function () { _openRulesPopup(level); };
    el.addEventListener('click', st.portraitClickHandler);
  }
  function _unwireOpponentPortraitClick(levelId) {
    var st = _stateFor(levelId);
    var el = _opponentAvatarEl();
    if (el && st.portraitClickHandler) el.removeEventListener('click', st.portraitClickHandler);
    if (el) el.classList.remove('rules-clickable');
    st.portraitClickHandler = null;
  }
  function _openRulesPopup(level, onDismiss) {
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.show === 'function' && level.rulesPopup) {
      SOG.BattleRulesPopup.show({ title: level.rulesPopup.title, body: level.rulesPopup.body, onDismiss: onDismiss });
    } else if (onDismiss) { onDismiss(); }
  }

  /* ── Tier state (mirrors every two-tier boss's _tierBeatenLocal/_flagTier).
     Reads the SAME sog_node_<hook>_<tier>_beaten flags js/game.js's endGame()
     stamps generically — no level-runtime-specific storage. ────────────── */
  function _tierBeatenLocal(levelId, tier) {
    try { return localStorage.getItem('sog_node_' + levelId + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }
  function _flagTier() {
    var _G = (window.SOG && SOG.state && SOG.state.G) || null;
    return (_G && _G.config && (_G.config.flagTier || (_G.config.ai && _G.config.ai.tier))) || 'serf';
  }
  function _isGiantRematch(levelId) {
    return _flagTier() === 'giant' && !_tierBeatenLocal(levelId, 'giant');
  }
  function _everBeaten(levelId) {
    return _tierBeatenLocal(levelId, 'serf') || _tierBeatenLocal(levelId, 'giant');
  }

  /* ── Rewards (mirrors the boss files' shared gold-coin animation) ────── */
  function _grantGold(amount, done) {
    if (!amount) { if (done) done(); return; }
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    var overlay = document.createElement('div');
    overlay.id = 'level-gold-reward';
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
      '-webkit-text-stroke:2px #1a0a04;text-shadow:-2px -2px 0 #1a0a04, 2px -2px 0 #1a0a04, -2px 2px 0 #1a0a04, 2px 2px 0 #1a0a04, 0 4px 6px rgba(0,0,0,0.55);';
    box.appendChild(coin); box.appendChild(label);
    overlay.appendChild(dim); overlay.appendChild(box);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void box.offsetHeight;
    box.style.opacity = '1'; box.style.transform = 'translateY(0)';
    setTimeout(function () {
      if (window.SOG && SOG.sfx) { SOG.sfx.play('sfx/demedici-money.mp3'); }
    }, 300);
    setTimeout(function () {
      box.style.transition = 'opacity 0.4s ease';
      box.style.opacity = '0'; dim.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (done) done();
      }, 420);
    }, 1900);
  }

  /* Grant a card via the shared card-acquisition reveal — mirrors every boss's
     _grant<Boss>Card. SOG.Cards.unlock returns truthy only on a NEW unlock, so
     a replay (already owned) skips the reveal animation entirely. */
  function _grantCard(cardId, done) {
    if (!cardId) { if (done) done(); return; }
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newly = !!SOG.Cards.unlock([cardId]);
    }
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === cardId; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* ── Result scoreboard (mirrors the boss files' shared markup/classes) ── */
  var RESULT_ID = 'adv-level-result';

  function _removeResultPopup() {
    var el = document.getElementById(RESULT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function _buildLocRow(locName, pIP, aIP, oppName) {
    var winner = pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie';
    var row = document.createElement('div'); row.className = 'result-loc-row';
    var nm  = document.createElement('div'); nm.className  = 'result-loc-name'; nm.textContent = locName;
    var sc  = document.createElement('div'); sc.className  = 'result-loc-scores';
    var yu  = document.createElement('span');
    yu.className   = 'result-loc-you' + (winner === 'player' ? ' result-loc-winner' : '');
    yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className   = 'result-loc-opp' + (winner === 'ai' ? ' result-loc-winner' : '');
    op.textContent = oppName + ': ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'OPPONENT' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }
  function _showResultScoreboard(levelId, level, won, isTie, locResults, onContinue) {
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
    (locResults || []).forEach(function (r) { locs.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP, 'Opponent')); });
    var actions = document.createElement('div');
    actions.className = 'result-actions';
    var btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'CONTINUE';
    btn.addEventListener('click', onContinue);
    actions.appendChild(btn);
    wrap.appendChild(headline); wrap.appendChild(locs); wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  function _teardown(levelId, level) {
    _removePresentationClasses(level.presentation);
    _unwireOpponentPortraitClick(levelId);
    _restoreOpponentBubblePortrait(levelId);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    if (window.SOG && SOG.BattleRulesPopup && typeof SOG.BattleRulesPopup.hide === 'function') SOG.BattleRulesPopup.hide();
    var st = _stateFor(levelId);
    /* A pending turn-1 interjection must not survive the battle it belongs to —
       conceding or Play Again inside its 2s window would otherwise fire it over
       the next screen. Its seen-flag is already set by then, so it simply never
       plays for that run; that is the correct outcome, not a lost line. */
    if (st.turn1Timer) { clearTimeout(st.turn1Timer); st.turn1Timer = null; }
    if (st.runner) st.runner.hideBubbles();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }
  function _exitToOverworld(levelId, level) {
    _removeResultPopup();
    _teardown(levelId, level);
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') window.Overworld.resumeAfterBattle();
    }, 100);
  }

  /* ── Build the engine config from level data (mirrors buildSargonConfig).
     Tier derives from SAVE STATE, freshly on every call (PLAY AGAIN rebuilds
     this): Serf until the Serf flag is beaten, Giant for the rematch — same
     rule every two-tier boss uses. tiers !== 2 (a future single-level node)
     stays Serf forever, matching Gilgamesh's untiered battle. ────────────── */
  function _buildConfig(levelId, level) {
    var _giant = level.tiers === 2 && _tierBeatenLocal(levelId, 'serf');
    var _ai = (window.SOG && SOG.ai) || null;
    var _selectPlays = _giant
      ? (_ai && _ai.giantSelectPlaysFor ? _ai.giantSelectPlaysFor(levelId) : null)
      : (_ai && _ai.serfSelectPlays || null);
    return {
      structure: level.structure,
      resource:  level.resource,
      draw:      level.draw,
      decks:     level.decks,
      locationAbilities: { select: { mode: 'explicit', locations: level.locations } },
      scoring:   level.scoring,
      // Generic AI: the engine's own boss-agnostic Serf/Giant heuristics
      // (js/game/ai.js), NOT a per-boss selectPlays — a data-defined level has
      // no bespoke AI code. giantSelectPlaysFor(levelId) resolves to the
      // shared Giant brain with no signature (levelId isn't a known boss key).
      ai: {
        profile:  'heuristic',
        tier:     _giant ? 'giant' : 'serf',
        movement: 'adventure',
        settings: { selectPlays: _selectPlays || function () { return []; } }
      },
      presentation: level.presentation,
      rewards:      {},
      scriptHook:   levelId
    };
  }

  /* ── Build + register the generic BattleHooks script for one level ──── */
  function _buildScript(levelId, level) {
    var KEY_OPENING_SEEN = 'sog_level_' + levelId + '_opening_seen';
    var dlg = level.dialogue || {};

    var st = _stateFor(levelId);
    st.runner = SOG.DialogueRunner.create({
      bleepProfiles:     (level.bleep && level.bleep.profiles) || {},
      defaultProfileKey: level.bleep && level.bleep.defaultKey,
      typeSpeedMs:       32
    });
    var runLines = function (lines, onAllDone) { st.runner.runLines(lines, onAllDone); };

    function _runOpeningDialogue(onComplete) {
      if (_has(KEY_OPENING_SEEN) || !dlg.opening || !dlg.opening.length) { if (onComplete) onComplete(); return; }
      runLines(dlg.opening, function () {
        _openRulesPopup(level, function () {
          _set(KEY_OPENING_SEEN);
          if (onComplete) onComplete();
        });
      });
    }
    function _runLinesIfAny(lines, onDone) {
      if (lines && lines.length) runLines(lines, onDone); else onDone();
    }

    /* ── Turn-1 interjection (dialogue.turn1) ─────────────────────────────
       A mid-battle beat that fires shortly AFTER turn 1 goes live, so the
       player sees their dealt hand first and the line can refer to it (Ramses
       uses it to explain the rising capital curve).

       Why not onTurnStart: that hook fires for turns 2+ only (js/game.js —
       "start of a selection phase (turns 2+)"), so turn 1 can never reach it.
       Nebuchadnezzar's flood interjection rides onTurnStart precisely because
       it lands on turns 3-5. Rather than change when the engine fires that hook
       — which would touch every shipped battle — this schedules off the tail of
       onBattleStart, where the board is already built and the hand already
       dealt. The input block / release is Neb's exact pattern.

       Fires ONCE, ever: the seen-flag is localStorage, so a rematch, a Play
       Again, or a return visit weeks later all skip it. It is also skipped
       outright once any tier is beaten, matching how every boss suppresses its
       teaching beats for a player who has already won. */
    var KEY_TURN1_SEEN = 'sog_level_' + levelId + '_turn1_seen';
    var TURN1_DELAY_MS = 2000;

    function _scheduleTurn1Interjection() {
      if (!dlg.turn1 || !dlg.turn1.length) return;
      if (_has(KEY_TURN1_SEEN) || _everBeaten(levelId)) return;
      var st2 = _stateFor(levelId);
      if (st2.turn1Timer) clearTimeout(st2.turn1Timer);
      st2.turn1Timer = setTimeout(function () {
        st2.turn1Timer = null;
        _set(KEY_TURN1_SEEN);
        _dialogueActive = true;      // isInputBlocked() consults this
        _disableButtons();
        runLines(dlg.turn1, function () {
          _dialogueActive = false;
          _enableButtons();
        });
      }, TURN1_DELAY_MS);
    }

    var _dialogueActive = false;

    /* Win — routes through SOG.rewards.consume(levelId), the SAME generic
       gate every boss uses: gold on the first win of a tier, the card only on
       the first GIANT win, zero on any replay. game.js's endGame() has
       already stamped sog_node_<levelId>_<tier>_beaten by the time this fires
       (onWin runs after the stamp) — this function only decides the payout
       and which dialogue plays, never the flag itself. */
    function _onWin(locResults) {
      _removeResultPopup();
      var r = (window.SOG && SOG.rewards)
        ? SOG.rewards.consume(levelId)
        : { firstTierWin: false, tier: null, gold: 0, grantCard: false };
      var toScoreboard = function () {
        _showResultScoreboard(levelId, level, true, false, locResults, function () { _exitToOverworld(levelId, level); });
      };
      if (r.grantCard) {
        _runLinesIfAny(dlg.giantWinA, function () {
          _grantCard((level.reward && level.reward.cardIdOnGiantWin), function () {
            _grantGold(r.gold, function () { _runLinesIfAny(dlg.giantWinB, toScoreboard); });
          });
        });
      } else if (r.firstTierWin && r.tier === 'giant') {
        _runLinesIfAny(dlg.giantWinA, function () { _grantGold(r.gold, function () { _runLinesIfAny(dlg.giantWinB, toScoreboard); }); });
      } else if (r.firstTierWin) {
        _runLinesIfAny(dlg.serfWinA, function () { _grantGold(r.gold, function () { _runLinesIfAny(dlg.serfWinB, toScoreboard); }); });
      } else {
        toScoreboard();   // replay of an already-beaten tier — zero reward, no dialogue (anti-farming)
      }
    }

    /* Loss/tie — mirrors every boss's _onDefeatOrTie: a Giant-rematch loss/
       draw gets its own dialogue; a pre-first-win Serf loss dismisses the
       challenger before the scoreboard; once ANY tier is beaten, later
       losses/ties go straight to the scoreboard with no dialogue. */
    function _onDefeatOrTie(isTie, locResults) {
      _removeResultPopup();
      var toScoreboard = function () {
        _showResultScoreboard(levelId, level, false, isTie, locResults, function () { _exitToOverworld(levelId, level); });
      };
      if (level.tiers === 2 && _isGiantRematch(levelId)) {
        _runLinesIfAny(isTie ? dlg.giantDraw : dlg.giantLoss, toScoreboard);
        return;
      }
      if (!_everBeaten(levelId)) {
        _runLinesIfAny(isTie ? dlg.tie : dlg.loss, toScoreboard);
        return;
      }
      toScoreboard();
    }

    return {
      onIntro: function (ctx, done) {
        _applyPresentationClasses(ctx.config && ctx.config.presentation);
        if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
        done();
      },
      onBattleStart: function (ctx, done) {
        if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
          SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
        }
        _swapOpponentBubblePortrait(levelId, level.presentation && level.presentation.opponentBubblePortrait);
        _disableButtons();
        fadeOutCover(function () {
          var finish = function () {
            _dialogueActive = false;
            _enableButtons();
            _wireOpponentPortraitClick(levelId, level);
            done();                          // turn 1 goes live here
            _scheduleTurn1Interjection();    // ...then the beat lands on top of it
          };
          _dialogueActive = true;
          // GIANT rematch → in-battle dominance intro instead of the Serf
          // opening tutorial (the player already learned the rules).
          if (level.tiers === 2 && _isGiantRematch(levelId)) {
            _runLinesIfAny(dlg.giantIntro, finish);
          } else {
            _runOpeningDialogue(finish);
          }
        });
      },
      isInputBlocked: function () { return !!_dialogueActive; },
      onWin:  function (ctx, result) { _onWin(result.locResults); },
      onLoss: function (ctx, result) { _onDefeatOrTie(false, result.locResults); },
      onTie:  function (ctx, result) { _onDefeatOrTie(true,  result.locResults); }
    };
  }

  function _ensureRegistered(levelId, level) {
    if (_registered[levelId]) return;
    if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
      SOG.BattleHooks.register(levelId, _buildScript(levelId, level));
    }
    _registered[levelId] = true;
  }

  function launch(levelId) {
    var level = _levelOf(levelId);
    if (!level) { log('no SOG_LEVEL_DATA entry for "' + levelId + '"'); return false; }
    if (level.kind !== 'battle') { log('level "' + levelId + '" is kind "' + level.kind + '" — only "battle" is wired so far'); return false; }
    _ensureRegistered(levelId, level);
    log('launch("' + levelId + '") -> initGame(_buildConfig)');
    if (typeof window.initGame === 'function') window.initGame(_buildConfig(levelId, level));
    return true;
  }

  return { launch: launch };
})();

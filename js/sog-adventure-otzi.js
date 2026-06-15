/**
 * sog-adventure-otzi.js
 * Shoulders of Giants — Adventure Mode: Otzi Battle (Phase 2)
 *
 * Replaces the Phase 1 placeholder stub. SOG.OtziBattle.start() is
 * called by overworld.js after the radial wipe from the Egypt signpost.
 *
 * Phase 2 scope: pre-battle dialogue → 1→3 location reveal → card deal.
 * Ends with the board fully assembled and turn 1 ready.
 * Turn play mechanics (Phase 3+) are NOT implemented here.
 *
 * Deck composition:
 *   Player (10): Tool(26) Hunter(27) Gatherer(28) Fire(29) Cave Art(30)
 *                Megalith(31) Dom Animal(32) Tribe(36) Lucy(33) Neanderthal(34)
 *   Otzi   (10): Tool(26) Hunter(27) Gatherer(28) Fire(29) Cave Art(30)
 *                Megalith(31) Dom Animal(32) Tribe(36) Neanderthal(34) Otzi(35)
 *   Both decks shuffled; each side draws 4 into hand, 6 remain in deck.
 *
 * Locations (left→right): Desert(8) · Savannah(7, center) · Gr. Rift Valley(2)
 *   Only Savannah is visible at battle entry; Desert and GRV slide in
 *   from the edges after the screen shake.
 *
 * State:
 *   localStorage: sog_battle_otzi_complete — NOT set in Phase 2
 */

var SOG = window.SOG || {};

SOG.OtziBattle = (function () {
  'use strict';

  /* ── localStorage key ───────────────────────────────────────── */
  var KEY_BATTLE_OTZI_COMPLETE = 'sog_battle_otzi_complete';

  /* ── Deck IDs ────────────────────────────────────────────────── */
  var PLAYER_DECK_IDS = [26, 27, 28, 29, 30, 31, 32, 36, 33, 34];
  var OTZI_DECK_IDS   = [26, 27, 28, 29, 30, 31, 32, 36, 34, 35];

  /* ── Dialogue scripts ────────────────────────────────────────── */
  var PRE_SHAKE_LINES = [
    { who: 'explorer', text: 'I know this game.'         },
    { who: 'explorer', text: 'Play a card each turn.'    },
    { who: 'explorer', text: 'Score the most points.'    },
    { who: 'explorer', text: 'Easy'                      },
    { who: 'otzi',     text: 'The world is a big place.' }
  ];

  var POST_SHAKE_LINES = [
    { who: 'explorer', text: 'Oh…'                                                 },
    { who: 'otzi',     text: 'You can now play 2 cards each turn.'                      },
    { who: 'explorer', text: 'How do I win?'                                             },
    { who: 'otzi',     text: "You won't"                                            },
    { who: 'otzi',     text: 'But try to gain the most IP at 2 of the 3 locations.'    }
  ];

  /* ── Post-battle dialogue scripts ───────────────────────────────── */
  var WIN_DIALOGUE = [
    { who: 'otzi',     text: 'How did you beat me?'                                   },
    { who: 'explorer', text: 'Hard work and perseverance.'                            },
    { who: 'otzi',     text: 'Whatever that means.'                                   },
    { who: 'explorer', text: 'It means a lot.'                                        },
    { who: 'otzi',     text: 'Right. Take this token of me — frozen in time.'   }
  ];
  var LOSS_DIALOGUE = [
    { who: 'otzi',     text: "As I said. You’re not ready."                      },
    { who: 'explorer', text: 'Let me try again.'                                       },
    { who: 'otzi',     text: "The world doesn’t give second chances. But I will." },
    { who: 'explorer', text: '…thanks?'                                           },
    { who: 'otzi',     text: "Don’t waste it."                                    }
  ];
  var TIE_DIALOGUE = [
    { who: 'otzi',     text: 'A stalemate. Curious.'         },
    { who: 'explorer', text: 'Does that mean I can pass?'   },
    { who: 'otzi',     text: 'No. It means we go again.'    }
  ];

  var KEY_CARD_OTZI_UNLOCKED = 'sog_card_otzi_unlocked';

  /* ── Timing ──────────────────────────────────────────────────── */
  var TYPE_SPEED_MS = 32;
  var TOTAL_TURNS   = 4;

  /* ══════════════════════════════════════════════════════════════
     BATTLE CONFIG (Ötzi migration)
     ──────────────────────────────────────────────────────────────
     The rules half, expressed as a config object. The battle runs through
     game.js's initGame(OTZI_CONFIG) + the registered 'otzi' script (below),
     which supplies all narrative via the lifecycle hooks. Reuses every engine
     dimension built for the Prehistory arc; the only new engine piece is the
     'random-n' AI profile (committed separately).

     Locations: Desert (8) · Savannah (7) · Great Rift Valley (2). GRV carries
     FIRST_CARD_HERE in the global LOCATIONS; we strip it here (override-as-
     config: abilityKey null) so any location is valid on turn 1 — matching the
     bespoke grvCopy. Resolved from LOCATIONS with the same fallbacks the
     bespoke setupBattleBoard used. */
  function _otziLocations() {
    var locs     = typeof LOCATIONS !== 'undefined' ? LOCATIONS : [];
    var savannah = locs.find(function (l) { return l.id === 7; }) ||
                   { id: 7, name: 'The Savannah',          region: 'Heart of Africa',    abilityText: '', abilityKey: null, image: 'images/locations/savannah.jpg',         thumbnailCrop: null };
    var desert   = locs.find(function (l) { return l.id === 8; }) ||
                   { id: 8, name: 'The Desert',            region: 'Ancient Sands',      abilityText: '', abilityKey: null, image: 'images/locations/desert.jpg',           thumbnailCrop: null };
    var grv      = locs.find(function (l) { return l.id === 2; }) ||
                   { id: 2, name: 'The Great Rift Valley', region: 'Cradle of Humanity', abilityText: '', abilityKey: null, image: 'images/locations/greatriftvalley.jpg', thumbnailCrop: null };
    var grvCopy  = Object.assign({}, grv, { abilityKey: null, abilityText: '' });  // strip FIRST_CARD_HERE
    return [desert, savannah, grvCopy];  // Desert (left) · Savannah (center) · GRV (right)
  }

  var OTZI_CONFIG = {
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4,
                 handStart: 4, maxHandSize: 4, cardsPerTurn: 2 },
    resource:  { model: 'none', capital: 0 },     // 2/turn enforced via cardsPerTurn, not capital
    draw:      { model: 'replenish' },            // fill-to-4 == replenish-by-played (hand starts at cap)
    decks: {
      player: { source: 'explicit', ids: PLAYER_DECK_IDS.slice(), shuffle: true },
      ai:     { source: 'explicit', ids: OTZI_DECK_IDS.slice(),   shuffle: true }
    },
    locationAbilities: { select: { mode: 'explicit', locations: _otziLocations() } },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },  // tie-as-loss
    ai: { profile: 'random-n', settings: { cardsPerTurn: 2 } },
    presentation: {
      bodyClass:        'otzi-battle',
      preCoachingClass: 'otzi-pre-deal',
      allyAvatar:       'images/femaleexplorer%20portrait.jpeg',
      opponentAvatar:   'images/Otzi.jpg',
      popAlly:          true
    },
    rewards: { onWin: { cards: [35], completionFlag: KEY_BATTLE_OTZI_COMPLETE,
                        acquisitionFlag: KEY_CARD_OTZI_UNLOCKED } },
    scriptHook: 'otzi'
  };

  /* ── Logging ─────────────────────────────────────────────────── */
  function log(msg) { console.log('[Adventure/Otzi] ' + msg); }

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

  var BLEEP_PROFILES = {
    otzi:     { freq: 210, wobble: 20, wave: 'triangle', peak: 0.07, decay: 0.07, dur: 0.08, every: 2 },
    explorer: { freq: 520, wobble: 30, wave: 'square',   peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };

  function playBleep(who) {
    var ctx = getBleepCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p   = BLEEP_PROFILES[who] || BLEEP_PROFILES.otzi;
    var now = ctx.currentTime;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var freq = p.freq + (Math.random() - 0.5) * p.wobble;
    osc.type = p.wave;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0,        now);
    gain.gain.linearRampToValueAtTime(p.peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
  }

  /* ── Fisher-Yates shuffle (in-place) ────────────────────────── */
  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ── Bubble helpers ──────────────────────────────────────────── */
  function getBubbleEl(who) {
    return document.getElementById('adv-bubble-' + who);
  }

  function hideBubbles() {
    ['otzi', 'explorer'].forEach(function (who) {
      var el = getBubbleEl(who);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }

  /* ── Dialogue runner (click-to-advance typewriter) ───────────── */
  var _dlg = {
    lines:        null,
    lineIdx:      0,
    isTyping:     false,
    timer:        null,
    fullText:     '',
    textEl:       null,
    activeEl:     null,
    clickHandler: null,
    onAllDone:    null
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

    // Hide the other speaker's bubble
    var other = (line.who === 'otzi') ? 'explorer' : 'otzi';
    var otherEl = getBubbleEl(other);
    if (otherEl) otherEl.classList.remove('is-visible', 'is-ready');

    var el     = getBubbleEl(line.who);
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
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.otzi;
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
    var onDone    = _dlg.onAllDone;
    _dlg.onAllDone = null;
    _dlg.lines     = null;
    if (onDone) onDone();
  }

  /* ── Turn counter ────────────────────────────────────────────── */
  function setTurnCounter(current, total) {
    var capEl  = document.getElementById('battle-capital-info');
    if (capEl)  capEl.textContent  = 'Turn ' + current + ' / ' + total;
    var turnEl = document.getElementById('battle-turn-info');
    if (turnEl) turnEl.textContent = '';
  }

  /* ── Fade out the radial wipe cover ──────────────────────────── */
  function fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl) { if (onDone) onDone(); return; }
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
      if (onDone) onDone();
      return;
    }
    gsap.to(wipeEl, {
      opacity:  0,
      duration: 0.45,
      ease:     'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active');
        wipeEl.style.opacity  = '';
        wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  /* ── Camera shake (same rumble as Prehistory) ────────────────── */
  function shakeCamera(onDone) {
    var el = document.getElementById('screen-battle');
    if (!el || typeof gsap === 'undefined') {
      setTimeout(function () { if (onDone) onDone(); }, 300);
      return;
    }
    var tl = gsap.timeline({
      onComplete: function () {
        gsap.set(el, { x: 0, y: 0 });
        if (onDone) onDone();
      }
    });
    tl.to(el, { x: -10, y:  4, duration: 0.05, ease: 'none' })
      .to(el, { x:  10, y: -4, duration: 0.06, ease: 'none' })
      .to(el, { x:  -7, y:  3, duration: 0.05, ease: 'none' })
      .to(el, { x:   5, y: -2, duration: 0.05, ease: 'none' })
      .to(el, { x:   0, y:  0, duration: 0.05, ease: 'none' });
  }

  /* ── Slide Desert (left) and GRV (right) into view ───────────── */
  function revealSideLocations(onDone) {
    var boardEl = document.getElementById('battle-board');
    if (!boardEl || typeof gsap === 'undefined') {
      if (onDone) onDone();
      return;
    }
    var desertCol = boardEl.querySelector('[data-loc-id="8"]');
    var grvCol    = boardEl.querySelector('[data-loc-id="2"]');

    var tl = gsap.timeline({ onComplete: onDone || function () {} });
    if (desertCol) tl.to(desertCol, { x: 0, opacity: 1, duration: 0.65, ease: 'power2.out' }, 0);
    if (grvCol)    tl.to(grvCol,    { x: 0, opacity: 1, duration: 0.65, ease: 'power2.out' }, 0.08);
    if (!desertCol && !grvCol && onDone) setTimeout(onDone, 0);
  }

  /* ── Card deal animation ─────────────────────────────────────── */
  function dealCards(onDone) {
    // Lift the pre-deal visibility:hidden — elements now render
    document.body.classList.remove('otzi-pre-deal');

    if (typeof gsap === 'undefined') {
      if (onDone) onDone();
      return;
    }

    var handCards = document.querySelectorAll('#battle-player-hand .battle-hand-card');
    var deckPile  = document.querySelector('#battle-player-hand .battle-deck-pile');
    var oppHand   = document.getElementById('battle-opp-hand');
    var hudBR     = document.querySelector('.battle-hud-bottomright');

    // Player hand cards fly up from below, staggered
    for (var i = 0; i < handCards.length; i++) {
      gsap.fromTo(handCards[i],
        { y: 220, opacity: 0, scale: 0.55, rotate: -12 },
        { y: 0,   opacity: 1, scale: 1,    rotate: 0,
          duration: 0.55, ease: 'power2.out', delay: i * 0.10 });
    }

    // Deck pile slides in from the right
    if (deckPile) {
      gsap.fromTo(deckPile,
        { x: 120, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.45, ease: 'power2.out', delay: 0.45 });
    }

    // Opp hand drops down from above
    if (oppHand) {
      gsap.fromTo(oppHand,
        { y: -130, opacity: 0 },
        { y: 0,    opacity: 1, duration: 0.50, ease: 'power2.out', delay: 0.10 });
    }

    // Reset + End Turn buttons slide in from the right
    if (hudBR) {
      gsap.fromTo(hudBR,
        { x: 160, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.50, ease: 'power2.out', delay: 0.20 });
    }

    // All animations complete by ~0.85s; give them 1s to settle
    setTimeout(function () { if (onDone) onDone(); }, 1000);
  }

  // _hasPlayedThisTurn is written by notifyPlayerPlayed (now orphaned — see
  // below); the bespoke End-Turn/Reset handlers that read it are gone.
  var _hasPlayedThisTurn = false;

  /* ORPHANED (flagged for cleanup): was called by input.js's commitPlay via the
     old adventure-battle notify bridge, which is gone. Ötzi now runs config-
     driven via the 'otzi' script (onPlayerPlayed hook → _otziEnableButtons), so
     nothing calls this. Left as a harmless no-op; safe to delete. */
  function notifyPlayerPlayed(cardId, locId) {
    log('Player played card ' + cardId + ' at loc ' + locId);
    _hasPlayedThisTurn = true;
    var endTurnBtn = document.getElementById('battle-end-turn');
    var resetBtn   = document.getElementById('battle-reset-turn');
    if (endTurnBtn) endTurnBtn.disabled = false;
    if (resetBtn)   resetBtn.disabled   = false;
  }

  /* ── Post-battle dialogue → card reveal → scoreboard ──────────── */

  /* Route outcome to the correct dialogue then scoreboard. */
  function _routePostBattle(won, isTie, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var lines = won ? WIN_DIALOGUE : (isTie ? TIE_DIALOGUE : LOSS_DIALOGUE);
    runLines(lines, function () {
      hideBubbles();
      if (won) {
        var cardAlreadyOwned = false;
        try { cardAlreadyOwned = localStorage.getItem(KEY_CARD_OTZI_UNLOCKED) === 'true'; } catch (e) {}
        if (cardAlreadyOwned) {
          _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
        } else {
          var otziCard = (typeof CARDS !== 'undefined') &&
                        CARDS.find(function (c) { return c.id === 35; });
          var preh = window.SOG && window.SOG.Adventure && window.SOG.Adventure.Prehistory;
          if (otziCard && preh && typeof preh.showCardAcquisition === 'function') {
            preh.showCardAcquisition(otziCard, null, function () {
              try { localStorage.setItem(KEY_CARD_OTZI_UNLOCKED, 'true'); } catch (e) {}
              // Single source of truth: also record Otzi (35) in the player
              // collection (the standalone flag stays — it gates re-showing
              // this acquisition reveal on a repeat win).
              if (window.SOG && SOG.collection && typeof SOG.collection.unlockCard === 'function') {
                SOG.collection.unlockCard(35);
              }
              _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
            });
          } else {
            _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
          }
        }
      } else {
        _showOtziScoreboard(isTie ? 'tie' : 'loss', locResults, usedTiebreaker, playerTotal, otziTotal);
      }
    });
  }

  /* Build a single location result row (Desert / Savannah / Great Rift Valley). */
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
    op.className   = 'result-loc-opp'  + (winner === 'ai'     ? ' result-loc-winner' : '');
    op.textContent = 'Otzi: ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className   = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? 'OTZI' : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }

  /* Helpers shared by all three scoreboard paths. */
  function _replayOtziBattle(overlayEl) {
    overlayEl.style.display = 'none';
    teardown();
    // Re-enter through the engine (start → initGame(OTZI_CONFIG)). Ötzi has no
    // skip-intro, so the full cinematic plays again.
    if (typeof SOG !== 'undefined' && SOG.OtziBattle) SOG.OtziBattle.start();
  }

  function _showBoardFromResult(overlayEl) {
    overlayEl.style.display = 'none';
    var backBtn = document.getElementById('adv-btn-back-results');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.onclick = function () {
        backBtn.style.display = 'none';
        overlayEl.style.display = 'flex';
      };
    }
  }

  function _exitOtziBattleToOverworld(wonBattle) {
    teardown();
    if (typeof showScreen === 'function') showScreen('screen-overworld');
    if (wonBattle) {
      // After beating Otzi the player STAYS on East Africa. Re-render the map in
      // place (victory checkmark + the now-unlocked To Egypt box) and play the
      // one-time return dialogue; the player then travels to Egypt manually via
      // the To Egypt box (goodbye + walk-off). The old D1 auto-travel cinematic
      // (startMesopotamiaArrival) is no longer triggered here.
      // NOTE (deferred follow-up): the Egypt/Mesopotamia intro scenes and the
      // Mesopotamia unlock (sog_mesopotamia_arrival_complete) used to live in
      // that cinematic and now need re-wiring into the manual navigation flow.
      // 500 ms settle — let the overworld screen finish rendering first.
      setTimeout(function () {
        if (window.Overworld && typeof window.Overworld.returnToEastAfricaAfterOtzi === 'function') {
          window.Overworld.returnToEastAfricaAfterOtzi();
        }
      }, 500);
    }
  }

  /* Display the HTML scoreboard for the given outcome. */
  function _showOtziScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var elId, subId, locsId, boardBtnId, againBtnId, mapBtnId;
    if (outcome === 'win') {
      elId = 'adv-otzi-result-victory'; subId = 'adv-otzi-result-victory-subline';
      locsId = 'adv-otzi-result-victory-locs';
      boardBtnId = 'adv-otzi-result-victory-board'; againBtnId = 'adv-otzi-result-victory-again';
      mapBtnId   = 'adv-otzi-result-victory-backtomap';
    } else if (outcome === 'tie') {
      elId = 'adv-otzi-result-tie'; subId = 'adv-otzi-result-tie-subline';
      locsId = 'adv-otzi-result-tie-locs';
      boardBtnId = 'adv-otzi-result-tie-board'; againBtnId = 'adv-otzi-result-tie-again';
      mapBtnId   = 'adv-otzi-result-tie-backtomap';
    } else {
      elId = 'adv-otzi-result-defeat'; subId = 'adv-otzi-result-defeat-subline';
      locsId = 'adv-otzi-result-defeat-locs';
      boardBtnId = 'adv-otzi-result-defeat-board'; againBtnId = 'adv-otzi-result-defeat-again';
      mapBtnId   = 'adv-otzi-result-defeat-backtomap';
    }

    var el      = document.getElementById(elId);
    var subEl   = document.getElementById(subId);
    var locsEl  = document.getElementById(locsId);
    var boardBtn= document.getElementById(boardBtnId);
    var againBtn= document.getElementById(againBtnId);
    var mapBtn  = document.getElementById(mapBtnId);

    if (!el) {
      log('scoreboard element #' + elId + ' not found — falling back to plain overlay');
      _fallbackScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal);
      return;
    }

    // Populate subline
    if (subEl) {
      if (usedTiebreaker) {
        subEl.textContent = 'Tiebreaker — Total IP: You ' + playerTotal + '  vs  Otzi ' + otziTotal;
      } else if (outcome === 'win') {
        subEl.textContent = 'You conquered Otzi at 2 of 3 locations';
      } else if (outcome === 'tie') {
        subEl.textContent = 'A stalemate — every location tied';
      } else {
        subEl.textContent = 'Otzi won 2 of 3 locations';
      }
    }

    // Populate 3-location rows
    if (locsEl) {
      locsEl.innerHTML = '';
      locResults.forEach(function (r) {
        locsEl.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP));
      });
    }

    el.style.display = 'flex';

    if (boardBtn) boardBtn.onclick = function () { _showBoardFromResult(el); };
    if (againBtn) againBtn.onclick = function () { _replayOtziBattle(el); };
    if (mapBtn)   mapBtn.onclick   = function () {
      el.style.display = 'none';
      _exitOtziBattleToOverworld(outcome === 'win');
    };
  }

  /* Plain-text fallback if HTML elements are missing (shouldn't happen). */
  function _fallbackScoreboard(outcome, locResults, usedTiebreaker, playerTotal, otziTotal) {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.82)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'z-index:9000;font-family:\'CT Galbite\',monospace;color:#fff;gap:16px'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'font-size:32px;color:' + (outcome === 'win' ? '#f8d000' : '#f04030');
    title.textContent = outcome === 'win' ? 'VICTORY' : outcome === 'tie' ? 'A TIE' : 'DEFEATED';
    overlay.appendChild(title);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px';

    var againBtn = document.createElement('button');
    againBtn.textContent = 'PLAY AGAIN';
    againBtn.style.cssText = 'padding:10px 20px;font-family:\'CT Galbite\',monospace;font-size:14px;background:#12004a;color:#fff;border:2px solid #8898ff;cursor:pointer';
    againBtn.onclick = function () { overlay.parentNode.removeChild(overlay); teardown(); SOG.OtziBattle.start(); };

    var mapBtn = document.createElement('button');
    mapBtn.textContent = 'BACK TO MAP';
    mapBtn.style.cssText = againBtn.style.cssText;
    mapBtn.onclick = function () { overlay.parentNode.removeChild(overlay); _exitOtziBattleToOverworld(outcome === 'win'); };

    btnRow.appendChild(againBtn);
    btnRow.appendChild(mapBtn);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);
  }

  /* ── Teardown ─────────────────────────────────────────────────── */
  function teardown() {
    document.body.classList.remove('otzi-battle');
    document.body.classList.remove('otzi-pre-deal');
    if (SOG.HUD && SOG.HUD.restoreBattleAvatars) SOG.HUD.restoreBattleAvatars();
    hideBubbles();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) {
      wipeEl.classList.remove('active');
      wipeEl.style.opacity  = '';
      wipeEl.style.clipPath = '';
    }
  }

  /* ════════════════════════════════════════════════════════════
     MAIN ENTRY POINT
     ════════════════════════════════════════════════════════════
     Called by overworld.js after the radial wipe covers the screen.
     Flow:
       1. Set body classes + build G state + board DOM
       2. Switch to screen-battle
       3. Fade out wipe → board visible (Savannah only)
       4. Pre-shake dialogue (5 lines, Explorer then Otzi)
       5. Screen shake → Desert slides left, GRV slides right
       6. Post-shake dialogue (5 lines)
       7. Card deal animation (both hands + decks fly in)
       8. Board fully assembled — Phase 3 will wire the turn loop
  ═══════════════════════════════════════════════════════════════ */
  function start() {
    log('start() → initGame(OTZI_CONFIG)');

    // Prime the Web Audio context (needs a user gesture — the click that
    // started this encounter counts, so resume here to ensure beeps work).
    var _ctx = getBleepCtx();
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch(e) {} }

    // The battle runs through game.js's engine, configured by OTZI_CONFIG
    // (scriptHook 'otzi'). The 'otzi' script supplies ALL narrative via the
    // lifecycle hooks: onIntro (body classes + screen switch — the overworld's
    // radial wipe is already up), onBattleStart (avatars + the full opening
    // cinematic: park sides → fade cover → pre-shake dialogue → shake → slide-in
    // → post-shake dialogue → deal), onTurnStart, onPlayerPlayed, onBeforeReveal,
    // and onWin/onLoss/onTie. (Ötzi's flee is now card 35's onCardLandedHere
    // ability, fired by the shared reveal pipeline.)
    if (typeof window.initGame === 'function') window.initGame(OTZI_CONFIG);
  }

  /* ── Public surface ──────────────────────────────────────────── */
  function isBattleComplete() {
    try { return localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true'; }
    catch (e) { return false; }
  }

  /* ════════════════════════════════════════════════════════════
     SCRIPT-HOOK MODULE (Ötzi migration)
     ────────────────────────────────────────────────────────────
     The narrative half via the engine's script-hook seam, registered as
     'otzi'. The battle runs through initGame(OTZI_CONFIG) + the engine turn
     loop; these hooks supply the cinematic, dialogue, flee, and outcome screens.
     Ötzi plays its full opening cinematic on EVERY entry (no skip-intro), so no
     decide-once flag is needed.
  ════════════════════════════════════════════════════════════ */

  function _otziDisableButtons() {
    var e = document.getElementById('battle-end-turn');
    var r = document.getElementById('battle-reset-turn');
    if (e) e.disabled = true;
    if (r) r.disabled = true;
  }
  function _otziEnableButtons() {
    var e = document.getElementById('battle-end-turn');
    var r = document.getElementById('battle-reset-turn');
    if (e) e.disabled = false;
    if (r) r.disabled = false;
  }
  // Per-turn presentation the engine doesn't do: visible "Turn X / 4", force
  // player-first reveal order, suppress the engine's reveal-first avatar glow,
  // disable the action buttons until the player commits a card.
  function _otziApplyTurnPresentation(turn) {
    setTurnCounter(turn, OTZI_CONFIG.structure.turns);
    SOG.state.G.playerFirst = true;
    if (SOG.abilities && typeof SOG.abilities.hideRevealFirstHighlight === 'function') {
      SOG.abilities.hideRevealFirstHighlight();
    }
    _otziDisableButtons();
  }
  // Pre-board body classes from config.
  function _otziApplyPresentationClasses(p) {
    if (!p) return;
    if (p.bodyClass)        document.body.classList.add(p.bodyClass);
    if (p.preCoachingClass) document.body.classList.add(p.preCoachingClass);
  }
  // Park the side locations off-screen (Desert left, GRV right) — the cinematic
  // slides them in. Runs AFTER the engine's initBattleUI builds the columns.
  function _otziParkSideLocations() {
    if (typeof gsap === 'undefined') return;
    var boardEl = document.getElementById('battle-board');
    if (!boardEl) return;
    var desertCol = boardEl.querySelector('[data-loc-id="8"]');
    var grvCol    = boardEl.querySelector('[data-loc-id="2"]');
    if (desertCol) gsap.set(desertCol, { x: -600, opacity: 0 });
    if (grvCol)    gsap.set(grvCol,    { x:  600, opacity: 0 });
  }
  // Outcome routing: SFX + (win: completion flag) → bespoke dialogue/card/
  // scoreboard helper (kept). The engine's tallyResult already produced `result`.
  function _otziRouteOutcome(won, isTie, result) {
    if (won) { try { localStorage.setItem(KEY_BATTLE_OTZI_COMPLETE, 'true'); } catch (e) {} }
    if (typeof SFX !== 'undefined') {
      if (won && SFX.gameWon)  SFX.gameWon();
      else if (SFX.gameLost)   SFX.gameLost();
    }
    setTimeout(function () {
      _routePostBattle(won, isTie, result.locResults, result.tiebreaker, result.playerTotal, result.aiTotal);
    }, 600);
  }

  var OTZI_SCRIPT = {
    // The overworld already raised the radial-wipe cover, so onIntro just applies
    // the pre-board classes and switches to the battle screen (under the cover).
    onIntro: function (ctx, done) {
      _otziApplyPresentationClasses(OTZI_CONFIG.presentation);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();   // → engine builds the board under the cover
    },

    // Board built (hidden by otzi-pre-deal). Dress it, then the full opening
    // cinematic: park side locations → fade cover (reveal Savannah) → pre-shake
    // dialogue → shake → slide-in → post-shake dialogue → deal. Async (dialogue
    // pauses on clicks); done() begins turn 1.
    onBattleStart: function (ctx, done) {
      if (SOG.HUD && SOG.HUD.applyBattleAvatars) SOG.HUD.applyBattleAvatars(OTZI_CONFIG.presentation);
      _otziApplyTurnPresentation(1);
      _otziParkSideLocations();
      fadeOutCover(function () {
        runLines(PRE_SHAKE_LINES, function () {
          shakeCamera(function () {
            revealSideLocations(function () {
              runLines(POST_SHAKE_LINES, function () {
                dealCards(function () { done(); });
              });
            });
          });
        });
      });
    },

    // Turns 2-4: re-apply per-turn presentation.
    onTurnStart: function (ctx, turn) {
      _otziApplyTurnPresentation(turn);
    },

    // Player ended the turn — keep buttons disabled through the reveal.
    onBeforeReveal: function (ctx, turn) {
      _otziDisableButtons();
    },

    // A card was committed — enable End Turn + Reset (Ötzi is not a coaching
    // battle; no prompt). Player may end after 1 or 2 cards.
    onPlayerPlayed: function (ctx, p) {
      _otziEnableButtons();
    },

    // (Ötzi's flee is now card 35's onCardLandedHere ability, fired by the shared
    //  reveal pipeline — no per-battle onAfterReveal handler.)

    onWin:  function (ctx, result, proceed) { _otziRouteOutcome(true,  false, result); },
    onLoss: function (ctx, result, proceed) { _otziRouteOutcome(false, false, result); },
    onTie:  function (ctx, result, proceed) { _otziRouteOutcome(false, true,  result); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('otzi', OTZI_SCRIPT);
  }

  return {
    start:                start,
    isBattleComplete:     isBattleComplete,
    teardown:             teardown,
    notifyPlayerPlayed:   notifyPlayerPlayed
  };

})();

window.SOG = SOG;

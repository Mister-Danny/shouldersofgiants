/**
 * sog-adventure-otzi.js
 * Shoulders of Giants — Adventure Mode: Otzi Battle
 *
 * SOG.OtziBattle.start() is called by overworld.js after the radial wipe from
 * the Egypt signpost. The battle runs on the shared engine (initGame(OTZI_CONFIG)
 * + the 'otzi' script hook below); this module owns the opening cinematic
 * (dialogue → 1→3 location reveal → deal), the strategy hints, and the outcome
 * screens.
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
 * State (all mirrored into the save snapshot, see getSnapshot):
 *   sog_battle_otzi_complete · sog_card_otzi_unlocked · sog_otzi_opening_seen ·
 *   sog_otzi_game_finished
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
    { who: 'explorer', text: 'Okay, I know this game!'   },
    { who: 'explorer', text: 'Play a card each turn.'    },
    { who: 'explorer', text: 'Score the most points.'    },
    { who: 'explorer', text: "I've got this."            },
    { who: 'otzi',     text: 'The world is a big place.' }
  ];

  var POST_SHAKE_LINES = [
    { who: 'explorer', text: 'Whoa. The world just got bigger.' },
    { who: 'otzi',     text: 'Bigger world, more cards.' },
    { who: 'explorer', text: 'Makes sense... so how do I win?' },
    { who: 'otzi',     text: "You won't." }
  ];
  // (Ötzi's rule lines — 2 cards a turn, win 2 of 3 — are system callouts now:
  //  js/otzi-lessons.js. Story from the characters, rules from the callouts.)

  /* ── Post-battle dialogue scripts ───────────────────────────────── */
  // Win dialogue plays in two halves around the Otzi-token card-acquisition
  // animation: WIN_DIALOGUE → grant reveal → WIN_TOKEN_LINE (see _routePostBattle).
  var WIN_DIALOGUE = [
    { who: 'otzi',     text: 'How did you beat me?'      },
    { who: 'explorer', text: 'I do my homework.'         },
    { who: 'otzi',     text: 'Hm. Whatever that means.'  },
    { who: 'explorer', text: 'It means a lot.'           },
    { who: 'otzi',     text: 'Right.' },
    { who: 'otzi',     text: 'I guess you can have this...' }
  ];
  var WIN_TOKEN_LINE = [
    { who: 'otzi',     text: 'A token of me frozen in time.' }
  ];
  var LOSS_DIALOGUE = [
    { who: 'otzi',     text: "As I said. You're not ready." },
    { who: 'explorer', text: 'Please let me try again.' },
    { who: 'explorer', text: 'I have to get home.' },
    { who: 'otzi',     text: "The world doesn't give second chances." },
    { who: 'otzi',     text: 'But I will.' },
    { who: 'explorer', text: 'Really? Thank you!' },
    { who: 'otzi',     text: "Don't waste it." }
  ];
  var TIE_DIALOGUE = [
    { who: 'otzi',     text: 'A stalemate. Curious.'         },
    { who: 'explorer', text: 'Does that mean I can pass?'   },
    { who: 'otzi',     text: 'No.' },
    { who: 'otzi',     text: 'It means we go again.'    }
  ];

  var KEY_CARD_OTZI_UNLOCKED = 'sog_card_otzi_unlocked';
  var KEY_OTZI_OPENING_SEEN  = 'sog_otzi_opening_seen';   // intro lines watched once → every later entry skips them

  /* ── Hints offer (Ötzi only) ──────────────────────────────────
     A player who has FINISHED an Ötzi game (any outcome) and not yet beaten him
     is asked before the deal whether they want hints. Yes replays the first
     attempt exactly (fixed hands, Ötzi's scripted plays, every first-attempt
     lesson — see _useFirstAttempt); No is a normal shuffled game. The first
     attempt itself is never asked: it always teaches. */
  var KEY_OTZI_GAME_FINISHED = 'sog_otzi_game_finished';  // an Ötzi game reached an outcome
  var HINTS_PROMPT = 'Would you like some helpful strategy hints?';

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

  /* ══════════════════════════════════════════════════════════════
     Strategic Ötzi selector (heuristic AI profile). Cost-free; plays up to
     cardsPerTurn (2) cards per turn. Smarter than the old random-n profile,
     which dumped cards in random order/locations (e.g. Cave Art BEFORE Fire,
     wasting both). It now plays with intent — but deliberately NOT flawlessly:

       • Fire/Cave Art COMBO sequencing. Fire(29) buffs cards played AFTER it
         here (+1); Cave Art(30) buffs cards played BEFORE it here (+1). So Fire
         is scored as a setup that leads (only worth playing if slots remain to
         exploit it), Cave Art captures +1 for every AI card ALREADY here (so it
         trails a stack), and ordinary cards prefer a location that already has
         Fire. Net effect: Fire first → strong cards → Cave Art last.
       • SPREAD to contest 2 of 3 locations (the win condition) rather than
         piling everything into one — each play is nudged toward the location
         where the AI is currently weaker.

     Tribe (36) is 1 base IP plus +1 per OTHER own card here (continuous), so it
     is scored as its base plus its count of company: cards already here now, plus
     one for room to add more. Ignores the fiddlier abilities (Domesticated Animal adjacency,
     Ötzi-migrate) — it values those at face IP. Good enough to put up a fight
     without playing a perfect game. */
  function otziSelectPlays(ctx) {
    var G = ctx.G;
    var CARDS_ = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    var perTurn = (G.config && G.config.ai && G.config.ai.settings && G.config.ai.settings.cardsPerTurn) || 2;

    var FIRE = 29, CAVE = 30, TRIBE = 36;
    var hand = G.aiHand.slice();

    // Per-location AI state = committed (revealed prior turns) + this turn's sims.
    var simCount = {}, simIP = {}, simFire = {}, simCave = {};
    function arrAt(locId) { return G.aiSlots[locId] || []; }
    function openSlots(locId) {
      var a = arrAt(locId), n = 0; for (var i = 0; i < a.length; i++) if (a[i] === null) n++;
      return n - (simCount[locId] || 0);
    }
    function aiCount(locId) {
      var a = arrAt(locId), n = 0; for (var i = 0; i < a.length; i++) if (a[i]) n++;
      return n + (simCount[locId] || 0);
    }
    function aiIP(locId) {
      var a = arrAt(locId), s = 0; for (var i = 0; i < a.length; i++) if (a[i]) s += (a[i].ip || 0);
      return s + (simIP[locId] || 0);
    }
    function hasCard(locId, id, simFlag) {
      var a = arrAt(locId); for (var i = 0; i < a.length; i++) if (a[i] && a[i].cardId === id) return true;
      return !!simFlag[locId];
    }

    function scorePlay(card, locId) {
      var fireHere = hasCard(locId, FIRE, simFire);
      var caveHere = hasCard(locId, CAVE, simCave);
      var cnt      = aiCount(locId);
      var open     = openSlots(locId);
      var eff;
      if (card.id === FIRE) {                 // setup — only valuable if cards can still follow it here
        eff = card.ip + (open >= 2 ? 1.5 : -1.0);
        if (fireHere) eff -= 3;               // never double Fire
      } else if (card.id === CAVE) {          // captures +1 for every AI card already here (played before it)
        eff = card.ip + cnt;
        if (caveHere) eff -= 3;               // never double Cave Art
      } else if (card.id === TRIBE) {         // +1 per other AI card here, live — company now, plus room for more
        eff = card.ip + cnt + (open >= 2 ? 1 : 0);
      } else {
        eff = card.ip;
        if (fireHere) eff += 1;               // benefits from Fire's "after" buff
        if (caveHere) eff -= 1;               // Cave Art combo here is closed — a later card earns nothing
      }
      // Megalith (31) is 0 base IP (End of turn: +1 cumulative) — a pure-IP scorer
      // never plays it. Prefer it EARLY, scaled by turns remaining (shared with the
      // engine heuristic). (Fire's early preference is the open>=2 term above.)
      if (card.id === 31 && window.SOG && SOG.ai && SOG.ai.cardTurnBias) {
        var _turns = (G.config && G.config.structure && G.config.structure.turns) || 4;
        eff += SOG.ai.cardTurnBias(31, Math.max(1, _turns - (G.turn || 1) + 1));
      }
      eff -= 0.5 * aiIP(locId);               // mild spread → contest 2-3 locations, don't stack one
      return eff;
    }

    var plays = [];
    for (var p = 0; p < perTurn && hand.length; p++) {
      var openLocs = G.locations.filter(function (l) { return openSlots(l.id) > 0; });
      if (!openLocs.length) break;

      var best = null, bestScore = -Infinity;
      for (var h = 0; h < hand.length; h++) {
        var card = cardById(hand[h]); if (!card) continue;
        for (var L = 0; L < openLocs.length; L++) {
          var sc = scorePlay(card, openLocs[L].id);
          if (sc > bestScore) { bestScore = sc; best = { cardId: card.id, locId: openLocs[L].id, ip: card.ip }; }
        }
      }
      if (!best) break;

      plays.push({ cardId: best.cardId, locId: best.locId });
      simCount[best.locId] = (simCount[best.locId] || 0) + 1;
      simIP[best.locId]    = (simIP[best.locId] || 0) + (best.ip || 0);
      if (best.cardId === FIRE) simFire[best.locId] = true;
      if (best.cardId === CAVE) simCave[best.locId] = true;
      var idx = hand.indexOf(best.cardId); if (idx !== -1) hand.splice(idx, 1);
    }
    return plays;
  }

  var OTZI_CONFIG = {
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4,
                 handStart: 4, maxHandSize: 4, cardsPerTurn: 2 },
    resource:  { model: 'none', capital: 0 },     // 2/turn enforced via cardsPerTurn, not capital
    // Flat +2 a turn, capped at maxHandSize 4: this battle is capital-less and
    // plays exactly 2 cards a turn, so the hand refills to 4 every turn however
    // those cards were spread. Replenish counted DISTINCT LOCATIONS, so two
    // cards into one location drew only one back and the hand bled down.
    draw:      { model: 'flat', perTurn: 2 },
    decks: {
      player: { source: 'explicit', ids: PLAYER_DECK_IDS.slice(), shuffle: true },
      ai:     { source: 'explicit', ids: OTZI_DECK_IDS.slice(),   shuffle: true }
    },
    locationAbilities: { select: { mode: 'explicit', locations: _otziLocations() } },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },  // tie-as-loss
    ai: { profile: 'heuristic', settings: { selectPlays: _otziPlays, cardsPerTurn: 2 } },
    presentation: {
      bodyClass:        'otzi-battle',
      preCoachingClass: 'otzi-pre-deal',
      allyAvatar:       'player',   // selected adventurer, resolved at render time
      opponentAvatar:   'images/Otzi.jpg',
      popAlly:          true
    },
    rewards: { onWin: { cards: [35], completionFlag: KEY_BATTLE_OTZI_COMPLETE,
                        acquisitionFlag: KEY_CARD_OTZI_UNLOCKED } },
    // Opt out of the engine's unified opening (dialogue → rules + PLAY → deal):
    // the hands are dealt during the build, before onBattleStart, exactly as
    // before — this module owns its own deal (dealCards) inside its opening.
    opening: { dealBeforeIntro: true },
    orderBadges: true,   // 1, 2, 3 on staged cards / moves, lit in reveal order (js/game/order-badges.js)
    scriptHook: 'otzi'
  };

  /* ── First attempt (until an Ötzi game has finished) ─────────────
     Fixed early hands so the lessons come up (js/otzi-lessons.js), then the
     player decides. Decks are dealt in this order (unshuffled):
       You:  Neanderthal, Hunter, Gatherer, Cave Art │ T2: Tribe, Dom. Animal │
             T3: Lucy (forced to the top), Megalith │ then Fire, Tool
       Ötzi: Gatherer, Hunter, Tribe, Neanderthal │ T2: Fire, Megalith │
             T3: Dom. Animal, Cave Art │ T4: Tool, Ötzi (never played by the plan)
     Ötzi's plays: T1 Gatherer→Desert, Hunter→Rift Valley · T2 Tribe→Rift
     Valley, Neanderthal→Desert · T3 Fire and Megalith, each to wherever he is
     weakest · T4 planned at the start of the turn by SOG.OtziDirector so that
     moving Lucy (4 IP) to a close location is a winning play. Any plan that no
     longer fits the board falls back to his normal logic. Later attempts:
     OTZI_CONFIG (shuffled decks, otziSelectPlays) — unless the player says Yes
     to hints, which switches that game to all of the above (_useFirstAttempt). */
  var KEY_OTZI_ATTEMPTS = 'sog_otzi_attempts';
  var FIRST_PLAYER_DECK = [34, 27, 28, 30, 36, 32, 33, 31, 29, 26];
  var FIRST_OTZI_DECK   = [28, 27, 36, 34, 29, 31, 32, 30, 26, 35];
  var FIRST_OTZI_PLAYS  = { 1: [{ id: 28, loc: 8 }, { id: 27, loc: 2 }],
                            2: [{ id: 36, loc: 2 }, { id: 34, loc: 8 }] };
  var _firstAttempt = false;
  var _attempt = 0;
  var _t4Plan = null;

  // The live board in SOG.OtziDirector's shape (revealed cards only). Megalith's
  // turn played is read off its growth so far (ipMod) at the start of a turn.
  function _directorBoard(G) {
    var b = { locIds: G.locations.map(function (l) { return l.id; }), player: {}, ai: {} };
    var row = function (arr) {
      return (arr || []).filter(function (s) { return s && s.revealed; }).map(function (s) {
        return { id: s.cardId, turn: s.cardId === 31 ? (G.turn - (s.ipMod || 0)) : (s.turnPlayed || 1) };
      });
    };
    G.locations.forEach(function (l) { b.player[l.id] = row(G.playerSlots[l.id]); b.ai[l.id] = row(G.aiSlots[l.id]); });
    return b;
  }
  function _t3Plays(G) {
    var D = SOG.OtziDirector; if (!D) return null;
    var b = _directorBoard(G), out = [];
    [29, 31].forEach(function (id) {
      if (G.aiHand.indexOf(id) === -1) return;
      var sc = D.score(b, 3).per;
      var open = b.locIds.filter(function (l) { return b.ai[l].length < 4; });
      if (!open.length) return;
      var loc = open.sort(function (x, y) { return sc[x].a - sc[y].a; })[0];
      D.place(b, 'ai', loc, id, 3);
      out.push({ id: id, loc: loc });
    });
    return out;
  }
  function _planT4(G) {
    var D = SOG.OtziDirector; if (!D) return null;
    var lucyAt = null;
    G.locations.forEach(function (l) {
      (G.playerSlots[l.id] || []).forEach(function (s) { if (s && s.revealed && s.cardId === 33 && !s._advLucyMoved) lucyAt = l.id; });
    });
    var r = D.chooseT4({ board: _directorBoard(G), playerHand: G.playerHand.slice(), aiHand: G.aiHand.slice(), lucyAt: lucyAt });
    log('T4 plan: ' + r.kind + ' (lucy lines win ' + r.lucyWins + ', other lines win ' + r.otherWins + ') ' + JSON.stringify(r.plays));
    return r.plays;
  }
  function firstAttemptSelectPlays(ctx) {
    var G = ctx.G, t = G.turn;
    var plan = t <= 2 ? FIRST_OTZI_PLAYS[t] : t === 3 ? _t3Plays(G) : _t4Plan;
    var free = {};
    G.locations.forEach(function (l) { free[l.id] = (G.aiSlots[l.id] || []).filter(function (x) { return x === null; }).length; });
    var hand = G.aiHand.slice();
    var ok = !!plan && plan.every(function (p) {
      var hi = hand.indexOf(p.id);
      if (hi === -1 || !(free[p.loc] > 0)) return false;
      hand.splice(hi, 1); free[p.loc]--;
      return true;
    });
    if (!ok) return otziSelectPlays(ctx);
    return plan.map(function (p) { return { cardId: p.id, locId: p.loc }; });
  }
  // Ötzi's selector, both configs: scripted on a first attempt (including one
  // switched on by a Yes to hints after the build), his normal logic otherwise.
  function _otziPlays(ctx) { return _firstAttempt ? firstAttemptSelectPlays(ctx) : otziSelectPlays(ctx); }
  var OTZI_FIRST_CONFIG = (function () {
    var c = {};
    Object.keys(OTZI_CONFIG).forEach(function (k) { c[k] = OTZI_CONFIG[k]; });
    c.decks = { player: { source: 'explicit', ids: FIRST_PLAYER_DECK.slice(), shuffle: false },
                ai:     { source: 'explicit', ids: FIRST_OTZI_DECK.slice(),   shuffle: false } };
    return c;
  })();

  /* ── Logging ─────────────────────────────────────────────────── */
  function log(msg) { if (window.SOG_DEBUG) console.log('[Adventure/Otzi] ' + msg); }

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
    gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur);
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
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(false);   // restore battle music after dialogue
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

  /* ── Turn counter ────────────────────────────────────────────
     The top-left box is engine-rendered (SOG.board.updateHeader): TURN N / total
     on top, CARDS TO PLAY and the count below — the same element and style every
     capital battle uses. This only asks for a refresh; the module never writes
     into the box, so the counter can't be overwritten at turn start. */
  function setTurnCounter(current, total) {
    if (window.SOG && SOG.board && typeof SOG.board.updateHeader === 'function') SOG.board.updateHeader();
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

  /* ── Hints offer ───────────────────────────────────────────────
     Before the deal (the board has slid in, the hands are still hidden): the
     Yes / No box, when eligible. Yes switches this game to the first attempt —
     the hands dealt at build are swapped for the fixed first-attempt ones
     before they are shown. next() runs the deal either way. */
  function _hintFlag(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }

  function _offerHints(next) {
    var popup = window.SOG && SOG.BattleRulesPopup;
    if (_firstAttempt || !_hintFlag(KEY_OTZI_GAME_FINISHED) || isBattleComplete() ||
        !popup || typeof popup.show !== 'function') { next(); return; }
    popup.show({
      body:       HINTS_PROMPT,
      panelClass: 'otzi-hints-prompt',
      choices: [
        { label: 'Yes', onClick: function () { _useFirstAttempt(); next(); } },
        { label: 'No',  onClick: function () { next(); } }
      ]
    });
  }

  // Turn this game into the first attempt: the fixed decks and opening hands
  // (as OTZI_FIRST_CONFIG deals them), Ötzi's scripted plays (otziSelectPlays
  // routes on _firstAttempt), and the lessons re-begun with every first-attempt
  // interjection.
  function _useFirstAttempt() {
    var G = SOG.state && SOG.state.G;
    if (!G) return;
    _firstAttempt = true;
    _t4Plan = null;
    var n = G.config.structure.handStart;
    G.playerDeck = FIRST_PLAYER_DECK.slice();
    G.playerHand = G.playerDeck.splice(0, n);
    G.aiDeck     = FIRST_OTZI_DECK.slice();
    G.aiHand     = G.aiDeck.splice(0, n);
    if (SOG.input && SOG.input.rebuildPlayerHand) SOG.input.rebuildPlayerHand();
    if (SOG.ui && SOG.ui.updateOppHand) SOG.ui.updateOppHand();
    if (SOG.game && SOG.game.refreshMoveableCards) SOG.game.refreshMoveableCards();
    if (SOG.OtziLessons) SOG.OtziLessons.begin({ first: true, attempt: _attempt });
  }

  /* ── Post-battle dialogue → card reveal → scoreboard ──────────── */

  /* Route outcome to the correct dialogue then scoreboard. */
  function _routePostBattle(won, isTie, locResults, usedTiebreaker, playerTotal, otziTotal) {
    if (won) {
      // Win lines up to "I guess you can have this..." → card-acquisition reveal →
      // the "A token of me..." line → scoreboard. (The token line now lands AFTER
      // the card animation.)
      runLines(WIN_DIALOGUE, function () {
        hideBubbles();
        var showTokenThenScore = function () {
          runLines(WIN_TOKEN_LINE, function () {
            hideBubbles();
            _showOtziScoreboard('win', locResults, usedTiebreaker, playerTotal, otziTotal);
          });
        };
        var cardAlreadyOwned = false;
        try { cardAlreadyOwned = localStorage.getItem(KEY_CARD_OTZI_UNLOCKED) === 'true'; } catch (e) {}
        if (cardAlreadyOwned) { showTokenThenScore(); return; }   // repeat win: no reveal
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
            showTokenThenScore();
          });
        } else {
          showTokenThenScore();
        }
      });
      return;
    }
    // Tie / loss: dialogue → scoreboard (unchanged).
    var lines = isTie ? TIE_DIALOGUE : LOSS_DIALOGUE;
    runLines(lines, function () {
      hideBubbles();
      _showOtziScoreboard(isTie ? 'tie' : 'loss', locResults, usedTiebreaker, playerTotal, otziTotal);
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
    // Re-enter through the engine (start → initGame(OTZI_CONFIG)). The shake /
    // slide-in / deal replay; the intro lines are skipped once sog_otzi_opening_seen
    // is set (see onBattleStart).
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

    // Victory uses a single CONTINUE button (mark complete + return to the map),
    // in place of the loss/tie Play Again + Back to Map. Only present on win.
    if (outcome === 'win') {
      var continueBtn = document.getElementById('adv-otzi-result-victory-continue');
      if (continueBtn) continueBtn.onclick = function () {
        el.style.display = 'none';
        _exitOtziBattleToOverworld(true);
      };
    }
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
    mapBtn.textContent = (outcome === 'win') ? 'CONTINUE' : 'BACK TO MAP';
    mapBtn.style.cssText = againBtn.style.cssText;
    mapBtn.onclick = function () { overlay.parentNode.removeChild(overlay); _exitOtziBattleToOverworld(outcome === 'win'); };

    btnRow.appendChild(againBtn);
    btnRow.appendChild(mapBtn);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);
  }

  /* ── Teardown ─────────────────────────────────────────────────── */
  function teardown() {
    if (SOG.OtziLessons) SOG.OtziLessons.teardown();
    // A teardown while the hints prompt is up closes it without dealing.
    if (document.querySelector('#battle-rules-backdrop .otzi-hints-prompt') && SOG.BattleRulesPopup) SOG.BattleRulesPopup.hide();
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
    // First attempt = no Ötzi game has finished yet (the same flag that arms the
    // hints offer), and Ötzi unbeaten. A later game becomes one if the player
    // says Yes to hints (_offerHints → _useFirstAttempt).
    _firstAttempt = !_hintFlag(KEY_OTZI_GAME_FINISHED) && !isBattleComplete();
    _t4Plan = null;
    if (!isBattleComplete()) {
      try { _attempt = (parseInt(localStorage.getItem(KEY_OTZI_ATTEMPTS), 10) || 0) + 1; localStorage.setItem(KEY_OTZI_ATTEMPTS, String(_attempt)); } catch (e) { _attempt = 1; }
    }
    if (typeof window.initGame === 'function') window.initGame(_firstAttempt ? OTZI_FIRST_CONFIG : OTZI_CONFIG);
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
     The board-building beats (shake, slide-in, deal) run on every entry; the
     intro LINES are skipped once watched (sog_otzi_opening_seen) or once Ötzi is
     beaten — see onBattleStart.
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
    // Any outcome arms the hints offer for the next game (beating Ötzi turns it off).
    try { localStorage.setItem(KEY_OTZI_GAME_FINISHED, 'true'); } catch (e) {}
    if (typeof SFX !== 'undefined') {
      if (won && SFX.gameWon)  SFX.gameWon();
      else if (SFX.gameLost)   SFX.gameLost();
    }
    var outcome = won ? 'win' : isTie ? 'tie' : 'loss';
    var go = function () {
      setTimeout(function () {
        _routePostBattle(won, isTie, result.locResults, result.tiebreaker, result.playerTotal, result.aiTotal);
      }, 600);
    };
    var lucy = SOG.OtziLessons ? SOG.OtziLessons.end(outcome, result, go) : (go(), null);
    // Analytics (no PII): outcome, attempt, and what Lucy did.
    if (window.Analytics && typeof window.Analytics.funnel === 'function') {
      window.Analytics.funnel('otzi_result', {
        outcome: outcome, attempt: String(_attempt || 0),
        lucyMoved: lucy && lucy.moved ? 'yes' : 'no',
        lucyTurn: lucy && lucy.moved ? String(lucy.turn) : '',
        lucyFlipped: lucy && lucy.moved ? (lucy.flipped ? 'yes' : 'no') : ''
      });
    }
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
      var L = SOG.OtziLessons;
      if (L) {
        if (isBattleComplete()) L.teardown();
        else L.begin({ first: _firstAttempt, attempt: _attempt });
      }
      _otziApplyTurnPresentation(1);
      _otziParkSideLocations();
      // Skip the entry dialogue once it has been WATCHED once (any retry — Play
      // Again after a loss included) or once Ötzi is beaten. The shake /
      // side-location reveal / deal still run (they set up the board); only the
      // lines are skipped.
      var _skipLines = false;
      try {
        _skipLines = localStorage.getItem(KEY_BATTLE_OTZI_COMPLETE) === 'true' ||
                     localStorage.getItem(KEY_OTZI_OPENING_SEEN)  === 'true';
      } catch (e) {}
      var _lines = function (arr, next) { if (_skipLines) { if (next) next(); return; } runLines(arr, next); };
      fadeOutCover(function () {
        _lines(PRE_SHAKE_LINES, function () {
          // Woosh lands a beat INTO the shake (not at its very start) so it syncs
          // with the side locations actually sliding in, which happens after the
          // ~260ms shake rumble.
          setTimeout(function () { SOG.sfx.play('sfx/woosh.m4a'); }, 150);
          shakeCamera(function () {
            revealSideLocations(function () {
              _lines(POST_SHAKE_LINES, function () {
                // Full intro watched → never replay it (matches the boss battles).
                try { localStorage.setItem(KEY_OTZI_OPENING_SEEN, 'true'); } catch (e) {}
                // Hints offer (when eligible) → deal → turn 1 → the lessons.
                _offerHints(function () {
                  dealCards(function () {
                    done();
                    if (SOG.OtziLessons) SOG.OtziLessons.afterDeal();
                  });
                });
              });
            });
          });
        });
      });
    },

    // Turns 2-4: re-apply per-turn presentation.
    onTurnStart: function (ctx, turn) {
      _otziApplyTurnPresentation(turn);
      // First attempt: Ötzi's turn-4 plays are planned NOW, before the player
      // acts, from the board and the player's turn-4 hand (see _planT4).
      if (_firstAttempt && turn === OTZI_CONFIG.structure.turns) _t4Plan = _planT4(SOG.state.G);
      if (SOG.OtziLessons) SOG.OtziLessons.onTurnStart(turn);
    },

    // Player ended the turn — keep buttons disabled through the reveal.
    onBeforeReveal: function (ctx, turn) {
      _otziDisableButtons();
      if (SOG.OtziLessons) SOG.OtziLessons.onBeforeReveal(turn);
    },
    onRevealStep: function (ctx, p) {
      if (SOG.OtziLessons) SOG.OtziLessons.onRevealStep(p);
    },
    onAfterReveal: function (ctx, p) {
      // First attempt: Lucy is drawn on turn 3 whatever was played before.
      if (_firstAttempt && p && p.turn === 2) {
        var deck = SOG.state.G.playerDeck, li = deck.indexOf(33);
        if (li > 0) { deck.splice(li, 1); deck.unshift(33); }
      }
      if (SOG.OtziLessons) SOG.OtziLessons.onAfterReveal(p);
    },

    // A card was committed — enable End Turn + Reset (Ötzi is not a coaching
    // battle; no prompt). Player may end after 1 or 2 cards.
    onPlayerPlayed: function (ctx, p) {
      _otziEnableButtons();
      if (SOG.OtziLessons) SOG.OtziLessons.onPlayerPlayed(p);
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

  /* ── Snapshot (save-state.js) ── */
  function _flag(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _setFlag(key, v) {
    try {
      if (v) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function getSnapshot() {
    return {
      battleComplete: _flag(KEY_BATTLE_OTZI_COMPLETE),
      cardUnlocked: _flag(KEY_CARD_OTZI_UNLOCKED),
      openingSeen: _flag(KEY_OTZI_OPENING_SEEN),
      gameFinished: _flag(KEY_OTZI_GAME_FINISHED)
    };
  }
  function applySnapshot(snap) {
    if (!snap) return;
    _setFlag(KEY_BATTLE_OTZI_COMPLETE, snap.battleComplete);
    _setFlag(KEY_CARD_OTZI_UNLOCKED, snap.cardUnlocked);
    _setFlag(KEY_OTZI_OPENING_SEEN, snap.openingSeen);
    _setFlag(KEY_OTZI_GAME_FINISHED, snap.gameFinished);
  }

  return {
    start:                start,
    // Dev/test: the first attempt's planned Ötzi turn-4 plays (null otherwise).
    debugT4Plan:          function () { return _t4Plan; },
    isFirstAttempt:       function () { return _firstAttempt; },
    isBattleComplete:     isBattleComplete,
    teardown:             teardown,
    getSnapshot:          getSnapshot,
    applySnapshot:        applySnapshot
  };

})();

window.SOG = SOG;

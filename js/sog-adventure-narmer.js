/**
 * sog-adventure-narmer.js — SOG.NarmerBattle (Egypt Battle 1, STAGE 1).
 *
 * The Narmer ADVANCE-BOARD battle: a standard HORIZONTAL 3-location capital
 * battle whose core mechanic is the ADVANCE GATE (a per-side, LIVE play
 * restriction — see board.js isAdvanceUnlocked):
 *
 *   Lower Egypt (left, player home) · Memphis (center, contested) ·
 *   Upper Egypt (right, Narmer's home)
 *
 *   • Your own home is always playable.
 *   • Memphis unlocks only while your home is FULL (all 4 slots).
 *   • The opponent's home unlocks only while your home is full AND you have
 *     at least one card at Memphis.
 *   • The gate is re-evaluated live at play time: a card moving OUT of a home
 *     slot re-locks forward play until the home is refilled. Movement
 *     PLACEMENT (Chariot etc.) bypasses the gate — that's its breakthrough
 *     value; only NEW plays are gated.
 *
 * STAGE 2 scope: Narmer's REAL 15-card deck + card-aware advance heuristics
 * (cheap bodies wall the home, premium pieces contest the front, Chariots as
 * a weighed breakthrough via cfg.ai.settings.chariotMoveDecision). Player
 * side still runs the Stage-1 placeholder deck. Still no dialogue/rules-
 * popup/win-loss polish (Stage 3) — engine-default scoreboard. The gate rule
 * lives in the engine's centralized play predicate (board.js
 * isLocationPlayable → isAdvanceUnlocked), activated ONLY by this battle's
 * config (rules.advanceGate) so every other battle is untouched.
 *
 * Entry: dev menu "Narmer Battle — Direct Entry" → SOG.NarmerBattle.start().
 * (The overworld Double Crown node still lands on the "Coming Soon" stub;
 * it switches to this battle in a later stage.)
 */
window.SOG = window.SOG || {};
SOG.NarmerBattle = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[NarmerBattle] ' + msg); }

  /* ── Location ids (this battle only; one battle runs at a time, so no
        collision with Hammurabi/HG's 101-103) ─────────────────────────── */
  var LOC_LOWER_EGYPT = 111;   // left  — PLAYER home
  var LOC_MEMPHIS     = 112;   // center — contested
  var LOC_UPPER_EGYPT = 113;   // right — AI (Narmer) home

  /* ── Decks. The PLAYER now brings their OWN built deck (source 'active-deck' →
        window.Decks.getActiveCards(), same as the Hanging Gardens battle) so the
        advance mechanic can be felt with a real deck rather than the old 1/1-heavy
        placeholder. Narmer's side is his REAL 15 (Stage 2):
          Narmer 51 · Khufu 60 · Pyramid 57 · Hieroglyphics 62 · Obelisk 59 ·
          Sphinx 64 · Imhotep 65 · Papyrus 54 · Farmer 55 (Egypt) · Scribe 56
          (Egypt) · Soldier 70 (Egypt) · Chariots 69 (Egypt) · Canals 41 ·
          Sargon 37 · Domesticated Animal 32                                ── */
  var AI_IDS = [51, 60, 57, 62, 59, 64, 65, 54, 55, 56, 70, 69, 41, 37, 32];

  function _cardOf(id) {
    var C = (typeof CARDS !== 'undefined') ? CARDS : [];
    for (var i = 0; i < C.length; i++) if (C[i].id === id) return C[i];
    return null;
  }

  /* ── PLACEHOLDER locations (labels + borrowed art; real Egypt art later).
        No location abilities in Stage 1 — the advance gate IS the board. ── */
  function _narmerLocations() {
    return [
      { id: LOC_LOWER_EGYPT, name: 'Lower Egypt (North)', region: 'Nile Delta',  abilityText: "Explorer's home. Fill all slots to advance.",              abilityKey: null, image: 'images/locations/loweregypt.jpeg', thumbnailCrop: null },
      { id: LOC_MEMPHIS,     name: 'Memphis (The Capitol)', region: 'Two Lands', abilityText: 'Contest here with one card before advancing on enemy.',    abilityKey: null, image: 'images/locations/memphis.jpeg',         thumbnailCrop: null },
      { id: LOC_UPPER_EGYPT, name: 'Upper Egypt (South)', region: 'Nile Valley', abilityText: "Narmer's home. Unlocks after contesting Memphis.",         abilityKey: null, image: 'images/locations/upperegypt.jpeg',          thumbnailCrop: null }
    ];
  }

  /* ══════════════════════════════════════════════════════════════
     ADVANCE-AWARE AI SELECTOR (heuristic profile) — Stage 2.
     The advance-board insight the AI plays by: CHEAP CARDS ARE
     PREMIUM FOR THE GATE. It fills Upper Egypt with its 1-CC bodies
     (Tool/Farmer/Soldier/Canals — Domesticated Animal at 2 CC is the
     next tier) to unlock Memphis fast, SAVING the expensive pieces
     (Narmer, Khufu, Pyramid, Hieroglyphics, Sphinx) for the contested
     locations — but a premium card is still played into the home
     rather than stalling when nothing cheaper is affordable.
     Never returns a gated play: each pick is simulated against this
     turn's already-queued plays, and the engine commits sequentially,
     so a home-completing play makes the SAME TURN's Memphis play
     legal by commit time (the engine's commitPlay re-checks
     isLocationPlayable(loc,'ai') defensively). Light biases only —
     competent but beatable.
  ══════════════════════════════════════════════════════════════ */
  var PREMIUM_IDS   = { 51: true, 60: true, 57: true, 62: true, 64: true, 37: true };  // save for the front (+Sargon)
  var POLITICAL_IDS = { 51: true, 60: true, 37: true };                       // Pyramid/Hieroglyphics targets (Narmer, Khufu, Sargon)

  function narmerSelectPlays(ctx) {
    var G = ctx.G;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : 5;
    var hand    = ctx.hand.slice();
    var LOCS    = [LOC_UPPER_EGYPT, LOC_MEMPHIS, LOC_LOWER_EGYPT];

    // AI-side effective cost — the SAME path the player uses, so location/card
    // discounts (here: a revealed AI Imhotep -1 to Scientific cards at its
    // location) apply to the AI's affordability + budget symmetrically. Falls
    // back to base CC if the engine helper is unavailable.
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, locId, 'ai') : card.cc;
    }

    // Simulated AI-side board = committed slots + this turn's queued plays.
    // polIP/polCount track Politicals per location so a later-queued Pyramid/
    // Hieroglyphics can score a Political queued EARLIER THIS TURN (both reveal
    // together, so the continuous boost realizes).
    var free = {}, count = {}, ownIP = {}, polIP = {}, polCount = {};
    LOCS.forEach(function (id) {
      var s = (G.aiSlots && G.aiSlots[id]) || [];
      free[id]  = s.filter(function (x) { return x === null; }).length;
      count[id] = s.filter(Boolean).length;
      ownIP[id] = 0; polIP[id] = 0; polCount[id] = 0;
      s.forEach(function (x) {
        if (!x) return;
        ownIP[id] += (x.ip || 0) + (x.ipMod || 0) + (x.contMod || 0);
        if (POLITICAL_IDS[x.cardId]) { polCount[id]++; polIP[id] = Math.max(polIP[id], x.ip || 0); }
      });
    });
    function homeFull()  { return free[LOC_UPPER_EGYPT] === 0; }
    function atMemphis() { return count[LOC_MEMPHIS] > 0; }
    function playerRevealedAt(id) {
      return ((G.playerSlots && G.playerSlots[id]) || []).some(function (s) { return s && s.revealed; });
    }

    // Where the AI wants THIS play to go (advance-gate-legal by construction).
    function pickTarget() {
      if (!homeFull()) return free[LOC_UPPER_EGYPT] > 0 ? LOC_UPPER_EGYPT : null;
      var memphisOpen = free[LOC_MEMPHIS] > 0;
      var lowerOpen   = free[LOC_LOWER_EGYPT] > 0 && atMemphis();   // gate: needs a Memphis presence
      // Establish/strengthen Memphis first (the decisive location), then push.
      if (memphisOpen && count[LOC_MEMPHIS] < 2) return LOC_MEMPHIS;
      if (lowerOpen) return LOC_LOWER_EGYPT;
      if (memphisOpen) return LOC_MEMPHIS;
      return null;
    }

    /* Score a hand card FOR the chosen target. Home fill = cheap-first with a
       heavy "save the premium pieces" penalty; advance = IP plus the Egypt
       synergy biases. All biases are LIGHT (a few points) so play stays
       beatable; ties resolve toward lower CC. */
    function scoreCard(id, locId, fillingHome) {
      var c = _cardOf(id);
      if (!c || aiCost(c, locId) > capital) return null;   // affordability honors discounts
      var s;
      if (fillingHome) {
        s = 10 - c.cc * 3 + c.ip * 0.5;
        if (PREMIUM_IDS[id]) s -= 8;      // hold the front-line pieces back…
        if (id === 69) s += 1;            // Chariots early → its once-per-battle move stays available
        if (id === 55) s += 1.5;          // Farmer: next-turn capital compounds while walling up
        if (id === 26) s += 1;            // Tool: draw keeps the fill going
      } else {
        s = c.ip - c.cc * 0.1;
        if (id === 57) s += polIP[locId] > 0 ? polIP[locId] : -3;          // Pyramid: worth the Political it doubles; dead alone
        if (id === 62) s += polCount[locId] > 0 ? 2 * polCount[locId] : -2; // Hieroglyphics: +2 per Political here; dead alone
        if (id === 51) s += (locId === LOC_MEMPHIS ? 2 : 0);               // Narmer: center seat spans the whole board's averaging
        if (id === 56) s += 0.5 * count[locId];                            // Scribe: capital per prior card here
        if (id === 64) s += (ownIP[locId] >= 4 ? 2 : 0);                   // Sphinx: protect a stack worth protecting
        if (id === 70) s += (playerRevealedAt(locId) ? 1 : 0);             // Soldier: a target to strike
      }
      return s;
    }

    function pickCard(locId, fillingHome) {
      var best = null, bestScore = -Infinity, bestCC = Infinity;
      for (var i = 0; i < hand.length; i++) {
        var sc = scoreCard(hand[i], locId, fillingHome);
        if (sc === null) continue;
        var c = _cardOf(hand[i]);
        if (sc > bestScore || (sc === bestScore && c.cc < bestCC)) {
          best = hand[i]; bestScore = sc; bestCC = c.cc;
        }
      }
      return best;
    }

    var plays = [];
    for (var guard = 0; guard < 12; guard++) {
      if (capital <= 0 || !hand.length) break;
      var locId = pickTarget();
      if (locId == null) break;
      var cardId = pickCard(locId, !homeFull());
      if (cardId == null) break;
      var card = _cardOf(cardId);
      plays.push({ cardId: cardId, locId: locId });
      capital -= aiCost(card, locId);   // spend the discounted cost
      free[locId]--; count[locId]++;
      ownIP[locId] += card.ip;
      if (POLITICAL_IDS[cardId]) { polCount[locId]++; polIP[locId] = Math.max(polIP[locId], card.ip); }
      hand.splice(hand.indexOf(cardId), 1);
    }
    log('AI plays: ' + JSON.stringify(plays) + ' (capital left ' + capital + ')');
    return plays;
  }

  /* ══════════════════════════════════════════════════════════════
     CHARIOTS (69) BREAKTHROUGH DECISION — Stage 2.
     Movement bypasses the advance gate (its breakthrough value), but
     leaving a home slot re-locks the AI's forward PLAYS until the
     home refills — so the move is weighed, not reflexive:
       • from Upper Egypt: only once the wall is COMPLETE and a ≤2-CC
         refill card is in hand (the next selection refills first by
         design, and the moved Chariots itself then counts as the
         Memphis presence for the gate). Prefer establishing/
         strengthening Memphis; deep-strike Lower Egypt when Memphis
         is already held and there's a player card worth the -2.
       • from Memphis: push into Lower Egypt only if ≥2 own cards
         keep the Memphis presence alive.
       • null = HOLD (stays eligible on later turns — the engine only
         burns the once-per-battle flag on an actual move).
  ══════════════════════════════════════════════════════════════ */
  function narmerChariotMove(G, found) {
    var from = found.locId;
    function openAt(id)  { return ((G.aiSlots && G.aiSlots[id]) || []).indexOf(null) !== -1; }
    function cnt(id)     { return ((G.aiSlots && G.aiSlots[id]) || []).filter(Boolean).length; }
    function playerRevealedAt(id) {
      return ((G.playerSlots && G.playerSlots[id]) || []).some(function (s) { return s && s.revealed; });
    }
    if (from === LOC_UPPER_EGYPT) {
      var homeFull  = !openAt(LOC_UPPER_EGYPT);
      var canRefill = (G.aiHand || []).some(function (id) { var c = _cardOf(id); return c && c.cc <= 2; });
      if (!homeFull || !canRefill) return null;   // don't break a wall we can't rebuild
      if (cnt(LOC_MEMPHIS) < 2 && openAt(LOC_MEMPHIS)) return LOC_MEMPHIS;
      if (openAt(LOC_LOWER_EGYPT) && playerRevealedAt(LOC_LOWER_EGYPT)) return LOC_LOWER_EGYPT;
      if (openAt(LOC_MEMPHIS)) return LOC_MEMPHIS;
      return null;
    }
    if (from === LOC_MEMPHIS) {
      if (cnt(LOC_MEMPHIS) >= 2 && openAt(LOC_LOWER_EGYPT) && playerRevealedAt(LOC_LOWER_EGYPT)) return LOC_LOWER_EGYPT;
      return null;
    }
    return null;   // already behind the player's lines — stay
  }

  /* ══════════════════════════════════════════════════════════════
     LOCK-AFFORDANCE VISUALS
     The gate's CORRECTNESS lives in the play predicate; this is pure
     feedback. A light interval (started at battle start, killed on
     outcome/teardown) re-derives each column's lock state from the
     same predicate, so EVERY path that changes the board — plays,
     undo, Chariot moves, AI turns — is reflected without needing a
     hook at each call site. Player-side locks grey the player's slot
     row and show a 🔒 hint naming the unlock condition; AI-side locks
     get a subtle grey so the symmetric rule reads at a glance.
  ══════════════════════════════════════════════════════════════ */
  var _lockTimer = null;

  function _syncAdvanceLocks() {
    if (!document.body.classList.contains('narmer-battle')) return;
    var G = window.SOG && SOG.state && SOG.state.G;
    if (!G || !G.config || G.config.scriptHook !== 'narmer' || !G.locations || !SOG.board) return;
    var homeSlots = G.playerSlots && G.playerSlots[LOC_LOWER_EGYPT];
    var homeFull  = !!homeSlots && homeSlots.indexOf(null) === -1;
    G.locations.forEach(function (loc) {
      var col = document.querySelector('.battle-col[data-loc-id="' + loc.id + '"]');
      if (!col) return;
      var pLocked = !SOG.board.isLocationPlayable(loc.id, 'player');
      var aLocked = !SOG.board.isLocationPlayable(loc.id, 'ai');
      col.classList.toggle('advance-locked-player', pLocked);
      col.classList.toggle('advance-locked-ai',     aLocked);
      var pArea = col.querySelector('.battle-slots-player');
      if (pArea) {
        var hint = '';
        if (pLocked) {
          hint = !homeFull ? 'Fill Lower Egypt to unlock'
                           : 'Play a card at Memphis to unlock';
        }
        pArea.setAttribute('data-lock-hint', hint);
      }
    });
  }

  function _startLockSync() {
    _stopLockSync();
    _syncAdvanceLocks();
    _lockTimer = setInterval(_syncAdvanceLocks, 250);
  }
  function _stopLockSync() {
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE 3 — PRESENTATION (dialogue · rules · rewards · scoreboard)
     Mirrors the Mesopotamia bosses (Hanging Gardens / Hammurabi):
     the SHARED rules popup (SOG.BattleRulesPopup), SHARED card-acquisition
     (Prehistory.showCardAcquisition) + gold (SOG.gold), and a per-boss copy
     of the speech-bubble typewriter runner (Narmer borrows the shared
     opponent bubble #adv-bubble-otzi, portrait swapped). All text lives in
     the EDITABLE constants below.
     [source: js/sog-adventure-narmer.js — the KEY_, RULES_ and _DIALOGUE constants]
  ══════════════════════════════════════════════════════════════ */
  var TYPE_SPEED_MS = 32;   // matches the other boss typewriters

  // Progress + reward knobs (mirror the HG/Hammurabi boss tier). EDITABLE.
  var KEY_NARMER_COMPLETE     = 'sog_battle_narmer_complete';       // set on first win
  var KEY_NARMER_OPENING_SEEN = 'sog_narmer_battle_opening_seen';   // in-battle intro: first-time only
  var NARMER_CARD_ID  = 51;    // first-win reward (the Narmer card)
  var GOLD_FIRST_WIN  = 25;    // gold on first win
  var GOLD_REPEAT_WIN = 10;    // gold on a repeat win
  var RESULT_ID       = 'adv-narmer-result';
  var SHOW_RESULTS_ID = 'adv-narmer-show-results';
  var OPP_NAME        = 'Narmer';   // scoreboard opponent score label
  var OPP_BADGE       = 'NARMER';   // scoreboard winner badge
  var NARMER_BUBBLE_PORTRAIT = 'images/portraits/narmerportrait.jpeg';

  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  /* ── Rules popup content (shared component renders it) ── */
  var RULES_TITLE = 'The Unification of Egypt';
  var RULES_BODY  = [
    '5 Turns',
    'You must fill your home land, Lower Egypt, before you can advance to Memphis.',
    'Hold a card in Memphis, and the path to Upper Egypt opens.',
    '<u>Win Condition</u> — Gain the most IP at the most locations to unite Egypt.'
  ];

  /* ── In-battle opening dialogue — teaches the advance gate (first-time only). ── */
  var OPENING_DIALOGUE = [
    { who: 'narmer',   text: 'Behold the two lands, traveler.' },
    { who: 'narmer',   text: 'Lower Egypt, your ground. Upper Egypt, mine.' },
    { who: 'explorer', text: 'And that big one in the middle?' },
    { who: 'narmer',   text: 'Memphis. The capital. Where the two lands meet.' },
    { who: 'narmer',   text: 'To reach it, you must first hold your own ground completely.' },
    { who: 'explorer', text: 'So… fill up my side before I can push forward?' },
    { who: 'narmer',   text: 'You do learn.' },
    { who: 'narmer',   text: 'Secure your land. Then contest Memphis. Only then may you march on mine.' },
    { who: 'explorer', text: 'One step at a time. Got it.' },
    { who: 'narmer',   text: 'Accumulate more Influence Points at 2 of the 3 locations to become The Unifier.' },
    { who: 'narmer',   text: 'But you will not.' },
    { who: 'narmer',   text: 'The crown is clearly not meant for you.' },
    { who: 'explorer', text: "We'll see about that." }
  ];

  /* ── Outcome dialogue (editable). WIN is FIRST-WIN-ONLY; card + gold grant
     fires after the last line. ── */
  var WIN_DIALOGUE = [
    { who: 'narmer',   text: 'Impossible.' },
    { who: 'narmer',   text: 'The crown… does not fit you.' },
    { who: 'explorer', text: "I don't want the crown. I just want to get home." },
    { who: 'narmer',   text: 'Perhaps that is why you could take it.' },
    { who: 'narmer',   text: 'One who belongs nowhere… can go anywhere.' },
    { who: 'explorer', text: '…Is that a compliment?' },
    { who: 'narmer',   text: 'Take it. And go, traveler.' },
    { who: 'narmer',   text: 'Before I remember that I do not lose.' }
  ];
  var LOSS_DIALOGUE = [
    { who: 'narmer',   text: 'As it must be.' },
    { who: 'narmer',   text: 'The whole remains unbroken.' },
    { who: 'explorer', text: 'Can I try again?' },
    { who: 'narmer',   text: 'The unworthy always ask.' },
    { who: 'narmer',   text: 'Come. Let us restore the balance.' }
  ];
  var TIE_DIALOGUE = [
    { who: 'narmer',   text: 'A divided result.' },
    { who: 'narmer',   text: 'Two halves, neither whole.' },
    { who: 'narmer',   text: 'This is the one thing I cannot abide.' },
    { who: 'narmer',   text: 'We begin again — and this time, there will be one.' }
  ];

  /* ── Speech bubbles (Narmer borrows the shared opponent bubble). ── */
  function _bubbleId(who) { return who === 'explorer' ? 'explorer' : 'otzi'; }
  function getBubbleEl(id) { return document.getElementById('adv-bubble-' + id); }
  function hideBubbles() {
    ['otzi', 'explorer'].forEach(function (id) {
      var el = getBubbleEl(id);
      if (el) el.classList.remove('is-visible', 'is-ready');
    });
  }
  var _origOppBubbleSrc = null;
  function _swapOpponentBubblePortrait() {
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (_origOppBubbleSrc === null) _origOppBubbleSrc = img.getAttribute('src');
    img.setAttribute('src', NARMER_BUBBLE_PORTRAIT);
  }
  function _restoreOpponentBubblePortrait() {
    if (_origOppBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) img.setAttribute('src', _origOppBubbleSrc);
    _origOppBubbleSrc = null;
  }

  /* ── Web-Audio bleeps — Narmer a deep, regal square tone. ── */
  var _bleepCtx = null;
  function getBleepCtx() {
    if (_bleepCtx) return _bleepCtx;
    try { var Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) _bleepCtx = new Ctx(); } catch (e) {}
    return _bleepCtx;
  }
  var BLEEP_PROFILES = {
    narmer:   { freq: 190, wobble: 24, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  function playBleep(who) {
    var ctx = getBleepCtx(); if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var p = BLEEP_PROFILES[who] || BLEEP_PROFILES.narmer;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(p.freq + (Math.random() - 0.5) * p.wobble, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(p.peak * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + p.dur);
  }

  /* ── Dialogue runner (click-to-advance typewriter). ── */
  var _dlg = { lines: null, lineIdx: 0, isTyping: false, timer: null, fullText: '', textEl: null, activeEl: null, clickHandler: null, onAllDone: null };
  var _dialogueActive = false;   // blocks plays/drags across the opening dialogue (isInputBlocked)

  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }

  function runLines(lines, onAllDone) {
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(true);
    _dlg.lines = lines; _dlg.lineIdx = 0; _dlg.onAllDone = onAllDone;
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
    if (!el) { _dlg.lineIdx++; showLine(); return; }
    var textEl = el.querySelector('.adv-bubble-text');
    if (!textEl) { _dlg.lineIdx++; showLine(); return; }
    textEl.textContent = '';
    el.classList.add('is-visible'); el.classList.remove('is-ready');
    _dlg.fullText = line.text; _dlg.textEl = textEl; _dlg.isTyping = true; _dlg.activeEl = el;
    var i = 0, bleepCount = 0;
    if (_dlg.timer) clearInterval(_dlg.timer);
    _dlg.timer = setInterval(function () {
      i++;
      textEl.textContent = line.text.slice(0, i);
      var c = line.text.charAt(i - 1);
      if (c && c !== ' ' && c !== '\n') {
        var p = BLEEP_PROFILES[line.who] || BLEEP_PROFILES.narmer;
        bleepCount++;
        if (bleepCount >= p.every) { bleepCount = 0; playBleep(line.who); }
      }
      if (i >= line.text.length) {
        clearInterval(_dlg.timer); _dlg.timer = null; _dlg.isTyping = false;
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
    if (window.SOG && SOG.music && typeof SOG.music.duckForDialogue === 'function') SOG.music.duckForDialogue(false);
    if (_dlg.clickHandler) {
      document.removeEventListener('click',   _dlg.clickHandler);
      document.removeEventListener('keydown', _dlg.clickHandler);
      _dlg.clickHandler = null;
    }
    if (_dlg.timer) { clearInterval(_dlg.timer); _dlg.timer = null; }
    _dlg.isTyping = false;
    hideBubbles();
    var onDone = _dlg.onAllDone; _dlg.onAllDone = null; _dlg.lines = null;
    if (onDone) onDone();
  }

  /* Opening dialogue → rules popup → play. First-time only (skipped after seen
     or after a win). Mirrors Sargon's dialogue→rules→onComplete. */
  function _runOpeningDialogue(onComplete) {
    if (_has(KEY_NARMER_OPENING_SEEN) || _has(KEY_NARMER_COMPLETE)) { if (onComplete) onComplete(); return; }
    runLines(OPENING_DIALOGUE, function () {
      _openRulesPopup(function () {
        _set(KEY_NARMER_OPENING_SEEN);
        if (onComplete) onComplete();
      });
    });
  }

  /* ── Rules popup (shared component) + on-demand opponent-portrait reopen. ── */
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

  /* ── Result scoreboard + rewards (mirrors HG: dialogue-first on win). ── */
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
  function _hideResultForReview() {
    var el = document.getElementById(RESULT_ID);
    if (el) el.style.display = 'none';
    if (document.getElementById(SHOW_RESULTS_ID)) return;
    var btn = document.createElement('button');
    btn.id = SHOW_RESULTS_ID; btn.className = 'btn-primary'; btn.textContent = 'SHOW RESULTS';
    btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10060;';
    btn.addEventListener('click', function () {
      var r = document.getElementById(RESULT_ID); if (r) r.style.display = '';
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
    yu.className = 'result-loc-you' + (winner === 'player' ? ' result-loc-winner' : ''); yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className = 'result-loc-opp' + (winner === 'ai' ? ' result-loc-winner' : ''); op.textContent = OPP_NAME + ': ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? OPP_BADGE : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }
  function _restartBattle() { _removeResultPopup(); _teardown(); start(); }
  function _exitToOverworld() {
    _removeResultPopup(); _teardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') window.Overworld.resumeAfterBattle();
    }, 100);
  }
  /* Grant Narmer's card (51) via the SHARED acquisition reveal — FIRST WIN ONLY
     (SOG.Cards.unlock returns truthy only on a new unlock). */
  function _grantNarmerCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') newly = !!SOG.Cards.unlock([NARMER_CARD_ID]);
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === NARMER_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }
  function _grantGold(amount, done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(amount, function () { if (done) done(); });
  }
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'narmer-gold-reward';
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
  /* Repeat-win flourish: VICTORY pops in with the chime, holds, fades → gold. */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'narmer-victory-flourish';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10045;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity 0.3s ease;';
    var txt = document.createElement('div');
    txt.className = 'result-headline result-player'; txt.textContent = 'VICTORY';
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

  function _showResultScoreboard(won, isTie, locResults, opts) {
    opts = opts || {};
    _removeResultPopup();
    var overlay = document.createElement('div');
    overlay.id = RESULT_ID; overlay.className = 'adv-result';
    var wrap = document.createElement('div'); wrap.className = 'result-wrap';
    var headline = document.createElement('div');
    headline.className = 'result-headline ' + (won ? 'result-player' : isTie ? 'result-tie' : 'result-ai');
    headline.textContent = won ? 'VICTORY' : isTie ? 'A TIE' : 'DEFEAT';
    var locs = document.createElement('div'); locs.className = 'result-locs';
    (locResults || []).forEach(function (r) { locs.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP)); });
    var actions = document.createElement('div'); actions.className = 'result-actions';
    function mkBtn(label, cb) {
      var b = document.createElement('button'); b.className = 'btn-primary'; b.textContent = label;
      b.addEventListener('click', cb); return b;
    }
    if (opts.firstWin) {
      // Shown AFTER the win dialogue + card + gold — CONTINUE simply exits.
      actions.appendChild(mkBtn('CONTINUE',   function () { _exitToOverworld(); }));
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn(won ? 'CONTINUE' : 'BACK TO MAP', function () { _exitToOverworld(); }));
    }
    wrap.appendChild(headline); wrap.appendChild(locs); wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  /* FIRST-WIN sequence: win dialogue → grant card 51 + 25 gold → VICTORY scoreboard. */
  function _runFirstWinSequence(locResults) {
    _removeResultPopup();
    runLines(WIN_DIALOGUE, function () {
      _grantNarmerCard(function () {
        _grantGold(GOLD_FIRST_WIN, function () {
          _showResultScoreboard(true, false, locResults, { firstWin: true });
        });
      });
    });
  }

  /* Outcome routing — the module OWNS the screen (never proceed()). */
  function _onWin(locResults) {
    _stopLockSync();
    var firstWin = !_has(KEY_NARMER_COMPLETE);   // capture BEFORE setting the flag
    _set(KEY_NARMER_COMPLETE);
    if (firstWin) {
      _runFirstWinSequence(locResults);
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
    _stopLockSync();
    runLines(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, function () {
      _showResultScoreboard(false, isTie, locResults, {});
    });
  }

  function _teardown() {
    _stopLockSync();
    document.body.classList.remove('narmer-battle');
    Array.prototype.forEach.call(
      document.querySelectorAll('.battle-col.advance-locked-player, .battle-col.advance-locked-ai'),
      function (col) { col.classList.remove('advance-locked-player', 'advance-locked-ai'); });
    // Stage 3 presentation cleanup (mirrors _hgTeardown).
    _unwireOpponentPortraitClick();
    _restoreOpponentBubblePortrait();
    hideBubbles();
    _dialogueActive = false;
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* ══════════════════════════════════════════════════════════════
     CONFIG + SCRIPT
  ══════════════════════════════════════════════════════════════ */
  function buildNarmerConfig() {
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
        ai:     { source: 'explicit', ids: AI_IDS.slice(),     shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _narmerLocations() } },
      // THE mechanic: activates the engine's advance gate (board.js
      // isAdvanceUnlocked) for BOTH sides. No other battle sets this.
      rules: { advanceGate: { playerHome: LOC_LOWER_EGYPT, contested: LOC_MEMPHIS, aiHome: LOC_UPPER_EGYPT } },
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', movement: 'adventure',
                  settings: { selectPlays: narmerSelectPlays, chariotMoveDecision: narmerChariotMove } },
      presentation: {
        bodyClass:      'narmer-battle',
        allyAvatar:     'images/portraits/femaleexplorer%20portrait.jpeg',
        opponentAvatar: 'images/portraits/narmerportrait.jpeg',
        popAlly:        true
      },
      rewards:  {},                       // none yet (Stage 1 mechanic build)
      // Default-scoreboard "Play Again" replays THIS battle (rebuilds a fresh
      // config → reshuffled active/AI decks) instead of falling through to an
      // Arcadium game. Read by game.js's result-play-again handler.
      replay: function () { start(); },
      scriptHook: 'narmer'
    };
  }

  /* Fade the overworld radial-wipe cover out to reveal the battle board (mirrors
     the Gilgamesh/HG launch reveal). Only the OVERWORLD entry leaves the wipe
     'active'; the dev-menu entry has no cover, so we proceed immediately and
     never couple battle-start to a gsap tween that animates nothing. */
  function _fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl || !wipeEl.classList.contains('active')) { if (onDone) onDone(); return; }
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

  var NARMER_SCRIPT = {
    onIntro: function (ctx, done) {
      var p = ctx.config && ctx.config.presentation;
      if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _swapOpponentBubblePortrait();   // Narmer's face on the shared opponent bubble (both paths)

      // Repeat entry (or an already-won rematch) — skip the intro, straight to play.
      if (_has(KEY_NARMER_OPENING_SEEN) || _has(KEY_NARMER_COMPLETE)) {
        _fadeOutCover(function () {
          _wireOpponentPortraitClick();
          _startLockSync();
          done();
        });
        return;
      }

      // First time — teach the advance mechanic: reveal board → opening dialogue
      // → rules popup → play. _dialogueActive blocks plays through the intro.
      _disableButtons();
      _dialogueActive = true;
      _fadeOutCover(function () {
        _runOpeningDialogue(function () {
          _dialogueActive = false;
          _enableButtons();
          _wireOpponentPortraitClick();
          _startLockSync();
          done();
        });
      });
    },

    // Block card plays/drags while the opening dialogue is running.
    isInputBlocked: function (ctx) { return !!_dialogueActive; },

    onTurnStart: function (ctx, turn) { _syncAdvanceLocks(); },

    // The module OWNS the end screen (win/loss/tie dialogue + rewards + scoreboard);
    // it never calls proceed(). Teardown happens on exit/restart.
    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onLoss(result.locResults); },
    onTie:  function (ctx, result, proceed) { _onTie(result.locResults); }
  };

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('narmer', NARMER_SCRIPT);
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  function start() {
    log('start() → initGame(buildNarmerConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildNarmerConfig());
  }

  return {
    start:             start,
    buildNarmerConfig: buildNarmerConfig,
    teardown:          _teardown
  };
})();

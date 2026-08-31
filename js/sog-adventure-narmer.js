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
 * The gate rule lives in the engine's centralized play predicate (board.js
 * isLocationPlayable → isAdvanceUnlocked), activated ONLY by this battle's
 * config (rules.advanceGate) so every other battle is untouched.
 *
 * COMPLETE: real 15-card deck on Narmer's side + the player's own built deck;
 * the shared rules popup; the full presentation layer (portraits, bubbles,
 * bleeps, scoreboard, gold/card acquisition); and the TWO-TIER dialogue track
 * (Serf → interstitial → Giant rematch → Giant win/loss/draw) ported from the
 * Sargon reference. Egypt's reward scale differs from Mesopotamia's flat 15/15:
 * Narmer pays 20 gold on the Serf win and 30 gold + his card on the Giant win.
 *
 * Entry: the overworld Double Crown node (walk up → encounter dialogue on the
 * first visit → battle at the routed tier), or the dev panel's direct launch →
 * SOG.NarmerBattle.start().
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
    // discounts (the Levant's Religious -1, Kente, Henry, the Neb/Ramses in-hand
    // stamps) apply to the AI's affordability + budget symmetrically. Falls back
    // to base CC if the engine helper is unavailable.
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, locId, 'ai') : card.cc;
    }

    // Simulated AI-side board = committed slots + this turn's queued plays.
    // polIP/polCount track Politicals per location so a later-queued Pyramid/
    // Hieroglyphics can score a Political queued EARLIER THIS TURN (both reveal
    // together, so the continuous boost realizes).
    var free = {}, count = {}, ownIP = {}, polIP = {}, polCount = {}, topIP = {}, econCount = {};
    LOCS.forEach(function (id) {
      var s = (G.aiSlots && G.aiSlots[id]) || [];
      free[id]  = s.filter(function (x) { return x === null; }).length;
      count[id] = s.filter(Boolean).length;
      ownIP[id] = 0; polIP[id] = 0; polCount[id] = 0; topIP[id] = 0; econCount[id] = 0;
      s.forEach(function (x) {
        if (!x) return;
        ownIP[id] += (x.ip || 0) + (x.ipMod || 0) + (x.contMod || 0);
        topIP[id] = Math.max(topIP[id], (x.ip || 0) + (x.ipMod || 0));   // new Pyramid grabs any type
        // polIP over BOARD cards: effective, matching ownIP/topIP directly above.
        if (POLITICAL_IDS[x.cardId]) {
          polCount[id]++;
          polIP[id] = Math.max(polIP[id], (x.ip || 0) + (x.ipMod || 0) + (x.contMod || 0));
        }
        // Economic count feeds the reworked Scribe (56), which pays out per
        // Economic card here — read from the card def so it tracks any retype.
        var xc = _cardOf(x.cardId);
        if (xc && xc.type === 'Economic') econCount[id]++;
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
    /* Effective in-hand {ip,cc} — the badge truth, shared with the abilities. */
    function _eff(id, c, locId) {
      var hs = (window.SOG && SOG.abilities && SOG.abilities.handStats)
        ? SOG.abilities.handStats('opp', id) : null;
      return { ip: hs ? hs.ip : (c ? c.ip : 0), cc: aiCost(c, locId) };
    }

    function scoreCard(id, locId, fillingHome) {
      var c = _cardOf(id);
      if (!c || aiCost(c, locId) > capital) return null;   // affordability honors discounts
      /* Score on EFFECTIVE values. Affordability above already honoured discounts, so
         scoring on the printed numbers meant this function rejected a card it could
         not afford by one rule and then ranked it by another. */
      var e = _eff(id, c, locId);
      var s;
      if (fillingHome) {
        s = 10 - e.cc * 3 + e.ip * 0.5;
        if (PREMIUM_IDS[id]) s -= 8;      // hold the front-line pieces back…
        if (id === 69) s += 1;            // Chariots early → its once-per-battle move stays available
        if (id === 55) s += 1.5;          // Farmer: the pending +1 IP compounds while walling up
        if (id === 26) s += 1;            // Tool: draw keeps the fill going
      } else {
        s = e.ip - e.cc * 0.1;
        if (id === 57) s += topIP[locId] > 0 ? topIP[locId] : -3;          // Pyramid (At Once): grabs the last-played card's IP here; dead alone
        if (id === 62) s += polCount[locId] > 0 ? polCount[locId] : -2;     // Hieroglyphics: +1 per Political here (aura halved); dead alone
        if (id === 51) s += (locId === LOC_MEMPHIS ? 2 : 0);               // Narmer: center seat spans the whole board's averaging
        if (id === 56) s += econCount[locId] > 0 ? 1.5 * econCount[locId] : -2;  // Scribe (REWORKED): +1 IP to OTHER Economic cards here; dead alone
        if (id === 64) s += (ownIP[locId] >= 4 ? 2 : 0);                   // Sphinx: protect a stack worth protecting
        if (id === 70) s += (playerRevealedAt(locId) ? 1 : 0);             // Soldier: a target to destroy (needs a 1-CC one to land)
      }
      return s;
    }

    function pickCard(locId, fillingHome) {
      var best = null, bestScore = -Infinity, bestCC = Infinity;
      for (var i = 0; i < hand.length; i++) {
        var sc = scoreCard(hand[i], locId, fillingHome);
        if (sc === null) continue;
        var c   = _cardOf(hand[i]);
        var eCC = aiCost(c, locId);          // tie-break on the badge cost, not the print
        if (sc > bestScore || (sc === bestScore && eCC < bestCC)) {
          best = hand[i]; bestScore = sc; bestCC = eCC;
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
      /* Project the staged play at its EFFECTIVE in-hand IP. aiCost above already
         uses effectiveCost, so this function had correct CC and printed IP side by
         side — a Cuneiform-boosted or Papyrus-copied card was projected as weaker
         than it would actually land. */
      var _sip = (window.SOG && SOG.abilities && SOG.abilities.handStats)
        ? (SOG.abilities.handStats('opp', cardId) || {}).ip : null;
      if (_sip == null) _sip = card.ip;
      ownIP[locId] += _sip;
      topIP[locId] = Math.max(topIP[locId], _sip);
      if (POLITICAL_IDS[cardId]) { polCount[locId]++; polIP[locId] = Math.max(polIP[locId], _sip); }
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
      // "Can I rebuild the wall?" must ask what a refill would actually COST, and
      // affordability everywhere else in this file is the discounted cost.
      var canRefill = (G.aiHand || []).some(function (id) {
        var c = _cardOf(id);
        if (!c) return false;
        var cc = (window.SOG && SOG.board && SOG.board.effectiveCost)
          ? SOG.board.effectiveCost(c, LOC_UPPER_EGYPT, 'ai') : c.cc;
        return cc <= 2;
      });
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
  var NARMER_CARD_ID  = 51;    // GIANT-win reward (the Narmer card)
  /* EGYPT REWARD SCALE — deliberately richer than Mesopotamia's flat 15/15. These
     local constants are what actually get granted; SOG.rewards is consulted only for
     the GATING decision (is this the first win of this tier? does the card drop?),
     and its r.gold (15) is intentionally ignored here so the Mesopotamia bosses stay
     untouched. Editable. */
  var GOLD_SERF_WIN   = 20;    // first SERF win  — gold only, no card
  var GOLD_GIANT_WIN  = 30;    // first GIANT win — gold + the Narmer card
  var GOLD_REPEAT_WIN = 0;     // replays of an already-beaten tier pay nothing (anti-farming)
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
    { who: 'narmer', text: 'Behold two lands...' },
    { who: 'narmer', text: 'Lower Egypt, your ground. Upper Egypt, mine.' },
    { who: 'explorer', text: 'And that big one in the middle?' },
    { who: 'narmer', text: 'Memphis. My capital. Where the two lands meet.' },
    { who: 'narmer', text: 'To reach it, you must first hold your own ground completely.' },
    { who: 'explorer', text: 'So I fill up my side first?' },
    { who: 'narmer', text: 'You do learn.' },
    { who: 'narmer', text: 'Secure your land. Then contest Memphis. Only then may you march on mine.' },
    { who: 'explorer', text: 'One step at a time. Got it.' },
    { who: 'narmer', text: 'Accumulate more Influence Points at 2 of the 3 locations to become The Unifier.' },
    { who: 'narmer', text: 'But you will not.' }
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     NARMER TWO-TIER DIALOGUE — the GENERAL pattern, ported from the Sargon
     reference (sog-adventure-sargon.js):
       existing intro (UNTOUCHED) → SERF WIN → interstitial (overworld) →
       GIANT rematch intro (in-battle) → GIANT win / loss / draw.
     who: 'narmer' = Narmer's portrait; 'explorer' = the player. Acquisition
     animations fire INLINE at the marked beats (see the sequences below).
     [source: js/sog-adventure-narmer.js — the NARMER_*_DIALOGUE constants]
  ══════════════════════════════════════════════════════════════════════════ */

  // SERF WIN — grants 20 gold at the "Take this." beat, NO card. Split around the gold.
  var NARMER_SERF_WIN_A = [
    { who: 'narmer', text: 'You have upset the balance of power.' },
    { who: 'explorer', text: 'Don\'t you mean the balance of YOUR power?' },
    { who: 'narmer', text: 'I said what I said.' },
    { who: 'narmer', text: 'Take this.' }
  ];
  var NARMER_SERF_WIN_B = [
    { who: 'narmer', text: 'All will be set right when you return.' }
  ];

  // GIANT REMATCH INTRO — in-battle, before the Giant rematch (onBattleStart).
  var NARMER_GIANT_INTRO = [
    { who: 'narmer',   text: 'You have returned.' },
    { who: 'explorer', text: "I'm ready to earn my double hat." },
    { who: 'narmer',   text: 'Your nonsensical nature is not worthy of rulership.' },
    { who: 'narmer',   text: 'Order will reassert itself.' }
  ];

  // GIANT WIN — grants the Narmer card THEN 30 gold at the "Take it." beat.
  var NARMER_GIANT_WIN_A = [
    { who: 'narmer',   text: 'You have split the union of my kingdom.' },
    { who: 'explorer', text: 'I just played the cards I was dealt.' },
    { who: 'narmer',   text: 'You are what I don\'t comprehend.' },
    { who: 'narmer',   text: 'But you have proven your ability.' },
    { who: 'explorer',   text: 'My coach calls me a team player.' },
    { who: 'narmer',   text: 'I shall be a team player too.' },
    { who: 'narmer',   text: 'Take this.' }
    // → [CARD — Narmer] THEN [GOLD — 30]
  ];
  var NARMER_GIANT_WIN_B = [
    { who: 'narmer',   text: 'The Double Crown is yours.' },
    { who: 'narmer',   text: 'Go. Find whatever it is you are looking for.' },
    { who: 'explorer', text: "Home. I'm looking for home." },
    { who: 'narmer',   text: 'Perhaps you are a unifier.' }
  ];

  // GIANT LOSS — dismissive, replayable (no grant).
  var NARMER_GIANT_LOSS = [
    { who: 'narmer', text: 'As it must be. ' },
    { who: 'narmer', text: 'My balance holds.' }
  ];

  // GIANT DRAW — a stalemate is not a win, replayable (no grant).
  var NARMER_GIANT_DRAW = [
    { who: 'narmer',   text: 'A divided result. Two halves, and neither whole.' },
    { who: 'narmer',   text: 'This… I cannot abide.' },
    { who: 'narmer',   text: 'We begin again. And this time, there will be one.' }
  ];

  /* ── SERF-tier loss / tie (FRONT-HALF, UNCHANGED) ── */
  var LOSS_DIALOGUE = [
    { who: 'narmer', text: 'It is I who wears the Double Crown.' },
    { who: 'narmer', text: 'As it must be.' },
    { who: 'explorer', text: 'Can I try again?' },
    { who: 'narmer', text: 'Try as you must.' }
  ];
  var TIE_DIALOGUE = [
    { who: 'narmer', text: 'A divided result.' },
    { who: 'narmer', text: 'Two halves, neither whole.' },
    { who: 'narmer', text: 'We begin again and this time, there will be one.' }
  ];

  /* ── Tier helpers (ported verbatim from the Sargon reference) ──────────────
     Read a persisted tier-beaten flag (game.js stamps sog_node_<hook>_<tier>_beaten
     on a win). Distinguishes the Giant REMATCH from a later Giant replay. */
  function _tierBeatenLocal(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }
  /* The flag slot of the current battle (Narmer: aligned with AI tier — no decoupling).
     The game state lives at SOG.state.G — there is no window.G global, so a window.G
     read is always undefined and would silently default to 'serf'. */
  function _flagTier() {
    var _G = (window.SOG && SOG.state && SOG.state.G) || null;
    return (_G && _G.config && (_G.config.flagTier
        || (_G.config.ai && _G.config.ai.tier))) || 'serf';
  }
  /* This battle is the Giant REMATCH (Giant flag, not yet beaten) → the in-battle
     dominance intro (NARMER_GIANT_INTRO) plays instead of the Serf opening tutorial. */
  function _isNarmerGiantRematch() {
    return _flagTier() === 'giant' && !_tierBeatenLocal('narmer', 'giant');
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

  // Narmer's bleep — a deep, regal square tone.
  var BLEEP_PROFILES = {
    narmer:   { freq: 190, wobble: 24, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };

  var _dialogueActive = false;   // blocks plays/drags across the opening dialogue (isInputBlocked)

  function _disableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = true;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = true;
  }
  function _enableButtons() {
    var e = document.getElementById('battle-end-turn');   if (e) e.disabled = false;
    var r = document.getElementById('battle-reset-turn'); if (r) r.disabled = false;
  }

  // Shared bubble/typewriter/bleep engine (js/game/dialogue-runner.js).
  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'narmer',
    typeSpeedMs:       TYPE_SPEED_MS
  });
  function runLines(lines, onAllDone) { _runner.runLines(lines, onAllDone); }
  function hideBubbles()              { _runner.hideBubbles(); }
  function getBubbleEl(id)            { return _runner.getBubbleEl(id); }

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

  /* SERF-win exit: tear down, then hand off to the overworld's Narmer-win return,
     which stamps the Serf flag → interstitial lines A → ERECTS the Giant flag →
     line B. NO node reveal (Narmer is the last boss built) — mirrors Neb's return
     rather than Sargon's, which also rises the next node. Sets the one-shot
     __pendingFlagReveal the return consumes. Plain exit fallback. */
  function _exitToOverworldAfterSerfWin() {
    _removeResultPopup(); _teardown();
    window.__pendingFlagReveal = { hook: 'narmer', tier: 'giant' };   // Giant flag pops on the return
    if (window.Overworld && typeof window.Overworld.returnFromNarmerWin === 'function') {
      window.Overworld.returnFromNarmerWin();
    } else {
      _exitToOverworld();
    }
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
      // Shown AFTER a tier-win sequence (dialogue + gold [+ card]). CONTINUE runs the
      // stage's exit: opts.onContinue = _exitToOverworldAfterSerfWin on the Serf win
      // (Giant flag raise + interstitial), _exitToOverworld on the Giant win (plain —
      // the Giant stamp lands via resumeAfterBattle).
      var _cont = opts.onContinue || _exitToOverworld;
      actions.appendChild(mkBtn('CONTINUE',   function () { _cont(); }));
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

  /* SERF WIN — [source: NARMER_SERF_WIN_A/_B]. Block A → 20 gold at the "Take this."
     beat → block B → scoreboard. CONTINUE = the Serf-win exit (Giant flag raise +
     interstitial). NO card — it waits on the Giant. */
  function _runSerfWinSequence(locResults) {
    _removeResultPopup();
    runLines(NARMER_SERF_WIN_A, function () {
      _grantGold(GOLD_SERF_WIN, function () {                    // 20 gold, NO card
        runLines(NARMER_SERF_WIN_B, function () {
          _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworldAfterSerfWin });
        });
      });
    });
  }

  /* GIANT-win exit (Stage B): the Giant flag still stamps via resumeAfterBattle,
     but the return routes through the overworld's Narmer-Giant handler, which
     chains the one-time Narmer→Hatshepsut journey south once the stamp settles.
     Plain exit fallback if that handler isn't present. */
  function _exitToOverworldAfterGiantWin() {
    _removeResultPopup(); _teardown();
    if (window.Overworld && typeof window.Overworld.returnFromNarmerGiantWin === 'function') {
      window.Overworld.returnFromNarmerGiantWin();
    } else {
      _exitToOverworld();
    }
  }

  /* GIANT WIN — [source: NARMER_GIANT_WIN_A/_B]. Block A → Narmer card THEN 30 gold at
     the "Take it." beat → block B → scoreboard. CONTINUE hands off to the Hatshepsut
     journey (Stage B) — the soft "go find whatever you're looking for" handoff now has
     a destination: the Merchant points her upriver and travels with her. */
  function _runGiantWinSequence(locResults) {
    _removeResultPopup();
    runLines(NARMER_GIANT_WIN_A, function () {
      _grantNarmerCard(function () {                             // card first
        _grantGold(GOLD_GIANT_WIN, function () {                 // then 30 gold
          runLines(NARMER_GIANT_WIN_B, function () {
            _showResultScoreboard(true, false, locResults, { firstWin: true, onContinue: _exitToOverworldAfterGiantWin });
          });
        });
      });
    });
  }

  /* Outcome routing — the module OWNS the screen (never proceed()). */
  function _onWin(locResults) {
    _stopLockSync();
    // Two-tier reward gate (SOG.rewards): 15 gold on the FIRST win of a tier, the
    // Narmer card on the FIRST GIANT win, zero on any replay.
    var r = (window.SOG && SOG.rewards)
          ? SOG.rewards.consume('narmer')
          : { firstTierWin: !_has(KEY_NARMER_COMPLETE), gold: GOLD_SERF_WIN,
              grantCard: (_flagTier() === 'giant' && !_tierBeatenLocal('narmer', 'giant')) };
    _set(KEY_NARMER_COMPLETE);   // any-tier "beaten" — kept for narrative gates
    if (r.grantCard) {
      // FIRST GIANT win → unification dialogue + the Narmer card + 30 gold.
      _runGiantWinSequence(locResults);
    } else if (r.firstTierWin) {
      // FIRST SERF win → serf-win dialogue + 20 gold (NO card) → serf-win return
      // (Giant flag raise + interstitial).
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
  /* Loss / tie — tier-aware, mirroring Sargon's router.
       • GIANT rematch (Giant flag, not yet beaten) → the dedicated Giant loss/draw.
       • SERF, before any win                       → the existing first-meeting lines.
       • Anything after Narmer has been beaten      → straight to the scoreboard, no
         dialogue (the post-win suppression gate: a beaten-Narmer replay must not
         re-fire "Can I try again?" / "The unworthy always ask"). */
  function _onDefeatOrTie(isTie, locResults) {
    _stopLockSync();
    if (_flagTier() === 'giant' && !_tierBeatenLocal('narmer', 'giant')) {
      runLines(isTie ? NARMER_GIANT_DRAW : NARMER_GIANT_LOSS, function () {
        _showResultScoreboard(false, isTie, locResults, {});
      });
      return;
    }
    var beforeWin = !_has(KEY_NARMER_COMPLETE);
    if (beforeWin) {
      runLines(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, function () {
        _showResultScoreboard(false, isTie, locResults, {});
      });
    } else {
      _showResultScoreboard(false, isTie, locResults, {});
    }
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
  /* (_tierBeatenLocal / _flagTier / _isNarmerGiantRematch live up with the two-tier
     dialogue constants — same trio, same order, as the Sargon reference.) */

  function buildNarmerConfig() {
    var st = (window.SOG && SOG.state) || {};
    // Tier derived from SAVE STATE (mirrors Gilgamesh): SERF until the Serf flag is
    // beaten, GIANT for the rematch. Restarts (PLAY AGAIN) rebuild this config with
    // __forceTier already consumed, so the default MUST be honest — a hardcoded
    // 'giant' here silently turned Serf retries into Giant battles.
    var _aiTier = _tierBeatenLocal('narmer', 'serf') ? 'giant' : 'serf';
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
      // Two-tier AI, tier derived from state (_aiTier above): SERF for the first
      // battle + retries, GIANT for the rematch ('narmer' signature: Pyramid/Papyrus
      // combo, Narmer→Memphis when lopsided, Imhotep early (mints a Pyramid), fill home cheap /
      // premiums forward). Bespoke narmerSelectPlays stays as the untiered
      // fallback; window.__forceTier (node click / dev menu) overrides.
      ai:       { profile: 'heuristic', tier: _aiTier, movement: 'adventure',
                  settings: { selectPlays: narmerSelectPlays, chariotMoveDecision: narmerChariotMove } },
      presentation: {
        bodyClass:      'narmer-battle',
        allyAvatar:     'player',   // selected adventurer, resolved at render time
        opponentAvatar: 'images/portraits/narmerportrait.jpeg',
        popAlly:        true
      },
      // Rewards are NOT declared here: the module owns its own payout flow (_onWin →
      // SOG.rewards.consume('narmer') for the gating decision, then the local Egypt
      // amounts GOLD_SERF_WIN / GOLD_GIANT_WIN + the card). Same as every other boss.
      rewards:  {},
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

      // GIANT REMATCH → the in-battle dominance intro (NARMER_GIANT_INTRO), straight
      // to play (no rules popup — the advance gate was taught in the Serf battle). The
      // EXISTING Serf opening tutorial (_runOpeningDialogue) is left UNTOUCHED.
      // Checked BEFORE the repeat-entry skip below, which would otherwise swallow it
      // (KEY_NARMER_COMPLETE is set by the Serf win).
      if (_isNarmerGiantRematch()) {
        _disableButtons();
        _dialogueActive = true;
        _fadeOutCover(function () {
          runLines(NARMER_GIANT_INTRO, function () {
            _dialogueActive = false;
            _enableButtons();
            _wireOpponentPortraitClick();
            _startLockSync();
            done();
          });
        });
        return;
      }

      // Repeat entry (Serf retry after the tutorial, or a replay of a beaten tier) —
      // skip the intro, straight to play.
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

  /* ── Snapshot (save-state.js) ── */
  function _setValue(key, v) {
    try {
      if (v) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function getSnapshot() {
    return {
      battleComplete: _has(KEY_NARMER_COMPLETE),
      openingSeen: _has(KEY_NARMER_OPENING_SEEN)
    };
  }
  function applySnapshot(snap) {
    if (!snap) return;
    _setValue(KEY_NARMER_COMPLETE, snap.battleComplete);
    _setValue(KEY_NARMER_OPENING_SEEN, snap.openingSeen);
  }

  return {
    start:             start,
    buildNarmerConfig: buildNarmerConfig,
    teardown:          _teardown,
    getSnapshot:       getSnapshot,
    applySnapshot:     applySnapshot
  };
})();

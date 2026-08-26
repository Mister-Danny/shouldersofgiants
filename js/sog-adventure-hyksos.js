/**
 * sog-adventure-hyksos.js — SOG.HyksosBattle (the Hyksos invasion ambush).
 *
 * STAGE 1: the card and the battle, launchable from the dev menu. The map
 * ambush trigger/staging is Stage 2 and lives in overworld.js, not here.
 *
 * Three open locations, FIVE turns, "most IP at 2 of 3" — no advance gate. Each
 * location carries an ability, all three handled by SHARED engine keys rather than
 * by this module (see LOC_ABILITY_TEXT below and the handlers named there):
 *
 *   The Nile Delta  ONE_CC_PLUS_ONE_HERE     +1 IP per 1-CC card YOU have here
 *   Thebes          LEAD_HERE_BOOSTS_OTHERS  lead here → +2 IP at the other two
 *   Aswan Cataract  NO_MOVE_HERE             nothing may MOVE in (crossing is not a move)
 *
 * The other novelty is the DECK:
 *
 *   5x Hyksos (67)          -1 IP bodies that cross onto YOUR side of a location
 *   5x Soldier (70)         destroy one of your 1-CC cards here
 *   5x Chariots (69)        move once per battle, striking -2 on arrival
 *
 * This is the first COPY-BASED deck in the game — every earlier deck was
 * fifteen distinct cards. The engine already supports duplicates: decks build
 * with `shuffle(ids.slice())` and never dedupe, hand removal splices ONE
 * instance, and the reveal pipeline resolves plays by (locId, slotIndex)
 * coordinates precisely because "cardId alone is ambiguous once duplicates
 * exist". The one thing duplicates DO break is findSlotEl(owner, cardId),
 * which returns the first id match — so Hyksos's ability identifies its own
 * slot positionally instead (see abilityHyksos in abilities.js).
 *
 * AI TEMPERAMENT — INVADER. Untiered: cfg.ai.tier is deliberately absent, so
 * ai.js routes to this module's own selectPlays (the documented third branch,
 * after 'serf' and 'giant'). This is an ambush, not an overworld node with a
 * Serf/Giant progression, so there is no tier to derive and no tier flag to
 * stamp. The temperament is three rules: Hyksos defect where the player is
 * strongest, Chariots go down early so their once-per-battle move still has
 * turns to spend, Soldiers fill in and pressure.
 *
 * NO RULES POPUP — the ambush drops straight into the battle by design.
 *
 * REWARD — the Hyksos card itself, and NOTHING else. No gold: the card is the
 * entire prize. This is a MUST-WIN battle; Stage 2 wires the retry loop, so
 * for now loss and tie take the standard result scoreboard whose PLAY AGAIN
 * restarts the battle in place (see _showResultScoreboard / _restartBattle).
 *
 * Entry: SOG.HyksosBattle.start() — dev menu, or console.
 */
window.SOG = window.SOG || {};
SOG.HyksosBattle = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[HyksosBattle] ' + msg); }

  /* ── Location ids (this battle only; one battle runs at a time. 111-113 is
        Narmer's block and 121-123 Hatshepsut's, so 131-133 is free). ── */
  var LOC_NILE_DELTA = 131;
  var LOC_THEBES    = 132;
  var LOC_ASWAN_CATARACT = 133;

  /* ══════════════════════════════════════════════════════════════
     EDITABLE CONSTANTS — names, art paths, deck, reward.
     Every value Danny is likely to change lives here rather than
     inline, so a rename is one edit in one place.
  ══════════════════════════════════════════════════════════════ */

  // Location NAMES and flavour. Renaming here renames them everywhere.
  var LOC_NAMES = {
    nileDelta: { name: 'The Nile Delta',  region: 'The Hyksos Seat' },
    thebes:    { name: 'Thebes',          region: 'The Egyptian Holdout' },
    aswan:     { name: 'Aswan Cataract',  region: 'The Southern Frontier' }
  };

  /* LOCATION ABILITY TEXT — shown on the tile and in the location popup exactly
     like every other battle's. The KEYS below are handled by SHARED engine code
     (abilities.js evaluateContinuous / input.js isLegalMoveTarget / game.js
     executeMove), not by this module — same division as Hatshepsut's MOVE_HERE_*
     and Narmer's advance gate, so any future battle can reuse them. */
  var LOC_ABILITY_TEXT = {
    nileDelta: '+1 IP for each 1-CC card you have here.',
    thebes:    "If you're winning here, give the other locations +2 IP.",
    aswan:     'Cards cannot move here.'
  };

  /* Location ART — all three REAL now; no placeholders left.
     The two new filenames use UNDERSCORES (nile_delta, aswan_cataract) and the
     server is character- and case-sensitive, so these must match byte for byte.
     The CSS block that paints the tile background
     (body.hyksos-battle .battle-col[data-loc-id] in css/style.css) carries the same
     three paths and must be edited alongside this map — that one draws the tile,
     these feed the location popup and its thumbnails. */
  var LOC_ART = {
    nileDelta: 'images/locations/nile_delta.jpg',
    thebes:    'images/locations/thebes.jpg',
    aswan:     'images/locations/aswan_cataract.jpg'
  };

  var HYKSOS_CARD_ID = 67;
  var SOLDIER_ID     = 70;
  var CHARIOT_ID     = 69;

  /* THE INVADER DECK — 5 + 5 + 5 = 15, an even third each. Duplicates are
     intentional and the engine handles them; see the header. Change the counts
     here (they are the only place the mix is expressed). */
  var HYKSOS_COUNT  = 5;
  var SOLDIER_COUNT = 5;
  var CHARIOT_COUNT = 5;
  function _buildAiIds() {
    var ids = [];
    var i;
    for (i = 0; i < HYKSOS_COUNT;  i++) ids.push(HYKSOS_CARD_ID);
    for (i = 0; i < SOLDIER_COUNT; i++) ids.push(SOLDIER_ID);
    for (i = 0; i < CHARIOT_COUNT; i++) ids.push(CHARIOT_ID);
    return ids;
  }

  var TURNS          = 5;
  var CAPITAL_PER_TURN = 5;

  var RESULT_ID       = 'adv-hyksos-result';
  var SHOW_RESULTS_ID = 'adv-hyksos-show-results';
  var OPP_NAME        = 'Hyksos';
  var OPP_BADGE       = 'HYKSOS';
  var OPP_PORTRAIT    = 'images/portraits/hyksos.jpeg';
  // The SHARED in-battle speech bubbles are static markup: #adv-bubble-otzi is the
  // opponent's (top-right) and #adv-bubble-explorer the player's (bottom-left).
  // Every boss borrows the opponent bubble and swaps its portrait to its own face,
  // restoring it on teardown — without that swap the invader speaks out of OTZI'S
  // bubble, which is what "falling back to boxes we don't use" looks like.
  var HYKSOS_BUBBLE_PORTRAIT = OPP_PORTRAIT;

  function _locations() {
    function art(key) { return LOC_ART[key]; }
    return [
      {
        id: LOC_NILE_DELTA, name: LOC_NAMES.nileDelta.name, region: LOC_NAMES.nileDelta.region,
        abilityText: LOC_ABILITY_TEXT.nileDelta, abilityKey: 'ONE_CC_PLUS_ONE_HERE',
        image: art('nileDelta'), thumbnailCrop: null
      },
      {
        id: LOC_THEBES, name: LOC_NAMES.thebes.name, region: LOC_NAMES.thebes.region,
        abilityText: LOC_ABILITY_TEXT.thebes, abilityKey: 'LEAD_HERE_BOOSTS_OTHERS',
        image: art('thebes'), thumbnailCrop: null
      },
      {
        id: LOC_ASWAN_CATARACT, name: LOC_NAMES.aswan.name, region: LOC_NAMES.aswan.region,
        abilityText: LOC_ABILITY_TEXT.aswan, abilityKey: 'NO_MOVE_HERE',
        image: art('aswan'), thumbnailCrop: null
      }
    ];
  }

  /* ══════════════════════════════════════════════════════════════
     DIALOGUE. who: 'hyksos' = the invader portrait (the shared opponent
     bubble, top-right), 'explorer' = the player (bottom-left). An EMPTY
     array runs synchronously with nothing shown, so blanking any of these
     is a safe way to mute that beat.

     THE OPENING NOW EXISTS. It was deliberately absent while Stage 2's
     ambush was the only intro — the cinematic dropped you straight into
     the board and that abruptness was the whole design. The opening batch
     below sits INSIDE the battle, after the entry wipe has revealed it, so
     the ambush stays abrupt and the threat gets its own beat once the
     board is up.

     It plays ONCE. PLAY AGAIN routes through _restartBattle -> start(),
     which re-runs onBattleStart, so without a guard a must-win battle
     would replay six lines on every retry. See _skipOpeningOnce below.

     CONSECUTIVE SAME-SPEAKER LINES are fine and used here on purpose
     (the Hyksos gets runs of two and three). The runner only hides the
     OTHER bubble and re-adds 'is-visible' to this one — already present,
     so the 0.25s fade never re-runs. The bubble holds still and retypes,
     which is what makes a run of Hyksos lines read as one speech.
  ══════════════════════════════════════════════════════════════ */
  var OPENING_DIALOGUE = [
    { who: 'explorer', text: "I'm sorry. I think you made a mistake." },
    { who: 'hyksos',   text: 'Make no mistake.' },
    { who: 'hyksos',   text: 'Your land is fertile.' },
    { who: 'explorer', text: "See, it's not really my land…" },
    { who: 'hyksos',   text: 'But you are weak.' },
    { who: 'hyksos',   text: 'Prepare for the onslaught!' }
  ];
  var WIN_DIALOGUE = [
    { who: 'explorer', text: 'Who is weak now?' },
    { who: 'hyksos',   text: 'Hold it.' },
    { who: 'hyksos',   text: 'We cannot bear the shame.' },
    { who: 'explorer', text: "We'll keep the horses." }
  ];
  var LOSS_DIALOGUE = [
    { who: 'hyksos',   text: 'Inevitable.' },
    { who: 'hyksos',   text: 'Bow before your masters.' },
    { who: 'explorer', text: 'But I have to get home.' },
    { who: 'hyksos',   text: 'The only path forward is through us.' }
  ];
  var TIE_DIALOGUE = [
    { who: 'hyksos',   text: 'Neither of us holds the river.' },
    { who: 'hyksos',   text: 'But we will not leave so easily.' }
  ];

  /* ══════════════════════════════════════════════════════════════
     AI — INVADER temperament
     ────────────────────────────────────────────────────────────
     Three card rules, in priority order:
       1. HYKSOS DEFECT INTO STRENGTH. His -1 crosses to the player's side, so
          he is worth most where the player has invested most — the subtraction
          bites the total that decides the location, and the slot he takes is a
          slot the player never gets back. He is REJECTED where the player's
          side is full: he cannot cross, and would sit on the AI's own board at
          -1. (The same judgement, in the same terms, as ai.js's cardLocBias
          case 67 — this selector picks WHICH card, that one scores placement.)
       2. CHARIOTS EARLY. Their move is once per BATTLE and the arrival strike
          is the payoff, so a Chariot played on the last turn is a 2 IP body with
          a dead ability. Bias falls as turns run out.
       3. SOLDIERS PRESSURE. Played where the player has 1-CC cards to kill,
          otherwise as filler.

     ...and three BOARD rules, because the locations are not interchangeable:
       A. THEBES IS THE BOARD. A lead there pays +2 IP at EACH of the other two —
          a 4-point swing, the largest single lever in the battle, and it moves the
          instant the lead does. Seizing a Thebes lead, and defending a thin one,
          are both scored well above ordinary placement. Deliberately NOT scored so
          high that the invader turtles: the term is capped, it decays once the lead
          is comfortable, and it never suppresses a Hyksos defection or a Soldier
          with a real target elsewhere.
       B. THE DELTA IS A TWO-FOR-ONE FOR SOLDIERS. Killing a player 1-CC card at the
          Nile Delta removes the card AND strips the +1 that card was granting the
          player's Delta total. One destroy, two points of swing.
       C. ASWAN IS PLACEMENT-ONLY. Nothing may move IN, so the Cataract can never be
          reinforced or rescued later — whatever is placed there is the whole
          argument. The block is destination-only, so a Chariot AT Aswan can still
          leave (and in fact has TWO legal destinations there against one from
          anywhere else, making it the best launch point on the board).
     Returns [{cardId, locId}]; the engine charges capital and stages the plays.
  ══════════════════════════════════════════════════════════════ */
  function hyksosSelectPlays(ctx) {
    var G       = ctx.G;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : CAPITAL_PER_TURN;
    var hand    = ctx.hand.slice();
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, locId, 'ai') : card.cc;
    }
    function effIP(sd) {
      return (window.SOG && SOG.board && SOG.board.effectiveIP)
        ? SOG.board.effectiveIP(sd) : ((sd.ip || 0) + (sd.ipMod || 0) + (sd.contMod || 0));
    }

    var totalTurns = (G.config && G.config.structure && G.config.structure.turns) || TURNS;
    var turnsLeft  = Math.max(1, totalTurns - G.turn + 1);

    /* LOCATION ROLES BY ABILITY KEY, not by id or by name — a rename or a reorder
       must not silently un-teach the AI. Any of these may be null in a future board
       that drops the key, and every use below guards for that. */
    var byKey = function (k) {
      var l = (G.locations || []).find(function (x) { return x.abilityKey === k; });
      return l ? l.id : null;
    };
    var thebesId = byKey('LEAD_HERE_BOOSTS_OTHERS');
    var deltaId  = byKey('ONE_CC_PLUS_ONE_HERE');
    var aswanId  = byKey('NO_MOVE_HERE');

    // Per-location board read. `theirFree`/`theirIP` are the PLAYER's side —
    // the thing an invasion is aimed at.
    var mineFree = {}, theirFree = {}, theirIP = {}, mineIP = {}, theirOneCC = {};
    G.locations.forEach(function (loc) {
      var mine  = (G.aiSlots     && G.aiSlots[loc.id])     || [];
      var their = (G.playerSlots && G.playerSlots[loc.id]) || [];
      mineFree[loc.id]   = mine.filter(function (x) { return x === null; }).length;
      theirFree[loc.id]  = their.filter(function (x) { return x === null; }).length;
      mineIP[loc.id]     = 0; theirIP[loc.id] = 0; theirOneCC[loc.id] = 0;
      mine.forEach(function  (x) { if (x && x.revealed) mineIP[loc.id]  += effIP(x); });
      their.forEach(function (x) {
        if (!x || !x.revealed) return;
        theirIP[loc.id] += effIP(x);
        var cc = (window.SOG && SOG.abilities && SOG.abilities.effectiveCC)
          ? SOG.abilities.effectiveCC(x) : null;
        if (cc === 1) theirOneCC[loc.id]++;
      });
    });

    /* THEBES LEAD VALUE — board rule A. The lead there pays +2 IP at each of the
       other two locations, so it is worth 4 points of board swing, live.
       `bodyIP` is the card's printed IP: the card is still in hand, so there is no
       effective value to read yet — this is a forecast, not a board reading.
       Shape, deliberately non-linear:
         SEIZE  — behind, and this card takes the lead        → the biggest term
         PRESS  — behind, but this card only narrows the gap  → moderate
         DEFEND — ahead by a thread (0 or 1)                  → real, a lead this
                  thin flips to the player's very next card
         HOLD   — ahead comfortably (2+)                      → small and decaying,
                  so the invader does NOT stack Thebes and abandon the board
       Capped at THEBES_CAP so no single term can dominate a Hyksos defection or a
       Soldier with a live target. */
    var THEBES_CAP = 4.5;
    function thebesValue(bodyIP, locId) {
      if (locId !== thebesId || thebesId === null) return 0;
      var gap      = mineIP[locId] - theirIP[locId];     // >0 we lead, <0 they lead, 0 tied
      var gapAfter = gap + bodyIP;
      var v;
      /* THE BONUS IS BINARY — this is the whole shape of the term. Leading Thebes by
         one pays exactly the same +4 as leading by eight, and a TIE pays nothing. So
         the value of a card here is almost entirely "does it change who is winning",
         not "how much IP does it add".
           SEIZE     — not currently leading, and this card takes the lead. The full
                       4-point swing. By far the biggest term in the selector.
           PRESS     — behind and this card does not get there yet, but shortens the
                       distance for the next one.
           INSURANCE — already leading. The +4 is ALREADY BANKED; more IP here buys
                       nothing except protection against being overtaken, so it is
                       worth only as much as the lead is fragile — and nothing once
                       the lead is comfortable. This is what stops the invader
                       turtling on Thebes: the moment it holds the lead, Thebes stops
                       out-bidding a Soldier with a real target or a Chariot with a
                       launch point. An earlier draft scored a held lead at 1.4-2.6
                       and stacked all three cards of the opening hand onto Thebes. */
      if (gap <= 0) {
        v = (gapAfter > 0) ? 4.0                                  // SEIZE
                           : 1.0 + Math.min(bodyIP, 4) * 0.25;    // PRESS
      } else {
        v = (gap === 1) ? 1.0 : (gap === 2 ? 0.5 : 0);            // INSURANCE, thin → none
      }
      // Deliberately does NOT decay with the clock: a Thebes lead taken on the last
      // turn still pays its +4, unlike a Chariot whose move needs turns to spend.
      return Math.min(v, THEBES_CAP);
    }

    /* ASWAN URGENCY — board rule C, the half that is NOT about mobility.
       Nothing may move INTO the Cataract, so it can never be reinforced or rescued
       by manoeuvre: the only way to contest it, ever, is to PLAY there. Every other
       location can be fixed later with a Chariot roll; this one cannot. So a
       contested Aswan is worth acting on NOW rather than deferring, and the nudge
       grows as the turns run out — after the last play there is no second chance.
       Small on purpose: it is a tie-breaker between comparable placements, not a
       reason to abandon Thebes. Zero when we already lead there. */
    function aswanUrgency(locId) {
      if (locId !== aswanId || aswanId === null) return 0;
      if (mineIP[locId] > theirIP[locId]) return 0;          // already holding it
      return (turnsLeft <= 2) ? 1.2 : 0.5;
    }

    /* Score one (card, location) pair. Higher is better; null means "never". */
    function score(card, locId) {
      if (mineFree[locId] <= 0) return null;                 // no room on our own side
      if (aiCost(card, locId) > capital) return null;
      var bodyIP = card.ip;                                  // printed: it is still in hand

      if (card.id === HYKSOS_CARD_ID) {
        if (theirFree[locId] <= 0) return null;              // cannot cross → never play him here
        // Denial is worth more the tighter their side already is; contest scales
        // with how far ahead of us they are HERE.
        var denial  = (theirFree[locId] <= 1) ? 2.5 : (theirFree[locId] === 2 ? 1.4 : 0.6);
        var contest = (theirIP[locId] > mineIP[locId])
          ? Math.min(theirIP[locId] - mineIP[locId], 8) * 0.45 : 0;
        /* DEFECTING AT THEBES IS THE BEST DEFECTION ON THE BOARD (board rule A).
           He crosses and subtracts 1 from THEIR Thebes total, a 2-point swing in the
           gap — and at Thebes a 2-point swing can flip a 4-point bonus. Scored from
           the POST-CROSSING gap, because that is the board the -1 actually creates.
           He also eats a slot in the decisive centre, which the denial term above
           already prices but which matters more here than anywhere else. */
        var defect = 0;
        if (locId === thebesId && thebesId !== null) {
          var gapAfter = mineIP[locId] - (theirIP[locId] - 1);
          var gapNow   = mineIP[locId] - theirIP[locId];
          /* Same binary logic as thebesValue: flipping the lead is the prize, and
             widening one we already hold is only insurance. */
          defect = (gapNow <= 0 && gapAfter > 0) ? 3.5      // the -1 alone flips Thebes
                 : (gapNow > 0)                  ? 0.8      // lead already banked — insurance
                 : 1.0;                                     // still behind, but closer
        }
        return 3 + denial + contest + defect + aswanUrgency(locId);
      }

      if (card.id === CHARIOT_ID) {
        // Once-per-battle move + arrival strike: front-load them.
        var early = (turnsLeft >= 3) ? 2.5 : (turnsLeft === 2 ? 1.2 : -1);
        // Slight preference for a location we are NOT already winning — the
        // Chariot can leave later, so where it lands matters less than that it
        // lands at all.
        var contested = (theirIP[locId] >= mineIP[locId]) ? 0.5 : 0;
        /* ASWAN IS THE BEST LAUNCH POINT (board rule C). Nothing may move INTO the
           Cataract, but the block is destination-only — a Chariot AT Aswan can still
           leave, and from there BOTH other locations are legal, against one legal
           destination from anywhere else. A Chariot parked at Aswan therefore keeps
           the most options for its single once-per-battle roll. Only worth
           anything while that roll is still unspent, i.e. while turns remain. */
        var launch = (locId === aswanId && aswanId !== null && turnsLeft >= 2) ? 0.8 : 0;
        return 2 + early + contested + launch + thebesValue(bodyIP, locId) + aswanUrgency(locId);
      }

      if (card.id === SOLDIER_ID) {
        // His At Once destroys one of THEIR 1-CC cards here; worth real value
        // only where such a target exists.
        var kill = (theirOneCC[locId] > 0) ? 2 : 0;
        /* TWO-FOR-ONE AT THE DELTA (board rule B). Every player 1-CC card there is
           also granting them +1 of Delta bonus, so the destroy takes the card AND
           the bonus with it — two points of swing from one kill. Only counted where
           a target actually exists; a Soldier at an empty Delta gets nothing. */
        var twoForOne = (locId === deltaId && deltaId !== null && theirOneCC[locId] > 0) ? 1.6 : 0;
        return 2 + kill + twoForOne +
               (theirIP[locId] > mineIP[locId] ? 0.4 : 0) +
               thebesValue(bodyIP, locId) + aswanUrgency(locId);
      }
      /* Any future addition: ordinary body value, plus the board rules that apply to
         every card regardless of type. */
      return (bodyIP - card.cc * 0.1) + thebesValue(bodyIP, locId) + aswanUrgency(locId);
    }

    var plays = [];
    for (var guard = 0; guard < 12; guard++) {
      if (capital <= 0 || !hand.length) break;
      var bestCard = null, bestLoc = null, bestScore = -Infinity;
      for (var h = 0; h < hand.length; h++) {
        var c = cardById(hand[h]);
        if (!c) continue;
        for (var li = 0; li < G.locations.length; li++) {
          var lid = G.locations[li].id;
          var sc  = score(c, lid);
          if (sc === null) continue;
          if (sc > bestScore) { bestScore = sc; bestCard = c; bestLoc = lid; }
        }
      }
      if (!bestCard) break;

      plays.push({ cardId: bestCard.id, locId: bestLoc });
      capital -= aiCost(bestCard, bestLoc);
      mineFree[bestLoc]--;
      mineIP[bestLoc] += bestCard.ip;
      // A Hyksos played here WILL cross, so it consumes one of THEIR slots too —
      // account for it now or the next Hyksos this turn would double-book it.
      if (bestCard.id === HYKSOS_CARD_ID) theirFree[bestLoc]--;
      hand.splice(hand.indexOf(bestCard.id), 1);             // ONE instance (duplicates!)
    }
    log('AI plays: ' + JSON.stringify(plays) + ' (capital left ' + capital + ')');
    return plays;
  }

  /* ══════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════ */
  function buildHyksosConfig() {
    var st = (window.SOG && SOG.state) || {};
    return {
      structure: {
        turns:            TURNS,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: CAPITAL_PER_TURN, resetEachTurn: true },
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: _buildAiIds(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _locations() } },
      // No rules.advanceGate — a standard open board.
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      /* NO `tier` — deliberate. ai.js routes 'serf'/'giant' to the shared brains
         and everything else to settings.selectPlays; this ambush has no tier
         progression to derive, so it takes that third branch. Consequently
         cfg.flagTier stays null and a win stamps no tier flag. */
      ai:       { profile: 'heuristic', movement: 'adventure',
                  settings: { selectPlays: hyksosSelectPlays } },
      presentation: {
        bodyClass:      'hyksos-battle',
        allyAvatar:     'player',
        opponentAvatar: OPP_PORTRAIT,
        // Mirror the battle avatar too — the HUD's overworld portrait already
        // flips (CHARACTERS.hyksos.flip), and the bubble portrait flip below is
        // inert under the comic-bubble style, which hides that portrait.
        opponentAvatarFlip: true,
        popAlly:        true
      },
      rewards:  {},                       // script-owned (see _onWin), like every boss
      replay:   function () { start(); },
      scriptHook: 'hyksos'
    };
  }

  /* ── Reward: the CARD, and nothing else. No gold by design. ── */
  function _grantHyksosCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') {
      newly = !!SOG.Cards.unlock([HYKSOS_CARD_ID]);
    }
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === HYKSOS_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* ── Dialogue runner (shared engine, one instance per battle module) ── */
  var BLEEP_PROFILES = {
    hyksos:   { freq: 150, wobble: 26, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer: { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'hyksos',
    typeSpeedMs:       32
  });
  function runLines(lines, onAllDone) { _runner.runLines(lines, onAllDone); }
  function hideBubbles()              { _runner.hideBubbles(); }
  function _runLinesIfAny(lines, onDone) {
    if (lines && lines.length) runLines(lines, onDone); else onDone();
  }

  /* Borrow the shared opponent bubble and put the Hyksos face on it. Mirrors
     Narmer's _swapOpponentBubblePortrait/_restore pair exactly — including
     remembering the ORIGINAL src rather than hard-coding Otzi's, so teardown
     restores whatever was there rather than assuming. The player's own bubble
     (#adv-bubble-explorer) needs nothing: adventurers.js watches it and keeps the
     selected adventurer's portrait on it. */
  var _origOppBubbleSrc = null;
  var _origOppBubbleXf  = null;
  function _swapOpponentBubblePortrait() {
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (!img) return;
    if (_origOppBubbleSrc === null) {
      _origOppBubbleSrc = img.getAttribute('src');
      _origOppBubbleXf  = img.style.transform || '';
    }
    img.setAttribute('src', HYKSOS_BUBBLE_PORTRAIT);
    /* MIRRORED, matching the HUD's `flip: true` for this character — the Hyksos art
       faces the wrong way for the opponent slot and should look inward. The original
       transform is remembered too, because the bubble this borrows is the
       NEANDERTHAL/Otzi one, whose markup already carries a scaleX(-1) in some
       battles; restoring src without restoring transform would leave it reversed. */
    img.style.transform = 'scaleX(-1)';
  }
  function _restoreOpponentBubblePortrait() {
    if (_origOppBubbleSrc === null) return;
    var img = document.querySelector('#adv-bubble-otzi .adv-bubble-portrait');
    if (img) {
      img.setAttribute('src', _origOppBubbleSrc);
      img.style.transform = _origOppBubbleXf || '';
    }
    _origOppBubbleSrc = null;
    _origOppBubbleXf  = null;
  }

  /* THE SECOND HALF OF THE SHARED BATTLE-ENTRY TRANSITION.
     Entering a battle from the overworld is TWO halves, and this module had
     neither: overworld._fireWipeFromNode closes a radial wipe over the map with
     sfx/woosh.m4a and starts the battle underneath it, and then the BATTLE fades
     that same cover away in onBattleStart to reveal its board. Byte-identical to
     Hatshepsut's / Narmer's — same element (#adv-radial-wipe), same 0.45s
     power2.out, same cleanup — so the ambush's entry is indistinguishable from
     every other battle's.
     Harmless when no wipe is active (a dev-panel launch), which is why the
     `.active` check comes first: it just calls back immediately. */
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

  function _teardown() {
    document.body.classList.remove('hyksos-battle');
    // Safety: a teardown that lands mid-transition must not leave the wipe cover
    // stranded over the map (the same clear the overworld's _clearWipe performs).
    var _wipe = document.getElementById('adv-radial-wipe');
    if (_wipe) { _wipe.classList.remove('active'); _wipe.style.opacity = ''; _wipe.style.clipPath = ''; }
    _restoreOpponentBubblePortrait();
    hideBubbles();
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    _removeResultPopup();
  }

  /* ── Result scoreboard (this module owns the screen; never proceed()) ── */
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
    if (won) {
      actions.appendChild(mkBtn('CONTINUE',  function () { _exit(); }));
      actions.appendChild(mkBtn('GAMEBOARD', function () { _hideResultForReview(); }));
    } else {
      /* MUST-WIN: loss and tie both offer only a retry and a board review —
         no exit. Stage 2 replaces this with the real retry loop (and the
         narrative reason you cannot walk away from an ambush); until then
         PLAY AGAIN restarts the battle in place. */
      actions.appendChild(mkBtn('PLAY AGAIN', function () { _restartBattle(); }));
      actions.appendChild(mkBtn('GAMEBOARD',  function () { _hideResultForReview(); }));
    }
    wrap.appendChild(headline); wrap.appendChild(locs); wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }
  /* MUST-WIN RETRY. Re-enters the BATTLE only — the overworld is never touched,
     so the ambush cinematic cannot replay (the Gilgamesh pattern). The opening is
     suppressed for this one re-entry: six lines before every attempt at a battle
     you are required to win would wear out fast. */
  function _restartBattle() {
    _skipOpeningOnce = true;
    _removeResultPopup(); _teardown(); start();
  }
  /* WIN EXIT — Stage 2. Routes through Overworld.returnFromHyksosWin, which clears
     the ambush sprites, stamps the once-only flag, and then runs the journey the
     ambush DEFERRED (the Merchant conversation + the walk south). Falls back to the
     plain overworld return when that handler is absent, so a dev-panel launch with
     no ambush in flight still lands somewhere sane. */
  function _exit() {
    _removeResultPopup(); _teardown();
    if (window.Overworld && typeof window.Overworld.returnFromHyksosWin === 'function') {
      window.Overworld.returnFromHyksosWin();
      return;
    }
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') window.Overworld.resumeAfterBattle();
    }, 100);
  }

  /* ══════════════════════════════════════════════════════════════
     SCRIPT — no intro dialogue and no rules popup: straight into the
     fight. onWin grants the card (no gold) then shows this module's
     own scoreboard; loss/tie play their line and offer the retry.
  ══════════════════════════════════════════════════════════════ */
  var _dialogueActive = false;

  /* ONE-SHOT RETRY GUARD for the opening batch.
     start() is the ONLY entry point — a fresh ambush, a dev-panel launch and a
     PLAY AGAIN retry all call it — so onBattleStart alone cannot tell them apart.
     _restartBattle raises this flag immediately before re-starting, and
     onBattleStart CONSUMES it (reads, then clears). That makes the skip exactly
     one battle deep: the retry is silent, and the next genuinely fresh entry
     plays the opening again. A plain "already played" flag would have been wrong
     the other way — it would mute the opening forever once the page had seen it,
     including on a later fresh ambush. */
  var _skipOpeningOnce = false;

  var HYKSOS_SCRIPT = {
    onIntro: function (ctx, done) {
      var p = ctx.config && ctx.config.presentation;
      if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    // Straight in — no opening dialogue, no rules popup (Stage 2 owns the intro).
    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _swapOpponentBubblePortrait();   // the invader's face on the shared opponent bubble
      /* Reveal the board from under the entry wipe, exactly as every other battle
         does — THEN the opening exchange, over the revealed board. done() is gated
         on both, so turn 1 cannot begin behind the cover or under the dialogue.
         _dialogueActive blocks card placement while it types (isInputBlocked). */
      _fadeOutCover(function () {
        var skip = _skipOpeningOnce;
        _skipOpeningOnce = false;            // consume: the skip is one battle deep
        if (skip) { done(); return; }        // PLAY AGAIN -> straight into turn 1
        _dialogueActive = true;
        _runLinesIfAny(OPENING_DIALOGUE, function () {
          _dialogueActive = false;
          done();
        });
      });
    },

    isInputBlocked: function () { return _dialogueActive; },

    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onDefeatOrTie(false, result.locResults); },
    onTie:  function (ctx, result, proceed) { _onDefeatOrTie(true,  result.locResults); }
  };

  /* The card is the ENTIRE prize — no gold call anywhere in this module.
     SOG.rewards is not consulted: it gates on tier flags and this battle has
     no tier. A repeat win re-runs the dialogue and shows the board;
     Cards.unlock returns false the second time, so the acquisition reveal
     plays once and only once. */
  function _onWin(locResults) {
    _removeResultPopup();
    _dialogueActive = true;
    _runLinesIfAny(WIN_DIALOGUE, function () {
      _dialogueActive = false;
      _grantHyksosCard(function () {
        _showResultScoreboard(true, false, locResults, {});
      });
    });
  }
  function _onDefeatOrTie(isTie, locResults) {
    _dialogueActive = true;
    _runLinesIfAny(isTie ? TIE_DIALOGUE : LOSS_DIALOGUE, function () {
      _dialogueActive = false;
      _showResultScoreboard(false, isTie, locResults, {});
    });
  }

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hyksos', HYKSOS_SCRIPT);
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  function start() {
    log('start() → initGame(buildHyksosConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHyksosConfig());
  }

  return {
    start:             start,
    buildHyksosConfig: buildHyksosConfig,
    teardown:          _teardown,
    LOC: { NILE_DELTA: LOC_NILE_DELTA, THEBES: LOC_THEBES, ASWAN_CATARACT: LOC_ASWAN_CATARACT }
  };
})();

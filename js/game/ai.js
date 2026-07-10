/**
 * game/ai.js — Shoulders of Giants · AI Opponent
 *
 * AI selection dispatches on cfg.ai.profile first:
 *   scriptedSequence — plays cfg.ai.settings.playOrder[turn-1] face-down
 *                      (config-driven scripted opponent)
 *   random-n         — plays cfg.ai.settings.cardsPerTurn random cards into
 *                      random open locations, cost-free (Ötzi-style opponent)
 *   (both reached only when a battle config sets the profile)
 * For every other profile it falls through to the legacy window.aiDifficulty modes:
 *   Easy / Serf  — random play with ~33% carelessness
 *   Hard / Giant — strategic candidate scoring (aiGiantStrategy)
 *
 * Movement: runAiMovements() handles Magellan, Columbus, and Giant-mode
 *           Scandinavia/Timbuktu repositioning.
 *
 * Reads:  SOG.state.G, SOG.state.CAPITAL, window.CARDS, window.aiDifficulty
 * Calls:  SOG.game.{ shuffle, getSlotEl, setSlotFaceDown, effectiveIP,
 *                    isKenteProtected, executeMove }
 * Exposes: SOG.ai.{ runAiSelection, runAiMovements }
 *
 * NOTE: This module was extracted from game.js as part of the
 * "split game.js" refactor (Pass 1). Behavior is unchanged.
 */

(function () {
  'use strict';

  // Module-level aliases. SOG.state is populated by game.js before this
  // script loads (script order in index.html guarantees this).
  var G       = SOG.state.G;
  var CAPITAL = SOG.state.CAPITAL;
  var helpers = SOG.game;

  /* ═══════════════════════════════════════════════════════════════
     AI SELECTION  (per-turn card play)
  ═══════════════════════════════════════════════════════════════ */

  function runAiSelection() {
    G.aiRevealQueue = [];
    // Note: aiActionLog is reset at the start of runAiMovements (which runs
    // before runAiSelection on the AI's turn). Don't reset it here or we'd
    // wipe any movement entries the AI just recorded.
    var budget = CAPITAL + G.aiBonusCapitalNextTurn;
    G.aiBonusCapitalNextTurn = 0;

    // Shared helper: write a decided play to the board and reveal queue.
    function commitPlay(cardId, locId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      // Flooded location (Nebuchadnezzar flood) or an advance-gate lock (Narmer
      // battle) blocks NEW plays — the AI has its own play path, so it must check
      // too, as the AI side ('ai': the advance gate is per-side; flood is
      // symmetric). Inert elsewhere (no flood flag, no advanceGate config).
      if (SOG.board && SOG.board.isLocationPlayable && !SOG.board.isLocationPlayable(locId, 'ai')) return;
      var slotIndex = G.aiSlots[locId].indexOf(null);
      if (slotIndex === -1) return;
      // Resurrection bonus stored as named ipMod entry (parity with player commitPlay)
      var resBonus  = G.aiCardIPBonus[cardId] || 0;
      var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai' : 'Bonus';
      var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
      var _sd = { cardId: cardId, ip: card.ip, revealed: false, ipMod: resBonus, contMod: 0, ipModSources: resSources };
      // Adventure battles relocate a move-capable AI card (Chariot) post-reveal
      // via runAdventureMovements, whose "not on the card's OWN reveal turn" guard
      // reads turnPlayed (parity with the player's commitPlay; the removed bespoke
      // _gAiPlaceCard set it). Scope to adventure-movement configs so other
      // battles' AI slot data — and the Tribe (36) turnPlayed ability — are
      // unchanged (Ötzi's AI Tribe stays inert exactly as today).
      if (G.config && G.config.ai && G.config.ai.movement === 'adventure') _sd.turnPlayed = G.turn;
      G.aiSlots[locId][slotIndex] = _sd;
      // Remove ONE instance from hand (filter would delete BOTH copies of a
      // duplicated id — e.g. a Papyrus copy alongside a Nubian Gold twin).
      var _hi = G.aiHand.indexOf(cardId);
      if (_hi !== -1) G.aiHand.splice(_hi, 1);
      G.aiRevealQueue.push(cardId);
      // locId/slotIndex recorded so the reveal pipeline resolves THIS play's slot
      // by coordinates — cardId alone is ambiguous once duplicates exist (Papyrus
      // copies). Bug 16: unified action log.
      G.aiActionLog.push({ type: 'play', cardId: cardId, locId: locId, slotIndex: slotIndex });
      var slotEl = helpers.getSlotEl('opp', locId, slotIndex);
      if (slotEl) { slotEl.dataset.cardId = cardId; helpers.setSlotFaceDown(slotEl); }
    }

    /* ── Scripted-sequence profile (config-driven) ───────────────
       A scripted opponent plays a fixed card each turn from
       cfg.ai.settings.playOrder, face-down into the battle's location —
       the generic, engine-resident version of the prehistory module's
       scriptedSequence step, now reachable from game.js's flow. Keyed off
       cfg.ai.profile (NOT window.aiDifficulty), so for every other profile
       the legacy difficulty branches below run exactly as today. The card
       is placed via the same commitPlay helper (identical slot data +
       reveal-queue + action-log + face-down DOM as a normal AI play). */
    var _aiProfile = G.config && G.config.ai && G.config.ai.profile;
    if (_aiProfile === 'scriptedSequence') {
      var _settings  = (G.config.ai.settings) || {};
      var _playOrder = _settings.playOrder || [];
      var _cardId    = _playOrder[G.turn - 1];
      var _loc       = G.locations && G.locations[0];   // single-location scripted battle
      if (_cardId != null && _loc) commitPlay(_cardId, _loc.id);
      return;
    }

    /* ── Random-N profile (config-driven) ────────────────────────
       Plays exactly settings.cardsPerTurn random cards from the hand into
       random open locations, COST-FREE — the engine-resident version of the
       Ötzi battle's aiPlayCards. Deliberately NOT the 'easy' capital-budgeted
       logic: an Ötzi-style battle is capital 0 / cost-free, where 'easy' would
       dump the whole hand. Keyed off cfg.ai.profile (NOT window.aiDifficulty),
       so every other profile takes the legacy difficulty branches below
       unchanged. Each card is placed via the same commitPlay helper (identical
       slot data / reveal-queue / action-log / face-down DOM). */
    if (_aiProfile === 'random-n') {
      var _rSettings = (G.config.ai.settings) || {};
      var _n = Math.min(_rSettings.cardsPerTurn || 0, G.aiHand.length);
      for (var _rp = 0; _rp < _n; _rp++) {
        if (!G.aiHand.length) break;
        var _openLocs = G.locations.filter(function (loc) {
          return (G.aiSlots[loc.id] || []).indexOf(null) !== -1;
        });
        if (!_openLocs.length) break;
        var _rCard = G.aiHand[Math.floor(Math.random() * G.aiHand.length)];
        var _rLoc  = _openLocs[Math.floor(Math.random() * _openLocs.length)];
        commitPlay(_rCard, _rLoc.id);   // removes the card from aiHand by id
      }
      return;
    }

    /* ── Heuristic profile (config-driven, battle-supplied selector) ──
       A card-aware opponent whose decision logic lives in the battle module,
       not the engine. The battle's config provides:

         cfg.ai.settings.selectPlays(ctx) → [ {cardId, locId}, ... ]

       a pure decision function the engine invokes once per AI turn. It receives
       ctx = { G, turn, hand, locations } (hand is a copy of G.aiHand; read
       G.aiSlots / G.playerSlots / CARDS / SOG.board off G for board state) and
       RETURNS this turn's plays as an array of {cardId, locId} in play order.
       The engine owns the turn loop + timing and commits each returned play via
       the SAME commitPlay helper (identical slot data / reveal-queue /
       action-log / face-down DOM as every other profile); the battle owns the
       card-aware logic (hold rules, synergy targeting, anti-stacking). commitPlay
       no-ops on a full slot or unknown card, so a malformed/over-long return is
       self-limiting. Keyed off cfg.ai.profile (NOT window.aiDifficulty), so every
       other profile takes the legacy branches below unchanged. Dormant until a
       config sets profile 'heuristic'. */
    if (_aiProfile === 'heuristic') {
      var _hSettings    = (G.config.ai.settings) || {};
      var _hSelectPlays = _hSettings.selectPlays;
      if (typeof _hSelectPlays === 'function') {
        // Expose the per-turn capital budget the engine already computed above
        // (CAPITAL + G.aiBonusCapitalNextTurn, with the accumulator then zeroed) so
        // a capital-aware heuristic selector can SPEND bonus capital it earned (e.g.
        // Hammurabi's Fertile-Crescent CAPITAL_WHEN_FULL). Additive — selectors that
        // ignore ctx.capital (Sargon) are unaffected.
        var _hCtx   = { G: G, turn: G.turn, hand: G.aiHand.slice(), locations: G.locations, capital: budget };
        var _hPlays = _hSelectPlays(_hCtx) || [];
        for (var _hp = 0; _hp < _hPlays.length; _hp++) {
          var _hPlay = _hPlays[_hp];
          if (_hPlay && _hPlay.cardId != null && _hPlay.locId != null) {
            commitPlay(_hPlay.cardId, _hPlay.locId);
          }
        }
      }
      return;
    }

    /* ── Giant / Hard mode: strategic AI ────────────────────────── */
    if (window.aiDifficulty === 'hard') {
      aiGiantStrategy(budget).forEach(function (play) {
        commitPlay(play.cardId, play.locId);
      });
      return;
    }

    /* ── Easy / Serf mode: random with ~33% carelessness ─────────── */
    var hand    = helpers.shuffle(G.aiHand.slice());
    var riftLoc = G.locations.find(function (l) { return l.abilityKey === 'FIRST_CARD_HERE'; });
    var aiFirstPlayed = false;

    hand.forEach(function (cardId) {
      if (budget <= 0) return;
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;   // affordability re-checked below at the chosen location (discounts apply)

      // Randomly skip ~1 in 3 affordable cards to simulate carelessness
      if (Math.random() < 0.33) return;

      var empties = [];
      G.locations.forEach(function (loc) {
        var fi = G.aiSlots[loc.id].indexOf(null);
        if (fi !== -1) empties.push({ locId: loc.id, slotIndex: fi });
      });
      if (!empties.length) return;

      var t;
      if (riftLoc && G.turn === 1 && !aiFirstPlayed) {
        var riftFi = G.aiSlots[riftLoc.id].indexOf(null);
        if (riftFi === -1) return;
        t = { locId: riftLoc.id, slotIndex: riftFi };
      } else {
        helpers.shuffle(empties);
        t = empties[0];
      }
      aiFirstPlayed = true;

      // AI-side effective cost at the CHOSEN location (owner-aware — location/card
      // discounts apply symmetrically). Skip if unaffordable after the discount.
      var cost = (SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, t.locId, 'ai') : card.cc;
      if (cost > budget) return;

      // Resurrection bonus stored as named ipMod entry (parity with player commitPlay)
      var resBonus  = G.aiCardIPBonus[cardId] || 0;
      var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai' : 'Bonus';
      var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
      G.aiSlots[t.locId][t.slotIndex] = { cardId: cardId, ip: card.ip, revealed: false, ipMod: resBonus, contMod: 0, ipModSources: resSources };
      // Remove ONE instance (filter would delete both copies of a duplicated id).
      var _ehi = G.aiHand.indexOf(cardId);
      if (_ehi !== -1) G.aiHand.splice(_ehi, 1);
      G.aiRevealQueue.push(cardId);
      // Coordinates recorded for duplicate-safe reveal resolution (bug 16 log).
      G.aiActionLog.push({ type: 'play', cardId: cardId, locId: t.locId, slotIndex: t.slotIndex });
      budget -= cost;

      var slotEl = helpers.getSlotEl('opp', t.locId, t.slotIndex);
      if (slotEl) { slotEl.dataset.cardId = cardId; helpers.setSlotFaceDown(slotEl); }
    });
  }

  /**
   * _aiLocGap(locId)
   * Returns playerIP − aiIP for revealed cards at a location.
   * Positive = player leads, Negative = AI leads.
   */
  function _aiLocGap(locId) {
    var pIP = G.playerSlots[locId].reduce(function (s, x) { return s + (x && x.revealed ? helpers.effectiveIP(x) : 0); }, 0);
    var aIP = G.aiSlots[locId].reduce(   function (s, x) { return s + (x && x.revealed ? helpers.effectiveIP(x) : 0); }, 0);
    return pIP - aIP;
  }

  /**
   * _aiWinLocs(n)
   * Returns the IDs of the n locations the AI is best positioned to win,
   * sorted by lowest gap (most negative = largest AI lead).
   *
   * NOTE: Defined but currently unused. Preserved during extraction for
   * possible future use; safe to delete if confirmed dead code.
   */
  function _aiWinLocs(n) {
    return G.locations.slice()
      .sort(function (a, b) { return _aiLocGap(a.id) - _aiLocGap(b.id); })
      .slice(0, n)
      .map(function (l) { return l.id; });
  }

  /* ═══════════════════════════════════════════════════════════════
     GIANT MODE AI STRATEGY  (hard difficulty only)
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Per-location snapshot of board state from the AI's perspective.
   * Called once at the start of aiGiantStrategy().
   */
  function _giantBoardAnalysis() {
    var result = {};
    G.locations.forEach(function (loc) {
      var pIP = G.playerSlots[loc.id].reduce(function (s, x) { return s + (x ? helpers.effectiveIP(x) : 0); }, 0);
      var aIP = G.aiSlots[loc.id].reduce(   function (s, x) { return s + (x ? helpers.effectiveIP(x) : 0); }, 0);
      var gap = pIP - aIP;   // positive = player leads (AI losing)

      var playerHighCCCards = G.playerSlots[loc.id].reduce(function (n, s) {
        if (!s) return n;
        // honors a Mummy's inherited CC (sd.cc) via abilities.effectiveCC
        return n + (SOG.abilities.effectiveCC(s) >= 4 ? 1 : 0);
      }, 0);

      var playerCards = G.playerSlots[loc.id].filter(Boolean);

      result[loc.id] = {
        gap:                    gap,
        status:                 gap > 0 ? 'losing' : (gap < 0 ? 'winning' : 'tied'),
        playerHighCCCards:      playerHighCCCards,
        playerHasKente:         G.playerSlots[loc.id].some(function (s) { return s && s.cardId === 17; }),
        aiHasKente:             G.aiSlots[loc.id].some(   function (s) { return s && s.cardId === 17; }),
        playerHasVoltaireAlone: playerCards.length === 1 && playerCards[0].cardId === 20,
        aiRevealedCards:        G.aiSlots[loc.id].filter(function (s) { return s && s.revealed; }),
        aiAllCards:             G.aiSlots[loc.id].filter(Boolean),
        availableSlots:         G.aiSlots[loc.id].filter(function (s) { return s === null; }).length
      };
    });
    return result;
  }

  // (Removed _giantEffectiveCC — the Giant strategy now uses the SAME owner-aware
  //  SOG.board.effectiveCost(card, locId, 'ai') as the player + every other AI
  //  path, so discounts are computed in one place. It previously handled only
  //  Henry/Cosimo/Levant/Neb and missed Imhotep + Babylon.)

  /**
   * Score a single (cardId, locId) candidate play.
   * Returns null if inadvisable; otherwise a numeric score (higher = better).
   * tentativePlays: already-selected plays this turn (for Voltaire/Scholar synergy checks).
   */
  /* ═══════════════════════════════════════════════════════════════
     CARD-SPECIFIC PLACEMENT HEURISTICS (shared)
     ────────────────────────────────────────────────────────────────
     Light "don't waste the card" biases matching each card's REAL ability,
     used by _giantScorePlay (Arcadium hard AI) AND the per-battle heuristic
     selectors (Hammurabi/Sargon/Neb). Deliberately modest weights — they steer
     placement, they do NOT make the AI unbeatable. Split into a turn-scaled
     (location-independent) part and a location-dependent part so a simple
     "sort by IP, place at weakest loc" selector can fold each into the right
     stage (card sort vs location choice). Exported as SOG.ai.* below. */

  /* Turn-scaled preference (location-independent): cards worth MORE the earlier
     they land. Fire (29, Continuous: later cards here gain +1) and Megalith (31,
     0 IP, End-of-turn +1 cumulative) both realise value over the remaining turns,
     so a pure-IP scorer under-plays them. turnsLeft = totalTurns − turn + 1. */
  function cardTurnBias(cardId, turnsLeft) {
    turnsLeft = (typeof turnsLeft === 'number' && turnsLeft > 0) ? turnsLeft : 1;
    if (cardId === 29 || cardId === 31) {         // Fire / Megalith — prefer EARLY
      var b = Math.max(0, turnsLeft - 1) * 1.5;   // scales with turns remaining; 0 on the last turn
      if (cardId === 31 && turnsLeft <= 1) b -= 1;// a last-turn Megalith is nearly worthless
      return b;
    }
    if (cardId === 40) {                          // Scribe — late-bloomer: his At-Once stamps
      return turnsLeft <= 1 ? 3 : -6;             // +1 per OTHER own card here → max targets on
    }                                             // the FINAL turn; early he sinks to last resort
    return 0;
  }

  /* Location-dependent preference: cards whose ability only pays off at a
     location with a matching neighbour. `side` = the AI's side key ('opp' in the
     engine's frame). `tentative` = this turn's not-yet-committed plays
     [{cardId,locId}], so same-turn context counts. */
  function cardLocBias(cardId, locId, G, side, tentative) {
    if (!G) return 0;
    side = side || 'opp';
    var mine = (side === 'opp' ? G.aiSlots     : G.playerSlots)[locId] || [];
    var opp  = (side === 'opp' ? G.playerSlots : G.aiSlots)[locId]     || [];
    tentative = tentative || [];
    function typeOf(id) { var c = CARDS.find(function (x) { return x.id === id; }); return c ? c.type : null; }

    // Own cards already here (prior turns + this turn's tentative plays), minus self.
    var ownIds = [];
    mine.forEach(function (s) { if (s && s.cardId !== cardId) ownIds.push(s.cardId); });
    tentative.forEach(function (p) { if (p.locId === locId && p.cardId !== cardId) ownIds.push(p.cardId); });
    var oppRevealed = opp.filter(function (s) { return s && s.revealed; }).length;

    switch (cardId) {
      case 42:  // Soldier — At Once strikes an OPPONENT card here; whiffs with no target.
        return oppRevealed > 0 ? 2 : -3;
      case 49: { // Phoenicians — attaches to one of the AI's OWN cards here; +1 if Cultural.
        if (!ownIds.length) return -1;            // no host → attaches to nothing
        return ownIds.some(function (id) { return typeOf(id) === 'Cultural'; }) ? 2 : 0.5;
      }
      case 38:  // Priest — Religious; wants a Ziggurat here (Ziggurat gives +1 to Religious).
        return ownIds.indexOf(45) !== -1 ? 1.5 : 0;
      case 45: { // Ziggurat — Continuous +1 to OTHER Religious cards here (e.g. Priest).
        var rel = ownIds.filter(function (id) { return typeOf(id) === 'Religious'; }).length;
        return Math.min(rel, 2) * 1.5;
      }
      case 40: // Scribe — stamps +1 on each of the owner's OTHER cards here: go where they are.
        return Math.min(ownIds.length, 3) * 1.5;
      case 54: { // Papyrus (Egypt) — copies the LAST card played to hand; worth more
                 // after the AI has already played something worthwhile. Board-wide
                 // read (constant across locs → a card-priority nudge). Excludes self.
        var bestIP = 0;
        ['opp', 'player'].forEach(function (sideKey) {
          if (sideKey !== side) return;   // only the AI's own prior plays
          var slots = sideKey === 'opp' ? G.aiSlots : G.playerSlots;
          G.locations.forEach(function (l) {
            (slots[l.id] || []).forEach(function (s) {
              if (s && s.revealed && s.cardId !== 54) {
                var cc = CARDS.find(function (x) { return x.id === s.cardId; });
                if (cc && cc.ip > bestIP) bestIP = cc.ip;
              }
            });
          });
        });
        tentative.forEach(function (p) {
          if (p.cardId === 54) return;
          var cc = CARDS.find(function (x) { return x.id === p.cardId; });
          if (cc && cc.ip > bestIP) bestIP = cc.ip;
        });
        return Math.min(bestIP, 5) * 0.4;   // nothing good yet → ~0; a 5-IP prior play → +2
      }
      case 58: { // Rosetta Stone (Egypt) — adopts the FIRST card the owner played
                 // HERE; worth more when that card has a strong ability. Location-
                 // dependent. STRONG = high-impact copy targets.
        var STRONG = [70, 62, 45, 59, 63, 51, 57, 56, 38, 43, 42, 2];
        var here = (mine || []).filter(function (s) { return s && s.revealed && s.cardId !== 58; });
        if (!here.length) return -1;        // nothing to decipher → whiffs
        var first = here[0];
        here.forEach(function (s) {
          var t  = (typeof s.playTime === 'number') ? s.playTime : Infinity;
          var ft = (typeof first.playTime === 'number') ? first.playTime : Infinity;
          if (t < ft) first = s;
        });
        return STRONG.indexOf(first.cardId) !== -1 ? 2 : 0.5;
      }
      case 53: { // Ramses II (Egypt) — Next Turn: 2x IP to next turn's Cultural
                 // plays; worth more when the AI holds Cultural cards AND a next
                 // turn remains to spend them. Constant across locs (card nudge).
        var hand = side === 'opp' ? G.aiHand : G.playerHand;
        var turnsLeft = (G.config && G.config.structure)
          ? (G.config.structure.turns - G.turn + 1) : 1;
        if (turnsLeft < 2) return -1;       // no next turn → wasted
        var culturalInHand = (hand || []).filter(function (id) {
          return id !== 53 && typeOf(id) === 'Cultural';
        }).length;
        return Math.min(culturalInHand, 3) * 0.8;
      }
      case 71: { // Priest (Egypt) — revive a discarded card as a Mummy HERE; worth
                 // more when the AI has discards to revive AND this location has room.
        var disc = side === 'opp' ? G.aiDiscard : G.playerDiscard;
        if (!disc || !disc.length) return -1;              // nothing to revive → whiffs
        var here = (side === 'opp' ? G.aiSlots : G.playerSlots)[locId] || [];
        var tentHere = tentative.filter(function (p) { return p.locId === locId; }).length;
        // Priest occupies one slot HIMSELF and the revived Mummy needs another —
        // require TWO free slots or the revive is a guaranteed fizzle.
        if ((here.filter(function (s) { return s; }).length + tentHere) >= here.length - 1) return -1;
        var bestDisc = disc.reduce(function (m, id) { var c = CARDS.find(function (x) { return x.id === id; }); return c ? Math.max(m, c.ip) : m; }, 0);
        return 1 + Math.min(bestDisc, 6) * 0.4;            // scales with the best revive available
      }
      case 66: { // Book of the Dead (Egypt) — discard + weigh; a free resurrection
                 // when the AI holds an IP==CC card. Constant across locs (card nudge).
        var bhand = side === 'opp' ? G.aiHand : G.playerHand;
        var hasEq = (bhand || []).some(function (id) { var c = CARDS.find(function (x) { return x.id === id; }); return c && c.ip === c.cc; });
        return hasEq ? 1.5 : 0;
      }
      default:
        return 0;
    }
  }

  function _giantScorePlay(cardId, locId, boardAnalysis, tentativePlays) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return null;
    var an = boardAnalysis[locId];

    var tentativeHere = tentativePlays.filter(function (p) { return p.locId === locId; }).length;
    if (an.availableSlots - tentativeHere <= 0) return null;

    var baseIP = card.ip + (G.aiCardIPBonus[cardId] || 0);
    var score  = baseIP;

    /* ── Per-card synergy bonuses ─────────────────────────────── */

    // Hammurabi (id=47) — "Eye for an Eye": at reveal he sacrifices the AI's
    // lowest-CC card here and destroys the player's lowest-CC card here. He does
    // NOTHING unless BOTH exist at this location: a destroy target (a revealed
    // player card) AND a sacrifice (another AI card here, already revealed or
    // queued this turn). Never waste him on a target-less spot (e.g. turn 1, empty
    // board) — skip the play entirely. Leaving capital unspent beats a dead Hammurabi.
    if (cardId === 47) {
      var hasPlayerTarget = G.playerSlots[locId].some(function (s) { return s && s.revealed; });
      var hasSacrifice    = an.aiAllCards.some(function (s) { return s.cardId !== 47; }) ||
                            tentativePlays.some(function (p) { return p.locId === locId && p.cardId !== 47; });
      if (!hasPlayerTarget || !hasSacrifice) return null;
    }

    // Juvenal (id=18): each high-CC player card here triggers -2 IP penalty
    if (cardId === 18) {
      score += an.playerHighCCCards * 2;
    }

    // Voltaire (id=20): +4 IP if alone at location; wasted otherwise
    if (cardId === 20) {
      var aiHereTotal = an.aiAllCards.length + tentativeHere;
      score += (aiHereTotal === 0) ? 4 : -2;
    }

    // Cortes (id=13): destroys own revealed cards, gains +1 IP per card destroyed
    if (cardId === 13) {
      if (helpers.isKenteProtected(locId)) return null;
      var victims    = an.aiRevealedCards.filter(function (s) { return s.cardId !== 13; });
      var vCount     = victims.length;
      if (vCount < 2) return null;   // per spec: needs multiple victims to be worthwhile
      var vTotIP     = victims.reduce(function (s, x) { return s + helpers.effectiveIP(x); }, 0);
      var netChange  = (3 + vCount) - vTotIP;   // net IP change at this location
      if (netChange < 0) return null;
      score = netChange;
      // William synergy: destroyed IP also accumulates on William
      var aiHasWilliam = G.locations.some(function (l) {
        return G.aiSlots[l.id].some(function (s) { return s && s.cardId === 15; });
      });
      if (aiHasWilliam) score += vTotIP;
    }

    // Kente (id=17): extra value protecting high-IP AI cards at location
    if (cardId === 17) {
      var valCards = an.aiRevealedCards.filter(function (s) { return helpers.effectiveIP(s) >= 3; }).length;
      score += valCards * 0.5;
    }

    // Scholar-Officials (id=2): bonus capital next turn per other card here
    if (cardId === 2) {
      var othersHere = an.aiAllCards.length + tentativeHere;
      if (othersHere >= 1) score += Math.min(othersHere, 3) * 0.5;
    }

    // Pacal the Great (id=5): triggers At Once abilities of all cards at location
    if (cardId === 5) {
      var atOnceHere = an.aiAllCards.filter(function (s) {
        var c = CARDS.find(function (x) { return x.id === s.cardId; });
        return c && c.ability && c.ability.indexOf('At Once') !== -1;
      }).length;
      score += atOnceHere * 2;
    }

    // Henry the Navigator (id=22): extra value if we have Exploration cards to play
    if (cardId === 22) {
      var expHand = G.aiHand.filter(function (id) {
        if (id === 22) return false;
        var c = CARDS.find(function (x) { return x.id === id; });
        return c && c.type === 'Exploration';
      }).length;
      if (expHand > 0) score += 1;
    }

    // Cosimo de'Medici (id=19): extra value if we have Cultural cards to play
    if (cardId === 19) {
      var cultHand = G.aiHand.filter(function (id) {
        if (id === 19) return false;
        var c = CARDS.find(function (x) { return x.id === id; });
        return c && c.type === 'Cultural';
      }).length;
      if (cultHand > 0) score += 1;
    }

    /* ── Location priority ───────────────────────────────────── */
    score += an.status === 'losing' ? 3 : (an.status === 'tied' ? 2 : 0);

    /* ── Adaptive responses ──────────────────────────────────── */
    // Counter opponent Voltaire alone: playing here breaks the +4 bonus
    if (an.playerHasVoltaireAlone) score += 4;

    /* ── Card-specific placement heuristics (Megalith/Fire early; Soldier
       target; Phoenicians cultural host; Priest/Ziggurat pairing). Light
       biases; tentativePlays supplies same-turn context. ── */
    var _totalTurns = (G.config && G.config.structure && G.config.structure.turns) || G.turn;
    var _turnsLeft  = Math.max(1, _totalTurns - G.turn + 1);
    score += cardTurnBias(cardId, _turnsLeft);
    score += cardLocBias(cardId, locId, G, 'opp', tentativePlays);

    return score;
  }

  /**
   * Reveal-queue ordering for selected plays (lower = revealed earlier).
   * Ensures discounters (Henry/Cosimo) go first; Pacal goes last.
   */
  function _giantPlayOrder(cardId) {
    if (cardId === 22 || cardId === 19) return 1;   // Henry / Cosimo: first
    if (cardId === 2)                   return 7;   // Scholar-Officials: after others
    if (cardId === 13)                  return 8;   // Cortes: after own cards established
    if (cardId === 5)                   return 9;   // Pacal: last (triggers all At Once)
    var c = CARDS.find(function (x) { return x.id === cardId; });
    if (c && c.ability && c.ability.indexOf('At Once') !== -1) return 5;
    return 3;
  }

  /**
   * Giant mode card selection.
   * Returns an ordered array of {cardId, locId, cc} plays to commit this turn.
   */
  function aiGiantStrategy(budget) {
    var boardAnalysis = _giantBoardAnalysis();
    var riftLoc       = G.locations.find(function (l) { return l.abilityKey === 'FIRST_CARD_HERE'; });

    var selected   = [];
    var remaining  = budget;
    var usedCards  = {};
    var slotsUsed  = {};
    G.locations.forEach(function (l) { slotsUsed[l.id] = 0; });

    // Build a scored, sorted candidate list from current state.
    function buildCandidates(locFilter) {
      var cands = [];
      G.aiHand.forEach(function (cardId) {
        if (usedCards[cardId]) return;
        G.locations.forEach(function (loc) {
          if (locFilter && loc.id !== locFilter) return;
          var avail = boardAnalysis[loc.id].availableSlots - (slotsUsed[loc.id] || 0);
          if (avail <= 0) return;
          var _card = CARDS.find(function (c) { return c.id === cardId; });
          var cc    = (_card && SOG.board && SOG.board.effectiveCost)
            ? SOG.board.effectiveCost(_card, loc.id, 'ai') : (_card ? _card.cc : 99);
          if (cc > remaining) return;
          var score = _giantScorePlay(cardId, loc.id, boardAnalysis, selected);
          if (score === null) return;
          cands.push({ cardId: cardId, locId: loc.id, cc: cc, score: score });
        });
      });
      cands.sort(function (a, b) { return b.score - a.score; });
      return cands;
    }

    // Commit a play if still valid; returns true on success.
    function tryCommit(play) {
      if (usedCards[play.cardId]) return false;
      if (play.cc > remaining)    return false;
      var avail = boardAnalysis[play.locId].availableSlots - (slotsUsed[play.locId] || 0);
      if (avail <= 0) return false;
      // Re-score with updated tentative list (Voltaire, Pacal synergies may shift)
      if (_giantScorePlay(play.cardId, play.locId, boardAnalysis, selected) === null) return false;
      selected.push({ cardId: play.cardId, locId: play.locId, cc: play.cc });
      usedCards[play.cardId]  = true;
      slotsUsed[play.locId]   = (slotsUsed[play.locId] || 0) + 1;
      remaining              -= play.cc;
      return true;
    }

    // Turn 1: first card MUST go to the Rift Valley (FIRST_CARD_HERE rule).
    if (riftLoc && G.turn === 1) {
      var riftCands = buildCandidates(riftLoc.id);
      if (riftCands.length > 0) tryCommit(riftCands[0]);
    }

    // Main pass: greedy selection with 15% random skip for unpredictability.
    buildCandidates(null).forEach(function (play) {
      if (Math.random() < 0.15) return;
      tryCommit(play);
    });

    // Fill pass: if >1 capital unspent, add remaining cards without random skip.
    if (remaining > 1) {
      buildCandidates(null).forEach(function (play) { tryCommit(play); });
    }

    // Sequence: Henry/Cosimo first → vanilla cards → At Once → Scholar/Cortes → Pacal last.
    selected.sort(function (a, b) {
      return _giantPlayOrder(a.cardId) - _giantPlayOrder(b.cardId);
    });

    return selected;
  }

  /* ═══════════════════════════════════════════════════════════════
     AI AUTO-MOVEMENT  (Magellan / Columbus / Giant repositioning)
  ═══════════════════════════════════════════════════════════════ */

  /**
   * AI auto-movement (both modes).
   * Giant mode also repositions Military from Scandinavia and Cultural toward Timbuktu.
   *
   * Bug 16: previously called executeMove (synchronous, no animation) directly
   * during the AI's turn. Now records each decision into G.aiActionLog as a
   * {type:'move'} entry; the reveal pipeline picks it up via buildRevealSequence
   * and animates via executeMoveAnimated alongside player moves.
   *
   * Intended-destination accounting (intendedDestUses) prevents multiple
   * Military cards at Scandinavia (or Culturals targeting Timbuktu) from all
   * picking the same destination based on stale "this slot is free" reads.
   * Without it, only the first such card would actually move during reveal
   * (subsequent executeMoveAnimated calls bail at toIndex === -1).
   */
  function runAiMovements() {
    var isHard = window.aiDifficulty === 'hard';
    // bug 16: locId → count of moves this turn whose destination is this loc.
    // availableAt() consults it so subsequent decisions don't pile into a
    // destination that's already been "claimed" by an earlier decision.
    var intendedDestUses = {};
    function availableAt(locId) {
      var nullCount = 0;
      var locSlots = G.aiSlots[locId];
      for (var i = 0; i < locSlots.length; i++) if (!locSlots[i]) nullCount++;
      return nullCount - (intendedDestUses[locId] || 0);
    }
    function recordMove(cardId, fromLocId, fromSlotIndex, toLocId) {
      G.aiActionLog.push({
        type: 'move',
        cardId: cardId,
        fromLocId: fromLocId,
        fromSlotIndex: fromSlotIndex,
        toLocId: toLocId
      });
      intendedDestUses[toLocId] = (intendedDestUses[toLocId] || 0) + 1;
    }

    G.locations.forEach(function (loc) {
      G.aiSlots[loc.id].forEach(function (s, si) {
        if (!s || !s.revealed) return;

        // ── Chariot (id=48) — move toward highest player-IP location ─
        if (s.cardId === 48 && !G.aiMovedThisTurn[48]) {
          var charBest = null, charBestScore = -Infinity;
          G.locations.forEach(function (l) {
            if (l.id === loc.id || availableAt(l.id) <= 0) return;
            var score = G.playerSlots[l.id].reduce(function (sum, ps) {
              return sum + (ps && ps.revealed ? helpers.effectiveIP(ps) : 0);
            }, 0);
            if (score > charBestScore) { charBestScore = score; charBest = l.id; }
          });
          if (charBest !== null && charBestScore > 0) {
            recordMove(48, loc.id, si, charBest);
            G.aiMovedThisTurn[48] = true;
          }
        }

        // ── Magellan (id=24) ──────────────────────────────────────
        if (s.cardId === 24 && !G.aiMovedThisTurn[24]) {
          var magBest = null, magBestScore = -Infinity;
          G.locations.forEach(function (l) {
            if (l.id === loc.id || availableAt(l.id) <= 0) return;
            // Giant: move toward most contested (highest gap = AI losing there)
            // Easy: move toward highest player IP
            var magScore = isHard ? _aiLocGap(l.id)
              : G.playerSlots[l.id].reduce(function (sum, ps) {
                return sum + (ps && ps.revealed ? helpers.effectiveIP(ps) : 0);
              }, 0);
            if (magScore > magBestScore) { magBestScore = magScore; magBest = l.id; }
          });
          if (magBest !== null) {
            recordMove(24, loc.id, si, magBest);
            G.aiMovedThisTurn[24] = true;  // preserves the flag-setting executeMove used to do
          }
        }

        // ── Columbus (id=25) ─────────────────────────────────────
        if (s.cardId === 25 && !G.aiColumbusMoved) {
          var colBest = null, colBestCount = 0;
          G.locations.forEach(function (l) {
            if (l.id === loc.id || availableAt(l.id) <= 0) return;
            var cnt = G.playerSlots[l.id].filter(function (ps) {
              if (!ps || !ps.revealed) return false;
              var c = CARDS.find(function (x) { return x.id === ps.cardId; });
              return c && (c.type === 'Cultural' || c.type === 'Political');
            }).length;
            if (cnt > colBestCount) { colBestCount = cnt; colBest = l.id; }
          });
          if (colBest !== null) {
            recordMove(25, loc.id, si, colBest);
            G.aiColumbusMoved = true;  // preserves the flag-setting executeMove used to do
          }
        }

        // ── Giant: Scandinavia military repositioning ─────────────
        if (isHard) {
          var scandLoc = G.locations.find(function (l) { return l.abilityKey === 'MILITARY_FREE_MOVE_AWAY'; });
          var cardInfo = CARDS.find(function (c) { return c.id === s.cardId; });
          if (scandLoc && loc.id === scandLoc.id &&
              cardInfo && cardInfo.type === 'Military' &&
              s.cardId !== 24 && s.cardId !== 25 &&
              !G.aiMovedThisTurn[s.cardId]) {
            var scandBest = null, scandBestGap = -Infinity;
            G.locations.forEach(function (l) {
              if (l.id === loc.id || availableAt(l.id) <= 0) return;
              var gap = _aiLocGap(l.id);
              if (gap > scandBestGap) { scandBestGap = gap; scandBest = l.id; }
            });
            // Only reposition if AI is losing or tied at the destination
            if (scandBest !== null && scandBestGap >= 0) {
              recordMove(s.cardId, loc.id, si, scandBest);
              G.aiMovedThisTurn[s.cardId] = true;
            }
          }
        }
      });
    });

    // ── Giant: Timbuktu Cultural repositioning ───────────────────
    if (isHard) {
      var timbuktuLoc = G.locations.find(function (l) { return l.abilityKey === 'CULTURAL_FREE_MOVE_HERE'; });
      if (timbuktuLoc && _aiLocGap(timbuktuLoc.id) >= 0) {
        G.locations.forEach(function (srcLoc) {
          if (srcLoc.id === timbuktuLoc.id) return;
          G.aiSlots[srcLoc.id].forEach(function (s, si) {
            if (!s || !s.revealed) return;
            if (G.aiMovedThisTurn[s.cardId]) return;
            if (availableAt(timbuktuLoc.id) <= 0) return; // Timbuktu full (incl. intended moves)
            var crd = CARDS.find(function (c) { return c.id === s.cardId; });
            if (!crd || crd.type !== 'Cultural') return;
            // Only pull from a location where AI is comfortably ahead (safe to spare the card)
            if (_aiLocGap(srcLoc.id) > -2) return;
            recordMove(s.cardId, srcLoc.id, si, timbuktuLoc.id);
            G.aiMovedThisTurn[s.cardId] = true;
          });
        });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ADVENTURE-BATTLE MOVEMENTS  (D3a.2)

     The Adventure battles (Otzi / Gilgamesh / D3b Battle 2) run their own
     cloned reveal pipelines that do NOT go through buildRevealSequence, so
     they never picked up the canonical runAiMovements()/aiActionLog path —
     a move-capable AI card (Chariot, id 48) would be played but never moved.

     runAdventureMovements() is the shared, reveal-time movement step those
     battles call after all cards are revealed. It decides + executes the move
     directly via executeMoveAnimated (which fires Chariot's arrival strike),
     then calls onDone. No move-capable card on the board → immediate onDone.
  ═══════════════════════════════════════════════════════════════ */

  // Sum of revealed effective IP for a side at a location.
  function _advLocIP(slots, locId) {
    return (slots[locId] || []).reduce(function (sum, s) {
      return sum + (s && s.revealed ? helpers.effectiveIP(s) : 0);
    }, 0);
  }

  /* Smart Chariot (id 48) destination (D3a.2 ST3). Returns a locId to move to,
     or null to stay put. Move trigger: the current location is already won
     comfortably (so the Chariot is wasted here and can leave without losing
     it), OR a destination's arrival strike would flip a contested location.
     Among candidates, prefer the most strategic strike (highest-IP victim /
     a flip). */
  function _bestChariotDest(G, curLocId, chariotEffIP) {
    var curGap = _advLocIP(G.aiSlots, curLocId) - _advLocIP(G.playerSlots, curLocId);
    // Safe to leave only if we'd still hold the current location after it goes.
    var winningComfortably = curGap >= 2 && (curGap - chariotEffIP) >= 0;

    var best = null;
    G.locations.forEach(function (loc) {
      if (loc.id === curLocId) return;
      if ((G.aiSlots[loc.id] || []).indexOf(null) === -1) return;          // no open slot
      var pCards = (G.playerSlots[loc.id] || []).filter(function (s) { return s && s.revealed; });
      if (!pCards.length) return;                                          // nothing to strike

      var highIP = pCards.reduce(function (m, s) { return Math.max(m, helpers.effectiveIP(s)); }, 0);
      var aiIP   = _advLocIP(G.aiSlots, loc.id);
      var pIP    = _advLocIP(G.playerSlots, loc.id);
      var marginBefore = aiIP - pIP;
      var marginAfter  = (aiIP + chariotEffIP) - (pIP - 1);               // +Chariot, -1 from strike
      var flips = marginBefore < 0 && marginAfter >= 0;

      var score = highIP                          // strike value (reduce a strong card)
                + (flips ? 10 : 0)                // flipping a contested location is big
                + (marginBefore < 0 ? 2 : 0);     // contesting a location we're losing
      if (!best || score > best.score) best = { locId: loc.id, score: score, flips: flips };
    });

    if (!best) return null;
    if (winningComfortably || best.flips) return best.locId;
    return null;                                  // no move meaningfully improves the board
  }

  // Finalize player queued moves (e.g. Lucy). queueMove already placed the card
  // at its destination but left the 'queued-dest' PREVIEW class — which has
  // pointer-events:none (unclickable) and a pulsing glow — and the moveLog entry
  // flagged queued. The cloned adventure reveal never ran the standard move
  // pipeline, so the card stayed "glowing" and unclickable forever. De-preview
  // them here so they become normal, clickable revealed cards.
  function _finalizeAdventurePlayerMoves(G) {
    var any = false;
    (G.moveLog || []).forEach(function (mv) {
      if (!mv.queued) return;
      mv.queued = false; any = true;
      var slots = G.playerSlots[mv.toLocId] || [];
      for (var i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].cardId === mv.cardId) {
          var el = (SOG.board && SOG.board.getSlotEl) ? SOG.board.getSlotEl('player', mv.toLocId, i) : null;
          if (el) el.classList.remove('queued-dest');
          break;
        }
      }
    });
    if (any) { G.locationSnapshots = {}; G.reservedSlotsPerLoc = {}; }
  }

  function runAdventureMovements(onDone) {
    onDone = onDone || function () {};
    var G = SOG.state.G;
    if (!G) { onDone(); return; }

    // Finalize the player's queued moves first (Lucy), then the AI's Chariot.
    _finalizeAdventurePlayerMoves(G);

    if (!SOG.game || typeof SOG.game.executeMoveAnimated !== 'function') { onDone(); return; }

    // Find the AI's revealed Chariot eligible to move:
    //  • once per BATTLE, not per turn — guard via _advChariotMoved, a flag on
    //    the card's slot data (travels with the card when it moves);
    //  • NOT on the turn it was revealed — a card can only be selected to move
    //    on a turn AFTER it enters play. turnPlayed is the play turn; during the
    //    reveal pass G.turn is still that turn, so require G.turn > turnPlayed.
    // Gather ALL eligible Chariots (both twins if a Papyrus copy exists), in
    // location order. We move the FIRST whose decision resolves to a destination
    // — a Chariot that decides to HOLD must NOT block another one that would move
    // this turn (the old first-eligible-only scan let a holder end the pass).
    var eligible = [];
    G.locations.forEach(function (loc) {
      (G.aiSlots[loc.id] || []).forEach(function (s) {
        if (!s || !s.revealed) return;
        if ((s.cardId === 48 || s.cardId === 69) && !s._advChariotMoved &&
            (s.turnPlayed == null || G.turn > s.turnPlayed)) {
          eligible.push({ locId: loc.id, sd: s, cardId: s.cardId });
        }
      });
    });
    if (!eligible.length) { _tryAiBarter(G, onDone); return; }   // no Chariot → still consider a Trader barter

    // Movement decision: the battle's chariotMoveDecision (Narmer weighs the home
    // re-lock) EXCEPT on the FINAL turn — no future plays remain, so the re-lock
    // cost is moot. There we fall through to the generic _bestChariotDest, which
    // still only moves when it's NET-POSITIVE (source safe to leave OR the
    // destination flips), so a won home isn't recklessly abandoned. Non-final
    // turns and battles without a decision fn are unchanged.
    var _mvSettings = G.config && G.config.ai && G.config.ai.settings;
    var _lastTurn   = !!(G.config && G.config.structure && G.config.structure.turns
                         && G.turn >= G.config.structure.turns);
    var _decide = (!_lastTurn && _mvSettings && typeof _mvSettings.chariotMoveDecision === 'function')
      ? function (f) { return _mvSettings.chariotMoveDecision(G, f); }
      : function (f) { return _bestChariotDest(G, f.locId, helpers.effectiveIP(f.sd)); };

    var found = null, dest = null;
    for (var _ei = 0; _ei < eligible.length; _ei++) {
      var _d = _decide(eligible[_ei]);
      if (_d !== null && _d !== undefined) { found = eligible[_ei]; dest = _d; break; }
    }
    if (!found) { _tryAiBarter(G, onDone); return; }   // every eligible Chariot chose to hold

    found.sd._advChariotMoved = true;   // persists with the card → never moves again
    // Pass the exact slot-data object — duplicate-cardId safe (a Papyrus-copied
    // twin Chariots may have already spent its once-per-battle move flag; the
    // sd pins WHICH one moves).
    SOG.game.executeMoveAnimated('opp', found.cardId, found.locId, dest, { sd: found.sd }, function () {
      _tryAiBarter(G, onDone);
    });
  }

  /* Light AI Trader (68) barter (reuses SOG.game.executeBarter, the same queued-
     barter resolution the player's reveal uses). Once per battle per Trader
     (_advTraderBartered), only when swapping the Trader to a location the AI is
     LOSING would FLIP that location to a win — and doing so doesn't surrender a
     location the AI currently holds. No eligible Trader / no flipping swap → no-op. */
  function _tryAiBarter(G, onDone) {
    onDone = onDone || function () {};
    if (!SOG.game || typeof SOG.game.executeBarter !== 'function') { onDone(); return; }

    var trader = null;
    G.locations.forEach(function (loc) {
      (G.aiSlots[loc.id] || []).forEach(function (s, si) {
        if (trader || !s || !s.revealed) return;
        if (s.cardId === 68 && !s._advTraderBartered &&
            (s.turnPlayed == null || G.turn > s.turnPlayed)) {
          trader = { locId: loc.id, idx: si, sd: s };
        }
      });
    });
    if (!trader) { onDone(); return; }

    var tEff  = helpers.effectiveIP(trader.sd);
    var aiT   = _advLocIP(G.aiSlots, trader.locId);
    var pT    = _advLocIP(G.playerSlots, trader.locId);

    var best = null;
    G.locations.forEach(function (loc) {
      if (loc.id === trader.locId) return;
      var aiL = _advLocIP(G.aiSlots, loc.id);
      var pL  = _advLocIP(G.playerSlots, loc.id);
      if (aiL - pL >= 0) return;                       // only interested in locations we're losing
      (G.aiSlots[loc.id] || []).forEach(function (s, si) {
        if (!s || !s.revealed) return;
        var pEff = helpers.effectiveIP(s);
        if (pEff >= tEff) return;                       // swap must raise this location's total
        var marginAfterL = (aiL - pEff + tEff) - pL;    // Trader replaces partner here
        if (marginAfterL < 0) return;                   // must actually flip to a win
        // Don't surrender the Trader's current location if we're currently holding it.
        var marginAfterT = (aiT - tEff + pEff) - pT;
        if (aiT - pT >= 0 && marginAfterT < 0) return;
        if (!best || marginAfterL > best.margin) {
          best = { partnerCardId: s.cardId, locId: loc.id, idx: si, margin: marginAfterL };
        }
      });
    });

    if (!best) { onDone(); return; }
    trader.sd._advTraderBartered = true;
    // Coordinates pin the exact trader + partner slots — duplicate-cardId safe
    // (twin partners can carry diverged ipMods; the scored one must swap).
    SOG.game.executeBarter('opp', trader.sd.cardId, best.partnerCardId, onDone,
                           { traderLocId: trader.locId, traderIdx: trader.idx,
                             partnerLocId: best.locId, partnerIdx: best.idx });
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.ai = {
    runAiSelection: runAiSelection,
    runAiMovements: runAiMovements,
    runAdventureMovements: runAdventureMovements,
    // Shared card-placement heuristics (also used by the per-battle selectors).
    cardTurnBias: cardTurnBias,
    cardLocBias:  cardLocBias
  };

})();

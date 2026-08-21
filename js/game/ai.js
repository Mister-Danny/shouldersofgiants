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
      // Papyrus (54) state-copy inheritance — consume the AI side's pending copy
      // bonus into this play's ipMod (parity with the player's commitPlay).
      var _copyB = (G.copyIPBonus && G.copyIPBonus.opp && G.copyIPBonus.opp[cardId]) || 0;
      if (_copyB) {
        resBonus += _copyB;
        resSources.push({ source: 'Papyrus', delta: _copyB });
        delete G.copyIPBonus.opp[cardId];
      }
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
      // Tier routing (cfg.ai.tier): 'serf' → the shared generic Serf brain (Stage A);
      // 'giant' → the shared Giant brain bound to this boss's signature (Stage B,
      // keyed by scriptHook); otherwise the battle's own bespoke selector.
      var _tier         = (G.config.ai && G.config.ai.tier) || null;
      var _hSelectPlays = (_tier === 'serf')  ? serfSelectPlays
                        : (_tier === 'giant') ? giantSelectPlaysFor(G.config.scriptHook)
                        : _hSettings.selectPlays;
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
      // Papyrus (54) state-copy inheritance — consume the AI side's pending bonus.
      var _ecopyB = (G.copyIPBonus && G.copyIPBonus.opp && G.copyIPBonus.opp[cardId]) || 0;
      if (_ecopyB) {
        resBonus += _ecopyB;
        resSources.push({ source: 'Papyrus', delta: _ecopyB });
        delete G.copyIPBonus.opp[cardId];
      }
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
      case 56: { // Scribe (Egypt) — End of Turn: +1 IP to the owner's OTHER ECONOMIC
                 // cards HERE. Scored exactly like Ziggurat (45) below, the other
                 // "+1 to my own matching type at this location" card: value scales
                 // with how many Economic cards it would actually be paying out to.
                 // A location with none is a guaranteed fizzle, so it WHIFFS (-1)
                 // rather than scoring flat — the Papyrus lesson. (Its previous
                 // ability granted Capital and had NO scorer here at all.)
        var econ = ownIds.filter(function (id) { return typeOf(id) === 'Economic'; }).length;
        if (!econ) return -1;                    // nothing Economic here → dead
        return Math.min(econ, 3) * 1.5;
      }
      case 45: { // Ziggurat — Continuous +1 to OTHER Religious cards here (e.g. Priest).
        var rel = ownIds.filter(function (id) { return typeOf(id) === 'Religious'; }).length;
        return Math.min(rel, 2) * 1.5;
      }
      case 40: // Scribe — stamps +1 on each of the owner's OTHER cards here: go where they are.
        return Math.min(ownIds.length, 3) * 1.5;
      case 54: { // Papyrus (Egypt) — copies the last card the owner played HERE to
                 // hand; worth more when a strong own card is already at THIS location.
                 // LOCATION-SCOPED, tracking the ability itself. It used to read the
                 // whole board, which scored every location identically and so let the
                 // AI drop Papyrus somewhere it had played nothing — a guaranteed
                 // fizzle. Now a location with no own prior play WHIFFS (-1), the same
                 // way Rosetta (58) and Priest (71) below report a dead spot.
                 // `mine` is the owner's slots at locId; tentative plays here count
                 // because Papyrus reveals last (see _giantRevealOrder). Excludes self.
        var bestIP = 0;
        (mine || []).forEach(function (s) {
          if (s && s.revealed && s.cardId !== 54) {
            var cc = CARDS.find(function (x) { return x.id === s.cardId; });
            if (cc && cc.ip > bestIP) bestIP = cc.ip;
          }
        });
        tentative.forEach(function (p) {
          if (p.cardId === 54 || p.locId !== locId) return;
          var cc = CARDS.find(function (x) { return x.id === p.cardId; });
          if (cc && cc.ip > bestIP) bestIP = cc.ip;
        });
        if (bestIP === 0) return -1;        // nothing to copy HERE → whiffs
        return Math.min(bestIP, 5) * 0.4;   // a 5-IP prior play here → +2
      }
      case 58: { // Rosetta Stone (Egypt) — transcribes the card in SLOT 0 here; worth
                 // more when THAT card has a strong ability. RETARGETED: this used to
                 // rank the earliest-PLAYED card here (lowest playTime) and had to be
                 // rewritten with the ability, or it would keep valuing a card Rosetta
                 // no longer copies — the two diverge as soon as anything moves into
                 // slot 0 or a destroy compacts the column.
                 // Reads slots[0] DIRECTLY, not "the first non-null": an empty slot 0
                 // is a real fizzle, and dropping nulls would have hidden it.
                 // STRONG = high-impact copy targets.
        var STRONG = [70, 62, 45, 59, 63, 51, 57, 56, 38, 43, 42, 2];
        var slot0  = (mine || [])[0];
        if (!slot0 || !slot0.revealed || slot0.cardId === 58) return -1;   // nothing to decipher → whiffs
        return STRONG.indexOf(slot0.cardId) !== -1 ? 2 : 0.5;
      }
      case 71: { // Priest (Egypt) — revive a DISCARDED OR DESTROYED card as a Mummy
                 // HERE; worth more when that side has pile entries to revive AND
                 // this location has room. Both piles hold snapshot entries
                 // { cardId, ip, cc }, so rank by the entry's FROZEN ip with Tut's
                 // doubling applied — the actual Mummy the revive would produce.
        var pOwner = side === 'opp' ? 'opp' : 'player';
        var pool   = (SOG.abilities && typeof SOG.abilities.priestCandidates === 'function')
          ? SOG.abilities.priestCandidates(pOwner) : [];
        if (!pool.length) return -1;                       // nothing to revive → whiffs
        var here = (side === 'opp' ? G.aiSlots : G.playerSlots)[locId] || [];
        var tentHere = tentative.filter(function (p) { return p.locId === locId; }).length;
        // Priest occupies one slot HIMSELF and the revived Mummy needs another —
        // require TWO free slots or the revive is a guaranteed fizzle.
        if ((here.filter(function (s) { return s; }).length + tentHere) >= here.length - 1) return -1;
        var revIP = SOG.abilities.resurrectionIP;
        var bestDisc = pool.reduce(function (m, e) { return Math.max(m, revIP(e.cardId, e.ip)); }, 0);
        return 1 + Math.min(bestDisc, 6) * 0.4;            // scales with the best revive available
      }
      case 66: { // Book of the Dead (Egypt) — RANDOM discard + weigh. The discard is no
                 // longer chosen, so holding one IP==CC card is only a 1-in-handSize
                 // shot at the resurrection, not a guarantee: value it by the ODDS
                 // rather than by mere presence (the old `hasEq ? 1.5 : 0` priced a
                 // pick the AI can no longer make). Location matters now too — the
                 // Mummy spawns at BOOK'S location, so a full one can only fizzle.
        var bhand = side === 'opp' ? G.aiHand : G.playerHand;
        if (!bhand || !bhand.length) return 0;              // nothing to discard → inert
        var bhere = (side === 'opp' ? G.aiSlots : G.playerSlots)[locId] || [];
        var bTent = tentative.filter(function (p) { return p.locId === locId; }).length;
        // Book occupies one slot itself; the Mummy needs another or it cannot land.
        if ((bhere.filter(function (s) { return s; }).length + bTent) >= bhere.length - 1) return 0;
        var eqCount = bhand.filter(function (id) { var c = CARDS.find(function (x) { return x.id === id; }); return c && c.ip === c.cc; }).length;
        return 1.5 * (eqCount / bhand.length);              // expected value of a random pick
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

  /* Is this slot's card legally movable RIGHT NOW, in a post-reveal pass?
     Two conditions, and the second is the one that is easy to lose:

       revealed  — face-up on the board at all.
       settled   — NOT the turn it entered play. A card may only be selected to
                   move on a turn AFTER it arrives. turnPlayed is the play turn,
                   and during/after the reveal pass G.turn is STILL that turn,
                   so the test is G.turn > turnPlayed.

     Why this needs to be shared rather than re-derived per caller: in the
     SELECT phase (input.js refreshMoveableCards) `revealed` alone is already
     sufficient, because cards played this turn have not been revealed yet — so
     "revealed" silently means "settled" there. That equivalence BREAKS in a
     post-reveal pass, where this turn's cards are now revealed too. Any
     post-reveal mover that copies the select-phase test therefore grabs
     same-turn cards and performs an illegal move. Both post-reveal movers now
     go through here so the rule is stated once.

     turnPlayed == null → treat as settled (legacy/serialised slot data). */
  /* Can this AI card be moved by a POST-REVEAL movement pass? Two rules, both
     about the card having been committed to before this pass runs:
       • it must be SETTLED — not played this very turn (moving a card the turn it
         lands is an illegal same-turn move);
       • it must not have ALREADY MOVED this turn (sd._movedOnTurn, stamped by
         game.js applyMove / executeBarter). A card relocated during the REVEAL by
         another card's ability — the Merchant's trade move being the live case —
         was not at this location when the AI picked its movements in the selection
         phase, so choosing it now would be a decision made with knowledge the AI
         could not legally have had. One move per card per turn. */
  function _aiSlotMovableNow(G, sd) {
    if (!sd || !sd.revealed) return false;
    if (sd._movedOnTurn === G.turn) return false;
    return sd.turnPlayed == null || G.turn > sd.turnPlayed;
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
    //  • revealed AND settled (not the turn it entered play) — see
    //    _aiSlotMovableNow, which now owns that rule for both post-reveal movers.
    // Gather ALL eligible Chariots (both twins if a Papyrus copy exists), in
    // location order. We move the FIRST whose decision resolves to a destination
    // — a Chariot that decides to HOLD must NOT block another one that would move
    // this turn (the old first-eligible-only scan let a holder end the pass).
    var eligible = [];
    G.locations.forEach(function (loc) {
      (G.aiSlots[loc.id] || []).forEach(function (s) {
        if (!_aiSlotMovableNow(G, s)) return;
        if ((s.cardId === 48 || s.cardId === 69) && !s._advChariotMoved) {
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
        // Same gate as the movers — a barter IS a relocation, so a Trader that has
        // already moved this turn cannot barter on top of it.
        if (s.cardId === 68 && !s._advTraderBartered && _aiSlotMovableNow(G, s)) {
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
     SERF TIER — one shared generic adventure AI (Stage A)
     ───────────────────────────────────────────────────────────────
     A single selectPlays used by ANY adventure battle (routed when
     cfg.ai.tier === 'serf'). Plays by the SAME rules as the player —
     real effectiveCost + the real advance-gate legality check, no
     resource cheating. Deliberately shallow (Stage B "Giant" adds the
     deep per-boss brains):
       • 66/33 capital roll per turn (66%: spend everything; 33%: may
         leave capital / stop at non-positive marginal value).
       • Card choice by a single-turn NET-IP estimate that models the
         effects present in the current AI decks: base IP + continuous/
         at-once/EoT boosts, Soldier (42/70) strikes, and Hammurabi (47)
         destruction. (Chariots/Chariot strike on ARRIVAL only, which the
         Serf never triggers — it does not move cards — so they score as
         bodies.)
       • Placement: turns 1..N-1 RANDOM among legal locations (Soldiers
         seek a location with an opponent card); FINAL turn concentrates
         on the two most-winnable locations.
     No multi-turn setup, hold-back, reveal-order or movement judgment.
  ═══════════════════════════════════════════════════════════════ */
  function _serfCardOf(id) {
    var C = (typeof CARDS !== 'undefined') ? CARDS : [];
    for (var i = 0; i < C.length; i++) if (C[i].id === id) return C[i];
    return null;
  }
  function _serfEffIP(sd) {
    return (SOG.board && SOG.board.effectiveIP) ? SOG.board.effectiveIP(sd)
         : (sd.ip + (sd.ipMod || 0) + (sd.contMod || 0));
  }
  function _serfCC(sd) {
    return (SOG.abilities && SOG.abilities.effectiveCC) ? SOG.abilities.effectiveCC(sd)
         : (sd.cc != null ? sd.cc : ((_serfCardOf(sd.cardId) || {}).cc || 0));
  }
  function _serfAdj(locId) {
    var idx = G.locations.findIndex(function (l) { return l.id === locId; });
    var r = [];
    if (idx > 0)                       r.push(G.locations[idx - 1].id);
    if (idx < G.locations.length - 1)  r.push(G.locations[idx + 1].id);
    return r;
  }
  function _serfHasSphinx(cards) { return cards.some(function (s) { return s && s.cardId === 64; }); }
  function _serfHasKente(cards)  { return cards.some(function (s) { return s && s.cardId === 17; }); }

  /* Single scalar "net-IP value" of the CURRENT board for the AI side: every AI
     card in a slot (revealed OR the face-down plays the selector has placed this
     turn) is treated as in-play, boosts resolved; PLUS the opponent IP the AI's
     own strikes / destruction would remove. Player cards use their live
     effectiveIP (stable — the Serf plans for the current board, not the
     opponent's next move). Sum-based (net IP), per the tactical goal. */
  function _serfValue() {
    var locs = G.locations.map(function (l) { return l.id; });
    var aiByLoc = {}, playerCards = {}, aiTotal = 0, playerRemoved = 0;

    locs.forEach(function (lid) {
      aiByLoc[lid] = (G.aiSlots[lid] || []).filter(Boolean).map(function (s) {
        var c = _serfCardOf(s.cardId);
        return { cardId: s.cardId, type: c ? c.type : '', cc: (c ? c.cc : 0),
                 base: (s.ip != null ? s.ip : (c ? c.ip : 0)),
                 ip: (s.ip != null ? s.ip : (c ? c.ip : 0)) + (s.ipMod || 0),
                 dead: false };
      });
      playerCards[lid] = (G.playerSlots[lid] || []).filter(function (s) { return s && s.revealed; });
    });

    // ── AI boosts (additive onto each entry.ip) ──
    locs.forEach(function (lid) {
      var arr = aiByLoc[lid], loc = G.locations.find(function (l) { return l.id === lid; });
      var has = function (id) { return arr.some(function (e) { return e.cardId === id; }); };
      if (has(41)) arr.forEach(function (e) { if (e.type === 'Labor') e.ip += 1; });                                   // Canals
      if (has(45)) arr.forEach(function (e) { if (e.type === 'Religious' && e.cardId !== 45) e.ip += 1; });            // Ziggurat
      if (has(62)) arr.forEach(function (e) { if ((e.type === 'Religious' || e.type === 'Political') && e.cardId !== 62) e.ip += 2; }); // Hieroglyphics
      var scribes = arr.filter(function (e) { return e.cardId === 40; }).length;                                       // Scribe (Meso) +1 to others
      if (scribes) arr.forEach(function (e) { if (e.cardId !== 40) e.ip += scribes; });
      if (has(49) && arr.some(function (e) { return e.type === 'Cultural' && e.cardId !== 49; })) {                    // Phoenicians (+1 if Cultural host)
        var ph = arr.find(function (e) { return e.cardId === 49; }); if (ph) ph.ip += 1;
      }
      if (has(57)) {                                                                                                   // Pyramid (At Once): gains the last-played card's IP here — approximate with the top co-located other card
        var others = arr.filter(function (e) { return e.cardId !== 57; });
        if (others.length) {
          var topO = others.reduce(function (a, b) { return b.base > a.base ? b : a; });
          var pyr  = arr.find(function (e) { return e.cardId === 57; });
          if (pyr) pyr.ip += topO.base;
        }
      }
      [[44, 2], [32, 1]].forEach(function (pair) {                                                                     // Enkidu +2 / Domesticated Animal +1 (idx-adjacent ~ up to 2 others)
        var bid = pair[0], amt = pair[1];
        if (has(bid)) { var o = arr.filter(function (e) { return e.cardId !== bid; }); for (var i = 0; i < Math.min(2, o.length); i++) o[i].ip += amt; }
      });
      if (has(43)) { var g = arr.find(function (e) { return e.cardId === 43; }); if (g) g.ip += Math.max(0, (G.culturalCount && G.culturalCount.opp) || 0); } // Gilgamesh
      arr.forEach(function (e) { if (e.cardId === 31 || e.cardId === 59) e.ip += 1; });                                // Megalith / Obelisk (EoT +1)
      if (loc && loc.abilityKey === 'LABOR_PLUS_2_HERE')    arr.forEach(function (e) { if (e.type === 'Labor')    e.ip += 2; }); // Euphrates
      if (loc && loc.abilityKey === 'MILITARY_PLUS_1_HERE') arr.forEach(function (e) { if (e.type === 'Military') e.ip += 1; }); // Tigris
    });

    // ── AI Hammurabi (47) destruction: own lowest-CC sacrifice + opp lowest-CC victim ──
    locs.forEach(function (lid) {
      var arr = aiByLoc[lid], pc = playerCards[lid];
      if (!arr.some(function (e) { return e.cardId === 47; })) return;
      if (_serfHasKente(arr) || _serfHasKente(pc)) return;                        // Kente blocks destruction
      var sacs = arr.filter(function (e) { return e.cardId !== 47 && !e.dead; });
      if (!sacs.length || !pc.length) return;                                     // no sacrifice or no victim → no trade
      var sac = sacs.reduce(function (a, b) { return b.cc < a.cc ? b : a; });
      sac.dead = true;                                                            // owner loses the sacrifice's IP
      var vic = pc.reduce(function (a, b) { return _serfCC(b) < _serfCC(a) ? b : a; });
      playerRemoved += _serfEffIP(vic);                                           // opponent loses the victim's IP
    });

    // ── AI Soldier (42/70) strikes: -1 to the opponent at its location ──
    locs.forEach(function (lid) {
      var soldiers = aiByLoc[lid].filter(function (e) { return e.cardId === 42 || e.cardId === 70; }).length;
      var pc = playerCards[lid];
      if (!soldiers || !pc.length || _serfHasSphinx(pc)) return;                  // no target / Sphinx protects
      playerRemoved += Math.min(soldiers, pc.length);                            // each strike ~-1
    });

    // ── Sum AI IP (skip destroyed sacrifices) + Sargon (+3 to each adjacent loc) ──
    locs.forEach(function (lid) {
      aiByLoc[lid].forEach(function (e) {
        if (!e.dead) aiTotal += e.ip;
        if (e.cardId === 37) aiTotal += 3 * _serfAdj(lid).length;                // Sargon adjacent boost (Narmer averaging is sum-neutral → omitted)
      });
    });
    return aiTotal + playerRemoved;
  }

  /* Legal + affordable (card, loc) options for the AI right now — real
     effectiveCost (owner 'ai') + the real advance-gate/flood check
     (isLocationPlayable(loc,'ai')), read against the LIVE board, so any plays the
     selector has already staged into G.aiSlots this turn are reflected (filling a
     home unlocks the next advance-gate location, exactly as at commit time). */
  function _serfLegalOptions(hand, capital, costFree) {
    var opts = [];
    for (var h = 0; h < hand.length; h++) {
      var card = _serfCardOf(hand[h]);
      if (!card) continue;
      var cost = costFree ? 0
        : (SOG.board && SOG.board.effectiveCost ? SOG.board.effectiveCost(card, G.locations[0].id, 'ai') : card.cc);
      // cost can be location-scoped (Imhotep); recomputed per loc below.
      for (var li = 0; li < G.locations.length; li++) {
        var lid = G.locations[li].id;
        var arr = G.aiSlots[lid] || [];
        if (arr.indexOf(null) === -1) continue;                                  // no open slot
        if (SOG.board && SOG.board.isLocationPlayable && !SOG.board.isLocationPlayable(lid, 'ai')) continue; // gate/flood
        var locCost = costFree ? 0
          : (SOG.board && SOG.board.effectiveCost ? SOG.board.effectiveCost(card, lid, 'ai') : card.cc);
        if (locCost > capital) continue;
        opts.push({ cardId: hand[h], locId: lid, cost: locCost, card: card });
      }
    }
    return opts;
  }

  // Stage a face-down play into G.aiSlots (occupancy for the gate; revealed:false
  // so a same-turn Imhotep can't discount — matches the real reveal timing) / undo.
  function _serfStage(cardId, locId) {
    var card = _serfCardOf(cardId);
    var idx = (G.aiSlots[locId] || []).indexOf(null);
    if (idx === -1) return null;
    G.aiSlots[locId][idx] = { cardId: cardId, ip: (card ? card.ip : 0), revealed: false,
                              ipMod: (G.aiCardIPBonus && G.aiCardIPBonus[cardId]) || 0, contMod: 0,
                              ipModSources: [], bonuses: [], _serfStub: true };
    return idx;
  }
  function _serfUnstage(locId, idx) { if (idx != null && G.aiSlots[locId]) G.aiSlots[locId][idx] = null; }
  function _serfClearAllStubs() {
    G.locations.forEach(function (l) {
      var arr = G.aiSlots[l.id] || [];
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i]._serfStub) arr[i] = null;
    });
  }

  /* The two locations the Serf is most likely to WIN (final-turn concentration
     target). Winnability = the PROJECTED margin = current (AI − player) margin
     PLUS what this turn's plays could add here (open AI slots × the average IP of
     the hand). Ranked desc, top 2. This factors in "what its plays can add" so a
     currently-losing-but-fillable location the AI can flip is picked over one it
     can't reach — while an already-won location still ranks high. */
  function _serfTargetLocs(handIPavg) {
    var add = handIPavg > 0 ? handIPavg : 2;
    var scored = G.locations.map(function (l) {
      var aip = (G.aiSlots[l.id] || []).reduce(function (t, s) { return t + (s && s.revealed ? _serfEffIP(s) : 0); }, 0);
      var pip = (G.playerSlots[l.id] || []).reduce(function (t, s) { return t + (s && s.revealed ? _serfEffIP(s) : 0); }, 0);
      var open = (G.aiSlots[l.id] || []).filter(function (s) { return s === null; }).length;
      return { id: l.id, score: (aip - pip) + Math.min(open, 2) * add };   // cap add-potential at ~2 plays/loc
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 2).map(function (s) { return s.id; });
  }

  /* PER-BOSS SERF PRIORITY CARDS — the Serf equivalent of _GIANT_SIGNATURES,
     kept deliberately thinner: just "get this card down as soon as you can
     afford it", no placement or tempo logic. Keyed by scriptHook, so a boss
     without an entry is completely unaffected.

     Hatshepsut (52) is the whole reason this exists: her Trading Queen At Once
     spawns a Merchant, which is her engine — a Serf that sat on her until the
     marginal-IP score happened to favour her was leaving the entire deck's
     point unplayed. Serf gets 5 capital/turn and she costs 5, so this makes
     turn 1 the normal case whenever she is in the opening hand. */
  var _SERF_PRIORITY_CARDS = {
    hatshepsut: { 52: true }
  };
  function _serfPriorityIds() {
    var hook = G.config && G.config.scriptHook;
    return (hook && _SERF_PRIORITY_CARDS[hook]) || null;
  }

  function serfSelectPlays(ctx) {
    var G_ = ctx.G || G;
    if (G_ !== G) return [];   // module-scoped G is canonical
    var turns    = (G.config && G.config.structure && G.config.structure.turns) || 5;
    var _turn    = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;   // engine passes ctx.turn === G.turn
    var lastTurn = _turn >= turns;
    var costFree = !!(G.config && G.config.resource && G.config.resource.model === 'none');
    var perTurnCap = (G.config && G.config.structure && G.config.structure.cardsPerTurn != null)
      ? G.config.structure.cardsPerTurn : Infinity;

    var spendAll = Math.random() < 0.66;   // 66% commit-everything vs 33% may leave capital
    var hand    = (ctx.hand || G.aiHand).slice();
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : 0;

    _serfClearAllStubs();                  // defensive: no stale stubs
    var _handIPavg = hand.length
      ? hand.reduce(function (s, id) { var c = _serfCardOf(id); return s + (c ? c.ip : 0); }, 0) / hand.length : 2;
    var plays = [], staged = [], targetLocs = lastTurn ? _serfTargetLocs(_handIPavg) : null;
    var rng = function (n) { return Math.floor(Math.random() * n); };

    for (var guard = 0; guard < 12 && plays.length < perTurnCap; guard++) {
      if (!hand.length) break;
      if (!costFree && capital <= 0) break;

      var opts = _serfLegalOptions(hand, capital, costFree);
      if (!opts.length) break;

      // Score each distinct CARD by its best marginal net-IP value (evaluated at
      // its best legal location — so strike/synergy cards get proper credit).
      var baseVal = _serfValue();
      var byCard = {};
      opts.forEach(function (o) {
        var idx = _serfStage(o.cardId, o.locId);
        var marginal = _serfValue() - baseVal;
        _serfUnstage(o.locId, idx);
        var cur = byCard[o.cardId];
        if (!cur || marginal > cur.marginal) byCard[o.cardId] = { cardId: o.cardId, marginal: marginal, cost: o.cost, card: o.card };
      });
      var cards = Object.keys(byCard).map(function (k) { return byCard[k]; });
      cards.sort(function (a, b) { return b.marginal - a.marginal; });
      var pick = cards[0];
      // Serf carelessness knob: 15% of the time, ignore the greedy best and pick a
      // RANDOM affordable card instead. Injects suboptimal plays so the Serf reads as a
      // little dumber / less predictable. (Placement is already random on turns 1..N-1;
      // this adds randomness to WHICH card is played.) Bump the 0.15 to tune.
      if (cards.length > 1 && Math.random() < 0.15) pick = cards[rng(cards.length)];
      /* Priority card jumps the queue — including past the carelessness roll
         above, which would otherwise skip her ~15% of the time. `cards` only
         holds AFFORDABLE options (built from _serfLegalOptions), so reaching
         here at all means she can be paid for right now. */
      var _prio = _serfPriorityIds();
      if (_prio) {
        for (var pi = 0; pi < cards.length; pi++) {
          if (_prio[cards[pi].cardId]) { pick = cards[pi]; break; }
        }
      }
      // 33% path: stop once the best play no longer improves net IP (may leave capital).
      if (!spendAll && pick.marginal <= 0) break;

      // Choose the placement location among this card's LEGAL locs.
      var legalLocs = opts.filter(function (o) { return o.cardId === pick.cardId; }).map(function (o) { return o.locId; });
      var isSoldier = (pick.cardId === 42 || pick.cardId === 70);
      var chosen;
      if (lastTurn) {
        // Concentrate on the two most-winnable locations (fall back to any legal).
        var inTargets = legalLocs.filter(function (l) { return targetLocs.indexOf(l) !== -1; });
        var pool = inTargets.length ? inTargets : legalLocs;
        // Within the pool, place where this card's marginal value is highest.
        var best = null;
        pool.forEach(function (l) {
          var ix = _serfStage(pick.cardId, l); var v = _serfValue(); _serfUnstage(l, ix);
          if (!best || v > best.v) best = { l: l, v: v };
        });
        chosen = best ? best.l : pool[rng(pool.length)];
      } else if (isSoldier) {
        // Seek a location that has an opponent card to strike; else random legal.
        var withTarget = legalLocs.filter(function (l) {
          return (G.playerSlots[l] || []).some(function (s) { return s && s.revealed; });
        });
        chosen = (withTarget.length ? withTarget : legalLocs)[rng(withTarget.length || legalLocs.length)];
      } else {
        chosen = legalLocs[rng(legalLocs.length)];   // turns 1..N-1 random placement
      }

      var sidx = _serfStage(pick.cardId, chosen);
      if (sidx == null) break;                        // slot vanished (shouldn't happen)
      staged.push({ locId: chosen, idx: sidx });
      plays.push({ cardId: pick.cardId, locId: chosen });
      hand.splice(hand.indexOf(pick.cardId), 1);      // one instance
      if (!costFree) capital -= pick.cost;
    }

    _serfClearAllStubs();   // remove all staged stubs — the engine commits the returned plays for real
    return plays;
  }

  /* ═══════════════════════════════════════════════════════════════
     GIANT TIER (Stage B) — Serf + shared upgrades + per-boss signature
     ───────────────────────────────────────────────────────────────
     The Giant is the DEEP tier. It INHERITS the Serf's entire tactical
     foundation (the _serf* helpers: legal-play enumeration, single-turn
     net-IP-with-abilities evaluation, strike/destruction modelling,
     win-target selection) and layers on the SHARED GIANT UPGRADES that
     EVERY boss inherits, then a thin PER-BOSS SIGNATURE on top:

       serf logic ─▶ shared giant upgrades ─▶ per-boss signature

     SHARED GIANT UPGRADES (every Giant, reusable across all five bosses):
       1. Always commits fully — no 33% hold-back (spendAll is always on).
       2. Positional play on the LAST TWO turns (Serf: only the last) — the
          Giant concentrates on its two most-winnable locations one turn
          earlier, buying an extra turn of endgame setup.
       3. Multi-turn setup — rewards playing recurring/aura/growth cards
          EARLY (value ≈ per-turn effect × turns they will still pay off),
          so setup goes down before the cards that benefit (_giantSetupBonus).
       4. Reveal-order optimisation — sequences the returned plays so
          discounts/auras reveal before beneficiaries and grabbers
          (Papyrus/Pyramid) reveal last (_giantRevealOrder).
       5. Movement judgment — the Giant repositions movers (Chariot/Trader)
          via the existing reveal-time runAdventureMovements, which game.js
          now gates OFF for the Serf tier (Serf leaves movers in place).

     PER-BOSS SIGNATURE (thin, declarative — see _GIANT_SIGNATURES):
       holdForEndgame : cardIds held out of the pool until the positional
                        (last-two) turns.
       preferType     : a card TYPE the Giant favours on ties (epsilon nudge).
       cardBias(id,ctx): optional fn for richer future-boss preferences.
  ═══════════════════════════════════════════════════════════════ */

  /* Cards whose value RECURS (auras / growth / discount / resource) — playing
     them earlier compounds. Value ≈ per-turn recurring IP the card confers; the
     Giant adds (value × turns-still-remaining, capped) as a setup bonus so a
     low-immediate-IP aura still outranks a marginally bigger body early. Reusable
     across bosses; extend as new setup cards enter the boss decks. */
  var _GIANT_SETUP_CARDS = {
    40: 1.5,  // Scribe        — +1 IP to the owner's other cards here
    41: 1,    // Canals        — +1 to Labor here
    45: 1,    // Ziggurat      — +1 to Religious here
    44: 3,    // Enkidu        — +2 to up to two adjacent others here
    62: 2,    // Hieroglyphics — +2 to Religious/Political here
    31: 1,    // Megalith      — End of Turn +1
    59: 1,    // Obelisk       — End of Turn +1
    65: 1,    // Imhotep       — global -1 CC to Scientific (resource setup)
    2:  1     // Scholar-Officials — +capital next turn (resource setup)
  };
  function _giantSetupBonus(cardId, turnsLeft, positional) {
    if (positional) return 0;                                   // endgame → play for the win now
    var w = _GIANT_SETUP_CARDS[cardId] || 0;
    if (!w) return 0;
    return w * Math.min(Math.max(0, turnsLeft - 1), 2);         // horizon-capped lookahead
  }

  /* AI margin at a location = AI presence (revealed cards AND cards staged this
     turn) minus the player's revealed IP there. Used by the positional placement
     to spread onto the target loc the AI is LEAST ahead at, securing a 2nd win. */
  function _giantLocMargin(lid) {
    var aip = (G.aiSlots[lid] || []).reduce(function (t, s) { return t + (s ? _serfEffIP(s) : 0); }, 0);
    var pip = (G.playerSlots[lid] || []).reduce(function (t, s) { return t + (s && s.revealed ? _serfEffIP(s) : 0); }, 0);
    return aip - pip;
  }

  /* ── Shared Giant tactical helpers, used by the per-boss signatures below ────
     All read the LIVE board (revealed cards + stubs staged this turn), so a
     signature sees the plays the Giant has already committed this turn. Defined in
     module scope so every boss's signature reuses them (no per-boss duplication). */

  // Middle location of a flat board — Sargon's +3 hits BOTH flanks from here; the
  // flood-safe Babylon sits here in Neb's battle.
  function _giantCenterLoc() {
    var n = G.locations.length;
    return n ? G.locations[Math.floor(n / 2)].id : null;
  }
  function _giantHasOpen(lid) {
    var arr = G.aiSlots[lid] || [];
    for (var i = 0; i < arr.length; i++) if (!arr[i]) return true;
    return false;
  }
  function _giantCenterOpen() { var c = _giantCenterLoc(); return c != null && _giantHasOpen(c); }

  // River locations (LABOR_PLUS_2_HERE / MILITARY_PLUS_1_HERE) can FLOOD on turns
  // 3-5 in Neb's battle — risky to over-commit to late.
  function _giantIsRiverLoc(lid) {
    var loc = G.locations.find(function (l) { return l.id === lid; });
    return !!(loc && (loc.abilityKey === 'LABOR_PLUS_2_HERE' || loc.abilityKey === 'MILITARY_PLUS_1_HERE'));
  }

  // Location of an AI card (revealed OR staged this turn), or null.
  function _giantFindAiCardLoc(cardId) {
    for (var i = 0; i < G.locations.length; i++) {
      var lid = G.locations[i].id, arr = G.aiSlots[lid] || [];
      for (var j = 0; j < arr.length; j++) if (arr[j] && arr[j].cardId === cardId) return lid;
    }
    return null;
  }

  // Among `locs`, the one the AI is LEAST ahead at (spread to secure locations).
  function _giantLeastAheadLoc(locs) {
    var best = null;
    locs.forEach(function (l) { var m = _giantLocMargin(l); if (!best || m < best.m) best = { l: l, m: m }; });
    return best ? best.l : (locs.length ? locs[0] : null);
  }

  // Among `locs`, the one holding the AI's single biggest card — Pyramid/Papyrus
  // want to land BEHIND a big card so they grab a large IP.
  function _giantLocWithBiggestAiCard(locs) {
    var best = null;
    locs.forEach(function (l) {
      var top = (G.aiSlots[l] || []).reduce(function (t, s) { return Math.max(t, s ? _serfEffIP(s) : 0); }, 0);
      if (!best || top > best.top) best = { l: l, top: top };
    });
    return best && best.top > 0 ? best.l : null;
  }

  // Hammurabi (47) resolves at HIS location, destroying the opponent's lowest-CC
  // revealed card AND the AI's own lowest-CC non-Hammurabi card. His ability does
  // NOTHING unless the AI already has an own card there to sacrifice (his cc is the
  // whole turn's capital, so the sacrifice must be a prior-turn card, not a same-turn
  // bait). NET value of striking here = victim IP − own sacrifice IP, so the Giant
  // targets a loc where it holds a CHEAP throwaway and the player holds a fat victim.
  // -Infinity when there's no victim, no own sacrifice, or Kente 17 shields the loc.
  function _giantHamNetAt(lid) {
    var pc = (G.playerSlots[lid] || []).filter(function (s) { return s && s.revealed; });
    var ai = (G.aiSlots[lid] || []).filter(Boolean);
    if (!pc.length) return -Infinity;
    if (_serfHasKente(ai) || _serfHasKente(pc)) return -Infinity;
    var sacs = ai.filter(function (s) { return s.cardId !== 47; });
    if (!sacs.length) return -Infinity;                                     // no sacrifice → ability whiffs
    var sac = sacs.reduce(function (a, b) { return _serfCC(b) < _serfCC(a) ? b : a; });
    var vic = pc.reduce(function (a, b) { return _serfCC(b) < _serfCC(a) ? b : a; });
    return _serfEffIP(vic) - _serfEffIP(sac);
  }
  function _giantBestHamLoc() {
    var best = { loc: null, net: -Infinity };
    G.locations.forEach(function (l) { var n = _giantHamNetAt(l.id); if (n > best.net) best = { loc: l.id, net: n }; });
    return best;
  }
  var _GIANT_HAM_MIN_NET = 2;   // below this: no worthwhile trade (player low-value / no cheap sacrifice) → hold

  // AI is "lopsided" when it holds a real lead at one location but is winning fewer
  // than two — Narmer's averaging then spreads that surplus into a 2-location win.
  function _giantAiLopsided() {
    var margins = G.locations.map(function (l) { return _giantLocMargin(l.id); });
    var winning = margins.filter(function (m) { return m > 0; }).length;
    var maxM = margins.reduce(function (a, b) { return Math.max(a, b); }, -Infinity);
    return winning < 2 && maxM >= 4;
  }

  /* Signature tiebreak: a small nudge toward the boss's preferred TYPE. Kept
     epsilon-sized so it only decides genuine ties, never overrides real value. */
  function _giantTypeBias(cardId, preferType) {
    if (!preferType) return 0;
    var c = _serfCardOf(cardId);
    return (c && c.type === preferType) ? 0.25 : 0;
  }

  /* ── MERCHANT TRADE-ENGINE MODEL (shared helper) ──────────────────────────
     The evaluator (_serfValue) hand-models synergies as a whitelist of
     if(has(id)) clauses and has no concept of a REACTIVE trigger, of card
     TYPE beyond the few it names, or of CIVILIZATION. So the Merchant combo
     is invisible to it. Rather than teach _serfValue — which the Serf shares,
     and which we want to stay simple — the value is computed here and fed in
     through the Giant-only sig.playBias seam.

     Faithful to abilityMerchantTrade, in its order:
       0. FIZZLE FIRST. The real ability resolves randomOtherOpenLoc BEFORE
          awarding anything; with no other open slot on our side the entire
          trigger aborts — no +1, no cross-civ. So the combo is worth ZERO on
          a sealed board, and this guard has to come first here too.
       1. +1 IP to the Merchant, unconditional once past the fizzle.
       2. +1 IP to the PLAYED CARD, only when the civs differ
          (civOf = civilization || civ || era). Merchant is Egypt, so among
          her Economic cards only Purple Dye (75, Mesopotamia) pays this.
       3. The Merchant then MOVES to a RANDOM open location — we cannot pick
          it, so the destination bonus is modelled as an EXPECTATION over the
          open locations (Punt MOVE_HERE_IP +1 now; Thebes MOVE_HERE_CAPITAL
          +1 capital next turn, worth ~nothing on the final turn).

     Returns 0 for any board/card that isn't the combo, so it is safe to add
     unconditionally to a play's score. */
  var MERCHANT_CARD_ID = 76;
  function _aiCivOf(card) {
    if (!card) return null;
    return card.civilization || card.civ || card.era || null;
  }
  function _aiMerchantAt(locId) {
    return (G.aiSlots[locId] || []).some(function (s) {
      return s && s.cardId === MERCHANT_CARD_ID;
    });
  }
  /* Open AI slot at some location OTHER than locId — the real fizzle test. */
  function _aiHasOpenElsewhere(locId) {
    for (var i = 0; i < G.locations.length; i++) {
      var lid = G.locations[i].id;
      if (lid === locId) continue;
      if (_giantHasOpen(lid)) return true;
    }
    return false;
  }
  function _merchantComboValue(cardId, locId, turnsLeft) {
    var card = _serfCardOf(cardId);
    if (!card || card.type !== 'Economic') return 0;      // only Economic plays trigger it
    if (cardId === MERCHANT_CARD_ID) return 0;            // the Merchant landing is not itself a trigger
    if (!_aiMerchantAt(locId)) return 0;                  // no Merchant here → nothing to trigger
    if (!_aiHasOpenElsewhere(locId)) return 0;            // FIZZLE — the ability aborts before paying out

    var v = 1;                                            // (1) Merchant's own +1
    var mCard = _serfCardOf(MERCHANT_CARD_ID);
    var myCiv = _aiCivOf(mCard), theirCiv = _aiCivOf(card);
    if (myCiv && theirCiv && myCiv !== theirCiv) v += 1;   // (2) cross-civ → +1 to the played card

    // (3) expected value of the Merchant's forced random relocation.
    var opens = [], i;
    for (i = 0; i < G.locations.length; i++) {
      var l = G.locations[i];
      if (l.id === locId || !_giantHasOpen(l.id)) continue;
      opens.push(l);
    }
    if (opens.length) {
      var sum = 0;
      for (i = 0; i < opens.length; i++) {
        if (opens[i].abilityKey === 'MOVE_HERE_IP') sum += 1;
        else if (opens[i].abilityKey === 'MOVE_HERE_CAPITAL') sum += (turnsLeft > 1 ? 0.5 : 0);  // capital next turn is worthless on the last turn
      }
      v += sum / opens.length;
    }
    return v;
  }

  /* Reveal-order key (lower = revealed earlier). Discounts + type-auras fire
     first so the cards they boost are cheaper / bigger when they land; grabbers
     (Papyrus 54 / Pyramid 57, which read the LAST-played card here) go last so
     they capture the fully-built board. Reused for every Giant. */
  function _giantRevealOrder(cardId) {
    if (cardId === 65) return 0;                                // Imhotep discount — earliest
    if (cardId === 62 || cardId === 41 || cardId === 45 || cardId === 40) return 1;  // type auras
    if (cardId === 47) return 7;                                // Hammurabi — AFTER the bait body, so his destruction sacrifices it
    if (cardId === 57) return 8;                                // Pyramid — grabs the built board → late
    if (cardId === 54) return 9;                                // Papyrus — AFTER Pyramid, so it copies the buffed Pyramid
    if (cardId === 58) return 10;                               // Rosetta — transcribes the SLOT-0 card, which must already be REVEALED; last of the grabbers
    return 4;
  }

  /* Per-boss signatures — the ONLY per-boss surface. Each is a thin object of
     optional hooks the shared brain calls; the deep behaviour (Serf tactics + the
     five Giant upgrades) lives entirely in the shared layer above and is NOT
     re-implemented here. Hook shapes:
       holdForEndgame : [cardId]                      static hold until turns 4-5
       preferType     : 'Cultural'|...                epsilon tiebreak toward a type
       cardBias(id, ctx) → number                     nudge WHICH card is picked
       holdCard(id, ctx) → bool                       dynamic hold (skip non-final turns)
       choosePlacement(id, legalLocs, ctx) → locId    override WHERE it lands (null = default)
     Placement/hold hooks call the shared _giant* helpers above — no duplication. */
  var _GIANT_SIGNATURES = {

    // GILGAMESH — gentlest Giant: hold Gilgamesh-the-card for the endgame + a light
    // Cultural tiebreak.
    gilgamesh: { holdForEndgame: [43], preferType: 'Cultural' },

    // SARGON — land Sargon (37) in the CENTRE (his +3 then hits BOTH flanks), then
    // reinforce the flanks he is boosting.
    sargon: {
      cardBias: function (cardId) { return (cardId === 37 && _giantCenterOpen()) ? 3 : 0; },  // grab centre while open
      choosePlacement: function (cardId, legalLocs) {
        var center = _giantCenterLoc();
        if (cardId === 37 && center != null && legalLocs.indexOf(center) !== -1) return center;
        var sLoc = _giantFindAiCardLoc(37);                                                     // Sargon already down → feed his flanks
        if (sLoc != null) {
          var adj = _serfAdj(sLoc).filter(function (l) { return legalLocs.indexOf(l) !== -1; });
          if (adj.length) return _giantLeastAheadLoc(adj);
        }
        return null;
      }
    },

    // HAMMURABI — play him where his destruction takes the most (opp lowest-CC victim
    // IP − own lowest-CC sacrifice IP); hold when no location pays off; and drop a
    // cheap low-IP card at his location as the intended (forced) sacrifice.
    hammurabi: {
      // Play Hammurabi at the location with the best net trade (fat player victim −
      // own cheap sacrifice already sitting there); hold on non-final turns when no
      // location pays off (player all low-value, or no cheap sacrifice yet in place).
      holdCard: function (cardId) { return cardId === 47 && _giantBestHamLoc().net < _GIANT_HAM_MIN_NET; },
      choosePlacement: function (cardId, legalLocs) {
        if (cardId === 47) {
          var b = _giantBestHamLoc();
          return (b.loc != null && legalLocs.indexOf(b.loc) !== -1) ? b.loc : null;
        }
        // Self-sacrifice setup: seed a cheap low-IP card at the location Hammurabi
        // WILL strike (its net-best loc) so a throwaway is waiting there next turn.
        var c = _serfCardOf(cardId);
        if (c && c.cc <= 2 && c.ip <= 2) {
          var target = _giantBestHamLoc().loc;
          if (target == null) target = _giantFindAiCardLoc(47);   // or beside a Hammurabi already down
          if (target != null && legalLocs.indexOf(target) !== -1) return target;
        }
        return null;
      }
    },

    // NEBUCHADNEZZAR — play Neb (50) ASAP to switch on the −1 CC discount, then let
    // the shared always-spend-capital upgrade flood the cheapened hand; dodge the
    // flood-risky rivers on turns 3+.
    'hanging-gardens': {
      cardBias: function (cardId, ctx) {
        if (cardId !== 50) return 0;
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        return t <= 2 ? 5 : 2;
      },
      choosePlacement: function (cardId, legalLocs, ctx) {
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        if (t < 3) return null;                              // no flood risk turns 1-2
        // Flood only BLOCKS new plays (cards already down are safe) and alternates
        // rivers each turn, so rivers stay winnable — just cap EXPOSURE: once the AI
        // holds 2+ cards on rivers, steer further cards to a flood-safe loc rather
        // than over-committing to a basket a flood could lock next turn.
        var riverCards = 0;
        G.locations.forEach(function (l) { if (_giantIsRiverLoc(l.id)) riverCards += (G.aiSlots[l.id] || []).filter(Boolean).length; });
        if (riverCards >= 2) {
          var safe = legalLocs.filter(function (l) { return !_giantIsRiverLoc(l); });
          if (safe.length) return _giantLeastAheadLoc(safe);
        }
        return null;                                         // else let the shared positional spread choose
      }
    },

    // NARMER — Imhotep early (discount); Pyramid/Papyrus land BEHIND big cards (grab
    // large IP → Papyrus copies the buffed Pyramid, reveal-ordered after it); Narmer
    // → Memphis (contested) when the AI is lopsided (averaging spreads the lead);
    // cheap cards fill home, premiums push forward (the advance-board insight).
    narmer: {
      cardBias: function (cardId, ctx) {
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        return (cardId === 65 && t <= 2) ? 3 : 0;
      },
      choosePlacement: function (cardId, legalLocs) {
        var gate = (G.config && G.config.rules && G.config.rules.advanceGate) || {};
        var contested = gate.contested, aiHome = gate.aiHome;
        if (cardId === 51 && contested != null && legalLocs.indexOf(contested) !== -1 && _giantAiLopsided()) return contested;
        if (cardId === 57 || cardId === 54) {
          var big = _giantLocWithBiggestAiCard(legalLocs);
          if (big != null) return big;
        }
        var c = _serfCardOf(cardId);
        if (c) {
          if (c.ip <= 2 && aiHome != null && legalLocs.indexOf(aiHome) !== -1) return aiHome;             // cheap → fill home
          if (c.ip >= 4 && contested != null && legalLocs.indexOf(contested) !== -1) return contested;    // premium → forward
        }
        return null;
      }
    },

    /* HATSHEPSUT — the TRADE ENGINE. Her deck is not a pile of bodies; it is
       Merchants plus Economic payloads, and the audit showed the generic Giant
       played it backwards (Hatshepsut on turn 4, Economic cards down BEFORE the
       Merchant, engine triggered zero times in a whole battle).

       Three jobs, in dependency order:
         1. Get a Merchant onto the board — Hatshepsut herself is the cheapest
            route because her At Once SPAWNS one free.
         2. Never play the payload before the engine — the trigger is
            onCardLandedHere, so the Merchant must already be standing there.
         3. Feed Economic cards onto Merchant locations, preferring the
            different-civilization one (Purple Dye 75 is her ONLY non-Egypt
            Economic card, so it is the single best payload she owns).
       The value math lives in _merchantComboValue so it stays faithful to the
       real ability (fizzle-first, cross-civ, random relocation). */
    hatshepsut: {
      /* 8%, against the Serf's 15%. Lower on purpose: hers is the closest thing
         to a COMBO deck — Merchant, then Economic onto it, then cross-civ, then
         the movement payoff, each step depending on the last — so a single
         careless pick derails a chain rather than costing one card's points.
         The felt disruption of 8% here is about the same as 15% on the other
         bosses' linear "put up points" decks. */
      carelessness: 0.08,

      cardBias: function (cardId, ctx) {
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        var turns = (G.config && G.config.structure && G.config.structure.turns) || 5;
        var hand = ctx.hand || [];

        // (1) Hatshepsut ASAP — a free Merchant is worth more than any body she
        //     could play instead, and every turn she waits is a turn the engine
        //     is not running. Only while she is not already down.
        if (cardId === 52 && _giantFindAiCardLoc(52) == null) return 5;

        // (2) A Merchant is worth playing in PROPORTION to the payloads still
        //     in hand — it is a converter, worthless with nothing to convert.
        if (cardId === MERCHANT_CARD_ID) {
          var payloads = 0;
          hand.forEach(function (id) {
            var c = _serfCardOf(id);
            if (c && c.type === 'Economic' && id !== MERCHANT_CARD_ID) payloads++;
          });
          if (!payloads) return 0;
          // Late Merchants have no turns left to be fed — taper with the clock.
          return Math.min(payloads, 3) * (t < turns ? 1.5 : 0.5);
        }
        return 0;
      },

      /* Per-(card, location): the actual combo value of landing THIS Economic
         card at THIS location. Zero everywhere it is not the combo, so it only
         ever breaks ties toward the engine. */
      playBias: function (cardId, locId, ctx) {
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        var turns = (G.config && G.config.structure && G.config.structure.turns) || 5;
        return _merchantComboValue(cardId, locId, Math.max(0, turns - t + 1));
      },

      /* playBias steers WHICH card is picked, but the shared default placement
         ranks locations by marginal board value alone and would happily drop the
         payload somewhere with no Merchant. So the placement has to agree with
         the scoring: send Economic cards to the Merchant, and put Merchants
         where a payload can still follow them. */
      choosePlacement: function (cardId, legalLocs, ctx) {
        var t = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
        var turns = (G.config && G.config.structure && G.config.structure.turns) || 5;
        var turnsLeft = Math.max(0, turns - t + 1);
        var card = _serfCardOf(cardId);
        if (!card) return null;

        // Economic payload → the legal location where the combo pays most.
        if (card.type === 'Economic' && cardId !== MERCHANT_CARD_ID) {
          var best = null, bestV = 0;
          legalLocs.forEach(function (lid) {
            var v = _merchantComboValue(cardId, lid, turnsLeft);
            if (v > bestV) { bestV = v; best = lid; }
          });
          if (best != null) return best;
        }

        // A Merchant wants a location that will still have ROOM for a payload
        // after it lands — otherwise the engine has nowhere to be fed.
        if (cardId === MERCHANT_CARD_ID) {
          var roomy = legalLocs.filter(function (lid) {
            return (G.aiSlots[lid] || []).filter(function (s) { return s === null; }).length >= 2;
          });
          if (roomy.length) return _giantLeastAheadLoc(roomy);
        }
        return null;
      }
    }
  };

  /* The shared Giant brain. Mirrors serfSelectPlays' loop but applies the five
     shared upgrades + the supplied per-boss signature. Leaves serfSelectPlays
     untouched, so Serf-tier play is unchanged. */
  function _giantSelectPlays(ctx, sig) {
    sig = sig || {};
    var G_ = ctx.G || G;
    if (G_ !== G) return [];
    var turns    = (G.config && G.config.structure && G.config.structure.turns) || 5;
    var _turn    = (typeof ctx.turn === 'number') ? ctx.turn : G.turn;
    var costFree = !!(G.config && G.config.resource && G.config.resource.model === 'none');
    var perTurnCap = (G.config && G.config.structure && G.config.structure.cardsPerTurn != null)
      ? G.config.structure.cardsPerTurn : Infinity;
    var turnsLeft  = Math.max(1, turns - _turn + 1);

    // UPGRADE 1: always commit fully (no 33% hold-back).
    // UPGRADE 2: positional on the LAST TWO turns (Serf concentrates only on the last).
    var positional = _turn >= turns - 1;

    var hand    = (ctx.hand || G.aiHand).slice();
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : 0;

    // SIGNATURE: hold cards out of this turn's pool —
    //   • holdForEndgame (static): held until the positional window (turns 4-5).
    //   • holdCard(id,ctx)  (dynamic): held on any NON-final turn (e.g. Hammurabi
    //     waits for a worthwhile victim); the final turn always plays (use it or
    //     lose it). Never stall a whole turn on holds — if the ONLY cards are held,
    //     release them this turn.
    var lastTurn = _turn >= turns;
    var holdSet  = sig.holdForEndgame || [];
    if (holdSet.length || typeof sig.holdCard === 'function') {
      var _filtered = hand.filter(function (id) {
        if (!positional && holdSet.indexOf(id) !== -1) return false;
        if (!lastTurn && typeof sig.holdCard === 'function' && sig.holdCard(id, ctx)) return false;
        return true;
      });
      if (_filtered.length > 0) hand = _filtered;
    }

    _serfClearAllStubs();
    var _handIPavg = hand.length
      ? hand.reduce(function (s, id) { var c = _serfCardOf(id); return s + (c ? c.ip : 0); }, 0) / hand.length : 2;
    var plays = [], targetLocs = positional ? _serfTargetLocs(_handIPavg) : null;
    var rng = function (n) { return Math.floor(Math.random() * n); };

    for (var guard = 0; guard < 12 && plays.length < perTurnCap; guard++) {
      if (!hand.length) break;
      if (!costFree && capital <= 0) break;

      var opts = _serfLegalOptions(hand, capital, costFree);
      if (!opts.length) break;

      // Score each distinct CARD by best-location marginal net-IP PLUS the Giant's
      // setup lookahead and the signature tiebreak. 'adj' ranks; 'marginal' still
      // drives placement so a card lands where it is tactically best.
      var baseVal = _serfValue();
      var byCard = {};
      opts.forEach(function (o) {
        var idx = _serfStage(o.cardId, o.locId);
        var marginal = _serfValue() - baseVal;
        _serfUnstage(o.locId, idx);
        /* sig.playBias is per-(card, LOCATION), unlike cardBias which is
           per-card. Needed for combos whose value depends on WHERE the card
           lands (the Merchant trigger: "Purple Dye is worth more at Thebes
           because my Merchant is standing there"). Signatures without it add
           +0, so every other boss is byte-identical. */
        var adj = marginal
                + _giantSetupBonus(o.cardId, turnsLeft, positional)
                + _giantTypeBias(o.cardId, sig.preferType)
                + (typeof sig.cardBias === 'function' ? (sig.cardBias(o.cardId, ctx) || 0) : 0)
                + (typeof sig.playBias === 'function' ? (sig.playBias(o.cardId, o.locId, ctx) || 0) : 0);
        var cur = byCard[o.cardId];
        if (!cur || adj > cur.adj) byCard[o.cardId] = { cardId: o.cardId, adj: adj, marginal: marginal, cost: o.cost, card: o.card };
      });
      var cards = Object.keys(byCard).map(function (k) { return byCard[k]; });
      cards.sort(function (a, b) { return b.adj - a.adj; });
      var pick = cards[0];
      /* SIGNATURE CARELESSNESS — identical mechanism to the Serf's roll (see
         serfSelectPlays): at each card-pick decision point, replace the greedy
         best with a UNIFORMLY RANDOM affordable card. Not a skip — the Giant
         still commits a play, just not the right one.

         Opt-in per boss via sig.carelessness, so a signature that omits it is
         byte-identical to before (the other four Giants keep their own tuning
         and stay at full strength). Applied uniformly, deliberately NOT weighted
         to protect setup plays: fumbling a setup play occasionally is the point,
         and on a combo deck that is exactly where the softness should land. */
      if (sig.carelessness && cards.length > 1 && Math.random() < sig.carelessness) {
        pick = cards[rng(cards.length)];
      }
      // UPGRADE 1: the Giant always commits (no marginal<=0 early-stop) — it fills
      // the board every turn. (costFree bosses like Gilgamesh have no capital gate.)

      var legalLocs = opts.filter(function (o) { return o.cardId === pick.cardId; }).map(function (o) { return o.locId; });
      var isSoldier = (pick.cardId === 42 || pick.cardId === 70);
      var chosen = null;
      // SIGNATURE placement override (Sargon centre, Hammurabi target, Neb river-dodge,
      // Narmer combo/home-fill). Must return a loc in legalLocs; null → shared default.
      if (typeof sig.choosePlacement === 'function') {
        var _sc = sig.choosePlacement(pick.cardId, legalLocs, ctx);
        if (_sc != null && legalLocs.indexOf(_sc) !== -1) chosen = _sc;
      }
      // Shared default placement — ONLY when the signature didn't already choose.
      if (chosen == null) {
        if (positional) {
          // Concentrate on the two most-winnable locations — but SPREAD across them to
          // actually SECURE two locations for the most-locations win, rather than
          // over-stacking one (which the Serf's pure IP-sum placement tends to do).
          // Prefer the target loc the AI is LEAST ahead at (counting cards already
          // staged this turn); tiebreak by this card's marginal board value there.
          var inTargets = legalLocs.filter(function (l) { return targetLocs.indexOf(l) !== -1; });
          var pool = inTargets.length ? inTargets : legalLocs;
          var best = null;
          pool.forEach(function (l) {
            var m = _giantLocMargin(l);
            var ix = _serfStage(pick.cardId, l); var v = _serfValue(); _serfUnstage(l, ix);
            if (!best || m < best.m - 1e-6 || (Math.abs(m - best.m) <= 1e-6 && v > best.v)) best = { l: l, m: m, v: v };
          });
          chosen = best ? best.l : pool[rng(pool.length)];
        } else if (isSoldier) {
          var withTarget = legalLocs.filter(function (l) {
            return (G.playerSlots[l] || []).some(function (s) { return s && s.revealed; });
          });
          chosen = (withTarget.length ? withTarget : legalLocs)[rng(withTarget.length || legalLocs.length)];
        } else {
          chosen = legalLocs[rng(legalLocs.length)];   // early turns: random placement
        }
      }

      var sidx = _serfStage(pick.cardId, chosen);
      if (sidx == null) break;
      plays.push({ cardId: pick.cardId, locId: chosen });
      hand.splice(hand.indexOf(pick.cardId), 1);
      if (!costFree) capital -= pick.cost;
    }

    _serfClearAllStubs();

    // UPGRADE 4: reveal-order optimisation — stable sort by the reveal-order key so
    // discounts/auras fire before beneficiaries and grabbers reveal last. (The
    // engine reveals plays in returned order — see buildRevealSequence.)
    plays = plays
      .map(function (p, i) { return { p: p, i: i, k: _giantRevealOrder(p.cardId) }; })
      .sort(function (a, b) { return a.k - b.k || a.i - b.i; })
      .map(function (e) { return e.p; });
    return plays;
  }

  /* Bind the shared Giant brain to a boss's signature (looked up by scriptHook, so
     no new config field is needed — each boss's scriptHook names its signature).
     Unknown boss → generic Giant (shared upgrades only, no signature). */
  function giantSelectPlaysFor(bossKey) {
    var sig = (bossKey && _GIANT_SIGNATURES[bossKey]) || {};
    return function (ctx) { return _giantSelectPlays(ctx, sig); };
  }

  /* ═══════════════════════════════════════════════════════════════
     AI BATTLE LOG (classroom win-rate instrumentation) — localStorage.
     One record per completed adventure battle. No PII.
       SOG.aiLog.record(rec) | .dump() | .clear() | .summary()
  ═══════════════════════════════════════════════════════════════ */
  var _AILOG_KEY = 'sog_ai_battle_log', _AILOG_CAP = 500;
  function _aiLogRead() { try { return JSON.parse(localStorage.getItem(_AILOG_KEY)) || []; } catch (e) { return []; } }
  function _aiLogWrite(a) { try { localStorage.setItem(_AILOG_KEY, JSON.stringify(a.slice(-_AILOG_CAP))); } catch (e) {} }
  var _aiLog = {
    record: function (rec) { var a = _aiLogRead(); a.push(rec); _aiLogWrite(a); return rec; },
    dump:   function () { var a = _aiLogRead(); if (typeof console !== 'undefined') console.table ? console.table(a) : console.log(a); return a; },
    clear:  function () { try { localStorage.removeItem(_AILOG_KEY); } catch (e) {} if (typeof console !== 'undefined') console.log('[aiLog] cleared'); },
    summary: function () {
      var a = _aiLogRead(), by = {};
      a.forEach(function (r) {
        var k = r.boss + ' · ' + r.tier;
        by[k] = by[k] || { n: 0, playerWins: 0, losses: 0, ties: 0 };
        by[k].n++;
        if (r.result === 'player') by[k].playerWins++; else if (r.result === 'ai') by[k].losses++; else by[k].ties++;
      });
      var rows = Object.keys(by).map(function (k) {
        var d = by[k];
        return { matchup: k, games: d.n, playerWinRate: d.n ? (100 * d.playerWins / d.n).toFixed(0) + '%' : '—',
                 playerWins: d.playerWins, aiWins: d.losses, ties: d.ties };
      });
      if (typeof console !== 'undefined') console.table ? console.table(rows) : console.log(rows);
      return rows;
    }
  };
  SOG.aiLog = _aiLog;

  /* ═══════════════════════════════════════════════════════════════
     SERF FREE-MOVE-AWAY (Red Sea) — one random relocation per turn
     ───────────────────────────────────────────────────────────────
     A location with abilityKey 'ANY_FREE_MOVE_AWAY' lets one card leave it
     each turn. The player has used this since Hatshepsut shipped (input.js
     refreshMoveableCards); the AI never did, so a Serf just parked cards on
     the Red Sea and left the payoffs — Punt's +1 IP and Thebes' +1 capital —
     permanently on the table.

     Deliberately DUMB, because this is the easy tier: pick a random own card
     that is there, pick a random other location that has room, move it. No
     evaluation of which destination is worth more, no check on whether the
     move helps. That is the intended Serf texture (it matches the 15%
     carelessness knob in serfSelectPlays) and it still converts the free
     value the tier was ignoring entirely.

     Runs POST-REVEAL from the same seam as runAdventureMovements, so it moves
     from a settled board with every card revealed. Routed through
     executeMoveAnimated — the shared pipeline — so applyMove fires
     fireMoveHereBonus and the destination's MOVE_HERE_IP / MOVE_HERE_CAPITAL
     bonus lands exactly as it would for a player move.

     Keyed on the ability, not on the boss: any future Serf battle that places
     an ANY_FREE_MOVE_AWAY location inherits this with no new code. Giant is
     untouched — it keeps routing through runAdventureMovements.

     NOTE: G.locMoveUsedThisTurn is deliberately NOT written here. That flag is
     the PLAYER's per-location move budget, read by input.js to grey out the
     card; the AI spending it would silently cost the player their own Red Sea
     move. One-move-per-turn for the AI is enforced by this function moving at
     most once per call, and it is called once per turn. */
  function runSerfFreeMoveAway(done) {
    done = done || function () {};
    var fromLoc = G.locations.find(function (l) { return l.abilityKey === 'ANY_FREE_MOVE_AWAY'; });
    if (!fromLoc) { done(); return; }

    /* The AI's OWN LEGALLY-MOVABLE cards sitting there (never the player's).
       "Present and revealed" is NOT the eligibility rule — this pass runs
       post-reveal, so cards played this very turn are revealed too, and moving
       one is an illegal same-turn move. _aiSlotMovableNow adds the settled
       requirement. */
    var movers = [];
    (G.aiSlots[fromLoc.id] || []).forEach(function (sd, si) {
      if (_aiSlotMovableNow(G, sd)) movers.push({ sd: sd, slotIndex: si });
    });
    if (!movers.length) { done(); return; }   // nothing settled here → fizzle

    // Destinations = the other locations with an open AI slot. No room
    // anywhere → fizzle for the turn, same as the Merchant's own move does.
    var dests = G.locations.filter(function (l) {
      if (l.id === fromLoc.id) return false;
      return (G.aiSlots[l.id] || []).some(function (s) { return s === null; });
    });
    if (!dests.length) { done(); return; }

    var mover = movers[Math.floor(Math.random() * movers.length)];
    var dest  = dests[Math.floor(Math.random() * dests.length)];

    if (!(SOG.game && typeof SOG.game.executeMoveAnimated === 'function')) { done(); return; }
    /* Owner string MUST be 'opp', not 'ai'. The two are not interchangeable:
       executeMoveAnimated picks the STATE array with `owner === 'player' ? ... :
       G.aiSlots`, so 'ai' silently works there — but the DOM is keyed
       data-owner="opp", so getSlotEl('ai', ...) returns null and the
       `if (finalSlotEl && card)` render block is skipped entirely. The card
       then lands in state and scores while never being drawn: a phantom.
       The source location still looked right because syncOppSlots(fromLocId)
       re-renders it wholesale, which is what made this hard to see.
       runAdventureMovements passes 'opp' for the same reason. */
    SOG.game.executeMoveAnimated(
      'opp', mover.sd.cardId, fromLoc.id, dest.id,
      { sd: mover.sd, fromSlotIndex: mover.slotIndex },   // exact slot — duplicate-cardId safe
      done
    );
  }

  /* ── GIANT FREE-MOVE-AWAY (Red Sea) — the SCORED counterpart to the Serf's
     random one. Same legality rules (ANY_FREE_MOVE_AWAY source, one move per
     turn, _aiSlotMovableNow so a card played this turn can't move), but the
     Giant CHOOSES rather than rolling:

       destination — score the location's arrival bonus, not just its emptiness:
                       MOVE_HERE_IP       (Punt)   → +1 IP, banked immediately
                       MOVE_HERE_CAPITAL  (Thebes) → +1 capital NEXT turn, so
                                                     worth nothing on the last
                                                     turn and discounted before
                     plus a contest term: a move that flips or defends a
                     location is worth more than one into a runaway win.
       mover       — the card that gains most by leaving. Prefer moving a card
                     OUT of a location the AI already wins comfortably and INTO
                     one it is losing, so the move buys a location rather than
                     padding a lead.

     Keyed on the ability, not the boss, so any future Giant board with these
     keys inherits it. Serf keeps runSerfFreeMoveAway (random) — the tiers are
     meant to differ exactly here. */
  function runGiantFreeMoveAway(done) {
    done = done || function () {};
    var fromLoc = G.locations.find(function (l) { return l.abilityKey === 'ANY_FREE_MOVE_AWAY'; });
    if (!fromLoc) { done(); return; }

    var movers = [];
    (G.aiSlots[fromLoc.id] || []).forEach(function (sd, si) {
      if (_aiSlotMovableNow(G, sd)) movers.push({ sd: sd, slotIndex: si });
    });
    if (!movers.length) { done(); return; }

    var turns     = (G.config && G.config.structure && G.config.structure.turns) || 5;
    var lastTurn  = G.turn >= turns;

    var dests = [];
    G.locations.forEach(function (l) {
      if (l.id === fromLoc.id || !_giantHasOpen(l.id)) return;
      var score = 0;
      if (l.abilityKey === 'MOVE_HERE_IP') score += 1;
      if (l.abilityKey === 'MOVE_HERE_CAPITAL') score += lastTurn ? 0 : 0.5;
      // Contest term: margin < 0 means we are LOSING there — a body helps most.
      var margin = _giantLocMargin(l.id);
      if (margin < 0) score += Math.min(-margin, 3) * 0.4;
      else            score += Math.max(0, 1.5 - margin * 0.2) * 0.1;   // runaway wins are near-worthless
      dests.push({ id: l.id, score: score });
    });
    if (!dests.length) { done(); return; }                 // nowhere to go → fizzle
    dests.sort(function (a, b) { return b.score - a.score; });
    var dest = dests[0];

    // Leaving is cheapest for the card whose absence costs the source least —
    // but never strip a location we would then lose. Approximate: prefer the
    // LOWEST-IP mover when the source is comfortably won, the HIGHEST when the
    // source is already lost (salvage the body).
    var srcMargin = _giantLocMargin(fromLoc.id);
    movers.sort(function (a, b) {
      var ea = _serfEffIP(a.sd), eb = _serfEffIP(b.sd);
      return srcMargin < 0 ? eb - ea : ea - eb;
    });
    var mover = movers[0];

    if (!(SOG.game && typeof SOG.game.executeMoveAnimated === 'function')) { done(); return; }
    // 'opp' (not 'ai') — the DOM is keyed data-owner="opp"; see runSerfFreeMoveAway.
    SOG.game.executeMoveAnimated(
      'opp', mover.sd.cardId, fromLoc.id, dest.id,
      { sd: mover.sd, fromSlotIndex: mover.slotIndex },
      done
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.ai = {
    runAiSelection: runAiSelection,
    runAiMovements: runAiMovements,
    runAdventureMovements: runAdventureMovements,
    runSerfFreeMoveAway: runSerfFreeMoveAway,
    runGiantFreeMoveAway: runGiantFreeMoveAway,
    // Shared card-placement heuristics (also used by the per-battle selectors).
    cardTurnBias: cardTurnBias,
    cardLocBias:  cardLocBias,
    // Stage A: the one shared generic "Serf" selector (routed by cfg.ai.tier).
    serfSelectPlays: serfSelectPlays,
    // Stage B: the shared "Giant" brain (Serf + upgrades) bound per boss by key.
    giantSelectPlaysFor: giantSelectPlaysFor
  };

})();

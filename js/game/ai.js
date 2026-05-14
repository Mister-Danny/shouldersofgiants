/**
 * game/ai.js — Shoulders of Giants · AI Opponent
 *
 * Handles both AI difficulty modes:
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
    var budget = CAPITAL + G.aiBonusCapitalNextTurn;
    G.aiBonusCapitalNextTurn = 0;

    // Shared helper: write a decided play to the board and reveal queue.
    function commitPlay(cardId, locId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      var slotIndex = G.aiSlots[locId].indexOf(null);
      if (slotIndex === -1) return;
      // Resurrection bonus stored as named ipMod entry (parity with player commitPlay)
      var resBonus  = G.aiCardIPBonus[cardId] || 0;
      var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai' : 'Bonus';
      var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
      G.aiSlots[locId][slotIndex] = { cardId: cardId, ip: card.ip, revealed: false, ipMod: resBonus, contMod: 0, ipModSources: resSources };
      G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
      G.aiRevealQueue.push(cardId);
      var slotEl = helpers.getSlotEl('opp', locId, slotIndex);
      if (slotEl) { slotEl.dataset.cardId = cardId; helpers.setSlotFaceDown(slotEl); }
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
      if (!card || card.cc > budget) return;

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

      // Resurrection bonus stored as named ipMod entry (parity with player commitPlay)
      var resBonus  = G.aiCardIPBonus[cardId] || 0;
      var resLabel  = cardId === 10 ? 'Jesus' : cardId === 12 ? 'Samurai' : 'Bonus';
      var resSources = resBonus > 0 ? [{ source: resLabel, delta: resBonus }] : [];
      G.aiSlots[t.locId][t.slotIndex] = { cardId: cardId, ip: card.ip, revealed: false, ipMod: resBonus, contMod: 0, ipModSources: resSources };
      G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
      G.aiRevealQueue.push(cardId);
      budget -= card.cc;

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
        var c = CARDS.find(function (x) { return x.id === s.cardId; });
        return n + (c && c.cc >= 4 ? 1 : 0);
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

  /**
   * Effective capital cost for an AI card at a location, accounting for
   * already-revealed discount cards (Henry anywhere, Cosimo anywhere, Levant).
   */
  function _giantEffectiveCC(cardId, locId) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return 99;
    var cc = card.cc;

    // Henry the Navigator (id=22): reduces Exploration cc globally
    if (card.type === 'Exploration' && cardId !== 22) {
      var henryOnBoard = G.locations.some(function (l) {
        return G.aiSlots[l.id].some(function (s) { return s && s.revealed && s.cardId === 22; });
      });
      if (henryOnBoard) cc = Math.max(1, cc - 1);
    }
    // Cosimo de'Medici (id=19): reduces Cultural cc from anywhere
    if (card.type === 'Cultural' && cardId !== 19) {
      var cosimoAny = G.locations.some(function (l) {
        return G.aiSlots[l.id].some(function (s) { return s && s.revealed && s.cardId === 19; });
      });
      if (cosimoAny) cc = Math.max(1, cc - 1);
    }
    // Levant (RELIGIOUS_DISCOUNT)
    var loc = G.locations.find(function (l) { return l.id === locId; });
    if (loc && loc.abilityKey === 'RELIGIOUS_DISCOUNT' && card.type === 'Religious') {
      cc = Math.max(1, cc - 1);
    }
    return cc;
  }

  /**
   * Score a single (cardId, locId) candidate play.
   * Returns null if inadvisable; otherwise a numeric score (higher = better).
   * tentativePlays: already-selected plays this turn (for Voltaire/Scholar synergy checks).
   */
  function _giantScorePlay(cardId, locId, boardAnalysis, tentativePlays) {
    var card = CARDS.find(function (c) { return c.id === cardId; });
    if (!card) return null;
    var an = boardAnalysis[locId];

    var tentativeHere = tentativePlays.filter(function (p) { return p.locId === locId; }).length;
    if (an.availableSlots - tentativeHere <= 0) return null;

    var baseIP = card.ip + (G.aiCardIPBonus[cardId] || 0);
    var score  = baseIP;

    /* ── Per-card synergy bonuses ─────────────────────────────── */

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
          var cc    = _giantEffectiveCC(cardId, loc.id);
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
   */
  function runAiMovements() {
    var isHard = window.aiDifficulty === 'hard';

    G.locations.forEach(function (loc) {
      G.aiSlots[loc.id].forEach(function (s, si) {
        if (!s || !s.revealed) return;

        // ── Magellan (id=24) ──────────────────────────────────────
        if (s.cardId === 24 && !G.aiMovedThisTurn[24]) {
          var magBest = null, magBestScore = -Infinity;
          G.locations.forEach(function (l) {
            if (l.id === loc.id || G.aiSlots[l.id].indexOf(null) === -1) return;
            // Giant: move toward most contested (highest gap = AI losing there)
            // Easy: move toward highest player IP
            var magScore = isHard ? _aiLocGap(l.id)
              : G.playerSlots[l.id].reduce(function (sum, ps) {
                return sum + (ps && ps.revealed ? helpers.effectiveIP(ps) : 0);
              }, 0);
            if (magScore > magBestScore) { magBestScore = magScore; magBest = l.id; }
          });
          if (magBest !== null) helpers.executeMove('opp', loc.id, si, magBest);
        }

        // ── Columbus (id=25) ─────────────────────────────────────
        if (s.cardId === 25 && !G.aiColumbusMoved) {
          var colBest = null, colBestCount = 0;
          G.locations.forEach(function (l) {
            if (l.id === loc.id || G.aiSlots[l.id].indexOf(null) === -1) return;
            var cnt = G.playerSlots[l.id].filter(function (ps) {
              if (!ps || !ps.revealed) return false;
              var c = CARDS.find(function (x) { return x.id === ps.cardId; });
              return c && (c.type === 'Cultural' || c.type === 'Political');
            }).length;
            if (cnt > colBestCount) { colBestCount = cnt; colBest = l.id; }
          });
          if (colBest !== null) helpers.executeMove('opp', loc.id, si, colBest);
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
              if (l.id === loc.id || G.aiSlots[l.id].indexOf(null) === -1) return;
              var gap = _aiLocGap(l.id);
              if (gap > scandBestGap) { scandBestGap = gap; scandBest = l.id; }
            });
            // Only reposition if AI is losing or tied at the destination
            if (scandBest !== null && scandBestGap >= 0) {
              helpers.executeMove('opp', loc.id, si, scandBest);
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
            if (G.aiSlots[timbuktuLoc.id].indexOf(null) === -1) return; // Timbuktu full
            var crd = CARDS.find(function (c) { return c.id === s.cardId; });
            if (!crd || crd.type !== 'Cultural') return;
            // Only pull from a location where AI is comfortably ahead (safe to spare the card)
            if (_aiLocGap(srcLoc.id) > -2) return;
            helpers.executeMove('opp', srcLoc.id, si, timbuktuLoc.id);
            G.aiMovedThisTurn[s.cardId] = true;
          });
        });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.ai = {
    runAiSelection: runAiSelection,
    runAiMovements: runAiMovements
  };

})();

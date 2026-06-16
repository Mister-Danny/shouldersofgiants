/**
 * game/abilities.js — Shoulders of Giants · Ability Registry + Engine
 *
 * Centralizes ALL card-specific behavior into one module. This is the
 * structural change Filament Games and any pro game-dev hire would
 * expect: each card's behavior lives in one place, and adding a new
 * card with an ability is a one-object change to CARD_ABILITIES.
 *
 * Owns:
 *   • CARD_ABILITIES registry (id → { onAtOnce })
 *   • fireAtOnce dispatcher — replaces the old switch statement
 *   • evaluateContinuous — all non-At-Once IP effects (Juvenal/Voltaire/
 *     William/Sahara)
 *   • All 8 At Once ability implementations:
 *       Scholar-Officials (2), Justinian (3), Empress Wu (4),
 *       Pacal the Great (5), Francis of Assisi (8), Erasmus (9),
 *       Cortes (13), Zheng He (23)
 *   • All 5 conditional triggers (fired by destroyCard / discardFromHand):
 *       Jan Hus (7), Jesus Christ (10), Samurai (12), Joan of Arc (14
 *       — player and AI variants)
 *   • Shared ability helpers: destroyCard, discardFromHand,
 *     isKenteProtected, updateWilliamDisplay, pulseWilliam,
 *     updateKenteGlows
 *   • Discard chooser UI: buildChooserCard, showDiscardChooser
 *   • Reveal-order avatar glow: showRevealFirstHighlight,
 *     hideRevealFirstHighlight
 *   • Adjacency helper: getAdjacentLocIds
 *
 * Deliberately NOT moved in this pass:
 *   • flipSlot — still in game.js because it bakes in Kente / Juvenal /
 *     Cosimo / Henry reveal *animations* (not the abilities themselves —
 *     just the visual flourishes that happen during the card flip). A
 *     future pass could lift the animation hooks behind a SOG.abilities
 *     "onReveal" callback, but it requires more thought than fits
 *     cleanly in Pass 4.
 *
 * Reads:  SOG.state.G, window.CARDS
 * Calls:  SOG.board.{ getSlotEl, findSlotEl, buildCardFace,
 *                     clearSlotDOM, compactPlayerSlots, syncPlayerSlots,
 *                     compactOppSlots, syncOppSlots, effectiveIP,
 *                     addIPMod, placeRevealedCard, makeBoardGhost,
 *                     removeEl, removeGhost, refreshSlotIPDisplays,
 *                     updateScores }
 *         SOG.input.rebuildPlayerHand
 *         SOG.ui.showIPFloat
 *         SOG.game.executeMoveAnimated (cross-cutting reveal helper
 *           that lives in game.js; called by Wu's push and other
 *           ability-driven moves)
 *         SFX.*, Anim.*, gsap.* — all optional
 *
 * Exposes: SOG.abilities.{ fireAtOnce, evaluateContinuous,
 *                          isKenteProtected, destroyCard,
 *                          discardFromHand, updateWilliamDisplay,
 *                          pulseWilliam, updateKenteGlows,
 *                          showDiscardChooser, buildChooserCard,
 *                          showRevealFirstHighlight,
 *                          hideRevealFirstHighlight,
 *                          getAdjacentLocIds,
 *                          CARD_ABILITIES }
 *
 * NOTE: Extracted from game.js as part of the "split game.js" refactor
 * (Pass 4 — the final structural pass). Behavior is unchanged.
 */

(function () {
  'use strict';

  var G = SOG.state.G;

  /* ── Board helper aliases (game/board.js) ───────────────────── */
  var getSlotEl             = SOG.board.getSlotEl;
  var findSlotEl            = SOG.board.findSlotEl;
  var buildCardFace         = SOG.board.buildCardFace;
  var clearSlotDOM          = SOG.board.clearSlotDOM;
  var compactPlayerSlots    = SOG.board.compactPlayerSlots;
  var syncPlayerSlots       = SOG.board.syncPlayerSlots;
  var compactOppSlots       = SOG.board.compactOppSlots;
  var syncOppSlots          = SOG.board.syncOppSlots;
  var effectiveIP           = SOG.board.effectiveIP;
  var addIPMod              = SOG.board.addIPMod;
  var nextEventId           = SOG.board.nextEventId;
  var addBonus              = SOG.board.addBonus;
  var SOURCE_ID_MAP         = SOG.board.SOURCE_ID_MAP;
  var placeRevealedCard     = SOG.board.placeRevealedCard;
  var makeBoardGhost        = SOG.board.makeBoardGhost;
  var removeEl              = SOG.board.removeEl;
  var removeGhost           = SOG.board.removeGhost;
  var refreshSlotIPDisplays = SOG.board.refreshSlotIPDisplays;
  var updateScores          = SOG.board.updateScores;

  /* ── Input helper alias (game/input.js) ──────────────────────
     rebuildPlayerHand is called by Jesus's return-to-hand sequence and
     Joan of Arc's hand-card removal. input.js must load before abilities.js. */
  var rebuildPlayerHand = SOG.input.rebuildPlayerHand;

  /* ── DOM refs ───────────────────────────────────────────────── */
  var boardEl      = document.getElementById('battle-board');
  var playerHandEl = document.getElementById('battle-player-hand');

  /* executeMoveAnimated lives in game.js (it's a cross-cutting reveal
     helper called by ai.js, the reveal pipeline, and Wu's push).
     game.js loads AFTER abilities.js, so we resolve the function lazily
     at call time rather than aliasing at load time. */
  function executeMoveAnimated() {
    return SOG.game.executeMoveAnimated.apply(null, arguments);
  }

  /* ═══════════════════════════════════════════════════════════════
     REVEAL-ORDER AVATAR HIGHLIGHT
  ═══════════════════════════════════════════════════════════════ */

  function showRevealFirstHighlight(playerFirst) {
    var lucyAv = document.querySelector('.battle-avatar-ally');
    var otziAv = document.querySelector('.battle-avatar-opponent');
    if (lucyAv) lucyAv.classList.toggle('turn-first', !!playerFirst);
    if (otziAv) otziAv.classList.toggle('turn-first', !playerFirst);
  }

  function hideRevealFirstHighlight() {
    document.querySelectorAll('.battle-avatar.turn-first').forEach(function (el) {
      el.classList.remove('turn-first');
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     AT-ONCE TARGETING — REVEALED-ONLY ITERATION
     ───────────────────────────────────────────────────────────────
     The universal rule: an At Once ability sees a card only once it has
     entered play (been revealed). A face-down card at the same location has
     not entered play, so no At Once effect may reach it. Every slot-touching
     At Once ability must select its targets through this helper so the rule
     can never be hand-omitted again.

     forEachRevealedAt(slots, locId, fn):
       • `slots` — the SIDE whose cards to scan: pass G.playerSlots or
         G.aiSlots (own vs opponent is the caller's choice).
       • `locId` — the location to scan.
       • `fn(sd, index)` — called ONCE per REVEALED, non-null slot, in slot
         order. `index` is the slot index (for getSlotEl / slot-nulling).
         The ability applies any FURTHER filter (by id, type, cc, …) inside
         `fn` via an early `return` — exactly as the hand-rolled loops did,
         minus the now-centralized `!s || !s.revealed` guard.

     Expresses every existing target-selection shape without behavior change:
     side-effect loops (Justinian reset, Scholar pulse, Cortes victims),
     counts (Scholar count), and find/reduce (Empress Wu best, Soldier
     targets, Hammurabi lowest) — all accumulate in a closure inside `fn`.
  ═══════════════════════════════════════════════════════════════ */

  function forEachRevealedAt(slots, locId, fn) {
    var arr = slots && slots[locId];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (s && s.revealed) fn(s, i);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ADJACENCY
  ═══════════════════════════════════════════════════════════════ */

  function getAdjacentLocIds(locId) {
    var idx = G.locations.findIndex(function (l) { return l.id === locId; });
    var res = [];
    if (idx > 0)                      res.push(G.locations[idx - 1].id);
    if (idx < G.locations.length - 1) res.push(G.locations[idx + 1].id);
    return res;
  }

  /* ═══════════════════════════════════════════════════════════════
     KENTE PROTECTION + WILLIAM DISPLAY
  ═══════════════════════════════════════════════════════════════ */

  function isKenteProtected(locId) {
    return G.playerSlots[locId].some(function (s) { return s && s.revealed && s.cardId === 17; }) ||
           G.aiSlots[locId].some(    function (s) { return s && s.revealed && s.cardId === 17; });
  }

  /* Update the persistent orange Kente glow on each location tile.
     Called from evaluateContinuous() every time board state changes. */
  function updateKenteGlows() {
    if (typeof Anim === 'undefined') return;
    G.locations.forEach(function (loc) {
      var kenteOn = isKenteProtected(loc.id);
      var locTileEl = boardEl.querySelector('.battle-col[data-loc-id="' + loc.id + '"]');
      Anim.setKenteGlow(locTileEl, kenteOn);
    });
  }

  /**
   * Update William's displayed IP number immediately (no sound/animation).
   * Called live as each card is destroyed so the number ticks up in real time.
   */
  function updateWilliamDisplay() {
    var williamEl = playerHandEl.querySelector('.battle-hand-card[data-id="15"]');
    var isOnBoard = false;
    if (!williamEl) { williamEl = findSlotEl('player', 15); isOnBoard = !!williamEl; }
    if (!williamEl) return;
    var ipEl = williamEl.querySelector('.db-overlay-ip');
    if (!ipEl) return;
    if (isOnBoard) {
      var wLocId = null, wSlotIdx = -1;
      G.locations.forEach(function (l) {
        if (wLocId !== null) return;
        var idx = G.playerSlots[l.id].findIndex(function (s) { return s && s.cardId === 15; });
        if (idx !== -1) { wLocId = l.id; wSlotIdx = idx; }
      });
      if (wLocId !== null) {
        var wSd = G.playerSlots[wLocId][wSlotIdx];
        wSd.contMod = G.destroyedIPTotal;
        wSd.contModSources = G.destroyedIPTotal > 0
          ? [{ source: 'William the Conqueror', delta: G.destroyedIPTotal }]
          : [];
        // Rebuild continuous bonuses[] — Pattern B: one entry per destroyed card
        if (wSd.bonuses) wSd.bonuses = wSd.bonuses.filter(function (b) { return !b.continuous; });
        G.destroyedCards.forEach(function (dc) {
          addBonus(wSd, dc.ip, 'card', dc.cardId, dc.eventId, 'B', true);
        });
        ipEl.textContent = effectiveIP(wSd);
      }
    } else {
      var wCard = CARDS.find(function (c) { return c.id === 15; });
      if (wCard) ipEl.textContent = wCard.ip + (G.cardIPBonus[15] || 0) + G.destroyedIPTotal;
    }
  }

  /**
   * Play William's border-flash animation and sound, then call done() when finished.
   * Separated from updateWilliamDisplay so animations can be queued sequentially.
   * @param {Function} [done]  Called ~1050ms after the animation starts (optional).
   */
  function pulseWilliam(done) {
    var williamEl = playerHandEl.querySelector('.battle-hand-card[data-id="15"]');
    if (!williamEl) williamEl = findSlotEl('player', 15);
    if (!williamEl) { if (done) done(); return; }
    if (typeof SFX  !== 'undefined') SFX.williamGain();
    if (typeof Anim !== 'undefined') Anim.williamPulse(williamEl);
    if (done) setTimeout(done, 1050);
  }

  /* ═══════════════════════════════════════════════════════════════
     CONTINUOUS EFFECTS
  ═══════════════════════════════════════════════════════════════ */

  function evaluateContinuous() {
    // Snapshot Voltaire's current contMod before clearing, so we can detect activation
    var voltairePrev = {};
    G.locations.forEach(function (loc) {
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s) {
          if (s && s.revealed && s.cardId === 20)
            voltairePrev[own + ':' + loc.id] = s.contMod || 0;
        });
      });
    });

    // Clear contMod + contModSources (and continuous bonuses[]) so each evaluation starts fresh
    G.locations.forEach(function (loc) {
      ['player','opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s) {
          if (s) {
            s.contMod = 0;
            s.contModSources = [];
            if (s.bonuses) s.bonuses = s.bonuses.filter(function (b) { return !b.continuous; });
          }
        });
      });
    });

    // Rebuild per-location external boost table (cleared and rebuilt each cycle).
    // Generic structure: any future card that boosts a remote location registers here.
    G.locationBoosts = {};
    G.locations.forEach(function (loc) {
      G.locationBoosts[loc.id] = { player: [], opp: [] };
    });

    G.locations.forEach(function (loc) {
      // Juvenal (id 18): -2 IP to all CC≥4 cards here (both sides)
      ['player','opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (sl[loc.id].some(function (s) { return s && s.revealed && s.cardId === 18; })) {
          ['player','opp'].forEach(function (to) {
            var ts = to === 'player' ? G.playerSlots : G.aiSlots;
            ts[loc.id].forEach(function (s) {
              if (!s || !s.revealed) return;
              var c = CARDS.find(function (x) { return x.id === s.cardId; });
              if (c && c.cc >= 4) {
                s.contMod = (s.contMod || 0) - 2;
                s.contModSources.push({ source: 'Juvenal', delta: -2 });
                addBonus(s, -2, 'card', 18, nextEventId(), 'A', true);
              }
            });
          });
        }
      });

      // Voltaire (id 20): +4 IP if sole revealed card for that owner here
      ['player','opp'].forEach(function (own) {
        var sl  = own === 'player' ? G.playerSlots : G.aiSlots;
        var rev = sl[loc.id].filter(function (s) { return s && s.revealed; });
        if (rev.length === 1 && rev[0].cardId === 20) {
          rev[0].contMod = (rev[0].contMod || 0) + 4;
          rev[0].contModSources.push({ source: 'Voltaire', delta: 4 });
          addBonus(rev[0], 4, 'card', 20, nextEventId(), 'A', true);
        }
      });

      // William the Conqueror (id 15): contMod = total destroyed IP for that owner
      G.playerSlots[loc.id].forEach(function (s) {
        if (s && s.revealed && s.cardId === 15) {
          s.contMod = (s.contMod || 0) + G.destroyedIPTotal;
          if (G.destroyedIPTotal > 0) {
            s.contModSources.push({ source: 'William the Conqueror', delta: G.destroyedIPTotal });
            // Pattern B: each destroyed card is a separate thumbnail
            G.destroyedCards.forEach(function (dc) {
              addBonus(s, dc.ip, 'card', dc.cardId, dc.eventId, 'B', true);
            });
          }
        }
      });
      G.aiSlots[loc.id].forEach(function (s) {
        if (s && s.revealed && s.cardId === 15) {
          s.contMod = (s.contMod || 0) + G.aiDestroyedIPTotal;
          if (G.aiDestroyedIPTotal > 0) {
            s.contModSources.push({ source: 'William the Conqueror', delta: G.aiDestroyedIPTotal });
            // Pattern B: each destroyed card is a separate thumbnail
            G.aiDestroyedCards.forEach(function (dc) {
              addBonus(s, dc.ip, 'card', dc.cardId, dc.eventId, 'B', true);
            });
          }
        }
      });

      // The Sahara (ALL_MINUS_ONE_IP): -1 IP to ALL revealed cards here (both sides)
      if (loc.abilityKey === 'ALL_MINUS_ONE_IP') {
        var saharaName = loc.name || 'The Sahara';
        ['player', 'opp'].forEach(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          sl[loc.id].forEach(function (s) {
            if (s && s.revealed) {
              s.contMod = (s.contMod || 0) - 1;
              s.contModSources.push({ source: saharaName, delta: -1 });
              addBonus(s, -1, 'location', loc.id, nextEventId(), 'A', true);
            }
          });
        });
      }

      // ── Prehistory abilities (Adventure Mode tutorial) ──────────
      // Slot-index proxies for turn-order: each slot's array index
      // reflects when it was played relative to its siblings in the
      // same loc/owner. Exact in 1-play-per-turn battles (the
      // prehistory tutorial); approximate elsewhere.

      // Fire (id 29): +1 IP to cards played AFTER Fire here (same side,
      // higher slot index, revealed).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (fire, fireIdx) {
          if (!fire || !fire.revealed || fire.cardId !== 29) return;
          sl[loc.id].forEach(function (s, si) {
            if (s && s.revealed && si > fireIdx) {
              s.contMod = (s.contMod || 0) + 1;
              s.contModSources.push({ source: 'Fire', delta: 1 });
              addBonus(s, 1, 'card', 29, nextEventId(), 'A', true);
            }
          });
        });
      });

      // Cave Art (id 30): +1 IP to cards played BEFORE Cave Art here
      // (same side, lower slot index, revealed).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (cave, caveIdx) {
          if (!cave || !cave.revealed || cave.cardId !== 30) return;
          sl[loc.id].forEach(function (s, si) {
            if (s && s.revealed && si < caveIdx) {
              s.contMod = (s.contMod || 0) + 1;
              s.contModSources.push({ source: 'Cave Art', delta: 1 });
              addBonus(s, 1, 'card', 30, nextEventId(), 'A', true);
            }
          });
        });
      });

      // Domesticated Animal (id 32): +1 IP to slots adjacent (index ±1)
      // here (same side, revealed).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (dom, domIdx) {
          if (!dom || !dom.revealed || dom.cardId !== 32) return;
          [domIdx - 1, domIdx + 1].forEach(function (adjIdx) {
            var s = sl[loc.id][adjIdx];
            if (s && s.revealed) {
              s.contMod = (s.contMod || 0) + 1;
              s.contModSources.push({ source: 'Domesticated Animal', delta: 1 });
              addBonus(s, 1, 'card', 32, nextEventId(), 'A', true);
            }
          });
        });
      });

      // Tribe (id 36): "At Once — Tribe gains +1 IP for every card you play
      // here next turn." Each slot carries turnPlayed (the turn it was
      // committed). Tribe gains +1 for every OTHER same-owner card at this
      // location played on the turn immediately after Tribe itself
      // (turnPlayed === tribe.turnPlayed + 1). Recomputed continuously, so
      // the bonus scales up as each next-turn card is revealed and stops
      // counting plays from any later turn.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (tribe, tribeIdx) {
          if (!tribe || !tribe.revealed || tribe.cardId !== 36) return;
          if (typeof tribe.turnPlayed !== 'number') return;
          var nextTurn = tribe.turnPlayed + 1;
          var count = 0;
          sl[loc.id].forEach(function (s, si) {
            if (s && s.revealed && si !== tribeIdx && s.turnPlayed === nextTurn) count++;
          });
          if (count > 0) {
            tribe.contMod = (tribe.contMod || 0) + count;
            tribe.contModSources.push({ source: 'Tribe', delta: count });
            addBonus(tribe, count, 'card', 36, nextEventId(), 'A', true);
          }
        });
      });

      // ── Mesopotamia continuous abilities ────────────────────────

      // Enkidu (id 44): +1 IP to the slots adjacent (index ±1) here
      // (same owner, revealed). Mirror of Domesticated Animal (id 32).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (enkidu, enkiduIdx) {
          if (!enkidu || !enkidu.revealed || enkidu.cardId !== 44) return;
          [enkiduIdx - 1, enkiduIdx + 1].forEach(function (adjIdx) {
            var s = sl[loc.id][adjIdx];
            if (s && s.revealed) {
              s.contMod = (s.contMod || 0) + 1;
              s.contModSources.push({ source: 'Enkidu', delta: 1 });
              addBonus(s, 1, 'card', 44, nextEventId(), 'A', true);
            }
          });
        });
      });

      // Canals (id 41): +1 IP to all Labor-type cards here (same owner).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (!sl[loc.id].some(function (s) { return s && s.revealed && s.cardId === 41; })) return;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed) return;
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && c.type === 'Labor') {
            s.contMod = (s.contMod || 0) + 1;
            s.contModSources.push({ source: 'Canals', delta: 1 });
            addBonus(s, 1, 'card', 41, nextEventId(), 'A', true);
          }
        });
      });

      // Ziggurat (id 45): +1 IP to OTHER Religious-type cards here (same
      // owner). Ziggurat does not boost its own IP.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (!sl[loc.id].some(function (s) { return s && s.revealed && s.cardId === 45; })) return;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || s.cardId === 45) return;  // exclude Ziggurat itself
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && c.type === 'Religious') {
            s.contMod = (s.contMod || 0) + 1;
            s.contModSources.push({ source: 'Ziggurat', delta: 1 });
            addBonus(s, 1, 'card', 45, nextEventId(), 'A', true);
          }
        });
      });

      // Scribe (id 40): +1 IP to each card at this location that was played from hand
      // here (originalLocId === this location) BEFORE Scribe was played here
      // (playTime < Scribe.playTime).  Each Scribe in the slot array is its own
      // independent boost source.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (scribe, scribeIdx) {
          if (!scribe || !scribe.revealed || scribe.cardId !== 40) return;
          var scribeTime = scribe.playTime;
          if (scribeTime === undefined) return;   // metadata not yet set — skip
          sl[loc.id].forEach(function (s, si) {
            if (!s || !s.revealed || si === scribeIdx) return;
            if (s.originalLocId !== loc.id) return;   // not originally played here
            if ((s.playTime || 0) >= scribeTime) return;  // played same time or after Scribe
            s.contMod = (s.contMod || 0) + 1;
            s.contModSources.push({ source: 'Scribe', delta: 1 });
            addBonus(s, 1, 'card', 40, nextEventId(), 'A', true);
          });
        });
      });

      // Gilgamesh (id 43): +1 IP for all OTHER Cultural cards the owner has played
      // this game — Gilgamesh does NOT boost himself. culturalCount is all-time
      // (persists through destruction) and includes Gilgamesh's own play (he's
      // Cultural), so subtract 1 to exclude him. Self-portrait attribution.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || s.cardId !== 43) return;
          var bonus = ((G.culturalCount && G.culturalCount[own]) || 0) - 1;  // exclude Gilgamesh himself
          if (bonus <= 0) return;
          s.contMod = (s.contMod || 0) + bonus;
          s.contModSources.push({ source: 'Gilgamesh', delta: bonus });
          addBonus(s, bonus, 'card', 43, nextEventId(), 'A', true);
        });
      });

      // Sargon (id 37): grants +3 IP to each adjacent location for Sargon's owner.
      // This is a LOCATION-LEVEL bonus (not a card modifier) — written to
      // G.locationBoosts so updateScores and tallyResult can include it in
      // win-condition math, and the location popup can visualise it.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (!sl[loc.id].some(function (s) { return s && s.revealed && s.cardId === 37; })) return;
        var adjIds = getAdjacentLocIds(loc.id);
        adjIds.forEach(function (adjId) {
          if (!G.locationBoosts[adjId]) return;
          G.locationBoosts[adjId][own].push({
            sourceCardId: 37,
            sourceOwner:  own,
            sourceLocId:  loc.id,
            amount:       3
          });
        });
      });

    });
    // Note: Cuneiform (id 46) attachment is NOT resolved here.
    // It fires from the play-event hook in revealNext (game.js), which guarantees
    // it only triggers on an explicit play-from-hand action, never on a card move.

    // Fire Voltaire animation + sound when his bonus transitions 0 → +4
    G.locations.forEach(function (loc) {
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s, si) {
          if (!s || !s.revealed || s.cardId !== 20) return;
          var prev = voltairePrev[own + ':' + loc.id] || 0;
          var next = s.contMod || 0;
          if (next > 0 && prev === 0) {
            var slotEl = getSlotEl(own, loc.id, si);
            if (typeof SFX  !== 'undefined') SFX.voltaireSound();
            if (typeof Anim !== 'undefined' && slotEl) {
              Anim.voltaireRock(slotEl);
              Anim.floatNumber(slotEl, 4);
            }
          }
        });
      });
    });

    // Update continuous glow on all revealed slots
    if (typeof Anim !== 'undefined') {
      G.locations.forEach(function (loc) {
        ['player', 'opp'].forEach(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          sl[loc.id].forEach(function (s, si) {
            if (!s || !s.revealed) return;
            var slotEl = getSlotEl(own, loc.id, si);
            Anim.setGlow(slotEl, (s.contMod || 0) !== 0);
          });
        });
      });
      // Update Kente location glow on all tiles
      updateKenteGlows();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CORE: destroyCard + discardFromHand
     These fire the conditional triggers (Jan Hus, Jesus, Samurai,
     Joan of Arc) and accumulate William's destruction counter.
  ═══════════════════════════════════════════════════════════════ */

  function destroyCard(owner, locId, slotIndex, opts) {
    opts = opts || {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var sd    = slots[locId][slotIndex];
    if (!sd) return;
    if (!opts.skipKente && isKenteProtected(locId)) return;

    var dIP    = effectiveIP(sd);
    var cardId = sd.cardId;
    var dEid   = nextEventId();
    if (owner === 'player') {
      G.destroyedIPTotal += dIP;
      G.destroyedCards.push({ cardId: cardId, ip: dIP, eventId: dEid });
      updateWilliamDisplay(); pulseWilliam();
    } else {
      G.aiDestroyedIPTotal += dIP;
      G.aiDestroyedCards.push({ cardId: cardId, ip: dIP, eventId: dEid });
    }

    // Joan of Arc with a Religious card available → skip standard destroy anim,
    // hand off a ghost to triggerJoanOfArc for the special summon sequence
    var joanSpecial = cardId === 14 && owner === 'player' && G.playerHand.some(function (id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      return c && c.type === 'Religious';
    });

    var dSlotEl = getSlotEl(owner, locId, slotIndex);

    if (joanSpecial) {
      var joanGhost = makeBoardGhost(dSlotEl, 150);
      slots[locId][slotIndex] = null;
      clearSlotDOM(owner, locId, slotIndex);
      if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
      triggerJoanOfArc(locId, joanGhost);
      return;
    }

    // Ghost Jan Hus before clearing so the split animation has an element to work with
    var janHusGhost = (cardId === 7) ? makeBoardGhost(dSlotEl, 500) : null;

    // Save Samurai's ipMod before destruction so resurrection can restore it
    if (cardId === 12) {
      var savedKey = owner === 'player' ? '_samuraiSavedMod' : '_aiSamuraiSavedMod';
      G[savedKey] = { ipMod: sd.ipMod || 0, ipModSources: (sd.ipModSources || []).slice() };
    }

    if (typeof SFX !== 'undefined') SFX.cardDestroyed();
    if (dSlotEl && typeof Anim !== 'undefined') Anim.shake(dSlotEl);

    slots[locId][slotIndex] = null;
    clearSlotDOM(owner, locId, slotIndex);
    if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
    else { compactOppSlots(locId); syncOppSlots(locId); }

    if (cardId === 7)  triggerJanHus(owner, janHusGhost, function () { if (janHusGhost) removeEl(janHusGhost); });
    if (cardId === 12) triggerSamurai(owner, locId);
    if (cardId === 14 && owner === 'opp') triggerJoanOfArcAI(locId);
    // Joan with no Religious card: no trigger — standard shake already queued above
  }

  /**
   * Discard a card from an owner's hand.
   * Removes from hand state/DOM and fires If/When-discarded triggers.
   */
  function discardFromHand(owner, cardId, callback) {
    if (typeof SFX !== 'undefined') SFX.cardDiscarded();
    var jesusEl  = null;
    var janHusEl = null;
    if (owner === 'player') {
      G.playerHand = G.playerHand.filter(function (id) { return id !== cardId; });
      var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
      if (hEl) {
        if (cardId === 10) { jesusEl  = hEl; }  // hold for Jesus ascend animation
        else if (cardId === 7) { janHusEl = hEl; }  // hold for Jan Hus split animation
        else               { hEl.remove(); }    // other discards: silent removal (no generic animation)
      }
    } else {
      G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
    }
    if (cardId === 7) {
      triggerJanHus(owner, janHusEl, function () {
        if (janHusEl) removeEl(janHusEl);
        if (callback) callback();
      });
      return;
    }
    if (cardId === 10) { triggerJesusChrist(owner, jesusEl, callback); return; }
    if (callback) callback();
  }

  /* ═══════════════════════════════════════════════════════════════
     AT ONCE ABILITY IMPLEMENTATIONS  (id 2, 3, 4, 5, 8, 9, 13, 23)
  ═══════════════════════════════════════════════════════════════ */

  function abilityScholarOfficials(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    // Count revealed cards at this location, excluding Scholar-Officials (id 2) itself
    var count = 0;
    forEachRevealedAt(slots, locId, function (s) { if (s.cardId !== 2) count++; });
    if (owner === 'player') G.bonusCapitalNextTurn   += count;
    else                    G.aiBonusCapitalNextTurn += count;
    if (count > 0) {
      var slotIdx = slots[locId].findIndex(function (s) { return s && s.cardId === 2; });
      var slotEl  = slotIdx !== -1 ? getSlotEl(owner, locId, slotIdx) : null;
      if (typeof SFX  !== 'undefined') SFX.coinSound();
      if (typeof Anim !== 'undefined' && slotEl) {
        Anim.scholarPulse(slotEl);
        Anim.floatCapital(slotEl, count);
      }
      // Pulse each contributing card so viewers can see what's being counted
      if (typeof Anim !== 'undefined') {
        forEachRevealedAt(slots, locId, function (s, si) {
          if (s.cardId === 2) return;
          var contEl = getSlotEl(owner, locId, si);
          if (contEl) Anim.scholarPulse(contEl);
        });
      }
      // Animations run ~1s — wait before signalling next card
      setTimeout(done, 1050);
      return;
    }
    done();
  }

  function abilityJustinian(owner, locId, done) {
    if (typeof SFX !== 'undefined') SFX.justinianShing();

    // Flash Justinian's own card white
    var justinianEl = findSlotEl(owner, 3);
    if (justinianEl && typeof Anim !== 'undefined') Anim.justinianFlash(justinianEl);

    // Reset ipMod on ALL revealed cards here (both sides), show floats for any that changed
    var anyAffected = false;
    ['player', 'opp'].forEach(function (side) {
      var sl = side === 'player' ? G.playerSlots : G.aiSlots;
      forEachRevealedAt(sl, locId, function (s, si) {

        // ── Clear resurrection-chain accumulator (Samurai 12, Jesus 10) ─
        // The active bonus on the board lives in s.ipMod (as a named
        // source, see commitPlay / placeRevealedCard) and is cleared by
        // the standard ipMod reset below. But the cumulative accumulator
        // — G.cardIPBonus[cardId] — persists between deaths/replays and
        // must be zeroed here too, or the next play would re-apply it.
        //   Samurai (id 12): +2 per resurrection.
        //   Jesus Christ (id 10): +3 per resurrection.
        if (s.cardId === 12 || s.cardId === 10) {
          var resBonusDict = side === 'player' ? G.cardIPBonus : G.aiCardIPBonus;
          if (resBonusDict[s.cardId]) resBonusDict[s.cardId] = 0;
        }

        // ── Standard ipMod reset (Cape, Zheng He, Cortes, Jan Hus, Jesus, Samurai…) ──
        var oldMod = s.ipMod || 0;
        if (oldMod === 0) return;
        anyAffected = true;
        // Mark non-continuous bonus records as reset (display: greyed + initial badge)
        if (s.bonuses) {
          s.bonuses.forEach(function (b) {
            if (!b.continuous) { b.reset = true; b.resetBy = 3; }
          });
        }
        s.ipMod = 0;
        s.ipModSources = [];

        var slotEl = getSlotEl(side, locId, si);
        if (slotEl) {
          var ipEl = slotEl.querySelector('.db-overlay-ip');
          if (ipEl) ipEl.textContent = effectiveIP(s);
          if (typeof Anim !== 'undefined') Anim.justinianFlash(slotEl);
          if (typeof Anim !== 'undefined') Anim.floatNumber(slotEl, -oldMod);
        }
      });
    });

    // White flash is 600ms, float numbers are 750ms — wait for longest animation
    setTimeout(done, anyAffected ? 800 : 650);
  }

  function abilityEmpressWu(owner, locId, done) {
    done = done || function () {};
    var adjLocs = getAdjacentLocIds(locId);
    if (!adjLocs.length) { done(); return; }

    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;

    // Find the highest-IP revealed Political/Military card on the opponent's side
    // at this location. At-Once abilities affect cards currently in play —
    // unrevealed cards aren't yet in play and aren't legal targets.
    var best = null;
    forEachRevealedAt(oppSlots, locId, function (s) {
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (!c || (c.type !== 'Political' && c.type !== 'Military')) return;
      var ip = effectiveIP(s);
      if (!best || ip > best.ip) best = { cardId: s.cardId, ip: ip };
    });
    if (!best) { done(); return; }

    // Canonical: push to an adjacent location with a free slot; if none, destroy.
    var destLocId = null;
    var oppDestSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    for (var i = 0; i < adjLocs.length; i++) {
      if (oppDestSlots[adjLocs[i]].indexOf(null) !== -1) { destLocId = adjLocs[i]; break; }
    }
    var canPush = destLocId !== null;

    var destSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    var destIdx   = canPush ? destSlots[destLocId].indexOf(null) : -1;

    // ── Element refs ──────────────────────────────────────────────
    var wuEl    = findSlotEl(owner, 4);
    var tgtIdx  = oppSlots[locId].findIndex(function (s) { return s && s.cardId === best.cardId; });
    var tgtEl   = tgtIdx !== -1 ? getSlotEl(oppSide, locId, tgtIdx) : null;
    var destEl  = (canPush && destIdx !== -1) ? getSlotEl(oppSide, destLocId, destIdx) : null;

    // ── No-GSAP fallback ─────────────────────────────────────────
    if (!wuEl || typeof gsap === 'undefined') {
      if (canPush) {
        executeMoveAnimated(oppSide, best.cardId, locId, destLocId, {}, function () {
          updateScores(); evaluateContinuous(); refreshSlotIPDisplays(); done();
        });
      } else {
        destroyCard(oppSide, locId, tgtIdx);
        updateScores(); evaluateContinuous(); refreshSlotIPDisplays();
        done();
      }
      return;
    }

    // ── Snapshot positions before any state change ────────────────
    var wuRect   = wuEl.getBoundingClientRect();
    var tgtRect  = tgtEl  ? tgtEl.getBoundingClientRect()  : wuRect;
    var destRect = destEl ? destEl.getBoundingClientRect() : tgtRect;

    var wuCx  = wuRect.left  + wuRect.width  / 2;
    var wuCy  = wuRect.top   + wuRect.height / 2;
    var tgtCx = tgtRect.left + tgtRect.width  / 2;
    var tgtCy = tgtRect.top  + tgtRect.height / 2;

    // Wu flies 85% of the distance to target (stops just before contact)
    var flightX = (tgtCx - wuCx) * 0.85;
    var flightY = (tgtCy - wuCy) * 0.85;

    // Target flies from its current centre to destination slot centre
    var flyDx = (destRect.left + destRect.width  / 2) - tgtCx;
    var flyDy = (destRect.top  + destRect.height / 2) - tgtCy;

    // ── Create ghosts ─────────────────────────────────────────────
    var wuGhost  = makeBoardGhost(wuEl,  500);
    var tgtGhost = tgtEl ? makeBoardGhost(tgtEl, 499) : null;

    // Hide Wu's actual slot while ghost is animating
    gsap.set(wuEl, { opacity: 0 });

    // ── Completion counter (Wu timeline + target wobble) ──────────
    var pending = 2;
    function tryComplete() {
      if (--pending > 0) return;
      removeEl(wuGhost);
      gsap.set(wuEl, { clearProps: 'opacity' });
      updateScores(); evaluateContinuous(); refreshSlotIPDisplays();
      done();
    }

    // ── Wu animation timeline ─────────────────────────────────────
    var tl = gsap.timeline({ onComplete: tryComplete });

    // Rise toward target
    tl.to(wuGhost, { x: flightX, y: flightY, scale: 1.18,
                     duration: 0.32, ease: 'power2.in' });

    // At impact: play SFX, then push (via universal handler) or destroy
    tl.call(function () {
      if (typeof SFX !== 'undefined') SFX.wuPunch();

      if (canPush) {
        // ── Push path: route through universal movement handler ──
        // executeMoveAnimated creates its own slide clone, so tgtGhost is
        // redundant for this path — remove it before the slide begins
        // (otherwise it sits at the source slot for the full ~550ms slide).
        // The destroy path below uses tgtGhost for its scale/fade-out
        // animation, so we don't drop the variable entirely.
        if (tgtGhost) { removeEl(tgtGhost); tgtGhost = null; }
        // Hide the target's real slot so the ghost doesn't flicker against it
        if (tgtEl) gsap.set(tgtEl, { opacity: 0 });
        executeMoveAnimated(oppSide, best.cardId, locId, destLocId, {}, function () {
          if (tgtEl) gsap.set(tgtEl, { clearProps: 'opacity' });
          tryComplete();
        });

      } else {
        // ── Destroy path: no space to push — obliterate the card ──
        destroyCard(oppSide, locId, tgtIdx);

        if (tgtGhost) {
          gsap.to(tgtGhost, {
            scale: 1.3, opacity: 0, duration: 0.35, ease: 'power2.out',
            onComplete: function () { removeEl(tgtGhost); tryComplete(); }
          });
        } else {
          tryComplete();
        }
      }
    });

    // Wu returns to her slot
    tl.to(wuGhost, { x: 0, y: 0, scale: 1.0,
                     duration: 0.28, ease: 'back.out(1.6)' });
  }

  function abilityPacal(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    // Collect other At Once cards at this location (exclude Pacal himself)
    var cards = [];
    forEachRevealedAt(slots, locId, function (s) {
      if (s.cardId === 5) return;
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (c && c.ability && c.ability.indexOf('At Once') !== -1) cards.push(s.cardId);
    });

    // Play Pacal's custom sound immediately
    if (typeof SFX !== 'undefined') SFX.pacalSound();

    // After wipe completes, re-fire each At Once ability one at a time
    function runCards() {
      var idx = 0;
      function next() {
        if (idx >= cards.length) { done(); return; }
        fireAtOnce(owner, cards[idx++], locId, next);
      }
      next();
    }

    // Clock-wipe over Pacal's card, then trigger the chain
    var pacalEl = findSlotEl(owner, 5);
    if (pacalEl && typeof Anim !== 'undefined') {
      Anim.pacalWipe(pacalEl, runCards);
    } else {
      runCards();
    }
  }

  function abilityFrancisOfAssisi(owner, locId, done) {
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    var best = null, bestCC = -1;
    hand.forEach(function (id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      if (c && c.type === 'Religious' && c.cc > bestCC) { bestCC = c.cc; best = id; }
    });
    if (best === null) { done(); return; }
    if (owner === 'player') {
      // Play Francis sfx; once it ends, run the discard (which handles Jesus/Jan Hus chains)
      if (typeof SFX !== 'undefined') {
        SFX.francisSound(function () { discardFromHand('player', best, done); });
      } else {
        discardFromHand('player', best, done);
      }
      return;
    }
    // AI: sfx fires and forgets, discard proceeds immediately
    if (typeof SFX !== 'undefined') SFX.francisSound();
    discardFromHand(owner, best, done);
  }

  function abilityErasmus(owner, locId, done) {
    if (owner === 'opp') {
      // AI: discard a random hand card
      if (G.aiHand.length > 0) {
        if (typeof SFX !== 'undefined') SFX.erasmusSound();
        var pick = G.aiHand[Math.floor(Math.random() * G.aiHand.length)];
        discardFromHand('opp', pick);
      }
      done();
      return;
    }
    // Player: show chooser then resume
    if (G.playerHand.length === 0) { done(); return; }
    if (typeof SFX !== 'undefined') SFX.erasmusSound();
    showDiscardChooser('Choose a card to discard', G.playerHand.slice(), function (chosenId) {
      if (chosenId !== null) { discardFromHand('player', chosenId, done); return; }
      done();
    });
  }

  function abilityCortes(owner, locId, done) {
    var RISE_Y = -16;    // px upward during the sweep
    var slots    = owner === 'player' ? G.playerSlots : G.aiSlots;
    var cortesEl = findSlotEl(owner, 13);

    // ── Blocked: Kente is protecting ──────────────────────────────
    if (isKenteProtected(locId)) {
      if (!cortesEl || typeof gsap === 'undefined') { done(); return; }
      if (typeof SFX !== 'undefined') SFX.mute(true);
      if (typeof SFX !== 'undefined') SFX.cortesDeflate();
      gsap.timeline({
        onComplete: function () {
          gsap.set(cortesEl, { clearProps: 'scale,y' });
          if (typeof SFX !== 'undefined') SFX.mute(false);
          done();
        }
      })
        .to(cortesEl, { scale: 1.3, y: RISE_Y, duration: 0.25, ease: 'back.out(1.5)' })
        .to(cortesEl, { scale: 1.0, y: 0,      duration: 0.30, ease: 'power2.in' });
      return;
    }

    // ── Snapshot victims (all revealed at this loc except Cortes) ─
    var victims = [];
    forEachRevealedAt(slots, locId, function (s, idx) {
      if (s.cardId === 13) return;
      var el   = getSlotEl(owner, locId, idx);
      var rect = el ? el.getBoundingClientRect() : null;
      victims.push({ cardId: s.cardId, ip: effectiveIP(s), slotIdx: idx, el: el, rect: rect });
    });

    // No victims → nothing to do
    if (victims.length === 0) { done(); return; }

    // ── No GSAP: instant destroy (fallback) ───────────────────────
    if (!cortesEl || typeof gsap === 'undefined') {
      var ipGainedFB = 0, afterFnsFB = [];
      victims.forEach(function (v) {
        // Save Samurai's ipMod before destruction so resurrection can restore it
        if (v.cardId === 12) {
          var _fbKey = owner === 'player' ? '_samuraiSavedMod' : '_aiSamuraiSavedMod';
          var _fbSd  = slots[locId][v.slotIdx];
          if (_fbSd) G[_fbKey] = { ipMod: _fbSd.ipMod || 0, ipModSources: (_fbSd.ipModSources || []).slice() };
        }
        var _fbEid = nextEventId();
        if (owner === 'player') {
          G.destroyedIPTotal += v.ip;
          G.destroyedCards.push({ cardId: v.cardId, ip: v.ip, eventId: _fbEid });
          updateWilliamDisplay(); pulseWilliam();
        } else {
          G.aiDestroyedIPTotal += v.ip;
          G.aiDestroyedCards.push({ cardId: v.cardId, ip: v.ip, eventId: _fbEid });
        }
        slots[locId][v.slotIdx] = null;
        clearSlotDOM(owner, locId, v.slotIdx);
        ipGainedFB++;
        if (v.cardId === 7)                        afterFnsFB.push(function () { triggerJanHus(owner, null, function () {}); });
        if (v.cardId === 12)                       afterFnsFB.push(function () { triggerSamurai(owner, locId); });
        if (v.cardId === 14 && owner === 'player') afterFnsFB.push(function () { triggerJoanOfArc(locId); });
        if (v.cardId === 14 && owner === 'opp')    afterFnsFB.push(function () { triggerJoanOfArcAI(locId); });
      });
      if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
      else                    { compactOppSlots(locId);    syncOppSlots(locId);    }
      afterFnsFB.forEach(function (fn) { fn(); });
      var cortesSdFB = slots[locId].find(function (s) { return s && s.cardId === 13; });
      if (cortesSdFB && ipGainedFB > 0) {
        addIPMod(cortesSdFB, ipGainedFB, 'Cortes');
        SOG.ui.showIPFloat(owner, 13, ipGainedFB);
        var cIdx = slots[locId].indexOf(cortesSdFB);
        var cEl  = getSlotEl(owner, locId, cIdx);
        if (cEl) { var ipEl = cEl.querySelector('.db-overlay-ip'); if (ipEl) ipEl.textContent = effectiveIP(cortesSdFB); }
      }
      done();
      return;
    }

    // ── Animated success sequence ─────────────────────────────────
    // Sort right → left so Cortes sweeps from rightmost victim to leftmost
    victims.sort(function (a, b) { return b.slotIdx - a.slotIdx; });

    var cortesRect = cortesEl.getBoundingClientRect();

    // Destination after sweep: slot 0 (Cortes compacts here after victims cleared)
    var slot0El    = getSlotEl(owner, locId, 0);
    var slot0Rect  = slot0El ? slot0El.getBoundingClientRect() : cortesRect;
    var dxFinal    = (slot0Rect.left + slot0Rect.width  / 2) - (cortesRect.left + cortesRect.width  / 2);

    // Separate after-fns so Samurai always runs before Joan, regardless of slot order
    var samuraiAfterFn    = null;   // function(cb) — runs first
    var joanAfterFn       = null;   // function(cb) — runs second
    var otherAfterFns     = [];     // everything else (AI joan, etc.) — sync, runs last
    var ipGained          = 0;
    var williamPulseCount = 0;      // queued after Cortes ends, before Samurai/Joan

    if (typeof SFX !== 'undefined') SFX.mute(true);
    gsap.set(cortesEl, { zIndex: 100, position: 'relative' });

    var tl = gsap.timeline({
      onComplete: function () {
        // Rebuild DOM (cortesEl's old slot becomes empty, Cortes appears at slot 0)
        if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
        else                    { compactOppSlots(locId);    syncOppSlots(locId);    }
        gsap.set(cortesEl, { clearProps: 'all' });

        // Unmute and update Cortes IP before any return animations start
        if (typeof SFX !== 'undefined') SFX.mute(false);
        var cortesSd = slots[locId].find(function (s) { return s && s.cardId === 13; });
        if (cortesSd && ipGained > 0) {
          addIPMod(cortesSd, ipGained, 'Cortes');
          SOG.ui.showIPFloat(owner, 13, ipGained);
          var cIdx    = slots[locId].indexOf(cortesSd);
          var cSlotEl = getSlotEl(owner, locId, cIdx);
          if (cSlotEl) { var ipEl = cSlotEl.querySelector('.db-overlay-ip'); if (ipEl) ipEl.textContent = effectiveIP(cortesSd); }
        }

        // Sync afterFns: William pulses → Samurai → Joan → done()
        otherAfterFns.forEach(function (fn) { fn(); });

        // Find William's element once (board is compacted now)
        var wElFinal = playerHandEl.querySelector('.battle-hand-card[data-id="15"]') ||
                       findSlotEl('player', 15);

        // Order: (pause) → Samurai → (pause) → Joan → (pause) → William
        var orderedFns = [];
        if (samuraiAfterFn) {
          orderedFns.push(function (cb) { setTimeout(cb, 600); });
          orderedFns.push(samuraiAfterFn);
        }
        if (joanAfterFn) {
          // 800ms breathing room after Samurai before Joan begins
          if (samuraiAfterFn) {
            orderedFns.push(function (cb) { setTimeout(cb, 1100); });
          }
          // Wait for Cortes's audio to finish before Joan's audio starts
          orderedFns.push(function (cb) {
            if (typeof SFX !== 'undefined') SFX.afterCortesAudio(cb);
            else cb();
          });
          orderedFns.push(joanAfterFn);
        }
        // William comes last — 800ms pause before his sfx/animation
        if (williamPulseCount > 0) {
          orderedFns.push(function (cb) { setTimeout(cb, 1100); });
          orderedFns.push((function (el) {
            return function (cb) {
              if (!el) { cb(); return; }
              if (typeof SFX  !== 'undefined') SFX.williamGain();
              if (typeof Anim !== 'undefined') Anim.williamPulse(el);
              setTimeout(cb, 1050);
            };
          })(wElFinal));
        }
        var seqIdx = 0;
        function runNext() {
          if (seqIdx >= orderedFns.length) { done(); return; }
          orderedFns[seqIdx++](runNext);
        }
        runNext();
      }
    });

    // Rise and grow
    tl.to(cortesEl, { scale: 1.3, y: RISE_Y, duration: 0.28, ease: 'back.out(1.5)' });
    // Fire charge sound at the peak of the rise
    tl.call(function () { if (typeof SFX !== 'undefined') SFX.cortesCharge(); });

    // Sweep right → left through each victim
    victims.forEach(function (v) {
      var dx = v.rect ? (v.rect.left + v.rect.width  / 2) - (cortesRect.left + cortesRect.width  / 2) : 0;

      // Joan of Arc with a Religious card available → skip shake/fade; ghost will rise later
      var joanSpecial = v.cardId === 14 && owner === 'player' && G.playerHand.some(function (id) {
        var c = CARDS.find(function (x) { return x.id === id; });
        return c && c.type === 'Religious';
      });
      // Jan Hus ghost captured now (before the fade tween runs) so triggerJanHus has an element
      var janHusGhost = (v.cardId === 7 && v.el) ? makeBoardGhost(v.el, 500) : null;

      // Slide Cortes to victim position (maintain rise elevation)
      tl.to(cortesEl, { x: dx, y: RISE_Y, duration: 0.22, ease: 'power2.inOut' });

      // Shake + fade victim (skipped for Joan when she'll summon instead)
      if (v.el && !joanSpecial) {
        tl.to(v.el, { x: -8, duration: 0.05, ease: 'power1.inOut' }, '<')
          .to(v.el, { x:  8, duration: 0.05 })
          .to(v.el, { x: -5, duration: 0.04 })
          .to(v.el, { x:  0, duration: 0.04 })
          .to(v.el, { opacity: 0, scale: 0.7, duration: 0.18, ease: 'power2.in' }, '<0.06');
      }

      // Update game state once victim has faded (or Cortes passes over Joan)
      tl.call((function (victim, isJoanSpecial, jhGhost) {
        return function () {
          var sIdx = slots[locId].findIndex(function (s) { return s && s.cardId === victim.cardId; });
          if (sIdx === -1) return;

          // For Joan-special: ghost her card face before clearing so it persists for summon anim
          var joanGhost = isJoanSpecial ? makeBoardGhost(victim.el, 150) : null;

          // Save Samurai's ipMod before destruction so resurrection can restore it
          if (victim.cardId === 12) {
            var _savedKey = owner === 'player' ? '_samuraiSavedMod' : '_aiSamuraiSavedMod';
            var _sd = slots[locId][sIdx];
            G[_savedKey] = { ipMod: _sd.ipMod || 0, ipModSources: (_sd.ipModSources || []).slice() };
          }

          // Update William's IP display live as each card falls; queue the sound/anim for after Cortes
          var _eid = nextEventId();
          if (owner === 'player') {
            G.destroyedIPTotal += victim.ip;
            G.destroyedCards.push({ cardId: victim.cardId, ip: victim.ip, eventId: _eid });
            updateWilliamDisplay(); williamPulseCount++;
          } else {
            G.aiDestroyedIPTotal += victim.ip;
            G.aiDestroyedCards.push({ cardId: victim.cardId, ip: victim.ip, eventId: _eid });
          }

          slots[locId][sIdx] = null;
          clearSlotDOM(owner, locId, sIdx);
          if (victim.el) gsap.set(victim.el, { clearProps: 'all' });
          ipGained++;

          // Store in named slots — Samurai first, Joan second in the sequential runner
          if (victim.cardId === 12)
            samuraiAfterFn = function (cb) { triggerSamurai(owner, locId, cb); };
          if (isJoanSpecial)
            joanAfterFn    = function (cb) { triggerJoanOfArc(locId, joanGhost, cb); };
          if (victim.cardId === 14 && owner === 'opp')
            otherAfterFns.push(function () { triggerJoanOfArcAI(locId); });
          if (victim.cardId === 7)
            otherAfterFns.push((function (ghost) {
              return function () { triggerJanHus(owner, ghost, function () { if (ghost) removeEl(ghost); }); };
            })(jhGhost));
        };
      })(v, joanSpecial, janHusGhost));
    });

    // Glide to slot 0 position and settle down
    tl.to(cortesEl, { x: dxFinal, y: 0, duration: 0.30, ease: 'power2.out' })
      .to(cortesEl, { scale: 1.0, duration: 0.20, ease: 'power2.inOut' }, '<0.10');
  }

  function abilityZhengHe(owner, locId, done) {
    var slots   = owner === 'player' ? G.playerSlots : G.aiSlots;
    var adjLocs = getAdjacentLocIds(locId);
    var anyAffected = false;
    adjLocs.forEach(function (adjLocId) {
      var found = false;
      slots[adjLocId].forEach(function (s, si) {
        if (!found && s && s.revealed) {
          addIPMod(s, 2, 'Zheng He');
          // Bounce animation + float number (replaces plain showIPFloat)
          var adjSlotEl = getSlotEl(owner, adjLocId, si);
          if (adjSlotEl && typeof Anim !== 'undefined') {
            Anim.zhengheBounce(adjSlotEl);
          } else {
            SOG.ui.showIPFloat(owner, s.cardId, 2);
          }
          found = true;
          anyAffected = true;
        }
      });
    });
    if (anyAffected && typeof SFX !== 'undefined') SFX.zhengheSound();
    // bounce + float animation runs ~750 ms — wait before signalling next card
    setTimeout(done, anyAffected ? 800 : 0);
  }

  /* ═══════════════════════════════════════════════════════════════
     MESOPOTAMIA ABILITY IMPLEMENTATIONS  (Phase B)
  ═══════════════════════════════════════════════════════════════ */

  // Priest (id 38) — At Once: Discard the card in your hand with the
  // lowest CC.  Ties resolved by first-in-hand order.
  function abilityPriest(owner, locId, done) {
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    if (hand.length === 0) { done(); return; }
    var lowestCC = Infinity, lowestId = null;
    hand.forEach(function (id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      if (c && c.cc < lowestCC) { lowestCC = c.cc; lowestId = id; }
    });
    if (lowestId === null) { done(); return; }
    discardFromHand(owner, lowestId, done);
  }

  // Soldier (id 42) — At Once: Strike one of your opponent's cards here
  // and reduce it by -1 IP.  Player gets a chooser; AI auto-picks
  // the highest-IP opponent card.
  function abilitySoldier(owner, locId, done) {
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    var targets  = [];
    forEachRevealedAt(oppSlots, locId, function (s) { targets.push(s); });
    if (targets.length === 0) { done(); return; }

    function applyStrike(targetSd) {
      addIPMod(targetSd, -1, 'Soldier');
      SOG.ui.showIPFloat(oppSide, targetSd.cardId, -1);
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
      setTimeout(done, 400);
    }

    if (owner === 'opp') {
      // AI: pick the highest-IP player card
      var best = targets.reduce(function (a, b) {
        return effectiveIP(a) >= effectiveIP(b) ? a : b;
      });
      applyStrike(best);
      return;
    }
    // Player: chooser over opponent's revealed cards at this location
    var targetIds = targets.map(function (t) { return t.cardId; });
    showDiscardChooser('Choose a card to strike (-1 IP)', targetIds, function (chosenId) {
      if (chosenId === null) { done(); return; }
      var target = targets.find(function (t) { return t.cardId === chosenId; });
      if (!target) { done(); return; }
      applyStrike(target);
    });
  }

  // Hammurabi (id 47) — At Once: Destroy you and your opponent's lowest
  // CC card at this location.  Hammurabi himself is excluded from the
  // search on the owner's side.
  function abilityHammurabi(owner, locId, done) {
    var mySlots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;

    function findLowestCCIndex(slots, skipCardId) {
      var lowestCC = Infinity, lowestIdx = -1;
      forEachRevealedAt(slots, locId, function (s, si) {
        if (skipCardId !== undefined && s.cardId === skipCardId) return;
        var c = CARDS.find(function (x) { return x.id === s.cardId; });
        if (c && c.cc < lowestCC) { lowestCC = c.cc; lowestIdx = si; }
      });
      return lowestIdx;
    }

    var myIdx  = findLowestCCIndex(mySlots,  47);  // skip Hammurabi himself
    var oppIdx = findLowestCCIndex(oppSlots);        // include all opponent cards

    if (myIdx  !== -1) destroyCard(owner,   locId, myIdx);
    if (oppIdx !== -1) destroyCard(oppSide, locId, oppIdx);

    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();
    setTimeout(done, 600);
  }

  // Cuneiform (id 46) — "Writing" — At Once: +1 IP to all of the owner's
  // Prehistory cards IN PLAY (revealed, across every location). A permanent
  // ipMod applied once, now. Face-down Prehistory cards (not yet in play) and
  // hand cards are NOT boosted — the universal At Once rule, enforced via
  // forEachRevealedAt, same as every other slot-touching ability.
  function abilityCuneiform(owner, locId, done) {
    var slots = (owner === 'player') ? G.playerSlots : G.aiSlots;

    function isPrehistory(id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      return !!c && c.type === 'Prehistory';
    }

    var eid = nextEventId();
    G.locations.forEach(function (loc) {
      forEachRevealedAt(slots, loc.id, function (s) {
        if (isPrehistory(s.cardId)) {
          addIPMod(s, 1, 'Cuneiform', eid);
          if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
            SOG.ui.showIPFloat(owner, s.cardId, 1);
          }
        }
      });
    });

    done();
  }

  // The Phoenicians (id 49) — At Once: Attaches itself to one of your
  // Cultural cards here, granting it +3 IP permanently.
  // Player gets a chooser; AI auto-picks the highest-IP Cultural card.
  function abilityPhoenicians(owner, locId, done) {
    var mySlots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var culturalTargets = [];
    forEachRevealedAt(mySlots, locId, function (s, si) {
      if (s.cardId === 49) return;
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (c && c.type === 'Cultural') culturalTargets.push({ sd: s, si: si });
    });
    if (culturalTargets.length === 0) { done(); return; }

    function attach(hostSd) {
      // Remove Phoenicians from its slot
      var phoenIdx = mySlots[locId].findIndex(function (s) { return s && s.cardId === 49; });
      if (phoenIdx !== -1) {
        mySlots[locId][phoenIdx] = null;
        clearSlotDOM(owner, locId, phoenIdx);
        if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
        else                    { compactOppSlots(locId);    syncOppSlots(locId);    }
      }
      // Permanently boost the host (+3 ipMod)
      addIPMod(hostSd, 3, 'The Phoenicians');
      SOG.ui.showIPFloat(owner, hostSd.cardId, 3);
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
      setTimeout(done, 400);
    }

    if (owner === 'opp') {
      var best = culturalTargets.reduce(function (a, b) {
        return effectiveIP(a.sd) >= effectiveIP(b.sd) ? a : b;
      });
      attach(best.sd);
      return;
    }
    var targetIds = culturalTargets.map(function (t) { return t.sd.cardId; });
    showDiscardChooser('Choose a Cultural card for The Phoenicians to attach to', targetIds, function (chosenId) {
      if (chosenId === null) { done(); return; }
      var target = culturalTargets.find(function (t) { return t.sd.cardId === chosenId; });
      if (!target) { done(); return; }
      attach(target.sd);
    });
  }

  // Chariot (id 48) — arrival strike: when the Chariot moves to a new
  // location it strikes the highest-IP opponent card there for -1 IP.
  // Called via opts.onLand from executeMoveAnimated (wired in queueMove).
  function chariotArrival(owner, toLocId, sd, done) {
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    var best = null;
    oppSlots[toLocId].forEach(function (s) {
      if (!s || !s.revealed) return;
      if (!best || effectiveIP(s) > effectiveIP(best)) best = s;
    });
    if (!best) {
      evaluateContinuous(); refreshSlotIPDisplays(); updateScores();
      done(); return;
    }
    addIPMod(best, -1, 'Chariot');
    SOG.ui.showIPFloat(oppSide, best.cardId, -1);
    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();
    setTimeout(done, 400);
  }

  /* ═══════════════════════════════════════════════════════════════
     CONDITIONAL TRIGGERS  (fired by destroyCard / discardFromHand)
  ═══════════════════════════════════════════════════════════════ */

  function triggerJanHus(owner, splitEl, done) {
    if (typeof SFX !== 'undefined') SFX.janHusSplit();

    function applyBuffs() {
      var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
      var affected = [];
      G.locations.forEach(function (loc) {
        slots[loc.id].forEach(function (s) {
          if (s && s.revealed) {
            addIPMod(s, 1, 'Jan Hus');
            affected.push({ owner: owner, cardId: s.cardId });
          }
        });
      });
      refreshSlotIPDisplays();
      updateScores();
      // Staggered +1 floats
      affected.forEach(function (item, i) {
        setTimeout(function () {
          SOG.ui.showIPFloat(item.owner, item.cardId, 1);
          if (typeof SFX !== 'undefined') SFX.ipGained();
        }, i * 150);
      });
      var totalDelay = affected.length * 150 + 400;
      setTimeout(function () { if (done) done(); }, totalDelay);
    }

    if (typeof Anim !== 'undefined' && splitEl) {
      Anim.janHusSplit(splitEl, applyBuffs);
    } else {
      applyBuffs();
    }
  }

  function triggerJesusChrist(owner, handCardEl, callback) {
    var jBonus = owner === 'player' ? G.cardIPBonus : G.aiCardIPBonus;
    jBonus[10] = (jBonus[10] || 0) + 3;

    if (owner !== 'player') {
      // AI path — no animation needed
      G.aiHand.push(10);
      if (callback) callback();
      return;
    }

    // Player path — ascend animation, then return to hand with glow + sound
    function doReturn() {
      G.playerHand.push(10);
      rebuildPlayerHand();
      var newJesusEl = playerHandEl.querySelector('.battle-hand-card[data-id="10"]');
      if (newJesusEl && typeof Anim !== 'undefined') Anim.jesusReturn(newJesusEl);
      if (typeof SFX !== 'undefined') {
        SFX.jesusReturn(callback);  // game resumes 500 ms after the track ends
      } else {
        if (callback) callback();
      }
    }

    if (typeof Anim !== 'undefined' && handCardEl) {
      Anim.jesusAscend(handCardEl, doReturn);
    } else {
      if (handCardEl) handCardEl.remove();
      doReturn();
    }
  }

  function triggerSamurai(owner, locId, done) {
    console.log('[Samurai] triggerSamurai called — owner:', owner, 'locId:', locId);
    var sBonus   = owner === 'player' ? G.cardIPBonus : G.aiCardIPBonus;
    var prevBonus = sBonus[12] || 0;
    var newBonus  = prevBonus + 2;

    // Retrieve any saved ipMod from the destroyed Samurai (Zheng He, Columbus, etc.)
    var savedKey = owner === 'player' ? '_samuraiSavedMod' : '_aiSamuraiSavedMod';
    var savedMod = G[savedKey] || { ipMod: 0, ipModSources: [] };
    delete G[savedKey];

    // Zero out before placeRevealedCard so base IP stays at card.ip (2),
    // then apply the full cumulative as a named ipMod so Justinian can reset it.
    sBonus[12] = 0;
    var placed = placeRevealedCard(owner, locId, 12, 0, { skipLocationAbility: true });
    sBonus[12] = newBonus;
    console.log('[Samurai] placeRevealedCard returned:', placed, '| newBonus:', newBonus);

    var sSlots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var sIdx   = sSlots[locId].findIndex(function (s) { return s && s.cardId === 12; });
    var slotEl = sIdx !== -1 ? getSlotEl(owner, locId, sIdx) : null;

    if (sIdx !== -1) {
      var sd = sSlots[locId][sIdx];
      // newBonus = cumulative resurrection chain (+2 per death).
      // savedMod may contain external bonuses (Zheng He, Columbus, etc.)
      // that lived alongside the prior chain bonus in the old slot's ipMod.
      // Subtract the prior chain (prevBonus) from savedMod to isolate external-only mods.
      var externalMod     = Math.max(0, (savedMod.ipMod || 0) - prevBonus);
      var externalSources = savedMod.ipModSources.filter(function (s) { return s.source !== 'Samurai'; });
      var totalMod = newBonus + externalMod;
      var sources  = externalSources.slice();
      sources.push({ source: 'Samurai', delta: newBonus });
      sd.ipMod        = totalMod;
      sd.ipModSources = sources;
      // Rebuild bonuses[] to match: Samurai chain + any surviving external bonuses
      if (!sd.bonuses) sd.bonuses = [];
      sd.bonuses = sd.bonuses.filter(function (b) { return b.continuous; });
      if (newBonus > 0) addBonus(sd, newBonus, 'card', 12, nextEventId(), 'A', false);
      externalSources.forEach(function (esrc) {
        var info = SOURCE_ID_MAP[esrc.source];
        if (info) addBonus(sd, esrc.delta, info.type, info.id, nextEventId(), info.pattern, false);
        else      addBonus(sd, esrc.delta, 'unknown', null, nextEventId(), 'A', false);
      });
      if (slotEl) {
        var ipEl = slotEl.querySelector('.db-overlay-ip');
        if (ipEl) ipEl.textContent = effectiveIP(sd);
      }
    }

    function finish() {
      if (slotEl && typeof Anim !== 'undefined') Anim.ripple(slotEl);
      if (done) done();
    }

    if (!slotEl || typeof gsap === 'undefined') {
      console.log('[Samurai] triggerSamurai — no slotEl or no GSAP, finishing immediately');
      if (typeof SFX !== 'undefined') SFX.samuraiReturn();
      finish();
      return;
    }

    console.log('[Samurai] triggerSamurai — playing return SFX + spin animation');
    if (typeof SFX !== 'undefined') SFX.samuraiReturn();

    gsap.fromTo(slotEl,
      { rotationY: 360, transformPerspective: 800, backfaceVisibility: 'hidden' },
      {
        rotationY: 0, transformPerspective: 800, backfaceVisibility: 'hidden',
        duration:  0.65,
        ease:      'back.out(1.2)',
        onComplete: function () {
          gsap.set(slotEl, { clearProps: 'all' });
          finish();
        }
      }
    );
  }

  function triggerJoanOfArc(locId, joanGhost, done) {
    // Pick a random Religious card from hand
    var religiousIds = G.playerHand.filter(function (id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      return c && c.type === 'Religious';
    });
    if (religiousIds.length === 0) {
      removeGhost(joanGhost);
      if (done) done();
      return;
    }
    var religiousId = religiousIds[Math.floor(Math.random() * religiousIds.length)];

    // Place the summoned card in game state + DOM immediately (initially hidden)
    placeRevealedCard('player', locId, religiousId, 0, { skipLocationAbility: true });
    var destIdx    = G.playerSlots[locId].findIndex(function (s) { return s && s.cardId === religiousId; });
    var destSlotEl = destIdx !== -1 ? getSlotEl('player', locId, destIdx) : null;
    if (destSlotEl && typeof gsap !== 'undefined') gsap.set(destSlotEl, { opacity: 0 });

    // Remove summoned card from hand
    G.playerHand = G.playerHand.filter(function (id) { return id !== religiousId; });
    var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + religiousId + '"]');

    // No GSAP → instant, no animation (opacity was never set since gsap unavailable)
    if (typeof gsap === 'undefined') {
      removeGhost(joanGhost);
      if (hEl) hEl.remove();
      rebuildPlayerHand();
      if (done) done();
      return;
    }

    // Play the Joan ability sound
    if (typeof SFX !== 'undefined') SFX.joanRise();

    // Ghost the hand card so it can fly independently
    var handGhost = hEl ? makeBoardGhost(hEl, 9999) : null;
    if (hEl) hEl.remove();
    rebuildPlayerHand();

    var tl = gsap.timeline();

    // Joan ghost rises and fades out of her slot (t = 0)
    if (joanGhost) {
      tl.to(joanGhost, {
        y:        -80,
        opacity:  0,
        duration: 0.55,
        ease:     'power2.out',
        onComplete: function () { removeGhost(joanGhost); }
      }, 0);
    }

    // Hand card ghost flies from hand up to destination slot (t = 0.15)
    if (handGhost && destSlotEl) {
      var destRect = destSlotEl.getBoundingClientRect();
      var srcRect  = handGhost.getBoundingClientRect();
      var flyDx    = (destRect.left + destRect.width  / 2) - (srcRect.left + srcRect.width  / 2);
      var flyDy    = (destRect.top  + destRect.height / 2) - (srcRect.top  + srcRect.height / 2);
      tl.to(handGhost, {
        x:        flyDx,
        y:        flyDy,
        duration: 0.50,
        ease:     'power2.inOut',
        onComplete: function () { removeGhost(handGhost); }
      }, 0.15);
    }

    // Reveal destination slot + pulse once ghost has landed (t ≈ 0.65)
    tl.call(function () {
      if (destSlotEl) {
        gsap.set(destSlotEl, { clearProps: 'opacity' });
        if (typeof Anim !== 'undefined') {
          Anim.cardReveal(destSlotEl);
          Anim.ripple(destSlotEl);
        }
      }
      // Fire the summoned card's At Once ability (if any); default case just calls done()
      fireAtOnce('player', religiousId, locId, done || function () {});
    }, null, 0.65);
  }

  function triggerJoanOfArcAI(locId) {
    var religiousId = G.aiHand.find(function (id) {
      var c = CARDS.find(function (x) { return x.id === id; });
      return c && c.type === 'Religious';
    });
    if (religiousId === undefined) return;
    G.aiHand = G.aiHand.filter(function (id) { return id !== religiousId; });
    placeRevealedCard('opp', locId, religiousId, 0, { skipLocationAbility: true });
  }

  /* ═══════════════════════════════════════════════════════════════
     DISCARD CHOOSER UI  (Erasmus + Francis of Assisi)
  ═══════════════════════════════════════════════════════════════ */

  function buildChooserCard(card, cardId) {
    var bonus = G.cardIPBonus[cardId] || 0;
    var el = document.createElement('div');
    el.className = 'discard-card-option';

    var imgWrap = document.createElement('div');
    imgWrap.className = 'db-card-img-wrap';

    var ph = document.createElement('div');
    ph.className  = 'db-card-img-placeholder';
    ph.textContent = card.name.charAt(0);

    var img = window.buildCardImg(card, { size: 'sm' });

    imgWrap.appendChild(ph);
    imgWrap.appendChild(img);

    var ccEl = document.createElement('div');
    ccEl.className   = 'db-overlay-cc';
    ccEl.textContent = card.cc;

    var ipEl = document.createElement('div');
    ipEl.className   = 'db-overlay-ip';
    ipEl.textContent = card.ip + bonus;

    el.appendChild(imgWrap);
    el.appendChild(ccEl);
    el.appendChild(ipEl);
    return el;
  }

  /**
   * Erasmus chooser — shows all hand cards as clickable images.
   * callback(cardId) fires with the chosen card id.
   */
  function showDiscardChooser(title, cardIds, callback) {
    var backdrop = document.createElement('div');
    backdrop.className = 'discard-backdrop';

    var panel = document.createElement('div');
    panel.className = 'discard-panel';

    var titleEl = document.createElement('div');
    titleEl.className   = 'discard-title';
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    var row = document.createElement('div');
    row.className = 'discard-card-row';

    cardIds.forEach(function (cardId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      var cardEl = buildChooserCard(card, cardId);
      cardEl.addEventListener('click', function () {
        document.body.removeChild(backdrop);
        callback(cardId);
      });
      row.appendChild(cardEl);
    });

    panel.appendChild(row);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  /* ═══════════════════════════════════════════════════════════════
     CARD_ABILITIES REGISTRY
     ───────────────────────────────────────────────────────────────
     The single source of truth for what each card *does* at "At Once"
     time. Adding a new card with an At Once ability is a one-object
     change here:
         CARD_ABILITIES[26] = { onAtOnce: function (owner, locId, done) {
           ... your card's ability logic ...
           done();
         } };

     Cards without an entry, or whose entry has no onAtOnce, simply
     call done() and the reveal sequence proceeds (this is the vanilla
     "no special ability" path).

     Future extension points (not implemented in Pass 4 — left as
     comments so the shape is visible):
       • onContinuous(ctx) — replace the hand-rolled switch in
         evaluateContinuous() with per-card hooks
       • onReveal(ctx)     — replace the flip animations baked into
         flipSlot in game.js (Kente / Juvenal / Cosimo / Henry)
       • aiHint(ctx)       — give ai.js's giant strategy a per-card
         scoring weight instead of the hardcoded if/else chain
       • ipDisplay(ctx)    — let cards override how their IP overlay
         renders (Magellan +1 per move, William ticker, etc.)
  ═══════════════════════════════════════════════════════════════ */
  /* ── Tool (id 26) — At Once: draw 1 card ──────────────────────
     The drawn card bypasses the start-of-turn hand-cap check because
     Tool's draw is owned by the ability, not by the start-of-turn
     loop. In the prehistory tutorial battle (4-card hand cap), Tool's
     draw can push the hand from 4 → 5. */
  function abilityTool(owner, locId, done) {
    var deck = owner === 'player' ? G.playerDeck : G.aiDeck;
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    if (deck.length > 0) {
      hand.push(deck.shift());
      if (owner === 'player') rebuildPlayerHand();
      else                    SOG.ui.updateOppHand();
    }
    done();
  }

  /* ── Ötzi (id 35) — reactive: flee ───────────────────────────
     Ötzi relocates to a random OTHER location with an open slot on his own
     side whenever ANOTHER card lands at his location (either side), AFTER he is
     already revealed — never on his own reveal (the fireOnCardLandedHere
     dispatcher excludes the just-landed card). One definition, fired through the
     shared reveal pipeline, so it behaves identically in every battle.
     The slot data + DOM move synchronously (mirrors executeMoveAnimated's
     applyMove, minus the slide + IP-mods), so scoring sees Ötzi at his new
     location. ctx = { owner, locId, slotIndex, slot, landedOwner, landedCardId }. */
  function abilityOtziFlee(ctx) {
    var owner      = ctx.owner;
    var fromLoc    = ctx.locId;
    var ownerSlots = owner === 'player' ? G.playerSlots : G.aiSlots;

    var candidates = G.locations.filter(function (loc) {
      return loc.id !== fromLoc && ownerSlots[loc.id] && ownerSlots[loc.id].indexOf(null) !== -1;
    });
    if (!candidates.length) return;  // nowhere to flee
    var dest = candidates[Math.floor(Math.random() * candidates.length)];

    // Animated relocate. The reactive trigger fires mid-reveal, and POST_REVEAL
    // (1200ms) leaves the slide ample time to finish — and executeMoveAnimated's
    // applyMove updates the score on landing — before any end-of-turn scoring,
    // so no synchronous-data workaround is needed.
    if (SOG.game && typeof SOG.game.executeMoveAnimated === 'function') {
      SOG.game.executeMoveAnimated(owner, 35, fromLoc, dest.id, {}, function () {
        if (typeof console !== 'undefined') console.log('[Otzi] flee: card 35 (' + owner + ') relocated from loc ' + fromLoc + ' to loc ' + dest.id);
      });
    }
  }

  var CARD_ABILITIES = {
    2:  { onAtOnce: abilityScholarOfficials },
    3:  { onAtOnce: abilityJustinian        },
    4:  { onAtOnce: abilityEmpressWu        },
    5:  { onAtOnce: abilityPacal            },
    8:  { onAtOnce: abilityFrancisOfAssisi  },
    9:  { onAtOnce: abilityErasmus          },
    13: { onAtOnce: abilityCortes           },
    23: { onAtOnce: abilityZhengHe          },
    26: { onAtOnce: abilityTool             },  // Prehistory tutorial
    35: { onCardLandedHere: abilityOtziFlee },  // Ötzi — reactive flee (any card lands at his loc after he's revealed)

    /* ── Mesopotamia era ───────────────────────────────────────────
       Phase C cards (37 Sargon, 40 Scribe, 43 Gilgamesh) remain
       stubbed.  Farmer (39) has no ability — no entry.           */
    37: {},  // Sargon — Continuous only; handled in evaluateContinuous via G.locationBoosts
    38: { onAtOnce: abilityPriest       },
    40: {},  // Scribe    — Continuous only; handled in evaluateContinuous
    41: { onAtOnce: function (o, l, done) { done(); } },  // Canals   — Continuous only
    42: { onAtOnce: abilitySoldier      },
    43: {},  // Gilgamesh — Continuous only; handled in evaluateContinuous
    44: { onAtOnce: function (o, l, done) { done(); } },  // Enkidu   — Continuous only
    45: { onAtOnce: function (o, l, done) { done(); } },  // Ziggurat — Continuous only
    46: { onAtOnce: abilityCuneiform    },
    47: { onAtOnce: abilityHammurabi    },
    48: { onAtOnce: function (o, l, done) { done(); } },  // Chariot  — movement ability
    49: { onAtOnce: abilityPhoenicians  },
    50: { onAtOnce: function (o, l, done) { done(); } }   // Nebuchadnezzar — Continuous only
  };

  /* ═══════════════════════════════════════════════════════════════
     FIRE AT ONCE DISPATCHER
     Replaces the old switch statement in game.js. Looks up the
     ability spec in CARD_ABILITIES and invokes onAtOnce if present.
  ═══════════════════════════════════════════════════════════════ */

  function fireAtOnce(owner, cardId, locId, done) {
    // Cards with actual At Once abilities: play sound + pulse animation.
    // Cards 2, 3, 5, 13 have custom sfx — skip the generic 8-bit chime for those.
    // Tool (26) joins the generic-chime list: no custom SFX yet, simple draw effect.
    var hasAtOnce = [4, 8, 9, 23, 26, 38, 42, 46, 47, 49].indexOf(cardId) !== -1;
    if (hasAtOnce) {
      if (typeof SFX !== 'undefined') SFX.atOnce();
      var atSlotEl = findSlotEl(owner, cardId);
      if (atSlotEl && typeof Anim !== 'undefined') Anim.pulseYellow(atSlotEl);
    }
    var spec = CARD_ABILITIES[cardId];
    if (spec && typeof spec.onAtOnce === 'function') {
      spec.onAtOnce(owner, locId, done);
    } else {
      done();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     REACTIVE: ON-CARD-LANDED-HERE DISPATCHER
     ───────────────────────────────────────────────────────────────
     Fired by the reveal pipeline right after a card lands (is revealed) at a
     location. For every OTHER already-revealed card at that location (either
     side), looks up CARD_ABILITIES[id].onCardLandedHere and fires it. The
     just-landed card is EXCLUDED, so a card never reacts to its own reveal —
     this is the trigger for "another card lands at my location after I'm
     revealed" (e.g. Ötzi's flee, id 35). One definition, fired identically in
     every battle whose reveal runs through this pipeline.
  ═══════════════════════════════════════════════════════════════ */
  function fireOnCardLandedHere(landedOwner, landedCardId, locId) {
    if (locId == null) return;
    // Snapshot the reactors first (the abilities mutate the board).
    var reactors = [];
    ['player', 'opp'].forEach(function (side) {
      var slots = (side === 'player' ? G.playerSlots : G.aiSlots)[locId];
      if (!slots) return;
      slots.forEach(function (sd, i) {
        if (!sd || !sd.revealed) return;
        // Exclude the just-landed card (its owner's side + id) so it never
        // reacts to its own arrival. Deck ids are unique, so this is exact.
        if (side === landedOwner && sd.cardId === landedCardId) return;
        var spec = CARD_ABILITIES[sd.cardId];
        if (spec && typeof spec.onCardLandedHere === 'function') {
          reactors.push({ owner: side, locId: locId, slotIndex: i, slot: sd, cardId: sd.cardId });
        }
      });
    });
    reactors.forEach(function (r) {
      CARD_ABILITIES[r.cardId].onCardLandedHere({
        owner: r.owner, locId: r.locId, slotIndex: r.slotIndex, slot: r.slot,
        landedOwner: landedOwner, landedCardId: landedCardId
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.abilities = {
    /* Dispatch + engine */
    fireAtOnce:                fireAtOnce,
    fireOnCardLandedHere:      fireOnCardLandedHere,
    evaluateContinuous:        evaluateContinuous,
    /* Shared ability helpers (callable from game.js if needed) */
    isKenteProtected:          isKenteProtected,
    destroyCard:               destroyCard,
    discardFromHand:           discardFromHand,
    updateWilliamDisplay:      updateWilliamDisplay,
    pulseWilliam:              pulseWilliam,
    updateKenteGlows:          updateKenteGlows,
    /* UI */
    showDiscardChooser:        showDiscardChooser,
    buildChooserCard:          buildChooserCard,
    showRevealFirstHighlight:  showRevealFirstHighlight,
    hideRevealFirstHighlight:  hideRevealFirstHighlight,
    /* Helpers */
    getAdjacentLocIds:              getAdjacentLocIds,
    chariotArrival:                 chariotArrival,
    /* The registry itself — exposed so future passes / pro devs can
       extend it without touching this file. */
    CARD_ABILITIES:            CARD_ABILITIES
  };

})();

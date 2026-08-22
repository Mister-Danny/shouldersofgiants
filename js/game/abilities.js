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
  var effectiveCost         = SOG.board.effectiveCost;
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

  /* Effective ABILITY id for a slot. Normally the card's own id, but Rosetta
     Stone (58) "Decipher The Past" ADOPTS another card's ability and stores that
     source id in sd.transcribedFrom — so for ability-DISPATCH purposes (the
     end-of-turn queue and the continuous type-boost detections) Rosetta counts
     as the transcribed card. Only Rosetta ever sets transcribedFrom, so this is
     inert (returns sd.cardId) for every non-Rosetta card and every battle that
     doesn't deck Rosetta. */
  function abilityIdOf(sd) {
    if (!sd) return null;
    return (sd.transcribedFrom != null) ? sd.transcribedFrom : sd.cardId;
  }

  /* Effective CC for a BOARD slot. Normally the card def's CC, but a created Mummy
     (Batch C) inherits its source card's CC onto sd.cc — so ALL game-logic CC reads
     on board cards (Juvenal's CC≥4 penalty, Hammurabi's lowest-CC destroy, AI CC
     scoring, the CC badge) must honor it. Only the Mummy ever sets sd.cc, so this is
     identical to the card def's CC for every other card. Exported for game.js/ai.js. */
  function effectiveCC(sd) {
    if (!sd) return 0;
    if (sd.cc != null) return sd.cc;
    var c = CARDS.find(function (x) { return x.id === sd.cardId; });
    return c ? c.cc : 0;
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
    return G.playerSlots[locId].some(function (s) { return s && s.revealed && abilityIdOf(s) === 17; }) ||
           G.aiSlots[locId].some(    function (s) { return s && s.revealed && abilityIdOf(s) === 17; });
  }

  /* ── CAN `owner`'S CARDS AT locId BE DESTROYED? ───────────────────────────
     The SINGLE gate every destruction path consults, so the rule is stated once
     instead of re-derived per ability. Two protections feed it, with different
     scopes — both LOCATION-WIDE (they shield every card there, not just the
     protector itself):
       • Kente (17)  — SYMMETRIC: either side's Kente freezes the whole location.
       • Sphinx (64) — PER-SIDE: it shields its OWNER's cards there ("Your cards
         here"), which is the same scope its IP-reduction protection already uses.
     Consulted by destroyCard (covering Wu Zetian, Hammurabi, the Egypt Soldier)
     and by the two abilities that destroy WITHOUT going through destroyCard —
     Cortes, which inlines its own sweep, and Hammurabi, which must call off the
     whole trade rather than half of it. Egypt-only for the Sphinx half, so this is
     identical to the old Kente-only behaviour in every non-Egypt battle. */
  function isDestroyProtected(owner, locId) {
    return isKenteProtected(locId) || isSphinxProtected(owner, locId);
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

  /* ── HIEROGLYPHICS (62) boost pulse — EDGE-TRIGGERED ─────────────────────────
     Fires when a card GAINS the Hieroglyphics aura, and only then.

     This is the counterpart to updateKenteGlows / updateNarmerGlows below, with
     one deliberate difference: those are LEVEL-driven (the glow is on for as long
     as the condition holds), this is EDGE-driven (a momentary flash at the moment
     the boost appears). So it cannot simply read the current state — it has to
     compare against the previous pass.

     The comparison is per-slot-data, using two flags:
       _hieroNow     — set by THIS pass's aura block for every boosted card
       _hieroBoosted — what the same test said on the PREVIOUS pass
     gained = now && !was. Then _hieroBoosted is updated and _hieroNow cleared, so
     the next pass starts from a clean slate.

     That single comparison gives all six trigger rules without special-casing any
     of them, because every one of them is just "who newly gained the aura":
       • Hieroglyphics revealed onto qualifying cards → they all gain at once
       • a qualifying card played or MOVED in afterwards → it alone gains
       • Hieroglyphics itself moves in → everyone there gains at once
       • a card moves away, or Hieroglyphics leaves → now=false, was=true: NO event
       • an unrelated recompute → nothing changed, so nothing gains, so no re-flash
     The flags live on the slot data, which travels with the card when it moves, so
     a card carrying its boost from one location to another does not re-flash.

     ONE SFX PER EVENT, not per card: a batch of simultaneous gains is one sound and
     a simultaneous flash. Purely presentational — the aura itself is the recompute's
     business and has already been applied by the time this runs. */
  function pulseHieroglyphicsGains() {
    var gainedEls = [];
    var anyGain = false;

    ['player', 'opp'].forEach(function (own) {
      var slots = own === 'player' ? G.playerSlots : G.aiSlots;
      G.locations.forEach(function (loc) {
        (slots[loc.id] || []).forEach(function (s, si) {
          if (!s) return;
          var now = !!s._hieroNow;
          var was = !!s._hieroBoosted;
          if (now && !was) {
            anyGain = true;
            var el = getSlotEl(own, loc.id, si);
            if (el) gainedEls.push(el);
          }
          s._hieroBoosted = now;      // remember for the next pass
          s._hieroNow     = false;    // clear this pass's mark
        });
      });
    });

    if (!anyGain) return;
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.hieroglyphicsPulse === 'function') {
      rfx.hieroglyphicsPulse(gainedEls, 'sfx/hieroglyphs.mp3');
    }
  }

  /* ── NARMER (51) "The Unifier" — persistent red glow ─────────────────────────
     Lights Narmer's own card and, for HIS OWNER'S SIDE ONLY, the score number at
     his location and at each ADJACENT location, for as long as his Continuous
     ability is active.

     The affected set is NOT recomputed here. It is read straight off
     G.narmerGlow, which the averaging pass itself writes as it runs (see the
     "FINAL PASS" block in evaluateContinuous) — so the glow is by construction
     the same [narmerLoc] + getAdjacentLocIds(narmerLoc) the ability acts on. That
     buys three behaviours for free, with no extra wiring:
       • He MOVES     → the next continuous pass re-scans the board, G.narmerGlow
                        points at the new location, old nameplates go dark.
       • He's DESTROYED / leaves play → the pass finds no Narmer, the side's entry
                        stays empty, and every glow is cleared. No orphans.
       • BOSS or PLAYER → the pass loops ['player','opp'] over the same code, so a
                        boss Narmer in his own fight and a player who plays card 51
                        light up identically. Nothing context-specific here.
     Each side is lit INDEPENDENTLY on its own score digits, so two Narmers (one
     per side) each mark their own averaged totals without fighting over one plate.
     Called from the evaluateContinuous tail beside updateKenteGlows, i.e. after
     every board-state change. */
  function updateNarmerGlows() {
    if (!boardEl || typeof Anim === 'undefined') return;

    // The glow lands on each side's own SCORE NUMBER, PER SIDE — not on the shared
    // location nameplate. Narmer's averaging only ever touches HIS OWNER's totals,
    // so the owner's score digit is the thing his ability actually changes, and
    // lighting it says that precisely. It also makes both-sides-have-Narmer work:
    // the player's Narmer lights the cyan player digits, the opponent's lights the
    // red opponent digits, and where the two groups overlap both digits light
    // independently. A single shared nameplate could not express that.
    ['player', 'opp'].forEach(function (own) {
      var g   = G.narmerGlow && G.narmerGlow[own];
      var lit = {};
      if (g && g.group) g.group.forEach(function (id) { lit[id] = true; });
      G.locations.forEach(function (loc) {
        var scoreEl = document.getElementById('loc-score-' + own + '-' + loc.id);
        Anim.setNarmerScoreGlow(scoreEl, !!lit[loc.id]);
      });
    });

    // Narmer's OWN card — glows only on the slot holding him, per side.
    ['player', 'opp'].forEach(function (own) {
      var g     = (G.narmerGlow && G.narmerGlow[own]) || null;
      var slots = own === 'player' ? G.playerSlots : G.aiSlots;
      G.locations.forEach(function (loc) {
        (slots[loc.id] || []).forEach(function (s, si) {
          var el = getSlotEl(own, loc.id, si);
          if (!el) return;
          var isNarmer = !!(s && s.revealed && abilityIdOf(s) === 51 &&
                            g && g.locId === loc.id);
          Anim.setNarmerGlow(el, isNarmer);
        });
      });
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
        if (sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 18; })) {
          ['player','opp'].forEach(function (to) {
            var ts = to === 'player' ? G.playerSlots : G.aiSlots;
            ts[loc.id].forEach(function (s) {
              if (!s || !s.revealed) return;
              if (effectiveCC(s) >= 4) {   // honors a Mummy's inherited CC (sd.cc)
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
        if (rev.length === 1 && abilityIdOf(rev[0]) === 20) {
          rev[0].contMod = (rev[0].contMod || 0) + 4;
          rev[0].contModSources.push({ source: 'Voltaire', delta: 4 });
          addBonus(rev[0], 4, 'card', 20, nextEventId(), 'A', true);
        }
      });

      // William the Conqueror (id 15): contMod = total destroyed IP for that owner
      G.playerSlots[loc.id].forEach(function (s) {
        if (s && s.revealed && abilityIdOf(s) === 15) {
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
        if (s && s.revealed && abilityIdOf(s) === 15) {
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

      // ── River type-boosts (LABOR_PLUS_2_HERE / MILITARY_PLUS_1_HERE) are now AT
      //    ONCE, not continuous: stamped exactly once at a card's reveal-on-the-river
      //    via applyRiverAtOnce() (reveal-end, mirroring applyCapitalWhenFull). Moved
      //    OUT of evaluateContinuous so the bonus bakes in permanently (addIPMod) and
      //    a card relocated ONTO a river later is NOT boosted. Shared by the Hammurabi
      //    + Nebuchadnezzar battles. See applyRiverAtOnce below.

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

      // Tribe (id 36): "Next Turn — Gain +1 IP for every card you play here."
      // Delayed/continuous effect (NOT an At Once — its description no longer says
      // "At Once", so Pacal's text-based At-Once trigger skips it; the grant was
      // always computed here, never via an onAtOnce handler). Starting the turn
      // AFTER Tribe was played (turnPlayed >= tribe.turnPlayed + 1) — NOT just that
      // one turn — Tribe gains +1 for every OTHER same-owner card revealed at
      // Tribe's location. "This location" means wherever Tribe CURRENTLY sits: the
      // whole block is scoped to sl[loc.id] for the location being evaluated THIS
      // pass, so if Tribe moves, this same recompute (fresh every call — see the
      // contMod/contModSources reset above) naturally re-finds it at its new
      // location and counts THAT location's qualifying reveals — cards left behind
      // at Tribe's old location stop counting the moment Tribe is no longer in
      // that location's slot array, no separate move-tracking needed.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (tribe, tribeIdx) {
          if (!tribe || !tribe.revealed || abilityIdOf(tribe) !== 36) return;
          if (typeof tribe.turnPlayed !== 'number') return;
          var nextTurn = tribe.turnPlayed + 1;
          var count = 0;
          sl[loc.id].forEach(function (s, si) {
            if (s && s.revealed && si !== tribeIdx && s.turnPlayed >= nextTurn) count++;
          });
          if (count > 0) {
            tribe.contMod = (tribe.contMod || 0) + count;
            tribe.contModSources.push({ source: 'Tribe', delta: count });
            addBonus(tribe, count, 'card', 36, nextEventId(), 'A', true);
          }
        });
      });

      // ── Mesopotamia continuous abilities ────────────────────────

      // Enkidu (id 44): +2 IP to the slots adjacent (index ±1) here
      // (same owner, revealed). Stronger cousin of Domesticated Animal (id 32, +1).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (enkidu, enkiduIdx) {
          if (!enkidu || !enkidu.revealed || abilityIdOf(enkidu) !== 44) return;
          [enkiduIdx - 1, enkiduIdx + 1].forEach(function (adjIdx) {
            var s = sl[loc.id][adjIdx];
            if (s && s.revealed) {
              s.contMod = (s.contMod || 0) + 2;
              s.contModSources.push({ source: 'Enkidu', delta: 2 });
              addBonus(s, 2, 'card', 44, nextEventId(), 'A', true);
            }
          });
        });
      });

      // Canals (id 41): +1 IP to all Labor-type cards here (same owner).
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (!sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 41; })) return;
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
        if (!sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 45; })) return;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || abilityIdOf(s) === 45) return;  // exclude the Ziggurat source itself
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && c.type === 'Religious') {
            s.contMod = (s.contMod || 0) + 1;
            s.contModSources.push({ source: 'Ziggurat', delta: 1 });
            addBonus(s, 1, 'card', 45, nextEventId(), 'A', true);
          }
        });
      });

      // ── Egypt continuous type-boosts ────────────────────────────
      // Hieroglyphics (id 62): +1 IP to the OWNER'S Religious AND Political cards
      // here (same family as Ziggurat; two types, +1). Excludes itself (Cultural).
      // Two Hieroglyphics at one location do NOT stack: the guard below asks whether
      // ANY is present, then boosts each qualifying card once.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        if (!sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 62; })) return;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || abilityIdOf(s) === 62) return;
          var c = CARDS.find(function (x) { return x.id === s.cardId; });
          if (c && (c.type === 'Religious' || c.type === 'Political')) {
            s.contMod = (s.contMod || 0) + 1;
            s.contModSources.push({ source: 'Hieroglyphics', delta: 1 });
            addBonus(s, 1, 'card', 62, nextEventId(), 'A', true);
            s._hieroNow = true;          // this pass's boost set — see pulseHieroglyphicsGains
          }
        });
      });

      // Pyramid (id 57) is no longer Continuous — it is now an At Once ability
      // (abilityPyramid): the Pyramid permanently GAINS the IP of the last card
      // its owner played at its location. See CARD_ABILITIES[57].

      // Scribe (id 40) is no longer Continuous — it is now an At Once ability
      // (abilityScribe) that applies a one-time +1 IP to the owner's other cards
      // here as each stamp lands. See CARD_ABILITIES[40] / reveal-fx stamping.

      // Gilgamesh (id 43): +1 IP for all OTHER Cultural cards the owner has played
      // this game — Gilgamesh does NOT boost himself. culturalCount is all-time
      // (persists through destruction) and includes Gilgamesh's own play (he's
      // Cultural), so subtract 1 to exclude him. Self-portrait attribution.
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s) {
          if (!s || !s.revealed || abilityIdOf(s) !== 43) return;
          // The -1 excludes the SOURCE card from its own count, but only when the
          // source is itself a Cultural card tallied in culturalCount. Real Gilgamesh
          // is Cultural → subtract himself (identical to before). A projector whose
          // OWN type isn't Cultural (e.g. Rosetta, Scientific) was never counted, so
          // it subtracts nothing.
          var _src         = CARDS.find(function (x) { return x.id === s.cardId; });
          var _selfCounted = (_src && _src.type === 'Cultural') ? 1 : 0;
          var bonus = ((G.culturalCount && G.culturalCount[own]) || 0) - _selfCounted;
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
        if (!sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 37; })) return;
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

    /* ── Pi-Ramses / Karnak Temple / Abu Simbel (Ramses battle locations) ────────
       All three recompute FRESH every evaluateContinuous pass (never a one-time
       accumulator) — the underlying condition (highest IP here / all slots filled)
       is itself derived from board state each time, same as ALL_MINUS_ONE_IP /
       Sargon / Narmer above. Positioned AFTER the main per-location loop (not
       inside it) so every other continuous card modifier at these locations is
       already baked into contMod before "highest IP here" is measured — mirroring
       Narmer's own "final pass" placement immediately below. */
    G.locations.forEach(function (loc) {
      // Pi-Ramses (+2 IP) / Karnak Temple (double IP): applies to whichever
      // revealed card(s) — EITHER side — currently hold the highest effective IP
      // here. Neither ability's text says "your"/"the owner's", so this compares
      // BOTH sides' cards together (the same both-sides convention as
      // ALL_MINUS_ONE_IP), not each side's own top card independently. Ties: ALL
      // tied cards get the bonus — explicit in Karnak's own text; Pi-Ramses'
      // text doesn't specify a tie rule, so the same tie-inclusive approach
      // applies there too, for consistency rather than picking one card
      // arbitrarily among ties.
      //
      // TRANSFER CUE — this is the only ability in the game that compares across
      // both sides for a single winner, so a card can silently LOSE this bonus
      // because of something the OPPONENT played, with no other on-screen change
      // to explain why. `_ramsesWinner` is a flag stored directly on the slot
      // object (untouched by the contMod/contModSources reset above, so it
      // survives across passes) — "was this card winning the contest here last
      // time we checked." We fire a cue ONLY on an actual gain/loss transition
      // this pass, never on every recompute, and the sound fires at most once per
      // location per pass (not once per card) so a tie broken by one bigger
      // arrival doesn't stutter.
      if (loc.abilityKey === 'HIGHEST_IP_PLUS_2_HERE' || loc.abilityKey === 'DOUBLE_HIGHEST_IP_HERE') {
        var locName = loc.name || 'this location';
        var allHere = [];
        ['player', 'opp'].forEach(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          sl[loc.id].forEach(function (s, si) { if (s && s.revealed) allHere.push({ s: s, own: own, si: si }); });
        });
        var winners = [];
        if (allHere.length) {
          var maxIP = allHere.reduce(function (m, e) { return Math.max(m, effectiveIP(e.s)); }, -Infinity);
          winners = allHere.filter(function (e) { return effectiveIP(e.s) === maxIP; });
          winners.forEach(function (e) {
            var delta = (loc.abilityKey === 'DOUBLE_HIGHEST_IP_HERE') ? effectiveIP(e.s) : 2;
            e.delta = delta;
            if (delta !== 0) {
              e.s.contMod = (e.s.contMod || 0) + delta;
              e.s.contModSources.push({ source: locName, delta: delta });
              addBonus(e.s, delta, 'location', loc.id, nextEventId(), 'A', true);
            }
          });
        }
        var transferred = false;
        allHere.forEach(function (e) {
          var isWinnerNow = winners.indexOf(e) !== -1;
          var wasWinner   = !!e.s._ramsesWinner;
          if (isWinnerNow !== wasWinner) {
            transferred = true;
            var slotEl = getSlotEl(e.own, loc.id, e.si);
            if (slotEl && typeof Anim !== 'undefined') {
              if (isWinnerNow) {
                Anim.pulseYellow(slotEl);
                Anim.floatNumber(slotEl, e.delta);
              } else {
                Anim.pulseRed(slotEl);
                Anim.floatNumber(slotEl, -(e.s._ramsesDelta || 0));
              }
            }
          }
          e.s._ramsesWinner = isWinnerNow;
          if (isWinnerNow) e.s._ramsesDelta = e.delta;
        });
        if (transferred && typeof SOG !== 'undefined' && SOG.sfx && typeof SOG.sfx.play === 'function') {
          SOG.sfx.play('sfx/yoink.mp3');
        }
      }

      // Abu Simbel: +6 IP to the LOCATION TOTAL (not any one card — "fill all 4
      // slots ... gain IP here" rewards the location, not a card), per side that
      // has every slot here filled. Written to G.locationBoosts (same table
      // Sargon/Narmer use), re-derived fresh each pass rather than granted once —
      // G.locationBoosts is rebuilt from scratch every evaluateContinuous call
      // (see comment at the top of this function), so a one-time push would be
      // wiped by the very next pass. Re-deriving "is full" each time is both
      // simpler and correct here: once slots are revealed they don't become
      // unrevealed in normal play, so this reads as permanent without needing a
      // separate once-per-turn trigger the way CAPITAL_WHEN_FULL needs one for
      // its NEXT-TURN capital grant (that one really is a one-shot accumulator
      // credit; this one is a recomputed location-total addend). "Filled" means
      // occupied (a card is played there), matching CAPITAL_WHEN_FULL's own
      // check — it does not require the card be revealed yet.
      if (loc.abilityKey === 'FULL_SLOTS_PLUS_6_HERE') {
        ['player', 'opp'].forEach(function (own) {
          var sl = own === 'player' ? G.playerSlots : G.aiSlots;
          if (sl[loc.id].length && sl[loc.id].indexOf(null) === -1 && G.locationBoosts[loc.id]) {
            G.locationBoosts[loc.id][own].push({
              sourceCardId: null, sourceOwner: own, sourceLocId: loc.id, amount: 6
            });
          }
        });
      }
    });

    /* ── Narmer (id 51) "The Unifier" — total-IP averaging (FINAL PASS) ──────────
       Runs AFTER every other continuous mod + location boost, so it averages the
       FINAL computed totals. For NARMER'S OWNER ONLY (opponent untouched): take
       the owner's total IP at Narmer's location and each adjacent location, SUM,
       and redistribute EQUALLY. Cards don't move — we only add a per-location
       delta into G.locationBoosts (the same table updateScores + tallyResult sum),
       so the location TOTALS become the average while per-card IP badges stay
       truthful. Remainder → Narmer's OWN location first, then neighbours in order
       (e.g. 31 across 3 → 11/10/10). locationBoosts is rebuilt each pass, so no
       compounding. Inert until an Egypt battle decks Narmer. */
    // Rebuilt from scratch on every pass, exactly like G.locationBoosts above, so
    // the GLOW below reads the same set the averaging actually used — no parallel
    // adjacency calc, and no stale entry when Narmer moves or leaves play.
    G.narmerGlow = { player: { locId: null, group: [] }, opp: { locId: null, group: [] } };
    ['player', 'opp'].forEach(function (own) {
      var sl = own === 'player' ? G.playerSlots : G.aiSlots;
      var narmerLoc = null;
      G.locations.forEach(function (loc) {
        if (sl[loc.id].some(function (s) { return s && s.revealed && abilityIdOf(s) === 51; })) narmerLoc = loc.id;
      });
      if (narmerLoc === null) return;
      // Group = Narmer's loc (FIRST — gets the remainder) + its adjacents.
      var group = [narmerLoc].concat(getAdjacentLocIds(narmerLoc));
      G.narmerGlow[own] = { locId: narmerLoc, group: group };
      function ownerTotal(locId) {
        var t = 0;
        sl[locId].forEach(function (s) { if (s && s.revealed) t += effectiveIP(s); });
        if (G.locationBoosts[locId]) G.locationBoosts[locId][own].forEach(function (b) { t += b.amount; });
        return t;
      }
      var totals = group.map(ownerTotal);
      var sum    = totals.reduce(function (a, b) { return a + b; }, 0);
      var n      = group.length;
      var base   = Math.floor(sum / n);
      var rem    = sum - base * n;                 // 0..n-1 remainder points
      group.forEach(function (locId, i) {
        var target = base + (i < rem ? 1 : 0);     // remainder → Narmer's own loc first
        var delta  = target - totals[i];
        if (delta !== 0 && G.locationBoosts[locId]) {
          G.locationBoosts[locId][own].push({
            sourceCardId: 51, sourceOwner: own, sourceLocId: narmerLoc, amount: delta
          });
        }
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

    // Canals (id 41) water border + sfx — PRESENTATION ONLY, derived from the SAME
    // continuous pass that computes the boost, so it is correct in every stop-condition
    // (Canals leaves, a boosted card moves, Canals moves, a card stops qualifying).
    // A card is Canals-boosted iff its contModSources contains a 'Canals' source. Each
    // eval: boosted cards get/keep the persistent .canals-water class; all others have
    // it removed. The waterflow sfx fires ONCE per eval in which ANY card NEWLY
    // transitions not-boosted -> boosted (tracked via the persistent s.canalsBoosted
    // flag) — so a reveal that boosts several cards plays once, and a later single
    // arrival plays once for that card; a card that was already boosted never replays.
    var canalsNewBoost = false;
    G.locations.forEach(function (loc) {
      ['player', 'opp'].forEach(function (own) {
        var sl = own === 'player' ? G.playerSlots : G.aiSlots;
        sl[loc.id].forEach(function (s, si) {
          var boosted = !!(s && s.revealed && s.contModSources &&
            s.contModSources.some(function (src) { return src.source === 'Canals'; }));
          if (s) {
            if (boosted && !s.canalsBoosted) canalsNewBoost = true;   // not-boosted -> boosted
            s.canalsBoosted = boosted;
          }
          var slotEl = getSlotEl(own, loc.id, si);
          if (slotEl) slotEl.classList.toggle('canals-water', boosted);   // also clears empty/old slots
        });
      });
    });
    if (canalsNewBoost && typeof SFX !== 'undefined' && typeof SFX.waterflowSound === 'function') {
      SFX.waterflowSound();
    }

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
      // Update Narmer's persistent "unified lands" glow (card + nameplates)
      updateNarmerGlows();
      // Flash any card that JUST gained the Hieroglyphics aura (edge-triggered)
      pulseHieroglyphicsGains();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CORE: destroyCard + discardFromHand
     These fire the conditional triggers (Jan Hus, Jesus, Samurai,
     Joan of Arc) and accumulate William's destruction counter.
  ═══════════════════════════════════════════════════════════════ */

  /* ── DOES A CARD THAT LEAVES PLAY STAY GONE? ─────────────────────────────
     The SINGLE source of truth for BOTH piles (destroyed + discard). A card may
     enter a pile only if it does NOT bring itself back:
       • Jesus (10)   — discarded  → +3 IP and RETURNS TO YOUR HAND.
       • Samurai (12) — destroyed  → +2 IP and RETURNS TO THE SAME LOCATION.
     Everything else STAYS DEAD and is revivable — including cards that early-return
     from discardFromHand/destroyCard for animation reasons but never come back:
     Jan Hus (7) fires his boost-to-cards-in-play on the way out and is gone for
     good; Joan of Arc (14) summons a DIFFERENT card from hand and stays destroyed.
     The test is "does THIS card return to play or hand?", NEVER "does the call site
     early-return?".
     The rule is keyed by EXIT, because both returns are exit-specific: Samurai's
     revival fires only from destroyCard, Jesus's only from discardFromHand. So a
     Jesus DESTROYED on the board (Cortes, Hammurabi, Soldier) and a Samurai
     DISCARDED from hand both stay dead, and both are correctly revivable. Still one
     table consulted by both piles — never call-site ordering. An unknown exit is
     treated conservatively (not piled).
     WHY IT MATTERS: the Priest (71) revives from both piles. Without this gate a
     Samurai would leave a destroyed-pile entry, be revived as a Mummy, and still be
     standing on the board — a duplication exploit. */
  var RETURNS_TO_PLAY = { 10: 'discard', 12: 'destroy' };
  function staysDead(cardId, exit) {
    var back = RETURNS_TO_PLAY[cardId];
    if (!back) return true;                 // never comes back by any exit
    return exit ? back !== exit : false;    // no exit given → assume it comes back
  }

  /* Batch C — DESTROYED-CARD pile. Every card destroyed on the board records an
     entry in the DESTROYED owner's pile, unless it revives itself (staysDead).
     Stores effective stats at destruction so a destroyed token (Mummy) keeps its
     inherited IP/CC and a buffed card revives with the buff. Consumed by the Priest
     (71), which merges this pile with the discard pile. Cleared per battle
     (game.js). Distinct from G.destroyedCards (William's IP accumulator), which
     this does not touch. */
  function pushDestroyed(owner, sd, dIP) {
    if (!sd || !staysDead(sd.cardId, 'destroy')) return;
    var entry = { cardId: sd.cardId, ip: dIP, cc: effectiveCC(sd) };
    if (owner === 'player') { (G.playerDestroyed = G.playerDestroyed || []).push(entry); }
    else                    { (G.aiDestroyed     = G.aiDestroyed     || []).push(entry); }
  }

  function destroyCard(owner, locId, slotIndex, opts) {
    opts = opts || {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var sd    = slots[locId][slotIndex];
    if (!sd) return;
    // Protection gate (Kente + Sphinx) — checked BEFORE any state changes, so a
    // protected card leaves no destroyed-pile entry and fires no death trigger.
    if (!opts.skipProtection && isDestroyProtected(owner, locId)) return;

    var dIP    = effectiveIP(sd);
    var cardId = sd.cardId;
    var dEid   = nextEventId();
    pushDestroyed(owner, sd, dIP);   // Batch C destroyed pile (separate from discards; runs on every real destroy)
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

    // opts.skipAnim: the CALLER owns the destroy presentation (e.g. Hammurabi's
    // sword-strike + card-split FX), so suppress the generic destroyed sfx + shake
    // to avoid doubling. All state side effects below still run.
    if (!opts.skipAnim) {
      if (typeof SFX !== 'undefined') SFX.cardDestroyed();
      if (dSlotEl && typeof Anim !== 'undefined') Anim.shake(dSlotEl);
    }

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
   * Removes from hand state/DOM, records the discard in the owner's resurrection
   * pile, and fires If/When-discarded triggers.
   */
  function discardFromHand(owner, cardId, callback, opts) {
    opts = opts || {};
    /* Snapshot the card's in-hand stats BEFORE anything mutates them (Jesus's
       +3 is stamped by his own trigger below). */
    var discardStats = handStats(owner, cardId);
    // Discard sound: a caller-supplied sfx (e.g. Priest's priest.m4a) replaces the
    // generic whoosh for THAT discard only; every other caller keeps the whoosh.
    if (opts.sfx) { SOG.sfx.play(opts.sfx); }
    else if (typeof SFX !== 'undefined') SFX.cardDiscarded();
    var jesusEl  = null;
    var janHusEl = null;
    if (owner === 'player') {
      G.playerHand = G.playerHand.filter(function (id) { return id !== cardId; });
      var hEl = playerHandEl.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
      if (hEl) {
        if (cardId === 10) { jesusEl  = hEl; }  // hold for Jesus ascend animation
        else if (cardId === 7) { janHusEl = hEl; }  // hold for Jan Hus split animation
        else if (opts.animate && typeof Anim !== 'undefined' &&
                 typeof Anim.cardDiscarded === 'function') {
          Anim.cardDiscarded(hEl, opts.riseSec);   // rise + fade (removes the element itself); riseSec slows it
        }
        else               { hEl.remove(); }    // other discards: silent removal (no generic animation)
      }
    } else {
      G.aiHand = G.aiHand.filter(function (id) { return id !== cardId; });
      // Presentation: when requested (Priest), rise+disappear one of the opponent's
      // face-down hand backs so the discard is visible no matter who triggers it.
      // The anim clones a fixed-position ghost, so a later updateOppHand() rebuild
      // doesn't disturb it.
      if (opts.animate && typeof Anim !== 'undefined' &&
          typeof Anim.cardDiscarded === 'function') {
        var oppHandEl = document.getElementById('battle-opp-hand');
        var backs = oppHandEl ? oppHandEl.querySelectorAll('.battle-card-back') : null;
        if (backs && backs.length) Anim.cardDiscarded(backs[backs.length - 1], opts.riseSec);
      }
    }
    /* THE discard-pile entry point — every hand discard in the game funnels
       through here, so no caller pushes its own (that is how Ra/Book used to
       double up). It runs BEFORE the trigger dispatch below because two of those
       triggers early-return; staysDead(), not the call-site shape, decides who is
       piled. So Jan Hus (7) — who early-returns yet is gone for good — IS
       revivable, while Jesus (10) — who early-returns AND flies back to hand — is
       filtered out inside pushDiscard. */
    pushDiscard(owner, cardId, discardStats);

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

  /* ── Reusable: grant +N capital to a player's NEXT turn ───────────────
     Adds to the per-player "pending next-turn capital" accumulator
     (G.bonusCapitalNextTurn for the player, G.aiBonusCapitalNextTurn for the
     AI). nextTurn() applies the accumulator when the next turn's capital pool
     is set up, then clears it — so it's a ONE-TURN bump, not permanent. Because
     it accumulates, multiple grants in a turn STACK naturally (two Farmers →
     +2 next turn) and future multi-fire cards work with no extra plumbing.
     In capital-OFF battles (resource.model 'none' — Gilgamesh/prehistory/Ötzi)
     nextTurn forces capital to 0 and never reads the accumulator, so this is a
     harmless no-op there; it also never errors (the fields are always
     initialized). Shared by Scholar-Officials (2) and Farmer (39). */
  function grantCapitalNextTurn(owner, amount) {
    var n = amount | 0;
    if (n <= 0) return;
    if (owner === 'player') G.bonusCapitalNextTurn   += n;
    else                    G.aiBonusCapitalNextTurn += n;
  }

  /* ── Once-per-turn location abilities (CAPITAL_WHEN_FULL) ──────────────────
     MUST be evaluated EXACTLY ONCE per turn (NOT in evaluateContinuous, which
     re-runs many times per turn and would over-grant). The engine calls this from
     the reveal-phase completion (game.js revealNext, after the final
     updateScores) — once, after all flips/At-Once/continuous have resolved.

     CAPITAL_WHEN_FULL: for each location carrying the key, check each side's
     fullness INDEPENDENTLY (all of that owner's slots here occupied). A full side
     grants THAT owner +1 capital NEXT turn via the shared accumulator
     (player → G.bonusCapitalNextTurn; AI → G.aiBonusCapitalNextTurn). Symmetric.
     General/reusable — keyed on abilityKey, not battle-specific; inert in any
     battle whose locations don't carry the key (so Arcadium/Sargon/etc. are
     unaffected). Stacks naturally if multiple such locations are full. */
  function applyCapitalWhenFull() {
    if (!G.locations) return;
    G.locations.forEach(function (loc) {
      if (loc.abilityKey !== 'CAPITAL_WHEN_FULL') return;
      var pSlots = G.playerSlots[loc.id];
      var aSlots = G.aiSlots[loc.id];
      if (pSlots && pSlots.indexOf(null) === -1) grantCapitalNextTurn('player', 1);
      if (aSlots && aSlots.indexOf(null) === -1) grantCapitalNextTurn('opp',    1);
    });
  }

  /* ── At-Once river type-boosts (LABOR_PLUS_2_HERE / MILITARY_PLUS_1_HERE) ──────
     Called ONCE per turn from the reveal-phase completion (game.js revealNext,
     alongside applyCapitalWhenFull) — NOT from evaluateContinuous. `newlyRevealed`
     is the list of cards PLAYED THIS TURN: [{ owner, cardId, locId, slotIndex }, …].
     For each such card whose location carries a river key and whose TYPE matches,
     stamp the bonus PERMANENTLY via addIPMod — Euphrates → Labor +2, Tigris →
     Military +1, both owners (symmetric).

     WHY newly-revealed (not "every revealed card at the river"): the stamp must fire
     only when a card REVEALS at the river. Gating on the per-turn play list means a
     card that revealed elsewhere and later RELOCATED onto a river is never stamped
     (it isn't in any later turn's newlyRevealed). And because addIPMod is permanent,
     a card stamped at a river keeps the bonus if it later moves away — both behaviors
     fall out naturally, no special-casing. sd._riverStamped is a belt-and-suspenders
     idempotency guard so a card can never be double-stamped. Inert in battles with no
     river-keyed location. */
  function applyRiverAtOnce(newlyRevealed) {
    var stamps = 0;
    if (!G.locations || !newlyRevealed || !newlyRevealed.length) return stamps;
    newlyRevealed.forEach(function (r) {
      var loc = G.locations.find(function (l) { return l.id === r.locId; });
      if (!loc) return;
      var key = loc.abilityKey;
      if (key !== 'LABOR_PLUS_2_HERE' && key !== 'MILITARY_PLUS_1_HERE') return;
      var slots = (r.owner === 'player') ? G.playerSlots : G.aiSlots;
      var arr   = slots[r.locId];
      var sd    = arr && arr[r.slotIndex];
      if (!sd || !sd.revealed || sd._riverStamped) return;   // guard: stamp exactly once
      var c = CARDS.find(function (x) { return x.id === sd.cardId; });
      if (!c) return;
      if (key === 'LABOR_PLUS_2_HERE' && c.type === 'Labor') {
        addIPMod(sd, 2, loc.name || 'Euphrates River');
        sd._riverStamped = true; stamps++;
      } else if (key === 'MILITARY_PLUS_1_HERE' && c.type === 'Military') {
        addIPMod(sd, 1, loc.name || 'Tigris River');
        sd._riverStamped = true; stamps++;
      }
    });
    return stamps;
  }

  /* Farmer (39) — "Harvest". At Once: grant the OWNER +1 capital next turn via
     the shared accumulator above. No board reads, so nothing to animate beyond
     the standard At-Once pulse/chime; harmlessly no-ops where capital is off.
     Also used by the Nubian Gold token (73). NOT the Egypt Farmer (55) — that one
     buffs the next card played, see abilityFarmerEgypt. */
  function abilityFarmer(owner, locId, done) {
    grantCapitalNextTurn(owner, 1);
    done();
  }

  /* ── Farmer — Egypt (55) "Harvest": +1 IP to the NEXT card you play ──────────
     A PENDING ONE-SHOT buff, per side, held in G.pendingIPBuff — deliberately not
     G.cardIPBonus (which is a permanent per-cardId in-hand accumulator) and not the
     next-turn capital accumulator (which nextTurn clears). Semantics:
       • armed by the Farmer's At Once;
       • consumed by the NEXT card that card's owner reveals, wherever it is played;
       • the +1 it grants is PERMANENT on that card (addIPMod);
       • it PERSISTS ACROSS TURNS until something is played to consume it;
       • it is a FLAG, not a counter — two Farmers do not stack into +2. A second
         Farmer played while a buff is pending consumes it (taking the +1 itself,
         since the consume hook runs BEFORE At Once) and re-arms a fresh one.
     The Farmer never buffs itself: the consume hook reads the flag before this
     ability sets it. */
  function armPendingIPBuff(owner) {
    if (!G.pendingIPBuff) G.pendingIPBuff = { player: false, opp: false };
    G.pendingIPBuff[owner === 'player' ? 'player' : 'opp'] = true;
  }

  /* Consume the pending Farmer buff for `owner` onto the slot that is revealing.
     Called from the reveal pipeline (game.js revealNext) IMMEDIATELY BEFORE the
     card's own At Once fires — that ordering is what lets an Egypt Farmer take the
     pending +1 and then arm the next one. Returns true if a buff was spent. */
  function consumePendingIPBuff(owner, sd) {
    if (!sd || !G.pendingIPBuff) return false;
    var side = owner === 'player' ? 'player' : 'opp';
    if (!G.pendingIPBuff[side]) return false;
    G.pendingIPBuff[side] = false;
    addIPMod(sd, 1, 'Farmer');
    return true;
  }

  function abilityFarmerEgypt(owner, locId, done) {
    armPendingIPBuff(owner);
    // No sound here: the Farmer's reveal voice is the onion pop's boing, owned by
    // reveal-fx handler 55 (same division as the Meso Farmer 39, whose handler owns
    // its coin cha-ching). The old ipGained ping fired at the same instant and would
    // simply talk over it.
    done();
  }

  /* Scribe (40) — "Record Keeper". At Once: +1 IP to the OWNER's OTHER revealed
     cards at this location (not the opponent's, not Scribe itself), as a one-time
     snapshot of who is present at reveal. The +1s resolve SEQUENTIALLY, paced by
     a stamping animation: the stamp travels to each target in slot order, presses
     down, and AT THE LANDING BEAT the real addIPMod(+1) is applied (same event as
     the visible mark / float / sfx — never a faked number). done() is passed as
     the sequence's onComplete, so the reveal pipeline waits for all stamps before
     advancing. No other cards here → harmless no-op (done() immediately). */
  function abilityScribe(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;

    // The owner's OTHER revealed cards here, in slot order. Exclude Scribe by id
    // (matches Scholar-Officials' by-id self-exclusion), per the At-Once rule.
    var targets = [];
    forEachRevealedAt(slots, locId, function (s, i) {
      if (s.cardId === 40) return;                 // not Scribe itself
      var el = getSlotEl(owner, locId, i);
      targets.push({
        el: el,
        // The stamp LANDING is the +1: apply the real IP, refresh, score, float.
        onLand: function () {
          addIPMod(s, 1, 'Scribe');                // permanent one-time +1 IP
          evaluateContinuous();
          refreshSlotIPDisplays();
          updateScores();
          if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
            SOG.ui.showIPFloat(owner, s.cardId, 1);
          }
        }
      });
    });

    if (!targets.length) { done(); return; }       // nothing to stamp → no-op

    // Scribe's own slot element — the stamp's starting position.
    var scribeIdx = -1;
    forEachRevealedAt(slots, locId, function (s, i) {
      if (scribeIdx === -1 && s.cardId === 40) scribeIdx = i;
    });
    var scribeEl = scribeIdx !== -1 ? getSlotEl(owner, locId, scribeIdx) : null;

    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.scribeStampSequence === 'function') {
      rfx.scribeStampSequence(scribeEl, targets, {
        sfx:      'sfx/cuneiformstamp.mp3',
        travelMs: 300,   // stamp glide between cards (knob)
        pressMs:  140,   // down/up press motion (knob)
        markMs:   300,   // how long the mark lingers before it fades (knob)
        gapMs:    120    // beat between one card and the next (knob)
      }, done);
    } else {
      // Defensive fallback (no animation available): apply the +1s instantly,
      // still correct, then advance.
      targets.forEach(function (t) { t.onLand(); });
      done();
    }
  }

  function abilityScholarOfficials(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    // "Other cards here" = all revealed at this location minus THIS Scholar.
    // Counting by id-exclusion (cardId !== 2) undercounted when a duplicated
    // twin Scholar sat at the same location — a twin IS another card.
    var total = 0;
    forEachRevealedAt(slots, locId, function () { total++; });
    var count = Math.max(0, total - 1);
    grantCapitalNextTurn(owner, count);   // shared next-turn-capital accumulator
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
    forEachRevealedAt(oppSlots, locId, function (s, i) {
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (!c || (c.type !== 'Political' && c.type !== 'Military')) return;
      var ip = effectiveIP(s);
      // Keep the index + sd so the push/destroy targets the EXACT scored card
      // (a cardId re-scan would grab the first twin with a duplicated id).
      if (!best || ip > best.ip) best = { cardId: s.cardId, ip: ip, idx: i, sd: s };
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
    var tgtIdx  = best.idx;   // the exact scored slot (not a cardId re-scan — twin-safe)
    var tgtEl   = tgtIdx !== -1 ? getSlotEl(oppSide, locId, tgtIdx) : null;
    var destEl  = (canPush && destIdx !== -1) ? getSlotEl(oppSide, destLocId, destIdx) : null;

    // ── No-GSAP fallback ─────────────────────────────────────────
    if (!wuEl || typeof gsap === 'undefined') {
      if (canPush) {
        executeMoveAnimated(oppSide, best.cardId, locId, destLocId, { sd: best.sd }, function () {
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
        executeMoveAnimated(oppSide, best.cardId, locId, destLocId, { sd: best.sd }, function () {
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

    // ── Blocked: Kente or the owner's own Sphinx is protecting ────
    // Cortes inlines its own destruction (it never calls destroyCard), so the
    // shared gate has to be consulted here explicitly. He destroys the OWNER's
    // cards, so it is the OWNER's side that Sphinx shields.
    if (isDestroyProtected(owner, locId)) {
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
    // Presentation only: reuse the shared rise-and-disappear (Anim.cardDiscarded)
    // on the discarded card + priest.m4a. The discard LOGIC (lowest-CC selection,
    // hand removal) is unchanged; opts just adds the visual/sound for both sides.
    discardFromHand(owner, lowestId, done, { animate: true, sfx: 'sfx/priest.m4a', riseSec: 1.0 });
  }

  // Soldier (id 42) — At Once: Strike one of your opponent's revealed cards here
  // and reduce it by -1 IP.  The target is chosen RANDOMLY for BOTH sides (no
  // player chooser) — the spear flies at that same randomly-picked card.
  // Shared Soldier strike — used by the Mesopotamia Soldier (42) and the Egypt
  // Soldier (70). soldierCardId picks whose slot the spear flies FROM. Sphinx (64)
  // protection: if the TARGET's owner has a Sphinx here, the strike whiffs (no IP
  // reduction) — the Kente-pattern reuse the Egypt Sphinx requested.
  function _soldierStrike(owner, locId, done, soldierCardId) {
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    // Keep each target's SLOT INDEX alongside its data so the charge animation can
    // fly the spear at the exact card the ability chose (idx → its slot element).
    var targets  = [];
    forEachRevealedAt(oppSlots, locId, function (s, i) { targets.push({ sd: s, idx: i }); });
    if (targets.length === 0) { done(); return; }   // no opponent cards → no-op

    // Apply the strike, PACED by the charge: the spear flies to the chosen target's
    // slot, and the real -1 IP fires at the impact beat (onImpact) — same card, same
    // event as the visible drop. done() runs after the Soldier returns, so the reveal
    // pipeline waits for the charge (same coupling pattern as Scribe's stamping).
    function applyStrike(t) {
      var targetSd  = t.sd;
      var targetEl  = getSlotEl(oppSide, locId, t.idx);       // the SAME card the ability chose
      var soldierEl = findSlotEl(owner, soldierCardId);       // the charging Soldier's slot

      function strike() {   // the real, one-time IP reduction (shown at impact)
        // Sphinx guards the target owner's cards here — block the reduction.
        if (!isSphinxProtected(oppSide, locId)) {
          addIPMod(targetSd, -1, 'Soldier');
          SOG.ui.showIPFloat(oppSide, targetSd.cardId, -1);
        }
        evaluateContinuous();
        refreshSlotIPDisplays();
        updateScores();
      }

      var rfx = window.SOG && SOG.RevealFx;
      if (rfx && typeof rfx.soldierCharge === 'function') {
        rfx.soldierCharge(soldierEl, targetEl, { sfx: 'sfx/hit.m4a', onImpact: strike }, done);
      } else {
        // Defensive fallback (no animation available): apply instantly, still correct.
        strike();
        setTimeout(done, 400);
      }
    }

    // Random target for both player and AI (no chooser).
    var target = targets[Math.floor(Math.random() * targets.length)];
    applyStrike(target);
  }
  function abilitySoldier(owner, locId, done)      { _soldierStrike(owner, locId, done, 42); }  // Mesopotamia

  /* Soldier — Egypt (70) "Military Service": At Once, DESTROY one of the opponent's
     1-CC cards here. Distinct from the Mesopotamia Soldier's -1 IP strike above, so
     it does NOT go through _soldierStrike.
       • Targets read LIVE CC via effectiveCC, so a Mummy that inherited CC 1 from
         its source card is a legal target (its card definition says 0).
       • The target is picked at RANDOM among the eligible cards, for both sides —
         same no-chooser rule as the Meso Soldier.
       • FIZZLES (no-op) when the opponent has no 1-CC card here.
       • Destruction is the engine's standard destroyCard, so everything that hangs
         off a destroy still fires: Kente protection, Samurai's revival, Joan's
         summon, William's counter, and the destroyed pile.
     Presentation reuses the Soldier charge: the spear flies at the chosen card and
     the destroy lands on the impact beat, so the reveal pipeline waits for it. */
  function abilitySoldierEgypt(owner, locId, done) {
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    // Protection is LOCATION-WIDE, so it removes every candidate at once: zero valid
    // targets → FIZZLE outright, no spear. Checked before the scan rather than left
    // to destroyCard's gate, which would fly the spear at a card it cannot kill.
    if (isDestroyProtected(oppSide, locId)) { done(); return; }
    var targets  = [];
    forEachRevealedAt(oppSlots, locId, function (s, i) {
      if (effectiveCC(s) === 1) targets.push({ sd: s, idx: i });
    });
    if (targets.length === 0) { done(); return; }   // no 1-CC card here → fizzle

    var t         = targets[Math.floor(Math.random() * targets.length)];
    var targetEl  = getSlotEl(oppSide, locId, t.idx);
    var soldierEl = findSlotEl(owner, 70);

    function strike() {
      // Re-resolve the slot index at impact: the board may have shifted between
      // the pick and the landing (compaction after another destroy).
      var idx = (oppSlots[locId] || []).indexOf(t.sd);
      if (idx === -1) return;                        // target already gone
      destroyCard(oppSide, locId, idx);   // standard destroy presentation + side effects
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.soldierCharge === 'function') {
      rfx.soldierCharge(soldierEl, targetEl, { sfx: 'sfx/hit.m4a', onImpact: strike }, done);
    } else {
      // Defensive fallback (no animation available): apply instantly, still correct.
      strike();
      setTimeout(done, 400);
    }
  }

  // Hammurabi (id 47) — At Once: "Destroy your lowest CC card here in order to
  // destroy your opponent's lowest CC card." A SACRIFICE / trade, symmetric for
  // whoever plays Hammurabi (player or AI):
  //   • SACRIFICE = the OWNER's lowest-CC REVEALED card here, EXCLUDING Hammurabi
  //     himself (47) — guarantee 1: Hammurabi can never be the sacrifice.
  //   • If a sacrifice exists AND the opponent has a card to take, destroy BOTH
  //     (the sacrifice + the opponent's lowest-CC card here).
  //   • If the owner has no eligible card to sacrifice, destroy NOTHING — the
  //     opponent's card is safe (guarantee 2: no sacrifice → no kill). Likewise no
  //     opponent card → no trade ("…in order to destroy your opponent's lowest").
  // Only REVEALED cards are eligible (forEachRevealedAt), same as every At-Once.
  // The two destroys are fired at the strike beat by the FX (presentation coupled to
  // logic, like Scribe/Soldier): the cards that SPLIT are the cards that really die.
  function abilityHammurabi(owner, locId, done) {
    var mySlots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;

    function findLowestCCIndex(slots, skipCardId) {
      var lowestCC = Infinity, lowestIdx = -1;
      forEachRevealedAt(slots, locId, function (s, si) {
        if (skipCardId !== undefined && s.cardId === skipCardId) return;
        var cc = effectiveCC(s);   // honors a Mummy's inherited CC (sd.cc)
        if (cc < lowestCC) { lowestCC = cc; lowestIdx = si; }
      });
      return lowestIdx;
    }

    var sacIdx = findLowestCCIndex(mySlots, 47);   // sacrifice — never Hammurabi (47)
    var oppIdx = findLowestCCIndex(oppSlots);      // the opponent's lowest-CC victim

    // No sacrifice, or nothing to take → destroy nothing, no strike.
    if (sacIdx === -1 || oppIdx === -1) { done(); return; }

    // Protection makes at least one half of the trade impossible → call the WHOLE
    // trade off. Guarantee 2 ("no sacrifice → no kill") has to hold in both
    // directions: with only the central destroyCard gate, an owner-side Sphinx
    // would shield the sacrifice while the opponent's card still died — a free
    // kill — and an opponent-side Sphinx would take the sacrifice for nothing.
    if (isDestroyProtected(owner, locId) || isDestroyProtected(oppSide, locId)) { done(); return; }

    // Capture the EXACT slot elements the strike will destroy, so the animation
    // splits the same two cards the logic removes (same-target integrity).
    var sacEl = getSlotEl(owner,   locId, sacIdx);
    var oppEl = getSlotEl(oppSide, locId, oppIdx);
    var hamEl = findSlotEl(owner, 47);

    // The REAL destruction, fired at the down-stroke. skipAnim → no generic
    // shake/sfx; the strike FX supplies swordslice + the split + bodyfalling.
    function strike() {
      destroyCard(owner,   locId, sacIdx, { skipAnim: true });
      destroyCard(oppSide, locId, oppIdx, { skipAnim: true });
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.hammurabiStrike === 'function') {
      rfx.hammurabiStrike(hamEl, [sacEl, oppEl],
        { strikeSfx: 'sfx/swordslice.m4a', splitSfx: 'sfx/bodyfalling.m4a', onStrike: strike,
          // The strike compacts the owner's row, so Hammurabi's card moves to a new
          // slot element. This lets the FX re-find him after the strike to slide him in.
          getStrikerEl: function () { return findSlotEl(owner, 47); } },
        done);
    } else {
      // Defensive fallback (no FX available): destroy instantly, still correct.
      strike();
      setTimeout(done, 400);
    }
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

    // Target set (UNCHANGED): the owner's revealed Prehistory cards across ALL
    // locations. We also capture each one's slot element so the SAME cards that get
    // boosted are exactly the cards that lift.
    var targets = [];
    G.locations.forEach(function (loc) {
      forEachRevealedAt(slots, loc.id, function (s, i) {
        if (isPrehistory(s.cardId)) targets.push({ sd: s, el: getSlotEl(owner, loc.id, i) });
      });
    });
    if (!targets.length) { done(); return; }   // no Prehistory cards → no-op, no error

    // PEAK beat: apply the REAL +1s once (same event id shared, as before) and tick
    // the displays — the visible change IS the game-state change.
    var eid = nextEventId();
    function applyBoost() {
      targets.forEach(function (t) {
        addIPMod(t.sd, 1, 'Cuneiform', eid);
        if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
          SOG.ui.showIPFloat(owner, t.sd.cardId, 1);
        }
      });
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    // Synchronized group lift, paced to transform.m4a; +1s apply at the peak, done()
    // fires after the fall so the reveal pipeline waits (same coupling as Scribe/Soldier).
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.cuneiformLift === 'function') {
      rfx.cuneiformLift(
        targets.map(function (t) { return t.el; }),
        { sfx: 'sfx/transform.m4a', onPeak: applyBoost, riseMs: 1150, holdMs: 600, fallMs: 1150, liftPx: 26 },
        done
      );
    } else {
      applyBoost();   // fallback: no animation, still correct
      done();
    }
  }

  // The Phoenicians (id 49) — At Once: Attaches itself to one of YOUR cards at this
  // location (ANY type), merging its own 3 IP onto the host — and +1 MORE if that
  // host is a Cultural card (so a Cultural host gains +4, anything else +3).
  // Phoenicians is consumed either way. Player gets a chooser over all their cards
  // here; the AI auto-picks the card that gains the most (the +1 Cultural edge tips
  // close calls).
  function abilityPhoenicians(owner, locId, done) {
    var mySlots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var targets = [];
    forEachRevealedAt(mySlots, locId, function (s, si) {
      if (s.cardId === 49) return;            // never attach to itself
      targets.push({ sd: s, si: si });        // ANY of the owner's revealed cards here
    });
    if (targets.length === 0) { done(); return; }   // no host → Phoenicians reveals normally

    function isCultural(sd) {
      var c = CARDS.find(function (x) { return x.id === sd.cardId; });
      return !!(c && c.type === 'Cultural');
    }

    // The REAL merge: consume Phoenicians from its slot and permanently boost the
    // host by +3 (its own IP), +1 more if the host is Cultural. Runs at the DISSOLVE
    // beat so the visible consumption equals the game-state change.
    function doMerge(hostSd) {
      var phoenIdx = mySlots[locId].findIndex(function (s) { return s && s.cardId === 49; });
      if (phoenIdx !== -1) {
        mySlots[locId][phoenIdx] = null;
        clearSlotDOM(owner, locId, phoenIdx);
        if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
        else                    { compactOppSlots(locId);    syncOppSlots(locId);    }
      }
      var gain = 3 + (isCultural(hostSd) ? 1 : 0);   // +3 base (its IP), +1 if Cultural
      addIPMod(hostSd, gain, 'The Phoenicians');
      // Transfer Phoenicians' "last played here" position onto the host. Phoenicians
      // is the most-recent card the owner played at this location, and it dissolves
      // INTO the host — so downstream "last card played here" readers (Pyramid 57,
      // Papyrus 54, which pick the highest sd.playTime) must see the HOST as the
      // latest play, not a card played earlier this location (e.g. a Hieroglyphics
      // laid down just before). Phoenicians itself never gets a playTime stamp
      // (game.js assigns it AFTER the At-Once, by which point it is consumed), so we
      // mint a fresh play-order token here to outrank every earlier card here.
      hostSd.playTime = ++G.playOrderCounter;
      SOG.ui.showIPFloat(owner, hostSd.cardId, gain);
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    // Pace the merge with the slide-over-and-dissolve: Phoenicians sits, slides onto
    // the SAME target the ability chose, dissolves, and onMerge applies the real merge
    // at that beat. done() fires after, so the reveal pipeline waits for the sequence.
    function attach(target) {   // target = { sd, si }
      var phoenIdx = mySlots[locId].findIndex(function (s) { return s && s.cardId === 49; });
      var phoenEl  = phoenIdx !== -1 ? getSlotEl(owner, locId, phoenIdx) : null;
      var targetEl = getSlotEl(owner, locId, target.si);
      var rfx = window.SOG && SOG.RevealFx;
      if (rfx && typeof rfx.phoeniciansMerge === 'function') {
        rfx.phoeniciansMerge(phoenEl, targetEl,
          { sfx: 'sfx/phoenician.mp3', sitMs: 500, slideMs: 600, onMerge: function () { doMerge(target.sd); } },
          function () { setTimeout(done, 200); });
      } else {
        doMerge(target.sd);   // fallback: no animation, still correct
        setTimeout(done, 400);
      }
    }

    if (owner === 'opp') {
      // Best host = highest resulting IP; the +1 Cultural edge tips close calls.
      var best = targets.reduce(function (a, b) {
        var sa = effectiveIP(a.sd) + (isCultural(a.sd) ? 1 : 0);
        var sb = effectiveIP(b.sd) + (isCultural(b.sd) ? 1 : 0);
        return sa >= sb ? a : b;
      });
      attach(best);
      return;
    }
    var targetIds = targets.map(function (t) { return t.sd.cardId; });
    showDiscardChooser('Choose a card for The Phoenicians to attach to', targetIds, function (chosenId) {
      if (chosenId === null) { done(); return; }
      var target = targets.find(function (t) { return t.sd.cardId === chosenId; });
      if (!target) { done(); return; }
      attach(target);
    });
  }

  // Chariot arrival strike: when a Chariot-type card moves to a new location it
  // strikes the highest-IP revealed opponent card there. Mesopotamia Chariot (48)
  // uses delta -1; Egypt Chariots (69) uses -2. Sphinx (64) protection applies —
  // if the target's owner has a Sphinx here, the strike whiffs (inert in Meso
  // battles, where Sphinx never appears). Called from executeMoveAnimated (game.js).
  function chariotArrival(owner, toLocId, sd, done, delta) {
    delta = (typeof delta === 'number') ? delta : -1;
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    var mySlots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    // Pick the target (UNCHANGED) — highest-IP revealed opponent card here — and
    // capture its slot index so the arrow flies at the SAME card that loses IP.
    var best = null, bestIdx = -1;
    oppSlots[toLocId].forEach(function (s, si) {
      if (!s || !s.revealed) return;
      if (!best || effectiveIP(s) > effectiveIP(best)) { best = s; bestIdx = si; }
    });
    if (!best) {
      // Travelled but no opponent card here → no arrow, no error.
      evaluateContinuous(); refreshSlotIPDisplays(); updateScores();
      done(); return;
    }

    // The real strike, applied at the arrow's IMPACT beat (same card, same event).
    function applyStrike() {
      if (!isSphinxProtected(oppSide, toLocId)) {   // Sphinx guards the target's cards
        addIPMod(best, delta, 'Chariot');
        SOG.ui.showIPFloat(oppSide, best.cardId, delta);
      }
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    // Fling the arrow from the arrived Chariot's slot at the chosen target; the -1
    // applies at impact, then the arrow dissolves. done() after, so the reveal flow
    // waits for the arrow phase (Phase 1 travel already finished before this runs).
    var chIdx     = mySlots[toLocId].findIndex(function (s) { return s === sd; });
    var chariotEl = chIdx !== -1 ? getSlotEl(owner, toLocId, chIdx) : null;
    var targetEl  = getSlotEl(oppSide, toLocId, bestIdx);
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.chariotArrow === 'function') {
      rfx.chariotArrow(chariotEl, targetEl, { onImpact: applyStrike }, function () { setTimeout(done, 150); });
    } else {
      applyStrike();   // fallback: no animation, still correct
      setTimeout(done, 400);
    }
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
    if (window.SOG_DEBUG) console.log('[Samurai] triggerSamurai called — owner:', owner, 'locId:', locId);
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
    if (window.SOG_DEBUG) console.log('[Samurai] placeRevealedCard returned:', placed, '| newBonus:', newBonus);

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
      if (window.SOG_DEBUG) console.log('[Samurai] triggerSamurai — no slotEl or no GSAP, finishing immediately');
      if (typeof SFX !== 'undefined') SFX.samuraiReturn();
      finish();
      return;
    }

    if (window.SOG_DEBUG) console.log('[Samurai] triggerSamurai — playing return SFX + spin animation');
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

  /* `stats` (optional) pins the numbers on the badges — used by pile choosers,
     whose entries carry stats FROZEN at the moment the card left play. Omitted
     (hand choosers) → the live card definition plus the in-hand IP accumulator. */
  function buildChooserCard(card, cardId, stats) {
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
    ccEl.textContent = (stats && stats.cc != null) ? stats.cc : card.cc;

    var ipEl = document.createElement('div');
    ipEl.className   = 'db-overlay-ip';
    ipEl.textContent = (stats && stats.ip != null) ? stats.ip : (card.ip + bonus);

    el.appendChild(imgWrap);
    el.appendChild(ccEl);
    el.appendChild(ipEl);
    return el;
  }

  /**
   * Shared card chooser — shows a list of options as clickable images.
   * `options` entries are EITHER a bare card id (hand choosers: Erasmus, Book,
   * Phoenicians, Trader) OR a pile entry object { cardId, ip, cc, … } whose frozen
   * stats are shown on the badges (Priest's merged discard+destroyed chooser).
   * callback fires with the chosen ENTRY — the same value that was passed in, so
   * bare-id callers keep receiving a bare id.
   */
  function showDiscardChooser(title, options, callback) {
    var cardIds = options;
    var backdrop = document.createElement('div');
    backdrop.className = 'discard-backdrop';

    var panel = document.createElement('div');
    panel.className = 'discard-panel';

    // One-shot resolver: a card click OR the countdown timeout settles the choice
    // exactly once (guards the click-vs-timeout race), tears down, and reports back.
    var settled = false;
    var intervalId = null;
    function resolve(cardId) {
      if (settled) return;
      settled = true;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      callback(cardId);
    }

    // ── 5-second choice timer: a circular clock (depleting gold ring + center
    //    countdown number) at the top of the panel. If it runs out, the chooser
    //    auto-picks one of the options at RANDOM so play never stalls. ──
    var DURATION_S = 5;
    var timerWrap = document.createElement('div');
    timerWrap.className = 'chooser-timer';
    timerWrap.innerHTML =
      '<svg class="chooser-timer-ring" viewBox="0 0 100 100" aria-hidden="true">' +
        '<circle class="chooser-timer-track" cx="50" cy="50" r="44"></circle>' +
        '<circle class="chooser-timer-arc"   cx="50" cy="50" r="44"></circle>' +
      '</svg>' +
      '<div class="chooser-timer-num">' + DURATION_S + '</div>';
    panel.appendChild(timerWrap);

    var titleEl = document.createElement('div');
    titleEl.className   = 'discard-title';
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    var row = document.createElement('div');
    row.className = 'discard-card-row';

    cardIds.forEach(function (opt) {
      var isEntry = (opt !== null && typeof opt === 'object');
      var cardId  = isEntry ? opt.cardId : opt;
      var card = CARDS.find(function (c) { return c.id === cardId; });
      if (!card) return;
      var cardEl = buildChooserCard(card, cardId, isEntry ? opt : null);
      cardEl.addEventListener('click', function () { resolve(opt); });
      row.appendChild(cardEl);
    });

    panel.appendChild(row);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // Drive the ring depletion (exact 5s CSS animation) + the per-second number
    // tick (5 → 4 → 3 → 2 → 1, then random pick on the 0 tick).
    var arc = timerWrap.querySelector('.chooser-timer-arc');
    if (arc) arc.style.animationDuration = DURATION_S + 's';
    var numEl = timerWrap.querySelector('.chooser-timer-num');
    var remaining = DURATION_S;
    intervalId = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        resolve(cardIds[Math.floor(Math.random() * cardIds.length)]);   // time up → random
      } else if (numEl) {
        numEl.textContent = remaining;
      }
    }, 1000);
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
  function abilityOtziFlee(ctx, done) {
    done = typeof done === 'function' ? done : function () {};
    var owner      = ctx.owner;
    var fromLoc    = ctx.locId;
    var ownerSlots = owner === 'player' ? G.playerSlots : G.aiSlots;

    var candidates = G.locations.filter(function (loc) {
      return loc.id !== fromLoc && ownerSlots[loc.id] && ownerSlots[loc.id].indexOf(null) !== -1;
    });
    if (!candidates.length) { done(); return; }  // nowhere to flee — release the reveal pipeline
    var dest = candidates[Math.floor(Math.random() * candidates.length)];

    // The reveal pipeline fires this only AFTER the just-landed card's flip +
    // reveal-fx + At Once animations have fully resolved (flipSlot/fireAtOnce
    // callbacks), so all of that is already done. FLEE_DELAY_MS is now purely a
    // readable reaction beat — "…then Ötzi darts away" — before the slide. The
    // pipeline AWAITS done() (passed through the onCardLandedHere barrier), so the
    // next card never reveals until the slide finishes: no overlap in either
    // direction. applyMove updates the score during the slide, well before turn end.
    var FLEE_DELAY_MS = 500;   // knob: reaction beat before he darts
    if (SOG.game && typeof SOG.game.executeMoveAnimated === 'function') {
      setTimeout(function () {
        SOG.game.executeMoveAnimated(owner, 35, fromLoc, dest.id, { sd: ctx.slot }, function () {
          if (window.SOG_DEBUG && typeof console !== 'undefined') console.log('[Otzi] flee: card 35 (' + owner + ') relocated from loc ' + fromLoc + ' to loc ' + dest.id);
          done();
        });
      }, FLEE_DELAY_MS);
    } else {
      done();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     MERCHANT (76) — "Trade Route". REACTIVE, LOCAL.
     ───────────────────────────────────────────────────────────────
     When an ECONOMIC card is played at THIS Merchant's location:
       1. the Merchant gains +1 IP (at its current location), THEN
       2. it moves to a RANDOM other location that has an open spot.
     If no other location has an open spot the WHOLE trigger fizzles —
     no IP, no move. That is why the destination is resolved BEFORE the
     +1 is applied: a blocked Merchant must not bank the IP.

     DIFFERENT-CIVILIZATION BONUS: if the played Economic card is from a
     different civilization than the Merchant, THE PLAYED CARD (not the
     Merchant) gains +1 IP. Card text: "…If the Economic card is from a
     different civilization, it also gains +1 IP." — "it" is the played card.
     The Merchant's own +1 is unconditional; only this second +1 is gated.
     The played card does NOT move; only the Merchant moves (no swap).

     WHY THE TRIGGER IS LOCAL (the anti-snowball rule): fireOnCardLandedHere
     only fires reactors that sit at the location the card landed at, and it
     excludes the just-landed card itself. Two Merchants at DIFFERENT
     locations therefore cannot both fire on one play — no extra guard needed,
     the dispatcher's contract already is the rule. Each reactor is invoked
     exactly once per landing, so the Merchant reacts exactly once.

     OWNER-SCOPED. The Merchant reacts ONLY to Economic cards played by its OWN
     controller — "When YOU play an Economic card here". An opponent playing an
     Economic card at this location triggers nothing at all: no IP, no move, and
     no different-civilization bonus. (This replaces an earlier reading where
     either side's play counted, which let a player's Economic card move the
     AI's Merchant.) Same-owner gating matches Tribe below.

     The card is real now (cards.js id 76, promoted from the old id-900
     placeholder), as are the Punt/Thebes move-here bonuses it plays into. */
  var MERCHANT_ID = 76;

  /* A card's CIVILIZATION. Prefers an explicit `civilization` / `civ` field and
     falls back to `era`, which every card already carries and which gameplay
     code already treats as a civilization key (board.js / input.js gate Neb's
     discount on card.era === 'Mesopotamia').

     CAVEAT worth knowing: `era` is mostly civilizations (Egypt, Mesopotamia,
     Rome, China, Japan) but some values are PERIODS (Middle Ages, Renaissance,
     Reformation, Enlightenment, Age of Exploration). Those still compare as
     distinct keys, so the mechanic works today with zero data migration — but
     when a Merchant needs to reason about a period-named card's true
     civilization, add an explicit `civilization:` to that card and this picks
     it up with no change here. */
  function civOf(card) {
    if (!card) return null;
    return card.civilization || card.civ || card.era || null;
  }

  /* Pick a RANDOM location, other than `excludeLocId`, that has an open slot on
     `owner`'s side — or null if there is none (the caller's fizzle case).

     SHARED ON PURPOSE: this is the Merchant's own move rule, and Hatshepsut's
     spawn has to place a Merchant by the SAME rule ("another location that has
     an open spot"). Extracted so the two can never drift — change the selection
     policy here and both the move and the spawn follow. Mirrors the shape Ötzi's
     flee uses to choose its destination. */
  function randomOtherOpenLoc(owner, excludeLocId) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var candidates = G.locations.filter(function (loc) {
      return loc.id !== excludeLocId && slots[loc.id] && slots[loc.id].indexOf(null) !== -1;
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /* Put a NEW, already-revealed card into the first open slot at a location.
     Returns false (no-op) if the location is full.

     REUSES THE EXISTING SPAWN PATTERN — this is createMummy's mechanism,
     generalised: find the open slot index, write a slot record, sync that
     location's DOM (syncPlayerSlots / syncOppSlots), then recompute
     continuous/IP/score. createMummy stays as-is because it carries
     resurrection-specific state (resurrectionIP, wasResurrected,
     resurrectedFrom); this is the plain-card equivalent for abilities that
     summon a standard card.

     The spawned card is a FULL citizen of the board, not a decoration: the
     reveal dispatcher resolves reactors by looking up CARD_ABILITIES[sd.cardId]
     at fire time, so a spawned Merchant reacts to later Economic plays with no
     registration step. revealed:true is what makes it eligible. */
  function spawnCardAt(owner, locId, cardId) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var si    = (slots[locId] || []).indexOf(null);
    if (si === -1) return false;                       // no room → caller fizzles
    var card = CARDS.find(function (c) { return c.id === cardId; });
    slots[locId][si] = {
      cardId: cardId,
      ip:     card ? card.ip : 0,
      cc:     card ? card.cc : 0,
      revealed: true,
      ipMod: 0, contMod: 0, ipModSources: [], contModSources: [],
      bonuses: [], turnPlayed: G.turn, wasSpawned: true
    };
    if (owner === 'player') syncPlayerSlots(locId); else syncOppSlots(locId);
    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();
    return true;
  }

  /* Location "when a card MOVES here" bonus — LIVE as of Hatshepsut's battle.
       'MOVE_HERE_IP'      (Punt)   → the arriving card gains +1 IP
       'MOVE_HERE_CAPITAL' (Thebes) → the mover's owner gains +1 capital next turn

     NOW CALLED FROM THE SHARED MOVE PIPELINE (game.js applyMove), not from any
     one ability — so EVERY move triggers it: Chariot (48/69), Lucy, Magellan,
     Columbus, Ötzi's flee, the Merchant's own trade move, and any future mover.
     That was the follow-up noted when this seam was first added; Punt and Thebes
     existing is what made it real. A location without one of these keys is an
     inert lookup, so every other battle is untouched. */
  function fireMoveHereBonus(owner, destLocId, movedSlot) {
    var loc = G.locations.find(function (l) { return l.id === destLocId; });
    if (!loc || !loc.abilityKey) return;
    if (loc.abilityKey === 'MOVE_HERE_IP' && movedSlot) {
      addIPMod(movedSlot, 1, 'Punt');
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    } else if (loc.abilityKey === 'MOVE_HERE_CAPITAL') {
      grantCapitalNextTurn(owner, 1);
    }
  }

  function abilityMerchantTrade(ctx, done) {
    done = typeof done === 'function' ? done : function () {};
    var owner   = ctx.owner;          // the MERCHANT's side
    var fromLoc = ctx.locId;
    var landed  = CARDS.find(function (c) { return c.id === ctx.landedCardId; });

    // OWNER gate: only MY controller's plays count. The dispatcher fires reactors
    // on BOTH sides of the location, so without this an opponent's Economic card
    // moved this Merchant.
    if (ctx.landedOwner !== owner) { done(); return; }
    // Type gate. The dispatcher already guaranteed "landed at my location" and
    // "not my own reveal".
    if (!landed || landed.type !== 'Economic') { done(); return; }

    // FIZZLE CHECK FIRST — see the header. Destination comes from the SHARED
    // randomOtherOpenLoc (open spots counted on the MERCHANT'S OWN side, since a
    // move relocates it within its owner's slots), so Hatshepsut's spawn places a
    // Merchant by exactly this rule.
    var dest = randomOtherOpenLoc(owner, fromLoc);
    if (!dest) { done(); return; }                // whole trigger fizzles

    // 1. Merchant's own +1 IP — UNCONDITIONAL, banked at the CURRENT location
    //    before the move.
    addIPMod(ctx.slot, 1, 'Merchant');
    if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
      SOG.ui.showIPFloat(owner, MERCHANT_ID, 1);
    }

    // 2. DIFFERENT-CIVILIZATION BONUS → +1 IP to THE PLAYED CARD (not the
    //    Merchant). Same-civ (or unknown civ on either card) → no bonus. The
    //    owner gate above means the played card is always on the Merchant's own
    //    side now; the lookup still goes through ctx.landedOwner so the slot
    //    resolution stays explicit rather than assuming.
    var merchantCard = CARDS.find(function (c) { return c.id === MERCHANT_ID; });
    var myCiv        = civOf(merchantCard);
    var theirCiv     = civOf(landed);
    var differentCiv = !!myCiv && !!theirCiv && myCiv !== theirCiv;
    if (differentCiv) {
      var landedSlots = (ctx.landedOwner === 'player' ? G.playerSlots : G.aiSlots)[fromLoc] || [];
      for (var i = 0; i < landedSlots.length; i++) {
        var ls = landedSlots[i];
        if (ls && ls.cardId === ctx.landedCardId) {
          addIPMod(ls, 1, 'Merchant');
          if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
            SOG.ui.showIPFloat(ctx.landedOwner, ctx.landedCardId, 1);
          }
          break;   // one card played, one bonus
        }
      }
    }

    // Both +1s are in — recompute once for the pair rather than twice.
    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();

    // 3. The Merchant moves (the played card stays put — no swap), then the
    //    destination's move-here bonus. The one-shot guard stays: executeMoveAnimated
    //    is an external callback, and a double invocation must never double-move
    //    or double-release the reveal pipeline's barrier.
    var advanced = false;
    var doMove = function () {
      if (advanced) return;
      advanced = true;
      if (!SOG.game || typeof SOG.game.executeMoveAnimated !== 'function') { done(); return; }
      // No fireMoveHereBonus call here any more — applyMove fires it for EVERY
      // move, so doing it here too would double-pay Punt/Thebes.
      SOG.game.executeMoveAnimated(owner, MERCHANT_ID, fromLoc, dest.id, { sd: ctx.slot }, function () {
        if (window.SOG_DEBUG && typeof console !== 'undefined') {
          console.log('[Merchant] traded on ' + landed.name + ' (' + theirCiv + ' vs ' + myCiv +
                      (differentCiv ? ', different civ → played card +1 IP' : ', same civ → no bonus') +
                      '): moved loc ' + fromLoc + ' → ' + dest.id);
        }
        done();
      });
    };
    doMove();
  }

  /* ═══════════════════════════════════════════════════════════════
     NATURAL RESOURCES (74 Papyrus-Econ, 75 Purple Dye) — AT ONCE type buff.
     ───────────────────────────────────────────────────────────────
     "At Once: <Type> cards here gain +2 IP". One-time (addIPMod), not
     Continuous — so the buff sticks even if the resource later leaves.

     OWNER'S CARDS ONLY. The card text says "cards here" without naming a side;
     this reads it as the owner's, matching Scribe (40) — "+1 IP to the OWNER's
     other revealed cards at this location". A buff that also pumped the
     opponent's board would be a drawback card, which these plainly are not.
     Neither resource can buff itself: both are Economic, and they buff
     Scientific / Political respectively.

     They are otherwise ORDINARY Economic cards — the Merchant reacts to them
     as it does to any Economic play (single reaction, no At-Once re-fire). */
  function _atOnceTypeBuffHere(owner, locId, type, amount, sourceName, done) {
    done = typeof done === 'function' ? done : function () {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var hits = 0;
    forEachRevealedAt(slots, locId, function (s) {
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (!c || c.type !== type) return;
      addIPMod(s, amount, sourceName);
      hits++;
      if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
        SOG.ui.showIPFloat(owner, s.cardId, amount);
      }
    });
    if (hits) {                       // no matching cards here → clean no-op
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }
    if (window.SOG_DEBUG && typeof console !== 'undefined') {
      console.log('[' + sourceName + '] +' + amount + ' IP to ' + hits + ' ' + type + ' card(s) at loc ' + locId);
    }
    done();
  }

  /* Papyrus — ECONOMIC (74). Note the type string is 'Scientific'; the card text
     says "Science cards" in player-facing language. */
  function abilityPapyrusEconomic(owner, locId, done) {
    _atOnceTypeBuffHere(owner, locId, 'Scientific', 2, 'Papyrus', done);
  }
  /* Purple Dye (75). */
  function abilityPurpleDye(owner, locId, done) {
    _atOnceTypeBuffHere(owner, locId, 'Political', 2, 'Purple Dye', done);
  }

  /* ═══════════════════════════════════════════════════════════════
     HATSHEPSUT (52) — "Trading Queen". AT ONCE.
     ───────────────────────────────────────────────────────────────
     Card text: "At Once: Send a Merchant to another location."

     REPLACES the earlier give/receive SWAP implementation of this same card
     (the card was still carrying "Trade one of your cards with an adjacent
     location. (Not yet wired.)"). That version is deleted, not disabled — the
     ability below is the final Trading Queen.

     On reveal she spawns a standard Ancient-Egypt MERCHANT at a random OTHER
     location with an open spot on her own side. No other location has room →
     the ability fizzles (no Merchant spawned), the same fizzle shape the
     Merchant's own move uses — because it is literally the same function:
     randomOtherOpenLoc. Her location is excluded, so she never spawns on top
     of herself.

     THE SPAWNED MERCHANT IS A REAL MERCHANT, not an inert copy. spawnCardAt
     writes a normal revealed slot with cardId MERCHANT_ID, and the reveal
     dispatcher resolves reactors by looking up CARD_ABILITIES[sd.cardId] when a
     card lands — so from the next Economic play onward it runs Trade Route like
     any hand-played Merchant: +1 IP, the different-civilization bonus (it
     carries the Merchant card's era 'Egypt', so non-Egyptian Economic cards
     trigger it), and its own random move.

     NO REACTION ON SPAWN. She places it and stops; it sits until an Economic
     card is played at its location. This is automatic rather than suppressed —
     onCardLandedHere fires for cards that LAND at a location, and spawning is
     not a landing, so nothing re-enters the Merchant's own trigger here. */
  function abilityHatshepsut(owner, locId, done) {
    done = typeof done === 'function' ? done : function () {};
    var dest = randomOtherOpenLoc(owner, locId);
    if (!dest) { done(); return; }                  // nowhere to send her → fizzle

    // STATE FIRST, VISUALS SECOND. spawnCardAt is untouched and runs to completion
    // here — the Merchant is fully, correctly in its slot (stats, wasSpawned,
    // trade wiring, scores) before any animation starts. Everything below only
    // changes when that already-real card becomes VISIBLE.
    var slots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    var before = (slots[dest.id] || []).slice();    // identity snapshot
    if (!spawnCardAt(owner, dest.id, MERCHANT_ID)) { done(); return; }

    if (window.SOG_DEBUG && typeof console !== 'undefined') {
      console.log('[Hatshepsut] sent a Merchant from loc ' + locId + ' to loc ' + dest.id);
    }

    // Which slot did it land in? Found by OBJECT IDENTITY against the snapshot
    // rather than by re-running indexOf(null) or scanning for cardId — spawnCardAt
    // re-syncs (and may compact) the column, and the side may already hold another
    // Merchant, so identity is the only unambiguous answer.
    var idx = -1;
    (slots[dest.id] || []).forEach(function (sd, i) {
      if (sd && before.indexOf(sd) === -1) idx = i;
    });

    var rfx = window.SOG && SOG.RevealFx;
    var hatEl   = findSlotEl(owner, 52);
    var merchEl = (idx !== -1) ? getSlotEl(owner, dest.id, idx) : null;

    // The boat launch is scoped to THIS ability — a Merchant played from hand, or
    // arriving any other way, never routes through here and is unaffected. If the
    // flourish is unavailable the spawn simply appears as it always did.
    if (rfx && typeof rfx.hatshepsutBoatLaunch === 'function' && hatEl && merchEl) {
      rfx.hatshepsutBoatLaunch(hatEl, merchEl, { sfx: 'sfx/boatsplash.mp3' }, done);
    } else {
      done();
    }
  }

  /* Tribe (id 36) — REACTIVE PRESENTATION ONLY (no IP/state/timing change).
     Tribe's actual +IP is computed in evaluateContinuous (a lump-sum continuous
     recompute), which isn't a clean per-card event. Instead this onCardLandedHere
     fires once per card that LANDS at Tribe's location, AFTER that card's reveal +
     At Once have resolved (the fireOnCardLandedHere dispatcher runs post-reveal).
     We gate on the EXACT same condition evaluateContinuous uses for Tribe's bonus
     — the landed card is same-owner as Tribe AND was played on or after the turn
     right after Tribe (turnPlayed >= tribe.turnPlayed + 1) — so the bounce fires
     exactly when Tribe gains bonus IP from that card. ctx.locId is Tribe's
     CURRENT location (wherever this dispatch is firing for), so a card landing
     at Tribe's location after Tribe has moved there still bounces correctly.
     Visual/audio only via SOG.RevealFx. */
  function tribeReactBounce(ctx, done) {
    done = typeof done === 'function' ? done : function () {};
    if (!ctx || ctx.landedOwner !== ctx.owner) { done(); return; }   // Tribe counts same-owner cards only
    var tribe = ctx.slot;
    if (!tribe || typeof tribe.turnPlayed !== 'number') { done(); return; }
    var slots = (ctx.owner === 'player' ? G.playerSlots : G.aiSlots)[ctx.locId];
    if (!slots) { done(); return; }
    var landed = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] && slots[i].cardId === ctx.landedCardId) { landed = slots[i]; break; }
    }
    if (!landed || landed.turnPlayed < tribe.turnPlayed + 1) { done(); return; }  // this card grants Tribe no bonus
    var el = getSlotEl(ctx.owner, ctx.locId, ctx.slotIndex);
    if (el && window.SOG && SOG.RevealFx && typeof SOG.RevealFx.reactBounce === 'function') {
      // AWAIT the bounce: hold the reveal pipeline until it finishes so the
      // bounce is sequenced to its OWN triggering (same-owner) card and never
      // overlaps the next card's reveal — otherwise, when the player goes
      // first, the bounce bleeds onto the opponent's card reveal and reads as
      // if the opponent's play triggered it.
      SOG.RevealFx.reactBounce(el, 'sfx/tribe.m4a', ctx.landedCardId, done);
    } else {
      done();
    }
  }

  /* Nebuchadnezzar (id 50) — "Builder of Babylon": At Once, reduce the owner's
     in-hand Mesopotamia cards by -1 CC. A ONE-TIME stamp on the cards in hand at
     reveal (G.nebCCDiscount[side][cardId]) — NOT a continuous board aura (that was
     too strong) and NOT applied to later-drawn cards. Read by the player cost path
     (board.js effectiveCost + input.js refreshHandCostDisplays) and the Giant AI
     cost path (ai.js). The stamp is applied at the magic-shimmer beat so the effect
     reads as caused by the shimmer; the turn waits for the flourish via done.
       • PLAYER reveals Neb → Neb shimmers AND the player's in-hand Mesopotamia cards
         sparkle while their CC ticks down in sync (their hand got cheaper).
       • OPPONENT reveals Neb → only Neb's card shimmers; the stamp still lands on the
         opponent's in-hand Mesopotamia cards, but their hand is face-down so there's
         nothing to sparkle on-screen.
     The in-hand sparkle + CC-drop therefore runs ONLY for the side whose hand is
     visible (the player), while the stamp applies to whichever side played Neb. */
  function abilityNebuchadnezzar(owner, locId, done) {
    var nebEl = findSlotEl(owner, 50);
    // The cards that get the one-time -1 stamp: the OWNER's in-hand Mesopotamia
    // cards (player or AI). The hand here is what's LEFT after this turn's plays.
    var ownerHand = (owner === 'player') ? (G.playerHand || []) : (G.aiHand || []);
    var affectedIds = ownerHand.filter(function (cardId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      return card && card.era === 'Mesopotamia';
    });
    // DOM elements to shimmer — ONLY the player's (visible) hand. The opponent's
    // hand is face-down, so there's nothing on-screen to sparkle (the stamp still
    // applies to their cards via the cost path; it's just not visualized in-hand).
    var handEls = [];
    if (owner === 'player') {
      var handRoot = document.getElementById('battle-player-hand');
      if (handRoot) {
        affectedIds.forEach(function (cardId) {
          var el = handRoot.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
          if (el) handEls.push(el);
        });
      }
    }
    // At the shimmer beat: STAMP the one-time -1 onto those in-hand cards (the real
    // effect), then refresh the player's displayed costs to match. Idempotent —
    // the singleton deck means at most one Neb, and re-stamping a card is a no-op.
    function onDrop() {
      if (!G.nebCCDiscount) G.nebCCDiscount = { player: {}, opp: {} };
      var bag = G.nebCCDiscount[owner] || (G.nebCCDiscount[owner] = {});
      affectedIds.forEach(function (cardId) { bag[cardId] = 1; });
      if (window.SOG && SOG.input && typeof SOG.input.refreshHandCostDisplays === 'function') {
        SOG.input.refreshHandCostDisplays();
      }
    }
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.nebuchadnezzarShimmer === 'function') {
      rfx.nebuchadnezzarShimmer(nebEl, handEls, { sfx: 'sfx/magicshimmer.m4a', onDrop: onDrop }, done);
    } else {
      onDrop();
      done();
    }
  }

  /* Sargon (id 37) — "Continuous: +3 IP to adjacent location(s)." The +3 itself is
     continuous (evaluateContinuous → G.locationBoosts); this At-Once is PRESENTATION
     ONLY — a beam of light from Sargon's card to each location he actually boosts,
     plus a glow around those full location boxes for the length of ssfxsargon.m4a.
     Targets EXACTLY getAdjacentLocIds(locId) (the same adjacency the boost uses), so
     a middle Sargon beams both neighbors and an end Sargon beams just one. Plays for
     BOTH sides (the board is visible to both). Gates the turn via done. */
  function abilitySargon(owner, locId, done) {
    var sargonEl = findSlotEl(owner, 37);
    var boxes = [];
    getAdjacentLocIds(locId).forEach(function (adjId) {
      var box = boardEl.querySelector('.battle-col[data-loc-id="' + adjId + '"]');
      if (box) boxes.push(box);
    });
    if (!sargonEl || !boxes.length) { done(); return; }   // no adjacent location → no boost → no flourish
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.sargonBeam === 'function') {
      rfx.sargonBeam(sargonEl, boxes, { sfx: 'sfx/ssfxsargon.m4a' }, done);
    } else {
      if (window.SOG && SOG.sfx) SOG.sfx.play('sfx/ssfxsargon.m4a');
      done();
    }
  }

  /* Megalith (id 31) — "Monument": End of turn, gain +1 IP PERMANENTLY and
     cumulatively (addIPMod, the Scribe pattern — a stamped modifier, NOT a
     recomputed continuous mod, so it survives evaluateContinuous re-runs and
     counts in scoring). Fired by the END-OF-TURN phase (fireEndOfTurn below):
     once per turn, after ALL reveals complete, including the turn it's played.
     Presentation: a light-band shimmer sweeps the card; the +1 lands at the
     sweep's midpoint (IP number pops in sync) with a positive 8-bit blip. The
     phase queue AWAITS done — multiple end-of-turn cards fire sequentially. */
  function megalithEndOfTurn(owner, locId, slotIndex, sd, done) {
    // Re-acquire the slot element by owner+cardId (the Hammurabi lesson: slot
    // indexes can shift if an earlier queue entry compacted the board).
    var el = findSlotEl(owner, sd.cardId);
    var rfx = window.SOG && SOG.RevealFx;
    var tick = function () {
      addIPMod(sd, 1, 'Megalith');            // permanent +1, cumulative across turns
      if (typeof SFX !== 'undefined' && SFX.eotGain) SFX.eotGain();
      refreshSlotIPDisplays();                 // IP number updates in sync with the sweep
      updateScores();
    };
    if (rfx && typeof rfx.endOfTurnShimmer === 'function') {
      rfx.endOfTurnShimmer(el, { onTick: tick }, done);
    } else {
      tick();
      done();
    }
  }

  /* ── Egypt era abilities (wired via existing machinery) ────────────────────── */

  /* Obelisk (id 59) — "Monolith": End of turn, gain +1 IP permanently and
     cumulatively. Identical to Megalith (31) — same end-of-turn phase + shimmer,
     different attribution source. */
  function obeliskEndOfTurn(owner, locId, slotIndex, sd, done) {
    var el  = findSlotEl(owner, sd.cardId);
    var rfx = window.SOG && SOG.RevealFx;
    var tick = function () {
      addIPMod(sd, 1, 'Obelisk');
      if (typeof SFX !== 'undefined' && SFX.eotGain) SFX.eotGain();
      refreshSlotIPDisplays();
      updateScores();
    };
    if (rfx && typeof rfx.endOfTurnShimmer === 'function') rfx.endOfTurnShimmer(el, { onTick: tick }, done);
    else { tick(); done(); }
  }

  /* Scribe — Egypt (id 56) — "Accounting" (REWORKED). END OF TURN: the owner's
     OTHER Economic cards at this location each gain +1 IP, permanently.
     Replaces the old At-Once "+1 Capital next turn per other card here": this is
     now an END-OF-TURN phase card (registry key `endOfTurn`), it grants IP rather
     than Capital, and it targets ONLY Economic-type cards.

     Scope, precisely: same owner, same location, type === 'Economic', excluding
     the Scribe doing the firing. Self-exclusion is by SLOT-DATA IDENTITY (s !== sd)
     rather than by id — a Papyrus-copied twin Scribe at the same location is a
     genuinely different card and SHOULD be buffed by this one, which an
     `cardId !== 56` test would have wrongly skipped. (The old Accounting hit the
     mirror image of this bug and solved it by counting instead of id-matching.)

     Firing in the end-of-turn phase means every card played this turn is already
     revealed, so no reveal-ordering care is needed. The +1s land at the pop beat of
     the animation — the visible pop and the real addIPMod are the same event. */
  function scribeEgyptEndOfTurn(owner, locId, slotIndex, sd, done) {
    done = typeof done === 'function' ? done : function () {};
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;

    var targets = [];
    forEachRevealedAt(slots, locId, function (s, i) {
      if (s === sd) return;                                  // not the Scribe itself
      var c = CARDS.find(function (x) { return x.id === s.cardId; });
      if (!c || c.type !== 'Economic') return;               // Economic only
      targets.push({
        el: getSlotEl(owner, locId, i),
        onLand: function () {
          addIPMod(s, 1, 'Scribe');                          // permanent one-time +1 IP
          evaluateContinuous();
          refreshSlotIPDisplays();
          updateScores();
          if (SOG.ui && typeof SOG.ui.showIPFloat === 'function') {
            SOG.ui.showIPFloat(owner, s.cardId, 1);          // the now-BLUE +1 float
          }
        }
      });
    });
    if (!targets.length) { done(); return; }                 // nothing Economic here → fizzle

    var scribeEl = findSlotEl(owner, 56);
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.scribeAccountingSequence === 'function') {
      rfx.scribeAccountingSequence(scribeEl, targets,
        { sfx: 'sfx/scholar-officials-coin.mp3' }, done);
    } else {
      // No flourish available — still apply every +1, then advance.
      targets.forEach(function (t) { t.onLand(); });
      done();
    }
  }

  /* Ra (id 63) — "Sun God": At Once, discard the owner's lowest-CC hand card; Ra
     permanently gains that card's IP (addIPMod). Reuses the Priest discard pattern
     (lowest-CC selection + discardFromHand) plus a permanent stamp on Ra. */
  function abilityRa(owner, locId, done) {
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    if (!hand.length) { done(); return; }
    /* SELECTION AND GAIN BOTH COME FROM handStats — one read per card, so the cost
       Ra judges by and the IP he absorbs cannot disagree with each other or with
       what the player sees.

       CC is the EFFECTIVE cost (effectiveCost — the same read behind the hand badge
       and Book of the Dead's qualification), not the printed cc. Ra used to compare
       card definitions, so he could visibly skip a card whose badge showed 1 in
       favour of one showing 2 whenever a discount was in play (Imhotep on Scientific,
       a Nebuchadnezzar/Ramses stamp).

       IP is that card's effective in-hand value — the same snapshot discardFromHand
       freezes into the pile, taken before anything mutates and notably before
       Jesus's +3 is stamped. That too used to read the definition, so in-hand buffs
       were dropped: a card boosted to 4 gave Ra only its printed 1 while the pile
       entry beside it correctly recorded 4.

       Ties still go to the EARLIEST card in hand order (strict <). */
    var lowestCC = Infinity, lowestId = null, gain = 0;
    hand.forEach(function (id) {
      var hs = handStats(owner, id);
      if (!hs) return;
      if (hs.cc < lowestCC) { lowestCC = hs.cc; lowestId = id; gain = hs.ip; }
    });
    if (lowestId === null) { done(); return; }
    var dc = CARDS.find(function (x) { return x.id === lowestId; });
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var raSd  = null;
    (slots[locId] || []).forEach(function (s) { if (s && s.cardId === 63) raSd = s; });

    /* Where the absorbed card rises FROM — captured before discardFromHand removes
       it. The opponent's origin is their face-down hand strip, but the flyer is
       built from the card definition, so the absorption is shown FACE UP either way
       (the Book of the Dead precedent: a card leaving a hidden hand for a public
       event is revealed). */
    var originEl = null;
    if (owner === 'player') {
      var pHand = document.getElementById('battle-player-hand');
      originEl = pHand && pHand.querySelector('.battle-hand-card[data-id="' + lowestId + '"]');
    } else {
      var oHand = document.getElementById('battle-opp-hand');
      var backs = oHand && oHand.querySelectorAll('.battle-card-back');
      originEl = (backs && backs.length) ? backs[backs.length - 1] : null;
    }

    // NOT { animate: true }: the generic rise-and-fade would fight the absorption,
    // which owns this card's exit from the hand.
    // No manual pile push here — discardFromHand records every discard itself.
    discardFromHand(owner, lowestId, function () {
      /* The IP lands at the ABSORPTION beat, through the shared ipBadgeSwap (its
         second consumer after Pyramid): the apply runs between capturing the old
         badge text and animating the new one in, so the arriving number is read
         back out of the badge after the engine wrote it. No separate float — the
         swap IS the indicator. */
      function absorb() {
        if (raSd && gain !== 0) addIPMod(raSd, gain, 'Ra');
        evaluateContinuous();
        refreshSlotIPDisplays();
        updateScores();
      }

      var rfx  = window.SOG && SOG.RevealFx;
      var raEl = findSlotEl(owner, 63);
      if (rfx && typeof rfx.raAbsorb === 'function' && raEl && dc) {
        rfx.raAbsorb(originEl, dc, {
          raEl:      raEl,
          sourceIP:  gain,
          onAbsorb:  absorb,
          sfx:       'sfx/ra.mp3',
          boardEl:   document.getElementById('battle-board')
        }, done);
      } else {
        absorb();
        done();
      }
    });
  }

  /* Draw the first card of a given TYPE from the owner's deck into their hand
     (respecting maxHandSize). Minimal reusable helper — the engine's first mid-turn
     draw (Khufu 60). Rebuilds the player's visible hand; the AI hand is face-down,
     so only its count changes. Returns true if a card was drawn. */
  function drawTypeFromDeck(owner, type) {
    var deck = owner === 'player' ? G.playerDeck : G.aiDeck;
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    if (!deck || !hand) return false;
    var maxHand = (G.config && G.config.structure && G.config.structure.maxHandSize) || 7;
    if (hand.length >= maxHand) return false;                      // hand full
    var idx = -1;
    for (var i = 0; i < deck.length; i++) {
      var c = CARDS.find(function (x) { return x.id === deck[i]; });
      if (c && c.type === type) { idx = i; break; }
    }
    if (idx === -1) return null;                                   // none in deck → fizzle
    var drawnId = deck.splice(idx, 1)[0];
    hand.push(drawnId);
    if (owner === 'player' && typeof rebuildPlayerHand === 'function') rebuildPlayerHand();
    // Returns the DRAWN CARD ID (null when nothing matched) rather than a bare
    // boolean, so a caller can name exactly what it drew. Truthiness is unchanged
    // for any boolean-style use: an id is truthy, null is falsy.
    return drawnId;
  }

  /* Khufu (id 60) — "Great Pyramid": At Once, draw a Scientific card.
     FIZZLES silently when the owner's deck holds none (drawTypeFromDeck returns
     null and touches nothing). The reveal flourish is Tool's (26) draw animation,
     copied verbatim as reveal-fx handler 60; it animates whichever card this
     actually appended to the hand, and it suppresses itself on the fizzle by
     running the same "is there a Scientific card in this deck" test. */
  function abilityKhufu(owner, locId, done) {
    var drawnId = drawTypeFromDeck(owner, 'Scientific');
    if (window.SOG_DEBUG && typeof console !== 'undefined') {
      console.log('[Khufu] drew ' + (drawnId == null ? 'nothing (no Scientific in deck)' : drawnId));
    }
    done();
  }

  /* Sphinx (id 64) — "Monumental Guardian": Kente-style protection (see
     isKenteProtected), but PER-SIDE rather than symmetric. True if OWNER has a
     revealed Sphinx at locId → that owner's cards there can neither be DESTROYED
     nor have their IP REDUCED. Location-wide: it shields every card the owner has
     there, not just the Sphinx.
       • Reduction is enforced at the two strike sites that reduce IP —
         _soldierStrike (Meso Soldier 42) and the Chariot arrival strike (69).
       • Destruction is enforced through the shared isDestroyProtected gate.
     Egypt-only → returns false (inert) in every non-Egypt battle. */
  function isSphinxProtected(owner, locId) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    return (slots[locId] || []).some(function (s) { return s && s.revealed && abilityIdOf(s) === 64; });
  }

  /* Hyksos (id 67) — "Foreign Kings": At Once on reveal, TRANSFER to the OPPONENT'S
     side of the SAME location (into an open slot). Ownership = array membership, so
     moving the sd from the owner's array to the opponent's array flips ownership for
     ALL systems (scoring/continuous/display/badges) automatically. If the opponent's
     side is FULL (no null slot — face-down/unrevealed cards count as occupying), the
     transfer FAILS and Hyksos stays STUCK on its owner's side (its -2 IP stays the
     owner's — the timing skill). */
  function abilityHyksos(owner, locId, done) {
    var oppSide  = owner === 'player' ? 'opp' : 'player';
    var mySlots  = owner === 'player' ? G.playerSlots : G.aiSlots;
    var oppSlots = oppSide === 'player' ? G.playerSlots : G.aiSlots;
    if ((oppSlots[locId] || []).indexOf(null) === -1) { done(); return; }  // opp side FULL → stuck
    var fromIdx = -1;
    (mySlots[locId] || []).forEach(function (s, i) { if (fromIdx === -1 && s && s.cardId === 67) fromIdx = i; });
    if (fromIdx === -1) { done(); return; }
    var sd = mySlots[locId][fromIdx];
    // Remove from owner's side, compact/re-render.
    mySlots[locId][fromIdx] = null;
    clearSlotDOM(owner, locId, fromIdx);
    if (owner === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
    else                    { compactOppSlots(locId);    syncOppSlots(locId);    }
    // Place onto opponent's side (first open compacted slot) + render.
    var toIdx = oppSlots[locId].indexOf(null);
    oppSlots[locId][toIdx] = sd;
    if (oppSide === 'player') { compactPlayerSlots(locId); syncPlayerSlots(locId); }
    else                      { compactOppSlots(locId);    syncOppSlots(locId);    }
    if (typeof SFX !== 'undefined' && SFX.cardDiscarded) SFX.cardDiscarded();
    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();
    setTimeout(done, 300);
  }


  /* NUBIAN_GOLD_ON_PLAY location key — reveal-end hook (mirrors applyRiverAtOnce /
     applyCapitalWhenFull; called ONCE per turn from revealNext). For each card
     played this turn (both sides) at a location carrying the key, that side gets one
     Nubian Gold token (id 73) into hand — UNLESS the hand is already full (no queue).
     Inert in every battle whose locations don't carry the key. */
  function applyNubianGoldOnPlay(newlyRevealed) {
    if (!G.locations || !newlyRevealed || !newlyRevealed.length) return 0;
    var maxHand = (G.config && G.config.structure && G.config.structure.maxHandSize) || 7;
    var granted = 0;
    newlyRevealed.forEach(function (r) {
      if (r.locId == null) return;
      var loc = G.locations.find(function (l) { return l.id === r.locId; });
      if (!loc || loc.abilityKey !== 'NUBIAN_GOLD_ON_PLAY') return;
      var hand = r.owner === 'player' ? G.playerHand : G.aiHand;
      if (hand.length >= maxHand) return;   // hand full → NO token (no queue)
      hand.push(73);                        // Nubian Gold token
      granted++;
    });
    if (granted > 0) {
      if (typeof rebuildPlayerHand === 'function') rebuildPlayerHand();
      if (SOG.ui && SOG.ui.updateOppHand) SOG.ui.updateOppHand();
    }
    return granted;
  }

  /* ── Batch B: copy/transcribe cards + the "Next Turn:" timing class ────────── */

  /* Papyrus (54) — "For the Record". At Once: create a COPY of the owner's
     most-recently-played card — carrying its CURRENT PERMANENT on-board state —
     and add it to the owner's hand. The copy inherits the source card's
     accumulated ipMod (Megalith/Obelisk growth, Pyramid grabs, river stamps,
     Scribe stamps, strikes — the PERMANENT channel), but NOT contMod (live
     continuous boosts like Hieroglyphics/Narmer-averaging recompute wherever
     the copy is eventually played) and NOT locationBoosts (location-level).
     The inherited amount rides G.copyIPBonus[side][cardId] until the copy is
     PLAYED, where commitPlay folds it into the new sd's ipMod (labelled
     'Papyrus') and CONSUMES the entry — once. Undo re-credits it.
     "Last card you played HERE" = highest playTime revealed card AT PAPYRUS'S OWN
     LOCATION (locId), excluding id 54 (a Papyrus can never copy a Papyrus —
     including copies — which is the structural bound on the copy spiral: each
     Papyrus instance creates at most ONE copy, ever). This was a BOARD-WIDE read,
     which contradicted the card's intent; it is now location-scoped, the same
     shape abilityPyramid (57) already uses for "the last card you played here".
     Fizzles if no prior play HERE, or hand full.
     Inherited amount defensively clamped to ±99 (overflow insurance). */
  function abilityPapyrus(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var hand  = owner === 'player' ? G.playerHand  : G.aiHand;
    var maxHand = (G.config && G.config.structure && G.config.structure.maxHandSize) || 7;

    // Find the owner's most-recently-played card AT PAPYRUS'S OWN LOCATION.
    // lastIdx is kept so the flourish can find that card's slot element to copy.
    var lastId = null, lastSd = null, lastIdx = -1, lastTime = -Infinity;
    (slots[locId] || []).forEach(function (s, si) {
      if (!s || !s.revealed) return;
      if (s.cardId === 54) return;                         // exclude Papyrus itself (and Papyrus copies)
      var t = (typeof s.playTime === 'number') ? s.playTime : -1;
      if (t > lastTime) { lastTime = t; lastId = s.cardId; lastSd = s; lastIdx = si; }
    });

    if (lastId == null) { done(); return; }                // no prior play here → fizzle
    if (hand.length >= maxHand) { done(); return; }        // hand full → fizzle (no copy)

    hand.push(lastId);                                     // the copy (same card id)

    // Carry the source's PERMANENT accumulated IP into the pending copy.
    var inherited = Math.max(-99, Math.min(99, (lastSd && lastSd.ipMod) || 0));
    if (inherited) {
      if (!G.copyIPBonus) G.copyIPBonus = { player: {}, opp: {} };
      var side = owner === 'player' ? 'player' : 'opp';
      G.copyIPBonus[side][lastId] = (G.copyIPBonus[side][lastId] || 0) + inherited;
    }

    // STATE FIRST. Everything above is committed and unchanged; the hand already
    // holds the copy with its copyIPBonus stamped. The flourish below only defers
    // when that new hand card becomes VISIBLE.
    if (typeof rebuildPlayerHand === 'function') rebuildPlayerHand();
    if (SOG.ui && SOG.ui.updateOppHand) SOG.ui.updateOppHand();

    // The copy was PUSHED onto the end of the hand array, and the hand renders in
    // array order, so it is the LAST element — duplicate-cardId safe (a hand can
    // legitimately hold two of the same id once Papyrus has copied one).
    var handEl = null;
    if (owner === 'player') {
      var pHand = document.getElementById('battle-player-hand');
      var cards = pHand ? pHand.querySelectorAll('.battle-hand-card') : null;
      if (cards && cards.length) handEl = cards[cards.length - 1];
    } else {
      var oHand = document.getElementById('battle-opp-hand');
      var backs = oHand ? oHand.querySelectorAll('.battle-card-back') : null;
      if (backs && backs.length) handEl = backs[backs.length - 1];
    }

    var rfx       = window.SOG && SOG.RevealFx;
    var papyrusEl = findSlotEl(owner, 54);
    var targetEl  = (lastIdx !== -1) ? getSlotEl(owner, locId, lastIdx) : null;
    var srcCard   = CARDS.find(function (c) { return c.id === lastId; });

    if (rfx && typeof rfx.papyrusCopyFlourish === 'function' && papyrusEl && targetEl && srcCard) {
      rfx.papyrusCopyFlourish(papyrusEl, targetEl, srcCard,
        { sfx: 'sfx/papyrus.mp3', handEl: handEl, isPlayer: owner === 'player' }, done);
    } else {
      // No flourish available → exactly the previous behaviour, coin sound and all.
      if (typeof SFX !== 'undefined' && SFX.coinSound) SFX.coinSound();
      done();
    }
  }

  /* Pyramid (57) — "Monumental Legacy" (REWORKED). At Once: Pyramid permanently
     GAINS the IP of the last card the owner played at ITS location (any type) —
     base + permanent ipMod of that card (its current accumulated state; live
     contMod excluded, consistent with the Papyrus copy philosophy). Replaces the
     old continuous double-last-Political. Self-identification is twin-safe: the
     just-revealed Pyramid is the revealed 57 here with NO playTime yet (playTime
     is stamped AFTER the At-Once fires), so an earlier-revealed twin (which has
     one) is never re-buffed. Fizzles when no prior own play exists here, or when
     fired via a transcribed Rosetta (no unstamped 57 to buff). */
  function abilityPyramid(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;

    // The just-revealed Pyramid: revealed 57 at this location without a playTime.
    var pyramidSd = null;
    (slots[locId] || []).forEach(function (s) {
      if (pyramidSd || !s || !s.revealed) return;
      if (s.cardId === 57 && typeof s.playTime !== 'number') pyramidSd = s;
    });
    if (!pyramidSd) { done(); return; }                    // transcribed/edge → fizzle

    // Last card the owner played HERE (highest playTime; the Pyramid itself and
    // other just-revealed cards have no playTime yet and are excluded).
    var last = null, lastTime = -Infinity;
    (slots[locId] || []).forEach(function (s) {
      if (!s || !s.revealed || s === pyramidSd) return;
      var t = (typeof s.playTime === 'number') ? s.playTime : -Infinity;
      if (t > lastTime) { lastTime = t; last = s; }
    });
    if (!last) { done(); return; }                         // first card here → fizzle

    // Grab the last card's CURRENT effective IP — base + permanent (ipMod) AND
    // continuous (contMod) mods — i.e. the number showing on its badge right now.
    // effectiveIP includes contMod, so a live type-aura (e.g. Hieroglyphics' +2 to
    // a Political host like Khufu, or Narmer's averaging) is captured; using only
    // ip+ipMod dropped those and grabbed the base value instead of the shown one.
    var gain = Math.max(0, Math.min(99, effectiveIP(last)));
    if (gain <= 0) { done(); return; }

    /* THE GAIN IS DEFERRED TO THE ANIMATION'S LANDING BEAT — not skipped. absorb()
       below is the whole of the original write, handed to the flourish, which calls
       it at the moment the new number appears on the badge (see ipBadgeSwap). That
       keeps "the number shown" and "the number recorded" the same event. Every
       failure path in the flourish calls absorb() anyway, so the IP cannot be lost.
       Nothing mutates in between: the reveal pipeline is gated on this done(). */
    function absorb() {
      addIPMod(pyramidSd, gain, 'Pyramid');
      // No +N float: the badge swap IS Pyramid's IP-change indicator, and stacking a
      // float on the same beat only crowds it. (showIPFloat also fired SFX.ipGained,
      // which was talking over earthspell/woodthud.) refreshSlotIPDisplays below is
      // what writes the new number the swap then animates in.
      evaluateContinuous();
      refreshSlotIPDisplays();
      updateScores();
    }

    // Slot elements by INDEX, resolved from the slot-data objects the ability
    // itself picked — duplicate-cardId safe, so twin Pyramids (a Papyrus copy) and
    // twin source cards each animate on the right element.
    var arr       = slots[locId] || [];
    var pyramidEl = getSlotEl(owner, locId, arr.indexOf(pyramidSd));
    var sourceEl  = getSlotEl(owner, locId, arr.indexOf(last));

    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.pyramidAbsorb === 'function') {
      rfx.pyramidAbsorb(pyramidEl, sourceEl,
        { onAbsorb: absorb, riseSfx: 'sfx/earthspell.mp3', landSfx: 'sfx/woodthud.mp3' }, done);
    } else {
      // No flourish → the previous behaviour exactly, coin sound and all.
      absorb();
      if (typeof SFX !== 'undefined' && SFX.coinSound) SFX.coinSound();
      done();
    }
  }

  /* Narmer (51) — "The Unifier". His actual effect is CONTINUOUS (the total-IP
     averaging in evaluateContinuous) and his persistent red glow is driven from
     that same pass by updateNarmerGlows — neither belongs here. This At-Once slot
     exists purely to fire his arrival sting ONCE, on the reveal that puts him in
     play, rather than on every continuous recompute. Fires for whichever side
     played him, so the boss Narmer and a player's card 51 both sound.
     Was a bare done() no-op before. */
  function abilityNarmer(owner, locId, done) {
    done = typeof done === 'function' ? done : function () {};
    if (window.SOG && SOG.sfx && typeof SOG.sfx.play === 'function') {
      SOG.sfx.play('sfx/narmer.mp3');
    }
    done();
  }

  /* Ramses II (53) — "Ozymandias": At Once, reduce the owner's in-hand Egypt cards
     by -1 CC. Symmetric with Nebuchadnezzar (id 50) — same one-time in-hand stamp
     mechanism (G.ramsesCCDiscount[side][cardId]), same shimmer reuse, just keyed on
     era "Egypt" instead of "Mesopotamia". See abilityNebuchadnezzar above for the
     full rationale (one-time stamp, not a continuous aura, not applied to
     later-drawn cards). Read by the player cost path (board.js effectiveCost +
     input.js refreshHandCostDisplays) and the Giant AI cost path (ai.js). */
  function abilityRamses(owner, locId, done) {
    var ramsesEl = findSlotEl(owner, 53);
    var ownerHand = (owner === 'player') ? (G.playerHand || []) : (G.aiHand || []);
    var affectedIds = ownerHand.filter(function (cardId) {
      var card = CARDS.find(function (c) { return c.id === cardId; });
      return card && card.era === 'Egypt';
    });
    var handEls = [];
    if (owner === 'player') {
      var handRoot = document.getElementById('battle-player-hand');
      if (handRoot) {
        affectedIds.forEach(function (cardId) {
          var el = handRoot.querySelector('.battle-hand-card[data-id="' + cardId + '"]');
          if (el) handEls.push(el);
        });
      }
    }
    function onDrop() {
      if (!G.ramsesCCDiscount) G.ramsesCCDiscount = { player: {}, opp: {} };
      var bag = G.ramsesCCDiscount[owner] || (G.ramsesCCDiscount[owner] = {});
      affectedIds.forEach(function (cardId) { bag[cardId] = 1; });
      if (window.SOG && SOG.input && typeof SOG.input.refreshHandCostDisplays === 'function') {
        SOG.input.refreshHandCostDisplays();
      }
    }
    var rfx = window.SOG && SOG.RevealFx;
    if (rfx && typeof rfx.nebuchadnezzarShimmer === 'function') {
      rfx.nebuchadnezzarShimmer(ramsesEl, handEls,
        { sfx: 'sfx/ramses.mp3', glowClass: 'reveal-fx-ramses-glow', onDrop: onDrop }, done);
    } else {
      onDrop();
      done();
    }
  }

  /* True if a next-turn effect with `key` is ACTIVE for `owner` THIS turn (i.e.
     declared on the owner's previous turn). Active window = exactly the turn after
     the declaring turn. Kept as general infrastructure for future "Next Turn:"
     cards, even though nothing currently pushes onto G.nextTurnEffects. */
  function nextTurnEffectActive(owner, key) {
    if (!G.nextTurnEffects) return false;
    return G.nextTurnEffects.some(function (e) {
      return e.owner === owner && e.key === key && e.turnDeclared === G.turn - 1;
    });
  }

  /* Called from the reveal pipeline for EACH card as it reveals (after its own
     At-Once). Applies any active next-turn reveal effects to the just-revealed
     card, keyed by G.nextTurnEffects entries (see nextTurnEffectActive above).
     Currently a no-op — nothing pushes an entry since Ramses II's old CULTURAL_2X
     ability was replaced — kept as the reveal-pipeline hook for future
     "Next Turn:" cards. */
  function applyNextTurnRevealEffects(owner, cardId, sd, locId) {
    if (!sd || !G.nextTurnEffects || !G.nextTurnEffects.length) return;
  }

  /* Rosetta Stone (58) — "Decipher The Past" (RETARGETED). At Once: ADOPT the ability of the
     FIRST card the owner played at Rosetta's location (earliest playTime among the
     owner's OTHER cards there, excluding any Rosetta so there is no regress). The
     source id is stored on sd.transcribedFrom; from then on Rosetta behaves as if
     she carried that card's ability:
       • AT-ONCE  → fired NOW (below), with Rosetta as the source card.
       • CONTINUOUS → picked up by evaluateContinuous (abilityIdOf detections).
       • END-OF-TURN → picked up by fireEndOfTurn (abilityIdOf lookup).
     Fizzles (stays a plain 3/3) if she is the owner's first card here. Firing the
     transcribed At-Once just calls that card's onAtOnce; continuous/end-of-turn
     cards carry a no-op onAtOnce, so this call harmlessly no-ops for them and the
     other dispatch paths do the work. */
  function abilityRosetta(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;

    /* TARGET = THE CARD IN SLOT 0 AT THIS LOCATION — a POSITION, not a play order.
       This was "the earliest-played card here" (lowest playTime); it is now simply
       slots[locId][0]. The two differ whenever the board has been rearranged: a
       card that MOVED into slot 0, or compaction after a destroy, changes who sits
       first without changing who was played first.
       Fizzles (plain 3/3, no animation) when slot 0 is EMPTY, holds an unrevealed
       card, or holds a Rosetta — self-exclusion is kept so a Rosetta in slot 0
       never transcribes itself into a regress. */
    var arr0  = (slots[locId] || [])[0];
    if (!arr0 || !arr0.revealed || arr0.cardId === 58) { done(); return; }
    var srcId = arr0.cardId;

    // Stamp the adoption on Rosetta's slot data (persists like a real copy).
    // Prefer the UNSTAMPED Rosetta: with two copies at one location (Papyrus can
    // duplicate any card), the old first-found match would re-stamp the already-
    // transcribed twin and leave the just-revealed one blank.
    var rIdx = -1;
    forEachRevealedAt(slots, locId, function (s, i) {
      if (rIdx === -1 && s.cardId === 58 && s.transcribedFrom == null) rIdx = i;
    });
    if (rIdx !== -1) slots[locId][rIdx].transcribedFrom = srcId;

    // STATE FIRST: the adoption above is already stamped. Everything below is the
    // flourish plus the transcribed ability firing, in that order — the text is
    // written onto Rosetta, and then the ability it just copied goes off.
    function fireTranscribed() {
      // Fire the transcribed At-Once now (real at-once fires; continuous/eot no-op).
      var spec = CARD_ABILITIES[srcId];
      if (spec && typeof spec.onAtOnce === 'function') {
        spec.onAtOnce(owner, locId, done);
      } else {
        done();
      }
    }

    var rfx       = window.SOG && SOG.RevealFx;
    var rosettaEl = (rIdx !== -1) ? getSlotEl(owner, locId, rIdx) : null;
    var sourceEl  = getSlotEl(owner, locId, 0);
    if (rfx && typeof rfx.rosettaTranscribe === 'function' && rosettaEl && sourceEl) {
      rfx.rosettaTranscribe(sourceEl, rosettaEl,
        { introSfx: 'sfx/rosettastone.mp3', sfx: 'sfx/writing.mp3' }, fireTranscribed);
    } else {
      fireTranscribed();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BATCH C — RESURRECTION (discard pile + Mummy creation)
     ───────────────────────────────────────────────────────────────
     Two per-side piles, BOTH holding SNAPSHOT ENTRIES of the same shape
     { cardId, ip, cc } — the card's stats FROZEN at the moment it left play:
       • DISCARD  (G.playerDiscard / G.aiDiscard)  — fed by discardFromHand, so
         EVERY hand discard lands here (Ra 63, Book 66, Meso Priest 38, Francis,
         Erasmus, …), snapshotting the card's in-hand stats.
       • DESTROYED (G.playerDestroyed / G.aiDestroyed) — fed by destroyCard,
         snapshotting the board slot's effective stats.
     Both piles gate on staysDead(), so a card that revives itself (Samurai) or
     returns to hand (Jesus) never enters either one.
     MUMMY creation (id 72 token) takes those frozen stats verbatim, so a buffed
     card revives buffed. Priest (71) revives from the MERGED piles; Book (66)
     weighs its own discard and may revive it immediately. Piles reset at battle
     start (game.js).
  ═══════════════════════════════════════════════════════════════ */

  /* Stats of a card SITTING IN HAND for `owner` — the in-hand counterpart of
     effectiveIP/effectiveCC, used to snapshot a discard. Mirrors the hand display
     math (input.js refreshHandIPDisplays / buildHandCard): base IP + the per-side
     in-hand accumulator (Cuneiform's hand boost, resurrection bonuses) + any
     Papyrus copy bonus riding on the card, with William (15) reading the
     destroyed-IP total instead of the accumulator.
     CC is the card's EFFECTIVE COST — the discounted number shown on the in-hand CC
     badge, not the printed card.cc — via the same board.effectiveCost the play-charge
     uses, so Henry/Cosimo/Nebuchadnezzar/Babylon/Imhotep/Ramses discounts all count.
     locId is null deliberately: a card in hand is at no location, so the only
     location-scoped clause (the Levant's RELIGIOUS_DISCOUNT) correctly sits this out —
     effectiveCost guards it with `loc &&`. The owner key must be 'player'/'ai' here,
     NOT the 'player'/'opp' used elsewhere in this file, or the discount would be read
     off the wrong side's board.
     This one number feeds BOTH the discard-pile entry and Book of the Dead's weighing,
     so "what the card was worth in hand" stays a single definition — and the Mummy a
     Book spawns now is identical to the one a Priest revives from the same entry
     later. */
  function handStats(owner, cardId) {
    var c = CARDS.find(function (x) { return x.id === cardId; });
    if (!c) return null;
    var side  = owner === 'player' ? 'player' : 'opp';
    var bonus = (cardId === 15)
      ? ((owner === 'player' ? G.destroyedIPTotal : G.aiDestroyedIPTotal) || 0)
      : ((owner === 'player' ? G.cardIPBonus : G.aiCardIPBonus)[cardId] || 0);
    var copy  = (G.copyIPBonus && G.copyIPBonus[side] && G.copyIPBonus[side][cardId]) || 0;
    return {
      ip: c.ip + bonus + copy,
      cc: effectiveCost(c, null, owner === 'player' ? 'player' : 'ai')
    };
  }

  /* Append a discarded card's SNAPSHOT to the owner's discard pile. Called from
     ONE place — discardFromHand — so every discard is piled exactly once (no
     per-caller pushes to double up). Gated by the shared staysDead() predicate,
     so Jesus (who returns to hand) never lands here. */
  function pushDiscard(owner, cardId, stats) {
    if (cardId == null || !staysDead(cardId, 'discard')) return;
    var st    = stats || handStats(owner, cardId) || { ip: 0, cc: 0 };
    var entry = { cardId: cardId, ip: st.ip, cc: st.cc };
    if (owner === 'player') { (G.playerDiscard = G.playerDiscard || []).push(entry); }
    else                    { (G.aiDiscard     = G.aiDiscard     || []).push(entry); }
  }

  /* The MOST RECENT discard-pile entry for cardId (null if it never landed there —
     e.g. Jesus, who returned to hand). Book of the Dead uses this to weigh and
     revive the exact entry its own discard just created. */
  function findDiscardEntry(owner, cardId) {
    var pile = owner === 'player' ? G.playerDiscard : G.aiDiscard;
    if (!pile) return null;
    for (var i = pile.length - 1; i >= 0; i--) {
      if (pile[i] && pile[i].cardId === cardId) return pile[i];
    }
    return null;
  }

  /* Consume ONE entry from the owner's discard pile. Takes the ENTRY OBJECT
     (spliced by identity, so two discards of the same card with different frozen
     IP can never be confused) or, for convenience, a bare cardId. */
  function popDiscard(owner, ref) {
    var pile = owner === 'player' ? G.playerDiscard : G.aiDiscard;
    if (!pile || ref == null) return;
    var i = (typeof ref === 'object')
      ? pile.indexOf(ref)
      : pile.findIndex(function (e) { return e && e.cardId === ref; });
    if (i !== -1) pile.splice(i, 1);
  }

  /* Consume ONE entry from the owner's DESTROYED pile (same contract as popDiscard). */
  function popDestroyed(owner, ref) {
    var pile = owner === 'player' ? G.playerDestroyed : G.aiDestroyed;
    if (!pile || ref == null) return;
    var i = (typeof ref === 'object')
      ? pile.indexOf(ref)
      : pile.findIndex(function (e) { return e && e.cardId === ref; });
    if (i !== -1) pile.splice(i, 1);
  }

  /* IP a Mummy inherits when reviving `sourceId` from a pile entry whose frozen IP
     is `baseIP`. Keyed per-source-card rule set (Tut-only for now, structured for
     future additions): King Tutankhamen (61) "Sacred Tomb" → the revived Mummy gets
     DOUBLE IP. Realized here at creation because the Mummy carries the stats, not
     Tut's ability. `baseIP` omitted → falls back to the card definition's IP (used
     by AI scoring when it is ranking a card rather than a pile entry). */
  function resurrectionIP(sourceId, baseIP) {
    var ip = baseIP;
    if (ip == null) {
      var c = CARDS.find(function (x) { return x.id === sourceId; });
      ip = c ? c.ip : 0;
    }
    if (sourceId === 61) ip *= 2;   // Tutankhamen — Sacred Tomb: 2x IP on resurrection
    return ip;
  }

  /* Create a revealed Mummy (id 72 token) at locId for owner, inheriting the FROZEN
     stats of the pile entry being revived: `ip` / `cc` are the values the source card
     carried when it left play, so a buffed card revives buffed and a destroyed Mummy
     revives with its own inherited stats (its card definition is 0/0 — deriving from
     CARDS would silently zero it). Both default to the card definition when omitted.
     Tut's Sacred Tomb doubling is applied on top by resurrectionIP.
     Returns false (FIZZLE) if the location has no open slot. Stats live on the slot
     data — sd.ip drives scoring everywhere (effectiveIP), and sd.cc is honored by ALL
     CC reads via effectiveCC(sd) (Juvenal's CC≥4, Hammurabi's lowest-CC, the Egypt
     Soldier's CC-1 destroy, AI CC scoring) plus the CC badge (board._faceCard). NO
     playTime stamp: a Mummy is created, not played, so reveal-order abilities
     (Papyrus/Pyramid/Rosetta) ignore it. wasResurrected is a general flag for any
     "if resurrected" card. */
  /* SFX for a mummy wrap. King Tutankhamen (61) gets his own sting wherever he is
     wrapped — Priest revival OR Book of the Dead — and everything else gets the
     ordinary linen. One definition so the two call sites cannot drift apart.
     Note this is about being WRAPPED: Tut played normally from hand is untouched. */
  var KING_TUT_ID = 61;
  function wrapSfxFor(sourceCardId) {
    return sourceCardId === KING_TUT_ID ? 'sfx/kingtut.mp3' : 'sfx/wrapping.mp3';
  }

  /* The card face a wrap should show BEFORE the bandages — the source card's own
     art carrying its FROZEN cc, so the numbers on the pre-wrap face are the numbers
     the Mummy inherits rather than the card definition's. */
  function wrapSourceFace(sourceCardId, frozenCC) {
    var c = CARDS.find(function (x) { return x.id === sourceCardId; });
    if (!c) return null;
    return (frozenCC != null && frozenCC !== c.cc) ? Object.assign({}, c, { cc: frozenCC }) : c;
  }

  function createMummy(owner, locId, sourceId, ip, cc) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var si    = (slots[locId] || []).indexOf(null);
    if (si === -1) return false;                        // no room → fizzle
    var src     = CARDS.find(function (x) { return x.id === sourceId; });
    var frozenIP = (ip != null) ? ip : (src ? src.ip : 0);
    var frozenCC = (cc != null) ? cc : (src ? src.cc : 0);
    var sd  = {
      cardId: 72, ip: resurrectionIP(sourceId, frozenIP), cc: frozenCC,
      revealed: true, ipMod: 0, contMod: 0, ipModSources: [], contModSources: [],
      bonuses: [], turnPlayed: G.turn, wasResurrected: true, resurrectedFrom: sourceId
    };
    slots[locId][si] = sd;
    if (owner === 'player') syncPlayerSlots(locId); else syncOppSlots(locId);
    if (typeof SFX !== 'undefined' && SFX.atOnce) SFX.atOnce();   // light cue (caller adds its own too)
    evaluateContinuous();
    refreshSlotIPDisplays();
    updateScores();
    return true;
  }

  /* Priest — Egypt (id 71) "Embalming": At Once, revive one of the OWNER'S OWN
     discarded OR destroyed cards as a Mummy at Priest's location. The two piles are
     MERGED for the choice and the chosen entry is consumed from whichever pile it
     came from (each candidate carries its own `pile` tag, so identical cardIds in
     both piles stay distinguishable). The Mummy inherits the entry's FROZEN stats.
     Player picks via the shared chooser; the AI takes the entry producing the best
     Mummy. FIZZLES (no-op) if BOTH piles are empty OR Priest's location is full.
     Own piles only — never the opponent's. */
  function priestCandidates(owner) {
    var disc = (owner === 'player' ? G.playerDiscard   : G.aiDiscard)   || [];
    var dest = (owner === 'player' ? G.playerDestroyed : G.aiDestroyed) || [];
    var out  = [];
    disc.forEach(function (e) { if (e) out.push({ cardId: e.cardId, ip: e.ip, cc: e.cc, pile: 'discard',   entry: e }); });
    dest.forEach(function (e) { if (e) out.push({ cardId: e.cardId, ip: e.ip, cc: e.cc, pile: 'destroyed', entry: e }); });
    return out;
  }

  function abilityPriestEgypt(owner, locId, done) {
    var slots = owner === 'player' ? G.playerSlots : G.aiSlots;
    var cands = priestCandidates(owner);
    if (!cands.length || (slots[locId] || []).indexOf(null) === -1) { done(); return; }  // fizzle
    function revive(cand) {
      if (!cand) { done(); return; }

      /* STATE FIRST. createMummy is untouched and runs to completion here — the
         Mummy is in its slot with its frozen IP/CC, and the pile entry consumed,
         before any strap is drawn. The flourish only holds the card face invisible
         until the wrap comes off.
         Hooked HERE and not inside createMummy on purpose: Book of the Dead (66)
         calls that same primitive, and only the Priest wraps. */
      var slots2 = owner === 'player' ? G.playerSlots : G.aiSlots;
      var before = (slots2[locId] || []).slice();          // identity snapshot
      if (!createMummy(owner, locId, cand.cardId, cand.ip, cand.cc)) { done(); return; }
      if (cand.pile === 'destroyed') popDestroyed(owner, cand.entry);
      else                           popDiscard(owner, cand.entry);

      // Which slot did the Mummy land in? By OBJECT IDENTITY against the snapshot —
      // createMummy re-syncs the column, and a side can already hold another Mummy.
      var mIdx = -1;
      (slots2[locId] || []).forEach(function (sd2, i) {
        if (sd2 && before.indexOf(sd2) === -1) mIdx = i;
      });

      var rfx = window.SOG && SOG.RevealFx;
      var mummyEl  = (mIdx !== -1) ? getSlotEl(owner, locId, mIdx) : null;
      var priestEl = findSlotEl(owner, 71);
      if (rfx && typeof rfx.mummyWrapReveal === 'function' && mummyEl) {
        /* The SHARED wrap (Book of the Dead uses the same one). sourceCard makes it
           fade the revived card's own face in first, so you see WHO is coming back
           before the bandages go on; sourceFadeMs is the length of that beat. */
        rfx.mummyWrapReveal(mummyEl, {
          sfx:          wrapSfxFor(cand.cardId),
          sourceCard:   wrapSourceFace(cand.cardId, cand.cc),
          sourceIP:     cand.ip,
          sourceFadeMs: 380,
          lifterEl:     priestEl
        }, done);
      } else {
        done();                                            // Mummy simply appears, as before
      }
    }
    if (owner === 'player') {
      showDiscardChooser('Revive a discarded or destroyed card', cands, function (chosen) { revive(chosen); });
    } else {
      // Rank by the MUMMY the revive would produce — the entry's FROZEN IP with
      // Tut's doubling applied, not the card definition's base IP.
      var best = cands[0];
      cands.forEach(function (c) {
        if (resurrectionIP(c.cardId, c.ip) > resurrectionIP(best.cardId, best.ip)) best = c;
      });
      revive(best);
    }
  }

  /* Book of the Dead (id 66) "Weighing of the Heart": At Once, the owner discards ONE
     card from hand AT RANDOM — no chooser, no AI preference, symmetric for both sides.
     The randomness IS the card: picking your own IP==CC card on demand was far too
     strong. The discard ALWAYS happens; the resurrection is the gamble.

     THE WEIGHING reads the DISCARD-PILE ENTRY that discardFromHand just created,
     rather than re-deriving anything. That single choice buys four behaviours for
     free, which is why this ability is now almost pure composition:
       • EFFECTIVE stats — the entry is handStats()'s frozen snapshot, so in-hand
         buffs (Cuneiform's hand boost, a Papyrus copy's inherited IP, William's
         destroyed-IP total) are already folded in. A card buffed to IP==CC qualifies.
       • CONSISTENCY — the Mummy Book spawns now and the Mummy a Priest revives from
         the same pile entry later are identical, because both read the same frozen
         numbers.
       • JESUS — a randomly-discarded Jesus (5/5, so he WOULD weigh) flies back to
         hand instead, and staysDead keeps him out of the pile. No entry → no
         weighing → no Mummy. Without that gate he would sit in hand and on the board
         at once.
       • NO DOUBLE-PUSH — discardFromHand owns the pile write; this ability never
         pushes its own.
     On a balanced weighing the Mummy spawns at a RANDOM location of the owner's with
     an open slot (Book's own included), carrying
     the entry's frozen IP/CC, and the entry is consumed. If that location is FULL the
     resurrection fizzles but the discard still stands — the card stays in the pile,
     revivable by a Priest later. If IP != CC it simply stays discarded.
     Empty hand (including "Book was the only card you held") → nothing to discard and
     no effect at all. */
  function abilityBookOfDead(owner, locId, done) {
    var hand = owner === 'player' ? G.playerHand : G.aiHand;
    if (!hand.length) { done(); return; }              // nothing to discard → no-op

    var pick = hand[Math.floor(Math.random() * hand.length)];

    /* Where the judgment card rises FROM — captured before discardFromHand removes
       it. The opponent's origin is its face-down hand strip, but the flyer itself is
       built from the card definition, so the judgment is shown FACE UP for either
       side: a card leaving hand for public judgment is public. */
    var originEl = null;
    if (owner === 'player') {
      var pHand = document.getElementById('battle-player-hand');
      originEl = pHand && pHand.querySelector('.battle-hand-card[data-id="' + pick + '"]');
    } else {
      var oHand = document.getElementById('battle-opp-hand');
      var backs = oHand && oHand.querySelectorAll('.battle-card-back');
      originEl = (backs && backs.length) ? backs[backs.length - 1] : null;
    }

    function afterDiscard(discardedId) {
      // No entry → the card came BACK (Jesus) and was never really discarded.
      var entry = findDiscardEntry(owner, discardedId);
      var destSlotEl = null, balanced = false, fallLeft = false;
      var srcIP = entry ? entry.ip : null, srcCC = entry ? entry.cc : null;
      if (entry) {
        balanced = (entry.ip === entry.cc);
        // The scale tips toward the HEAVIER stat: CC badge is top-left, IP top-right.
        fallLeft = (entry.cc > entry.ip);
      }
      if (entry && entry.ip === entry.cc) {            // the heart balances → resurrect
        /* DESTINATION IS A RANDOM LOCATION, not Book's own — the scatter is the
           point of the card. randomOtherOpenLoc with a null exclusion is exactly
           "any location of mine with an open slot": nothing equals null, so no
           location is excluded, and Book's OWN location stays eligible (Book is
           already sitting in one of its slots, so indexOf(null) accounts for it).
           Reused rather than re-implemented so "open slot" has one definition.
           NOWHERE OPEN → the resurrection fizzles and the card STAYS IN THE
           DISCARD PILE, still revivable later by a Priest. The discard itself
           already happened and is never undone. */
        var dest = randomOtherOpenLoc(owner, null);
        if (dest) {
          var dSlots = owner === 'player' ? G.playerSlots : G.aiSlots;
          var dBefore = (dSlots[dest.id] || []).slice();       // identity snapshot
          if (createMummy(owner, dest.id, discardedId, entry.ip, entry.cc)) {
            popDiscard(owner, entry);
            // The slot the Mummy REALLY landed in, by object identity — that is
            // where the glide must fly to, so shown destination == actual spawn.
            var dIdx = -1;
            (dSlots[dest.id] || []).forEach(function (sd2, i) {
              if (sd2 && dBefore.indexOf(sd2) === -1) dIdx = i;
            });
            if (dIdx !== -1) destSlotEl = getSlotEl(owner, dest.id, dIdx);
          }
        }
        // Nowhere open → resurrection fizzles; the card stays in the pile,
        // still Priest-revivable. balanced stays true, so the judgment still
        // levels out — it simply has no slot to glide into.
      }

      /* STATE IS ALREADY DONE — discard, pile entry, qualification, and the spawn
         at the random destination with frozen stats all happened above. The
         judgment below only visualises it: the face is the card actually
         discarded, `balanced` is the real qualification, `fallLeft` is the real
         heavier stat, and destSlotEl is the slot really spawned into. */
      var rfx = window.SOG && SOG.RevealFx;
      if (rfx && typeof rfx.bookJudgment === 'function' && entry) {
        rfx.bookJudgment(originEl, wrapSourceFace(discardedId, srcCC), {
          balanced:   balanced && !!destSlotEl,
          fallLeft:   fallLeft,
          destSlotEl: destSlotEl,
          wrapSfx:    wrapSfxFor(discardedId),
          ghostSfx:   'sfx/bookofthedeadghost.mp3',
          sourceCard: wrapSourceFace(discardedId, srcCC),
          sourceIP:   srcIP,
          boardEl:    document.getElementById('battle-board')
        }, done);
      } else {
        done();                                        // no flourish → instant, as before
      }
    }

    // NOT { animate: true }: Anim.cardDiscarded's rise-and-fade would fight the
    // judgment, which owns this card's exit from the hand.
    discardFromHand(owner, pick, function () { afterDiscard(pick); });
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
    31: { endOfTurn: megalithEndOfTurn      },  // Megalith — End of turn: gain +1 IP (permanent, cumulative)
    35: { onCardLandedHere: abilityOtziFlee },  // Ötzi — reactive flee (any card lands at his loc after he's revealed)
    36: { onCardLandedHere: tribeReactBounce },  // Tribe — reactive bounce+sfx (presentation only; IP stays in evaluateContinuous)
    74: { onAtOnce: abilityPapyrusEconomic },         // Papyrus (Economic) — Natural Resource: +2 IP to Scientific cards here
    75: { onAtOnce: abilityPurpleDye },               // Purple Dye — Natural Resource: +2 IP to Political cards here
    76: { onCardLandedHere: abilityMerchantTrade },   // Merchant (Egypt) — Economic played here → +1 IP, then random move (fizzles if nowhere to go)

    /* ── Mesopotamia era ───────────────────────────────────────────
       Phase C cards (37 Sargon, 43 Gilgamesh) remain stubbed.      */
    37: { onAtOnce: abilitySargon },  // Sargon — Continuous +3 (evaluateContinuous); At-Once = beam+glow flourish
    38: { onAtOnce: abilityPriest       },
    39: { onAtOnce: abilityFarmer       },  // Harvest — +1 capital next turn (shared accumulator)
    40: { onAtOnce: abilityScribe },  // Record Keeper — At Once: stamps +1 IP onto owner's other cards here
    41: { onAtOnce: function (o, l, done) { done(); } },  // Canals   — Continuous only
    42: { onAtOnce: abilitySoldier      },
    43: {},  // Gilgamesh — Continuous only; handled in evaluateContinuous
    44: { onAtOnce: function (o, l, done) { done(); } },  // Enkidu   — Continuous only
    45: { onAtOnce: function (o, l, done) { done(); } },  // Ziggurat — Continuous only
    46: { onAtOnce: abilityCuneiform    },
    47: { onAtOnce: abilityHammurabi    },
    48: { onAtOnce: function (o, l, done) { done(); } },  // Chariot  — movement ability
    49: { onAtOnce: abilityPhoenicians  },
    50: { onAtOnce: abilityNebuchadnezzar },  // Nebuchadnezzar — Continuous discount; At-Once = shimmer flourish

    /* ── Egypt era (WIRED only). Continuous cards (Narmer/Pyramid/Hieroglyphics/
       Sphinx/Imhotep) carry a no-op onAtOnce and do their work in
       evaluateContinuous / effectiveCost / the strike guard. NOT-YET-WIRED Egypt
       cards have NO entry here (and are never decked). ── */
    51: { onAtOnce: abilityNarmer          },             // Narmer — Continuous (IP averaging) + one-shot play SFX
    52: { onAtOnce: abilityHatshepsut      },             // Hatshepsut — At Once: send a Merchant to another location
    53: { onAtOnce: abilityRamses          },             // Ramses II — At Once: -1 CC to Egypt cards in your hand
    54: { onAtOnce: abilityPapyrus         },             // Papyrus — At Once: copy last-played card (with its permanent buffed state) to hand
    55: { onAtOnce: abilityFarmerEgypt     },             // Farmer (EGY) — arms +1 IP for the NEXT card played (own fn; Meso Farmer 39 untouched)
    56: { endOfTurn: scribeEgyptEndOfTurn  },             // Scribe (EGY) — End of Turn: +1 IP to OTHER Economic cards here
    57: { onAtOnce: abilityPyramid         },             // Pyramid — At Once: gain the IP of the last card played here
    58: { onAtOnce: abilityRosetta         },             // Rosetta Stone — adopt the SLOT-0 card's ability here
    59: { endOfTurn: obeliskEndOfTurn      },             // Obelisk — End of turn: +1 IP (Megalith key)
    60: { onAtOnce: abilityKhufu           },             // Khufu — draw a Scientific card
    62: { onAtOnce: function (o, l, done) { done(); } },  // Hieroglyphics — Continuous (+1 Religious/Political)
    63: { onAtOnce: abilityRa              },             // Ra — discard lowest → permanent +IP
    64: { onAtOnce: function (o, l, done) { done(); } },  // Sphinx — Continuous protection: no destroy (isDestroyProtected) + no IP reduction (_soldierStrike / Chariot strike)
    65: { onAtOnce: function (o, l, done) { done(); } },  // Imhotep — Continuous (effectiveCost -1 Scientific)
    66: { onAtOnce: abilityBookOfDead      },             // Book of the Dead — discard + weigh (IP==CC → revive now)
    67: { onAtOnce: abilityHyksos          },             // Hyksos — transfer to opponent's side (stuck if full)
    69: { onAtOnce: function (o, l, done) { done(); } },  // Chariots — movement card; arrival -2 strike in executeMoveAnimated
    70: { onAtOnce: abilitySoldierEgypt    },             // Soldier (EGY) — destroy an opponent 1-CC card here
    71: { onAtOnce: abilityPriestEgypt     },             // Priest (EGY) — revive a discarded OR destroyed card as a Mummy here
    73: { onAtOnce: abilityFarmer          }              // Nubian Gold (token) — +1 capital next turn (Farmer machinery)
  };

  /* ═══════════════════════════════════════════════════════════════
     FIRE AT ONCE DISPATCHER
     Replaces the old switch statement in game.js. Looks up the
     ability spec in CARD_ABILITIES and invokes onAtOnce if present.
  ═══════════════════════════════════════════════════════════════ */

  function fireAtOnce(owner, cardId, locId, done) {
    // Cards with actual At Once abilities: play sound + pulse animation.
    // Cards 2, 3, 5, 13 have custom sfx — skip the generic 8-bit chime for those.
    // Tool (26) has its own SFX (the hammer strike via SOG.RevealFx) and Soldier
    // (42) has its own hit SFX (the charge impact) — skip the generic 8-bit chime
    // for those too (keep the pulse).
    var hasAtOnce = [4, 8, 9, 23, 26, 38, 39, 42, 46, 47, 49].indexOf(cardId) !== -1;
    if (hasAtOnce) {
      if (typeof SFX !== 'undefined' && cardId !== 26 && cardId !== 42) SFX.atOnce();
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
  function fireOnCardLandedHere(landedOwner, landedCardId, locId, allDone) {
    var finish = function () { if (typeof allDone === 'function') allDone(); };
    if (locId == null) { finish(); return; }
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
    if (!reactors.length) { finish(); return; }
    // Barrier: each reactor receives its own done(); allDone (the reveal
    // pipeline's continuation) fires only once EVERY reactor has completed — so
    // an async reactor like Ötzi's flee slide fully finishes before the next
    // card reveals. Synchronous reactors (e.g. Tribe's bounce) call done() at once.
    var pending = reactors.length;
    var one = function () { if (--pending === 0) finish(); };
    reactors.forEach(function (r) {
      CARD_ABILITIES[r.cardId].onCardLandedHere({
        owner: r.owner, locId: r.locId, slotIndex: r.slotIndex, slot: r.slot,
        landedOwner: landedOwner, landedCardId: landedCardId
      }, one);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     END-OF-TURN PHASE DISPATCHER (general — data-driven per card)
     ────────────────────────────────────────────────────────────────
     Called ONCE per turn by game.js (revealNext completion → the
     _proceedAfterReveal wrapper), after ALL of this turn's reveals, At-Once
     abilities, continuous mods, river stamps and Chariot movement have
     resolved and BEFORE the turn advances / endGame tallies — so a gain
     landed here counts this turn. Like applyCapitalWhenFull, it is a
     DISCRETE once-per-turn phase: never call it from evaluateContinuous
     (multi-fire trap).

     Collects every revealed on-board card (both sides) whose
     CARD_ABILITIES[id].endOfTurn is a function — including cards revealed
     THIS turn — into ONE GLOBAL QUEUE ordered by sd.playTime (the reveal-
     sequence stamp set at flip time in game.js: monotonically increasing
     across the whole battle, so earlier-revealed fires first; two revealed
     the same turn keep their within-turn reveal order; both sides
     interleave naturally). Unstamped cards (defensive) fire last.

     Fires SEQUENTIALLY: each handler's animation completes (done) before
     the next fires; after each fire the board re-tallies + refreshes so
     location totals update visibly per card. allDone releases the turn —
     the turn WAITS for the whole phase (coupled, like Scribe/Soldier).

     Once-per-turn guarantee: called from a single reveal-end site AND each
     card is stamped sd._eotFiredTurn = G.turn before its handler runs, so
     even a double invocation cannot double-fire a card. */
  function fireEndOfTurn(allDone) {
    var finish = function () { if (typeof allDone === 'function') allDone(); };
    var q = [];
    ['player', 'opp'].forEach(function (side) {
      var slots = side === 'player' ? G.playerSlots : G.aiSlots;
      G.locations.forEach(function (loc) {
        (slots[loc.id] || []).forEach(function (sd, si) {
          if (!sd || !sd.revealed) return;
          var spec = CARD_ABILITIES[abilityIdOf(sd)];   // Rosetta adopts via transcribedFrom
          if (!spec || typeof spec.endOfTurn !== 'function') return;
          if (sd._eotFiredTurn === G.turn) return;   // already fired this turn
          q.push({ owner: side, locId: loc.id, slotIndex: si, sd: sd, spec: spec });
        });
      });
    });
    if (!q.length) { finish(); return; }   // no end-of-turn cards → zero-cost no-op

    // Global reveal order: earlier playTime first (stable across turns/sides).
    q.sort(function (a, b) {
      var pa = (typeof a.sd.playTime === 'number') ? a.sd.playTime : Infinity;
      var pb = (typeof b.sd.playTime === 'number') ? b.sd.playTime : Infinity;
      return pa - pb;
    });

    var i = 0;
    (function next() {
      if (i >= q.length) { finish(); return; }
      var r = q[i++];
      r.sd._eotFiredTurn = G.turn;   // stamp BEFORE firing — re-entry safe
      r.spec.endOfTurn(r.owner, r.locId, r.slotIndex, r.sd, function () {
        // Re-tally + refresh after EACH fire so totals/displays track per card.
        evaluateContinuous();
        refreshSlotIPDisplays();
        updateScores();
        next();
      });
    })();
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC EXPORTS
  ═══════════════════════════════════════════════════════════════ */
  SOG.abilities = {
    /* Dispatch + engine */
    fireAtOnce:                fireAtOnce,
    fireOnCardLandedHere:      fireOnCardLandedHere,
    fireEndOfTurn:             fireEndOfTurn,
    evaluateContinuous:        evaluateContinuous,
    applyCapitalWhenFull:      applyCapitalWhenFull,
    applyRiverAtOnce:          applyRiverAtOnce,
    applyNubianGoldOnPlay:     applyNubianGoldOnPlay,
    applyNextTurnRevealEffects: applyNextTurnRevealEffects,
    createMummy:               createMummy,       // Batch C — resurrection
    pushDiscard:               pushDiscard,
    popDiscard:                popDiscard,
    popDestroyed:              popDestroyed,
    priestCandidates:          priestCandidates,  // merged discard ∪ destroyed (Priest 71 / AI scoring)
    resurrectionIP:            resurrectionIP,
    staysDead:                 staysDead,         // shared pile-eligibility predicate
    consumePendingIPBuff:      consumePendingIPBuff,  // Egypt Farmer (55) — reveal-pipeline hook
    effectiveCC:               effectiveCC,       // CC honoring a Mummy's inherited sd.cc
    /* Shared ability helpers (callable from game.js if needed) */
    isKenteProtected:          isKenteProtected,
    isSphinxProtected:         isSphinxProtected,
    isDestroyProtected:        isDestroyProtected,   // shared Kente+Sphinx destroy gate
    destroyCard:               destroyCard,
    discardFromHand:           discardFromHand,
    updateWilliamDisplay:      updateWilliamDisplay,
    pulseWilliam:              pulseWilliam,
    updateKenteGlows:          updateKenteGlows,
    updateNarmerGlows:         updateNarmerGlows,
    pulseHieroglyphicsGains:   pulseHieroglyphicsGains,
    /* UI */
    showDiscardChooser:        showDiscardChooser,
    buildChooserCard:          buildChooserCard,
    showRevealFirstHighlight:  showRevealFirstHighlight,
    hideRevealFirstHighlight:  hideRevealFirstHighlight,
    /* Helpers */
    getAdjacentLocIds:              getAdjacentLocIds,
    chariotArrival:                 chariotArrival,
    fireMoveHereBonus:              fireMoveHereBonus,   // called by game.js applyMove for EVERY move
    /* The registry itself — exposed so future passes / pro devs can
       extend it without touching this file. */
    CARD_ABILITIES:            CARD_ABILITIES
  };

})();

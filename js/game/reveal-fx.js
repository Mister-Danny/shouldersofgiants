/**
 * reveal-fx.js — per-card REVEAL presentation (SFX + flavor animations).
 *
 * This is PRESENTATION FLAVOR ONLY — it never touches gameplay, IP, scoring,
 * or timing. It is deliberately kept SEPARATE from the CARD_ABILITIES registry
 * (which owns rules logic). game.js's flipSlot() fires SOG.RevealFx.fire(ctx)
 * once per card reveal, after the card-reveal scale-in finishes.
 *
 * To add a card: drop one entry into REGISTRY keyed by card id. Cards with no
 * entry reveal exactly as before — nothing else is affected.
 *
 * Each handler receives a ctx and returns the number of milliseconds the reveal
 * pipeline should wait before advancing. These effects OVERLAY the flip and run
 * non-blocking (CSS classes self-remove), so they return 0 — the turn loop is
 * never stalled.
 *
 * ctx = {
 *   cardId, owner, locId, slotIndex,   // identity / board position
 *   card,                              // CARDS entry
 *   slotEl,                            // this card's .battle-card-slot element
 *   getSlotEl(owner, locId, slotIndex) // resolver passed in from game.js scope
 * }
 */
window.SOG = window.SOG || {};
SOG.RevealFx = (function () {
  'use strict';

  var SLOTS_PER_LOC = (SOG.state && SOG.state.SLOTS_PER_LOC) || 4;

  function playSfx(src) {
    try { new Audio(src).play(); } catch (e) {}
  }

  // Add a CSS class, then strip it after ms so the animation can re-trigger on
  // a future reveal. Defensive against a missing element.
  function flashClass(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);   // restart if somehow still present
    // Force reflow so re-adding the class re-runs the animation.
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { if (el) el.classList.remove(cls); }, ms);
  }

  /* ── Registry: cardId → handler(ctx) → extraDelay(ms) ──────────── */
  var REGISTRY = {
    // Tool (26): "hammer swing". The card rotates from upright to FULL HORIZONTAL
    // pivoting on its bottom-right corner (a hammer striking down), then bounces
    // back upright. Three things sync on the IMPACT beat (full horizontal):
    //   1) tool.m4a fires (setTimeout at IMPACT_MS),
    //   2) Tool's At Once draw fires — we RETURN IMPACT_MS as the reveal's extra
    //      delay, so flipSlot's done → fireAtOnce → abilityTool draws + rebuilds
    //      the hand exactly when the hammer lands,
    //   3) the freshly drawn card pulls in (deferred one tick after the draw).
    // The bounce-back tail (impact → upright) runs after, overlaying the next
    // reveal — only the impact beat is paced, matching the Kente/Juvenal pattern.
    26: function (ctx) {
      var IMPACT_MS = 500;    // = the 50% keyframe (full horizontal) of revealFxToolSwing (1s)
      var SFX_AT    = IMPACT_MS - 350;  // fire tool.m4a 350ms earlier so its strike lands on the visual impact (knob)
      var SWING_MS  = 1000;   // full swing + rebound; class self-removes after this
      var handSel   = '#battle-player-hand .battle-hand-card';
      var beforeCount = document.querySelectorAll(handSel).length;

      flashClass(ctx.slotEl, 'reveal-fx-tool-swing', SWING_MS);

      // SFX leads the visual impact (the audio has lead-in before its "crack").
      setTimeout(function () { playSfx('sfx/tool.m4a'); }, Math.max(0, SFX_AT));

      // Draw + pull-in stay synced to the impact beat (extraDelay below). Defer
      // one tick so the hand has been rebuilt, then pull the newly drawn (last)
      // card in — but only if the hand actually grew (deck could be empty).
      setTimeout(function () {
        setTimeout(function () {
          var cards = document.querySelectorAll(handSel);
          if (cards.length > beforeCount) {
            flashClass(cards[cards.length - 1], 'reveal-fx-tool-draw-in', 450);
          }
        }, 0);
      }, IMPACT_MS);

      return IMPACT_MS;       // pace the reveal's done (→ Tool's draw) to the impact beat
    },

    // Fire (29): matchstrike SFX + a warm illuminate pulse that settles back.
    29: function (ctx) {
      playSfx('sfx/matchstrike.m4a');
      flashClass(ctx.slotEl, 'reveal-fx-illuminate', 850);
      return 0;
    },

    // Cave Art (30): a caveman ARM holding charcoal pops in over the card's face
    // (centre, slightly high — no fade-in) and "scribbles" — a subtle wandering
    // jitter + slight rotation that reads as drawing (no marks appear). caveart.m4a
    // plays; the scribble runs for the SFX's duration, then the arm fades out.
    // Pure overlay: an <img> appended to the slot (clipped to the card), positioned
    // + animated by CSS. Returns 0 — overlays the reveal without stalling the loop.
    30: function (ctx) {
      var arm = document.createElement('img');
      arm.className = 'reveal-fx-caveart-arm';
      arm.src = 'images/assets/caveart@0.5x.png';
      arm.draggable = false;
      arm.setAttribute('aria-hidden', 'true');
      ctx.slotEl.appendChild(arm);   // pops in instantly (no fade-in)

      var removed = false;
      function finish() {
        if (removed) return; removed = true;
        arm.classList.add('reveal-fx-caveart-arm-out');   // CSS fades opacity -> 0
        setTimeout(function () { if (arm.parentNode) arm.parentNode.removeChild(arm); }, 450);
      }

      // Scribble lasts the DURATION of the SFX: fade when caveart.m4a ends. A
      // fallback timer covers a blocked/silent/missing audio so it always cleans up.
      try {
        var audio = new Audio('sfx/caveart.m4a');
        audio.addEventListener('ended', finish);
        audio.play().catch(function () {});
      } catch (e) {}
      setTimeout(finish, 2600);   // fallback duration (knob) if 'ended' never fires

      return 0;
    },

    // Domesticated Animal (32): the borders of ADJACENT cards (same owner,
    // ±1 slot at this location — mirrors the ability's own adjacency rule)
    // briefly glow, then fade. Only occupied neighbors glow.
    32: function (ctx) {
      playSfx('sfx/domesticatedanimal.m4a');
      [ctx.slotIndex - 1, ctx.slotIndex + 1].forEach(function (adjIdx) {
        if (adjIdx < 0 || adjIdx >= SLOTS_PER_LOC) return;
        if (adjIdx === ctx.slotIndex) return;   // never glow the DA card itself
        var el = ctx.getSlotEl(ctx.owner, ctx.locId, adjIdx);
        if (el && el !== ctx.slotEl && el.classList.contains('occupied')) {
          flashClass(el, 'reveal-fx-neighbor-glow', 850);
        }
      });
      return 0;
    },

    // Neanderthal (34): neanderthal SFX + a small drop-into-place settle.
    34: function (ctx) {
      playSfx('sfx/neanderthal.m4a');
      flashClass(ctx.slotEl, 'reveal-fx-dropin', 450);
      return 0;
    }
  };

  function fire(ctx) {
    if (!ctx) return 0;
    var fn = REGISTRY[ctx.cardId];
    if (typeof fn !== 'function') return 0;
    try { return fn(ctx) || 0; } catch (e) { return 0; }
  }

  function has(cardId) { return typeof REGISTRY[cardId] === 'function'; }

  // Reactive flourish (NOT a reveal): a small upward "happy hop" + optional SFX,
  // used by Tribe (36) when it gains bonus IP from a card played at its location.
  // Called by the ability layer (abilities.js onCardLandedHere) AFTER the
  // triggering card has resolved; a short delay sequences it as a reaction beat.
  // Self-removing so it re-triggers cleanly on each subsequent bonus.
  function reactBounce(slotEl, sfxSrc) {
    if (!slotEl) return;
    setTimeout(function () {
      if (sfxSrc) playSfx(sfxSrc);
      flashClass(slotEl, 'reveal-fx-bounce', 480);
    }, 140);
  }

  return { fire: fire, has: has, reactBounce: reactBounce };
})();

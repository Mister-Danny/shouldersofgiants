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
    if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; }
    try { new Audio(src).play(); } catch (e) {}
  }

  // ── Reveal SERIALIZATION ──────────────────────────────────────────────
  // Each reveal's animation+sfx is one sequence that must fully RESOLVE before
  // the next reveal's begins (no overlapping animations or piled-up sounds).
  // A handler's return value is the extra ms the reveal pipeline waits before
  // advancing. The pipeline ALREADY spaces consecutive reveals by ~INTER_REVEAL_GAP
  // (the flip scale-in + REVEAL_DELAY), so a handler only needs to ask for the
  // amount its sequence EXCEEDS that gap — short effects (≤ gap) add nothing and
  // stay snappy; long ones (Gilgamesh, Cave Art…) hold just long enough that the
  // next animation can't start until this one has resolved. Ability-coupled
  // animations (Scribe/Soldier/Cuneiform/Phoenicians/Chariot) already gate via
  // their own done(), so they serialize the same way.
  var REVEAL_DELAY     = (SOG.state && SOG.state.REVEAL_DELAY) || 800;
  var FLIP_IN_MS       = 320;                          // game.js flipSlot scale-in before effects fire
  var INTER_REVEAL_GAP = REVEAL_DELAY + FLIP_IN_MS;    // spacing the pipeline already inserts between reveals
  function holdFor(animMs) { return Math.max(0, (animMs || 0) - INTER_REVEAL_GAP); }

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

  // Shared neighbor-border glow (Domesticated Animal 32 + Enkidu 44): the borders of
  // ADJACENT occupied cards (same owner, ±1 slot at this location — the cards' own
  // adjacency rule) briefly glow, then fade. The adjacency + glow are identical for
  // both cards; only the COLOUR (via glowClass) and the sfx differ. Self-cleaning
  // (flashClass strips the class after the fade). Returns nothing; callers return 0.
  function neighborGlow(ctx, glowClass, sfxSrc) {
    if (sfxSrc) playSfx(sfxSrc);
    [ctx.slotIndex - 1, ctx.slotIndex + 1].forEach(function (adjIdx) {
      if (adjIdx < 0 || adjIdx >= SLOTS_PER_LOC) return;
      if (adjIdx === ctx.slotIndex) return;   // never glow the source card itself
      var el = ctx.getSlotEl(ctx.owner, ctx.locId, adjIdx);
      if (el && el !== ctx.slotEl && el.classList.contains('occupied')) {
        flashClass(el, glowClass, 850);
      }
    });
  }

  // A handful of glowing embers that rise from the card's CENTRE, drift slightly
  // OUTWARD as they rise, flicker, and fade — layered over Fire's illuminate.
  // Pure overlay: a container of particle divs appended to the slot, each driven
  // by CSS with per-ember RANDOMIZED custom properties (rise height, outward
  // drift, speed, stagger, peak opacity) + a randomized colour/size so the cluster
  // looks organic, not mechanical. The whole layer self-removes after the embers
  // fade so nothing lingers and it re-triggers cleanly on the next Fire reveal.
  function spawnEmbers(slotEl) {
    if (!slotEl) return;
    var COUNT  = 7;                                    // a handful (knob)
    var COLORS = ['#ffd24a', '#ffae3b', '#ff8a2b'];    // yellow / amber / orange (knob)
    var layer = document.createElement('div');
    layer.className = 'reveal-fx-ember-layer';
    layer.setAttribute('aria-hidden', 'true');

    var maxEnd = 0;   // longest (delay + duration) → when to clean up the layer
    for (var i = 0; i < COUNT; i++) {
      var rise  = 48 + Math.random() * 34;          // px risen before winking out (knob)
      var drift = (Math.random() * 2 - 1) * 22;     // outward sway, +/- & randomized (knob)
      var size  = 4 + Math.random() * 3;            // px ember size (knob)
      var dur   = 0.7 + Math.random() * 0.35;       // s rise+fade duration (knob)
      var delay = Math.random() * 0.28;             // s stagger so they don't move in lockstep
      var flick = 0.12 + Math.random() * 0.08;      // s flicker period (knob)
      var peak  = 0.8 + Math.random() * 0.2;        // max opacity of this ember
      var color = COLORS[Math.floor(Math.random() * COLORS.length)];
      maxEnd = Math.max(maxEnd, dur + delay);

      var ember = document.createElement('div');
      ember.className = 'reveal-fx-ember';
      ember.style.setProperty('--rise',  rise.toFixed(1) + 'px');
      ember.style.setProperty('--dx',    drift.toFixed(1) + 'px');
      ember.style.setProperty('--dur',   dur.toFixed(3) + 's');
      ember.style.setProperty('--delay', delay.toFixed(3) + 's');
      ember.style.setProperty('--peak',  peak.toFixed(2));

      var core = document.createElement('div');
      core.className = 'reveal-fx-ember-core';
      core.style.width = core.style.height = size.toFixed(1) + 'px';
      core.style.background = color;
      core.style.boxShadow = '0 0 ' + (size * 1.7).toFixed(1) + 'px ' +
                             (size * 0.7).toFixed(1) + 'px ' + color;
      core.style.animationDuration = flick.toFixed(3) + 's';   // randomized flicker rate

      ember.appendChild(core);
      layer.appendChild(ember);
    }
    slotEl.appendChild(layer);
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, (maxEnd + 0.4) * 1000);
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

    // Fire (29): matchstrike SFX + a warm illuminate pulse that settles back,
    // plus a few glowing embers rising off the card's centre (see spawnEmbers).
    29: function (ctx) {
      playSfx('sfx/matchstrike.m4a');
      flashClass(ctx.slotEl, 'reveal-fx-illuminate', 850);
      spawnEmbers(ctx.slotEl);
      return holdFor(1300);   // illuminate 0.85s + embers rise/fade ~1.3s
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
        audio.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1;
        audio.addEventListener('ended', finish);
        audio.play().catch(function () {});
      } catch (e) {}
      setTimeout(finish, 2600);   // fallback duration (knob) if 'ended' never fires

      return holdFor(2340);   // caveart.m4a ~1.89s scribble + 0.45s fade-out
    },

    // Domesticated Animal (32): adjacent occupied neighbors' borders glow GREEN,
    // then fade (shared neighborGlow helper + its own sfx).
    32: function (ctx) {
      neighborGlow(ctx, 'reveal-fx-neighbor-glow', 'sfx/domesticatedanimal.m4a');
      flashClass(ctx.slotEl, 'reveal-fx-howl', 1850);   // card rears its head up to howl
      return holdFor(1800);
    },

    // Enkidu (44): same neighbor-border glow as Domesticated Animal, but in AMBER
    // (the -enkidu colour class) with enkidu.mp3 — the shared glow, different colour.
    44: function (ctx) {
      neighborGlow(ctx, 'reveal-fx-neighbor-glow-enkidu', 'sfx/enkidu.mp3');
      flashClass(ctx.slotEl, 'reveal-fx-howl', 1850);   // card rears its head up to howl
      return holdFor(1800);
    },

    // Ziggurat (45): a single bell-strike — zigguratbell.mp3 + a "struck bell"
    // resonating wobble that DAMPS DOWN to rest (decaying oscillation in the CSS
    // keyframe). Pure presentation overlay; the class self-removes after the ring-out
    // so nothing sticks. Returns 0 — never stalls the loop, fires for either owner.
    45: function (ctx) {
      playSfx('sfx/zigguratbell.mp3');
      flashClass(ctx.slotEl, 'reveal-fx-ziggurat-ring', 1150);
      return holdFor(1150);   // ring-out wobble 1.1s (bell sfx tail rings into the gap)
    },

    // Neanderthal (34): neanderthal SFX + a small drop-into-place settle.
    34: function (ctx) {
      playSfx('sfx/neanderthal.m4a');
      flashClass(ctx.slotEl, 'reveal-fx-dropin', 450);
      return holdFor(450);   // drop-in settle 0.42s (fits the gap → no extra wait)
    },

    // Farmer (39): "Harvest" coin SFX + an onion that POPS UP from the card's
    // centre and DISSIPATES as it rises. Pure overlay: an <img> appended to the
    // slot, animated by CSS (rise + fade via @keyframes revealFxOnionPop), then
    // self-removed so it re-triggers cleanly on the next Farmer reveal. Returns 0
    // — overlays the reveal without stalling the turn loop.
    39: function (ctx) {
      playSfx('sfx/scholar-officials-coin.mp3');
      var onion = document.createElement('img');
      onion.className = 'reveal-fx-onion';
      onion.src = 'images/assets/onion@0.25x.png';
      onion.draggable = false;
      onion.setAttribute('aria-hidden', 'true');
      ctx.slotEl.appendChild(onion);
      // Remove after the pop+fade finishes (must outlast revealFxOnion's duration).
      setTimeout(function () {
        if (onion.parentNode) onion.parentNode.removeChild(onion);
      }, 1400);
      return holdFor(1400);   // onion pop + rise/fade ~1.4s
    },

    /* Farmer — EGYPT (55): PHASE 1 of a two-phase effect. The same onion pop the
       Meso Farmer (39) above uses — an <img> overlay on the slot, popped and
       dissipated by CSS, self-removing — but with a boing instead of the coin
       cha-ching, and no number: the "+1" belongs to the card this Farmer BUFFS,
       not to the Farmer. Phase 2 (the onion descending onto that buffed card and
       being bitten) is farmerOnionBite below, fired from the reveal pipeline once
       the buffed card has finished its own reveal. */
    55: function (ctx) {
      playSfx('sfx/boingjump.mp3');
      var onion = document.createElement('img');
      onion.className = 'reveal-fx-onion';
      onion.src = 'images/assets/onion@0.25x.png';
      onion.draggable = false;
      onion.setAttribute('aria-hidden', 'true');
      ctx.slotEl.appendChild(onion);
      setTimeout(function () {
        if (onion.parentNode) onion.parentNode.removeChild(onion);
      }, 1400);
      return holdFor(1400);   // onion pop + rise/fade ~1.4s
    },

    // Gilgamesh (43): the card grows and PULSES with a heartbeat throb for the
    // duration of gilgamesh.mp3, then DISSOLVES back to its resting size as the sfx
    // ends. Pure presentation overlay (no ability coupling): a CSS class drives the
    // grow-in + infinite throb; when the audio 'ends' we freeze the current scale and
    // transition it smoothly back to 1 (the dissolve-back), restoring the slot's
    // inline transform so nothing sticks. A fallback timer covers blocked/silent
    // audio. Returns 0 — overlays the flip without stalling the turn loop, and fires
    // for either owner (RevealFx.fire is keyed on cardId, not who played the card).
    43: function (ctx) {
      var slot = ctx.slotEl;
      if (!slot) { playSfx('sfx/gilgamesh.mp3'); return 0; }

      var prevTransform  = slot.style.transform;
      var prevTransition = slot.style.transition;
      var prevZ          = slot.style.zIndex;
      slot.classList.add('reveal-fx-gilgamesh');   // grow-in + heartbeat throb

      var settled = false;
      function settle() {
        if (settled) return; settled = true;
        // Freeze the current (animated) scale, then ease it back down to rest.
        var cur = getComputedStyle(slot).transform;
        slot.classList.remove('reveal-fx-gilgamesh');
        slot.style.transition = 'none';
        slot.style.transform  = (cur && cur !== 'none') ? cur : 'scale(1)';
        slot.style.zIndex     = '9';
        void slot.offsetWidth;                       // commit the frozen scale
        slot.style.transition = 'transform 0.55s ease-out';
        slot.style.transform  = 'scale(1)';          // dissolve back to resting size
        setTimeout(function () {                      // then restore the slot's own styles
          slot.style.transition = prevTransition;
          slot.style.transform  = prevTransform;
          slot.style.zIndex     = prevZ;
        }, 600);
      }

      // Dissolve-back coincides with the sound ending; fallback covers silent/blocked audio.
      try {
        var audio = new Audio('sfx/gilgamesh.mp3');
        audio.volume = (window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1;
        audio.addEventListener('ended', settle);
        audio.play().catch(function () {});
      } catch (e) {}
      setTimeout(settle, 2700);   // fallback ≈ gilgamesh.mp3 length (~2.53s) + margin (knob)

      return holdFor(2530);   // pulse runs for gilgamesh.mp3 ~2.53s (dissolve-back rings into the gap)
    }
  };

  function fire(ctx) {
    if (!ctx) return 0;
    var fn = REGISTRY[ctx.cardId];
    if (typeof fn !== 'function') return 0;
    try { return fn(ctx) || 0; } catch (e) { return 0; }
  }

  function has(cardId) { return typeof REGISTRY[cardId] === 'function'; }

  // FULL reveal-animation/sfx duration (ms) per card id — the whole sequence each
  // REGISTRY handler kicks off, NOT the paced `holdFor()` value it returns. Used to
  // delay reactions (Tribe's bounce) until the triggering card's reveal has fully
  // finished. Keep in sync with the matching handler above.
  var FULL_MS = {
    26: 1000,   // Tool swing+rebound
    29: 1300,   // Fire illuminate + embers
    30: 2340,   // Cave Art scribble + fade
    32: 1850,   // Domesticated Animal howl
    34: 450,    // Neanderthal drop-in
    39: 1400,   // Farmer onion pop
    55: 1400,   // Farmer (Egypt) onion pop
    43: 2530,   // Gilgamesh pulse
    44: 1850,   // Enkidu howl
    45: 1150    // Ziggurat ring-out
  };
  function fullRevealMs(cardId) { return FULL_MS[cardId] || 0; }

  // Reactive flourish (NOT a reveal): a small upward "happy hop" + optional SFX,
  // used by Tribe (36) when it gains bonus IP from a card played at its location.
  // Called by the ability layer (abilities.js onCardLandedHere) AFTER the
  // triggering card has resolved; a short delay sequences it as a reaction beat.
  // Self-removing so it re-triggers cleanly on each subsequent bonus.
  //
  // landedCardId (optional): the card that triggered this bonus. If it has a reveal
  // animation/sfx that's still playing, hold the bounce until that finishes so the
  // Tribe reaction never steps on the landed card's own reveal. flipSlot's done()
  // already consumed holdFor(full) = full - INTER_REVEAL_GAP, so the time remaining
  // when we get here is exactly min(full, INTER_REVEAL_GAP); 0 for plain cards (no
  // reveal fx), which keeps them snappy. A 140ms reaction beat follows either way.
  function reactBounce(slotEl, sfxSrc, landedCardId, onDone) {
    onDone = typeof onDone === 'function' ? onDone : function () {};
    if (!slotEl) { onDone(); return; }
    var pre = (landedCardId != null)
      ? Math.min(fullRevealMs(landedCardId), INTER_REVEAL_GAP)
      : 0;
    setTimeout(function () {
      if (sfxSrc) playSfx(sfxSrc);
      flashClass(slotEl, 'reveal-fx-bounce', 480);
      // Hold the reveal pipeline until the bounce finishes so it stays bound to
      // its OWN triggering card and never bleeds onto the next card's reveal
      // (which, when the player goes first, would be the opponent's card and
      // make the bounce look like the opponent triggered it).
      setTimeout(onDone, 480);
    }, pre + 140);
  }

  // Scribe (40) stamping sequence (PRESENTATION; the IP is applied by the ability
  // layer via each target's onLand callback — this only paces the visuals).
  // ONE stamp element (fixed-position, so it's independent of slot DOM) travels to
  // each target in order, presses DOWN onto the card, and at the bottom of the
  // press fires onLand() (the ability applies the real +1 there) + plays the sfx +
  // leaves a cuneiform mark on the card for ~markMs, then lifts and moves on. After
  // the last card it fades out and is removed. onComplete() fires when the whole
  // sequence is done — the ability passes its `done` here, so the reveal pipeline
  // waits for all stamps. Everything (stamp + marks) is self-cleaning.
  //   targets: [{ el: <slot element>, onLand: function }]
  //   opts:    { sfx, travelMs, pressMs, markMs, gapMs, liftPx, riseMs }
  //
  // The SCRIBE CARD ITSELF is the stamp: we clone its slot into a fixed-position
  // flyer, hide the original in its played spot, lift the flyer up, then press it
  // DOWN onto each target in slot order. At the bottom of each press it fires
  // onLand() (the ability applies the real +1) + plays the sfx + leaves a cuneiform
  // mark (inverted to white so it reads). After the last card the flyer returns to
  // the Scribe's slot and is removed, restoring the original. Self-cleaning.
  function scribeStampSequence(scribeEl, targets, opts, onComplete) {
    opts = opts || {};
    var travelMs = opts.travelMs || 300;
    var pressMs  = opts.pressMs  || 140;
    var markMs   = opts.markMs   || 300;
    var gapMs    = opts.gapMs    || 120;
    var liftPx   = opts.liftPx   || 40;   // how high the card hovers above a card before pressing
    var riseMs   = opts.riseMs   || 240;  // initial lift out of its own slot
    var markDelayMs = opts.markDelayMs != null ? opts.markDelayMs : 500;  // show the mark AFTER the
                                          // flyer lifts off, so the card itself doesn't cover it (knob)
    var markHoldMs  = opts.markHoldMs  != null ? opts.markHoldMs  : (markMs + 500);  // how long the mark
                                          // STAYS visible before fading — decoupled from the press pace (knob)

    function finish() { if (typeof onComplete === 'function') onComplete(); }
    if (!targets || !targets.length) { finish(); return; }

    // Leave a cuneiform mark on the just-stamped card; self-removing.
    function showMark(el) {
      if (!el) return;
      var mark = document.createElement('img');
      mark.className = 'reveal-fx-scribe-mark';
      mark.src = 'images/assets/cuneiformstamp.png';
      mark.setAttribute('aria-hidden', 'true');
      el.appendChild(mark);
      setTimeout(function () { mark.classList.add('reveal-fx-scribe-mark-out'); }, markHoldMs);
      setTimeout(function () { if (mark.parentNode) mark.parentNode.removeChild(mark); }, markHoldMs + 280);
    }

    // No Scribe element to fly (defensive) — still apply each +1 and leave marks,
    // paced, so the IP is never skipped and the turn flow advances.
    if (!scribeEl) {
      var k = 0;
      (function plain() {
        if (k >= targets.length) { finish(); return; }
        var t = targets[k];
        if (opts.sfx) playSfx(opts.sfx);
        if (typeof t.onLand === 'function') t.onLand();
        setTimeout(function () { showMark(t.el); }, markDelayMs);
        k++;
        setTimeout(plain, markMs + gapMs);
      })();
      return;
    }

    // Clone the Scribe card into a fixed flyer; hide the original in its slot so it
    // looks like the card itself lifted out to do the stamping.
    var startRect = scribeEl.getBoundingClientRect();
    var fly = scribeEl.cloneNode(true);
    fly.className = (scribeEl.className || '') + ' reveal-fx-scribe-flyer';
    // Set positioning props individually (don't clobber the clone's own inline
    // styles) so the cloned card face renders exactly like the real card.
    fly.style.position      = 'fixed';
    fly.style.width         = startRect.width + 'px';
    fly.style.height        = startRect.height + 'px';
    fly.style.margin        = '0';
    fly.style.zIndex        = '9999';
    fly.style.pointerEvents = 'none';
    fly.style.visibility    = 'visible';   // in case the source slot is mid-hide
    document.body.appendChild(fly);
    scribeEl.style.visibility = 'hidden';

    // Position the flyer's CENTRE over a card, at a vertical offset, with a scale.
    function place(el, scale, offY) {
      var r = el.getBoundingClientRect();
      fly.style.left = (r.left + r.width / 2) + 'px';
      fly.style.top  = (r.top + r.height / 2 + (offY || 0)) + 'px';
      fly.style.transform = 'translate(-50%, -50%) scale(' + (scale || 1) + ')';
    }

    function cleanup() {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      scribeEl.style.visibility = '';
      finish();
    }

    // 1) sit exactly over the played slot, then LIFT up (hover above own slot).
    fly.style.transition = 'none';
    place(scribeEl, 1, 0);
    void fly.offsetWidth;
    fly.style.transition = 'left ' + riseMs + 'ms ease-out, top ' + riseMs +
                           'ms ease-out, transform ' + riseMs + 'ms ease-out';
    place(scribeEl, 1.04, -(liftPx + 6));

    var i = 0;
    function step() {
      if (i >= targets.length) {
        // 5) return to its played slot and settle, then clean up.
        fly.style.transition = 'left ' + travelMs + 'ms ease-in-out, top ' + travelMs +
                               'ms ease-in-out, transform ' + travelMs + 'ms ease-in-out';
        place(scribeEl, 1, 0);
        setTimeout(cleanup, travelMs + 40);
        return;
      }
      var t = targets[i];
      if (!t.el) {   // target slot vanished — still apply the IP, skip its visual
        if (typeof t.onLand === 'function') t.onLand();
        i++; step(); return;
      }
      // 2) travel to hover above the target card
      fly.style.transition = 'left ' + travelMs + 'ms ease, top ' + travelMs +
                             'ms ease, transform ' + travelMs + 'ms ease';
      place(t.el, 1.0, -liftPx);
      setTimeout(function () {
        // 3) press DOWN onto the card (slight squash on contact)
        fly.style.transition = 'top ' + pressMs + 'ms ease-in, transform ' + pressMs + 'ms ease-in';
        place(t.el, 0.96, 0);
        setTimeout(function () {
          // 4) LANDING beat: sfx + the real +1 (onLand) now; the cuneiform MARK is
          // delayed (markDelayMs) so it appears AFTER the card lifts off and stops
          // covering it — so the mark is fully visible.
          if (opts.sfx) playSfx(opts.sfx);
          if (typeof t.onLand === 'function') t.onLand();
          setTimeout(function () { showMark(t.el); }, markDelayMs);
          // hold on the card, then lift back up and move to the next one
          setTimeout(function () {
            fly.style.transition = 'top ' + pressMs + 'ms ease-out, transform ' + pressMs + 'ms ease-out';
            place(t.el, 1.0, -liftPx);
            setTimeout(function () { i++; step(); }, pressMs + gapMs);
          }, markMs);
        }, pressMs);
      }, travelMs);
    }
    setTimeout(step, riseMs + 30);   // start stamping after the initial lift
  }

  // Soldier (42) charge (PRESENTATION; the IP reduction is applied by the ability
  // layer via opts.onImpact — this only paces the visual). A spear flies from the
  // Soldier's slot ACROSS to the EXACT target slot the ability chose, and at the
  // moment of contact fires opts.onImpact() (the ability applies the real -1 there)
  // + plays the hit sfx + shakes the struck card. The spear then retreats to the
  // Soldier and dissipates; the Soldier slot gives a small synced lunge. onComplete
  // fires after the return — the ability passes its `done` here, so the reveal
  // pipeline waits for the charge (same coupling as Scribe's stamping). The spear
  // element is self-cleaning.
  //   opts: { sfx, onImpact, travelMs, returnMs, impactHoldMs, naturalTipDeg }
  //
  // The SOLDIER CARD ITSELF charges: we clone its slot into a fixed flyer (with the
  // spear attached at its leading edge, pointing at the target), hide the original
  // in its slot, then drive the whole card ACROSS the location until it meets the
  // target card. At contact it fires onImpact() (the ability applies the real -1) +
  // hit sfx + shakes the struck card, then the Soldier charges back to its slot and
  // is removed (original restored). onComplete fires after the return, so the reveal
  // pipeline waits for the charge. Self-cleaning.
  function soldierCharge(soldierEl, targetEl, opts, onComplete) {
    opts = opts || {};
    var travelMs     = opts.travelMs     || 480;   // charge-across speed (knob)
    var returnMs     = opts.returnMs     || 340;   // charge-back speed (knob)
    var impactHoldMs = opts.impactHoldMs || 300;   // dwell at the target on impact (knob)
    var tipDeg       = (opts.naturalTipDeg != null) ? opts.naturalTipDeg : -29; // spear art's tip angle

    function finish() { if (typeof onComplete === 'function') onComplete(); }

    // No geometry to animate against → still fire the real effect, then complete,
    // so IP is never skipped and the turn flow always advances.
    if (!soldierEl || !targetEl) {
      if (typeof opts.onImpact === 'function') opts.onImpact();
      finish();
      return;
    }

    var sRect = soldierEl.getBoundingClientRect();
    var tRect = targetEl.getBoundingClientRect();
    var from = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };
    var to   = { x: tRect.left + tRect.width / 2, y: tRect.top + tRect.height / 2 };
    var dx = to.x - from.x, dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / dist, uy = dy / dist;                         // unit travel direction
    var travelAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    var rot = travelAngle - tipDeg;                             // point the spear art along travel

    // Stop the charging card when its leading edge meets the target's near edge
    // (each card's half-extent measured ALONG the travel direction), nudged a touch
    // further so the spear clearly bites into the target.
    var halfS = Math.abs(ux) * sRect.width / 2 + Math.abs(uy) * sRect.height / 2;
    var halfT = Math.abs(ux) * tRect.width / 2 + Math.abs(uy) * tRect.height / 2;
    var advance = Math.max(0, dist - halfS - halfT) + Math.min(halfT * 0.7, 30);
    var impactPt = { x: from.x + ux * advance, y: from.y + uy * advance };

    // Clone the Soldier card into a fixed flyer; hide the original in its slot.
    var fly = soldierEl.cloneNode(true);
    fly.className = (soldierEl.className || '') + ' reveal-fx-soldier-flyer';
    fly.style.position      = 'fixed';
    fly.style.width         = sRect.width + 'px';
    fly.style.height        = sRect.height + 'px';
    fly.style.margin        = '0';
    fly.style.zIndex        = '9998';
    fly.style.pointerEvents = 'none';
    fly.style.visibility    = 'visible';

    // Spear ATTACHED to the card, at its leading edge, pointing toward the target.
    var spear = document.createElement('img');
    spear.className = 'reveal-fx-soldier-spear';
    spear.src = 'images/assets/mesospear@0.25x.png';
    spear.draggable = false;
    spear.setAttribute('aria-hidden', 'true');
    spear.style.left = (50 + ux * 50) + '%';   // at the leading edge, half of it leads the charge
    spear.style.top  = (50 + uy * 50) + '%';
    spear.style.transform = 'translate(-50%, -50%) rotate(' + rot + 'deg)';
    fly.appendChild(spear);

    document.body.appendChild(fly);
    soldierEl.style.visibility = 'hidden';

    function placeFly(p, scale) {
      fly.style.left = p.x + 'px';
      fly.style.top  = p.y + 'px';
      fly.style.transform = 'translate(-50%, -50%) scale(' + (scale || 1) + ')';
    }

    function cleanup() {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      soldierEl.style.visibility = '';
      finish();
    }

    // Start exactly over the played slot.
    fly.style.transition = 'none';
    placeFly(from, 1);
    void fly.offsetWidth;

    // Fire IMPACT when the card ARRIVES (transitionend), with a timeout fallback.
    var impacted = false;
    function onArriveTE(e) { if (e.propertyName === 'left' || e.propertyName === 'top') impact(); }
    fly.addEventListener('transitionend', onArriveTE);

    function impact() {
      if (impacted) return;
      impacted = true;
      fly.removeEventListener('transitionend', onArriveTE);
      // IMPACT: hit sfx + the REAL -1 (onImpact) + struck-card shake — one beat.
      if (opts.sfx) playSfx(opts.sfx);
      if (typeof opts.onImpact === 'function') opts.onImpact();
      flashClass(targetEl, 'reveal-fx-soldier-hit', 360);

      setTimeout(function () {
        // charge back to the slot, then clean up.
        fly.style.transition = 'left ' + returnMs + 'ms ease-out, top ' + returnMs +
                               'ms ease-out, transform ' + returnMs + 'ms ease-out';
        placeFly(from, 1);
        setTimeout(cleanup, returnMs + 40);
      }, impactHoldMs);
    }

    // 1) charge ACROSS to the impact point (slight lift via scale).
    fly.style.transition = 'left ' + travelMs + 'ms ease-in, top ' + travelMs +
                           'ms ease-in, transform ' + travelMs + 'ms ease-in';
    placeFly(impactPt, 1.05);
    setTimeout(impact, travelMs + 90);   // fallback if transitionend is missed
  }

  // Hammurabi (47) sacrifice STRIKE (PRESENTATION; the real destroys happen in the
  // ability layer via opts.onStrike, fired at the down-stroke). Hammurabi's card RISES
  // a little then SLAMS down (a sword/gavel strike) — strikeSfx on the down-stroke. On
  // the strike the doomed cards each SPLIT down the middle; the halves fall to the
  // sides and dissolve (splitSfx). The halves are cloned from the live slots an instant
  // BEFORE onStrike clears them, so the cards that split are exactly the cards removed
  // (same-target integrity, like Scribe/Soldier). onComplete (the ability's done) fires
  // after the halves clear, so the reveal pipeline waits. Self-cleaning.
  //   hammurabiEl: the played Hammurabi's slot element (the striker)
  //   targetEls:   [ <doomed slot element>, ... ] (the sacrifice + the opponent card)
  //   opts:        { strikeSfx, splitSfx, onStrike }
  function hammurabiStrike(hammurabiEl, targetEls, opts, onComplete) {
    opts = opts || {};
    targetEls = (targetEls || []).filter(Boolean);
    function finish() { if (typeof onComplete === 'function') onComplete(); }

    // Split ONE card element into two halves that fall outward + down and dissolve.
    // Reads the element's current visual; call this BEFORE the real destroy clears it.
    function splitCard(el) {
      if (!el || typeof gsap === 'undefined') return;
      var rect = el.getBoundingClientRect();
      var w = rect.width, h = rect.height;
      function half(clip, dir) {
        var g = document.createElement('div');
        g.innerHTML = el.innerHTML;
        g.className = (el.className || '') + ' reveal-fx-hammurabi-half';
        g.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
          'width:' + w + 'px;height:' + h + 'px;margin:0;clip-path:' + clip + ';' +
          'z-index:9997;pointer-events:none;overflow:hidden;';
        document.body.appendChild(g);
        gsap.to(g, {
          x: dir * Math.round(w * 0.6), y: Math.round(h * 0.55), rotation: dir * 16,
          opacity: 0, duration: 0.69, ease: 'power2.in',   // 15% slower, matching the strike
          onComplete: function () { if (g.parentNode) g.parentNode.removeChild(g); }
        });
      }
      half('polygon(0 0,50% 0,50% 100%,0 100%)', -1);     // left half → falls left
      half('polygon(50% 0,100% 0,100% 100%,50% 100%)', 1); // right half → falls right
    }

    // The strike beat: clone the doomed cards (still live), run the REAL destroys,
    // then animate the halves + splitSfx. Order matters — clone BEFORE onStrike.
    function doStrike() {
      targetEls.forEach(splitCard);
      if (typeof opts.onStrike === 'function') opts.onStrike();
      if (opts.splitSfx) playSfx(opts.splitSfx);
    }

    // No striker element or no GSAP (defensive): still destroy + split, then finish.
    if (!hammurabiEl || typeof gsap === 'undefined') {
      doStrike();
      setTimeout(finish, 650);
      return;
    }

    // His INITIAL spot, captured before any transform — the settle returns here.
    var oldNatural = hammurabiEl.getBoundingClientRect();

    gsap.timeline({ delay: 0.2 })                                                     // brief beat before the strike begins
      .set(hammurabiEl, { zIndex: 50, transformOrigin: '50% 100%' })
      .to(hammurabiEl, { y: -28, scale: 1.06, duration: 0.22, ease: 'power2.out' })   // RISE
      .to(hammurabiEl, { y: 12,  scale: 1.0,  duration: 0.11, ease: 'power3.in',      // SLAM down
        onStart: function () { if (opts.strikeSfx) playSfx(opts.strikeSfx); },
        onComplete: function () {
          var slamRect = hammurabiEl.getBoundingClientRect();   // his visual pos at the bottom of the slam

          // Clone Hammurabi into a fixed flyer pinned at the slam spot. The settle +
          // slide play on the CLONE, so they're immune to the compaction below — which
          // re-renders the real slots and is what caused the jump-cut. cssText wipes the
          // cloned slam transform; the card face (child nodes) carries over.
          var fly = hammurabiEl.cloneNode(true);
          fly.style.cssText = 'position:fixed;left:' + slamRect.left + 'px;top:' + slamRect.top + 'px;' +
            'width:' + slamRect.width + 'px;height:' + slamRect.height + 'px;margin:0;' +
            'z-index:9998;pointer-events:none;';
          document.body.appendChild(fly);

          doStrike();   // STRIKE: destroy the two cards — the owner's row compacts, so the real Hammurabi jumps to his new slot

          // Reset the vacated original slot, and hide the real (jumped) Hammurabi so
          // only the clone shows until it slides home.
          gsap.set(hammurabiEl, { clearProps: 'transform,zIndex' });
          var realEl = (typeof opts.getStrikerEl === 'function') ? opts.getStrikerEl() : null;
          if (realEl) realEl.style.visibility = 'hidden';
          var newRect = realEl ? realEl.getBoundingClientRect() : oldNatural;   // his NEW (compacted) spot

          gsap.timeline({
            onComplete: function () {
              if (realEl) realEl.style.visibility = '';
              if (fly.parentNode) fly.parentNode.removeChild(fly);
              finish();
            }
          })
            .to(fly, { left: oldNatural.left, top: oldNatural.top, duration: 0.5, ease: 'power2.out' })  // settle back into his INITIAL spot
            .to({}, { duration: 0.28 })                                                                  // hold while the two halves split + dissolve
            .to(fly, { left: newRect.left, top: newRect.top, duration: 0.42, ease: 'power2.inOut' })     // THEN slide into the new spot
            .timeScale(1 / 1.15);
        }
      })
      .timeScale(1 / 1.15);                                                           // 15% slower overall (rise + slam)
  }

  // Cuneiform (46) synchronized group LIFT (PRESENTATION; the IP boost is applied by
  // the ability layer via opts.onPeak — this only paces the visual). Every target
  // card rises IN PLACE in its own slot, all in unison (the slots span multiple
  // locations; each just translates up, none move toward each other). At the PEAK
  // opts.onPeak() fires — the ability applies the real +1s there, so the visible IP
  // tick-up IS the game-state change. Then they all fall back together. The rise →
  // peak → fall is timed to transform.m4a. Each slot's inline transform / transition
  // / z-index is saved and restored, so nothing sticks after they settle. onComplete
  // fires after the fall, so the reveal pipeline waits for the whole sequence.
  //   targetEls: [ <slot element>, ... ]
  //   opts:      { sfx, onPeak, riseMs, holdMs, fallMs, liftPx }
  function cuneiformLift(targetEls, opts, onComplete) {
    opts = opts || {};
    var riseMs = opts.riseMs || 1150;   // way up
    var holdMs = opts.holdMs || 600;    // dwell at the peak (IP change beat)
    var fallMs = opts.fallMs || 1150;   // back down — rise+hold+fall ≈ transform.m4a (~2.97s)
    var liftPx = opts.liftPx || 26;

    function finish() { if (typeof onComplete === 'function') onComplete(); }
    var els = (targetEls || []).filter(Boolean);

    // No elements to animate → still fire the peak (so IP is never skipped), complete.
    if (!els.length) {
      if (typeof opts.onPeak === 'function') opts.onPeak();
      finish();
      return;
    }

    if (opts.sfx) playSfx(opts.sfx);

    // Save each slot's inline transform/transition/z-index so we can restore exactly.
    var saved = els.map(function (el) {
      return { el: el, transform: el.style.transform || '', transition: el.style.transition || '', zIndex: el.style.zIndex || '' };
    });

    function setLift(up) {
      var ms   = up ? riseMs : fallMs;
      var ease = up ? 'cubic-bezier(0.22,0.61,0.36,1)' : 'cubic-bezier(0.55,0.06,0.68,0.19)';
      saved.forEach(function (s) {
        s.el.style.transition = 'transform ' + ms + 'ms ' + ease;
        s.el.style.transform  = up
          ? ((s.transform ? s.transform + ' ' : '') + 'translateY(-' + liftPx + 'px)')
          : s.transform;
      });
    }

    // Raise above neighbours for the duration of the lift.
    saved.forEach(function (s) { s.el.style.zIndex = '8'; });

    // 1) RISE in unison
    setLift(true);

    // 2) PEAK: apply the real +1s (one beat, once), at the top of the rise.
    setTimeout(function () {
      if (typeof opts.onPeak === 'function') opts.onPeak();
    }, riseMs);

    // 3) FALL in unison after the hold
    setTimeout(function () { setLift(false); }, riseMs + holdMs);

    // 4) Settle: restore each slot's saved inline styles so nothing sticks.
    setTimeout(function () {
      saved.forEach(function (s) {
        s.el.style.transition = s.transition;
        s.el.style.transform  = s.transform;
        s.el.style.zIndex     = s.zIndex;
      });
      finish();
    }, riseMs + holdMs + fallMs + 30);
  }

  // Chariot (48) ARROW (PRESENTATION; the IP reduction is applied by the ability via
  // opts.onImpact — this only paces the visual). Same projectile coordination as
  // soldierCharge: a fixed-position arrow flies from the arrived Chariot's slot to the
  // EXACT chosen target slot; at arrival it fires opts.onImpact() (the ability applies
  // the real -1 there) + an optional sfx + a hit-shake on the struck card, then the
  // arrow DISSOLVES (fade + shrink) and self-cleans. onComplete fires after, so the
  // turn waits. Impact fires on transitionend (true arrival) with a timeout fallback.
  //   opts: { sfx, onImpact, flyMs, naturalTipDeg }
  function chariotArrow(fromEl, targetEl, opts, onComplete) {
    opts = opts || {};
    var flyMs  = opts.flyMs || 360;                                   // flight speed (knob)
    var tipDeg = (opts.naturalTipDeg != null) ? opts.naturalTipDeg : -29;  // arrow art's tip angle

    function finish() { if (typeof onComplete === 'function') onComplete(); }

    // No geometry → still fire the real reduction (never skipped), then complete.
    if (!fromEl || !targetEl) {
      if (typeof opts.onImpact === 'function') opts.onImpact();
      finish();
      return;
    }

    function centerOf(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    var from = centerOf(fromEl), to = centerOf(targetEl);
    var travelAngle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    var rot = travelAngle - tipDeg;   // point the arrow art along the flight

    var arrow = document.createElement('img');
    arrow.className = 'reveal-fx-chariot-arrow';
    arrow.src = 'images/assets/arrow@0.25x.png';
    arrow.draggable = false;
    arrow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(arrow);

    function place(p) { arrow.style.left = p.x + 'px'; arrow.style.top = p.y + 'px'; }
    arrow.style.transform = 'translate(-50%, -50%) rotate(' + rot + 'deg)';
    arrow.style.transition = 'none';
    place(from);
    void arrow.offsetWidth;   // commit start position

    var impacted = false;
    function onArriveTE(e) { if (e.propertyName === 'left' || e.propertyName === 'top') impact(); }
    arrow.addEventListener('transitionend', onArriveTE);

    function impact() {
      if (impacted) return;
      impacted = true;
      arrow.removeEventListener('transitionend', onArriveTE);
      // IMPACT: optional sfx + the REAL -1 (onImpact) + struck-card shake — one beat.
      if (opts.sfx) playSfx(opts.sfx);
      if (typeof opts.onImpact === 'function') opts.onImpact();
      flashClass(targetEl, 'reveal-fx-soldier-hit', 360);   // reuse Soldier's hit-shake
      // DISSOLVE the arrow, then self-clean + complete.
      arrow.style.transition = 'opacity 220ms ease-out, transform 220ms ease-out';
      arrow.style.opacity = '0';
      arrow.style.transform = 'translate(-50%, -50%) rotate(' + rot + 'deg) scale(0.6)';
      setTimeout(function () {
        if (arrow.parentNode) arrow.parentNode.removeChild(arrow);
        finish();
      }, 240);
    }

    // Fling toward the target.
    arrow.style.transition = 'left ' + flyMs + 'ms ease-in, top ' + flyMs + 'ms ease-in';
    place(to);
    setTimeout(impact, flyMs + 90);   // fallback if transitionend is missed
  }

  // Phoenicians (49) MERGE (PRESENTATION; the real consumption + host boost are done
  // by the ability layer via opts.onMerge — this only paces the visual). Phoenicians
  // sits a beat, then plays the sfx, clones itself into a fixed flyer, slides over the
  // FRONT of the target card and DISSOLVES (fades) as it overlaps. At the end of the
  // dissolve opts.onMerge() fires — the ability removes Phoenicians and boosts the host
  // there, so the visible dissolve coincides with the real consumption. onComplete
  // fires after, so the reveal pipeline waits. The original Phoenicians slot is hidden
  // during the slide and restored after the merge (the merge clears it for real).
  //   opts: { sfx, onMerge, sitMs, slideMs }
  function phoeniciansMerge(phoenEl, targetEl, opts, onComplete) {
    opts = opts || {};
    var sitMs   = opts.sitMs   || 500;   // sit in place before moving (knob)
    var slideMs = opts.slideMs || 600;   // slide-over + dissolve (knob)

    function finish() { if (typeof onComplete === 'function') onComplete(); }

    // No geometry → still do the real merge (so logic never skipped), then complete.
    if (!phoenEl || !targetEl) {
      if (typeof opts.onMerge === 'function') opts.onMerge();
      finish();
      return;
    }

    // 1) sit in place, THEN move.
    setTimeout(function () {
      if (opts.sfx) playSfx(opts.sfx);

      var sRect = phoenEl.getBoundingClientRect();
      var tRect = targetEl.getBoundingClientRect();

      // Clone Phoenicians into a fixed flyer; hide the original so the card itself moves.
      var fly = phoenEl.cloneNode(true);
      fly.className = (phoenEl.className || '') + ' reveal-fx-phoenicians-fly';
      fly.style.position      = 'fixed';
      fly.style.width         = sRect.width + 'px';
      fly.style.height        = sRect.height + 'px';
      fly.style.left          = (sRect.left + sRect.width / 2) + 'px';
      fly.style.top           = (sRect.top + sRect.height / 2) + 'px';
      fly.style.margin        = '0';
      fly.style.transform     = 'translate(-50%, -50%)';
      fly.style.zIndex        = '9998';
      fly.style.pointerEvents = 'none';
      fly.style.visibility    = 'visible';
      document.body.appendChild(fly);

      var prevVis = phoenEl.style.visibility;
      phoenEl.style.visibility = 'hidden';

      void fly.offsetWidth;   // commit start position

      // 2) slide over the target's front + dissolve (fade).
      fly.style.transition = 'left ' + slideMs + 'ms ease-in, top ' + slideMs +
                             'ms ease-in, opacity ' + slideMs + 'ms ease-in, transform ' + slideMs + 'ms ease-in';
      fly.style.left      = (tRect.left + tRect.width / 2) + 'px';
      fly.style.top       = (tRect.top + tRect.height / 2) + 'px';
      fly.style.transform = 'translate(-50%, -50%) scale(0.92)';
      fly.style.opacity   = '0';

      // 3) at the end of the dissolve: the REAL merge (consumption + host boost), synced.
      var done = false;
      function complete() {
        if (done) return; done = true;
        if (fly.parentNode) fly.parentNode.removeChild(fly);
        if (typeof opts.onMerge === 'function') opts.onMerge();   // removes Phoenicians + boosts host
        phoenEl.style.visibility = prevVis;   // restore (merge may have compacted into this slot)
        finish();
      }
      fly.addEventListener('transitionend', function te(e) {
        if (e.propertyName === 'opacity') complete();
      });
      setTimeout(complete, slideMs + 120);   // fallback if transitionend is missed

    }, sitMs);
  }

  /* Nebuchadnezzar (id 50) reveal flourish — visualizes the "Mesopotamia cards
     cost -1 CC" discount (the discount itself is continuous; this is presentation
     only). Plays magicshimmer, bursts star-sparkles on Neb's own card, and — for
     each affected in-hand card passed in (player side only; the opponent's hand is
     face-down so the caller passes none) — bursts sparkles and fires opts.onDrop at
     the sparkle peak so the displayed CC ticks DOWN in sync with the shimmer. The
     sparkle layer is a fixed-position child of <body> centered on each card's rect
     (same approach as the flyers — no scaled-stage offset, and never clipped by the
     hand card's overflow:hidden). Reuses the Hanging Gardens node sparkle grains for
     a matching "wonder of the world" shimmer. Self-cleaning; gates the turn via
     onComplete. */
  function nebuchadnezzarShimmer(nebEl, handEls, opts, onComplete) {
    opts = opts || {};
    function finish() { if (typeof onComplete === 'function') onComplete(); }
    if (opts.sfx) playSfx(opts.sfx);

    // Glow tint. Defaults to Neb's blue-white; callers reusing this flourish for
    // another civ (Ramses 53 — Egypt) pass their own class for a related-but-
    // distinct colour. Everything else about the flourish is identical.
    var glowClass = opts.glowClass || 'reveal-fx-neb-glow';

    var layers = [];
    function burst(el, count, spreadX, spreadY) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var layer = document.createElement('div');
      layer.className = 'hanging-gardens-sparkle reveal-fx-neb-sparkle';
      layer.style.position = 'fixed';
      layer.style.left   = (r.left + r.width  / 2) + 'px';
      layer.style.top    = (r.top  + r.height / 2) + 'px';
      layer.style.zIndex = '9998';
      for (var i = 0; i < count; i++) {
        var s = document.createElement('span');
        s.className = 'hanging-gardens-sparkle-grain';
        s.style.setProperty('--sx', ((Math.random() - 0.5) * spreadX).toFixed(1) + 'px');
        s.style.setProperty('--sy', ((Math.random() - 0.5) * spreadY).toFixed(1) + 'px');
        s.style.setProperty('--dur', (0.7 + Math.random() * 0.7).toFixed(2) + 's');
        s.style.setProperty('--delay', (Math.random() * 0.5).toFixed(2) + 's');
        var size = (5 + Math.random() * 8).toFixed(1) + 'px';
        s.style.width = s.style.height = size;
        layer.appendChild(s);
      }
      document.body.appendChild(layer);
      layers.push(layer);
    }

    // Neb's own card — sparkle + glow (seen by BOTH sides).
    burst(nebEl, 26, 150, 200);
    flashClass(nebEl, glowClass, 1200);

    // Affected in-hand Mesopotamia cards — sparkle + glow (player side only; the
    // caller passes an empty list when the opponent reveals Neb).
    (handEls || []).forEach(function (el) {
      burst(el, 14, 120, 170);
      flashClass(el, glowClass, 1200);
    });

    // CC tick-down IN SYNC with the sparkle peak (~grains reaching full opacity).
    setTimeout(function () {
      if (typeof opts.onDrop === 'function') opts.onDrop();
      (handEls || []).forEach(function (el) {
        var cc = el.querySelector('.db-overlay-cc');
        if (cc) flashClass(cc, 'reveal-fx-cc-drop', 460);
      });
    }, 360);

    // Hold for the shimmer to resolve, clean up the layers, release the turn.
    setTimeout(function () {
      layers.forEach(function (l) { if (l.parentNode) l.parentNode.removeChild(l); });
      finish();
    }, 1500);
  }

  /* Water-splash droplets for the Merchant boat's LANDING impact (below).
     Purely decorative: a handful of small pale droplets sprayed from one edge of
     the boat, arcing outward+up and then falling back down under "gravity" while
     they fade. Fires once, at the moment of landing — not during the teeter or the
     glide. Self-cleaning (each droplet removes itself), and a no-op without GSAP,
     so the boat launch degrades exactly as it does elsewhere.
       x, y : the spray origin in viewport px
       dir  : -1 sprays left, +1 sprays right */
  function boatSplashBurst(x, y, dir, count) {
    if (typeof gsap === 'undefined') return;
    var n = count || 7;
    for (var i = 0; i < n; i++) {
      var drop = document.createElement('div');
      drop.className = 'reveal-fx-splash-drop';
      var size = (3 + Math.random() * 3.5).toFixed(1);
      drop.style.cssText =
        'position:fixed;left:' + x + 'px;top:' + y + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'margin:0;pointer-events:none;z-index:9998;';
      document.body.appendChild(drop);

      // Outward + up, then arc back down and fade — quick and light.
      var outX  = dir * (14 + Math.random() * 42);
      var upY   = -(8 + Math.random() * 26);
      var upMs  = 0.16 + Math.random() * 0.11;
      var fallY = 26 + Math.random() * 38;
      var dnMs  = 0.26 + Math.random() * 0.16;

      /* jshint loopfunc:true */
      (function (d) {
        gsap.timeline({ onComplete: function () { if (d.parentNode) d.parentNode.removeChild(d); } })
          .to(d, { x: outX * 0.72, y: upY, opacity: 1, duration: upMs, ease: 'power2.out' })
          .to(d, { x: outX, y: upY + fallY, opacity: 0, duration: dnMs, ease: 'power1.in' });
      })(drop);
    }
  }

  /* Hatshepsut (id 52) "Trading Queen" — the spawned Merchant launches as a BOAT.
     PURELY PRESENTATIONAL. The Merchant is already in its real slot with its real
     state before a single frame runs (abilityHatshepsut calls spawnCardAt first);
     all this does is hide that card's FACE, fly a clone of it, and unhide the real
     one on arrival. Every early-out below therefore just reveals the card where it
     already is — identical to the old instant spawn.

     Sequence: emerge from BEHIND Hatshepsut and pop out → land beside her and
     TEETER (damped rocking tilt, decreasing amplitude, settling level) → glide
     across to its destination slot, slower than a normal card move → rest.

     THE Z-ORDER TRICK. The board lives inside a CSS scale()-transformed stage,
     which is its own stacking context, so a body-level fixed flyer can NEVER paint
     behind an in-stage card no matter its z-index. To make the Merchant emerge from
     BEHIND Hatshepsut we drop a clone of HER card into that same body-level layer,
     one z above the flyer and exactly over the real one. The Merchant starts hidden
     behind that clone; the clone is removed the moment the pop clears her.
       opts: { sfx, popMs, glideMs } */
  function hatshepsutBoatLaunch(hatEl, merchEl, opts, onComplete) {
    opts = opts || {};
    var done = false;
    function finish() { if (done) return; done = true; if (typeof onComplete === 'function') onComplete(); }

    var hasGsap = (typeof gsap !== 'undefined');
    if (!hatEl || !merchEl || !hasGsap) { finish(); return; }   // → instant spawn
    var hRect = hatEl.getBoundingClientRect();
    var mRect = merchEl.getBoundingClientRect();
    if (!hRect.width || !mRect.width) { finish(); return; }     // → instant spawn

    var popMs   = (opts.popMs   || 420) / 1000;
    var glideMs = (opts.glideMs || 900) / 1000;

    // Defer the real card's APPEARANCE (not its existence) until the boat lands.
    var prevVis = merchEl.style.visibility;
    merchEl.style.visibility = 'hidden';

    var fly = merchEl.cloneNode(true);
    fly.className = (merchEl.className || '') + ' reveal-fx-merchant-boat';
    fly.style.position      = 'fixed';
    fly.style.margin        = '0';
    fly.style.width         = mRect.width  + 'px';
    fly.style.height        = mRect.height + 'px';
    fly.style.zIndex        = '9997';
    fly.style.pointerEvents = 'none';
    fly.style.visibility    = 'visible';

    var hatClone = hatEl.cloneNode(true);
    hatClone.style.position      = 'fixed';
    hatClone.style.margin        = '0';
    hatClone.style.left          = hRect.left + 'px';
    hatClone.style.top           = hRect.top  + 'px';
    hatClone.style.width         = hRect.width  + 'px';
    hatClone.style.height        = hRect.height + 'px';
    hatClone.style.zIndex        = '9998';         // one above the flyer
    hatClone.style.pointerEvents = 'none';
    hatClone.style.visibility    = 'visible';

    document.body.appendChild(fly);
    document.body.appendChild(hatClone);

    function dropHatClone() { if (hatClone.parentNode) hatClone.parentNode.removeChild(hatClone); }
    function cleanup() {
      dropHatClone();
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      merchEl.style.visibility = prevVis;
    }

    // Geometry: start dead-centre on her card, land just beside it on the side the
    // destination lies toward (so the glide continues the launch rather than
    // doubling back), and a touch low so the boat reads as sitting in FRONT of her.
    var startX = hRect.left + hRect.width  / 2;
    var startY = hRect.top  + hRect.height / 2;
    var destX  = mRect.left + mRect.width  / 2;
    var destY  = mRect.top  + mRect.height / 2;
    var dir    = (destX >= startX) ? 1 : -1;
    var landX  = startX + dir * hRect.width * 0.95;
    var landY  = startY + hRect.height * 0.18;

    gsap.set(fly, { left: startX, top: startY, xPercent: -50, yPercent: -50,
                    scale: 0.55, rotation: 0, opacity: 0.95 });

    if (opts.sfx) playSfx(opts.sfx);

    gsap.timeline({ onComplete: function () { cleanup(); finish(); } })
      // 1) out from behind her and pop.
      .to(fly, { left: landX, top: landY, scale: 1, opacity: 1,
                 duration: popMs, ease: 'back.out(1.7)' })
      // she has been cleared — stop masking the flyer.
      .add(dropHatClone)
      // LANDING IMPACT: water sprays from BOTH edges of the hull. One burst only,
      // right where the pop ends and the teeter begins.
      .add(function () {
        var half = mRect.width / 2;
        var waterline = landY + mRect.height * 0.34;   // near the hull's bottom
        boatSplashBurst(landX - half, waterline, -1);
        boatSplashBurst(landX + half, waterline,  1);
      })
      // 2) damped teeter: rock one way, over-correct the other, smaller each
      //    time, settling level — a boat finding its balance. ~0.66s, so pop +
      //    teeter together land at ~1s.
      .to(fly, { rotation:  9,   duration: 0.16, ease: 'sine.inOut' })
      .to(fly, { rotation: -6,   duration: 0.15, ease: 'sine.inOut' })
      .to(fly, { rotation:  3.5, duration: 0.13, ease: 'sine.inOut' })
      .to(fly, { rotation: -2,   duration: 0.12, ease: 'sine.inOut' })
      .to(fly, { rotation:  0,   duration: 0.10, ease: 'sine.inOut' })
      // 3) laden glide to the real slot — stately, slower than a normal move.
      .to(fly, { left: destX, top: destY, duration: glideMs, ease: 'power2.inOut' });
  }

  /* ── PAPYRUS (54) "For the Record" — the copy rolls up as a scroll ───────────
     Two pieces: papyrusScrollRoll (the 3D roll itself) and papyrusCopyFlourish
     (the sequence around it). PURELY PRESENTATIONAL — see papyrusCopyFlourish.

     papyrusScrollRoll(el, card, progress)
     ─────────────────────────────────────
     Rolls `el` up like a scroll. progress 0 = flat card, 1 = fully rolled tube;
     driving it 1 → 0 UNROLLS, which is how the same helper serves both beats.

     CSS cannot curl a flat element into a cylinder — one element with rotateX just
     tilts — so the card is rebuilt (once, lazily, cached on el._pap) as a STACK OF
     HORIZONTAL STRIPS inside a preserve-3d container. Each strip carries its own
     slice of the card via background-position, and each has a BACK layer holding
     the matching slice of the real card-back texture, so when a strip rotates past
     90 degrees the genuine card back is what turns toward the viewer.

     Geometry. Let s = a strip's arc distance from the BOTTOM edge of the card, and
     L = progress * H be how much length has been wound on so far. A strip with
     s >= L has not reached the roll yet and stays flat. A strip with s < L has been
     wound by angle theta = (L - s) / R about the roll axis, so relative to the
     tangent point (which sits at the boundary y = H/2 - L) it lies at
         dy = -R * sin(theta),  dz = R * (1 - cos(theta))
     and is itself rotated by theta — tangent to the cylinder, exactly like real
     material wrapping. The bottom strip winds furthest, so the roll grows upward
     from the bottom edge and the flat remainder shrinks above it, which is what
     rolling a scroll actually looks like. R grows slightly with progress because a
     real roll fattens as more material winds onto it. */
  /* Strip count. 12 was too coarse: adjacent strips differed by ~20 degrees of
     arc and every facet was lit identically, so the curl read as VENETIAN BLINDS
     rather than a rolling sheet. 24 halves the angular step, and the per-strip
     shading below gives the facets a cylindrical falloff so they read as one
     curved surface. */
  var PAPYRUS_STRIPS   = 24;                                          // strip count (knob)
  var PAPYRUS_BACK_IMG = 'images/cards/cardsmisc/SOG_Card_Back_Medium.jpeg';

  function papyrusScrollRoll(el, card, progress) {
    if (!el) return;
    var W = el._papW, H = el._papH;

    // Build once; every later call just re-drives the strips.
    if (!el._pap) {
      W = el.offsetWidth  || 90;
      H = el.offsetHeight || 130;
      el._papW = W; el._papH = H;

      var face = (card && (card.image || card.imageSm)) || '';
      var deck = document.createElement('div');
      deck.className = 'reveal-fx-papyrus-deck';
      deck.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d;';

      var strips = [];
      var h = H / PAPYRUS_STRIPS;
      for (var i = 0; i < PAPYRUS_STRIPS; i++) {
        var strip = document.createElement('div');
        // +1.1px overlap closes the hairline seams that open between facets as the
        // sheet curls — those gaps were a big part of the blinds impression.
        strip.style.cssText =
          'position:absolute;left:0;width:' + W + 'px;height:' + (h + 1.1) + 'px;' +
          'top:' + (i * h) + 'px;transform-style:preserve-3d;will-change:transform;';

        var front = document.createElement('div');
        front.style.cssText =
          'position:absolute;inset:0;backface-visibility:hidden;' +
          'background-image:url(' + face + ');background-repeat:no-repeat;' +
          'background-size:' + W + 'px ' + H + 'px;background-position:0 ' + (-i * h) + 'px;';

        var back = document.createElement('div');
        back.style.cssText =
          'position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);' +
          'background-image:url(' + PAPYRUS_BACK_IMG + ');background-repeat:no-repeat;' +
          'background-size:' + W + 'px ' + H + 'px;background-position:0 ' + (-i * h) + 'px;';

        strip.appendChild(front);
        strip.appendChild(back);
        deck.appendChild(strip);
        // front/back kept so shading can be applied to the FACES, never the strip:
        // a filter on the strip itself would force its transform-style back to flat
        // and kill the backface-visibility that reveals the card back.
        strips.push({ el: strip, front: front, back: back });
      }
      el.appendChild(deck);
      el._pap = { deck: deck, strips: strips, h: h };
    }

    var pap = el._pap;
    var p   = Math.max(0, Math.min(1, progress || 0));
    var h   = pap.h;
    var L   = p * H;
    var R   = (H / 5) * (1 + 0.45 * p);        // roll fattens as material winds on

    for (var j = 0; j < pap.strips.length; j++) {
      var st = pap.strips[j];
      // Arc distance of this strip's CENTRE from the bottom edge.
      var sDist = H - (j * h + h / 2);
      if (sDist >= L) {                        // not reached the roll yet — still flat
        st.el.style.transform  = 'translate3d(0,0,0)';
        st.front.style.filter  = '';
        st.back.style.filter   = '';
        continue;
      }
      var theta = (L - sDist) / R;             // radians wound
      /* dy has TWO terms and both matter:
           -R*theta  the ARC CONTRACTION — material that has wound onto the roll no
                     longer occupies its flat span, so the sheet gathers upward as
                     it rolls. Omitting this was what made the roll read as venetian
                     blinds: every strip stayed at its flat spacing and merely
                     tilted in place, which is exactly what a blind does. More
                     strips and shading could not fix it because the sheet was never
                     actually contracting.
           -R*sin    the strip's position around the cylinder from the tangent point.
         Derivation: flat centre sits at y = H - sDist; the tangent point is at
         y = H - L; a point wound by theta lies at y = (H - L) - R*sin(theta). The
         difference is sDist - L - R*sin(theta), and since L - sDist = R*theta that
         is -R*(theta + sin theta). At theta = 0 it is 0, so it joins the flat part
         seamlessly. */
      var dy    = -R * (theta + Math.sin(theta));
      var dz    =  R * (1 - Math.cos(theta));
      st.el.style.transform = 'translate3d(0,' + dy.toFixed(2) + 'px,' + dz.toFixed(2) + 'px) ' +
                              'rotateX(' + (theta * 180 / Math.PI).toFixed(2) + 'deg)';

      /* Cylindrical shading. Facets square-on to the viewer stay bright, facets
         turning edge-on fall off toward dark — which is what stops a stack of flat
         slats from reading as blinds and makes it read as one curved sheet. The
         BACK (the inside of the curl) sits in its own shadow, so it is darker
         throughout. Applied to the faces, never the strip — see the build above. */
      var lit = Math.abs(Math.cos(theta));
      st.front.style.filter = 'brightness(' + (0.56 + 0.44 * lit).toFixed(3) + ')';
      st.back.style.filter  = 'brightness(' + (0.42 + 0.34 * lit).toFixed(3) + ')';
    }
  }

  /* papyrusCopyFlourish(papyrusEl, targetEl, card, opts, onComplete)
     ───────────────────────────────────────────────────────────────
     PURELY PRESENTATIONAL. The copy is already in the owner's hand with its
     G.copyIPBonus stamped before this runs (abilityPapyrus commits state first);
     all this does is defer the new hand card's VISIBILITY until the scroll unrolls
     into it. Every early-out below just reveals it immediately — i.e. exactly the
     behaviour before this animation existed.

     Sequence: a clone of Papyrus's face slides OVER the card it is copying →
     cross-dissolves into that card's face → rolls up as a scroll (sfx) → travels to
     the hand → unrolls into its slot (sfx).
     OPPONENT SIDE: their hand is face-down, so there is no meaningful slot to
     unroll into — the scroll rolls, travels toward the opponent's hand strip and
     FADES. Same asymmetry nebuchadnezzarShimmer already uses for the hidden hand.
       opts: { sfx, handEl, isPlayer } */
  function papyrusCopyFlourish(papyrusEl, targetEl, card, opts, onComplete) {
    opts = opts || {};
    var fired = false;
    function finish() { if (fired) return; fired = true; if (typeof onComplete === 'function') onComplete(); }

    var handEl   = opts.handEl || null;
    var isPlayer = !!opts.isPlayer;

    function revealHandCard() { if (handEl) handEl.style.visibility = ''; }

    if (!papyrusEl || !targetEl || !card || typeof gsap === 'undefined') { finish(); return; }
    var pRect = papyrusEl.getBoundingClientRect();
    var tRect = targetEl.getBoundingClientRect();
    if (!pRect.width || !tRect.width) { finish(); return; }

    // The destination card exists already — just hold its appearance back.
    if (handEl) handEl.style.visibility = 'hidden';

    // Flyer: starts as Papyrus's own face, at Papyrus's rect.
    var fly = document.createElement('div');
    fly.className = 'reveal-fx-papyrus-fly';
    fly.style.cssText =
      'position:fixed;margin:0;pointer-events:none;z-index:9997;' +
      'left:' + pRect.left + 'px;top:' + pRect.top + 'px;' +
      'width:' + tRect.width + 'px;height:' + tRect.height + 'px;' +
      'perspective:900px;';

    // Layer A — Papyrus's face. Layer B — the target card's face, dissolved in.
    function faceLayer(srcEl, op) {
      var l = srcEl.cloneNode(true);
      l.className = (srcEl.className || '') + ' reveal-fx-papyrus-face';
      l.style.cssText = 'position:absolute;inset:0;margin:0;width:100%;height:100%;' +
                        'visibility:visible;opacity:' + op + ';';
      return l;
    }
    var layerA = faceLayer(papyrusEl, 1);
    var layerB = faceLayer(targetEl, 0);
    fly.appendChild(layerA);
    fly.appendChild(layerB);
    document.body.appendChild(fly);

    function cleanup() {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      revealHandCard();
    }

    var rollState = { p: 0 };
    var tl = gsap.timeline({ onComplete: function () { cleanup(); finish(); } });

    // 1) slide OVER the card being copied.
    tl.to(fly, { left: tRect.left, top: tRect.top, duration: 0.38, ease: 'power2.inOut' })
      // 2) cross-dissolve: Papyrus's face BECOMES the target card's face.
      .to(layerB, { opacity: 1, duration: 0.32, ease: 'power1.inOut' }, '>-0.02')
      .to(layerA, { opacity: 0, duration: 0.32, ease: 'power1.inOut' }, '<')
      // 3) swap the flat faces for the strip cylinder and ROLL up.
      .add(function () {
        layerA.style.display = 'none';
        layerB.style.display = 'none';
        if (opts.sfx) playSfx(opts.sfx);
        papyrusScrollRoll(fly, card, 0);
      })
      .to(rollState, {
        p: 1, duration: 0.62, ease: 'power2.in',
        onUpdate: function () { papyrusScrollRoll(fly, card, rollState.p); }
      });

    // 4/5/6) travel to the hand, then unroll into the slot (player only).
    var hRect = handEl ? handEl.getBoundingClientRect() : null;
    if (hRect && hRect.width) {
      tl.to(fly, { left: hRect.left + (hRect.width - tRect.width) / 2,
                   top:  hRect.top  + (hRect.height - tRect.height) / 2,
                   duration: 0.70, ease: 'power2.inOut' });
      if (isPlayer) {
        tl.add(function () { if (opts.sfx) playSfx(opts.sfx); })
          .to(rollState, {
            p: 0, duration: 0.52, ease: 'power2.out',
            onUpdate: function () { papyrusScrollRoll(fly, card, rollState.p); }
          });
      } else {
        // Face-down hand — nothing to unroll INTO, so the scroll just fades out.
        tl.to(fly, { opacity: 0, duration: 0.28, ease: 'power1.in' });
      }
    } else {
      tl.to(fly, { opacity: 0, duration: 0.28, ease: 'power1.in' });
    }
  }

  /* Farmer — EGYPT (55): PHASE 2. The onion the Farmer launched comes back DOWN
     onto whichever card actually took the +1, and is eaten.

     Deliberately NOT a reveal-fx handler: it does not belong to the buffed card's
     own reveal, it has to happen AFTER it. The reveal pipeline has two distinct
     completion points and only the later one is correct here —
       • flipSlot's done  = flip scale-in + any reveal-fx OVERLAY has finished;
       • fireAtOnce's cb  = the card's own AT ONCE ANIMATION has finished.
     The heavy per-card animations (Ramses' shimmer, Hatshepsut's Merchant boat,
     Papyrus' scroll roll) are all ability animations gated on the SECOND one, so
     this is called from there — by which point both are guaranteed complete. A
     card with no animation at all reaches that same point immediately, so the
     onion simply arrives right away.

     Ends on a HARD CUT: the descent holds the onion fully opaque on the card, the
     bite lands, and the element is removed outright on the next frame. No fade —
     the onion is gone, not fading.
     Overlay only; never gates the pipeline, and no-ops without a slot element. */
  function farmerOnionBite(slotEl, onComplete) {
    function finish() { if (typeof onComplete === 'function') onComplete(); }
    if (!slotEl || typeof gsap === 'undefined') { finish(); return; }
    var r = slotEl.getBoundingClientRect();
    if (!r.width) { finish(); return; }                  // no geometry → skip the visual

    /* A BODY-LEVEL FIXED flyer, not a child of the slot like the Phase 1 pop.
       .battle-card-slot is overflow:hidden, which caps any in-slot travel at about
       30px — the existing pop gets away with that because it only drifts a little,
       but a fall from ABOVE the card would be clipped away to nothing. Anchoring to
       the card's rect instead lets the onion drop a full card-height, unclipped,
       and also means it lands correctly on a card that has RELOCATED. */
    var w  = r.width * 0.82;
    var cx = r.left + r.width / 2;
    var cy = r.top  + r.height / 2;

    var onion = document.createElement('img');
    onion.className = 'reveal-fx-onion-bite';
    onion.src = 'images/assets/onion@0.25x.png';
    onion.draggable = false;
    onion.setAttribute('aria-hidden', 'true');
    onion.style.cssText =
      'position:fixed;margin:0;pointer-events:none;z-index:9996;' +
      'width:' + w + 'px;height:auto;left:' + cx + 'px;top:' + cy + 'px;';
    document.body.appendChild(onion);

    function cut() {                                     // HARD CUT — gone, not faded
      if (onion.parentNode) onion.parentNode.removeChild(onion);
      finish();
    }

    gsap.set(onion, { xPercent: -50, yPercent: -50, y: -r.height * 1.15, opacity: 0, scale: 0.82 });
    gsap.timeline()
      // fade in while falling
      .to(onion, { opacity: 1, duration: 0.16, ease: 'power1.out' }, 0)
      .to(onion, { y: 0, scale: 1.06, duration: 0.46, ease: 'power2.in' }, 0)
      // land: a small squash, then the bite
      .to(onion, { scale: 1, duration: 0.1, ease: 'power2.out' })
      .add(function () { playSfx('sfx/bite.mp3'); })
      // sits bitten for a beat, then vanishes in ONE FRAME — no fade.
      // Scheduled with a position offset rather than an empty .to(): a tween with
      // no vars still takes GSAP's DEFAULT 0.5s duration, which stretched this
      // pause to ~630ms instead of the 130ms intended.
      .add(cut, '+=0.13');
  }

  /* Scribe — EGYPT (56) "Accounting", END-OF-TURN flourish. The Scribe lifts in its
     slot as if standing up to take the tally, then each of the other Economic cards
     here POPS in slot order — one at a time, each with the coin sfx and its blue +1.

     Each target's onLand() is what actually applies the +1 (addIPMod + float), and
     it is called AT THE POP BEAT, so the number the player sees and the number the
     engine records are the same event — never a faked pop followed by a silent
     write. The whole sequence is gated on onComplete, which the end-of-turn phase
     passes its `done` to, so the turn waits for it.
     No GSAP, or no Scribe element → every onLand still runs, paced, so the IP is
     never skipped.
       opts: { sfx, riseMs, popMs, gapMs } */
  function scribeAccountingSequence(scribeEl, targets, opts, onComplete) {
    opts = opts || {};
    var riseMs = (opts.riseMs || 300) / 1000;
    var popMs  = (opts.popMs  || 180) / 1000;
    var gapMs  =  opts.gapMs  || 150;

    function finish() { if (typeof onComplete === 'function') onComplete(); }
    if (!targets || !targets.length) { finish(); return; }

    // Degraded path: no animation, but the tally still happens, paced so the
    // coins do not stack into one noise.
    if (typeof gsap === 'undefined' || !scribeEl) {
      var k = 0;
      (function plain() {
        if (k >= targets.length) { finish(); return; }
        var t = targets[k++];
        if (opts.sfx) playSfx(opts.sfx);
        if (typeof t.onLand === 'function') t.onLand();
        setTimeout(plain, gapMs + 180);
      })();
      return;
    }

    // 1) The Scribe rises 15% of its own height, and stays up while it tallies.
    gsap.to(scribeEl, { y: '-15%', duration: riseMs, ease: 'power2.out', onComplete: popNext });

    var i = 0;
    function popNext() {
      if (i >= targets.length) {
        // 2) Tally done — the Scribe settles back into its slot.
        gsap.to(scribeEl, {
          y: '0%', duration: 0.26, ease: 'power2.inOut',
          onComplete: function () { gsap.set(scribeEl, { clearProps: 'transform' }); finish(); }
        });
        return;
      }
      var t = targets[i++];
      if (!t.el) {                       // missing element — still credit the card
        if (typeof t.onLand === 'function') t.onLand();
        setTimeout(popNext, gapMs);
        return;
      }
      if (opts.sfx) playSfx(opts.sfx);
      if (typeof t.onLand === 'function') t.onLand();   // the +1 IS the pop
      gsap.timeline({
        onComplete: function () {
          gsap.set(t.el, { clearProps: 'transform' });
          setTimeout(popNext, gapMs);
        }
      })
        .to(t.el, { y: '-18%', scale: 1.07, duration: popMs, ease: 'power2.out' })
        .to(t.el, { y: '0%',   scale: 1,    duration: 0.24,  ease: 'back.out(2)' });
    }
  }

  /* Dirt clods thrown up as the Pyramid erupts from the ground. Sibling of
     boatSplashBurst above and the same shape — spawn, arc, fall, self-remove — but
     RADIAL rather than one-sided: clods spray across the width of the card and out
     in both directions, and fall faster and heavier than water spray. No-op without
     GSAP, self-cleaning, purely decorative. */
  function dirtBurst(cx, cy, spreadW, count) {
    if (typeof gsap === 'undefined') return;
    var n = count || 14;
    for (var i = 0; i < n; i++) {
      var clod = document.createElement('div');
      clod.className = 'reveal-fx-dirt-clod';
      var size = (3 + Math.random() * 4.5).toFixed(1);
      // start spread across the base of the card
      var startX = cx + (Math.random() - 0.5) * spreadW;
      clod.style.cssText =
        'position:fixed;left:' + startX + 'px;top:' + cy + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'margin:0;pointer-events:none;z-index:9998;';
      document.body.appendChild(clod);

      var dir   = (startX < cx) ? -1 : 1;
      var outX  = dir * (10 + Math.random() * 46);
      var upY   = -(14 + Math.random() * 34);
      var upMs  = 0.14 + Math.random() * 0.1;
      var fallY = 34 + Math.random() * 46;
      var dnMs  = 0.24 + Math.random() * 0.16;
      var spin  = (Math.random() - 0.5) * 300;

      /* jshint loopfunc:true */
      (function (d) {
        gsap.timeline({ onComplete: function () { if (d.parentNode) d.parentNode.removeChild(d); } })
          .to(d, { x: outX * 0.68, y: upY, rotation: spin * 0.5, opacity: 1, duration: upMs, ease: 'power2.out' })
          .to(d, { x: outX, y: upY + fallY, rotation: spin, opacity: 0, duration: dnMs, ease: 'power1.in' });
      })(clod);
    }
  }

  /* Swap the number on a card's IP badge: the OLD value falls away while the NEW
     value drops in above it. Nothing in the game did a number SWAP before — the
     existing badge effects (revealFxIpGain, revealFxCcDrop) are in-place pops.

     THE APPLY IS THE SWAP. applyFn is what actually writes the IP (addIPMod +
     refreshSlotIPDisplays), and it is called BETWEEN capturing the old text and
     animating the new one in. So the arriving number is literally whatever the
     engine just recorded — it is read back out of the badge, never passed in and
     rendered independently. A faked display over a silent write is not possible
     here by construction.
     No badge or no GSAP → applyFn still runs, so the IP is never skipped. */
  function ipBadgeSwap(slotEl, applyFn, onDone) {
    function finish() { if (typeof onDone === 'function') onDone(); }
    var badge = slotEl && slotEl.querySelector('.db-overlay-ip');
    if (!badge || typeof gsap === 'undefined') {
      if (typeof applyFn === 'function') applyFn();
      finish();
      return;
    }

    var oldText = badge.textContent;

    // The old number, lifted out as its own element so it can fall independently.
    var ghost = document.createElement('div');
    ghost.className = 'db-overlay-ip reveal-fx-ip-old';
    ghost.textContent = oldText;
    ghost.setAttribute('aria-hidden', 'true');
    slotEl.appendChild(ghost);

    if (typeof applyFn === 'function') applyFn();   // ← the real write; badge now reads NEW

    gsap.to(ghost, {
      y: 26, rotation: -18, opacity: 0, duration: 0.42, ease: 'power1.in',
      onComplete: function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }
    });
    gsap.fromTo(badge,
      { y: -22, opacity: 0, scale: 1.5 },
      { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.2)',
        onComplete: function () { gsap.set(badge, { clearProps: 'transform,opacity' }); finish(); } }
    );
  }

  /* Pyramid (57) "Monumental Legacy" — it takes the IP of the last card played at
     its location, so the animation goes and GETS it: the Pyramid slides over onto
     that source card, erupts up out of the ground there in a spray of dirt, then
     vaults back to its own slot and lands with a thud as the new number arrives.

     PURELY PRESENTATIONAL over an unchanged mechanic, with one deliberate
     ordering choice: opts.onAbsorb — which performs the real addIPMod — is not
     called until the badge swap, so the moment the new number appears IS the moment
     it is recorded (see ipBadgeSwap). Everything before that is travel.

     Body-level fixed flyer (the phoeniciansMerge / boat / scroll shape) because
     .battle-card-slot is overflow:hidden and would clip both the eruption and the
     dirt. Any missing piece falls through to onAbsorb + done, i.e. exactly the
     instant behaviour this replaces.
       opts: { onAbsorb, riseSfx, landSfx } */
  function pyramidAbsorb(pyramidEl, sourceEl, opts, onComplete) {
    opts = opts || {};
    var fired = false;
    function finish() {
      if (fired) return; fired = true;
      if (typeof onComplete === 'function') onComplete();
    }
    function bail() {                                  // no animation → still absorb
      if (typeof opts.onAbsorb === 'function') opts.onAbsorb();
      finish();
    }
    if (!pyramidEl || !sourceEl || typeof gsap === 'undefined') { bail(); return; }
    var pRect = pyramidEl.getBoundingClientRect();
    var sRect = sourceEl.getBoundingClientRect();
    if (!pRect.width || !sRect.width) { bail(); return; }

    var homeX = pRect.left + pRect.width / 2,  homeY = pRect.top + pRect.height / 2;
    var srcX  = sRect.left + sRect.width / 2,  srcY  = sRect.top + sRect.height / 2;

    var fly = pyramidEl.cloneNode(true);
    fly.className = (pyramidEl.className || '') + ' reveal-fx-pyramid-fly';
    fly.style.cssText =
      'position:fixed;margin:0;pointer-events:none;z-index:9997;visibility:visible;' +
      'left:' + homeX + 'px;top:' + homeY + 'px;' +
      'width:' + pRect.width + 'px;height:' + pRect.height + 'px;';
    document.body.appendChild(fly);
    gsap.set(fly, { xPercent: -50, yPercent: -50 });

    var prevVis = pyramidEl.style.visibility;
    pyramidEl.style.visibility = 'hidden';

    function restore() {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      pyramidEl.style.visibility = prevVis;
    }

    gsap.timeline()
      // 1) slide over ON TOP of the card it is taking from.
      .to(fly, { left: srcX, top: srcY, duration: 0.38, ease: 'power2.inOut' })
      // 2) settle DOWN into the ground, then ERUPT upward with dirt.
      .to(fly, { y: 10, scaleY: 0.9, duration: 0.14, ease: 'power2.in' })
      .add(function () {
        if (opts.riseSfx) playSfx(opts.riseSfx);
        dirtBurst(srcX, srcY + sRect.height * 0.34, sRect.width * 0.9);
      })
      .to(fly, { y: -sRect.height * 0.42, scaleY: 1.06, duration: 0.5, ease: 'power3.out' })
      .to(fly, { scaleY: 1, duration: 0.12 })
      // 3) pop up and OVER, back to its own slot — up first, then down, so the
      //    path reads as a vault rather than a slide.
      .to(fly, { left: (srcX + homeX) / 2, y: -sRect.height * 0.85, duration: 0.2, ease: 'power2.out' })
      .to(fly, { left: homeX, top: homeY, y: 0, duration: 0.26, ease: 'power2.in' })
      // 4) land: thud + squash, then the number swap (which performs the real gain).
      .add(function () { if (opts.landSfx) playSfx(opts.landSfx); })
      .to(fly, { scaleY: 0.84, scaleX: 1.1, duration: 0.08, ease: 'power2.out' })
      .to(fly, { scaleY: 1, scaleX: 1, duration: 0.22, ease: 'back.out(3)' })
      .add(function () {
        restore();                                   // real card back before the swap
        ipBadgeSwap(pyramidEl, opts.onAbsorb, finish);
      });
  }

  /* Egyptian Priest (71) "Embalming" — the revived card is WRAPPED into existence.
     The Priest lifts in its slot, then off-white straps criss-cross over the slot
     the Mummy is spawning into, building until the card is completely covered, and
     dissolve to reveal it.

     PURELY PRESENTATIONAL. createMummy has already run: the Mummy is in its slot
     with its frozen IP/CC before a single strap is drawn. All this does is hold the
     card face at opacity 0 until the straps come off. Every early-out simply leaves
     the face visible, i.e. exactly the instant spawn this replaces.

     Straps live INSIDE the slot rather than in a body-level flyer — the opposite
     choice to the boat/scroll/onion. .battle-card-slot is overflow:hidden, and here
     that clipping is wanted: the straps should stop at the card's edges, so their
     overhanging ends get trimmed and they read as bound AROUND the card.

     Angles: every strap is HORIZONTAL with up to STRAP_MAX_TILT degrees of
     variance, and the sign alternates strap to strap, so consecutive straps lean
     opposite ways and cross each other instead of lying parallel.
       opts: { sfx, straps } */
  var STRAP_COUNT    = 11;
  var STRAP_MAX_TILT = 25;      // degrees; 0..25, alternating sign → criss-cross

  function mummyWrapReveal(priestEl, slotEl, opts, onComplete) {
    opts = opts || {};
    var fired = false;
    function finish() { if (fired) return; fired = true; if (typeof onComplete === 'function') onComplete(); }
    if (!slotEl || typeof gsap === 'undefined') { finish(); return; }
    var r = slotEl.getBoundingClientRect();
    if (!r.width) { finish(); return; }

    // The card face as it stands NOW (before we add anything) — held invisible
    // until the wrap comes off, then faded back in.
    var faces = [].slice.call(slotEl.children);
    faces.forEach(function (n) { n.style.opacity = '0'; });

    var layer = document.createElement('div');
    layer.className = 'reveal-fx-wrap-layer';
    layer.setAttribute('aria-hidden', 'true');
    slotEl.appendChild(layer);

    function cleanup() {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      faces.forEach(function (n) { n.style.opacity = ''; });
    }

    var n = opts.straps || STRAP_COUNT;
    var straps = [];
    for (var i = 0; i < n; i++) {
      var st = document.createElement('div');
      st.className = 'reveal-fx-strap';
      // Spread across the card, past both edges so the top and bottom are covered.
      var yPct  = -6 + (112 / (n - 1)) * i;
      var tilt  = (i % 2 ? 1 : -1) * (Math.random() * STRAP_MAX_TILT);
      var thick = 13 + Math.random() * 5;               // % of card height
      st.style.cssText =
        'top:' + yPct.toFixed(2) + '%;height:' + thick.toFixed(2) + '%;' +
        'transform:translate(-50%,-50%) rotate(' + tilt.toFixed(2) + 'deg);';
      st._tilt = tilt;
      st._from = (i % 2 ? 1 : -1);                      // slides in from alternating sides
      layer.appendChild(st);
      straps.push(st);
    }

    // A faint wash that closes any slivers left between straps, so "fully covered"
    // is actually true rather than nearly true.
    var seal = document.createElement('div');
    seal.className = 'reveal-fx-wrap-seal';
    layer.appendChild(seal);

    if (opts.sfx) playSfx(opts.sfx);

    var tl = gsap.timeline({ onComplete: function () { cleanup(); finish(); } });

    // Priest lifts 10% and holds while the wrapping happens.
    if (priestEl) tl.to(priestEl, { y: '-10%', duration: 0.26, ease: 'power2.out' }, 0);

    // Straps land one after another, each swinging in from its own side.
    straps.forEach(function (st, i) {
      gsap.set(st, { xPercent: 0, x: st._from * r.width * 0.9, opacity: 0, rotation: st._tilt });
      tl.to(st, {
        x: 0, opacity: 1, duration: 0.2, ease: 'power2.out'
      }, 0.26 + i * 0.06);
    });

    var wrapEnd = 0.26 + n * 0.06 + 0.2;
    tl.to(seal, { opacity: 1, duration: 0.16, ease: 'power1.out' }, wrapEnd)
      // fully wrapped — hold a beat, then the straps dissolve and the Mummy is there.
      .to(layer, { opacity: 0, duration: 0.42, ease: 'power1.in' }, wrapEnd + 0.28)
      .to(faces, { opacity: 1, duration: 0.42, ease: 'power1.out' }, wrapEnd + 0.28);

    if (priestEl) {
      tl.to(priestEl, {
        y: '0%', duration: 0.26, ease: 'power2.inOut',
        onComplete: function () { gsap.set(priestEl, { clearProps: 'transform' }); }
      }, wrapEnd + 0.5);
    }
  }

  /* Rosetta Stone (58) "Decipher The Past" — a scribe's hand inscribes the copied
     text onto the Stone. The SOURCE card (whatever sits in slot 0) lifts to present
     itself, and the hand sweeps across the Rosetta card writing line by line.

     PURELY PRESENTATIONAL. The adoption is already stamped on Rosetta's slot data
     before this runs, and the transcribed ability fires from onComplete, so the
     order the player sees — read the source, write the Stone, then the copied
     ability goes off — is the order the engine actually did it in.

     The hand is a BODY-LEVEL fixed element: a hand is bigger than the card it
     writes on, and .battle-card-slot is overflow:hidden, so drawing it inside the
     slot would amputate it at the card edges.

     TWO SOUNDS, LAYERED: introSfx lands at t=0 with the source card lifting — the
     Stone being brought to bear — and sfx (the quill) starts as the hand touches
     down and runs under the sweep. Separate knobs so either can be silenced
     without touching the other.
       opts: { sfx, introSfx, lines } */
  var SCRIBE_HAND_IMG = 'images/assets/scribehand.png';

  function rosettaTranscribe(sourceEl, rosettaEl, opts, onComplete) {
    opts = opts || {};
    var fired = false;
    function finish() { if (fired) return; fired = true; if (typeof onComplete === 'function') onComplete(); }
    if (!sourceEl || !rosettaEl || typeof gsap === 'undefined') { finish(); return; }
    var rRect = rosettaEl.getBoundingClientRect();
    if (!rRect.width) { finish(); return; }

    var hand = document.createElement('img');
    hand.className = 'reveal-fx-scribe-hand';
    hand.src = SCRIBE_HAND_IMG;
    hand.draggable = false;
    hand.setAttribute('aria-hidden', 'true');
    // Square source art; sized off the card so it reads as a hand ON the card.
    var size = rRect.height * 1.15;
    hand.style.cssText =
      'position:fixed;margin:0;pointer-events:none;z-index:9997;' +
      'width:' + size + 'px;height:' + size + 'px;left:0;top:0;';
    document.body.appendChild(hand);

    function cleanup() { if (hand.parentNode) hand.parentNode.removeChild(hand); }

    // Writing lines down the face of the Stone. The hand tracks left→right along
    // each, stepping down between them — the shape of actually inscribing.
    var lines   = opts.lines || 3;
    var startX  = rRect.left - size * 0.16;
    var endX    = rRect.left + rRect.width - size * 0.42;
    var topY    = rRect.top  + rRect.height * 0.16 - size * 0.55;
    var lineGap = (rRect.height * 0.5) / Math.max(1, lines - 1);

    gsap.set(hand, { x: startX, y: topY, opacity: 0, rotation: -6 });

    var tl = gsap.timeline({ onComplete: function () { cleanup(); finish(); } });

    // Source card lifts 10% and holds while it is being read.
    tl.to(sourceEl, { y: '-10%', duration: 0.26, ease: 'power2.out' }, 0);

    if (opts.introSfx) tl.add(function () { playSfx(opts.introSfx); }, 0);
    if (opts.sfx)      tl.add(function () { playSfx(opts.sfx); },      0.2);
    tl.to(hand, { opacity: 1, duration: 0.16, ease: 'power1.out' }, 0.2);

    for (var i = 0; i < lines; i++) {
      var y = topY + lineGap * i;
      var at = 0.28 + i * 0.42;
      // sweep across the line, with a small nib wobble so it reads as writing
      tl.fromTo(hand,
        { x: startX, y: y, rotation: -6 },
        { x: endX, duration: 0.34, ease: 'none' }, at);
      tl.to(hand, { y: '+=' + (size * 0.012), duration: 0.055, repeat: 5, yoyo: true, ease: 'sine.inOut' }, at);
      if (i < lines - 1) {
        // carriage return to the start of the next line
        tl.to(hand, { x: startX, y: topY + lineGap * (i + 1), duration: 0.08, ease: 'power2.inOut' }, at + 0.34);
      }
    }

    var endAt = 0.28 + lines * 0.42;
    tl.to(hand, { opacity: 0, duration: 0.2, ease: 'power1.in' }, endAt)
      .to(sourceEl, {
        y: '0%', duration: 0.26, ease: 'power2.inOut',
        onComplete: function () { gsap.set(sourceEl, { clearProps: 'transform' }); }
      }, endAt);
  }

  /* Sargon (id 37) reveal flourish — visualizes his "+3 IP to adjacent location(s)".
     A gold BEAM of light shoots from Sargon's card to each AFFECTED location's full
     box (the caller passes exactly the boosted boxes — getAdjacentLocIds), and those
     boxes GLOW. Plays ssfxsargon at the moment the beam fires and keeps the glow lit
     for the SOUND's length, fading it out when the audio ends (a safety timeout
     covers muted/failed audio). Beam + glow are fixed-position layers on <body> (no
     clipping / scaled-stage offset). Gates the turn via onComplete. */
  function sargonBeam(sargonEl, targetEls, opts, onComplete) {
    opts = opts || {};
    targetEls = (targetEls || []).filter(Boolean);
    function finish() { if (typeof onComplete === 'function') onComplete(); }
    if (!sargonEl || !targetEls.length) { finish(); return; }

    // Play the SFX (volume-respecting) and keep the handle to time the glow to it.
    var audio = (window.SOG && SOG.sfx && typeof SOG.sfx.play === 'function') ? SOG.sfx.play(opts.sfx) : null;

    var sr = sargonEl.getBoundingClientRect();
    var sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
    var glows = [];

    targetEls.forEach(function (box) {
      var r = box.getBoundingClientRect();
      if (!r.width) return;
      // Glow over the whole location box (fixed overlay; fades in now, out on SFX end).
      var g = document.createElement('div');
      g.className = 'sargon-loc-glow';
      g.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:9995;pointer-events:none;opacity:0;';
      document.body.appendChild(g);
      void g.offsetWidth; g.style.opacity = '1';
      glows.push(g);

      // Beam from Sargon's card to the box centre.
      var tx = r.left + r.width / 2, ty = r.top + r.height / 2;
      var dx = tx - sx, dy = ty - sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var ang  = Math.atan2(dy, dx) * 180 / Math.PI;
      var beam = document.createElement('div');
      beam.className = 'sargon-beam';
      beam.style.cssText = 'position:fixed;left:' + sx + 'px;top:' + (sy - 4) + 'px;width:' + dist + 'px;height:8px;z-index:9996;pointer-events:none;';
      document.body.appendChild(beam);
      if (typeof gsap !== 'undefined') {
        gsap.set(beam, { rotation: ang, scaleX: 0, transformOrigin: '0 50%' });
        gsap.to(beam, { scaleX: 1, duration: 0.25, ease: 'power2.out' });
        gsap.to(beam, { opacity: 0, duration: 0.5, delay: 0.55,
          onComplete: function () { if (beam.parentNode) beam.parentNode.removeChild(beam); } });
      } else {
        beam.style.transform = 'rotate(' + ang + 'deg)';
        setTimeout(function () { if (beam.parentNode) beam.parentNode.removeChild(beam); }, 1000);
      }
    });

    // Tie the glow's lifetime to ssfxsargon: fade it out when the sound ends, then
    // release the turn. Safety fallback if the audio can't report 'ended'.
    var ended = false;
    function endFlourish() {
      if (ended) return; ended = true;
      glows.forEach(function (g) {
        g.style.opacity = '0';
        setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 450);
      });
      setTimeout(finish, 450);
    }
    if (audio && typeof audio.addEventListener === 'function') audio.addEventListener('ended', endFlourish);
    setTimeout(endFlourish, 4000);   // safety: muted/failed audio or no 'ended'
  }

  /* ── End-of-turn gain shimmer (generic — Megalith 31 + future EOT cards) ──
     A band of light sweeps ACROSS the card (adapted from the Neb shimmer's
     cause-and-effect pacing): overlay div clipped to the slot, gradient band
     translates left→right (~750ms). At the sweep's midpoint opts.onTick() fires
     — the ability applies its real effect there (e.g. addIPMod +1) and the
     slot's IP number pops via .reveal-fx-ip-gain, so the change reads as CAUSED
     by the light. onDone releases the end-of-turn queue (sequential firing). */
  function endOfTurnShimmer(slotEl, opts, onDone) {
    opts   = opts || {};
    onDone = typeof onDone === 'function' ? onDone : function () {};
    if (!slotEl) { if (typeof opts.onTick === 'function') opts.onTick(); onDone(); return; }

    // Clipped overlay so the band never paints outside the card.
    var wrap = document.createElement('div');
    wrap.className = 'reveal-fx-eot-shimmer';
    var band = document.createElement('div');
    band.className = 'reveal-fx-eot-shimmer-band';
    wrap.appendChild(band);
    slotEl.appendChild(wrap);

    // Midpoint of the sweep: apply the real effect + pop the IP number.
    setTimeout(function () {
      if (typeof opts.onTick === 'function') opts.onTick();
      var ip = slotEl.querySelector('.db-overlay-ip');
      if (ip) flashClass(ip, 'reveal-fx-ip-gain', 520);
    }, 380);

    // Sweep done → clean up + release the queue.
    setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      onDone();
    }, 820);
  }

  return { fire: fire, has: has, reactBounce: reactBounce,
           scribeStampSequence: scribeStampSequence,
           soldierCharge: soldierCharge,
           hammurabiStrike: hammurabiStrike,
           cuneiformLift: cuneiformLift,
           phoeniciansMerge: phoeniciansMerge,
           chariotArrow: chariotArrow,
           nebuchadnezzarShimmer: nebuchadnezzarShimmer,
           sargonBeam: sargonBeam,
           hatshepsutBoatLaunch: hatshepsutBoatLaunch,
           dirtBurst: dirtBurst,
           ipBadgeSwap: ipBadgeSwap,
           pyramidAbsorb: pyramidAbsorb,
           mummyWrapReveal: mummyWrapReveal,
           rosettaTranscribe: rosettaTranscribe,
           scribeAccountingSequence: scribeAccountingSequence,
           farmerOnionBite: farmerOnionBite,
           boatSplashBurst: boatSplashBurst,
           papyrusScrollRoll: papyrusScrollRoll,
           papyrusCopyFlourish: papyrusCopyFlourish,
           endOfTurnShimmer: endOfTurnShimmer };
})();

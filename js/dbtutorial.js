/**
 * dbtutorial.js
 * Spotlight-overlay tutorial for the Deck Builder screen.
 *
 * Fires automatically the first time a user enters the Deck Builder,
 * and on every subsequent visit until they actually build a 15-card
 * deck and click Let's Play. Re-triggerable via the "?" help icon
 * in the header.
 *
 * Exposes window.DeckBuilderTutorial with five methods that
 * deckbuilder.js calls into:
 *
 *   startIfNew()         — boot the tutorial only if the completion
 *                          flag is unset (called on initDeckBuilder).
 *   start()              — force-start regardless of flag (the "?" icon).
 *   notifyCardClick(id)  — deckbuilder reports a single-click on a card
 *                          (used to advance step 4).
 *   notifyCardDblClick(id) — deckbuilder reports a double-click on a
 *                          card (used to advance step 2 and re-target
 *                          the spotlight in step 3 onto the just-added
 *                          card).
 *   notifyLetsPlay(size) — deckbuilder reports a click on "Let's Play".
 *                          If size === 15 we mark the tutorial complete;
 *                          otherwise it stays unfinished.
 *
 * State machine: see STEPS array. Each step has a target selector (or
 * lazy resolver), a Lucy dialogue line, and an advance trigger ('click',
 * 'card-dblclick', or 'card-click'). The tutorial keeps a self-contained
 * type-out animation rather than coupling to tutorial.js's TS state.
 */

(function () {
  'use strict';

  /* ── localStorage ────────────────────────────────────────────── */
  var KEY = 'sog_deckbuilder_tutorial_complete';
  function isComplete()    { return localStorage.getItem(KEY) === 'true'; }
  function markComplete()  { try { localStorage.setItem(KEY, 'true'); } catch (e) {} }

  /* ── State ───────────────────────────────────────────────────── */
  var active           = false;
  var stepIdx          = -1;
  var addedCardIdInStep2 = null;   // card the player added during step 2

  /* Type-out animation state — self-contained, no TS coupling. */
  var TYPE_SPEED = 28;             // ms per char (matches tutorial.js)
  var typing     = false;
  var typeTimer  = null;
  var fullText   = '';
  var typedLen   = 0;
  var onTextDone = null;

  /* ── DOM refs (resolved lazily on first start) ───────────────── */
  var boxEl, textEl, hintEl, lucyImgEl;
  var overlayEl, frameEl, skipEl, helpIconEl;
  var currentTargetEl = null;

  /* ═══════════════════════════════════════════════════════════════
     STEP DEFINITIONS
  ═══════════════════════════════════════════════════════════════ */
  /* Resolvers run at step-enter time so the DOM is fresh (card grid
     might have been re-rendered between steps). */
  var STEPS = [
    {
      resolve: function () { return document.getElementById('db-counter'); },
      line:    "You need to build a deck of 15 cards. This counter tracks how many you have.",
      advance: 'click'
    },
    {
      resolve: function () { return firstCardTile(); },
      line:    "Double-click any card to add it to your deck. Try it!",
      advance: 'card-dblclick'
    },
    {
      resolve: function () {
        // Re-target onto the card the user just added; falls back to
        // the originally-spotlighted first card if anything went wrong.
        if (addedCardIdInStep2 !== null) {
          var el = document.querySelector('#db-main [data-id="' + addedCardIdInStep2 + '"]');
          if (el) return el;
        }
        return firstCardTile();
      },
      line:    "Nice! Double-click again to remove it if you change your mind.",
      advance: 'click'
    },
    {
      resolve: function () { return nthCardTile(2); },
      line:    "Single-click any card to see what it does.",
      advance: 'card-click'
    },
    {
      resolve: function () { return document.getElementById('db-save'); },
      line:    "When you've added 15 cards, click here to play!",
      advance: 'click'
    }
  ];

  function firstCardTile() {
    return document.querySelector('#db-main [data-id]');
  }
  function nthCardTile(n) {
    // nth-of-type doesn't work well across mixed children, so query all
    // and index. n is 1-based to match user spec ("second card").
    var tiles = document.querySelectorAll('#db-main [data-id]');
    return tiles[n - 1] || null;
  }

  /* ═══════════════════════════════════════════════════════════════
     DOM SETUP
  ═══════════════════════════════════════════════════════════════ */
  function initRefs() {
    boxEl     = document.getElementById('tut-box');
    textEl    = document.getElementById('tut-text');
    hintEl    = document.getElementById('tut-hint');
    lucyImgEl = boxEl ? boxEl.querySelector('.tut-lucy-img') : null;

    overlayEl  = document.getElementById('db-tut-overlay');
    frameEl    = document.getElementById('db-tut-frame');
    skipEl     = document.getElementById('db-tut-skip');
    helpIconEl = document.getElementById('db-help-icon');

    if (!overlayEl) {
      // Lazy-create the overlay + spotlight frame + skip button on
      // first start. Avoids polluting index.html with markup that's
      // only relevant when the tutorial is active.
      overlayEl = document.createElement('div');
      overlayEl.id = 'db-tut-overlay';
      overlayEl.addEventListener('click', onOverlayClick);
      document.body.appendChild(overlayEl);

      frameEl = document.createElement('div');
      frameEl.id = 'db-tut-frame';
      document.body.appendChild(frameEl);

      skipEl = document.createElement('button');
      skipEl.id = 'db-tut-skip';
      skipEl.textContent = 'Skip Tutorial';
      skipEl.addEventListener('click', skipTutorial);
      document.body.appendChild(skipEl);
    }

    if (helpIconEl && !helpIconEl._wired) {
      helpIconEl._wired = true;
      helpIconEl.addEventListener('click', function () { start(); });
    }

    // Bubble-click advances click-type steps. Bound once per page-load.
    if (boxEl && !boxEl._dbTutWired) {
      boxEl._dbTutWired = true;
      boxEl.addEventListener('click', onBubbleClick);
    }

    // Window resize → re-measure spotlight target.
    if (!window._dbTutResizeWired) {
      window._dbTutResizeWired = true;
      window.addEventListener('resize', repositionFrame);
      window.addEventListener('scroll',  repositionFrame, true);
    }

    // Escape closes the tutorial without marking complete.
    if (!window._dbTutKeyWired) {
      window._dbTutKeyWired = true;
      window.addEventListener('keydown', function (e) {
        if (!active) return;
        if (e.key === 'Escape') { e.preventDefault(); skipTutorial(); }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════════ */
  function start() {
    initRefs();
    if (!boxEl || !textEl) {
      // Lucy box missing — fail silently rather than throw.
      return;
    }
    if (window.tutorialActive) {
      // In-game tutorial is running — defer to avoid overlap. Caller
      // will re-attempt on next deck-builder entry.
      return;
    }
    active = true;
    stepIdx = -1;
    addedCardIdInStep2 = null;
    overlayEl.classList.add('visible');
    skipEl.classList.add('visible');
    boxEl.style.display = '';
    boxEl.classList.add('db-tut-positioned');
    nextStep();
  }

  function startIfNew() {
    if (isComplete()) return;
    start();
  }

  function notifyCardClick(cardId) {
    if (!active) return;
    var step = STEPS[stepIdx];
    if (!step || step.advance !== 'card-click') return;
    nextStep();
  }

  function notifyCardDblClick(cardId) {
    if (!active) return;
    var step = STEPS[stepIdx];
    if (!step || step.advance !== 'card-dblclick') return;
    addedCardIdInStep2 = cardId;
    nextStep();
  }

  function notifyLetsPlay(deckSize) {
    if (deckSize === 15) markComplete();
    // If active when Let's Play fires, also tear down — though normally
    // step 5 is click-to-continue so the tutorial has already closed.
    if (active) tearDown();
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP MACHINE
  ═══════════════════════════════════════════════════════════════ */
  function nextStep() {
    stepIdx++;
    if (stepIdx >= STEPS.length) {
      // Final click-to-continue past step 5 closes the tutorial.
      // Completion isn't marked here — only on a real Let's Play with 15 cards.
      tearDown();
      return;
    }
    var step = STEPS[stepIdx];
    var target = step.resolve();
    setSpotlight(target);
    setDialogue(step.line);
  }

  function setSpotlight(target) {
    // Clear previous
    if (currentTargetEl) {
      currentTargetEl.classList.remove('db-tut-spotlighted');
      currentTargetEl = null;
    }
    if (!target) {
      frameEl.classList.remove('visible');
      return;
    }
    target.classList.add('db-tut-spotlighted');
    currentTargetEl = target;
    repositionFrame();
    frameEl.classList.add('visible');
  }

  function repositionFrame() {
    if (!active || !currentTargetEl || !frameEl) return;
    var r = currentTargetEl.getBoundingClientRect();
    frameEl.style.top    = r.top + 'px';
    frameEl.style.left   = r.left + 'px';
    frameEl.style.width  = r.width + 'px';
    frameEl.style.height = r.height + 'px';
  }

  /* ═══════════════════════════════════════════════════════════════
     DIALOGUE — minimal type-out animation, no shared state
  ═══════════════════════════════════════════════════════════════ */
  function setDialogue(text) {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    fullText  = text;
    typedLen  = 0;
    typing    = true;
    textEl.textContent = '';
    if (hintEl) hintEl.textContent = '▶ Click to continue';

    typeTimer = setInterval(function () {
      typedLen++;
      textEl.textContent = fullText.slice(0, typedLen);
      if (typedLen >= fullText.length) {
        clearInterval(typeTimer);
        typeTimer = null;
        typing = false;
      }
    }, TYPE_SPEED);
  }

  function finishTyping() {
    if (!typing) return;
    clearInterval(typeTimer);
    typeTimer = null;
    typing = false;
    typedLen = fullText.length;
    textEl.textContent = fullText;
  }

  /* ═══════════════════════════════════════════════════════════════
     INPUT HANDLERS
  ═══════════════════════════════════════════════════════════════ */
  function onBubbleClick() {
    if (!active) return;
    if (typing) {
      // First click while typing reveals the full line immediately.
      finishTyping();
      return;
    }
    var step = STEPS[stepIdx];
    if (!step) return;
    if (step.advance === 'click') nextStep();
    // Gated steps (card-click / card-dblclick) ignore bubble clicks —
    // the player must interact with the spotlighted card.
  }

  function onOverlayClick(e) {
    // The overlay absorbs clicks on the dim region — only the
    // spotlighted element and the bubble/skip button are interactive.
    e.preventDefault();
    e.stopPropagation();
  }

  function skipTutorial() {
    if (!active) return;
    tearDown();
  }

  /* ═══════════════════════════════════════════════════════════════
     TEARDOWN
  ═══════════════════════════════════════════════════════════════ */
  function tearDown() {
    active = false;
    stepIdx = -1;
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    typing = false;
    if (currentTargetEl) {
      currentTargetEl.classList.remove('db-tut-spotlighted');
      currentTargetEl = null;
    }
    if (overlayEl) overlayEl.classList.remove('visible');
    if (frameEl)   frameEl.classList.remove('visible');
    if (skipEl)    skipEl.classList.remove('visible');
    if (boxEl) {
      boxEl.classList.remove('db-tut-positioned');
      boxEl.style.display = 'none';
    }
  }

  /* ── Public export ─────────────────────────────────────────────── */
  window.DeckBuilderTutorial = {
    start:              start,
    startIfNew:         startIfNew,
    notifyCardClick:    notifyCardClick,
    notifyCardDblClick: notifyCardDblClick,
    notifyLetsPlay:     notifyLetsPlay
  };

}());

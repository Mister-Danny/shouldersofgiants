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
 *                          (no longer used for advancing — kept for API
 *                          stability and future flows).
 *   notifyCardDblClick(id) — deckbuilder reports a double-click on a
 *                          card (used to advance the double-click step
 *                          and re-target the spotlight onto the just-
 *                          added card).
 *   notifyLetsPlay(size) — deckbuilder reports a click on "Let's Play".
 *                          If size === 15 we mark the tutorial complete.
 *
 * Spotlight cutout technique: four fixed-position dim rectangles
 * arranged around the target's bounding rect (top / right / bottom /
 * left). The "hole" is just the negative space between them, so the
 * target — and anything that opens over it like the ability popup —
 * renders at its natural z-index with no manipulation. This replaces
 * the earlier z-index-lifting approach, which failed for elements
 * trapped in lower stacking contexts (Let's Play button) and for
 * dynamically-shown popups.
 */

(function () {
  'use strict';

  /* ── localStorage ────────────────────────────────────────────── */
  var KEY = 'sog_deckbuilder_tutorial_complete';
  function isComplete()    { return localStorage.getItem(KEY) === 'true'; }
  function markComplete()  { try { localStorage.setItem(KEY, 'true'); } catch (e) {} }

  /* ── State ───────────────────────────────────────────────────── */
  var active             = false;
  var stepIdx            = -1;
  var addedCardIdInDblStep = null;   // card the player added during the dblclick step
  var popupOpen          = false;
  var hiddenForPopup     = false;    // tutorial UI hidden while popup is shown

  /* Type-out animation state — self-contained, no TS coupling. */
  var TYPE_SPEED = 28;               // ms per char (matches tutorial.js)
  var typing     = false;
  var typeTimer  = null;
  var fullText   = '';
  var typedLen   = 0;

  /* ── DOM refs (resolved lazily on first start) ───────────────── */
  var boxEl, textEl, hintEl, lucyImgEl;
  var dimTopEl, dimRightEl, dimBottomEl, dimLeftEl;
  var frameEl, skipEl, helpIconEl;
  var currentTargetEl = null;

  /* ═══════════════════════════════════════════════════════════════
     STEP DEFINITIONS
     resolve() returns the DOM element to spotlight, or null for a
     no-spotlight step (welcome). advance values:
       'click'         — Lucy bubble click moves on
       'card-dblclick' — gated; any double-click anywhere on a card
       'popup-closed'  — gated; ability popup must open and then close
  ═══════════════════════════════════════════════════════════════ */
  var STEPS = [
    {
      id:      'welcome',
      resolve: function () { return null; },
      line:    "Welcome to the Deck Builder! Here is where you will create your decks to play with.",
      advance: 'click'
    },
    {
      id:      'counter',
      resolve: function () { return document.getElementById('db-counter'); },
      line:    "You need 15 Cards to complete a deck. This counter tracks how many you have.",
      advance: 'click'
    },
    {
      id:      'dblclick',
      // Citizens (id 1) is the suggested starting point; any card works.
      resolve: function () {
        var citizens = document.querySelector('#db-main [data-id="1"]');
        return citizens || firstCardTile();
      },
      line:    "Double-click any card to add it to your deck. Start with Citizens.",
      advance: 'card-dblclick'
    },
    {
      id:      'just-added',
      resolve: function () {
        if (addedCardIdInDblStep !== null) {
          var el = document.querySelector('#db-main [data-id="' + addedCardIdInDblStep + '"]');
          if (el) return el;
        }
        return firstCardTile();
      },
      line:    "You're good at this. Double-click it again if you want to remove it.",
      advance: 'click'
    },
    {
      id:      'single-click',
      // Use the second card so it's visually distinct from the just-added one.
      // Skip the card the player added so the spotlight clearly moves to a new target.
      resolve: function () {
        var tiles = document.querySelectorAll('#db-main [data-id]');
        for (var i = 0; i < tiles.length; i++) {
          var id = parseInt(tiles[i].getAttribute('data-id'), 10);
          if (id !== addedCardIdInDblStep) return tiles[i];
        }
        return tiles[0] || null;
      },
      line:    "Single-click any card to see what it does.",
      advance: 'popup-closed'   // popup-opened then popup-closed advances
    },
    {
      id:      'lets-play',
      resolve: function () { return document.getElementById('db-save'); },
      line:    "When you've added 15 cards, click here to play!",
      advance: 'click'
    }
  ];

  function firstCardTile() {
    return document.querySelector('#db-main [data-id]');
  }

  /* ═══════════════════════════════════════════════════════════════
     DOM SETUP
  ═══════════════════════════════════════════════════════════════ */
  function initRefs() {
    boxEl     = document.getElementById('tut-box');
    textEl    = document.getElementById('tut-text');
    hintEl    = document.getElementById('tut-hint');
    lucyImgEl = boxEl ? boxEl.querySelector('.tut-lucy-img') : null;

    helpIconEl = document.getElementById('db-help-icon');

    if (!dimTopEl) {
      // Lazy-create the four dim rectangles, the gold frame, and the
      // Skip button on first start. Avoids polluting index.html with
      // markup that's only relevant when the tutorial is active.
      dimTopEl    = makeDimRect('top');
      dimRightEl  = makeDimRect('right');
      dimBottomEl = makeDimRect('bottom');
      dimLeftEl   = makeDimRect('left');

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

    // Window resize/scroll → re-measure spotlight target.
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

    // MutationObserver on the ability popup so we can detect open/close
    // even when other code paths (the X button, backdrop click, future
    // Escape handler) trigger it.
    if (!window._dbTutPopupObs) {
      var popupEl = document.getElementById('card-popup-backdrop');
      if (popupEl) {
        var obs = new MutationObserver(onPopupClassMutate);
        obs.observe(popupEl, { attributes: true, attributeFilter: ['class'] });
        window._dbTutPopupObs = obs;
      }
    }
  }

  function makeDimRect(suffix) {
    var el = document.createElement('div');
    el.className = 'db-tut-dim';
    el.id = 'db-tut-dim-' + suffix;
    document.body.appendChild(el);
    return el;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════════ */
  function start() {
    initRefs();
    if (!boxEl || !textEl) return;             // Lucy box missing — fail silent
    if (window.tutorialActive) return;         // in-game tutorial running — defer
    active                = true;
    stepIdx               = -1;
    addedCardIdInDblStep  = null;
    hiddenForPopup        = false;
    popupOpen             = false;
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
    // Single-click advancing is now driven by the popup-open/close
    // observer in step 'single-click', not by this notify. Retained
    // for API stability + future flows.
  }

  function notifyCardDblClick(cardId) {
    if (!active) return;
    var step = STEPS[stepIdx];
    if (!step || step.advance !== 'card-dblclick') return;
    addedCardIdInDblStep = cardId;
    nextStep();
  }

  function notifyLetsPlay(deckSize) {
    if (deckSize === 15) markComplete();
    if (active) tearDown();
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP MACHINE
  ═══════════════════════════════════════════════════════════════ */
  function nextStep() {
    stepIdx++;
    if (stepIdx >= STEPS.length) {
      // Final click-to-continue past lets-play closes the tutorial.
      // Completion isn't marked here — only on a real Let's Play with 15 cards.
      tearDown();
      return;
    }
    var step = STEPS[stepIdx];
    setSpotlight(step.resolve());
    setDialogue(step.line);
  }

  function setSpotlight(target) {
    if (!target) {
      // No-spotlight step (welcome) — hide all dim rects + frame.
      currentTargetEl = null;
      hideDimRects();
      frameEl.classList.remove('visible');
      return;
    }
    currentTargetEl = target;
    repositionFrame();
    showDimRects();
    frameEl.classList.add('visible');
  }

  /* Position the four dim rects so the negative space between them is
     a tight rectangle around the target (with a small pad so the gold
     frame doesn't crowd the element). The gold frame matches the same
     padded rect. */
  function repositionFrame() {
    if (!active || !currentTargetEl) return;
    var pad = 8;
    var r = currentTargetEl.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var top    = Math.max(0,  r.top    - pad);
    var bottom = Math.min(vh, r.bottom + pad);
    var left   = Math.max(0,  r.left   - pad);
    var right  = Math.min(vw, r.right  + pad);

    // Top rect: spans full width, from viewport top down to the cutout top.
    setRect(dimTopEl,    0,       0,            vw,         top);
    // Bottom rect: spans full width, from cutout bottom to viewport bottom.
    setRect(dimBottomEl, 0,       bottom,       vw,         Math.max(0, vh - bottom));
    // Left rect: between the cutout's vertical span, from viewport left to cutout left.
    setRect(dimLeftEl,   0,       top,          left,       Math.max(0, bottom - top));
    // Right rect: between the cutout's vertical span, from cutout right to viewport right.
    setRect(dimRightEl,  right,   top,          Math.max(0, vw - right), Math.max(0, bottom - top));

    // Gold frame matches the padded cutout.
    frameEl.style.top    = top    + 'px';
    frameEl.style.left   = left   + 'px';
    frameEl.style.width  = (right  - left) + 'px';
    frameEl.style.height = (bottom - top)  + 'px';
  }

  function setRect(el, x, y, w, h) {
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
  }

  function showDimRects() {
    dimTopEl.classList.add('visible');
    dimRightEl.classList.add('visible');
    dimBottomEl.classList.add('visible');
    dimLeftEl.classList.add('visible');
  }

  function hideDimRects() {
    dimTopEl.classList.remove('visible');
    dimRightEl.classList.remove('visible');
    dimBottomEl.classList.remove('visible');
    dimLeftEl.classList.remove('visible');
  }

  /* ═══════════════════════════════════════════════════════════════
     POPUP INTERLUDE (step 5 — single-click)
     When the ability popup opens during the single-click step, hide
     the entire tutorial UI so the popup is unobstructed. When the
     popup closes, advance straight to the lets-play step.
  ═══════════════════════════════════════════════════════════════ */
  function onPopupClassMutate() {
    if (!active) return;
    var popupEl = document.getElementById('card-popup-backdrop');
    if (!popupEl) return;
    var nowVisible = popupEl.classList.contains('visible');
    if (nowVisible === popupOpen) return;     // no real change
    popupOpen = nowVisible;

    var step = STEPS[stepIdx];
    if (!step || step.advance !== 'popup-closed') return;

    if (nowVisible) {
      // Popup just opened → hide tutorial UI entirely.
      hiddenForPopup = true;
      hideTutorialUI();
    } else if (hiddenForPopup) {
      // Popup just closed → show tutorial UI and advance.
      hiddenForPopup = false;
      showTutorialUI();
      nextStep();
    }
  }

  function hideTutorialUI() {
    hideDimRects();
    frameEl.classList.remove('visible');
    skipEl.classList.remove('visible');
    boxEl.style.display = 'none';
  }

  function showTutorialUI() {
    skipEl.classList.add('visible');
    boxEl.style.display = '';
    // dim + frame are re-shown by nextStep → setSpotlight when needed.
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
    if (typing) { finishTyping(); return; }
    var step = STEPS[stepIdx];
    if (!step) return;
    if (step.advance === 'click') nextStep();
    // Gated steps ignore bubble clicks — they wait on their gate.
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
    currentTargetEl = null;
    hideDimRects();
    if (frameEl) frameEl.classList.remove('visible');
    if (skipEl)  skipEl.classList.remove('visible');
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

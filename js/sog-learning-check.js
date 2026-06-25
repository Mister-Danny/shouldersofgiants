/**
 * sog-learning-check.js — Learning Check popup (Stage 2 of the focus system)
 *
 * The REFILL side of focus: the player answers a history question to restore
 * focus. Opened anytime from the book icon under the HUD focus bar (NO gate
 * yet — that's Stage 3).
 *
 *   • One question at a time, picked RANDOMLY from QUESTIONS (repeats OK in v1).
 *   • Two formats: 'mc' (3-4 options) and 'tf' (True/False).
 *   • CORRECT  → "Correct!", restore +RESTORE_AMOUNT focus (capped at 100 by
 *                SOG.focus.restore), then choose: Next Question or Done.
 *   • WRONG    → "Not quite!", NO penalty, then a fresh random question to retry.
 *                The player can never get stuck.
 *
 * Visuals reuse the shared parchment/SNES popup (.card-popup .rules-popup) so it
 * matches the boss-rules / card-detail popups. Questions + UI strings live in the
 * editable constants below.
 *
 * Public API (SOG.LearningCheck): open(), close(), isOpen()
 */
window.SOG = window.SOG || {};
SOG.LearningCheck = (function () {
  'use strict';

  /* ── Tunables ───────────────────────────────────────────────────────────── */
  var RESTORE_AMOUNT = 50;   // focus granted per correct answer (clamped to MAX)

  /* ── UI strings (editable) ──────────────────────────────────────────────── */
  var STR = {
    title:        'Learning Check',
    prompt:       'Answer to restore focus:',
    correct:      'Correct!',
    correctSub:   'Focus Boosted!',
    wrong:        'Not quite!',
    wrongSub:     "Here's another one — try again.",
    nextQuestion: 'Next Question',
    done:         'Done',
    tfTrue:       'True',
    tfFalse:      'False',
    // Stage 3 hard-gate prompt (shown when a blocked action is attempted at 0 focus)
    gateTitle:    'Out of Focus',
    gateMsg:      "You're out of focus! Answer a learning check to continue.",
    gateAnswer:   'Answer a Question',
    gateClose:    'Not Now'
  };

  /* ── Question pool (editable) ───────────────────────────────────────────────
     Each entry:
       format  : 'mc' | 'tf'
       q       : the question text
       options : array of answer strings (tf is auto-filled True/False)
       correct : index into `options` of the right answer
     Answer order is SHUFFLED at render time, so the correct option never sits in
     a fixed on-screen position. */
  var QUESTIONS = [
    { format: 'mc',
      q: 'What body of water were the first cities in Mesopotamia built between?',
      options: ['The Tigris and Euphrates rivers', 'The Nile and the Red Sea',
                'The Mediterranean and Black Sea', 'The Indus and Ganges'],
      correct: 0 },

    { format: 'tf',
      q: "Mesopotamia is often called 'the cradle of civilization.'",
      correct: true },

    { format: 'mc',
      q: 'What was Hammurabi famous for creating?',
      options: ['A written code of laws', 'The first pyramid', 'The wheel', 'A system of money'],
      correct: 0 },

    { format: 'mc',
      q: 'The development of farming let early people do what for the first time?',
      options: ['Settle in one place and build villages', 'Travel across oceans',
                'Build pyramids', 'Use electricity'],
      correct: 0 },

    { format: 'tf',
      q: "Cuneiform was one of the world's first writing systems.",
      correct: true },

    { format: 'mc',
      q: "Sargon of Akkad is remembered as the world's first what?",
      options: ['Emperor', 'Pharaoh', 'Scientist', 'Explorer'],
      correct: 0 },

    { format: 'mc',
      q: 'Before farming, how did most early humans get their food?',
      options: ['Hunting animals and gathering plants', 'Growing crops',
                'Trading at markets', 'Raising livestock'],
      correct: 0 },

    { format: 'tf',
      q: 'Gilgamesh was a king connected to the city of Uruk.',
      correct: true },

    { format: 'mc',
      q: 'Why was the land between the Tigris and Euphrates good for farming?',
      options: ['The rivers flooded and left rich soil', 'It never rained',
                'It was covered in forests', 'The ground was made of sand'],
      correct: 0 },

    { format: 'mc',
      q: 'What did a surplus of food allow people in early cities to do?',
      options: ['Specialize in different jobs', 'Stop eating',
                'Leave the cities', 'Forget how to farm'],
      correct: 0 }
  ];

  /* ── State ──────────────────────────────────────────────────────────────── */
  var BACKDROP_ID = 'learning-check-backdrop';
  var _panel = null;

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  // Build a uniform [{text,correct}] answer list. True/False ALWAYS shows True
  // first (no shuffle); multiple-choice is shuffled so the correct option isn't
  // pinned to a fixed position.
  function _buildAnswers(qd) {
    if (qd.format === 'tf') {
      return [
        { text: STR.tfTrue,  correct: qd.correct === true },
        { text: STR.tfFalse, correct: qd.correct === false }
      ];
    }
    return _shuffle(qd.options.map(function (opt, i) {
      return { text: opt, correct: i === qd.correct };
    }));
  }

  function _shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function _pickQuestion() {
    return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  }

  function _refreshHudFocus() {
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshFocus === 'function') SOG.HUD.refreshFocus();
  }

  /* ── Render a fresh question into the panel body ────────────────────────── */
  function _renderQuestion() {
    if (!_panel) return;
    var body = _panel.querySelector('.lc-body');
    if (!body) return;

    var qd = _pickQuestion();
    var answers = _buildAnswers(qd);

    body.innerHTML = '';

    var prompt = document.createElement('div');
    prompt.className = 'lc-prompt';
    prompt.textContent = STR.prompt;
    body.appendChild(prompt);

    var qEl = document.createElement('div');
    qEl.className = 'lc-question';
    qEl.textContent = qd.q;
    body.appendChild(qEl);

    var opts = document.createElement('div');
    opts.className = 'lc-options' + (qd.format === 'tf' ? ' lc-options-tf' : '');
    answers.forEach(function (ans) {
      var btn = document.createElement('button');
      btn.className = 'lc-option';
      btn.textContent = ans.text;
      btn.addEventListener('click', function () { _onAnswer(ans.correct, btn, opts); });
      opts.appendChild(btn);
    });
    body.appendChild(opts);

    // Feedback + footer mount points (filled after an answer).
    var feedback = document.createElement('div');
    feedback.className = 'lc-feedback';
    body.appendChild(feedback);
  }

  /* ── Answer handling ────────────────────────────────────────────────────── */
  function _onAnswer(isCorrect, btn, optsWrap) {
    // Lock the options so a second click can't double-fire.
    var all = optsWrap.querySelectorAll('.lc-option');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;

    var feedback = _panel.querySelector('.lc-feedback');

    if (isCorrect) {
      btn.classList.add('lc-option-correct');
      if (typeof SFX !== 'undefined' && typeof SFX.learnCorrect === 'function') SFX.learnCorrect();
      if (window.SOG && SOG.focus) SOG.focus.restore(RESTORE_AMOUNT);
      _refreshHudFocus();

      feedback.innerHTML =
        '<div class="lc-result lc-result-correct">' + STR.correct + '</div>' +
        '<div class="lc-result-sub">' + STR.correctSub + '</div>';

      var actions = document.createElement('div');
      actions.className = 'lc-actions';
      var nextBtn = document.createElement('button');
      nextBtn.className = 'lc-btn lc-btn-next';
      nextBtn.textContent = STR.nextQuestion;
      nextBtn.addEventListener('click', _renderQuestion);
      var doneBtn = document.createElement('button');
      doneBtn.className = 'lc-btn lc-btn-done';
      doneBtn.textContent = STR.done;
      doneBtn.addEventListener('click', close);
      actions.appendChild(nextBtn);
      actions.appendChild(doneBtn);
      feedback.appendChild(actions);
    } else {
      // WRONG — no penalty. Mark the miss, then auto-advance to a fresh question.
      btn.classList.add('lc-option-wrong');
      if (typeof SFX !== 'undefined' && typeof SFX.learnWrong === 'function') SFX.learnWrong();
      feedback.innerHTML =
        '<div class="lc-result lc-result-wrong">' + STR.wrong + '</div>' +
        '<div class="lc-result-sub">' + STR.wrongSub + '</div>';
      setTimeout(function () { if (isOpen()) _renderQuestion(); }, 1100);
    }
  }

  /* ── Open / close ───────────────────────────────────────────────────────── */
  function isOpen() {
    var el = document.getElementById(BACKDROP_ID);
    return !!(el && el.classList.contains('visible'));
  }

  function open() {
    close();   // tear down any existing instance first

    var backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.className = 'popup-backdrop rules-popup-backdrop learning-check-backdrop';

    _panel = document.createElement('div');
    _panel.className = 'card-popup rules-popup learning-check-popup';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-x';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&#x2715;';

    var titleEl = document.createElement('div');
    titleEl.className = 'rules-popup-title';
    titleEl.textContent = STR.title;

    var bodyEl = document.createElement('div');
    bodyEl.className = 'lc-body';

    _panel.appendChild(closeBtn);
    _panel.appendChild(titleEl);
    _panel.appendChild(bodyEl);
    backdrop.appendChild(_panel);
    document.body.appendChild(backdrop);

    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    _renderQuestion();

    void backdrop.offsetHeight;     // reflow → run the fade/scale-in transition
    backdrop.classList.add('visible');
  }

  function close() {
    var el = document.getElementById(BACKDROP_ID);
    if (!el) { _panel = null; return; }
    el.classList.remove('visible');
    _panel = null;
    setTimeout(function () {
      if (el.parentNode && !el.classList.contains('visible')) el.parentNode.removeChild(el);
    }, 200);
  }

  /* ── Stage 3 hard-gate prompt ───────────────────────────────────────────────
     Shown by the gate (overworld) when a blocked action is attempted at 0 focus.
     Its "Answer a Question" button opens the learning check directly, so the
     player can ALWAYS refill and escape the gate (anti-softlock). Separate
     backdrop id so it never collides with the learning-check popup. */
  var GATE_ID = 'focus-gate-backdrop';

  function gateIsOpen() {
    var el = document.getElementById(GATE_ID);
    return !!(el && el.classList.contains('visible'));
  }

  function closeGate() {
    var el = document.getElementById(GATE_ID);
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(function () {
      if (el.parentNode && !el.classList.contains('visible')) el.parentNode.removeChild(el);
    }, 200);
  }

  function promptGate() {
    closeGate();

    var backdrop = document.createElement('div');
    backdrop.id = GATE_ID;
    backdrop.className = 'popup-backdrop rules-popup-backdrop learning-check-backdrop';

    var panel = document.createElement('div');
    panel.className = 'card-popup rules-popup learning-check-popup focus-gate-popup';

    var closeX = document.createElement('button');
    closeX.className = 'popup-close-x';
    closeX.setAttribute('aria-label', 'Close');
    closeX.innerHTML = '&#x2715;';

    var titleEl = document.createElement('div');
    titleEl.className = 'rules-popup-title';
    titleEl.textContent = STR.gateTitle;

    var msg = document.createElement('div');
    msg.className = 'lc-question';
    msg.textContent = STR.gateMsg;

    var actions = document.createElement('div');
    actions.className = 'lc-actions';
    var answerBtn = document.createElement('button');
    answerBtn.className = 'lc-btn lc-btn-next';
    answerBtn.textContent = STR.gateAnswer;
    answerBtn.addEventListener('click', function () { closeGate(); open(); });   // → refill path
    var laterBtn = document.createElement('button');
    laterBtn.className = 'lc-btn';
    laterBtn.textContent = STR.gateClose;
    laterBtn.addEventListener('click', closeGate);
    actions.appendChild(answerBtn);
    actions.appendChild(laterBtn);

    panel.appendChild(closeX);
    panel.appendChild(titleEl);
    panel.appendChild(msg);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    closeX.addEventListener('click', function (e) { e.stopPropagation(); closeGate(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeGate(); });

    void backdrop.offsetHeight;
    backdrop.classList.add('visible');
  }

  return { open: open, close: close, isOpen: isOpen, promptGate: promptGate, gateIsOpen: gateIsOpen, closeGate: closeGate };
})();

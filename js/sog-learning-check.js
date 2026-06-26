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
     a fixed on-screen position. The whole pool below is multiple-choice; the
     correct answer is listed FIRST in every options array (so correct: 0
     everywhere — easy to audit), then shuffled on screen. The 'tf' rendering path
     in _buildAnswers is kept (harmless, unused) so True/False can be re-added. */
  var QUESTIONS = [
    { format: 'mc',
      q: 'What does the term "hunter-gatherer" mean?',
      options: ['People who hunted animals and gathered plants for food',
                'People who only farmed grain',
                'People who traded goods between cities',
                'People who built the first permanent cities'],
      correct: 0 },

    { format: 'mc',
      q: 'What is a nomad?',
      options: ['A person who moves from place to place',
                'A person who studies ancient bones',
                'A skilled craftsperson',
                'A village leader'],
      correct: 0 },

    { format: 'mc',
      q: 'About how many people typically made up a hunter-gatherer band?',
      options: ['Around 30', 'Around 5', 'Around 500', 'Around 5,000'],
      correct: 0 },

    { format: 'mc',
      q: 'Around what time did early humans learn to make and control fire?',
      options: ['500,000 years ago', '8,000 years ago', '2,000 years ago', '100 years ago'],
      correct: 0 },

    { format: 'mc',
      q: 'What does the word "technology" mean, based on its Greek roots?',
      options: ['The study and application of crafts or skills',
                'The study of the stars',
                'The worship of many gods',
                'The trading of surplus goods'],
      correct: 0 },

    { format: 'mc',
      q: 'Why do some archaeologists believe early humans made cave paintings of animals?',
      options: ['To honor the spirits of animals killed for food',
                'To teach children math',
                'To record business deals',
                'To mark the boundaries of their land'],
      correct: 0 },

    { format: 'mc',
      q: 'What is migration?',
      options: ['Moving from one place to settle in another',
                'Watering crops with canals',
                'Trading goods for food',
                'Building walls around a village'],
      correct: 0 },

    { format: 'mc',
      q: 'How did early humans first enter the Americas?',
      options: ['By crossing a land bridge connecting Siberia and Alaska',
                'By sailing across the Atlantic Ocean',
                'By following rivers from Africa',
                'By building large ships'],
      correct: 0 },

    { format: 'mc',
      q: 'Around what year did people begin the practice of agriculture?',
      options: ['8000 B.C.', '500,000 B.C.', '2340 B.C.', '539 B.C.'],
      correct: 0 },

    { format: 'mc',
      q: 'What is the name given to the shift from food gathering to food raising?',
      options: ['The Agricultural Revolution',
                'The Industrial Revolution',
                'Cultural diffusion',
                'Domestication'],
      correct: 0 },

    { format: 'mc',
      q: 'What does it mean to "domesticate" a plant or animal?',
      options: ['To learn to grow, tend, or raise it for human use',
                'To trade it to another village',
                'To paint it on a cave wall',
                'To worship it as a god'],
      correct: 0 },

    { format: 'mc',
      q: 'In slash-and-burn agriculture, what did early farmers do?',
      options: ['Cut and burned trees and brush to clear land for crops',
                'Built dams across rivers',
                'Used iron weapons to hunt',
                'Traded grain for metal tools'],
      correct: 0 },

    { format: 'mc',
      q: 'What is a surplus?',
      options: ['More than what is needed to survive',
                'A shortage of food',
                'A type of farming tool',
                'A religious ceremony'],
      correct: 0 },

    { format: 'mc',
      q: 'What is "specialization"?',
      options: ['When a person uses a skill for one kind of work',
                'When a group of many people are under one ruler',
                'The way early people write on clay tablets',
                'A flooding river'],
      correct: 0 },

    { format: 'mc',
      q: 'What is a social class?',
      options: ['A group of people with similar customs, background, training, and income',
                'A school for scribes',
                'A type of irrigation canal',
                'A religious holiday'],
      correct: 0 },

    { format: 'mc',
      q: 'How did surpluses help villages survive?',
      options: ['They were stores of food to survive bad seasons',
                'They were used as weapons',
                'They were always given to the gods',
                'They prevented flooding'],
      correct: 0 },

    { format: 'mc',
      q: 'What does the word "Mesopotamia" mean in Greek?',
      options: ['Land between the rivers',
                'Cradle of civilization',
                'City of gods',
                'Fertile Crescent'],
      correct: 0 },

    { format: 'mc',
      q: 'Which two rivers framed Mesopotamia?',
      options: ['The Tigris and the Euphrates',
                'The Nile and the Jordan',
                'The Huang He and the Indus',
                'The Red Sea and the Persian Gulf'],
      correct: 0 },

    { format: 'mc',
      q: 'What is silt?',
      options: ['Fine, fertile soil deposited by rivers',
                'A type of wedge-shaped writing',
                'A building made of mud bricks',
                'A weapon made of bronze'],
      correct: 0 },

    { format: 'mc',
      q: 'What is the Fertile Crescent?',
      options: ['A curving strip of rich farmland from the Mediterranean Sea to the Persian Gulf',
                'A desert in southern Egypt',
                'A mountain range in Turkey',
                'The capital city of the Chaldeans'],
      correct: 0 },

    { format: 'mc',
      q: 'What is irrigation?',
      options: ['Watering crops by bringing water to fields through canals and ditches',
                'Worshiping many gods',
                'Trading grain for metal',
                'A system of writing'],
      correct: 0 },

    { format: 'mc',
      q: 'Why was unpredictable flooding a problem for Mesopotamian farmers?',
      options: ['Farmers could not predict when to plant, and floods could be too big or too small',
                'The floods always came at the same time each year',
                'The floods carried away all the fertile soil',
                'The floods never reached the fields'],
      correct: 0 },

    { format: 'mc',
      q: 'What is a drought?',
      options: ['A period when not enough rain and snow fall',
                'A flooding of the rivers',
                'A type of mud-brick building',
                'A group of traveling merchants'],
      correct: 0 },

    { format: 'mc',
      q: 'Because Mesopotamia lacked stone and wood, what did people use as their main building material?',
      options: ['Mud (for bricks and plaster)', 'Iron', 'Bronze', 'Marble'],
      correct: 0 },

    { format: 'mc',
      q: 'Why was Mesopotamia easy to invade?',
      options: ['It had few mountains or other natural barriers',
                'It had no rivers',
                'Its people had no weapons',
                'It had too many walls'],
      correct: 0 },

    { format: 'mc',
      q: 'How did Mesopotamians get resources like stone, wood, and metal that they lacked?',
      options: ['They traded their surplus grain for them',
                'They mined them locally',
                'They stole them from Egypt',
                'They made them from mud'],
      correct: 0 },

    { format: 'mc',
      q: 'Most historians believe the first civilization arose around 3300 B.C. in what region?',
      options: ['Sumer', 'Egypt', 'Babylon', 'Assyria'],
      correct: 0 },

    { format: 'mc',
      q: 'What is a city-state?',
      options: ['A city and the surrounding land it controls, with its own government',
                'A group of many lands under one ruler',
                'A temple where priests lived',
                'A traveling group of merchants'],
      correct: 0 },

    { format: 'mc',
      q: 'What was a ziggurat?',
      options: ['A large temple that was the center of a Sumerian city',
                'A type of farming tool',
                'A wedge-shaped writing symbol',
                "A king's crown"],
      correct: 0 },

    { format: 'mc',
      q: 'What was the name of the wedge-shaped writing system the Sumerians invented?',
      options: ['Cuneiform', 'Hieroglyphics', 'Pictographs', 'The alphabet'],
      correct: 0 },

    { format: 'mc',
      q: 'What tool did the Sumerians use to press markings into clay tablets?',
      options: ['A stylus (a sharpened reed)', 'An iron dagger', "A potter's wheel", 'A plow'],
      correct: 0 },

    { format: 'mc',
      q: 'Who were scribes in Sumerian society?',
      options: ['Professional record keepers who could read and write',
                'Soldiers who fought in wars',
                'Farmers who grew surplus grain',
                'Priests who ran the ziggurat'],
      correct: 0 },

    { format: 'mc',
      q: 'What is polytheism?',
      options: ['The belief in many gods',
                'The belief in one god',
                'The worship of kings',
                'The study of the stars'],
      correct: 0 },

    { format: 'mc',
      q: 'Which of these inventions are the Sumerians believed to have created?',
      options: ['The wheel, the plow, and the sailboat',
                'The printing press and gunpowder',
                'Iron weapons and the battering ram',
                'The calendar with a seven-day week'],
      correct: 0 },

    { format: 'mc',
      q: 'In Sumerian society, who were at the top of the social classes?',
      options: ['Kings and priests',
                'Farmers and artisans',
                'Slaves and merchants',
                'Soldiers and scribes'],
      correct: 0 },

    { format: 'mc',
      q: 'What is an empire?',
      options: ['A group of many different lands under one ruler',
                'A single city and its farmland',
                'A temple for worship',
                'A type of clay tablet'],
      correct: 0 },

    { format: 'mc',
      q: "Around 2340 B.C., who conquered Mesopotamia to create the world's first empire?",
      options: ['Sargon of Akkad', 'Hammurabi', 'Nebuchadnezzar', 'Gilgamesh'],
      correct: 0 },

    { format: 'mc',
      q: 'King Hammurabi of Babylon is best known for what?',
      options: ['His code, or collection of laws',
                'Building the Hanging Gardens',
                'Inventing cuneiform',
                'Defeating the Assyrians'],
      correct: 0 },

    { format: 'mc',
      q: "About how many laws were in Hammurabi's Code?",
      options: ['282', '60', '100', '600'],
      correct: 0 },

    { format: 'mc',
      q: 'What made the Assyrian army so strong?',
      options: ['They were the first large army to use iron weapons',
                'They used elephants in battle',
                'They never lost a single soldier',
                'They fought only at night'],
      correct: 0 },

    { format: 'mc',
      q: 'The Chaldeans built which famous landmark, considered one of the Seven Wonders of the Ancient World?',
      options: ['The Hanging Gardens of Babylon',
                'The Great Pyramid',
                'The Walls of Uruk',
                'The Ishtar Gate'],
      correct: 0 },

    { format: 'mc',
      q: 'What important scientific advancement did the Chaldeans develop?',
      options: ['The first calendar with a seven-day week',
                'The wheel',
                'Iron weapons',
                "The potter's wheel"],
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

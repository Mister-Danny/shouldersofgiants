/**
 * sog-learning-check.js — Learning Check popup (Stage 2 of the focus system)
 *
 * The REFILL side of focus: the player answers a history question to restore
 * focus. Opened from the book icon under the HUD focus bar; at 0 focus the
 * overworld's gate (overworld.js _showFocusGate) blocks node/exit actions and
 * points the player here via the same icon.
 *
 *   • One question at a time, picked RANDOMLY from the current map's pool
 *     (data/questions.js mapPools; repeats OK in v1).
 *   • Two formats: 'mc' (3-4 options) and 'tf' (True/False).
 *   • CORRECT  → "Correct!", restore +RESTORE_AMOUNT focus (capped at 100 by
 *                SOG.focus.restore), then choose: Next Question or Done.
 *   • WRONG    → "Not quite!", the correct answer lit green, NO penalty, then a
 *                fresh random question to retry.
 *                The player can never get stuck.
 *
 * Visuals reuse the shared parchment/SNES popup (.card-popup .rules-popup) so it
 * matches the boss-rules / card-detail popups. UI strings live in the editable
 * constants below; the questions live in data/questions.js.
 *
 * Public API (SOG.LearningCheck): open(), close(), isOpen(), getSnapshot(),
 * applySnapshot() — the last two plug into js/save-state.js (see MODULES
 * there) so the roster's "Learning Checks" column (js/teacher-dashboard.js,
 * AUTH_SPEC.md §6) has something to read from the player doc.
 *
 * Tracking is two running counters ONLY — correct and total answered — never
 * which questions, never which were missed. See the AUTH_SPEC.md §6 note on
 * this: aggregate counts only, same "no assessment-level detail" line as the
 * rest of the roster's coarse metrics.
 */
window.SOG = window.SOG || {};
SOG.LearningCheck = (function () {
  'use strict';

  /* ── Tunables ───────────────────────────────────────────────────────────── */
  var RESTORE_AMOUNT = 50;   // focus granted per correct answer (clamped to MAX)
  var WRONG_REVEAL_MS = 2200; // after a miss: how long the correct answer stays lit before the next question

  /* ── Aggregate stats (correct / total answered) ───────────────────────────
     Deliberately just two counters — no question IDs, no timestamps, no
     right/wrong-per-question log. Persisted to localStorage on every answer
     (cheap, local-only) and folded into the Firestore checkpoint write via
     getSnapshot() below, same as every other SaveState module. */
  var STATS_KEY = 'sog_learning_check_stats';
  var _stats = { correct: 0, total: 0 };

  function _loadStats() {
    try {
      var raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        _stats.correct = parsed.correct || 0;
        _stats.total   = parsed.total   || 0;
      }
    } catch (e) {}
  }

  function _saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(_stats)); } catch (e) {}
  }

  function _recordAnswer(isCorrect) {
    _stats.total += 1;
    if (isCorrect) _stats.correct += 1;
    _saveStats();
  }

  _loadStats();

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
    tfFalse:      'False'
  };

  /* ── Question pool ──────────────────────────────────────────────────────────
     The bank lives in data/questions.js (window.SOG_QUESTION_DATA), loaded by
     its own script tag before this file. Each entry:
       region  : pool key ('ancient', 'egypt', 'kush', …)
       format  : 'mc' | 'tf'
       q       : the question text
       options : array of answer strings (tf is auto-filled True/False)
       correct : index into `options` of the right answer
       difficulty (optional 1/2/3) — stored, not used by selection yet
     Answer order is SHUFFLED at render time, so the correct option never sits in
     a fixed on-screen position (the bank lists the correct answer first). The
     'tf' rendering path in _buildAnswers is kept so True/False can be re-added.

     GATING: a check draws from the pool(s) the data file's `mapPools` assigns to
     the overworld map the player is on. A map with no entry — or whose pools are
     all empty — falls back to the whole bank. */
  function _bank() {
    var d = window.SOG_QUESTION_DATA;
    return (d && Array.isArray(d.questions)) ? d.questions : [];
  }

  // The map the player is on: the live overworld value, else the saved one.
  function _currentMapId() {
    if (window.Overworld && typeof window.Overworld.getCurrentMapId === 'function') {
      var live = window.Overworld.getCurrentMapId();
      if (live) return live;
    }
    try { return localStorage.getItem('sog_overworld_map') || null; } catch (e) { return null; }
  }

  // The questions a check on `mapId` may draw.
  function _poolFor(mapId) {
    var d = window.SOG_QUESTION_DATA || {};
    var bank = _bank();
    var regions = (d.mapPools && mapId && d.mapPools[mapId]) || null;
    if (regions && regions.length) {
      var pool = bank.filter(function (qd) { return regions.indexOf(qd.region) !== -1; });
      if (pool.length) return pool;
    }
    return bank;   // fallback 'all' — unassigned map, or its pools are still empty
  }

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
    var pool = _poolFor(_currentMapId());
    return pool[Math.floor(Math.random() * pool.length)];
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
      if (ans.correct) btn.dataset.correct = 'true';   // lets a miss reveal the right answer
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

    _recordAnswer(isCorrect);

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
      // WRONG — no penalty. Mark the miss, light the correct answer so the player
      // sees it, then auto-advance to a fresh question.
      btn.classList.add('lc-option-wrong');
      var rightBtn = optsWrap.querySelector('.lc-option[data-correct="true"]');
      if (rightBtn) rightBtn.classList.add('lc-option-correct');
      if (typeof SFX !== 'undefined' && typeof SFX.learnWrong === 'function') SFX.learnWrong();
      feedback.innerHTML =
        '<div class="lc-result lc-result-wrong">' + STR.wrong + '</div>' +
        '<div class="lc-result-sub">' + STR.wrongSub + '</div>';
      setTimeout(function () { if (isOpen()) _renderQuestion(); }, WRONG_REVEAL_MS);
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

  /* ── Snapshot (save-state.js) ───────────────────────────────────────────── */
  function getSnapshot() {
    return { correct: _stats.correct, total: _stats.total };
  }

  function applySnapshot(snap) {
    if (!snap) return;
    _stats.correct = snap.correct || 0;
    _stats.total   = snap.total   || 0;
    _saveStats();
  }

  return {
    open: open, close: close, isOpen: isOpen,
    getSnapshot: getSnapshot, applySnapshot: applySnapshot,
    poolFor: _poolFor   // the questions a check on a given map id may draw
  };
})();

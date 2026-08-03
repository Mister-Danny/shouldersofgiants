/**
 * account-ui.js — Student account flow UI (AUTH_SPEC.md Phase 3)
 *
 * Drives the #account-flow-backdrop modal (markup in index.html) through its
 * steps, calling into window.SogAccount (js/account.js, pure logic/Firebase,
 * no DOM) for every actual signup/login/checkpoint operation. Two entry
 * points wire into this:
 *   - The home screen "Create Account / Login" / "Logout" button (js/home.js)
 *   - The post-Otzi CREATE ACCOUNT modal's YES button (js/overworld.js),
 *     which jumps straight to the class-code step (skipping the chooser —
 *     the player already said yes to creating an account).
 *
 * Signup failure fallback (AUTH_SPEC.md §4): a genuine rate-limit or network
 * error lands on the "saved locally" step rather than blocking — the game
 * keeps working from localStorage either way. Any OTHER error is logged and
 * shown as an actual error instead of being silently absorbed into that same
 * message, so a real bug (bad rules, a Firestore outage, etc.) is visible
 * instead of looking identical to "you're offline, try later".
 */
window.SogAccountUI = (function () {
  'use strict';

  var backdrop, titleEl, bodyEl, actionsEl;
  var _pendingClassInfo = null;   // set once class-code lookup succeeds, used by the confirm step

  function _els() {
    if (!backdrop) {
      backdrop  = document.getElementById('account-flow-backdrop');
      titleEl   = document.getElementById('account-flow-title');
      bodyEl    = document.getElementById('account-flow-body');
      actionsEl = document.getElementById('account-flow-actions');
    }
    return !!(backdrop && titleEl && bodyEl && actionsEl);
  }

  function _render(title, bodyHtml, actionsHtml) {
    if (!_els()) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    actionsEl.innerHTML = actionsHtml;
    backdrop.classList.add('visible');
  }

  function _close() {
    if (backdrop) backdrop.classList.remove('visible');
  }

  function _byId(id) { return document.getElementById(id); }

  /* ── Step: chooser ─────────────────────────────────────────────────── */
  function _stepChooser() {
    _render(
      'ACCOUNT',
      '<p>Create an account to save your progress permanently, or log back in if you already have one.</p>',
      '<button class="btn-snes" id="af-create">CREATE ACCOUNT</button>' +
      '<button class="btn-snes" id="af-login">LOG IN</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    _byId('af-create').addEventListener('click', function () { _stepClassCode(); });
    _byId('af-login').addEventListener('click', function () { _stepLoginForm(); });
    _byId('af-cancel').addEventListener('click', _close);
  }

  /* ── Step: class code entry (student signup step 1) ──────────────────── */
  function _stepClassCode(errorMsg) {
    _render(
      'JOIN A CLASS',
      '<p>Enter your class code, or leave it blank to play without a class.</p>' +
      '<input type="text" id="af-classcode" class="account-flow-input" maxlength="6" ' +
        'placeholder="CLASS CODE (OPTIONAL)" autocomplete="off" spellcheck="false">' +
      (errorMsg ? '<div class="account-flow-error">' + errorMsg + '</div>' : ''),
      '<button class="btn-snes" id="af-continue">CONTINUE</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    var input = _byId('af-classcode');
    input.focus();
    _byId('af-continue').addEventListener('click', function () { _submitClassCode(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _submitClassCode(input.value);
    });
    _byId('af-cancel').addEventListener('click', _close);
  }

  function _submitClassCode(raw) {
    _render('ONE MOMENT', '<p>Checking class code…</p>', '');
    window.SogAccount.lookupClassCode(raw, function (err, classInfo) {
      if (err) {
        _stepClassCode('Class code not found. Check with your teacher and try again.');
        return;
      }
      _pendingClassInfo = classInfo;
      if (classInfo.ungrouped) {
        _stepSummon();   // no class to confirm — straight to account creation
      } else {
        _stepConfirmClass();
      }
    });
  }

  /* ── Step: confirm class (student signup step 2-3) ───────────────────── */
  function _stepConfirmClass() {
    _render(
      'CONFIRM',
      '<p>Joining: <strong>' + _escapeHtml(_pendingClassInfo.label) + '</strong></p>' +
      '<p>Not your class? Go back and check the code with your teacher.</p>',
      '<button class="btn-snes" id="af-confirm">CONFIRM</button>' +
      '<button class="btn-snes btn-snes-close" id="af-back">BACK</button>'
    );
    _byId('af-confirm').addEventListener('click', _stepSummon);
    _byId('af-back').addEventListener('click', function () { _stepClassCode(); });
  }

  /* ── Step: summon (student signup steps 3-6) ───────────────────────────
     Replaces the old immediate "Creating your account…" spinner with an
     interactive reveal: a big button that "conjures" 5 username options,
     the student picks one, then the account is actually created. Per spec,
     ALL 5 options and the passphrase are generated up front — the moment
     this step renders, well before the click — so the animation is pure
     presentation and can never leave the student without credentials, even
     if something interrupts it. */
  function _stepSummon() {
    _render(
      'CREATE ACCOUNT',
      '<p>You are about to receive your official Shoulders of Giants name and passcode. ' +
        'It belongs to you and only you. Cherish it.</p>' +
      '<div class="account-credential-card account-summon-box" id="account-summon-box">' +
        '<button class="account-summon-btn" id="af-summon">SUMMON YOUR HISTORICAL JOURNEY</button>' +
      '</div>',
      ''
    );

    // Generated NOW, before any click — see doc comment above.
    var passphrase = window.SogAccount.generatePassphrase();
    var options    = window.SogAccount.generateUsernameOptions(5);

    var boxEl = _byId('account-summon-box');
    var btnEl = _byId('af-summon');
    btnEl.addEventListener('click', function () {
      btnEl.disabled = true;
      _playConjuringAnimation(boxEl, btnEl, function () {
        _renderUsernameOptions(options, passphrase);
      });
    });
  }

  // 4s GSAP "conjuring" flourish, timed to js/audio.js SFX.magicSwirl()'s 4s
  // clip: the button's label dissolves into "Conjuring…" while particles
  // swirl around the box, then particles + label fade out together over the
  // final 500ms (matching the audio's own tail fade) before onComplete
  // fires. The audio is fire-and-forget — this visual timeline runs on its
  // own clock regardless of whether the sound loads or plays, so a missing/
  // failed asset never affects timing.
  function _playConjuringAnimation(boxEl, btnEl, onComplete) {
    var DURATION_MS = 4000;
    var FADE_MS     = 500;
    var SWIRL_MS    = DURATION_MS - FADE_MS;
    var PARTICLE_COUNT = 16;

    // White "payoff" flash: overlaps the last part of the content fade-out
    // below so it reads as the conjuring's climax, not a separate beat —
    // by the time the particles/button fully fade at DURATION_MS, the
    // screen is ALSO fully white at that same instant. The name-options DOM
    // swap happens while the flash is opaque, then the flash fades back down
    // to reveal it.
    var flashEl          = _byId('account-flow-flash');
    var FLASH_IN_START_MS = SWIRL_MS + 200;
    var FLASH_IN_MS       = DURATION_MS - FLASH_IN_START_MS;
    var FLASH_OUT_MS      = 300;
    if (flashEl) gsap.set(flashEl, { opacity: 0 });

    if (window.SFX && typeof SFX.magicSwirl === 'function') {
      try { SFX.magicSwirl(); } catch (e) {}
    }

    gsap.to(btnEl, {
      opacity: 0, duration: 0.2, onComplete: function () {
        btnEl.textContent = 'Conjuring…';
        gsap.to(btnEl, { opacity: 1, duration: 0.2 });
      }
    });

    var particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var p = document.createElement('span');
      p.className = 'account-summon-particle';
      boxEl.appendChild(p);
      particles.push(p);
    }

    particles.forEach(function (p) {
      var radius     = 20 + Math.random() * 55;
      var angleStart = Math.random() * Math.PI * 2;
      var spin       = (Math.random() < 0.5 ? -1 : 1) * (Math.PI * 2 + Math.random() * Math.PI * 2);
      var steps      = 10;

      gsap.set(p, { x: 0, y: 0, opacity: 0, scale: 0.5 + Math.random() * 0.6 });
      var tl = gsap.timeline({ delay: Math.random() * 0.3 });
      tl.to(p, { opacity: 1, duration: 0.3 });
      for (var s = 1; s <= steps; s++) {
        var t = s / steps;
        var angle = angleStart + spin * t;
        var r = radius * (1 - t * 0.3);   // gentle inward spiral
        tl.to(p, {
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          duration: (SWIRL_MS / 1000 - 0.3) / steps,
          ease: 'sine.inOut'
        });
      }
      // No per-particle fade here — the synced group fade below (matching
      // the audio's own tail fade) handles it for every particle at once.
    });

    gsap.delayedCall(SWIRL_MS / 1000, function () {
      gsap.to(particles.concat(btnEl), { opacity: 0, duration: FADE_MS / 1000, ease: 'sine.in' });
    });

    if (flashEl) {
      gsap.delayedCall(FLASH_IN_START_MS / 1000, function () {
        gsap.to(flashEl, { opacity: 1, duration: FLASH_IN_MS / 1000, ease: 'sine.in' });
      });
    }

    gsap.delayedCall(DURATION_MS / 1000, function () {
      particles.forEach(function (p) { p.remove(); });
      onComplete();   // swaps in the name-options DOM while the flash is fully opaque
      if (flashEl) gsap.to(flashEl, { opacity: 0, duration: FLASH_OUT_MS / 1000, ease: 'sine.out' });
    });
  }

  // Reveals the 5 pre-generated username options as their own step (fresh
  // heading, no body copy) — picking one moves straight to actually
  // creating the account.
  function _renderUsernameOptions(options, passphrase) {
    _render(
      'Choose Your History Giant Name:',
      '<div class="account-credential-card account-summon-box account-summon-box-options" id="account-summon-box"></div>',
      ''
    );
    var boxEl = _byId('account-summon-box');
    // opt.display is CamelCase, shown here ONLY — opt.username (the
    // all-lowercase real credential) is what actually gets passed on.
    boxEl.innerHTML = options.map(function (opt, idx) {
      return '<button class="btn-snes account-summon-option" data-idx="' + idx + '">' +
        _escapeHtml(opt.display) + '</button>';
    }).join('');
    Array.prototype.forEach.call(boxEl.querySelectorAll('.account-summon-option'), function (optBtn) {
      optBtn.addEventListener('click', function () {
        var idx = parseInt(optBtn.getAttribute('data-idx'), 10);
        _stepFinalizeSignup(options[idx].username, passphrase);
      });
    });
  }

  /* ── Step: finalizing the account (student signup steps 4-6) ─────────
     The student has already picked a username and a passphrase exists —
     this is the actual Firebase work (linkWithCredential + /players write). */
  function _stepFinalizeSignup(username, passphrase) {
    _render('ONE MOMENT', '<p>Creating your account…</p>', '');
    window.SogAccount.signUpStudent(_pendingClassInfo, username, passphrase, function (err, creds) {
      if (err) {
        console.error('[AccountUI] Signup failed', err);
        if (creds) {
          // Auth account is real (link succeeded, or an already-linked retry)
          // even though something else failed — never discard the student's
          // only way back in by falling through to the generic fallback.
          _stepCredentialCard(creds);
          return;
        }
        if (_isRetryableSignupError(err)) {
          _stepSavedLocally();
        } else {
          _stepSignupError();
        }
        return;
      }
      _stepCredentialCard(creds);
    });
  }

  // Only genuine rate-limit/network conditions get the reassuring "try again
  // later" message (AUTH_SPEC.md §4) — everything else (bad rules, a typo'd
  // Firestore path, etc.) should surface as a visible error instead of being
  // swallowed into that same message.
  function _isRetryableSignupError(err) {
    var code = err && err.code;
    return code === 'auth/network-request-failed' ||
      code === 'auth/too-many-requests' ||
      code === 'unavailable' ||          // Firestore SDK's offline/unreachable code
      code === 'deadline-exceeded';
  }

  /* ── Step: credential card (student signup step 7) ───────────────────
     Big, printable, no-recovery warning. DONE stays disabled until the
     checkbox is checked — the required confirmation before it can be
     dismissed. */
  function _stepCredentialCard(creds) {
    // No passphrase means this is the alreadyLinked retry case (js/account.js
    // _tryLink): the account already existed from an earlier attempt whose
    // passphrase was never persisted anywhere and can't be shown again.
    if (!creds.passphrase) {
      _render(
        'ACCOUNT ALREADY CREATED',
        '<p>An account named <strong>' + _escapeHtml(creds.username) + '</strong> already exists on ' +
          'this device from an earlier attempt. Your passphrase can\'t be shown again — if you never ' +
          'wrote it down, ask your teacher for help logging in later. Your progress is safe either way.</p>',
        '<button class="btn-snes" id="af-done">OK</button>'
      );
      _byId('af-done').addEventListener('click', function () {
        _close();
        location.reload();
      });
      return;
    }

    _render(
      'Save Your Information',
      '<p>You will only see this once! Write it down, take a screenshot, or save the PDF. ' +
        'This is the only way to get back into your account.</p>' +
      '<div class="account-credential-card" id="account-credential-card">' +
        '<div class="account-credential-row"><span>Username</span><strong>' + _escapeHtml(creds.username) + '</strong></div>' +
        '<div class="account-credential-row"><span>Passphrase</span><strong>' + _escapeHtml(creds.passphrase) + '</strong></div>' +
      '</div>' +
      '<p class="account-flow-warning">Seriously, there is no password reset and no recovery email. ' +
        'If this is lost, your progress cannot be recovered.</p>' +
      '<label class="account-flow-checkbox-row">' +
        '<input type="checkbox" id="af-ack"> I have written down or saved my username and passphrase.' +
      '</label>',
      '<button class="btn-snes" id="af-print">SAVE PDF</button>' +
      '<button class="btn-snes" id="af-done" disabled>DONE</button>'
    );
    var ack = _byId('af-ack');
    var doneBtn = _byId('af-done');
    ack.addEventListener('change', function () { doneBtn.disabled = !ack.checked; });
    _byId('af-print').addEventListener('click', function () { window.print(); });
    doneBtn.addEventListener('click', function () {
      _close();
      location.reload();   // refresh home button label / corner strip against the new auth state
    });
  }

  /* ── Step: login form ─────────────────────────────────────────────────── */
  function _stepLoginForm(errorMsg) {
    _render(
      'LOG IN',
      '<input type="text" id="af-login-username" class="account-flow-input" ' +
        'placeholder="USERNAME" autocomplete="off" spellcheck="false">' +
      '<input type="text" id="af-login-passphrase" class="account-flow-input" ' +
        'placeholder="PASSPHRASE" autocomplete="off" spellcheck="false">' +
      (errorMsg ? '<div class="account-flow-error">' + errorMsg + '</div>' : ''),
      '<button class="btn-snes" id="af-login-submit">LOG IN</button>' +
      '<button class="btn-snes btn-snes-close" id="af-back">BACK</button>'
    );
    var userInput = _byId('af-login-username');
    var passInput = _byId('af-login-passphrase');
    userInput.focus();
    function submit() { _submitLogin(userInput.value, passInput.value); }
    _byId('af-login-submit').addEventListener('click', submit);
    passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    _byId('af-back').addEventListener('click', _stepChooser);
  }

  function _submitLogin(username, passphrase) {
    if (!username || !passphrase) {
      _stepLoginForm('Enter both your username and passphrase.');
      return;
    }
    _render('ONE MOMENT', '<p>Logging in…</p>', '');
    window.SogAccount.loginStudent(username, passphrase, function (err, user) {
      if (err) {
        _stepLoginForm('Username or passphrase not recognized. Check with your teacher.');
        return;
      }
      _stepWelcomeBack();
    });
  }

  function _stepWelcomeBack() {
    _render(
      'WELCOME BACK',
      '<p>You’re logged in and your saved progress has been restored.</p>',
      '<button class="btn-snes" id="af-ok">OK</button>'
    );
    _byId('af-ok').addEventListener('click', function () {
      _close();
      location.reload();
    });
  }

  /* ── Step: signup failure fallback (AUTH_SPEC.md §4) ─────────────────── */
  function _stepSavedLocally() {
    _render(
      'SAVED ON THIS DEVICE',
      '<p>Cloud save is unavailable right now (busy network, or too many sign-ups at once). ' +
        'Your progress is safe on this device — you can try creating an account again later ' +
        'from the home screen.</p>',
      '<button class="btn-snes" id="af-ok">OK</button>'
    );
    _byId('af-ok').addEventListener('click', _close);
  }

  /* ── Step: signup failure, non-network (unexpected error) ─────────────
     Distinct from _stepSavedLocally above: this is for errors that AREN'T a
     rate-limit/network condition (see _isRetryableSignupError), so it's
     honest about something having actually gone wrong rather than implying
     "just try again later" for what might be a real bug. Progress is still
     safe on this device either way. */
  function _stepSignupError() {
    _render(
      'ACCOUNT CREATION FAILED',
      '<p>Something went wrong creating your account. Your progress is safe on this device. ' +
        'Please tell your teacher what happened, or try again.</p>',
      '<button class="btn-snes" id="af-retry">TRY AGAIN</button>' +
      '<button class="btn-snes btn-snes-close" id="af-ok">OK</button>'
    );
    _byId('af-retry').addEventListener('click', _stepCreating);
    _byId('af-ok').addEventListener('click', _close);
  }

  /* ── Logout ───────────────────────────────────────────────────────────── */
  function _startLogout() {
    _render('LOGGING OUT', '<p>Saving your progress…</p>', '');
    window.SogAccount.logout();   // checkpoint-saves, clears local state, signs out, reloads
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * @param {string} [startStep] 'chooser' (default) or 'classcode' — the
   *   post-Otzi CREATE ACCOUNT modal's YES button jumps straight to
   *   'classcode', skipping the redundant chooser.
   */
  function openFlow(startStep) {
    _pendingClassInfo = null;
    if (startStep === 'classcode') _stepClassCode();
    else _stepChooser();
  }

  return {
    openFlow: openFlow,
    logout:   _startLogout
  };
})();

/**
 * account-ui.js — Student + teacher account flow UI
 * (AUTH_SPEC.md Phase 3 students, Phase 4 teachers)
 *
 * Drives the #account-flow-backdrop modal (markup in index.html) through its
 * steps, calling into window.SogAccount (js/account.js, pure logic/Firebase,
 * no DOM) for every actual signup/login/checkpoint operation. Two entry
 * points wire into this:
 *   - The home screen "Create Account / Login" / "Logout" button (js/home.js)
 *   - The post-Otzi CREATE ACCOUNT modal's YES button (js/overworld.js),
 *     which jumps straight to the class-code step (skipping the chooser —
 *     the player already said yes to creating an account).
 * The chooser's "TEACHER SIGN UP" button branches into a separate real-
 * email/password form (see the Teacher signup section below) — no
 * generated credentials, no printable card, no dashboard (Phase 5).
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
      '<button class="btn-snes" id="af-teacher">TEACHER: GET A CLASS LINK</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    _byId('af-create').addEventListener('click', function () { _stepClassCode(); });
    _byId('af-login').addEventListener('click', function () { _stepLoginForm(); });
    _byId('af-teacher').addEventListener('click', function () { openTeacherSignup(); });
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
      if (!classInfo.ungrouped && window.TeacherOnboard) window.TeacherOnboard.markStudentDevice();
      _stepJoinPickName(false);
    });
  }

  /* ── Step: welcome + summon (student signup steps 2-3) ───────────────────
     A short welcome, then the big SUMMON button: a 4s "conjuring" flourish
     reveals five generated names, and one tap creates the account
     (js/account.js signUpStudent, upgrading the guest in place). The names
     and passphrase are generated as this step renders, before any click, so
     the animation is pure presentation and can never leave the student
     without credentials. fromLink: arrived from a class link / the Join a
     class popup rather than the account menu, so the escape hatch is "play
     as a guest" rather than BACK. */
  function _joinTitle(info) {
    if (!info || info.ungrouped) return 'CREATE YOUR ACCOUNT';
    return 'JOIN YOUR CLASS';
  }
  function _onHomeScreen() {
    var home = document.getElementById('screen-home');
    return !!(home && home.classList.contains('active'));
  }
  function _stepJoinPickName(fromLink) {
    var info = _pendingClassInfo || { ungrouped: true };
    var passphrase = window.SogAccount.generatePassphrase();
    var options    = window.SogAccount.generateUsernameOptions(5);
    var welcome    = _onHomeScreen();   // mid-game signups (post-Ötzi) skip the welcome copy
    _render(
      welcome ? 'Welcome to Shoulders of Giants' : _joinTitle(info),
      (welcome
        ? '<p>You’re about to start battling the Giants of Ancient History as you go on a journey through the past.</p>' +
          '<p>But first, you need a Giant name.</p>'
        : '<p>First, you need a Giant name.</p>') +
      '<div class="account-credential-card account-summon-box" id="account-summon-box">' +
        '<button class="account-summon-btn" id="af-summon">SUMMON YOUR HISTORICAL JOURNEY</button>' +
      '</div>',
      fromLink
        ? '<button class="btn-snes btn-snes-close" id="af-back">PLAY AS A GUEST</button>'
        : '<button class="btn-snes btn-snes-close" id="af-back">BACK</button>'
    );
    var boxEl = _byId('account-summon-box');
    var btnEl = _byId('af-summon');
    var backEl = _byId('af-back');
    btnEl.addEventListener('click', function () {
      btnEl.disabled = true;
      backEl.style.visibility = 'hidden';   // no bailing out mid-conjure
      _playConjuringAnimation(boxEl, btnEl, function () {
        _renderUsernameOptions(options, passphrase);
      });
    });
    backEl.addEventListener('click', function () {
      if (fromLink) _close(); else _stepClassCode();
    });
  }

  // 4s GSAP "conjuring" flourish, timed to js/audio.js SFX.magicSwirl()'s 4s
  // clip: the button's label dissolves into "Conjuring…" while particles
  // swirl around the box, then particles + label fade out together over the
  // final 500ms (matching the audio's own tail fade) before onComplete
  // fires. The audio is fire-and-forget — this visual timeline runs on its
  // own clock regardless of whether the sound loads or plays.
  function _playConjuringAnimation(boxEl, btnEl, onComplete) {
    var DURATION_MS = 4000;
    var FADE_MS     = 500;
    var SWIRL_MS    = DURATION_MS - FADE_MS;
    var PARTICLE_COUNT = 16;

    // White "payoff" flash: fully white at the same instant the particles
    // finish fading; the name options swap in under it, then it fades away.
    var flashEl           = _byId('account-flow-flash');
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
      onComplete();   // swaps in the name options while the flash is fully opaque
      if (flashEl) gsap.to(flashEl, { opacity: 0, duration: FLASH_OUT_MS / 1000, ease: 'sine.out' });
    });
  }

  // The five pre-generated names as their own step; picking one creates the
  // account. opt.display is CamelCase, shown here only — opt.username (the
  // all-lowercase real credential) is what gets passed on.
  function _renderUsernameOptions(options, passphrase) {
    _render(
      'Choose Your Giant Name',
      '<div class="account-credential-card account-summon-box account-summon-box-options" id="account-summon-box">' +
        options.map(function (opt, idx) {
          return '<button class="btn-snes account-summon-option" data-idx="' + idx + '">' + _escapeHtml(opt.display) + '</button>';
        }).join('') +
      '</div>',
      ''
    );
    Array.prototype.forEach.call(document.querySelectorAll('#account-summon-box .account-summon-option'), function (optBtn) {
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
          _afterStudentSignup(creds);
          return;
        }
        if (_isRetryableSignupError(err)) {
          _stepSavedLocally();
        } else {
          _stepSignupError();
        }
        return;
      }
      _afterStudentSignup(creds);
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

  /* ── After student signup: the login card ──────────────────────────────
     Username and password, big, with SAVE PDF (prints just this card, see
     the @media print rule for #account-credential-card). DONE stays disabled
     until the student ticks that they saved it. DONE closes the popup:
     a student who joined from the home screen is left on it ("Are you ready
     to make history?" → I'M READY); one signing up mid-game (the post-Ötzi
     prompt) carries on where they were. My login (Options / the account
     popup) brings the card back any time, and the teacher's roster has it.
     No page reload — SogAuth.refresh() (called by signUpStudent) already
     updated the corner links. */
  function _afterStudentSignup(creds) {
    var info = _pendingClassInfo || {};
    if (!info.ungrouped && info.code && window.Analytics && typeof window.Analytics.funnel === 'function') {
      window.Analytics.funnel('student_joined_class', { classCode: info.code, teacherUid: info.ownerUid || '' });
    }
    if (!creds.passphrase) {
      // The alreadyLinked retry (js/account.js _tryLink): the account existed
      // from an earlier attempt whose passphrase was never captured.
      _render(
        'ACCOUNT ALREADY CREATED',
        '<p>An account named <strong>' + _escapeHtml(creds.username) + '</strong> already exists on ' +
          'this device from an earlier attempt. Your teacher can look up your password on their roster. ' +
          'Your progress is safe either way.</p>',
        '<button class="btn-snes" id="af-done">OK</button>'
      );
      _byId('af-done').addEventListener('click', _close);
      return;
    }
    _render(
      'Save Your Information',
      '<p>Write it down, take a screenshot, or save the PDF. You’ll need it to log in on another computer.</p>' +
      '<div class="account-credential-card" id="account-credential-card">' +
        '<div class="account-credential-row"><span>Username</span><strong>' + _escapeHtml(creds.username) + '</strong></div>' +
        '<div class="account-credential-row"><span>Password</span><strong>' + _escapeHtml(creds.passphrase) + '</strong></div>' +
      '</div>' +
      (info.ungrouped ? '' : '<p class="account-flow-or">Your teacher has it too.</p>') +
      '<label class="account-flow-checkbox-row">' +
        '<input type="checkbox" id="af-ack"> I have written down or saved my username and password.' +
      '</label>',
      '<button class="btn-snes" id="af-print">SAVE PDF</button>' +
      '<button class="btn-snes" id="af-done" disabled>DONE</button>'
    );
    var ack = _byId('af-ack');
    var doneBtn = _byId('af-done');
    ack.addEventListener('change', function () { doneBtn.disabled = !ack.checked; });
    _byId('af-print').addEventListener('click', function () { window.print(); });
    doneBtn.addEventListener('click', _close);
  }

  /* ── Step: login form ─────────────────────────────────────────────────
     Serves both audiences from one form: students (username + passphrase)
     and teachers (email + password). _submitLogin below branches purely on
     whether the identifier contains "@" — students' generated usernames
     never do (see js/account.js _formatUsername), so this is an
     unambiguous signal with no extra UI needed to pick a mode.
     infoMsg is a separate, non-error slot for "Forgot password?" outcomes
     (reset sent / student-has-no-recovery) so it doesn't get mistaken for
     a login failure. prefillIdentifier keeps whatever was typed across a
     re-render (wrong password, forgot-password click, etc.). */
  function _stepLoginForm(errorMsg, infoMsg, prefillIdentifier, prefillSecret) {
    _render(
      'LOG IN',
      '<p><u>Students</u>: enter your username and password.<br><u>Teachers</u>: enter your email and password.</p>' +
      '<input type="text" id="af-login-username" class="account-flow-input" ' +
        'placeholder="USERNAME OR EMAIL" autocomplete="username" spellcheck="false" value="' +
        _escapeHtml(prefillIdentifier || '') + '">' +
      '<input type="password" id="af-login-passphrase" class="account-flow-input" ' +
        'placeholder="PASSWORD" autocomplete="current-password" value="' + _escapeHtml(prefillSecret || '') + '">' +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : '') +
      (infoMsg  ? '<div class="account-flow-info">'  + _escapeHtml(infoMsg)  + '</div>' : '') +
      '<div class="account-flow-forgot"><a href="#" id="af-forgot">Forgot password?</a></div>',
      '<button class="btn-snes" id="af-login-submit">LOG IN</button>' +
      '<button class="btn-snes" id="af-login-google">CONTINUE WITH GOOGLE</button>' +
      '<button class="btn-snes btn-snes-close" id="af-back">CANCEL</button>'
    );
    _byId('af-login-google').addEventListener('click', _submitTeacherGoogle);
    var userInput = _byId('af-login-username');
    var passInput = _byId('af-login-passphrase');
    (prefillSecret ? _byId('af-login-submit') : userInput).focus();
    function submit() { _submitLogin(userInput.value, passInput.value); }
    _byId('af-login-submit').addEventListener('click', submit);
    passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    _byId('af-back').addEventListener('click', _close);
    _byId('af-forgot').addEventListener('click', function (e) {
      e.preventDefault();
      _handleForgotPassword(userInput.value);
    });
  }

  function _submitLogin(identifier, secret) {
    identifier = (identifier || '').trim();
    if (!identifier || !secret) {
      _stepLoginForm('Enter both fields.', null, identifier);
      return;
    }
    var isTeacher = identifier.indexOf('@') !== -1;
    _render('ONE MOMENT', '<p>Logging in…</p>', '');
    if (isTeacher) {
      window.SogAccount.loginTeacher(identifier, secret, function (err) {
        if (err) {
          console.error('[AccountUI] Teacher login failed', err);
          _stepLoginForm(_teacherLoginErrorMessage(err), null, identifier);
          return;
        }
        _stepWelcomeBack(true);
      });
    } else {
      window.SogAccount.loginStudent(identifier, secret, function (err) {
        if (err) {
          _stepLoginForm('Username or password not recognized. Check with your teacher.', null, identifier);
          return;
        }
        if (window.TeacherOnboard) window.TeacherOnboard.markStudentDevice();
        _stepWelcomeBack(false);
      });
    }
  }

  function _teacherLoginErrorMessage(err) {
    var code = err && err.code;
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Email or password not recognized.';
    }
    if (code === 'auth/invalid-email')      return 'Enter a valid email address.';
    if (code === 'auth/too-many-requests')  return 'Too many attempts — please wait a moment and try again.';
    if (code === 'auth/network-request-failed') return 'Network issue — please try again.';
    return 'Something went wrong logging in. Please try again.';
  }

  /* ── Forgot password (teachers only) ───────────────────────────────────
     A student's generated username never contains "@" — that's the same
     signal _submitLogin uses, so this needs no separate mode toggle. For a
     student identifier, there is truly nothing to send: matches the
     credential card's own no-recovery warning verbatim rather than
     inventing softer language that implies recovery might be possible. */
  function _handleForgotPassword(identifier) {
    identifier = (identifier || '').trim();
    if (!identifier) {
      _stepLoginForm(null, 'Enter your email above, then tap "Forgot password?" again.', identifier);
      return;
    }
    if (identifier.indexOf('@') === -1) {
      _stepLoginForm(null, 'Student accounts have no password recovery. There is no password reset ' +
        'and no recovery email. If this is lost, progress cannot be recovered.', identifier);
      return;
    }
    _stepLoginForm(null, 'Sending reset email…', identifier);
    window.SogAccount.sendPasswordReset(identifier, function (err) {
      if (err) {
        console.error('[AccountUI] Password reset failed', err);
        _stepLoginForm(null, _resetErrorMessage(err), identifier);
        return;
      }
      _stepLoginForm(null, 'Check your email for a link to reset your password.', identifier);
    });
  }

  function _resetErrorMessage(err) {
    var code = err && err.code;
    if (code === 'auth/user-not-found')     return 'No account found with that email.';
    if (code === 'auth/invalid-email')      return 'Enter a valid email address.';
    if (code === 'auth/too-many-requests')  return 'Too many attempts — please wait a moment and try again.';
    return 'Something went wrong sending the reset email. Please try again.';
  }

  function _stepWelcomeBack(isTeacher) {
    _render(
      'WELCOME BACK',
      isTeacher
        ? '<p>You’re logged in to your teacher account.</p>'
        : '<p>You’re logged in and your saved progress has been restored.</p>',
      '<button class="btn-snes" id="af-ok">OK</button>'
    );
    _byId('af-ok').addEventListener('click', function () {
      _close();
      location.reload();
    });
  }

  /* ── Teacher signup: one step, no invite code ──────────────────────────
     CONTINUE WITH GOOGLE, or email + password, plus "I'm a teacher or an
     adult (18+)". The guest account is upgraded in place (js/account.js
     signUpTeacherOpen / signUpTeacherGoogleOpen), so whatever they played
     carries over; the class-link screen (js/teacher-onboard.js) follows. The
     Google button calls the popup straight from its click, so it isn't
     blocked; if it is anyway, _stepPopupBlocked says exactly what to do. */
  var _teacherPrefill = { email: '', adult: false };

  /* Under the 18+ checkbox on both teacher sign-up forms. The link opens the
     About screen's Privacy section (#about-privacy, the single copy of that
     text) in an overlay ABOVE the sign-up modal, so nothing typed is lost and
     closing it lands back on the form. Delegated (_privacyLinkWired) because
     the modal body is re-rendered on every step. */
  var _PRIVACY_LINE = '<div class="account-privacy-line">Teacher accounts are for adults. ' +
    '<a href="#" class="account-privacy-link">Privacy &amp; account deletion</a></div>';

  function _showPrivacy() {
    var src = document.getElementById('about-privacy');
    var bd = document.getElementById('privacy-peek-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'privacy-peek-backdrop';
      bd.className = 'guest-modal-backdrop';
      bd.innerHTML = '<div class="card-popup guest-modal privacy-peek" role="dialog" aria-label="Privacy">' +
        '<div class="privacy-peek-body" id="privacy-peek-body"></div>' +
        '<div class="popup-actions"><button class="btn-snes btn-snes-close" id="privacy-peek-close">CLOSE</button></div></div>';
      (document.getElementById('sog-stage') || document.body).appendChild(bd);
      var close = function () { bd.classList.remove('visible'); };
      bd.querySelector('#privacy-peek-close').addEventListener('click', close);
      bd.addEventListener('click', function (e) { if (e.target === bd) close(); });
    }
    bd.querySelector('#privacy-peek-body').innerHTML = src ? src.innerHTML
      : '<p>Teacher accounts are for adults (18+). Students never give personal information.</p>';
    bd.classList.add('visible');
  }

  function _wirePrivacyLink() {
    if (!_els() || bodyEl._privacyLinkWired) return;
    bodyEl._privacyLinkWired = true;
    bodyEl.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('.account-privacy-link') : null;
      if (!a) return;
      e.preventDefault();
      _showPrivacy();
    });
  }

  function openTeacherSignup() {
    if (window.Analytics && typeof window.Analytics.funnel === 'function') {
      window.Analytics.funnel('teacher_signup_started', { src: _teacherSrc() });
    }
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
    if (user && !user.isAnonymous) { _teacherAlreadySignedIn(); return; }
    _stepTeacherOpen();
  }

  function _teacherSrc() {
    return (window.TeacherOnboard && typeof window.TeacherOnboard.src === 'function') ? window.TeacherOnboard.src() : '';
  }

  function _stepTeacherOpen(errorMsg) {
    _render(
      'GET A FREE CLASS LINK',
      '<p>One step. Students join with a link and pick a game name — no student emails.</p>' +
      '<label class="account-flow-checkbox-row account-adult-row">' +
        '<input type="checkbox" id="af-adult"' + (_teacherPrefill.adult ? ' checked' : '') + '> I’m a teacher or an adult (18+)' +
      '</label>' + _PRIVACY_LINE +
      '<button class="btn-snes account-google-btn" id="af-open-google">CONTINUE WITH GOOGLE</button>' +
      '<p class="account-flow-or">or with email</p>' +
      '<input type="email" id="af-open-email" class="account-flow-input" placeholder="EMAIL" autocomplete="email" value="' +
        _escapeHtml(_teacherPrefill.email) + '">' +
      '<input type="password" id="af-open-password" class="account-flow-input" placeholder="PASSWORD (6+ CHARACTERS)" autocomplete="new-password">' +
      (errorMsg ? '<div class="account-flow-error">' + errorMsg + '</div>' : '') +
      '<div class="account-flow-forgot"><a href="#" id="af-open-login">Already have a teacher account? Log in</a></div>',
      '<button class="btn-snes" id="af-open-submit">CREATE ACCOUNT</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    var adult = _byId('af-adult'), email = _byId('af-open-email'), pass = _byId('af-open-password');
    var needAdult = function () {
      _teacherPrefill.adult = adult.checked;
      _teacherPrefill.email = email.value.trim();
      if (adult.checked) return false;
      _stepTeacherOpen('Please tick “I’m a teacher or an adult (18+)” first.');
      return true;
    };
    _byId('af-open-google').addEventListener('click', function () {
      if (needAdult()) return;
      _submitTeacherOpenGoogle();
    });
    function submit() {
      if (needAdult()) return;
      if (!email.value.trim() || !pass.value) { _stepTeacherOpen('Enter your email and a password.'); return; }
      _render('ONE MOMENT', '<p>Creating your teacher account…</p>', '');
      window.SogAccount.signUpTeacherOpen({ email: email.value.trim(), password: pass.value, src: _teacherSrc() }, function (err, result) {
        _afterTeacherOpen(err, result, 'password');
      });
    }
    _byId('af-open-submit').addEventListener('click', submit);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    _byId('af-open-login').addEventListener('click', function (e) { e.preventDefault(); _stepLoginForm(); });
    _byId('af-cancel').addEventListener('click', _close);
  }

  // Straight from a click: the popup opens synchronously inside it.
  function _submitTeacherOpenGoogle() {
    _render('ONE MOMENT', '<p>Opening Google sign-in…</p>', '');
    window.SogAccount.signUpTeacherGoogleOpen({ src: _teacherSrc() }, function (err, result) {
      _afterTeacherOpen(err, result, 'google');
    });
  }

  function _afterTeacherOpen(err, result, method) {
    if (err) {
      var code = err.code;
      if (code === 'popup-blocked')        { _stepPopupBlocked(); return; }
      if (code === 'popup-cancelled')      { _stepTeacherOpen(); return; }
      if (code === 'invite-required')      { _stepTeacherFinishInvite(); return; }
      if (code === 'google-needs-password') { _stepGoogleLinkPassword(result); return; }
      if (code === 'already-signed-in')    { _teacherAlreadySignedIn(); return; }
      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        _stepTeacherOpen('That email already has an account here. <a href="#" id="af-open-login2">Log in instead</a>.');
        var l = _byId('af-open-login2');
        if (l) l.addEventListener('click', function (e) { e.preventDefault(); _stepLoginForm(null, null, _teacherPrefill.email); });
        return;
      }
      console.error('[AccountUI] Teacher sign-up failed', err);
      _stepTeacherOpen(_escapeHtml(_teacherErrorMessage(err)));
      return;
    }
    if (result && result.passwordLost) { _stepRestorePassword(result); return; }
    if (result && result.verifyPending) {
      _teacherPrefill = { email: '', adult: false };
      _verifyPending = true;   // returning to the tab re-checks from now on
      _stepCheckEmail(result.email, result.emailSent ? '' : _verifyErrorMessage(result.sendError));
      return;
    }
    _teacherPrefill = { email: '', adult: false };
    _close();
    if (window.TeacherOnboard) window.TeacherOnboard.afterTeacherSignup(result, method);
    else location.reload();
  }

  /* ── Email teacher signup: "check your email" ───────────────────────────
     The account exists and progress saves; the teacher doc and "My Class"
     wait for the verification link (js/account.js checkTeacherVerification).
     KEEP PLAYING closes this; the check also runs on return to the tab and on
     every page load, so following the link anywhere finishes it. */
  function _verifyErrorMessage(code) {
    if (code === 'auth/too-many-requests') return 'Too many emails just now. Wait a minute, then press RESEND.';
    if (code === 'auth/network-request-failed') return 'Couldn’t reach the server. Check your connection, then press RESEND.';
    return 'The email didn’t send. Press RESEND to try again.';
  }

  function _stepCheckEmail(email, msg, isInfo) {
    _render(
      'CHECK YOUR EMAIL',
      '<p><strong>Check your email to finish setting up your class.</strong></p>' +
      '<p>We sent a link to <strong>' + _escapeHtml(email || 'your email') + '</strong>. Open it, then come back here. ' +
        'You can keep playing meanwhile — your progress is saved.</p>' +
      (msg ? '<div class="' + (isInfo ? 'account-flow-info' : 'account-flow-error') + '">' + _escapeHtml(msg) + '</div>' : ''),
      '<button class="btn-snes" id="af-verify-check">I’VE OPENED THE LINK</button>' +
      '<button class="btn-snes" id="af-verify-resend">RESEND</button>' +
      '<button class="btn-snes btn-snes-close" id="af-verify-later">KEEP PLAYING</button>'
    );
    _byId('af-verify-check').addEventListener('click', function () {
      _render('ONE MOMENT', '<p>Checking…</p>', '');
      _checkPendingTeacher(function (state) {
        if (state === 'unverified') _stepCheckEmail(email, 'Not verified yet. Open the link in the email first (check spam too).');
        else if (state === 'error') _stepCheckEmail(email, 'Couldn’t check just now. Try again in a moment.');
      });
    });
    _byId('af-verify-resend').addEventListener('click', function () {
      _render('ONE MOMENT', '<p>Sending…</p>', '');
      window.SogAccount.resendTeacherVerification(function (err) {
        if (err) { _stepCheckEmail(email, _verifyErrorMessage(err.code)); return; }
        _stepCheckEmail(email, 'Sent again. Check your inbox (and spam).', true);
      });
    });
    _byId('af-verify-later').addEventListener('click', _close);
  }

  // Runs the verification check; on success makes the teacher doc, then the
  // class-link screen makes "My Class". done(state): 'finished' | 'unverified'
  // | 'existing' | 'not-pending' | 'error'.
  var _verifyCheckBusy = false, _verifyPending = false;
  function _checkPendingTeacher(done) {
    done = done || function () {};
    if (!window.SogAccount || typeof window.SogAccount.checkTeacherVerification !== 'function') { done('not-pending'); return; }
    if (_verifyCheckBusy) { done('busy'); return; }
    _verifyCheckBusy = true;
    window.SogAccount.setSignupSource(_teacherSrc());
    window.SogAccount.checkTeacherVerification(function (err, r) {
      _verifyCheckBusy = false;
      if (err) {
        if (err.code === 'invite-required') { _verifyPending = false; _stepTeacherFinishInvite(); done('invite'); return; }
        done('error');
        return;
      }
      if (r && r.notPending) { _verifyPending = false; done('not-pending'); return; }
      if (r && r.existing)   { _verifyPending = false; done('existing'); return; }
      if (!r || !r.verified) { _verifyPending = true; done('unverified'); return; }
      _verifyPending = false;
      _close();
      if (window.TeacherOnboard) window.TeacherOnboard.afterTeacherSignup(r, 'password');
      done('finished');
    });
  }

  // On load (once auth settles) and on return to the tab: finish a pending
  // email teacher signup. A still-unverified one gets the reminder once per
  // browser session (e.g. after logging in on another device), never a nag.
  function _watchPendingTeacher() {
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
    if (!user || !window.SogAccount.isPendingTeacherUser(user)) return;
    _checkPendingTeacher(function (state) {
      if (state !== 'unverified') return;
      var shown = false;
      try { shown = sessionStorage.getItem('sog_verify_reminder_shown') === '1'; } catch (e) {}
      if (shown || (_els() && backdrop.classList.contains('visible'))) return;   // never over another step
      try { sessionStorage.setItem('sog_verify_reminder_shown', '1'); } catch (e) {}
      _stepCheckEmail(user.email);
    });
  }

  /* Popup blocked: never fall back to a redirect (it loses the sign-in on
     github.io — see js/account.js _popupBlocked). Say what to do, keep their
     place, and offer email instead. */
  function _stepPopupBlocked() {
    _render(
      'GOOGLE WINDOW BLOCKED',
      '<p>Your browser blocked the Google sign-in window, so you’re not signed in yet.</p>' +
      '<ol class="account-flow-steps">' +
        '<li>Look for the blocked-window icon at the right end of the address bar.</li>' +
        '<li>Choose <strong>Always allow pop-ups</strong> for this site.</li>' +
        '<li>Press <strong>TRY AGAIN</strong>.</li>' +
      '</ol>' +
      '<p>Or sign up with your email and a password instead — it works the same.</p>',
      '<button class="btn-snes" id="af-popup-retry">TRY AGAIN</button>' +
      '<button class="btn-snes" id="af-popup-email">USE EMAIL</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    _byId('af-popup-retry').addEventListener('click', _submitTeacherOpenGoogle);
    _byId('af-popup-email').addEventListener('click', function () { _stepTeacherOpen(); var e = _byId('af-open-email'); if (e) e.focus(); });
    _byId('af-cancel').addEventListener('click', _close);
  }

  /* The site went live before the new Firestore rules: the account exists and
     is signed in, but the teacher doc still needs an invite code. Nothing is
     lost — a code finishes it now, or TRY AGAIN once the rules are deployed. */
  function _stepTeacherFinishInvite(errorMsg) {
    _render(
      'ALMOST DONE',
      '<p>Your account is created and you’re signed in. Teacher sign-up on this site is still being switched on, ' +
        'so for now it needs an invite code. Enter one if you have it, or try again in a few minutes.</p>' +
      '<input type="text" id="af-finish-code" class="account-flow-input" maxlength="12" placeholder="INVITE CODE (IF YOU HAVE ONE)" autocomplete="off" spellcheck="false">' +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : ''),
      '<button class="btn-snes" id="af-finish-submit">FINISH</button>' +
      '<button class="btn-snes btn-snes-close" id="af-finish-later">LATER</button>'
    );
    _byId('af-finish-submit').addEventListener('click', function () {
      var code = _byId('af-finish-code').value;
      _render('ONE MOMENT', '<p>Finishing your teacher account…</p>', '');
      window.SogAccount.finishTeacherSetup(code, function (err, result) {
        if (err) {
          if (err.code === 'invite-invalid' || err.code === 'permission-denied') {
            _stepTeacherFinishInvite(code ? "That code isn't valid." : 'Still needs a code — try again in a few minutes, or enter one.');
            return;
          }
          _stepTeacherFinishInvite(_teacherErrorMessage(err));
          return;
        }
        _close();
        if (window.TeacherOnboard) window.TeacherOnboard.afterTeacherSignup(result, 'finish');
      });
    });
    _byId('af-finish-later').addEventListener('click', _close);
  }

  function _teacherAlreadySignedIn() {
    var isTeacher = window.TeacherDashboard && typeof window.TeacherDashboard.isTeacher === 'function' && window.TeacherDashboard.isTeacher();
    if (isTeacher) { _close(); if (window.TeacherOnboard) window.TeacherOnboard.showClassLink(); return; }
    _render(
      'ALREADY SIGNED IN',
      '<p>This device is signed in to a student account. To make a teacher account, log out first, then come back here.</p>',
      '<button class="btn-snes" id="af-ok">OK</button>' +
      '<button class="btn-snes btn-snes-close" id="af-logout">LOG OUT</button>'
    );
    _byId('af-ok').addEventListener('click', _close);
    _byId('af-logout').addEventListener('click', _startLogout);
  }

  /* Google sign-in from LOG IN (returning teachers). A Google account that
     isn't a teacher here yet stops at 'invite-required' signed in, and
     _stepGoogleInvite finishes it with the adult checkbox (no code needed now
     — the code field only appears if the deployed rules still demand one). */
  function _submitTeacherGoogle() {
    _render('ONE MOMENT', '<p>Opening Google sign-in…</p>', '');
    window.SogAccount.signInTeacherWithGoogle('', function (err, result) {
      if (err) {
        if (err.code === 'popup-cancelled') { _stepLoginForm(); return; }
        if (err.code === 'popup-blocked') { _stepLoginForm(null, 'Your browser blocked the Google window. Allow pop-ups for this site ' +
          '(the blocked-window icon at the right end of the address bar), then press CONTINUE WITH GOOGLE again — or log in with your email and password.'); return; }
        if (err.code === 'invite-required') { _stepGoogleInvite(result); return; }
        if (err.code === 'google-needs-password') { _stepGoogleLinkPassword(result); return; }
        if (err.code === 'invite-invalid' && result) { _stepGoogleInvite(Object.assign({}, result, { needInvite: true }), _teacherErrorMessage(err)); return; }
        console.error('[AccountUI] Teacher Google sign-in failed', err);
        _stepLoginForm(_teacherErrorMessage(err));
        return;
      }
      _afterGoogleSignIn(result);
    });
  }

  // Where a successful Google sign-in lands: the normal welcome, the "Google
  // connected" note for a finished link, or — for a gmail password account
  // Google just took over — the offer to put a password back.
  function _afterGoogleSignIn(result) {
    if (result.passwordLost) { _stepRestorePassword(result); return; }
    if (result.linked) { _stepGoogleLinked(result); return; }
    _stepTeacherSignupSuccess(result, result.existing);
  }

  /* ── Step: finish a first-time Google sign-in from LOG IN ───────────────
     Signed in with a Google account that has no teacher account here yet.
     FINISH SETUP makes it one (adult checkbox, no invite code); "I already
     have an account" links it to an existing password teacher instead; CANCEL
     backs out (js/account.js cancelTeacherGoogleSignup deletes the
     just-created Auth user rather than leaving it stranded). info.needInvite:
     the deployed rules still demand a code, so the field is shown. */
  function _stepGoogleInvite(info, errorMsg) {
    info = info || {};
    var who = info.email || info.displayName || 'your Google account';
    _render(
      'ONE MORE STEP',
      '<p>Signed in as <strong>' + _escapeHtml(who) + '</strong>. There’s no teacher account for it here yet.</p>' +
      '<label class="account-flow-checkbox-row account-adult-row">' +
        '<input type="checkbox" id="af-google-adult"' + (info.adult ? ' checked' : '') + '> I’m a teacher or an adult (18+)' +
      '</label>' + _PRIVACY_LINE +
      (info.needInvite
        ? '<input type="text" id="af-google-invite" class="account-flow-input" maxlength="12" ' +
            'placeholder="INVITE CODE" autocomplete="off" spellcheck="false">'
        : '') +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : '') +
      '<p class="account-flow-or">Already have a teacher account with a different email? ' +
        'Connect this Google account to it instead, so your classes stay in one place.</p>',
      '<button class="btn-snes" id="af-google-invite-submit">CREATE TEACHER ACCOUNT</button>' +
      '<button class="btn-snes" id="af-google-existing">I ALREADY HAVE AN ACCOUNT</button>' +
      '<button class="btn-snes btn-snes-close" id="af-google-invite-cancel">CANCEL</button>'
    );
    _byId('af-google-existing').addEventListener('click', function () {
      if (window.SogAccount.startLinkToExistingAccount()) {
        _stepGoogleLinkPassword({ email: '', googleEmail: info.email || '', differentEmail: true });
        return;
      }
      // No reusable Google credential from this sign-in (rare): back out
      // cleanly and use the password-first route instead.
      _render('ONE MOMENT', '<p>Cancelling…</p>', '');
      window.SogAccount.cancelTeacherGoogleSignup(function () {
        _stepLoginForm(null, 'Log in with your email and password, then use CONNECT GOOGLE in your dashboard.');
      });
    });
    function submit() {
      var adult = _byId('af-google-adult');
      if (!adult.checked) { _stepGoogleInvite(info, 'Please tick “I’m a teacher or an adult (18+)” first.'); return; }
      var codeEl = _byId('af-google-invite');
      var code = codeEl ? codeEl.value : '';
      var next = Object.assign({}, info, { adult: true });
      _render('ONE MOMENT', '<p>Setting up your teacher account…</p>', '');
      window.SogAccount.setSignupSource(_teacherSrc());
      window.SogAccount.finishTeacherGoogleSignup(code, function (err, result) {
        if (err) {
          console.error('[AccountUI] Google teacher signup failed', err);
          if (err.code === 'invite-invalid') next.needInvite = true;
          _stepGoogleInvite(Object.assign({}, result || info, { needInvite: next.needInvite, adult: true }),
            err.code === 'invite-invalid' && !code ? 'Teacher sign-up on this site still needs an invite code for now.' : _teacherErrorMessage(err));
          return;
        }
        _close();
        if (window.TeacherOnboard) window.TeacherOnboard.afterTeacherSignup(result, 'google');
        else location.reload();
      });
    }
    _byId('af-google-invite-submit').addEventListener('click', submit);
    _byId('af-google-invite-cancel').addEventListener('click', function () {
      _render('ONE MOMENT', '<p>Cancelling…</p>', '');
      window.SogAccount.cancelTeacherGoogleSignup(function () { _stepChooser(); });
    });
  }

  /* ── Step: connect Google to an existing password account ───────────────
     Password once, then the Google credential is linked to that same uid —
     classes, roster and progress all stay put, and both sign-in methods keep
     working. info = { email, googleEmail, differentEmail } */
  function _stepGoogleLinkPassword(info, errorMsg) {
    info = info || {};
    var intro = info.differentEmail
      ? '<p>Log in to your existing teacher account once. <strong>' + _escapeHtml(info.googleEmail || 'This Google account') +
        '</strong> will be connected to it — same classes, and you can sign in either way.</p>'
      : '<p><strong>' + _escapeHtml(info.email) + '</strong> already has a teacher account here. Enter its password once to connect ' +
        (info.googleEmail && info.googleEmail !== info.email ? '<strong>' + _escapeHtml(info.googleEmail) + '</strong>' : 'Google') +
        ' — same classes, and you can sign in either way.</p>';
    _render(
      'CONNECT GOOGLE',
      intro +
      '<input type="email" id="af-link-email" class="account-flow-input" placeholder="EMAIL" autocomplete="username" value="' +
        _escapeHtml(info.email || '') + '">' +
      '<input type="password" id="af-link-password" class="account-flow-input" placeholder="PASSWORD" autocomplete="current-password">' +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : '') +
      '<div class="account-flow-forgot"><a href="#" id="af-link-forgot">Forgot password?</a></div>',
      '<button class="btn-snes" id="af-link-submit">CONNECT</button>' +
      '<button class="btn-snes btn-snes-close" id="af-link-cancel">CANCEL</button>'
    );
    var emailInput = _byId('af-link-email');
    var passInput = _byId('af-link-password');
    (info.email ? passInput : emailInput).focus();
    function submit() {
      var email = emailInput.value.trim();
      if (!email || !passInput.value) { _stepGoogleLinkPassword(info, 'Enter your email and password.'); return; }
      var next = Object.assign({}, info, { email: email });
      _render('ONE MOMENT', '<p>Connecting Google…</p>', '');
      window.SogAccount.linkGoogleWithPassword(email, passInput.value, function (err, result) {
        if (!err) { _stepGoogleLinked(result); return; }
        if (err.code === 'google-link-retry') { _stepGoogleLinkRetry(); return; }
        if (err.code === 'google-link-expired') { _stepLoginForm(null, 'That Google sign-in expired. Log in with your password, then use CONNECT GOOGLE in your dashboard.', email); return; }
        console.warn('[AccountUI] Connecting Google failed', err);
        _stepGoogleLinkPassword(next, _linkErrorMessage(err));
      });
    }
    _byId('af-link-submit').addEventListener('click', submit);
    passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    _byId('af-link-forgot').addEventListener('click', function (e) {
      e.preventDefault();
      var email = emailInput.value.trim();
      if (!email) { _stepGoogleLinkPassword(info, 'Enter your email above first.'); return; }
      window.SogAccount.sendPasswordReset(email, function (resetErr) {
        _stepGoogleLinkPassword(Object.assign({}, info, { email: email }),
          resetErr ? _resetErrorMessage(resetErr) : 'Reset email sent. Set a new password, then come back and connect.');
      });
    });
    _byId('af-link-cancel').addEventListener('click', function () {
      _render('ONE MOMENT', '<p>Cancelling…</p>', '');
      window.SogAccount.cancelGoogleLink(function () { _stepLoginForm(); });
    });
  }

  function _linkErrorMessage(err) {
    var code = err && err.code;
    if (code === 'not-a-teacher')               return 'No teacher account uses that email. Check the address you signed up with.';
    if (code === 'google-is-other-teacher')     return 'That Google account already has its own teacher account here, so it can’t be connected to this one.';
    if (code === 'auth/provider-already-linked') return 'This teacher account already has a different Google account connected.';
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use')
      return 'That Google account is already connected to another account here.';
    return _teacherLoginErrorMessage(err);
  }

  // Password login worked but the parked Google credential didn't take
  // (expired). They're signed in now, so one click re-opens Google as a link.
  function _stepGoogleLinkRetry() {
    _render(
      'ALMOST DONE',
      '<p>You’re logged in. Click below and pick your Google account once more to finish connecting it.</p>',
      '<button class="btn-snes" id="af-link-again">CONNECT GOOGLE</button>' +
      '<button class="btn-snes btn-snes-close" id="af-link-skip">SKIP</button>'
    );
    _byId('af-link-again').addEventListener('click', _connectGoogle);
    _byId('af-link-skip').addEventListener('click', function () { _stepWelcomeBack(true); });
  }

  // Dashboard entry: a teacher already logged in with their password. Runs
  // straight from the click so the Google popup isn't blocked.
  function _connectGoogle() {
    _render('ONE MOMENT', '<p>Opening Google…</p>', '');
    window.SogAccount.linkGoogleToCurrentUser(function (err, result) {
      if (!err) {
        if (result.alreadyLinked) {
          _render('GOOGLE CONNECTED', '<p>Google is already connected to this account.</p>', '<button class="btn-snes" id="af-ok">OK</button>');
          _byId('af-ok').addEventListener('click', _close);
          return;
        }
        _stepGoogleLinked(result);
        return;
      }
      if (err.code === 'google-needs-password') { _stepGoogleLinkPassword(result); return; }
      if (err.code === 'popup-cancelled') { _close(); return; }
      console.error('[AccountUI] Connect Google failed', err);
      _render('CONNECT GOOGLE', '<div class="account-flow-error">' + _escapeHtml(_linkErrorMessage(err)) + '</div>',
        '<button class="btn-snes btn-snes-close" id="af-ok">OK</button>');
      _byId('af-ok').addEventListener('click', function () { _close(); location.reload(); });
    });
  }

  function _stepGoogleLinked(result) {
    var google = result && result.googleEmail;
    _render(
      'GOOGLE CONNECTED',
      '<p>' + (google ? '<strong>' + _escapeHtml(google) + '</strong> is' : 'Google is') + ' now connected to your teacher account.</p>' +
      '<p>Sign in with Google or with your email and password — both open the same account and classes.</p>',
      '<button class="btn-snes" id="af-done">OK</button>'
    );
    _byId('af-done').addEventListener('click', function () { _close(); location.reload(); });
  }

  /* ── Step: Google took over a gmail password account ──────────────────
     Firebase's rule, not ours: for an @gmail.com address Google is the
     authority, so signing in with Google on an unverified gmail password
     account keeps the account (same uid, same classes) but switches the
     password off. Say so plainly and offer the password back right here. */
  function _stepRestorePassword(result, errorMsg) {
    _render(
      'WELCOME BACK',
      '<p>Welcome back, ' + _escapeHtml(result.displayName) + '. Your classes and students are all here.</p>' +
      '<p>Heads up: because <strong>' + _escapeHtml(result.email) + '</strong> is a Gmail address, Google now handles ' +
        'sign-in for it, and Google switched off this account’s old password. Set a password to keep both ways in ' +
        '(reusing your old one is fine).</p>' +
      '<input type="password" id="af-restore-password" class="account-flow-input" placeholder="PASSWORD" autocomplete="new-password">' +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : ''),
      '<button class="btn-snes" id="af-restore-submit">SET PASSWORD</button>' +
      '<button class="btn-snes btn-snes-close" id="af-restore-skip">GOOGLE ONLY</button>'
    );
    var input = _byId('af-restore-password');
    input.focus();
    function submit() {
      if (input.value.length < 6) { _stepRestorePassword(result, 'Password must be at least 6 characters.'); return; }
      _render('ONE MOMENT', '<p>Saving your password…</p>', '');
      window.SogAccount.addPasswordToCurrentUser(input.value, function (err) {
        if (err) { console.warn('[AccountUI] Restoring password failed', err); _stepRestorePassword(result, _teacherErrorMessage(err)); return; }
        _stepGoogleLinked({ googleEmail: result.email });
      });
    }
    _byId('af-restore-submit').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    _byId('af-restore-skip').addEventListener('click', function () {
      window.SogAccount.keepGoogleOnly(function () { _stepTeacherSignupSuccess(result, true); });
    });
  }

  function _teacherErrorMessage(err) {
    var code = err && err.code;
    if (code === 'invite-invalid')              return "That code isn't valid. Check it with whoever gave it to you.";
    if (code === 'auth/account-exists-with-different-credential')
      return 'That email already has a password account here. Log in with your email and password, then use CONNECT GOOGLE in your dashboard.';
    if (code === 'auth/unauthorized-domain')    return 'Google sign-in isn’t enabled for this site yet.';
    if (code === 'auth/popup-blocked')          return 'Your browser blocked the Google window. Allow popups, or try again.';
    if (code === 'auth/email-already-in-use')   return 'An account with that email already exists. Try logging in instead.';
    if (code === 'auth/invalid-email')          return 'Enter a valid email address.';
    if (code === 'auth/weak-password')          return 'Password must be at least 6 characters.';
    if (code === 'auth/network-request-failed' ||
        code === 'auth/too-many-requests')      return 'Network issue — please try again in a moment.';
    return 'Something went wrong creating your account. Please try again.';
  }

  function _stepTeacherSignupSuccess(result, existing) {
    _render(
      existing ? 'WELCOME BACK' : 'TEACHER ACCOUNT CREATED',
      '<p>Welcome' + (existing ? ' back' : '') + (result.displayName ? ', ' + _escapeHtml(result.displayName) : '') + '! ' +
        (existing ? 'You’re signed in to your teacher account.' : 'Your teacher account is ready.') + '</p>' +
      '<p>Your class link and dashboard are on the home screen: students click the link, pick a name and play.</p>',
      '<button class="btn-snes" id="af-done">OK</button>'
    );
    _byId('af-done').addEventListener('click', function () {
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
    _byId('af-retry').addEventListener('click', function () { _stepJoinPickName(false); });
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

  /* ── Join links (?join=CODE) ────────────────────────────────────────────
     The teacher shares a link instead of dictating a code, so a student's
     first screen is "Joining: Mr. S — Period 3" and the account exists before
     they play rather than part-way through. Everything after the confirm step
     is the existing signup flow, unchanged — including linkWithCredential
     upgrading the anonymous session in place, so a student who had already
     been playing as a guest on this device keeps that progress. */
  function _stepJoinBroken() {
    _render(
      'CLASS NOT FOUND',
      '<p>That class link or code didn’t work. It may be mistyped or out of date, or the class may have been closed. ' +
        'Check with your teacher — you can keep playing as a guest in the meantime.</p>',
      '<button class="btn-snes" id="af-ok">OK</button>'
    );
    _byId('af-ok').addEventListener('click', _close);
  }

  // Already signed in (a student with an account, or a teacher trying their
  // own link). Joining would mean a second account, and firestore.rules pins
  // class membership anyway, so offer the honest choice instead.
  function _stepJoinAlreadySignedIn(label) {
    _render(
      'ALREADY SIGNED IN',
      '<p>You’re already signed in on this device, so you don’t need to join ' +
        '<strong>' + _escapeHtml(label) + '</strong> again.</p>' +
      '<p>If this is someone else’s device, log out first and then open the link again.</p>',
      '<button class="btn-snes" id="af-ok">KEEP PLAYING</button>' +
      '<button class="btn-snes btn-snes-close" id="af-logout">LOG OUT</button>'
    );
    _byId('af-ok').addEventListener('click', _close);
    _byId('af-logout').addEventListener('click', _startLogout);   // reload keeps ?join= in the URL
  }

  // onBroken: what to show for a code that isn't a live class (the typed-code
  // popup re-asks; a link gets the "class not found" screen).
  function _startJoinFlow(code, onBroken) {
    _pendingClassInfo = null;
    _render('ONE MOMENT', '<p>Checking your class ' + (onBroken ? 'code' : 'link') + '…</p>', '');
    window.SogAccount.lookupClassCode(code, function (err, classInfo) {
      if (err || !classInfo || classInfo.ungrouped) { (onBroken || _stepJoinBroken)(); return; }
      var user = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
      if (user && !user.isAnonymous) { _stepJoinAlreadySignedIn(classInfo.label); return; }
      // From here on this device belongs to a student: no teacher banner,
      // "For Teachers" button or teacher card (js/teacher-onboard.js).
      if (window.TeacherOnboard) window.TeacherOnboard.markStudentDevice();
      _pendingClassInfo = classInfo;
      _stepJoinPickName(true);
    });
  }

  /**
   * Boot hook: opens the join flow if this page was opened from a class link,
   * or pre-fills the login form from a login-card QR. Safe to call on every
   * load — it no-ops when there's nothing to do.
   */
  function init() {
    if (!window.SogAccount) return;
    _wirePrivacyLink();

    if (window.SogAuth && typeof window.SogAuth.ready === 'function') window.SogAuth.ready(_watchPendingTeacher);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && _verifyPending) _watchPendingTeacher();
    });

    // Login-card QR (#login=name.passphrase): wipe it from the address bar
    // and this tab's history entry at once, then pre-fill the login form —
    // the student just taps LOG IN.
    var login = window.SogAccount.parseLoginFragment(location.hash);
    if (login) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      if (window.TeacherOnboard) window.TeacherOnboard.markStudentDevice();
      var openLogin = function () {
        var u = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
        if (u && !u.isAnonymous) { _stepJoinAlreadySignedIn('your account'); return; }
        _stepLoginForm(null, 'Check that this is your name, then press LOG IN.', login.username, login.passphrase);
      };
      if (window.SogAuth && typeof window.SogAuth.ready === 'function') window.SogAuth.ready(openLogin); else openLogin();
      return;
    }

    var code = window.SogAccount.parseJoinCode(location.search, location.hash);
    if (!code) return;
    // Drop the parameter so a refresh (or a shared screenshot of the URL bar)
    // doesn't re-run the flow; the code lives in _pendingClassInfo from here.
    try { history.replaceState(null, '', location.pathname); } catch (e) {}

    var start = function () { _startJoinFlow(code); };
    if (window.SogAuth && typeof window.SogAuth.ready === 'function') window.SogAuth.ready(start);
    else start();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ── Home corner links ─────────────────────────────────────────────────
     "Log in" / <name>: guests go straight to the login form (creating an
     account and teacher signup have their own corner links, Join a class
     and Teachers); a signed-in player gets their name with My login
     (students) or Dashboard (teachers), and Log out. */
  function openAccount() {
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
    if (!user || user.isAnonymous) { _pendingClassInfo = null; _stepLoginForm(); return; }
    var isTeacher = window.TeacherDashboard && typeof window.TeacherDashboard.isTeacher === 'function' && window.TeacherDashboard.isTeacher();
    if (!isTeacher && window.SogAccount.isPendingTeacherUser(user)) {
      _render('ONE MOMENT', '<p>Checking your account…</p>', '');
      _checkPendingTeacher(function (state) {
        if (state === 'unverified' || state === 'error') _stepCheckEmail(user.email);
        else if (state !== 'finished' && state !== 'invite') _close();
      });
      return;
    }
    var email = user.email || '', name = '';
    if (email.slice(-12) === '@sog.invalid') name = email.slice(0, -12);
    else if (isTeacher) { var d = window.TeacherDashboard.getTeacherDoc(); name = (d && d.displayName) || ''; }
    _render(
      'ACCOUNT',
      '<p>Signed in' + (name ? ' as <strong>' + _escapeHtml(name) + '</strong>' : '') + '. Your progress is saved to your account.</p>',
      (isTeacher
        ? '<button class="btn-snes" id="af-acct-dash">DASHBOARD</button>'
        : '<button class="btn-snes" id="af-acct-login">MY LOGIN</button>') +
      '<button class="btn-snes btn-snes-remove" id="af-acct-logout">LOG OUT</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CLOSE</button>'
    );
    var dash = _byId('af-acct-dash'), login = _byId('af-acct-login');
    if (dash) dash.addEventListener('click', function () { _close(); window.TeacherDashboard.show(); });
    if (login) login.addEventListener('click', function () { _close(); if (window.TeacherOnboard) window.TeacherOnboard.showMyLogin(); });
    _byId('af-acct-logout').addEventListener('click', _startLogout);
    _byId('af-cancel').addEventListener('click', _close);
  }

  /* "Join a class": the class-code popup for students who can't click their
     teacher's link. Same join flow as a link from there on. */
  function openJoinClass(errorMsg) {
    _render(
      'JOIN A CLASS',
      '<p>Type the class code your teacher gave you.</p>' +
      '<input type="text" id="af-join-code" class="account-flow-input account-code-input" maxlength="12" ' +
        'placeholder="CLASS CODE" autocomplete="off" spellcheck="false" autocapitalize="characters">' +
      (errorMsg ? '<div class="account-flow-error">' + _escapeHtml(errorMsg) + '</div>' : ''),
      '<button class="btn-snes" id="af-join-go">JOIN</button>' +
      '<button class="btn-snes btn-snes-close" id="af-cancel">CANCEL</button>'
    );
    var input = _byId('af-join-code');
    input.focus();
    var go = function () {
      var code = input.value.trim().toUpperCase();
      if (!code) { openJoinClass('Enter your class code.'); return; }
      startJoin(code, function () { openJoinClass('No class found for ' + code + '. Check the code with your teacher.'); });
    };
    _byId('af-join-go').addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    _byId('af-cancel').addEventListener('click', _close);
  }

  /* Typed class code (the "Join a class" popup): same flow as a class link. */
  function startJoin(code, onBroken) {
    var c = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(c)) { (onBroken || _stepJoinBroken)(); return; }
    _startJoinFlow(c, onBroken);
  }

  return {
    openFlow: openFlow,
    openTeacherSignup: openTeacherSignup,
    openAccount: openAccount,
    openJoinClass: openJoinClass,
    startJoin: startJoin,
    connectGoogle: _connectGoogle,
    init:     init,
    logout:   _startLogout
  };
})();

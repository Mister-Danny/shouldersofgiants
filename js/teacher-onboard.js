/**
 * teacher-onboard.js — Teacher & student onboarding
 *
 * TEACHERS
 *   ?teacher=1[&src=TAG]  lands straight in the game as a guest (no form, no
 *                         welcome/guest popups) with a slim, dismissible banner:
 *                         "Teacher? Try a few rounds, then get a free class link."
 *   "Teachers"            a quiet top-right home link for teachers who arrive
 *                         without the link (same teacher mode; opens the card).
 *   After the FIRST battle win in teacher mode, a one-time card: "Want your
 *   class to play? Get a class link in 30 seconds."  [Yes] [Keep playing].
 *   Signup is one step (js/account-ui.js openTeacherSignup), then the
 *   class-link screen: link, QR, short code, Copy, Show on projector, the three
 *   steps, the teacher's name for students, the dashboard one click away.
 *
 * STUDENTS
 *   A device that has arrived through a class link, typed a class code, used a
 *   login card or logged in as a student is a STUDENT DEVICE from then on
 *   (sog_student_device, kept through logout): it never shows the teacher
 *   banner, the Teachers link or the teacher card. Students also get the
 *   "Join a class" corner link on the home screen, a one-time login card after
 *   signup (non-blocking, GOT IT) and "My login" in Options any time after.
 *
 * Loads EARLY (right after js/auth.js): the arrival parse below runs at script
 * time so it can quiet the first-visit popups (js/welcome.js, js/guest-status.js)
 * before they initialise. Everything that touches the DOM waits for it.
 *
 * Funnel events (js/analytics.js Analytics.funnel, no student PII):
 * teacher_link_landed {src}, teacher_card_shown, teacher_card_accepted,
 * teacher_signup_started, teacher_signup_completed {method, src},
 * class_link_copied, class_link_projected — plus student_joined_class (js/
 * account-ui.js) and first_student_joined (js/teacher-dashboard.js).
 */
(function (root) {
  'use strict';

  var KEY_TEACHER_MODE   = 'sog_teacher_mode';
  var KEY_TEACHER_SRC    = 'sog_teacher_src';
  var KEY_STUDENT_DEVICE = 'sog_student_device';
  var KEY_CARD_SHOWN     = 'sog_teacher_card_shown';
  var KEY_BANNER_HIDDEN  = 'sog_teacher_banner_dismissed';

  /* ── Pure parsing (unit-tested in test/onboarding.test.js) ─────────────── */
  function parseTeacherLink(search) {
    var s = String(search || '');
    var on = /(?:^|[?&])teacher=(1|true|yes)(?:&|$)/i.test(s);
    var m = /(?:^|[?&])src=([^&#]*)/i.exec(s), src = '';
    if (m) {
      try { src = decodeURIComponent(m[1]); } catch (e) { src = m[1]; }
      src = src.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    }
    return { teacher: on, src: on ? src : '' };
  }
  // Removes teacher/src from a query string, keeping anything else.
  function stripTeacherParams(search) {
    var kept = String(search || '').replace(/^\?/, '').split('&').filter(function (kv) {
      return kv && !/^(teacher|src)=/i.test(kv);
    });
    return kept.length ? '?' + kept.join('&') : '';
  }
  // "Go to <site>": the address without the scheme or a trailing index.html.
  function siteLabel(origin, pathname) {
    var host = String(origin || '').replace(/^https?:\/\//, '');
    var path = String(pathname || '/').replace(/index\.html$/, '');
    return (host + path).replace(/\/$/, '');
  }

  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined') {
    module.exports = { parseTeacherLink: parseTeacherLink, stripTeacherParams: stripTeacherParams, siteLabel: siteLabel };
    return;
  }

  function _get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function _set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function _funnel(event, props) {
    if (root.Analytics && typeof root.Analytics.funnel === 'function') root.Analytics.funnel(event, props || {});
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isStudentDevice() { return _get(KEY_STUDENT_DEVICE) === '1'; }
  function inTeacherMode() { return _get(KEY_TEACHER_MODE) === '1' && !isStudentDevice(); }
  function src() { return _get(KEY_TEACHER_SRC) || ''; }
  function _user() { return root.SogAuth && typeof root.SogAuth.getUser === 'function' ? root.SogAuth.getUser() : null; }
  function _signedIn() { var u = _user(); return !!(u && u.isAnonymous === false); }
  function _isTeacher() { return !!(root.TeacherDashboard && typeof root.TeacherDashboard.isTeacher === 'function' && root.TeacherDashboard.isTeacher()); }
  // Teacher-facing prompts: never on a student device, never for anyone signed in.
  function _teacherPromptsAllowed() { return !isStudentDevice() && !_signedIn(); }

  /* ── Arrival (script time) ─────────────────────────────────────────────── */
  var arrival = { teacherLink: false, join: false };
  (function () {
    var search = location.search || '', hash = location.hash || '';
    var join = /(?:^|[?&#])join=/i.test(search) || /(?:^|[?&#])join=/i.test(hash);
    var login = /(?:^|[#&])login=/i.test(hash);
    if (join || login) {
      // A class link or a login card: this device is a student's. Skip the
      // first-visit popups too: the join flow has its own welcome.
      _set(KEY_STUDENT_DEVICE, '1');
      _set('sog_welcome_seen', 'true');
      _set('sog_guest_notice_seen', 'true');
      arrival.join = join;
      return;
    }
    var t = parseTeacherLink(search);
    if (!t.teacher) return;
    try { history.replaceState(null, '', location.pathname + stripTeacherParams(search) + hash); } catch (e) {}
    if (isStudentDevice()) return;           // a student's device stays a student's
    _set(KEY_TEACHER_MODE, '1');
    if (t.src) _set(KEY_TEACHER_SRC, t.src);
    _set('sog_welcome_seen', 'true');
    _set('sog_guest_notice_seen', 'true');
    arrival.teacherLink = true;
    _funnel('teacher_link_landed', { src: t.src });
  })();

  function markStudentDevice() {
    if (_isTeacher()) return;               // a teacher testing their own link keeps teacher UI
    _set(KEY_STUDENT_DEVICE, '1');
    refresh();
  }

  /* ── Banner ────────────────────────────────────────────────────────────── */
  function _screen() { return (document.body && document.body.dataset && document.body.dataset.screen) || 'home'; }
  function _refreshBanner() {
    var el = document.getElementById('teacher-banner');
    if (!el) return;
    // Map only: the home screen has the Teachers corner link instead (and its
    // title sits where the banner would).
    var show = inTeacherMode() && _teacherPromptsAllowed() && _get(KEY_BANNER_HIDDEN) !== '1' &&
               _screen() === 'overworld';
    el.classList.toggle('visible', show);
  }

  /* ── Home corner links: Teachers, Join a class ─────────────────────────
     (Log in / name and Dashboard are js/home.js's.) Teachers: never on a
     student device or for anyone signed in. Join a class: guests only. */
  function _refreshHome() {
    var forTeachers = document.getElementById('btn-for-teachers');
    var joinClass   = document.getElementById('btn-join-class');
    if (forTeachers) forTeachers.style.display = _teacherPromptsAllowed() ? '' : 'none';
    if (joinClass)   joinClass.style.display = _signedIn() ? 'none' : '';
  }

  function refresh() { _refreshBanner(); _refreshHome(); }

  /* ── After the first battle win: the teacher card ──────────────────────── */
  var _cardPending = false, _cardTimer = null;
  function onBattleWin() {
    if (!inTeacherMode() || !_teacherPromptsAllowed() || _get(KEY_CARD_SHOWN) === '1') return;
    _cardPending = true;
    _waitForCalmThenCard();
  }
  // Wait until the player is back on the map with nothing else on screen (no
  // dialogue, no popup) — the win's own story beats come first.
  function _shown(id) {
    var el = document.getElementById(id);
    return !!(el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0');
  }
  function _calm() {
    if (_screen() !== 'overworld') return false;
    if (root.Overworld && typeof root.Overworld.isBusy === 'function' && root.Overworld.isBusy()) return false;
    var hud = document.getElementById('adv-hud');
    if (hud && hud.classList.contains('dialogue-mode')) return false;
    if (_shown('adv-card-reveal') || _shown('adv-post-battle-dim')) return false;
    return !document.querySelector('.guest-modal-backdrop.visible, .popup-backdrop.visible, #account-flow-backdrop.visible');
  }
  function _waitForCalmThenCard() {
    if (_cardTimer) return;
    var calmFor = 0;
    _cardTimer = setInterval(function () {
      if (!_cardPending || !_teacherPromptsAllowed()) { clearInterval(_cardTimer); _cardTimer = null; return; }
      calmFor = _calm() ? calmFor + 1 : 0;
      if (calmFor >= 4) { clearInterval(_cardTimer); _cardTimer = null; _cardPending = false; showTeacherCard('first-win'); }
    }, 500);
  }

  function showTeacherCard(reason) {
    var bd = document.getElementById('teacher-card-backdrop');
    if (!bd) return;
    // Only the after-first-win showing is once-only; the Teachers link
    // can open the same card any time without using it up.
    if (reason === 'first-win') _set(KEY_CARD_SHOWN, '1');
    _funnel('teacher_card_shown', { src: src(), step: reason || '' });
    bd.classList.add('visible');
  }
  function _hideCard() { var bd = document.getElementById('teacher-card-backdrop'); if (bd) bd.classList.remove('visible'); }

  function startTeacherSignup() {
    _set(KEY_TEACHER_MODE, '1');
    if (root.SogAccountUI && typeof root.SogAccountUI.openTeacherSignup === 'function') root.SogAccountUI.openTeacherSignup();
  }

  /* ── After signup: the class-link screen ───────────────────────────────── */
  // New teachers only. A returning teacher (result.existing) never gets the
  // "Your class link is ready" screen; callers route them to Welcome Back.
  function afterTeacherSignup(result, method) {
    _set(KEY_BANNER_HIDDEN, '1');
    refresh();
    if (result && result.existing) return;
    _funnel('teacher_signup_completed', { method: method || '', src: src() });
    showClassLink();
  }

  var _current = null;   // { code, label, teacherName }
  function _classLinkEl(id) { return document.getElementById(id); }

  function showClassLink(code) {
    var bd = _classLinkEl('teacher-classlink');
    if (!bd || !root.TeacherDashboard) return;
    bd.classList.add('visible');
    _classLinkEl('tcl-body').innerHTML = '<p class="tcl-loading">Making your class…</p>';
    var render = function (err, cls) {
      if (err && err.code === 'no-active-class') {
        _classLinkEl('tcl-body').innerHTML = '<p class="tcl-loading">All your classes are deactivated. ' +
          'Open the Teacher Dashboard on the home screen to make a new class code.</p>';
        return;
      }
      if (err || !cls) {
        console.error('[TeacherOnboard] Could not prepare the class', err);
        _classLinkEl('tcl-body').innerHTML = '<p class="tcl-loading">Couldn’t load your class just now. ' +
          'Try again from the Teacher Dashboard on the home screen.</p>';
        return;
      }
      _current = cls;
      _renderClassLink();
    };
    if (code) {
      firebase.firestore().collection('classes').doc(code).get().then(function (snap) {
        render(null, snap.exists ? Object.assign({ code: code }, snap.data()) : null);
      }).catch(function (e) { render(e, null); });
    } else {
      root.TeacherDashboard.ensureFirstClass(render);
    }
  }

  function _renderClassLink() {
    var c = _current, link = root.TeacherDashboard.joinLinkFor(c.code);
    var qr = root.SOG && root.SOG.QR ? root.SOG.QR.svg(link, { title: 'Class join link QR code' }) : '';
    var doc = root.TeacherDashboard.getTeacherDoc() || {};
    var name = doc.displayName || c.teacherName || '';
    _classLinkEl('tcl-body').innerHTML =
      '<div class="tcl-grid">' +
        '<div class="tcl-left">' +
          '<label class="tcl-label">Class link</label>' +
          '<div class="tcl-linkrow"><input class="tcl-link" id="tcl-link" readonly value="' + _esc(link) + '">' +
            '<button class="btn-snes" id="tcl-copy">COPY</button></div>' +
          '<div class="tcl-code">Class code: <strong>' + _esc(c.code) + '</strong></div>' +
          '<div class="tcl-nolink">No link? Students go to <strong>' + _esc(siteLabel(location.origin, location.pathname)) +
            '</strong>, click <strong>Join a class</strong> in the top-right corner and enter the code.</div>' +
          '<ol class="tcl-steps">' +
            '<li>Share the link (or show the QR / code).</li>' +
            '<li>Students pick a name — no emails.</li>' +
            '<li>Watch their progress in your dashboard.</li>' +
          '</ol>' +
          '<div class="tcl-fields">' +
            '<label class="tcl-label" for="tcl-name">Your name, as students see it</label>' +
            '<input class="account-flow-input tcl-input" id="tcl-name" maxlength="40" placeholder="e.g. Ms Rivera" value="' + _esc(name) + '">' +
            '<label class="tcl-label" for="tcl-class">Class name</label>' +
            '<input class="account-flow-input tcl-input" id="tcl-class" maxlength="40" placeholder="e.g. Period 3" value="' + _esc(c.label || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="tcl-right"><div class="tcl-qr">' + qr + '</div></div>' +
      '</div>';
    _classLinkEl('tcl-copy').addEventListener('click', function () {
      var btn = this;
      _copy(link, function () {
        _funnel('class_link_copied', { classCode: c.code });
        btn.textContent = 'COPIED ✓';
        setTimeout(function () { btn.textContent = 'COPY'; }, 1600);
      });
    });
    _classLinkEl('tcl-link').addEventListener('focus', function () { this.select(); });
    _classLinkEl('tcl-name').addEventListener('change', function () {
      var v = this.value.trim();
      if (v) root.TeacherDashboard.setTeacherName(v);
    });
    _classLinkEl('tcl-class').addEventListener('change', function () {
      var v = this.value.trim();
      if (v === (c.label || '')) return;
      c.label = v;
      root.TeacherDashboard.renameClass(c.code, v);
    });
  }

  function _copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { _copyFallback(text, done); });
    } else _copyFallback(text, done);
  }
  function _copyFallback(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    } catch (e) { root.prompt('Copy this link for your students:', text); }
  }

  function hideClassLink() { var bd = _classLinkEl('teacher-classlink'); if (bd) bd.classList.remove('visible'); }

  /* ── Projector view ────────────────────────────────────────────────────── */
  function showProjector() {
    if (!_current) return;
    var link = root.TeacherDashboard.joinLinkFor(_current.code);
    var el = _classLinkEl('teacher-projector');
    if (!el) return;
    _classLinkEl('tpj-qr').innerHTML = root.SOG && root.SOG.QR ? root.SOG.QR.svg(link, { title: 'Class join link QR code' }) : '';
    _classLinkEl('tpj-code').textContent = _current.code;
    _classLinkEl('tpj-site').textContent = siteLabel(location.origin, location.pathname);
    el.classList.add('visible');
    _funnel('class_link_projected', { classCode: _current.code });
    // Real full screen where the browser allows it; the overlay already fills the stage.
    try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {}
  }
  function hideProjector() {
    var el = _classLinkEl('teacher-projector');
    if (el) el.classList.remove('visible');
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
  }

  /* ── Student login card (non-blocking) ─────────────────────────────────── */
  function showLoginCard(creds, opts) {
    var el = document.getElementById('login-card-float');
    if (!el || !creds) return;
    opts = opts || {};
    document.getElementById('lcf-title').textContent = opts.firstTime ? 'Your login — save it!' : 'My login';
    document.getElementById('lcf-name').textContent = creds.username || '';
    document.getElementById('lcf-pass').textContent = creds.passphrase || 'Ask your teacher (it’s on their class list)';
    el.classList.add('visible');
  }
  function hideLoginCard() { var el = document.getElementById('login-card-float'); if (el) el.classList.remove('visible'); }
  function showMyLogin() {
    if (!root.SogAccount) return;
    root.SogAccount.getMyLogin(function (err, data) {
      if (err || !data) { showLoginCard({ username: '—', passphrase: 'Couldn’t load it — try again in a moment.' }, {}); return; }
      showLoginCard(data, {});
    });
  }

  /* ── Wiring ────────────────────────────────────────────────────────────── */
  function _on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

  function init() {
    _on('teacher-banner-go', function () { startTeacherSignup(); });
    _on('teacher-banner-close', function () { _set(KEY_BANNER_HIDDEN, '1'); _refreshBanner(); });
    _on('btn-for-teachers', function () {
      _set(KEY_TEACHER_MODE, '1');
      _set(KEY_BANNER_HIDDEN, '');
      refresh();
      showTeacherCard('for-teachers');
    });
    _on('teacher-card-yes', function () { _hideCard(); _funnel('teacher_card_accepted', { src: src() }); startTeacherSignup(); });
    _on('teacher-card-no', function () { _hideCard(); refresh(); });
    _on('tcl-projector', showProjector);
    _on('tcl-dashboard', function () {
      hideClassLink();
      if (root.TeacherDashboard && typeof root.TeacherDashboard.show === 'function') root.TeacherDashboard.show();
    });
    _on('tcl-close', hideClassLink);
    _on('tpj-close', hideProjector);
    _on('lcf-ok', hideLoginCard);
    _on('btn-join-class', function () {
      if (root.SogAccountUI && typeof root.SogAccountUI.openJoinClass === 'function') root.SogAccountUI.openJoinClass();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideProjector(); }
    });

    // Keep everything in step with auth, teacher status and screen changes.
    if (root.SogAuth) { root.SogAuth.ready(refresh); root.SogAuth.onChange(refresh); }
    if (root.TeacherDashboard && typeof root.TeacherDashboard.onStatusChange === 'function') root.TeacherDashboard.onStatusChange(refresh);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      new MutationObserver(_refreshBanner).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    }
    refresh();

    // Teacher link: straight into the game (no "I'm Ready", no intro video).
    // Deferred: js/home.js's own DOMContentLoaded init (registered after this
    // one) has to have run first.
    if (arrival.teacherLink) setTimeout(function () {
      if (root.HomeFlow && typeof root.HomeFlow.quickStart === 'function') root.HomeFlow.quickStart({ skipIntro: true });
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.TeacherOnboard = {
    isStudentDevice: isStudentDevice,
    inTeacherMode:   inTeacherMode,
    markStudentDevice: markStudentDevice,
    src:             src,
    refresh:         refresh,
    onBattleWin:     onBattleWin,
    showTeacherCard: showTeacherCard,
    startTeacherSignup: startTeacherSignup,
    afterTeacherSignup: afterTeacherSignup,
    showClassLink:   showClassLink,
    hideClassLink:   hideClassLink,
    showProjector:   showProjector,
    hideProjector:   hideProjector,
    showLoginCard:   showLoginCard,
    showMyLogin:     showMyLogin,
    parseTeacherLink: parseTeacherLink,
    stripTeacherParams: stripTeacherParams,
    siteLabel:       siteLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);

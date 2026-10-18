/**
 * teacher-dashboard.js — Teacher dashboard (AUTH_SPEC.md Phase 5)
 *
 * Class code generate/deactivate/regenerate + a roster view grouped by
 * class, queried on /players.teacherUid. No per-question correctness is
 * read, computed, or stored anywhere here — only the coarse metrics §6
 * calls for: furthest progress (highest boss/unit reached), learning-check
 * totals (correct/asked — never which questions), time played, and last
 * active. The teacher keeps the name↔username mapping in their own
 * spreadsheet (§6); this dashboard never asks for or shows a real student
 * name.
 *
 * Data model note: AUTH_SPEC.md §2's /teachers/{uid} doc (email, inviteCode,
 * displayName, createdAt) predates Phase 5's "teachers can own multiple
 * classes" requirement, and firestore.rules denies `list` on /classes
 * entirely (anti-enumeration, §3) — so there is no query that finds "all
 * classes owned by me". This module adds a `classCodes: array<string>` field
 * to the teacher doc (arrayUnion'd on generate) purely as a client-side
 * index of which class IDs to re-fetch by exact ID (get is allowed). This
 * fits the ALREADY-DEPLOYED /teachers update rule with no rules change: that
 * rule only pins `inviteCode` unchanged, and doesn't touch anything else.
 *
 * In-game modal, not a screen: #teacher-dashboard-backdrop overlays whatever
 * screen is currently showing (the game stays exactly where it was) and only
 * opens on an explicit click — the home screen's "Teacher Dashboard" button
 * (js/home.js), itself only visible once a /teachers/{uid} doc is confirmed
 * for the signed-in user. Nothing here auto-opens the modal.
 *
 * Status tracking still listens to window.SogAuth directly (ready() once at
 * boot, onChange() on every subsequent auth transition) and re-checks
 * whether the signed-in user has a /teachers/{uid} doc — covering fresh
 * signup, a fresh login, and a returning teacher's persisted session on
 * reload, from one code path. But instead of taking over navigation itself,
 * it just caches the result and notifies onStatusChange() subscribers (home.js
 * uses this to show/hide its button). A non-teacher (guest or student)
 * always resolves "no such doc" and never sees the dashboard mentioned
 * anywhere.
 */
window.TeacherDashboard = (function () {
  'use strict';

  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // INVARIANT: class codes are always exactly 6 characters and invite codes
  // exactly 8. js/account.js's lookupClassCode (student signup class-code
  // field, maxlength=6) and the teacher-signup form's invite-code field
  // (maxlength=8) both assume these fixed lengths. Changing CLASS_CODE_LENGTH
  // here without updating those call sites will silently break signup.
  var CLASS_CODE_LENGTH = 6;
  var MAX_GENERATE_ATTEMPTS = 5;

  // Canonical story order, earliest → latest — each entry's `key` matches a
  // js/save-state.js MODULES name whose own snapshot carries a
  // `battleComplete` boolean. "Furthest progress" walks this in order and
  // keeps the LAST entry whose battleComplete is true — deciding by the
  // flag's value, never by list position, per the same principle
  // js/overworld.js's milestone-visibility logic already documents (a save
  // with flags set out of order — dev panel, an unusual route — must still
  // resolve correctly). Order confirmed against data/map-data.js's
  // `milestones` array and game_script.md's PART sequence.
  var PROGRESSION_ORDER = [
    { key: 'prehistory',     bossName: 'Neanderthal',    unitName: 'Prehistory' },
    { key: 'otzi',           bossName: 'Otzi',           unitName: 'Prehistory' },
    { key: 'gilgamesh',      bossName: 'Gilgamesh',      unitName: 'Mesopotamia' },
    { key: 'sargon',         bossName: 'Sargon',         unitName: 'Mesopotamia' },
    { key: 'hammurabi',      bossName: 'Hammurabi',      unitName: 'Mesopotamia' },
    { key: 'hangingGardens', bossName: 'Nebuchadnezzar', unitName: 'Mesopotamia' },
    { key: 'narmer',         bossName: 'Narmer',         unitName: 'Egypt' }
  ];

  // Every boss after Narmer comes from data/map-data.js instead of a list:
  // its battle nodes, in the story order of the milestone that reveals each
  // one (`showFrom`), keeping those revealed after Narmer's own milestone.
  // These bosses have no save module of their own — a win is the generic
  // sog_node_<hook>_<tier>_beaten flag (js/game.js endGame), carried in the
  // `nodeProgress` snapshot. Built on first use: map-data.js loads after
  // this file, and the map data never changes at runtime.
  var _nodeProgression = null;
  function _getNodeProgression() {
    if (_nodeProgression) return _nodeProgression;
    var data = window.SOG_MAP_DATA;
    if (!data || !data.maps || !data.milestones) return [];
    var order = {};
    data.milestones.forEach(function (m, i) { order[m.id] = i; });
    var after = null, nodes = [];
    Object.keys(data.maps).forEach(function (mapId) {
      var map = data.maps[mapId];
      (map.nodes || []).forEach(function (n) {
        if (n.kind !== 'battle' || !n.hook) return;
        if (n.hook === 'narmer') after = order[n.showFrom];
        // A node whose showFrom isn't a known milestone can't be placed.
        if (order[n.showFrom] === undefined) return;
        nodes.push({ hook: n.hook, bossName: n.name, unitName: map.displayName || '',
                     rank: order[n.showFrom], seq: nodes.length });
      });
    });
    if (after === undefined || after === null) return [];
    _nodeProgression = nodes
      .filter(function (e) { return e.rank > after; })
      .sort(function (a, b) { return (a.rank - b.rank) || (a.seq - b.seq); });
    return _nodeProgression;
  }

  var _teacherDoc = null;
  var _lastRoster = { players: [], classes: [] };

  function _db() { return firebase.firestore(); }
  function _byId(id) { return document.getElementById(id); }

  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _randomCode(len) {
    var s = '';
    for (var i = 0; i < len; i++) {
      s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    }
    return s;
  }

  /* ── Class code CRUD (AUTH_SPEC.md §4 "Class code creation (teacher)") ──
     Generate: attempt create at /classes/{CODE}; a collision (code already
     owned by someone) fails the rules' create/update check as
     permission-denied — retry with a fresh candidate. 32^6 ≈ 1.07 billion
     combinations, so a real collision is vanishingly rare; the retry cap
     exists only as a backstop. */
  function _generateClassCode(label, cb, attempt) {
    attempt = attempt || 1;
    var code = _randomCode(CLASS_CODE_LENGTH);
    var uid = firebase.auth().currentUser.uid;

    _db().collection('classes').doc(code).set({
      ownerUid:    uid,
      label:       (label || '').trim(),
      // Shown to students on the join screen ("Joining Ms Rivera's class") —
      // the teacher doc itself is readable by its owner only.
      teacherName: (_teacherDoc && _teacherDoc.displayName) || '',
      active:      true,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      _db().collection('teachers').doc(uid).update({
        classCodes: firebase.firestore.FieldValue.arrayUnion(code)
      }).then(function () {
        cb(null, code);
      }).catch(function (err) {
        console.error('[TeacherDashboard] Class created but failed to record on teacher doc', err);
        cb(err, null);
      });
    }).catch(function (err) {
      console.error('[TeacherDashboard] Class code create failed (attempt ' + attempt + ')', err);
      if (err && err.code === 'permission-denied' && attempt < MAX_GENERATE_ATTEMPTS) {
        _generateClassCode(label, cb, attempt + 1);
        return;
      }
      cb(err, null);
    });
  }

  function _deactivateClassCode(code, cb) {
    _db().collection('classes').doc(code).update({ active: false }).then(function () {
      cb(null);
    }).catch(function (err) {
      console.error('[TeacherDashboard] Deactivate failed', err);
      cb(err);
    });
  }

  // Deactivate-and-reroll: a code's identity IS its doc ID, so it can't be
  // edited in place. Regenerate deactivates the leaked code and creates a
  // brand new one carrying over the same label, so "Period 3" doesn't need
  // retyping.
  function _regenerateClassCode(oldCode, cb) {
    _db().collection('classes').doc(oldCode).get().then(function (snap) {
      var label = snap.exists ? (snap.data().label || '') : '';
      _deactivateClassCode(oldCode, function (deactErr) {
        if (deactErr) { cb(deactErr, null); return; }
        _generateClassCode(label, cb);
      });
    }).catch(function (err) { cb(err, null); });
  }

  function _updateClassLabel(code, label, cb) {
    _db().collection('classes').doc(code).update({ label: (label || '').trim() })
      .then(function () { cb(null); })
      .catch(function (err) {
        console.error('[TeacherDashboard] Label update failed', err);
        cb(err);
      });
  }

  /* ── First class (open signup) ──────────────────────────────────────────
     Right after signup the teacher lands on a class-link screen, so their
     first class is made for them ("My Class", renamable). Idempotent: an
     existing active class is reused rather than a second one created.
     cb(err, { code, label, teacherName }) */
  function ensureFirstClass(cb) {
    var user = firebase.auth().currentUser;
    if (!user) { cb(new Error('Signed out.'), null); return; }
    _db().collection('teachers').doc(user.uid).get().then(function (snap) {
      _teacherDoc = snap.exists ? snap.data() : _teacherDoc;
      _notifyStatus();
      var codes = (_teacherDoc && _teacherDoc.classCodes) || [];
      _loadClasses(codes, function (classes) {
        var active = classes.filter(function (c) { return c.active; });
        if (active.length) { cb(null, active[0]); return; }
        _generateClassCode('My Class', function (err, code) {
          if (err) { cb(err, null); return; }
          _refreshTeacherDocQuiet();
          cb(null, { code: code, label: 'My Class', teacherName: (_teacherDoc && _teacherDoc.displayName) || '' });
        });
      });
    }).catch(function (err) { cb(err, null); });
  }

  function _refreshTeacherDocQuiet() {
    var user = firebase.auth().currentUser;
    if (!user) return;
    _db().collection('teachers').doc(user.uid).get().then(function (snap) {
      if (snap.exists) { _teacherDoc = snap.data(); _notifyStatus(); }
    }).catch(function () {});
  }

  /* The name students see on the join screen. Saved on the teacher doc and
     copied onto every class this teacher owns (classes are what students can
     read). Never derived from the email. */
  function setTeacherName(name, cb) {
    var user = firebase.auth().currentUser;
    name = String(name || '').trim().slice(0, 40);
    if (!user || !name) { if (cb) cb(new Error('No name.')); return; }
    var codes = (_teacherDoc && _teacherDoc.classCodes) || [];
    var writes = [_db().collection('teachers').doc(user.uid).set({ displayName: name }, { merge: true })]
      .concat(codes.map(function (c) { return _db().collection('classes').doc(c).update({ teacherName: name }).catch(function () {}); }));
    Promise.all(writes).then(function () {
      if (_teacherDoc) _teacherDoc.displayName = name;
      _notifyStatus();
      if (cb) cb(null);
    }).catch(function (err) { console.error('[TeacherDashboard] Saving the teacher name failed', err); if (cb) cb(err); });
  }

  function renameClass(code, label, cb) { _updateClassLabel(code, label, cb || function () {}); }

  /* ── Data loading ────────────────────────────────────────────────────── */
  function _loadClasses(codes, cb) {
    if (!codes || !codes.length) { cb([]); return; }
    Promise.all(codes.map(function (code) {
      return _db().collection('classes').doc(code).get().then(function (snap) {
        return snap.exists ? Object.assign({ code: code }, snap.data()) : null;
      }).catch(function (err) {
        console.error('[TeacherDashboard] Failed to load class', code, err);
        return null;
      });
    })).then(function (results) {
      cb(results.filter(Boolean));
    });
  }

  // Coarse only — §6: furthest progress, aggregate learning-check counts,
  // time played, last active. Do not store or read per-question
  // correctness anywhere. This reads the existing progress snapshot
  // (already written by Phase 3 signup/checkpoints) and aggregates it for
  // display; nothing new is computed into storage.
  function _computeCoarseStats(progress) {
    var modules = (progress && progress.modules) || {};

    var furthest = null;
    PROGRESSION_ORDER.forEach(function (entry) {
      if (modules[entry.key] && modules[entry.key].battleComplete === true) {
        furthest = entry;   // walk in canonical order — last true wins
      }
    });
    // Either tier counts: a one-tier boss (Darius, Hannibal) stamps Giant.
    var flags = modules.nodeProgress || {};
    _getNodeProgression().forEach(function (entry) {
      var k = 'sog_node_' + entry.hook + '_';
      if (flags[k + 'serf_beaten'] === 'true' || flags[k + 'giant_beaten'] === 'true') {
        furthest = entry;
      }
    });

    var lc = modules.learningCheck || {};
    var learningTotal   = lc.total   || 0;
    var learningCorrect = lc.correct || 0;

    var playtimeSeconds = (modules.playtime && modules.playtime.totalSeconds) || 0;

    return {
      furthestProgress: furthest ? (furthest.bossName + ' / ' + furthest.unitName) : '—',
      learningCorrect:  learningCorrect,
      learningTotal:    learningTotal,
      playtimeSeconds:  playtimeSeconds
    };
  }

  // m or h+m, e.g. "45m", "1h 12m" — "—" for no recorded time yet.
  function _formatDuration(totalSeconds) {
    if (!totalSeconds) return '—';
    var totalMinutes = Math.floor(totalSeconds / 60);
    var hours   = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  }

  // Teachers also get their own /players/{uid} doc now (js/account.js
  // _createTeacherDocFor) so their adventure progress cloud-saves too — but it's
  // written with teacherUid: '' (ungrouped, same as a classless student), so
  // it can never match this where('teacherUid','==',uid) query, including
  // for the teacher's own uid. No extra filtering needed here.
  function _loadRoster(uid, cb) {
    _db().collection('players').where('teacherUid', '==', uid).get().then(function (snap) {
      var players = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        var stats = _computeCoarseStats(data.progress);
        players.push({
          uid:              doc.id,
          username:         data.username,
          // Written at signup by js/account.js signUpStudent so a lost card is
          // recoverable. Readable only by this student and this teacher
          // (firestore.rules). Blank for accounts created before that shipped.
          passphrase:       data.passphrase || '',
          classCode:        data.classCode,
          furthestProgress: stats.furthestProgress,
          learningCorrect:  stats.learningCorrect,
          learningTotal:    stats.learningTotal,
          playtimeSeconds:  stats.playtimeSeconds,
          lastActive:       data.lastActive
        });
      });
      cb(null, players);
    }).catch(function (err) {
      console.error('[TeacherDashboard] Roster query failed', err);
      cb(err, []);
    });
  }

  /* ── Rendering ──────────────────────────────────────────────────────── */
  function _formatDate(ts) {
    if (!ts) return '—';
    try {
      var date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return '—'; }
  }

  /* Join link for a class: the student clicks it and lands straight in the
     signup flow with this class pre-filled (js/account-ui.js init). Built off
     location so it works on the live site, a localhost dev server or a
     preview copy without anything to configure. */
  function joinLinkFor(code) {
    return location.origin + location.pathname + '?join=' + encodeURIComponent(code);
  }

  function _renderClassRow(c, isInactive) {
    return '<div class="td-class-row' + (isInactive ? ' td-class-row-inactive' : '') + '">' +
      '<div class="td-class-code">' + _escapeHtml(c.code) + '</div>' +
      '<input type="text" class="td-class-label-input" data-code="' + _escapeHtml(c.code) + '" ' +
        'value="' + _escapeHtml(c.label || '') + '" placeholder="Class label (e.g. Period 3)"' +
        (isInactive ? ' disabled' : '') + '>' +
      (isInactive
        ? '<span class="td-class-badge">INACTIVE</span>'
        : '<button class="btn-snes td-share-btn" data-code="' + _escapeHtml(c.code) + '">LINK &amp; QR</button>' +
          '<button class="btn-snes td-copy-link-btn" data-code="' + _escapeHtml(c.code) + '">COPY JOIN LINK</button>' +
          '<button class="btn-snes td-regenerate-btn" data-code="' + _escapeHtml(c.code) + '">REGENERATE</button>' +
          '<button class="btn-snes btn-snes-remove td-deactivate-btn" data-code="' + _escapeHtml(c.code) + '">DEACTIVATE</button>') +
      (isInactive ? '' :
        '<div class="td-join-link"><span>Share with students:</span> ' +
          '<code class="td-join-link-url">' + _escapeHtml(joinLinkFor(c.code)) + '</code></div>') +
      '</div>';
  }

  function _renderClasses(classes) {
    var active   = classes.filter(function (c) { return c.active; });
    var inactive = classes.filter(function (c) { return !c.active; });

    var html = '<button class="btn-snes" id="td-generate">GENERATE NEW CLASS CODE</button>';

    html += '<div id="td-class-list">';
    if (!active.length) {
      html += '<p class="td-empty">No active classes yet — generate one above.</p>';
    }
    active.forEach(function (c) { html += _renderClassRow(c, false); });
    html += '</div>';

    if (inactive.length) {
      html += '<div id="td-inactive-toggle"><a href="#" id="td-show-inactive">Show ' +
        inactive.length + ' deactivated code' + (inactive.length === 1 ? '' : 's') + '</a></div>';
      html += '<div id="td-inactive-list" style="display:none">';
      inactive.forEach(function (c) { html += _renderClassRow(c, true); });
      html += '</div>';
    }

    return html;
  }

  function _renderRoster(players, classes) {
    var labelByCode = {};
    classes.forEach(function (c) { labelByCode[c.code] = c.label || c.code; });

    var byClass = {};
    players.forEach(function (p) {
      var key = p.classCode || '';
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(p);
    });

    var codes = Object.keys(byClass);
    if (!codes.length) return '<p class="td-empty">No students yet. Share a class link — students pick a name and appear here.</p>';

    // Shared Chromebooks: one card per student with name, passphrase, class
    // code and a QR that fills in their login.
    var printable = players.some(function (p) { return p.passphrase; });
    var html = printable ? '<button class="btn-snes" id="td-print-cards">PRINT LOGIN CARDS</button>' : '';
    codes.forEach(function (code) {
      var label = code === '' ? 'Ungrouped' : (labelByCode[code] || code);
      html += '<div class="td-roster-group">';
      html += '<div class="td-roster-group-title">' + _escapeHtml(label) + ' (' + byClass[code].length + ')</div>';
      html += '<table class="td-roster-table"><thead><tr>' +
        '<th>Username</th><th>Password</th><th>Furthest Progress</th><th>Learning Checks</th><th>Time Played</th><th>Last Active</th>' +
        '</tr></thead><tbody>';
      byClass[code].forEach(function (p) {
        var learningText = p.learningTotal > 0 ? (p.learningCorrect + ' / ' + p.learningTotal) : '—';
        // Hidden until clicked: this is a working login, and a roster is often
        // on a projector. '—' means the account predates passphrase storage
        // (or the student joined no class), and can't be recovered.
        var passCell = p.passphrase
          ? '<button class="td-reveal-btn" data-pass="' + _escapeHtml(p.passphrase) + '">Show</button>'
          : '—';
        html += '<tr>' +
          '<td>' + _escapeHtml(p.username) + '</td>' +
          '<td class="td-pass-cell">' + passCell + '</td>' +
          '<td>' + _escapeHtml(p.furthestProgress) + '</td>' +
          '<td>' + _escapeHtml(learningText) + '</td>' +
          '<td>' + _escapeHtml(_formatDuration(p.playtimeSeconds)) + '</td>' +
          '<td>' + _formatDate(p.lastActive) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    });
    return html;
  }

  // Funnel: the first time this teacher's roster shows a student. Recorded on
  // the teacher doc (owner-writable) so it fires once per teacher, not once
  // per device. Counts only — no student details are logged.
  function _noteFirstStudent(uid, players) {
    if (!players.length || !_teacherDoc || _teacherDoc.firstStudentAt) return;
    _teacherDoc.firstStudentAt = true;
    _db().collection('teachers').doc(uid).set({ firstStudentAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch(function () {});
    if (window.Analytics && typeof window.Analytics.funnel === 'function') window.Analytics.funnel('first_student_joined', { teacherUid: uid });
  }

  /* ── Printable login cards ─────────────────────────────────────────────
     One card per student who has a stored passphrase: username, passphrase,
     class code, and a QR whose link carries the login in the URL fragment
     (#login=…, never sent to a server; the game wipes it from the address
     bar on arrival and pre-fills the login form). Printed from an in-page
     container that print CSS isolates (body.printing-login-cards). */
  function printLoginCards() {
    var players = (_lastRoster.players || []).filter(function (p) { return p.passphrase; });
    if (!players.length) { alert('No students with a stored password yet.'); return; }
    var labelByCode = {};
    (_lastRoster.classes || []).forEach(function (c) { labelByCode[c.code] = c.label || c.code; });
    var base = location.origin + location.pathname;
    var qr = window.SOG && window.SOG.QR;
    var html = players.sort(function (a, b) { return (a.classCode + a.username).localeCompare(b.classCode + b.username); })
      .map(function (p) {
        var link = base + window.SogAccount.loginFragmentFor(p.username, p.passphrase);
        return '<div class="login-card">' +
          '<div class="login-card-title">Shoulders of Giants</div>' +
          '<div class="login-card-row"><span>Name</span><strong>' + _escapeHtml(p.username) + '</strong></div>' +
          '<div class="login-card-row"><span>Password</span><strong>' + _escapeHtml(p.passphrase) + '</strong></div>' +
          '<div class="login-card-row"><span>Class</span><strong>' + _escapeHtml(p.classCode || '—') +
            (labelByCode[p.classCode] ? ' · ' + _escapeHtml(labelByCode[p.classCode]) : '') + '</strong></div>' +
          '<div class="login-card-qr">' + (qr ? qr.svg(link, { title: 'Scan to log in' }) : '') + '</div>' +
          '<div class="login-card-hint">Scan to log in, or click Log in (top right) and type your name and password.</div>' +
        '</div>';
      }).join('');
    var box = document.getElementById('login-cards-print');
    if (!box) { box = document.createElement('div'); box.id = 'login-cards-print'; document.body.appendChild(box); }
    box.innerHTML = html;
    document.body.classList.add('printing-login-cards');
    var done = function () { document.body.classList.remove('printing-login-cards'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    if (window.Analytics && typeof window.Analytics.funnel === 'function') window.Analytics.funnel('login_cards_printed', {});
    window.print();
    setTimeout(done, 60000);   // afterprint isn't fired everywhere
  }

  function _copyFallback(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      window.prompt('Copy this link for your students:', text);
    }
  }

  function _wireEvents(classes) {
    var generateBtn = _byId('td-generate');
    if (generateBtn) generateBtn.addEventListener('click', function () {
      generateBtn.disabled = true;
      _generateClassCode('', function (err) {
        if (err) {
          console.error('[TeacherDashboard] Generate failed', err);
          alert('Could not create a new class code. Please try again.');
          generateBtn.disabled = false;
          return;
        }
        _refreshTeacherDoc();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.td-copy-link-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var link = joinLinkFor(btn.getAttribute('data-code'));
        var done = function () {
          var was = btn.textContent;
          btn.textContent = 'COPIED';
          setTimeout(function () { btn.textContent = was; }, 1500);
        };
        // navigator.clipboard needs a secure context (https / localhost); the
        // textarea fallback keeps this working anywhere else.
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done, function () { _copyFallback(link, done); });
        } else {
          _copyFallback(link, done);
        }
      });
    });

    // Delegated: _wireEvents runs while the roster is still "Loading…", so the
    // reveal buttons don't exist yet — and the roster re-renders on its own
    // afterwards. Binding to the container covers every render.
    Array.prototype.forEach.call(document.querySelectorAll('.td-share-btn'), function (btn) {
      btn.addEventListener('click', function () {
        if (window.TeacherOnboard && typeof window.TeacherOnboard.showClassLink === 'function') {
          hide();
          window.TeacherOnboard.showClassLink(btn.getAttribute('data-code'));
        }
      });
    });

    var rosterEl = _byId('td-roster');
    if (rosterEl && !rosterEl._revealWired) {
      rosterEl._revealWired = true;
      rosterEl.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'td-print-cards') { printLoginCards(); return; }
        var btn = e.target && e.target.closest ? e.target.closest('.td-reveal-btn') : null;
        if (!btn || !rosterEl.contains(btn)) return;
        btn.parentNode.textContent = btn.getAttribute('data-pass');
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.td-regenerate-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-code');
        if (!window.confirm('Regenerate this class code? The old code (' + code + ') will stop working immediately.')) return;
        btn.disabled = true;
        _regenerateClassCode(code, function (err) {
          if (err) {
            console.error('[TeacherDashboard] Regenerate failed', err);
            alert('Could not regenerate the class code. Please try again.');
            btn.disabled = false;
            return;
          }
          _refreshTeacherDoc();
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.td-deactivate-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-code');
        if (!window.confirm('Deactivate class code ' + code + '? Students will no longer be able to join with it.')) return;
        btn.disabled = true;
        _deactivateClassCode(code, function (err) {
          if (err) {
            console.error('[TeacherDashboard] Deactivate failed', err);
            alert('Could not deactivate. Please try again.');
            btn.disabled = false;
            return;
          }
          _render(classes);
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.td-class-label-input'), function (input) {
      input.addEventListener('change', function () {
        _updateClassLabel(input.getAttribute('data-code'), input.value, function (err) {
          if (err) alert('Could not save that label. Please try again.');
        });
      });
    });

    var showInactive = _byId('td-show-inactive');
    if (showInactive) showInactive.addEventListener('click', function (e) {
      e.preventDefault();
      _byId('td-inactive-list').style.display = '';
      showInactive.parentNode.style.display = 'none';
    });
  }

  function _render(classes) {
    var uid = firebase.auth().currentUser.uid;
    // Never fall back to _teacherDoc.email here — a teacher may have this
    // modal open while demoing on a projector, and their real email must
    // never appear in any game UI. displayName is a required field at
    // signup (see js/account-ui.js _submitTeacherSignup), so this only
    // ever shows the generic fallback in the unlikely case it's missing.
    _byId('td-teacher-name').textContent = (_teacherDoc && _teacherDoc.displayName) || 'Teacher';
    // Offered until this account has Google linked (password teachers).
    var connectBtn = _byId('td-connect-google');
    if (connectBtn) {
      var providers = (firebase.auth().currentUser.providerData || []).map(function (p) { return p && p.providerId; });
      connectBtn.style.display = providers.indexOf('google.com') === -1 ? '' : 'none';
    }
    _byId('td-classes').innerHTML = _renderClasses(classes);
    _byId('td-roster').innerHTML = '<p class="td-empty">Loading roster…</p>';
    _wireEvents(classes);

    _loadRoster(uid, function (err, players) {
      _lastRoster = { players: players || [], classes: classes };
      _byId('td-roster').innerHTML = _renderRoster(players, classes);
      _noteFirstStudent(uid, players || []);
    });
  }

  function _fullRender() {
    var codes = (_teacherDoc && _teacherDoc.classCodes) || [];
    _loadClasses(codes, function (classes) {
      _render(classes);
    });
  }

  function _refreshTeacherDoc() {
    var uid = firebase.auth().currentUser.uid;
    _db().collection('teachers').doc(uid).get().then(function (snap) {
      _teacherDoc = snap.exists ? snap.data() : _teacherDoc;
      _fullRender();
    }).catch(function (err) {
      console.error('[TeacherDashboard] Failed to reload teacher doc', err);
      _fullRender();
    });
  }

  /* ── Show / hide (modal) ───────────────────────────────────────────
     show() is only ever called from an explicit user action (the home
     screen's button) — never automatically. Closing just drops the
     .visible class; the screen underneath was never touched, so "closing
     returns to the home screen" falls out naturally rather than needing
     its own navigation logic. */
  function show() {
    if (!_teacherDoc) return;   // safety net — the button that calls this is already gated on isTeacher()
    var backdrop = _byId('teacher-dashboard-backdrop');
    if (!backdrop) return;
    backdrop.classList.add('visible');
    _fullRender();
  }

  // Right after a teacher account is created: the status check that fills
  // _teacherDoc may not have seen the new /teachers doc yet, so read it now.
  function showAfterSignup() {
    var user = firebase.auth().currentUser;
    if (!user) return;
    _db().collection('teachers').doc(user.uid).get().then(function (snap) {
      _teacherDoc = snap.exists ? snap.data() : null;
      _notifyStatus();
      show();
    }).catch(function (err) {
      console.error('[TeacherDashboard] Could not load the new teacher doc', err);
      location.reload();
    });
  }

  function hide() {
    var backdrop = _byId('teacher-dashboard-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
  }

  /* ── Teacher-status tracking ──────────────────────────────────────
     Re-checked on every SogAuth transition (see module doc comment above).
     Purely informational from here on — onStatusChange() subscribers (home.js)
     decide what to do with it; this module no longer navigates on its own. */
  var _statusListeners = [];

  function _notifyStatus() {
    _statusListeners.forEach(function (cb) {
      try { cb(_teacherDoc); } catch (e) {}
    });
  }

  function _checkStatus() {
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function' ? window.SogAuth.getUser() : null;
    if (!user || user.isAnonymous) {
      _teacherDoc = null;
      _notifyStatus();
      return;
    }
    _db().collection('teachers').doc(user.uid).get().then(function (snap) {
      _teacherDoc = snap.exists ? snap.data() : null;
      _notifyStatus();
    }).catch(function (e) {
      console.error('[TeacherDashboard] Teacher-doc check failed', e);
      _teacherDoc = null;
      _notifyStatus();
    });
  }

  function isTeacher() { return !!_teacherDoc; }

  /* Who may open the developer / teacher tooling (the backtick dev panel, the
     triple-click teacher menu, the battle-lobby chooser): a signed-in user with a
     /teachers/{uid} doc, or a trusted LOCAL host (localhost / file://) so local
     dev stays frictionless. Replaces the plaintext client-side passwords those
     three gates used to compare against. Client-side only — it stops discovery
     of the tools, it is not a security boundary (Firestore rules are). */
  function _isTrustedHost() {
    try {
      if (location.protocol === 'file:') return true;
      var h = location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
    } catch (e) { return false; }
  }
  // Open signup made "has a teacher doc" too easy a bar for the cheat tools:
  // only the original invite-code teachers (inviteCode set) or a teacher the
  // owner flags devTools:true in the console qualify. Open-signup teachers get
  // the dashboard, not the dev panel.
  function devToolsAllowed() {
    if (_isTrustedHost()) return true;
    return !!(_teacherDoc && ((_teacherDoc.inviteCode && _teacherDoc.inviteCode !== '') || _teacherDoc.devTools === true));
  }
  function getTeacherDoc() { return _teacherDoc; }

  /**
   * @param {function(teacherDocOrNull)} cb  Fires immediately with whatever
   *   is currently known (mirrors SogAuth.ready()'s "late subscriber still
   *   gets current state" behavior — home.js doesn't have to guess whether
   *   the first _checkStatus() has resolved yet), then again on every
   *   subsequent change.
   */
  function onStatusChange(cb) {
    if (typeof cb !== 'function') return;
    _statusListeners.push(cb);
    cb(_teacherDoc);
  }

  function init() {
    var logoutBtn = _byId('td-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      if (window.confirm('Log out?')) window.SogAccount.logout();
    });

    var closeBtn = _byId('td-close');
    if (closeBtn) closeBtn.addEventListener('click', hide);

    // Links Google to this same uid (js/account-ui.js _connectGoogle): the
    // popup opens straight from this click so it isn't blocked.
    var connectBtn = _byId('td-connect-google');
    if (connectBtn) connectBtn.addEventListener('click', function () {
      hide();
      if (window.SogAccountUI && typeof window.SogAccountUI.connectGoogle === 'function') window.SogAccountUI.connectGoogle();
    });

    var lobbyBtn = _byId('td-open-lobby');
    // Multiplayer temporarily disabled (js/feature-flags.js) — hide the
    // button entirely rather than just no-op the click, so Tournament mode
    // isn't reachable from the dashboard at all. Flip the flag back to
    // re-enable; nothing else here needs to change.
    if (lobbyBtn && window.SOG_FEATURES && window.SOG_FEATURES.MULTIPLAYER_ENABLED === false) {
      lobbyBtn.style.display = 'none';
    } else if (lobbyBtn) {
      lobbyBtn.addEventListener('click', function () {
        // Close first, matching the dev menu's old open-lobby behavior
        // (close() then showTeacherLobby()) — two stacked dark overlays would
        // otherwise compound to a near-total blackout of the game behind them.
        hide();
        if (window.Multiplayer && typeof window.Multiplayer.showTeacherLobby === 'function') {
          window.Multiplayer.showTeacherLobby();
        }
      });
    }

    if (window.SogAuth) {
      window.SogAuth.ready(_checkStatus);
      window.SogAuth.onChange(_checkStatus);
    }
  }

  // Script tag loads before js/home.js on purpose (see the require-order
  // comment in index.html) specifically so home.js's own synchronous,
  // same-pattern init() below can find onStatusChange already defined.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init:           init,
    show:           show,
    showAfterSignup: showAfterSignup,
    hide:           hide,
    isTeacher:      isTeacher,
    devToolsAllowed: devToolsAllowed,
    ensureFirstClass: ensureFirstClass,
    setTeacherName: setTeacherName,
    renameClass:    renameClass,
    joinLinkFor:    joinLinkFor,
    printLoginCards: printLoginCards,
    getTeacherDoc:  getTeacherDoc,
    onStatusChange: onStatusChange
  };
})();

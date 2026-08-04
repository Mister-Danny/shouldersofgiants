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

  var _teacherDoc = null;

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
      ownerUid:  uid,
      label:     (label || '').trim(),
      active:    true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
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

  function _loadRoster(uid, cb) {
    _db().collection('players').where('teacherUid', '==', uid).get().then(function (snap) {
      var players = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        var stats = _computeCoarseStats(data.progress);
        players.push({
          uid:              doc.id,
          username:         data.username,
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

  function _renderClassRow(c, isInactive) {
    return '<div class="td-class-row' + (isInactive ? ' td-class-row-inactive' : '') + '">' +
      '<div class="td-class-code">' + _escapeHtml(c.code) + '</div>' +
      '<input type="text" class="td-class-label-input" data-code="' + _escapeHtml(c.code) + '" ' +
        'value="' + _escapeHtml(c.label || '') + '" placeholder="Class label (e.g. Period 3)"' +
        (isInactive ? ' disabled' : '') + '>' +
      (isInactive
        ? '<span class="td-class-badge">INACTIVE</span>'
        : '<button class="btn-snes td-regenerate-btn" data-code="' + _escapeHtml(c.code) + '">REGENERATE</button>' +
          '<button class="btn-snes btn-snes-remove td-deactivate-btn" data-code="' + _escapeHtml(c.code) + '">DEACTIVATE</button>') +
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
    if (!codes.length) return '<p class="td-empty">No students yet.</p>';

    var html = '';
    codes.forEach(function (code) {
      var label = code === '' ? 'Ungrouped' : (labelByCode[code] || code);
      html += '<div class="td-roster-group">';
      html += '<div class="td-roster-group-title">' + _escapeHtml(label) + ' (' + byClass[code].length + ')</div>';
      html += '<table class="td-roster-table"><thead><tr>' +
        '<th>Username</th><th>Furthest Progress</th><th>Learning Checks</th><th>Time Played</th><th>Last Active</th>' +
        '</tr></thead><tbody>';
      byClass[code].forEach(function (p) {
        var learningText = p.learningTotal > 0 ? (p.learningCorrect + ' / ' + p.learningTotal) : '—';
        html += '<tr>' +
          '<td>' + _escapeHtml(p.username) + '</td>' +
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
    _byId('td-classes').innerHTML = _renderClasses(classes);
    _byId('td-roster').innerHTML = '<p class="td-empty">Loading roster…</p>';
    _wireEvents(classes);

    _loadRoster(uid, function (err, players) {
      _byId('td-roster').innerHTML = _renderRoster(players, classes);
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

    var lobbyBtn = _byId('td-open-lobby');
    if (lobbyBtn) lobbyBtn.addEventListener('click', function () {
      // Close first, matching the dev menu's old open-lobby behavior
      // (close() then showTeacherLobby()) — two stacked dark overlays would
      // otherwise compound to a near-total blackout of the game behind them.
      hide();
      if (window.Multiplayer && typeof window.Multiplayer.showTeacherLobby === 'function') {
        window.Multiplayer.showTeacherLobby();
      }
    });

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
    hide:           hide,
    isTeacher:      isTeacher,
    getTeacherDoc:  getTeacherDoc,
    onStatusChange: onStatusChange
  };
})();

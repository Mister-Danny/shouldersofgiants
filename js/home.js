/**
 * home.js
 * Shoulders of Giants — Home Screen Entry Flow
 *
 * Three states:
 *   1. Initial         — "I'm Ready" (+ "I'm Ready to Learn" if returning visitor)
 *   2. Path choice     — Arcadium | Adventure | Online Versus
 *   3. Adventure pick  — female / male adventurers walk in; pick one → door/iris → video → overworld
 *
 * localStorage:
 *   sog_first_visit_complete   — once true, returning visitor gets the Learn button
 *   sog_selected_adventurer    — 'female' or 'male'
 */

var HomeFlow = (function () {
  'use strict';

  var KEY_FIRST_VISIT       = 'sog_first_visit_complete';
  var KEY_ADVENTURER        = 'sog_selected_adventurer';
  var KEY_ADV_WARNING       = 'sog_adventure_warning_seen';
  // First-ever-visit gate. Drives BOTH the home-screen state (lone "I'm Ready"
  // funnel vs. the full menu) AND the adventure-entry transition (intro video
  // the first time, sprite-through-door every time after). Set when the intro
  // video first plays (see startIrisWipe). One flag keeps the two in sync.
  var KEY_INTRO_SEEN        = 'sog_intro_seen';
  function introSeen() { return localStorage.getItem(KEY_INTRO_SEEN) === 'true'; }

  var SPRITE_PATH  = 'images/metaworld/character sprites/female/';

  /* Walk animation constants (same as overworld) */
  var WALK_FRAME_MS = 125;
  var FRAME_COUNT   = { right: 6, left: 6, up: 8, down: 4 };

  /* ── Elements ──────────────────────────────────────────────── */
  var screenHomeEl, homeContentEl, adventureStageEl;
  var btnReady, btnLearn, btnAbout, btnArcadium, btnAdventureNew, btnVersus, btnState2Back, btnFeedback, btnAccount;
  var advDevWarningEl, advDevProceedBtn, advDevGoBackBtn;
  var arcadiumLockedEl, arcadiumLockedClose;
  var subtitleIntroEl, subtitlePathEl, subtitleAdventurerEl;
  var charFemaleEl, charMaleEl;
  var backBtn, doorEl, irisEl;

  /* ── Audio (plain HTMLAudioElement, not Howler) ────────────
     Howler's HTML5 audio pool was exhausting with the game's other
     SFX running, which blocked our home music. Using a dedicated
     <audio> element sidesteps the pool entirely. */
  var HOME_MUSIC_VOLUME = 0.80; // base level (still tracks the music slider once moved)
  // Mutable live volume — read from localStorage on init (sog_music_volume) and
  // updated by the global music widget's slider. Bug 14.
  var HOME_MUSIC_VOLUME_LIVE = HOME_MUSIC_VOLUME;
  var homeMusicAudio = null;
  var homeMusicEnabled = false;  // gate: prevents deferred autoplay-fallback from playing music after the user has navigated away

  function ensureHomeMusic() {
    if (homeMusicAudio) return;
    homeMusicAudio = new Audio("music/thesilentknightstale.mp3");
    homeMusicAudio.loop    = true;
    homeMusicAudio.volume  = HOME_MUSIC_VOLUME_LIVE;
    homeMusicAudio.preload = 'none';   // don't pre-download 2.4MB on cold load; play() fetches on demand (first interaction)
    homeMusicAudio.addEventListener('error', function () {
      console.warn('[HomeFlow] home music audio error:', homeMusicAudio.error);
    });
  }
  function startHomeMusic() {
    if (!homeMusicEnabled) return;   // bug 13: user has navigated away — don't honor stale deferred start
    ensureHomeMusic();
    if (!homeMusicAudio) return;
    if (!homeMusicAudio.paused) return;
    homeMusicAudio.volume = HOME_MUSIC_VOLUME_LIVE;
    var p = homeMusicAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        // Browser autoplay policy — expected on first page load before any
        // user interaction. The first-click fallback in init() will retry.
      });
    }
  }
  function stopHomeMusic(fadeMs) {
    homeMusicEnabled = false;        // bug 13: cancel the play-intent so any pending first-click fallback no-ops
    if (!homeMusicAudio || homeMusicAudio.paused) return;
    if (fadeMs && fadeMs > 0) {
      var startVol = homeMusicAudio.volume;
      var steps = 20;
      var stepMs = fadeMs / steps;
      var stepNum = 0;
      var iv = setInterval(function () {
        stepNum++;
        homeMusicAudio.volume = Math.max(0, startVol * (1 - stepNum / steps));
        if (stepNum >= steps) {
          clearInterval(iv);
          homeMusicAudio.pause();
          homeMusicAudio.currentTime = 0;
          homeMusicAudio.volume = HOME_MUSIC_VOLUME_LIVE;
        }
      }, stepMs);
    } else {
      homeMusicAudio.pause();
      homeMusicAudio.currentTime = 0;
    }
  }

  /* ── Music widget integration (bug 14) ─────────────────────────
     pause/resume/toggle methods consumed by the global music widget.
     setHomeMusicVolume is exposed as window.setHomeMusicVolume so the
     widget's volume slider can apply changes to home audio. */
  function pauseHomeMusic() {
    if (!homeMusicAudio || homeMusicAudio.paused) return;
    homeMusicAudio.pause();
  }
  function resumeHomeMusic() {
    if (!homeMusicAudio || !homeMusicAudio.paused) {
      ensureHomeMusic();
      if (!homeMusicAudio || !homeMusicAudio.paused) return;
    }
    homeMusicEnabled = true;  // re-assert intent (same pattern as HomeFlow.playMusic)
    var p = homeMusicAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* autoplay blocked */ });
    }
  }
  function toggleHomeMusic() {
    if (!homeMusicAudio || homeMusicAudio.paused) resumeHomeMusic();
    else pauseHomeMusic();
  }
  function setHomeMusicVolume(vol) {
    // vol is 0..1
    HOME_MUSIC_VOLUME_LIVE = vol;
    if (homeMusicAudio) homeMusicAudio.volume = vol;
  }

  // Plain HTMLAudioElement — simpler and more reliable than Howler for
  // a short looped SFX, and easier to debug via the browser console.
  var footstepsAudio = null;
  function ensureFootsteps() {
    if (footstepsAudio) return;
    footstepsAudio = new Audio('sfx/footstepsonwood.m4a');
    footstepsAudio.loop   = true;
    footstepsAudio.volume = 0.9;
    footstepsAudio.preload = 'auto';
    footstepsAudio.addEventListener('error', function (e) {
      console.warn('[HomeFlow] footsteps audio error:', e, footstepsAudio.error);
    });
  }
  function startFootsteps() {
    ensureFootsteps();
    if (!footstepsAudio) return;
    try { footstepsAudio.currentTime = 0; } catch (e) {}
    footstepsAudio.volume = 0.9 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1); var p = footstepsAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        console.warn('[HomeFlow] footsteps play() rejected:', err);
      });
    }
  }
  function stopFootsteps() {
    if (footstepsAudio) {
      footstepsAudio.pause();
      try { footstepsAudio.currentTime = 0; } catch (e) {}
    }
  }

  // Woosh that accompanies the iris-wipe transition into the overworld.
  // Plays on every adventure entry (first-time after the intro video, and
  // returning visits where there's no video to cover the silence).
  var wooshAudio = null;
  function playEntryWoosh() {
    try {
      if (!wooshAudio) wooshAudio = new Audio('sfx/woosh.m4a');
      wooshAudio.currentTime = 0;
      wooshAudio.volume = 0.8 * ((window.SOG && SOG.sfx) ? SOG.sfx.factor() : 1);
      var p = wooshAudio.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  var walkIntervals = [];

  /* ── Init ──────────────────────────────────────────────────── */
  function init() {
    // Apply persisted music volume if present (bug 14 — shared with deck + battle)
    var storedVol = parseInt(localStorage.getItem('sog_music_volume'), 10);
    if (!isNaN(storedVol)) HOME_MUSIC_VOLUME_LIVE = Math.max(0, Math.min(100, storedVol)) / 100;

    screenHomeEl         = document.getElementById('screen-home');
    homeContentEl        = document.getElementById('home-content');
    adventureStageEl     = document.getElementById('home-adventure-stage');
    btnReady             = document.getElementById('btn-ready');
    btnLearn             = document.getElementById('btn-learn');
    btnAbout             = document.getElementById('btn-about');
    btnArcadium          = document.getElementById('btn-arcadium');
    btnAdventureNew      = document.getElementById('btn-adventure-new');
    btnVersus            = document.getElementById('btn-versus');
    btnState2Back        = document.getElementById('btn-state2-back');
    btnFeedback          = document.getElementById('btn-home-feedback');
    btnAccount           = document.getElementById('btn-account');
    subtitleIntroEl      = document.getElementById('home-subtitle-intro');
    subtitlePathEl       = document.getElementById('home-subtitle-path');
    subtitleAdventurerEl = document.getElementById('home-subtitle-adventurer');
    charFemaleEl         = document.getElementById('home-char-female');
    charMaleEl           = document.getElementById('home-char-male');
    backBtn              = document.getElementById('home-adventure-back');
    doorEl               = document.getElementById('home-secret-door');
    irisEl               = document.getElementById('home-iris-wipe');

    // First-visit vs returning-visitor: show/hide Learn button
    applyVisitState();

    // Initial subtitle visible
    subtitleIntroEl.classList.add('is-visible');

    // Start home music on the FIRST user interaction, not on load. A fresh page
    // load has no prior gesture, so an eager play() here would be blocked by the
    // autoplay policy anyway — but calling play() still kicks off the ~2.4MB
    // download even with preload="none", adding that weight to the cold load on
    // slow connections. Deferring to the first click avoids the cold-load cost
    // while still starting the music the instant the user interacts.
    homeMusicEnabled = true;   // bug 13: this init is the only place we WANT music to play
    document.addEventListener('click', function _firstClick() {
      startHomeMusic();
    }, { once: true });

    // Preload the footsteps SFX so it's ready the instant the walk starts.
    ensureFootsteps();

    // Wire buttons
    advDevWarningEl  = document.getElementById('adv-dev-warning-backdrop');
    advDevProceedBtn = document.getElementById('adv-dev-proceed');
    advDevGoBackBtn  = document.getElementById('adv-dev-goback');

    if (advDevProceedBtn) advDevProceedBtn.addEventListener('click', function () {
      localStorage.setItem(KEY_ADV_WARNING, 'true');
      hideAdvDevWarning();
      enterAdventureFlow();   // proceed into Adventure Mode
    });
    if (advDevGoBackBtn) advDevGoBackBtn.addEventListener('click', function () {
      localStorage.setItem(KEY_ADV_WARNING, 'true');
      hideAdvDevWarning();    // stay on home screen — no further action
    });

    arcadiumLockedEl    = document.getElementById('arcadium-locked-backdrop');
    arcadiumLockedClose = document.getElementById('arcadium-locked-close');
    if (arcadiumLockedClose) arcadiumLockedClose.addEventListener('click', hideArcadiumLockedPopup);

    if (btnReady)        btnReady.addEventListener('click', onReadyClick);
    if (btnArcadium)     btnArcadium.addEventListener('click', onArcadiumClick);
    if (btnAdventureNew) btnAdventureNew.addEventListener('click', onAdventureClick);
    if (btnVersus)       btnVersus.addEventListener('click', onOnlineVersusClick);
    if (btnState2Back)   btnState2Back.addEventListener('click', onState2BackClick);
    if (backBtn)         backBtn.addEventListener('click', onBackToPathChoice);
    if (charFemaleEl)    charFemaleEl.addEventListener('click', function () { onAdventurerPicked('female'); });
    if (charMaleEl)      charMaleEl.addEventListener('click',   function () { onAdventurerPicked('male');   });
    if (btnAccount)      btnAccount.addEventListener('click', onAccountClick);

    _updateAccountButtonLabel();
    // Keep the label live for the rest of the session — signup/login/logout
    // all change auth state without necessarily reloading this exact button
    // back into view first (e.g. mid-battle, or before any home-screen path
    // re-runs resetHomeState()'s own refresh below).
    if (window.SogAuth && typeof window.SogAuth.onChange === 'function') {
      window.SogAuth.onChange(_updateAccountButtonLabel);
    }
  }

  /* ── Guest/account status button (AUTH_SPEC.md Phase 3) ──────────────────
     Label reflects window.SogAuth's current user: anonymous (or none) →
     guest, "Create Account / Login"; a real (non-anonymous) user → "Logout".
     Called on init, on every SogAuth.onChange tick (signup/login/logout, even
     mid-session with no reload), and from resetHomeState() on every path back
     to the home screen — so it's never stale regardless of how it got here. */
  function _updateAccountButtonLabel() {
    if (!btnAccount) return;
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function'
      ? window.SogAuth.getUser() : null;
    var loggedIn = !!(user && user.isAnonymous === false);
    btnAccount.textContent = loggedIn ? 'Logout' : 'Create Account / Login';
  }

  function onAccountClick() {
    if (!window.SogAccountUI) return;
    var user = window.SogAuth && typeof window.SogAuth.getUser === 'function'
      ? window.SogAuth.getUser() : null;
    var loggedIn = !!(user && user.isAnonymous === false);
    if (loggedIn) {
      if (window.confirm('Log out? Your progress has been saved to your account. ' +
        'This device will return to guest mode.')) {
        window.SogAccountUI.logout();
      }
    } else {
      window.SogAccountUI.openFlow('chooser');
    }
  }

  function applyVisitState() {
    if (!introSeen()) {
      // FIRST-EVER VISIT — funnel: show only "I'm Ready" plus the account
      // button. The rest of the menu stays hidden so a brand-new player
      // isn't distracted, but the account button ALSO doubles as "log back
      // in" for a returning student: logout wipes sog_intro_seen (see
      // js/account.js _clearLocalProgressForNextStudent's keep-list, which
      // doesn't preserve it), which otherwise strands a logged-out student
      // on this exact first-visit state with no way back into their account.
      btnReady.style.display = '';
      btnLearn.style.display = 'none';
      btnAbout.style.display = 'none';
      if (btnFeedback) btnFeedback.style.display = 'none';
      if (btnAccount)  btnAccount.style.display = '';
    } else {
      // Returning visitor — normal home menu. (Feedback button is threshold-gated
      // separately by feedback.js, so we don't force it here.)
      btnReady.style.display = '';
      btnAbout.style.display = '';
      btnLearn.style.display = localStorage.getItem(KEY_FIRST_VISIT) ? '' : 'none';
      if (btnAccount) btnAccount.style.display = '';
    }
  }

  function markVisited() {
    localStorage.setItem(KEY_FIRST_VISIT, 'true');
  }

  /* ── STATE 1 → 2: I'm Ready clicked ────────────────────────── */
  function onReadyClick() {
    // FIRST-EVER VISIT — "I'm Ready" is the funnel: go straight into Adventure
    // (adventurer pick → sprite-through-door → intro video → map). The video is
    // gated to this first time only (see startIrisWipe).
    if (!introSeen()) {
      markVisited();
      try { localStorage.setItem(KEY_ADV_WARNING, 'true'); } catch (e) {}  // skip the dev-warning for the funnel
      launchReadyFunnel();
      return;
    }

    markVisited();

    // Returning visitor — reveal the State-2 menu.
    // Fade out intro subtitle + Ready + Learn buttons
    if (typeof gsap === 'undefined') { showPathChoice(); return; }

    gsap.to([subtitleIntroEl, btnReady, btnLearn, btnAbout, btnFeedback, btnAccount], {
      opacity: 0, duration: 0.3, ease: 'power2.out',
      onComplete: function () {
        btnReady.style.display = 'none';
        btnLearn.style.display = 'none';
        btnAbout.style.display = 'none';
        if (btnFeedback) btnFeedback.style.display = 'none';
        if (btnAccount)  btnAccount.style.display = 'none';
        subtitleIntroEl.classList.remove('is-visible');
        gsap.set(subtitleIntroEl, { opacity: '' });
        showPathChoice();
      }
    });
  }

  /* First-visit funnel: fade out the lone "I'm Ready" (+ intro subtitle) and
     drop straight into the adventurer-select stage — the same sequence the
     normal Adventure button uses, minus the State-2 menu hop. */
  function launchReadyFunnel() {
    if (typeof gsap === 'undefined') { enterAdventureStage(); return; }
    gsap.to([subtitleIntroEl, btnReady, btnAbout, btnFeedback, btnAccount], {
      opacity: 0, duration: 0.3, ease: 'power2.out',
      onComplete: function () {
        btnReady.style.display = 'none';
        btnAbout.style.display = 'none';
        if (btnFeedback) btnFeedback.style.display = 'none';
        if (btnAccount)  btnAccount.style.display = 'none';
        subtitleIntroEl.classList.remove('is-visible');
        gsap.set(subtitleIntroEl, { opacity: '' });
        enterAdventureStage();
      }
    });
  }

  /* After the player's first run, Adventure is a normal, primary option: drop the
     in-development greyscale and float it ahead of Arcadium so it's the FIRST path
     button. Idempotent — safe to call on every State-2 reveal. The State-2 menu is
     only ever shown to returning visitors (introSeen), i.e. after the first play. */
  function _promoteAdventureButton() {
    if (!btnAdventureNew) return;
    btnAdventureNew.classList.remove('adventure-mode-in-development');
    if (btnArcadium && btnAdventureNew.parentNode === btnArcadium.parentNode) {
      btnArcadium.parentNode.insertBefore(btnAdventureNew, btnArcadium);   // Adventure first
    }
  }

  function showPathChoice() {
    _promoteAdventureButton();
    // Show the three path buttons + back arrow + the "Choose your path" subtitle
    btnAdventureNew.classList.add('btn-visible');
    btnArcadium.classList.add('btn-visible');
    btnVersus.classList.add('btn-visible');
    btnState2Back.style.display = '';
    if (typeof gsap !== 'undefined') {
      gsap.set([btnAdventureNew, btnArcadium, btnVersus, btnState2Back], { opacity: 0 });
    }
    subtitlePathEl.classList.add('is-visible');

    if (typeof gsap !== 'undefined') {
      gsap.to([btnAdventureNew, btnArcadium, btnVersus, btnState2Back], {
        opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.08
      });
    } else {
      [btnAdventureNew, btnArcadium, btnVersus, btnState2Back].forEach(function (b) { b.style.opacity = 1; });
    }
  }

  /* ── STATE 2 → 1: back arrow clicked ───────────────────────── */
  function onState2BackClick() {
    if (typeof gsap === 'undefined') {
      hideState2();
      restoreState1();
      return;
    }
    gsap.to([btnArcadium, btnAdventureNew, btnVersus, btnState2Back, subtitlePathEl], {
      opacity: 0, duration: 0.3, ease: 'power2.out',
      onComplete: function () {
        hideState2();
        restoreState1();
      }
    });
  }

  function hideState2() {
    btnArcadium.classList.remove('btn-visible');
    btnAdventureNew.classList.remove('btn-visible');
    btnVersus.classList.remove('btn-visible');
    btnState2Back.style.display = 'none';
    subtitlePathEl.classList.remove('is-visible');
    if (typeof gsap !== 'undefined') gsap.set(subtitlePathEl, { opacity: '' });
  }

  function restoreState1() {
    btnReady.style.display = '';
    btnAbout.style.display = '';
    applyVisitState();           // restores btn-learn + btn-account per first-visit rule
    _updateAccountButtonLabel();
    // Re-evaluate Feedback button (visible only past the play-count threshold)
    if (window.Feedback && typeof window.Feedback.refreshHomeButton === 'function') {
      window.Feedback.refreshHomeButton();
    }
    subtitleIntroEl.classList.add('is-visible');
    if (typeof gsap !== 'undefined') {
      gsap.fromTo([btnReady, btnLearn, btnAbout, btnAccount, subtitleIntroEl],
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.05 });
      if (btnFeedback && btnFeedback.style.display !== 'none') {
        gsap.fromTo(btnFeedback, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
      }
    }
  }

  /* ── Arcadium → deck builder ───────────────────────────────────
     Goes straight to the deck builder (the old first-time tutorial trigger is
     gone). Gate: an Arcadium deck needs 15 cards, and new players accumulate cards
     in Adventure mode (the collection). If they don't have 15 yet, show a popup
     pointing them to Adventure instead of opening an unbuildable deck builder. */
  function onArcadiumClick() {
    window.multiplayerMode = false;
    var owned = (window.SOG && SOG.collection && typeof SOG.collection.getUnlockedCards === 'function')
      ? SOG.collection.getUnlockedCards().length : 0;
    if (owned < 15) { showArcadiumLockedPopup(); return; }   // stay on home; home music keeps playing

    // Straight into a clean deck builder — no old first-time tutorial and no
    // deck-builder (Lucy spotlight) tutorial for Arcadium (suppressed in
    // initDeckBuilder, which only runs it for the Online Versus entry now).
    stopHomeMusic(400);
    window.showScreen('screen-deckbuilder');
    if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
    if (typeof window.playDeckMusic === 'function') window.playDeckMusic();
  }

  function showArcadiumLockedPopup() { if (arcadiumLockedEl) arcadiumLockedEl.classList.add('visible'); }
  function hideArcadiumLockedPopup() { if (arcadiumLockedEl) arcadiumLockedEl.classList.remove('visible'); }

  /* ── Online Versus (existing versus flow) ──────────────────── */
  function onOnlineVersusClick() {
    stopHomeMusic(400);
    if (window.BattleLobby && typeof window.BattleLobby.showStudentJoin === 'function') {
      window.BattleLobby.showStudentJoin();
      return;
    }
    window.multiplayerMode = true;
    // bug 23: if dbtutorial will run, preset the marker so the music widget
    // never flashes visible, and skip the deck-music start (tearDown will).
    var dbWillRun = window.DeckBuilderTutorial &&
                    typeof window.DeckBuilderTutorial.willRunOnNext === 'function' &&
                    window.DeckBuilderTutorial.willRunOnNext();
    if (dbWillRun) document.body.dataset.dbtutorial = 'active';
    window.showScreen('screen-deckbuilder');
    if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
    if (!dbWillRun && typeof window.playDeckMusic === 'function') window.playDeckMusic();
  }

  /* ── Adventure in-development warning ───────────────────────── */
  function showAdvDevWarning() {
    if (advDevWarningEl) advDevWarningEl.classList.add('visible');
  }
  function hideAdvDevWarning() {
    if (advDevWarningEl) advDevWarningEl.classList.remove('visible');
  }

  /* ── STATE 2 → 3: Adventure clicked ────────────────────────── */
  function onAdventureClick() {
    // Show the in-development warning the first time; after that go straight through.
    if (!localStorage.getItem(KEY_ADV_WARNING)) {
      showAdvDevWarning();
      return;
    }
    enterAdventureFlow();
  }

  /* Performs the actual transition into Adventure Mode (fade out other
     buttons → adventurer selection stage). Split out so both the direct
     click path and the "Proceed" button in the warning popup share it. */
  function enterAdventureFlow() {
    if (typeof gsap === 'undefined') { enterAdventureStage(); return; }

    gsap.to([btnArcadium, btnVersus, btnAdventureNew, btnState2Back], {
      opacity: 0, duration: 0.3, ease: 'power2.out',
      onComplete: function () {
        btnArcadium.classList.remove('btn-visible');
        btnAdventureNew.classList.remove('btn-visible');
        btnVersus.classList.remove('btn-visible');
        btnState2Back.style.display = 'none';
        subtitlePathEl.classList.remove('is-visible');
        enterAdventureStage();
      }
    });
  }

  function enterAdventureStage() {
    adventureStageEl.classList.add('active');
    // Title stays visible (Shoulders of Giants), but the subtitle slot is empty.
    // Fade in the "Choose your adventurer" subtitle and walk in the two characters.
    subtitleAdventurerEl.classList.remove('is-visible');
    gsap.set([charFemaleEl, charMaleEl], { opacity: 0 });

    // Delay subtitle a hair so characters are arriving as text fades in
    setTimeout(function () { subtitleAdventurerEl.classList.add('is-visible'); }, 400);

    // Walk in the two characters
    walkCharacterIn(charFemaleEl, 'female', 'from-left');
    walkCharacterIn(charMaleEl,   'male',   'from-right');
  }

  /* Track how many characters are currently walking so we can start/stop
     the single shared footsteps SFX at the right moment. */
  var walkingCount = 0;
  function refFootsteps() {
    walkingCount++;
    if (walkingCount === 1) startFootsteps();
  }
  function unrefFootsteps() {
    walkingCount = Math.max(0, walkingCount - 1);
    if (walkingCount === 0) stopFootsteps();
  }

  /* ── Walk a character in from off-screen to a centered stop ── */
  function walkCharacterIn(el, which, dirIn) {
    // Use fixed stage width (1280px) so characters stop at the same stage
    // positions regardless of the browser viewport size.
    var vw = 1280;
    var startXpx, endXpx, spriteDir;
    if (dirIn === 'from-left') {
      // Female — comes in from left, walks right, stops at 38% of stage
      startXpx  = -100;
      endXpx    = vw * 0.38;   /* 486px — 154px left of centre */
      spriteDir = 'right';
    } else {
      // Male — comes in from right, walks left, stops at 62% of stage
      startXpx  = vw + 100;
      endXpx    = vw * 0.62;   /* 794px — 154px right of centre */
      spriteDir = 'left';
    }

    // Absolute pixel positioning (converts back to standing sprite at stop)
    el.style.left = startXpx + 'px';
    el.style.right = 'auto';
    gsap.set(el, { opacity: 1, x: 0 });

    // Start walking animation + footsteps SFX
    startWalkAnim(el, spriteDir);
    refFootsteps();

    // Walk over to stop position
    gsap.to(el, {
      left: endXpx,
      duration: 2.4,
      ease: 'none',
      onComplete: function () {
        stopWalkAnim(el);
        unrefFootsteps();
      }
    });
  }

  /* ── Sprite frame cycler ───────────────────────────────────── */
  function startWalkAnim(el, dir) {
    stopWalkAnim(el);
    var frame = 1;
    setWalkFrame(el, dir, frame);
    var iv = setInterval(function () {
      var fc = FRAME_COUNT[dir] || 4;
      frame = (frame % fc) + 1;
      setWalkFrame(el, dir, frame);
    }, WALK_FRAME_MS);
    el._walkInterval = iv;
    walkIntervals.push(iv);
  }

  function setWalkFrame(el, dir, frame) {
    var num  = frame < 10 ? '0' + frame : '' + frame;
    var base = (dir === 'left') ? 'right' : dir;
    el.src = SPRITE_PATH + 'adventurer-female-' + base + '-' + num + '.png';
    el.style.transform = (dir === 'left')
      ? 'translate(-50%, 0) scaleX(-1)'
      : 'translate(-50%, 0)';
  }

  function stopWalkAnim(el) {
    if (el && el._walkInterval) {
      clearInterval(el._walkInterval);
      el._walkInterval = null;
    }
    if (el) {
      el.src = SPRITE_PATH + 'adventurer-female-standing.png';
      // Keep transform but remove scaleX flip so character faces forward
      el.style.transform = 'translate(-50%, 0)';
    }
  }

  function stopAllWalkAnims() {
    walkIntervals.forEach(function (iv) { clearInterval(iv); });
    walkIntervals = [];
    if (charFemaleEl && charFemaleEl._walkInterval) charFemaleEl._walkInterval = null;
    if (charMaleEl   && charMaleEl._walkInterval)   charMaleEl._walkInterval   = null;
    walkingCount = 0;
    stopFootsteps();
  }

  /* ── Back arrow: return from adventure-select to path choice ── */
  function onBackToPathChoice() {
    stopAllWalkAnims();
    subtitleAdventurerEl.classList.remove('is-visible');
    gsap.to([charFemaleEl, charMaleEl], {
      opacity: 0, duration: 0.3,
      onComplete: function () {
        adventureStageEl.classList.remove('active');
        if (!introSeen()) {
          // First-visit funnel: back returns to the lone "I'm Ready", not the menu.
          btnReady.style.display = '';
          subtitleIntroEl.classList.add('is-visible');
          gsap.fromTo(btnReady, { opacity: 0 }, { opacity: 1, duration: 0.4 });
          return;
        }
        // Returning visitor: restore the State-2 path-choice menu.
        _promoteAdventureButton();
        btnAdventureNew.classList.add('btn-visible');
        btnArcadium.classList.add('btn-visible');
        btnVersus.classList.add('btn-visible');
        gsap.fromTo([btnAdventureNew, btnArcadium, btnVersus],
          { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.08 });
        subtitlePathEl.classList.add('is-visible');
      }
    });
  }

  /* ── Adventurer picked — door + iris + video + overworld ──── */
  function onAdventurerPicked(choice) {
    localStorage.setItem(KEY_ADVENTURER, choice);

    // Fade home music out now — before the door opens and the character walks.
    // 1.5s fade so it winds down over the door-expand + pause phase.
    stopHomeMusic(1500);

    var selected = (choice === 'female') ? charFemaleEl : charMaleEl;
    var other    = (choice === 'female') ? charMaleEl   : charFemaleEl;

    // Fade the other character out
    gsap.to(other, { opacity: 0, duration: 0.3 });

    // Fade subtitle + back button
    gsap.to([subtitleAdventurerEl, backBtn], { opacity: 0, duration: 0.3 });
    subtitleAdventurerEl.classList.remove('is-visible');

    // Build a secret door on the character's horizontal plane.
    // doorCenterX/Y must be in stage coordinates (0–1280 × 0–720) because
    // doorEl is position:absolute inside the stage.
    var selRect  = selected.getBoundingClientRect();
    var scale    = (window.SOG && window.SOG.Stage) ? window.SOG.Stage.getScale() : 1;
    var stageEl  = document.getElementById('sog-stage');
    var stageTop = stageEl ? stageEl.getBoundingClientRect().top : 0;
    var doorCenterX = 640;   /* always open at horizontal centre of 1280px stage */
    var doorCenterY = (selRect.top - stageTop + selRect.height / 2) / scale;

    doorEl.style.left   = doorCenterX + 'px';
    doorEl.style.top    = doorCenterY + 'px';
    doorEl.style.width  = '2px';
    doorEl.style.height = '2px';
    doorEl.classList.add('active');

    // Phase A (500ms): expand door from thin line to full size
    var DOOR_W = 90;
    var DOOR_H = 150;
    gsap.timeline()
      .to(doorEl, { width: DOOR_W, height: 6, duration: 0.25, ease: 'power2.out' })
      .to(doorEl, { width: DOOR_W, height: DOOR_H, duration: 0.25, ease: 'power2.out' })
      // Phase B (1.5s): door just sits there
      .to({}, { duration: 1.5 })
      // Phase C: selected character walks toward door
      .call(function () { walkSelectedIntoDoor(selected, doorCenterX, doorCenterY); });
  }

  function walkSelectedIntoDoor(el, doorX, doorY) {
    // Raise character above the door so she appears IN FRONT of it
    // as she arrives (z-index stays high until she fades into the door).
    el.style.zIndex = '45';

    // Compute walk direction toward door.
    // el is inside the stage (position:absolute), so its left is already
    // a stage coordinate.  getBoundingClientRect() returns viewport coords;
    // divide by the CSS transform scale to convert back to stage coords.
    var scale = (window.SOG && window.SOG.Stage) ? window.SOG.Stage.getScale() : 1;
    var stageEl  = document.getElementById('sog-stage');
    var stageLeft = stageEl ? stageEl.getBoundingClientRect().left : 0;
    var rect = el.getBoundingClientRect();
    var charX = (rect.left - stageLeft + rect.width / 2) / scale;
    var dir = (doorX > charX) ? 'right' : 'left';
    startWalkAnim(el, dir);

    // Footsteps sfx while walking to the door (ref-counted)
    refFootsteps();

    var distance = Math.abs(doorX - charX);
    var duration = Math.max(0.6, distance / 220); // ~220 px/sec

    gsap.to(el, {
      left: doorX + 'px',
      duration: duration,
      ease: 'none',
      onComplete: function () {
        stopWalkAnim(el);
        unrefFootsteps();
        // Brief pause so she visibly stands in FRONT of the door
        gsap.to({}, {
          duration: 0.5,
          onComplete: function () {
            // Fade her into the door
            gsap.to(el, {
              opacity: 0, duration: 0.4, ease: 'power2.in',
              onComplete: function () {
                el.style.zIndex = '';
                startIrisWipe(doorX, doorY);
              }
            });
          }
        });
      }
    });
  }

  /* ── Iris wipe: circle closes in, then opens back out (reveals video) */
  function startIrisWipe(cx, cy) {
    irisEl.classList.add('active');

    // cx/cy are stage coordinates (0–1280, 0–720).
    // #home-iris-wipe is position:absolute; inset:0 inside the stage, so
    // clip-path percentages are relative to the stage dimensions (1280×720).
    var vw = 1280;
    var vh = 720;
    var cxPct = (cx / vw) * 100;
    var cyPct = (cy / vh) * 100;

    // Radius large enough to cover the entire 1280×720 stage.
    var maxRadius = Math.max(vw, vh) * 1.4;   /* 1792px > diagonal 1473px */

    // We use inverse clip-path: the DIV is black, and clip-path cuts a
    // circle HOLE out of it. As the hole shrinks to 0, the screen becomes
    // fully black. Then we play the video under it (by keeping it black
    // while the video starts), then expand the hole back to reveal video.

    // Actually simpler: clip-path: circle() clips the div to the circle
    // (anything inside the circle is shown, outside is transparent).
    // We want the black overlay to grow from 0 → full, so:
    //   phase 1: black circle grows from center to cover screen
    //   phase 2 (after video started): circle shrinks back to 0
    // Using clip-path circle(R at X Y): R increases → black covers more.
    // Wait — reversed. circle(R) shows the disc inside radius R, hides outside.
    // So with black bg: black covers inside the circle, transparent outside.
    // We want black to grow: radius from 0 → maxRadius. Correct.

    irisEl.style.clipPath = 'circle(0px at ' + cxPct + '% ' + cyPct + '%)';

    gsap.to(irisEl, {
      duration: 0.9,
      ease: 'power2.inOut',
      onUpdate: function () {
        // No direct clip-path tween in free GSAP — use manual progress
      }
    });

    // Manual tween of clipPath since GSAP can't interpolate it directly
    var proxy = { r: 0 };
    gsap.to(proxy, {
      r: maxRadius, duration: 0.9, ease: 'power2.inOut',
      onStart: function () {
        // Woosh rides the radial wipe from the moment it starts closing in.
        playEntryWoosh();
      },
      onUpdate: function () {
        irisEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + cxPct + '% ' + cyPct + '%)';
      },
      onComplete: function () {
        // Fully black now. FIRST-EVER entry → play the Title Intro video once,
        // marking it seen. RETURNING entry → the sprite-through-door (this iris)
        // IS the transition; skip the video and go straight to the map.
        if (!introSeen()) {
          try { localStorage.setItem(KEY_INTRO_SEEN, 'true'); } catch (e) {}
          playTitleIntro(function () {
            openIrisAndEnterOverworld(cxPct, cyPct, maxRadius);
          });
        } else {
          openIrisAndEnterOverworld(cxPct, cyPct, maxRadius);
        }
      }
    });
  }

  function playTitleIntro(onEnd) {
    var video = document.getElementById('intro-video');
    var screen = document.getElementById('screen-video');
    if (!video || !screen) { if (onEnd) onEnd(); return; }

    // Flag so deckbuilder's global 'ended' listener skips the tutorial route
    window._adventureVideoMode = true;

    // Safety: music should already be fading/stopped from the character pick,
    // but ensure it's silenced before the video plays.
    stopHomeMusic(200);

    window.showScreen('screen-video');
    try { video.currentTime = 0; } catch (e) {}

    var skipBtn = document.getElementById('intro-skip-btn');

    // Single finish path — fired by the video ending, a click/tap on Skip, or a
    // key press. Guarded so it only runs once. Tears down its own listeners and
    // stops the (possibly still-buffering) video so a slow connection is never
    // forced to wait on the full download before continuing to the overworld.
    var finished = false;
    function finishIntro() {
      if (finished) return;
      finished = true;
      video.removeEventListener('ended', finishIntro);
      if (skipBtn) skipBtn.removeEventListener('click', finishIntro);
      document.removeEventListener('keydown', onKey);
      try { video.pause(); } catch (e) {}
      window._adventureVideoMode = false;
      if (onEnd) onEnd();
    }
    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key === 'Spacebar') {
        finishIntro();
      }
    }

    video.addEventListener('ended', finishIntro);
    if (skipBtn) skipBtn.addEventListener('click', finishIntro);
    document.addEventListener('keydown', onKey);

    // preload="none" means play() starts the fetch now; on a fast link it plays,
    // on a slow link the Skip button is already available to bail out. If play()
    // is rejected (autoplay policy / decode error), just continue.
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () { finishIntro(); });
  }

  function openIrisAndEnterOverworld(cxPct, cyPct, maxRadius) {
    // Go to overworld behind the iris, then open iris back out
    window.showScreen('screen-overworld');
    if (window.Overworld && typeof window.Overworld.init === 'function') {
      window.Overworld.init();
    }

    // Move iris element into the overworld screen so it covers the map
    var overworldScreen = document.getElementById('screen-overworld');
    if (overworldScreen && irisEl.parentNode !== overworldScreen) {
      overworldScreen.appendChild(irisEl);
    }
    irisEl.classList.add('active');
    irisEl.style.clipPath = 'circle(' + maxRadius + 'px at ' + cxPct + '% ' + cyPct + '%)';

    var proxy = { r: maxRadius };
    gsap.to(proxy, {
      r: 0, duration: 0.9, ease: 'power2.inOut',
      onUpdate: function () {
        irisEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + cxPct + '% ' + cyPct + '%)';
      },
      onComplete: function () {
        irisEl.classList.remove('active');
        irisEl.style.clipPath = '';
        // Move iris back to home screen for future use
        var homeScreen = document.getElementById('screen-home');
        if (homeScreen) homeScreen.appendChild(irisEl);
        // Reset home state so next time player comes back, it's fresh
        resetHomeState();
      }
    });
  }

  function resetHomeState() {
    // Restore initial state in case user comes back to home
    stopAllWalkAnims();
    adventureStageEl.classList.remove('active');
    doorEl.classList.remove('active');
    doorEl.style.width  = '';
    doorEl.style.height = '';
    btnArcadium.classList.remove('btn-visible');
    btnAdventureNew.classList.remove('btn-visible');
    btnVersus.classList.remove('btn-visible');
    btnState2Back.style.display = 'none';
    btnReady.style.display = '';
    btnAbout.style.display = '';
    gsap.set(btnReady, { opacity: 1 });
    gsap.set(btnAbout, { opacity: 1 });
    gsap.set(btnLearn, { opacity: 1 });   // Learn faded to 0 in onReadyClick but never restored — un-stick it
    if (btnAccount) gsap.set(btnAccount, { opacity: 1 });  // same fade-out in onReadyClick, same fix
    applyVisitState();
    _updateAccountButtonLabel();   // auth state may have changed since this button was last shown
    // Re-evaluate Feedback button (threshold-gated by feedback.js)
    if (window.Feedback && typeof window.Feedback.refreshHomeButton === 'function') {
      window.Feedback.refreshHomeButton();
    }
    subtitlePathEl.classList.remove('is-visible');
    subtitleIntroEl.classList.add('is-visible');
    gsap.set([charFemaleEl, charMaleEl], { opacity: 0 });
    gsap.set(backBtn, { opacity: 0.8 });
  }

  /* ── Bootstrap ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Snapshot (save-state.js) ── */
  function getSnapshot() {
    return {
      introSeen:           introSeen(),
      firstVisitComplete:  localStorage.getItem(KEY_FIRST_VISIT) === 'true',
      adventureWarningSeen: localStorage.getItem(KEY_ADV_WARNING) === 'true',
      selectedAdventurer:  localStorage.getItem(KEY_ADVENTURER) || null
    };
  }
  function _setFlag(key, v) {
    try {
      if (v) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function applySnapshot(snap) {
    if (!snap) return;
    _setFlag(KEY_INTRO_SEEN, snap.introSeen);
    _setFlag(KEY_FIRST_VISIT, snap.firstVisitComplete);
    _setFlag(KEY_ADV_WARNING, snap.adventureWarningSeen);
    try {
      if (snap.selectedAdventurer) localStorage.setItem(KEY_ADVENTURER, snap.selectedAdventurer);
      else localStorage.removeItem(KEY_ADVENTURER);
    } catch (e) {}
  }

  return {
    init:        init,
    reset:       resetHomeState,
    playMusic: function () {
      // External callers (tutorial-return-to-home, etc.) re-assert
      // intent that home music should play. This bypasses the bug-13
      // leak gate — internal startHomeMusic remains gate-checked so
      // the deferred autoplay-fallback can't fire after navigation.
      homeMusicEnabled = true;
      startHomeMusic();
    },
    stopMusic:      stopHomeMusic,    // exposed so other flows (Learn tutorial) can silence it
    toggleMusic:    toggleHomeMusic,  // bug 14: global widget play/pause
    pauseMusic:     pauseHomeMusic,   // bug 14
    resumeMusic:    resumeHomeMusic,  // bug 14
    setMusicVolume: setHomeMusicVolume, // bug 14: global widget volume slider
    getSnapshot:    getSnapshot,
    applySnapshot:  applySnapshot
  };
})();

window.HomeFlow = HomeFlow;
// Bug 14: expose home volume setter as a window-level hook for the global
// music widget. Lives outside HomeFlow's curated API since the widget needs
// to call it via a flat function reference without depending on HomeFlow
// being initialized.
window.setHomeMusicVolume = function (vol) {
  if (window.HomeFlow && typeof window.HomeFlow.setMusicVolume === 'function') {
    window.HomeFlow.setMusicVolume(vol);
  }
};

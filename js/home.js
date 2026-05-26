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

  var SPRITE_PATH  = 'images/metaworld/character sprites/female/';

  /* Walk animation constants (same as overworld) */
  var WALK_FRAME_MS = 125;
  var FRAME_COUNT   = { right: 6, left: 6, up: 8, down: 4 };

  /* ── Elements ──────────────────────────────────────────────── */
  var screenHomeEl, homeContentEl, adventureStageEl;
  var btnReady, btnLearn, btnAbout, btnArcadium, btnAdventureNew, btnVersus, btnState2Back, btnFeedback;
  var advDevWarningEl, advDevProceedBtn, advDevGoBackBtn;
  var subtitleIntroEl, subtitlePathEl, subtitleAdventurerEl;
  var charFemaleEl, charMaleEl;
  var backBtn, doorEl, irisEl;

  /* ── Audio (plain HTMLAudioElement, not Howler) ────────────
     Howler's HTML5 audio pool was exhausting with the game's other
     SFX running, which blocked our home music. Using a dedicated
     <audio> element sidesteps the pool entirely. */
  var HOME_MUSIC_VOLUME = 0.50; // ~66% × 0.75 = 50% (legacy default; live value below)
  // Mutable live volume — read from localStorage on init (sog_music_volume) and
  // updated by the global music widget's slider. Bug 14.
  var HOME_MUSIC_VOLUME_LIVE = HOME_MUSIC_VOLUME;
  var homeMusicAudio = null;
  var homeMusicEnabled = false;  // gate: prevents deferred autoplay-fallback from playing music after the user has navigated away

  function ensureHomeMusic() {
    if (homeMusicAudio) return;
    homeMusicAudio = new Audio("music/The Silent Knight's Tale.m4a");
    homeMusicAudio.loop    = true;
    homeMusicAudio.volume  = HOME_MUSIC_VOLUME_LIVE;
    homeMusicAudio.preload = 'auto';
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
    var p = footstepsAudio.play();
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

    // Try to start home music immediately. If the browser's autoplay policy
    // blocks it (no prior interaction this session), the rejection is silent
    // and the click listener below kicks it off on the first user click.
    homeMusicEnabled = true;   // bug 13: this init is the only place we WANT music to play
    startHomeMusic();
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

    if (btnReady)        btnReady.addEventListener('click', onReadyClick);
    if (btnArcadium)     btnArcadium.addEventListener('click', onArcadiumClick);
    if (btnAdventureNew) btnAdventureNew.addEventListener('click', onAdventureClick);
    if (btnVersus)       btnVersus.addEventListener('click', onOnlineVersusClick);
    if (btnState2Back)   btnState2Back.addEventListener('click', onState2BackClick);
    if (backBtn)         backBtn.addEventListener('click', onBackToPathChoice);
    if (charFemaleEl)    charFemaleEl.addEventListener('click', function () { onAdventurerPicked('female'); });
    if (charMaleEl)      charMaleEl.addEventListener('click',   function () { onAdventurerPicked('male');   });
  }

  function applyVisitState() {
    var firstVisit = !localStorage.getItem(KEY_FIRST_VISIT);
    if (firstVisit) {
      btnLearn.style.display = 'none';
    } else {
      btnLearn.style.display = '';
    }
  }

  function markVisited() {
    localStorage.setItem(KEY_FIRST_VISIT, 'true');
  }

  /* ── STATE 1 → 2: I'm Ready clicked ────────────────────────── */
  function onReadyClick() {
    markVisited();

    // Fade out intro subtitle + Ready + Learn buttons
    if (typeof gsap === 'undefined') { showPathChoice(); return; }

    gsap.to([subtitleIntroEl, btnReady, btnLearn, btnAbout, btnFeedback], {
      opacity: 0, duration: 0.3, ease: 'power2.out',
      onComplete: function () {
        btnReady.style.display = 'none';
        btnLearn.style.display = 'none';
        btnAbout.style.display = 'none';
        if (btnFeedback) btnFeedback.style.display = 'none';
        subtitleIntroEl.classList.remove('is-visible');
        gsap.set(subtitleIntroEl, { opacity: '' });
        showPathChoice();
      }
    });
  }

  function showPathChoice() {
    // Show the three path buttons + back arrow + the "Choose your path" subtitle
    btnArcadium.classList.add('btn-visible');
    btnAdventureNew.classList.add('btn-visible');
    btnVersus.classList.add('btn-visible');
    btnState2Back.style.display = '';
    if (typeof gsap !== 'undefined') {
      gsap.set([btnArcadium, btnAdventureNew, btnVersus, btnState2Back], { opacity: 0 });
    }
    subtitlePathEl.classList.add('is-visible');

    if (typeof gsap !== 'undefined') {
      gsap.to([btnArcadium, btnAdventureNew, btnVersus, btnState2Back], {
        opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.08
      });
    } else {
      [btnArcadium, btnAdventureNew, btnVersus, btnState2Back].forEach(function (b) { b.style.opacity = 1; });
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
    applyVisitState();           // restores btn-learn per first-visit rule
    // Re-evaluate Feedback button (visible only past the play-count threshold)
    if (window.Feedback && typeof window.Feedback.refreshHomeButton === 'function') {
      window.Feedback.refreshHomeButton();
    }
    subtitleIntroEl.classList.add('is-visible');
    if (typeof gsap !== 'undefined') {
      gsap.fromTo([btnReady, btnLearn, btnAbout, subtitleIntroEl],
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.05 });
      if (btnFeedback && btnFeedback.style.display !== 'none') {
        gsap.fromTo(btnFeedback, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
      }
    }
  }

  /* ── Arcadium → deck builder (existing Ready-button flow) ─── */
  function onArcadiumClick() {
    stopHomeMusic(400);
    window.multiplayerMode = false;
    if (localStorage.getItem('sog_tutorial_complete')) {
      // bug 23: if dbtutorial will run, preset the marker so the music widget
      // never flashes visible, and skip the deck-music start (tearDown will).
      var dbWillRun = window.DeckBuilderTutorial &&
                      typeof window.DeckBuilderTutorial.willRunOnNext === 'function' &&
                      window.DeckBuilderTutorial.willRunOnNext();
      if (dbWillRun) document.body.dataset.dbtutorial = 'active';
      window.showScreen('screen-deckbuilder');
      if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
      if (!dbWillRun && typeof window.playDeckMusic === 'function') window.playDeckMusic();
      return;
    }
    // First-time player: Lucy 3-line home intro → video → tutorial
    if (typeof window.startHomeIntro === 'function') {
      window.startHomeIntro(function () {
        var video = document.getElementById('intro-video');
        if (video) {
          video.currentTime = 0;
          video.play().catch(function () {});
        }
        window.showScreen('screen-video');
      });
    }
  }

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
        // Restore path-choice state
        btnArcadium.classList.add('btn-visible');
        btnAdventureNew.classList.add('btn-visible');
        btnVersus.classList.add('btn-visible');
        gsap.fromTo([btnArcadium, btnAdventureNew, btnVersus],
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
      onUpdate: function () {
        irisEl.style.clipPath = 'circle(' + proxy.r + 'px at ' + cxPct + '% ' + cyPct + '%)';
      },
      onComplete: function () {
        // Fully black now — play the Title Intro video
        playTitleIntro(function () {
          // After video, open iris back out then hand off to overworld
          openIrisAndEnterOverworld(cxPct, cyPct, maxRadius);
        });
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
    video.currentTime = 0;

    var onVideoEnd = function () {
      video.removeEventListener('ended', onVideoEnd);
      window._adventureVideoMode = false;
      if (onEnd) onEnd();
    };
    video.addEventListener('ended', onVideoEnd);
    video.play().catch(function () {
      window._adventureVideoMode = false;
      if (onEnd) onEnd();
    });
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
    applyVisitState();
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
    setMusicVolume: setHomeMusicVolume // bug 14: global widget volume slider
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

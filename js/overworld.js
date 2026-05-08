/**
 * overworld.js
 * Shoulders of Giants — Adventure Mode Overworld
 *
 * Three connected regional maps with fade transitions between them:
 *   eastafrica → egypt → mesopotamia (and back)
 *
 * State persisted in localStorage:
 *   sog_overworld_map          → current map id
 *   sog_overworld_pos          → {x, y} in map %
 *   sog_overworld_visited_maps → array of map ids the player has been to
 */

var Overworld = (function () {
  'use strict';

  /* ── localStorage keys ──────────────────────────────────────── */
  var KEY_MAP           = 'sog_overworld_map';
  var KEY_POS           = 'sog_overworld_pos';
  var KEY_VISITED       = 'sog_overworld_visited_maps';
  var KEY_ADVENTURE_INTRO = 'sog_adventure_intro_complete';
  var KEY_ADVENTURER    = 'sog_selected_adventurer';

  /* ════════════════════════════════════════════════════════════
     ADVENTURE MODE INTRO — two separate dialogue phases
     ════════════════════════════════════════════════════════════
     PHASE 1: fires 3s after the player arrives at East Africa.
              All explorer lines. Player movement locked.
     PHASE 2: fires when the player clicks the Prehistory node
              (only the first time). Explorer + Lucy exchange.
              Walk to the node happens AFTER this dialogue. */

  var PHASE1_DIALOGUE = [
    { who: 'explorer', text: 'Huh\u2026 That was strange.' },
    { who: 'explorer', text: 'I should probably be more careful about going through dark doorways.' },
    { who: 'explorer', text: 'At least this place looks familiar\u2026' },
    { who: 'explorer', text: 'That looks like Mount Kilimanjaro to the east and Lake Victoria to the north.' },
    { who: 'explorer', text: 'That means I\u2019m in East Africa!' },
    { who: 'explorer', text: 'But where are all the people?' }
  ];

  var PHASE2_DIALOGUE = [
    { who: 'lucy',     text: 'Mmmhm\u2026 I\u2019m standing right here.' },
    { who: 'explorer', text: 'Woah, you can talk? I thought you were an ape?' },
    { who: 'lucy',     text: 'Australopithecus to the uninitiated.' },
    { who: 'explorer', text: 'Wow, you\u2019re one of the earliest human ancestors to stand on two legs.' },
    { who: 'lucy',     text: 'Yes, I\u2019m bipedal. Thanks for noticing.' },
    { who: 'explorer', text: 'That doesn\u2019t explain why you can talk.' },
    { who: 'lucy',     text: 'Nothing will. Don\u2019t over think it.' },
    { who: 'explorer', text: 'Fair enough. But that must mean I traveled back in time. Like way back.' },
    { who: 'lucy',     text: 'I wouldn\u2019t over think that either.' },
    { who: 'explorer', text: 'Well, I\u2019m going to get going. See you later.' }
  ];

  var TYPE_SPEED_MS      = 28;      // ms per character
  var PHASE1_WAIT_MS     = 3000;    // 3s arrival pause before Phase 1 fires
  var BLEEP_EVERY_CHARS  = 2;       // bleep every N non-space chars

  /* ── Web Audio text bleep (no asset, synth tone) ──────────── */
  var _audioCtx = null;
  function getAudioCtx() {
    if (_audioCtx) return _audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _audioCtx = new Ctx();
    } catch (e) {}
    return _audioCtx;
  }
  // who: 'lucy' | 'explorer' — Lucy's bleep is lower/breathier, Explorer higher/brighter
  function playBleep(who) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    // Slight pitch wobble so consecutive bleeps don't feel robotic
    var baseFreq = (who === 'lucy') ? 340 : 520;
    var freq = baseFreq + (Math.random() - 0.5) * 30;
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.005);   // quick attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); // fast decay
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /* ════════════════════════════════════════════════════════════
     MAP DATA — easy to extend for new regions
     ════════════════════════════════════════════════════════════
     Each map: image, spawn (default entry), startsFogged, nodes, exits.
     Nodes/exits coords are % of the map div (container). ────── */
  var SPRITE_PATH = 'images/metaworld/character sprites/female/';
  var NODE_PATH   = 'images/metaworld/civilization nodes/';
  var MAP_PATH    = 'images/metaworld/maps/';

  var MAPS = {
    'eastafrica': {
      image: MAP_PATH + 'eastafrica.jpeg',
      // Spawn: well south of Lake Victoria, directly below the node's X.
      // Node is at (38, 35); spawn at (38, 95).
      spawn: { x: 38, y: 95 },
      startsFogged: false,
      nodes: [
        {
          id:    'prehistory',
          name:  'Prehistory',
          image: NODE_PATH + 'prehistory node.png',
          x: 38, y: 35,
          // Waypoints — a C-shape around the west side of Lake Victoria,
          // staying wide enough to avoid the lakes and mountains NW of it.
          //   wp1: turn left early, well south of the lake
          //   wp2: due west of the lake (far enough west to clear the NW lakes)
          //   wp3: arc east-northeast, staying south of the NW mountain range
          //   wp4: approach the node from below
          //   wp5: arrive at the node
          path: [
            { x: 28, y: 85 },   // turn left early, well south of the lake
            { x: 20, y: 55 },   // far west — clear of all western lakes
            { x: 22, y: 40 },   // northwest corner of the arc
            { x: 32, y: 38 },   // curve east, south of the mountains
            { x: 38, y: 35 }    // arrive at the node
          ]
        }
      ],
      exits: [
        {
          id:       'to-egypt',
          label:    'To Egypt \u2192',
          zone:     { x: 80, y:  5, w: 20, h: 30 },
          walkTo:   { x: 88, y: 15 },
          target:   'egypt',
          entryAt:  { x: 10, y: 85 }  // where you arrive in Egypt
        }
      ]
    },

    'egypt': {
      image: MAP_PATH + 'egypt.jpeg',
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      nodes: [],   // placeholder for future
      exits: [
        {
          id:      'to-mesopotamia',
          label:   'To Mesopotamia \u2192',
          zone:    { x: 80, y:  5, w: 20, h: 30 },
          walkTo:  { x: 88, y: 15 },
          target:  'mesopotamia',
          entryAt: { x: 10, y: 85 }
        },
        {
          id:      'to-eastafrica',
          label:   '\u2190 To East Africa',
          zone:    { x: 0, y: 70, w: 20, h: 30 },
          walkTo:  { x: 10, y: 85 },
          target:  'eastafrica',
          entryAt: { x: 88, y: 15 }  // top-right of East Africa
        }
      ]
    },

    'mesopotamia': {
      image: MAP_PATH + 'mesopotamia.jpeg',
      spawn: { x: 10, y: 85 },
      startsFogged: true,
      nodes: [
        {
          id:    'winged-akkad',
          name:  'Akkad',
          image: NODE_PATH + 'winged akkad node.png',
          x: 42, y: 52
        },
        {
          id:    'hammurabi',
          name:  'Hammurabi\u2019s Code',
          image: NODE_PATH + 'hammurabi code node.png',
          x: 58, y: 60
        }
      ],
      exits: [
        {
          id:      'to-egypt',
          label:   '\u2190 To Egypt',
          zone:    { x: 0, y: 70, w: 20, h: 30 },
          walkTo:  { x: 10, y: 85 },
          target:  'egypt',
          entryAt: { x: 88, y: 15 }
        }
      ]
    }
  };

  /* ── Animation timing ──────────────────────────────────────── */
  var WALK_FRAME_MS = 125;    // 8 fps walk
  var MAP_FRAME_MS  = 1000;   // 1 s per map-reading frame
  var IDLE_DELAY_MS = 15000;

  var FRAME_COUNT = { right: 6, left: 6, up: 8, down: 4 };
  var MAP_FRAMES  = 9;

  /* ── Footstep SFX ──────────────────────────────────────────── */
  var footstepsHowl = null;
  function ensureFootsteps() {
    if (footstepsHowl || typeof Howl === 'undefined') return;
    footstepsHowl = new Howl({
      src: ['sfx/adventuresteps.m4a'],
      loop: true,
      volume: 0.7,
      html5: true
    });
  }
  function startFootsteps() {
    ensureFootsteps();
    if (footstepsHowl && !footstepsHowl.playing()) footstepsHowl.play();
  }
  function stopFootsteps() {
    if (footstepsHowl && footstepsHowl.playing()) footstepsHowl.stop();
  }

  /* ── DOM refs + state ──────────────────────────────────────── */
  var mapImgEl, overlayEl, charEl, fogEl, transitionEl, transitionTextEl;
  var lucyBoxEl, lucyTextEl, explorerBoxEl, explorerTextEl;
  var currentMapId   = 'eastafrica';
  var currentPos     = { x: 0, y: 0 };
  var visitedMaps    = [];
  var isMoving       = false;
  var isTransitioning = false;
  var isDialogueLocked = false;   // set true during the adventure intro
  var walkInterval   = null;
  var idleTimer      = null;
  var idleRoutineTimer = null;

  // Dialogue typewriter state
  var dlgIndex = 0;
  var dlgTypingTimer = null;
  var dlgIsTyping = false;
  var dlgFullText = '';
  var dlgTypedLen = 0;
  var dlgActiveBox = null;      // current visible box el
  var dlgActiveTextEl = null;   // current text element
  var dlgAdvanceHandler = null;

  // Urgent-pulse idle timer (30s after dialogue end → brighten prehistory node)
  var urgentPulseTimer = null;

  /* ── localStorage helpers ──────────────────────────────────── */
  function loadState() {
    currentMapId = localStorage.getItem(KEY_MAP) || 'eastafrica';
    if (!MAPS[currentMapId]) currentMapId = 'eastafrica';
    try {
      var p = localStorage.getItem(KEY_POS);
      currentPos = p ? JSON.parse(p) : { x: MAPS[currentMapId].spawn.x, y: MAPS[currentMapId].spawn.y };
    } catch (e) {
      currentPos = { x: MAPS[currentMapId].spawn.x, y: MAPS[currentMapId].spawn.y };
    }
    try {
      var v = localStorage.getItem(KEY_VISITED);
      visitedMaps = v ? JSON.parse(v) : [];
    } catch (e) { visitedMaps = []; }
    // Always mark East Africa as visited (it's the starting map, no fog)
    if (visitedMaps.indexOf('eastafrica') === -1) visitedMaps.push('eastafrica');
  }
  function saveState() {
    localStorage.setItem(KEY_MAP,     currentMapId);
    localStorage.setItem(KEY_POS,     JSON.stringify(currentPos));
    localStorage.setItem(KEY_VISITED, JSON.stringify(visitedMaps));
  }

  /* ── Character rendering ───────────────────────────────────── */
  function positionChar(xPct, yPct) {
    charEl.style.left = xPct + '%';
    charEl.style.top  = yPct + '%';
  }

  function setWalkFrame(dir, frame) {
    var num = frame < 10 ? '0' + frame : '' + frame;
    var base = (dir === 'left') ? 'right' : dir;
    charEl.src = SPRITE_PATH + 'adventurer-female-' + base + '-' + num + '.png';
    charEl.style.transform = (dir === 'left')
      ? 'translate(-50%, -100%) scaleX(-1)'
      : 'translate(-50%, -100%)';
  }

  function startWalkAnim(dir) {
    if (walkInterval) clearInterval(walkInterval);
    var frame = 1;
    setWalkFrame(dir, frame);
    walkInterval = setInterval(function () {
      var fc = FRAME_COUNT[dir] || 4;
      frame = (frame % fc) + 1;
      setWalkFrame(dir, frame);
    }, WALK_FRAME_MS);
  }

  function setStanding() {
    if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
    charEl.src = SPRITE_PATH + 'adventurer-female-standing.png';
    charEl.style.transform = 'translate(-50%, -100%)';
  }

  /* ── Walking through waypoints ─────────────────────────────── */
  function walkPath(waypoints, onDone) {
    if (!waypoints || !waypoints.length) { if (onDone) onDone(); return; }
    isMoving = true;
    cancelIdle();
    startFootsteps();
    var i = 0;
    function next() {
      if (i >= waypoints.length) {
        isMoving = false;
        setStanding();
        stopFootsteps();
        saveState();
        if (onDone) onDone();
        return;
      }
      walkToWaypoint(waypoints[i], function () { i++; next(); });
    }
    next();
  }

  function walkToWaypoint(wp, onDone) {
    var from = { x: currentPos.x, y: currentPos.y };
    var dx = wp.x - from.x;
    var dy = wp.y - from.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    var dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
    else                              dir = dy > 0 ? 'down'  : 'up';

    startWalkAnim(dir);
    var duration = Math.max(0.6, distance * 0.08);

    if (typeof gsap !== 'undefined') {
      gsap.to(currentPos, {
        x: wp.x, y: wp.y,
        duration: duration,
        ease: 'none',
        onUpdate: function () { positionChar(currentPos.x, currentPos.y); },
        onComplete: function () {
          currentPos.x = wp.x; currentPos.y = wp.y;
          positionChar(wp.x, wp.y);
          if (onDone) onDone();
        }
      });
    } else {
      currentPos.x = wp.x; currentPos.y = wp.y;
      positionChar(wp.x, wp.y);
      if (onDone) onDone();
    }
  }

  /* ── Idle routine ──────────────────────────────────────────── */
  function scheduleIdle() {
    cancelIdle();
    idleTimer = setTimeout(startIdleRoutine, IDLE_DELAY_MS);
  }
  function cancelIdle() {
    if (idleTimer)        { clearTimeout(idleTimer);        idleTimer = null; }
    if (idleRoutineTimer) { clearTimeout(idleRoutineTimer); idleRoutineTimer = null; }
  }
  function startIdleRoutine() {
    if (isMoving || isTransitioning) return;
    playMapAnim(2, function () {
      playStanding(2, function () { startIdleRoutine(); });
    });
  }
  function playMapAnim(loops, onDone) {
    var loop = 0, frame = 1;
    function step() {
      if (isMoving || isTransitioning) { if (onDone) onDone(); return; }
      var num = frame < 10 ? '0' + frame : '' + frame;
      charEl.src = SPRITE_PATH + 'adventurer-female-map-' + num + '.png';
      charEl.style.transform = 'translate(-50%, -100%)';
      frame++;
      if (frame > MAP_FRAMES) { frame = 1; loop++; if (loop >= loops) { if (onDone) onDone(); return; } }
      idleRoutineTimer = setTimeout(step, MAP_FRAME_MS);
    }
    step();
  }
  function playStanding(loops, onDone) {
    var loop = 0, ticks = 0, TICKS_PER_LOOP = 8;
    function step() {
      if (isMoving || isTransitioning) { if (onDone) onDone(); return; }
      charEl.src = SPRITE_PATH + 'adventurer-female-standing.png';
      charEl.style.transform = 'translate(-50%, -100%)';
      ticks++;
      if (ticks >= TICKS_PER_LOOP) { ticks = 0; loop++; if (loop >= loops) { if (onDone) onDone(); return; } }
      idleRoutineTimer = setTimeout(step, WALK_FRAME_MS);
    }
    step();
  }

  /* ── Load a map (swap image, build overlay, place character) ── */
  function loadMap(mapId, opts) {
    opts = opts || {};
    var data = MAPS[mapId];
    if (!data) { console.warn('[Overworld] Unknown map:', mapId); return; }

    currentMapId = mapId;
    mapImgEl.src = data.image;

    // Clear overlay (keep character element though)
    var prevChar = charEl;
    overlayEl.innerHTML = '';
    overlayEl.appendChild(prevChar);
    charEl = prevChar;

    // Place nodes
    data.nodes.forEach(function (n) {
      var nodeEl = document.createElement('div');
      nodeEl.className = 'overworld-node';
      nodeEl.dataset.id = n.id;
      nodeEl.style.left = n.x + '%';
      nodeEl.style.top  = n.y + '%';
      var img = document.createElement('img');
      img.src = n.image;
      img.alt = n.name;
      img.draggable = false;
      nodeEl.appendChild(img);
      // (no text label — node image alone)
      nodeEl.addEventListener('click', function () { onNodeClick(n); });
      overlayEl.appendChild(nodeEl);
    });

    // Place exit zones
    data.exits.forEach(function (e) {
      var exitEl = document.createElement('div');
      exitEl.className = 'overworld-exit';
      exitEl.style.left   = e.zone.x + '%';
      exitEl.style.top    = e.zone.y + '%';
      exitEl.style.width  = e.zone.w + '%';
      exitEl.style.height = e.zone.h + '%';
      var label = document.createElement('span');
      label.className = 'overworld-exit-label';
      label.textContent = e.label;
      exitEl.appendChild(label);
      exitEl.addEventListener('click', function () { onExitClick(e); });
      overlayEl.appendChild(exitEl);
    });

    // Position character
    var startPos = opts.entryAt || (opts.useSaved ? currentPos : data.spawn);
    currentPos.x = startPos.x; currentPos.y = startPos.y;
    positionChar(currentPos.x, currentPos.y);
    setStanding();

    // Fog handling — first visit to a fogged map rolls fog away
    var firstVisit = visitedMaps.indexOf(mapId) === -1;
    if (data.startsFogged && firstVisit) {
      showFog(true);
      if (typeof gsap !== 'undefined') {
        gsap.to(fogEl, {
          opacity: 0, duration: 2, ease: 'power2.out',
          onComplete: function () {
            fogEl.classList.remove('active');
            fogEl.style.opacity = '';
          }
        });
      } else {
        setTimeout(function () { showFog(false); }, 2000);
      }
    } else {
      showFog(false);
    }

    // Mark visited
    if (firstVisit) {
      visitedMaps.push(mapId);
    }
    saveState();
  }

  function showFog(on) {
    fogEl.classList.toggle('active', !!on);
    if (on) fogEl.style.opacity = '1';
  }

  /* ── Node click ────────────────────────────────────────────── */
  function onNodeClick(node) {
    if (isMoving || isTransitioning || isDialogueLocked) return;
    // Clicking the Prehistory node ends the urgent idle pulse if active
    clearUrgentPulse();

    // ── Adventure-mode Phase 2 dialogue: first click on Prehistory
    //    node runs the Explorer+Lucy exchange BEFORE walking. The
    //    intro-complete flag isn't set until Phase 2 finishes, so
    //    this condition catches exactly the first click.
    var needPhase2 = node.id === 'prehistory' &&
                     currentMapId === 'eastafrica' &&
                     localStorage.getItem(KEY_ADVENTURE_INTRO) !== 'true';

    var doWalk = function () {
      var path = node.path || [{ x: node.x, y: node.y }];
      walkPath(path, function () { scheduleIdle(); });
    };

    if (needPhase2) {
      log('Prehistory clicked for the first time — triggering Phase 2 before walk');
      playPhase2Then(doWalk);
    } else {
      doWalk();
    }
  }

  /* ── Exit click — walk then transition ─────────────────────── */
  function onExitClick(exit) {
    if (isMoving || isTransitioning || isDialogueLocked) return;
    walkPath([exit.walkTo], function () {
      transitionToMap(exit.target, exit.entryAt);
    });
  }

  /* ── Map transition: fade black + 'Traveling...' + swap ───── */
  function transitionToMap(targetMapId, entryAt) {
    if (isTransitioning) return;
    isTransitioning = true;
    cancelIdle();
    stopFootsteps();

    if (typeof gsap === 'undefined') {
      loadMap(targetMapId, { entryAt: entryAt });
      isTransitioning = false;
      return;
    }

    var tl = gsap.timeline({
      onComplete: function () {
        isTransitioning = false;
        scheduleIdle();
      }
    });

    // Fade to black (1s)
    tl.set(transitionEl, { visibility: 'visible' })
      .to(transitionEl, { opacity: 1, duration: 1, ease: 'power2.inOut' })
      // Show "Traveling..." text briefly while black
      .to(transitionTextEl, { opacity: 1, duration: 0.3 }, '-=0.2')
      // Swap map in the middle of the black period
      .call(function () { loadMap(targetMapId, { entryAt: entryAt }); })
      .to({}, { duration: 0.5 })          // hold on black with text
      .to(transitionTextEl, { opacity: 0, duration: 0.3 })
      // Fade out black (1s)
      .to(transitionEl, { opacity: 0, duration: 1, ease: 'power2.inOut' })
      .set(transitionEl, { visibility: 'hidden' });
  }

  /* ════════════════════════════════════════════════════════════
     ADVENTURE INTRO DIALOGUE — SNES-style typewriter
     ════════════════════════════════════════════════════════════ */

  /* Current dialogue runner state */
  var dlgRunning     = false;
  var dlgLines       = null;    // array of lines for active phase
  var dlgLineIdx     = 0;
  var dlgAdvanceHandler = null;

  function log(step) { console.log('[Adventure Intro] ' + step); }

  /* ── Phase 1: 3s wait → Explorer monologue ────────────────── */
  function maybePlayAdventureIntro() {
    var introDone    = localStorage.getItem(KEY_ADVENTURE_INTRO) === 'true';
    var isEastAfrica = currentMapId === 'eastafrica';

    log('check | introAlreadyDone=' + introDone + ' currentMap=' + currentMapId +
        ' boxes={explorer:' + !!explorerBoxEl + ', lucy:' + !!lucyBoxEl + '}');

    if (introDone)     { log('SKIP: intro flag already set'); return false; }
    if (!isEastAfrica) { log('SKIP: not on East Africa'); return false; }
    if (!lucyBoxEl || !explorerBoxEl) { log('SKIP: dialogue box DOM missing'); return false; }

    // Reset any stale CSS state on both boxes (display:none etc. from prior runs)
    resetBox(lucyBoxEl);
    resetBox(explorerBoxEl);

    isDialogueLocked = true;
    cancelIdle();
    log('Phase 1 scheduled in ' + PHASE1_WAIT_MS + 'ms (player will stand still)');
    setTimeout(function () {
      log('Phase 1 starting — fading in Explorer box');
      runDialogue(PHASE1_DIALOGUE, onPhase1End);
    }, PHASE1_WAIT_MS);

    return true;
  }

  function onPhase1End() {
    log('Phase 1 ended — unlocking movement, node becomes clickable');
    isDialogueLocked = false;
    // Flag is NOT set yet — Phase 2 still has to play on node click.
    // The Prehistory node's base CSS pulse is already active by default.
    scheduleIdle();
  }

  /* ── Phase 2: Explorer + Lucy exchange (on Prehistory click) ─ */
  function playPhase2Then(onFullyDone) {
    if (dlgRunning) { log('Phase 2 requested while already running — ignoring'); return; }
    log('Phase 2 starting');
    isDialogueLocked = true;
    cancelIdle();
    runDialogue(PHASE2_DIALOGUE, function () {
      log('Phase 2 ended');
      isDialogueLocked = false;
      localStorage.setItem(KEY_ADVENTURE_INTRO, 'true');
      log('sog_adventure_intro_complete set to true');
      if (onFullyDone) onFullyDone();
    });
  }

  /* ── Generic dialogue runner (used by both phases) ────────── */
  function runDialogue(lines, onDone) {
    dlgRunning  = true;
    dlgLines    = lines;
    dlgLineIdx  = 0;
    dlgAdvanceHandler = function (e) {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      advanceLine();
    };
    // Defer listener attachment so we don't catch the same click that
    // triggered this dialogue (e.g. the Prehistory-node click that fires
    // Phase 2). Without this, the click bubbles to document, hits
    // dlgAdvanceHandler, and skips line 1 before typing has even started.
    setTimeout(function () {
      document.addEventListener('click',   dlgAdvanceHandler);
      document.addEventListener('keydown', dlgAdvanceHandler);
    }, 0);

    showLine(function () {
      // called when all lines done
      document.removeEventListener('click',   dlgAdvanceHandler);
      document.removeEventListener('keydown', dlgAdvanceHandler);
      dlgAdvanceHandler = null;
      fadeBox(explorerBoxEl, false);
      fadeBox(lucyBoxEl,     false);
      dlgRunning = false;
      dlgLines   = null;
      log('dialogue runner finished');
      if (onDone) onDone();
    });
  }

  /* Per-line typewriter state */
  var ty_fullText = '';
  var ty_shownLen = 0;
  var ty_timer    = null;
  var ty_isTyping = false;
  var ty_activeBox = null;
  var ty_activeText = null;
  var ty_onLineDone = null;

  function showLine(onAllLinesDone) {
    var line = dlgLines[dlgLineIdx];
    if (!line) { if (onAllLinesDone) onAllLinesDone(); return; }
    log('line ' + (dlgLineIdx + 1) + '/' + dlgLines.length + ' [' + line.who + '] "' + line.text + '"');

    var activeBox = (line.who === 'lucy') ? lucyBoxEl : explorerBoxEl;
    ty_activeBox  = activeBox;
    ty_activeText = activeBox.querySelector('.adv-dialogue-text');

    // Fade box in if not visible, then start typing
    if (!activeBox.classList.contains('is-visible')) {
      fadeBox(activeBox, true, function () { typeLine(line, onAllLinesDone); });
    } else {
      typeLine(line, onAllLinesDone);
    }
  }

  function typeLine(line, onAllLinesDone) {
    ty_fullText = line.text;
    ty_shownLen = 0;
    ty_isTyping = true;
    ty_activeText.textContent = '';
    ty_activeBox.classList.remove('is-ready');
    ty_onLineDone = onAllLinesDone;

    if (ty_timer) clearInterval(ty_timer);
    var bleepCount = 0;
    ty_timer = setInterval(function () {
      ty_shownLen++;
      ty_activeText.textContent = ty_fullText.slice(0, ty_shownLen);
      var c = ty_fullText.charAt(ty_shownLen - 1);
      if (c && c !== ' ' && c !== '\n') {
        bleepCount++;
        if (bleepCount >= BLEEP_EVERY_CHARS) { bleepCount = 0; playBleep(line.who); }
      }
      if (ty_shownLen >= ty_fullText.length) {
        clearInterval(ty_timer); ty_timer = null;
        ty_isTyping = false;
        ty_activeBox.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  function advanceLine() {
    if (ty_isTyping) {
      // Skip typewriter — show full text immediately
      if (ty_timer) { clearInterval(ty_timer); ty_timer = null; }
      ty_shownLen = ty_fullText.length;
      ty_activeText.textContent = ty_fullText;
      ty_activeBox.classList.add('is-ready');
      ty_isTyping = false;
      return;
    }
    dlgLineIdx++;
    if (dlgLineIdx >= dlgLines.length) {
      if (ty_onLineDone) ty_onLineDone();
      return;
    }
    showLine(ty_onLineDone);
  }

  /* ── Dialogue box visibility helpers ──────────────────────── */
  function resetBox(el) {
    if (!el) return;
    el.classList.remove('is-visible', 'is-ready');
    el.style.opacity    = '';
    el.style.visibility = '';
    el.style.display    = '';
    var t = el.querySelector('.adv-dialogue-text');
    if (t) t.textContent = '';
  }

  function fadeBox(el, show, onComplete) {
    if (!el) { if (onComplete) onComplete(); return; }
    if (show) {
      el.classList.add('is-visible');
      // Nuke any stale inline style that could be blocking visibility
      el.style.display    = 'grid';
      el.style.visibility = 'visible';
      el.style.zIndex     = '9999';
    }
    if (typeof gsap === 'undefined') {
      el.style.opacity = show ? 1 : 0;
      if (!show) el.classList.remove('is-visible', 'is-ready');
      if (onComplete) onComplete();
      return;
    }
    if (show) {
      gsap.fromTo(el, { opacity: 0 }, {
        opacity: 1, duration: 0.35, ease: 'power2.out',
        onComplete: function () {
          // Diagnostic: prove the box is actually rendered on screen
          var rect  = el.getBoundingClientRect();
          var style = window.getComputedStyle(el);
          console.log('[Adventure Intro] box fade-in complete:', {
            id:         el.id,
            rect:       { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            display:    style.display,
            visibility: style.visibility,
            opacity:    style.opacity,
            zIndex:     style.zIndex,
            position:   style.position,
            onScreen:   rect.width > 0 && rect.height > 0 &&
                        rect.bottom > 0 && rect.right > 0 &&
                        rect.top < window.innerHeight && rect.left < window.innerWidth
          });
          // Also verify the portrait image actually loaded
          var portrait = el.querySelector('.adv-dialogue-portrait');
          if (portrait) {
            console.log('[Adventure Intro] portrait "' + portrait.src + '" loaded=' +
              portrait.complete + ' naturalW=' + portrait.naturalWidth);
            if (!portrait.complete || portrait.naturalWidth === 0) {
              portrait.addEventListener('error', function () {
                console.warn('[Adventure Intro] portrait FAILED to load:', portrait.src);
              });
              portrait.addEventListener('load', function () {
                console.log('[Adventure Intro] portrait loaded (late):', portrait.src);
              });
            }
          }
          if (onComplete) onComplete();
        }
      });
    } else {
      gsap.to(el, {
        opacity: 0, duration: 0.3, ease: 'power2.in',
        onComplete: function () {
          el.classList.remove('is-visible', 'is-ready');
          if (onComplete) onComplete();
        }
      });
    }
  }

  /* ── Prehistory node urgent-pulse escalation ───────────────── */
  function scheduleUrgentPulse() {
    clearUrgentPulse();
    urgentPulseTimer = setTimeout(function () {
      var nodeEl = overlayEl && overlayEl.querySelector('[data-id="prehistory"]');
      if (!nodeEl) return;
      nodeEl.classList.add('overworld-node-urgent');
    }, 30000);
  }
  function clearUrgentPulse() {
    if (urgentPulseTimer) { clearTimeout(urgentPulseTimer); urgentPulseTimer = null; }
    if (overlayEl) {
      var nodeEl = overlayEl.querySelector('.overworld-node-urgent');
      if (nodeEl) nodeEl.classList.remove('overworld-node-urgent');
    }
  }

  /* ── Public init ───────────────────────────────────────────── */
  function init() {
    mapImgEl         = document.getElementById('overworld-map');
    overlayEl        = document.getElementById('overworld-overlay');
    charEl           = document.getElementById('overworld-character');
    fogEl            = document.getElementById('overworld-fog-full');
    transitionEl     = document.getElementById('overworld-transition');
    transitionTextEl = document.getElementById('overworld-transition-text');
    lucyBoxEl        = document.getElementById('adv-dialogue-lucy');
    explorerBoxEl    = document.getElementById('adv-dialogue-explorer');
    if (!mapImgEl || !overlayEl || !charEl) {
      console.warn('[Overworld] Missing DOM elements');
      return;
    }

    loadState();

    // If the adventure intro hasn't been seen yet, FORCE the player to
    // East Africa regardless of saved state. Otherwise a stale saved map
    // (e.g. Egypt from testing) would skip the East Africa check and
    // the intro would never fire.
    var introDone = localStorage.getItem(KEY_ADVENTURE_INTRO) === 'true';
    if (!introDone && currentMapId !== 'eastafrica') {
      console.log('[Overworld] Intro not yet seen — forcing start on East Africa');
      currentMapId = 'eastafrica';
      currentPos   = { x: MAPS.eastafrica.spawn.x, y: MAPS.eastafrica.spawn.y };
    }

    // Returning players (intro already seen) restore their saved position;
    // new Adventure Mode players always spawn at East Africa's default.
    loadMap(currentMapId, { useSaved: introDone });

    // If this is the player's first time on East Africa, play the
    // scripted intro dialogue (locks movement until it ends).
    var dialogueStarted = maybePlayAdventureIntro();
    if (!dialogueStarted) scheduleIdle();
  }

  /* ── Expose ────────────────────────────────────────────────── */
  return {
    init: init,
    reset: function () {
      localStorage.removeItem(KEY_MAP);
      localStorage.removeItem(KEY_POS);
      localStorage.removeItem(KEY_VISITED);
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      console.log('[Overworld] All state reset');
    },
    resetIntro: function () {
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      console.log('[Overworld] Intro flag cleared — intro will play next time you arrive on East Africa');
    },
    // Force-play Phase 1 (arrival dialogue) right now, bypassing all gates
    playIntro: function () {
      console.log('[Adventure Intro] Force-triggering Phase 1');
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      isDialogueLocked = true;
      cancelIdle();
      resetBox(lucyBoxEl); resetBox(explorerBoxEl);
      runDialogue(PHASE1_DIALOGUE, function () {
        isDialogueLocked = false;
        console.log('[Adventure Intro] Phase 1 ended (Phase 2 will fire when you click Prehistory)');
        scheduleIdle();
      });
    },
    // Force-play Phase 2 (Lucy meets Explorer) — for testing the second half
    playPhase2: function () {
      console.log('[Adventure Intro] Force-triggering Phase 2');
      localStorage.removeItem(KEY_ADVENTURE_INTRO);
      resetBox(lucyBoxEl); resetBox(explorerBoxEl);
      playPhase2Then(function () {
        console.log('[Adventure Intro] Phase 2 ended (character would now walk to node)');
      });
    },
    // Devtools helpers
    goToMap: function (mapId) {
      if (!MAPS[mapId]) { console.warn('No such map:', mapId); return; }
      transitionToMap(mapId, MAPS[mapId].spawn);
    }
  };
})();

window.Overworld = Overworld;

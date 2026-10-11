/* ═══════════════════════════════════════════════════════════════
   SOG.Adventurers — playable-character sprite/portrait registry
   ═══════════════════════════════════════════════════════════════
   Single source of truth for the player characters' sprite sequences,
   frame counts, and portraits. home.js (character select), overworld.js
   (map walking + idle), and sog-adventure-hud.js (corner portrait) all
   read from here, so adding a third character means adding one entry
   below — no animation-logic changes.

   Sequence facts the consumers rely on:
   - There is no 'left' walk sequence for any character. Left is always
     the 'right' frames mirrored with scaleX(-1) at the call site.
   - Frame counts differ per character AND per sequence (the female's
     walk cycles are 4/6/8 frames, the male's are uniform 7s; her
     map-reading idle is 9 frames named "map", his is 12 named
     "mapidle"). The overworld walk advances frames by DISTANCE (one
     full cycle = two steps, see overworld.js WALK_CYCLE_PX), so a
     longer walk sequence just shows its frames at a faster rate; the
     map-reading idle stays on a fixed MAP_FRAME_MS.
   - The male set ships no dedicated standing frame; his idle-01 serves
     as the resting pose. He has no back-facing standing frame either,
     so after walking up he turns to face front (standingBack: null).

   Selection is owned by home.js (localStorage 'sog_selected_adventurer',
   written by the character-select click). This module only reads it,
   defaulting to female for saves that predate the male character.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY_ADVENTURER = 'sog_selected_adventurer';

  var CHARACTERS = {
    female: {
      path: 'images/metaworld/character sprites/female/',
      prefix: 'adventurer-female-',
      walk: { down: 4, right: 8, up: 8 },        // 'left' mirrors 'right'; right = highest frame number
      /* WALK TUNING (overworld + home screen). Four knobs per sequence, keyed
         by FRAME NUMBER, read through frameAt / frameShift below:
           walkFrames       play order (default 1..n; raise walk.<seq> to the
                            highest frame number when adding frames)
           walkFrameWeight  share of the cycle each frame holds (default 1)
           walkFrameDx/Dy   source-px registration shift (head pin / bob),
                            applied after the mirror so left matches right.
         SIDE (right-01..08, 'left' mirrors): rebuilt from the 4×2 Gemini sheet
         reference/sprite-sources/female/female-side-sheet.png (git-ignored).
         Gemini draws the lighter NEAR leg in front in every pose, so only its
         top row is used, as one step (contact, down, passing, up); the other
         step is the same four poses with the legs' shading swapped (skin and
         boots), the swinging leg redrawn in front where it crosses (the near
         leg always on top), the far fist hidden and the near arm swung forward.
         Built at the sheet's native 160×160 pixel grid on one shared 40-colour
         palette, scaled ×2.04 to the 159 px figure, hat pinned at x = 82.
         Order in the files = play order:
           01 contact   02 down   03 passing   04 up (swapped)
           05 contact (swapped)  06 down (swapped)  07 passing (swapped)  08 up
         The sheet's 'up' (04/08) has the forward leg drawn light, so the
         swapped copy plays FIRST (after 03, whose dark leg is swinging forward)
         and the original closes the cycle — that keeps each leg moving one way.
         04/08 nearly repeat 01/05, so they hold 0.75 of a share and the down/
         passing frames 1.25. The previous side frames and their tuning are in
         reference/sprite-rollback/female-side-ee23c4c/.
         DOWN  01 → 04 → 02 → 03: contact, pass, contact, pass (the drawn order
               left the left step with no passing frame); 04, drawn ~3 source
               px short, is lifted to level it.
         UP    01 06 07 03 04 05 02 08: lift peaks (08 right, 03 left) four
               frames apart. The art already bobs on 03/08.
         Every old-style frame had a light keying rim, cleared from the OUTER
         edge only (enclosed holes such as the compass face are untouched). */
      walkFrames:      { up: [1, 6, 7, 3, 4, 5, 2, 8], down: [1, 4, 2, 3] },
      walkFrameDx:     { up:    { 4: -1, 5: -2, 6: -1, 7: -0.5 },
                         down:  { 2: 0.5, 3: -1, 4: 1.25 } },
      walkFrameDy:     { down: { 4: -1.74 } },
      walkFrameWeight: { right: { 1: 0.75, 2: 1.25, 3: 1.25, 4: 0.75, 5: 0.75, 6: 1.25, 7: 1.25, 8: 0.75 } },
      frameSize: 160,                            // source px of every sprite frame
      idleFrames: 6,                             // preloaded only (no player yet)
      mapIdle: { seq: 'map', frames: 9 },        // 1s/frame reading-the-map loop
      standing: 'adventurer-female-standing.png',
      standingBack: 'adventurer-female-standing-backward.png',   // rest pose after walking UP
      /* Rest pose after walking SIDEWAYS (mirrored for left), so she plants her
         feet instead of turning to face the camera. Built from side-walk frame
         02 (same sheet, same 40-colour palette): upper body as drawn, far fist
         hidden (arms relaxed at her sides), the shorts' front squared off, the
         near leg straight with its boot flat and the far leg a darker copy 2 px
         behind it. Rendered with the walk frames' registration, so its hat rows
         are pixel-identical to right-02's and the stop has no shift. */
      standingSide:   'adventurer-female-standing-right.png',
      standingSideDx: 0,
      extraFrames: [],
      portrait: 'images/portraits/femaleexplorer portrait.jpeg'
    },
    male: {
      path: 'images/metaworld/character sprites/male_sprite/',
      prefix: 'adventurer-male-',
      walk: { down: 7, right: 7, up: 7 },        // clean two-step cycles; no tuning needed
      frameSize: 160,
      idleFrames: 7,
      mapIdle: { seq: 'mapidle', frames: 12 },   // longer loop, same 1s/frame rate
      standing: 'adventurer-male-idle-01.png',   // no dedicated standing frame shipped
      standingBack: null,                        // no back-facing frame shipped → faces front
      standingSide: null,                        // no side rest frame → faces front after a side walk
      extraFrames: [],
      portrait: 'images/portraits/male_explorer.jpg'
    }
  };

  function get(id) { return CHARACTERS[id] || CHARACTERS.female; }

  function activeId() {
    try {
      var v = localStorage.getItem(KEY_ADVENTURER);
      return CHARACTERS[v] ? v : 'female';
    } catch (e) { return 'female'; }
  }

  function active() { return get(activeId()); }

  function _pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* URL of frame n (1-based) of a named sequence, e.g. frameUrl(ch,'right',3). */
  function frameUrl(ch, seq, n) {
    return ch.path + ch.prefix + seq + '-' + _pad(n) + '.png';
  }

  /* The resting pose. facing 'up' (she just walked away from the camera) uses
     the back-facing frame when the character ships one; otherwise front. */
  function standingUrl(ch, facing) {
    if (facing === 'up' && ch.standingBack) return ch.path + ch.standingBack;
    if ((facing === 'left' || facing === 'right') && ch.standingSide) return ch.path + ch.standingSide;
    return ch.path + ch.standing;
  }

  /* Every frame this character can show — walk cycles, the idle cycle, the
     map-reading idle, the standing pose, and any character-specific extras.
     Used by overworld.js to warm the image cache on map load. */
  /* The frame numbers a walk sequence plays, in order (1..n unless the
     character lists its own order — see walkFrames). */
  function walkOrder(ch, seq) {
    var list = ch.walkFrames && ch.walkFrames[seq];
    if (list && list.length) return list.slice();
    var out = [];
    for (var i = 1; i <= (ch.walk[seq] || 0); i++) out.push(i);
    return out;
  }

  /* The frame shown at `phase` (0..1) of one walk cycle, each frame holding its
     walkFrameWeight share (default 1). */
  function frameAt(ch, seq, phase) {
    var order = walkOrder(ch, seq);
    if (!order.length) return 1;
    var wts = (ch.walkFrameWeight && ch.walkFrameWeight[seq]) || {};
    var w = function (n) { return wts[n] != null ? wts[n] : 1; };
    var total = 0, i;
    for (i = 0; i < order.length; i++) total += w(order[i]);
    var at = phase * total, acc = 0;
    for (i = 0; i < order.length; i++) {
      acc += w(order[i]);
      if (at < acc) return order[i];
    }
    return order[order.length - 1];
  }

  /* Per-frame registration of a walk frame, in SOURCE px: { dx, dy }. */
  function frameShift(ch, seq, frame) {
    var x = ch.walkFrameDx && ch.walkFrameDx[seq], y = ch.walkFrameDy && ch.walkFrameDy[seq];
    return { dx: (x && x[frame]) || 0, dy: (y && y[frame]) || 0 };
  }

  /* That shift as a CSS transform suffix for a sprite drawn `widthPx` wide.
     Goes AFTER any scaleX(-1), so it mirrors with the frame. */
  function shiftCss(ch, seq, frame, widthPx) {
    var s = frameShift(ch, seq, frame), k = (widthPx || 92) / (ch.frameSize || 160);
    return (s.dx ? ' translateX(' + (s.dx * k).toFixed(2) + 'px)' : '') +
           (s.dy ? ' translateY(' + (s.dy * k).toFixed(2) + 'px)' : '');
  }

  function allFrameUrls(ch) {
    var out = [], d, i;
    for (d in ch.walk) {
      walkOrder(ch, d).forEach(function (n) { out.push(frameUrl(ch, d, n)); });
    }
    for (i = 1; i <= ch.idleFrames; i++) out.push(frameUrl(ch, 'idle', i));
    for (i = 1; i <= ch.mapIdle.frames; i++) out.push(frameUrl(ch, ch.mapIdle.seq, i));
    out.push(standingUrl(ch));
    if (ch.standingBack) out.push(ch.path + ch.standingBack);
    if (ch.standingSide) out.push(ch.path + ch.standingSide);
    (ch.extraFrames || []).forEach(function (f) { out.push(ch.path + f); });
    return out;
  }

  /* The active character's portrait URL. Every player-portrait surface
     PULLS this at render time (HUD corner on show(), battle ally avatar in
     _setBattleAvatar, the speech-bubble via the watcher below) — nothing is
     pushed at selection time, so a surface built after selection is correct
     by default. */
  function portrait() { return active().portrait; }

  /* Legacy hardcoded player-portrait paths. Anything that still hands one
     of these to a render site (old level data, a missed presentation
     block) means "the player", not "the female explorer" — resolve it to
     the active character instead of showing the wrong face. */
  var LEGACY_PLAYER_PORTRAITS = ['images/portraits/femaleexplorer portrait.jpeg'];

  /* True for the 'player' sentinel and for legacy hardcoded paths. */
  function isPlayerPortraitRef(src) {
    if (src === 'player') return true;
    try { src = decodeURIComponent(src); } catch (e) {}
    return LEGACY_PLAYER_PORTRAITS.indexOf(src) !== -1;
  }

  /* The player battle speech-bubble (#adv-bubble-explorer) is static markup
     shown by several independent runners (SOG.DialogueRunner plus the older
     per-boss bubble helpers in otzi/prehistory). Rather than wiring a
     refresh into every show path, watch the bubble and pull the active
     portrait the moment it becomes visible. */
  function _watchExplorerBubble() {
    if (typeof document === 'undefined') return;   // node test harness
    var bubble = document.getElementById('adv-bubble-explorer');
    var img = bubble && bubble.querySelector('.adv-bubble-portrait');
    if (!bubble || !img) return;
    function refresh() {
      var want = portrait();
      if (img.getAttribute('data-portrait') !== want) {
        img.src = want;
        img.setAttribute('data-portrait', want);
      }
    }
    refresh();                                     // correct before first show
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      if (bubble.classList.contains('is-visible')) refresh();
    }).observe(bubble, { attributes: true, attributeFilter: ['class'] });
  }

  window.SOG = window.SOG || {};
  window.SOG.Adventurers = {
    get: get,
    activeId: activeId,
    active: active,
    frameUrl: frameUrl,
    walkOrder: walkOrder,
    frameAt: frameAt,
    frameShift: frameShift,
    shiftCss: shiftCss,
    standingUrl: standingUrl,
    allFrameUrls: allFrameUrls,
    portrait: portrait,
    isPlayerPortraitRef: isPlayerPortraitRef
  };

  /* Scripts sit at the end of <body>, so the bubble exists already. */
  _watchExplorerBubble();
})();

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
      walk: { down: 4, right: 6, up: 8 },        // 'left' mirrors 'right'
      /* SIDE-WALK TUNING (overworld). Her six side frames show only ONE leg
         crossing: the near (lighter) leg leads in 01-03, 05, 06 and the far leg
         leads in 04 alone, with no passing pose either side, and the head drifts
         6 source px forward over 01->04 then snaps back. Three knobs, all keyed
         by FRAME NUMBER so new in-between frames slot in without renumbering:
           walkFrames   play order. Add passing frames here (e.g. 07 between 03
                        and 04, 08 between 04 and 05 → [1,2,3,7,4,8,5,6]) and
                        raise walk.right to the highest frame number.
           walkFrameDx  source-px shift that pins the head to the frame centre
                        (x = 80 of 160), so the body glides instead of lurching
                        and the mirrored left walk lines up with the right.
           walkFrameWeight  share of the stride each frame holds (default 1):
                        the far-leg step (04) gets more, the two arm-forward
                        transition frames (03, 05) less, so both steps and both
                        arm swings get about equal time. */
      walkFrames:      { right: [1, 2, 3, 4, 5, 6] },
      walkFrameDx:     { right: { 1: 1.8, 2: -1.2, 3: -4.3, 4: -4.7, 5: -4.4, 6: -3.5 } },
      walkFrameWeight: { right: { 3: 0.5, 4: 2, 5: 0.5 } },
      frameSize: 160,                            // source px of every sprite frame
      idleFrames: 6,                             // preloaded only (no player yet)
      mapIdle: { seq: 'map', frames: 9 },        // 1s/frame reading-the-map loop
      standing: 'adventurer-female-standing.png',
      standingBack: 'adventurer-female-standing-backward.png',   // rest pose after walking UP
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

  function allFrameUrls(ch) {
    var out = [], d, i;
    for (d in ch.walk) {
      walkOrder(ch, d).forEach(function (n) { out.push(frameUrl(ch, d, n)); });
    }
    for (i = 1; i <= ch.idleFrames; i++) out.push(frameUrl(ch, 'idle', i));
    for (i = 1; i <= ch.mapIdle.frames; i++) out.push(frameUrl(ch, ch.mapIdle.seq, i));
    out.push(standingUrl(ch));
    if (ch.standingBack) out.push(ch.path + ch.standingBack);
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
    standingUrl: standingUrl,
    allFrameUrls: allFrameUrls,
    portrait: portrait,
    isPlayerPortraitRef: isPlayerPortraitRef
  };

  /* Scripts sit at the end of <body>, so the bubble exists already. */
  _watchExplorerBubble();
})();

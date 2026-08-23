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
     "mapidle"). Frame RATE is shared — WALK_FRAME_MS / MAP_FRAME_MS
     stay in the consumers — so a longer sequence simply runs longer.
   - The male set ships no dedicated standing frame; his idle-01 serves
     as the resting pose.

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
      idleFrames: 6,                             // preloaded only (no player yet)
      mapIdle: { seq: 'map', frames: 9 },        // 1s/frame reading-the-map loop
      standing: 'adventurer-female-standing.png',
      extraFrames: ['adventurer-female-standing-backward.png'],
      portrait: 'images/portraits/femaleexplorer portrait.jpeg'
    },
    male: {
      path: 'images/metaworld/character sprites/male_sprite/',
      prefix: 'adventurer-male-',
      walk: { down: 7, right: 7, up: 7 },
      idleFrames: 7,
      mapIdle: { seq: 'mapidle', frames: 12 },   // longer loop, same 1s/frame rate
      standing: 'adventurer-male-idle-01.png',   // no dedicated standing frame shipped
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

  function standingUrl(ch) { return ch.path + ch.standing; }

  /* Every frame this character can show — walk cycles, the idle cycle, the
     map-reading idle, the standing pose, and any character-specific extras.
     Used by overworld.js to warm the image cache on map load. */
  function allFrameUrls(ch) {
    var out = [], d, i;
    for (d in ch.walk) {
      for (i = 1; i <= ch.walk[d]; i++) out.push(frameUrl(ch, d, i));
    }
    for (i = 1; i <= ch.idleFrames; i++) out.push(frameUrl(ch, 'idle', i));
    for (i = 1; i <= ch.mapIdle.frames; i++) out.push(frameUrl(ch, ch.mapIdle.seq, i));
    out.push(standingUrl(ch));
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
    standingUrl: standingUrl,
    allFrameUrls: allFrameUrls,
    portrait: portrait,
    isPlayerPortraitRef: isPlayerPortraitRef
  };

  /* Scripts sit at the end of <body>, so the bubble exists already. */
  _watchExplorerBubble();
})();

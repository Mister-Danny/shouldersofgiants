/**
 * preload.js — SOG.preload (Stage 1 asset-loading fix)
 *
 * Warms the browser cache for the assets a battle / scene is ABOUT to need, just
 * before it needs them, so the existing display/play code hits cache instead of a
 * cold network fetch mid-animation (the online lag). Fire-and-forget: kicks off
 * the fetches and returns immediately — it NEVER blocks the game, and it does NOT
 * change how assets are displayed or played. De-duped so re-calls are cheap.
 *
 * Public API:
 *   SOG.preload.images(urls)  — warm a list of image URLs (new Image().src)
 *   SOG.preload.audio(urls)   — warm a list of audio file URLs (new Audio().load)
 *   SOG.preload.battle(G)     — at battle start: both decks' card art (+@sm),
 *                               reveal-fx overlay art, adventure SFX (+ ability
 *                               SFX once/session)
 */
window.SOG = window.SOG || {};
SOG.preload = (function () {
  'use strict';

  var _img = Object.create(null);   // url → Image  (de-dupe)
  var _aud = Object.create(null);   // url → Audio  (de-dupe)

  // Warm image URLs. The browser caches each fetch; later `img.src = url` is instant.
  function images(urls) {
    if (!urls) return;
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i];
      if (!u || _img[u]) continue;
      try { var im = new Image(); im.src = u; _img[u] = im; } catch (e) {}
    }
  }

  // Warm audio file URLs into the HTTP cache so the later Howl/new-Audio play()
  // (audio.js getters + SOG.sfx.play) reads from cache instead of fetching.
  function audio(urls) {
    if (!urls) return;
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i];
      if (!u || _aud[u]) continue;
      try { var a = new Audio(); a.preload = 'auto'; a.src = u; a.load(); _aud[u] = a; } catch (e) {}
    }
  }

  /* ── Per-battle asset sets ─────────────────────────────────────────────── */

  // Reveal-fx overlay art — created mid-reveal in js/game/reveal-fx.js and animated
  // immediately, so it pops in late online. Keep in sync with reveal-fx.js.
  var REVEAL_FX_IMAGES = [
    'images/assets/caveart@0.5x.png',
    'images/assets/onion@0.25x.png',
    'images/assets/cuneiformstamp.png',
    'images/assets/mesospear@0.25x.png',
    'images/assets/arrow@0.25x.png'
  ];

  // Adventure reveal / board sounds played via SOG.sfx.play (new Audio per call).
  var ADVENTURE_SFX = [
    'sfx/woosh.m4a', 'sfx/cuneiformstamp.mp3', 'sfx/chariot.mp3',
    'sfx/magicshimmer.m4a', 'sfx/matchstrike.m4a', 'sfx/yoink.mp3'
  ];

  // File-backed card-ability SFX (the lazy Howls in js/audio.js — created on first
  // play). Mostly first-25 (Arcadium) cards, so warm ONCE per session rather than
  // every battle. Keep in sync with audio.js.
  var ABILITY_SFX = [
    'sfx/cortes-destroy.mp3', 'sfx/cortes-deflate.mp3', 'sfx/joan-warhorn.mp3',
    'sfx/william-mine.mp3', 'sfx/samurai-rise.mp3', 'sfx/scholar-officials-coin.mp3',
    'sfx/pacal-rewind.mp3', 'sfx/empresswu-push.mp3', 'sfx/erasmus-noyield.mp3',
    'sfx/henrynav-watermoney.mp3', 'sfx/zhenghe-bubble.mp3', 'sfx/boat-waves.mp3',
    'sfx/columbus-churchbell.mp3', 'sfx/voltaire-break.mp3', 'sfx/waterflow.m4a',
    'sfx/francis-prayer.mp3', 'sfx/justinian-reset.mp3', 'sfx/kente-shield.mp3',
    'sfx/juvenal-laugh.mp3', 'sfx/demedici-money.mp3', 'sfx/jesus-resurrect.mp3',
    'sfx/janhus-firebell.mp3'
  ];
  var _abilityWarmed = false;

  function _cardImage(id) {
    var arr = (typeof CARDS !== 'undefined') ? CARDS : [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i].image;
    return null;
  }

  // Battle start: warm both decks' card art (+ the @sm hand variant for .jpg art),
  // the reveal-fx overlays, and the battle's SFX. Reads the freshly-built G decks.
  function battle(G) {
    if (!G) return;
    var ids = [].concat(G.playerDeck || [], G.playerHand || [], G.aiDeck || [], G.aiHand || []);
    var urls = [];
    for (var i = 0; i < ids.length; i++) {
      var im = _cardImage(ids[i]);
      if (!im) continue;
      urls.push(im);
      if (/\.jpg$/.test(im)) urls.push(im.replace(/\.jpg$/, '@sm.jpg'));   // hand uses @sm (ui.js)
    }
    images(urls);
    images(REVEAL_FX_IMAGES);
    audio(ADVENTURE_SFX);
    if (!_abilityWarmed) { _abilityWarmed = true; audio(ABILITY_SFX); }
  }

  return { images: images, audio: audio, battle: battle };
})();

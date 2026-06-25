/**
 * sog-adventure-hud.js
 * Shoulders of Giants — Adventure Mode HUD (Phase H1 + H2)
 *
 * State A (resting): bottom bar shows player portrait / deck slots / music / util buttons.
 * State B (dialogue): deck slots + music fade out, full-width dialogue text appears,
 *   NPC portrait slides up from below into the right zone.
 *
 * Public API  (window.SOG.HUD):
 *   .show()                               — force-show bar (override CSS)
 *   .hide()                               — force-hide bar
 *   .refreshDecks()                       — re-render deck slot tiles
 *   .runDialogue(lines, onDone)           — enter → run all lines → exit
 *   .runLines(lines, onDone)              — run lines (assumes already in dialogue mode)
 *   .enterDialogueMode(config, onReady)   — transition to State B (config optional)
 *   .exitDialogueMode(onDone)             — transition back to State A
 *   .showDialogueLine(line)               — alias for single-line via runLines
 *   .swapNpcPortrait(config, onDone)      — crossfade NPC portrait in-slot
 *   .slideOutNpc(onDone)                  — slide NPC slot down (mid-dialogue exit)
 *   .applyBattleAvatars(presentation)     — set both battle-screen avatar slots
 *   .restoreBattleAvatars()               — reset both slots to the HTML baseline
 *
 * Character keys: 'explorer' | 'lucy' | 'neanderthal' | 'otzi' | 'hunter' |
 *                 'farmer'   | 'gilgamesh' | 'sargon'
 *
 * Dependencies (must load before this file):
 *   js/decks.js     — window.Decks
 *   js/game/ui.js   — SOG.music
 */

var SOG = window.SOG || {};

SOG.HUD = (function () {
  'use strict';

  function log(msg) { console.log('[HUD] ' + msg); }

  /* ══════════════════════════════════════════════════════════════
     CHARACTER REGISTRY
  ══════════════════════════════════════════════════════════════ */

  var CHARACTERS = {
    explorer:    { portrait: 'images/portraits/femaleexplorer portrait.jpeg', bleepHz: 520, side: 'player' },
    lucy:        { portrait: 'images/portraits/Lucy.png',                     bleepHz: 480, side: 'npc'    },
    neanderthal: { portrait: 'images/portraits/neanderthalportait.jpeg', bleepHz: 160, side: 'npc' },
    otzi:        { portrait: 'images/portraits/otzi.jpg',           bleepHz: 280, side: 'npc', frame: 'otzi' },
    hunter:      { portrait: 'images/portraits/hunterportrait.jpg', bleepHz: 380, side: 'npc'    },
    farmer:      { portrait: 'images/portraits/farmerportrait.jpg', bleepHz: 360, side: 'npc'    },
    gilgamesh:   { portrait: 'images/portraits/gilgameshportrait.jpeg', bleepHz: 210, side: 'npc' },  // bleep routed through the 'otzi' synth branch (matches his battle voice)
    sargon:      { portrait: 'images/portraits/sargonportrait.jpg', bleepHz: 440, side: 'npc'    },
    hammurabi:   { portrait: 'images/portraits/hammurabi.jpg', bleepHz: 240, side: 'npc' },
    nebuchadnezzar: { portrait: 'images/portraits/nebuchadnezzar.jpg', bleepHz: 200, side: 'npc' },
    trader:      { portrait: 'images/portraits/mesotrader@0.5x.jpg', bleepHz: 300, side: 'npc'   }
  };

  /* ══════════════════════════════════════════════════════════════
     DOM REFERENCES  (populated in init)
  ══════════════════════════════════════════════════════════════ */

  var _hudEl       = null;   // #adv-hud
  var _deckEl      = null;   // #adv-hud-deck  (card-back → opens deck builder)
  var _deckNameEl  = null;   // #adv-hud-deck-name (active deck's saved name)
  var _playerPortEl = null;  // #adv-hud-portrait  (the zone element)
  var _dlgEl           = null;   // #adv-hud-dialogue
  var _dlgTextEl       = null;   // #adv-hud-dialogue-text        (player zone)
  var _dlgNpcTextEl    = null;   // #adv-hud-dialogue-text-npc    (NPC zone)
  var _dlgPlayerZoneEl = null;   // #adv-hud-dlg-player
  var _dlgNpcZoneEl    = null;   // #adv-hud-dlg-npc
  var _dlgActiveTextEl = null;   // whichever text element is currently typing
  var _npcSlotEl   = null;   // #adv-hud-npc-slot
  var _npcImgEl    = null;   // #adv-hud-npc-img

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */

  var _initialised  = false;
  var _inDialogue   = false;
  var _npcVisible   = false;
  var _currentNpc   = null;   // character key currently in NPC slot

  /* ══════════════════════════════════════════════════════════════
     AUDIO  (Web Audio synth bleep — no asset required)
  ══════════════════════════════════════════════════════════════ */

  var _audioCtx = null;
  var BLEEP_EVERY_N = 2;

  function _getAudioCtx() {
    if (_audioCtx) return _audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _audioCtx = new Ctx();
    } catch (e) {}
    return _audioCtx;
  }

  function _playBleep(who) {
    var ctx = _getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var now  = ctx.currentTime;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    if (who === 'lucy') {
      // Lucy's canonical bleep — identical to the original tutorial battle
      // (tutorial.js playBlip): sine, 480 Hz, fast linear attack + linear
      // decay. Kept in sync everywhere Lucy speaks.
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0,    now);
      gain.gain.linearRampToValueAtTime(0.10 * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1), now + 0.005);
      gain.gain.linearRampToValueAtTime(0,    now + 0.035);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.04);
    } else if (who === 'otzi' || who === 'gilgamesh') {
      // Ötzi's bleep — also used for Gilgamesh so his OVERWORLD voice matches his
      // BATTLE voice (in the Gilgamesh battle he speaks through the shared 'otzi'
      // bubble + BLEEP_PROFILES.otzi: triangle, 210±20 Hz). Keep these in sync.
      var freq = 210 + (Math.random() - 0.5) * 20;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0,     now);
      gain.gain.linearRampToValueAtTime(0.07 * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1),  now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.08);
    } else {
      var char    = CHARACTERS[who];
      var baseHz  = char ? char.bleepHz : 440;
      var freq    = baseHz + (Math.random() - 0.5) * 30;
      osc.type    = 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0,     now);
      gain.gain.linearRampToValueAtTime(0.08 * (window.SOG && window.SOG.sfx ? window.SOG.sfx.factor() : 1),  now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.06);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     TYPEWRITER STATE
  ══════════════════════════════════════════════════════════════ */

  var TYPE_SPEED_MS = 28;

  var _tyFullText   = '';
  var _tyShownLen   = 0;
  var _tyTimer      = null;
  var _tyTyping     = false;
  var _tyBleepCount = 0;
  var _tySpeaker    = null;
  var _advanceCb    = null;   // called when user advances past a completed line
  var _advHandler   = null;   // stable click+keydown listener (attached for whole session)

  /* ══════════════════════════════════════════════════════════════
     INITIALISATION
  ══════════════════════════════════════════════════════════════ */

  function init() {
    _hudEl        = document.getElementById('adv-hud');
    _deckEl       = document.getElementById('adv-hud-deck');
    _deckNameEl   = document.getElementById('adv-hud-deck-name');
    _playerPortEl = document.getElementById('adv-hud-portrait');
    _dlgEl           = document.getElementById('adv-hud-dialogue');
    _dlgTextEl       = document.getElementById('adv-hud-dialogue-text');
    _dlgNpcTextEl    = document.getElementById('adv-hud-dialogue-text-npc');
    _dlgPlayerZoneEl = document.getElementById('adv-hud-dlg-player');
    _dlgNpcZoneEl    = document.getElementById('adv-hud-dlg-npc');
    _npcSlotEl       = document.getElementById('adv-hud-npc-slot');
    _npcImgEl     = document.getElementById('adv-hud-npc-img');

    if (!_hudEl) {
      log('WARNING: #adv-hud not found — HUD not initialised');
      return;
    }

    _wirePortrait();
    _wireUtilButtons();
    _setupShowScreenHook();

    refreshDecks();
    _initialised = true;
    log('Initialised');
  }

  /* ══════════════════════════════════════════════════════════════
     DECK SLOTS
  ══════════════════════════════════════════════════════════════ */

  /* Refreshes the HUD's dynamic resting content: the active deck's saved name
     (shown under the card-back deck button) and the gold balance. The stamina
     bar + textbook are static markup. Name kept for the existing callers (init,
     the showScreen hook) + the public API. */
  function refreshDecks() {
    if (_deckNameEl) {
      var deck = (window.Decks && typeof window.Decks.getActive === 'function')
        ? window.Decks.getActive() : null;
      _deckNameEl.textContent = (deck && deck.name) ? deck.name : 'Deck';
    }
    _refreshDeckLock();
    refreshGold();
  }

  // The deck builder stays LOCKED (greyed, non-clickable) early in adventure mode
  // so the player isn't distracted by it. It unlocks after the first Gilgamesh
  // win + marketplace visit (see overworld _maybePlayDeckBuilderUnlock).
  function _deckbuilderUnlocked() {
    try { return localStorage.getItem('sog_deckbuilder_unlocked') === 'true'; } catch (e) { return false; }
  }
  function _refreshDeckLock() {
    if (_deckEl) _deckEl.classList.toggle('adv-hud-deck-locked', !_deckbuilderUnlocked());
  }

  // Refresh just the gold number (e.g. after a win reward grants gold). The
  // number sits overlaid on the coin; this only updates the text.
  function refreshGold() {
    var el = document.getElementById('adv-hud-gold-num');
    if (el && window.SOG && SOG.gold) {
      var val = SOG.gold.get();
      el.textContent = val;
      // Triple-digit (100+) totals get a 2px-smaller font so they fit the coin.
      el.classList.toggle('gold-triple', String(val).length >= 3);
    }
  }

  // Set the central region/location label (called by overworld.js loadMap with
  // the current map's display name). Purely a display update — no behaviour.
  function setRegion(name) {
    var el = document.getElementById('adv-hud-region');
    if (el) el.textContent = name || '';
  }

  // Set the player's display name (default "Explorer"). Wired for a future name
  // system; purely a display update.
  function setName(name) {
    var el = document.getElementById('adv-hud-player-name');
    if (el) el.textContent = name || 'Explorer';
  }

  /* ══════════════════════════════════════════════════════════════
     PORTRAIT + UTIL WIRING
  ══════════════════════════════════════════════════════════════ */

  function _wirePortrait() {
    if (!_playerPortEl) return;
    _playerPortEl.addEventListener('click', function () {
      log('Avatar clicked — future feature (avatar customisation)');
    });
  }

  function _wireUtilButtons() {
    // Card-back deck element — merges the old deck slot + Deck Builder button.
    // Clicking it opens the solo deck builder (same path battlelobby uses).
    if (_deckEl) {
      _deckEl.addEventListener('click', function () {
        if (_inDialogue) return;            // suppress clicks during dialogue
        if (!_deckbuilderUnlocked()) return; // locked early in adventure mode
        _openDeckBuilder();
      });
    }
    // Options icon — opens the shared Options panel (overworld trigger).
    var optBtn = document.getElementById('adv-hud-btn-options');
    if (optBtn) optBtn.addEventListener('click', function () {
      if (window.SOG && SOG.OptionsPanel) SOG.OptionsPanel.open();
    });
  }

  function _openDeckBuilder() {
    window.versusStudentMode = false;   // solo deck building (not the versus flow)
    window.multiplayerMode   = false;
    // Adventure context: the deck builder is being managed from the overworld
    // HUD (not a battle/Arcadium entry). This drives the "Back to Map" /
    // "Save Decks" buttons. Cleared when the player clicks Back to Map.
    window.deckBuilderFromOverworld = true;
    if (typeof window.showScreen === 'function') window.showScreen('screen-deckbuilder');
    if (typeof window.initDeckBuilder === 'function') window.initDeckBuilder();
  }

  /* ══════════════════════════════════════════════════════════════
     VISIBILITY HOOK
  ══════════════════════════════════════════════════════════════ */

  function _setupShowScreenHook() {
    var orig = window.showScreen;
    if (typeof orig !== 'function') return;
    window.showScreen = function (id) {
      orig(id);
      // HUD visibility is owned by CSS (#adv-hud is display:none by default,
      // shown only via body[data-screen="overworld"]). show()/hide() set an
      // INLINE display that would otherwise persist across screen changes and
      // leak the overworld HUD onto the battle screen. Clear it on every
      // transition so the data-screen rule stays authoritative.
      if (_hudEl) _hudEl.style.display = '';
      if (id === 'screen-overworld') {
        refreshDecks();
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════
     DIALOGUE MODE — ENTER / EXIT
  ══════════════════════════════════════════════════════════════ */

  /**
   * enterDialogueMode(config, onReady)
   * Transitions the HUD to State B. config is optional.
   * onReady fires after CSS transitions have started (~50ms).
   */
  function enterDialogueMode(config, onReady) {
    if (_inDialogue) { if (onReady) setTimeout(onReady, 0); return; }
    _inDialogue = true;

    // Clear both speaker zones
    if (_dlgTextEl)       _dlgTextEl.textContent    = '';
    if (_dlgNpcTextEl)    _dlgNpcTextEl.textContent = '';
    if (_dlgPlayerZoneEl) _dlgPlayerZoneEl.classList.remove('active');
    if (_dlgNpcZoneEl)    _dlgNpcZoneEl.classList.remove('active');
    _dlgActiveTextEl = null;

    if (_hudEl) {
      _hudEl.classList.add('dialogue-mode');
      _hudEl.classList.remove('is-ready');
    }

    _attachAdvanceListener();

    // Brief delay so CSS transitions have started before caller runs lines
    setTimeout(function () { if (onReady) onReady(); }, 50);
  }

  /**
   * exitDialogueMode(onDone)
   * Slides down NPC, removes dialogue-mode class, restores resting state.
   * onDone fires after exit animation completes.
   */
  function exitDialogueMode(onDone) {
    if (!_inDialogue) { if (onDone) setTimeout(onDone, 0); return; }

    _removeAdvanceListener();

    // Stop any in-progress typewriter
    if (_tyTimer) { clearInterval(_tyTimer); _tyTimer = null; }
    _tyTyping  = false;
    _advanceCb = null;

    function _finishExit() {
      if (_playerPortEl) _playerPortEl.classList.remove('is-speaker');
      if (_npcSlotEl)    _npcSlotEl.classList.remove('is-speaker');
      if (_hudEl) {
        _hudEl.classList.remove('dialogue-mode');
        _hudEl.classList.remove('is-ready');
      }
      // Clear both text zones and deactivate them
      if (_dlgTextEl)       _dlgTextEl.textContent    = '';
      if (_dlgNpcTextEl)    _dlgNpcTextEl.textContent = '';
      if (_dlgPlayerZoneEl) _dlgPlayerZoneEl.classList.remove('active');
      if (_dlgNpcZoneEl)    _dlgNpcZoneEl.classList.remove('active');
      _dlgActiveTextEl = null;
      _inDialogue = false;
      _currentNpc = null;
      // Let CSS fade-in transitions complete before calling onDone
      setTimeout(function () { if (onDone) onDone(); }, 300);
    }

    if (_npcVisible) {
      slideOutNpc(_finishExit);
    } else {
      _finishExit();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     DIALOGUE MODE — RUN LINES
  ══════════════════════════════════════════════════════════════ */

  /**
   * runDialogue(lines, onDone)
   * Full sequence: enter dialogue mode → run all lines → exit.
   * Main entry point for overworld.js dialogue scripts.
   */
  function runDialogue(lines, onDone) {
    enterDialogueMode(null, function () {
      runLines(lines, function () {
        exitDialogueMode(onDone);
      });
    });
  }

  /**
   * runLines(lines, onDone)
   * Runs an array of line objects assuming dialogue mode is already active.
   * Does NOT enter or exit dialogue mode — caller owns that lifecycle.
   */
  function runLines(lines, onDone) {
    if (!lines || !lines.length) { if (onDone) setTimeout(onDone, 0); return; }
    var idx = 0;

    function _next() {
      if (idx >= lines.length) { if (onDone) onDone(); return; }
      _runSingleLine(lines[idx++], _next);
    }
    _next();
  }

  /**
   * showDialogueLine(line)
   * Single-line shorthand. line = { who, text }.
   * Assumes dialogue mode is active.
   */
  function showDialogueLine(line) {
    runLines([line], null);
  }

  /* ── Internal per-line handler ────────────────────────────── */

  function _runSingleLine(line, onDone) {
    var who  = line.who;
    var char = CHARACTERS[who];
    var isNpc = char && char.side === 'npc';

    _setActiveSpeaker(who);

    if (isNpc) {
      if (!_npcVisible) {
        _showNpcPortrait(who, function () {
          _typeText(who, line.text, onDone);
        });
      } else if (_currentNpc !== who) {
        // Different NPC already in slot — instant swap (no animation)
        _swapNpcImgInstant(who);
        _typeText(who, line.text, onDone);
      } else {
        _typeText(who, line.text, onDone);
      }
    } else {
      // Player character — type immediately
      _typeText(who, line.text, onDone);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     NPC PORTRAIT SLOT
  ══════════════════════════════════════════════════════════════ */

  function _applyNpcPortrait(who) {
    if (!_npcImgEl) return;
    var char = CHARACTERS[who];
    if (!char) return;
    _npcImgEl.src = char.portrait;
    // Per-character frame color (e.g. Otzi's icy frame). Square head-and-
    // shoulders portraits use the same framing as the Explorer; the frame
    // marker only swaps the border color.
    _npcImgEl.classList.remove('adv-hud-npc-otzi');
    if (char.frame === 'otzi') {
      _npcImgEl.classList.add('adv-hud-npc-otzi');
    }
    _currentNpc = who;
  }

  /** Slide NPC portrait up from below the HUD bar. */
  function _showNpcPortrait(who, onDone) {
    if (!_npcSlotEl) { if (onDone) onDone(); return; }
    _applyNpcPortrait(who);
    _npcVisible = true;

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(_npcSlotEl,
        { opacity: 0, y: 130 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out',
          onComplete: function () { if (onDone) onDone(); }
        }
      );
    } else {
      _npcSlotEl.style.opacity   = '1';
      _npcSlotEl.style.transform = 'translateY(0)';
      if (onDone) setTimeout(onDone, 0);
    }
  }

  /** Slide NPC portrait back down (mid-dialogue exit, e.g. Farmer leaves). */
  function slideOutNpc(onDone) {
    if (!_npcSlotEl || !_npcVisible) { if (onDone) setTimeout(onDone, 0); return; }
    _npcVisible = false;

    if (typeof gsap !== 'undefined') {
      gsap.to(_npcSlotEl, {
        opacity: 0, y: 130, duration: 0.4, ease: 'power2.in',
        onComplete: function () {
          _currentNpc = null;
          if (onDone) onDone();
        }
      });
    } else {
      _npcSlotEl.style.opacity   = '0';
      _npcSlotEl.style.transform = 'translateY(130px)';
      _currentNpc = null;
      if (onDone) setTimeout(onDone, 0);
    }
  }

  /** Instant portrait swap (no animation — used internally when NPC changes mid-runLines). */
  function _swapNpcImgInstant(who) {
    _applyNpcPortrait(who);
  }

  /**
   * swapNpcPortrait(config, onDone)
   * Crossfades the NPC portrait image in-slot (~800ms total).
   * config = { character: 'farmer', transitionMs: 800 }
   * The slot container stays visible; only the img fades.
   */
  function swapNpcPortrait(config, onDone) {
    if (!_npcImgEl) { if (onDone) setTimeout(onDone, 0); return; }
    var who    = config.character;
    var totalS = ((config.transitionMs || 800) / 1000);
    var halfS  = totalS / 2;
    var char   = CHARACTERS[who];
    if (!char) { if (onDone) setTimeout(onDone, 0); return; }

    if (typeof gsap === 'undefined') {
      _applyNpcPortrait(who);
      if (onDone) setTimeout(onDone, 0);
      return;
    }

    // Opt-in "transformation" variant (config.grow): the portrait RISES + GROWS
    // to ~2x, plays config.sfx, DISSOLVES old→new at the enlarged size, then
    // SETTLES back to its exact original spot/size as the new character. Used by
    // the D2a Hunter→Farmer arrival beat. Presentation only — it ends with the
    // portrait identical to a normal swap, so following dialogue is unaffected.
    // Tuning knobs (all overridable via config): growScale (2), risePx (-60),
    // growMs (500), settleMs (500); the dissolve uses transitionMs as today.
    // The NPC portrait sits near the right edge, so the growth is anchored at the
    // portrait's RIGHT edge (growOriginX '100%') — it expands up and TOWARD the
    // screen centre instead of symmetrically, so the enlarged portrait can't be
    // clipped by the right edge. Override growOriginX for a different anchor.
    if (config.grow && _npcSlotEl) {
      var GROW_S   = (config.growMs   || 500) / 1000;
      var SETTLE_S = (config.settleMs || 500) / 1000;
      var SCALE    = config.growScale || 2;
      var RISE_PX  = (config.risePx != null) ? config.risePx : -60;
      var ORIGIN_X = (config.growOriginX != null) ? config.growOriginX : '100%';
      if (config.sfx) { SOG.sfx.play(config.sfx); }
      // Un-clip + lift the slot so the enlarged portrait shows above the HUD bar.
      var prevOverflow = _npcSlotEl.style.overflow;
      var prevZ        = _npcSlotEl.style.zIndex;
      _npcSlotEl.style.overflow = 'visible';
      _npcSlotEl.style.zIndex   = '10060';
      gsap.set(_npcImgEl, { transformOrigin: ORIGIN_X + ' 100%' });
      gsap.timeline({
        onComplete: function () {
          _npcSlotEl.style.overflow = prevOverflow;
          _npcSlotEl.style.zIndex   = prevZ;
          gsap.set(_npcImgEl, { clearProps: 'transform,transformOrigin' });
          if (onDone) onDone();
        }
      })
        .to(_npcImgEl, { scale: SCALE, y: RISE_PX, duration: GROW_S, ease: 'power2.out' })  // rise + grow
        .to(_npcImgEl, { opacity: 0, duration: halfS, ease: 'power2.inOut' })               // dissolve out (enlarged)
        .call(function () { _applyNpcPortrait(who); })                                       // swap Hunter→Farmer
        .to(_npcImgEl, { opacity: 1, duration: halfS, ease: 'power2.inOut' })               // dissolve in
        .to(_npcImgEl, { scale: 1, y: 0, duration: SETTLE_S, ease: 'power2.inOut' });        // settle back
      return;
    }

    // Default crossfade: fade out → swap → fade in (unchanged).
    gsap.to(_npcImgEl, {
      opacity: 0, duration: halfS, ease: 'power2.inOut',
      onComplete: function () {
        _applyNpcPortrait(who);
        gsap.to(_npcImgEl, {
          opacity: 1, duration: halfS, ease: 'power2.inOut',
          onComplete: function () { if (onDone) onDone(); }
        });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SPEAKER HIGHLIGHT
  ══════════════════════════════════════════════════════════════ */

  function _setActiveSpeaker(who) {
    var char     = CHARACTERS[who];
    var isPlayer = !char || char.side === 'player';

    // Portrait highlight rings
    if (_playerPortEl) _playerPortEl.classList.toggle('is-speaker', isPlayer);
    if (_npcSlotEl)    _npcSlotEl.classList.toggle('is-speaker', !isPlayer);

    // Zone activation: show this speaker's zone, hide the other, clear the other's text
    if (isPlayer) {
      if (_dlgNpcZoneEl)    { _dlgNpcZoneEl.classList.remove('active'); }
      if (_dlgNpcTextEl)    { _dlgNpcTextEl.textContent = ''; }
      if (_dlgPlayerZoneEl) { _dlgPlayerZoneEl.classList.add('active'); }
      _dlgActiveTextEl = _dlgTextEl;
    } else {
      if (_dlgPlayerZoneEl) { _dlgPlayerZoneEl.classList.remove('active'); }
      if (_dlgTextEl)       { _dlgTextEl.textContent = ''; }
      if (_dlgNpcZoneEl)    { _dlgNpcZoneEl.classList.add('active'); }
      _dlgActiveTextEl = _dlgNpcTextEl;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     TYPEWRITER
  ══════════════════════════════════════════════════════════════ */

  function _typeText(who, text, onLineDone) {
    // Use whichever zone element _setActiveSpeaker pointed us at; fall back to player text
    var textEl = _dlgActiveTextEl || _dlgTextEl;
    if (!textEl) { if (onLineDone) onLineDone(); return; }

    // Clear this zone's text and hide advance arrow
    textEl.textContent = '';
    if (_hudEl) _hudEl.classList.remove('is-ready');

    _tyFullText   = text;
    _tyShownLen   = 0;
    _tyTyping     = true;
    _tyBleepCount = 0;
    _tySpeaker    = who;

    // Capture textEl so the interval closure uses the right element even if
    // _dlgActiveTextEl changes before the interval fires.
    var _capturedEl = textEl;

    // Register this line's completion callback (called by _onAdvance after typing done)
    _advanceCb = function () {
      _advanceCb = null;
      if (onLineDone) onLineDone();
    };

    if (_tyTimer) { clearInterval(_tyTimer); _tyTimer = null; }

    _tyTimer = setInterval(function () {
      _tyShownLen++;
      _capturedEl.textContent = _tyFullText.slice(0, _tyShownLen);
      var c = _tyFullText.charAt(_tyShownLen - 1);
      if (c && c !== ' ' && c !== '\n') {
        _tyBleepCount++;
        // Lucy bleeps every 3rd char to match the original tutorial battle;
        // all other speakers use the default cadence.
        var bleepEvery = (_tySpeaker === 'lucy') ? 3 : BLEEP_EVERY_N;
        if (_tyBleepCount >= bleepEvery) {
          _tyBleepCount = 0;
          _playBleep(_tySpeaker);
        }
      }
      if (_tyShownLen >= _tyFullText.length) {
        clearInterval(_tyTimer); _tyTimer = null;
        _tyTyping = false;
        if (_hudEl) _hudEl.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  /* ══════════════════════════════════════════════════════════════
     ADVANCE HANDLER  (click on HUD bar OR spacebar / Enter)
  ══════════════════════════════════════════════════════════════ */

  function _onAdvance(e) {
    if (e.type === 'keydown') {
      if (e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Enter') return;
      e.preventDefault();
    }

    if (_tyTyping) {
      // Skip typewriter — flash full text immediately into whichever zone is active
      if (_tyTimer) { clearInterval(_tyTimer); _tyTimer = null; }
      _tyShownLen = _tyFullText.length;
      _tyTyping   = false;
      var skipEl = _dlgActiveTextEl || _dlgTextEl;
      if (skipEl) skipEl.textContent = _tyFullText;
      if (_hudEl) _hudEl.classList.add('is-ready');
      return;
    }

    // Typing already done — advance to next line
    if (_hudEl) _hudEl.classList.remove('is-ready');
    if (_advanceCb) {
      var cb = _advanceCb;
      _advanceCb = null;
      cb();
    }
  }

  function _attachAdvanceListener() {
    if (_advHandler) return;
    _advHandler = function (e) { _onAdvance(e); };
    // Defer by one tick so the click that triggered enterDialogueMode
    // doesn't also immediately advance the first line.
    setTimeout(function () {
      if (_hudEl) _hudEl.addEventListener('click', _advHandler);
      document.addEventListener('keydown', _advHandler);
    }, 0);
  }

  function _removeAdvanceListener() {
    if (!_advHandler) return;
    if (_hudEl) _hudEl.removeEventListener('click', _advHandler);
    document.removeEventListener('keydown', _advHandler);
    _advHandler = null;
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API — SHOW / HIDE
  ══════════════════════════════════════════════════════════════ */

  function show() {
    if (!_hudEl) return;
    _hudEl.style.display = 'flex';
    refreshDecks();
    log('show()');
  }

  function hide() {
    if (!_hudEl) return;
    _hudEl.style.display = 'none';
    log('hide()');
  }

  /* ══════════════════════════════════════════════════════════════
     BATTLE-SCREEN AVATAR SLOTS  (.battle-avatar-opponent / -ally)
     ──────────────────────────────────────────────────────────────
     The two portrait frames on the battle SCREEN (not the HUD bar).
     Each adventure battle declares its own avatars via a presentation
     block; the engine sets BOTH slots explicitly on start and restores
     BOTH to the HTML baseline on teardown — so no battle free-rides on
     the default or another battle's cleanup.

     HTML baseline (index.html): opponent=images/Otzi.jpg, ally=images/portraits/Lucy.png.

     presentation = {
       opponentAvatar: <img src>,    // required to set the opponent frame
       allyAvatar:     <img src>,    // required to set the ally frame
       popAlly:        <bool>        // add .adv-active so the ally avatar
                                     // animates in at apply time (Explorer
                                     // battles). Omit when the battle pops
                                     // its ally in later (Prehistory/Lucy).
     }
  ══════════════════════════════════════════════════════════════ */
  var BATTLE_AVATAR_BASELINE = {
    opponent: 'images/Otzi.jpg',
    ally:     'images/portraits/Lucy.png'
  };

  function _battleAvatarFrameImg(role) {
    return document.querySelector('.battle-avatar-' + role + ' .battle-avatar-frame img');
  }
  function _setBattleAvatar(role, src) {
    var img = _battleAvatarFrameImg(role);
    if (!img || !src) return;
    img.src = src;
    img.style.display        = '';   // un-hide if a prior onerror hid it
    img.style.objectPosition = '';   // use the CSS-default framing
  }

  /** Set both battle-screen avatar slots from a presentation block. */
  function applyBattleAvatars(presentation) {
    presentation = presentation || {};
    if (presentation.opponentAvatar) _setBattleAvatar('opponent', presentation.opponentAvatar);
    if (presentation.allyAvatar)     _setBattleAvatar('ally',     presentation.allyAvatar);
    if (presentation.popAlly) {
      var allyEl = document.querySelector('.battle-avatar-ally');
      if (allyEl) allyEl.classList.add('adv-active');
    }
  }

  /** Restore both battle-screen avatar slots to the HTML baseline. */
  function restoreBattleAvatars() {
    _setBattleAvatar('opponent', BATTLE_AVATAR_BASELINE.opponent);
    _setBattleAvatar('ally',     BATTLE_AVATAR_BASELINE.ally);
    var allyEl = document.querySelector('.battle-avatar-ally');
    if (allyEl) allyEl.classList.remove('adv-active');
  }

  /* ── Boot ────────────────────────────────────────────────────── */
  init();

  /* ── Public surface ──────────────────────────────────────────── */
  function isDialogueActive() { return _inDialogue; }

  return {
    show:               show,
    hide:               hide,
    refreshDecks:       refreshDecks,
    refreshGold:        refreshGold,
    setRegion:          setRegion,
    setName:            setName,
    runDialogue:        runDialogue,
    runLines:           runLines,
    showDialogueLine:   showDialogueLine,
    enterDialogueMode:  enterDialogueMode,
    exitDialogueMode:   exitDialogueMode,
    swapNpcPortrait:    swapNpcPortrait,
    slideOutNpc:        slideOutNpc,
    isDialogueActive:   isDialogueActive,
    applyBattleAvatars:   applyBattleAvatars,
    restoreBattleAvatars: restoreBattleAvatars
  };

})();

window.SOG = SOG;

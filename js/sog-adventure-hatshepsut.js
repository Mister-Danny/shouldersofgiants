/**
 * sog-adventure-hatshepsut.js — SOG.HatshepsutBattle (Egypt Battle 2).
 *
 * Hatshepsut's fight on a STANDARD board — unlike Narmer's, there is NO advance
 * gate: all three locations are open from turn 1 and the win condition is the
 * ordinary "most IP at 2 of 3 locations" the Mesopotamia bosses use. What makes
 * this fight its own thing is MOVEMENT, expressed entirely through the three
 * locations' abilities rather than through a bespoke rule:
 *
 *   Thebes   MOVE_HERE_CAPITAL   a card moving here earns +1 Capital next turn
 *   Red Sea  ANY_FREE_MOVE_AWAY  one card may leave here each turn
 *   Punt     MOVE_HERE_IP        a card moving here gains +1 IP
 *
 * Red Sea is the engine and the other two are the payoffs: park cards on the Red
 * Sea, then ferry one per turn into Punt for IP or Thebes for Capital.
 * Hatshepsut herself feeds the loop — her At Once drops a Merchant onto another
 * location, and the Merchant relocates every time an Economic card lands beside
 * it, so Merchants keep arriving at Punt/Thebes and collecting those bonuses.
 *
 * All three location keys are handled by SHARED engine code, not by this module:
 * MOVE_HERE_* is fired from game.js's applyMove (so EVERY mover triggers it) and
 * ANY_FREE_MOVE_AWAY is read by input.js's refreshMoveableCards. This module only
 * declares the locations; the rules live where every other battle can reuse them.
 *
 * SCOPE — MECHANIC + DECK + LOCATIONS + REWARD ECONOMY + BOSS DIALOGUE + OWN
 * RESULT SCOREBOARD (Stage A — done). The Narmer→Hatshepsut scripted
 * transition and the loss-path Merchant intervention (Stage B) are a later
 * pass. onWin/onLoss/onTie play their tier-appropriate dialogue, grant the
 * reward if any, then show this module's OWN result popup (CONTINUE/BACK TO
 * MAP + GAMEBOARD — the overworld-boss button set, not the engine's generic
 * Play Again/Home) and never call proceed() — mirrors Narmer exactly (see
 * _showResultScoreboard/_exitToOverworld/_restartBattle).
 * The overworld ENCOUNTER (played once, on the first node click, before the
 * first Serf battle) is wired in overworld.js — see HATSHEPSUT_ENCOUNTER_DIALOGUE
 * / _runHatshepsutEncounter, mirroring Narmer's NARMER_ENCOUNTER_DIALOGUE /
 * _runNarmerEncounter exactly.
 *
 * Entry: SOG.HatshepsutBattle.start() (dev panel / console), or the overworld
 * 'hatshepsut' node on the Upper Egypt map (now wired — see overworld.js).
 */
window.SOG = window.SOG || {};
SOG.HatshepsutBattle = (function () {
  'use strict';

  function log(msg) { if (window.SOG_DEBUG) console.log('[HatshepsutBattle] ' + msg); }

  /* ── Location ids (this battle only; one battle runs at a time, so the 12x
        block is free — Narmer uses 111-113, Hammurabi/HG use 101-103). ── */
  var LOC_THEBES  = 121;
  var LOC_RED_SEA = 122;
  var LOC_PUNT    = 123;

  /* ── Hatshepsut's 15. Every id below already existed EXCEPT 74/75, the two
        Natural Resources built for this fight:
          52 Hatshepsut · 74 Papyrus(Econ) · 75 Purple Dye · 76 Merchant ·
          56 Scribe(Egypt/Econ) · 59 Obelisk · 62 Hieroglyphics · 57 Pyramid ·
          64 Sphinx · 54 Papyrus(Scientific) · 65 Imhotep · 60 Khufu ·
          55 Farmer(Egypt) · 49 The Phoenicians(Meso) · 41 Canals(Meso)
        The deck is deliberately Economic-heavy: five Economic cards (74, 75,
        76, 56 and Hatshepsut's spawned Merchants) keep the Merchant trigger
        firing. Purple Dye is MESOPOTAMIAN on purpose — an Egypt Merchant's
        different-civilization bonus fires on it, but not on the Egyptian
        Papyrus, so the two resources play differently. ── */
  var AI_IDS = [52, 74, 75, 76, 56, 59, 62, 57, 64, 54, 65, 60, 55, 49, 41];

  /* ── Two-tier reward economy — mirrors Narmer's richer-than-default scale
        (his file's own comment: GOLD_SERF_WIN 20 / GOLD_GIANT_WIN 30 + card,
        deliberately above every other boss's flat 15/15). SOG.rewards.consume
        only decides WHETHER a reward fires (firstTierWin/grantCard) — the
        AMOUNTS below are this boss's own, read by _grantGold's caller, not
        SOG.rewards' generic GOLD_PER_TIER. ── */
  var HATSHEPSUT_CARD_ID      = 52;
  var HATSHEPSUT_GOLD_SERF_WIN  = 20;
  var HATSHEPSUT_GOLD_GIANT_WIN = 30;

  /* ── Custom result scoreboard identifiers — the module owns the end screen
        (mirrors Narmer/Hammurabi/Sargon), so it never calls the engine's
        proceed()/generic scoreboard. ── */
  var RESULT_ID       = 'adv-hatshepsut-result';
  var SHOW_RESULTS_ID = 'adv-hatshepsut-show-results';
  var OPP_NAME        = 'Hatshepsut';
  var OPP_BADGE       = 'HATSHEPSUT';

  /* ── The three locations. abilityKey is what activates the SHARED engine
        behaviour; abilityText is what the player reads on the board. ── */
  function _hatshepsutLocations() {
    return [
      {
        id: LOC_THEBES, name: 'Thebes', region: 'City of a Hundred Gates',
        abilityText: 'When a card moves here this turn, gain +1 Capital next turn.',
        abilityKey: 'MOVE_HERE_CAPITAL',
        image: 'images/locations/thebes.jpg', thumbnailCrop: null
      },
      {
        id: LOC_RED_SEA, name: 'The Red Sea', region: 'Trade Route to Punt',
        abilityText: 'You can move one card from here each turn.',
        abilityKey: 'ANY_FREE_MOVE_AWAY',
        image: 'images/locations/redsea.jpg', thumbnailCrop: null
      },
      {
        id: LOC_PUNT, name: 'Punt', region: 'Land of Incense',
        abilityText: 'When a card moves here, it gains +1 IP.',
        abilityKey: 'MOVE_HERE_IP',
        image: 'images/locations/punt.jpg', thumbnailCrop: null
      }
    ];
  }

  /* ══════════════════════════════════════════════════════════════
     DIALOGUE — ten named arrays, matching Hammurabi/Hanging Gardens'
     shape and naming convention (OPENING_DIALOGUE/LOSS_DIALOGUE/
     TIE_DIALOGUE unprefixed, everything else HATSHEPSUT_-prefixed) —
     not Sargon's, whose LOSS_SMACK is shared between loss and tie; this
     battle gets the full ten distinct slots. Wired to the SCRIPT's
     onBattleStart/onWin/onLoss/onTie below via _runLinesIfAny (see
     js/game/dialogue-runner.js's runLines). who: 'hatshepsut' = her
     portrait, 'explorer' = the player — mirrors Narmer's convention.
     The overworld ENCOUNTER (node click, before the first battle) lives
     in overworld.js's HATSHEPSUT_ENCOUNTER_DIALOGUE, not here — same
     split as Narmer's NARMER_ENCOUNTER_DIALOGUE / OPENING_DIALOGUE.
  ══════════════════════════════════════════════════════════════ */

  // Serf battle intro — teaches the Thebes → Red Sea → Punt movement loop.
  var OPENING_DIALOGUE = [
    { who: 'hatshepsut', text: 'Behold my grand expedition.' },
    { who: 'hatshepsut', text: 'From Thebes, my capital…' },
    { who: 'hatshepsut', text: 'Through The Red Sea…' },
    { who: 'hatshepsut', text: 'To Punt, a foreign land of wonders.' },
    { who: 'explorer',   text: 'You sail all the way out there?' },
    { who: 'hatshepsut', text: 'I send merchants.' },
    { who: 'hatshepsut', text: 'This is how the wise grow rich.' },
    { who: 'explorer',   text: 'I look to follow in your footsteps.' },
    { who: 'hatshepsut', text: 'How charming.' },
    { who: 'hatshepsut', text: 'Let us see.' }
  ];

  // SERF WIN — grants 20 gold at the "Take it." beat, NO card. Split around the gold.
  var HATSHEPSUT_SERF_WIN_A = [
    { who: 'hatshepsut', text: 'It seems you managed to turn a profit after all.' },
    { who: 'explorer',   text: 'Does that mean I won?' },
    { who: 'hatshepsut', text: 'You did.' },
    { who: 'hatshepsut', text: 'I have misjudged your worth.' },
    { who: 'hatshepsut', text: 'Take it.' }
    // → [GOLD — 20]
  ];
  var HATSHEPSUT_SERF_WIN_B = [
    { who: 'hatshepsut', text: "You'll need to come back stronger." },
    { who: 'hatshepsut', text: "I'll be ready." }
  ];

  // SERF-tier loss / tie.
  var LOSS_DIALOGUE = [
    { who: 'hatshepsut', text: 'As expected. Empty hands.' },
    { who: 'explorer',   text: 'I ran out of good moves.' },
    { who: 'hatshepsut', text: 'You ran out of goods. There is a difference.' },
    { who: 'hatshepsut', text: 'Go. Find something of value to bring me. Then return.' }
  ];
  var TIE_DIALOGUE = [
    { who: 'hatshepsut', text: 'An even trade.' },
    { who: 'hatshepsut', text: 'Fair, yet not enough.' },
    { who: 'hatshepsut', text: 'Come again, and bring a better offer.' }
  ];

  // GIANT REMATCH INTRO — in-battle, before the Giant rematch (onBattleStart).
  var HATSHEPSUT_GIANT_INTRO = [
    { who: 'hatshepsut', text: 'You return. Laden this time.' },
    { who: 'explorer',   text: "Yes? I'm not sure what laden means." },
    { who: 'hatshepsut', text: 'Clearly.' },
    { who: 'hatshepsut', text: 'Let us see whose caravan reaches Punt first.' }
  ];

  // GIANT WIN — grants the Hatshepsut card THEN 30 gold, after block A.
  var HATSHEPSUT_GIANT_WIN_A = [
    { who: 'hatshepsut', text: 'You have outtraded me again.' },
    { who: 'explorer',   text: 'You taught me well.' },
    { who: 'hatshepsut', text: 'There is no shame I would rather bear.' },
    { who: 'hatshepsut', text: 'Weak rulers build monuments to themselves.' },
    { who: 'hatshepsut', text: 'The wise build the wealth of their nation.' }
    // → [CARD — Hatshepsut] THEN [GOLD — 30]
  ];
  var HATSHEPSUT_GIANT_WIN_B = [
    { who: 'hatshepsut', text: 'You have earned your place on the ledger.' },
    { who: 'explorer',   text: 'Thank you Trading Queen!' },
    { who: 'hatshepsut', text: 'Go well, trader.' }
  ];

  // GIANT LOSS — dismissive, replayable (no grant).
  var HATSHEPSUT_GIANT_LOSS = [
    { who: 'hatshepsut', text: 'The ledger balances in my favor. As it does.' },
    { who: 'explorer',   text: 'I thought I had it this time…' },
    { who: 'hatshepsut', text: 'Close is not a currency I accept.' }
  ];

  // GIANT DRAW — a stalemate is not a win, replayable (no grant).
  var HATSHEPSUT_GIANT_DRAW = [
    { who: 'hatshepsut', text: 'Deadlocked. Two traders, each unwilling to give ground.' },
    { who: 'hatshepsut', text: 'We will settle this.' },
    { who: 'hatshepsut', text: 'Again.' }
  ];

  /* ══════════════════════════════════════════════════════════════
     AI SELECTOR — the untiered fallback.
     Mirrors Narmer's: a plain capital-aware greedy selector kept as the
     bespoke option. In practice the TIER routing in ai.js sends play to the
     shared Serf/Giant brains (cfg.ai.tier below), so this runs only if the
     tier is ever cleared — same dormant-fallback shape every boss has.
     Light biases only: play the Natural Resources EARLY (their At Once buffs
     whatever is already standing, so they want company), hold the premium
     monuments for later, and spread rather than stack.
  ══════════════════════════════════════════════════════════════ */
  var RESOURCE_IDS = { 74: true, 75: true };
  var PREMIUM_IDS  = { 52: true, 60: true, 57: true, 62: true, 64: true };

  function hatshepsutSelectPlays(ctx) {
    var G       = ctx.G;
    var capital = (typeof ctx.capital === 'number') ? ctx.capital : 5;
    var hand    = ctx.hand.slice();
    var CARDS_  = (typeof CARDS !== 'undefined') ? CARDS : [];
    function cardById(id) { for (var i = 0; i < CARDS_.length; i++) if (CARDS_[i].id === id) return CARDS_[i]; return null; }
    function aiCost(card, locId) {
      return (window.SOG && SOG.board && SOG.board.effectiveCost)
        ? SOG.board.effectiveCost(card, locId, 'ai') : card.cc;
    }

    var free = {}, count = {}, ownIP = {};
    G.locations.forEach(function (loc) {
      var s = (G.aiSlots && G.aiSlots[loc.id]) || [];
      free[loc.id]  = s.filter(function (x) { return x === null; }).length;
      count[loc.id] = s.filter(Boolean).length;
      ownIP[loc.id] = 0;
      s.forEach(function (x) { if (x) ownIP[loc.id] += (x.ip || 0) + (x.ipMod || 0) + (x.contMod || 0); });
    });

    // Weakest open location — spreads the AI across all three rather than stacking.
    function weakestOpen() {
      var best = null;
      G.locations.forEach(function (loc) {
        if (free[loc.id] <= 0) return;
        if (best === null || ownIP[loc.id] < ownIP[best]) best = loc.id;
      });
      return best;
    }

    var plays = [];
    for (var guard = 0; guard < 12; guard++) {
      if (capital <= 0 || !hand.length) break;
      var locId = weakestOpen();
      if (locId == null) break;

      var best = null, bestScore = -Infinity;
      for (var i = 0; i < hand.length; i++) {
        var c = cardById(hand[i]);
        if (!c || aiCost(c, locId) > capital) continue;
        var s = c.ip - c.cc * 0.1;
        if (RESOURCE_IDS[c.id]) s += 2 + count[locId];   // resources want company → play early, where cards already stand
        if (PREMIUM_IDS[c.id])  s += 1;
        if (c.id === 76)        s += 1.5;                // a Merchant on the board is a recurring engine
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (!best) break;

      plays.push({ cardId: best.id, locId: locId });
      capital -= aiCost(best, locId);
      free[locId]--; count[locId]++; ownIP[locId] += best.ip;
      hand.splice(hand.indexOf(best.id), 1);
    }
    log('AI plays: ' + JSON.stringify(plays) + ' (capital left ' + capital + ')');
    return plays;
  }

  /* ══════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════ */
  /* Tier from SAVE STATE, same derivation every other boss uses: SERF until the
     Serf flag is beaten, GIANT afterwards. Honest default matters — PLAY AGAIN
     rebuilds this config with __forceTier already consumed. */
  function _tierBeatenLocal(hook, tier) {
    try { return localStorage.getItem('sog_node_' + hook + '_' + tier + '_beaten') === 'true'; }
    catch (e) { return false; }
  }

  /* This particular play-through is the GIANT REMATCH (Serf beaten, Giant
     not yet) → the in-battle dominance intro (HATSHEPSUT_GIANT_INTRO)
     plays instead of the Serf opening. Reuses the exact same check
     buildHatshepsutConfig's own _aiTier derivation below already makes —
     this battle doesn't decouple AI difficulty from which tier's dialogue
     plays (same as Narmer; no separate flagTier concept needed here). */
  function _isGiantRematch() {
    return _tierBeatenLocal('hatshepsut', 'serf') && !_tierBeatenLocal('hatshepsut', 'giant');
  }

  /* Generic localStorage flag helpers — same shape as every other boss's
     private _has/_set (Narmer, Sargon, Otzi, ...), not shared, on purpose:
     one file, one tiny wrapper, no cross-module dependency for two lines. */
  function _has(key) { try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; } }
  function _set(key) { try { localStorage.setItem(key, 'true'); } catch (e) {} }

  // In-battle intro: first-time only, same convention as
  // KEY_HAMMURABI_OPENING_SEEN / KEY_OTZI_OPENING_SEEN. Without this, every
  // Serf encounter (including replays after a loss) would replay the full
  // OPENING_DIALOGUE from the top.
  var KEY_HATSHEPSUT_OPENING_SEEN = 'sog_hatshepsut_opening_seen';

  function buildHatshepsutConfig() {
    var st = (window.SOG && SOG.state) || {};
    var _aiTier = _tierBeatenLocal('hatshepsut', 'serf') ? 'giant' : 'serf';
    return {
      structure: {
        turns:            5,
        locationsCount:   3,
        slotsPerLocation: st.SLOTS_PER_LOC || 4,
        handStart:        st.HAND_START    || 5,
        maxHandSize:      st.MAX_HAND_SIZE || 7
      },
      resource: { model: 'capital', capital: 5, resetEachTurn: true },
      draw:     { model: 'replenish' },
      decks: {
        player: { source: 'active-deck', shuffle: true },
        ai:     { source: 'explicit', ids: AI_IDS.slice(), shuffle: true }
      },
      locationAbilities: { select: { mode: 'explicit', locations: _hatshepsutLocations() } },
      // NO rules.advanceGate — this is a standard open board (contrast Narmer).
      scoring:  { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
      ai:       { profile: 'heuristic', tier: _aiTier, movement: 'adventure',
                  settings: { selectPlays: hatshepsutSelectPlays } },
      presentation: {
        bodyClass:      'hatshepsut-battle',
        allyAvatar:     'player',   // selected adventurer, resolved at render time
        opponentAvatar: 'images/portraits/hatshepsutportrait.jpeg',
        popAlly:        true
      },
      rewards:  {},
      replay:   function () { start(); },
      scriptHook: 'hatshepsut'
    };
  }

  function _playSfx(src) { if (window.SOG && SOG.sfx) { SOG.sfx.play(src); return; } try { new Audio(src).play(); } catch (e) {} }

  /* Grant Hatshepsut's card (52) via the SHARED acquisition reveal — FIRST WIN
     ONLY (SOG.Cards.unlock returns truthy only on a new unlock). Mirrors
     Narmer's _grantNarmerCard exactly. */
  function _grantHatshepsutCard(done) {
    var newly = false;
    if (window.SOG && SOG.Cards && typeof SOG.Cards.unlock === 'function') newly = !!SOG.Cards.unlock([HATSHEPSUT_CARD_ID]);
    if (!newly) { if (done) done(); return; }
    var card = (typeof CARDS !== 'undefined') && CARDS.find(function (c) { return c.id === HATSHEPSUT_CARD_ID; });
    var preh = window.SOG && SOG.Adventure && SOG.Adventure.Prehistory;
    if (card && preh && typeof preh.showCardAcquisition === 'function') {
      preh.showCardAcquisition(card, null, function () { if (done) done(); }, { autoDismissMs: 1500 });
    } else if (done) { done(); }
  }

  /* Gold reward — amount is the CALLER's (HATSHEPSUT_GOLD_SERF_WIN/_GIANT_WIN
     above), not SOG.rewards' own GOLD_PER_TIER. Coin-drop animation mirrors
     Narmer's _runGoldRewardAnimation byte-for-byte except the overlay id. */
  function _grantGold(amount, done) {
    if (window.SOG && SOG.gold && typeof SOG.gold.add === 'function') SOG.gold.add(amount);
    if (window.SOG && SOG.HUD && typeof SOG.HUD.refreshGold === 'function') SOG.HUD.refreshGold();
    _runGoldRewardAnimation(amount, function () { if (done) done(); });
  }
  function _runGoldRewardAnimation(amount, onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'hatshepsut-gold-reward';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;pointer-events:none;';
    var dim = document.createElement('div');
    dim.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.80);transition:opacity 0.4s ease;';
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;' +
      'transform:translateY(-110px);transition:opacity 0.45s ease, transform 0.7s cubic-bezier(0.2,0.9,0.3,1);';
    var coin = document.createElement('img');
    coin.src = 'images/ui_images/coin.png'; coin.alt = ''; coin.draggable = false;
    coin.style.cssText = 'width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6));';
    var label = document.createElement('div');
    label.textContent = amount + ' Gold';
    label.style.cssText = 'font-family:var(--font, sans-serif);font-size:46px;font-weight:bold;color:#f3d574;' +
      '-webkit-text-stroke:2px #1a0a04;' +
      'text-shadow:-2px -2px 0 #1a0a04, 2px -2px 0 #1a0a04, -2px 2px 0 #1a0a04, 2px 2px 0 #1a0a04, 0 4px 6px rgba(0,0,0,0.55);';
    box.appendChild(coin); box.appendChild(label);
    overlay.appendChild(dim); overlay.appendChild(box);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void box.offsetHeight;
    box.style.opacity = '1'; box.style.transform = 'translateY(0)';
    setTimeout(function () { _playSfx('sfx/demedici-money.mp3'); }, 300);
    setTimeout(function () {
      box.style.transition = 'opacity 0.4s ease';
      box.style.opacity = '0'; dim.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 420);
    }, 1900);
  }

  /* Fade the overworld radial-wipe cover out to reveal the board (mirrors
     Narmer's). A dev-menu launch has no cover, so this proceeds immediately. */
  function _fadeOutCover(onDone) {
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (!wipeEl || !wipeEl.classList.contains('active')) { if (onDone) onDone(); return; }
    if (typeof gsap === 'undefined') {
      wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
      if (onDone) onDone();
      return;
    }
    gsap.to(wipeEl, {
      opacity: 0, duration: 0.45, ease: 'power2.out',
      onComplete: function () {
        wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = '';
        if (onDone) onDone();
      }
    });
  }

  /* Called ONLY when the player actually leaves the battle screen (PLAY AGAIN /
     BACK TO MAP / CONTINUE on the result popup below) — NOT right when dialogue
     finishes. Deferring this is what keeps her real portrait on screen behind
     the result popup instead of flashing to the HTML baseline (Ötzi) the
     instant the outcome dialogue ends; restoreBattleAvatars() only needs to
     run once we're actually about to hide/replace the battle screen. */
  function _teardown() {
    document.body.classList.remove('hatshepsut-battle');
    hideBubbles();
    if (window.SOG && SOG.HUD && typeof SOG.HUD.restoreBattleAvatars === 'function') SOG.HUD.restoreBattleAvatars();
    var wipeEl = document.getElementById('adv-radial-wipe');
    if (wipeEl) { wipeEl.classList.remove('active'); wipeEl.style.opacity = ''; wipeEl.style.clipPath = ''; }
  }

  /* Shared bubble/typewriter/bleep engine (js/game/dialogue-runner.js) —
     same module every other boss uses, one instance per battle module.
     Bleep tone picked distinct from the others already in use (sargon 440,
     narmer 190, otzi 210, hammurabi/HG's own defaults) — 300 sits clear of
     all of them. runLines([], cb) finishes synchronously with nothing shown
     (see the dialogue-array comment above), which is what keeps every hook
     below safe to call with today's empty arrays. */
  var BLEEP_PROFILES = {
    hatshepsut: { freq: 300, wobble: 22, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 },
    explorer:   { freq: 520, wobble: 30, peak: 0.08, decay: 0.05, dur: 0.06, every: 2 }
  };
  var _runner = SOG.DialogueRunner.create({
    bleepProfiles:     BLEEP_PROFILES,
    defaultProfileKey: 'hatshepsut',
    typeSpeedMs:       32
  });
  function runLines(lines, onAllDone) { _runner.runLines(lines, onAllDone); }
  function hideBubbles()              { _runner.hideBubbles(); }
  function _runLinesIfAny(lines, onDone) {
    if (lines && lines.length) runLines(lines, onDone); else onDone();
  }

  /* First-time-only battle intro — mirrors Narmer's _runOpeningDialogue.
     KEY_HATSHEPSUT_OPENING_SEEN gates it so a Serf replay (after a loss, or
     after already winning) never re-plays OPENING_DIALOGUE; only the very
     first Serf encounter does. Sets the flag right after the lines finish,
     not before — so a page reload mid-dialogue doesn't skip it next time. */
  function _runOpeningDialogue(onComplete) {
    if (_has(KEY_HATSHEPSUT_OPENING_SEEN)) { if (onComplete) onComplete(); return; }
    _runLinesIfAny(OPENING_DIALOGUE, function () {
      _set(KEY_HATSHEPSUT_OPENING_SEEN);
      if (onComplete) onComplete();
    });
  }

  // Captured once, at battle start, from _isGiantRematch() — NOT re-read
  // inside onWin/onLoss/onTie. game.js's endGame() stamps the tier-beaten
  // flag before those hooks fire, so re-querying _isGiantRematch() there
  // could see a DIFFERENT answer than the one that picked the opening/
  // giantIntro at battle start (a Serf win would flip it mid-battle) —
  // capturing keeps "which intro played" and "which outcome dialogue
  // plays" consistent for one battle instance.
  var _battleWasGiantRematch = false;

  var _dialogueActive = false;

  /* ── Result scoreboard + exit routing — mirrors Narmer's byte-for-byte
        (own the screen, never proceed()). Building this HERE rather than
        depending on the engine's generic scoreboard is what fixes the
        overworld-boss button set (Back to Map / Continue + Gameboard,
        instead of Arcadium's Play Again / Home / Gameboard) — see the
        outcome-routing block below. ── */
  function _removeFloatingResultsBtn() {
    var b = document.getElementById(SHOW_RESULTS_ID);
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function _removeResultPopup() {
    var el = document.getElementById(RESULT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _removeFloatingResultsBtn();
  }
  function _hideResultForReview() {
    var el = document.getElementById(RESULT_ID);
    if (el) el.style.display = 'none';
    if (document.getElementById(SHOW_RESULTS_ID)) return;
    var btn = document.createElement('button');
    btn.id = SHOW_RESULTS_ID; btn.className = 'btn-primary'; btn.textContent = 'SHOW RESULTS';
    btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10060;';
    btn.addEventListener('click', function () {
      var r = document.getElementById(RESULT_ID); if (r) r.style.display = '';
      _removeFloatingResultsBtn();
    });
    document.body.appendChild(btn);
  }
  function _buildLocRow(locName, pIP, aIP) {
    var winner = pIP > aIP ? 'player' : aIP > pIP ? 'ai' : 'tie';
    var row = document.createElement('div'); row.className = 'result-loc-row';
    var nm  = document.createElement('div'); nm.className  = 'result-loc-name'; nm.textContent = locName;
    var sc  = document.createElement('div'); sc.className  = 'result-loc-scores';
    var yu  = document.createElement('span');
    yu.className = 'result-loc-you' + (winner === 'player' ? ' result-loc-winner' : ''); yu.textContent = 'You: ' + pIP;
    var vs  = document.createElement('span'); vs.className = 'result-loc-vs'; vs.textContent = 'vs';
    var op  = document.createElement('span');
    op.className = 'result-loc-opp' + (winner === 'ai' ? ' result-loc-winner' : ''); op.textContent = OPP_NAME + ': ' + aIP;
    sc.appendChild(yu); sc.appendChild(vs); sc.appendChild(op);
    var bd = document.createElement('div');
    bd.className = 'result-loc-badge result-loc-badge-' + winner;
    bd.textContent = winner === 'player' ? 'YOU' : winner === 'ai' ? OPP_BADGE : 'TIE';
    row.appendChild(nm); row.appendChild(sc); row.appendChild(bd);
    return row;
  }
  /* Repeat-win flourish: VICTORY pops in with the chime, holds, fades → scoreboard.
     Only reached on a replay win (already-beaten tier — zero reward, see _onWin). */
  function _victoryFlourish(onDone) {
    if (typeof SFX !== 'undefined' && typeof SFX.gameWon === 'function') SFX.gameWon();
    var overlay = document.createElement('div');
    overlay.id = 'hatshepsut-victory-flourish';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10045;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity 0.3s ease;';
    var txt = document.createElement('div');
    txt.className = 'result-headline result-player'; txt.textContent = 'VICTORY';
    txt.style.cssText = 'opacity:0;transform:scale(0.7);transition:opacity 0.3s ease, transform 0.45s cubic-bezier(0.2,0.9,0.3,1);';
    overlay.appendChild(txt);
    (document.getElementById('sog-stage') || document.body).appendChild(overlay);
    void txt.offsetHeight;
    txt.style.opacity = '1'; txt.style.transform = 'scale(1)';
    setTimeout(function () {
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDone) onDone();
      }, 300);
    }, 2500);
  }
  function _showResultScoreboard(won, isTie, locResults, opts) {
    opts = opts || {};
    _removeResultPopup();
    var overlay = document.createElement('div');
    overlay.id = RESULT_ID; overlay.className = 'adv-result';
    var wrap = document.createElement('div'); wrap.className = 'result-wrap';
    var headline = document.createElement('div');
    headline.className = 'result-headline ' + (won ? 'result-player' : isTie ? 'result-tie' : 'result-ai');
    headline.textContent = won ? 'VICTORY' : isTie ? 'A TIE' : 'DEFEAT';
    var locs = document.createElement('div'); locs.className = 'result-locs';
    (locResults || []).forEach(function (r) { locs.appendChild(_buildLocRow(r.loc.name, r.playerIP, r.aiIP)); });
    var actions = document.createElement('div'); actions.className = 'result-actions';
    function mkBtn(label, cb) {
      var b = document.createElement('button'); b.className = 'btn-primary'; b.textContent = label;
      b.addEventListener('click', cb); return b;
    }
    if (opts.firstWin) {
      // Shown right after a tier-win sequence (dialogue + gold [+ card]).
      // CONTINUE's destination varies by tier: the SERF win routes through the
      // overworld's Hatshepsut return so the Merchant can deliver his cards.
      var _cont = opts.onContinue || _exitToOverworld;
      actions.appendChild(mkBtn('CONTINUE',   function () { _cont(); }));
      actions.appendChild(mkBtn('GAME BOARD', function () { _hideResultForReview(); }));
    } else {
      // PLAY AGAIN routes through _onPlayAgain — on a first SERF loss that is
      // the Merchant intervention (cards + deck builder) before the retry.
      actions.appendChild(mkBtn('PLAY AGAIN',  function () { _onPlayAgain(); }));
      actions.appendChild(mkBtn('GAMEBOARD',   function () { _hideResultForReview(); }));
      actions.appendChild(mkBtn(won ? 'CONTINUE' : 'BACK TO MAP', function () { _exitToOverworld(); }));
    }
    wrap.appendChild(headline); wrap.appendChild(locs); wrap.appendChild(actions);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }
  function _restartBattle() { _removeResultPopup(); _teardown(); start(); }
  function _exitToOverworld() {
    _removeResultPopup(); _teardown();
    if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
    setTimeout(function () {
      if (window.Overworld && typeof window.Overworld.resumeAfterBattle === 'function') window.Overworld.resumeAfterBattle();
    }, 100);
  }
  /* SERF-win exit (Stage B): route through the overworld's Hatshepsut handler so
     the Merchant's card delivery can fire on arrival. It self-gates on
     KEY_CARDS_DELIVERED, so after a loss-path delivery this is just a plain
     return. Falls back to the plain exit if the handler isn't present. */
  function _exitToOverworldAfterSerfWin() {
    _removeResultPopup(); _teardown();
    if (window.Overworld && typeof window.Overworld.returnFromHatshepsutSerfWin === 'function') {
      window.Overworld.returnFromHatshepsutSerfWin();
    } else {
      _exitToOverworld();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     STAGE B — LOSS-PATH MERCHANT INTERVENTION
     ────────────────────────────────────────────────────────────
     Structurally identical to Gilgamesh's Cuneiform intervention (the proven
     pattern): SHH → board fades to black → matchstrike + candle flame fills
     the black → the Merchant's conversation runs in the lower HUD over the
     candlelit backdrop, with the two card grants inline → deck builder → the
     battle retry.

     Differs from Gilgamesh's in exactly one way, and it is the important one:
     his intervention returns to the INTACT board (he re-challenges on it),
     while this one routes through the deck builder first — the whole point of
     the gift is that she rebuilds her deck with it before retrying. So the
     deck builder gets an explicit return context (Overworld.openDeckBuilderThen)
     that relaunches the battle, rather than the builder's own map-or-home
     inference. See deckbuilder.js's __deckBuilderReturn branch.

     The candle visual is Overworld's generic showInterventionCandle /
     fadeOutInterventionCandle — one owner for the flame, no copy here. */
  var KEY_CARDS_DELIVERED = 'sog_hatshepsut_cards_delivered';

  var MERCHANT_LOSS_A = [
    { who: 'merchant', text: 'Shh. Over here.' },
    { who: 'explorer', text: "Oh! It's you again." },
    { who: 'merchant', text: 'She cleaned you out.' },
    { who: 'explorer', text: 'She said I had empty hands.' },
    { who: 'merchant', text: 'She was right. You came to the market with nothing to trade.' },
    { who: 'merchant', text: "Let's fix that." }
    // → [GRANT CARD — Merchant 76]
  ];
  var MERCHANT_LOSS_B = [
    { who: 'merchant', text: 'A merchant of Egypt.' }
    // → [GRANT CARD — Purple Dye 75]
  ];
  var MERCHANT_LOSS_C = [
    { who: 'merchant', text: 'And Purple dye from Mesopotamia.' },
    { who: 'merchant', text: 'Merchants live off of foreign goods.' },
    { who: 'explorer', text: 'Thank you!' },
    // Closing beat points straight at what happens next (the deck builder opens
    // on this line), rather than at the rematch.
    { who: 'merchant', text: 'Now put together a deck that can expand the trade network.' }
  ];

  var LOSS_FADE_ID = 'hatshepsut-loss-fade';
  function _hFadeToBlack(onDone) {
    var prev = document.getElementById(LOSS_FADE_ID);
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var fade = document.createElement('div');
    fade.id = LOSS_FADE_ID;
    fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:100;pointer-events:none;transition:opacity 0.5s ease;';
    (document.getElementById('sog-stage') || document.body).appendChild(fade);
    void fade.offsetHeight;   // reflow so the transition animates from 0
    fade.style.opacity = '1';
    setTimeout(function () { if (onDone) onDone(); }, 540);
  }
  function _hRemoveBlack() {
    var f = document.getElementById(LOSS_FADE_ID);
    if (f && f.parentNode) f.parentNode.removeChild(f);
  }
  function _hHudLines(lines, cb) {
    var hud = window.SOG && SOG.HUD;
    if (hud && typeof hud.runLines === 'function') hud.runLines(lines, cb);
    else if (cb) cb();
  }

  function _runMerchantLossIntervention() {
    var hud = window.SOG && SOG.HUD;
    var ow  = window.Overworld;
    var hasCandle = !!(ow && typeof ow.showInterventionCandle === 'function'
                          && typeof ow.fadeOutInterventionCandle === 'function');
    // Same reason as Gilgamesh's: this borrows the overworld screen so the HUD
    // can render, which would otherwise resume map music via the showScreen hook.
    window._sogSuppressMapMusic = true;
    if (window.SOG && SOG.ui && typeof SOG.ui.stopBgMusic === 'function') SOG.ui.stopBgMusic();
    _playSfx('sfx/shh.m4a');

    _removeResultPopup();
    _hFadeToBlack(function () {
      if (typeof window.showScreen === 'function') window.showScreen('screen-overworld');
      if (hud && typeof hud.enterDialogueMode === 'function') hud.enterDialogueMode(null, function () {});
      if (hud && typeof hud.swapNpcPortrait === 'function') hud.swapNpcPortrait({ character: 'merchant' });

      var runConversation = function () {
        // The fallbacks report `false` — no Overworld means no grant happened,
        // so the delivery must stay re-armed rather than be marked complete.
        var grantMerchant = (ow && ow.grantHatshepsutGiftMerchant) || function (cb) { cb(false); };
        var grantDye      = (ow && ow.grantHatshepsutGiftDye)      || function (cb) { cb(false); };
        _hHudLines(MERCHANT_LOSS_A, function () {
          grantMerchant(function (okMerchant) {
            _hHudLines(MERCHANT_LOSS_B, function () {
              grantDye(function (okDye) {
                _hHudLines(MERCHANT_LOSS_C, function () {
                  // Same rule as the win path: both cards, or no gate. The
                  // player still gets the deck builder and the retry either
                  // way — only the "already delivered" record is withheld.
                  if (okMerchant && okDye) _set(KEY_CARDS_DELIVERED);
                  else console.warn('[HatshepsutBattle] gift partially failed — merchant:',
                                    okMerchant, 'dye:', okDye, '— delivery left re-armed');
                  /* Swap to the destination BEHIND the cover, then lift the
                     cover — the same order Gilgamesh's intervention uses to
                     return to its board. Lifting first would reveal the
                     overworld screen this sequence borrowed to render the HUD,
                     flashing the map for the length of the candle fade before
                     the deck builder appears. */
                  var toDeckBuilder = function () {
                    window._sogSuppressMapMusic = false;
                    _playSfx('sfx/shh.m4a');       // SHH as the candle is snuffed
                    // Deck builder → RETRY THE BATTLE (not the map). Opened
                    // while still covered, so it is what the fade reveals.
                    var openThen = ow && ow.openDeckBuilderThen;
                    if (openThen) openThen(function () { _restartBattle(); }, '&#8592; Back to Battle');
                    // The candlelit backdrop sits above the plain-black cover,
                    // so dropping the black now is invisible; the candle fade
                    // is the only visible transition, and it uncovers the
                    // deck builder directly.
                    _hRemoveBlack();
                    if (hasCandle) ow.fadeOutInterventionCandle(null);
                    if (!openThen) _restartBattle();   // no overworld → straight to the retry
                  };
                  if (hud && typeof hud.exitDialogueMode === 'function') hud.exitDialogueMode(toDeckBuilder);
                  else toDeckBuilder();
                });
              });
            });
          });
        });
      };

      if (hasCandle) ow.showInterventionCandle(runConversation);
      else runConversation();
    });
  }

  /* PLAY AGAIN after a loss. The intervention is a SERF-loss beat only, and
     only while the cards are undelivered — a Giant-rematch loss, or any loss
     after either delivery path has run, restarts straight away. */
  function _onPlayAgain() {
    if (_battleWasGiantRematch || _has(KEY_CARDS_DELIVERED)) { _restartBattle(); return; }
    _runMerchantLossIntervention();
  }

  /* ══════════════════════════════════════════════════════════════
     SCRIPT — every outcome plays its tier-appropriate dialogue, then the
     reward grant if any, then the CUSTOM result scoreboard above (never the
     engine's generic proceed() — see _showResultScoreboard). onWin grants
     gold/card via SOG.rewards (script-owned, like every other boss —
     buildHatshepsutConfig's own `rewards: {}` stays empty and unused, same
     as Narmer's).
  ══════════════════════════════════════════════════════════════ */
  var HATSHEPSUT_SCRIPT = {
    onIntro: function (ctx, done) {
      var p = ctx.config && ctx.config.presentation;
      if (p && p.bodyClass) document.body.classList.add(p.bodyClass);
      if (typeof window.showScreen === 'function') window.showScreen('screen-battle');
      done();
    },

    onBattleStart: function (ctx, done) {
      if (window.SOG && SOG.HUD && typeof SOG.HUD.applyBattleAvatars === 'function') {
        SOG.HUD.applyBattleAvatars(ctx.config && ctx.config.presentation);
      }
      _battleWasGiantRematch = _isGiantRematch();
      _fadeOutCover(function () {
        _dialogueActive = true;
        var finish = function () { _dialogueActive = false; done(); };
        // GIANT rematch → in-battle dominance intro instead of the Serf
        // opening tutorial (mirrors every other two-tier boss). The Giant
        // intro has no seen-gate of its own — same convention as every
        // other boss's giantIntro, which plays once per Giant ENTRY
        // (Giant is a single rematch, not a repeatable tutorial).
        if (_battleWasGiantRematch) _runLinesIfAny(HATSHEPSUT_GIANT_INTRO, finish);
        else                        _runOpeningDialogue(finish);
      });
    },

    isInputBlocked: function () { return _dialogueActive; },

    /* Outcome routing — the module OWNS the screen (never proceed()); see
       _showResultScoreboard/_exitToOverworld/_restartBattle above. */
    onWin:  function (ctx, result, proceed) { _onWin(result.locResults); },
    onLoss: function (ctx, result, proceed) { _onLoss(result.locResults); },
    onTie:  function (ctx, result, proceed) { _onTie(result.locResults); }
  };

  /* Two-tier reward gate (SOG.rewards): the one-shot snapshot game.js's
     endGame() stages BEFORE stamping sog_node_hatshepsut_<tier>_beaten —
     reading _tierBeatenLocal directly here would see the post-stamp value
     and misread the actual first win. grantCard implies firstTierWin &&
     tier==='giant' (SOG.rewards' own contract), so the three branches below
     are mutually exclusive: first Giant win → card+gold; first Serf win →
     gold only; anything else (a replay of an already-beaten tier) → flourish
     only, zero reward (anti-farming). Mirrors Narmer's _onWin exactly,
     amounts are this boss's own (20/30, see HATSHEPSUT_GOLD_* above). */
  function _onWin(locResults) {
    var r = (window.SOG && SOG.rewards)
          ? SOG.rewards.consume('hatshepsut')
          : { firstTierWin: true, tier: _battleWasGiantRematch ? 'giant' : 'serf', grantCard: _battleWasGiantRematch };
    if (r.grantCard) {
      // FIRST GIANT win — card, THEN gold, split around the "Take it" beat.
      _removeResultPopup();
      _runLinesIfAny(HATSHEPSUT_GIANT_WIN_A, function () {
        _grantHatshepsutCard(function () {
          _grantGold(HATSHEPSUT_GOLD_GIANT_WIN, function () {
            _runLinesIfAny(HATSHEPSUT_GIANT_WIN_B, function () {
              _showResultScoreboard(true, false, locResults, { firstWin: true });
            });
          });
        });
      });
    } else if (r.firstTierWin) {
      // FIRST SERF win — gold only, no card.
      _removeResultPopup();
      _runLinesIfAny(HATSHEPSUT_SERF_WIN_A, function () {
        _grantGold(HATSHEPSUT_GOLD_SERF_WIN, function () {
          _runLinesIfAny(HATSHEPSUT_SERF_WIN_B, function () {
            _showResultScoreboard(true, false, locResults,
              { firstWin: true, onContinue: _exitToOverworldAfterSerfWin });
          });
        });
      });
    } else {
      // Replay of an already-beaten tier — flourish only, zero reward.
      _victoryFlourish(function () {
        _showResultScoreboard(true, false, locResults, {});
      });
    }
  }
  function _onLoss(locResults) { _onDefeatOrTie(false, locResults); }
  function _onTie(locResults)  { _onDefeatOrTie(true,  locResults); }
  function _onDefeatOrTie(isTie, locResults) {
    var lines = _battleWasGiantRematch
      ? (isTie ? HATSHEPSUT_GIANT_DRAW : HATSHEPSUT_GIANT_LOSS)
      : (isTie ? TIE_DIALOGUE : LOSS_DIALOGUE);
    _runLinesIfAny(lines, function () {
      _showResultScoreboard(false, isTie, locResults, {});
    });
  }

  if (window.SOG && SOG.BattleHooks && typeof SOG.BattleHooks.register === 'function') {
    SOG.BattleHooks.register('hatshepsut', HATSHEPSUT_SCRIPT);
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  function start() {
    log('start() → initGame(buildHatshepsutConfig)');
    if (typeof window.initGame === 'function') window.initGame(buildHatshepsutConfig());
  }

  return {
    start:                  start,
    buildHatshepsutConfig:  buildHatshepsutConfig,
    teardown:               _teardown,
    LOC: { THEBES: LOC_THEBES, RED_SEA: LOC_RED_SEA, PUNT: LOC_PUNT }
  };
})();

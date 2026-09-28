/**
 * js/game/flood.js — SOG.flood
 * Shared FLOOD / SEASON mechanic: a per-location "on" state with an art
 * crossfade and a nameplate swap, used by two families of location:
 *
 *   FLOOD (setFlooded)  — a flooded location accepts NO new plays from either
 *     side (js/game/board.js isLocationPlayable reads the location object's
 *     `flooded` flag; the player play gate in input.js and both AI play gates
 *     consult it). Cards already there stay and keep scoring. Presentation:
 *     art crossfade, "<Name> - Flooded", "No cards can be played here", a blue
 *     water RUSH, a persistent blue TINT, sfx/waterflow.m4a.
 *     Schedules: js/sog-adventure-hanginggardens.js (Nebuchadnezzar, turns
 *     3/4/5) and js/game.js _rollArcadiumFloods (Arcadium, 25% per river per turn).
 *
 *   SEASON (setSeason) — the same crossfade and nameplate swap, but the location
 *     stays OPEN: no `flooded` flag, no rush, no tint unless asked. Used by the
 *     India rivers (js/game/abilities.js applySeasonalLocations): the Indus
 *     alternates wet/dry every turn, the Ganges Plain's monsoon is rolled at turn
 *     start and shown at the reveal. The caller supplies the suffix, the "on"
 *     ability text and an optional sfx; the "off" state restores the location's
 *     own name and abilityText.
 *
 * Both drive the SAME CSS: .hg-flooded on the column fades in the ::after art
 * layer (per-location rules in css/style.css), so one crossfade serves rivers
 * that flood and rivers that change season.
 *
 * API:
 *   SOG.flood.setFlooded(locId, on)         — flood flag + full flood presentation
 *   SOG.flood.setSeason(locId, on, opts)    — presentation only; opts { suffix,
 *                                             abilityText, sfx, tint }
 *   SOG.flood.isFlooded(locId) / floodedIds()
 *   SOG.flood.clear()                       — every flag/state off, all flood DOM stripped
 */
(function () {
  'use strict';

  var FLOOD = {
    suffix:      ' - Flooded',
    abilityText: 'No cards can be played here',
    sfx:         'sfx/waterflow.m4a',
    rush:        true,
    tint:        true,
    block:       true
  };
  var RUSH_LIFETIME_MS = 2250;   // outlasts the 1.875s hgFloodRushIn wipe

  function _G() { return (window.SOG && SOG.state && SOG.state.G) || null; }
  function _loc(locId) {
    var G = _G();
    return (G && G.locations) ? G.locations.find(function (l) { return l.id === locId; }) : null;
  }
  function _colEl(locId) { return document.querySelector('.battle-col[data-loc-id="' + locId + '"]'); }
  function _playSfx(src) {
    if (!src) return;
    if (window.SOG && SOG.sfx && typeof SOG.sfx.play === 'function') { SOG.sfx.play(src); return; }
    try { new Audio(src).play(); } catch (e) {}
  }

  /* A transient blue water surge that sweeps down over the column the instant it
     floods (CSS .hg-flood-rush + @keyframes hgFloodRushIn), then self-removes. */
  function _spawnRush(col) {
    if (!col) return;
    var rush = document.createElement('div');
    rush.className = 'hg-flood-rush';
    rush.setAttribute('aria-hidden', 'true');
    col.appendChild(rush);
    setTimeout(function () { if (rush.parentNode) rush.parentNode.removeChild(rush); }, RUSH_LIFETIME_MS);
  }
  /* A persistent 20% blue tint (CSS .hg-flood-tint), kept while the state lasts. */
  function _spawnTint(col) {
    if (!col || col.querySelector('.hg-flood-tint')) return;   // idempotent
    var tint = document.createElement('div');
    tint.className = 'hg-flood-tint';
    tint.setAttribute('aria-hidden', 'true');
    col.appendChild(tint);
  }
  function _removeTint(col) {
    if (!col) return;
    var tint = col.querySelector('.hg-flood-tint');
    if (tint && tint.parentNode) tint.parentNode.removeChild(tint);
  }

  function _onPresentation(loc, opts) {
    var col = _colEl(loc.id);
    if (col) {
      col.classList.add('hg-flooded');                                       // art crossfade
      var nm = col.querySelector('.battle-loc-name');    if (nm) nm.textContent = loc.name + (opts.suffix || '');
      var ab = col.querySelector('.battle-loc-ability'); if (ab && opts.abilityText != null) ab.textContent = opts.abilityText;
      if (opts.rush) _spawnRush(col);
      if (opts.tint) _spawnTint(col);
    }
    _playSfx(opts.sfx);
  }
  function _offPresentation(loc) {
    var col = _colEl(loc.id);
    if (!col) return;
    col.classList.remove('hg-flooded');                                      // crossfade back
    var nm = col.querySelector('.battle-loc-name');    if (nm) nm.textContent = loc.name;
    var ab = col.querySelector('.battle-loc-ability'); if (ab) ab.textContent = loc.abilityText || '';
    _removeTint(col);
  }

  /* Shared state switch. `flag` is the loc property that records the state
     ('flooded' or 'seasonOn'); the presentation plays only on a CHANGE, so a
     caller may re-assert the same state every turn without re-triggering it. */
  function _set(locId, on, flag, opts) {
    var loc = _loc(locId);
    if (!loc) return false;
    var was = !!loc[flag];
    loc[flag] = !!on;
    if (on && !was)  _onPresentation(loc, opts);
    if (!on && was)  _offPresentation(loc);
    return loc[flag];
  }

  function setFlooded(locId, on) { return _set(locId, on, 'flooded', FLOOD); }
  function setSeason(locId, on, opts) {
    opts = opts || {};
    return _set(locId, on, 'seasonOn', {
      suffix: opts.suffix || '', abilityText: opts.abilityText, sfx: opts.sfx || null,
      rush: false, tint: !!opts.tint, block: false
    });
  }
  function isFlooded(locId) { var loc = _loc(locId); return !!(loc && loc.flooded); }
  function floodedIds() {
    var G = _G();
    return (G && G.locations) ? G.locations.filter(function (l) { return l.flooded; }).map(function (l) { return l.id; }) : [];
  }

  /* Reset everything so nothing lingers past a battle: every flag off, every
     crossfade class and overlay element gone. Idempotent. (Arcadium picks its
     locations from the shared LOCATIONS catalog OBJECTS and the data levels
     reuse their location objects across launches, so flags would otherwise
     follow a location into the next game — game.js clears on build.) */
  function clear() {
    var G = _G();
    if (G && G.locations) G.locations.forEach(function (l) { l.flooded = false; l.seasonOn = false; });
    Array.prototype.forEach.call(document.querySelectorAll('.battle-col.hg-flooded'),
      function (col) { col.classList.remove('hg-flooded'); });
    Array.prototype.forEach.call(document.querySelectorAll('.hg-flood-overlay, .hg-flood-rush, .hg-flood-tint'),
      function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
  }

  window.SOG = window.SOG || {};
  window.SOG.flood = {
    setFlooded: setFlooded,
    setSeason:  setSeason,
    isFlooded:  isFlooded,
    floodedIds: floodedIds,
    clear:      clear
  };
})();

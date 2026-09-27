/**
 * js/game/flood.js — SOG.flood
 * Shared FLOOD mechanic: flag + presentation for a flooded location.
 *
 * A flooded location accepts NO new plays from either side (js/game/board.js
 * isLocationPlayable reads the location object's `flooded` flag; the player play
 * gate in input.js and both AI play gates consult it). Cards already there stay
 * and keep scoring — the flood only closes the door.
 *
 * This module owns the flag and everything the player SEES:
 *   • .hg-flooded on the column → the art crossfades to the flood image
 *     (css: .battle-col[data-loc-id="101"/"103"]::after — Euphrates / Tigris)
 *   • nameplate "<Name> - Flooded", ability line "No cards can be played here"
 *   • a transient blue water RUSH that sweeps down the column, then a persistent
 *     20% blue TINT while the flood lasts (css .hg-flood-rush / .hg-flood-tint)
 *   • sfx/waterflow.m4a
 * Un-flooding reverses all of it, restoring the name and ability text from the
 * live location object (never mutated).
 *
 * It does NOT decide WHEN a location floods — that is the caller's schedule:
 *   • js/sog-adventure-hanginggardens.js — Nebuchadnezzar: exactly one river on
 *     turns 3/4/5 (random pick, then strict alternation), plus its first-flood
 *     dialogue.
 *   • js/game.js _rollArcadiumFloods — Arcadium: every location flagged
 *     `floods: true` in js/locations.js (Euphrates, Tigris) rolls independently
 *     at the start of every turn against cfg.flood.chance (25%). Solo only — 2P
 *     matches carry no flood config, so both clients see the same board.
 *
 * API:
 *   SOG.flood.setFlooded(locId, on)  — set the flag; play the flood / un-flood
 *                                      presentation only when the state CHANGES
 *   SOG.flood.isFlooded(locId)
 *   SOG.flood.floodedIds()           — ids currently flooded (from G.locations)
 *   SOG.flood.clear()                — clear every flag + strip all flood DOM
 *                                      (battle teardown; idempotent)
 */
(function () {
  'use strict';

  var FLOODED_ABILITY_TEXT = 'No cards can be played here';
  var FLOODED_NAME_SUFFIX  = ' - Flooded';
  var FLOOD_SFX            = 'sfx/waterflow.m4a';
  var RUSH_LIFETIME_MS     = 2250;   // outlasts the 1.875s hgFloodRushIn wipe

  function _G() { return (window.SOG && SOG.state && SOG.state.G) || null; }
  function _loc(locId) {
    var G = _G();
    return (G && G.locations) ? G.locations.find(function (l) { return l.id === locId; }) : null;
  }
  function _colEl(locId) { return document.querySelector('.battle-col[data-loc-id="' + locId + '"]'); }
  function _playSfx(src) {
    if (window.SOG && SOG.sfx && typeof SOG.sfx.play === 'function') { SOG.sfx.play(src); return; }
    try { new Audio(src).play(); } catch (e) {}
  }

  /* A transient blue water surge that sweeps down over the column the instant it
     floods (CSS .hg-flood-rush + @keyframes hgFloodRushIn), then self-removes,
     leaving the persistent .hg-flooded art behind. */
  function _spawnRush(col) {
    if (!col) return;
    var rush = document.createElement('div');
    rush.className = 'hg-flood-rush';
    rush.setAttribute('aria-hidden', 'true');
    col.appendChild(rush);
    setTimeout(function () { if (rush.parentNode) rush.parentNode.removeChild(rush); }, RUSH_LIFETIME_MS);
  }
  /* A persistent 20% blue tint over the flooded location (CSS .hg-flood-tint), kept
     for the whole time it stays flooded and removed on un-flood / teardown. */
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

  function _floodPresentation(loc) {
    var col = _colEl(loc.id);
    if (col) {
      col.classList.add('hg-flooded');                                       // art crossfade
      var nm = col.querySelector('.battle-loc-name');    if (nm) nm.textContent = loc.name + FLOODED_NAME_SUFFIX;
      var ab = col.querySelector('.battle-loc-ability'); if (ab) ab.textContent = FLOODED_ABILITY_TEXT;
      _spawnRush(col);                                                       // blue water surge sweeps over it
      _spawnTint(col);                                                       // persistent 20% blue tint
    }
    _playSfx(FLOOD_SFX);
  }
  function _unfloodPresentation(loc) {
    var col = _colEl(loc.id);
    if (!col) return;
    col.classList.remove('hg-flooded');                                      // crossfade back
    var nm = col.querySelector('.battle-loc-name');    if (nm) nm.textContent = loc.name;
    var ab = col.querySelector('.battle-loc-ability'); if (ab) ab.textContent = loc.abilityText || '';
    _removeTint(col);                                                        // drop the blue tint
  }

  /* Set a location's flooded flag. The presentation plays only on a CHANGE, so a
     caller may re-assert the same state every turn without re-triggering the rush. */
  function setFlooded(locId, on) {
    var loc = _loc(locId);
    if (!loc) return false;
    var was = !!loc.flooded;
    loc.flooded = !!on;
    if (on && !was)  _floodPresentation(loc);
    if (!on && was)  _unfloodPresentation(loc);
    return loc.flooded;
  }
  function isFlooded(locId) { var loc = _loc(locId); return !!(loc && loc.flooded); }
  function floodedIds() {
    var G = _G();
    return (G && G.locations) ? G.locations.filter(function (l) { return l.flooded; }).map(function (l) { return l.id; }) : [];
  }

  /* Reset the flood system so nothing lingers past a battle: every flag off, every
     flood class + overlay element gone. Safe/idempotent — inert if nothing flooded.
     (Arcadium picks its locations from the shared LOCATIONS catalog OBJECTS, so a
     flag left on one would follow it into the next game — game.js clears on build.) */
  function clear() {
    var G = _G();
    if (G && G.locations) G.locations.forEach(function (l) { l.flooded = false; });
    Array.prototype.forEach.call(document.querySelectorAll('.battle-col.hg-flooded'),
      function (col) { col.classList.remove('hg-flooded'); });
    Array.prototype.forEach.call(document.querySelectorAll('.hg-flood-overlay, .hg-flood-rush, .hg-flood-tint'),
      function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
  }

  window.SOG = window.SOG || {};
  window.SOG.flood = {
    setFlooded: setFlooded,
    isFlooded:  isFlooded,
    floodedIds: floodedIds,
    clear:      clear
  };
})();

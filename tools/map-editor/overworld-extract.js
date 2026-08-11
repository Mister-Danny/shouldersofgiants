#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   OVERWORLD DIALOGUE — Phase 3, read+write for the 39 named dialogue arrays
   in js/overworld.js the user approved from the read-only inventory.

   Deliberately thin: every span-finding/purity/comment/write-back primitive
   this needs already exists in boss-extract.js and is already 100% generic
   (operates on arbitrary file text + var names, nothing boss-specific in
   its implementation) — this file requires that module and reuses its
   exports rather than re-implementing or copy-pasting them. The only NEW
   thing here is OVERWORLD_DIALOGUE_GROUPS, the hand-curated registry of
   which 39 arrays are real editable dialogue and which flow group each
   belongs to — same "one field, one declaration" discipline as
   BOSS_SOURCES, and the single source of truth the UI groups by.

   Explicitly excluded, per the approved inventory — never listed below,
   so they can never reach the save endpoint no matter what a client sends:
     - SPIKE_MARKET_INTRO (throwaway test fixture, not real content)
     - MARKET_SHELVES, EGYPT_TIERS, SPIKE_MARKET_GRID, SPIKE_MARKET_TIERS
       (shelf/tier CONFIG data, not dialogue — {topPct,xs,cards}-shaped,
       not {who,text}-shaped)
     - D3_GILGAMESH_CHALLENGE_AGAIN, D3_FARMER_POSTLOSS_A/B,
       DECKBUILDER_UNLOCK_DIALOGUE (dead code — deleted already, see the
       "Remove 4 dead overworld.js dialogue arrays" commit)
     - The 4 INLINE (unnamed) dialogue blocks — no var to anchor a surgical
       replacement on; handled separately, see the Phase 3b proposal.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

var fs = require('fs');
var path = require('path');
var be = require('./boss-extract.js');

var OVERWORLD_FILE = 'js/overworld.js';

/* Order here IS the order the UI groups arrays in — matches the approved
   inventory's flow-based grouping exactly, roughly in the order a
   playthrough encounters them. */
var OVERWORLD_DIALOGUE_GROUPS = [
  { group: 'Adventure intro (East Africa)', arrays: ['PHASE1_DIALOGUE', 'PHASE2_DIALOGUE'] },
  { group: 'Post-Neanderthal win', arrays: ['POST_NEANDERTHAL_DIALOGUE', 'POST_NEANDERTHAL_DIALOGUE_B'] },
  { group: 'Otzi (Egypt signpost) encounter', arrays: ['OTZI_PRE_BATTLE_DIALOGUE'] },
  { group: 'Post-Otzi East Africa return', arrays: ['POST_OTZI_ACCOUNT_DIALOGUE', 'EASTAFRICA_POSTOTZI_DIALOGUE'] },
  { group: 'To Egypt exit (first click)', arrays: ['TOEGYPT_GOODBYE_DIALOGUE'] },
  { group: 'D1 — Otzi→Mesopotamia travel', arrays: ['D1_SCENE1_DIALOGUE', 'D1_SCENE2_DIALOGUE', 'D1_SCENE3_DIALOGUE'] },
  { group: 'D2a — Mesopotamia arrival', arrays: ['D2A_FARMING_DIALOGUE'], note: 'This flow also has 3 inline (unnamed) dialogue blocks not listed here — see the Phase 3b proposal for the click-transform and closing-sequence lines.' },
  { group: 'D2b — Gilgamesh first encounter', arrays: ['D2B_GILGAMESH_DIALOGUE'] },
  { group: 'First market return', arrays: ['D4_FIRST_MARKET_INTERSTITIAL'] },
  { group: 'Sargon reveal + encounter', arrays: ['D4_SARGON_REVEAL_INTRO', 'D4_SARGON_REVEAL_OUTRO', 'D4_SARGON_TURNED_AWAY_A', 'D4_SARGON_TURNED_AWAY_B', 'D4_SARGON_ENCOUNTER', 'D4_SARGON_LOSS_REFLECT', 'D4_SARGON_WIN_REFLECT'] },
  { group: 'Hammurabi encounter', arrays: ['D4_HAMMURABI_ENCOUNTER', 'D4_HAMMURABI_TURNED_AWAY_A', 'D4_HAMMURABI_TURNED_AWAY_B'] },
  { group: 'Hanging Gardens (Nebuchadnezzar)', arrays: ['D5_HANGING_GARDENS_REFLECT', 'D5_HANGING_GARDENS_REACTION', 'D5_HANGING_GARDENS_CLICK_A', 'D5_HANGING_GARDENS_CLICK_B', 'D5_NEB_WIN_INTERSTITIAL_A', 'D5_NEB_WIN_INTERSTITIAL_B'] },
  { group: 'Egypt on-ramp (post-Nebuchadnezzar)', arrays: ['EGYPT_ONRAMP_DIALOGUE', 'EGYPT_NODE_ARRIVAL_DIALOGUE'] },
  { group: 'Narmer encounter + win', arrays: ['NARMER_ENCOUNTER_DIALOGUE', 'D6_NARMER_WIN_INTERSTITIAL_A', 'D6_NARMER_WIN_INTERSTITIAL_B'] },
  { group: 'Focus gate (system-wide — not tied to any one node)', arrays: ['FOCUS_GATE_FIRST', 'FOCUS_GATE_AGAIN'] },
  { group: 'Mesopotamia Marketplace', arrays: ['MARKET_TRADER_INTRO'] },
  { group: 'Egypt River Market', arrays: ['EGYPT_TRADER_INTRO'] }
];

/* Flat lookup used by the save endpoint to whitelist every submitted var
   name against the registry above — a name not in this set is refused
   before the file is even read, let alone written. */
var ALL_ARRAY_NAMES = OVERWORLD_DIALOGUE_GROUPS.reduce(function (acc, g) {
  return acc.concat(g.arrays);
}, []);
function isKnownArray(name) { return ALL_ARRAY_NAMES.indexOf(name) !== -1; }

/* Assembles the read/edit view: every group, every array's extraction +
   editability gate (reusing boss-extract.js's own dialogueEditability —
   there's no `sharedWith`/sameAs concept here, every array is its own
   named var, so passing a bare {present:true, extraction} entry is enough
   to get the same purity/unrepresentable-fields checks boss dialogue
   already gets). */
function buildOverworldPreview() {
  var abs = path.join(__dirname, '..', '..', OVERWORLD_FILE);
  var fileText = fs.readFileSync(abs, 'utf8');
  var groups = OVERWORLD_DIALOGUE_GROUPS.map(function (g) {
    return {
      group: g.group,
      note: g.note || null,
      arrays: g.arrays.map(function (varName) {
        var extraction = be.extractVar(fileText, varName);
        var gate = be.dialogueEditability({ present: true, extraction: extraction });
        return {
          varName: varName,
          extraction: extraction,
          editable: gate.editable,
          editBlockedReason: gate.reason,
          lineOpsBlocked: !!gate.lineOpsBlocked,
          lineOpsBlockedReason: gate.lineOpsBlockedReason || null
        };
      })
    };
  });
  return { file: OVERWORLD_FILE, groups: groups };
}

module.exports = {
  OVERWORLD_FILE: OVERWORLD_FILE,
  OVERWORLD_DIALOGUE_GROUPS: OVERWORLD_DIALOGUE_GROUPS,
  isKnownArray: isKnownArray,
  buildOverworldPreview: buildOverworldPreview
};

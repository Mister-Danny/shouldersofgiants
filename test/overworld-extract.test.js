'use strict';

// Phase 3 write-back tests for tools/map-editor/overworld-extract.js.
// Same hard requirement as the boss files, and it matters more here:
// overworld.js is 5000 lines and load-bearing for the whole game, not one
// boss's battle — a no-edit save MUST reproduce it byte-for-byte, proven
// across all 39 approved arrays before any UI is allowed to write to it.
//
// Run via `npm run test:overworld-extract` (or `node --test test/`).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const owExtract = require('../tools/map-editor/overworld-extract.js');
const boss = require('../tools/map-editor/boss-extract.js');   // applyDialogueEdits is fully generic — reused directly

const ROOT = path.resolve(__dirname, '..');
const OVERWORLD_ABS = path.join(ROOT, owExtract.OVERWORLD_FILE);

test('registry has exactly the 39 approved arrays, none of the excluded ones', () => {
  const all = owExtract.OVERWORLD_DIALOGUE_GROUPS.reduce((n, g) => n.concat(g.arrays), []);
  assert.equal(all.length, 39);
  assert.equal(new Set(all).size, 39, 'no duplicate array names across groups');

  const excluded = [
    'SPIKE_MARKET_INTRO', 'MARKET_SHELVES', 'EGYPT_TIERS', 'SPIKE_MARKET_GRID', 'SPIKE_MARKET_TIERS',
    'D3_GILGAMESH_CHALLENGE_AGAIN', 'D3_FARMER_POSTLOSS_A', 'D3_FARMER_POSTLOSS_B', 'DECKBUILDER_UNLOCK_DIALOGUE',
  ];
  excluded.forEach((name) => assert.ok(!all.includes(name), `${name} must not be in the editable registry`));
});

test('every registered array is found, plain-literal, and editable', () => {
  const preview = owExtract.buildOverworldPreview();
  preview.groups.forEach((g) => {
    g.arrays.forEach((a) => {
      assert.equal(a.extraction.found, true, `${a.varName} not found in source`);
      assert.equal(a.extraction.isPlainLiteral, true, `${a.varName} is not a plain literal`);
      assert.equal(a.editable, true, `${a.varName} reported not editable: ${a.editBlockedReason}`);
    });
  });
});

test('no-edit round trip is byte-identical for all 39 arrays, submitted together in one call', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const preview = owExtract.buildOverworldPreview();
  const edits = preview.groups.flatMap((g) => g.arrays).map((a) => ({
    varName: a.varName,
    lines: a.extraction.value,
  }));
  assert.equal(edits.length, 39);

  const out = boss.applyDialogueEdits(original, edits);
  assert.equal(out.fileText, original, 'no-op save across all 39 arrays must not change a single byte');
  assert.ok(out.results.every((r) => r.changed === false));
  assert.ok(out.results.every((r) => !r.error), JSON.stringify(out.results.filter((r) => r.error)));
});

test('no-edit round trip is also byte-identical array-by-array (isolates any single bad actor)', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const preview = owExtract.buildOverworldPreview();
  preview.groups.forEach((g) => {
    g.arrays.forEach((a) => {
      const out = boss.applyDialogueEdits(original, [{ varName: a.varName, lines: a.extraction.value }]);
      assert.equal(out.fileText, original, `${a.varName}: no-op save changed the file`);
      assert.equal(out.results[0].changed, false, `${a.varName}: reported changed on a no-op`);
    });
  });
});

test('a genuine edit to one array changes only that array, whole file still parses', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const span = boss.findVarSpan(original, 'NARMER_ENCOUNTER_DIALOGUE');
  const current = boss.evalLiteral(span.text);

  const edited = current.map((l, i) => i === 0 ? { who: l.who, text: 'EDITED FIRST LINE' } : l);
  const out = boss.applyDialogueEdits(original, [{ varName: 'NARMER_ENCOUNTER_DIALOGUE', lines: edited }]);

  assert.equal(out.results[0].changed, true);
  assert.doesNotThrow(() => new Function(out.fileText));

  const newVal = boss.evalLiteral(boss.findVarSpan(out.fileText, 'NARMER_ENCOUNTER_DIALOGUE').text);
  assert.equal(newVal[0].text, 'EDITED FIRST LINE');

  // Prefix/suffix outside the edited span must be byte-identical.
  const prefix = original.slice(0, span.valueStart);
  const suffix = original.slice(span.valueEnd);
  assert.ok(out.fileText.startsWith(prefix));
  assert.ok(out.fileText.endsWith(suffix));

  // A handful of OTHER arrays, spread across the file (before and after the
  // edited one), must be untouched.
  ['PHASE1_DIALOGUE', 'D2B_GILGAMESH_DIALOGUE', 'MARKET_TRADER_INTRO', 'FOCUS_GATE_FIRST'].forEach((name) => {
    const before = boss.findVarSpan(original, name).text;
    const after = boss.findVarSpan(out.fileText, name).text;
    assert.equal(after, before, `${name} should be byte-identical after an unrelated edit`);
  });
});

test('D5_HANGING_GARDENS_REFLECT: same-length edit preserves its trailing comment; add/remove loses it', () => {
  // NOT D5_HANGING_GARDENS_CLICK_A — CLICK_A has no comment at all (verified
  // directly against source). REFLECT is the one with the trailing
  // `// -> [HANGING GARDENS node rise animation]` comment; CLICK_A got
  // implicated by an ambiguous inventory table row that bundled REFLECT/
  // REACTION/CLICK_A/CLICK_B/NEB_WIN_A/NEB_WIN_B together under one "A has
  // a trailing comment" note. The comment sits AFTER the last item, outside
  // any line's own {...} span, so a same-length per-line patch never
  // touches it — only a length-changing edit (forced to whole-array
  // regeneration) actually loses it.
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const preview = owExtract.buildOverworldPreview();
  const group = preview.groups.find((g) => g.group.startsWith('Hanging Gardens'));

  const clickA = group.arrays.find((a) => a.varName === 'D5_HANGING_GARDENS_CLICK_A');
  assert.equal(clickA.extraction.hasComments, false, 'D5_HANGING_GARDENS_CLICK_A has no comment');

  const reflect = group.arrays.find((a) => a.varName === 'D5_HANGING_GARDENS_REFLECT');
  assert.equal(reflect.extraction.hasComments, true, 'fixture assumption: REFLECT currently has a comment');

  const editedSameLength = reflect.extraction.value.map((l, i) => i === 0 ? { ...l, text: 'edited' } : l);
  const outPatch = boss.applyDialogueEdits(original, [{ varName: 'D5_HANGING_GARDENS_REFLECT', lines: editedSameLength }]);
  assert.equal(outPatch.results[0].hadComments, false, 'a same-length patch must not report comment loss');
  assert.match(boss.findVarSpan(outPatch.fileText, 'D5_HANGING_GARDENS_REFLECT').text, /HANGING GARDENS node rise/, 'comment must survive');

  const editedLonger = [...reflect.extraction.value, { who: 'explorer', text: 'one more line' }];
  const outRegen = boss.applyDialogueEdits(original, [{ varName: 'D5_HANGING_GARDENS_REFLECT', lines: editedLonger }]);
  assert.equal(outRegen.results[0].hadComments, true, 'a length-changing edit regenerates the array, losing the comment');
  assert.doesNotMatch(boss.findVarSpan(outRegen.fileText, 'D5_HANGING_GARDENS_REFLECT').text, /HANGING GARDENS node rise/, 'comment must be gone after regeneration');
});

test('isKnownArray whitelists only the 39 registered names', () => {
  assert.equal(owExtract.isKnownArray('NARMER_ENCOUNTER_DIALOGUE'), true);
  assert.equal(owExtract.isKnownArray('SPIKE_MARKET_INTRO'), false);
  assert.equal(owExtract.isKnownArray('MARKET_SHELVES'), false);
  assert.equal(owExtract.isKnownArray('DECKBUILDER_UNLOCK_DIALOGUE'), false);
  assert.equal(owExtract.isKnownArray('___NOT_A_REAL_VAR___'), false);
});

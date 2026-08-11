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

/* ══════════════════════════════════════════════════════════════════════════
   Phase 3b — the 3 inline (unnamed) dialogue blocks. Same round-trip proof
   standard as the 39 named arrays, plus tests specific to what makes an
   inline block riskier: the position-based anchor and the compare-and-
   swap check that exists because of it.
   ══════════════════════════════════════════════════════════════════════════ */

function allInlineSpecs() {
  return owExtract.OVERWORLD_DIALOGUE_GROUPS.reduce((acc, g) => acc.concat(g.inline || []), []);
}

test('registry has exactly the 3 approved inline blocks, all in the D2a group', () => {
  const specs = allInlineSpecs();
  assert.equal(specs.length, 3);
  assert.deepEqual(specs.map((s) => s.id).sort(), [
    'd2a-closing-cities-bye', 'd2a-closing-final-line', 'd2a-hunter-transform',
  ]);
});

test('every inline block is found, plain-literal, and editable (but lineOpsBlocked)', () => {
  const preview = owExtract.buildOverworldPreview();
  const d2a = preview.groups.find((g) => g.group.includes('D2a'));
  assert.equal(d2a.inline.length, 3);
  d2a.inline.forEach((b) => {
    assert.equal(b.extraction.found, true, `${b.id} not found`);
    assert.equal(b.extraction.isPlainLiteral, true, `${b.id} not a plain literal`);
    assert.equal(b.editable, true, `${b.id} not editable: ${b.editBlockedReason}`);
    assert.equal(b.lineOpsBlocked, true, `${b.id} must always have lineOpsBlocked`);
  });
});

test('no-edit round trip is byte-identical for all 3 inline blocks, individually and together', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const specs = allInlineSpecs();

  specs.forEach((spec) => {
    const preview = owExtract.buildInlineBlockPreview(original, spec);
    const out = boss.applyInlineDialogueEdit(original, spec, preview.extraction.value, preview.extraction.value);
    assert.equal(out.fileText, original, `${spec.id}: no-op save must not change a single byte`);
    assert.equal(out.changed, false);
    assert.equal(out.error, undefined);
  });

  // All three in sequence, simulating one save request touching all of them —
  // proves re-locating fresh after each (no-op) write still finds the right
  // spans, not stale offsets from before the loop started.
  let text = original;
  specs.forEach((spec) => {
    const preview = owExtract.buildInlineBlockPreview(text, spec);
    const out = boss.applyInlineDialogueEdit(text, spec, preview.extraction.value, preview.extraction.value);
    text = out.fileText;
  });
  assert.equal(text, original);
});

test('a genuine edit to one inline block changes only that block (minimal diff, per-line patch)', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const spec = allInlineSpecs().find((s) => s.id === 'd2a-closing-cities-bye');
  const preview = owExtract.buildInlineBlockPreview(original, spec);
  const current = preview.extraction.value;

  const edited = current.map((l, i) => i === 1 ? { who: l.who, text: 'EDITED LINE' } : l);
  const out = boss.applyInlineDialogueEdit(original, spec, current, edited);

  assert.equal(out.changed, true);
  assert.equal(out.error, undefined);
  assert.doesNotThrow(() => new Function(out.fileText));

  const newSpan = boss.findInlineArraySpan(out.fileText, spec.functionName, spec.callPattern, spec.occurrenceIndex);
  assert.deepEqual(boss.evalLiteral(newSpan.text), edited);

  // Every OTHER line in this same block, plus the other two inline blocks
  // and a couple of named arrays before/after, must be byte-identical.
  const otherLinesUnchanged = boss.findObjectItemSpans(original, boss.findInlineArraySpan(original, spec.functionName, spec.callPattern, spec.occurrenceIndex).valueStart, boss.findInlineArraySpan(original, spec.functionName, spec.callPattern, spec.occurrenceIndex).valueEnd);
  const newItems = boss.findObjectItemSpans(out.fileText, newSpan.valueStart, newSpan.valueEnd);
  otherLinesUnchanged.forEach((item, i) => {
    if (i === 1) return;
    assert.equal(newItems[i].text, item.text, `line ${i} of the edited block must be byte-identical`);
  });

  ['d2a-hunter-transform', 'd2a-closing-final-line'].forEach((id) => {
    const s = allInlineSpecs().find((x) => x.id === id);
    const before = boss.findInlineArraySpan(original, s.functionName, s.callPattern, s.occurrenceIndex).text;
    const after = boss.findInlineArraySpan(out.fileText, s.functionName, s.callPattern, s.occurrenceIndex).text;
    assert.equal(after, before, `${id} must be untouched by an edit to a different inline block`);
  });
  ['D2A_FARMING_DIALOGUE', 'NARMER_ENCOUNTER_DIALOGUE'].forEach((name) => {
    const before = boss.findVarSpan(original, name).text;
    const after = boss.findVarSpan(out.fileText, name).text;
    assert.equal(after, before, `${name} must be untouched by an inline-block edit`);
  });
});

test('compare-and-swap: a stale/wrong expectedCurrent is refused, file untouched', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const spec = allInlineSpecs().find((s) => s.id === 'd2a-hunter-transform');
  const wrongExpected = [{ who: 'hunter', text: 'this is not what is actually there' }];
  const out = boss.applyInlineDialogueEdit(original, spec, wrongExpected, [{ who: 'hunter', text: 'new text' }]);
  assert.equal(out.fileText, original, 'a refused write must not alter the file at all');
  assert.ok(out.error, 'expected an error for the expectedCurrent mismatch');
  assert.match(out.error, /changed since it was loaded|anchor drifted/);
});

test('add/remove is refused unconditionally on inline blocks, even though none are flagged', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const spec = allInlineSpecs().find((s) => s.id === 'd2a-closing-final-line');
  const preview = owExtract.buildInlineBlockPreview(original, spec);
  const current = preview.extraction.value;

  const withExtra = [...current, { who: 'explorer', text: 'new line' }];
  const outAdd = boss.applyInlineDialogueEdit(original, spec, current, withExtra);
  assert.equal(outAdd.fileText, original);
  assert.ok(outAdd.error);

  const withoutOne = current.slice(1);
  const outRemove = boss.applyInlineDialogueEdit(original, spec, current, withoutOne);
  assert.equal(outRemove.fileText, original);
  assert.ok(outRemove.error);
});

test('a bogus/moved anchor fails clean (not found), never guesses at different content', () => {
  const original = fs.readFileSync(OVERWORLD_ABS, 'utf8');
  const bogusSpec = { functionName: '_thisFunctionDoesNotExist', callPattern: '_runLinesKeepOpen(', occurrenceIndex: 0 };
  const out = boss.applyInlineDialogueEdit(original, bogusSpec, [{ who: 'x', text: 'y' }], [{ who: 'x', text: 'z' }]);
  assert.equal(out.fileText, original);
  assert.match(out.error, /anchor not found/);

  // Same function, but an occurrence index past how many calls it actually has.
  const outOfRange = { functionName: '_d2aClosingSequence', callPattern: '_runLinesKeepOpen(', occurrenceIndex: 99 };
  const out2 = boss.applyInlineDialogueEdit(original, outOfRange, [{ who: 'x', text: 'y' }], [{ who: 'x', text: 'z' }]);
  assert.equal(out2.fileText, original);
  assert.match(out2.error, /anchor not found/);
});

test('inlineBlockSpec resolves known ids and rejects unknown ones', () => {
  assert.ok(owExtract.inlineBlockSpec('d2a-hunter-transform'));
  assert.equal(owExtract.inlineBlockSpec('not-a-real-id'), null);
});

'use strict';

// Phase 2 write-back tests for tools/map-editor/boss-extract.js's
// applyDialogueEdits(). The one hard requirement that gates all of this:
// loading a boss and saving with NO edits must reproduce the file
// byte-for-byte. Everything else (real edits, comment-loss detection,
// multi-var isolation, refusing unsafe writes) is tested against that
// same guarantee — a regenerated array is only allowed to touch bytes
// when the data actually changed.
//
// Run via `npm run test:boss-extract-writeback` (or `node --test test/`).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boss = require('../tools/map-editor/boss-extract.js');

const ROOT = path.resolve(__dirname, '..');

test('no-edit round trip is byte-identical for every editable dialogue array, all 5 bosses', () => {
  Object.keys(boss.BOSS_SOURCES).forEach((key) => {
    const preview = boss.buildBossPreview(key);
    const abs = path.join(ROOT, preview.file);
    const original = fs.readFileSync(abs, 'utf8');

    const edits = Object.keys(preview.dialogue)
      .map((k) => preview.dialogue[k])
      .filter((d) => d.editable)
      .map((d) => ({ varName: d.varName, lines: d.extraction.value }));

    assert.ok(edits.length > 0, `${key} has no editable dialogue arrays — did BOSS_SOURCES change?`);

    const out = boss.applyDialogueEdits(original, edits);
    assert.equal(out.fileText, original, `${key}: no-op save must not change a single byte`);
    assert.ok(out.results.every((r) => r.changed === false), `${key}: no edit should report changed:true`);
    assert.ok(out.results.every((r) => !r.error), `${key}: no-op save should never error: ${JSON.stringify(out.results)}`);
  });
});

test('Hammurabi LOSS_DIALOGUE (apostrophe inside double quotes) round-trips byte-identical', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-hammurabi.js');
  const original = fs.readFileSync(abs, 'utf8');
  const span = boss.findVarSpan(original, 'LOSS_DIALOGUE');
  const current = boss.evalLiteral(span.text);

  // Confirm the apostrophe-in-double-quotes line is actually still there —
  // otherwise this test would pass for the wrong reason if the source ever
  // changes.
  assert.ok(current.some((l) => l.text.includes("I'm kind of on a deadline")),
    'expected line not found — has LOSS_DIALOGUE changed?');

  const out = boss.applyDialogueEdits(original, [{ varName: 'LOSS_DIALOGUE', lines: current }]);
  assert.equal(out.fileText, original, 'naive re-quoting would have broken on this exact line');
});

test('a genuine edit changes only the targeted var, leaves every other byte untouched', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-sargon.js');
  const original = fs.readFileSync(abs, 'utf8');
  const span = boss.findVarSpan(original, 'SARGON_GIANT_WIN_B');
  const current = boss.evalLiteral(span.text);

  const edited = current.map((l, i) => i === 0 ? { who: l.who, text: 'REPLACED LINE' } : l);
  const out = boss.applyDialogueEdits(original, [{ varName: 'SARGON_GIANT_WIN_B', lines: edited }]);

  assert.notEqual(out.fileText, original);
  assert.equal(out.results[0].changed, true);

  // Whole file still has to be valid JS syntax.
  assert.doesNotThrow(() => new Function(out.fileText));

  // The edit landed.
  const newSpan = boss.findVarSpan(out.fileText, 'SARGON_GIANT_WIN_B');
  assert.deepEqual(boss.evalLiteral(newSpan.text), edited);

  // Every OTHER dialogue array in the file is untouched — spot-check a few,
  // including ones that sit both before and after the edited var in the
  // file, to catch an off-by-offset bug in the byte-slicing.
  ['OPENING_DIALOGUE', 'SARGON_SERF_WIN_A', 'LOSS_SMACK', 'SARGON_GIANT_DRAW'].forEach((name) => {
    const before = boss.findVarSpan(original, name).text;
    const after = boss.findVarSpan(out.fileText, name).text;
    assert.equal(after, before, `${name} should be byte-identical after an unrelated edit`);
  });

  // And everything outside ANY dialogue var (the 5 lines around the edited
  // one, e.g.) is untouched too — the whole file minus the one array's
  // value span should be identical.
  const prefix = original.slice(0, span.valueStart);
  const suffix = original.slice(span.valueEnd);
  assert.ok(out.fileText.startsWith(prefix), 'bytes before the edited var must be untouched');
  assert.ok(out.fileText.endsWith(suffix), 'bytes after the edited var must be untouched');
});

test('a same-length text edit preserves a trailing comment (per-line patch, not regeneration)', () => {
  // SARGON_SERF_WIN_A's comment (`// -> [GOLD - 15]`) sits AFTER the last
  // item, outside every line's own {...} span — per-line patching never
  // touches that region at all, so editing any line's text, even the
  // last one, must leave it exactly where it was.
  const abs = path.join(ROOT, 'js/sog-adventure-sargon.js');
  const original = fs.readFileSync(abs, 'utf8');
  const span = boss.findVarSpan(original, 'SARGON_SERF_WIN_A');
  assert.equal(boss.hasComments(span.text), true, 'fixture assumption: this array currently has a comment');
  const current = boss.evalLiteral(span.text);

  const edited = current.map((l, i) => i === 0 ? { who: l.who, text: 'edited' } : l);
  const out = boss.applyDialogueEdits(original, [{ varName: 'SARGON_SERF_WIN_A', lines: edited }]);

  assert.equal(out.results[0].changed, true);
  assert.equal(out.results[0].hadComments, false, 'a same-length patch does not touch the trailing comment');
  const newSpan = boss.findVarSpan(out.fileText, 'SARGON_SERF_WIN_A');
  assert.match(newSpan.text, /GOLD/, 'the reward comment must survive a same-length edit');
});

test('adding a line to a commented array falls back to regeneration and reports the comment loss', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-sargon.js');
  const original = fs.readFileSync(abs, 'utf8');
  const span = boss.findVarSpan(original, 'SARGON_SERF_WIN_A');
  const current = boss.evalLiteral(span.text);

  const withExtra = [...current, { who: 'explorer', text: 'one more line' }];
  const out = boss.applyDialogueEdits(original, [{ varName: 'SARGON_SERF_WIN_A', lines: withExtra }]);

  assert.equal(out.results[0].changed, true);
  assert.equal(out.results[0].hadComments, true, 'a length-changing edit regenerates the whole array, losing the comment');
  const newSpan = boss.findVarSpan(out.fileText, 'SARGON_SERF_WIN_A');
  assert.doesNotMatch(newSpan.text, /GOLD/, 'the reward comment is gone after regeneration');
});

test('multiple vars in one call are each found correctly despite earlier edits shifting offsets', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-narmer.js');
  const original = fs.readFileSync(abs, 'utf8');
  const a = boss.evalLiteral(boss.findVarSpan(original, 'NARMER_SERF_WIN_A').text);
  const b = boss.evalLiteral(boss.findVarSpan(original, 'NARMER_GIANT_DRAW').text);

  const editedA = [{ who: a[0].who, text: 'A CHANGED' }, ...a.slice(1)];
  const editedB = [{ who: b[0].who, text: 'B CHANGED' }, ...b.slice(1)];

  const out = boss.applyDialogueEdits(original, [
    { varName: 'NARMER_SERF_WIN_A', lines: editedA },
    { varName: 'NARMER_GIANT_DRAW', lines: editedB },
  ]);

  assert.ok(out.results.every((r) => r.changed));
  assert.doesNotThrow(() => new Function(out.fileText));
  assert.deepEqual(boss.evalLiteral(boss.findVarSpan(out.fileText, 'NARMER_SERF_WIN_A').text), editedA);
  assert.deepEqual(boss.evalLiteral(boss.findVarSpan(out.fileText, 'NARMER_GIANT_DRAW').text), editedB);
});

test('refuses a genuinely non-plain-literal var (fabricated, since no NAMED dialogue var is impure)', () => {
  // NEB_AI_IDS is a real, plain array — reuse applyDialogueEdits against it
  // is fine for shape purposes, but to hit the impure path we need a var
  // that genuinely isn't a plain literal. There is no NAMED impure dialogue
  // var in the corpus (the one known-impure case, the flood intro, has no
  // name at all — see boss-extract.test.js) — so this just checks the
  // underlying isPlainLiteral guard applyDialogueEdits relies on.
  assert.equal(boss.isPlainLiteral("['a' + 'b']"), false);
});

test('a line with slamBefore/revealBefore is editable: text changes, the flag stays exactly in place', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-hammurabi.js');
  const original = fs.readFileSync(abs, 'utf8');
  const span = boss.findVarSpan(original, 'OPENING_DIALOGUE');
  const current = boss.evalLiteral(span.text);

  assert.equal(current[15].slamBefore, true, 'fixture assumption: line 15 carries slamBefore');
  assert.equal(current[17].revealBefore, true, 'fixture assumption: line 17 carries revealBefore');

  const edited = current.map((l, i) => i === 15 ? { ...l, text: 'EDITED SLAM LINE' } : l);
  const out = boss.applyDialogueEdits(original, [{ varName: 'OPENING_DIALOGUE', lines: edited }]);

  assert.equal(out.results[0].changed, true);
  assert.equal(out.results[0].error, undefined);
  assert.doesNotThrow(() => new Function(out.fileText));

  const newVal = boss.evalLiteral(boss.findVarSpan(out.fileText, 'OPENING_DIALOGUE').text);
  assert.equal(newVal[15].text, 'EDITED SLAM LINE');
  assert.equal(newVal[15].slamBefore, true, 'slamBefore must survive the edit');
  assert.equal(newVal[17].revealBefore, true, 'an untouched flagged line must be completely unaffected');
  // Every OTHER line, flagged or not, must be byte-identical — only line 15
  // changed.
  const oldItems = boss.findObjectItemSpans(original, span.valueStart, span.valueEnd);
  const newSpan = boss.findVarSpan(out.fileText, 'OPENING_DIALOGUE');
  const newItems = boss.findObjectItemSpans(out.fileText, newSpan.valueStart, newSpan.valueEnd);
  oldItems.forEach((item, i) => {
    if (i === 15) return;
    assert.equal(newItems[i].text, item.text, `line ${i} must be byte-identical`);
  });
});

test('no-edit save on a flagged array (Hammurabi opening) is byte-identical, not refused', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-hammurabi.js');
  const original = fs.readFileSync(abs, 'utf8');
  const current = boss.evalLiteral(boss.findVarSpan(original, 'OPENING_DIALOGUE').text);
  const out = boss.applyDialogueEdits(original, [{ varName: 'OPENING_DIALOGUE', lines: current }]);
  assert.equal(out.fileText, original);
  assert.equal(out.results[0].changed, false);
  assert.equal(out.results[0].error, undefined);
});

test('refuses to add or remove a line on a flagged array, leaves the file untouched', () => {
  const abs = path.join(ROOT, 'js/sog-adventure-hammurabi.js');
  const original = fs.readFileSync(abs, 'utf8');
  const current = boss.evalLiteral(boss.findVarSpan(original, 'OPENING_DIALOGUE').text);

  const withExtra = [...current, { who: 'explorer', text: 'new line' }];
  const outAdd = boss.applyDialogueEdits(original, [{ varName: 'OPENING_DIALOGUE', lines: withExtra }]);
  assert.equal(outAdd.fileText, original, 'a refused add must not alter the file at all');
  assert.ok(outAdd.results[0].error);

  const withoutOne = current.slice(1);
  const outRemove = boss.applyDialogueEdits(original, [{ varName: 'OPENING_DIALOGUE', lines: withoutOne }]);
  assert.equal(outRemove.fileText, original, 'a refused remove must not alter the file at all');
  assert.ok(outRemove.results[0].error);
});

test('dialogueEditability reports Hammurabi opening as editable with lineOpsBlocked', () => {
  const p = boss.buildBossPreview('hammurabi');
  const gate = p.dialogue.opening;
  assert.equal(gate.editable, true);
  assert.equal(gate.lineOpsBlocked, true);
  assert.match(gate.lineOpsBlockedReason, /slamBefore/);
});

test('dialogueEditability blocks a sameAs entry with a clear reason', () => {
  const gate = boss.dialogueEditability({ present: true, sharedWith: 'LOSS_SMACK', note: 'x' });
  assert.equal(gate.editable, false);
  assert.match(gate.reason, /LOSS_SMACK/);
});

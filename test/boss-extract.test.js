'use strict';

// Purity-detector regression test for the level editor's boss preview
// (Phase 1) and dialogue write-back (Phase 2) — see tools/map-editor/
// boss-extract.js. Zero dependencies, same as the module under test; run
// via `npm run test:boss-extract` (or `node --test test/`).
//
// The one thing this file exists to prove: isPlainLiteral() actually
// FLAGS a genuinely dynamic dialogue array, not just that it correctly
// clears plain ones. A detector that never fires looks identical to a
// broken one from the "0 impure found" report alone — this pins a known
// real case (Nebuchadnezzar's flood-intro line, sog-adventure-
// hanginggardens.js's _runFloodIntro) so a future change to the purity
// regex can't silently stop catching it.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boss = require('../tools/map-editor/boss-extract.js');

const HG_FILE = path.resolve(__dirname, '../js/sog-adventure-hanginggardens.js');
const SARGON_FILE = path.resolve(__dirname, '../js/sog-adventure-sargon.js');

// Bracket-matches the array literal passed to runLines(...) inside
// _runFloodIntro, the same way boss-extract's own (unexported) _bracketSpan
// would — walking the SOURCE FILE rather than hand-retyping the array, so
// this test can't drift from the real bytes as the file is edited.
function extractRunLinesArg(src, afterMarker) {
  const fnStart = src.indexOf(afterMarker);
  assert.ok(fnStart !== -1, `marker "${afterMarker}" not found — has the file moved?`);
  const callIdx = src.indexOf('runLines([', fnStart);
  assert.ok(callIdx !== -1, 'runLines([ call not found after marker');
  const valueStart = callIdx + 'runLines('.length;
  assert.equal(src[valueStart], '[', 'expected the call arg to start with [');

  let depth = 0, i = valueStart, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.equal(depth, 0, 'unterminated array — bracket matching failed');
  return src.slice(valueStart, i);
}

test('isPlainLiteral flags the known string-concatenation dialogue line (flood intro)', () => {
  const src = fs.readFileSync(HG_FILE, 'utf8');
  const text = extractRunLinesArg(src, '_runFloodIntro');

  assert.match(text, /'The '\s*\+\s*river\s*\+\s*' flooded\.'/,
    'sanity check that we grabbed the right span — has the flood line changed?');
  assert.equal(boss.isPlainLiteral(text), false,
    'a string-concatenated dialogue line must be flagged impure');

  // It's not just impure — it's also unevaluable in isolation, since `river`
  // is a free variable from the enclosing function, not a literal. Belt and
  // braces: Phase 2 must never write this out even if isPlainLiteral alone
  // had a blind spot, because eval fails too.
  assert.throws(() => boss.evalLiteral(text), /river is not defined/);
});

test('isPlainLiteral does not false-positive on a real plain dialogue array', () => {
  const src = fs.readFileSync(SARGON_FILE, 'utf8');
  const span = boss.findVarSpan(src, 'OPENING_DIALOGUE');
  assert.ok(span, 'OPENING_DIALOGUE not found — has Sargon\'s file moved?');
  assert.equal(boss.isPlainLiteral(span.text), true,
    'a real, plain {who,text} dialogue array must not be flagged impure');
});

test('isPlainLiteral rejects an identifier used as a value (not just concatenation)', () => {
  // Narmer's location ids are `id: LOC_LOWER_EGYPT` — a named constant, not
  // a numeric literal. Covers the "identifier-as-value" impurity path,
  // distinct from the "+" concatenation path above.
  assert.equal(boss.isPlainLiteral("[{ id: LOC_LOWER_EGYPT, name: 'Lower Egypt' }]"), false);
});

test('isPlainLiteral accepts true/false/null and numbers alongside strings', () => {
  assert.equal(boss.isPlainLiteral("[{ who: 'a', text: 'b', slamBefore: true, x: null, n: -3.5 }]"), true);
});

// findUnregisteredBossFiles() regression guard — this is the check that
// would have caught Hatshepsut (and otzi/prehistory) automatically: every
// js/sog-adventure-*.js file that calls SOG.BattleHooks.register(...) but
// never appears as a BOSS_SOURCES[key].file value is a real battle the
// Level Editor can't show dialogue for. Asserting it's currently empty
// means the registry and the filesystem agree RIGHT NOW — the guard rail
// is this test going red the next time they don't, not a synthetic replay
// of the bug that's already fixed.
test('every js/sog-adventure-*.js file that registers a BattleHooks key is in BOSS_SOURCES', () => {
  const gaps = boss.findUnregisteredBossFiles();
  assert.deepEqual(gaps, [], `unregistered boss file(s): ${JSON.stringify(gaps)}`);
});

test('findUnregisteredBossFiles ignores non-battle sog-adventure-*.js files (no BattleHooks.register at all)', () => {
  // sog-adventure-hud.js (SOG.HUD) and sog-adventure-egypt.js (SOG.Egypt,
  // a placeholder screen) both exist and match the filename pattern but
  // register nothing — confirms the scan doesn't flag every file in the
  // directory, only ones that actually register a battle.
  const gaps = boss.findUnregisteredBossFiles();
  const flaggedFiles = gaps.map((g) => g.file);
  assert.ok(!flaggedFiles.includes('js/sog-adventure-hud.js'));
  assert.ok(!flaggedFiles.includes('js/sog-adventure-egypt.js'));
});

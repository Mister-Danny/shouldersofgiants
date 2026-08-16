'use strict';

// Tests for tools/map-editor/wired-nodes-extract.js — the scanner that
// replaced the hand-maintained WIRED_NODES Set in map/inspector.js. That
// Set drifted from onNodeClick once already (a real dispatch branch —
// Hatshepsut's, in reverse: a node that had NO branch was never removed
// from consideration until this was noticed by hand). These tests exist
// so a future drift shows up as a failing test, not a support ticket.
//
// Run via `node --test test/` (or add an npm script alongside the other
// two extractors).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wn = require('../tools/map-editor/wired-nodes-extract.js');
const boss = require('../tools/map-editor/boss-extract.js');   // findFunctionBodySpan is reused directly, not reimplemented

const ROOT = path.resolve(__dirname, '..');
const OVERWORLD_ABS = path.join(ROOT, 'js', 'overworld.js');

test('scans the real onNodeClick and finds exactly the known 9 dispatch ids', () => {
  const result = wn.scanWiredNodeIds();
  assert.equal(result.found, true);
  const expected = [
    'walls-of-uruk', 'market', 'egypt-market', 'sargon',
    'hammurabi', 'hanging-gardens', 'narmer', 'prehistory', 'egypt-signpost'
  ];
  assert.deepEqual([...result.ids].sort(), [...expected].sort());
  assert.equal(new Set(result.ids).size, result.ids.length, 'no duplicates');
});

test('scoped to onNodeClick\'s own body — a node.id === literal OUTSIDE it is never picked up', () => {
  // Synthetic source: one real-shaped onNodeClick with a single branch,
  // plus a decoy comparison in a sibling function that must NOT leak in.
  // Proves the scoping (findFunctionBodySpan first, regex second), not
  // just today's coincidental absence of stray matches in the real file.
  const fakeSrc = [
    "function unrelatedHelper(node) {",
    "  if (node.id === 'DECOY-outside-onNodeClick') return true;",
    "}",
    "function onNodeClick(node) {",
    "  if (node.id === 'sargon' && currentMapId === 'mesopotamia') { doThing(); }",
    "  if (node.id === 'market') { doOther(); }",
    "}",
  ].join('\n');
  const body = boss.findFunctionBodySpan(fakeSrc, 'onNodeClick');
  const re = /\bnode\.id\s*===\s*'([^']+)'/g;
  const ids = [];
  let m;
  while ((m = re.exec(body.text))) ids.push(m[1]);
  assert.deepEqual(ids, ['sargon', 'market']);
  assert.ok(!ids.includes('DECOY-outside-onNodeClick'), 'decoy in a sibling function must not appear');
});

test('a duplicate node.id === literal within onNodeClick is de-duplicated', () => {
  const fakeSrc = [
    "function onNodeClick(node) {",
    "  if (node.id === 'prehistory' && !seen) { first(); }",
    "  if (node.id === 'prehistory') { second(); }",
    "}",
  ].join('\n');
  const body = boss.findFunctionBodySpan(fakeSrc, 'onNodeClick');
  const re = /\bnode\.id\s*===\s*'([^']+)'/g;
  const ids = [];
  let m;
  while ((m = re.exec(body.text))) { if (!ids.includes(m[1])) ids.push(m[1]); }
  assert.deepEqual(ids, ['prehistory']);
});

test('missing onNodeClick reports found:false rather than throwing', () => {
  // Exercises the same failure path scanWiredNodeIds() takes if
  // js/overworld.js is ever renamed or the function itself renamed —
  // graceful, not a crash that takes down the whole /api/level-meta payload.
  const body = boss.findFunctionBodySpan('var x = 1;', 'onNodeClick');
  assert.equal(body, null);
});

test('the real js/overworld.js file exists at the path this module reads', () => {
  // Guards against the module's own path resolution silently drifting.
  assert.ok(fs.existsSync(OVERWORLD_ABS));
});

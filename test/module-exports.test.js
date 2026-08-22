'use strict';

// Guards the IIFE modules against exporting a symbol that no longer exists.
//
// This exists because it actually happened: an edit to js/game/reveal-fx.js
// removed rosettaTranscribe while leaving it listed in the module's export
// object. `node --check` passed — the file was syntactically valid — but the
// IIFE threw ReferenceError on load, SOG.RevealFx stayed undefined, and EVERY
// reveal animation in the game silently died. Nothing surfaced it until a
// browser console was read by hand.
//
// reveal-fx.js in particular is a growing hotspot: it is edited per-card, its
// export list is long, and the functions sit far from the list that names them,
// so a block edit can take one out without touching the other. Same shape of
// risk in the sibling modules, which is why all of them are scanned.
//
// Deliberately narrow: it does NOT type-check, lint, or verify behaviour. It
// answers exactly one question — "is every exported name defined in this
// file?" — which is the question that broke.
//
// Run via `node --test test/`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* The IIFE modules that expose an object of NAMED functions — i.e. the ones
   where the definition and the export list are far apart and can drift.
   js/animations.js is deliberately NOT here: Anim defines its methods inline in
   the object literal (`name: function () {...}`), so a method cannot be deleted
   while still being exported. It has no exposure to this failure mode. */
const MODULES = [
  'js/game/reveal-fx.js',
  'js/game/abilities.js',
  'js/game/board.js',
  'js/game/ui.js',
  'js/game/input.js',
];

/* The export object is either `return { ... }` (module returns it) or
   `SOG.thing = { ... }` / `var Anim = { ... }` (module assigns it). Take the
   LAST such block in the file: that is the export list, not some intermediate
   object literal earlier in the body. */
function findExportBlock(src) {
  const starts = [];
  const patterns = [/\n\s*return\s*\{/g, /\n\s*(?:SOG\.\w+|var\s+\w+)\s*=\s*\{/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].lastIndexOf('{'));
  }
  if (!starts.length) return null;
  const open = Math.max(...starts);

  // Walk to the matching close brace so nested objects don't truncate the block.
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return src.slice(open);
}

/* `key: identifier` pairs only. Shorthand values that are calls, literals,
   member expressions or inline functions are not names this test can resolve,
   and are not what broke — so they are skipped rather than guessed at. */
function exportedIdentifiers(block) {
  const out = [];
  const re = /(\w+)\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const value = m[2];
    if (['true', 'false', 'null', 'undefined'].includes(value)) continue;
    out.push({ key: m[1], value });
  }
  return out;
}

function definedNames(src) {
  const names = new Set();
  for (const re of [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,          // function decls
    /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g,  // assigned bindings
  ]) {
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return names;
}

for (const rel of MODULES) {
  test(`${rel} exports only symbols it defines`, () => {
    const abs = path.join(ROOT, rel);
    const src = fs.readFileSync(abs, 'utf8');

    const block = findExportBlock(src);
    assert.ok(block, `${rel}: could not locate an export object — has the module shape changed?`);

    const exported = exportedIdentifiers(block);
    assert.ok(exported.length > 0, `${rel}: found an export object but no name: name pairs in it`);

    const defined = definedNames(src);
    const missing = exported.filter(e => !defined.has(e.value));

    assert.deepEqual(
      missing.map(e => `${e.key}: ${e.value}`),
      [],
      `${rel} exports ${missing.length} symbol(s) with no definition in the file. ` +
      `The module will throw ReferenceError on load and its global will be undefined.`
    );
  });
}

// The guard is only worth having if it actually fires, so prove it does.
test('the check detects a deleted definition', () => {
  const src = [
    'var M = (function () {',
    '  function alpha() {}',
    '  function beta() {}',
    '  return { alpha: alpha, beta: beta, gamma: gamma };',
    '})();',
  ].join('\n');

  const block = findExportBlock(src);
  const exported = exportedIdentifiers(block);
  const defined = definedNames(src);
  const missing = exported.filter(e => !defined.has(e.value)).map(e => e.value);

  assert.deepEqual(missing, ['gamma'], 'should flag the exported-but-undefined symbol');
});

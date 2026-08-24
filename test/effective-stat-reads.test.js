'use strict';

// Guards against a recurring bug class: ability and scorer code COMPARING a card
// DEFINITION's ip/cc where the system's truth is an effective value.
//
// The three sources of truth:
//   hand cards            handStats(owner, cardId)      -> {ip, cc}
//   board cards           effectiveIP(sd) / effectiveCC(sd)
//   discarded/destroyed   the frozen pile entry {cardId, ip, cc}
//
// Definitions diverge from those constantly. CC: prehistoryMode, the Levant's
// Religious discount, Kente's Cultural, Henry's Exploration, and the
// Nebuchadnezzar / Ramses in-hand stamps. Hand IP: cardIPBonus (Cuneiform,
// resurrection), copyIPBonus (Papyrus), William's destroyed total. Board IP:
// ipMod + contMod + locationBoosts. Mummy CC: the inherited sd.cc.
//
// This class bit ten times before it was swept: Ra's gain and selection, the moved
// Mummy's CC badge, Book's qualification, Priest's and Francis's discards, and the
// Book / Papyrus / Narmer / Serf-Giant scorers. Every instance was a COMPARISON or a
// VALUATION over a card already in a hand, on a board, or in a pile — never a
// construction. Writing `ip: card.ip` into a new slot record is correct by design:
// sd.ip is the immutable printed base and buffs live in sd.ipMod beside it.
//
// So this flags definition reads used in COMPARISONS, and allowlists the sites where
// the definition genuinely is the right answer.
//
// KNOWN BLIND SPOTS, stated so nobody mistakes a green run for proof:
//   - arithmetic valuations (`s = c.ip - c.cc * 0.1`) are the same class but are not
//     matched; catching them needs enough allowlisting to drown the signal. Two such
//     sites were found by hand in Narmer's scorer and fixed alongside this test.
//   - a definition value laundered through a variable before the comparison.
//   - `c` is also used for pile ENTRIES, which carry frozen stats and are correct;
//     one such line is allowlisted below.
// It catches the shape that actually recurred, which is worth having even though it
// is not a proof of absence. On its first run it found two live instances a careful
// manual pass over the same files had missed.
//
// Run via `node --test test/*.test.js`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'js/game/abilities.js',
  'js/game/ai.js',
  'js/sog-adventure-narmer.js',
  'js/sog-adventure-hyksos.js',
  'js/sog-adventure-hatshepsut.js',
  'js/sog-adventure-gilgamesh.js',
  'js/sog-adventure-hanginggardens.js',
  'js/sog-adventure-sargon.js',
  'js/sog-adventure-hammurabi.js',
];

/* Sites where the DEFINITION is the correct read. Each entry is an exact source
   substring plus the reason it is exempt — a bare line number would rot on the next
   edit, and a bare regex would silently widen. Keep the reasons: they are the record
   of why this is not a bug, for the next person who greps for `.cc <`. */
const ALLOW = [
  { needle: 'return c ? c.cc : 0;',
    why: 'effectiveCC IS the source of truth; falls back to the definition only when sd.cc is unset' },
  { needle: 'ip = c ? c.ip : 0;',
    why: 'resurrectionIP documented fallback when no frozen baseIP is supplied' },
  { needle: 'var frozenIP = (ip != null) ? ip : (src ? src.ip : 0);',
    why: 'createMummy falls back to the definition only when the caller passes no snapshot' },
  { needle: 'var frozenCC = (cc != null) ? cc : (src ? src.cc : 0);',
    why: 'createMummy CC, same documented fallback' },
  { needle: 'sd && sd.cc != null && sd.cc !== card.cc',
    why: '_faceCard compares AGAINST the definition on purpose, to detect an inherited sd.cc' },
  { needle: "(frozenCC != null && frozenCC !== c.cc)",
    why: 'wrapSourceFace, same deliberate comparison against the definition' },
  { needle: 'var cost = card.cc;',
    why: 'effectiveCost itself — card.cc is the INPUT being discounted' },
  { needle: 'if (card.cc === 5 &&',
    why: 'effectiveCost internals: a printed-cost rule, deliberately pre-discount' },
  { needle: 'ccEl.textContent = (stats && stats.cc != null) ? stats.cc : card.cc;',
    why: 'display, prefers the snapshot and falls back only when absent' },
  { needle: 'ipEl.textContent = (stats && stats.ip != null) ? stats.ip : (card.ip + bonus);',
    why: 'display, same preference order' },
  { needle: 'ip: c.ip + bonus + copy,',
    why: 'handStats itself — this is where effective hand IP is DEFINED' },
  { needle: 'if (resurrectionIP(c.cardId, c.ip) > resurrectionIP(best.cardId, best.ip))',
    why: 'priestCandidates entries carry FROZEN pile stats; `c` here is an entry, not a definition' },
];

/* A definition read: `<obj>.ip` / `<obj>.cc` where <obj> is a card-definition-shaped
   local. Slot data is `s`/`sd`/`x`, and pile entries are `e`/`entry` — those carry
   frozen or live values and are not this class. */
const DEF_OBJ = String.raw`(?:c|cc|dc|card|cd|def|src|_c)`;
const DEF_READ = new RegExp(String.raw`\b${DEF_OBJ}\.(?:ip|cc)\b`);

/* Comparison / valuation context — the shape that recurred: a definition read used
   to ORDER or EQUATE cards. Two shapes are deliberately NOT matched, because both are
   correct by design and appear dozens of times:
     - construction   `ip: card.ip`        sd.ip is meant to be the printed base
     - ternary fallback `x ? x.cc : card.cc`  reaches for the definition only when the
                                             effective value is unavailable
   Matching either would bury the real signal in noise nobody would read. */
const COMPARISON = /[<>]=?|===|!==|Math\.(?:max|min)\s*\(/;

function scan(src) {
  const hits = [];
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');            // ignore trailing comments
    if (!DEF_READ.test(code)) return;
    if (!COMPARISON.test(code)) return;                  // construction, not comparison
    if (ALLOW.some(a => line.includes(a.needle))) return;
    hits.push({ line: i + 1, text: line.trim() });
  });
  return hits;
}

for (const rel of FILES) {
  test(`${rel} compares effective values, not card definitions`, () => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;                     // boss file removed — not this test's business
    const hits = scan(fs.readFileSync(abs, 'utf8'));

    assert.deepEqual(
      hits.map(h => `${rel}:${h.line}  ${h.text}`),
      [],
      `${rel}: card-definition ip/cc used in a comparison. Hand cards must read ` +
      `handStats(owner, id), board cards effectiveIP/effectiveCC, and discarded or ` +
      `destroyed cards their frozen pile entry. If the definition really is correct ` +
      `here, add the line to ALLOW in this test with the reason.`
    );
  });
}

// The guard is only worth having if it fires, so prove both halves.
test('flags a definition comparison and ignores a construction', () => {
  const bad = 'if (c && c.cc < lowestCC) { lowestCC = c.cc; }';
  const ok  = 'var sd = { cardId: cardId, ip: card.ip, ipMod: resBonus };';

  assert.equal(scan(bad).length, 1, 'should flag a definition read inside a comparison');
  assert.equal(scan(ok).length, 0, 'should NOT flag writing the printed base into a new slot record');
});

test('respects the allowlist', () => {
  assert.equal(scan('    return c ? c.cc : 0;').length, 0, 'allowlisted effectiveCC fallback stays quiet');
});

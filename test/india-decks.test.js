'use strict';
/* India cards + decks: the CSV, js/cards.js, data/india-decks.js and the art on
   disk must all agree. Loud failures here are the point — a deck that is not
   exactly 15 slots, a card without art, or art without a card is a data bug. */
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function load() {
  const window = {};
  const ctx = { window, SOG: {}, console };
  vm.runInNewContext(read('js/cards.js') + ';globalThis.CARDS = CARDS', ctx);
  vm.runInNewContext(read('data/india-decks.js'), ctx);
  return { CARDS: ctx.CARDS, DECKS: window.SOG_INDIA_DECKS };
}

// Minimal CSV reader (quoted fields, no embedded newlines — true of india_cards.csv).
function readCsv(p) {
  const text = read(p).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const parse = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const head = parse(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}

const INDIA = (c) => /^images\/cards\/india\//.test(c.image);

test('every India deck is exactly 15 slots of real, non-token cards', () => {
  const { CARDS, DECKS } = load();
  assert.deepEqual(Object.keys(DECKS).sort(), ['gupta', 'priest_king', 'siddhartha']);
  for (const [name, d] of Object.entries(DECKS)) {
    assert.equal(d.ids.length, 15, `${name} has ${d.ids.length} slots`);
    for (const id of d.ids) {
      const c = CARDS.find((x) => x.id === id);
      assert.ok(c, `${name} lists unknown id ${id}`);
      assert.ok(!c.token, `${name} lists token ${c.name}`);
      assert.ok(INDIA(c), `${name} lists a non-India card ${c.name}`);
    }
    assert.ok(d.ids.includes(d.giantWinCardId), `${name}: Giant-win card not in deck`);
  }
});

test('cards.js matches india_cards.csv row for row', () => {
  if (!fs.existsSync(path.join(ROOT, 'india_cards.csv'))) return;   // CSV is a working file, not shipped
  const { CARDS } = load();
  const rows = readCsv('india_cards.csv');
  const india = CARDS.filter(INDIA);
  assert.equal(india.length, rows.length);
  rows.forEach((r) => {
    const c = india.find((x) => x.image === `images/cards/india/${r.card_id}.jpg`);
    assert.ok(c, `no card for ${r.card_id}`);
    assert.equal(c.name, r.card_name, r.card_id);
    assert.equal(String(c.cc), r.cc, `${r.card_id} cc`);
    assert.equal(String(c.ip), r.ip, `${r.card_id} ip`);
    assert.equal(c.type, r.primary_type, `${r.card_id} type`);
    assert.equal(c.era, r.era, `${r.card_id} era`);
    assert.equal(c.type2, null, `${r.card_id} type2`);
    assert.equal(!!c.token, r.copies === '0' && !r.decks, `${r.card_id} token`);
  });
});

test('the deck lists follow the CSV decks/copies columns', () => {
  if (!fs.existsSync(path.join(ROOT, 'india_cards.csv'))) return;
  const { CARDS, DECKS } = load();
  const rows = readCsv('india_cards.csv');
  const idOf = (cid) => CARDS.find((x) => x.image === `images/cards/india/${cid}.jpg`).id;
  const want = {};
  rows.forEach((r) => r.decks.split('|').filter(Boolean).forEach((d) => {
    want[d] = want[d] || [];
    for (let i = 0; i < Number(r.copies); i++) want[d].push(idOf(r.card_id));
  }));
  // [...ids] copies the vm-realm array into this realm; strict deepEqual also compares prototypes.
  for (const [name, ids] of Object.entries(want)) assert.deepEqual([...DECKS[name].ids], ids, name);
});

test('every India card has both JPG sizes on disk, and every India JPG has a card', () => {
  const { CARDS } = load();
  const dir = path.join(ROOT, 'images', 'cards', 'india');
  const files = fs.readdirSync(dir);
  const india = CARDS.filter(INDIA);
  india.forEach((c) => {
    const base = path.basename(c.image, '.jpg');
    assert.ok(files.includes(base + '.jpg'), `${c.name}: missing large art`);
    assert.ok(files.includes(base + '@sm.jpg'), `${c.name}: missing small art`);
  });
  const stems = files.filter((f) => /\.jpg$/.test(f) && !/@sm\.jpg$/.test(f)).map((f) => f.replace(/\.jpg$/, ''));
  const orphans = stems.filter((s) => !india.some((c) => c.image === `images/cards/india/${s}.jpg`));
  assert.deepEqual(orphans, ['india_citadel'], 'India art with no card definition (only india_citadel is known)');
});

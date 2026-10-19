'use strict';
/* The /learn/ pages are generated (tools/build-learn-pages.js) from
   data/learn-content.md and js/cards.js, and committed. These tests fail when a
   card's name, cost, IP or ability changes, or the content changes, without a
   rebuild — run `npm run build:learn` — and check what search engines read. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../tools/build-learn-pages.js');

const ROOT = path.resolve(__dirname, '..');
const r = build();
const pages = [...r.files.keys()].filter((f) => f.endsWith('index.html'));
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('content validates against the card data', () => {
  assert.deepEqual(r.errors, []);
  assert.equal(pages.length, 1 + r.content.eras.length + r.content.cards.length);
});

test('committed pages and sitemap match a fresh build', () => {
  for (const [f, body] of r.files) {
    const abs = path.join(ROOT, f);
    assert.ok(fs.existsSync(abs), f + ' is missing — run npm run build:learn');
    assert.ok(fs.readFileSync(abs, 'utf8') === body, f + ' is stale — run npm run build:learn');
  }
  for (const im of r.images) assert.ok(fs.existsSync(path.join(ROOT, im.dest)), im.dest + ' is missing — run npm run build:learn');
});

test('every page: one h1, canonical, title and description lengths, parsable structured data', () => {
  for (const f of pages) {
    const html = r.files.get(f);
    const url = '/' + f.replace(/index\.html$/, '');
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, f);
    assert.match(html, new RegExp('<link rel="canonical" href="https://playshouldersofgiants\\.com' + url.replace(/[/.-]/g, '\\$&') + '">'), f);
    const title = unescape(html.match(/<title>([^<]*)<\/title>/)[1]);
    assert.ok(title.length < 60, f + ' title ' + title.length);
    const desc = unescape(html.match(/<meta name="description" content="([^"]*)">/)[1]);
    assert.ok(desc.length <= 160, f + ' description ' + desc.length);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const types = ld['@graph'].map((n) => n['@type']);
    assert.ok(types.includes('BreadcrumbList'), f);
    if (url !== '/learn/') assert.ok(types.includes('LearningResource'), f);
  }
});

test('internal links and images resolve; only the pilot cards are linked', () => {
  const pilotUrls = new Set(r.content.cards.map((c) => c.url));
  for (const f of pages) {
    const html = r.files.get(f);
    for (const [, href] of html.matchAll(/href="(\/learn\/[^"#]*)"/g)) {
      assert.ok(r.files.has(href.slice(1) + 'index.html'), f + ' links to ' + href);
      if (href.split('/').length === 5) assert.ok(pilotUrls.has(href), f + ' links a card with no page: ' + href);
    }
    for (const [, src] of html.matchAll(/src="(\/images\/[^"]*)"/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, decodeURI(src))), f + ' image ' + src);
    }
  }
});

test('the sitemap lists every /learn/ page once', () => {
  const sm = r.files.get('sitemap.xml');
  for (const f of pages) {
    const loc = '<loc>https://playshouldersofgiants.com/' + f.replace(/index\.html$/, '') + '</loc>';
    assert.equal(sm.split(loc).length - 1, 1, loc);
  }
});

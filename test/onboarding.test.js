'use strict';

// Pure helpers behind teacher/student onboarding: the ?teacher=1 link, the
// login-card fragment, the projector's "go to <site>", and the QR encoder.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const onboard = require('../js/teacher-onboard.js');
const QR = require('../js/qr.js');

// js/account.js is a browser IIFE; its pure parsers are pulled out with a
// minimal window shim (no Firebase calls happen at load).
const account = new Function('window', 'firebase', fs.readFileSync(path.resolve(__dirname, '../js/account.js'), 'utf8') + '\n;return window.SogAccount;')({}, {});

test('teacher link: ?teacher=1 with a sanitized src tag', () => {
  assert.deepEqual(onboard.parseTeacherLink('?teacher=1&src=newsletter-oct'), { teacher: true, src: 'newsletter-oct' });
  assert.deepEqual(onboard.parseTeacherLink('?src=x&teacher=true'), { teacher: true, src: 'x' });
  assert.deepEqual(onboard.parseTeacherLink('?teacher=1&src=<script>alert(1)</script>'), { teacher: true, src: 'scriptalert1script' });
  assert.equal(onboard.parseTeacherLink('?teacher=1&src=' + 'a'.repeat(80)).src.length, 40);
  assert.deepEqual(onboard.parseTeacherLink('?teacher=0&src=x'), { teacher: false, src: '' });
  assert.deepEqual(onboard.parseTeacherLink('?join=ABC123'), { teacher: false, src: '' });
  assert.deepEqual(onboard.parseTeacherLink(''), { teacher: false, src: '' });
});

test('teacher params are stripped from the URL, anything else is kept', () => {
  assert.equal(onboard.stripTeacherParams('?teacher=1&src=x'), '');
  assert.equal(onboard.stripTeacherParams('?emulator=1&teacher=1&src=x'), '?emulator=1');
  assert.equal(onboard.stripTeacherParams('?a=1&teacher=1&b=2'), '?a=1&b=2');
});

test('projector "go to" label: host + path, no scheme, no index.html', () => {
  assert.equal(onboard.siteLabel('https://mister-danny.github.io', '/shouldersofgiants/'), 'mister-danny.github.io/shouldersofgiants');
  assert.equal(onboard.siteLabel('https://mister-danny.github.io', '/shouldersofgiants/index.html'), 'mister-danny.github.io/shouldersofgiants');
  assert.equal(onboard.siteLabel('https://playshouldersofgiants.com', '/'), 'playshouldersofgiants.com');
  assert.equal(onboard.siteLabel('https://playshouldersofgiants.com', '/index.html'), 'playshouldersofgiants.com');
  assert.equal(onboard.siteLabel('http://localhost:8750', '/'), 'localhost:8750');
});

test('class join links build from the page address, whatever the domain', () => {
  const doc = { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] };
  const tdAt = (origin, pathname) => new Function('window', 'firebase', 'document', 'location',
    fs.readFileSync(path.resolve(__dirname, '../js/teacher-dashboard.js'), 'utf8') + '\n;return window.TeacherDashboard;')(
    {}, {}, doc, { hostname: new URL(origin).hostname, protocol: 'https:', origin, pathname });
  assert.equal(tdAt('https://playshouldersofgiants.com', '/').joinLinkFor('PX8A4P'), 'https://playshouldersofgiants.com/?join=PX8A4P');
  assert.equal(tdAt('https://mister-danny.github.io', '/shouldersofgiants/').joinLinkFor('PX8A4P'), 'https://mister-danny.github.io/shouldersofgiants/?join=PX8A4P');
});

test('login-card fragment round-trips and rejects anything else', () => {
  const frag = account.loginFragmentFor('IsabellaTheBoundless6', 'cometTiger43');
  assert.equal(frag, '#login=isabellatheboundless6.comettiger43');
  assert.deepEqual(account.parseLoginFragment(frag), { username: 'isabellatheboundless6', passphrase: 'comettiger43' });
  assert.equal(account.parseLoginFragment('#login=a.b'), null, 'too short');
  assert.equal(account.parseLoginFragment('#login=bad name.pass1234'), null);
  assert.equal(account.parseLoginFragment('#join=ABC123'), null);
  assert.equal(account.parseLoginFragment(''), null);
});

test('QR: version grows with length, finder patterns in place, error correction matches a known vector', () => {
  const m1 = QR.matrix('HELLO', 'M');
  assert.equal(m1.length, 21);
  const finderOk = (m, x, y) => [0, 1, 2, 3, 4, 5, 6].every(i => m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]);
  assert.ok(finderOk(m1, 0, 0) && finderOk(m1, 14, 0) && finderOk(m1, 0, 14));
  const link = 'https://mister-danny.github.io/shouldersofgiants/#login=isabellatheboundless6.comettiger43';
  assert.equal(QR.matrix(link, 'M').length, 41, 'version 6 for a login-card link');
  // ISO 18004 Annex I worked example ("01234567", 1-M): its 10 EC codewords.
  const data = [0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11];
  assert.deepEqual(QR._rsRemainder(data, 10), [0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55]);
  assert.match(QR.svg('x'), /^<svg [^>]*viewBox="0 0 29 29"/);
  assert.throws(() => QR.matrix('x'.repeat(500), 'M'), /too long/);
});

/**
 * qr.js — a small QR Code encoder (byte mode, versions 1–15, error correction
 * L or M), so class links and login cards can carry a scannable code without
 * a third-party library or a network call. Follows ISO/IEC 18004 the same way
 * Project Nayuki's reference encoder does (finder/alignment/timing patterns,
 * Reed–Solomon over GF(256) with 0x11D, the eight masks, penalty-scored mask
 * choice). Output is checked by test/qr.test.js and, during development, by
 * decoding with a real QR reader.
 *
 * Exposes window.SOG.QR = { matrix(text, ecl) → boolean[][], svg(text, opts) }.
 */
(function (root) {
  'use strict';

  // [eccPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] by version, per level.
  var EC = {
    L: [null, [7,1,19,0,0], [10,1,34,0,0], [15,1,55,0,0], [20,1,80,0,0], [26,1,108,0,0], [18,2,68,0,0],
        [20,2,78,0,0], [24,2,97,0,0], [30,2,116,0,0], [18,2,68,2,69], [20,4,81,0,0], [24,2,92,2,93],
        [26,4,107,0,0], [30,3,115,1,116], [22,5,87,1,88]],
    M: [null, [10,1,16,0,0], [16,1,28,0,0], [26,1,44,0,0], [18,2,32,0,0], [24,2,43,0,0], [16,4,27,0,0],
        [18,4,31,0,0], [22,2,38,2,39], [22,3,36,2,37], [26,4,43,1,44], [30,1,50,4,51], [22,6,36,2,37],
        [22,8,37,1,38], [24,4,40,5,41], [24,5,41,5,42]]
  };
  var FORMAT_BITS = { L: 1, M: 0 };
  var ALIGN = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46],
               [6,28,50], [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70]];

  // GF(256) tables, primitive polynomial 0x11D.
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenerator(degree) {
    var g = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gmul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;   // g[0] = 1 (highest power first)
  }
  function rsRemainder(data, degree) {
    var gen = rsGenerator(degree), rem = new Array(degree).fill(0);
    data.forEach(function (b) {
      var factor = b ^ rem[0];
      rem.shift(); rem.push(0);
      for (var i = 0; i < degree; i++) rem[i] ^= gmul(gen[i + 1], factor);
    });
    return rem;
  }

  function utf8Bytes(s) {
    var out = [];
    var enc = unescape(encodeURIComponent(String(s)));
    for (var i = 0; i < enc.length; i++) out.push(enc.charCodeAt(i));
    return out;
  }

  function dataCapacity(ver, ecl) {
    var e = EC[ecl][ver];
    return e[1] * e[2] + e[3] * e[4];
  }

  function encodeData(bytes, ver, ecl) {
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);                                  // byte mode
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var capBits = dataCapacity(ver, ecl) * 8;
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      cw.push(v);
    }
    for (var pad = 0xEC; cw.length < dataCapacity(ver, ecl); pad ^= 0xEC ^ 0x11) cw.push(pad);
    return cw;
  }

  function addEcAndInterleave(cw, ver, ecl) {
    var e = EC[ecl][ver], ecLen = e[0], blocks = [], k = 0, b;
    for (b = 0; b < e[1]; b++) { blocks.push(cw.slice(k, k + e[2])); k += e[2]; }
    for (b = 0; b < e[3]; b++) { blocks.push(cw.slice(k, k + e[4])); k += e[4]; }
    var ecs = blocks.map(function (blk) { return rsRemainder(blk, ecLen); });
    var out = [], maxLen = Math.max(e[2], e[4]);
    for (var i = 0; i < maxLen; i++) blocks.forEach(function (blk) { if (i < blk.length) out.push(blk[i]); });
    for (i = 0; i < ecLen; i++) ecs.forEach(function (ec) { out.push(ec[i]); });
    return out;
  }

  function build(ver, ecl, codewords, mask) {
    var size = ver * 4 + 17;
    var m = [], fn = [];
    for (var y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function set(x, yy, dark) { m[yy][x] = dark; fn[yy][x] = true; }

    var i, j;
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy2 = c[1] + dy;
        if (xx < 0 || yy2 < 0 || xx >= size || yy2 >= size) continue;
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        set(xx, yy2, d !== 2 && d !== 4);
      }
    });
    var pos = ALIGN[ver], last = pos.length - 1;
    for (i = 0; i < pos.length; i++) for (j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) {
        set(pos[i] + ax, pos[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
      }
    }
    // Format bits (placeholder now, real values after masking) + dark module.
    drawFormat(0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((vbits >>> i) & 1) === 1, a = size - 11 + (i % 3), bb = Math.floor(i / 3);
        set(a, bb, bit); set(bb, a, bit);
      }
    }

    function drawFormat(mk) {
      var data = (FORMAT_BITS[ecl] << 3) | mk, r = data;
      for (var q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits = ((data << 10) | r) ^ 0x5412;
      var g = function (n) { return ((bits >>> n) & 1) === 1; };
      for (var t = 0; t <= 5; t++) set(8, t, g(t));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (t = 9; t < 15; t++) set(14 - t, 8, g(t));
      for (t = 0; t < 8; t++) set(size - 1 - t, 8, g(t));
      for (t = 8; t < 15; t++) set(8, size - 15 + t, g(t));
      set(8, size - 8, true);
    }

    // Data, zig-zag from the bottom-right, skipping the vertical timing column.
    var bitIdx = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, upward = ((right + 1) & 2) === 0;
          var yy3 = upward ? size - 1 - vert : vert;
          if (!fn[yy3][x] && bitIdx < total) {
            m[yy3][x] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
        }
      }
    }

    // Mask (non-function modules only), then the real format bits.
    for (y = 0; y < size; y++) for (var x2 = 0; x2 < size; x2++) {
      if (fn[y][x2]) continue;
      var inv;
      switch (mask) {
        case 0: inv = (x2 + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x2 % 3 === 0; break;
        case 3: inv = (x2 + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x2 / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = (x2 * y) % 2 + (x2 * y) % 3 === 0; break;
        case 6: inv = ((x2 * y) % 2 + (x2 * y) % 3) % 2 === 0; break;
        default: inv = ((x2 + y) % 2 + (x2 * y) % 3) % 2 === 0;
      }
      if (inv) m[y][x2] = !m[y][x2];
    }
    drawFormat(mask);
    return m;
  }

  // Standard penalty score (rules 1–4) — lower is better.
  function penalty(m) {
    var size = m.length, score = 0, x, y, run, dark = 0;
    function lines(get) {
      for (var a = 0; a < size; a++) {
        run = 1;
        for (var b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else run = 1;
        }
        for (b = 0; b + 10 < size + 1; b++) {
          var p = [];
          for (var c = 0; c < 11 && b + c < size; c++) p.push(get(a, b + c) ? 1 : 0);
          var s = p.join('');
          if (s === '10111010000' || s === '00001011101') score += 40;
        }
      }
    }
    lines(function (r, c) { return m[r][c]; });
    lines(function (c, r) { return m[r][c]; });
    for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
      var v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
    }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) dark++;
    var k = Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
    return score + k * 10;
  }

  function matrix(text, ecl) {
    ecl = ecl === 'L' ? 'L' : 'M';
    var bytes = utf8Bytes(text), ver;
    for (ver = 1; ver <= 15; ver++) {
      var need = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
      if (need <= dataCapacity(ver, ecl) * 8) break;
    }
    if (ver > 15) throw new Error('QR: text too long (' + bytes.length + ' bytes)');
    var cw = addEcAndInterleave(encodeData(bytes, ver, ecl), ver, ecl);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = build(ver, ecl, cw, mask), s = penalty(m);
      if (s < bestScore) { best = m; bestScore = s; }
    }
    return best;
  }

  /**
   * @param {string} text
   * @param {object} [opts] { ecl:'M'|'L', margin: quiet-zone modules (4), dark, light, title }
   * @returns {string} an <svg> that scales to its container (crisp edges).
   */
  function svg(text, opts) {
    opts = opts || {};
    var m = matrix(text, opts.ecl || 'M'), size = m.length, q = opts.margin == null ? 4 : opts.margin;
    var dim = size + q * 2, path = '';
    // One rectangle per horizontal run of dark modules (keeps a page of login
    // cards light).
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (!m[y][x]) continue;
        var run = 1;
        while (x + run < size && m[y][x + run]) run++;
        path += 'M' + (x + q) + ' ' + (y + q) + 'h' + run + 'v1h-' + run + 'z';
        x += run - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" ' +
      'shape-rendering="crispEdges" role="img" aria-label="' + String(opts.title || 'QR code').replace(/"/g, '&quot;') + '">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + (opts.light || '#fff') + '"/>' +
      '<path d="' + path + '" fill="' + (opts.dark || '#000') + '"/></svg>';
  }

  var api = { matrix: matrix, svg: svg, _rsRemainder: rsRemainder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SOG = root.SOG || {};
  root.SOG.QR = api;
})(typeof window !== 'undefined' ? window : globalThis);

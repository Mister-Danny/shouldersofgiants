/* ══ WATER GRID — where the Explorer may walk ═══════════════════════════════
   Every overworld map carries a coarse grid of blocked cells (seas, lakes,
   rivers) generated from its art and corrected by hand in tools/map-editor,
   plus RIVER CROSSINGS: points where a river may be crossed. This file is the
   one implementation of that grid — decoding, crossings, pathfinding, path
   smoothing and the automatic placement of crossings — shared by the game
   (js/overworld.js), the map editor (loaded as a classic script) and Node
   (the scripts that generate the data).

   Data, per map in data/map-data.js:
     water:     { cell: 4, rle: '…' }   cell = stage px per cell (map 1280×600)
     crossings: [ { x, y, r } ]          map-%, r = cleared radius in stage px

   rle: run lengths, base 36, '.'-separated, alternating free/blocked and
   starting with FREE (a leading 0 when the first cell is blocked), row-major.

   Coordinates: a point is map-% like everything else (x of 1280, y of 600).
   Cells are square in stage px.

   A `blocked` array holds 0 = open, 1 = WATER (never walked), 2 = SOFT — a
   building's footprint: walked round when there is room, cut through at
   SOFT_COST per cell when a building seals a gap between two rivers (a
   double ford to get round it would be worse). */
(function (root) {
  'use strict';

  var MAP_W = 1280, MAP_H = 600, DEFAULT_R = 14, SOFT_COST = 6;

  /* ── Codec ─────────────────────────────────────────────────────────────── */
  function decode(rle, n) {
    var out = new Uint8Array(n);
    if (!rle) return out;
    var runs = rle.split('.'), i = 0, v = 0;
    for (var k = 0; k < runs.length && i < n; k++) {
      var len = parseInt(runs[k], 36) || 0;
      if (v) out.fill(1, i, Math.min(n, i + len));
      i += len; v ^= 1;
    }
    return out;
  }
  function encode(arr) {
    var runs = [], v = 0, len = 0;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i] ? 1 : 0;
      if (b === v) { len++; continue; }
      runs.push(len.toString(36)); v = b; len = 1;
    }
    runs.push(len.toString(36));
    // A trailing free run is implied by the grid size.
    if (v === 0) runs.pop();
    return runs.join('.');
  }

  /* ── Grid ──────────────────────────────────────────────────────────────── */
  function Grid(cell) {
    this.cell = cell || 4;
    this.cols = Math.round(MAP_W / this.cell);
    this.rows = Math.round(MAP_H / this.cell);
    this.n = this.cols * this.rows;
    this.water = new Uint8Array(this.n);     // from the art (+ hand edits)
    this.blocked = new Uint8Array(this.n);   // water minus crossings (+ obstacles)
  }
  Grid.prototype.cellOf = function (p) {
    var c = Math.floor(p.x / 100 * this.cols), r = Math.floor(p.y / 100 * this.rows);
    return { c: Math.max(0, Math.min(this.cols - 1, c)), r: Math.max(0, Math.min(this.rows - 1, r)) };
  };
  Grid.prototype.pctOf = function (c, r) {
    return { x: (c + 0.5) / this.cols * 100, y: (r + 0.5) / this.rows * 100 };
  };
  /* Clear (v = 0) or block (v = 1) every cell whose centre lies within
     `rPx` stage px of the map-% point p. Returns the cells touched. */
  Grid.prototype.disk = function (arr, p, rPx, v) {
    var cx = p.x / 100 * MAP_W, cy = p.y / 100 * MAP_H, s = this.cell, out = [];
    var c0 = Math.max(0, Math.floor((cx - rPx) / s)), c1 = Math.min(this.cols - 1, Math.floor((cx + rPx) / s));
    var r0 = Math.max(0, Math.floor((cy - rPx) / s)), r1 = Math.min(this.rows - 1, Math.floor((cy + rPx) / s));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var dx = (c + 0.5) * s - cx, dy = (r + 0.5) * s - cy;
        if (dx * dx + dy * dy <= rPx * rPx) { arr[r * this.cols + c] = v; out.push(r * this.cols + c); }
      }
    }
    return out;
  };

  /* A map's walkable grid: its water, with every crossing cleared. */
  function fromMap(map) {
    var w = map && map.water;
    var g = new Grid(w && w.cell);
    if (w && w.rle) g.water = decode(w.rle, g.n);
    g.blocked = new Uint8Array(g.water);
    (map && map.crossings || []).forEach(function (x) {
      g.disk(g.blocked, x, x.r || DEFAULT_R, 0);
    });
    return g;
  }

  /* ── Search ────────────────────────────────────────────────────────────── */
  var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
              [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

  // Binary min-heap of cell indices keyed by an external score array.
  function Heap(score) { this.a = []; this.s = score; }
  Heap.prototype.push = function (i) {
    var a = this.a, s = this.s; a.push(i);
    var k = a.length - 1;
    while (k > 0) { var p = (k - 1) >> 1; if (s[a[p]] <= s[i]) break; a[k] = a[p]; k = p; }
    a[k] = i;
  };
  Heap.prototype.pop = function () {
    var a = this.a, s = this.s, top = a[0], last = a.pop();
    if (a.length) {
      var k = 0, n = a.length;
      for (;;) {
        var l = 2 * k + 1, r = l + 1, m = k, ms = s[last];
        if (l < n && s[a[l]] < ms) { m = l; ms = s[a[l]]; }
        if (r < n && s[a[r]] < ms) { m = r; }
        if (m === k) break;
        a[k] = a[m]; k = m;
      }
      a[k] = last;
    }
    return top;
  };

  /* The nearest unblocked cell to (c, r), searching outward ring by ring. */
  function nearestFree(blocked, g, c, r, maxR) {
    if (blocked[r * g.cols + c] !== 1) return { c: c, r: r };
    for (var d = 1; d <= (maxR || 90); d++) {          // ~360px: an exit placed well out to sea still finds the shore
      var best = null, bd = Infinity;
      for (var dr = -d; dr <= d; dr++) {
        for (var dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          var cc = c + dc, rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows || blocked[rr * g.cols + cc] === 1) continue;
          var dd = dc * dc + dr * dr;
          if (dd < bd) { bd = dd; best = { c: cc, r: rr }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /* Dijkstra/A* over 8 neighbours, no corner cutting (a diagonal step needs
     both orthogonal cells free, so she never squeezes between two diagonal
     water cells). `goal` null = full Dijkstra (fills dist for every cell). */
  function search(blocked, g, start, goal) {
    var n = g.n, cols = g.cols, rows = g.rows;
    var dist = new Float32Array(n).fill(Infinity), f = new Float32Array(n).fill(Infinity);
    var from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    var s0 = start.r * cols + start.c, gi = goal ? goal.r * cols + goal.c : -1;
    var h = goal ? function (i) {
      var dc = Math.abs(i % cols - goal.c), dr = Math.abs(((i / cols) | 0) - goal.r);
      return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr);
    } : function () { return 0; };
    dist[s0] = 0; f[s0] = h(s0);
    var heap = new Heap(f); heap.push(s0);
    while (heap.a.length) {
      var i = heap.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (i === gi) break;
      var c = i % cols, r = (i / cols) | 0;
      for (var k = 0; k < 8; k++) {
        var dc = DIRS[k][0], dr = DIRS[k][1], nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        var j = nr * cols + nc;
        if (blocked[j] === 1 || done[j]) continue;
        if (dc && dr && (blocked[r * cols + nc] === 1 || blocked[nr * cols + c] === 1)) continue;
        var nd = dist[i] + DIRS[k][2] * (blocked[j] === 2 ? SOFT_COST : 1);
        if (nd < dist[j]) { dist[j] = nd; from[j] = i; f[j] = nd + h(j); heap.push(j); }
      }
    }
    return { dist: dist, from: from };
  }

  /* Is the straight segment between two map-% points clear of blocked cells?
     Sampled every quarter cell — fine enough that a 1-cell river is never
     stepped over. The two end cells themselves don't count: a stand point on
     a riverbank cell must still be able to step off it. */
  function lineClear(blocked, g, a, b) {
    var ax = a.x / 100 * g.cols, ay = a.y / 100 * g.rows, bx = b.x / 100 * g.cols, by = b.y / 100 * g.rows;
    var ea = Math.floor(ay) * g.cols + Math.floor(ax), eb = Math.floor(by) * g.cols + Math.floor(bx);
    var steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4) + 1;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var c = Math.floor(ax + (bx - ax) * t), r = Math.floor(ay + (by - ay) * t);
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
      var i = r * g.cols + c;
      if (blocked[i] && i !== ea && i !== eb) return false;
    }
    return true;
  }

  /* Cell chain → a few natural waypoints: from each kept point, jump to the
     farthest later point still in clear line of sight (string pulling). */
  function smooth(blocked, g, pts) {
    if (pts.length <= 2) return pts.slice(1);
    var out = [], i = 0;
    while (i < pts.length - 1) {
      var j = pts.length - 1;
      while (j > i + 1 && !lineClear(blocked, g, pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  function chain(res, g, endIdx) {
    var cells = [];
    for (var k = endIdx; k !== -1; k = res.from[k]) cells.push(k);
    cells.reverse();
    return cells.map(function (k) { return g.pctOf(k % g.cols, (k / g.cols) | 0); });
  }

  /* Waypoints from `a` to `b` (map-%), NOT including `a`, or null when no
     path exists. Start/end inside a blocked cell snap to the nearest free
     cell. The walk ends exactly at `b` when `b` is dry or a step from dry
     land (a stand point on a riverbank keeps its exact spot, which arrival
     facing relies on); a `b` well out in the water ends on the shore. */
  var SHORE_CELLS = 2;
  function findPath(blocked, g, a, b) {
    var ca = g.cellOf(a), cb = g.cellOf(b);
    var sa = nearestFree(blocked, g, ca.c, ca.r), sb = nearestFree(blocked, g, cb.c, cb.r);
    if (!sa || !sb) return null;
    var end = b;
    if (Math.max(Math.abs(sb.c - cb.c), Math.abs(sb.r - cb.r)) > SHORE_CELLS) end = g.pctOf(sb.c, sb.r);
    if (lineClear(blocked, g, a, end)) return [end];          // nothing in the way
    var res = search(blocked, g, sa, sb);
    var gi = sb.r * g.cols + sb.c;
    if (res.dist[gi] === Infinity) return null;
    var pts = [a].concat(chain(res, g, gi).slice(1, -1)).concat([end]);
    var way = smooth(blocked, g, pts);
    return way.length ? way : [end];
  }
  /* Is this map-% point in the water (more than a step from dry land)? */
  function inWater(blocked, g, p) {
    var c = g.cellOf(p), f = nearestFree(blocked, g, c.c, c.r);
    return !f || Math.max(Math.abs(f.c - c.c), Math.abs(f.r - c.r)) > SHORE_CELLS;
  }

  /* Walk off a map edge: the reachable cell on `edges` ('top'|'right'|
     'bottom'|'left') that best balances path length against distance from
     the intended exit point `aim` (map-%). Returns { path, edge, at } —
     `path` ends ON the chosen edge cell — or null. */
  function findPathToEdge(blocked, g, a, aim, edges, wAim) {
    var ca = g.cellOf(a), sa = nearestFree(blocked, g, ca.c, ca.r);
    if (!sa) return null;
    var res = search(blocked, g, sa, null);
    var ai = g.cellOf(aim), best = -1, bs = Infinity, bestEdge = null;
    var w = wAim == null ? 0.6 : wAim;
    var consider = function (c, r, e) {
      var i = r * g.cols + c;
      if (res.dist[i] === Infinity) return;
      var s = res.dist[i] + w * Math.sqrt((c - ai.c) * (c - ai.c) + (r - ai.r) * (r - ai.r));
      if (s < bs) { bs = s; best = i; bestEdge = e; }
    };
    edges.forEach(function (e) {
      var c, r;
      if (e === 'top' || e === 'bottom') { r = e === 'top' ? 0 : g.rows - 1; for (c = 0; c < g.cols; c++) consider(c, r, e); }
      else { c = e === 'left' ? 0 : g.cols - 1; for (r = 0; r < g.rows; r++) consider(c, r, e); }
    });
    if (best < 0) return null;
    var at = g.pctOf(best % g.cols, (best / g.cols) | 0);
    var pts = [a].concat(chain(res, g, best).slice(1));
    return { path: smooth(blocked, g, pts), edge: bestEdge, at: at };
  }

  /* ── Reachability + automatic crossings ───────────────────────────────── */
  function components(blocked, g) {
    var comp = new Int32Array(g.n).fill(-1), id = 0, q = new Int32Array(g.n);
    for (var s = 0; s < g.n; s++) {
      if (blocked[s] || comp[s] !== -1) continue;
      var h = 0, t = 0; q[t++] = s; comp[s] = id;
      while (h < t) {
        var i = q[h++], c = i % g.cols, r = (i / g.cols) | 0;
        if (c > 0 && !blocked[i - 1] && comp[i - 1] === -1) { comp[i - 1] = id; q[t++] = i - 1; }
        if (c < g.cols - 1 && !blocked[i + 1] && comp[i + 1] === -1) { comp[i + 1] = id; q[t++] = i + 1; }
        if (r > 0 && !blocked[i - g.cols] && comp[i - g.cols] === -1) { comp[i - g.cols] = id; q[t++] = i - g.cols; }
        if (r < g.rows - 1 && !blocked[i + g.cols] && comp[i + g.cols] === -1) { comp[i + g.cols] = id; q[t++] = i + g.cols; }
      }
      id++;
    }
    return comp;
  }

  /* RIVER cells: water that is narrow in some direction — the run of water
     through the cell, horizontally, vertically or along either diagonal, is
     at most `maxRun` cells. A sea, an ocean or a broad lake never is, so it
     never gets a crossing. */
  function narrowWater(water, g, maxRun) {
    var out = new Uint8Array(g.n), cols = g.cols, rows = g.rows;
    var run = function (i, dc, dr) {
      var c = i % cols, r = (i / cols) | 0, n = 1, cc, rr;
      for (cc = c + dc, rr = r + dr; cc >= 0 && rr >= 0 && cc < cols && rr < rows && water[rr * cols + cc] && n <= maxRun; cc += dc, rr += dr) n++;
      for (cc = c - dc, rr = r - dr; cc >= 0 && rr >= 0 && cc < cols && rr < rows && water[rr * cols + cc] && n <= maxRun; cc -= dc, rr -= dr) n++;
      // A run that reaches the map edge may be a sea cut off by the frame.
      return n;
    };
    for (var i = 0; i < g.n; i++) {
      if (!water[i]) continue;
      if (run(i, 1, 0) <= maxRun || run(i, 0, 1) <= maxRun || run(i, 1, 1) <= maxRun || run(i, 1, -1) <= maxRun) out[i] = 1;
    }
    return out;
  }

  /* Cheapest 4-neighbour walk from any `sources` cell to any `targets` cell
     where land costs 1 per cell, narrow river water `waterCost`, other water
     is impassable. Returns the cell path (target first) or null. */
  function ford(blocked, narrow, g, sources, targets, waterCost) {
    var cols = g.cols, dist = new Float32Array(g.n).fill(Infinity), from = new Int32Array(g.n).fill(-1);
    var heap = new Heap(dist), seen = new Uint8Array(g.n), hit = -1;
    sources.forEach(function (i) { dist[i] = 0; heap.push(i); });
    while (heap.a.length) {
      var k = heap.pop();
      if (seen[k]) continue;
      seen[k] = 1;
      if (targets[k]) { hit = k; break; }
      var c = k % cols, r = (k / cols) | 0;
      for (var d = 0; d < 4; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= g.rows) continue;
        var j = nr * cols + nc;
        var cost = blocked[j] ? (narrow[j] ? waterCost : Infinity) : 1;
        if (cost === Infinity || seen[j]) continue;
        if (dist[k] + cost < dist[j]) { dist[j] = dist[k] + cost; from[j] = k; heap.push(j); }
      }
    }
    if (hit < 0) return null;
    var path = [];
    for (var p = hit; p !== -1; p = from[p]) path.push(p);
    return path;
  }

  /* Place crossings so every endpoint (map-%) is reachable from every other,
     with as few as possible, each on the way between real places:
       1. CONNECT — repeatedly take the cheapest walk from an endpoint in the
          first endpoint's region to an endpoint in any other region (land 1
          per cell, narrow river water `waterCost` per cell, other water
          impassable) and put one crossing on each stretch of water it fords.
          Searching endpoint to endpoint, not region to region, keeps the
          crossing between real places instead of at the river's narrowest
          point off at the map's edge.
       2. SHORTEN — a crossing that exists only far upstream can make a
          neighbouring trip a long detour. While some pair of endpoints walks
          more than `detour`× its straight line, and a ford would save at
          least `minSave` cells of walking, add the crossing for the pair that
          saves the most (at most `extra` of these).
       3. PRUNE — drop any crossing that no trip needs (see below).
     Existing crossings are respected; seas, oceans and broad lakes never
     get one (narrowWater). Returns { crossings, unreachable }. */
  function autoCrossings(map, endpoints, opts) {
    opts = opts || {};
    var g = fromMap(map), blocked = g.blocked, cols = g.cols;
    var maxRun = opts.maxRun || 8, waterCost = opts.waterCost || 40;
    var narrow = narrowWater(g.water, g, maxRun);
    var cells = endpoints.map(function (p) { var c = g.cellOf(p); return nearestFree(blocked, g, c.c, c.r); })
                         .map(function (c) { return c ? c.r * cols + c.c : -1; });
    var added = [], unreachable = [];
    // The crossings a ford path needs: one per stretch of water it wades,
    // stretches split by a sliver of land (an island cell, a sandbar) being
    // one ford, not two.
    var fordsOf = function (path) {
      var out = [], seg = [], land = 0;
      var flush = function () {
        if (!seg.length) return;
        var a = g.pctOf(seg[0] % cols, (seg[0] / cols) | 0), b = g.pctOf(seg[seg.length - 1] % cols, (seg[seg.length - 1] / cols) | 0);
        var lenPx = Math.sqrt(Math.pow((a.x - b.x) / 100 * MAP_W, 2) + Math.pow((a.y - b.y) / 100 * MAP_H, 2));
        out.push({ x: Math.round((a.x + b.x) / 2 * 100) / 100, y: Math.round((a.y + b.y) / 2 * 100) / 100,
                   r: Math.max(DEFAULT_R, Math.round(lenPx / 2 + g.cell * 2)) });
        seg = [];
      };
      path.forEach(function (i) {
        if (blocked[i]) { seg.push(i); land = 0; }
        else if (seg.length && ++land > 3) { flush(); land = 0; }
      });
      flush();
      return out;
    };
    var place = function (path) {
      fordsOf(path).forEach(function (x) { added.push(x); g.disk(blocked, x, x.r, 0); });
    };
    var valid = cells.filter(function (i) { return i >= 0; });
    // 1. CONNECT
    for (var guard = 0; guard < 40 && valid.length; guard++) {
      var comp = components(blocked, g), main = comp[valid[0]];
      var src = [], tgt = new Uint8Array(g.n), any = false;
      valid.forEach(function (i) { if (comp[i] === main) src.push(i); else { tgt[i] = 1; any = true; } });
      if (!any) break;
      var path = ford(blocked, narrow, g, src, tgt, waterCost);
      if (!path) {
        cells.forEach(function (ci, n) { if (ci < 0 || comp[ci] !== main) unreachable.push(endpoints[n]); });
        break;
      }
      place(path);
    }
    // 2. SHORTEN — measured for real: the candidate fords are carved into a
    // copy of the grid and the trip re-walked, so the saving is exact.
    var detour = opts.detour || 1.4, minSave = opts.minSave || 30, extra = opts.extra == null ? 4 : opts.extra;
    for (var e = 0; e < extra; e++) {
      var best = null, bestSave = minSave;
      for (var a = 0; a < valid.length; a++) {
        var ca = { c: valid[a] % cols, r: (valid[a] / cols) | 0 };
        var fromA = search(blocked, g, ca, null).dist;
        for (var b = a + 1; b < valid.length; b++) {
          var walk = fromA[valid[b]];
          if (walk === Infinity) continue;
          var dc = (valid[a] % cols) - (valid[b] % cols), dr = ((valid[a] / cols) | 0) - ((valid[b] / cols) | 0);
          var straight = Math.sqrt(dc * dc + dr * dr);
          if (walk < detour * straight || walk - straight < minSave) continue;
          var t = new Uint8Array(g.n); t[valid[b]] = 1;
          var alt = ford(blocked, narrow, g, [valid[a]], t, 3);   // fording barely penalised
          if (!alt) continue;
          var fords = fordsOf(alt);
          if (!fords.length) continue;
          var trial = new Uint8Array(blocked);
          fords.forEach(function (x) { g.disk(trial, x, x.r, 0); });
          var cb = { c: valid[b] % cols, r: (valid[b] / cols) | 0 };
          var save = walk - search(trial, g, ca, cb).dist[valid[b]];
          if (save > bestSave) { bestSave = save; best = alt; }
        }
      }
      if (!best) break;
      place(best);
    }
    // 3. PRUNE — drop any crossing (newest first) that no trip needs: every
    // endpoint stays reachable and no trip grows by more than `slack`.
    var slack = opts.slack || 0.15;
    var uniq = valid.filter(function (i, k) { return valid.indexOf(i) === k; });
    var walks = function (bl) {
      return uniq.map(function (i) { return search(bl, g, { c: i % cols, r: (i / cols) | 0 }, null).dist; });
    };
    if (added.length > 1) {
      var base = walks(blocked);
      for (var x = added.length - 1; x >= 0; x--) {
        var trial = new Uint8Array(g.water);
        (map.crossings || []).concat(added.filter(function (_, k) { return k !== x; })).forEach(function (cr) {
          g.disk(trial, cr, cr.r || DEFAULT_R, 0);
        });
        var tw = walks(trial), ok = true;
        for (var a2 = 0; a2 < uniq.length && ok; a2++) {
          for (var b2 = 0; b2 < uniq.length && ok; b2++) {
            var was = base[a2][uniq[b2]], now = tw[a2][uniq[b2]];
            if (was !== Infinity && (now === Infinity || now > was * (1 + slack) + 4)) ok = false;
          }
        }
        if (ok) { added.splice(x, 1); blocked.set(trial); base = tw; }
      }
    }
    return { crossings: added, unreachable: unreachable };
  }

  var API = {
    MAP_W: MAP_W, MAP_H: MAP_H, DEFAULT_R: DEFAULT_R,
    decode: decode, encode: encode, Grid: Grid, fromMap: fromMap,
    findPath: findPath, findPathToEdge: findPathToEdge, lineClear: lineClear, inWater: inWater,
    nearestFree: nearestFree, components: components, autoCrossings: autoCrossings
  };
  root.SOG = root.SOG || {};
  root.SOG.WaterGrid = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

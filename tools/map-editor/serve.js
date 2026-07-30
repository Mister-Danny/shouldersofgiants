#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAP EDITOR — local dev server.  node tools/map-editor/serve.js

   Serves the repo root on :8750, so both of these work off one process:
     http://localhost:8750/tools/map-editor/   ← the editor
     http://localhost:8750/                    ← the actual game

   Serving the ROOT (not the editor folder) is deliberate: the editor has to
   load the same map backgrounds and node art the game uses, by the same
   relative paths that end up written into data/map-data.js. If those paths
   resolve in the editor, they resolve in the game.

   Zero dependencies — no package.json, no npm install, nothing to keep
   updated. This is a local tool that must still boot in a year.

   Endpoints beyond static files:
     GET  /api/art          → the map + node art on disk, for the picker
     POST /api/save         → overwrite data/map-data.js (the only write)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

var http = require('http');
var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var PORT = Number(process.env.PORT) || 8750;
var DATA_FILE = path.join(ROOT, 'data', 'map-data.js');

var MAPS_DIR  = path.join('images', 'metaworld', 'maps');
var NODES_DIR = path.join('images', 'metaworld', 'civilization nodes');
var TOPO_DIR  = path.join('images', 'metaworld', 'topography');

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.m4a':  'audio/mp4',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    // The editor reads files that change under it; never let the browser cache.
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), TYPES['.json']);
}

/* List image files in a repo-relative directory, returned as repo-relative
   paths so they can be written straight into map-data.js. */
function listArt(relDir) {
  var abs = path.join(ROOT, relDir);
  var out = [];
  try {
    fs.readdirSync(abs).forEach(function (name) {
      if (name.charAt(0) === '.') return;                       // .DS_Store etc
      var ext = path.extname(name).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].indexOf(ext) === -1) return;
      var st = fs.statSync(path.join(abs, name));
      out.push({
        // Forward slashes always — this string is written into map-data.js and
        // consumed by a browser, even when the editor is run on Windows.
        path: relDir.split(path.sep).join('/') + '/' + name,
        name: name,
        bytes: st.size
      });
    });
  } catch (e) {
    // Missing art directory is not fatal — the picker just shows nothing.
    console.warn('[map-editor] could not read ' + relDir + ': ' + e.message);
  }
  return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/* ── Serialise the editor's state back into data/map-data.js ───────────────
   Hand-rolled rather than JSON.stringify so the output stays readable and
   diffable: one node per block, coordinates on a single line, stable key
   order. A generated file that produces a 400-line diff for a 2px nudge is a
   file nobody will review. */
function serialise(doc) {
  var HEADER = fs.readFileSync(path.join(__dirname, 'data-header.txt'), 'utf8');
  var maps = doc.maps || {};
  var s = HEADER + '\nwindow.SOG_MAP_DATA = {\n';

  /* ── Milestones ── the ordered story beats. Order matters here only for the
     editor's scrubber; the game decides visibility from the flag. */
  s += '\n  milestones: [\n';
  (doc.milestones || []).forEach(function (ms, i) {
    s += '    { id: ' + q(ms.id) + ', label: ' + q(ms.label) +
         ', flag: ' + (ms.flag ? q(ms.flag) : 'null') + ' }' +
         (i < doc.milestones.length - 1 ? ',' : '') + '\n';
  });
  s += '  ],\n';

  s += '\n  maps: {\n';
  var mapIds = Object.keys(maps);

  mapIds.forEach(function (mapId, mi) {
    var m = maps[mapId];
    s += '\n  ' + q(mapId) + ': {\n';
    s += '    displayName: ' + q(m.displayName) + ',\n';
    s += '    image: ' + q(m.image) + ',\n';
    s += '    spawn: { x: ' + num(m.spawn.x) + ', y: ' + num(m.spawn.y) + ' },\n';
    s += '    startsFogged: ' + (m.startsFogged ? 'true' : 'false') + ',\n';

    /* ── Topography ── decorative, non-interactive, painted behind everything. */
    s += '    props: [' + ((m.props || []).length ? '\n' : '');
    (m.props || []).forEach(function (p, i) {
      s += '      { image: ' + q(p.image) +
           ', x: ' + num(p.x) + ', y: ' + num(p.y) +
           ', scale: ' + scaleNum(p.scale == null ? 1 : p.scale) +
           ', rotation: ' + num(p.rotation || 0);
      if (p.flipX)     s += ', flipX: true';
      if (p.flipY)     s += ', flipY: true';
      s += gates(p, '');
      if (p.note)      s += ', note: ' + q(p.note);
      s += ' }' + (i < m.props.length - 1 ? ',' : '') + '\n';
    });
    s += (m.props || []).length ? '    ],\n' : '],\n';

    s += '    nodes: [' + ((m.nodes || []).length ? '\n' : '');
    (m.nodes || []).forEach(function (n, i) {
      s += '      {\n';
      s += '        id:    ' + q(n.id) + ',\n';
      s += '        name:  ' + q(n.name) + ',\n';
      s += '        kind:  ' + q(n.kind === 'market' ? 'market' : 'battle') + ',\n';
      s += '        image: ' + q(n.image) + ',\n';
      s += '        x: ' + num(n.x) + ', y: ' + num(n.y);
      if (n.scale != null) s += ',\n        scale: ' + scaleNum(n.scale);
      if (n.flipX)         s += ',\n        flipX: true';
      if (n.label)         s += ',\n        label: ' + q(n.label);
      // Boss ladder. `hook` is the flag key + script hook; `tiers` 2 means a
      // Serf/Giant pair (and therefore flags), 1 means a single-level battle.
      if (n.hook)          s += ',\n        hook:  ' + q(n.hook);
      if (n.tiers != null) s += ',\n        tiers: ' + num(n.tiers);
      if (n.flagNudge)     s += ',\n        flagNudge: { dx: ' + num(n.flagNudge.dx || 0) +
                                ', dy: ' + num(n.flagNudge.dy || 0) + ' }';
      if (n.serfFlagOn)    s += ',\n        serfFlagOn: ' + q(n.serfFlagOn);
      s += gates(n, ',\n        ');
      if (n.note)          s += ',\n        note: ' + q(n.note);
      if (n.path && n.path.length) {
        s += ',\n        path: [\n';
        s += n.path.map(function (p) {
          return '          { x: ' + num(p.x) + ', y: ' + num(p.y) + ' }';
        }).join(',\n');
        s += '\n        ]';
      }
      s += '\n      }' + (i < m.nodes.length - 1 ? ',' : '') + '\n';
    });
    s += (m.nodes || []).length ? '    ],\n' : '],\n';

    s += '    exits: [' + ((m.exits || []).length ? '\n' : '');
    (m.exits || []).forEach(function (x, i) {
      s += '      {\n';
      s += '        id:      ' + q(x.id) + ',\n';
      s += '        label:   ' + q(x.label) + ',\n';
      s += '        zone:    { x: ' + num(x.zone.x) + ', y: ' + num(x.zone.y) +
           ', w: ' + num(x.zone.w) + ', h: ' + num(x.zone.h) + ' },\n';
      s += '        walkTo:  { x: ' + num(x.walkTo.x) + ', y: ' + num(x.walkTo.y) + ' },\n';
      if (x.walkOff) s += '        walkOff: true,\n';
      s += '        target:  ' + q(x.target) + ',\n';
      s += '        entryAt: { x: ' + num(x.entryAt.x) + ', y: ' + num(x.entryAt.y) + ' }';
      s += gates(x, ',\n        ');
      if (x.note) s += ',\n        note: ' + q(x.note);
      s += '\n      }' + (i < m.exits.length - 1 ? ',' : '') + '\n';
    });
    s += (m.exits || []).length ? '    ]\n' : ']\n';

    s += '  }' + (mi < mapIds.length - 1 ? ',' : '') + '\n';
  });

  return s + '  }\n};\n';
}

/* showFrom / showUntil, emitted only when set. `sep` lets the caller pick
   inline (props, one line each) vs indented block style (nodes and exits). */
function gates(o, sep) {
  var out = '';
  if (o.showFrom)  out += (sep || ', ') + 'showFrom: '  + q(o.showFrom);
  if (o.showUntil) out += (sep || ', ') + 'showUntil: ' + q(o.showUntil);
  return out;
}

/* Single-quoted JS string, matching the codebase's style. Escapes only what
   must be escaped; leaves non-ASCII (→, ←) as literal UTF-8. */
function q(v) {
  return "'" + String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n') + "'";
}

/* Coordinates: trim float noise from dragging (23.400000000000002 -> 23.4).
   Percentages, so two decimals is ~0.13px of real precision — well below what
   anyone can see, and it keeps diffs readable. */
function num(v) {
  var n = Number(v);
  if (!isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

/* Scale is NOT a coordinate and must not be rounded to 2dp — hanging-gardens
   ships at 1.275, and quantising it to 1.27 would silently resize the art a
   little every time someone opened and saved the editor. Four decimals still
   kills float noise but round-trips every value currently in the game. */
function scaleNum(v) {
  var n = Number(v);
  if (!isFinite(n)) return '1';
  return String(Math.round(n * 10000) / 10000);
}

function handleSave(req, res) {
  var body = '';
  req.on('data', function (c) {
    body += c;
    if (body.length > 5e6) { req.destroy(); }   // nothing legitimate is this big
  });
  req.on('end', function () {
    var maps;
    try {
      maps = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'bad JSON: ' + e.message });
    }

    // Validate before writing. A corrupt map-data.js breaks the whole game on
    // next load, and the editor is the only thing that writes it -- so it is
    // the right place to be paranoid.
    var err = validate(maps);
    if (err) return sendJson(res, 400, { ok: false, error: err });

    var out;
    try {
      out = serialise(maps);
      // Parse what we are about to write. If this throws, we caught a
      // serialiser bug before it reached disk instead of after.
      new Function(makeCheckable(out));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'serialiser produced invalid JS: ' + e.message });
    }

    // Keep one generation of backup. Cheap insurance against a bad save.
    try {
      if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, out, 'utf8');
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'write failed: ' + e.message });
    }

    var ids = Object.keys(maps.maps || {});
    var nodeCount = ids.reduce(function (t, k) { return t + (maps.maps[k].nodes || []).length; }, 0);
    var propCount = ids.reduce(function (t, k) { return t + (maps.maps[k].props || []).length; }, 0);
    console.log('[map-editor] saved data/map-data.js — ' + ids.length + ' maps, ' +
                nodeCount + ' nodes, ' + propCount + ' props');
    sendJson(res, 200, { ok: true, maps: ids.length, nodes: nodeCount, props: propCount });
  });
}

/* Strip the browser-global assignment so the output can be syntax-checked in
   Node, where `window` does not exist. */
function makeCheckable(src) {
  return 'var window = {};\n' + src;
}

function validate(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'payload must be an object';
  var maps = doc.maps;
  if (!maps || typeof maps !== 'object') return 'payload has no maps';
  var mapIds = Object.keys(maps);
  if (!mapIds.length) return 'refusing to save zero maps';

  /* Milestone ids are the join key for every showFrom/showUntil, so a typo
     would silently hide a node forever with no error anywhere. Check them
     first, then check that every gate points at one that exists. */
  var known = { start: true };
  var ms = doc.milestones || [];
  for (var k = 0; k < ms.length; k++) {
    if (!ms[k].id) return 'a milestone has no id';
    if (known[ms[k].id] && ms[k].id !== 'start') return 'duplicate milestone id "' + ms[k].id + '"';
    known[ms[k].id] = true;
  }
  var unknown = unknownFields(doc);
  if (unknown) return unknown;

  var gateErr = null;
  function checkGates(o, what) {
    if (gateErr) return;
    if (o.showFrom && !known[o.showFrom])   gateErr = what + ' has showFrom "'  + o.showFrom  + '", which is not a milestone';
    if (o.showUntil && !known[o.showUntil]) gateErr = what + ' has showUntil "' + o.showUntil + '", which is not a milestone';
  }

  for (var i = 0; i < mapIds.length; i++) {
    var id = mapIds[i], m = maps[id];
    if (!m.image)  return 'map "' + id + '" has no background image';
    if (!m.spawn || !isNum(m.spawn.x) || !isNum(m.spawn.y)) return 'map "' + id + '" has an invalid spawn';

    var seen = {};
    var nodes = m.nodes || [];
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (!n.id) return 'a node in "' + id + '" has no id';
      // Duplicate ids are silently destructive: behaviour overlays, boss flag
      // layouts and [data-id] lookups in overworld.js all key off node id.
      if (seen[n.id]) return 'duplicate node id "' + n.id + '" in map "' + id + '"';
      seen[n.id] = true;
      if (!n.image) return 'node "' + n.id + '" has no image';
      if (!isNum(n.x) || !isNum(n.y)) return 'node "' + n.id + '" has non-numeric coordinates';
      checkGates(n, 'node "' + n.id + '"');
      if (n.path) {
        for (var p = 0; p < n.path.length; p++) {
          if (!isNum(n.path[p].x) || !isNum(n.path[p].y)) {
            return 'node "' + n.id + '" has an invalid path waypoint at index ' + p;
          }
        }
      }
    }

    // `xi`, not `k` — `k` is the milestone loop counter above and `var` is
    // function-scoped, so reusing it here would quietly clobber it.
    var exits = m.exits || [];
    for (var xi = 0; xi < exits.length; xi++) {
      var x = exits[xi];
      if (!x.id) return 'an exit in "' + id + '" has no id';
      if (!x.target) return 'exit "' + x.id + '" in "' + id + '" has no target map';
      if (!maps[x.target]) return 'exit "' + x.id + '" points at map "' + x.target + '", which does not exist';
      if (!x.zone || !isNum(x.zone.x) || !isNum(x.zone.w)) return 'exit "' + x.id + '" has an invalid zone';
      checkGates(x, 'exit "' + x.id + '"');
    }

    var props = m.props || [];
    for (var pi = 0; pi < props.length; pi++) {
      var pr = props[pi];
      if (!pr.image) return 'a prop in "' + id + '" has no image';
      if (!isNum(pr.x) || !isNum(pr.y)) return 'a prop in "' + id + '" has non-numeric coordinates';
      checkGates(pr, 'a prop in "' + id + '"');
    }
  }
  return gateErr;
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* The serialiser writes a fixed set of keys. Anything it does not know about
   would be silently dropped on the next save -- data loss with no error, which
   is exactly the kind of failure that costs an afternoon. Refuse the save
   instead, and name the field. */
var KNOWN = {
  map:  ['displayName', 'image', 'spawn', 'startsFogged', 'props', 'nodes', 'exits'],
  node: ['id', 'name', 'kind', 'image', 'x', 'y', 'scale', 'flipX', 'label', 'note',
         'showFrom', 'showUntil', 'path', 'hook', 'tiers', 'flagNudge', 'serfFlagOn'],
  exit: ['id', 'label', 'zone', 'walkTo', 'walkOff', 'target', 'entryAt', 'note',
         'showFrom', 'showUntil'],
  prop: ['image', 'x', 'y', 'scale', 'rotation', 'flipX', 'flipY', 'note',
         'showFrom', 'showUntil']
};

function unknownFields(doc) {
  var bad = [];
  function check(o, kind, where) {
    Object.keys(o).forEach(function (k) {
      if (KNOWN[kind].indexOf(k) === -1) bad.push(where + ' has unknown field "' + k + '"');
    });
  }
  Object.keys(doc.maps || {}).forEach(function (id) {
    var m = doc.maps[id];
    check(m, 'map', 'map "' + id + '"');
    (m.nodes || []).forEach(function (n) { check(n, 'node', 'node "' + n.id + '"'); });
    (m.exits || []).forEach(function (x) { check(x, 'exit', 'exit "' + x.id + '"'); });
    (m.props || []).forEach(function (p, i) { check(p, 'prop', 'prop ' + i + ' in "' + id + '"'); });
  });
  return bad.length
    ? bad.join('; ') + ' — the serialiser would drop these. Add them to KNOWN and to serialise() in serve.js.'
    : null;
}

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/art') {
    return sendJson(res, 200, { maps: listArt(MAPS_DIR), nodes: listArt(NODES_DIR), topo: listArt(TOPO_DIR) });
  }
  if (url === '/api/save' && req.method === 'POST') {
    return handleSave(req, res);
  }

  if (url === '/tools/map-editor' || url === '/tools/map-editor/') url = '/tools/map-editor/index.html';
  if (url === '/') url = '/index.html';

  // Contain every read inside the repo. The editor is local-only, but a
  // traversal bug here would expose the whole filesystem over HTTP.
  var abs = path.join(ROOT, url);
  if (abs.indexOf(ROOT) !== 0) return send(res, 403, 'forbidden');

  fs.readFile(abs, function (err, buf) {
    if (err) return send(res, 404, 'not found: ' + url);
    send(res, 200, buf, TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, function () {
  console.log('');
  console.log('  Map editor  →  http://localhost:' + PORT + '/tools/map-editor/');
  console.log('  The game    →  http://localhost:' + PORT + '/');
  console.log('');
  console.log('  Saving writes ' + path.relative(ROOT, DATA_FILE) + ' (previous version kept as .bak).');
  console.log('  Ctrl-C to stop.');
  console.log('');
});

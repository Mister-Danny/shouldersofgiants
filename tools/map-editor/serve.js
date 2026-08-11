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
     GET  /api/art                → the map + node art on disk, for the picker
     POST /api/save                → overwrite data/map-data.js
     POST /api/save-level          → overwrite data/level-data.js
     GET  /api/boss-previews       → read-only extraction of the 5 boss files
     POST /api/save-boss-dialogue  → surgical dialogue rewrite in ONE boss file
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

var http = require('http');
var fs   = require('fs');
var path = require('path');
var bossExtract = require('./boss-extract.js');

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
/* ── Field table ────────────────────────────────────────────────────────
   ONE list, per kind, of every field beyond the required core (written by
   hand at a fixed spot in serialise() below, since that shape is old and
   stable). This used to be three separately hand-kept lists: serialise()'s
   own if-chain of what to write, KNOWN's flat array of what unknownFields()
   accepts, and — for required fields — a matching presence check in
   validate(). The dangerous direction was a field added to KNOWN (so the
   editor accepts and round-trips it in memory) without a matching
   serialise() case: it saves fine, then vanishes from disk on the very
   next save, silently. Optional fields with a `write(o)` are now emitted
   from this table, so that specific failure mode can't happen — the field
   is either wired to both or neither.

   A `write` of null marks a field that's real (known, required-checked)
   but stays hand-emitted at a fixed position in serialise() — either
   because it's interleaved among required fields (exit's walkOff) or
   always written with a default rather than conditionally (prop's scale/
   rotation). `gate: true` marks showFrom/showUntil, already unified by the
   gates() helper above; they need a table entry only so KNOWN sees them.
   required-field presence/type checks in validate() stay hand-written —
   unlike the optional-tail case, a required field silently missing was
   never silent, it already hard-blocks the save with its own message. */
function OPT(key, write) { return { key: key, write: write || null }; }
function GATE(key) { return { key: key, gate: true }; }

var FIELDS = {
  map: {
    required: ['displayName', 'image', 'spawn', 'startsFogged'],
    // imageFit/props/nodes/exits/routes are structural containers, always
    // written by hand in serialise() — not optional scalar fields.
    optional: [],
    late: []
  },
  node: {
    required: ['id', 'name', 'kind', 'image', 'x', 'y'],
    optional: [
      OPT('scale',       function (n) { return n.scale != null ? 'scale: ' + scaleNum(n.scale) : null; }),
      OPT('flipX',       function (n) { return n.flipX ? 'flipX: true' : null; }),
      OPT('rotation',    function (n) { return n.rotation ? 'rotation: ' + num(n.rotation) : null; }),
      OPT('label',       function (n) { return n.label ? 'label: ' + q(n.label) : null; }),
      OPT('hook',        function (n) { return n.hook ? 'hook:  ' + q(n.hook) : null; }),
      OPT('tiers',       function (n) { return n.tiers != null ? 'tiers: ' + num(n.tiers) : null; }),
      OPT('flagNudge',   function (n) { return n.flagNudge ? 'flagNudge: { dx: ' + num(n.flagNudge.dx || 0) + ', dy: ' + num(n.flagNudge.dy || 0) + ' }' : null; }),
      OPT('serfFlagOn',  function (n) { return n.serfFlagOn ? 'serfFlagOn: ' + q(n.serfFlagOn) : null; }),
      OPT('victoryFlag', function (n) { return n.victoryFlag ? 'victoryFlag: true' : null; }),
      GATE('showFrom'), GATE('showUntil')
    ],
    late: [ OPT('note', function (n) { return n.note ? 'note: ' + q(n.note) : null; }) ]
  },
  exit: {
    required: ['id', 'label', 'zone', 'walkTo', 'target', 'entryAt'],
    optional: [
      OPT('walkOff'),   // positional — hand-emitted between walkTo and target
      GATE('showFrom'), GATE('showUntil')
    ],
    late: [ OPT('note', function (x) { return x.note ? 'note: ' + q(x.note) : null; }) ]
  },
  prop: {
    required: ['image', 'x', 'y'],
    optional: [
      OPT('scale'),     // always written, with a default — hand-emitted
      OPT('rotation'),  // always written, with a default — hand-emitted
      OPT('flipX', function (p) { return p.flipX ? 'flipX: true' : null; }),
      OPT('flipY', function (p) { return p.flipY ? 'flipY: true' : null; }),
      GATE('showFrom'), GATE('showUntil')
    ],
    late: [ OPT('note', function (p) { return p.note ? 'note: ' + q(p.note) : null; }) ]
  }
};

function fieldsOf(kind) {
  var f = FIELDS[kind];
  return f.required.concat(f.optional.map(function (o) { return o.key; }))
                    .concat(f.late.map(function (o) { return o.key; }));
}

function serialise(doc) {
  var HEADER = fs.readFileSync(path.join(__dirname, 'data-header.txt'), 'utf8');
  var maps = doc.maps || {};
  var s = HEADER + '\nwindow.SOG_MAP_DATA = {\n';

  /* ── Milestones ── the ordered story beats. Order matters here only for the
     editor's scrubber; the game decides visibility from the flag. Milestones
     are the one place left where a hand-written prose comment can still be
     silently dropped: they aren't part of FIELDS/KNOWN (unknownFields()
     never looks at doc.milestones, so a stray field here never fails a
     save), but this loop only ever emits id/label/flag/note — anything else
     hand-added to a milestone object round-trips in the editor's memory for
     the session and then vanishes on the next save. `note` is the one
     scalar this DOES write back, same "survives saving" contract as node
     and prop notes — use it, not a // comment above the entry. */
  s += '\n  milestones: [\n';
  (doc.milestones || []).forEach(function (ms, i) {
    s += '    { id: ' + q(ms.id) + ', label: ' + q(ms.label) +
         ', flag: ' + (ms.flag ? q(ms.flag) : 'null') +
         (ms.note ? ', note: ' + q(ms.note) : '') + ' }' +
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
    /* How the background is framed inside the 1280x600 map area. Omitted when
       it is the plain centred default, so most maps stay uncluttered. */
    if (m.imageFit && (m.imageFit.anchor || m.imageFit.scale || m.imageFit.offsetX || m.imageFit.offsetY)) {
      var f = m.imageFit, bits = [];
      if (f.anchor)  bits.push('anchor: ' + q(f.anchor));
      if (f.scale)   bits.push('scale: ' + scaleNum(f.scale));
      if (f.offsetX) bits.push('offsetX: ' + num(f.offsetX));
      if (f.offsetY) bits.push('offsetY: ' + num(f.offsetY));
      s += '    imageFit: { ' + bits.join(', ') + ' },\n';
    }
    s += '    spawn: { x: ' + num(m.spawn.x) + ', y: ' + num(m.spawn.y) + ' },\n';
    s += '    startsFogged: ' + (m.startsFogged ? 'true' : 'false') + ',\n';

    /* ── Topography ── decorative, non-interactive, painted behind everything. */
    s += '    props: [' + ((m.props || []).length ? '\n' : '');
    (m.props || []).forEach(function (p, i) {
      s += '      { image: ' + q(p.image) +
           ', x: ' + num(p.x) + ', y: ' + num(p.y) +
           ', scale: ' + scaleNum(p.scale == null ? 1 : p.scale) +
           ', rotation: ' + num(p.rotation || 0);
      FIELDS.prop.optional.forEach(function (f) {
        if (!f.write) return;
        var frag = f.write(p);
        if (frag != null) s += ', ' + frag;
      });
      s += gates(p, '');
      FIELDS.prop.late.forEach(function (f) {
        var frag = f.write(p);
        if (frag != null) s += ', ' + frag;
      });
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
      // Boss ladder fields (hook/tiers/flagNudge/serfFlagOn/victoryFlag) and
      // everything else optional live in FIELDS.node — see the field table.
      FIELDS.node.optional.forEach(function (f) {
        if (!f.write) return;
        var frag = f.write(n);
        if (frag != null) s += ',\n        ' + frag;
      });
      s += gates(n, ',\n        ');
      FIELDS.node.late.forEach(function (f) {
        var frag = f.write(n);
        if (frag != null) s += ',\n        ' + frag;
      });
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
      FIELDS.exit.late.forEach(function (f) {
        var frag = f.write(x);
        if (frag != null) s += ',\n        ' + frag;
      });
      s += '\n      }' + (i < m.exits.length - 1 ? ',' : '') + '\n';
    });
    s += (m.exits || []).length ? '    ],\n' : '],\n';

    /* ── Routes ── the walking graph. `from`/`to` are endpoint ids: a node id,
       an exit id, or 'spawn'. `waypoints` are the INTERMEDIATE bends only —
       the two endpoints are implied, which is what makes a route reversible
       and makes "no entry here" mean a straight line. Only bent routes are
       stored; every other pair is a straight line by omission. */
    s += '    routes: [' + ((m.routes || []).length ? '\n' : '');
    (m.routes || []).forEach(function (r, i) {
      s += '      { from: ' + q(r.from) + ', to: ' + q(r.to) + ', waypoints: [' +
           (r.waypoints || []).map(function (w) {
             return '{ x: ' + num(w.x) + ', y: ' + num(w.y) + ' }';
           }).join(', ') + '] }' + (i < m.routes.length - 1 ? ',' : '') + '\n';
    });
    s += (m.routes || []).length ? '    ]\n' : ']\n';

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
    // Catch a broken art path before it reaches disk. Renaming a background, or
    // saving it as .jpeg instead of .jpg, otherwise leaves the map blank in game
    // with nothing to explain why.
    if (!fs.existsSync(path.join(ROOT, m.image))) {
      return 'map "' + id + '" points at "' + m.image + '", which does not exist on disk';
    }
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

    /* Endpoint ids must be unique across nodes AND exits, because a route
       names them in one namespace. A collision would silently route to the
       wrong thing. */
    var endpoints = { spawn: true };
    nodes.forEach(function (n) { endpoints[n.id] = true; });
    for (var ei = 0; ei < exits.length; ei++) {
      if (endpoints[exits[ei].id]) return 'exit "' + exits[ei].id + '" in "' + id +
        '" shares an id with a node — route endpoints must be unique';
      endpoints[exits[ei].id] = true;
    }

    var routes = m.routes || [];
    var seenRoute = {};
    for (var ri = 0; ri < routes.length; ri++) {
      var rt = routes[ri];
      if (!endpoints[rt.from]) return 'route in "' + id + '" starts at "' + rt.from + '", which is not a node, exit or spawn';
      if (!endpoints[rt.to])   return 'route in "' + id + '" ends at "' + rt.to + '", which is not a node, exit or spawn';
      if (rt.from === rt.to)   return 'route in "' + id + '" starts and ends at "' + rt.from + '"';
      // Routes are undirected, so A->B and B->A are the same route. Two entries
      // would mean one of them silently never gets used.
      var key = [rt.from, rt.to].sort().join('\u0000');
      if (seenRoute[key]) return 'map "' + id + '" has two routes between "' + rt.from + '" and "' + rt.to + '"';
      seenRoute[key] = true;
      for (var wi = 0; wi < (rt.waypoints || []).length; wi++) {
        if (!isNum(rt.waypoints[wi].x) || !isNum(rt.waypoints[wi].y)) {
          return 'route ' + rt.from + '->' + rt.to + ' in "' + id + '" has an invalid waypoint at index ' + wi;
        }
      }
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
   instead, and name the field. Derived from FIELDS (see serialise() above) —
   map's containers (props/nodes/exits/routes) and imageFit aren't scalar
   fields, so they're listed here directly rather than through fieldsOf(). */
var KNOWN = {
  map:  fieldsOf('map').concat(['imageFit', 'props', 'nodes', 'exits', 'routes']),
  node: fieldsOf('node'),
  exit: fieldsOf('exit'),
  prop: fieldsOf('prop')
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

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL DATA — battle/market levels (data/level-data.js). Same discipline as
   the map section above: FIELDS tables are the single declaration a field
   gets, driving KNOWN and serialise() together so a field can't be "known"
   without also being written. Deliberately its own file, own endpoint
   (/api/save-level below), own backup — handleSaveLevel() never touches
   DATA_FILE/serialise()/validate() (the map ones), so a level save
   structurally cannot reach map-data.js.
   ══════════════════════════════════════════════════════════════════════════ */
var LEVEL_DATA_FILE = path.join(ROOT, 'data', 'level-data.js');
var CARDS_FILE       = path.join(ROOT, 'js', 'cards.js');

/* js/cards.js assigns a plain `const CARDS`, not JSON — same reason
   loadMapData() in editor.js has to actually run map-data.js client-side
   rather than parse it. Read fresh per call; the file is small, and this
   runs on a save or a GET /api/level-meta, never per static-file request. */
function loadCards() {
  var src = fs.readFileSync(CARDS_FILE, 'utf8');
  return new Function('window', src + '\nreturn CARDS;')({});
}
function loadCardIds() {
  return loadCards().map(function (c) { return c.id; });
}

/* Every abilityKey the battle engine actually branches on, discovered by
   scanning the engine files rather than hand-copied into a list here — a
   hand-copied list is exactly the "known in one place but not the other"
   failure this session spent all day closing for map-data.js. A new
   ability key is a code change by definition (the level form will say so),
   so this can only grow when one of these files does — nothing to keep in
   sync by hand. */
var ABILITY_KEY_FILES = [
  'js/game/abilities.js', 'js/game/board.js', 'js/game/state.js',
  'js/game/ai.js', 'js/game/input.js', 'js/locations.js',
  'js/game.js', 'js/tutorial.js'
];
function discoverAbilityKeys() {
  var keys = {};
  ABILITY_KEY_FILES.forEach(function (rel) {
    var abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    var src = fs.readFileSync(abs, 'utf8');
    var re = /abilityKey\s*[!=]==?\s*'([A-Z0-9_]+)'/g, m;
    while ((m = re.exec(src))) keys[m[1]] = true;
  });
  return Object.keys(keys).sort();
}

/* A level's three battle locations. Every field is always written (no
   optional tail here — unlike a node, nothing about a location has been
   added incrementally over time) but abilityKey/thumbnailCrop are
   genuinely nullable, so KNOWN still needs to be centrally declared. */
var LOCATION_FIELDS = { required: ['id', 'name', 'region', 'abilityText', 'abilityKey', 'image', 'thumbnailCrop'] };

/* required = the engine reads these with no guard (cfg.structure.handStart,
   not (cfg.structure||{}).handStart) — absence is a crash, not a degrade.
   optional = the engine guards every read (`ctx.config && ctx.config.
   presentation`, `level.dialogue || {}`, etc.) and falls back gracefully.
   `note` is the same "survives saving" contract as node.note in the map
   editor — see data-header-level.txt. */
var LEVEL_FIELDS = {
  required: ['kind', 'tiers', 'structure', 'resource', 'draw', 'decks', 'locations', 'scoring'],
  optional: ['presentation', 'rulesPopup', 'bleep', 'reward', 'dialogue'],
  late: ['note']
};

function levelFieldsOf() {
  var f = LEVEL_FIELDS;
  return f.required.concat(f.optional).concat(f.late);
}

var KNOWN_LEVEL = { level: levelFieldsOf(), location: LOCATION_FIELDS.required };

function unknownLevelFields(doc) {
  var bad = [];
  Object.keys(doc.levels || {}).forEach(function (id) {
    var lvl = doc.levels[id];
    Object.keys(lvl).forEach(function (k) {
      if (KNOWN_LEVEL.level.indexOf(k) === -1) bad.push('level "' + id + '" has unknown field "' + k + '"');
    });
    (lvl.locations || []).forEach(function (loc, i) {
      Object.keys(loc).forEach(function (k) {
        if (KNOWN_LEVEL.location.indexOf(k) === -1) bad.push('level "' + id + '" location ' + i + ' has unknown field "' + k + '"');
      });
    });
  });
  return bad.length
    ? bad.join('; ') + ' — the serialiser would drop these. Add them to LEVEL_FIELDS/LOCATION_FIELDS and serialiseLevel() in serve.js.'
    : null;
}

function validateLevel(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'payload must be an object';
  var levels = doc.levels;
  if (!levels || typeof levels !== 'object') return 'payload has no levels';
  var ids = Object.keys(levels);
  if (!ids.length) return 'refusing to save zero levels';

  var unknown = unknownLevelFields(doc);
  if (unknown) return unknown;

  var cardIds;
  try { cardIds = loadCardIds(); } catch (e) { return 'could not read js/cards.js: ' + e.message; }
  var knownCardIds = {};
  cardIds.forEach(function (id) { knownCardIds[id] = true; });

  var abilityKeys = {};
  discoverAbilityKeys().forEach(function (k) { abilityKeys[k] = true; });

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i], lvl = levels[id];

    for (var r = 0; r < LEVEL_FIELDS.required.length; r++) {
      var need = LEVEL_FIELDS.required[r];
      if (lvl[need] == null) return 'level "' + id + '" has no ' + need;
    }
    if (lvl.kind !== 'battle' && lvl.kind !== 'market') return 'level "' + id + '" has unknown kind "' + lvl.kind + '"';
    if (lvl.kind === 'market') return 'level "' + id + '" is kind "market" — not wired in js/level-runtime.js yet, only "battle" is';
    if (lvl.tiers !== 1 && lvl.tiers !== 2) return 'level "' + id + '" has tiers ' + lvl.tiers + ', expected 1 or 2';

    // capitalByTurn is optional (js/game.js falls back to the flat resource.
    // capital when absent — see _capitalForTurn), but if present it has to
    // cover every turn or the last turns would silently read undefined.
    var cbt = lvl.resource && lvl.resource.capitalByTurn;
    if (cbt) {
      if (!Array.isArray(cbt) || cbt.length !== lvl.structure.turns) {
        return 'level "' + id + '" has resource.capitalByTurn with ' + (cbt.length || 0) +
               ' entries, but structure.turns is ' + lvl.structure.turns + ' — needs one entry per turn';
      }
      for (var ci = 0; ci < cbt.length; ci++) {
        if (!isNum(cbt[ci])) return 'level "' + id + '" has a non-numeric capitalByTurn entry at turn ' + (ci + 1);
      }
    }

    var locs = lvl.locations;
    if (!Array.isArray(locs) || locs.length !== 3) return 'level "' + id + '" needs exactly 3 locations, has ' + (locs ? locs.length : 0);
    for (var li = 0; li < locs.length; li++) {
      var loc = locs[li];
      for (var lr = 0; lr < LOCATION_FIELDS.required.length; lr++) {
        var lneed = LOCATION_FIELDS.required[lr];
        // abilityKey/thumbnailCrop are nullable, everything else must be set.
        if (lneed !== 'abilityKey' && lneed !== 'thumbnailCrop' && loc[lneed] == null) {
          return 'level "' + id + '" location ' + li + ' has no ' + lneed;
        }
      }
      if (loc.abilityKey && !abilityKeys[loc.abilityKey]) {
        return 'level "' + id + '" location ' + li + ' has abilityKey "' + loc.abilityKey +
               '", which no engine file checks for — a new ability needs a code change first';
      }
      if (loc.image && !fs.existsSync(path.join(ROOT, loc.image))) {
        return 'level "' + id + '" location ' + li + ' points at "' + loc.image + '", which does not exist on disk';
      }
    }

    // Deck ids — the level equivalent of the map's art-exists-on-disk check.
    // 'active-deck' has no ids to check; 'explicit' must name real cards.
    var checkDeck = function (who, deck) {
      if (!deck || !deck.source) return who + ' has no source';
      if (deck.source === 'explicit') {
        if (!Array.isArray(deck.ids) || !deck.ids.length) return who + ' has source "explicit" but no ids';
        for (var di = 0; di < deck.ids.length; di++) {
          if (!knownCardIds[deck.ids[di]]) return who + ' has id ' + deck.ids[di] + ', which is not in CARDS (js/cards.js)';
        }
      } else if (who.indexOf('.player') !== -1 && deck.source !== 'active-deck') {
        return who + ' has source "' + deck.source + '" — expected "active-deck" or "explicit"';
      } else if (who.indexOf('.ai') !== -1 && deck.source !== 'explicit') {
        return who + ' has source "' + deck.source + '" — a level-editor level needs "explicit" (a scripted opponent), not arcadium\'s random deck or the 2P "scripted" mode';
      }
      return null;
    };
    var deckErr = checkDeck('level "' + id + '".decks.player', lvl.decks && lvl.decks.player) ||
                  checkDeck('level "' + id + '".decks.ai', lvl.decks && lvl.decks.ai);
    if (deckErr) return deckErr;
  }
  return null;
}

function serialiseLocation(loc) {
  return '{ id: ' + num(loc.id) + ', name: ' + q(loc.name) + ', region: ' + q(loc.region) +
         ', abilityText: ' + q(loc.abilityText || '') +
         ', abilityKey: ' + (loc.abilityKey ? q(loc.abilityKey) : 'null') +
         ', image: ' + q(loc.image) +
         ', thumbnailCrop: ' + (loc.thumbnailCrop
           ? '{ bgSize: ' + q(loc.thumbnailCrop.bgSize) + ', bgPos: ' + q(loc.thumbnailCrop.bgPos) + ' }'
           : 'null') +
         ' }';
}

function serialiseDeck(deck) {
  if (!deck) return '{}';
  var bits = ['source: ' + q(deck.source)];
  if (deck.ids) bits.push('ids: [' + deck.ids.map(num).join(', ') + ']');
  if (deck.shuffle) bits.push('shuffle: true');
  return '{ ' + bits.join(', ') + ' }';
}

function serialiseDialogueLines(lines) {
  if (!lines || !lines.length) return '[]';
  return '[\n' + lines.map(function (l) {
    return '      { who: ' + q(l.who) + ', text: ' + q(l.text) + ' }';
  }).join(',\n') + '\n    ]';
}

function serialiseLevel(id, lvl) {
  var s = '    ' + q(id) + ': {\n';
  s += '      kind:  ' + q(lvl.kind) + ',\n';
  s += '      tiers: ' + num(lvl.tiers) + ',\n\n';

  s += '      structure: {\n';
  ['turns', 'locationsCount', 'slotsPerLocation', 'handStart', 'maxHandSize'].forEach(function (k, i, arr) {
    s += '        ' + k + ': ' + num(lvl.structure[k]) + (i < arr.length - 1 ? ',\n' : '\n');
  });
  s += '      },\n';

  s += '      resource: { model: ' + q(lvl.resource.model) + ', capital: ' + num(lvl.resource.capital) +
       (lvl.resource.resetEachTurn ? ', resetEachTurn: true' : '') +
       (lvl.resource.capitalByTurn ? ', capitalByTurn: [' + lvl.resource.capitalByTurn.map(num).join(', ') + ']' : '') +
       ' },\n';
  s += '      draw:     { model: ' + q(lvl.draw.model) + ' },\n\n';

  s += '      decks: {\n';
  s += '        player: ' + serialiseDeck(lvl.decks.player) + ',\n';
  s += '        ai:     ' + serialiseDeck(lvl.decks.ai) + '\n';
  s += '      },\n\n';

  s += '      locations: [\n';
  s += lvl.locations.map(function (loc) { return '        ' + serialiseLocation(loc); }).join(',\n');
  s += '\n      ],\n';

  s += '      scoring: { rule: ' + q(lvl.scoring.rule) + ', winThreshold: ' + num(lvl.scoring.winThreshold) +
       ', tiebreaker: ' + q(lvl.scoring.tiebreaker) + ', exactTie: ' + q(lvl.scoring.exactTie) + ' },\n';

  if (lvl.presentation) {
    s += '\n      presentation: {\n';
    var pKeys = ['bodyClass', 'allyAvatar', 'opponentAvatar', 'opponentBubblePortrait', 'popAlly'];
    var pLines = [];
    pKeys.forEach(function (k) {
      if (lvl.presentation[k] == null) return;
      pLines.push('        ' + k + ': ' + (k === 'popAlly' ? (lvl.presentation[k] ? 'true' : 'false') : q(lvl.presentation[k])));
    });
    s += pLines.join(',\n') + '\n      },\n';
  }

  if (lvl.rulesPopup) {
    s += '\n      rulesPopup: {\n';
    s += '        title: ' + q(lvl.rulesPopup.title) + ',\n';
    s += '        body: [\n          ' + (lvl.rulesPopup.body || []).map(q).join(',\n          ') + '\n        ]\n';
    s += '      },\n';
  }

  if (lvl.bleep) {
    s += '\n      bleep: {\n';
    s += '        profiles: {\n';
    var profKeys = Object.keys(lvl.bleep.profiles || {});
    s += profKeys.map(function (pk) {
      var p = lvl.bleep.profiles[pk];
      return '          ' + pk + ': { freq: ' + num(p.freq) + ', wobble: ' + num(p.wobble) + ', peak: ' + p.peak +
             ', decay: ' + p.decay + ', dur: ' + p.dur + ', every: ' + num(p.every) + ' }';
    }).join(',\n') + '\n        },\n';
    s += '        defaultKey: ' + q(lvl.bleep.defaultKey) + '\n';
    s += '      },\n';
  }

  if (lvl.reward) {
    s += '\n      reward: { cardIdOnGiantWin: ' + num(lvl.reward.cardIdOnGiantWin) + ' },\n';
  }

  if (lvl.dialogue) {
    s += '\n      dialogue: {\n';
    var dKeys = Object.keys(lvl.dialogue);
    s += dKeys.map(function (dk) {
      return '        ' + dk + ': ' + serialiseDialogueLines(lvl.dialogue[dk]);
    }).join(',\n') + '\n';
    s += '      }' + (lvl.note ? ',\n' : '\n');
  }

  if (lvl.note) s += '\n      note: ' + q(lvl.note) + '\n';

  s += '    }';
  return s;
}

function serialiseLevels(doc) {
  var HEADER = fs.readFileSync(path.join(__dirname, 'data-header-level.txt'), 'utf8');
  var ids = Object.keys(doc.levels || {});
  var s = HEADER + '\nwindow.SOG_LEVEL_DATA = {\n  levels: {\n';
  s += ids.map(function (id) { return serialiseLevel(id, doc.levels[id]); }).join(',\n');
  s += '\n  }\n};\n';
  return s;
}

function handleSaveLevel(req, res) {
  var body = '';
  req.on('data', function (c) {
    body += c;
    if (body.length > 5e6) { req.destroy(); }
  });
  req.on('end', function () {
    var doc;
    try {
      doc = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'bad JSON: ' + e.message });
    }

    var err = validateLevel(doc);
    if (err) return sendJson(res, 400, { ok: false, error: err });

    var out;
    try {
      out = serialiseLevels(doc);
      new Function(makeCheckable(out));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'level serialiser produced invalid JS: ' + e.message });
    }

    try {
      if (fs.existsSync(LEVEL_DATA_FILE)) fs.copyFileSync(LEVEL_DATA_FILE, LEVEL_DATA_FILE + '.bak');
      fs.mkdirSync(path.dirname(LEVEL_DATA_FILE), { recursive: true });
      fs.writeFileSync(LEVEL_DATA_FILE, out, 'utf8');
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'write failed: ' + e.message });
    }

    var ids = Object.keys(doc.levels || {});
    console.log('[map-editor] saved data/level-data.js — ' + ids.length + ' levels');
    sendJson(res, 200, { ok: true, levels: ids.length });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Phase 2 — dialogue write-back for the 5 hand-authored bosses. Deliberately
   its own function/endpoint, not folded into handleSaveLevel: the two write
   to completely different files (a boss's own .js vs data/level-data.js)
   under a completely different validation model (surgical span replacement
   vs whole-document serialisation), and mixing them would mean one bug
   could reach both.

   Body shape: { bossKey: '<nodeId>', dialogue: { <schemaKey>: [{who,text}] } }
   bossKey is the client's nodeId (viewBoss()'s key, e.g. 'walls-of-uruk' for
   Gilgamesh) — resolved server-side via bossExtract.bossSourceByNodeId,
   NEVER a client-supplied file path. That resolution, plus BOSS_SOURCES'
   own hand-curated dialogue-key → varName map, is what makes this endpoint
   structurally unable to touch any file or variable outside the 5 boss
   files' own dialogue arrays — there is no field in the request body that
   ever becomes a path or a var name directly. */
function handleSaveBossDialogue(req, res) {
  var body = '';
  req.on('data', function (c) {
    body += c;
    if (body.length > 2e6) { req.destroy(); }
  });
  req.on('end', function () {
    var payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'bad JSON: ' + e.message });
    }

    var src = payload && payload.bossKey ? bossExtract.bossSourceByNodeId(payload.bossKey) : null;
    if (!src) return sendJson(res, 400, { ok: false, error: 'unknown bossKey: ' + (payload && payload.bossKey) });

    var dialogue = payload.dialogue || {};
    var schemaKeys = Object.keys(dialogue);
    if (!schemaKeys.length) return sendJson(res, 200, { ok: true, changed: [], commentsLost: [], message: 'nothing submitted' });

    // Resolve every submitted key to a real varName BEFORE touching the
    // file at all — a sameAs/unknown key aborts the whole save rather than
    // silently skipping it, so a client bug can't look like a successful
    // partial save.
    var edits = [];
    for (var i = 0; i < schemaKeys.length; i++) {
      var schemaKey = schemaKeys[i];
      var spec = src.dialogue[schemaKey];
      if (spec == null) return sendJson(res, 400, { ok: false, error: 'no such dialogue key "' + schemaKey + '" for ' + payload.bossKey });
      if (typeof spec === 'object' && spec.sameAs) {
        return sendJson(res, 400, { ok: false, error: '"' + schemaKey + '" shares its array with "' + spec.sameAs + '" — not directly editable' });
      }
      var varName = typeof spec === 'object' ? spec.varName : spec;
      edits.push({ varName: varName, lines: dialogue[schemaKey] });
    }

    var abs = path.join(ROOT, src.file);
    var original;
    try {
      original = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'could not read ' + src.file + ': ' + e.message });
    }

    var result;
    try {
      result = bossExtract.applyDialogueEdits(original, edits);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'write-back failed: ' + e.message });
    }

    // Any single array failing validation (not found / not a plain literal /
    // fields this editor can't represent) aborts the ENTIRE save — nothing
    // gets written, not even the arrays that were fine. A confusing partial
    // save is worse than making the author retry.
    var failed = result.results.filter(function (r) { return r.error; });
    if (failed.length) {
      return sendJson(res, 400, { ok: false, error: 'refused: ' + failed.map(function (r) { return r.varName + ': ' + r.error; }).join('; ') });
    }

    var changed = result.results.filter(function (r) { return r.changed; });
    if (!changed.length) {
      // True no-op — the file was never touched, not even re-written with
      // identical bytes. See applyDialogueEdits' own docstring for why this
      // is the case that has to hold exactly.
      return sendJson(res, 200, { ok: true, changed: [], commentsLost: [], message: 'no changes' });
    }

    // Whole-file syntax check before anything touches disk. new Function
    // COMPILES the body without running it (there is no top-level call
    // here, same as makeCheckable's window-wrapped map/level check above) —
    // a real syntax error throws here; an undefined SOG/window reference
    // does not, since nothing executes.
    try {
      new Function(result.fileText);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: src.file + ' would not parse after this edit: ' + e.message });
    }

    try {
      fs.copyFileSync(abs, abs + '.bak');
      fs.writeFileSync(abs, result.fileText, 'utf8');
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'write failed: ' + e.message });
    }

    var commentsLost = changed.filter(function (r) { return r.hadComments; }).map(function (r) { return r.varName; });
    console.log('[map-editor] saved ' + src.file + ' — ' + changed.length + ' dialogue array(s) rewritten' +
                (commentsLost.length ? ' (comments lost in ' + commentsLost.join(', ') + ')' : ''));
    sendJson(res, 200, { ok: true, changed: changed.map(function (r) { return r.varName; }), commentsLost: commentsLost });
  });
}

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/art') {
    return sendJson(res, 200, { maps: listArt(MAPS_DIR), nodes: listArt(NODES_DIR), topo: listArt(TOPO_DIR) });
  }
  if (url === '/api/save' && req.method === 'POST') {
    return handleSave(req, res);
  }
  if (url === '/api/save-level' && req.method === 'POST') {
    return handleSaveLevel(req, res);
  }
  if (url === '/api/level-meta') {
    // Same scanners validateLevel() uses to reject a bad save — the level
    // form's card picker and abilityKey dropdown read from this instead of
    // a hand-copied list in the client, so there is exactly one place each
    // closed set is computed, not a server copy and a client copy that can
    // drift apart.
    var meta;
    try {
      meta = { cards: loadCards(), abilityKeys: discoverAbilityKeys() };
    } catch (e) {
      return sendJson(res, 500, { error: 'could not read js/cards.js: ' + e.message });
    }
    return sendJson(res, 200, meta);
  }
  if (url === '/api/boss-previews') {
    // Phase 1, read-only: the 5 hand-authored bosses, extracted fresh from
    // their own .js files on every request (no caching — these files are
    // hand-edited directly, not through this tool, so a stale cache here
    // would show the wrong thing after any edit). See boss-extract.js.
    var previews;
    try {
      previews = bossExtract.buildAllBossPreviews();
    } catch (e) {
      return sendJson(res, 500, { error: 'boss extraction failed: ' + e.message });
    }
    return sendJson(res, 200, previews);
  }
  if (url === '/api/save-boss-dialogue' && req.method === 'POST') {
    return handleSaveBossDialogue(req, res);
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

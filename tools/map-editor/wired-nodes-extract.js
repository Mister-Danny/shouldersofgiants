/* ══════════════════════════════════════════════════════════════════════════
   wired-nodes-extract.js — derives the "does clicking this node do
   anything?" set from js/overworld.js directly, instead of a hand-
   maintained list.

   REPLACES the old WIRED_NODES hardcoded Set in map/inspector.js. That
   Set drifted from onNodeClick once already (never updated for a node
   that WAS wired) — this scans the actual dispatch code on every
   request instead, so it cannot drift: the answer IS the source.

   Every node click funnels through exactly one place: js/overworld.js
   wires each node element as `nodeEl.addEventListener('click', function
   () { onNodeClick(n); })` (six call sites, all identical) — there is no
   side-channel click handler anywhere else. Inside onNodeClick, every
   hand-authored dispatch branch is a literal `node.id === '<id>'`
   comparison (confirmed: this pattern currently matches all 9 branches
   with zero false positives, and nothing else in the file matches it
   outside onNodeClick's own body). A node whose battle is reached via
   SOG_LEVEL_DATA (Ramses, the spike) needs no branch here at all — that
   path is handled generically at the top of onNodeClick and is checked
   separately (State.levels) by the callers of this module, not by this
   scan.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

var fs   = require('fs');
var path = require('path');
var boss = require('./boss-extract.js');

var OVERWORLD_FILE = path.join(__dirname, '..', '..', 'js', 'overworld.js');

/* Scoped to onNodeClick's OWN function body (brace-matched via
   findFunctionBodySpan, not a whole-file regex) so a coincidental
   `node.id === '...'` comparison in some unrelated function could never
   leak into this list. Read fresh from disk every call — this file is
   hand-edited directly during a dev session, same reasoning as
   boss-extract.js's own require-cache-busting in serve.js. */
function scanWiredNodeIds() {
  var src = fs.readFileSync(OVERWORLD_FILE, 'utf8');
  var body = boss.findFunctionBodySpan(src, 'onNodeClick');
  if (!body) return { found: false, ids: [], error: 'onNodeClick not found in js/overworld.js' };

  var re = /\bnode\.id\s*===\s*'([^']+)'/g;
  var ids = [];
  var m;
  while ((m = re.exec(body.text))) {
    if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
  }
  return { found: true, ids: ids };
}

module.exports = { scanWiredNodeIds: scanWiredNodeIds };

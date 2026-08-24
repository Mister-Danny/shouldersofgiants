#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   BOSS EXTRACTION — read-only view of the 5 hand-authored bosses inside the
   level editor (Phase 1). Extraction is STATIC TEXT ANALYSIS, never eval of
   the whole boss file: these files reference SOG.state, SOG.DialogueRunner,
   window, and each other at load time, none of which exist in this Node
   process, and eval-ing the top-level IIFE would either throw or silently
   run with those dependencies undefined. Every boss file is read but never
   written, moved, or restructured — read only, per spec.

   Two mechanisms, both operating on the RAW SOURCE TEXT of one file:

   findVarSpan(src, name)      — locates `var NAME = <array-or-object>;` by
                                  bracket-matching (respecting string
                                  literals, so a bracket character INSIDE a
                                  dialogue line's text can't desync it), and
                                  returns the exact byte span of the value.
                                  This is also exactly what Phase 2's
                                  surgical replacement will use to find what
                                  to overwrite — same span, same discipline
                                  as the map/level serialisers: locate one
                                  field's exact bytes, touch nothing else.

   findFunctionReturnSpan(src, name) — same idea for the `function NAME() {
                                  return [ ... ]; }` shape every boss uses
                                  for its 3 locations (_sargonLocations(),
                                  _hammurabiLocations(), etc.) — finds the
                                  function body, then the `return`'d literal
                                  inside it.

   extractLiteral(src, span)   — given a span, isolated-evals JUST that
                                  span's text (`new Function('return ' +
                                  text)()`) — safe because a plain literal
                                  needs no external bindings — and ALSO
                                  checks the raw text for purity: strip every
                                  quoted string, then anything left over that
                                  isn't whitespace/brackets/known bare words
                                  (who/text/slamBefore/revealBefore/true/
                                  false) means the source contains an
                                  identifier, concatenation, or a function
                                  call — i.e. NOT a plain literal, however
                                  cleanly it happens to eval right now. That
                                  distinction is the whole point: `'a' + 'b'`
                                  evals fine with no error, but it is still
                                  dynamically built, and Phase 2 must never
                                  treat it as safe to silently overwrite.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

var fs = require('fs');
var path = require('path');

function findVarSpan(src, name) {
  var re = new RegExp('\\bvar\\s+' + name + '\\s*=\\s*');
  var m = re.exec(src);
  if (!m) return null;
  var declStart = m.index;
  var valueStart = m.index + m[0].length;
  return _bracketSpan(src, valueStart, declStart);
}

/* `function NAME() { ... return LITERAL; ... }` — finds the function body
   first (brace-matched), then the return statement's literal within it. */
function findFunctionReturnSpan(src, name) {
  var re = new RegExp('\\bfunction\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) return null;
  var bodyOpen = m.index + m[0].length - 1;   // index of the opening '{'
  var bodySpan = _bracketSpan(src, bodyOpen, m.index);
  if (!bodySpan) return null;
  var body = src.slice(bodyOpen, bodySpan.valueEnd);
  var retRe = /\breturn\s*/;
  var rm = retRe.exec(body);
  if (!rm) return null;
  var valueStart = bodyOpen + rm.index + rm[0].length;
  return _bracketSpan(src, valueStart, m.index);
}

/* Just the function BODY span (the { ... } braces, unlike
   findFunctionReturnSpan which digs further for a `return`'d literal
   inside it) — the anchor primitive Phase 3b's inline-dialogue locator is
   built on. */
function findFunctionBodySpan(src, name) {
  var re = new RegExp('\\bfunction\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) return null;
  var bodyOpen = m.index + m[0].length - 1;
  return _bracketSpan(src, bodyOpen, m.index);
}

/* Locates an INLINE (unnamed) array literal argument — e.g.
   `_runLinesKeepOpen([{ who: 'hunter', text: '...' }], function () {...})`
   — where there is no var name to anchor findVarSpan on. The anchor is
   positional: the Nth occurrence of `callPattern` (e.g.
   '_runLinesKeepOpen(') within a NAMED function's own body, immediately
   followed (after whitespace) by '['. occurrenceIndex counts ALL
   occurrences of callPattern in that function, not just inline ones — if
   the Nth one doesn't turn out to have '[' right after it, that's treated
   as drift (something restructured) and this returns null rather than
   guessing at a different occurrence.

   This is deliberately a WEAKER guarantee than findVarSpan's (a name
   can't be mislocated; a position can, if code is inserted/reordered
   nearby) — callers that write through this MUST additionally verify the
   located content matches what was last shown before trusting it, which
   is exactly what applyInlineDialogueEdit does. This function only
   finds; it never validates content. */
function findInlineArraySpan(src, functionName, callPattern, occurrenceIndex) {
  var fnSpan = findFunctionBodySpan(src, functionName);
  if (!fnSpan) return null;
  var body = fnSpan.text;
  var searchFrom = 0, idx = -1;
  for (var i = 0; i <= occurrenceIndex; i++) {
    idx = body.indexOf(callPattern, searchFrom);
    if (idx === -1) return null;
    searchFrom = idx + callPattern.length;
  }
  var afterCall = idx + callPattern.length;
  while (afterCall < body.length && /\s/.test(body[afterCall])) afterCall++;
  if (body[afterCall] !== '[') return null;
  var absValueStart = fnSpan.valueStart + afterCall;
  return _bracketSpan(src, absValueStart, absValueStart);
}

/* Shared bracket-matcher: src[valueStart] must be '[' or '{'; walks forward
   respecting single/double-quoted strings (backslash-escaped) until the
   matching close, and returns the value's exact span. declStart is kept
   alongside purely for Phase 2 (locating the *whole* `var NAME = ...;`
   statement, not just the value, when it needs to replace the assignment
   in place). */
function _bracketSpan(src, valueStart, declStart) {
  var openChar = src[valueStart];
  if (openChar !== '[' && openChar !== '{') return null;
  var closeChar = openChar === '[' ? ']' : '}';
  var depth = 0, i = valueStart, inStr = null;
  for (; i < src.length; i++) {
    var c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) return null;   // unterminated — malformed source, refuse rather than guess
  return { declStart: declStart, valueStart: valueStart, valueEnd: i, text: src.slice(valueStart, i) };
}

/* Purity check: is `text` (already known to be a balanced [...] or {...})
   built from NOTHING but literal syntax? No hardcoded field-name whitelist —
   object keys are recognized structurally (any identifier immediately
   followed by ':'), not by name, so this works the same for dialogue's
   who/text/slamBefore/revealBefore and a location's id/name/region/
   abilityText/abilityKey/image/thumbnailCrop without listing either set.
   After stripping quoted strings, comments, object keys, true/false/null,
   and numbers, anything left over — an identifier used as a VALUE, a `+`
   concatenation operator, a function call's parens — means this span isn't
   a plain literal, however cleanly it might still eval. Caught exactly this
   way: Narmer's location ids are `id: LOC_LOWER_EGYPT` (a named constant,
   not a literal number) — the key `id:` strips clean, but the identifier
   value doesn't, so it correctly comes back impure. */
function isPlainLiteral(text) {
  var stripped = _stripStrings(text);
  stripped = _stripComments(stripped);
  stripped = stripped.replace(/[A-Za-z_$][A-Za-z0-9_$]*\s*:/g, ':');   // object keys, any name
  stripped = stripped.replace(/\b(true|false|null)\b/g, '');          // literal keywords
  stripped = stripped.replace(/-?\d+(\.\d+)?/g, '');                  // numeric literals
  var rest = stripped.replace(/[[\]{}:,\s]/g, '');
  return rest.length === 0;
}
function hasComments(text) {
  return /\/\/|\/\*/.test(_stripStrings(text));
}
function _stripStrings(text) {
  return text.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ' ');
}
function _stripComments(text) {
  return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Isolated eval — the span's text only, no access to the rest of the file's
   scope. Throws (caught by the caller) if the text references anything not
   defined within itself, which any genuinely dynamic span will. */
function evalLiteral(text) {
  return new Function('return (' + text + ')')();
}

/* Full extraction for one named var: span + purity + eval, all in one
   result object so callers never have to re-derive any of it. */
function extractVar(src, name) {
  var span = findVarSpan(src, name);
  if (!span) return { found: false, name: name };
  return _finish(span, name);
}
function extractFunctionReturn(src, name) {
  var span = findFunctionReturnSpan(src, name);
  if (!span) return { found: false, name: name };
  return _finish(span, name);
}
function _finish(span, name) {
  var pure = isPlainLiteral(span.text);
  var out = { found: true, name: name, sourceText: span.text, isPlainLiteral: pure, hasComments: hasComments(span.text) };
  try { out.value = evalLiteral(span.text); out.evalError = null; }
  catch (e) { out.value = null; out.evalError = e.message; }
  return out;
}

/* Scalar vars (var RULES_TITLE = 'The Empire of Sargon';) aren't [...]/{...}
   literals, so findVarSpan/_bracketSpan reject them on purpose — this is
   the equivalent for a single string/number/boolean/null value. A scalar
   can't contain an identifier reference or concatenation and still match
   this regex, so there's no separate purity check needed here; if it
   doesn't match this shape at all, it isn't a plain scalar literal. */
function extractScalarVar(src, name) {
  var re = new RegExp('\\bvar\\s+' + name + '\\s*=\\s*' +
    '(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?|true|false|null)\\s*;');
  var m = re.exec(src);
  if (!m) return { found: false, name: name };
  var text = m[1];
  var out = { found: true, name: name, sourceText: text, isPlainLiteral: true, hasComments: false };
  try { out.value = evalLiteral(text); out.evalError = null; }
  catch (e) { out.value = null; out.evalError = e.message; }
  return out;
}

/* Named-constant substitution — for the specific, bounded case of a span
   that references another SIMPLE top-level constant instead of embedding
   the literal directly (e.g. hanginggardens' `opponentAvatar:
   NEB_BUBBLE_PORTRAIT`, narmer's `id: LOC_LOWER_EGYPT`). Builds a
   dictionary of every `var NAME = <string|number|true|false|null>;` in the
   file (single simple value, not itself computed — if IT references
   something else, it's excluded, not chased further) and substitutes bare
   identifier tokens matching a dictionary key with that literal's own
   source text. Purposely shallow — one level of substitution, no recursion
   into function calls or expressions — anything left unresolved after this
   is genuinely dynamic, not just indirected through a named constant. */
function buildConstantDictionary(src) {
  var dict = {};
  var re = /\bvar\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/g;
  var m;
  while ((m = re.exec(src))) {
    var name = m[1];
    var rest = src.slice(m.index + m[0].length);
    var lit = /^('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)\s*;/.exec(rest);
    if (lit) dict[name] = lit[1];
  }
  return dict;
}
function resolveIdentifiers(text, dict) {
  return text.replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g, function (tok) {
    return Object.prototype.hasOwnProperty.call(dict, tok) ? dict[tok] : tok;
  });
}
/* Same shape as extractVar/extractFunctionReturn, but re-attempts with
   constant substitution when the first pass isn't a plain literal. Reports
   BOTH: `raw` (the untouched extraction, for the source-vs-extracted
   comparison) and, when substitution actually changed anything and the
   result IS a plain literal afterward, `resolved` (safe to display as a
   value, never safe to treat as directly editable — Phase 2 only ever
   surgically replaces a span verbatim, never a resolved/rewritten one). */
function extractWithResolution(src, name, isFunctionReturn) {
  var raw = isFunctionReturn ? extractFunctionReturn(src, name) : extractVar(src, name);
  if (!raw.found || raw.isPlainLiteral) return { raw: raw, resolved: null };
  var dict = buildConstantDictionary(src);
  var span = isFunctionReturn ? findFunctionReturnSpan(src, name) : findVarSpan(src, name);
  var substituted = resolveIdentifiers(span.text, dict);
  if (substituted === span.text) return { raw: raw, resolved: null };   // nothing to substitute
  var pureAfter = isPlainLiteral(substituted);
  var resolved = { sourceText: substituted, isPlainLiteral: pureAfter, hasComments: hasComments(substituted) };
  try { resolved.value = evalLiteral(substituted); resolved.evalError = null; }
  catch (e) { resolved.value = null; resolved.evalError = e.message; }
  return { raw: raw, resolved: resolved };
}

/* ══════════════════════════════════════════════════════════════════════════
   PHASE 2 — surgical dialogue write-back. Every function below operates on
   ONE already-read file's text and returns new text; nothing here touches
   fs itself (serve.js's endpoint owns reading/backing-up/writing) — keeps
   this module testable with zero I/O, same as extraction above.
   ══════════════════════════════════════════════════════════════════════════ */

/* Fields the level editor's dialogue UI has its OWN input for. Anything
   else on a line — Hammurabi's OPENING_DIALOGUE has two lines with
   slamBefore/revealBefore, see BOSS_SOURCES.hammurabi.bespokeMechanics —
   isn't something the UI can construct from scratch, but that's different
   from "must never be touched": see applyDialogueEdits' per-line patch
   path below, which edits who/text in place and leaves every other field
   exactly where it was, byte for byte. */
var EDITABLE_LINE_FIELDS = ['who', 'text'];
function hasUnrepresentableFields(lines) {
  return (lines || []).some(function (line) {
    return Object.keys(line).some(function (k) { return EDITABLE_LINE_FIELDS.indexOf(k) === -1; });
  });
}

/* Whether a dialogue entry (one of buildBossPreview's `dialogue[schemaKey]`
   values) can be edited at all, and why not when it can't. Computed once,
   server-side, and shipped in the /api/boss-previews payload so the client
   never re-derives this logic — same "one field one declaration" reasoning
   as everywhere else in this file.

   An array with a line carrying extra fields is still editable:true — see
   applyDialogueEdits' per-line patch path — but comes back with
   lineOpsBlocked:true, because adding or removing a line only makes sense
   as a POSITION-matched patch (line i in, line i out); a genuinely new
   line has no flags to preserve, and deleting a flagged line deletes its
   flags right along with it. Only who/text edits to EXISTING lines are
   safe there, so the UI must not offer add/remove for it. */
function dialogueEditability(entry) {
  if (!entry.present) return { editable: false, reason: 'no such beat for this boss' };
  if (entry.sharedWith) return { editable: false, reason: 'shares its array with "' + entry.sharedWith + '" — edit that key instead' };
  var ex = entry.extraction;
  if (!ex || !ex.found) return { editable: false, reason: 'variable not found in source' };
  if (!ex.isPlainLiteral) return { editable: false, reason: 'not a plain literal — dynamically built, cannot be edited' };
  var flagged = hasUnrepresentableFields(ex.value);
  return {
    editable: true,
    reason: null,
    lineOpsBlocked: flagged,
    lineOpsBlockedReason: flagged
      ? 'one or more lines carry fields this editor can\'t construct (e.g. slamBefore/revealBefore) — you can edit existing lines\' name/text, but adding or removing a line is disabled here so a flag can\'t be silently gained or lost'
      : null
  };
}

/* Matches serve.js's own q() (single-quoted, backslash/quote/newline
   escaped) so a REGENERATED array reads like the rest of this codebase's
   hand-written dialogue, not like a different tool touched it. Duplicated
   rather than required from serve.js — that file already requires THIS
   one, and a require cycle isn't worth it for three lines. */
function _q(s) {
  return "'" + String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n') + "'";
}
function serializeDialogueLine(line) {
  return '{ who: ' + _q(line.who) + ', text: ' + _q(line.text) + ' }';
}
function serializeDialogueArray(lines) {
  if (!lines || !lines.length) return '[]';
  return '[\n    ' + lines.map(serializeDialogueLine).join(',\n    ') + '\n  ]';
}

function _linesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i].who !== b[i].who || a[i].text !== b[i].text) return false;
  }
  return true;
}

/* Splits an array literal's OWN text (e.g. findVarSpan's span.text, still
   including the outer [ and ]) into each top-level `{ ... }` item's span,
   as ABSOLUTE offsets into `src` (arrayStart/arrayEnd are span.valueStart/
   valueEnd from the caller). Tracks {}-depth and quoted-string state the
   same way _bracketSpan does for []/{} — deliberately only counts curly
   braces here, since a dialogue object never contains a nested array, so
   there is nothing else at this level to confuse it. */
function findObjectItemSpans(src, arrayStart, arrayEnd) {
  var items = [];
  var i = arrayStart + 1, depth = 0, inStr = null, itemStart = -1;
  for (; i < arrayEnd - 1; i++) {
    var c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === '{') { if (depth === 0) itemStart = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0) { items.push({ start: itemStart, end: i + 1, text: src.slice(itemStart, i + 1) }); itemStart = -1; }
    }
  }
  return items;
}

/* Finds one field's quoted-string value within a single object's OWN text
   (e.g. one findObjectItemSpans entry's .text) — returns the span INCLUDING
   the quotes, so the caller can splice a new _q()-quoted string in verbatim.
   who/text are always quoted strings in this codebase (never bare
   identifiers or numbers), so this doesn't need to handle other value
   shapes — a field that isn't found, or whose value isn't quoted, returns
   null and the caller leaves that line untouched for that field. */
function findQuotedFieldSpan(objText, fieldName) {
  var re = new RegExp('\\b' + fieldName + '\\s*:\\s*');
  var m = re.exec(objText);
  if (!m) return null;
  var valueStart = m.index + m[0].length;
  var qc = objText[valueStart];
  if (qc !== "'" && qc !== '"') return null;
  var i = valueStart + 1;
  for (; i < objText.length; i++) {
    var c = objText[i];
    if (c === '\\') { i++; continue; }
    if (c === qc) { i++; break; }
  }
  return { start: valueStart, end: i, text: objText.slice(valueStart, i) };
}

/* Patches who/text IN PLACE within one line's own object text — every other
   byte of that object (any other field, its value, spacing, an inline
   comment that isn't literally between a field name and its value) comes
   through untouched, because this only ever replaces the exact quoted-
   value span findQuotedFieldSpan finds, never regenerates the object. Only
   fields present in `updates` are touched. Spans are re-found against the
   CURRENT (possibly already-patched-once-this-call) text rather than
   computed up front, same reasoning as applyDialogueEdits' own multi-var
   handling — patching `who` shifts `text`'s offset if `who` comes first
   in the object and changed length. */
function rewriteDialogueLineText(objText, updates) {
  var out = objText;
  ['who', 'text'].forEach(function (field) {
    if (!(field in updates)) return;
    var span = findQuotedFieldSpan(out, field);
    if (!span) return;
    out = out.slice(0, span.start) + _q(updates[field]) + out.slice(span.end);
  });
  return out;
}

/* The write-back itself. `edits` is [{varName, lines}], already narrowed by
   the caller to vars this boss's dialogue schema actually maps to — but
   this function re-validates every one independently against the file
   text AS GIVEN (never trusts that a var was editable when some earlier
   request loaded the preview; the file may have changed since).

   Spans are re-found with findVarSpan against `text` AFTER each prior
   replacement in this same call, never against offsets computed up front
   — replacing one var shifts every byte after it, so a second var's
   original offsets would point at the wrong bytes once the first write
   lands. Re-finding fresh each time sidesteps that entirely.

   The hard guarantee this exists to satisfy: a var whose CURRENT on-disk
   value already deep-equals the submitted lines is left COMPLETELY
   untouched — not re-serialized, not even re-sliced-and-reassembled with
   identical content. If every edit in the batch is a no-op this way, the
   returned fileText is the exact same string as the input, so "load with
   no edits, save" reproduces the file byte-for-byte — regeneration (and
   the comment loss that comes with it) only happens for a var whose lines
   actually changed. */
/* Per-line patch path for an array with at least one line carrying extra
   fields (slamBefore/revealBefore etc.) — used only when edit.lines is the
   SAME LENGTH as what's currently on disk (add/remove is refused earlier,
   in applyDialogueEdits, before this is ever called). Walks items in
   REVERSE index order so a length-changing replacement earlier in the
   array (who/text is almost always a different length than the original)
   never invalidates a later item's span — later items are always patched
   (or left alone) BEFORE the text before them shifts.

   A line whose who/text is unchanged is left completely untouched, not
   just "regenerated to the same value" — same no-op guarantee
   applyDialogueEdits already gives whole arrays, now per line. */
function _patchLinesInPlace(text, itemSpans, current, newLines) {
  var anyChanged = false;
  var commentTouched = false;
  for (var i = itemSpans.length - 1; i >= 0; i--) {
    var was = current[i], now = newLines[i];
    if (was.who === now.who && was.text === now.text) continue;
    if (hasComments(itemSpans[i].text)) commentTouched = true;
    var updates = {};
    if (was.who !== now.who) updates.who = now.who;
    if (was.text !== now.text) updates.text = now.text;
    var newItemText = rewriteDialogueLineText(itemSpans[i].text, updates);
    text = text.slice(0, itemSpans[i].start) + newItemText + text.slice(itemSpans[i].end);
    anyChanged = true;
  }
  return { text: text, changed: anyChanged, hadComments: commentTouched };
}

/* The write-back itself. `edits` is [{varName, lines}], already narrowed by
   the caller to vars this boss's dialogue schema actually maps to — but
   this function re-validates every one independently against the file
   text AS GIVEN (never trusts that a var was editable when some earlier
   request loaded the preview; the file may have changed since).

   Spans are re-found with findVarSpan against `text` AFTER each prior
   replacement in this same call, never against offsets computed up front
   — replacing one var shifts every byte after it, so a second var's
   original offsets would point at the wrong bytes once the first write
   lands. Re-finding fresh each time sidesteps that entirely.

   The hard guarantee this exists to satisfy: a var whose CURRENT on-disk
   value already deep-equals the submitted lines is left COMPLETELY
   untouched — not re-serialized, not even re-sliced-and-reassembled with
   identical content. If every edit in the batch is a no-op this way, the
   returned fileText is the exact same string as the input, so "load with
   no edits, save" reproduces the file byte-for-byte.

   Two write strategies, chosen by whether the line COUNT changed — not by
   whether the array has flagged (extra-field) lines, which used to be the
   split. A pure text/who edit to any array, flagged or not, now goes
   through _patchLinesInPlace: only the touched lines' own who/text spans
   are rewritten, everything else (other lines' exact formatting, any
   comment that isn't inside a touched line's own braces, unflagged lines
   sitting next to a flagged one) survives untouched. Whole-array
   regeneration (serializeDialogueArray) only fires when the line count
   actually changes — reformats every line, same as before, because add/
   remove has no other sound option (and for a flagged array, is refused
   outright: a position-matched patch has no answer for what flags a new
   line 3 should inherit or where line 2's flags go when it's deleted). */
function applyDialogueEdits(fileText, edits) {
  var text = fileText;
  var results = [];
  edits.forEach(function (edit) {
    var span = findVarSpan(text, edit.varName);
    if (!span) { results.push({ varName: edit.varName, changed: false, error: 'variable not found in current file' }); return; }
    if (!isPlainLiteral(span.text)) { results.push({ varName: edit.varName, changed: false, error: 'not a plain literal — refusing to write' }); return; }
    var current;
    try { current = evalLiteral(span.text); }
    catch (e) { results.push({ varName: edit.varName, changed: false, error: 'could not evaluate current value: ' + e.message }); return; }

    if (_linesEqual(current, edit.lines)) {
      results.push({ varName: edit.varName, changed: false, hadComments: hasComments(span.text) });
      return;
    }

    var flagged = hasUnrepresentableFields(current);
    var lengthChanged = edit.lines.length !== current.length;

    if (flagged && lengthChanged) {
      results.push({ varName: edit.varName, changed: false, error: 'one or more lines carry fields this editor can\'t represent — adding or removing lines is refused, only who/text edits to existing lines are allowed' });
      return;
    }

    if (lengthChanged) {
      // Add/remove — no per-line mapping makes sense, whole array regenerates.
      var hadComments = hasComments(span.text);
      var newLiteral = serializeDialogueArray(edit.lines);
      text = text.slice(0, span.valueStart) + newLiteral + text.slice(span.valueEnd);
      results.push({ varName: edit.varName, changed: true, hadComments: hadComments });
      return;
    }

    // Same length — patch in place, flagged or not. itemSpans are found
    // against `text` (this call's running copy) using THIS var's freshly-
    // found span — correct even if an earlier edit in this same batch
    // already shifted bytes before this var's declaration.
    var itemSpans = findObjectItemSpans(text, span.valueStart, span.valueEnd);
    if (itemSpans.length !== current.length) {
      results.push({ varName: edit.varName, changed: false, error: 'internal: line-span count did not match evaluated line count — refusing to guess' });
      return;
    }
    var patched = _patchLinesInPlace(text, itemSpans, current, edit.lines);
    text = patched.text;
    results.push({ varName: edit.varName, changed: patched.changed, hadComments: patched.hadComments });
  });
  return { fileText: text, results: results };
}

/* Phase 3b — write-back for an INLINE (unnamed) dialogue block, located
   positionally via findInlineArraySpan rather than by name. `spec` is
   {functionName, callPattern, occurrenceIndex} (one entry from
   overworld-extract.js's INLINE_DIALOGUE_BLOCKS). `expectedCurrent` is
   whatever the caller's edit was based on — normally the exact value the
   preview endpoint last returned for this block.

   The compare-and-swap: after locating the array, its CURRENT evaluated
   value must deep-equal expectedCurrent before a single byte is touched.
   This is what makes a drifted anchor fail safe. A position-based anchor
   can find the WRONG array (if code was inserted/reordered near it,
   changing which occurrence lands where) in a way a name-based one
   structurally cannot — findVarSpan either finds the right name or finds
   nothing, it can never quietly find a different named var instead. So
   where applyDialogueEdits can trust "found by name" on its own,
   applyInlineDialogueEdit cannot trust "found by position" on its own —
   it also has to confirm the content it found is still the content the
   edit was actually made against. A mismatch (wrong array OR the file
   changed since the edit was staged) refuses the write outright rather
   than patching whatever happens to be sitting at that position now.

   No add/remove: line count changing is refused unconditionally, not
   just when flagged — the position-based anchor makes this a strictly
   higher-risk write than a named array's, so the safety margin should be
   wider, not the same. */
function applyInlineDialogueEdit(fileText, spec, expectedCurrent, newLines) {
  var span = findInlineArraySpan(fileText, spec.functionName, spec.callPattern, spec.occurrenceIndex);
  if (!span) {
    return { fileText: fileText, changed: false, error: 'anchor not found for ' + spec.functionName + ' (occurrence ' + spec.occurrenceIndex + ') — the surrounding code may have moved; reload and try again' };
  }
  if (!isPlainLiteral(span.text)) {
    return { fileText: fileText, changed: false, error: 'not a plain literal — refusing to write' };
  }
  var current;
  try { current = evalLiteral(span.text); }
  catch (e) { return { fileText: fileText, changed: false, error: 'could not evaluate current value: ' + e.message }; }

  if (!_linesEqual(current, expectedCurrent)) {
    return { fileText: fileText, changed: false, error: 'this block has changed since it was loaded (or the anchor drifted to different content) — reload and try again' };
  }

  if (newLines.length !== current.length) {
    return { fileText: fileText, changed: false, error: 'adding or removing lines is not supported for inline dialogue blocks — only who/text edits to existing lines' };
  }

  if (_linesEqual(current, newLines)) {
    return { fileText: fileText, changed: false, hadComments: hasComments(span.text) };
  }

  var itemSpans = findObjectItemSpans(fileText, span.valueStart, span.valueEnd);
  if (itemSpans.length !== current.length) {
    return { fileText: fileText, changed: false, error: 'internal: line-span count did not match evaluated line count — refusing to guess' };
  }
  var patched = _patchLinesInPlace(fileText, itemSpans, current, newLines);
  return { fileText: patched.text, changed: patched.changed, hadComments: patched.hadComments };
}

/* ══════════════════════════════════════════════════════════════════════════
   BOSS_SOURCES — hand-curated, not auto-discovered. Each boss's dialogue
   var names, location/presentation source, and structure/resource/scoring
   VALUES were confirmed by reading the file directly (see the commit
   message for the per-boss citations). The dialogue arrays are extracted
   generically (findVarSpan + eval, same mechanism for all 5); the small
   number of computed/bespoke fields below are hand-typed because they
   cannot be reduced to "locate a literal" at all — that's the whole point
   of flagging them.

   dialogue maps this level-editor schema's 10 keys to each boss's own var
   name, or null with a `note` when no distinct array exists (Sargon and
   Gilgamesh both route their FIRST-tier loss AND tie through the same
   single array — LOSS_SMACK / GILGAMESH_LOSS_SMACK — unlike the other 3
   bosses, which have separate LOSS_DIALOGUE/TIE_DIALOGUE).
   ══════════════════════════════════════════════════════════════════════════ */
var BOSS_SOURCES = {
  sargon: {
    nodeId: 'sargon', file: 'js/sog-adventure-sargon.js', hook: 'sargon',
    dialogue: {
      opening: 'OPENING_DIALOGUE', serfWinA: 'SARGON_SERF_WIN_A', serfWinB: 'SARGON_SERF_WIN_B',
      loss: 'LOSS_SMACK', tie: { sameAs: 'LOSS_SMACK', note: 'Sargon has no separate tie dialogue — a tie routes through the same _onDefeatOrTie() as a loss (sog-adventure-sargon.js:622-623) and plays LOSS_SMACK either way.' },
      giantIntro: 'SARGON_GIANT_INTRO', giantWinA: 'SARGON_GIANT_WIN_A', giantWinB: 'SARGON_GIANT_WIN_B',
      giantLoss: 'SARGON_GIANT_LOSS', giantDraw: 'SARGON_GIANT_DRAW'
    },
    locationsFn: '_sargonLocations', aiIdsVar: 'SARGON_AI_IDS',
    presentationVar: 'SARGON_PRESENTATION', bubblePortraitVar: 'SARGON_BUBBLE_PORTRAIT',
    rulesTitleVar: 'RULES_TITLE', rulesBodyVar: 'RULES_BODY',
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'reward is NOT read from a `reward` config field — the script\'s own onWin handler grants SARGON_CARD_ID (37) + GOLD_FIRST_WIN (15) directly (sog-adventure-sargon.js:102-104). The generic `rewards: {}` in the config is empty.',
      'slotsPerLocation/maxHandSize are written as `st.SLOTS_PER_LOC || 4` / `st.MAX_HAND_SIZE || 7` (buildSargonConfig, sog-adventure-sargon.js:844,846) — resolved here against SOG.state\'s actual defaults (js/game/state.js:31,30), not hardcoded.'
    ],
    bespokeMechanics: []
  },
  hammurabi: {
    nodeId: 'hammurabi', file: 'js/sog-adventure-hammurabi.js', hook: 'hammurabi',
    dialogue: {
      opening: 'OPENING_DIALOGUE', serfWinA: 'HAMMURABI_SERF_WIN_A', serfWinB: 'HAMMURABI_SERF_WIN_B',
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: 'HAMMURABI_GIANT_INTRO', giantWinA: 'HAMMURABI_GIANT_WIN_A', giantWinB: 'HAMMURABI_GIANT_WIN_B',
      giantLoss: 'HAMMURABI_GIANT_LOSS', giantDraw: 'HAMMURABI_GIANT_DRAW'
    },
    locationsFn: '_hammurabiLocations', aiIdsVar: 'HAMMURABI_AI_IDS',
    presentationVar: 'HAMMURABI_PRESENTATION', bubblePortraitVar: 'HAMMURABI_BUBBLE_PORTRAIT',
    rulesTitleVar: 'RULES_TITLE', rulesBodyVar: 'RULES_BODY',
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'reward is script-owned, not config-owned — same pattern as Sargon (card grant + gold happen in the onWin handler, not the generic `rewards` field).',
      'slotsPerLocation/maxHandSize resolved against SOG.state defaults, same as Sargon.'
    ],
    bespokeMechanics: [
      {
        name: 'Slam / reveal line gate',
        file: 'js/sog-adventure-hammurabi.js',
        lines: '597 (_slamLocations), 608 (_revealLocationAbilities), 653 & 655 (the two OPENING_DIALOGUE lines that trigger them)',
        description: 'Two lines in OPENING_DIALOGUE carry slamBefore:true / revealBefore:true. Before that specific line plays, dialogue pauses and a board animation runs to completion first (gavel-pound tiles bouncing into place, then the location ability text fading in) — js/game/dialogue-runner.js\'s onLineGate/isAdvanceBlocked hooks exist specifically for this. The flags themselves ARE plain literal booleans (OPENING_DIALOGUE still extracts and evaluates cleanly), but the ANIMATION they trigger has no equivalent in the level schema — a level-editor-authored line with slamBefore/revealBefore would do nothing.'
      }
    ]
  },
  'hanging-gardens': {
    nodeId: 'hanging-gardens', file: 'js/sog-adventure-hanginggardens.js', hook: 'hanging-gardens',
    dialogue: {
      opening: 'OPENING_DIALOGUE', serfWinA: 'HG_SERF_WIN_A', serfWinB: 'HG_SERF_WIN_B',
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: 'HG_GIANT_INTRO', giantWinA: 'HG_GIANT_WIN_A', giantWinB: 'HG_GIANT_WIN_B',
      giantLoss: 'HG_GIANT_LOSS', giantDraw: 'HG_GIANT_DRAW'
    },
    locationsFn: '_hgLocations', aiIdsVar: 'NEB_AI_IDS',
    presentationVar: 'HG_PRESENTATION', bubblePortraitVar: 'NEB_BUBBLE_PORTRAIT',
    rulesTitleVar: 'RULES_TITLE', rulesBodyVar: 'RULES_BODY',
    structure: { turns: 5, locationsCount: 3, slotsPerLocation: 4, handStart: 5, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'reward is script-owned, not config-owned, same pattern as Sargon/Hammurabi.',
      'turns is 5 here (every other boss uses 4) and handStart resolves via `st.HAND_START || 5` — SOG.state.HAND_START really is 5 (js/game/state.js:29), it isn\'t a fallback masking a different intended value.'
    ],
    bespokeMechanics: [
      {
        name: 'Flood scheduler',
        file: 'js/sog-adventure-hanginggardens.js',
        lines: '621-622 (RIVER_EUPHRATES=101/RIVER_TIGRIS=103), 625-630 (_floodTargetForTurn), 632+ (_applyFloodSchedule), 722-730 (_runFloodIntro)',
        description: 'On turns 3+, exactly one of the two river locations (Euphrates=101, Tigris=103 — Babylon=102 is never flooded) floods and becomes unplayable, alternating each turn; turn 3 picks randomly. This is battle-wide runtime state (_floodedRiver) that mutates G.locations[i].flooded and toggles CSS every turn — nothing in the level schema can express "which location becomes unplayable on which turn." The first time a river floods, an UNNAMED, dynamically-built dialogue array runs (_runFloodIntro, line 722): `{ who: \'nebuchadnezzar\', text: \'The \' + river + \' flooded.\' }` at line 726 — this is not assignable to any of the 10 standard dialogue keys, has no variable name to locate, and is a genuine string-concatenation case (the exact thing the extractor is built to catch, not just an example of one).'
      }
    ]
  },
  narmer: {
    nodeId: 'narmer', file: 'js/sog-adventure-narmer.js', hook: 'narmer',
    dialogue: {
      opening: 'OPENING_DIALOGUE', serfWinA: 'NARMER_SERF_WIN_A', serfWinB: 'NARMER_SERF_WIN_B',
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: 'NARMER_GIANT_INTRO', giantWinA: 'NARMER_GIANT_WIN_A', giantWinB: 'NARMER_GIANT_WIN_B',
      giantLoss: 'NARMER_GIANT_LOSS', giantDraw: 'NARMER_GIANT_DRAW'
    },
    locationsFn: '_narmerLocations', aiIdsVar: 'AI_IDS',
    presentationInline: true,   // no named var — inline object literal in buildNarmerConfig (line 827)
    bubblePortraitVar: 'NARMER_BUBBLE_PORTRAIT',
    rulesTitleVar: 'RULES_TITLE', rulesBodyVar: 'RULES_BODY',
    structure: { turns: 5, locationsCount: 3, slotsPerLocation: 4, handStart: 5, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'reward is script-owned (GOLD_SERF_WIN 20 / GOLD_GIANT_WIN 30 + the Narmer card), a richer scale than every other boss\'s flat 15 — deliberately, per the file\'s own comment (line 303-307).',
      'turns is 5, handStart resolves via st.HAND_START (5), same as Nebuchadnezzar.'
    ],
    bespokeMechanics: [
      {
        name: 'Advance gate',
        file: 'js/sog-adventure-narmer.js',
        lines: '43-45 (LOC_LOWER_EGYPT=111/LOC_MEMPHIS=112/LOC_UPPER_EGYPT=113), 816-818 (rules.advanceGate config), 816-817 comment references js/game/board.js isAdvanceUnlocked',
        description: 'buildNarmerConfig sets a config field the level schema does not have AT ALL: `rules: { advanceGate: { playerHome: 111, contested: 112, aiHome: 113 } }`. This activates a whole extra engine mechanic (js/game/board.js\'s isAdvanceUnlocked) that gates which locations either side may even PLAY a card to — cards can\'t be placed in Memphis until Lower Egypt is full, or in Upper Egypt until Memphis is held. No other battle in the game sets `rules` at all. A level-editor-authored level has no way to express this; it would just be a plain 3-location battle with no gate.'
      },
      {
        name: 'Custom "Play Again" replay',
        file: 'js/sog-adventure-narmer.js',
        lines: '840',
        description: 'buildNarmerConfig also sets `replay: function () { start(); }` — a FUNCTION value, which cannot be represented in level-data.js (a plain-data file) at all. Every other boss relies on the default scoreboard behavior instead.'
      }
    ]
  },
  gilgamesh: {
    nodeId: 'walls-of-uruk', file: 'js/sog-adventure-gilgamesh.js', hook: 'gilgamesh',
    dialogue: {
      // OPENING_PRE is only the FIRST THIRD of Gilgamesh's actual opening —
      // see the tutorial-pause bespoke mechanic below. Shown here because it
      // IS a plain literal array, with a note attached so it isn't mistaken
      // for the complete sequence.
      opening: { varName: 'OPENING_PRE', note: 'This is only the first 3 lines. The full opening sequence pauses here for a portrait-click tutorial prompt, then continues with one more line not captured in any named array — see "Tutorial pause" below.' },
      serfWinA: 'GILGAMESH_FLUKE_A', serfWinB: 'GILGAMESH_FLUKE_B',
      loss: 'GILGAMESH_LOSS_SMACK', tie: { sameAs: 'GILGAMESH_LOSS_SMACK', note: 'Gilgamesh has no separate tie dialogue, same as Sargon — a tie is treated as a loss (scoring.exactTie routes through the same onDefeatOrTie-equivalent path) and plays GILGAMESH_LOSS_SMACK either way.' },
      giantIntro: 'GILGAMESH_REMATCH_INTRO', giantWinA: 'GILGAMESH_REMATCH_WIN_A', giantWinB: 'GILGAMESH_REMATCH_WIN_B',
      giantLoss: 'GILGAMESH_REMATCH_LOSS', giantDraw: 'GILGAMESH_REMATCH_DRAW'
    },
    locationsFn: '_gilgameshLocations',
    aiIdsExpr: { note: 'GILGAMESH_AI_IDS.concat([ENKIDU_ID]) (sog-adventure-gilgamesh.js:1243) — a method call, not a literal, so it can\'t be located/extracted the same way. Resolved by hand: GILGAMESH_AI_IDS = [38,39,40,41,42,43,45,48,49] (line 38) + ENKIDU_ID = 44 (line 39).', value: [38, 39, 40, 41, 42, 43, 45, 48, 49, 44] },
    presentationInline: true,   // inline in buildGilgameshConfig (line 1262), WITH extra fields — see notes
    rulesTitleVar: 'RULES_TITLE', rulesBodyVar: 'RULES_BODY',
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 4 },
    resource: { model: 'none', capital: 0 },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'structure also sets cardsPerTurn: 2 (line 1251) — a field the schema does not have. It caps how many cards can be played per turn regardless of capital (irrelevant here anyway: resource.model is \'none\', a cost-free battle) and also gates the End Turn button (stays disabled until 2 cards are played).',
      'presentation has two extra fields beyond the schema (bodyClassExtra, preCoachingClass — line 1264-1265), used to layer the shared adventure-battle styling and hide the hand until the pre-battle deal animation completes.',
      'decks.player is NOT static — buildGilgameshConfig (line 1229-1242) checks the player\'s actual active-deck size at battle-start: {source:\'active-deck\'} if it has >=10 cards, otherwise an explicit 11-card Prehistory list (+Cuneiform, id 46, once granted) as a safety net so turn 4\'s draw never starves. This is a genuine runtime branch, not a fixed value — shown here as "computed at battle start", not a value.',
      'rewards uses a different shape than the schema\'s `reward.cardIdOnGiantWin`: `rewards: { onWin: { completionFlag: KEY_PHASE1_COMPLETE } }` (line 1273) — the script\'s own onWin owns the actual grant sequence.'
    ],
    bespokeMechanics: [
      {
        name: 'Tutorial pause (first battle only)',
        file: 'js/sog-adventure-gilgamesh.js',
        lines: '143-158 (_showOpponentLine), 163-195 (_runOpeningDialogue, OPENING_PRE + OPENING_PROMPT)',
        description: 'Only on Attempt 1: after OPENING_PRE\'s 3 lines, a STICKY single-line prompt ("Click on me, if you need a reminder.") shows with no click-to-advance — dialogue is paused until the player clicks Gilgamesh\'s portrait, which opens the rules popup; dismissing it plays one more line ("Thank you!", inline, not in any named array) before the battle actually starts. No schema field can express a click-gated pause mid-dialogue.'
      },
      {
        name: 'Cuneiform intervention (first loss only)',
        file: 'js/sog-adventure-gilgamesh.js',
        lines: '931-955 (FARMER_POSTLOSS_A/B, GILGAMESH_POSTLOSS_CHALLENGE), 991+ (_runCuneiformIntervention)',
        description: 'On the FIRST loss only (before Cuneiform is ever granted): the board fades to black, a candle-lighting animation plays, the overworld HUD (not the battle dialogue system) runs a Farmer/Explorer conversation split around a card-acquisition reveal (Cuneiform, id 46) mid-conversation, then fades back and restarts the battle with Cuneiform now in the deck. Every subsequent loss skips straight to a normal restart. This whole flow — the screen-fade, the HUD-borrowed dialogue engine, the mid-conversation card grant — has no schema equivalent; a level-editor level has no comeback-card mechanic at all.'
      }
    ]
  },
  hatshepsut: {
    nodeId: 'hatshepsut', file: 'js/sog-adventure-hatshepsut.js', hook: 'hatshepsut',
    // Ten named, empty arrays as of this pass (lines 98-107) — all real,
    // findable, plain-literal vars, so every slot is editable exactly like
    // the other bosses'; there is simply no text in them yet. Naming
    // matches Hammurabi/Hanging Gardens (OPENING_DIALOGUE/LOSS_DIALOGUE/
    // TIE_DIALOGUE unprefixed, HATSHEPSUT_-prefixed everything else), not
    // Sargon's shared LOSS_SMACK. Wired to HATSHEPSUT_SCRIPT's
    // onBattleStart/onWin/onLoss/onTie (~line 270+), tier-gated the same
    // way every other two-tier boss is — see _isGiantRematch/
    // _battleWasGiantRematch in the file itself.
    dialogue: {
      opening: 'OPENING_DIALOGUE', serfWinA: 'HATSHEPSUT_SERF_WIN_A', serfWinB: 'HATSHEPSUT_SERF_WIN_B',
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: 'HATSHEPSUT_GIANT_INTRO', giantWinA: 'HATSHEPSUT_GIANT_WIN_A', giantWinB: 'HATSHEPSUT_GIANT_WIN_B',
      giantLoss: 'HATSHEPSUT_GIANT_LOSS', giantDraw: 'HATSHEPSUT_GIANT_DRAW'
    },
    locationsFn: '_hatshepsutLocations', aiIdsVar: 'AI_IDS',
    presentationInline: true,   // no named var — inline object literal in buildHatshepsutConfig
    // no bubblePortraitVar — her presentation object has no
    // opponentBubblePortrait field at all (only bodyClass/allyAvatar/
    // opponentAvatar/popAlly); nothing to extract.
    // no rulesTitleVar/rulesBodyVar — buildHatshepsutConfig sets no
    // rules-popup-equivalent fields; there is no RULES_TITLE/RULES_BODY
    // in this file, and this pass didn't add one (out of scope — only the
    // 10 dialogue slots were asked for).
    structure: { turns: 5, locationsCount: 3, slotsPerLocation: 4, handStart: 5, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'STILL NOT REACHABLE FROM THE MAP — js/overworld.js\'s onNodeClick still has no branch for node id \'hatshepsut\' (unchanged by this pass, deliberately: the node stays unwired until the dialogue is actually written). The map node exists (upper-egypt, tiers:2) and the script self-registers via BattleHooks, but nothing currently calls start() except the console/dev path. hatshepsut is still NOT in WIRED_NODES in map/inspector.js for the same reason as before — that set means "onNodeClick actually does something for this id," and for this id it still does not.',
      'The tier MECHANIC (AI-difficulty flag switch) was already implemented before this pass; this pass added the DIALOGUE layer (10 named arrays + tier-gated wiring in the SCRIPT\'s onBattleStart/onWin/onLoss/onTie) on top of it, all still empty. Verified live: the battle boots, plays a full turn, and reaches win/loss/tie correctly with every array empty (runLines([], cb) finishes synchronously — see js/game/dialogue-runner.js) — filling one in later needs no further wiring changes.',
      'reward is still NOT read from a `reward` config field — `rewards: {}` stays empty and there is still no onWin card/gold grant anywhere in this file, unlike every other boss. Not in scope for this pass.',
      'slotsPerLocation/handStart/maxHandSize are written as `st.SLOTS_PER_LOC || 4` / `st.HAND_START || 5` / `st.MAX_HAND_SIZE || 7` (buildHatshepsutConfig, ~line 207-209), resolved here against SOG.state\'s actual defaults (js/game/state.js:29-31), same pattern as every other boss.'
    ],
    bespokeMechanics: []
  },
  otzi: {
    // No dedicated map node — reached via the 'egypt-signpost' node
    // (js/overworld.js's "Egypt signpost → Otzi encounter / replay"
    // branch, already in WIRED_NODES). nodeId here is that REAL node id,
    // not 'otzi' — same pattern as gilgamesh below (BOSS_SOURCES key
    // 'gilgamesh', nodeId 'walls-of-uruk'). hook/scriptHook is 'otzi'.
    nodeId: 'egypt-signpost', file: 'js/sog-adventure-otzi.js', hook: 'otzi',
    // Single-tier battle (map node tiers:1) — only win/loss/tie map to
    // schema slots; the other 7 (including giant* and serfWinB) are null
    // because there is no second tier at all, not because anything is
    // missing. Win maps to serfWinA (the first/only win slot).
    dialogue: {
      opening: null,
      serfWinA: 'WIN_DIALOGUE', serfWinB: null,
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: null, giantWinA: null, giantWinB: null,
      giantLoss: null, giantDraw: null
    },
    locationsFn: '_otziLocations', aiIdsVar: 'OTZI_DECK_IDS',
    presentationInline: true,   // inline object literal in OTZI_CONFIG (line 234)
    structure: { turns: 4, locationsCount: 3, slotsPerLocation: 4, handStart: 4, maxHandSize: 4 },
    resource: { model: 'none', capital: 0 },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'OPENING DIALOGUE EXISTS BUT IS DELIBERATELY LEFT UNMAPPED (null) — PRE_SHAKE_LINES (line 40) and POST_SHAKE_LINES (line 48) are real, named, plain-literal arrays split around a mid-intro screen-shake beat (same shape as Gilgamesh\'s OPENING_PRE/tutorial-pause split). Left null here per explicit instruction when this entry was added, not because they can\'t be extracted — they can, the same way serfWinA/loss/tie were. Add opening: {varName: \'PRE_SHAKE_LINES\', note: \'...POST_SHAKE_LINES continues after a screen-shake beat, see bespokeMechanics\'} if/when this should be editable too.',
      '_otziLocations (line 109) extracts as NOT FOUND, not merely impure — confirmed against the live extractor, not assumed. findFunctionReturnSpan finds the FIRST `return` in the function body via a plain regex scan, and this function\'s body contains THREE earlier ones first: `locs.find(function (l) { return l.id === 7; })` and its two siblings (lines 111, 113, 115), each a nested callback with its own return, before the function\'s own `return [desert, savannah, grvCopy];` (line 118). The scan latches onto the first nested `return l.id === 7;`, whose value isn\'t a [ or { at all, so _bracketSpan bails and the whole extraction reports found:false. The UI shows "Not found in source," not "not a plain literal." Separately, even a fixed scanner would still report this impure — the function also calls LOCATIONS.find() three times and Object.assign()s an override onto the Great Rift Valley copy (stripping FIRST_CARD_HERE) rather than returning a literal array. The actual resolved locations are Desert(8)/Savannah(7)/Great Rift Valley(2, abilityKey forced null) per js/locations.js\'s base entries.',
      'structure also sets cardsPerTurn: 2 (line 224) — same as Gilgamesh, caps plays per turn independent of capital (resource.model is \'none\' here too).',
      'reward is NOT read from a `reward` config field — `rewards: { onWin: { cards: [35], completionFlag: KEY_BATTLE_OTZI_COMPLETE, acquisitionFlag: KEY_CARD_OTZI_UNLOCKED } }` (line 241) uses its own shape, closer to Gilgamesh\'s rewards.onWin than Sargon/Hammurabi\'s script-owned grants.'
    ],
    bespokeMechanics: [
      {
        name: 'Win-token line (second dialogue phase after the card reveal)',
        file: 'js/sog-adventure-otzi.js',
        lines: '69 (WIN_TOKEN_LINE), 520-554 (_routePostBattle)',
        description: 'A win plays WIN_DIALOGUE, THEN a card-acquisition reveal for Otzi\'s own card (id 35, skipped on a repeat win), THEN WIN_TOKEN_LINE ("A token of me frozen in time."), THEN the scoreboard. WIN_TOKEN_LINE is a real plain-literal array but has no schema slot to map to — the schema\'s single serfWinA covers only the first phase.'
      },
      {
        name: 'Screen-shake mid-intro (2-card-per-turn reveal)',
        file: 'js/sog-adventure-otzi.js',
        lines: '40 (PRE_SHAKE_LINES), 48 (POST_SHAKE_LINES), 878-885 (the shake sequencing)',
        description: 'PRE_SHAKE_LINES plays, then a screen-shake animation reveals that the player can now play 2 cards/turn, then POST_SHAKE_LINES continues. See the note above on why this is left unmapped for now.'
      }
    ]
  },
  prehistory: {
    nodeId: 'prehistory', file: 'js/sog-adventure-prehistory.js', hook: 'prehistory',
    // Single-tier (map node tiers:1), same shape as otzi above.
    dialogue: {
      opening: null,
      serfWinA: 'WIN_DIALOGUE', serfWinB: null,
      loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE',
      giantIntro: null, giantWinA: null, giantWinB: null,
      giantLoss: null, giantDraw: null
    },
    // No locationsFn/aiIdsVar — neither is a named var or function here at
    // all (see notes). Nothing to point extraction at.
    presentationInline: true,   // inline object literal in BATTLE_CONFIG (line 387)
    structure: { turns: 4, locationsCount: 1, slotsPerLocation: 4, handStart: 4, maxHandSize: 4 },
    resource: { model: 'none', capital: 0, resetEachTurn: false },
    // NOT the most-locations shape every other boss (including otzi) uses —
    // a genuinely different scoring RULE, not a smaller version of the same
    // template. winThreshold/tiebreaker/exactTie will render as "—" in the
    // UI (correctly: they don't exist on this object).
    scoring: { rule: 'single-location', metric: 'player-ip-vs-ai-ip', outcomes: { win: 'pIP>aIP', loss: 'pIP<aIP', tie: 'pIP===aIP' }, tie: 'loss' },
    notes: [
      'OPENING DIALOGUE EXISTS BUT CANNOT BE EXTRACTED AT ALL, by tool or by hand-adding a varName — it is an unnamed INLINE array literal passed directly as the first argument to Overworld.runPreBattleLines([...]) (lines 222-229), not assigned to any `var`. There is no identifier to point findVarSpan at. This is the same category as Hanging Gardens\' flood-intro line and Gilgamesh\'s "Thank you!" line — a genuine string-literal-with-no-name case, not an oversight.',
      'decks.ai is `{ source: \'scripted\' }`, not `{ source: \'explicit\', ids: [...] }` like every other boss — there is no AI "deck" of ids to extract (no aiIdsVar/aiIdsExpr set here). The AI\'s actual cards come from `ai.settings.playOrder: [27, 28, 31, 34]` (a fixed reveal sequence, face-down) plus `handPadding: [29, 30, 32, 36, 26]` (cosmetic filler, faces never shown, purely so the opponent hand/deck counts match the player\'s) — hand-typed here since it is a scripted sequence, not deck ids in the normal sense.',
      'locations is a single inline object, `{ id: 100, name: \'The Camp\', region: \'\', abilityText: \'\', abilityKey: null }` (line 378), embedded directly in BATTLE_CONFIG.locationAbilities.select.locations — not a separate var or function, so — like the opening dialogue above — there is nothing for locationsFn to point at. Hand-typed here rather than extracted.',
      'structure also sets cardsPerTurn: 1 (line 367). draw is `{ model: \'flat\', perTurn: 1, softCapExceptionCardId: 26 }` — a flat +1/turn draw (not \'replenish\'), with Tool (id 26) as a documented exception that can push the hand above the soft cap on its own reveal-phase draw.',
      'reward: `{ onWin: { cards: [34], completionFlag: \'sog_battle_neanderthal_complete\' } }` (line 386) — same shape as otzi\'s, not a config field named `reward` (singular) like the schema\'s cardIdOnGiantWin.'
    ],
    bespokeMechanics: [
      {
        name: 'Scripted AI reveal sequence, not a shuffled deck',
        file: 'js/sog-adventure-prehistory.js',
        lines: '365-399 (BATTLE_CONFIG.ai), 393-395 (playOrder/handPadding)',
        description: 'The AI profile is \'scriptedSequence\', not \'heuristic\' — Hunter(27) then Gatherer(28) then Megalith(31) then Neanderthal(34) reveal in that exact order every time, face-down, regardless of what the player does. No schema field expresses a fixed opponent script; a level-editor level always uses the shared adaptive AI brain.'
      },
      {
        name: 'Single-location scoring (not most-locations)',
        file: 'js/sog-adventure-prehistory.js',
        lines: '381-385 (BATTLE_CONFIG.scoring)',
        description: 'This is a ONE-location battle (\'The Camp\', id 100) scored by direct player-IP-vs-AI-IP comparison, not the 3-location most-locations/tiebreaker rule every other boss (including otzi) uses. A tie is explicitly treated as a loss for progression purposes. The level schema\'s scoring section has no `rule: \'single-location\'` equivalent.'
      }
    ]
  }
  ,
  hyksos: {
    nodeId: 'hyksos', file: 'js/sog-adventure-hyksos.js', hook: 'hyksos',
    /* AMBUSH, not an overworld boss node. Three consequences for this registry:
       - THREE dialogue slots, not ten. There is no tier here (the config sets no
         ai.tier at all, which routes ai.js to the battle's own INVADER selector),
         so none of the serf or giant slots exist. There is also no `opening`:
         the ambush drops straight into the battle by design, and Stage 2 owns
         the intro dialogue.
       - The three arrays are PLACEHOLDER DRAFTS. They are real, findable,
         plain-literal vars, so they are editable exactly like every other
         boss's — the text itself is just not final.
       - NOT REACHABLE FROM THE MAP yet: js/overworld.js has no branch for a
         'hyksos' node (Stage 2 wires the ambush trigger/staging). The script
         self-registers via BattleHooks and the dev panel's LAUNCH row starts it,
         but nothing on the map calls start(). Same standing as hatshepsut. */
    dialogue: { win: 'WIN_DIALOGUE', loss: 'LOSS_DIALOGUE', tie: 'TIE_DIALOGUE' },
    locationsFn: '_locations', aiIdsFn: '_buildAiIds',
    presentationInline: true,   // inline object literal in buildHyksosConfig
    structure: { turns: 5, locationsCount: 3, slotsPerLocation: 4, handStart: 5, maxHandSize: 7 },
    resource: { model: 'capital', capital: 5, resetEachTurn: true },
    scoring: { rule: 'most-locations', winThreshold: 2, tiebreaker: 'total-ip', exactTie: 'tie' },
    notes: [
      'All three locations now carry an ability, handled by SHARED engine keys rather than by the battle module: The Nile Delta (131) ONE_CC_PLUS_ONE_HERE, Thebes (132) LEAD_HERE_BOOSTS_OTHERS, Aswan Cataract (133) NO_MOVE_HERE. Text lives in LOC_ABILITY_TEXT; the handlers are in abilities.js evaluateContinuous (the first two) and board.js isMoveBlockedInto (the third).',
      'AI deck is BUILT, not listed — _buildAiIds() expands HYKSOS_COUNT/SOLDIER_COUNT/CHARIOT_COUNT into 5x67 + 5x70 + 5x69. This is the first deck in the game with DUPLICATE card ids, so there is no flat AI_IDS array to extract; edit the three count constants instead.',
      'Reward is script-owned and is the CARD ONLY — _onWin unlocks Hyksos (67) via SOG.Cards.unlock and grants NO gold. SOG.rewards is never consulted, because it gates on tier flags and this battle has no tier.',
      'UNTIERED: buildHyksosConfig sets no ai.tier, so cfg.flagTier stays null and a win stamps no tier-beaten flag. The dev panel entry carries forceTier: null so its tier selector is not baked in.',
      'MUST-WIN: the loss/tie scoreboard offers only PLAY AGAIN / GAMEBOARD (no exit). Stage 2 replaces this with the real retry loop.',
      'Location art is REAL for all three (no placeholders): nile_delta.jpg (131, renamed from Avaris), thebes.jpg (132), aswan_cataract.jpg (133, renamed from The Cataracts). The two new filenames use UNDERSCORES. Each path appears TWICE — LOC_ART in the module (popup/thumbnail) and the body.hyksos-battle rules in css/style.css (tile background); they must agree.'
    ],
    bespokeMechanics: [
      {
        name: 'Side-crossing (Hyksos 67, "Foreign Rule")',
        file: 'js/game/abilities.js',
        lines: 'abilityHyksos',
        description: 'At Once, the card TRANSFERS to the opponent\'s side of its own location — the slot record moves from one side\'s array to the other. Ownership in this engine is purely positional (`owner === \'player\' ? G.playerSlots : G.aiSlots`), so the transfer flips scoring, per-location counting, aura eligibility and destroy credit all at once. Fizzles (stays put at -1 on its owner\'s side) when the target side is full. The crossed card is marked _defected and neither side\'s mover will relocate it.'
      },
      {
        name: 'Duplicate-id deck',
        file: 'js/sog-adventure-hyksos.js',
        lines: '_buildAiIds',
        description: 'First deck to run multiple copies of the same card. The engine already supported it (decks never dedupe, hand removal splices ONE instance, reveals resolve by (locId, slotIndex) coordinates); the one thing that does not survive duplicates is findSlotEl(owner, cardId), so abilityHyksos identifies its own slot by "revealed, here, no playTime yet" instead.'
      }
    ]
  }
};

/* Assemble one boss's read-only preview: every dialogue array (extracted
   generically), locations/AI-ids/presentation (extracted, with constant
   resolution where the source needs it), structure/resource/scoring
   (hand-verified values from BOSS_SOURCES), and the bespoke-mechanics list.
   Every extracted field carries its own sourceText/isPlainLiteral, so the
   caller (and the verification dump) can show source-vs-extracted for
   every single value, not just trust this function got it right. */
function buildBossPreview(key) {
  var src = BOSS_SOURCES[key];
  if (!src) return null;
  var abs = path.join(__dirname, '..', '..', src.file);
  var fileText = fs.readFileSync(abs, 'utf8');

  var dialogue = {};
  Object.keys(src.dialogue).forEach(function (schemaKey) {
    var spec = src.dialogue[schemaKey];
    if (spec == null) { dialogue[schemaKey] = { present: false }; return; }
    if (typeof spec === 'object' && spec.sameAs) {
      dialogue[schemaKey] = { present: true, sharedWith: spec.sameAs, note: spec.note, extraction: extractVar(fileText, spec.sameAs) };
      return;
    }
    var varName = typeof spec === 'object' ? spec.varName : spec;
    var extraction = extractVar(fileText, varName);
    dialogue[schemaKey] = { present: true, varName: varName, note: typeof spec === 'object' ? spec.note : null, extraction: extraction };
  });
  // Phase 2 gate, computed once here rather than re-derived client-side —
  // see dialogueEditability's own docstring for what disqualifies a key.
  Object.keys(dialogue).forEach(function (schemaKey) {
    var gate = dialogueEditability(dialogue[schemaKey]);
    dialogue[schemaKey].editable = gate.editable;
    dialogue[schemaKey].editBlockedReason = gate.reason;
    dialogue[schemaKey].lineOpsBlocked = !!gate.lineOpsBlocked;
    dialogue[schemaKey].lineOpsBlockedReason = gate.lineOpsBlockedReason || null;
  });

  var locations = extractWithResolution(fileText, src.locationsFn, true);

  var aiIds;
  if (src.aiIdsExpr) {
    aiIds = { computed: true, note: src.aiIdsExpr.note, value: src.aiIdsExpr.value };
  } else {
    aiIds = { computed: false, extraction: extractVar(fileText, src.aiIdsVar) };
  }

  // The bubble-portrait vars (SARGON_BUBBLE_PORTRAIT etc.) are plain string
  // scalars (`var X = 'images/...';`), not [...]/{...} literals — extractVar's
  // _bracketSpan only matches array/object values and would always report
  // "not found" here. Same shape as RULES_TITLE, so the same scalar
  // extractor applies. This is independent of presentationInline — Narmer
  // has an inline presentation object but a SEPARATE, named, non-inline
  // NARMER_BUBBLE_PORTRAIT var, so it must still be extracted even when the
  // presentation object itself can't be.
  var bubble = src.bubblePortraitVar ? extractScalarVar(fileText, src.bubblePortraitVar) : null;
  var presentation;
  if (src.presentationInline) {
    presentation = { inline: true, note: 'No named var — inline object literal in the build*Config() function. See notes for this boss.', bubblePortrait: bubble };
  } else {
    var pres = extractWithResolution(fileText, src.presentationVar, false);
    presentation = { inline: false, extraction: pres, bubblePortrait: bubble };
  }

  var rulesPopup = {
    title: extractScalarVar(fileText, src.rulesTitleVar),
    body: extractVar(fileText, src.rulesBodyVar)
  };

  return {
    key: key,
    nodeId: src.nodeId,
    file: src.file,
    hook: src.hook,
    structure: src.structure,
    resource: src.resource,
    scoring: src.scoring,
    dialogue: dialogue,
    locations: locations,
    aiIds: aiIds,
    presentation: presentation,
    rulesPopup: rulesPopup,
    notes: src.notes || [],
    bespokeMechanics: src.bespokeMechanics || []
  };
}

function buildAllBossPreviews() {
  var out = {};
  Object.keys(BOSS_SOURCES).forEach(function (key) {
    out[BOSS_SOURCES[key].nodeId] = buildBossPreview(key);
  });
  return out;
}

/* Existence check, not content extraction — the half of "boss files drift
   out of BOSS_SOURCES" that CAN be automated (which files exist and
   register a battle) versus the half that can't (which variable maps to
   which of the 10 dialogue slots — no naming convention to exploit, see
   the per-boss `notes` above for how much that mapping varies file to
   file). Scans every js/sog-adventure-*.js file for
   SOG.BattleHooks.register('<hook>', ...) calls and reports any file that
   registers a hook but never appears as a `file:` value anywhere in
   BOSS_SOURCES. This is exactly the class of gap that let Hatshepsut
   (and, before this pass, otzi/prehistory) sit unnoticed — surfaced here
   instead of found by hand three weeks later. */
function findUnregisteredBossFiles() {
  var jsDir = path.join(__dirname, '..', '..', 'js');
  var registeredFiles = {};
  Object.keys(BOSS_SOURCES).forEach(function (key) {
    registeredFiles[BOSS_SOURCES[key].file] = true;
  });

  var entries;
  try { entries = fs.readdirSync(jsDir); }
  catch (e) { return [{ file: null, hooks: [], error: 'could not list js/: ' + e.message }]; }

  var out = [];
  entries.forEach(function (name) {
    if (!/^sog-adventure-.*\.js$/.test(name)) return;
    var rel = 'js/' + name;
    if (registeredFiles[rel]) return;   // already in BOSS_SOURCES — not a gap

    var text;
    try { text = fs.readFileSync(path.join(jsDir, name), 'utf8'); }
    catch (e) { return; }

    var re = /BattleHooks\.register\(\s*'([^']+)'/g;
    var hooks = [];
    var m;
    while ((m = re.exec(text))) {
      if (hooks.indexOf(m[1]) === -1) hooks.push(m[1]);
    }
    // No BattleHooks.register at all → not a battle (sog-adventure-hud.js,
    // sog-adventure-egypt.js) — nothing to flag, this file was never a gap.
    if (hooks.length) out.push({ file: rel, hooks: hooks });
  });
  return out;
}

/* Previews are keyed by nodeId (matches State.bossKey / viewBoss() client-
   side, same keying as authored levels). BOSS_SOURCES itself is keyed by a
   separate internal name — 'gilgamesh' whose nodeId is 'walls-of-uruk',
   notably — so the save endpoint needs this reverse lookup to go from what
   the client sends back to the BOSS_SOURCES entry that actually says which
   file to touch. */
function bossSourceByNodeId(nodeId) {
  var key = Object.keys(BOSS_SOURCES).filter(function (k) { return BOSS_SOURCES[k].nodeId === nodeId; })[0];
  return key ? BOSS_SOURCES[key] : null;
}

module.exports = {
  findVarSpan: findVarSpan,
  findFunctionReturnSpan: findFunctionReturnSpan,
  isPlainLiteral: isPlainLiteral,
  hasComments: hasComments,
  evalLiteral: evalLiteral,
  extractVar: extractVar,
  extractFunctionReturn: extractFunctionReturn,
  extractScalarVar: extractScalarVar,
  buildConstantDictionary: buildConstantDictionary,
  resolveIdentifiers: resolveIdentifiers,
  extractWithResolution: extractWithResolution,
  BOSS_SOURCES: BOSS_SOURCES,
  buildBossPreview: buildBossPreview,
  buildAllBossPreviews: buildAllBossPreviews,
  findUnregisteredBossFiles: findUnregisteredBossFiles,
  bossSourceByNodeId: bossSourceByNodeId,
  hasUnrepresentableFields: hasUnrepresentableFields,
  dialogueEditability: dialogueEditability,
  serializeDialogueLine: serializeDialogueLine,
  serializeDialogueArray: serializeDialogueArray,
  findObjectItemSpans: findObjectItemSpans,
  findQuotedFieldSpan: findQuotedFieldSpan,
  rewriteDialogueLineText: rewriteDialogueLineText,
  applyDialogueEdits: applyDialogueEdits,
  findFunctionBodySpan: findFunctionBodySpan,
  findInlineArraySpan: findInlineArraySpan,
  applyInlineDialogueEdit: applyInlineDialogueEdit
};

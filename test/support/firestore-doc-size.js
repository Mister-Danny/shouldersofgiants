'use strict';

// Firestore storage size of a document, per
// https://firebase.google.com/docs/firestore/storage-size — string = UTF-8 bytes + 1,
// number / timestamp = 8, boolean / null = 1, map = Σ(key + value), array = Σ values,
// document = name size + Σ fields + 32. Used by the play-log tests to keep session
// docs well under Firestore's 1 MiB limit.
//
// (Lives under test/ so node --test also loads it; it defines no tests.)

function valueSize(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 8;
  if (typeof v === 'string') return Buffer.byteLength(v, 'utf8') + 1;
  if (v instanceof Date) return 8;
  if (Array.isArray(v)) return v.reduce((s, x) => s + valueSize(x), 0);
  if (typeof v === 'object') {
    // Timestamps and serverTimestamp sentinels (emulator Timestamp, test stubs) count as 8.
    if (typeof v.toMillis === 'function' || v.__serverTimestamp) return 8;
    return Object.entries(v).reduce((s, [k, x]) => s + Buffer.byteLength(k, 'utf8') + 1 + valueSize(x), 0);
  }
  return 0;
}

function documentSize(path, data) {
  const nameSize = path.split('/').reduce((s, seg) => s + Buffer.byteLength(seg, 'utf8') + 1, 0) + 16;
  return nameSize + valueSize(data) + 32;
}

module.exports = { documentSize };

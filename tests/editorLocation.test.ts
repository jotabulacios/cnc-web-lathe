import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorSelection } from '../src/lib/lathe/editorLocation.ts';
import { copyDocument, normalizeLineEndings, replaceDocument } from '../src/lib/lathe/document.ts';
import { defaultSetup } from '../src/lib/lathe/contract.ts';
import { draftFromSetup } from '../src/lib/lathe/setup.ts';

test('UTF-16 native columns select the exact word after a supplementary Unicode comment', () => {
  const text = '; inicio\n(🛠) G71 X10\n';
  const selected = editorSelection(text, { line: 2, columnStart: 6, columnEnd: 9 });
  assert.ok(selected);
  assert.equal(text.slice(selected.start, selected.end), 'G71');
  assert.equal(selected.start, text.indexOf('G71'));
});

test('line offsets account for CRLF and allow a zero-length selection at EOF', () => {
  const text = 'G21\r\nG00 X60 Z5\r\n';
  assert.deepEqual(editorSelection(text, { line: 2, columnStart: 1, columnEnd: 4 }), { start: 5, end: 8, lineStart: 5 });
  assert.deepEqual(editorSelection(text, { line: 3, columnStart: 1, columnEnd: 1 }), { start: text.length, end: text.length, lineStart: text.length });
  assert.deepEqual(editorSelection('', { line: 1, columnStart: 1, columnEnd: 1 }), { start: 0, end: 0, lineStart: 0 });
});

test('invalid, out-of-range or split-surrogate locations are ignored rather than moved to another token', () => {
  for (const span of [{ line: 0, columnStart: 1, columnEnd: 2 }, { line: 2, columnStart: 1, columnEnd: 2 },
    { line: 1.5, columnStart: 1, columnEnd: 2 }, { line: 1, columnStart: 2, columnEnd: 1 },
    { line: 1, columnStart: 1, columnEnd: 100 }, { line: NaN, columnStart: 1, columnEnd: 2 }]) {
    assert.equal(editorSelection('G71', span), null);
  }
  assert.equal(editorSelection('🛠', { line: 1, columnStart: 2, columnEnd: 3 }), null);
  assert.equal(editorSelection('🛠', { line: 1, columnStart: 1, columnEnd: 2 }), null);
  assert.deepEqual(editorSelection('🛠', { line: 1, columnStart: 1, columnEnd: 3 }), { start: 0, end: 2, lineStart: 0 });
});

test('editor documents canonicalize line endings without replacing the previous backup for EOL-only changes', () => {
  const current = { source: 'G00 X70\nM30\n', setup: defaultSetup, draft: draftFromSetup(defaultSetup), exerciseId: null };
  const previous = copyDocument({ ...current, source: 'G00 X80' });
  const replacement = replaceDocument(current, { ...current, source: 'G00 X70\r\nM30\r' }, previous);
  assert.equal(replacement.document.source, current.source);
  assert.equal(replacement.previous, previous);
  assert.equal(normalizeLineEndings('G00 X70\rM30\r'), current.source);
});

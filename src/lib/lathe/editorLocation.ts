export type SourceLocation = { line: number; columnStart: number; columnEnd: number };
export type EditorFocusRequest = { revision: number; span: SourceLocation; severity: 'error' | 'warning' };

/** Native columns are 1-based UTF-16 with an exclusive end, matching JS indexes.
 * Use the textarea's value: browsers normalize its CRLFs before exposing selection.
 */
export function editorSelection(text: string, span: SourceLocation): { start: number; end: number; lineStart: number } | null {
  if (![span.line, span.columnStart, span.columnEnd].every(Number.isSafeInteger)
    || span.line < 1 || span.columnStart < 1 || span.columnEnd < span.columnStart) return null;
  let lineStart = 0;
  for (let line = 1; line < span.line; line++) {
    const newline = text.indexOf('\n', lineStart);
    if (newline < 0) return null;
    lineStart = newline + 1;
  }
  const newline = text.indexOf('\n', lineStart);
  let lineEnd = newline < 0 ? text.length : newline;
  if (lineEnd > lineStart && text[lineEnd - 1] === '\r') lineEnd--;
  const start = lineStart + span.columnStart - 1;
  const end = lineStart + span.columnEnd - 1;
  if (start > lineEnd || end > lineEnd) return null;
  const splitsSurrogate = (index: number) => text.charCodeAt(index - 1) >= 0xd800 && text.charCodeAt(index - 1) <= 0xdbff
    && text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff;
  if (splitsSurrogate(start) || splitsSurrogate(end)) return null;
  return { start, end, lineStart };
}

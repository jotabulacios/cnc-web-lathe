"use client";

import { useMemo, useRef, useCallback, useEffect, useLayoutEffect, useSyncExternalStore, type CSSProperties } from "react";
import { editorSelection, type EditorFocusRequest } from '../lib/lathe/editorLocation';


// Keep the server-rendered editor read-only until React can preserve edits.
const subscribeToReadiness = () => () => {};
const readyOnClient = () => true;
const waitingOnServer = () => false;

// ---------- tokenizer ----------
type Tok = { t: string; c: string };

const COLORS: Record<string, string> = {
  G: "#0369a1",
  M: "#b45309",
  T: "#7c3aed",
  F: "#a16207",
  S: "#be123c",
  X: "#047857",
  U: "#047857",
  W: "#15803d",
  Y: "#047857",
  Z: "#15803d",
  I: "#1d4ed8",
  J: "#1d4ed8",
  K: "#1d4ed8",
  R: "#7e22ce",
  N: "#64748b",
  num: "#0f172a",
  comment: "#6b7280",
  punct: "#64748b",
  default: "#334155",
};

function tokenizeLine(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = line.length;
  // leading N-number or slash
  // We'll just scan char by char.
  while (i < n) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      let j = i;
      while (j < n && (line[j] === " " || line[j] === "\t")) j++;
      toks.push({ t: line.slice(i, j), c: "default" });
      i = j;
      continue;
    }
    if (ch === ";") {
      toks.push({ t: line.slice(i), c: "comment" });
      i = n;
      continue;
    }
    if (ch === "(") {
      const end = line.indexOf(")", i);
      const stop = end === -1 ? n : end + 1;
      toks.push({ t: line.slice(i, stop), c: "comment" });
      i = stop;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const letter = ch.toUpperCase();
      let j = i + 1;
      // optional sign + digits/decimals
      while (j < n && /[-+0-9.]/.test(line[j])) j++;
      const word = line.slice(i, j);
      toks.push({ t: word, c: COLORS[letter] ? letter : "default" });
      i = j;
      continue;
    }
    // other punctuation
    toks.push({ t: ch, c: "punct" });
    i++;
  }
  return toks;
}

const FONT: CSSProperties = {
  fontFamily:
    "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  lineHeight: "20px",
  letterSpacing: 0,
  tabSize: 2,
  whiteSpace: "pre",
  wordBreak: "keep-all",
  margin: 0,
};

// Adapted from rudra496/cnc GCodeEditor.tsx (MIT); see THIRD_PARTY_NOTICES.md.
export default function GCodeEditor({ source, onChange, currentLine, revision, focusRequest }: {
  source: string; onChange: (source: string) => void; currentLine: number;
  revision: number; focusRequest: EditorFocusRequest | null;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const interactive = useSyncExternalStore(subscribeToReadiness, readyOnClient, waitingOnServer);
  const lines = useMemo(() => source.split("\n"), [source]);

  const notifyViewport = useRef<(() => void) | null>(null);
  const subscribeViewport = useCallback((notify: () => void) => {
    const textarea = taRef.current;
    if (!textarea) return () => {};
    notifyViewport.current = notify;
    const observer = new ResizeObserver(notify);
    observer.observe(textarea);
    textarea.addEventListener('scroll', notify);
    return () => { observer.disconnect(); textarea.removeEventListener('scroll', notify); notifyViewport.current = null; };
  }, []);
  const viewportSnapshot = useCallback(() => {
    const textarea = taRef.current;
    return textarea ? `${Math.floor(textarea.scrollTop / 20)}:${textarea.clientHeight}:${textarea.scrollWidth}:${Math.max(0, textarea.offsetHeight - textarea.clientHeight)}` : '0:300:0:0';
  }, []);
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => '0:300:0:0');
  const [firstVisible, viewportHeight, contentWidth, horizontalScrollbar] = viewport.split(':').map(Number);
  const start = Math.max(0, Math.min(lines.length - 1, firstVisible) - 10);
  const end = Math.min(lines.length, start + Math.ceil(viewportHeight / 20) + 21);
  const visibleLines = lines.slice(start, end);

  const handleScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    notifyViewport.current?.();
  }, []);

  // Reapply the native scroll after a virtual row range changes its layout.
  useLayoutEffect(() => {
    const textarea = taRef.current;
    if (!textarea) return;
    if (preRef.current) { preRef.current.scrollTop = textarea.scrollTop; preRef.current.scrollLeft = textarea.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
  }, [source, start, end, contentWidth, horizontalScrollbar]);

  // A desktop editor can become much shorter on mobile. Preserve a focused
  // diagnostic selection in the visible range after that height change. Do not
  // pull ordinary scrolling back to the diagnostic or replace a new selection.
  useLayoutEffect(() => {
    const textarea = taRef.current;
    if (!textarea || document.activeElement !== textarea || !focusRequest || focusRequest.revision !== revision) return;
    const selection = editorSelection(textarea.value, focusRequest.span);
    if (!selection || textarea.selectionStart !== selection.start || textarea.selectionEnd !== selection.end) return;
    const lineTop = 12 + (focusRequest.span.line - 1) * 20;
    if (lineTop < textarea.scrollTop || lineTop + 20 > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, lineTop - textarea.clientHeight / 2);
      handleScroll();
    }
  }, [viewportHeight, focusRequest, revision, source, handleScroll]);

  // Follow completed blocks without moving focus or altering the student's selection.
  useEffect(() => {
    const textarea = taRef.current;
    if (!textarea || currentLine <= 0) return;
    const lineTop = 12 + (currentLine - 1) * 20;
    if (lineTop < textarea.scrollTop || lineTop + 20 > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, lineTop - textarea.clientHeight / 2);
      handleScroll();
    }
  }, [currentLine, handleScroll]);

  useEffect(() => {
    const textarea = taRef.current;
    if (!textarea || !focusRequest || focusRequest.revision !== revision) return;
    const selection = editorSelection(textarea.value, focusRequest.span);
    if (!selection) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(selection.start, selection.end);
    textarea.scrollTop = Math.max(0, 12 + (focusRequest.span.line - 1) * 20 - textarea.clientHeight / 2);
    const context = document.createElement('canvas').getContext('2d');
    if (context) {
      const style = getComputedStyle(textarea);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const tabWidth = Math.max(1, context.measureText(' ').width * (Number(style.tabSize) || 2));
      const parts = textarea.value.slice(selection.lineStart, selection.start).split('\t');
      let width = 0;
      for (let i = 0; i < parts.length; i++) {
        width += context.measureText(parts[i]).width;
        if (i < parts.length - 1) width = (Math.floor(width / tabWidth) + 1) * tabWidth;
      }
      textarea.scrollLeft = Math.max(0, width + 8 - textarea.clientWidth / 2);
    }
    handleScroll();
    textarea.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusRequest, revision, source, handleScroll]);

  return (
    <div className="code-editor">
      <div className="code-editor-inner">
        {/* gutter */}
        <div
          ref={gutterRef}
          className="code-gutter"
          style={{ ...FONT, color: "#94a3b8", minWidth: 52 }}
          aria-hidden
        >
          {/* The gutter has no horizontal bar; match the textarea scroll range. */}
          <div style={{ height: lines.length * 20 + horizontalScrollbar, position: 'relative' }}>
          {visibleLines.map((_, index) => (
            <div key={start + index} data-gutter-line={start + index + 1} style={{ height: 20, position: 'absolute', top: (start + index) * 20, right: 0 }}>
              {start + index + 1}
            </div>
          ))}
          </div>
        </div>

        {/* code area */}
        <div className="code-area">
          {/* highlight layer */}
          <pre
            ref={preRef}
            aria-hidden
            className="code-highlight"
            style={FONT}
          >
            <div style={{ height: lines.length * 20, minWidth: Math.max(0, contentWidth - 26), position: 'relative' }}>
            {visibleLines.map((ln, index) => {
              const i = start + index;
              const lineNo = i + 1;
              const active = lineNo === currentLine;
              const diagnostic = focusRequest?.revision === revision && focusRequest.span.line === lineNo ? focusRequest.severity : null;
              const toks = tokenizeLine(ln || " ");
              return (
                <div
                  key={i}
                  data-line={lineNo}
                  data-diagnostic={diagnostic ?? undefined}
                  style={{
                    height: 20, position: 'absolute', top: i * 20, left: 0, right: 0,
                    background: diagnostic ? diagnostic === 'error' ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.12)' : active
                      ? "rgba(37,99,235,0.10)"
                      : undefined,
                    boxShadow: diagnostic ? `inset 2px 0 0 ${diagnostic === 'error' ? '#dc2626' : '#d97706'}` : active
                      ? "inset 2px 0 0 #2563eb"
                      : undefined,
                    borderRadius: 0,
                  }}
                >
                  {toks.map((tk, k) => (
                    <span key={k} style={{ color: COLORS[tk.c] ?? "#334155" }}>
                      {tk.t}
                    </span>
                  ))}
                  {ln === "" ? "\u200b" : null}
                </div>
              );
            })}
            </div>
          </pre>

          {/* textarea (transparent text, visible caret) */}
          <textarea
            ref={taRef}
            aria-label="Programa G-code"
            readOnly={!interactive}
            aria-busy={!interactive}
            value={source}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            wrap="off"
            className="code-input"
            style={FONT}
            placeholder="; Escribí tu programa G-code…"
          />
        </div>
      </div>
    </div>
  );
}

import { normalizeLineEndings } from './document.ts';
import { MAX_PROGRAM_BYTES } from './project.ts';

/** Decode bytes strictly: a damaged/legacy encoding must not silently change CNC words. */
export function decodeProgramFile(buffer: ArrayBuffer): string {
  if (buffer.byteLength > MAX_PROGRAM_BYTES) throw new Error('El programa supera el límite de 256 KiB.');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('El programa debe estar codificado en UTF-8.'); }
  if (source.includes('\0')) throw new Error('El archivo contiene caracteres nulos; abrí un programa de texto UTF-8.');
  return normalizeLineEndings(source);
}

export function encodeProgramFile(source: string): string {
  const text = normalizeLineEndings(source);
  if (new TextEncoder().encode(text).byteLength > MAX_PROGRAM_BYTES) throw new Error('El programa supera el límite de 256 KiB.');
  if (text.includes('\0')) throw new Error('El programa contiene caracteres nulos.');
  return text;
}

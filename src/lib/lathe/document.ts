import type { Setup } from './contract.ts';
import type { SetupDraft } from './setup.ts';

export type LabDocument = { source: string; setup: Setup; draft: SetupDraft; exerciseId: string | null };
/** Textareas normalize line endings; keep the source sent to Rust identical to the editor. */
export const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');
export function copyDocument(document: LabDocument): LabDocument {
  const { toolOffsets, jaws } = document.setup;
  const { offsets, isoTools } = document.draft;
  return { ...document, setup: { ...document.setup, stock: { ...document.setup.stock },
    initialPosition: { ...document.setup.initialPosition },
    ...(toolOffsets ? { toolOffsets: toolOffsets.map(row => ({ ...row })) } : {}),
    ...(jaws ? { jaws: { ...jaws } } : {}) },
  draft: { ...document.draft, ...(offsets ? { offsets: Object.fromEntries(Object.entries(offsets).map(([id, row]) => [id, { ...row }])) } : {}),
    ...(isoTools ? { isoTools: Object.fromEntries(Object.entries(isoTools).map(([id, row]) => [id, { ...row }])) } : {}) } };
}
const offsetsKey = (setup: Setup) => JSON.stringify(setup.toolOffsets ?? []);
export function sameSetup(a: Setup, b: Setup) {
  return a.xConvention === b.xConvention && a.toolId === b.toolId
    && a.stock.diameterMm === b.stock.diameterMm && a.stock.lengthMm === b.stock.lengthMm
    && (a.stock.innerDiameterMm ?? 0) === (b.stock.innerDiameterMm ?? 0)
    && a.initialPosition.rMm === b.initialPosition.rMm && a.initialPosition.zMm === b.initialPosition.zMm
    && offsetsKey(a) === offsetsKey(b)
    && JSON.stringify(a.jaws ?? null) === JSON.stringify(b.jaws ?? null);
}
export function replaceDocument(current: LabDocument, next: LabDocument, previous: LabDocument | null) {
  const same = normalizeLineEndings(current.source) === normalizeLineEndings(next.source) && current.exerciseId === next.exerciseId && sameSetup(current.setup, next.setup)
    && ([...new Set([...Object.keys(current.draft), ...Object.keys(next.draft)])] as (keyof SetupDraft)[]).every(field => field === 'offsets' || field === 'isoTools'
      ? JSON.stringify(current.draft[field] ?? null) === JSON.stringify(next.draft[field] ?? null)
      : current.draft[field] === next.draft[field]);
  return { document: copyDocument({ ...next, source: normalizeLineEndings(next.source) }), previous: same ? previous : copyDocument(current) };
}

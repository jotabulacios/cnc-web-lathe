import { z } from 'zod';
import { setupSchema, toolIdSchema } from './contract.ts';
import { sameSetup, type LabDocument } from './document.ts';
import { validateSetupDraft } from './setup.ts';

export class ProjectFormatError extends Error {}

export const PROJECT_STORAGE_KEY = 'cnc-web-lathe.project.v1';
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_PROGRAM_BYTES = 256 * 1024;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const field = z.string().max(1024);
const documentSchema = z.object({
  source: z.string().refine(text => bytes(text) <= MAX_PROGRAM_BYTES), setup: setupSchema,
  draft: z.object({ diameter: field, innerDiameter: field.optional(), length: field, initialX: field, initialZ: field, toolId: toolIdSchema.optional(),
    offsets: z.partialRecord(toolIdSchema, z.object({ calibrationErrorX: field, calibrationErrorZ: field, wearX: field, wearZ: field, noseRadius: field.optional() }).strict()).optional(),
    isoTools: z.partialRecord(toolIdSchema, z.object({ insert: z.string().max(32), holder: z.string().max(32) }).strict()).optional(),
    gripLength: field.optional(), jawHeight: field.optional(),
  }).strict(),
  exerciseId: z.string().max(64).regex(/^[a-z-]+$/).nullable(),
}).strict().superRefine((document, context) => {
  const validation = validateSetupDraft({ ...document.draft, toolId: document.draft.toolId ?? document.setup.toolId });
  if (document.draft.toolId !== undefined && document.draft.toolId !== document.setup.toolId) {
    context.addIssue({ code: 'custom', path: ['draft', 'toolId'], message: 'La herramienta y su campo no coinciden.' });
  }
  if (validation.setup && !sameSetup(validation.setup, document.setup)) {
    context.addIssue({ code: 'custom', path: ['draft'], message: 'La configuración y sus campos no coinciden.' });
  }
});
const projectSchema = z.object({ format: z.literal('cnc-web-lathe-project'), version: z.union([z.literal(1), z.literal(2)]),
  dialect: z.enum(['edu-lathe-v1', 'edu-lathe-v2']), document: documentSchema }).strict().superRefine((project, context) => {
  if (project.dialect !== `edu-lathe-v${project.version}`) {
    context.addIssue({ code: 'custom', path: ['dialect'], message: 'El dialecto no coincide con la versión del proyecto.' });
  }
  if (project.version === 1 && needsV2(project.document)) {
    context.addIssue({ code: 'custom', path: ['document'], message: 'El material tubular y la herramienta interior requieren un proyecto v2.' });
  }
});
function needsV2(document: LabDocument) {
  return document.setup.stock.innerDiameterMm !== undefined || document.draft.innerDiameter !== undefined
    || document.setup.toolId === 'boring-id' || document.draft.toolId === 'boring-id'
    || document.setup.toolOffsets !== undefined || document.draft.offsets !== undefined;
}
function validate(value: unknown): LabDocument {
  const result = projectSchema.safeParse(value);
  if (result.success) {
    const document = result.data.document;
    return { ...document, draft: { ...document.draft, toolId: document.draft.toolId ?? document.setup.toolId } };
  }
  const path = result.error.issues[0].path.join('.');
  if (path.startsWith('document.source')) throw new ProjectFormatError('El programa debe ser texto de hasta 256 KiB en UTF-8.');
  if (path.startsWith('document.draft')) throw new ProjectFormatError('Los campos de configuración son demasiado largos o no coinciden con la configuración guardada.');
  throw new ProjectFormatError('El proyecto contiene un formato, versión, dialecto o configuración no admitidos.');
}
export function encodeProject(document: LabDocument, requestedVersion?: 1 | 2): string {
  const version = requestedVersion ?? (needsV2(document) ? 2 : 1);
  const project = { format: 'cnc-web-lathe-project', version, dialect: `edu-lathe-v${version}`, document };
  const normalized = validate(project);
  const text = JSON.stringify({ ...project, document: normalized }, null, 2) + '\n';
  if (bytes(text) > MAX_PROJECT_BYTES) throw new ProjectFormatError('El proyecto supera el límite de 2 MiB.');
  return text;
}
export function decodeProject(text: string): LabDocument {
  if (bytes(text) > MAX_PROJECT_BYTES) throw new ProjectFormatError('El proyecto supera el límite de 2 MiB.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new ProjectFormatError('El archivo no contiene JSON válido.'); }
  return validate(value);
}
type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function saveProject(storage: ProjectStorage, document: LabDocument, version?: 1 | 2) {
  storage.setItem(PROJECT_STORAGE_KEY, encodeProject(document, version));
}
export function loadProject(storage: ProjectStorage): LabDocument | null {
  const text = storage.getItem(PROJECT_STORAGE_KEY);
  return text === null ? null : decodeProject(text);
}

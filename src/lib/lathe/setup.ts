import type { Setup, ToolId, ToolOffset } from './contract.ts';
import { MAX_NOSE_RADIUS_MM, MAX_OFFSET_MM, toolIdSchema } from './contract.ts';
import type { IsoTools } from './isoTools.ts';
import { DEFAULT_JAW_HEIGHT_MM, resolvedJaws } from './chuck.ts';

/** Offset table fields as typed text; X values are DIAMETER, like the program. */
export const OFFSET_FIELDS = ['calibrationErrorX', 'calibrationErrorZ', 'wearX', 'wearZ', 'noseRadius'] as const;
export type OffsetField = typeof OFFSET_FIELDS[number];
/** `noseRadius` is optional so drafts saved before it existed stay valid. */
export type OffsetDraft = Record<Exclude<OffsetField, 'noseRadius'>, string> & { noseRadius?: string };
export type OffsetsDraft = Partial<Record<ToolId, OffsetDraft>>;
export const offsetErrorKey = (toolId: ToolId, field: OffsetField) => `offset.${toolId}.${field}` as const;
const toolOrder = toolIdSchema.options;

export type SetupDraft = {
  diameter: string;
  innerDiameter?: string;
  length: string;
  initialX: string;
  initialZ: string;
  toolId?: ToolId;
  offsets?: OffsetsDraft;
  /** Display-only ISO designations per station; never part of the engine setup. */
  isoTools?: IsoTools;
  /** Nominal chuck jaws (mm). Both absent = engine defaults, as in older projects. */
  gripLength?: string;
  jawHeight?: string;
};
export type SetupErrors = Partial<Record<keyof SetupDraft | ReturnType<typeof offsetErrorKey>, string>>;
const NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

export function draftFromSetup(setup: Setup): SetupDraft {
  return {
    diameter: String(setup.stock.diameterMm),
    ...(setup.stock.innerDiameterMm === undefined ? {} : { innerDiameter: String(setup.stock.innerDiameterMm) }),
    length: String(setup.stock.lengthMm),
    initialX: String(setup.initialPosition.rMm * 2),
    initialZ: String(setup.initialPosition.zMm),
    toolId: setup.toolId,
    ...(setup.jaws === undefined ? {} : { gripLength: String(setup.jaws.gripLengthMm), jawHeight: String(setup.jaws.jawHeightMm) }),
    ...(setup.toolOffsets === undefined ? {} : { offsets: Object.fromEntries(setup.toolOffsets.map(row => [row.toolId, {
      calibrationErrorX: String(row.calibrationErrorXMm), calibrationErrorZ: String(row.calibrationErrorZMm),
      wearX: String(row.wearXMm), wearZ: String(row.wearZMm), noseRadius: String(row.noseRadiusMm ?? 0),
    }])) }),
  };
}

/** Rows in catalogue order; an all-zero table emits nothing, so it equals the legacy setup. */
function validateOffsets(offsets: OffsetsDraft | undefined, errors: SetupErrors): ToolOffset[] {
  const rows: ToolOffset[] = [];
  for (const toolId of toolOrder) {
    const draft = offsets?.[toolId];
    if (!draft) continue;
    const values = {} as Record<OffsetField, number>;
    for (const field of OFFSET_FIELDS) {
      const text = (draft[field] ?? '0').trim() || '0';
      const value = Number(text.replace(',', '.'));
      if (field === 'noseRadius') {
        if (!NUMBER.test(text) || !Number.isFinite(value) || value < 0 || value > MAX_NOSE_RADIUS_MM) {
          errors[offsetErrorKey(toolId, field)] = `Entre 0 y ${MAX_NOSE_RADIUS_MM} mm.`;
        }
      } else if (!NUMBER.test(text) || !Number.isFinite(value) || Math.abs(value) > MAX_OFFSET_MM) {
        errors[offsetErrorKey(toolId, field)] = `Entre −${MAX_OFFSET_MM} y ${MAX_OFFSET_MM} mm.`;
      }
      values[field] = value === 0 ? 0 : value;
    }
    if (OFFSET_FIELDS.some(field => values[field] !== 0)) rows.push({ toolId, calibrationErrorXMm: values.calibrationErrorX,
      calibrationErrorZMm: values.calibrationErrorZ, wearXMm: values.wearX, wearZMm: values.wearZ,
      ...(values.noseRadius ? { noseRadiusMm: values.noseRadius } : {}) });
  }
  return rows;
}

export function validateSetupDraft(draft: SetupDraft): { setup: Setup | null; errors: SetupErrors } {
  const errors: SetupErrors = {};
  const numbers = {} as Record<'diameter' | 'innerDiameter' | 'length' | 'initialX' | 'initialZ', number>;
  for (const field of ['diameter', 'innerDiameter', 'length', 'initialX', 'initialZ'] as const) {
    const text = (field === 'innerDiameter' ? draft.innerDiameter ?? '0' : draft[field]).trim();
    const value = Number(text.replace(',', '.'));
    if (!NUMBER.test(text) || !Number.isFinite(value) || Math.abs(value) > 1e9) {
      errors[field] = 'Ingresá un número entre −1e9 y 1e9 mm.';
    } else if ((field === 'diameter' || field === 'length') && value <= 0) {
      errors[field] = 'La medida debe ser mayor que cero.';
    } else if (field === 'innerDiameter' && value < 0) {
      errors[field] = 'El diámetro interior no puede ser negativo.';
    } else if (field === 'initialX' && value < 0) {
      errors[field] = 'X en diámetro no puede ser negativo.';
    }
    numbers[field] = value;
  }
  if (!errors.innerDiameter && !errors.diameter && numbers.innerDiameter >= numbers.diameter) {
    errors.innerDiameter = 'El diámetro interior debe ser menor que el exterior.';
  }
  const jaws = validateJaws(draft, numbers.length, errors);
  const toolParsed = toolIdSchema.safeParse(draft.toolId);
  if (draft.toolId !== undefined && !toolParsed.success) errors.toolId = 'Elegí una herramienta del catálogo.';
  const toolId = toolParsed.success ? toolParsed.data : 'generic-od';
  const toolOffsets = validateOffsets(draft.offsets, errors);
  if (Object.keys(errors).length > 0) return { setup: null, errors };
  return {
    errors,
    setup: {
      xConvention: 'diameter',
      toolId,
      stock: { diameterMm: numbers.diameter, lengthMm: numbers.length,
        ...(draft.innerDiameter === undefined ? {} : { innerDiameterMm: numbers.innerDiameter }),
      },
      initialPosition: { rMm: numbers.initialX / 2, zMm: numbers.initialZ },
      ...(toolOffsets.length ? { toolOffsets } : {}),
      ...(jaws ? { jaws } : {}),
    },
  };
}

/** Typed jaw fields; an untouched pair keeps the setup without `jaws` (engine defaults). */
function validateJaws(draft: SetupDraft, lengthMm: number, errors: SetupErrors) {
  if (draft.gripLength === undefined && draft.jawHeight === undefined) return undefined;
  const fallback = resolvedJaws({ stock: { diameterMm: 1, lengthMm: Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 1 } });
  const parse = (text: string | undefined, standard: number) => {
    const trimmed = (text ?? String(standard)).trim();
    return { trimmed, value: Number(trimmed.replace(',', '.')) };
  };
  const grip = parse(draft.gripLength, fallback.gripLengthMm);
  const height = parse(draft.jawHeight, DEFAULT_JAW_HEIGHT_MM);
  if (!NUMBER.test(grip.trimmed) || !Number.isFinite(grip.value) || grip.value < 0) {
    errors.gripLength = 'Ingresá un largo de 0 mm o más.';
  } else if (!errors.length && grip.value >= lengthMm) {
    errors.gripLength = 'Las mordazas no pueden tomar todo el largo de la pieza.';
  }
  if (!NUMBER.test(height.trimmed) || !Number.isFinite(height.value) || height.value <= 0 || height.value > 1e9) {
    errors.jawHeight = 'La altura debe ser mayor que cero.';
  }
  return { gripLengthMm: grip.value === 0 ? 0 : grip.value, jawHeightMm: height.value };
}

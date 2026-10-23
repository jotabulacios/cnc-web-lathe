import { z } from 'zod';

export const positionSchema = z.object({ rMm: z.number().finite().nonnegative(), zMm: z.number().finite() }).strict();
export const toolIdSchema = z.enum([
  'generic-od',
  'roughing-od',
  'finishing-od',
  'grooving-od',
  'facing-od',
  'boring-id',
]);
export type ToolId = z.infer<typeof toolIdSchema>;
/** Educational offset table (edu-lathe-v2). X in DIAMETER; positive moves the tip outward. */
export const MAX_OFFSET_MM = 100;
export const MAX_NOSE_RADIUS_MM = 5;
const offsetValue = z.number().finite().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM);
export const toolOffsetSchema = z.object({
  toolId: toolIdSchema, calibrationErrorXMm: offsetValue, calibrationErrorZMm: offsetValue, wearXMm: offsetValue, wearZMm: offsetValue,
  /** Nose radius ρ (radius, mm); omitted means an ideal point. */
  noseRadiusMm: z.number().finite().min(0).max(MAX_NOSE_RADIUS_MM).optional(),
}).strict();
export type ToolOffset = z.infer<typeof toolOffsetSchema>;
/** Bounds of the editable setup; the form expresses initial X in diameter. */
export const setupSchema = z.object({
  xConvention: z.literal('diameter'), toolId: toolIdSchema,
  initialPosition: z.object({ rMm: z.number().finite().min(0).max(5e8), zMm: z.number().finite().min(-1e9).max(1e9) }).strict(),
  stock: z.object({ diameterMm: z.number().finite().positive().max(1e9), lengthMm: z.number().finite().positive().max(1e9),
    innerDiameterMm: z.number().finite().nonnegative().max(1e9).optional(),
  }).strict().refine(stock => (stock.innerDiameterMm ?? 0) < stock.diameterMm, 'El diámetro interior debe ser menor que el exterior.'),
  toolOffsets: z.array(toolOffsetSchema).max(6)
    .refine(rows => new Set(rows.map(row => row.toolId)).size === rows.length, 'Una fila por herramienta.').optional(),
}).strict();
const span = z.object({ line: z.number().int().positive(), columnStart: z.number().int().positive(), columnEnd: z.number().int().positive() }).strict();
const motionKind = z.enum(['rapid', 'linear', 'arc-cw', 'arc-ccw']);
const TAU = 2 * Math.PI;
/** Center radius may be negative: only the swept arc must stay off the axis. */
const arcGeometry = z.object({
  center: z.object({ rMm: z.number().finite(), zMm: z.number().finite() }).strict(),
  radiusMm: z.number().finite().positive(),
  clockwise: z.boolean(),
  sweepRad: z.number().finite().gt(0).lt(TAU),
}).strict();
const state = z.object({
  position: positionSchema,
  motion: motionKind.nullable(),
  feedMmMin: z.number().finite().positive().nullable(),
  spindleRpm: z.number().finite().nonnegative(),
  spindleOn: z.boolean(), spindleDirection: z.enum(['cw','ccw']), ended: z.boolean(),
  toolId: toolIdSchema.nullish(),
  /** Physical tip after offsets; `position` stays the programmed point. */
  tipPosition: positionSchema.optional(),
  /** Nose radius compensation G41 (left) / G42 (right of travel in the 2D view). */
  compensation: z.enum(['g41', 'g42']).optional(),
  /** G96 cutting speed m/min (absent = G97); `spindleRpm` is then the rpm at the current diameter. */
  cssMMin: z.number().finite().positive().optional(),
  /** G50 spindle limit, rpm. */
  maxRpm: z.number().finite().positive().optional(),
  /** G99: `feedMmMin` holds F in mm/rev. */
  feedPerRev: z.boolean().optional(),
}).strict();
const motion = z.object({
  id: z.number().int().nonnegative(), blockId: z.number().int().nonnegative(), span,
  kind: motionKind, from: positionSchema, to: positionSchema,
  arc: arcGeometry.nullish(),
  feedMmMin: z.number().finite().positive().nullable(), toolId: toolIdSchema,
  lengthMm: z.number().finite().nonnegative(),
  /** Nose start-up/cancel/connector feed move; the profile diagnoses it in stock. */
  lead: z.boolean().optional(),
  /** G99 feed in mm/rev (then feedMmMin is null). */
  feedMmRev: z.number().finite().positive().optional(),
  /** Educational time estimate, seconds. */
  timeS: z.number().finite().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
  const isArc = value.kind === 'arc-cw' || value.kind === 'arc-ccw';
  if (isArc && !value.arc) ctx.addIssue({ code: 'custom', message: 'Un movimiento de arco requiere geometría arc.' });
  if (!isArc && value.arc) ctx.addIssue({ code: 'custom', message: 'Solo los movimientos de arco llevan geometría arc.' });
});
export const resultSchema = z.object({
  apiVersion: z.union([z.literal(1), z.literal(2)]), dialect: z.enum(['edu-lathe-v1', 'edu-lathe-v2']), sourceRevision: z.number().int().nonnegative(),
  executable: z.boolean(), initialState: state,
  blocks: z.array(z.object({
    id: z.number().int().nonnegative(), span, source: z.string(),
    beforeState: state, afterState: state, motionIds: z.array(z.number().int().nonnegative()),
    kind: z.enum(['state','motion','end']),
    /** Canned-cycle role (edu-lathe-v2); motions are already expanded by Rust. */
    cycle: z.enum(['roughing-setup', 'roughing', 'finishing']).optional(),
  }).strict()),
  motions: z.array(motion),
  diagnostics: z.array(z.object({ code: z.string(), severity: z.enum(['error','warning']), span, message: z.string() }).strict()),
  finalState: state.nullable(),
  estimatedTimeS: z.number().finite().nonnegative().optional(),
}).strict().superRefine((result, ctx) => {
  if (result.dialect !== `edu-lathe-v${result.apiVersion}`) {
    ctx.addIssue({ code: 'custom', path: ['dialect'], message: 'El dialecto no coincide con la versión de interfaz.' });
  }
  if (result.apiVersion === 1 && (result.initialState.toolId === 'boring-id' || result.finalState?.toolId === 'boring-id'
    || result.blocks.some(block => block.beforeState.toolId === 'boring-id' || block.afterState.toolId === 'boring-id')
    || result.motions.some(motion => motion.toolId === 'boring-id'))) {
    ctx.addIssue({ code: 'custom', message: 'La herramienta interior requiere la interfaz v2.' });
  }
});
export type CompileResult = z.infer<typeof resultSchema>;
export type CncState = z.infer<typeof state>;
export type Position = z.infer<typeof positionSchema>;
export type Motion = z.infer<typeof motion>;
export type ArcGeometry = z.infer<typeof arcGeometry>;
export type Setup = z.infer<typeof setupSchema>;
export type CompileRequest = ({ apiVersion: 1; dialect: 'edu-lathe-v1' } | { apiVersion: 2; dialect: 'edu-lathe-v2' })
  & { sourceRevision: number; source: string; setup: Setup };
export const defaultSetup: Setup = {
  xConvention: 'diameter', initialPosition: { rMm:30,zMm:5 },
  stock: { diameterMm:50,lengthMm:100 }, toolId: 'generic-od',
};

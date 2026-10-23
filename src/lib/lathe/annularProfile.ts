import { z } from 'zod';
import { stockProfileV2Schema, type StockProfileV2 } from './profile.ts';
export const annularSpanSchema = z.object({
  zStartMm: z.number().finite().min(-1e9).max(1e9), zEndMm: z.number().finite().min(-1e9).max(1e9),
  innerStartMm: z.number().finite().min(0).max(1e9), innerEndMm: z.number().finite().min(0).max(1e9),
  outerStartMm: z.number().finite().min(0).max(1e9), outerEndMm: z.number().finite().min(0).max(1e9),
}).strict().refine(s => s.zStartMm < s.zEndMm && s.innerStartMm <= s.outerStartMm && s.innerEndMm <= s.outerEndMm);
export const stockProfileV3Schema = z.object({ ...stockProfileV2Schema.shape,
  profileVersion: z.literal(3), spans: z.array(annularSpanSchema).max(4096), volumeMm3: z.number().finite().nonnegative(),
}).strict().superRefine((p, ctx) => {
  if (p.evaluatedBlocks > p.completedBlocks || (p.complete && p.evaluatedBlocks !== p.completedBlocks)
    || p.spans.some((s, i) => i > 0 && s.zStartMm !== p.spans[i - 1].zEndMm)) {
    ctx.addIssue({ code: 'custom', message: 'Perfil tubular o cursor inconsistente.' });
  }
});
export type StockProfileV3 = z.infer<typeof stockProfileV3Schema>;
export type DisplayProfile = StockProfileV2 | StockProfileV3;
export type LabProfileResponse = { revision: number; cursor: number; attempt: number; profile: DisplayProfile | null; error: string | null };
export function exteriorSpans(profile: DisplayProfile): StockProfileV2['spans'] {
  return profile.profileVersion === 2 ? profile.spans : profile.spans.map(s => ({
    zStartMm: s.zStartMm, zEndMm: s.zEndMm, rStartMm: s.outerStartMm, rEndMm: s.outerEndMm,
  }));
}

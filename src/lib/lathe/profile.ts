import { z } from 'zod';
import type { CompileRequest } from './contract.ts';

export const profileSpanSchema = z.object({
  zStartMm: z.number().finite(), zEndMm: z.number().finite(), radiusMm: z.number().finite().nonnegative(),
}).strict().refine(span => span.zEndMm > span.zStartMm, 'Intervalo de perfil vacío o invertido.');
export const stockProfileSchema = z.object({
  profileVersion: z.literal(1), sourceRevision: z.number().int().nonnegative(),
  completedBlocks: z.number().int().nonnegative(), evaluatedBlocks: z.number().int().nonnegative(),
  complete: z.boolean(), spans: z.array(profileSpanSchema),
  diagnostics: z.array(z.object({
    code: z.string(), severity: z.enum(['error','warning']),
    span: z.object({line:z.number().int().positive(),columnStart:z.number().int().positive(),columnEnd:z.number().int().positive()}).strict(),
    message: z.string(),
  }).strict()),
}).strict().superRefine(validateProfile);
function validateProfile(profile: {evaluatedBlocks:number; completedBlocks:number; complete:boolean; spans: readonly {zStartMm:number;zEndMm:number}[]}, ctx: z.RefinementCtx) {
  if (profile.evaluatedBlocks > profile.completedBlocks || (profile.complete && profile.evaluatedBlocks !== profile.completedBlocks)) {
    ctx.addIssue({code:'custom',message:'Cursor de geometría inconsistente.'});
  }
  for (let i=1; i<profile.spans.length; i++) {
    if (profile.spans[i-1].zEndMm !== profile.spans[i].zStartMm) {
      ctx.addIssue({code:'custom',message:'El perfil debe ser contiguo y estar ordenado.'});
      break;
    }
  }
}
export const linearProfileSpanSchema = z.object({
  zStartMm: z.number().finite().min(-1e9).max(1e9), zEndMm: z.number().finite().min(-1e9).max(1e9),
  rStartMm: z.number().finite().nonnegative().max(1e9), rEndMm: z.number().finite().nonnegative().max(1e9),
}).strict().refine(span => span.zEndMm > span.zStartMm, 'Intervalo de perfil vacío o invertido.');
export const stockProfileV2Schema = z.object({ ...stockProfileSchema.shape,
  profileVersion: z.literal(2), spans: z.array(linearProfileSpanSchema).max(4096),
}).strict().superRefine(validateProfile);
export type StockProfileV2 = z.infer<typeof stockProfileV2Schema>;
export type StockProfile = z.infer<typeof stockProfileSchema>;
export type ProfileRequest = { program: CompileRequest; completedBlocks: number };
export type ProfileResponse = { revision:number; cursor:number; attempt:number; profile:StockProfile|null; error:string|null };
export type ProfileResponseV2 = Omit<ProfileResponse,'profile'> & { profile:StockProfileV2|null };
export function profileMatches(response:Pick<ProfileResponse,'revision'|'cursor'|'attempt'>|null, revision:number, cursor:number, attempt:number):boolean {
  return response?.revision===revision && response.cursor===cursor && response.attempt===attempt;
}

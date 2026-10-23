import { z } from 'zod';
import { positionSchema, setupSchema, toolIdSchema, type CompileResult, type Setup } from './contract.ts';
import { linearProfileSpanSchema, profileSpanSchema, type StockProfile, type StockProfileV2 } from './profile.ts';
import { draftFromSetup } from './setup.ts';
import { copyDocument, normalizeLineEndings, sameSetup, type LabDocument } from './document.ts';
import { profileRadiusAt, profileVolumeMm3, type MeasuredSpan } from './profileMeasures.ts';
import type { StockProfileV3 } from './annularProfile.ts';
import { annularRadiiAt, annularVolumeMm3 } from './annularMeasures.ts';

/** Cylindrical expectations keep `radiusMm`; conical ones use `rStartMm`/`rEndMm`. */
export const expectedSpanSchema = z.union([profileSpanSchema, linearProfileSpanSchema]);
export type ExpectedSpan = z.infer<typeof expectedSpanSchema>;
export const sampledProfileSchema=z.object({
  samples:z.array(z.object({zMm:z.number().finite(),radiusMm:z.number().finite().nonnegative(),
    toleranceMm:z.number().finite().nonnegative().max(0.1)}).strict()).min(3).max(64),
  volumeMm3:z.number().finite().nonnegative(),volumeToleranceMm3:z.number().finite().nonnegative(),
}).strict();
export const sampledAnnularProfileSchema = z.object({
  samples: z.array(z.object({
    zMm: z.number().finite(), innerRadiusMm: z.number().finite().nonnegative(), outerRadiusMm: z.number().finite().nonnegative(),
    toleranceMm: z.number().finite().nonnegative().max(0.1),
  }).strict()).min(3).max(64),
  volumeMm3: z.number().finite().nonnegative(), volumeToleranceMm3: z.number().finite().nonnegative(),
}).strict();
export type AnnularReference = z.infer<typeof sampledAnnularProfileSchema>;
/** Catalogue geometry must remain within the original material envelope. */
export function validAnnularReference(reference: AnnularReference, setup: Setup): boolean {
  const { samples, volumeMm3 } = reference;
  const outer = setup.stock.diameterMm / 2;
  const inner = (setup.stock.innerDiameterMm ?? 0) / 2;
  const initialVolume = Math.PI * setup.stock.lengthMm * (outer - inner) * (outer + inner);
  return volumeMm3 <= initialVolume && samples.every((p, i) => p.zMm >= -setup.stock.lengthMm && p.zMm <= 0
    && p.innerRadiusMm >= inner && p.innerRadiusMm <= p.outerRadiusMm && p.outerRadiusMm <= outer
    && (i === 0 || p.zMm > samples[i - 1].zMm));
}

export const exerciseDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/), file: z.string().regex(/^[a-z-]+\.nc$/),
  title: z.string().min(1), objective: z.string().min(1),
  observations: z.array(z.string().min(1)).min(1), expected: z.string().min(1),
  expectedSpans: z.array(expectedSpanSchema).max(4096).default([]),
  expectedProfile:sampledProfileSchema.optional(),
  expectedAnnularProfile: sampledAnnularProfileSchema.optional(),
  expectedFinalPosition: positionSchema, blockCount: z.number().int().positive(),
  expectedFinalToolId:toolIdSchema.optional(),
  toleranceMm: z.number().finite().nonnegative().max(1e-6),
  setup: setupSchema,
}).strict().superRefine((exercise,ctx)=>{
  if ([Boolean(exercise.expectedProfile), Boolean(exercise.expectedAnnularProfile), exercise.expectedSpans.length > 0].filter(Boolean).length !== 1) {
    ctx.addIssue({code:'custom',message:'El ejemplo debe definir un único criterio: tramos exteriores, muestras exteriores o referencias anulares.'});
  }
  if (!exercise.expectedAnnularProfile && ((exercise.setup.stock.innerDiameterMm ?? 0) > 0 || exercise.setup.toolId === 'boring-id')) {
    ctx.addIssue({ code: 'custom', message: 'El material tubular o la herramienta interior requieren referencias anulares.' });
  }
  if (exercise.expectedAnnularProfile) {
    if (!validAnnularReference(exercise.expectedAnnularProfile, exercise.setup)) {
      ctx.addIssue({ code: 'custom', path: ['expectedAnnularProfile'], message: 'Las referencias anulares deben estar ordenadas y dentro del material inicial.' });
    }
  }
  if(exercise.expectedProfile) {
    const {samples,volumeMm3}=exercise.expectedProfile;
    if(samples.some((p,i)=>p.zMm < -exercise.setup.stock.lengthMm||p.zMm>0
      ||p.radiusMm>exercise.setup.stock.diameterMm/2||i>0&&p.zMm<=samples[i-1].zMm)
      ||volumeMm3>Math.PI*(exercise.setup.stock.diameterMm/2)**2*exercise.setup.stock.lengthMm) {
      ctx.addIssue({code:'custom',path:['expectedProfile'],message:'Las referencias deben estar ordenadas y dentro del material inicial.'});
    }
  }
});
export const exerciseSchema = exerciseDefinitionSchema.safeExtend({ source: z.string().min(1) });
export const exercisesSchema = z.array(exerciseSchema).min(1).refine(items => new Set(items.map(e => e.id)).size === items.length, 'Identificador de ejemplo duplicado.');
export type Exercise = z.infer<typeof exerciseSchema>;
export function exerciseDocument(exercise: Pick<Exercise, 'source' | 'setup' | 'id'>): LabDocument {
  return copyDocument({ source: exercise.source, setup: exercise.setup, draft: draftFromSetup(exercise.setup), exerciseId: exercise.id });
}
export type AssessmentInput = { source: string; setup: Setup | null; revision: number; cursor: number;
  result: CompileResult | null; profile: StockProfile | StockProfileV2 | StockProfileV3 | null; profileError: string | null };
export type ExerciseAssessment = { kind: 'modified' | 'pending' | 'progress' | 'blocked' | 'waiting' | 'mismatch' | 'complete'; title: string; detail: string };
/** A resolved Rust span, either the v1 radius or the v2 linear endpoints. */
type ResolvedSpan = MeasuredSpan;
/** Compare resolved Rust geometry against a catalogue expectation. Cones use both endpoints. */
export function expectedSpansMatch(actual: readonly ResolvedSpan[], expected: readonly ExpectedSpan[], toleranceMm: number): boolean {
  if (actual.length !== expected.length) return false;
  const close = (a: number, b: number) => Math.abs(a - b) <= toleranceMm;
  return expected.every((want, index) => {
    const got = actual[index];
    const gotStart = 'radiusMm' in got ? got.radiusMm : got.rStartMm;
    const gotEnd = 'radiusMm' in got ? got.radiusMm : got.rEndMm;
    const wantStart = 'radiusMm' in want ? want.radiusMm : want.rStartMm;
    const wantEnd = 'radiusMm' in want ? want.radiusMm : want.rEndMm;
    return close(got.zStartMm, want.zStartMm) && close(got.zEndMm, want.zEndMm)
      && close(gotStart, wantStart) && close(gotEnd, wantEnd);
  });
}
/** Compare geometric references without depending on the engine's tessellation count. */
export function expectedProfileMatches(actual:readonly ResolvedSpan[],exercise:Exercise):boolean {
  if (exercise.expectedAnnularProfile) return false;
  if(!exercise.expectedProfile) return expectedSpansMatch(actual,exercise.expectedSpans,exercise.toleranceMm);
  if(!actual.length||actual[0].zStartMm!==-exercise.setup.stock.lengthMm||actual.at(-1)!.zEndMm!==0) return false;
  const stockRadius=exercise.setup.stock.diameterMm/2;
  if(actual.some(span=>'radiusMm' in span?span.radiusMm>stockRadius:span.rStartMm>stockRadius||span.rEndMm>stockRadius)) return false;
  const expected=exercise.expectedProfile;
  const volume=profileVolumeMm3(actual);
  if(volume===null||Math.abs(volume-expected.volumeMm3)>expected.volumeToleranceMm3) return false;
  return expected.samples.every(sample=>{
    const radius=profileRadiusAt(actual,sample.zMm);
    return radius!==null&&Math.abs(radius-sample.radiusMm)<=sample.toleranceMm;
  });
}

/** Interior and exterior references are both required; exterior geometry alone
 * cannot confirm a hollow part. Measurements are recomputed from resolved spans. */
export function expectedAnnularProfileMatches(profile: StockProfileV3, exercise: Pick<Exercise, 'setup' | 'expectedAnnularProfile'>): boolean {
  const want = exercise.expectedAnnularProfile;
  const actual = profile.spans;
  if (!want || !actual.length || actual[0].zStartMm !== -exercise.setup.stock.lengthMm || actual.at(-1)!.zEndMm !== 0) return false;
  const inner = (exercise.setup.stock.innerDiameterMm ?? 0) / 2;
  const outer = exercise.setup.stock.diameterMm / 2;
  if (actual.some(s => Math.min(s.innerStartMm, s.innerEndMm) < inner || Math.max(s.outerStartMm, s.outerEndMm) > outer)) return false;
  const volume = annularVolumeMm3(actual);
  if (volume === null || !Number.isFinite(profile.volumeMm3)
    || Math.abs(volume - want.volumeMm3) > want.volumeToleranceMm3
    || Math.abs(profile.volumeMm3 - want.volumeMm3) > want.volumeToleranceMm3) return false;
  return want.samples.every(sample => {
    const radii = annularRadiiAt(actual, sample.zMm);
    return radii !== null && Math.abs(radii.innerMm - sample.innerRadiusMm) <= sample.toleranceMm
      && Math.abs(radii.outerMm - sample.outerRadiusMm) <= sample.toleranceMm;
  });
}
/** Compare only resolved Rust output. This is a walkthrough, not a CNC parser or grader. */
export function assessExercise(exercise: Exercise, input: AssessmentInput): ExerciseAssessment {
  const { source, setup, revision, cursor, result, profile: receivedProfile, profileError } = input;
  const profile = receivedProfile?.sourceRevision === revision && receivedProfile.completedBlocks === cursor ? receivedProfile : null;
  if (normalizeLineEndings(source) !== normalizeLineEndings(exercise.source) || !setup || !sameSetup(setup, exercise.setup)) {
    return { kind: 'modified', title: 'Práctica libre · ejemplo modificado', detail: 'Podés interpretar tus cambios. La comprobación guiada corresponde al código y la configuración originales del ejemplo.' };
  }
  if (!result || result.sourceRevision !== revision) return { kind: 'pending', title: 'Interpretá el ejemplo para comenzar', detail: 'Después recorré los bloques y compará la posición, la trayectoria y el material.' };
  if (!result.executable || profileError || profile && !profile.complete) return { kind: 'blocked', title: 'El resultado no se puede comprobar', detail: 'Revisá los diagnósticos del programa y del perfil.' };
  if (cursor < result.blocks.length) return { kind: 'progress', title: `Recorrido: ${cursor} / ${result.blocks.length} bloques`, detail: 'Usá Siguiente bloque o Reproducir. Podés retroceder para comparar estados.' };
  if (!profile || profile.sourceRevision !== revision || profile.completedBlocks !== cursor || profile.evaluatedBlocks !== cursor) {
    return { kind: 'waiting', title: 'Esperando el perfil del último bloque', detail: 'La comprobación usa únicamente el resultado de esta ejecución.' };
  }
  const close = (a: number, b: number) => Math.abs(a - b) <= exercise.toleranceMm;
  const final = result.finalState;
  const last = result.blocks.at(-1)?.afterState;
  const coherentFinalSnapshot = final && last && final.ended === last.ended && final.spindleOn === last.spindleOn
    && final.position.rMm === last.position.rMm && final.position.zMm === last.position.zMm
    && (final.toolId ?? setup.toolId) === (last.toolId ?? setup.toolId)
    && final.spindleRpm === last.spindleRpm && final.spindleDirection === last.spindleDirection
    && final.feedMmMin === last.feedMmMin && final.motion === last.motion;
  const match = cursor === result.blocks.length && cursor === exercise.blockCount && profile.complete
    && coherentFinalSnapshot && final?.ended && !final.spindleOn && last?.ended
    && close(final.position.rMm, exercise.expectedFinalPosition.rMm) && close(final.position.zMm, exercise.expectedFinalPosition.zMm)
    && (!exercise.expectedFinalToolId||(final.toolId??setup.toolId)===exercise.expectedFinalToolId)
    && (exercise.expectedAnnularProfile ? profile.profileVersion === 3 && result.apiVersion === 2 && result.dialect === 'edu-lathe-v2'
      && expectedAnnularProfileMatches(profile, exercise)
      : profile.profileVersion !== 3 && expectedProfileMatches(profile.spans, exercise));
  return match ? { kind: 'complete', title: exercise.expectedProfile || exercise.expectedAnnularProfile ? 'Recorrido completo · referencias confirmadas':'Recorrido completo · perfil confirmado', detail: exercise.expected }
    : { kind: 'mismatch', title: 'El resultado difiere del ejemplo de referencia', detail: 'Compará las medidas del perfil con el resultado esperado; no se confirmó este recorrido.' };
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resultSchema } from '../src/lib/lathe/contract.ts';
import { stockProfileV3Schema } from '../src/lib/lathe/annularProfile.ts';
import { exerciseSchema, exerciseDefinitionSchema, assessExercise, expectedAnnularProfileMatches, expectedProfileMatches, exerciseDocument, type AssessmentInput } from '../src/lib/lathe/exercises.ts';
import { practicesSchema, isDiagnostic } from '../src/lib/lathe/diagnosticExercises.ts';
import { decodeProject, encodeProject } from '../src/lib/lathe/project.ts';

const directory = new URL('../fixtures/lathe/', import.meta.url);
const json = (file: string) => JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
const definition = json('annular-exercises.json')[0];
const exercise = exerciseSchema.parse({ ...definition, source: readFileSync(new URL(definition.file, directory), 'utf8') });
const geometry = JSON.parse(readFileSync(new URL('../fixtures/annular-material.json', import.meta.url), 'utf8'));
const profile = stockProfileV3Schema.parse({ profileVersion: 3, sourceRevision: 9, completedBlocks: 15, evaluatedBlocks: 15,
  complete: true, diagnostics: [], spans: geometry.expectedSpans, volumeMm3: 43000 * Math.PI });

// Synthetic decision inputs, not a second interpreter. Native/WASM suites check
// this catalogue against real compilation and every executed program prefix.
const base = resultSchema.parse(json('first-program.result.json'));
const final = { ...base.finalState!, position: { rMm: 30, zMm: 5 }, spindleOn: false, ended: true, toolId: 'roughing-od' as const };
const result = resultSchema.parse({ ...base, apiVersion: 2, dialect: 'edu-lathe-v2', sourceRevision: 9, finalState: final, motions: [],
  blocks: Array.from({ length: 15 }, (_, id) => ({ ...base.blocks[0], id, motionIds: [], kind: id === 14 ? 'end' : 'state',
    afterState: id === 14 ? final : base.initialState })),
});
const input = (): AssessmentInput => ({ source: exercise.source, setup: exercise.setup, revision: 9, cursor: 15, result, profile, profileError: null });

test('thirteen practices include three annular references and keep three diagnostics linked', () => {
  const definitions = [...json('exercises.json'), ...json('diagnostic-corrections.json'), ...json('annular-exercises.json'), ...json('annular-corrections.json'), ...json('diagnostic-exercises.json'), ...json('annular-diagnostics.json')];
  const practices = practicesSchema.parse(definitions.map(d => ({ ...d, source: readFileSync(new URL(d.file, directory), 'utf8') })));
  assert.equal(practices.length, 13);
  assert.equal(practices.filter(isDiagnostic).length, 3);
  assert.equal(practices.filter(p => !isDiagnostic(p) && p.expectedAnnularProfile).length, 3);
  assert.equal(exercise.expectedAnnularProfile!.samples.length, 6);
  assert.equal(exercise.expectedSpans.length, 0);
  assert.equal(exercise.expectedFinalToolId, 'roughing-od');
});

test('current completed annular geometry confirms both walls and independent volume', () => {
  assert.equal(expectedAnnularProfileMatches(profile, exercise), true);
  assert.equal(assessExercise(exercise, input()).kind, 'complete');
  assert.equal(assessExercise(exercise, input()).title, 'Recorrido completo · referencias confirmadas');
  assert.equal(expectedProfileMatches([], exercise), false);
  const split = { ...profile, spans: profile.spans.flatMap(s => {
    const z = (s.zStartMm + s.zEndMm) / 2;
    return [{ ...s, zEndMm: z }, { ...s, zStartMm: z }];
  }) };
  assert.equal(expectedAnnularProfileMatches(split, exercise), true);
});

test('an incorrect bore cannot pass with a correct outside or forged volume header', () => {
  const noBore = { ...profile, spans: profile.spans.map(s => ({ ...s, innerStartMm: 10, innerEndMm: 10 })) };
  assert.equal(assessExercise(exercise, { ...input(), profile: noBore }).kind, 'mismatch');
  assert.equal(expectedAnnularProfileMatches({ ...profile, volumeMm3: profile.volumeMm3 + 1 }, exercise), false);
  // Preserve annular area/volume in the last section but alter both dimensions.
  const sameVolumeWrongDimensions = { ...profile, spans: profile.spans.map((s, i) => i !== 2 ? s : {
    ...s, innerStartMm: 16, innerEndMm: 16, outerStartMm: Math.sqrt(431), outerEndMm: Math.sqrt(431),
  }) };
  assert.equal(expectedAnnularProfileMatches(sameVolumeWrongDimensions, exercise), false);
  assert.equal(expectedAnnularProfileMatches({ ...profile, spans: [] }, exercise), false);
  assert.equal(expectedAnnularProfileMatches({ ...profile, volumeMm3: NaN }, exercise), false);
});

test('annular reference requires profile v3 and compiler v2, never an exterior-only substitute', () => {
  const exterior = { profileVersion: 2 as const, sourceRevision: 9, completedBlocks: 15, evaluatedBlocks: 15,
    complete: true, diagnostics: [], spans: profile.spans.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm, rStartMm: s.outerStartMm, rEndMm: s.outerEndMm })) };
  assert.equal(assessExercise(exercise, { ...input(), profile: exterior }).kind, 'mismatch');
  const oldResult = { ...result, apiVersion: 1 as const, dialect: 'edu-lathe-v1' as const };
  assert.equal(assessExercise(exercise, { ...input(), result: oldResult }).kind, 'mismatch');
});

test('rewind, reset, changed material and stale responses revoke confirmation', () => {
  assert.equal(assessExercise(exercise, { ...input(), cursor: 14, profile: null }).kind, 'progress');
  assert.equal(assessExercise(exercise, { ...input(), cursor: 0, profile: null }).kind, 'progress');
  assert.equal(assessExercise(exercise, { ...input(), result: null }).kind, 'pending');
  assert.equal(assessExercise(exercise, { ...input(), revision: 10 }).kind, 'pending');
  for (const stale of [{ ...profile, sourceRevision: 8 }, { ...profile, completedBlocks: 14, evaluatedBlocks: 14 }]) {
    assert.equal(assessExercise(exercise, { ...input(), profile: stale }).kind, 'waiting');
  }
  assert.equal(assessExercise(exercise, { ...input(), profile: { ...profile, complete: false, evaluatedBlocks: 14 } }).kind, 'blocked');
  assert.equal(assessExercise(exercise, { ...input(), profileError: 'error' }).kind, 'blocked');
  assert.equal(assessExercise(exercise, { ...input(), source: exercise.source + '\n' }).kind, 'modified');
  const changed = { ...exercise.setup, stock: { ...exercise.setup.stock, innerDiameterMm: 22 } };
  assert.equal(assessExercise(exercise, { ...input(), setup: changed }).kind, 'modified');
});

test('completion requires ended, stopped, retracted state and the expected final tool', () => {
  for (const finalState of [{ ...final, ended: false }, { ...final, spindleOn: true },
    { ...final, position: { rMm: 15, zMm: -40 } }, { ...final, toolId: 'boring-id' as const }]) {
    assert.equal(assessExercise(exercise, { ...input(), result: { ...result, finalState } }).kind, 'mismatch');
  }
  assert.equal(assessExercise({ ...exercise, blockCount: 14 }, input()).kind, 'mismatch');
});

test('a correct finalState cannot hide a contradictory last block snapshot shown by the DRO', () => {
  for (const afterState of [{ ...final, spindleOn: true }, { ...final, position: { rMm: 15, zMm: -40 } },
    { ...final, toolId: 'boring-id' as const }, { ...final, spindleRpm: final.spindleRpm + 1 },
    { ...final, feedMmMin: 1 }, { ...final, motion: 'linear' as const }]) {
    const contradictory = resultSchema.parse({ ...result, blocks: result.blocks.map((b, i) => i === 14 ? { ...b, afterState } : b) });
    assert.equal(assessExercise(exercise, { ...input(), result: contradictory }).kind, 'mismatch', JSON.stringify(afterState));
  }
});

test('annular catalogue rejects mixed, reversed and out-of-stock reference criteria', () => {
  const malformed = [
    { ...definition, expectedSpans: [{ zStartMm: -100, zEndMm: 0, radiusMm: 20 }] },
    { ...definition, expectedAnnularProfile: undefined },
    { ...definition, expectedAnnularProfile: { ...definition.expectedAnnularProfile, volumeMm3: 62500 * Math.PI } },
  ];
  for (const value of malformed) assert.equal(exerciseDefinitionSchema.safeParse(value).success, false);
  for (const sample of [{ zMm: -101 }, { innerRadiusMm: 5 }, { innerRadiusMm: 26 }, { outerRadiusMm: 26 }, { toleranceMm: 0.2 }]) {
    const reference = structuredClone(definition.expectedAnnularProfile);
    Object.assign(reference.samples[0], sample);
    assert.equal(exerciseDefinitionSchema.safeParse({ ...definition, expectedAnnularProfile: reference }).success, false);
  }
  const reversed = { ...definition.expectedAnnularProfile, samples: definition.expectedAnnularProfile.samples.toReversed() };
  assert.equal(exerciseDefinitionSchema.safeParse({ ...definition, expectedAnnularProfile: reversed }).success, false);
});

test('sample radial tolerances and saved exercise identity retain their explicit units', () => {
  const reference = structuredClone(exercise);
  reference.expectedAnnularProfile!.samples[0].innerRadiusMm += 0.5e-6;
  assert.equal(expectedAnnularProfileMatches(profile, reference), true);
  reference.expectedAnnularProfile!.samples[0].innerRadiusMm += 2e-6;
  assert.equal(expectedAnnularProfileMatches(profile, reference), false);
  const document = exerciseDocument(exercise);
  const restored = decodeProject(encodeProject(document, 2));
  assert.equal(restored.exerciseId, exercise.id);
  assert.equal(restored.setup.stock.innerDiameterMm, 20);
  assert.equal(restored.setup.toolId, 'boring-id');
  assert.equal(restored.draft.innerDiameter, '20');
});

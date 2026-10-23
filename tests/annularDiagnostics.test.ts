import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resultSchema } from '../src/lib/lathe/contract.ts';
import { stockProfileV3Schema } from '../src/lib/lathe/annularProfile.ts';
import { diagnosticDefinitionSchema, diagnosticExerciseSchema, assessPractice } from '../src/lib/lathe/diagnosticExercises.ts';
import type { AssessmentInput } from '../src/lib/lathe/exercises.ts';
const dir = new URL('../fixtures/lathe/', import.meta.url);
const json = (file: string) => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
const definition = json('annular-diagnostics.json')[0];
const practice = diagnosticExerciseSchema.parse({ ...definition, source: readFileSync(new URL(definition.file, dir), 'utf8') });
const want = practice.diagnostic;
if (want.stage !== 'annular-profile') throw new Error('Missing annular diagnostic fixture.');
// Decision inputs only: the real source/provenance are checked in native/WASM.
const result = resultSchema.parse({ ...json('first-program.result.json'), apiVersion: 2, dialect: 'edu-lathe-v2', sourceRevision: 27 });
const profile = stockProfileV3Schema.parse({ profileVersion: 3, sourceRevision: 27, completedBlocks: 5, evaluatedBlocks: 4, complete: false,
  volumeMm3: 52500 * Math.PI, spans: [{ zStartMm: -100, zEndMm: 0, innerStartMm: 10, innerEndMm: 10, outerStartMm: 25, outerEndMm: 25 }],
  diagnostics: [{ code: want.code, severity: want.severity, span: want.span, message: 'Synthetic decision fixture.' }],
});
const input = (): AssessmentInput => ({ source: practice.source, setup: practice.setup, revision: 27, cursor: 5, result, profile, profileError: null });

test('annular diagnostic observes the exact frozen material and source without confirming completion', () => {
  const observed = assessPractice(practice, input());
  assert.equal(observed.kind, 'observed');
  assert.deepEqual(observed.targetSpan, { line: 5, columnStart: 1, columnEnd: 8 });
  assert.equal(practice.correctionId, 'rapid-through-bore');
  assert.equal(want.frozenProfile.samples.length, 3);
});

test('annular diagnostic observation requires current setup, revision and exact failed cursor', () => {
  for (const cursor of [0, 4, 6]) assert.equal(assessPractice(practice, { ...input(), cursor }).kind, 'progress');
  assert.equal(assessPractice(practice, { ...input(), revision: 28 }).kind, 'pending');
  assert.equal(assessPractice(practice, { ...input(), result: null }).kind, 'pending');
  assert.equal(assessPractice(practice, { ...input(), profile: { ...profile, sourceRevision: 26 } }).kind, 'waiting');
  assert.equal(assessPractice(practice, { ...input(), profile: { ...profile, completedBlocks: 4 } }).kind, 'waiting');
  assert.equal(assessPractice(practice, { ...input(), profileError: 'offline' }).kind, 'blocked');
  assert.equal(assessPractice(practice, { ...input(), source: practice.source + '\n' }).kind, 'modified');
  assert.equal(assessPractice(practice, { ...input(), setup: { ...practice.setup, stock: { ...practice.setup.stock, innerDiameterMm: 22 } } }).kind, 'modified');
});

test('wrong annular material, metadata, warning or compiler version cannot count as observed', () => {
  const wrong = [
    { ...profile, spans: profile.spans.map(s => ({ ...s, innerStartMm: 0, innerEndMm: 0 })) },
    { ...profile, volumeMm3: profile.volumeMm3 + 1 },
    { ...profile, complete: true, evaluatedBlocks: 5 },
    { ...profile, evaluatedBlocks: 3 },
    { ...profile, diagnostics: [...profile.diagnostics, ...profile.diagnostics] },
    { ...profile, diagnostics: [{ ...profile.diagnostics[0], code: 'SPINDLE_OFF' }] },
    { ...profile, diagnostics: [{ ...profile.diagnostics[0], severity: 'error' as const }] },
    { ...profile, diagnostics: [{ ...profile.diagnostics[0], span: { ...want.span, line: 4 } }] },
    { ...profile, diagnostics: [{ ...profile.diagnostics[0], span: { ...want.span, columnEnd: 7 } }] },
  ];
  for (const changed of wrong) assert.equal(assessPractice(practice, { ...input(), profile: changed }).kind, 'mismatch');
  assert.equal(assessPractice(practice, { ...input(), result: { ...result, apiVersion: 1, dialect: 'edu-lathe-v1' } }).kind, 'mismatch');
});

test('annular diagnostic catalogue requires bounded frozen material and a transactional prefix', () => {
  assert.doesNotThrow(() => diagnosticDefinitionSchema.parse(definition));
  for (const diagnostic of [{ ...definition.diagnostic, evaluatedBlocks: 5 }, { ...definition.diagnostic, stage: 'profile' },
    { ...definition.diagnostic, code: 'SPINDLE_OFF' }, { ...definition.diagnostic, frozenProfile: { ...definition.diagnostic.frozenProfile, volumeMm3: 62500 * Math.PI } }]) {
    assert.equal(diagnosticDefinitionSchema.safeParse({ ...definition, diagnostic }).success, false);
  }
  const outside = structuredClone(definition);
  outside.diagnostic.frozenProfile.samples[0].innerRadiusMm = 5;
  assert.equal(diagnosticDefinitionSchema.safeParse(outside).success, false);
});

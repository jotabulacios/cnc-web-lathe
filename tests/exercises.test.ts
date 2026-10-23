import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultSchema, type CompileResult } from '../src/lib/lathe/contract.ts';
import { stockProfileSchema, stockProfileV2Schema, type StockProfile } from '../src/lib/lathe/profile.ts';
import { assessExercise, exerciseDocument, exercisesSchema, expectedSpansMatch, expectedProfileMatches } from '../src/lib/lathe/exercises.ts';

import { copyDocument, replaceDocument } from '../src/lib/lathe/document.ts';

const directory = new URL('../fixtures/lathe/', import.meta.url);
const catalogue = JSON.parse(readFileSync(new URL('exercises.json', directory), 'utf8')) as Record<string, unknown>[];
const exercises = exercisesSchema.parse(catalogue.map(e => ({ ...e, source: readFileSync(new URL(String(e.file), directory), 'utf8') })));
// Synthetic decision input based on a real contract fixture. Actual catalogue/engine
// equivalence is checked separately in WASM and native Rust tests.
const exercise = exercises[2];
const result = { ...resultSchema.parse(JSON.parse(readFileSync(new URL('first-program.result.json', directory), 'utf8'))), sourceRevision: 5 };
const profile = stockProfileSchema.parse({ profileVersion: 1, sourceRevision: 5, completedBlocks: 9,
  evaluatedBlocks: 9, complete: true, spans: exercise.expectedSpans, diagnostics: [] });
const input = () => ({ source: exercise.source, setup: exercise.setup, revision: 5, cursor: 9,
  result: result as CompileResult | null, profile: profile as StockProfile | null, profileError: null as string | null });

test('walkthrough confirmation is derived from the current completed result and revoked by rewind/reset', () => {
  assert.equal(assessExercise(exercise, input()).kind, 'complete');
  for (const cursor of [0, 4, 8]) assert.equal(assessExercise(exercise, { ...input(), cursor, profile: null }).kind, 'progress');
  assert.equal(assessExercise(exercise, { ...input(), result: null, profile: null }).kind, 'pending');
  assert.equal(assessExercise(exercise, { ...input(), revision: 6 }).kind, 'pending');
});

test('v2 confirms the same cylindrical walkthrough and checks both radial endpoints', () => {
  const linear = { ...profile, profileVersion: 2 as const, spans: profile.spans.map(span => ({
    zStartMm: span.zStartMm, zEndMm: span.zEndMm, rStartMm: span.radiusMm, rEndMm: span.radiusMm,
  })) };
  assert.equal(assessExercise(exercise, { ...input(), profile: linear }).kind, 'complete');
  linear.spans[0].rEndMm += 0.01;
  assert.equal(assessExercise(exercise, { ...input(), profile: linear }).kind, 'mismatch');
});

test('source and physical setup changes are free practice; only line ending normalization is accepted', () => {
  for (const source of [exercise.source + '; comentario', exercise.source.toLowerCase(), exercise.source.replace('G21', 'G21 ')]) {
    assert.equal(assessExercise(exercise, { ...input(), source }).kind, 'modified');
  }
  assert.equal(assessExercise(exercise, { ...input(), source: exercise.source.replaceAll('\n', '\r\n') }).kind, 'complete');
  assert.equal(assessExercise(exercise, { ...input(), setup: null }).kind, 'modified');
  assert.equal(assessExercise(exercise, { ...input(), setup: { ...exercise.setup,
    stock: { ...exercise.setup.stock, diameterMm: 60 } } }).kind, 'modified');
});

test('stale, partial, absent and failed geometry cannot confirm a walkthrough', () => {
  for (const stale of [{ ...profile, sourceRevision: 4 }, { ...profile, completedBlocks: 8, evaluatedBlocks: 8 }]) {
    assert.equal(assessExercise(exercise, { ...input(), profile: stale }).kind, 'waiting');
  }
  assert.equal(assessExercise(exercise, { ...input(), profile: null }).kind, 'waiting');
  assert.equal(assessExercise(exercise, { ...input(), profile: { ...profile, complete: false, evaluatedBlocks: 7 } }).kind, 'blocked');
  assert.equal(assessExercise(exercise, { ...input(), profileError: 'falló' }).kind, 'blocked');
  assert.equal(assessExercise(exercise, { ...input(), result: { ...result, executable: false } }).kind, 'blocked');
});

test('confirmation requires expected geometry, final state and block count with absolute mm tolerance', () => {
  const shifted = (delta: number) => ({ ...profile, spans: profile.spans.map((s, i) => i ? { ...s, radiusMm: s.radiusMm + delta } : s) });
  assert.equal(assessExercise(exercise, { ...input(), profile: shifted(5e-10) }).kind, 'complete');
  assert.equal(assessExercise(exercise, { ...input(), profile: shifted(2e-9) }).kind, 'mismatch');
  const final = result.finalState!;
  for (const finalState of [{ ...final, spindleOn: true }, { ...final, ended: false },
    { ...final, position: { rMm: 25, zMm: 5 } }]) {
    assert.equal(assessExercise(exercise, { ...input(), result: { ...result, finalState } }).kind, 'mismatch');
  }
  assert.equal(assessExercise({ ...exercise, blockCount: 10 }, input()).kind, 'mismatch');
});

test('the catalogue accepts conical expectations and compares both radial endpoints', () => {
  assert.equal(exercises.length, 6);
  const taper = exercises.find(item => item.id === 'taper')!;
  assert.ok(taper, 'falta el ejemplo cónico');
  assert.equal(taper.file, 'taper-turning.nc');
  assert.equal(taper.blockCount, 8);
  assert.deepEqual(taper.expectedSpans, [
    { zStartMm: -100, zEndMm: -60, rStartMm: 25, rEndMm: 25 },
    { zStartMm: -60, zEndMm: 0, rStartMm: 10, rEndMm: 20 },
  ]);
  const resolved = [
    { zStartMm: -100, zEndMm: -60, rStartMm: 25, rEndMm: 25 },
    { zStartMm: -60, zEndMm: 0, rStartMm: 10, rEndMm: 20 },
  ];
  assert.equal(expectedSpansMatch(resolved, taper.expectedSpans, 1e-9), true);
  // A reversed cone is geometrically plausible but not this walkthrough.
  assert.equal(expectedSpansMatch([resolved[0], { zStartMm: -60, zEndMm: 0, rStartMm: 20, rEndMm: 10 }], taper.expectedSpans, 1e-9), false);
  assert.equal(expectedSpansMatch([resolved[0], { ...resolved[1], rEndMm: 20 + 5e-10 }], taper.expectedSpans, 1e-9), true);
  assert.equal(expectedSpansMatch([resolved[0], { ...resolved[1], rEndMm: 20 + 2e-9 }], taper.expectedSpans, 1e-9), false);
  assert.equal(expectedSpansMatch(resolved.slice(0, 1), taper.expectedSpans, 1e-9), false);
  // Cylindrical expectations still use the single radius.
  assert.equal(expectedSpansMatch(
    [{ zStartMm: -100, zEndMm: -60, radiusMm: 25 }, { zStartMm: -60, zEndMm: 0, radiusMm: 20 }],
    exercises[0].expectedSpans, 1e-9), true);
});

test('the conical walkthrough is confirmed only by the full cone profile', () => {
  const taper = exercises.find(item => item.id === 'taper')!;
  // Synthetic decision input: real contract fixture, 8 blocks so the M30 lands last.
  const coneResult = { ...result, sourceRevision: 9, blocks: [...result.blocks.slice(0, 7), result.blocks.at(-1)!] } as CompileResult;
  const coneProfile = stockProfileV2Schema.parse({ profileVersion: 2, sourceRevision: 9, completedBlocks: 8,
    evaluatedBlocks: 8, complete: true, spans: taper.expectedSpans, diagnostics: [] });
  const coneInput = () => ({ source: taper.source, setup: taper.setup, revision: 9, cursor: 8,
    result: coneResult, profile: coneProfile, profileError: null as string | null });
  assert.equal(assessExercise(taper, coneInput()).kind, 'complete');
  const reversed = { ...coneProfile, spans: coneProfile.spans.map((span, i) => i
    ? { ...span, rStartMm: span.rEndMm, rEndMm: span.rStartMm } : span) };
  assert.equal(assessExercise(taper, { ...coneInput(), profile: reversed }).kind, 'mismatch');
  assert.equal(assessExercise(taper, { ...coneInput(), cursor: 7 }).kind, 'progress');
  assert.equal(assessExercise(taper, { ...coneInput(), profile: { ...coneProfile, complete: false, evaluatedBlocks: 7 } }).kind, 'blocked');
});

test('document snapshots keep invalid drafts and are isolated; repeated loads preserve the previous copy', () => {
  const current = exerciseDocument(exercises[0]);
  current.source = 'G00 X70';
  current.draft.diameter = 'sin terminar';
  const next = exerciseDocument(exercises[1]);
  const replacement = replaceDocument(current, next, null);
  assert.deepEqual(replacement.previous, current);
  current.draft.diameter = '90';
  current.setup.stock.diameterMm = 90;
  assert.equal(replacement.previous?.draft.diameter, 'sin terminar');
  assert.equal(replacement.previous?.setup.stock.diameterMm, 50);
  const repeated = replaceDocument(replacement.document, next, replacement.previous);
  assert.equal(repeated.previous, replacement.previous);
  const recovered = copyDocument(repeated.previous!);
  const redo = copyDocument(repeated.document);
  assert.equal(recovered.source, 'G00 X70');
  assert.equal(recovered.draft.diameter, 'sin terminar');
  assert.equal(redo.exerciseId, 'two-steps');
  assert.throws(() => exercisesSchema.parse([exercises[0], exercises[0]]));
});

test('sampled references are independent of partition count and require both volume and local dimensions',()=>{
  const sample={...exercise,expectedSpans:[],expectedProfile:{volumeMm3:Math.PI*(70*625+30*400),volumeToleranceMm3:1e-6,
    samples:[{zMm:-80,radiusMm:25,toleranceMm:1e-9},{zMm:-15,radiusMm:20,toleranceMm:1e-9},{zMm:0,radiusMm:20,toleranceMm:1e-9}]}};
  const coarse=[{zStartMm:-100,zEndMm:-30,radiusMm:25},{zStartMm:-30,zEndMm:0,radiusMm:20}];
  const split=[{zStartMm:-100,zEndMm:-60,radiusMm:25},{zStartMm:-60,zEndMm:-30,radiusMm:25},coarse[1]];
  assert.equal(expectedProfileMatches(coarse,sample),true);
  assert.equal(expectedProfileMatches(split,sample),true);
  // Equal total volume cannot make a wrong local diameter pass.
  assert.equal(expectedProfileMatches(coarse,{...sample,expectedProfile:{...sample.expectedProfile,
    samples:sample.expectedProfile.samples.map((p,i)=>i===1?{...p,radiusMm:19}:p)}}),false);
  assert.equal(expectedProfileMatches(coarse,{...sample,expectedProfile:{...sample.expectedProfile,volumeMm3:100}}),false);
  assert.equal(expectedProfileMatches(coarse.slice(1),sample),false);
  assert.equal(expectedProfileMatches([],sample),false);
});

test('catalogue requires one reference method and rejects invalid or out of stock sampled references',()=>{
  const arc=exercises.find(e=>e.id==='arc-convex')!;
  assert.ok(arc.expectedProfile);
  assert.deepEqual(arc.expectedSpans,[]);
  assert.equal(arc.expectedFinalToolId,'finishing-od');
  for(const invalid of [{...arc,expectedProfile:undefined},
    {...arc,expectedSpans:exercise.expectedSpans},
    {...arc,expectedProfile:{...arc.expectedProfile,samples:[]}},
    {...arc,expectedProfile:{...arc.expectedProfile,samples:[...arc.expectedProfile.samples].reverse()}},
    {...arc,expectedProfile:{...arc.expectedProfile,volumeMm3:NaN}},
    {...arc,expectedProfile:{...arc.expectedProfile,samples:arc.expectedProfile.samples.map((p,i)=>i? p:{...p,zMm:-101})}}]) {
    assert.throws(()=>exercisesSchema.parse([invalid]));
  }
});

test('walkthroughs that teach tools require the final expected tool as well as the geometry',()=>{
  const toolExercise={...exercise,expectedFinalToolId:'roughing-od' as const};
  assert.equal(assessExercise(toolExercise,input()).kind,'mismatch');
  const matching={...result,finalState:{...result.finalState!,toolId:'roughing-od' as const}};
  assert.equal(assessExercise(toolExercise,{...input(),result:matching}).kind,'mismatch');
  const coherent={...matching,blocks:matching.blocks.map((block,i)=>i===matching.blocks.length-1
    ?{...block,afterState:matching.finalState}:block)};
  assert.equal(assessExercise(toolExercise,{...input(),result:coherent}).kind,'complete');
});

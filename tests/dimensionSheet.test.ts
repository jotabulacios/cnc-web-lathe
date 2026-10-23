import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildDimensionSheet, formatMm } from '../src/lib/lathe/dimensionSheet.ts';
import type { StockProfileV2 } from '../src/lib/lathe/profile.ts';
import type { StockProfileV3 } from '../src/lib/lathe/annularProfile.ts';
import { exerciseReferenceChecks, exercisesSchema } from '../src/lib/lathe/exercises.ts';

type Span = StockProfileV2['spans'][number];
const header = { sourceRevision: 1, completedBlocks: 1, evaluatedBlocks: 1, complete: true, diagnostics: [] };
const v2 = (spans: Span[]): StockProfileV2 => ({ ...header, profileVersion: 2, spans });
const cyl = (zStartMm: number, zEndMm: number, r: number): Span => ({ zStartMm, zEndMm, rStartMm: r, rEndMm: r });
const texts = (items: { text: string }[]) => items.map(i => i.text);
/** Chords of a circle (centre z/r, radius R) between two angles, as the engine flattens arcs. */
function chords(cz: number, cr: number, R: number, from: number, to: number, n: number): Span[] {
  const points = Array.from({ length: n + 1 }, (_, i) => from + (to - from) * i / n).map(a => [cz + R * Math.cos(a), cr + R * Math.sin(a)]);
  points.sort((a, b) => a[0] - b[0]);
  return points.slice(1).map((p, i) => ({ zStartMm: points[i][0], zEndMm: p[0], rStartMm: points[i][1], rEndMm: p[1] }));
}

test('display rounding uses 0.01 mm and the Argentine decimal comma', () => {
  assert.equal(formatMm(17.799999999999997 * 2), '35,6');
  assert.equal(formatMm(11.309932474), '11,31');
  assert.equal(formatMm(-0.001), '0');
  assert.equal(formatMm(1234.5), '1234,5');
});

test('cylindrical steps: one Ø per step, side columns clear of material, lengths from the front face', () => {
  const sheet = buildDimensionSheet(v2([cyl(-100, -40, 25), cyl(-40, -20, 20), cyl(-20, 0, 15)]))!;
  assert.deepEqual(sheet.outer.map(f => f.kind), ['cylinder', 'cylinder', 'cylinder']);
  assert.deepEqual(texts(sheet.diameters), ['Ø50', 'Ø40', 'Ø30']);
  assert.deepEqual(sheet.diameters.map(d => d.placement), ['left', 'right', 'right']);
  assert.deepEqual(texts(sheet.lengths), ['20', '40', '100']);
  assert.ok(sheet.lengths.every(l => l.fromZMm === 0));
  assert.equal(sheet.overallLengthMm, 100);
  assert.deepEqual(sheet.notes, []);
});

test('a cone split into noisy collinear spans becomes one cone with both diameters and its angle', () => {
  // Real engine output of the taper practice (three passes left three collinear pieces).
  const sheet = buildDimensionSheet(v2([cyl(-100, -40, 25),
    { zStartMm: -40, zEndMm: -29, rStartMm: 23, rEndMm: 20.8 },
    { zStartMm: -29, zEndMm: -14, rStartMm: 20.8, rEndMm: 17.799999999999997 },
    { zStartMm: -14, zEndMm: 0, rStartMm: 17.799999999999997, rEndMm: 15 }]))!;
  assert.deepEqual(sheet.outer.map(f => f.kind), ['cylinder', 'cone']);
  assert.deepEqual(texts(sheet.diameters), ['Ø50', 'Ø46', 'Ø30']);
  assert.deepEqual(texts(sheet.lengths), ['40', '100']);
  assert.ok(Math.abs(sheet.outer[1].halfAngleDeg! - Math.atan(8 / 40) * 180 / Math.PI) < 1e-9);
  assert.deepEqual(texts(sheet.notes), ['Cono α/2 = 11,31° (incl. 22,62°) · 1:2,5']);
});

test('cone ends shared with a same-diameter cylinder are not dimensioned twice', () => {
  const sheet = buildDimensionSheet(v2([cyl(-100, -40, 25), { zStartMm: -40, zEndMm: -35, rStartMm: 25, rEndMm: 15 },
    cyl(-35, -20, 15), { zStartMm: -20, zEndMm: -10, rStartMm: 15, rEndMm: 10 }, cyl(-10, 0, 10)]))!;
  assert.deepEqual(texts(sheet.diameters), ['Ø50', 'Ø30', 'Ø20']);
  assert.deepEqual(texts(sheet.lengths), ['10', '20', '35', '40', '100']);
  assert.equal(sheet.notes.filter(n => n.kind === 'taper').length, 2);
});

test('a run of chords is dimensioned as one radius when every vertex fits a circle', () => {
  // Convex R5 corner: centre at Z−5 / r15, from (Z−5, r20) to (Z0, r15), 13 chords.
  const arc = chords(-5, 15, 5, 0, Math.PI / 2, 13);
  const sheet = buildDimensionSheet(v2([cyl(-100, -30, 25), cyl(-30, -5, 20), ...arc]))!;
  assert.deepEqual(sheet.outer.map(f => f.kind), ['cylinder', 'cylinder', 'arc']);
  const feature = sheet.outer[2];
  assert.ok(Math.abs(feature.arc!.radiusMm - 5) < 1e-9);
  assert.equal(feature.arc!.convex, true);
  assert.deepEqual(texts(sheet.notes), ['R5 convexo']);
  assert.deepEqual(texts(sheet.lengths), ['5', '30', '100']);
  // Concave fillet into a shoulder: centre outside the material.
  const fillet = chords(-20, 25, 5, -Math.PI / 2, -Math.PI, 10).map(s => s);
  const concave = buildDimensionSheet(v2([cyl(-100, -25, 25), ...fillet, cyl(-20, 0, 20)]))!;
  assert.equal(concave.outer.find(f => f.kind === 'arc')?.arc?.convex, false);
});

test('short chords that are not one circle fall back to a generic curve; concyclic long polylines are not arcs', () => {
  // Parabola r = 20 − z²/10 sampled every 0.5 mm: curvature varies, so no single circle fits.
  const pts = Array.from({ length: 11 }, (_, i) => -5 + i * 0.5).map(z => [z, 20 - (z + 5) ** 2 / 2.5]);
  const curve = pts.slice(1).map((p, i) => ({ zStartMm: pts[i][0], zEndMm: p[0], rStartMm: pts[i][1], rEndMm: p[1] }));
  const sheet = buildDimensionSheet(v2([cyl(-100, -5, 20), ...curve]))!;
  assert.deepEqual(sheet.outer.map(f => f.kind), ['cylinder', 'curve']);
  assert.deepEqual(texts(sheet.notes), ['Perfil curvo']);
  assert.ok(texts(sheet.diameters).includes(formatMm(pts.at(-1)![1] * 2).replace(/^/, 'Ø')));
  // Symmetric 45° groove: an isosceles trapezoid is concyclic but must stay two chamfers + a cylinder.
  const groove = buildDimensionSheet(v2([cyl(-100, -12, 25), { zStartMm: -12, zEndMm: -10, rStartMm: 25, rEndMm: 23 },
    cyl(-10, -6, 23), { zStartMm: -6, zEndMm: -4, rStartMm: 23, rEndMm: 25 }, cyl(-4, 0, 25)]))!;
  assert.deepEqual(groove.outer.map(f => f.kind), ['cylinder', 'chamfer', 'cylinder', 'chamfer', 'cylinder']);
  // The enclosed groove diameter cannot reach either side without crossing material.
  assert.equal(groove.diameters.find(d => d.text === 'Ø46')?.placement, 'inside');
  assert.deepEqual(texts(groove.notes), ['Chaflán 2 × 45°', 'Chaflán 2 × 45°']);
});

test('numerical slivers and sub-0.01 mm steps are merged, never dimensioned', () => {
  const sheet = buildDimensionSheet(v2([cyl(-100, -40, 25), cyl(-40, -39.996, 22), cyl(-39.996, -20, 20),
    cyl(-20, -10, 20.004), cyl(-10, 0, 15)]))!;
  // The sliver is absorbed by its neighbour: the boundary moves less than 0.01 mm.
  assert.deepEqual(sheet.outer.map(f => [f.kind, Math.round(f.zStartMm * 100) / 100, f.zEndMm]), [['cylinder', -100, -39.996], ['cylinder', -40, -10], ['cylinder', -10, 0]]);
  assert.deepEqual(texts(sheet.diameters), ['Ø50', 'Ø40', 'Ø30']);
  assert.deepEqual(texts(sheet.lengths), ['10', '40', '100']);
});

test('a faced front (zero-radius gap) moves the baseline to the new front face', () => {
  const sheet = buildDimensionSheet(v2([cyl(-100, -20, 25), cyl(-20, -1, 20), cyl(-1, 0, 0)]))!;
  assert.equal(sheet.frontZMm, -1);
  assert.deepEqual(texts(sheet.lengths), ['19', '99']);
  assert.deepEqual(texts(sheet.notes), ['Cara frontal en Z−1']);
  assert.equal(buildDimensionSheet(v2([cyl(-10, 0, 0)])), null);
});

test('tubes: bore diameters are dimensioned inside and bore steps measured from the front face', () => {
  const tube: StockProfileV3 = { ...header, profileVersion: 3, volumeMm3: 0, spans: [
    { zStartMm: -100, zEndMm: -40, innerStartMm: 10, innerEndMm: 10, outerStartMm: 25, outerEndMm: 25 },
    { zStartMm: -40, zEndMm: -20, innerStartMm: 15, innerEndMm: 15, outerStartMm: 25, outerEndMm: 25 },
    { zStartMm: -20, zEndMm: 0, innerStartMm: 15, innerEndMm: 15, outerStartMm: 20, outerEndMm: 20 }] };
  const sheet = buildDimensionSheet(tube)!;
  assert.equal(sheet.tubular, true);
  assert.deepEqual(sheet.inner.map(f => [f.kind, f.zStartMm, f.zEndMm, f.rStartMm]), [['cylinder', -100, -40, 10], ['cylinder', -40, 0, 15]]);
  assert.deepEqual(sheet.diameters.map(d => `${d.contour}:${d.text}:${d.placement}`), ['outer:Ø50:left', 'outer:Ø40:right', 'inner:Ø20:inside', 'inner:Ø30:inside']);
  assert.deepEqual(sheet.lengths.map(l => `${l.contour}:${l.text}`), ['outer:20', 'inner:40', 'outer:100']);
});

test('comparison rows decompose the practice criterion with its own tolerances', () => {
  const directory = new URL('../fixtures/lathe/', import.meta.url);
  const catalogue = JSON.parse(readFileSync(new URL('exercises.json', directory), 'utf8')) as Record<string, unknown>[];
  const exercises = exercisesSchema.parse(catalogue.map(e => ({ ...e, source: readFileSync(new URL(String(e.file), directory), 'utf8') })));
  const taper = exercises.find(e => e.id === 'taper')!;
  const resolved = v2([cyl(-100, -40, 25), { zStartMm: -40, zEndMm: 0, rStartMm: 23, rEndMm: 15 }]);
  const rows = exerciseReferenceChecks(taper, resolved);
  assert.equal(rows.length, taper.expectedProfile!.samples.length + 1);
  assert.ok(rows.every(r => r.ok));
  assert.deepEqual(rows.slice(0, -1).map(r => r.expected), [50, 44, 38, 34, 30]);
  assert.equal(rows.at(-1)!.kind, 'volume');
  const wrong = exerciseReferenceChecks(taper, v2([cyl(-100, -40, 25), { zStartMm: -40, zEndMm: 0, rStartMm: 23, rEndMm: 16 }]));
  assert.equal(wrong.find(r => r.zMm === 0)!.ok, false);
  const steps = exercises.find(e => e.id === 'two-steps')!;
  const stepRows = exerciseReferenceChecks(steps, v2([cyl(-100, -40, 25), cyl(-40, -20, 20), cyl(-20, 0, 15)]));
  assert.deepEqual(stepRows.map(r => [r.zMm, r.expected, r.obtained, r.ok]), [[-70, 50, 50, true], [-30, 40, 40, true], [-10, 30, 30, true]]);
});

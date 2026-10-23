import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { annularRadiiAt, annularVolumeMm3, type MeasuredAnnularSpan } from '../src/lib/lathe/annularMeasures.ts';

function span(zStartMm: number, zEndMm: number, innerStartMm: number, innerEndMm: number,
  outerStartMm: number, outerEndMm: number): MeasuredAnnularSpan {
  return { zStartMm, zEndMm, innerStartMm, innerEndMm, outerStartMm, outerEndMm };
}
function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= Math.max(1, Math.abs(expected)) * 1e-13, `${actual} != ${expected}`);
}

test('initial tube, enlarged bore and exterior turning match independent annular volume oracles', () => {
  const tube = [span(-100, 0, 10, 10, 25, 25)];
  const bored = [span(-100, -40, 10, 10, 25, 25), span(-40, 0, 15, 15, 25, 25)];
  const final = [bored[0], span(-40, -20, 15, 15, 25, 25), span(-20, 0, 15, 15, 20, 20)];
  close(annularVolumeMm3(tube), 52500 * Math.PI);
  close(annularVolumeMm3(bored), 47500 * Math.PI);
  close(annularVolumeMm3(final), 43000 * Math.PI);
  assert.deepEqual(annularRadiiAt(final, -60), { innerMm: 10, outerMm: 25 });
  assert.deepEqual(annularRadiiAt(final, -30), { innerMm: 15, outerMm: 25 });
  assert.deepEqual(annularRadiiAt(final, -10), { innerMm: 15, outerMm: 20 });
});

test('shared material fixture measures geometry rather than trusting any volume metadata', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/annular-material.json', import.meta.url), 'utf8'));
  const actual: MeasuredAnnularSpan[] = fixture.expectedSpans;
  close(annularVolumeMm3(actual), 43000 * Math.PI);
  const withMisleadingMetadata = actual.map(s => ({ ...s, volumeMm3: 1 }));
  assert.equal(annularVolumeMm3(withMisleadingMetadata), annularVolumeMm3(actual));
});

test('conical walls match analytical frustum differences and local interpolation', () => {
  const cone = [span(-100, 0, 5, 10, 25, 20)];
  close(annularVolumeMm3(cone), 45000 * Math.PI);
  assert.deepEqual(annularRadiiAt(cone, -50), { innerMm: 7.5, outerMm: 22.5 });
  assert.deepEqual(annularRadiiAt(cone, -100), { innerMm: 5, outerMm: 25 });
  assert.deepEqual(annularRadiiAt(cone, 0), { innerMm: 10, outerMm: 20 });
});

test('equivalent linear partitions preserve volume and sampled radii without mutating input', () => {
  const whole = [span(-100, 0, 5, 10, 25, 20)];
  const parts = Object.freeze([
    Object.freeze(span(-100, -50, 5, 7.5, 25, 22.5)),
    Object.freeze(span(-50, 0, 7.5, 10, 22.5, 20)),
  ]);
  assert.equal(annularVolumeMm3(parts), annularVolumeMm3(whole));
  for (const z of [-100, -75, -50, -25, 0]) assert.deepEqual(annularRadiiAt(parts, z), annularRadiiAt(whole, z));
});

test('thin walls retain their factored volume and empty sections measure zero', () => {
  const outer = 1e8; const inner = outer - 1e-6;
  close(annularVolumeMm3([span(-100, 0, inner, inner, outer, outer)]), 100 * (outer - inner) * (outer + inner) * Math.PI);
  assert.ok(annularVolumeMm3([span(-100, 0, inner, inner, outer, outer)])! > 0);
  const empty = [span(-100, 0, 10, 20, 10, 20)];
  assert.equal(annularVolumeMm3(empty), 0);
  assert.deepEqual(annularRadiiAt(empty, -50), { innerMm: 15, outerMm: 15 });
  close(annularVolumeMm3([span(-10, 0, 0, 0, 2, 2)]), 40 * Math.PI);
});

test('shoulders use the common radial band while stock faces retain endpoint values', () => {
  const stepped = [span(-100, -50, 5, 10, 30, 25), span(-50, 0, 15, 20, 20, 25)];
  assert.deepEqual(annularRadiiAt(stepped, -50), { innerMm: 15, outerMm: 20 });
  assert.deepEqual(annularRadiiAt(stepped, -100), { innerMm: 5, outerMm: 30 });
  assert.deepEqual(annularRadiiAt(stepped, 0), { innerMm: 20, outerMm: 25 });
  const disjoint = [span(-100, -50, 5, 5, 10, 10), span(-50, 0, 15, 15, 20, 20)];
  assert.equal(annularRadiiAt(disjoint, -50), null);
  assert.deepEqual(annularRadiiAt(disjoint, -51), { innerMm: 5, outerMm: 10 });
  close(annularVolumeMm3(disjoint), (50 * 75 + 50 * 175) * Math.PI);
});

test('invalid geometry, excess spans and disconnected domains are not measured', () => {
  const valid = span(-100, 0, 10, 10, 25, 25);
  const cases: MeasuredAnnularSpan[][] = [[], [{ ...valid, zEndMm: -100 }], [{ ...valid, innerStartMm: -1 }],
    [{ ...valid, innerEndMm: 26 }], [{ ...valid, outerStartMm: Infinity }], [{ ...valid, zStartMm: NaN }],
    [{ ...valid, outerEndMm: 1e9 + 1 }], [{ ...valid, zStartMm: -1e9 - 1 }],
    [span(-100, -50, 10, 10, 25, 25), span(-40, 0, 10, 10, 25, 25)],
    [valid, valid], Array.from({ length: 4097 }, (_, i) => span(i, i + 1, 10, 10, 25, 25))];
  for (const profile of cases) {
    assert.equal(annularVolumeMm3(profile), null);
    assert.equal(annularRadiiAt(profile, -50), null);
  }
});

test('queries outside the domain and invalid coordinates have no section', () => {
  const profile = [span(-100, 0, 10, 10, 25, 25)];
  for (const z of [-101, 1, NaN, Infinity, -Infinity, 1e9 + 1]) assert.equal(annularRadiiAt(profile, z), null);
  const largest = [span(-1e9, 1e9, 0, 0, 1e9, 1e9)];
  close(annularVolumeMm3(largest), 2e27 * Math.PI);
  assert.deepEqual(annularRadiiAt(largest, 0), { innerMm: 0, outerMm: 1e9 });
});

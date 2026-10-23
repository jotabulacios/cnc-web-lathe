import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profilePathV3, type AnnularSpan } from '../src/lib/lathe/profilePathV3.ts';
import { profilePathV2 } from '../src/lib/lathe/profilePathV2.ts';
const id = (n: number) => n;
const span = (innerStartMm = 10, innerEndMm = 10, outerStartMm = 25, outerEndMm = 25, zStartMm = -100, zEndMm = 0): AnnularSpan =>
  ({ zStartMm, zEndMm, innerStartMm, innerEndMm, outerStartMm, outerEndMm });

test('tube projection retains separate outer and hole contours for evenodd fill', () => {
  assert.equal(profilePathV3([span()], id, id),
    'M -100 25 L 0 25 L 0 -25 L -100 -25 Z M -100 10 L 0 10 L 0 -10 L -100 -10 Z');
});
test('solid projection matches the existing exterior contour without an axis seam', () => {
  assert.equal(profilePathV3([span(0, 0)], id, id), profilePathV2([{ zStartMm: -100, zEndMm: 0, rStartMm: 25, rEndMm: 25 }], id, id));
});
test('conical interior and shoulders preserve physical endpoints through a projection', () => {
  const path = profilePathV3([span(5, 10, 25, 25, -100, -40), span(15, 20, 20, 25, -40, 0)], z => z + 100, r => -2 * r);
  assert.ok(path.includes('M 0 -50 L 60 -50 L 60 -40 L 100 -50'));
  assert.ok(path.includes('M 0 -10 L 60 -20 L 60 -30 L 100 -40'));
  assert.equal((path.match(/M /g) ?? []).length, 2);
});
test('fully empty annular sections split runs and never leave material contours', () => {
  assert.equal(profilePathV3([span(25, 25)], id, id), '');
  const path = profilePathV3([span(10, 10, 25, 25, -100, -80), span(20, 20, 20, 20, -80, -20), span(5, 5, 10, 10, -20, 0)], id, id);
  assert.equal((path.match(/M /g) ?? []).length, 4);
  assert.ok(!path.includes('L -20 20'));
});
test('annular projection rejects invalid, inverted or discontinuous input', () => {
  for (const spans of [[], [span(-1)], [span(26)], [span(10, NaN)], [span(10, 10, 25, 25, 0, 0)],
    [span(10, 10, 25, 25, -100, -50), span(10, 10, 25, 25, -49, 0)], Array.from({ length: 4097 }, () => span())]) {
    assert.throws(() => profilePathV3(spans, id, id));
  }
});

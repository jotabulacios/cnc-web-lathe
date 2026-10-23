import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resultSchema, type Motion } from '../src/lib/lathe/contract.ts';
import {
  animationDurationMs, buildBlockAnimation, MANUAL_MAX_MS, maxAnimationMs, MIN_MS, motionLength,
  pointOnMotion, positionAtElapsed, positionAtProgress,
} from '../src/lib/lathe/motionAnimation.ts';

const span = { line: 1, columnStart: 1, columnEnd: 2 };
const line = (from: [number, number], to: [number, number], kind: Motion['kind'] = 'linear', id = 0): Motion => ({
  id, blockId: 0, span, kind, from: { rMm: from[0], zMm: from[1] }, to: { rMm: to[0], zMm: to[1] },
  feedMmMin: kind === 'rapid' ? null : 100, toolId: 'generic-od', lengthMm: Math.hypot(to[0] - from[0], to[1] - from[1]),
});
// Quarter arc of radius 5 centred at (r=10, z=-5): from (r=15, z=-5) clockwise to (r=10, z=0).
const arcCw: Motion = {
  ...line([15, -5], [10, 0], 'arc-cw'),
  arc: { center: { rMm: 10, zMm: -5 }, radiusMm: 5, clockwise: true, sweepRad: Math.PI / 2 },
};
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('line interpolation and length', () => {
  const m = line([10, 0], [10, -20]);
  assert.equal(motionLength(m), 20);
  assert.deepEqual(pointOnMotion(m, 0.25), { rMm: 10, zMm: -5 });
  assert.equal(pointOnMotion(m, 1), m.to);
});

test('arc points stay on the circle and follow the clockwise convention', () => {
  close(motionLength(arcCw), 5 * Math.PI / 2);
  const mid = pointOnMotion(arcCw, 0.5);
  close(Math.hypot(mid.rMm - 10, mid.zMm + 5), 5);
  // Clockwise = decreasing atan2(r - rc, z - zc): from 90° to 0°, midpoint at 45°.
  close(mid.zMm, -5 + 5 * Math.SQRT1_2);
  close(mid.rMm, 10 + 5 * Math.SQRT1_2);
  const ccw: Motion = { ...arcCw, kind: 'arc-ccw', from: arcCw.to, to: arcCw.from,
    arc: { ...arcCw.arc!, clockwise: false } };
  const back = pointOnMotion(ccw, 0.5);
  close(back.zMm, mid.zMm); close(back.rMm, mid.rMm);
});

test('duration: proportional, rapids faster, clamped to min and max', () => {
  assert.equal(animationDurationMs([line([0, 0], [0, -0.1])], MANUAL_MAX_MS), MIN_MS);
  assert.equal(animationDurationMs([line([0, 0], [0, -500])], MANUAL_MAX_MS), MANUAL_MAX_MS);
  const feed = animationDurationMs([line([0, 0], [0, -15])], MANUAL_MAX_MS);
  const rapid = animationDurationMs([line([0, 0], [0, -15], 'rapid')], MANUAL_MAX_MS);
  assert.ok(feed > rapid && rapid >= MIN_MS, `${feed} > ${rapid}`);
  assert.equal(maxAnimationMs(null), MANUAL_MAX_MS);
  assert.equal(maxAnimationMs(4), 200);
  assert.ok(maxAnimationMs(4) < 1000 / 4);
  assert.equal(maxAnimationMs(0.5), MANUAL_MAX_MS);
});

test('concatenated path: ordered motions, exact endpoints and tip offsets', () => {
  const motions = [line([12, 2], [12, 0], 'linear', 0), line([12, 0], [10, 0], 'linear', 1)];
  const offset = { rMm: 0.4, zMm: -0.4 };
  const start = { rMm: 12 + offset.rMm, zMm: 2 + offset.zMm };
  const end = { rMm: 10 + offset.rMm, zMm: 0 + offset.zMm };
  const anim = buildBlockAnimation(motions, start, end, MANUAL_MAX_MS)!;
  assert.deepEqual(positionAtProgress(anim, 0), start);
  assert.equal(positionAtProgress(anim, 1), end);
  assert.equal(positionAtElapsed(anim, anim.durationMs + 50), end);
  const half = positionAtProgress(anim, 0.5); // equal lengths: corner between both motions
  close(half.rMm, 12.4); close(half.zMm, -0.4);
  const quarter = positionAtProgress(anim, 0.25);
  close(quarter.zMm, 1 - 0.4);
});

test('different start/end offsets blend linearly and still hit both tips', () => {
  const motions = [line([10, 0], [10, -10])];
  const anim = buildBlockAnimation(motions, { rMm: 10, zMm: 0 }, { rMm: 11, zMm: -10 }, MANUAL_MAX_MS)!;
  close(positionAtProgress(anim, 0.5).rMm, 10.5);
  assert.deepEqual(positionAtProgress(anim, 1), { rMm: 11, zMm: -10 });
});

test('nothing to animate without motions; real fixture blocks animate to their tip', () => {
  assert.equal(buildBlockAnimation([], { rMm: 1, zMm: 1 }, { rMm: 2, zMm: 2 }, MANUAL_MAX_MS), null);
  const result = resultSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/lathe/first-program.result.json', import.meta.url), 'utf8')));
  let tip = result.initialState.tipPosition ?? result.initialState.position;
  for (const block of result.blocks) {
    const end = block.afterState.tipPosition ?? block.afterState.position;
    const motions = block.motionIds.map(id => result.motions.find(m => m.id === id)!);
    const anim = buildBlockAnimation(motions, tip, end, maxAnimationMs(4));
    if (motions.length) {
      assert.ok(anim && anim.durationMs <= 200 && anim.durationMs >= MIN_MS);
      assert.deepEqual(positionAtProgress(anim!, 0), tip);
      assert.deepEqual(positionAtProgress(anim!, 1), end);
    } else assert.equal(anim, null);
    tip = end;
  }
});

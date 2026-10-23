import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLatheView, gridTicks, VIEWPORT } from '../src/lib/lathe/viewport.ts';
import type { CompileResult } from '../src/lib/lathe/contract.ts';

const stock = { diameterMm: 50, lengthMm: 100 };
const motion = (r: number, z: number): CompileResult['motions'][number] => ({
  id: 0, blockId: 0, span: { line: 1, columnStart: 1, columnEnd: 10 },
  from: { rMm: 30, zMm: 5 }, to: { rMm: r, zMm: z },
  kind: 'linear', feedMmMin: 120, toolId: 'generic-od', lengthMm: 0,
});

test('viewport uses physical radius with equal Z/r scale and correct axis directions', () => {
  const view = createLatheView([], { rMm: 30, zMm: 5 }, stock);
  assert.ok(Math.abs((view.x(10) - view.x(0)) - (view.y(0) - view.y(10))) < 1e-9);
  assert.ok(view.x(-100) < view.x(0));
  assert.ok(view.y(25) < view.y(0));
  assert.equal(view.radius, 25);
  assert.ok(view.x(-100 - view.chuckDepth) >= VIEWPORT.left);
  assert.ok(view.y(-25) < VIEWPORT.top + VIEWPORT.plotHeight);
});

test('fit includes motion start, endpoint, current tool and all stock even at extreme valid coordinates', () => {
  const view = createLatheView([motion(1e9, -1e9)], { rMm: 12, zMm: 1e9 }, stock);
  for (const z of [-1e9, 1e9, -100 - view.chuckDepth, 0]) {
    assert.ok(view.x(z) >= VIEWPORT.left);
    assert.ok(view.x(z) <= VIEWPORT.left + VIEWPORT.plotWidth - 48);
  }
  for (const r of [1e9, -25, 30]) {
    assert.ok(view.y(r) >= VIEWPORT.top + 72);
    assert.ok(view.y(r) <= VIEWPORT.top + VIEWPORT.plotHeight);
  }
  assert.equal(view.largeRange, true);
  assert.ok(Number.isFinite(view.scale));
});

test('fit includes the arc bulge, not only its endpoints', () => {
  const arc: CompileResult['motions'][number] = {
    ...motion(0, -20), kind: 'arc-ccw',
    from: { rMm: 0, zMm: 0 }, to: { rMm: 0, zMm: -20 },
    arc: { center: { rMm: 0, zMm: -10 }, radiusMm: 10, clockwise: false, sweepRad: Math.PI },
  };
  const view = createLatheView([arc], { rMm: 0, zMm: 0 }, { diameterMm: 2, lengthMm: 1 });
  assert.ok(view.y(10) >= VIEWPORT.top);
  assert.ok(view.y(10) < view.y(0));
  assert.ok(view.x(-20) >= VIEWPORT.left);
  assert.ok(view.x(-20) < view.x(0));
});

test('grid uses finite bounded readable ticks for small and large setups', () => {
  for (const [min, max] of [[-100, 20], [-1e9, 1e9], [-0.01, 0.03]]) {
    const ticks = gridTicks(min, max);
    assert.ok(ticks.length > 1 && ticks.length <= 24);
    assert.ok(ticks.every(value => Number.isFinite(value) && value >= min && value <= max));
    assert.ok(ticks.slice(1).every((value, index) => value > ticks[index]));
  }
});

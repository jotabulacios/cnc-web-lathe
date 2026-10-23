import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profilePath } from '../src/lib/lathe/profilePath.ts';

const identity = (value: number) => value;

test('projects stock bounds with mirrored physical radii', () => {
  assert.equal(profilePath([{ zStartMm: -100, zEndMm: 0, radiusMm: 25 }], z => z + 100, r => 50 - r), 'M 0 25 L 100 25 L 100 75 L 0 75 Z');
});

test('preserves stepped radii at their exact engine boundaries', () => {
  const spans = [{ zStartMm: -100, zEndMm: -40, radiusMm: 25 }, { zStartMm: -40, zEndMm: 0, radiusMm: 15 }];
  assert.equal(profilePath(spans, identity, identity), 'M -100 25 L -40 25 L -40 15 L 0 15 L 0 -15 L -40 -15 L -40 -25 L -100 -25 Z');
  assert.equal(spans[0].radiusMm, 25);
});

test('fully removed intervals separate closed material islands', () => {
  const spans = [{ zStartMm: -100, zEndMm: -60, radiusMm: 25 }, { zStartMm: -60, zEndMm: -20, radiusMm: 0 }, { zStartMm: -20, zEndMm: 0, radiusMm: 10 }];
  assert.equal(profilePath(spans, identity, identity), 'M -100 25 L -60 25 L -60 -25 L -100 -25 Z M -20 10 L 0 10 L 0 -10 L -20 -10 Z');
  assert.equal(profilePath([{ zStartMm: -100, zEndMm: 0, radiusMm: 0 }], identity, identity), '');
  assert.equal(profilePath([], identity, identity), '');
});

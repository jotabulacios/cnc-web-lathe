import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSetup, setupSchema, type ToolId } from '../src/lib/lathe/contract.ts';
import { sameSetup, replaceDocument } from '../src/lib/lathe/document.ts';
import { draftFromSetup, validateSetupDraft } from '../src/lib/lathe/setup.ts';

test('default setup roundtrips with diameter-to-radius conversion exactly once', () => {
  assert.deepEqual(validateSetupDraft(draftFromSetup(defaultSetup)), { setup: defaultSetup, errors: {} });
  const result = validateSetupDraft({ diameter: '80', length: '200', initialX: '90', initialZ: '-4.5' });
  assert.deepEqual(result.setup?.initialPosition, { rMm: 45, zMm: -4.5 });
  assert.deepEqual(result.setup?.stock, { diameterMm: 80, lengthMm: 200 });
});
test('incomplete, nonpositive, nonfinite and out of range drafts never become a setup', () => {
  for (const [field, value] of [['diameter', ''], ['length', '0'], ['diameter', '-2'], ['initialX', '-1'],
    ['initialZ', 'Infinity'], ['initialZ', '1e9'], ['initialX', '1000000001'], ['diameter', '1.2.3']] as const) {
    const result = validateSetupDraft({ ...draftFromSetup(defaultSetup), [field]: value });
    assert.equal(result.setup, null);
    assert.ok(result.errors[field], `${field} ${value}`);
  }
});
test('decimal comma, signed Z, zero initial X and fractional dimensions are explicit', () => {
  const result = validateSetupDraft({ diameter: '50,5', length: '.5', initialX: '0', initialZ: '+2,5' });
  assert.equal(result.setup?.stock.diameterMm, 50.5);
  assert.equal(result.setup?.stock.lengthMm, 0.5);
  assert.deepEqual(result.setup?.initialPosition, { rMm: 0, zMm: 2.5 });
});

test('draft preserves and validates selected initial tool', () => {
  const roughing = validateSetupDraft({
    ...draftFromSetup(defaultSetup),
    toolId: 'roughing-od',
  });
  assert.equal(roughing.setup?.toolId, 'roughing-od');

  const invalid = validateSetupDraft({
    ...draftFromSetup(defaultSetup),
    toolId: 'non-existent' as ToolId,
  });
  assert.equal(invalid.setup, null);
  assert.ok(invalid.errors.toolId);
});

test('tube setup converts only initial X and preserves physical inner diameter', () => {
  const draft = { ...draftFromSetup(defaultSetup), innerDiameter: '20,5', toolId: 'boring-id' as const };
  const result = validateSetupDraft(draft);
  assert.equal(result.setup?.stock.innerDiameterMm, 20.5);
  assert.equal(result.setup?.initialPosition.rMm, 30);
  assert.equal(result.setup?.toolId, 'boring-id');
  assert.equal(draftFromSetup(result.setup!).innerDiameter, '20.5');
  assert.equal(setupSchema.parse(result.setup).stock.innerDiameterMm, 20.5);
  assert.equal('innerDiameterMm' in validateSetupDraft(draftFromSetup(defaultSetup)).setup!.stock, false);
  assert.equal('innerDiameter' in draftFromSetup(defaultSetup), false);
});

test('tube diameter must leave a positive wall and remain a finite nonnegative dimension', () => {
  for (const text of ['', '-1', '50', '51', 'Infinity', '1e2']) {
    const result = validateSetupDraft({ ...draftFromSetup(defaultSetup), innerDiameter: text });
    assert.equal(result.setup, null, text);
    assert.ok(result.errors.innerDiameter, text);
  }
  for (const value of [-1, 50, 51, NaN, Infinity]) {
    assert.equal(setupSchema.safeParse({ ...defaultSetup, stock: { ...defaultSetup.stock, innerDiameterMm: value } }).success, false);
  }
  const solid = validateSetupDraft({ ...draftFromSetup(defaultSetup), innerDiameter: '0' }).setup!;
  assert.equal(solid.stock.innerDiameterMm, 0);
  assert.ok(sameSetup(defaultSetup, solid));
  assert.equal(sameSetup(defaultSetup, { ...solid, stock: { ...solid.stock, innerDiameterMm: 20 } }), false);
});

test('document recovery notices a newly present pending interior draft', () => {
  const before = { source: 'M30', setup: defaultSetup, draft: draftFromSetup(defaultSetup), exerciseId: null };
  const after = { ...before, draft: { ...before.draft, innerDiameter: 'pendiente' } };
  const changed = replaceDocument(before, after, null);
  assert.deepEqual(changed.previous, before);
  assert.equal(changed.document.draft.innerDiameter, 'pendiente');
});

test('offset table draft: diameter text, comma decimals, zero rows omitted and per-field errors', () => {
  const base = draftFromSetup(defaultSetup);
  const zero = validateSetupDraft({ ...base, offsets: { 'roughing-od': { calibrationErrorX: '0', calibrationErrorZ: '', wearX: '-0', wearZ: '0,0' } } });
  assert.deepEqual(zero.setup, defaultSetup, 'an all-zero table is the legacy setup');
  const result = validateSetupDraft({ ...base, offsets: {
    'boring-id': { calibrationErrorX: '0', calibrationErrorZ: '0', wearX: '0,4', wearZ: '0' },
    'roughing-od': { calibrationErrorX: '0.1', calibrationErrorZ: '-0,5', wearX: '-0.3', wearZ: '0' },
  } });
  assert.deepEqual(result.setup?.toolOffsets, [
    { toolId: 'roughing-od', calibrationErrorXMm: 0.1, calibrationErrorZMm: -0.5, wearXMm: -0.3, wearZMm: 0 },
    { toolId: 'boring-id', calibrationErrorXMm: 0, calibrationErrorZMm: 0, wearXMm: 0.4, wearZMm: 0 },
  ], 'catalogue order; X stays in diameter for Rust to convert once');
  assert.ok(setupSchema.safeParse(result.setup).success);
  assert.deepEqual(validateSetupDraft(draftFromSetup(result.setup!)).setup, result.setup);
  const invalid = validateSetupDraft({ ...base, offsets: { 'facing-od': { calibrationErrorX: '100.5', calibrationErrorZ: 'x', wearX: '0', wearZ: '0' } } });
  assert.equal(invalid.setup, null);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ['offset.facing-od.calibrationErrorX', 'offset.facing-od.calibrationErrorZ']);
  assert.ok(!sameSetup(defaultSetup, result.setup!));
  assert.ok(sameSetup(result.setup!, validateSetupDraft(draftFromSetup(result.setup!)).setup!));
});

test('nose radius column: radius in mm, 0..5, emitted only when nonzero, older drafts without it stay valid', () => {
  const base = draftFromSetup(defaultSetup);
  const legacyRow = { calibrationErrorX: '0', calibrationErrorZ: '0', wearX: '-0,2', wearZ: '0' };
  const legacy = validateSetupDraft({ ...base, offsets: { 'roughing-od': legacyRow } });
  assert.deepEqual(legacy.setup?.toolOffsets, [{ toolId: 'roughing-od', calibrationErrorXMm: 0, calibrationErrorZMm: 0, wearXMm: -0.2, wearZMm: 0 }]);
  const withNose = validateSetupDraft({ ...base, offsets: { 'finishing-od': { ...legacyRow, wearX: '0', noseRadius: '0,4' } } });
  assert.deepEqual(withNose.setup?.toolOffsets, [{ toolId: 'finishing-od', calibrationErrorXMm: 0, calibrationErrorZMm: 0, wearXMm: 0, wearZMm: 0, noseRadiusMm: 0.4 }]);
  assert.deepEqual(validateSetupDraft(draftFromSetup(withNose.setup!)).setup, withNose.setup);
  for (const bad of ['-0.1', '5.5', 'r']) {
    const result = validateSetupDraft({ ...base, offsets: { 'finishing-od': { ...legacyRow, noseRadius: bad } } });
    assert.equal(result.errors['offset.finishing-od.noseRadius'], 'Entre 0 y 5 mm.');
  }
});

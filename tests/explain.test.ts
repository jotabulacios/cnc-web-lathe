import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultSchema } from '../src/lib/lathe/contract.ts';
import { explainBlock } from '../src/lib/lathe/explain.ts';

const fixture = resultSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/lathe/first-program.result.json', import.meta.url), 'utf8')));
const text = (index: number) => JSON.stringify(explainBlock(fixture.blocks[index]));

test('initial explanation invites interpretation and stepping', () => {
  assert.match(explainBlock(null).description, /[Ii]nterpret/);
  assert.match(explainBlock(null).description, /Siguiente bloque/);
});
test('rapid motion reports diameter and radial positions without applying retained feed', () => {
  assert.match(text(2), /G00/);
  assert.match(text(2), /60 → 54 mm/);
  assert.match(text(2), /Desplazamiento radial: -3 mm/);
  assert.match(text(6), /no utiliza F/);
  assert.doesNotMatch(text(6), /Avance del movimiento: 120/);
});
test('linear motion retains resolved axes and modal feed', () => {
  assert.match(text(3), /Z: 2 → 2 mm \(se mantiene\)/);
  assert.match(text(3), /54 → 46 mm/);
  assert.match(text(3), /radial: -4 mm; variación del diámetro: -8 mm/);
  assert.match(text(4), /X \(diámetro\): 46 → 46 mm \(se mantiene\)/);
  assert.match(text(4), /Avance del movimiento: 120 mm\/min/);
  assert.match(text(5), /46 → 42 mm/);
  assert.match(text(5), /Z: -20 → -30 mm/);
});
test('source text cannot change explanations or produce invented effects', () => {
  const block = fixture.blocks[4];
  assert.deepEqual(explainBlock({ ...block, source: 'G00 X999 F999 M05' }), explainBlock(block));
  assert.match(text(0), /conserva el estado/);
  assert.match(text(0), /milímetros.*X\/Z.*mm\/min/);
  assert.doesNotMatch(text(0), /activ|ejecutó|G21|G18|G98/);
});
test('state-only changes report spindle enable, rpm, direction and motion selection', () => {
  assert.match(text(1), /1200 rpm/);
  assert.match(text(1), /Husillo encendido/);
  assert.match(text(7), /Husillo detenido/);
  assert.doesNotMatch(text(7), /Velocidad del husillo: 0/);
  const block = fixture.blocks[0];
  const explanation = explainBlock({ ...block, afterState: { ...block.afterState, spindleDirection: 'ccw', feedMmMin: 250, motion: 'linear' } });
  assert.match(JSON.stringify(explanation), /antihorario/);
  assert.match(JSON.stringify(explanation), /F: 250 mm\/min/);
  assert.match(JSON.stringify(explanation), /Modo modal seleccionado: G01/);
});
test('zero displacement remains a resolved motion and end has no further movement', () => {
  const block = fixture.blocks[4];
  const explanation = explainBlock({ ...block, afterState: { ...block.afterState, position: block.beforeState.position } });
  assert.match(explanation.title, /G01/);
  assert.match(explanation.details.join(' '), /radial: 0 mm/);
  assert.match(explainBlock(fixture.blocks[8]).description, /No hay más movimientos/);
});
test('arc motion explains center, radius, sweep and states the profile limitation', () => {
  const block = { ...fixture.blocks[3], afterState: { ...fixture.blocks[3].afterState, motion: 'arc-ccw' as const }, kind: 'motion' as const };
  const motion = {
    id: block.motionIds[0], blockId: block.id, span: block.span, kind: 'arc-ccw' as const,
    from: block.beforeState.position, to: block.afterState.position,
    arc: { center: { rMm: 10, zMm: 0 }, radiusMm: 10, clockwise: false, sweepRad: Math.PI / 2 },
    feedMmMin: 120, toolId: 'generic-od' as const, lengthMm: 5 * Math.PI,
  };
  const explanation = explainBlock(block, [motion]);
  assert.match(explanation.title, /G03 · Arco antihorario/);
  assert.match(explanation.details.join(' '), /Centro del arco: X 20 mm \(diámetro\), Z 0 mm/);
  assert.match(explanation.details.join(' '), /Radio: 10 mm\. Barrido: 90°\. Sentido: antihorario/);
  assert.match(explanation.details.join(' '), /aproxima el arco con tramos lineales/);
  const cw = explainBlock({ ...block, afterState: { ...block.afterState, motion: 'arc-cw' } }, [{ ...motion, kind: 'arc-cw', arc: { ...motion.arc, clockwise: true } }]);
  assert.match(cw.title, /G02 · Arco horario/);
  assert.match(cw.details.join(' '), /Sentido: horario/);
});
test('arc geometry is required exactly by arc motions', () => {
  const base = fixture.motions[0];
  const arc = { center: { rMm: 10, zMm: 0 }, radiusMm: 10, clockwise: false, sweepRad: Math.PI / 2 };
  const wrap = (motion: unknown) => resultSchema.safeParse({ ...fixture, motions: [motion] }).success;
  assert.equal(wrap({ ...base, kind: 'arc-ccw', arc }), true);
  assert.equal(wrap({ ...base, kind: 'arc-ccw' }), false);
  assert.equal(wrap({ ...base, kind: 'linear', arc }), false);
  assert.equal(wrap({ ...base, kind: 'arc-cw', arc: { ...arc, sweepRad: 0 } }), false);
  assert.equal(wrap({ ...base, kind: 'arc-cw', arc: { ...arc, sweepRad: 2 * Math.PI } }), false);
});
test('facing motion explains radial cut to X0', () => {
  const block = {
    ...fixture.blocks[3],
    beforeState: { ...fixture.blocks[3].beforeState, position: { rMm: 27, zMm: -1 } },
    afterState: { ...fixture.blocks[3].afterState, position: { rMm: 0, zMm: -1 }, motion: 'linear' as const },
    kind: 'motion' as const,
  };
  const explanation = explainBlock(block);
  assert.match(explanation.details.join(' '), /Refrentado frontal/);
  assert.match(explanation.details.join(' '), /X \(diámetro\): 54 → 0 mm/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { assemblyMeasures, inspectedToolId, span } from '../src/lib/lathe/toolInspection.ts';
import { orthographicFrame } from '../src/lib/lathe/orthographic.ts';
import { TOOL_CATALOGUE } from '../src/lib/lathe/tools.ts';
import { TOOL_ASSEMBLIES } from '../src/lib/lathe/toolAssemblies.ts';
import { createToolObject } from '../src/lib/lathe/toolObject.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('inspector follows the active tool unless a local tool is chosen', () => {
  assert.equal(inspectedToolId('active', 'boring-id'), 'boring-id');
  assert.equal(inspectedToolId('active', null), 'generic-od');
  assert.equal(inspectedToolId('active', 'not-a-tool'), 'generic-od');
  assert.equal(inspectedToolId('grooving-od', 'boring-id'), 'grooving-od');
});

test('assembly measures match hand-derived envelopes of the educational designs', () => {
  // T1: shank Z 2…14, R 5…65, tangential −16…−4; insert rhombus side 8 at 80° → Z max 8·cos10° < 14, R from 0.
  const t1 = assemblyMeasures('roughing-od');
  assert.deepEqual([t1.axial.min, t1.axial.max, t1.radial.min, t1.radial.max], [0, 14, 0, 65]);
  assert.deepEqual([t1.tangential.min, t1.tangential.max], [-16, 0]);
  near(t1.parts[1].axial.max, 8 * Math.cos(10 * Math.PI / 180));
  // T5: bar Z 4…64, axis R−6 Ø8 → R −10…−2, tangential −8…0; head −8…−2; insert mirrored to R ≤ 0.
  const t5 = assemblyMeasures('boring-id');
  assert.deepEqual([t5.axial.min, t5.axial.max, t5.radial.min, t5.radial.max], [0, 64, -10, 0]);
  assert.deepEqual([t5.tangential.min, t5.tangential.max], [-8, 0]);
  assert.equal(t5.parts[0].shape, 'Barra cilíndrica axial');
  near(t5.parts[2].radial.min, -(4 * Math.sin(35 * Math.PI / 180) + 4));
  // T3: blade 3 mm axial; clamp 10 mm thick centred at −8.
  const t3 = assemblyMeasures('grooving-od');
  assert.equal(span(t3.parts.find(p => p.role === 'insert')!.axial), 3);
  assert.deepEqual([t3.tangential.min, t3.tangential.max], [-13, 0]);
});

test('measures agree with the real Three meshes for every assembly', () => {
  for (const definition of Object.values(TOOL_CATALOGUE)) {
    const measures = assemblyMeasures(definition.id);
    assert.equal(measures.parts.length, TOOL_ASSEMBLIES[definition.id].parts.length);
    const object = createToolObject(definition);
    object.group.updateMatrixWorld(true);
    const body = new THREE.Box3();
    for (const child of object.group.children) if (child.name !== 'reference-marker') body.expandByObject(child);
    near(body.min.x, measures.axial.min, 1e-5); near(body.max.x, measures.axial.max, 1e-5);
    near(body.min.y, measures.radial.min, 1e-5); near(body.max.y, measures.radial.max, 1e-5);
    near(body.min.z, measures.tangential.min, 1e-5); near(body.max.z, measures.tangential.max, 1e-5);
    object.dispose();
  }
});

test('orthographic frame keeps the bounding circle visible for wide and tall viewports', () => {
  for (const aspect of [0.4, 1, 2.5]) {
    const { halfWidth, halfHeight } = orthographicFrame(30, aspect);
    near(halfWidth / halfHeight, aspect);
    assert.ok(Math.min(halfWidth, halfHeight) >= 30);
  }
  assert.throws(() => orthographicFrame(0, 1));
  assert.throws(() => orthographicFrame(10, Number.NaN));
});

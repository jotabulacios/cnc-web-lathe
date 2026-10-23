import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TOOL_ASSEMBLIES, assemblyBounds, partOutline, type ToolPart } from '../src/lib/lathe/toolAssemblies.ts';
import { TOOL_CATALOGUE } from '../src/lib/lathe/tools.ts';
import { createToolObject } from '../src/lib/lathe/toolObject.ts';
import { createLatheView, VIEWPORT } from '../src/lib/lathe/viewport.ts';
import { toolPose } from '../src/lib/lathe/revolution.ts';

function pointAngle(part: ToolPart) {
  assert.equal(part.kind, 'prism');
  const points = partOutline(part);
  const a = points[1]; const b = points.at(-1)!;
  return Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI;
}
test('educational assemblies have explicit mm dimensions, common origin and distinct component geometry', () => {
  const signatures = new Set();
  for (const assembly of Object.values(TOOL_ASSEMBLIES)) {
    assert.equal(assembly.provenance, 'educational-design');
    assert.equal(assembly.revision, 1);
    const insert = assembly.parts.find(p => p.role === 'insert')!;
    assert.deepEqual(partOutline(insert)[0], [0, 0]);
    assert.ok(Math.abs(pointAngle(insert) - TOOL_CATALOGUE[assembly.id].geometry.insertAngleDeg) < 1e-9);
    for (const part of assembly.parts) {
      assert.ok(partOutline(part).every(p => p.every(Number.isFinite)));
      if (part.kind === 'prism') assert.ok(part.thicknessMm > 0);
      else { assert.ok(part.diameterMm > 0); assert.ok(part.lengthMm > 0); }
    }
    signatures.add(JSON.stringify(assembly.parts));
  }
  assert.equal(signatures.size, 6);
  const groove = TOOL_ASSEMBLIES['grooving-od'].parts.find(p => p.role === 'insert')!;
  const outline = partOutline(groove);
  assert.equal(Math.max(...outline.map(p => p[0])) - Math.min(...outline.map(p => p[0])), 3);
  const bar = TOOL_ASSEMBLIES['boring-id'].parts.find(p => p.kind === 'axial-bar')!;
  assert.equal(bar.kind, 'axial-bar');
  if (bar.kind === 'axial-bar') { assert.equal(bar.diameterMm, 8); assert.equal(bar.lengthMm, 60); }
});

test('actual Three meshes match shared longitudinal dimensions and release each resource once', () => {
  for (const definition of Object.values(TOOL_CATALOGUE)) {
    const object = createToolObject(definition);
    const assembly = TOOL_ASSEMBLIES[definition.id];
    let disposals = 0;
    for (let i = 0; i < assembly.parts.length; i++) {
      const part = assembly.parts[i];
      const mesh = object.group.children[i] as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(mesh);
      const outline = partOutline(part);
      const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${definition.id}: ${a} != ${b}`);
      near(box.min.x, Math.min(...outline.map(p => p[0])));
      near(box.max.x, Math.max(...outline.map(p => p[0])));
      near(box.min.y, Math.min(...outline.map(p => p[1])));
      near(box.max.y, Math.max(...outline.map(p => p[1])));
      const thickness = part.kind === 'prism' ? part.thicknessMm : part.diameterMm;
      near(box.min.z, part.tangentialCenterMm - thickness / 2);
      near(box.max.z, part.tangentialCenterMm + thickness / 2);
      mesh.geometry.addEventListener('dispose', () => disposals++);
      (mesh.material as THREE.Material).addEventListener('dispose', () => disposals++);
    }
    const marker = object.group.getObjectByName('reference-marker')!;
    assert.deepEqual(marker.position.toArray(), [0, 0, 0]);
    object.dispose(); object.dispose();
    assert.equal(disposals, assembly.parts.length * 2);
  }
});

test('all tool bodies fit the 2D physical frame at small, ordinary and large stock sizes', () => {
  for (const size of [1, 100, 10000]) {
    const stock = { diameterMm: size / 2, lengthMm: size };
    const position = { rMm: size * 0.3, zMm: size * 0.05 };
    for (const assembly of Object.values(TOOL_ASSEMBLIES)) {
      const view = createLatheView([], position, stock, assemblyBounds(assembly));
      for (const part of assembly.parts) for (const [z, r] of partOutline(part)) {
        assert.ok(view.x(position.zMm + z) >= VIEWPORT.left);
        assert.ok(view.x(position.zMm + z) <= VIEWPORT.left + VIEWPORT.plotWidth);
        assert.ok(view.y(position.rMm + r) >= VIEWPORT.top);
        assert.ok(view.y(position.rMm + r) <= VIEWPORT.top + VIEWPORT.plotHeight);
      }
      assert.ok(Math.abs((view.x(1) - view.x(0)) - (view.y(0) - view.y(1))) < 1e-9);
      const pose = toolPose(position, stock);
      const object = createToolObject(TOOL_CATALOGUE[assembly.id]);
      object.group.scale.setScalar(1 / Math.max(stock.lengthMm, stock.diameterMm));
      object.group.position.set(pose.x, pose.y, pose.z);
      object.group.updateMatrixWorld(true);
      const body = new THREE.Box3();
      for (const child of object.group.children) if (child.name !== 'reference-marker') body.expandByObject(child);
      const bounds = assemblyBounds(assembly);
      const scale = Math.max(stock.lengthMm, stock.diameterMm);
      assert.ok(Math.abs((body.max.x - body.min.x) - (bounds.maxZ - bounds.minZ) / scale) < 1e-5);
      assert.ok(Math.abs((body.max.y - body.min.y) - (bounds.maxR - bounds.minR) / scale) < 1e-5);
      const origin = object.group.localToWorld(new THREE.Vector3());
      assert.ok(origin.distanceTo(new THREE.Vector3(pose.x, pose.y, pose.z)) < 1e-12);
      object.dispose();
    }
  }
});

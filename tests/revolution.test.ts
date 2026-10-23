import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revolutionMesh, toolPose, type RevolutionMesh } from '../src/lib/lathe/revolution.ts';

const stock = { lengthMm: 100, diameterMm: 50 };
const cylinder = [{ zStartMm: -100, zEndMm: 0, radiusMm: 25 }];
test('tool tip uses the same physical radius, axial origin and fixed stock scale as the mesh', () => {
  assert.deepEqual(toolPose({ rMm: 30, zMm: 5 }, stock), { x: 0.55, y: 0.3, z: 0, inMaterialFrame: true });
  assert.deepEqual(toolPose({ rMm: 20, zMm: -40 }, stock), { x: 0.1, y: 0.2, z: 0, inMaterialFrame: true });
  assert.equal(toolPose({ rMm: 5000, zMm: 5 }, stock).inMaterialFrame, false);
  for (const position of [{ rMm: NaN, zMm: 0 }, { rMm: -1, zMm: 0 }, { rMm: 1, zMm: Infinity }]) {
    assert.throws(() => toolPose(position, stock));
  }
});
const stepped = [{ zStartMm: -100, zEndMm: -40, radiusMm: 25 },
  { zStartMm: -40, zEndMm: -20, radiusMm: 20 }, { zStartMm: -20, zEndMm: 0, radiusMm: 15 }];
function verifySurface(mesh: RevolutionMesh) {
  const { positions: p, normals: n, indices } = mesh;
  const edges = new Map<string, { count: number; orientation: number }>();
  const point = (i: number) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const key = (i: number) => point(i).join(',');
  let volume = 0;
  assert.equal(p.length, n.length);
  assert.ok(p.every(Number.isFinite));
  assert.ok(n.every(Number.isFinite));
  for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-6);
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i + 3));
    assert.ok(ids.every(id => id < p.length / 3));
    const [a, b, c] = ids.map(point);
    const u = b.map((v, j) => v - a[j]);
    const v = c.map((value, j) => value - a[j]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(Math.hypot(...cross) > 0, 'no degenerate triangles');
    const dot = cross.reduce((sum, value, j) => sum + value * ids.reduce((s, id) => s + n[id * 3 + j], 0), 0);
    assert.ok(dot > 0, 'winding agrees with outward vertex normals');
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let j = 0; j < 3; j++) {
      const from = key(ids[j]);
      const to = key(ids[(j + 1) % 3]);
      const edgeKey = from < to ? `${from}/${to}` : `${to}/${from}`;
      const edge = edges.get(edgeKey) ?? { count: 0, orientation: 0 };
      edge.count++;
      edge.orientation += from < to ? 1 : -1;
      edges.set(edgeKey, edge);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'every welded edge belongs to two triangles');
    assert.equal(edge.orientation, 0, 'shared edges have opposite directions');
  }
  return volume * mesh.scaleMm ** 3;
}

test('closed cylinder has outward winding, no pole degenerates and analytical volume', () => {
  const mesh = revolutionMesh(cylinder, stock);
  assert.equal(mesh.volumeMm3, Math.PI * 25 ** 2 * 100);
  const polygonRatio = Math.sin(2 * Math.PI / 48) / (2 * Math.PI / 48);
  assert.ok(Math.abs(verifySurface(mesh) / mesh.volumeMm3 - polygonRatio) < 1e-6);
});

test('asymmetric shoulders keep Z orientation, closed surface and hard axial normals', () => {
  const mesh = revolutionMesh(stepped, stock, 16);
  assert.ok(Math.abs(mesh.volumeMm3 - Math.PI * (625 * 60 + 400 * 20 + 225 * 20)) < 1e-9);
  assert.ok(verifySurface(mesh) > 0);
  for (const [z, inner, outer] of [[-40, 20, 25], [-20, 15, 20]]) {
    let found = false;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.abs(mesh.positions[i] - (z + 50) / 100) < 1e-7 && mesh.normals[i] === 1) {
        const radius = Math.hypot(mesh.positions[i + 1], mesh.positions[i + 2]) * 100;
        assert.ok(radius >= inner - 1e-5 && radius <= outer + 1e-5, 'shoulder is annular, never an internal full disk');
        found = true;
      }
    }
    assert.ok(found);
  }
});

test('zero-radius gaps form separate closed islands; all-zero material yields an empty mesh', () => {
  const spans = [{ zStartMm: -100, zEndMm: -60, radiusMm: 25 },
    { zStartMm: -60, zEndMm: -30, radiusMm: 0 }, { zStartMm: -30, zEndMm: 0, radiusMm: 10 }];
  const mesh = revolutionMesh(spans, stock);
  assert.ok(verifySurface(mesh) > 0);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const xs = Array.from(mesh.indices.slice(i, i + 3), index => mesh.positions[index * 3]);
    assert.ok(Math.max(...xs) <= -0.1 + 1e-7 || Math.min(...xs) >= 0.2 - 1e-7, 'no triangle bridges the removed gap');
  }
  const empty = revolutionMesh([{ zStartMm: -100, zEndMm: 0, radiusMm: 0 }], stock);
  assert.equal(empty.positions.length + empty.normals.length + empty.indices.length + empty.volumeMm3, 0);
});

test('rejects malformed profiles, out-of-stock radii, resource overflow and collapsed float32 geometry', () => {
  for (const spans of [[], [{ ...cylinder[0], radiusMm: NaN }], [{ ...cylinder[0], radiusMm: -1 }],
    [{ ...cylinder[0], radiusMm: 26 }], [{ ...cylinder[0], zStartMm: -99 }], [{ ...cylinder[0], zEndMm: -1 }],
    [{ zStartMm: -100, zEndMm: -20, radiusMm: 25 }, { zStartMm: -19, zEndMm: 0, radiusMm: 20 }],
    Array.from({ length: 4097 }, () => cylinder[0])]) assert.throws(() => revolutionMesh(spans, stock));
  for (const segments of [0, 7, 49, 12.5, Infinity]) assert.throws(() => revolutionMesh(cylinder, stock, segments));
  for (const lengthMm of [0, NaN, Infinity, 1e10]) assert.throws(() => revolutionMesh(cylinder, { ...stock, lengthMm }));
  assert.throws(() => revolutionMesh([{ zStartMm: -100, zEndMm: -100 + 1e-12, radiusMm: 25 },
    { zStartMm: -100 + 1e-12, zEndMm: 0, radiusMm: 20 }], stock), /Rango/);
});

test('4096 spans stay below 32 MiB and use 32-bit indices without truncation', () => {
  const spans = Array.from({ length: 4096 }, (_, i) => ({ zStartMm: -4096 + i, zEndMm: -4095 + i, radiusMm: i % 2 ? 20 : 25 }));
  const mesh = revolutionMesh(spans, { lengthMm: 4096, diameterMm: 50 });
  assert.ok(mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength < 32 * 1024 ** 2);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.ok(mesh.indices.some(i => i > 65535));
  assert.ok(mesh.indices.every(i => i < mesh.positions.length / 3));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revolutionMeshV2 } from '../src/lib/lathe/revolutionV2.ts';
import { revolutionMesh, type RevolutionMesh } from '../src/lib/lathe/revolution.ts';
const stock = { lengthMm: 100, diameterMm: 50 };
const span = (rStartMm: number, rEndMm: number, zStartMm = -100, zEndMm = 0) => ({ zStartMm, zEndMm, rStartMm, rEndMm });
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


test('cylinder matches v1 scaling, buffers and volume exactly', () => {
  const mesh = revolutionMeshV2([span(25, 25)], stock);
  assert.deepEqual(mesh, revolutionMesh([{ zStartMm: -100, zEndMm: 0, radiusMm: 25 }], stock));
  assert.ok(verifySurface(mesh) > 0);
});
test('cones at either end and frusta have analytical volume, closed outward surfaces and inclined unit normals', () => {
  for (const [r0, r1] of [[0, 25], [25, 0], [25, 10], [10, 25]]) {
    const mesh = revolutionMeshV2([span(r0, r1)], stock);
    const volume = Math.PI * 100 * (r0 * r0 + r0 * r1 + r1 * r1) / 3;
    assert.equal(mesh.volumeMm3, volume);
    const polygonRatio = Math.sin(2 * Math.PI / 48) / (2 * Math.PI / 48);
    assert.ok(Math.abs(verifySurface(mesh) / volume - polygonRatio) < 1e-6);
    assert.ok(Math.abs(mesh.normals[0] - (r0-r1)/Math.hypot(100, r0-r1)) < 1e-7);
    assert.ok(mesh.normals[1] > 0, 'inclined side retains outward radial normal');
  }
});
test('mixed cylinders, frusta and annular shoulders keep hard axial normals', () => {
  const mesh = revolutionMeshV2([span(25, 15, -100, -60), span(20, 20, -60, -30), span(10, 0, -30, 0)], stock);
  assert.ok(verifySurface(mesh) > 0);
  const expected = Math.PI * (40 * (625 + 375 + 225) / 3 + 30 * 400 + 30 * 100 / 3);
  assert.ok(Math.abs(mesh.volumeMm3 - expected) < 1e-9);
  for (const [z, inner, outer, sign] of [[-60, 15, 20, -1], [-30, 10, 20, 1]]) {
    let count = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.abs(mesh.positions[i] - (z + 50) / 100) < 1e-7 && mesh.normals[i] === sign) {
        const radius = Math.hypot(mesh.positions[i+1], mesh.positions[i+2]) * 100;
        assert.ok(radius >= inner - 1e-5 && radius <= outer + 1e-5);
        count++;
      }
    }
    assert.ok(count > 0);
  }
});
test('zero-radius gaps separate tapered islands and a fully removed profile stays empty', () => {
  const mesh = revolutionMeshV2([span(25, 0, -100, -60), span(0, 0, -60, -30), span(0, 10, -30, 0)], stock);
  assert.ok(verifySurface(mesh) > 0);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const xs = Array.from(mesh.indices.slice(i, i+3), id => mesh.positions[3*id]);
    assert.ok(Math.max(...xs) <= -0.1+1e-7 || Math.min(...xs) >= 0.2-1e-7);
  }
  const empty = revolutionMeshV2([span(0, 0)], stock);
  assert.equal(empty.positions.length + empty.indices.length + empty.normals.length + empty.volumeMm3, 0);
});
test('rejects invalid input, noncontiguous profiles, excessive resolution and float32 collapse', () => {
  for (const spans of [[], [span(-1, 10)], [span(10, Infinity)], [span(NaN, 10)], [span(26, 0)],
    [span(10, 10, -99)], [span(10, 10, -100, -1)], [span(10, 10, -100, -50), span(10, 10, -49)],
    [span(10, 10, -100, -100)], Array.from({ length: 4097 }, () => span(10, 10))]) {
    assert.throws(() => revolutionMeshV2(spans, stock));
  }
  for (const segments of [0, 7, 49, 12.5, Infinity]) assert.throws(() => revolutionMeshV2([span(25, 10)], stock, segments));
  for (const lengthMm of [0, NaN, Infinity, 1e10]) assert.throws(() => revolutionMeshV2([span(25, 10)], { ...stock, lengthMm }));
  assert.throws(() => revolutionMeshV2([span(25, 20, -100, -100+1e-12), span(20, 10, -100+1e-12)], stock), /Rango/);
  assert.throws(() => revolutionMeshV2([span(25, 25 - 1e-12)], stock), /Rango/);
  assert.throws(() => revolutionMeshV2([span(1e-100, 0)], stock), /Rango/);
  assert.throws(() => revolutionMeshV2([span(100 * 2 ** -149, 0)], stock), /Rango/);
  assert.throws(() => revolutionMeshV2([span(25, 25, -100, -50), span(25-1e-12, 10, -50)], stock), /Escalón/);
});
test('maximum profile uses finite typed buffers below 32 MiB and full-width indices', () => {
  const spans = Array.from({ length: 4096 }, (_, i) => span(i % 2 ? 20 : 25, i % 2 ? 15 : 20, -4096+i, -4095+i));
  const mesh = revolutionMeshV2(spans, { lengthMm: 4096, diameterMm: 50 });
  assert.ok(mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength < 32 * 1024 ** 2);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.ok(mesh.indices.some(i => i > 65535));
  assert.ok(mesh.indices.every(i => i < mesh.positions.length/3));
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.ok(mesh.normals.every(Number.isFinite));
});

test('exterior section view keeps the exact v2 volume and draws a closed half solid', async () => {
  const { profileMesh } = await import('../src/lib/lathe/sectionMesh.ts');
  const stock = { lengthMm: 100, diameterMm: 50 };
  const spans = [
    { zStartMm: -100, zEndMm: -40, rStartMm: 25, rEndMm: 25 },
    { zStartMm: -40, zEndMm: -20, rStartMm: 20, rEndMm: 15 },
    { zStartMm: -20, zEndMm: -5, rStartMm: 15, rEndMm: 15 },
    { zStartMm: -5, zEndMm: 0, rStartMm: 0, rEndMm: 0 },
  ];
  const full = profileMesh(spans, stock, false);
  const half = profileMesh(spans, stock, true);
  assert.equal(full.volumeMm3, revolutionMeshV2(spans, stock).volumeMm3);
  assert.equal(half.volumeMm3, full.volumeMm3);
  assert.equal(full.sectionIndexStart, undefined);
  assert.ok(half.sectionIndexStart! > 0);
  for (let i = 0; i < half.positions.length; i += 3) assert.ok(half.positions[i + 2] <= 0);
  assert.throws(() => profileMesh([{ zStartMm: -100, zEndMm: 0, rStartMm: 26, rEndMm: 26 }], stock, true));
});

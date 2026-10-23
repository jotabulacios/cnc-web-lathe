import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { revolutionMeshV3 } from '../src/lib/lathe/revolutionV3.ts';
import { revolutionMeshV2 } from '../src/lib/lathe/revolutionV2.ts';
import type { RevolutionMesh } from '../src/lib/lathe/revolution.ts';
import type { AnnularSpan } from '../src/lib/lathe/profilePathV3.ts';
const stock = { lengthMm: 100, diameterMm: 50 };
const span = (innerStartMm = 10, innerEndMm = 10, outerStartMm = 25, outerEndMm = 25, zStartMm = -100, zEndMm = 0): AnnularSpan =>
  ({ zStartMm, zEndMm, innerStartMm, innerEndMm, outerStartMm, outerEndMm });

function verifySurface(mesh: RevolutionMesh) {
  const { positions: p, normals: n, indices } = mesh;
  const edges = new Map<string, { count: number; orientation: number }>();
  const point = (i: number) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const key = (i: number) => point(i).join(',');
  let signedVolume = 0;
  assert.equal(p.length, n.length);
  assert.ok(p.every(Number.isFinite)); assert.ok(n.every(Number.isFinite));
  for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i+1], n[i+2])-1) < 1e-6);
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i+3));
    assert.ok(ids.every(id => id < p.length / 3));
    const [a,b,c] = ids.map(point);
    const u = b.map((v,j) => v-a[j]); const v = c.map((value,j) => value-a[j]);
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    assert.ok(Math.hypot(...cross) > 0, 'no degenerate triangles');
    const dot = cross.reduce((sum,value,j) => sum + value * ids.reduce((s,id) => s+n[id*3+j],0),0);
    assert.ok(dot > 0, 'winding follows outward normals, including the hole');
    signedVolume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for (let j = 0; j < 3; j++) {
      const from = key(ids[j]); const to = key(ids[(j+1)%3]);
      const edgeKey = from < to ? `${from}/${to}` : `${to}/${from}`;
      const edge = edges.get(edgeKey) ?? { count: 0, orientation: 0 };
      edge.count++; edge.orientation += from < to ? 1 : -1; edges.set(edgeKey, edge);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'every geometric edge has two incident faces');
    assert.equal(edge.orientation, 0, 'shared edge directions cancel');
  }
  return signedVolume * mesh.scaleMm ** 3;
}
function volumeAndSurface(mesh: RevolutionMesh, expected: number) {
  assert.ok(Math.abs(mesh.volumeMm3-expected) <= Math.abs(expected)*1e-13);
  const polygonRatio = Math.sin(2*Math.PI/48)/(2*Math.PI/48);
  assert.ok(Math.abs(verifySurface(mesh)/expected - polygonRatio) < 1e-6);
}

test('tube has an open bore, correctly oriented interior and annular end caps', () => {
  const mesh = revolutionMeshV3([span()], stock);
  volumeAndSurface(mesh, 52500*Math.PI);
  assert.ok(mesh.normals.some((v,i) => i%3 === 1 && v < -0.99), 'inner normals point toward axis');
  for (let i = 0; i < mesh.positions.length; i+=3) {
    assert.ok(Math.hypot(mesh.positions[i+1], mesh.positions[i+2])*100 >= 10-1e-5, 'no vertex plugs the hole');
  }
});
test('solid annular input matches the previous exterior buffers and volume', () => {
  const actual = revolutionMeshV3([span(0,0)], stock);
  const previous = revolutionMeshV2([{ zStartMm:-100, zEndMm:0, rStartMm:25, rEndMm:25 }], stock);
  assert.deepEqual(actual.positions,previous.positions);
  assert.deepEqual(actual.normals,previous.normals);
  assert.deepEqual(actual.indices,previous.indices);
  assert.equal(actual.scaleMm,previous.scaleMm);
  assert.ok(Math.abs(actual.volumeMm3/previous.volumeMm3-1)<1e-14);
});
test('conical inner and outer surfaces enclose their analytical volume', () => {
  volumeAndSurface(revolutionMeshV3([span(5,10,25,20)], stock), 45000*Math.PI);
  volumeAndSurface(revolutionMeshV3([span(0,10,25,25)], stock), (62500-10000/3)*Math.PI);
  volumeAndSurface(revolutionMeshV3([span(10,0,25,25)], stock), (62500-10000/3)*Math.PI);
});
test('both-sided shoulders close only exposed bands and retain the central hole', () => {
  const spans = [span(10,10,25,25,-100,-60), span(15,15,20,20,-60,-30), span(5,5,22,22,-30,0)];
  volumeAndSurface(revolutionMeshV3(spans,stock), Math.PI*(40*(625-100)+30*(400-225)+30*(484-25)));
});
test('disjoint radial bands and fully empty axial spans form separate closed components', () => {
  const disjoint = [span(0,0,5,5,-100,-50), span(10,10,20,20,-50,0)];
  volumeAndSurface(revolutionMeshV3(disjoint,stock), Math.PI*(50*25+50*300));
  const islands = [span(10,10,25,25,-100,-80), span(20,20,20,20,-80,-20), span(5,5,10,10,-20,0)];
  volumeAndSurface(revolutionMeshV3(islands,stock), Math.PI*(20*525+20*75));
  const empty = revolutionMeshV3([span(10,20,10,20)],stock);
  assert.equal(empty.positions.length+empty.normals.length+empty.indices.length+empty.volumeMm3,0);
});
test('material tapering to a ring or axis keeps a closed outward surface', () => {
  volumeAndSurface(revolutionMeshV3([span(10,15,25,15)],stock), Math.PI*100*((625+375+225)-(100+150+225))/3);
  volumeAndSurface(revolutionMeshV3([span(0,0,25,0)],stock), Math.PI*100*625/3);
});
test('shared geometry fixture keeps exact analytic volume and a closed final mesh', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/annular-material.json', import.meta.url),'utf8'));
  volumeAndSurface(revolutionMeshV3(fixture.expectedSpans,stock), fixture.cuts.at(-1).remainingVolumePiMm3*Math.PI);
});
test('invalid dimensions, profiles and GPU precision collapse fail with a 2D fallback', () => {
  for (const spans of [[], [span(-1)], [span(26)], [span(10,NaN)], [span(10,10,25,25,-99)],
    [span(10,10,25,25,-100,-1)], [span(10,10,25,25,-100,-50),span(10,10,25,25,-49,0)]]) {
    assert.throws(() => revolutionMeshV3(spans,stock));
  }
  for (const segments of [0,7,49,12.5,Infinity]) assert.throws(() => revolutionMeshV3([span()],stock,segments));
  for (const lengthMm of [0,NaN,Infinity,1e10]) assert.throws(() => revolutionMeshV3([span()],{...stock,lengthMm}));
  assert.throws(() => revolutionMeshV3([span(25-1e-12,25-1e-12)],stock),/Rango/);
  assert.throws(() => revolutionMeshV3([span(10,10,25,25,-100,-100+1e-12),span(10,10,25,25,-100+1e-12,0)],stock),/Rango/);
  assert.throws(() => revolutionMeshV3([span(1e-100,1e-100)],stock),/Rango/);
});
test('maximum complex annular profile uses finite buffers below 32 MiB', () => {
  const spans = Array.from({length:4096},(_,i) => span(i%2 ? 10:5,i%2 ? 10:5,i%2 ? 20:25,i%2 ? 20:25,-4096+i,-4095+i));
  const mesh = revolutionMeshV3(spans,{diameterMm:50,lengthMm:4096});
  assert.ok(mesh.positions.byteLength+mesh.normals.byteLength+mesh.indices.byteLength <= 32*1024**2);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.ok(mesh.indices.some(i => i>65535));
  assert.ok(mesh.indices.every(i => i<mesh.positions.length/3));
  assert.ok(mesh.positions.every(Number.isFinite)); assert.ok(mesh.normals.every(Number.isFinite));
});

test('faced tube closes at the new face with an annular cap and no ghost front', () => {
  const mesh = revolutionMeshV3([
    span(10, 10, 25, 25, -100, -5),
    span(10, 10, 10, 10, -5, 0),
  ], stock);
  volumeAndSurface(mesh, 49875 * Math.PI);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.ok(mesh.positions[i] <= 0.450001, 'no surface in removed front');
    assert.ok(Math.hypot(mesh.positions[i + 1], mesh.positions[i + 2]) >= 0.099999, 'hole remains open');
  }
});

function sectionMatchesHalf(spans: AnnularSpan[], label: string, scene = stock) {
  const full = revolutionMeshV3(spans, scene);
  const half = revolutionMeshV3(spans, scene, 48, true);
  assert.equal(half.volumeMm3, full.volumeMm3, `${label}: physical volume is the full profile`);
  const halfVolume = verifySurface(half);
  assert.ok(Math.abs(halfVolume / (verifySurface(full) / 2) - 1) < 1e-9, `${label}: closed half of the same polygonal solid`);
  const start = half.sectionIndexStart!;
  assert.ok(start > 0 && start < half.indices.length);
  for (let i = 0; i < half.positions.length; i += 3) assert.ok(half.positions[i + 2] <= 0, `${label}: front half removed`);
  for (let i = start; i < half.indices.length; i++) {
    const v = half.indices[i];
    assert.equal(half.positions[v * 3 + 2], 0, `${label}: cut caps lie on z=0`);
    assert.deepEqual(Array.from(half.normals.slice(v * 3, v * 3 + 3)), [0, 0, 1]);
  }
  return half;
}

test('longitudinal section is a closed half solid with caps on material only', () => {
  const tube = sectionMatchesHalf([span()], 'tube');
  for (let i = tube.sectionIndexStart!; i < tube.indices.length; i++) {
    assert.ok(Math.abs(tube.positions[tube.indices[i] * 3 + 1]) * 100 >= 10 - 1e-5, 'bore is not capped');
  }
  sectionMatchesHalf([span(5,10,25,20)], 'cones');
  sectionMatchesHalf([span(0,10,25,25)], 'inner apex');
  sectionMatchesHalf([span(10,15,25,15)], 'pinched to a ring');
  sectionMatchesHalf([span(0,0,25,0)], 'solid cone to axis');
  sectionMatchesHalf([span(10,10,25,25,-100,-60), span(15,15,20,20,-60,-30), span(5,5,22,22,-30,0)], 'two-sided shoulders');
  sectionMatchesHalf([span(0,0,5,5,-100,-50), span(10,10,20,20,-50,0)], 'disjoint bands');
  sectionMatchesHalf([span(10,10,25,25,-100,-80), span(20,20,20,20,-80,-20), span(5,5,10,10,-20,0)], 'islands');
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/annular-material.json', import.meta.url),'utf8'));
  sectionMatchesHalf(fixture.expectedSpans, 'shared fixture');
});

test('faced tube section leaves the removed front and the bore empty', () => {
  const mesh = sectionMatchesHalf([span(10, 10, 25, 25, -100, -5), span(10, 10, 10, 10, -5, 0)], 'faced');
  assert.ok(Math.abs(mesh.volumeMm3 - 49875 * Math.PI) <= 49875 * Math.PI * 1e-13);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.ok(mesh.positions[i] <= 0.450001, 'no surface in removed front');
    assert.ok(Math.hypot(mesh.positions[i + 1], mesh.positions[i + 2]) >= 0.099999, 'hole remains open');
  }
});

test('section of the maximum annular profile stays within the 32 MiB buffer budget', () => {
  const spans = Array.from({length:4096},(_,i) => span(i%2 ? 10:5,i%2 ? 10:5,i%2 ? 20:25,i%2 ? 20:25,-4096+i,-4095+i));
  const mesh = revolutionMeshV3(spans,{diameterMm:50,lengthMm:4096},48,true);
  assert.ok(mesh.positions.byteLength+mesh.normals.byteLength+mesh.indices.byteLength <= 32*1024**2);
  assert.ok(mesh.indices.every(i => i<mesh.positions.length/3));
  verifySurface(mesh);
});

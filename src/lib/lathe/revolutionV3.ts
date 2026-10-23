import type { RevolutionMesh } from './revolution.ts';
import { validateAnnularSpans, type AnnularSpan } from './profilePathV3.ts';

type Stock = { lengthMm: number; diameterMm: number };
type Side = { z0: number; z1: number; r0: number; r1: number; sign: number };
type Cap = { z: number; inner: number; outer: number; sign: number };
const MAX_MESH_BYTES = 32 * 1024 ** 2;

/** Annular surface of revolution only. Maximum requested facet count can be
 * reduced for complex profiles to keep all typed buffers within 32 MiB.
 * `section` keeps only the back half (scene z ≤ 0, θ∈[π,2π]) and closes the
 * longitudinal cut plane z=0 with caps over material bands only. Presentation
 * only: volumeMm3 stays the full physical volume of the profile. */
export function revolutionMeshV3(spans: readonly AnnularSpan[], stock: Stock, segments = 48, section = false): RevolutionMesh {
  validateAnnularSpans(spans);
  const { lengthMm, diameterMm } = stock;
  if (![lengthMm, diameterMm].every(v => Number.isFinite(v) && v > 0 && v <= 1e9)
    || !Number.isInteger(segments) || segments < 8 || segments > 48) throw new Error('Medidas o resolución 3D inválidas.');
  if (spans[0].zStartMm !== -lengthMm || spans.at(-1)!.zEndMm !== 0
    || spans.some(s => Math.max(s.outerStartMm, s.outerEndMm) > diameterMm / 2)) {
    throw new Error('Perfil 3D fuera del material o discontinuo.');
  }
  const scaleMm = Math.max(lengthMm, diameterMm);
  const x = (z: number) => (z + lengthMm / 2) / scaleMm;
  const sides: Side[] = [];
  const caps: Cap[] = [];
  let volumeMm3 = 0;
  let compensation = 0;
  for (const s of spans) {
    const a = s.outerStartMm; const b = s.outerEndMm;
    const c = s.innerStartMm; const d = s.innerEndMm;
    const volume = Math.PI * (s.zEndMm - s.zStartMm)
      * (((a-c)*(a+c) + (b-d)*(b+d) + (a-c)*b + c*(b-d)) / 3);
    const adjusted = volume - compensation;
    const next = volumeMm3 + adjusted;
    compensation = (next - volumeMm3) - adjusted;
    volumeMm3 = next;
    if (a === c && b === d) continue;
    if (Math.fround(x(s.zStartMm)) === Math.fround(x(s.zEndMm))) rangeError();
    for (const [inner, outer] of [[c, a], [d, b]]) {
      if (inner !== outer && Math.fround(inner / scaleMm) === Math.fround(outer / scaleMm)) rangeError();
    }
    for (const [r0, r1, sign] of [[a, b, 1], [c, d, -1]]) {
      if (r0 === 0 && r1 === 0) continue;
      if ([r0, r1].some(r => r > 0 && Math.fround(r / scaleMm) === 0)
        || (r0 !== r1 && Math.fround(r0 / scaleMm) === Math.fround(r1 / scaleMm))) rangeError();
      sides.push({ z0: s.zStartMm, z1: s.zEndMm, r0, r1, sign });
    }
  }
  function cap(z: number, inner: number, outer: number, sign: number) {
    if (inner >= outer) return;
    if (Math.fround(inner / scaleMm) === Math.fround(outer / scaleMm)) rangeError();
    caps.push({ z, inner, outer, sign });
  }
  // At each shoulder draw only the symmetric difference of material bands.
  // Overlapping left/right annuli have no internal face and no plugged hole.
  for (let i = 0; i <= spans.length; i++) {
    const left = i === 0 ? [0, 0] : [spans[i-1].innerEndMm, spans[i-1].outerEndMm];
    const right = i === spans.length ? [0, 0] : [spans[i].innerStartMm, spans[i].outerStartMm];
    const z = i === spans.length ? 0 : spans[i].zStartMm;
    for (const [a, b, sign] of [[left, right, 1], [right, left, -1]] as const) {
      if (a[0] >= a[1]) continue;
      if (b[0] >= b[1] || b[1] <= a[0] || b[0] >= a[1]) cap(z, a[0], a[1], sign);
      else {
        cap(z, a[0], Math.min(a[1], b[0]), sign);
        cap(z, Math.max(a[0], b[1]), a[1], sign);
      }
    }
  }
  // Cut-plane chains: radii on each vertical edge, split where a neighbouring band
  // or shoulder cap ends so every edge is shared exactly once (no T-junctions).
  const chains: { z0: number; z1: number; left: number[]; right: number[] }[] = [];
  const band = (s: AnnularSpan | undefined, end: boolean) =>
    !s ? [] : end ? (s.innerEndMm < s.outerEndMm ? [s.innerEndMm, s.outerEndMm] : [])
      : (s.innerStartMm < s.outerStartMm ? [s.innerStartMm, s.outerStartMm] : []);
  const breakpoints = (inner: number, outer: number, extra: number[]) => inner === outer ? [inner]
    : [inner, ...[...new Set(extra)].filter(r => r > inner && r < outer).sort((p, q) => p - q), outer];
  if (section) spans.forEach((s, i) => {
    if (s.innerStartMm === s.outerStartMm && s.innerEndMm === s.outerEndMm) return;
    const left = breakpoints(s.innerStartMm, s.outerStartMm, band(spans[i - 1], true));
    const right = breakpoints(s.innerEndMm, s.outerEndMm, band(spans[i + 1], false));
    for (const chain of [left, right]) for (let k = 1; k < chain.length; k++) {
      if (Math.fround(chain[k - 1] / scaleMm) === Math.fround(chain[k] / scaleMm)) rangeError();
    }
    chains.push({ z0: s.zStartMm, z1: s.zEndMm, left, right });
  });
  const facetsFor = (n: number) => section ? Math.ceil(n / 2) : n;
  const counts = (facets: number) => {
    let vertices = 0; let triangles = 0;
    for (const c of chains) {
      vertices += 2 * (c.left.length + c.right.length);
      triangles += 2 * (c.left.length + c.right.length - 2);
    }
    for (const s of sides) {
      const apex = s.r0 === 0 || s.r1 === 0;
      vertices += apex ? 2 * facets + 1 : 2 * (facets + 1);
      triangles += (apex ? 1 : 2) * facets;
    }
    for (const c of caps) {
      vertices += c.inner === 0 ? facets + 2 : 2 * (facets + 1);
      triangles += (c.inner === 0 ? 1 : 2) * facets;
    }
    return { vertices, triangles, bytes: vertices * 24 + triangles * 12 };
  };
  let count = counts(facetsFor(segments));
  while (count.bytes > MAX_MESH_BYTES && segments > 8) {
    segments = Math.max(8, Math.floor(segments / 2));
    count = counts(facetsFor(segments));
  }
  const facets = facetsFor(segments);
  // Full mode keeps the historical angle expression so buffers stay bit-identical.
  const angleAt = (t: number) => section ? Math.PI + t * Math.PI / facets : t * 2 * Math.PI / segments;
  if (count.bytes > MAX_MESH_BYTES) throw new Error('Perfil demasiado complejo para 3D; usá la vista 2D.');
  const positions = new Float32Array(count.vertices * 3);
  const normals = new Float32Array(count.vertices * 3);
  const indices = new Uint32Array(count.triangles * 3);
  // Exact seam values: the cut-plane rings must coincide with the cap vertices.
  const cos = Array.from({ length: facets+1 }, (_, i) => i === facets ? 1 : section && i === 0 ? -1 : Math.cos(angleAt(i)));
  const sin = Array.from({ length: facets+1 }, (_, i) => i === facets || (section && i === 0) ? 0 : Math.sin(angleAt(i)));
  let vertexCount = 0; let indexCount = 0;
  function vertex(z: number, radius: number, angle: number, nx: number, nr: number) {
    const offset = vertexCount++ * 3;
    positions.set([x(z), radius / scaleMm * cos[angle], radius / scaleMm * sin[angle]], offset);
    normals.set(nr === 0 ? [nx, 0, 0] : [nx, nr * cos[angle], nr * sin[angle]], offset);
  }
  function triangle(a: number, b: number, c: number, sign = 1) {
    const ax = positions[a*3]; const ay = positions[a*3+1]; const az = positions[a*3+2];
    const ux = positions[b*3]-ax; const uy = positions[b*3+1]-ay; const uz = positions[b*3+2]-az;
    const vx = positions[c*3]-ax; const vy = positions[c*3+1]-ay; const vz = positions[c*3+2]-az;
    if (uy*vz-uz*vy === 0 && uz*vx-ux*vz === 0 && ux*vy-uy*vx === 0) rangeError();
    indices.set(sign > 0 ? [a,b,c] : [a,c,b], indexCount);
    indexCount += 3;
  }
  for (const s of sides) {
    const base = vertexCount;
    const dz = s.z1-s.z0; const dr = s.r0-s.r1;
    const normalLength = Math.hypot(dz, dr);
    const nx = s.sign * dr / normalLength; const nr = s.sign * dz / normalLength;
    if (s.r0 === 0 || s.r1 === 0) {
      const startApex = s.r0 === 0;
      for (let i = 0; i <= facets; i++) vertex(startApex ? s.z1 : s.z0, Math.max(s.r0, s.r1), i, nx, nr);
      for (let i = 0; i < facets; i++) {
        const apex = vertexCount;
        vertex(startApex ? s.z0 : s.z1, 0, i, nx, nr);
        const angle = angleAt(i + 0.5);
        normals.set([nx, nr*Math.cos(angle), nr*Math.sin(angle)], apex*3);
        if (startApex) triangle(apex, base+i+1, base+i, s.sign);
        else triangle(base+i, base+i+1, apex, s.sign);
      }
    } else {
      for (let i = 0; i <= facets; i++) {
        vertex(s.z0, s.r0, i, nx, nr); vertex(s.z1, s.r1, i, nx, nr);
      }
      for (let i = 0; i < facets; i++) {
        const a = base+2*i;
        triangle(a, a+3, a+1, s.sign); triangle(a, a+2, a+3, s.sign);
      }
    }
  }
  for (const c of caps) {
    const base = vertexCount;
    if (c.inner === 0) {
      vertex(c.z, 0, 0, c.sign, 0);
      for (let i = 0; i <= facets; i++) vertex(c.z, c.outer, i, c.sign, 0);
      for (let i = 0; i < facets; i++) triangle(base, base+i+1, base+i+2, c.sign);
    } else {
      for (let i = 0; i <= facets; i++) {
        vertex(c.z, c.outer, i, c.sign, 0); vertex(c.z, c.inner, i, c.sign, 0);
      }
      for (let i = 0; i < facets; i++) {
        const a = base+2*i;
        triangle(a, a+2, a+1, c.sign); triangle(a+2, a+3, a+1, c.sign);
      }
    }
  }
  const sectionIndexStart = indexCount;
  for (const c of chains) for (const side of [1, -1]) {
    // Zipper between both vertical chains of the convex trapezoid; normal +z.
    const left = vertexCount;
    for (const r of c.left) plane(c.z0, side * r);
    const right = vertexCount;
    for (const r of c.right) plane(c.z1, side * r);
    let i = 0; let j = 0;
    const m = c.left.length - 1; const n = c.right.length - 1;
    while (i < m || j < n) {
      if (i < m && (j === n || c.left[i+1] <= c.right[j+1])) { triangle(left+i, right+j, left+i+1, side); i++; }
      else { triangle(left+i, right+j, right+j+1, side); j++; }
    }
  }
  function plane(z: number, radius: number) {
    const offset = vertexCount++ * 3;
    positions.set([x(z), radius / scaleMm, 0], offset);
    normals.set([0, 0, 1], offset);
  }
  return { positions, normals, indices, volumeMm3, scaleMm, ...(section ? { sectionIndexStart } : {}) };
}

function rangeError(): never {
  throw new Error('Rango de medidas demasiado grande para 3D; usá la vista 2D.');
}

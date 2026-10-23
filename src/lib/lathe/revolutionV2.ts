import type { RevolutionMesh } from './revolution.ts';
import type { StockProfileV2 } from './profile.ts';

type Stock = { lengthMm: number; diameterMm: number };
type Span = StockProfileV2['spans'][number];

/** Pure rendering projection of linear radii; scene X is physical Z. */
export function revolutionMeshV2(spans: readonly Span[], stock: Stock, segments = 48): RevolutionMesh {
  const { lengthMm, diameterMm } = stock;
  if (![lengthMm, diameterMm].every(v => Number.isFinite(v) && v > 0 && v <= 1e9)
    || !Number.isInteger(segments) || segments < 8 || segments > 48
    || spans.length < 1 || spans.length > 4096) throw new Error('Medidas o resolución 3D inválidas.');
  const scaleMm = Math.max(lengthMm, diameterMm);
  const x = (z: number) => (z + lengthMm / 2) / scaleMm;
  let end = -lengthMm;
  let volumeMm3 = 0;
  for (const s of spans) {
    if (![s.zStartMm, s.zEndMm, s.rStartMm, s.rEndMm].every(Number.isFinite)
      || s.zStartMm !== end || s.zEndMm <= end || s.zEndMm > 0
      || s.rStartMm < 0 || s.rEndMm < 0 || Math.max(s.rStartMm, s.rEndMm) > diameterMm / 2) {
      throw new Error('Perfil 3D fuera del material o discontinuo.');
    }
    if (Math.max(s.rStartMm, s.rEndMm) > 0 && (Math.fround(x(end)) === Math.fround(x(s.zEndMm))
      || [s.rStartMm, s.rEndMm].some(r => r > 0 && Math.fround(r / scaleMm) === 0)
      || (s.rStartMm !== s.rEndMm && Math.fround(s.rStartMm / scaleMm) === Math.fround(s.rEndMm / scaleMm)))) {
      throw new Error('Rango de medidas demasiado grande para 3D; usá la vista 2D.');
    }
    volumeMm3 += Math.PI * (s.zEndMm - end) * (s.rStartMm ** 2 + s.rStartMm * s.rEndMm + s.rEndMm ** 2) / 3;
    end = s.zEndMm;
  }
  if (end !== 0) throw new Error('El perfil 3D debe cubrir toda la longitud del material.');
  const boundaries: { x: number; inner: number; outer: number; sign: number }[] = [];
  for (let i = 0; i <= spans.length; i++) {
    const left = i === 0 ? 0 : spans[i - 1].rEndMm;
    const right = i === spans.length ? 0 : spans[i].rStartMm;
    if (left === right) continue;
    const inner = Math.min(left, right) / scaleMm;
    const outer = Math.max(left, right) / scaleMm;
    if (Math.fround(inner) === Math.fround(outer)) throw new Error('Escalón demasiado pequeño para 3D; usá la vista 2D.');
    boundaries.push({ x: x(i === spans.length ? 0 : spans[i].zStartMm), inner, outer, sign: left > right ? 1 : -1 });
  }
  const sides = spans.filter(s => s.rStartMm > 0 || s.rEndMm > 0);
  let vertices = 0;
  let triangles = 0;
  for (const s of sides) {
    const apex = s.rStartMm === 0 || s.rEndMm === 0;
    vertices += apex ? 2 * segments + 1 : 2 * (segments + 1);
    triangles += (apex ? 1 : 2) * segments;
  }
  for (const b of boundaries) {
    vertices += b.inner === 0 ? segments + 2 : 2 * (segments + 1);
    triangles += (b.inner === 0 ? 1 : 2) * segments;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const indices = new Uint32Array(triangles * 3);
  let vertexCount = 0;
  let indexCount = 0;
  const cos = Array.from({ length: segments + 1 }, (_, i) => i === segments ? 1 : Math.cos(i * 2 * Math.PI / segments));
  const sin = Array.from({ length: segments + 1 }, (_, i) => i === segments ? 0 : Math.sin(i * 2 * Math.PI / segments));
  function vertex(axial: number, radius: number, angle: number, nx: number, nr: number) {
    const offset = vertexCount++ * 3;
    positions.set([axial, radius * cos[angle], radius * sin[angle]], offset);
    normals.set(nr === 0 ? [nx, 0, 0] : [nx, nr * cos[angle], nr * sin[angle]], offset);
  }
  function triangle(a: number, b: number, c: number, sign = 1) {
    // Validate the actual GPU coordinates, including subnormal radii and tiny annuli.
    const ax = positions[a * 3]; const ay = positions[a * 3 + 1]; const az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax; const uy = positions[b * 3 + 1] - ay; const uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax; const vy = positions[c * 3 + 1] - ay; const vz = positions[c * 3 + 2] - az;
    if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) {
      throw new Error('Rango de medidas demasiado grande para 3D; usá la vista 2D.');
    }
    indices.set(sign > 0 ? [a, b, c] : [a, c, b], indexCount);
    indexCount += 3;
  }
  for (const s of sides) {
    const base = vertexCount;
    const dz = s.zEndMm - s.zStartMm;
    const dr = s.rStartMm - s.rEndMm;
    const normalLength = Math.hypot(dz, dr);
    const nx = dr / normalLength;
    const nr = dz / normalLength;
    if (s.rStartMm === 0 || s.rEndMm === 0) {
      const startApex = s.rStartMm === 0;
      const ringX = x(startApex ? s.zEndMm : s.zStartMm);
      const radius = Math.max(s.rStartMm, s.rEndMm) / scaleMm;
      for (let i = 0; i <= segments; i++) vertex(ringX, radius, i, nx, nr);
      for (let i = 0; i < segments; i++) {
        const apex = vertexCount;
        vertex(x(startApex ? s.zStartMm : s.zEndMm), 0, i, nx, nr);
        // Each face owns its apex normal: the surface normal is undefined at the tip.
        const angle = (i + 0.5) * 2 * Math.PI / segments;
        normals.set([nx, nr * Math.cos(angle), nr * Math.sin(angle)], apex * 3);
        if (startApex) triangle(apex, base + i + 1, base + i);
        else triangle(base + i, base + i + 1, apex);
      }
    } else {
      for (let i = 0; i <= segments; i++) {
        vertex(x(s.zStartMm), s.rStartMm / scaleMm, i, nx, nr);
        vertex(x(s.zEndMm), s.rEndMm / scaleMm, i, nx, nr);
      }
      for (let i = 0; i < segments; i++) {
        const a = base + 2 * i;
        triangle(a, a + 3, a + 1);
        triangle(a, a + 2, a + 3);
      }
    }
  }
  for (const b of boundaries) {
    const base = vertexCount;
    if (b.inner === 0) {
      vertex(b.x, 0, 0, b.sign, 0);
      for (let i = 0; i <= segments; i++) vertex(b.x, b.outer, i, b.sign, 0);
      for (let i = 0; i < segments; i++) triangle(base, base + i + 1, base + i + 2, b.sign);
    } else {
      for (let i = 0; i <= segments; i++) {
        vertex(b.x, b.outer, i, b.sign, 0);
        vertex(b.x, b.inner, i, b.sign, 0);
      }
      for (let i = 0; i < segments; i++) {
        const a = base + 2 * i;
        triangle(a, a + 2, a + 1, b.sign);
        triangle(a + 2, a + 3, a + 1, b.sign);
      }
    }
  }
  return { positions, normals, indices, volumeMm3, scaleMm };
}

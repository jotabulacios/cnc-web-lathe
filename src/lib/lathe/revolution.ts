type Span = { zStartMm: number; zEndMm: number; radiusMm: number };
type Stock = { lengthMm: number; diameterMm: number };
export function toolPose(position: { rMm: number; zMm: number }, stock: Stock) {
  if (![position.rMm, position.zMm, stock.lengthMm, stock.diameterMm].every(Number.isFinite)
    || position.rMm < 0 || stock.lengthMm <= 0 || stock.diameterMm <= 0) throw new Error('Posición de herramienta inválida.');
  const scale = Math.max(stock.lengthMm, stock.diameterMm);
  const x = (position.zMm + stock.lengthMm / 2) / scale;
  const y = position.rMm / scale;
  return { x, y, z: 0, inMaterialFrame: Math.abs(x) <= 1.2 && y <= 1.2 };
}
export type RevolutionMesh = {
  positions: Float32Array; normals: Float32Array; indices: Uint32Array;
  volumeMm3: number; scaleMm: number;
  /** Section meshes only: indices from here on lie on the cut plane. */
  sectionIndexStart?: number;
};

/** Rendering projection only. X scene = physical Z, Y/Z scene = radial plane.
 * Hard shoulders, closed zero-radius gaps, no cutting semantics or interpolation.
 */
export function revolutionMesh(spans: readonly Span[], stock: Stock, segments = 48): RevolutionMesh {
  const { lengthMm, diameterMm } = stock;
  if (![lengthMm, diameterMm].every(v => Number.isFinite(v) && v > 0 && v <= 1e9)
    || !Number.isInteger(segments) || segments < 8 || segments > 48
    || spans.length < 1 || spans.length > 4096) throw new Error('Medidas o resolución 3D inválidas.');
  const scaleMm = Math.max(lengthMm, diameterMm);
  const x = (z: number) => (z + lengthMm / 2) / scaleMm;
  let end = -lengthMm;
  let volumeMm3 = 0;
  for (const span of spans) {
    if (![span.zStartMm, span.zEndMm, span.radiusMm].every(Number.isFinite)
      || span.zStartMm !== end || span.zEndMm <= end || span.zEndMm > 0
      || span.radiusMm < 0 || span.radiusMm > diameterMm / 2) throw new Error('Perfil 3D fuera del material o discontinuo.');
    if (span.radiusMm > 0 && (Math.fround(x(end)) === Math.fround(x(span.zEndMm))
      || Math.fround(span.radiusMm / scaleMm) === 0)) throw new Error('Rango de medidas demasiado grande para 3D; usá la vista 2D.');
    volumeMm3 += Math.PI * span.radiusMm ** 2 * (span.zEndMm - end);
    end = span.zEndMm;
  }
  if (end !== 0) throw new Error('El perfil 3D debe cubrir toda la longitud del material.');

  const boundaries: { x: number; inner: number; outer: number; sign: number }[] = [];
  for (let i = 0; i <= spans.length; i++) {
    const left = i === 0 ? 0 : spans[i - 1].radiusMm;
    const right = i === spans.length ? 0 : spans[i].radiusMm;
    if (left === right) continue;
    const inner = Math.min(left, right) / scaleMm;
    const outer = Math.max(left, right) / scaleMm;
    if (Math.fround(inner) === Math.fround(outer)) throw new Error('Escalón demasiado pequeño para 3D; usá la vista 2D.');
    boundaries.push({ x: x(i === spans.length ? 0 : spans[i].zStartMm), inner, outer, sign: left > right ? 1 : -1 });
  }
  // Count first: typed arrays keep the maximum profile's allocation bounded.
  const sides = spans.filter(s => s.radiusMm > 0);
  let vertices = sides.length * 2 * (segments + 1);
  let triangles = sides.length * 2 * segments;
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
  function vertex(axial: number, r: number, angle: number, nx: number) {
    const offset = vertexCount++ * 3;
    positions.set([axial, r * cos[angle], r * sin[angle]], offset);
    normals.set(nx ? [nx, 0, 0] : [0, cos[angle], sin[angle]], offset);
  }
  function triangle(a: number, b: number, c: number, sign = 1) {
    indices.set(sign > 0 ? [a, b, c] : [a, c, b], indexCount);
    indexCount += 3;
  }
  for (const span of sides) {
    const base = vertexCount;
    for (let i = 0; i <= segments; i++) {
      vertex(x(span.zStartMm), span.radiusMm / scaleMm, i, 0);
      vertex(x(span.zEndMm), span.radiusMm / scaleMm, i, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + 2 * i;
      triangle(a, a + 3, a + 1);
      triangle(a, a + 2, a + 3);
    }
  }
  for (const b of boundaries) {
    const base = vertexCount;
    if (b.inner === 0) {
      vertex(b.x, 0, 0, b.sign);
      for (let i = 0; i <= segments; i++) vertex(b.x, b.outer, i, b.sign);
      for (let i = 0; i < segments; i++) triangle(base, base + i + 1, base + i + 2, b.sign);
    } else {
      for (let i = 0; i <= segments; i++) {
        vertex(b.x, b.outer, i, b.sign);
        vertex(b.x, b.inner, i, b.sign);
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

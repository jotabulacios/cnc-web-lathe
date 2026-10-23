/** Orthographic half sizes that keep a bounding sphere visible at any aspect ratio. */
export function orthographicFrame(radius: number, aspect: number, margin = 1.12) {
  if (!(radius > 0) || !(aspect > 0) || !Number.isFinite(radius) || !Number.isFinite(aspect)) throw new Error('Encuadre inválido.');
  const halfHeight = radius * margin * Math.max(1, 1 / aspect);
  return { halfWidth: halfHeight * aspect, halfHeight };
}

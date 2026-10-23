import type { Setup } from './contract.ts';

/** Nominal chuck jaws (educational). Mirrors crates/cnc-core/src/collisions.rs:
 * a setup without `jaws` uses these defaults, with the grip limited to half a short stock. */
export type ChuckJaws = { gripLengthMm: number; jawHeightMm: number };
export const DEFAULT_JAW_GRIP_MM = 15;
export const DEFAULT_JAW_HEIGHT_MM = 12;

export function resolvedJaws(setup: Pick<Setup, 'stock' | 'jaws'>): ChuckJaws {
  return setup.jaws ?? { gripLengthMm: Math.min(DEFAULT_JAW_GRIP_MM, setup.stock.lengthMm / 2), jawHeightMm: DEFAULT_JAW_HEIGHT_MM };
}

/** Jaw zone in the Z/R plane: Z from the chuck face to `faceZ`, radius from the raw stock to `outerR`. */
export function jawZone(stock: { diameterMm: number; lengthMm: number }, jaws: ChuckJaws) {
  return { chuckZ: -stock.lengthMm, faceZ: -stock.lengthMm + jaws.gripLengthMm, innerR: stock.diameterMm / 2, outerR: stock.diameterMm / 2 + jaws.jawHeightMm };
}

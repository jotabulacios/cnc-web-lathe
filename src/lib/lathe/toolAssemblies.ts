import type { ToolId } from './contract.ts';

/** Own educational designs, in mm. No manufacturer/ISO dimensions are implied.
 * Local coordinates: axial Z, radial R, tangential Y. Reference corner = (0,0,0).
 * Dimensions describe the displayed assembly, never the point-cutting kernel. */
export type ToolPoint = readonly [z: number, r: number];
export type ToolPart = {
  kind: 'prism'; role: 'insert' | 'holder' | 'clamp';
  outline: readonly ToolPoint[]; thicknessMm: number; tangentialCenterMm: number;
} | {
  kind: 'axial-bar'; role: 'holder'; zStartMm: number; lengthMm: number;
  centerRadiusMm: number; diameterMm: number; tangentialCenterMm: number;
};
export type ToolAssembly = {
  id: ToolId; provenance: 'educational-design'; revision: 1;
  dimensions: string; parts: readonly ToolPart[];
};
/** What the views draw: the educational design or an ISO-nominal replacement. */
export type DisplayAssembly = { id: ToolId; provenance: string; dimensions: string; parts: readonly ToolPart[] };
export type AssemblyMap = Record<ToolId, DisplayAssembly>;
const prism = (role: 'insert' | 'holder' | 'clamp', outline: readonly ToolPoint[], thicknessMm: number, tangentialCenterMm: number): ToolPart =>
  ({ kind: 'prism', role, outline, thicknessMm, tangentialCenterMm });
const rectangle = (z0: number, r0: number, z1: number, r1: number): readonly ToolPoint[] => [[z0, r0], [z1, r0], [z1, r1], [z0, r1]];
function rhombus(edge: number, angle: number, mirrored = false): readonly ToolPoint[] {
  const a = (90 - angle) * Math.PI / 180;
  const z = edge * Math.cos(a); const r = edge * Math.sin(a);
  const sign = mirrored ? -1 : 1;
  return [[0, 0], [z, sign * r], [z, sign * (r + edge)], [0, sign * edge]];
}
const shank = (length: number): ToolPart => prism('holder', [[3, 5], [12, 5], [14, 14], [14, 5 + length], [2, 5 + length], [2, 14]], 12, -10);
const assembly = (id: ToolId, dimensions: string, parts: readonly ToolPart[]): ToolAssembly => ({ id, provenance: 'educational-design', revision: 1, dimensions, parts });
export const TOOL_ASSEMBLIES: Record<ToolId, ToolAssembly> = {
  'generic-od': assembly('generic-od', 'Porta 12 × 12 mm · largo 50 mm · rombo de lado 6 mm, punta 80°', [
    shank(50), prism('insert', rhombus(6, 80), 4, -2),
  ]),
  'roughing-od': assembly('roughing-od', 'Porta 12 × 12 mm · largo 60 mm · rombo de lado 8 mm, punta 80°', [
    shank(60), prism('insert', rhombus(8, 80), 4, -2),
  ]),
  'finishing-od': assembly('finishing-od', 'Porta 12 × 12 mm · largo 55 mm · rombo de lado 6 mm, punta 55°', [
    shank(55), prism('insert', rhombus(6, 55), 3, -1.5),
  ]),
  'grooving-od': assembly('grooving-od', 'Cuchilla 3 mm de ancho axial · largo radial 45 mm · abrazadera 10 mm', [
    prism('holder', rectangle(0, 6, 3, 51), 2, -3),
    prism('clamp', rectangle(-3.5, 32, 6.5, 65), 10, -8),
    prism('insert', rectangle(0, 0, 3, 12), 4, -2),
  ]),
  'facing-od': assembly('facing-od', 'Porta axial 12 × 12 mm · largo 60 mm · triángulo de punta 80°', [
    prism('holder', [[3, 4], [10, 3], [65, 3], [65, 15], [12, 15], [3, 10]], 12, -10),
    prism('insert', [[0, 0], [10 * Math.cos(Math.PI / 36), 10 * Math.sin(Math.PI / 36)], [10 * Math.sin(Math.PI / 36), 10 * Math.cos(Math.PI / 36)]], 4, -2),
  ]),
  'boring-id': assembly('boring-id', 'Barra Ø8 mm · largo 60 mm · eje a R−6 mm de la punta · rombo 55°', [
    { kind: 'axial-bar', role: 'holder', zStartMm: 4, lengthMm: 60, centerRadiusMm: -6, diameterMm: 8, tangentialCenterMm: -4 },
    prism('holder', [[0, -4], [4, -10], [12, -10], [12, -2], [4, -2]], 6, -5),
    prism('insert', rhombus(4, 55, true), 2, -1),
  ]),
};

/** Longitudinal silhouettes shared by SVG and dimensional bounds. */
export function partOutline(part: ToolPart): readonly ToolPoint[] {
  return part.kind === 'prism' ? part.outline : rectangle(part.zStartMm, part.centerRadiusMm - part.diameterMm / 2,
    part.zStartMm + part.lengthMm, part.centerRadiusMm + part.diameterMm / 2);
}
export function assemblyBounds(assembly: { parts: readonly ToolPart[] }) {
  const points = assembly.parts.flatMap(p => [...partOutline(p)]);
  return {
    minZ: Math.min(...points.map(p => p[0])), maxZ: Math.max(...points.map(p => p[0])),
    minR: Math.min(...points.map(p => p[1])), maxR: Math.max(...points.map(p => p[1])),
  };
}
export function assemblySvgPath(part: ToolPart) {
  return partOutline(part).map(([z, r], i) => `${i === 0 ? 'M' : 'L'}${z} ${-r}`).join(' ') + ' Z';
}

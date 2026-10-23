import type { CompileResult, Position } from './contract.ts';
import { assemblyBounds, TOOL_ASSEMBLIES, type AssemblyMap } from './toolAssemblies.ts';
import { getToolDefinition } from './tools.ts';
import type { ChuckJaws } from './chuck.ts';


export type Stock = { diameterMm: number; lengthMm: number };
export const VIEWPORT = { width: 960, height: 520, left: 78, top: 50, plotWidth: 830, plotHeight: 394 };

/** Coordinates are physical radius/Z millimeters. Diameter conversion is labels only. */
export function createLatheView(motions: CompileResult['motions'], position: Position, stock: Stock, toolBounds?: { minZ: number; maxZ: number; minR: number; maxR: number }, assemblies: AssemblyMap = TOOL_ASSEMBLIES, jaws?: ChuckJaws) {
  const radius = stock.diameterMm / 2;
  const reference = Math.max(stock.lengthMm, stock.diameterMm, 10);
  const chuckDepth = Math.max(stock.lengthMm * 0.15, stock.diameterMm * 0.24);
  let minZ = -stock.lengthMm - chuckDepth;
  let maxZ = Math.max(stock.lengthMm * 0.12, 8);
  let minR = -radius * 1.45 - reference * 0.03;
  let maxR = radius * 1.45 + reference * 0.03;
  const include = (point: Position) => {
    minZ = Math.min(minZ, point.zMm);
    maxZ = Math.max(maxZ, point.zMm);
    maxR = Math.max(maxR, point.rMm);
    minR = Math.min(minR, point.rMm);
  };
  const includeBody = (point: Position, bounds: NonNullable<typeof toolBounds>) => {
    include({ zMm: point.zMm + bounds.minZ, rMm: point.rMm + bounds.minR });
    include({ zMm: point.zMm + bounds.maxZ, rMm: point.rMm + bounds.maxR });
  };
  include(position);
  if (jaws) {
    // Nominal jaws stay in frame on both sides of the axis.
    include({ zMm: -stock.lengthMm, rMm: radius + jaws.jawHeightMm });
    minR = Math.min(minR, -radius - jaws.jawHeightMm);
  }
  for (const motion of motions) {
    include(motion.from);
    include(motion.to);
    if (toolBounds) {
      const bounds = assemblyBounds(assemblies[getToolDefinition(motion.toolId).id]);
      includeBody(motion.from, bounds);
      includeBody(motion.to, bounds);
    }
    if (motion.arc) {
      // Conservative circle extents: the swept arc is a subset, so it never clips.
      const { center, radiusMm } = motion.arc;
      include({ rMm: center.rMm + radiusMm, zMm: center.zMm });
      include({ rMm: Math.max(0, center.rMm - radiusMm), zMm: center.zMm });
      include({ rMm: center.rMm, zMm: center.zMm + radiusMm });
      include({ rMm: center.rMm, zMm: center.zMm - radiusMm });
    }
  }
  if (toolBounds) {
    include({ zMm: position.zMm + toolBounds.minZ, rMm: position.rMm + toolBounds.minR });
    include({ zMm: position.zMm + toolBounds.maxZ, rMm: position.rMm + toolBounds.maxR });
  }
  const largeRange = Math.max(maxZ - minZ, maxR - minR) > reference * 20;
  const pad = reference * 0.08;
  minZ -= pad; maxZ += pad; minR -= pad; maxR += pad;
  // Keep label padding; dimensional tool bodies are included in the physical bounds above.
  const toolHeadroom = 72;
  const toolRightroom = 48;
  const toolLeftroom = 6;
  const width = VIEWPORT.plotWidth - toolRightroom - toolLeftroom;
  const height = VIEWPORT.plotHeight - toolHeadroom;
  const scale = Math.min(width / (maxZ - minZ), height / (maxR - minR));
  const offsetX = VIEWPORT.left + toolLeftroom + (width - (maxZ - minZ) * scale) / 2;
  const offsetY = VIEWPORT.top + toolHeadroom + (height - (maxR - minR) * scale) / 2;
  const x = (z: number) => offsetX + (z - minZ) * scale;
  const y = (r: number) => offsetY + (maxR - r) * scale;
  return { x, y, scale, radius, chuckDepth, minZ, maxZ, minR, maxR, largeRange };
}

export function gridTicks(min: number, max: number, targetCount = 8): number[] {
  const rough = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let i = Math.ceil(min / step); i <= Math.floor(max / step) && ticks.length < 24; i++) {
    ticks.push(Number((i * step).toPrecision(12)));
  }
  return ticks;
}

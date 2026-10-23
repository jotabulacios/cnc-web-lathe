import type { RevolutionMesh } from './revolution.ts';
import { revolutionMeshV2 } from './revolutionV2.ts';
import { revolutionMeshV3 } from './revolutionV3.ts';
import type { AnnularSpan } from './profilePathV3.ts';

type Stock = { lengthMm: number; diameterMm: number };
type ExteriorSpans = Parameters<typeof revolutionMeshV2>[0];
export type MeshSpans = ExteriorSpans | readonly AnnularSpan[];

/** Full or longitudinal-section mesh for either profile version. The section is
 * presentation only: volumeMm3 is always the full physical volume, computed by
 * the full-mesh code of that profile version. */
export function profileMesh(spans: MeshSpans, stock: Stock, section: boolean): RevolutionMesh {
  if (spans.length > 0 && 'innerStartMm' in spans[0]) return revolutionMeshV3(spans as readonly AnnularSpan[], stock, 48, section);
  const exterior = spans as ExteriorSpans;
  if (!section) return revolutionMeshV2(exterior, stock);
  // A coarse v2 mesh applies the v2 validation and yields its exact volume.
  const { volumeMm3 } = revolutionMeshV2(exterior, stock, 8);
  const mesh = revolutionMeshV3(exterior.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm,
    innerStartMm: 0, innerEndMm: 0, outerStartMm: s.rStartMm, outerEndMm: s.rEndMm })), stock, 48, true);
  return { ...mesh, volumeMm3 };
}

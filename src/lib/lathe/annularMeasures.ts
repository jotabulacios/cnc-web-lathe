/** Read-only measurements of resolved material. Radii and Z are physical mm. */
export type MeasuredAnnularSpan = {
  zStartMm: number; zEndMm: number;
  innerStartMm: number; innerEndMm: number;
  outerStartMm: number; outerEndMm: number;
};

function valid(spans: readonly MeasuredAnnularSpan[]): boolean {
  if (spans.length < 1 || spans.length > 4096) return false;
  let end = spans[0].zStartMm;
  for (const span of spans) {
    if (![span.zStartMm, span.zEndMm, span.innerStartMm, span.innerEndMm, span.outerStartMm, span.outerEndMm]
      .every(value => Number.isFinite(value) && Math.abs(value) <= 1e9)
      || span.zStartMm !== end || span.zEndMm <= span.zStartMm
      || span.innerStartMm < 0 || span.innerEndMm < 0
      || span.innerStartMm > span.outerStartMm || span.innerEndMm > span.outerEndMm) return false;
    end = span.zEndMm;
  }
  return true;
}

/** Integrate pi*(outer²-inner²) without subtracting large frustum volumes.
 * No cached volume/header, interpreter or material-removal behavior is used. */
export function annularVolumeMm3(spans: readonly MeasuredAnnularSpan[]): number | null {
  if (!valid(spans)) return null;
  let sum = 0;
  let compensation = 0;
  for (const span of spans) {
    const a = span.outerStartMm; const b = span.outerEndMm;
    const c = span.innerStartMm; const d = span.innerEndMm;
    const squared = (a - c) * (a + c) + (b - d) * (b + d);
    const product = (a - c) * b + c * (b - d);
    const volume = (span.zEndMm - span.zStartMm) * ((squared + product) / 3) * Math.PI;
    const adjusted = volume - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  }
  return Number.isFinite(sum) ? sum : null;
}

function radius(span: MeasuredAnnularSpan, zMm: number, inner: boolean): number {
  const a = inner ? span.innerStartMm : span.outerStartMm;
  const b = inner ? span.innerEndMm : span.outerEndMm;
  if (zMm === span.zStartMm) return a;
  if (zMm === span.zEndMm) return b;
  const t = (zMm - span.zStartMm) / (span.zEndMm - span.zStartMm);
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), a * (1 - t) + b * t));
}

/** Shoulders use the band common to both neighbors: maximum inner and minimum
 * outer radius. Disjoint bands have no common section. Stock faces keep their
 * stored endpoint radii; a zero-thickness section is represented by equal radii. */
export function annularRadiiAt(spans: readonly MeasuredAnnularSpan[], zMm: number): { innerMm: number; outerMm: number } | null {
  if (!Number.isFinite(zMm) || Math.abs(zMm) > 1e9 || !valid(spans)) return null;
  let innerMm = 0;
  let outerMm = Infinity;
  for (const span of spans) {
    if (zMm < span.zStartMm || zMm > span.zEndMm) continue;
    innerMm = Math.max(innerMm, radius(span, zMm, true));
    outerMm = Math.min(outerMm, radius(span, zMm, false));
  }
  return Number.isFinite(outerMm) && innerMm <= outerMm ? { innerMm, outerMm } : null;
}

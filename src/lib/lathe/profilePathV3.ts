import { profilePathV2 } from './profilePathV2.ts';

export type AnnularSpan = {
  zStartMm: number; zEndMm: number;
  innerStartMm: number; innerEndMm: number;
  outerStartMm: number; outerEndMm: number;
};

/** Validate renderer input; no CNC or material-removal semantics. */
export function validateAnnularSpans(spans: readonly AnnularSpan[]): void {
  if (spans.length < 1 || spans.length > 4096) throw new Error('Cantidad de tramos anulares inválida.');
  let end = spans[0].zStartMm;
  for (const s of spans) {
    if (![s.zStartMm, s.zEndMm, s.innerStartMm, s.innerEndMm, s.outerStartMm, s.outerEndMm]
      .every(v => Number.isFinite(v) && Math.abs(v) <= 1e9)
      || s.zStartMm !== end || s.zEndMm <= s.zStartMm
      || s.innerStartMm < 0 || s.innerEndMm < 0
      || s.outerStartMm < s.innerStartMm || s.outerEndMm < s.innerEndMm) {
      throw new Error('Perfil anular inválido o discontinuo.');
    }
    end = s.zEndMm;
  }
}

/** Compound SVG path of outer contours and holes. Render with fillRule="evenodd"
 * on material, hatch and XOR removed-material paths. Z and radii stay physical. */
export function profilePathV3(spans: readonly AnnularSpan[], x: (z: number) => number, y: (r: number) => number): string {
  validateAnnularSpans(spans);
  const runs: AnnularSpan[][] = [];
  let run: AnnularSpan[] = [];
  for (const s of spans) {
    if (s.innerStartMm === s.outerStartMm && s.innerEndMm === s.outerEndMm) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(s);
  }
  if (run.length) runs.push(run);
  return runs.flatMap(parts => [
    profilePathV2(parts.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm, rStartMm: s.outerStartMm, rEndMm: s.outerEndMm })), x, y),
    profilePathV2(parts.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm, rStartMm: s.innerStartMm, rEndMm: s.innerEndMm })), x, y),
  ]).filter(Boolean).join(' ');
}

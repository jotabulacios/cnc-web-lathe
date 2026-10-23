import type { StockProfileV2 } from './profile.ts';
type Span = StockProfileV2['spans'][number];

/** Project already interpreted linear radii. A zero at one end is a tip,
 * whereas a whole zero-radius span separates independent material runs. */
export function profilePathV2(spans: readonly Span[], x: (z: number) => number, y: (r: number) => number): string {
  const runs: Span[][] = [];
  let run: Span[] = [];
  for (const span of spans) {
    if (span.rStartMm === 0 && span.rEndMm === 0) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(span);
  }
  if (run.length) runs.push(run);
  return runs.map(parts => {
    const upper = parts.flatMap(span => [[span.zStartMm, span.rStartMm], [span.zEndMm, span.rEndMm]]);
    const lower = parts.toReversed().flatMap(span => [[span.zEndMm, -span.rEndMm], [span.zStartMm, -span.rStartMm]]);
    return [...upper, ...lower].map(([z,r],i) => `${i === 0 ? 'M' : 'L'} ${x(z)} ${y(r)}`).join(' ') + ' Z';
  }).join(' ');
}

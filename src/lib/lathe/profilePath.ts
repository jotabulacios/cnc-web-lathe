type ProfileSpan = { zStartMm: number; zEndMm: number; radiusMm: number };

/** Project the engine's piecewise-constant exterior, splitting fully removed gaps.
 * No cutting or controller semantics belong in this projection.
 */
export function profilePath(spans: readonly ProfileSpan[], x: (z: number) => number, y: (radius: number) => number): string {
  const runs: ProfileSpan[][] = [];
  let run: ProfileSpan[] = [];
  for (const span of spans) {
    if (span.radiusMm === 0) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(span);
    }
  }
  if (run.length) runs.push(run);
  return runs.map(parts => {
    const upper = parts.flatMap(span => [[span.zStartMm, span.radiusMm], [span.zEndMm, span.radiusMm]]);
    const lower = parts.toReversed().flatMap(span => [[span.zEndMm, -span.radiusMm], [span.zStartMm, -span.radiusMm]]);
    return [...upper, ...lower].map(([z, r], index) => `${index === 0 ? 'M' : 'L'} ${x(z)} ${y(r)}`).join(' ') + ' Z';
  }).join(' ');
}

import type { Motion, Position } from './contract.ts';

/**
 * Presentation-only tool animation along one block's motions (lines and arcs, in order).
 *
 * Duration rule (didactic, not physical feed time): each motion takes
 * `length / speed`, with feed moves (G01/G02/G03) at FEED_MM_PER_S and rapids (G00) at
 * RAPID_MM_PER_S. The total is clamped to [MIN_MS, maxMs], where maxMs is MANUAL_MAX_MS
 * for manual steps and min(MANUAL_MAX_MS, 0.8 × automatic interval) during playback, so
 * the animation finishes before the next tick. Inside the block every motion keeps its
 * own relative speed (the time is scaled uniformly by the clamp).
 *
 * Offsets/nose approximation: motions are the physical contact path while views draw the
 * imaginary tip (`State.tipPosition`). The displayed point is the contact point plus an
 * offset interpolated linearly in time from (startTip − first.from) to
 * (endTip − last.to), so the animation starts exactly at the previous tip and ends exactly
 * at the block's resolved tip; in between it is an approximation when the offset changes.
 */
export const FEED_MM_PER_S = 60;
export const RAPID_MM_PER_S = 180;
export const MIN_MS = 150;
export const MANUAL_MAX_MS = 600;
export const PLAYBACK_INTERVAL_FRACTION = 0.8;

export type BlockAnimation = {
  durationMs: number;
  motions: Motion[];
  /** Cumulative normalized end time of each motion (last = 1). */
  ends: number[];
  startOffset: Position;
  endOffset: Position;
  startTip: Position;
  endTip: Position;
};

export function motionLength(motion: Motion): number {
  if (motion.arc) return motion.arc.radiusMm * motion.arc.sweepRad;
  return Math.hypot(motion.to.rMm - motion.from.rMm, motion.to.zMm - motion.from.zMm);
}

/** Point at fraction u∈[0,1] of one motion; exact on arcs (angle = atan2(r − rc, z − zc), clockwise decreases it). */
export function pointOnMotion(motion: Motion, u: number): Position {
  if (u <= 0) return motion.from;
  if (u >= 1) return motion.to;
  const arc = motion.arc;
  if (arc) {
    const start = Math.atan2(motion.from.rMm - arc.center.rMm, motion.from.zMm - arc.center.zMm);
    const angle = start + (arc.clockwise ? -1 : 1) * arc.sweepRad * u;
    return { zMm: arc.center.zMm + arc.radiusMm * Math.cos(angle), rMm: arc.center.rMm + arc.radiusMm * Math.sin(angle) };
  }
  return {
    rMm: motion.from.rMm + (motion.to.rMm - motion.from.rMm) * u,
    zMm: motion.from.zMm + (motion.to.zMm - motion.from.zMm) * u,
  };
}

const motionTimeMs = (motion: Motion) =>
  motionLength(motion) / (motion.kind === 'rapid' ? RAPID_MM_PER_S : FEED_MM_PER_S) * 1000;

/** Upper bound of one animation: manual steps vs automatic playback at `blocksPerSecond`. */
export function maxAnimationMs(blocksPerSecond: number | null): number {
  if (!blocksPerSecond || blocksPerSecond <= 0) return MANUAL_MAX_MS;
  return Math.min(MANUAL_MAX_MS, PLAYBACK_INTERVAL_FRACTION * 1000 / blocksPerSecond);
}

export function animationDurationMs(motions: Motion[], maxMs: number): number {
  const raw = motions.reduce((sum, motion) => sum + motionTimeMs(motion), 0);
  return Math.min(maxMs, Math.max(Math.min(MIN_MS, maxMs), raw));
}

const sub = (a: Position, b: Position) => ({ rMm: a.rMm - b.rMm, zMm: a.zMm - b.zMm });

/** Returns null when there is nothing to animate (no motions or zero-length path and no tip change). */
export function buildBlockAnimation(motions: Motion[], startTip: Position, endTip: Position, maxMs: number): BlockAnimation | null {
  if (motions.length === 0) return null;
  const times = motions.map(motionTimeMs);
  const total = times.reduce((a, b) => a + b, 0);
  if (total <= 0 && startTip.rMm === endTip.rMm && startTip.zMm === endTip.zMm) return null;
  let acc = 0;
  const ends = times.map(t => (acc += total > 0 ? t / total : 1 / motions.length));
  ends[ends.length - 1] = 1;
  return {
    durationMs: animationDurationMs(motions, maxMs),
    motions,
    ends,
    startOffset: sub(startTip, motions[0].from),
    endOffset: sub(endTip, motions[motions.length - 1].to),
    startTip,
    endTip,
  };
}

/** Displayed tip at normalized progress t∈[0,1]; t=0/t=1 return exactly the start/end tips. */
export function positionAtProgress(animation: BlockAnimation, t: number): Position {
  const { motions, ends, startOffset, endOffset } = animation;
  const p = Math.min(1, Math.max(0, t));
  if (p >= 1) return animation.endTip;
  if (p <= 0) return animation.startTip;
  let index = ends.findIndex(end => p <= end);
  if (index < 0) index = motions.length - 1;
  const begin = index === 0 ? 0 : ends[index - 1];
  const span = ends[index] - begin;
  const contact = pointOnMotion(motions[index], span > 0 ? (p - begin) / span : 1);
  const rMm = contact.rMm + startOffset.rMm + (endOffset.rMm - startOffset.rMm) * p;
  return { rMm: Math.max(0, rMm), zMm: contact.zMm + startOffset.zMm + (endOffset.zMm - startOffset.zMm) * p };
}

export function positionAtElapsed(animation: BlockAnimation, elapsedMs: number): Position {
  return positionAtProgress(animation, animation.durationMs > 0 ? elapsedMs / animation.durationMs : 1);
}

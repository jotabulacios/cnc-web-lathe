'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CompileResult, Position } from '../lib/lathe/contract';
import { buildBlockAnimation, positionAtElapsed, type BlockAnimation } from '../lib/lathe/motionAnimation';

/**
 * One forward step's presentation animation. `startedAt` is the first animation frame's
 * timestamp (performance.now() timebase); null until that frame, views then hold the start tip.
 */
export type ToolAnimation = BlockAnimation & { id: number; startedAt: number | null };
type PendingAnimation = BlockAnimation & { id: number };

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const reducedMotionSnapshot = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_QUERY).matches);

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

type Input = {
  result: CompileResult | null;
  revision: number;
  cursor: number;
  /** Resolved displayed tip of the current cursor (imaginary tip after offsets). */
  tip: Position;
  enabled: boolean;
  maxMs: number;
};

type Tracked = { result: CompileResult | null; revision: number; cursor: number; tip: Position; serial: number; animation: PendingAnimation | null };

/**
 * Presentation only: describes how to move the tool for a single forward step (cursor + 1 on
 * the same compiled result/revision). Rewind, reset, edits, a new result, the toggle off or
 * `prefers-reduced-motion` yield null, so views jump to the resolved tip. The descriptor is
 * dropped once its duration elapses, which commits the exact final position.
 */
export function useBlockAnimation({ result, revision, cursor, tip, enabled, maxMs }: Input): ToolAnimation | null {
  const reduced = usePrefersReducedMotion();
  const [tracked, setTracked] = useState<Tracked>({ result, revision, cursor, tip, serial: 0, animation: null });
  const [finished, setFinished] = useState(0);
  const [clock, setClock] = useState<{ id: number; startedAt: number } | null>(null);
  const changed = tracked.result !== result || tracked.revision !== revision || tracked.cursor !== cursor;
  if (changed) {
    // Adjusting state while rendering: React re-renders before committing, so no stale frame is painted.
    const forward = result !== null && tracked.result === result && tracked.revision === revision && cursor === tracked.cursor + 1;
    let animation: PendingAnimation | null = null;
    if (forward && enabled && !reduced) {
      const block = result.blocks[cursor - 1];
      const motions = (block?.motionIds ?? []).map(id => result.motions.find(m => m.id === id)).filter(m => m !== undefined);
      const built = buildBlockAnimation(motions, tracked.tip, tip, maxMs);
      if (built) animation = { ...built, id: tracked.serial + 1 };
    }
    setTracked({ result, revision, cursor, tip, serial: tracked.serial + 1, animation });
  }
  const pending = tracked.animation;
  useEffect(() => {
    if (!pending) return;
    const raf = requestAnimationFrame(now => setClock({ id: pending.id, startedAt: now }));
    return () => cancelAnimationFrame(raf);
  }, [pending]);
  const startedAt = pending && clock?.id === pending.id ? clock.startedAt : null;
  useEffect(() => {
    if (!pending || startedAt === null) return;
    const timer = window.setTimeout(() => setFinished(pending.id), Math.max(0, startedAt + pending.durationMs - performance.now()));
    return () => window.clearTimeout(timer);
  }, [pending, startedAt]);
  const animation = useMemo(() => pending && { ...pending, startedAt }, [pending, startedAt]);
  return !changed && animation && enabled && !reduced && finished !== animation.id ? animation : null;
}

/** Per-frame tip for one view; re-renders only the component that calls it. */
export function useAnimatedTip(animation: ToolAnimation | null, finalTip: Position): { position: Position; animating: boolean } {
  const [frame, setFrame] = useState<{ id: number; position: Position; done: boolean } | null>(null);
  useEffect(() => {
    if (animation?.startedAt == null) return;
    const startedAt = animation.startedAt;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const done = elapsed >= animation.durationMs;
      setFrame({ id: animation.id, position: done ? animation.endTip : positionAtElapsed(animation, Math.max(0, elapsed)), done });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation]);
  if (!animation) return { position: finalTip, animating: false };
  if (frame?.id === animation.id) return frame.done ? { position: finalTip, animating: false } : { position: frame.position, animating: true };
  return { position: animation.startTip, animating: true };
}

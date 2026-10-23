import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTimedLoader, LoadTimeoutError, type DeadlineSchedule } from '../src/lib/lathe/loader.ts';

function clock() {
  const timers: { callback: () => void; active: boolean }[] = [];
  const schedule: DeadlineSchedule = callback => {
    const timer = { callback, active: true };
    timers.push(timer);
    return () => { timer.active = false; };
  };
  return { timers, schedule, expire: () => { for (const timer of timers) if (timer.active) timer.callback(); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('simultaneous callers share one initialization and a successful result is cached', async () => {
  const timer = clock();
  const pending = deferred<string>();
  let calls = 0;
  const load = createTimedLoader(async (_signal, attempt) => { calls++; assert.equal(attempt, 0); return pending.promise; }, 20_000, timer.schedule);
  const first = load();
  assert.equal(load(), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  pending.resolve('ready');
  assert.equal(await first, 'ready');
  assert.equal(load(), first);
  assert.equal(timer.timers[0].active, false);
});

test('an initialization failure cancels its deadline and the next request retries', async () => {
  const timer = clock();
  const attempts: number[] = [];
  const load = createTimedLoader(async (_signal, attempt) => {
    attempts.push(attempt);
    if (attempt === 0) throw new Error('network');
    return 'second';
  }, 20_000, timer.schedule);
  await assert.rejects(load(), /network/);
  assert.equal(timer.timers[0].active, false);
  assert.equal(await load(), 'second');
  assert.deepEqual(attempts, [0, 1]);
});

test('timeout aborts the work with a stable error; a late old success cannot replace the new cache', async () => {
  const timer = clock();
  const old = deferred<string>();
  let signal: AbortSignal | null = null;
  const load = createTimedLoader(async (current, attempt) => {
    if (attempt === 0) { signal = current; return old.promise; }
    return 'new';
  }, 20_000, timer.schedule);
  const first = load();
  await Promise.resolve();
  timer.expire();
  await assert.rejects(first, LoadTimeoutError);
  assert.equal((signal as AbortSignal | null)?.aborted, true);
  const second = load();
  assert.equal(await second, 'new');
  old.resolve('old');
  await old.promise;
  assert.equal(load(), second);
  assert.equal(await load(), 'new');
});

test('an old late rejection cannot clear a retry in flight or become unhandled', async () => {
  const timer = clock();
  const old = deferred<string>();
  const next = deferred<string>();
  const load = createTimedLoader(async (_signal, attempt) => attempt === 0 ? old.promise : next.promise, 20_000, timer.schedule);
  const first = load();
  await Promise.resolve();
  timer.expire();
  await assert.rejects(first, LoadTimeoutError);
  const second = load();
  old.reject(new Error('late network failure'));
  await Promise.resolve();
  assert.equal(load(), second);
  next.resolve('ready');
  assert.equal(await second, 'ready');
  assert.throws(() => createTimedLoader(async () => '', 0), /Plazo/);
});

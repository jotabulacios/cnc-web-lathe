export class LoadTimeoutError extends Error {
  constructor() { super('La carga del motor tardó demasiado. Volvé a interpretar para reintentar.'); }
}
export type DeadlineSchedule = (callback: () => void, delayMs: number) => () => void;
const schedule: DeadlineSchedule = (callback, delayMs) => {
  const timer = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timer);
};

/** One shared initialization, bounded in time. Failed attempts never poison retries. */
export function createTimedLoader<T>(load: (signal: AbortSignal, attempt: number) => Promise<T>, timeoutMs: number,
  setDeadline: DeadlineSchedule = schedule): () => Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Plazo de carga inválido.');
  let cached: Promise<T> | undefined;
  let attempt = 0;
  return () => {
    if (cached) return cached;
    const controller = new AbortController();
    const number = attempt++;
    const work = Promise.resolve().then(() => load(controller.signal, number));
    let cancelDeadline = () => {};
    const deadline = new Promise<never>((_, reject) => {
      cancelDeadline = setDeadline(() => {
        // Reject first, so a fetch AbortError does not hide the timeout message.
        reject(new LoadTimeoutError());
        controller.abort();
      }, timeoutMs);
    });
    const flight: Promise<T> = Promise.race([work, deadline]).finally(() => cancelDeadline()).catch((error: unknown) => {
      if (cached === flight) cached = undefined;
      throw error;
    });
    cached = flight;
    return flight;
  };
}

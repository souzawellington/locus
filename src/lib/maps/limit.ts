export type Clock = {
  now(): number;
  wait(ms: number): Promise<void>;
};

export function systemClock(): Clock {
  return {
    now: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export function createRateLimiter(intervalMs: number, clock: Clock = systemClock()) {
  let nextAt = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return function limit<T>(run: () => Promise<T>): Promise<T> {
    const job = chain.then(async () => {
      const delay = Math.max(0, nextAt - clock.now());
      nextAt = Math.max(nextAt, clock.now()) + intervalMs;
      if (delay > 0) await clock.wait(delay);
      return run();
    });
    chain = job.then(
      () => undefined,
      () => undefined,
    );
    return job as Promise<T>;
  };
}

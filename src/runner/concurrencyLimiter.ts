/** Limitador de concorrência simples (sem dependência externa). */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length === 0 || active >= maxConcurrent) return;
    active++;
    const resolve = queue.shift()!;
    resolve();
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}

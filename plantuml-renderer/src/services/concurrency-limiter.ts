// A small counting semaphore with a bounded wait queue, so we never spawn
// unbounded Java processes. Requests beyond maxConcurrent queue up to
// queueLimit; beyond that they're rejected immediately (RENDER_OVERLOADED)
// rather than growing an unbounded queue in memory.
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly queueLimit: number
  ) {}

  get queued(): number {
    return this.waiters.length;
  }

  async acquire(): Promise<() => void> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiters.length >= this.queueLimit) {
        throw new Error("OVERLOADED");
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

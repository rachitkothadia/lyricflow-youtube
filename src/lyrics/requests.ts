/** Reject immediately on cancellation, including transports that ignore AbortSignal. */
export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Pace request starts, with at most two transfers; cancelled work never holds a slot. */
export class RequestScheduler {
  private queue: (() => void)[] = [];
  private active = 0;
  private next = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private interval = 1000) {}
  run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter((job) => job !== start);
        reject(signal.reason);
        this.pump();
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          reject(signal.reason);
          this.pump();
          return;
        }
        this.active++;
        this.next = Date.now() + this.interval;
        void abortable(Promise.resolve().then(work), signal)
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.pump();
          });
      };
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(start);
      this.pump();
    });
  }
  private pump() {
    clearTimeout(this.timer);
    if (this.active >= 2 || !this.queue.length) return;
    const wait = this.next - Date.now();
    if (wait > 0) {
      this.timer = setTimeout(() => this.pump(), wait);
      return;
    }
    this.queue.shift()!();
    this.pump();
  }
}

export type ConnectOperationPriority = "background" | "foreground";
export const readerConnectGlobalConcurrency = 2;

export interface ConnectScheduleOptions {
  readonly priority?: ConnectOperationPriority;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One admission queue shared by every Reader repository for a connection.
 * The connector has its own bounded queue; this keeps Reader below that
 * boundary while retaining FIFO order within each priority.
 */
export class ConnectOperationScheduler {
  readonly #queue: QueueEntry[] = [];
  #active = 0;

  constructor(private readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Connect scheduling requires at least one operation slot.");
    }
  }

  run<Value>(
    operation: () => Promise<Value>,
    options: ConnectScheduleOptions = {},
  ): Promise<Value> {
    if (options.signal?.aborted) {
      return Promise.reject(abortReason(options.signal));
    }
    return new Promise<Value>((resolve, reject) => {
      let started = false;
      const entry: QueueEntry = {
        priority: options.priority ?? "background",
        cancelled: false,
        start: () => {
          started = true;
          options.signal?.removeEventListener("abort", abort);
          this.#active += 1;
          void Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              this.#active -= 1;
              this.#drain();
            });
        },
      };
      const abort = (): void => {
        if (!started) {
          entry.cancelled = true;
          reject(abortReason(options.signal));
        }
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      this.#enqueue(entry);
      this.#drain();
    });
  }

  #enqueue(entry: QueueEntry): void {
    if (entry.priority === "foreground") {
      const firstBackground = this.#queue.findIndex(({ priority }) => priority === "background");
      if (firstBackground >= 0) {
        this.#queue.splice(firstBackground, 0, entry);
        return;
      }
    }
    this.#queue.push(entry);
  }

  #drain(): void {
    while (this.#active < this.concurrency) {
      const entry = this.#queue.shift();
      if (!entry) {
        return;
      }
      if (!entry.cancelled) {
        entry.start();
      }
    }
  }
}

interface QueueEntry {
  readonly priority: ConnectOperationPriority;
  readonly start: () => void;
  cancelled: boolean;
}

function abortReason(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was cancelled.", "AbortError");
}

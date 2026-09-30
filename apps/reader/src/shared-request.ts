import type { ReaderRequestOptions } from "@mdbase-reader/core";

interface Consumer<Value, Progress> {
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
  readonly progress?: (value: Progress) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
}
interface Pending<Value, Progress> {
  readonly controller: AbortController;
  readonly consumers: Set<Consumer<Value, Progress>>;
  latest?: Progress;
}

function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("Aborted", "AbortError");
}

/** Shares pending work only. Each caller owns its cancellation and progress subscription. */
export class SharedRequests<Key, Value, Progress = never> {
  readonly #pending = new Map<Key, Pending<Value, Progress>>();

  get(
    key: Key,
    options: ReaderRequestOptions,
    load: (signal: AbortSignal, publish: (value: Progress) => void) => Promise<Value>,
    progress?: (value: Progress) => void,
  ): Promise<Value> {
    if (options.signal?.aborted) {
      return Promise.reject(abortError(options.signal));
    }
    let pending = this.#pending.get(key);
    if (!pending) {
      pending = { controller: new AbortController(), consumers: new Set() };
      this.#pending.set(key, pending);
      const request = pending;
      // Register the first consumer before starting work, including synchronous progress.
      void Promise.resolve()
        .then(() => {
          request.controller.signal.throwIfAborted();
          return load(request.controller.signal, (value) => {
            request.latest = value;
            for (const consumer of request.consumers) {
              consumer.progress?.(value);
            }
          });
        })
        .then(
          (value) => this.#finish(key, request, (consumer) => consumer.resolve(value)),
          (reason: unknown) => this.#finish(key, request, (consumer) => consumer.reject(reason)),
        );
    }
    const request = pending;
    return new Promise((resolve, reject) => {
      const consumer: Consumer<Value, Progress> = {
        resolve,
        reject,
        ...(progress ? { progress } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        abort: () => {
          request.consumers.delete(consumer);
          options.signal?.removeEventListener("abort", consumer.abort);
          reject(abortError(options.signal));
          if (!request.consumers.size) {
            if (this.#pending.get(key) === request) {
              this.#pending.delete(key);
            }
            request.controller.abort();
          }
        },
      };
      request.consumers.add(consumer);
      options.signal?.addEventListener("abort", consumer.abort, { once: true });
      if (request.latest !== undefined) {
        progress?.(request.latest);
      }
    });
  }

  #finish(
    key: Key,
    request: Pending<Value, Progress>,
    settle: (consumer: Consumer<Value, Progress>) => void,
  ): void {
    if (this.#pending.get(key) === request) {
      this.#pending.delete(key);
    }
    for (const consumer of request.consumers) {
      consumer.signal?.removeEventListener("abort", consumer.abort);
      settle(consumer);
    }
    request.consumers.clear();
  }
}

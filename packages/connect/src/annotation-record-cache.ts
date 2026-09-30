import { outcomeValue, readWithOptions } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { RecordDocument } from "@mdbase-dev/connect";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

interface PendingRead {
  readonly controller: AbortController;
  readonly promise: Promise<RecordDocument>;
  consumers: number;
  settled: boolean;
}

/** Session-local, bounded reuse. Explicit refresh always revalidates external edits. */
export class AnnotationRecordCache {
  readonly #records = new Map<string, { document: RecordDocument; expires: number }>();
  readonly #pending = new Map<string, PendingRead>();

  constructor(
    private readonly client: ReaderConnectClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  put(document: RecordDocument): void {
    this.#invalidate(document.path);
    this.#records.set(document.path, { document, expires: this.now() + 15_000 });
    if (this.#records.size > 2_000) {
      const oldest = this.#records.keys().next().value;
      if (oldest !== undefined) {
        this.#records.delete(oldest);
      }
    }
  }

  delete(path: string): void {
    this.#pending.get(path)?.controller.abort();
    this.#invalidate(path);
    this.#records.delete(path);
  }

  #invalidate(path: string): void {
    // Existing consumers can finish, but new readers must not join a pre-mutation read.
    this.#pending.delete(path);
  }

  read(path: string, options: ReaderRequestOptions = {}, refresh = false): Promise<RecordDocument> {
    options.signal?.throwIfAborted();
    const cached = this.#records.get(path);
    if (!refresh && cached && cached.expires > this.now()) {
      return Promise.resolve(cached.document);
    }
    let pending = this.#pending.get(path);
    if (!pending) {
      pending = this.#startRead(path);
      this.#pending.set(path, pending);
    }
    const read = pending;
    read.consumers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (): boolean => {
        if (finished) {
          return false;
        }
        finished = true;
        options.signal?.removeEventListener("abort", abort);
        read.consumers -= 1;
        if (read.consumers === 0) {
          if (this.#pending.get(path) === read) {
            this.#pending.delete(path);
          }
          if (!read.settled) {
            read.controller.abort();
          }
        }
        return true;
      };
      const abort = (): void => {
        if (finish()) {
          const reason: unknown = options.signal?.reason;
          reject(reason instanceof Error ? reason : new DOMException("Aborted", "AbortError"));
        }
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      read.promise.then(
        (document) => {
          if (finish()) {
            resolve(document);
          }
        },
        (error: unknown) => {
          if (finish()) {
            reject(error instanceof Error ? error : new Error("Annotation read failed."));
          }
        },
      );
    });
  }

  #startRead(path: string): PendingRead {
    const controller = new AbortController();
    const read: PendingRead = {
      controller,
      consumers: 0,
      settled: false,
      promise: readWithOptions(
        this.client,
        { path, includeDocument: true },
        {
          signal: controller.signal,
        },
      ).then((outcome) => {
        read.settled = true;
        controller.signal.throwIfAborted();
        const document = outcomeValue(outcome, "read annotation");
        if (this.#pending.get(path) === read) {
          this.put(document);
          return document;
        }
        // A local save can overtake this read. Publish its newer revision, not the old response.
        return this.#records.get(path)?.document ?? document;
      }),
    };
    return read;
  }
}

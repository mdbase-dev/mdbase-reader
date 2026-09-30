import { transportTiming, type ReaderTransportTiming } from "./transport-timing.js";

import type { ConnectOutcome } from "@mdbase-dev/connect";

type Operation =
  | "read"
  | "list-views"
  | "execute-view"
  | "query"
  | "query-page"
  | "changes"
  | "describe"
  | "create"
  | "update"
  | "delete-preflight"
  | "delete";
type Result = "ok" | "timeout" | "cancelled" | "failed" | "thrown";
export interface ReaderTiming {
  readonly operation: Operation;
  readonly sequence: number;
  readonly startedMs: number;
  readonly elapsedMs: number;
  readonly concurrentOperations: number;
  readonly route: "direct" | "relay" | "remote" | "unknown";
  readonly result: Result;
}

/** Opt-in, memory-only bounded diagnostics. Never retain arguments, results, IDs or error messages. */
export class ReaderDiagnostics {
  #enabled = false;
  #generation = 0;
  #sequence = 0;
  #active = 0;
  #started = 0;
  #timings: ReaderTiming[] = [];
  #transport: ReaderTransportTiming[] = [];
  #observer: PerformanceObserver | null = null;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly capacity = 200,
  ) {}

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean, origins: readonly string[] = []): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#transport = [];
    this.#enabled = enabled;
    this.#generation += 1;
    this.#timings = [];
    this.#sequence = 0;
    this.#active = 0;
    this.#started = this.now();
    if (enabled && origins.length > 0 && typeof PerformanceObserver !== "undefined") {
      const generation = this.#generation;
      const allowed = origins.map((origin) => new URL(origin).origin);
      this.#observer = new PerformanceObserver((list) => {
        if (generation !== this.#generation) {
          return;
        }
        for (const entry of list.getEntries()) {
          const timing = transportTiming(
            entry as PerformanceResourceTiming,
            allowed,
            this.#started,
          );
          if (timing) {
            this.#transport.push(timing);
          }
        }
        this.#transport = this.#transport.slice(-this.capacity);
      });
      this.#observer.observe({ type: "resource", buffered: false });
    }
  }

  report(): {
    version: 1;
    operations: readonly ReaderTiming[];
    transport: readonly ReaderTransportTiming[];
  } {
    return {
      version: 1,
      operations: this.snapshot(),
      transport: this.#transport.map((entry) => ({ ...entry })),
    };
  }

  snapshot(): readonly ReaderTiming[] {
    return this.#timings.map((entry) => ({ ...entry }));
  }

  async *pages<Value>(
    route: () => string,
    pages: AsyncIterable<ConnectOutcome<Value>>,
  ): AsyncGenerator<ConnectOutcome<Value>> {
    const iterator = pages[Symbol.asyncIterator]();
    try {
      for (;;) {
        const step: { value?: IteratorResult<ConnectOutcome<Value>> } = {};
        await this.measure<Value | null>(
          "query-page",
          route,
          async () => {
            step.value = await iterator.next();
            return step.value.done ? { ok: true, value: null, diagnostics: [] } : step.value.value;
          },
          () => step.value?.done !== true,
        );
        if (!step.value || step.value.done) {
          return;
        }
        yield step.value.value;
      }
    } finally {
      await iterator.return?.();
    }
  }

  async measure<Value>(
    operation: Operation,
    route: () => string,
    run: () => Promise<ConnectOutcome<Value>>,
    record: () => boolean = () => true,
  ): Promise<ConnectOutcome<Value>> {
    if (!this.#enabled) {
      return run();
    }
    const generation = this.#generation;
    const start = this.now();
    const sequence = ++this.#sequence;
    const concurrentOperations = this.#active++;
    let result: Result = "thrown";
    try {
      const outcome = await run();
      result = outcome.ok
        ? "ok"
        : /timeout|deadline/u.test(outcome.problem.code)
          ? "timeout"
          : /cancel|abort|supersed/u.test(outcome.problem.code)
            ? "cancelled"
            : "failed";
      return outcome;
    } finally {
      if (generation === this.#generation) {
        this.#active -= 1;
        if (record()) {
          let currentRoute = "unknown";
          try {
            currentRoute = route();
          } catch {
            /* Diagnostics must not change an operation's outcome. */
          }
          this.#timings.push({
            operation,
            sequence,
            startedMs: Math.round(start - this.#started),
            elapsedMs: Math.round(this.now() - start),
            concurrentOperations,
            route:
              currentRoute === "direct" || currentRoute === "relay" || currentRoute === "remote"
                ? currentRoute
                : "unknown",
            result,
          });
          if (this.#timings.length > this.capacity) {
            this.#timings.shift();
          }
        }
      }
    }
  }
}

export const readerDiagnostics = new ReaderDiagnostics();

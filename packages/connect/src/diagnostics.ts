import { transportTiming, type ReaderTransportTiming } from "./transport-timing.js";

/** Opt-in, memory-only bounded diagnostics. Never retain arguments, results, IDs or error messages. */
export class ReaderDiagnostics {
  #enabled = false;
  #generation = 0;
  #started = 0;
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
    transport: readonly ReaderTransportTiming[];
  } {
    return {
      version: 1,
      transport: this.#transport.map((entry) => ({ ...entry })),
    };
  }
}

export const readerDiagnostics = new ReaderDiagnostics();

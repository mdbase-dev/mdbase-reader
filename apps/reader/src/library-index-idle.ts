/** No timeout on idle callbacks: reading/input may postpone indexing indefinitely. */
export class LibraryIndexIdle {
  private quietUntil = performance.now() + 3000;
  private readonly activity = (): void => {
    this.quietUntil = performance.now() + 1000;
  };
  private readonly events = ["pointerdown", "keydown", "wheel", "focusin"] as const;

  constructor() {
    for (const event of this.events) {
      document.addEventListener(event, this.activity, { capture: true, passive: true });
    }
  }

  dispose(): void {
    for (const event of this.events) {
      document.removeEventListener(event, this.activity, true);
    }
  }

  async wait(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let idle: number | undefined;
      const cancel = (): void => {
        clearTimeout(timer);
        if (idle !== undefined) {
          window.cancelIdleCallback(idle);
        }
        signal.removeEventListener("abort", aborted);
      };
      const aborted = (): void => {
        cancel();
        reject(new DOMException("Indexing cancelled.", "AbortError"));
      };
      const ready = (available: boolean): void => {
        const readingFrame = document.activeElement instanceof HTMLIFrameElement;
        if (
          available &&
          !document.hidden &&
          !readingFrame &&
          performance.now() >= this.quietUntil
        ) {
          cancel();
          resolve();
        } else {
          timer = setTimeout(schedule, 100);
        }
      };
      const schedule = (): void => {
        if ("requestIdleCallback" in window) {
          idle = window.requestIdleCallback((deadline) => ready(deadline.timeRemaining() >= 12));
        } else {
          timer = setTimeout(() => ready(true), 50);
        }
      };
      signal.addEventListener("abort", aborted, { once: true });
      schedule();
    });
  }
}

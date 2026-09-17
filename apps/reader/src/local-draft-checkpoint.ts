/** Recovery writes are off the keystroke path, but cannot starve during continuous typing. */
export const LOCAL_DRAFT_IDLE_MS = 500;
export const LOCAL_DRAFT_MAX_WAIT_MS = 3000;
const pending = new Set<LocalDraftCheckpoint>();

export class LocalDraftCheckpoint {
  private idle: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly write: () => void) {}

  schedule(): void {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.flush(), LOCAL_DRAFT_IDLE_MS);
    if (!pending.has(this)) {
      pending.add(this);
      this.deadline = setTimeout(() => this.flush(), LOCAL_DRAFT_MAX_WAIT_MS);
    }
  }

  flush(): void {
    if (!pending.has(this)) {
      return;
    }
    this.cancel();
    this.write();
  }

  cancel(): void {
    clearTimeout(this.idle);
    clearTimeout(this.deadline);
    this.idle = undefined;
    this.deadline = undefined;
    pending.delete(this);
  }
}

export function flushLocalDraftCheckpoints(): void {
  for (const checkpoint of [...pending]) {
    checkpoint.flush();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushLocalDraftCheckpoints);
  window.addEventListener("beforeunload", flushLocalDraftCheckpoints);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushLocalDraftCheckpoints();
    }
  });
}

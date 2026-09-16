import type { ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";

const restored = new WeakMap<ReadingSurface, ReaderLocator>();

export function restoredSessionLocation(surface: ReadingSurface): ReaderLocator | undefined {
  return restored.get(surface);
}

/** Small, device-memory-only locations survive renderer eviction; never cross revisions. */
export class SessionReadingLocations {
  private readonly positions = new Map<string, ReaderLocator>();
  private readonly subscriptions = new Map<string, () => void>();

  attach(sessionId: string, surface: ReadingSurface | null): void {
    this.subscriptions.get(sessionId)?.();
    this.subscriptions.delete(sessionId);
    if (!surface) {
      return;
    }
    const target = surface.document.document;
    const key = `${sessionId}:${target.fileId}:${target.revision}`;
    const previous = this.positions.get(key);
    if (previous) {
      restored.set(surface, previous);
    }
    this.subscriptions.set(
      sessionId,
      surface.locations.subscribe((location) => {
        this.positions.delete(key);
        this.positions.set(key, location);
        if (this.positions.size > 100) {
          const oldest = this.positions.keys().next().value;
          if (oldest) {
            this.positions.delete(oldest);
          }
        }
      }),
    );
  }

  clear(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.positions.clear();
  }
}

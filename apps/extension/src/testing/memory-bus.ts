import type { SdkLink } from "../sdk-rpc.js";

/** An in-memory BroadcastChannel: every endpoint but the sender gets a structured clone. */
export function memoryBus(): { endpoint(): SdkLink & { close(): void } } {
  const listeners = new Set<(message: unknown) => void>();
  return {
    endpoint() {
      const own = new Set<(message: unknown) => void>();
      return {
        post(message) {
          const copy = structuredClone(message);
          for (const listener of listeners) {
            if (!own.has(listener)) {
              queueMicrotask(() => listener(copy));
            }
          }
        },
        listen(listener) {
          listeners.add(listener);
          own.add(listener);
          return () => {
            listeners.delete(listener);
            own.delete(listener);
          };
        },
        close() {
          for (const listener of own) {
            listeners.delete(listener);
          }
          own.clear();
        },
      };
    },
  };
}

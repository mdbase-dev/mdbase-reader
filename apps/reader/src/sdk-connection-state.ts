import { useCallback, useSyncExternalStore } from "react";

import type { ReaderConnectionState } from "./ReaderHeader.js";
import type { Mdbase } from "@mdbase-reader/connect/native";

const noop = (): void => undefined;

type SdkSnapshot = ReturnType<Mdbase["getSnapshot"]>;

export function sdkSyncIncidents(
  snapshot: SdkSnapshot | null,
): NonNullable<SdkSnapshot["sync"]>["incidents"] {
  return snapshot?.sync?.incidents ?? [];
}

/** The device has no network or the sync service did not answer. A busy or
 * rate-limited service is not offline. */
export function sdkOffline(snapshot: SdkSnapshot | null): boolean {
  const sync = snapshot?.sync;
  return sync?.connection === "offline" || sync?.health === "unreachable";
}

/** The header's connection state from the SDK: never "connected" while it is
 * offline or keeping changes on this device until it can sync them. */
export function sdkConnectionState(
  snapshot: ReturnType<Mdbase["getSnapshot"]> | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  if (!snapshot) {
    return fallback;
  }
  const sync = snapshot.sync;
  const writes = sync?.writes;
  if (
    sdkSyncIncidents(snapshot).length ||
    writes?.rejected.length ||
    sync?.attention.some((reason) =>
      [
        "update_required",
        "account_suspended",
        "collection_migrating",
        "collection_not_yet_migrated",
      ].includes(reason),
    )
  ) {
    return "attention";
  }
  if (writes?.saveState === "saved_on_device") {
    return "saved_on_device";
  }
  if (sdkOffline(snapshot)) {
    return "offline";
  }
  if (writes?.pending.length || snapshot.saveWarning) {
    return "syncing";
  }
  return fallback;
}

export function useSdkConnectionState(
  mdbase: Mdbase | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = mdbase?.subscribe(listener) ?? noop;
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        unsubscribe();
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    [mdbase],
  );
  return useSyncExternalStore(subscribe, () =>
    !globalThis.navigator.onLine && mdbase
      ? "offline"
      : sdkConnectionState(mdbase?.getSnapshot() ?? null, fallback),
  );
}

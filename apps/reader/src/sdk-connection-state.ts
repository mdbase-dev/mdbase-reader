import { useCallback, useSyncExternalStore } from "react";

import type { ReaderConnectionState } from "./ReaderHeader.js";
import type { Mdbase } from "@mdbase-reader/connect/native";

const noop = (): void => undefined;

type SdkSnapshot = ReturnType<Mdbase["getSnapshot"]>;
type SyncIncidents = Extract<
  SdkSnapshot["phase"],
  { kind: "ready" }
>["connection"]["records"]["status"]["incidents"];

export function sdkSyncIncidents(snapshot: SdkSnapshot | null): SyncIncidents {
  return snapshot?.phase.kind === "ready" ? snapshot.phase.connection.records.status.incidents : [];
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
  if (
    sdkSyncIncidents(snapshot).length ||
    snapshot.writes?.rejected.length ||
    (snapshot.sync &&
      [
        "update_required",
        "account_suspended",
        "collection_migrating",
        "collection_not_yet_migrated",
      ].includes(snapshot.sync.kind))
  ) {
    return "attention";
  }
  if (snapshot.writes?.saveState === "saved_on_device") {
    return "saved_on_device";
  }
  if (snapshot.sync?.kind === "offline") {
    return "offline";
  }
  if (snapshot.writes?.pending.length || snapshot.saveWarning) {
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

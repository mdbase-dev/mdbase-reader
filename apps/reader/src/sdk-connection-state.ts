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
  return snapshot?.sync?.connection === "offline" || snapshot?.sync?.state === "offline";
}

/** The header's connection state from the SDK: never "connected" while it is
 * offline or keeping changes on this device until it can sync them. */
export function sdkConnectionState(
  snapshot: ReturnType<Mdbase["getSnapshot"]> | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  switch (snapshot?.sync?.state) {
    case "attention":
      return "attention";
    case "saved_on_device":
      return "saved_on_device";
    case "offline":
    case "reconnecting":
      return "offline";
    case "saving":
    case "catching_up":
      return "syncing";
    case "saved":
      return "connected";
    default:
      return fallback;
  }
}

export function useSdkConnectionState(
  mdbase: Mdbase | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  const subscribe = useCallback(
    (listener: () => void) => {
      return mdbase?.subscribe(listener) ?? noop;
    },
    [mdbase],
  );
  return useSyncExternalStore(subscribe, () =>
    sdkConnectionState(mdbase?.getSnapshot() ?? null, fallback),
  );
}

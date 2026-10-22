import { useCallback, useSyncExternalStore } from "react";

import type { ReaderConnectionState } from "./ReaderHeader.js";
import type { Mdbase } from "@mdbase-reader/connect/native";

const noop = (): void => undefined;

/** The header's connection state from the SDK: never "connected" while it is
 * offline or keeping changes on this device until it can sync them. */
export function sdkConnectionState(
  snapshot: ReturnType<Mdbase["getSnapshot"]> | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  if (snapshot?.writes?.saveState === "saved_on_device") {
    return "saved_on_device";
  }
  if (snapshot?.sync?.kind === "offline") {
    return "offline";
  }
  return fallback;
}

export function useSdkConnectionState(
  mdbase: Mdbase | null,
  fallback: ReaderConnectionState,
): ReaderConnectionState {
  const subscribe = useCallback(
    (listener: () => void) => mdbase?.subscribe(listener) ?? noop,
    [mdbase],
  );
  return useSyncExternalStore(subscribe, () =>
    sdkConnectionState(mdbase?.getSnapshot() ?? null, fallback),
  );
}

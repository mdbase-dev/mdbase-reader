import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { readerErrorMessage } from "./errors.js";

import type {
  ReaderDirectAccessController,
  ReaderDirectAccessSnapshot,
} from "@mdbase-reader/connect";

export interface ReaderDirectAccessState {
  readonly snapshot: ReaderDirectAccessSnapshot | null;
  readonly working: boolean;
  readonly problem: string | null;
  readonly request: () => void;
}

const unavailableSnapshot = (): null => null;
const unavailableSubscribe = (): (() => void) => () => undefined;

export function useDirectAccess(
  controller: ReaderDirectAccessController | undefined,
): ReaderDirectAccessState {
  const subscribe = useCallback(
    (listener: () => void) => controller?.subscribe(listener) ?? unavailableSubscribe(),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getSnapshot() ?? unavailableSnapshot(),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!controller || snapshot?.authority !== "connector" || snapshot.status !== "unavailable") {
      return;
    }
    void controller.check();
  }, [controller, snapshot?.authority, snapshot?.status]);

  const request = useCallback((): void => {
    if (!controller) {
      return;
    }
    setWorking(true);
    setProblem(null);
    // Keep this call synchronous with the click. Browsers only show the local-network
    // permission prompt when the request begins during a user gesture.
    const requested = controller.request();
    void requested
      .then((outcome) => {
        if (!outcome.ok) {
          setProblem(outcome.problem.message);
        }
      })
      .catch((reason: unknown) => {
        setProblem(readerErrorMessage(reason, "Reader could not request local network access."));
      })
      .finally(() => setWorking(false));
  }, [controller]);

  return { snapshot, working, problem, request };
}

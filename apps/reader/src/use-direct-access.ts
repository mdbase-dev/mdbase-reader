import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

type DirectAccessOutcome = Awaited<ReturnType<ReaderDirectAccessController["request"]>>;

export function directAccessProblemMessage(outcome: DirectAccessOutcome): string | null {
  if (!outcome.ok) {
    return outcome.problem.message;
  }
  switch (outcome.value) {
    case "available":
      return null;
    case "denied":
      return "Local network access is blocked. Allow it in your browser’s site settings, then retry.";
    case "unavailable":
      return "Reader could not reach the local mdbase connector. The relayed connection is still active.";
    case "permission_required":
      return "Local network access was not granted. Allow it when your browser asks, then retry.";
    case "disabled":
      return "Direct local access is not available for this connection.";
    case "checking":
      return null;
  }
}

export function claimDirectAccessCheck(
  checkedControllers: WeakSet<ReaderDirectAccessController>,
  controller: ReaderDirectAccessController | undefined,
  snapshot: ReaderDirectAccessSnapshot | null,
): controller is ReaderDirectAccessController {
  if (
    !controller ||
    checkedControllers.has(controller) ||
    snapshot?.authority !== "connector" ||
    snapshot.status !== "unavailable"
  ) {
    return false;
  }
  checkedControllers.add(controller);
  return true;
}

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
  const checkedControllers = useRef(new WeakSet<ReaderDirectAccessController>());

  useEffect(() => {
    if (!claimDirectAccessCheck(checkedControllers.current, controller, snapshot)) {
      return;
    }
    void controller.check().catch(() => undefined);
  }, [controller, snapshot]);

  const request = useCallback((): void => {
    if (!controller) {
      return;
    }
    checkedControllers.current.add(controller);
    setWorking(true);
    setProblem(null);
    // Keep this call synchronous with the click. Browsers only show the local-network
    // permission prompt when the request begins during a user gesture.
    const requested = controller.request();
    void requested
      .then((outcome) => {
        setProblem(directAccessProblemMessage(outcome));
      })
      .catch((reason: unknown) => {
        setProblem(readerErrorMessage(reason, "Reader could not request local network access."));
      })
      .finally(() => setWorking(false));
  }, [controller]);

  return { snapshot, working, problem, request };
}

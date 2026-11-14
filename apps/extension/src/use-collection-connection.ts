import { useEffect } from "react";

import { problemMessage } from "./capture-model.js";
import { useActionLock } from "./use-action-lock.js";
import { useConnect } from "./use-connect.js";

import type { ConnectionControls } from "./ConnectionPanel.js";

export interface CollectionConnection extends ConnectionControls {
  readonly problem: string | null;
  readonly retry: () => Promise<void>;
}

/**
 * Connect outside the capture panel (welcome and settings pages). The SDK shares sign-in; each
 * page owns its selection, and the worker follows the last ready page selection.
 */
export function useCollectionConnection(): CollectionConnection {
  const lock = useActionLock();
  const connection = useConnect(lock);
  const { open } = connection;
  const { release, setProblem } = lock;
  useEffect(() => {
    void open()
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(release);
  }, [open, release, setProblem]);
  return {
    snapshot: connection.snapshot,
    busy: lock.busy,
    problem: lock.problem,
    connect: connection.connect,
    retry: connection.retry,
    applySetup: connection.applySetup,
    select: connection.select,
  };
}

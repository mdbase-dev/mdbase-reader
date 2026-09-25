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
 * Connect outside the capture panel (welcome and settings pages). Grants and the remembered
 * collection live in extension storage, so the panel picks up what is chosen here.
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
    deviceCode: connection.deviceCode,
    busy: lock.busy,
    problem: lock.problem,
    connect: connection.connect,
    retry: connection.retry,
    applySetup: connection.applySetup,
    select: connection.select,
  };
}

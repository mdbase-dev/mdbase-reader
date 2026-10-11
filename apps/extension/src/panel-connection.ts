import { useEffect } from "react";

import { problemMessage } from "./capture-model.js";
import { refreshSavedUrlIndex } from "./saved-source-urls.js";
import { useActionLock, type ActionLock } from "./use-action-lock.js";
import { useConnect, type ConnectLink } from "./use-connect.js";

/** The side panel's one Connect session, shared by every tab the panel shows. */
export interface PanelConnection {
  readonly connection: ConnectLink;
  /** Connection actions (connect, retry, setup) and their problems. */
  readonly lock: ActionLock;
}

/** Starts Connect once when the panel opens; switching tabs keeps the same session. */
export function usePanelConnection(): PanelConnection {
  const lock = useActionLock();
  const connection = useConnect(lock);
  const { open } = connection;
  const { setProblem, release } = lock;
  useEffect(() => {
    void open()
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(release);
  }, [open, release, setProblem]);
  // The worker marks saved pages from this index; it cannot open the collection itself.
  const { extension, snapshot } = connection;
  useEffect(() => {
    const collection = snapshot.status === "ready" ? extension?.connectedCollection() : null;
    if (collection) {
      void refreshSavedUrlIndex(collection);
    }
  }, [extension, snapshot.status, snapshot.collectionId]);
  return { connection, lock };
}

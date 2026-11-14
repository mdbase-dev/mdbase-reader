import {
  nativeReaderCollection,
  type MdbaseApplicationConnection,
  type Mdbase,
  type MdbaseSnapshot,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { MemoryStorage, StorageCreateJournal } from "@mdbase-reader/platform";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

function readyEvidence(snapshot: MdbaseSnapshot): boolean {
  const { readiness } = snapshot;
  return (
    snapshot.status === "ready" &&
    !!snapshot.selectedCollectionId &&
    !readiness.checking &&
    readiness.problem === null &&
    readiness.assessment?.status === "ready" &&
    readiness.assessment.problem === null
  );
}

/** The SDK's current READY connection for the selected collection, or null. */
function readyConnection(
  sdk: Mdbase,
  snapshot: MdbaseSnapshot,
): MdbaseApplicationConnection | null {
  const selected = snapshot.selectedCollectionId;
  if (!selected || !readyEvidence(snapshot)) {
    return null;
  }
  const connection = sdk.connection(selected);
  return connection?.id === selected && connection.isCurrent() ? connection : null;
}

/** Reader's adapters belong to this context's selection and connection generation. */
export function extensionCollection(sdk: Mdbase): {
  connectedCollection(): ReaderConnectedCollection | null;
  dispose(): void;
} {
  /**
   * Captures' record creates, followed through while this context runs: one refused because
   * another device took its name is saved again at the next name. The extension keeps
   * nothing between sessions and shows no "needs your attention" notice: it has no place
   * to show one, and its storage is not the web app's. A capture that runs out of names,
   * or is refused for another reason after it was reported saved, is not kept.
   */
  const createStorage = new MemoryStorage();
  let opened: { readonly key: string; readonly collection: NativeReaderCollection } | null = null;
  return {
    connectedCollection() {
      const connection = readyConnection(sdk, sdk.getSnapshot());
      const key = connection ? `${connection.id}:${connection.generation}` : null;
      if (opened?.key !== key) {
        opened?.collection.dispose();
        opened =
          connection && key
            ? {
                key,
                collection: nativeReaderCollection(connection, {
                  creates: new StorageCreateJournal(createStorage, connection.scope.account),
                }),
              }
            : null;
      }
      return opened?.collection ?? null;
    },
    dispose() {
      opened?.collection.dispose();
      opened = null;
    },
  };
}

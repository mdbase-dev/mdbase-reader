import {
  nativeReaderCollection,
  type MdbaseApplicationConnection,
  type MdbaseApplicationEntry,
  type MdbaseApplicationSnapshot,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { MemoryStorage, StorageCreateJournal } from "@mdbase-reader/platform";

import type { SdkHostSource } from "./sdk-host.js";

/**
 * Captures' record creates, followed through while this host runs: one refused because
 * another device took its name is saved again at the next name. The extension keeps
 * nothing between sessions and shows no "needs your attention" notice: it has no place
 * to show one, and its storage is not the web app's. A capture that runs out of names,
 * or is refused for another reason after it was reported saved, is not kept.
 */
const createStorage = new MemoryStorage();

function readyEvidence(snapshot: MdbaseApplicationSnapshot): boolean {
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
export function readyConnection(
  sdk: MdbaseApplicationEntry,
  snapshot: MdbaseApplicationSnapshot,
): MdbaseApplicationConnection | null {
  const selected = snapshot.selectedCollectionId;
  if (!selected || !readyEvidence(snapshot)) {
    return null;
  }
  const connection = sdk.connection(selected);
  return connection?.id === selected && connection.isCurrent() ? connection : null;
}

/**
 * The host's application and Reader's adapters over its READY connection. The adapters are
 * keyed by connection scope: a later snapshot may hand back a new facade for the same
 * connection, which must not retire them.
 */
export function sdkHostSource(sdk: MdbaseApplicationEntry, hostId: string): SdkHostSource {
  const application = sdk.application();
  let opened: { readonly key: string; readonly collection: NativeReaderCollection } | null = null;
  return {
    application,
    currentCollection() {
      const connection = readyConnection(sdk, application.getSnapshot());
      const key = connection ? `${hostId}:${connection.id}:${connection.generation}` : null;
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
      return opened;
    },
  };
}

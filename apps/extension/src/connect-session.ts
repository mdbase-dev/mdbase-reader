import {
  ReaderPortableApplicationSession,
  type MdbaseAppManifest,
  type ReaderConnectSnapshot,
  type ReaderPortableSession,
} from "@mdbase-reader/connect";
import { ReaderNextApplicationSession, readerSdkBackend } from "@mdbase-reader/connect/next";

import { chromeStorageMirror } from "./chrome-storage.js";
import { lastCollectionKey } from "./collection-memory.js";
import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";

import type { KeyValueStorage } from "@mdbase-reader/platform";

export { rememberCollection, rememberedCollection } from "./collection-memory.js";

export interface ExtensionSession {
  readonly session: ReaderPortableSession;
  /** Reader's mutation journal, kept beside the grants so any extension context can recover it. */
  readonly journalStorage: KeyValueStorage;
}

export async function createExtensionSession(): Promise<ExtensionSession> {
  const storage = await chromeStorageMirror();
  const session: ReaderPortableSession =
    readerSdkBackend(null, environment.sdk) === "next"
      ? // The client key is a non-extractable WebCrypto key kept in IndexedDB.
        new ReaderNextApplicationSession({
          serverUrl: environment.connectUrl,
          app: { name: manifest.id, version: chrome.runtime.getManifest().version },
          storage,
        })
      : new ReaderPortableApplicationSession({
          serverUrl: environment.connectUrl,
          loopbackUrl: environment.loopbackUrl,
          manifest: manifest as MdbaseAppManifest,
          storage,
          // Interactive capture should not wait the SDK's ten-minute file-index default.
          timeouts: { watchStartMs: 60_000, fileIndexMs: 30_000, uploadMs: 120_000 },
        });
  return {
    session,
    journalStorage: {
      get: (key) => Promise.resolve(storage.getItem(key)),
      set: (key, value) => Promise.resolve(storage.setItem(key, value)),
      remove: (key) => Promise.resolve(storage.removeItem(key)),
    },
  };
}

/** Selects the collection chosen last time, if it is still authorized. */
export async function restoreCollection(
  session: ReaderPortableSession,
): Promise<ReaderConnectSnapshot> {
  const snapshot = session.getSnapshot();
  if (snapshot.status !== "unselected") {
    return snapshot;
  }
  const { [lastCollectionKey]: remembered } = await chrome.storage.local.get(lastCollectionKey);
  if (
    typeof remembered === "string" &&
    snapshot.connections.some((connection) => connection.collectionId === remembered)
  ) {
    session.select(remembered);
  }
  return session.getSnapshot();
}

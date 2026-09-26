import {
  ReaderPortableApplicationSession,
  type MdbaseAppManifest,
  type ReaderConnectSnapshot,
} from "@mdbase-reader/connect";

import { chromeStorageMirror } from "./chrome-storage.js";
import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";
import { localResetPending } from "./local-reset.js";

import type { KeyValueStorage } from "@mdbase-reader/platform";

const lastCollectionKey = "last-collection";

export interface ExtensionSession {
  readonly session: ReaderPortableApplicationSession;
  /** Reader's mutation journal, kept beside the grants so any extension context can recover it. */
  readonly journalStorage: KeyValueStorage;
}

export async function createExtensionSession(): Promise<ExtensionSession> {
  if (await localResetPending()) {
    throw new Error("Local cleanup is pending. Restart Reader to finish disconnecting.");
  }
  const storage = await chromeStorageMirror();
  const session = new ReaderPortableApplicationSession({
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
  session: ReaderPortableApplicationSession,
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

export function rememberCollection(collectionId: string): void {
  void chrome.storage.local.set({ [lastCollectionKey]: collectionId }).catch(() => undefined);
}

export async function rememberedCollection(): Promise<string | null> {
  const { [lastCollectionKey]: value } = await chrome.storage.local.get(lastCollectionKey);
  return typeof value === "string" ? value : null;
}

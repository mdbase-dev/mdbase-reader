import { createMdbase, type Mdbase } from "@mdbase-reader/connect/native";

import { chromeStorageMirror } from "./chrome-storage.js";
import { requestSdkHost } from "./offscreen-document.js";
import { extensionCollection } from "./sdk-collection.js";
import { extensionDeclaration, sessionBuild } from "./sdk-declaration.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { KeyValueStorage } from "@mdbase-reader/platform";

export { rememberCollection, rememberedCollection } from "./collection-memory.js";

/** One page's SDK entry and Reader repositories over its selected connection. */
export interface ExtensionSession {
  readonly application: Mdbase;
  connectedCollection(): ReaderConnectedCollection | null;
  /** Reader's capture journal, in extension storage so any page can recover it. */
  readonly journalStorage: KeyValueStorage;
  dispose(): void;
}

export async function createExtensionSession(): Promise<ExtensionSession> {
  const [storage] = await Promise.all([chromeStorageMirror(), requestSdkHost()]);
  const application = createMdbase(extensionDeclaration(), {
    session: { build: sessionBuild, host: false },
    followVisibility: true,
    signIn: {
      open: async (url) => {
        await chrome.tabs.create({ url });
      },
    },
  });
  // The SDK re-enters starting when its host disappears (entry.ts leaderLost).
  // Recreate Chrome's document; the SDK handles reconnecting its own session.
  const stopHostRequest = application.subscribe(() => {
    if (application.getSnapshot().status === "starting") {
      void requestSdkHost().catch(() => undefined);
    }
  });
  const collection = extensionCollection(application);
  return {
    application,
    connectedCollection: () => collection.connectedCollection(),
    journalStorage: {
      get: (key) => Promise.resolve(storage.getItem(key)),
      set: (key, value) => Promise.resolve(storage.setItem(key, value)),
      remove: (key) => Promise.resolve(storage.removeItem(key)),
    },
    dispose() {
      stopHostRequest();
      collection.dispose();
      void application.close();
    },
  };
}

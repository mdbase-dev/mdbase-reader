import { chromeStorageMirror } from "./chrome-storage.js";
import { requestSdkHost, sdkHostGone } from "./offscreen-document.js";
import { createSdkClient, type RemoteApplication, type SdkClient } from "./sdk-client.js";
import { broadcastLink } from "./sdk-rpc.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { KeyValueStorage } from "@mdbase-reader/platform";

export { rememberCollection, rememberedCollection } from "./collection-memory.js";

/**
 * One extension page's link to the SDK. The SDK itself runs once, in the offscreen host
 * (offscreen.ts); every page and the service worker share it, so none waits on another.
 */
export interface ExtensionSession {
  readonly application: RemoteApplication;
  /** Reader's repositories over the host's current READY connection, or null. */
  connectedCollection(): ReaderConnectedCollection | null;
  /** Reader's capture journal, in extension storage so any page can recover it. */
  readonly journalStorage: KeyValueStorage;
  dispose(): void;
}

type CreateClient = () => Promise<SdkClient>;

/** Sign-in opens mdbase in a tab, from the page whose action started it. */
const createClient: CreateClient = async () => {
  const link = broadcastLink();
  const client = await createSdkClient(link, {
    ensureHost: requestSdkHost,
    hostGone: sdkHostGone,
    openSignIn: (url) => void chrome.tabs.create({ url }).catch(() => undefined),
  });
  return {
    ...client,
    dispose() {
      client.dispose();
      link.close();
    },
  };
};

export async function createExtensionSession(
  create: CreateClient = createClient,
): Promise<ExtensionSession> {
  const [storage, client] = await Promise.all([chromeStorageMirror(), create()]);
  return {
    application: client.application,
    connectedCollection: () => client.connectedCollection(),
    journalStorage: {
      get: (key) => Promise.resolve(storage.getItem(key)),
      set: (key, value) => Promise.resolve(storage.setItem(key, value)),
      remove: (key) => Promise.resolve(storage.removeItem(key)),
    },
    dispose: () => client.dispose(),
  };
}

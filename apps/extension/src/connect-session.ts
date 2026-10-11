import {
  MdbaseConnect,
  nativeReaderCollection,
  type MdbaseApplication,
  type MdbaseApplicationConnection,
  type MdbaseApplicationDeclaration,
  type MdbaseApplicationEntry,
  type MdbaseApplicationSnapshot,
  type MdbaseConnectOptions,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";

import { chromeStorageMirror } from "./chrome-storage.js";
import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";

import type { KeyValueStorage } from "@mdbase-reader/platform";

export { rememberCollection, rememberedCollection } from "./collection-memory.js";

/**
 * One extension page's public SDK entry. The SDK runtime (its Worker, IndexedDB and
 * native replica) lives in this page, never in the MV3 service worker.
 */
export interface ExtensionSession {
  readonly sdk: MdbaseApplicationEntry;
  readonly application: MdbaseApplication;
  /** Reader's repositories over the current READY connection, or null. */
  connectedCollection(): NativeReaderCollection | null;
  /** Reader's capture journal, in extension storage so any page can recover it. */
  readonly journalStorage: KeyValueStorage;
  /** Retires the opened collection adapters; the SDK entry is never closed here. */
  dispose(): void;
}

/** This build's environment as the SDK names it; staging has no SDK environment. */
export function sdkEnvironment(): MdbaseApplicationDeclaration["environment"] {
  return environment.target === "lab" ? "lab" : "production";
}

/**
 * The extension's declaration: its own origin (the Web Store ID, or an unpacked build's ID
 * when that build declares it) and the extension manifest that lists that origin under
 * `installation_origins`.
 */
export function extensionDeclaration(
  runtimeId: string = chrome.runtime.id,
): MdbaseApplicationDeclaration {
  return {
    id: manifest.id,
    name: manifest.name,
    origin: `chrome-extension://${runtimeId}`,
    environment: sdkEnvironment(),
    installationKind: "app-runtime",
    manifest,
  };
}

/** Sign-in opens mdbase in a tab: a side panel cannot host the SDK's popup. */
export function extensionConnectOptions(): MdbaseConnectOptions {
  return {
    signIn: {
      open: async (url) => {
        await chrome.tabs.create({ url });
      },
    },
    followVisibility: true,
  };
}

type CreateEntry = (
  declaration: MdbaseApplicationDeclaration,
  options: MdbaseConnectOptions,
) => MdbaseApplicationEntry;

const createEntry: CreateEntry = (declaration, options) => new MdbaseConnect(declaration, options);

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

export async function createExtensionSession(
  create: CreateEntry = createEntry,
): Promise<ExtensionSession> {
  const storage = await chromeStorageMirror();
  const sdk = create(extensionDeclaration(), extensionConnectOptions());
  const application = sdk.application();
  // Keyed by scope: a later snapshot may hand back a new facade for the same
  // connection, which must not retire these adapters.
  let opened: { readonly key: string; readonly collection: NativeReaderCollection } | null = null;
  const retire = (): void => {
    opened?.collection.dispose();
    opened = null;
  };
  return {
    sdk,
    application,
    connectedCollection: () => {
      const connection = readyConnection(sdk, application.getSnapshot());
      const key = connection ? `${connection.id}:${connection.generation}` : null;
      if (opened?.key !== key) {
        retire();
        if (connection && key) {
          opened = { key, collection: nativeReaderCollection(connection) };
        }
      }
      return opened?.collection ?? null;
    },
    journalStorage: {
      get: (key) => Promise.resolve(storage.getItem(key)),
      set: (key, value) => Promise.resolve(storage.setItem(key, value)),
      remove: (key) => Promise.resolve(storage.removeItem(key)),
    },
    dispose: retire,
  };
}

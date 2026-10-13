import {
  MdbaseConnect,
  MdbaseMemorySelection,
  type ConnectOutcome,
  type JsonObject,
  type MdbaseAppManifest,
  type MdbaseAuthorizeOptions,
  type MdbaseConnectTimeouts,
} from "@mdbase-dev/connect";
import {
  IndexedDbApplicationIdentityStore,
  IndexedDbGrantKeyStore,
  type ApplicationIdentityStore,
  type GrantKeyStore,
} from "@mdbase-dev/connect/crypto";

import {
  connectedReaderCollection,
  type ReaderConnectedCollection,
  type ReaderConnectSnapshot,
  type ReaderSession,
} from "./application-session.js";

export interface ReaderPortableApplicationSessionOptions {
  readonly serverUrl: string;
  readonly loopbackUrl?: string;
  readonly manifest: MdbaseAppManifest;
  readonly storage: Storage;
  readonly keyStore?: GrantKeyStore;
  readonly identityStore?: ApplicationIdentityStore;
  readonly timeouts?: MdbaseConnectTimeouts;
}

/** What the extension needs from a portable session, whichever SDK backs it. */
export interface ReaderPortableSession extends Omit<ReaderSession, "authorize"> {
  clearSelection(): void;
  recoverPendingMutations(): Promise<readonly ConnectOutcome<unknown>[]>;
  authorize(
    target: "choose" | "selected",
    options?: MdbaseAuthorizeOptions,
  ): Promise<ConnectOutcome<unknown>>;
}

/** Extension/download-friendly Reader session using the SDK's device-code flow. */
export class ReaderPortableApplicationSession implements ReaderPortableSession {
  readonly #session;

  public constructor(options: ReaderPortableApplicationSessionOptions) {
    if (options.manifest.distribution !== "portable") {
      throw new Error("Reader's portable session requires a portable mdbase manifest.");
    }
    const connect = new MdbaseConnect<JsonObject>({
      serverUrl: options.serverUrl,
      manifest: options.manifest,
      storage: options.storage,
      keyStore: options.keyStore ?? new IndexedDbGrantKeyStore(),
      identityStore: options.identityStore ?? new IndexedDbApplicationIdentityStore(),
      directAccess: "auto",
      ...(options.loopbackUrl ? { loopbackUrl: options.loopbackUrl } : {}),
      ...(options.timeouts ? { timeouts: options.timeouts } : {}),
    });
    this.#session = connect.application({
      selection: new MdbaseMemorySelection(),
      autoSelect: "only",
    });
  }

  public start(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    return this.#session.start();
  }

  public destroy(): void {
    this.#session.destroy();
  }

  public getSnapshot(): ReaderConnectSnapshot {
    return this.#session.getSnapshot();
  }

  public subscribe(listener: () => void): () => void {
    return this.#session.subscribe(listener);
  }

  public select(selectedCollectionId: string): ConnectOutcome<unknown> {
    return this.#session.select(selectedCollectionId);
  }

  public clearSelection(): void {
    this.#session.clearSelection();
  }

  public async recoverPendingMutations(): Promise<readonly ConnectOutcome<unknown>[]> {
    const connection = this.#session.connection();
    if (!connection) {
      return [];
    }
    return Promise.all(
      connection.pendingMutations().map((mutation) => mutation.recover({ timeoutMs: 120_000 })),
    );
  }

  public authorize(
    target: "choose" | "selected",
    options: MdbaseAuthorizeOptions = {},
  ): Promise<ConnectOutcome<unknown>> {
    return this.#session.authorize(target, options);
  }

  public applyCollectionSetup(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    return this.#session.applyCollectionSetup();
  }

  public connectedCollection(expectedCollectionId?: string): ReaderConnectedCollection | null {
    const snapshot = this.#session.getSnapshot();
    const connection = snapshot.status === "ready" ? this.#session.connection() : null;
    return connectedReaderCollection(snapshot, connection, expectedCollectionId);
  }
}

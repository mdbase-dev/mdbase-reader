// mdbase-next backend: Reader's application session over a relay connection.
import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect/advanced";
import {
  connect,
  isMdbaseError,
  loadOrCreateClientKey,
  relayConnector,
  type ClientKey,
  type Connector,
  type MdbaseClient,
} from "@mdbase-dev/sdk";

import { nextReaderCollection } from "./collection.js";
import {
  ProposedHttpControlPlane,
  type ReaderNextControlPlane,
  type ReaderNextGrant,
} from "./control-plane.js";
import {
  asMdbaseError,
  isWaitingForDevice,
  nextProblem,
  waitingForDeviceMessage,
} from "./errors.js";

import type {
  ReaderConnectedCollection,
  ReaderConnectSnapshot,
  ReaderSession,
} from "../application-session.js";
import type { ReaderPortableSession } from "../portable-application-session.js";
import type {
  ConnectFailure,
  ConnectOutcome,
  MdbaseConnectionInfo,
  MdbaseEffectiveCapabilities,
} from "@mdbase-dev/connect";

export interface ReaderNextSessionOptions {
  readonly serverUrl: string;
  readonly app: { readonly name: string; readonly version: string };
  /** Defaults to the proposed HTTP control plane at `serverUrl`. */
  readonly controlPlane?: ReaderNextControlPlane;
  /** Name of this app's client key in IndexedDB (a non-extractable WebCrypto key). */
  readonly keyName?: string;
  /** Remembers the selected collection. */
  readonly storage?: Storage | null;
  /** Test seam: how to reach a collection. Defaults to the relay. */
  readonly connector?: (grant: ReaderNextGrant, key: ClientKey) => Connector;
  /** Test seam: the client key. Defaults to `loadOrCreateClientKey(keyName)`. */
  readonly clientKey?: () => Promise<ClientKey>;
}

const selectionKey = "mdbase-reader:next-selected";

type SessionProblem = Extract<ReaderConnectSnapshot, { status: "start_failed" }>["problem"];

const capabilities: MdbaseEffectiveCapabilities = {
  contractVersion: 2,
  values: {},
  requiredAvailable: true,
};

function connectionInfo(grant: ReaderNextGrant): MdbaseConnectionInfo {
  return {
    collectionId: grant.collectionId,
    displayName: grant.displayName,
    operations: [],
    scope: { contracts: [], access: "full_collection" },
    authority: { kind: "connector", durability: "computer" },
    route: "relay",
    directAccess: "disabled",
  };
}

/**
 * Reader's session on the mdbase-next SDK (opt-in). It produces the same snapshots as
 * the Connect session so the app's screens are unchanged. Waiting for a device of a
 * private collection shows as `blocked` with {@link waitingForDeviceMessage}.
 */
export class ReaderNextApplicationSession implements ReaderSession, ReaderPortableSession {
  readonly #options: ReaderNextSessionOptions;
  readonly #controlPlane: ReaderNextControlPlane;
  readonly #listeners = new Set<() => void>();
  #snapshot: ReaderConnectSnapshot = { status: "not_started", connections: [] };
  #grants: readonly ReaderNextGrant[] = [];
  #key: ClientKey | null = null;
  #db: MdbaseClient | null = null;
  #opened: { readonly db: MdbaseClient; readonly collection: ReaderConnectedCollection } | null =
    null;
  #abort: AbortController | null = null;
  #waiting = false;

  public constructor(options: ReaderNextSessionOptions) {
    this.#options = options;
    this.#controlPlane =
      options.controlPlane ??
      new ProposedHttpControlPlane({
        serverUrl: options.serverUrl,
        storage: options.storage ?? null,
      });
  }

  /** True while a private collection waits for one of the person's devices. */
  public get waitingForDevice(): boolean {
    return this.#waiting;
  }

  public async start(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    this.#set({ status: "starting", connections: this.#connections() });
    try {
      this.#grants = await this.#controlPlane.grants((await this.#clientKey()).publicKey);
    } catch (error) {
      return this.#failed(nextProblem(asMdbaseError(error)));
    }
    const stored = this.#options.storage?.getItem(selectionKey);
    const selected =
      this.#grants.find((grant) => grant.collectionId === stored) ??
      (this.#grants.length === 1 ? this.#grants[0] : undefined);
    if (!selected) {
      this.#set({ status: "unselected", connections: this.#connections() });
      return connectSuccess(this.#snapshot);
    }
    return this.#open(selected);
  }

  public destroy(): void {
    this.#close();
    this.#set({ status: "destroyed", connections: this.#connections() });
    this.#listeners.clear();
  }

  public getSnapshot(): ReaderConnectSnapshot {
    return this.#snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public select(selectedCollectionId: string): ConnectOutcome<unknown> {
    const grant = this.#grants.find((known) => known.collectionId === selectedCollectionId);
    if (!grant) {
      return connectFailure(
        connectProblem("unknown_collection", "Reader has no access to that collection."),
      );
    }
    this.#options.storage?.setItem(selectionKey, grant.collectionId);
    void this.#open(grant);
    return connectSuccess(null);
  }

  public async authorize(): Promise<ConnectOutcome<unknown>> {
    try {
      const grant = await this.#controlPlane.authorize((await this.#clientKey()).publicKey);
      if (!grant) {
        return connectFailure(
          connectProblem(
            "unsupported_operation",
            "Connecting a collection to Reader on mdbase-next needs the control plane’s consent flow, which is not available yet.",
          ),
        );
      }
      this.#grants = [...this.#grants.filter((g) => g.collectionId !== grant.collectionId), grant];
      return this.select(grant.collectionId);
    } catch (error) {
      return connectFailure(nextProblem(asMdbaseError(error)));
    }
  }

  public clearSelection(): void {
    this.#options.storage?.removeItem(selectionKey);
    this.#close();
    this.#set({ status: "unselected", connections: this.#connections() });
  }

  /** Nothing to recover: the SDK resubmits pending writes by mutation ID itself. */
  public recoverPendingMutations(): Promise<readonly ConnectOutcome<unknown>[]> {
    return Promise.resolve([]);
  }

  /** STUB: type-pack setup is not part of the replica client API yet. */
  public applyCollectionSetup(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    return Promise.resolve(connectSuccess(this.#snapshot));
  }

  public connectedCollection(expectedCollectionId?: string): ReaderConnectedCollection | null {
    const snapshot = this.#snapshot;
    const db = this.#db;
    if (
      snapshot.status !== "ready" ||
      !db ||
      (expectedCollectionId !== undefined && snapshot.collectionId !== expectedCollectionId)
    ) {
      return null;
    }
    if (this.#opened?.db !== db) {
      this.#opened = {
        db,
        collection: nextReaderCollection(db, this.#selectedGrant(snapshot.collectionId)),
      };
    }
    return this.#opened.collection;
  }

  async #open(grant: ReaderNextGrant): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    this.#close();
    const abort = new AbortController();
    this.#abort = abort;
    const context = this.#context(grant);
    this.#set({ status: "checking_setup", ...context });
    try {
      const key = await this.#clientKey();
      const db = await connect({
        app: { name: this.#options.app.name, version: this.#options.app.version },
        connector: this.#connector(grant, key),
        waitForDevice: true,
        signal: abort.signal,
        onWaiting: () => {
          this.#waiting = true;
          this.#set({ status: "blocked", ...context, problem: waitingProblem() });
        },
      });
      if (abort.signal.aborted) {
        db.close();
        return connectSuccess(this.#snapshot);
      }
      this.#waiting = false;
      this.#db = db;
      db.onLink((state, why) => this.#linkChanged(db, grant, state, why));
      this.#set({ status: "ready", verification: "verified", ...context });
      return connectSuccess(this.#snapshot);
    } catch (error) {
      if (abort.signal.aborted) {
        return connectSuccess(this.#snapshot);
      }
      this.#waiting = false;
      return this.#failed(nextProblem(asMdbaseError(error)));
    }
  }

  #linkChanged(
    db: MdbaseClient,
    grant: ReaderNextGrant,
    state: MdbaseClient["link"],
    why: MdbaseClient["linkProblem"],
  ): void {
    if (db !== this.#db) {
      return;
    }
    // A reconnecting link keeps the workspace open: reads wait and writes stay pending.
    this.#waiting = state === "reconnecting" && isWaitingForDevice(why);
    if (state === "closed" && why && isMdbaseError(why)) {
      const problem = nextProblem(why);
      this.#set({
        status: "blocked",
        ...this.#context(grant),
        problem: { code: problem.code, message: problem.message, recovery: problem.recovery },
      });
    }
  }

  #connector(grant: ReaderNextGrant, key: ClientKey): Connector {
    if (this.#options.connector) {
      return this.#options.connector(grant, key);
    }
    return relayConnector({
      collection: grant.collectionId,
      grant: grant.grant,
      staticKey: key,
      resolveRoute: () => this.#controlPlane.resolveRoute(grant.collectionId),
    });
  }

  async #clientKey(): Promise<ClientKey> {
    this.#key ??= await (this.#options.clientKey?.() ??
      loadOrCreateClientKey(this.#options.keyName ?? "mdbase-reader"));
    return this.#key;
  }

  #close(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#db?.close();
    this.#db = null;
    this.#waiting = false;
  }

  #selectedGrant(id: string): ReaderNextGrant {
    return (
      this.#grants.find((grant) => grant.collectionId === id) ?? {
        collectionId: id,
        grant: "",
        displayName: id,
      }
    );
  }

  #context(grant: ReaderNextGrant): {
    readonly collectionId: string;
    readonly info: MdbaseConnectionInfo;
    readonly capabilities: MdbaseEffectiveCapabilities;
    readonly connections: MdbaseConnectionInfo[];
  } {
    return {
      collectionId: grant.collectionId,
      info: connectionInfo(grant),
      capabilities,
      connections: this.#connections(),
    };
  }

  #connections(): MdbaseConnectionInfo[] {
    return this.#grants.map(connectionInfo);
  }

  #failed(problem: ConnectFailure["problem"]): ConnectOutcome<ReaderConnectSnapshot> {
    this.#set({
      status: "start_failed",
      problem: problem as SessionProblem,
      connections: this.#connections(),
    });
    return connectFailure(problem);
  }

  #set(snapshot: ReaderConnectSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

function waitingProblem(): { code: string; message: string; recovery: string } {
  return { code: "no_device_online", message: waitingForDeviceMessage, recovery: "retry" };
}

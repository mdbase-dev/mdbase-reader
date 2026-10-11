import {
  deserializeError,
  encodeArgs,
  isApplicationSnapshot,
  isHostMessage,
  isReadinessSnapshot,
  isValidSnapshotMessage,
  type ApplicationCommand,
  type CallTarget,
  type CollectionShape,
  type HostMessage,
  type SdkLink,
} from "./sdk-rpc.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { MdbaseApplication, MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

/** The parts of the SDK application the extension's pages use. */
export type RemoteApplication = Pick<
  MdbaseApplication,
  | "getSnapshot"
  | "subscribe"
  | "start"
  | "authorize"
  | "approve"
  | "select"
  | "chooseAnother"
  | "assess"
  | "configure"
>;

export interface SdkClient {
  readonly application: RemoteApplication;
  /** Reader's repositories over the host's current READY connection, or null. */
  connectedCollection(): ReaderConnectedCollection | null;
  /** False while the host is gone and being restarted; the snapshot is then the last one. */
  hostAvailable(): boolean;
  /** Settles this context's pending calls; the host and its SDK keep running. */
  dispose(): void;
}

export interface SdkClientOptions {
  /** Creates the offscreen host if it is not running. */
  ensureHost(): Promise<void>;
  /** Settles once the host `hostId` has gone (its lifetime lock was released). */
  hostGone(hostId: string): Promise<void>;
  /** Opens the SDK's sign-in page for an action this page started. */
  openSignIn(url: string): void;
}

type Callback = (...args: unknown[]) => void;

interface Inflight {
  /** The host the call was sent to; only it may answer. */
  readonly host: string;
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  readonly callbacks: readonly Callback[];
}

const helloIntervalMs = 250;
const startTimeoutMs = 20_000;

export const hostRestartedMessage =
  "mdbase restarted in the background. Check whether your last change was saved, then try again.";

/** One context's connection to the host: requests, snapshots and reconnection. */
class HostConnection {
  readonly #client = crypto.randomUUID();
  readonly #inflight = new Map<number, Inflight>();
  readonly #listeners = new Set<() => void>();
  readonly #pendingBodies = new Map<string, boolean>();
  readonly #unlisten: () => void;
  #nextId = 0;
  #host: string | null = null;
  #snapshot: MdbaseApplicationSnapshot | null = null;
  #shape: CollectionShape | null = null;
  #proxy: { readonly key: string; readonly collection: ReaderConnectedCollection } | null = null;
  #disposed = false;
  #connected: Promise<void> = Promise.resolve();
  #markConnected = (): void => undefined;

  constructor(
    private readonly link: SdkLink,
    private readonly options: SdkClientOptions,
  ) {
    this.#unlisten = link.listen((message) => {
      if (isHostMessage(message)) {
        this.#receive(message);
      }
    });
  }

  get snapshot(): MdbaseApplicationSnapshot {
    if (!this.#snapshot) {
      throw new Error("mdbase has not started yet.");
    }
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Starts the host and waits for its snapshot, asking until it answers. */
  connect(): Promise<void> {
    this.#connected = new Promise<void>((resolve, reject) => {
      let hello: ReturnType<typeof setInterval> | undefined;
      const timeout = setTimeout(() => {
        clearInterval(hello);
        reject(new Error("mdbase could not start in the background. Reload the extension."));
      }, startTimeoutMs);
      this.#markConnected = () => {
        clearInterval(hello);
        clearTimeout(timeout);
        resolve();
      };
      const sayHello = (): void => this.link.post({ kind: "hello", client: this.#client });
      this.options.ensureHost().then(
        () => {
          if (!this.#host) {
            sayHello();
            hello = setInterval(sayHello, helloIntervalMs);
          }
        },
        (reason: unknown) => {
          clearTimeout(timeout);
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        },
      );
    });
    return this.#connected;
  }

  async call(target: CallTarget, method: string, args: readonly unknown[]): Promise<unknown> {
    const callbacks: Callback[] = [];
    const signals: AbortSignal[] = [];
    // Throws for an already-aborted signal: that call never reaches the SDK.
    const encoded = encodeArgs(args, callbacks, signals);
    // A failed start is retried by the next call.
    await this.#connected.catch(() => this.connect());
    for (const signal of signals) {
      signal.throwIfAborted();
    }
    const host = this.#host;
    if (!host || this.#disposed) {
      throw new Error(hostRestartedMessage);
    }
    const id = ++this.#nextId;
    return new Promise<unknown>((resolve, reject) => {
      this.#inflight.set(id, { host, resolve, reject, callbacks });
      for (const signal of signals) {
        signal.addEventListener(
          "abort",
          () => this.link.post({ kind: "abort", client: this.#client, id }),
          { once: true },
        );
      }
      this.link.post({ kind: "call", client: this.#client, id, target, method, args: encoded });
    });
  }

  connectedCollection(): ReaderConnectedCollection | null {
    if (!this.#host || !this.#shape) {
      return null;
    }
    if (this.#proxy?.key !== this.#shape.key) {
      this.#proxy = { key: this.#shape.key, collection: this.#collectionProxy(this.#shape) };
    }
    return this.#proxy.collection;
  }

  hostAvailable(): boolean {
    return this.#host !== null;
  }

  dispose(): void {
    this.#disposed = true;
    for (const id of this.#inflight.keys()) {
      this.link.post({ kind: "abort", client: this.#client, id });
    }
    this.#fail(() => true);
    this.#unlisten();
    this.#listeners.clear();
  }

  /** Settles the matching calls with the restart outcome: they may or may not have run. */
  #fail(matches: (call: Inflight) => boolean): void {
    for (const [id, call] of [...this.#inflight]) {
      if (matches(call)) {
        this.#inflight.delete(id);
        call.reject(new Error(hostRestartedMessage));
      }
    }
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }

  #receive(message: HostMessage): void {
    if (message.kind === "snapshot") {
      this.#adopt(message);
      return;
    }
    if (message.client !== this.#client) {
      return;
    }
    if (message.kind === "result") {
      this.#settle(message);
    } else if (message.kind === "callback") {
      const call = this.#inflight.get(message.id);
      if (call?.host === message.host) {
        call.callbacks[message.slot]?.(...message.args);
      }
    } else if (message.host === this.#host) {
      this.options.openSignIn(message.url);
    }
  }

  #adopt(message: Extract<HostMessage, { kind: "snapshot" }>): void {
    const { snapshot } = message;
    if (this.#disposed || !isValidSnapshotMessage(message) || !isApplicationSnapshot(snapshot)) {
      return;
    }
    if (message.host !== this.#host) {
      // A new host replaced the old one: the old one will never answer.
      this.#fail((call) => call.host !== message.host);
      this.#host = message.host;
      this.#proxy = null;
      void this.options.hostGone(message.host).then(() => this.#hostGone(message.host));
    }
    this.#snapshot = snapshot;
    this.#shape = message.collection;
    this.#markConnected();
    this.#notify();
  }

  #settle(message: Extract<HostMessage, { kind: "result" }>): void {
    const call = this.#inflight.get(message.id);
    if (call?.host !== message.host) {
      return;
    }
    this.#inflight.delete(message.id);
    if (message.pending) {
      this.#pendingBodies.set(message.pending.requestId, message.pending.pending);
    }
    if (message.ok) {
      call.resolve(message.value);
    } else {
      call.reject(deserializeError(message.value));
    }
  }

  /** The host closed or crashed: fail what it never answered, then start a new one. */
  #hostGone(gone: string): void {
    if (this.#disposed) {
      return;
    }
    this.#fail((call) => call.host === gone);
    if (gone !== this.#host) {
      return;
    }
    this.#host = null;
    this.#shape = null;
    this.#proxy = null;
    this.#notify();
    void this.connect().catch(() => undefined);
  }

  #collectionProxy(current: CollectionShape): ReaderConnectedCollection {
    const collection: Record<string, unknown> = {
      collectionId: current.collectionId,
      collectionName: current.collectionName,
    };
    for (const [repository, methods] of Object.entries(current.repositories)) {
      const stub: Record<string, unknown> = {};
      for (const method of methods) {
        stub[method] = (...args: unknown[]) =>
          this.call({ key: current.key, repository }, method, args);
      }
      if (repository === "bodyRecovery") {
        // Synchronous in the port: the host's answer arrives with the failed write.
        // Unknown: let the SDK's recovery read the outcome back rather than assume none.
        stub["pending"] = (requestId: string) => this.#pendingBodies.get(requestId) ?? true;
      }
      if (methods.includes("invalidateRecord")) {
        stub["invalidateRecord"] = (path: string): void => {
          void this.call({ key: current.key, repository }, "invalidateRecord", [path]).catch(
            () => undefined,
          );
        };
      }
      collection[repository] = stub;
    }
    return collection as unknown as ReaderConnectedCollection;
  }
}

/**
 * Connects this context to the extension's one SDK host, starting it when needed and
 * reconnecting when Chrome closes it. Settles once the host has sent its first snapshot.
 */
export async function createSdkClient(
  link: SdkLink,
  options: SdkClientOptions,
): Promise<SdkClient> {
  const connection = new HostConnection(link, options);
  /** An application command whose answer must be an SDK snapshot. */
  const command =
    (method: ApplicationCommand) =>
    async (...args: unknown[]): Promise<MdbaseApplicationSnapshot> => {
      const answer = await connection.call({ app: true }, method, args);
      if (!isApplicationSnapshot(answer)) {
        throw new Error(`mdbase answered ${method} with something other than its state.`);
      }
      return answer;
    };
  const application: RemoteApplication = {
    getSnapshot: () => connection.snapshot,
    subscribe: (listener) => connection.subscribe(listener),
    start: command("start"),
    authorize: command("authorize"),
    approve: command("approve"),
    select: command("select"),
    chooseAnother: command("chooseAnother"),
    configure: command("configure"),
    async assess(...args) {
      const answer = await connection.call({ app: true }, "assess", args);
      if (!isReadinessSnapshot(answer)) {
        throw new Error("mdbase answered the readiness check with something else.");
      }
      return answer;
    },
  };
  await connection.connect();
  return {
    application,
    connectedCollection: () => connection.connectedCollection(),
    hostAvailable: () => connection.hostAvailable(),
    dispose: () => connection.dispose(),
  };
}

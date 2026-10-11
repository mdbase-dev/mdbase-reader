import {
  deserializeError,
  isHostMessage,
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
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  readonly callbacks: readonly Callback[];
}

const applicationMethods = [
  "start",
  "authorize",
  "approve",
  "select",
  "chooseAnother",
  "assess",
  "configure",
] as const;

const helloIntervalMs = 250;
const startTimeoutMs = 20_000;

export const hostRestartedMessage =
  "mdbase restarted in the background. Check whether your last change was saved, then try again.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Replaces functions with callback slots and an AbortSignal with a marker the host fills. */
function encodeArgs(
  args: readonly unknown[],
  callbacks: Callback[],
  onSignal: (signal: AbortSignal) => void,
): unknown[] {
  const slot = (fn: Callback): { callbackSlot: number } => {
    callbacks.push(fn);
    return { callbackSlot: callbacks.length - 1 };
  };
  return args.map((arg) => {
    if (typeof arg === "function") {
      return slot(arg as Callback);
    }
    if (!isPlainObject(arg)) {
      return arg;
    }
    const encoded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(arg)) {
      if (value instanceof AbortSignal) {
        onSignal(value);
        encoded["abortSignal"] = true;
      } else if (typeof value === "function") {
        encoded[key] = slot(value as Callback);
      } else if (value !== undefined) {
        encoded[key] = value;
      }
    }
    return encoded;
  });
}

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
    // A failed start is retried by the next call.
    await this.#connected.catch(() => this.connect());
    if (!this.#host) {
      throw new Error(hostRestartedMessage);
    }
    const id = ++this.#nextId;
    const callbacks: Callback[] = [];
    const signals: AbortSignal[] = [];
    const encoded = encodeArgs(args, callbacks, (signal) => signals.push(signal));
    return new Promise<unknown>((resolve, reject) => {
      this.#inflight.set(id, { resolve, reject, callbacks });
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

  dispose(): void {
    this.#disposed = true;
    this.#unlisten();
    this.#listeners.clear();
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
      this.#inflight.get(message.id)?.callbacks[message.slot]?.(...message.args);
    } else {
      this.options.openSignIn(message.url);
    }
  }

  #adopt(message: Extract<HostMessage, { kind: "snapshot" }>): void {
    if (message.host !== this.#host) {
      this.#host = message.host;
      void this.options.hostGone(message.host).then(() => this.#hostGone(message.host));
    }
    this.#snapshot = message.snapshot as MdbaseApplicationSnapshot;
    this.#shape = message.collection;
    this.#markConnected();
    this.#notify();
  }

  #settle(message: Extract<HostMessage, { kind: "result" }>): void {
    const call = this.#inflight.get(message.id);
    if (!call) {
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
    if (gone !== this.#host || this.#disposed) {
      return;
    }
    this.#host = null;
    this.#shape = null;
    this.#proxy = null;
    for (const call of this.#inflight.values()) {
      call.reject(new Error(hostRestartedMessage));
    }
    this.#inflight.clear();
    if (this.#snapshot) {
      this.#snapshot = { ...this.#snapshot, status: "starting" };
    }
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
        stub["pending"] = (requestId: string) => this.#pendingBodies.get(requestId) ?? false;
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
  const application = {
    getSnapshot: () => connection.snapshot,
    subscribe: (listener: () => void) => connection.subscribe(listener),
    ...Object.fromEntries(
      applicationMethods.map((method) => [
        method,
        (...args: unknown[]) => connection.call({ app: true }, method, args),
      ]),
    ),
  } as unknown as RemoteApplication;
  await connection.connect();
  return {
    application,
    connectedCollection: () => connection.connectedCollection(),
    dispose: () => connection.dispose(),
  };
}

import {
  failedRequestId,
  isCallbackSlot,
  isClientMessage,
  serializeError,
  type CallTarget,
  type ClientMessage,
  type CollectionShape,
  type HostMessage,
  type SdkLink,
} from "./sdk-rpc.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { MdbaseApplication } from "@mdbase-reader/connect/native";

export interface SdkHostSource {
  readonly application: MdbaseApplication;
  /** The adapters over the SDK's current READY connection, keyed by connection scope. */
  currentCollection(): {
    readonly key: string;
    readonly collection: ReaderConnectedCollection;
  } | null;
}

export interface SdkHost {
  /** The SDK's sign-in opener: the page whose action started sign-in opens the tab. */
  openSignIn(url: string): void;
  close(): void;
}

/** Methods whose results cannot cross the channel; callers fall back to their alternatives. */
const unsupported = new Set(["constructor", "listPages"]);
/** Calls a person starts; a sign-in they lead to opens from that person's page. */
const interactive = new Set([
  "authorize",
  "approve",
  "reauthorize",
  "chooseAnother",
  "select",
  "configure",
]);

function methodNames(value: object): string[] {
  const names = new Set<string>();
  for (let current: object | null = value; current && current !== Object.prototype;) {
    for (const name of Object.getOwnPropertyNames(current)) {
      const member = (value as Record<string, unknown>)[name];
      if (typeof member === "function" && !unsupported.has(name)) {
        names.add(name);
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return [...names];
}

function shapeOf(key: string, collection: ReaderConnectedCollection): CollectionShape {
  const repositories: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(collection as unknown as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null) {
      repositories[name] = methodNames(value);
    }
  }
  return {
    key,
    collectionId: collection.collectionId,
    collectionName: collection.collectionName,
    repositories,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function decodeArgs(
  message: Extract<ClientMessage, { kind: "call" }>,
  signal: AbortSignal,
  post: (message: HostMessage) => void,
): unknown[] {
  const callback =
    (slot: number) =>
    (...args: unknown[]): void =>
      post({ kind: "callback", client: message.client, id: message.id, slot, args });
  return message.args.map((arg) => {
    if (isCallbackSlot(arg)) {
      return callback(arg.callbackSlot);
    }
    if (!isPlainObject(arg)) {
      return arg;
    }
    const decoded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(arg)) {
      if (key === "abortSignal") {
        decoded["signal"] = signal;
      } else {
        decoded[key] = isCallbackSlot(value) ? callback(value.callbackSlot) : value;
      }
    }
    return decoded;
  });
}

type Method = (...args: unknown[]) => unknown;

function boundMethod(owner: unknown, method: string): Method | null {
  if (typeof owner !== "object" || owner === null) {
    return null;
  }
  const member = (owner as Record<string, unknown>)[method];
  return typeof member === "function" ? (member as Method).bind(owner) : null;
}

function resolveTarget(source: SdkHostSource, target: CallTarget, method: string): Method {
  if ("app" in target) {
    const bound = boundMethod(source.application, method);
    if (!bound) {
      throw new Error(`mdbase has no ${method}.`);
    }
    return bound;
  }
  const current = source.currentCollection();
  if (current?.key !== target.key) {
    throw Object.assign(new Error("The collection connection changed. Try again."), {
      code: "connection_retired",
    });
  }
  const repository = (current.collection as unknown as Record<string, unknown>)[target.repository];
  const bound = boundMethod(repository, method);
  if (!bound) {
    throw new Error(`The collection has no ${target.repository}.${method}.`);
  }
  return bound;
}

/** Serves the page-owned SDK entry to every extension context over `link`. */
export function serveSdk(link: SdkLink, source: SdkHostSource, hostId: string): SdkHost {
  const { application } = source;
  const controllers = new Map<string, AbortController>();
  let lastClient: string | null = null;
  const post = (message: HostMessage): void => link.post(message);

  const announce = (): void => {
    const current = source.currentCollection();
    post({
      kind: "snapshot",
      host: hostId,
      snapshot: application.getSnapshot(),
      collection: current ? shapeOf(current.key, current.collection) : null,
    });
  };

  const call = async (message: Extract<ClientMessage, { kind: "call" }>): Promise<void> => {
    const controllerKey = `${message.client}:${String(message.id)}`;
    const controller = new AbortController();
    controllers.set(controllerKey, controller);
    if ("app" in message.target && interactive.has(message.method)) {
      lastClient = message.client;
    }
    const reply = { kind: "result", host: hostId, client: message.client, id: message.id } as const;
    try {
      const target = resolveTarget(source, message.target, message.method);
      const value: unknown = await target(...decodeArgs(message, controller.signal, post));
      try {
        post({ ...reply, ok: true, value });
      } catch (reason) {
        post({ ...reply, ok: false, value: serializeError(reason) });
      }
    } catch (reason) {
      const requestId = failedRequestId(reason);
      const recovery = source.currentCollection()?.collection.bodyRecovery;
      post({
        ...reply,
        ok: false,
        value: serializeError(reason),
        ...(requestId && recovery
          ? { pending: { requestId, pending: recovery.pending(requestId) } }
          : {}),
      });
    } finally {
      controllers.delete(controllerKey);
    }
  };

  const unlisten = link.listen((message) => {
    if (!isClientMessage(message)) {
      return;
    }
    switch (message.kind) {
      case "hello":
        announce();
        return;
      case "abort":
        controllers.get(`${message.client}:${String(message.id)}`)?.abort();
        return;
      case "call":
        void call(message);
    }
  });
  const unsubscribe = application.subscribe(announce);
  announce();
  return {
    openSignIn(url) {
      if (lastClient) {
        post({ kind: "open", client: lastClient, url });
      }
    },
    close() {
      unsubscribe();
      unlisten();
      for (const controller of controllers.values()) {
        controller.abort();
      }
    },
  };
}

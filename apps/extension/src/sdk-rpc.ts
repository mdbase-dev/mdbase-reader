/**
 * The extension's SDK channel. One offscreen document owns the SDK (sdk-host.ts); the side
 * panel, settings and welcome pages and the service worker reach it through sdk-client.ts.
 *
 * The channel is a same-origin BroadcastChannel rather than chrome.runtime messaging:
 * runtime messages are JSON, while captures carry bytes (structured clone keeps them).
 */
export interface SdkLink {
  post(message: unknown): void;
  listen(listener: (message: unknown) => void): () => void;
}

export const sdkChannelName = "mdbase-reader-sdk";
/** Held by the host for its lifetime; clients learn it has gone when they can take it. */
export const sdkHostLockName = "mdbase-reader-sdk-host";

export function broadcastLink(name = sdkChannelName): SdkLink & { close(): void } {
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    listen(listener) {
      const handle = (event: MessageEvent): void => listener(event.data);
      channel.addEventListener("message", handle);
      return () => channel.removeEventListener("message", handle);
    },
    close: () => channel.close(),
  };
}

/** Which repository methods the host's collection has, so optional ones stay absent. */
export interface CollectionShape {
  readonly key: string;
  readonly collectionId: string;
  readonly collectionName: string;
  readonly repositories: Readonly<Record<string, readonly string[]>>;
}

export type CallTarget =
  { readonly app: true } | { readonly key: string; readonly repository: string };

/** A function argument, replaced by a slot the host calls back through. */
export interface CallbackSlot {
  readonly callbackSlot: number;
}

export type ClientMessage =
  | { readonly kind: "hello"; readonly client: string }
  | {
      readonly kind: "call";
      readonly client: string;
      readonly id: number;
      readonly target: CallTarget;
      readonly method: string;
      readonly args: readonly unknown[];
    }
  | { readonly kind: "abort"; readonly client: string; readonly id: number };

export type HostMessage =
  | {
      readonly kind: "snapshot";
      readonly host: string;
      readonly snapshot: unknown;
      readonly collection: CollectionShape | null;
    }
  | {
      readonly kind: "result";
      readonly host: string;
      readonly client: string;
      readonly id: number;
      readonly ok: boolean;
      readonly value: unknown;
      /** For a failed body write: whether its request is still durably pending. */
      readonly pending?: { readonly requestId: string; readonly pending: boolean };
    }
  | {
      readonly kind: "callback";
      readonly client: string;
      readonly id: number;
      readonly slot: number;
      readonly args: readonly unknown[];
    }
  | { readonly kind: "open"; readonly client: string; readonly url: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isHostMessage(value: unknown): value is HostMessage {
  return (
    isObject(value) && ["snapshot", "result", "callback", "open"].includes(String(value["kind"]))
  );
}

export function isClientMessage(value: unknown): value is ClientMessage {
  return isObject(value) && ["hello", "call", "abort"].includes(String(value["kind"]));
}

export function isCallbackSlot(value: unknown): value is CallbackSlot {
  return isObject(value) && typeof value["callbackSlot"] === "number";
}

/** Errors cross as plain data: name, message and the SDK's own fields (code, reason, …). */
export interface SerializedError {
  readonly serializedError: true;
  readonly name: string;
  readonly message: string;
  readonly fields: Record<string, unknown>;
  readonly cause?: SerializedError;
}

function cloneable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

export function serializeError(reason: unknown, depth = 0): SerializedError {
  if (!(reason instanceof Error)) {
    return { serializedError: true, name: "Error", message: String(reason), fields: {} };
  }
  const fields: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(reason)) {
    if (key === "stack" || key === "message" || key === "cause" || key === "name") {
      continue;
    }
    const value = (reason as unknown as Record<string, unknown>)[key];
    if (typeof value !== "function" && cloneable(value)) {
      fields[key] = value;
    }
  }
  return {
    serializedError: true,
    name: reason.name,
    message: reason.message,
    fields,
    ...(reason.cause !== undefined && depth < 3
      ? { cause: serializeError(reason.cause, depth + 1) }
      : {}),
  };
}

export function deserializeError(value: unknown): Error {
  if (!isObject(value) || value["serializedError"] !== true) {
    return new Error(String(value));
  }
  const data = value as unknown as SerializedError;
  const error = new Error(data.message, data.cause ? { cause: deserializeError(data.cause) } : {});
  Object.assign(error, data.fields);
  Object.defineProperty(error, "name", { value: data.name, configurable: true, writable: true });
  return error;
}

/** The request ID an SDK write failure names, for body-write recovery. */
export function failedRequestId(reason: unknown): string | null {
  for (let current = reason, depth = 0; isObject(current) && depth < 4; depth++) {
    const id = current["requestId"];
    if (typeof id === "string" && id) {
      return id;
    }
    current = current["cause"];
  }
  return null;
}

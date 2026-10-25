import type { MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

type MdbaseApplicationReadinessSnapshot = MdbaseApplicationSnapshot["readiness"];

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

/** The application commands the extension sends; nothing else reaches the SDK. */
export const applicationCommands = [
  "start",
  "authorize",
  "approve",
  "select",
  "chooseAnother",
  "assess",
  "configure",
] as const;
export type ApplicationCommand = (typeof applicationCommands)[number];

/**
 * Reader's public repository commands (packages/core ports) that cross the channel.
 * Streams (`listPages`) and handles with methods (`documents.open`) cannot, and callers
 * fall back to their alternatives; `bodyRecovery.pending` is answered client-side.
 */
export const collectionCommands = {
  sources: [
    "list",
    "get",
    "findByUrl",
    "findByCitekeyPrefix",
    "updateBody",
    "updateReading",
    "updateReadingStatus",
    "updateFields",
    "updateCitation",
    "appendAnnotationEmbed",
  ],
  sourceImports: ["findExactDuplicate", "commitFile", "attachFile"],
  annotations: [
    "invalidateRecord",
    "sourceIdsWithAnnotations",
    "annotationCountsBySource",
    "listAll",
    "listForSource",
    "create",
    "updateBody",
    "preflightDelete",
    "delete",
    "get",
  ],
  annotationAssets: ["store", "start", "mark"],
  contentSearch: ["search"],
  files: ["read"],
  bodyRecovery: ["recoverSource", "recoverAnnotation"],
  // Plain data only: the settings store itself follows the change feed in the host.
  settings: ["highlightColors"],
} as const satisfies Record<string, readonly string[]>;
export type CollectionRepository = keyof typeof collectionCommands;

export function isApplicationCommand(method: string): method is ApplicationCommand {
  return (applicationCommands as readonly string[]).includes(method);
}

export function isCollectionCommand(repository: string, method: string): boolean {
  const commands = (collectionCommands as Record<string, readonly string[] | undefined>)[
    repository
  ];
  return Object.hasOwn(collectionCommands, repository) && !!commands?.includes(method);
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
      readonly host: string;
      readonly client: string;
      readonly id: number;
      readonly slot: number;
      readonly args: readonly unknown[];
    }
  | { readonly kind: "open"; readonly host: string; readonly client: string; readonly url: string };

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * A copy that can cross the channel: drops function members (such as a handle's `close()`)
 * from plain objects and arrays. Snapshots and results are data; their handles stay with
 * the host.
 */
export function withoutFunctions(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "function" ? undefined : withoutFunctions(item, depth + 1),
    );
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "function") {
      copy[key] = withoutFunctions(item, depth + 1);
    }
  }
  return copy;
}

type Callback = (...args: unknown[]) => void;

/**
 * Replaces functions with callback slots and an AbortSignal with a marker the host turns
 * into its own signal (aborted with this one). Throws an already-aborted signal's reason:
 * such a call must never reach the SDK.
 */
export function encodeArgs(
  args: readonly unknown[],
  callbacks: Callback[],
  signals: AbortSignal[] = [],
): unknown[] {
  const slot = (fn: Callback): CallbackSlot => {
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
        value.throwIfAborted();
        signals.push(value);
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

/** The host's side of {@link encodeArgs}. */
export function decodeArgs(
  args: readonly unknown[],
  signal: AbortSignal,
  onCallback: (slot: number, args: unknown[]) => void,
): unknown[] {
  const callback =
    (slot: number) =>
    (...values: unknown[]): void =>
      onCallback(slot, values);
  return args.map((arg) => {
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

/** The SDK readiness facet's shape, as `assess` answers it. */
export function isReadinessSnapshot(value: unknown): value is MdbaseApplicationReadinessSnapshot {
  return isObject(value) && typeof value["checking"] === "boolean";
}

/** The fields the client reads from a host snapshot; anything else is not one. */
export function isApplicationSnapshot(value: unknown): value is MdbaseApplicationSnapshot {
  if (!isObject(value)) {
    return false;
  }
  const { status, collections, selection, readiness } = value;
  return (
    typeof status === "string" &&
    Array.isArray(collections) &&
    isObject(selection) &&
    typeof selection["state"] === "string" &&
    isReadinessSnapshot(readiness)
  );
}

function isCollectionShape(value: unknown): value is CollectionShape {
  if (!isObject(value) || !isObject(value["repositories"])) {
    return false;
  }
  return (
    typeof value["key"] === "string" &&
    typeof value["collectionId"] === "string" &&
    typeof value["collectionName"] === "string" &&
    Object.entries(value["repositories"]).every(
      ([repository, methods]) =>
        Array.isArray(methods) &&
        methods.every(
          (method) => typeof method === "string" && isCollectionCommand(repository, method),
        ),
    )
  );
}

/** A host snapshot message whose snapshot and collection shape have the expected form. */
export function isValidSnapshotMessage(
  message: Extract<HostMessage, { kind: "snapshot" }>,
): boolean {
  return (
    typeof message.host === "string" &&
    isApplicationSnapshot(message.snapshot) &&
    (message.collection === null || isCollectionShape(message.collection))
  );
}

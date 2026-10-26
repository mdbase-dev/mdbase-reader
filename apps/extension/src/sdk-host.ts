import { t as translate } from "@lingui/core/macro";

import {
  collectionCommands,
  decodeArgs,
  failedRequestId,
  isApplicationCommand,
  isClientMessage,
  isCollectionCommand,
  serializeError,
  transferable,
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

type CallMessage = Extract<ClientMessage, { kind: "call" }>;
type Method = (...args: unknown[]) => unknown;

/** Calls a person starts; a sign-in they lead to opens from that person's page. */
const interactive = new Set(["authorize", "approve", "chooseAnother", "select", "configure"]);

function member(owner: unknown, name: string): Method | null {
  if (typeof owner !== "object" || owner === null) {
    return null;
  }
  const value = (owner as Record<string, unknown>)[name];
  return typeof value === "function" ? (value as Method).bind(owner) : null;
}

/** The allowed commands this collection actually has, so optional ones stay absent. */
function shapeOf(key: string, collection: ReaderConnectedCollection): CollectionShape {
  const repositories: Record<string, string[]> = {};
  for (const [repository, commands] of Object.entries(collectionCommands)) {
    const owner = (collection as unknown as Record<string, unknown>)[repository];
    const present = commands.filter((command) => member(owner, command));
    if (typeof owner === "object" && owner !== null) {
      repositories[repository] = present;
    }
  }
  return {
    key,
    collectionId: collection.collectionId,
    collectionName: collection.collectionName,
    repositories,
  };
}

function refused(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

function resolveTarget(source: SdkHostSource, target: CallTarget, method: string): Method {
  if ("app" in target) {
    const bound = isApplicationCommand(method) ? member(source.application, method) : null;
    if (!bound) {
      throw refused(`mdbase Reader does not send ${method}.`, "command_not_allowed");
    }
    return bound;
  }
  if (!isCollectionCommand(target.repository, method)) {
    throw refused(
      `mdbase Reader does not send ${target.repository}.${method}.`,
      "command_not_allowed",
    );
  }
  const current = source.currentCollection();
  if (current?.key !== target.key) {
    throw refused(
      translate({ message: "The collection connection changed. Try again." }),
      "connection_retired",
    );
  }
  const repository = (current.collection as unknown as Record<string, unknown>)[target.repository];
  const bound = member(repository, method);
  if (!bound) {
    throw refused(`The collection has no ${target.repository}.${method}.`, "command_not_allowed");
  }
  return bound;
}

/** Serves the offscreen document's SDK entry to every extension context over `link`. */
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
      snapshot: transferable(application.getSnapshot()),
      collection: current ? shapeOf(current.key, current.collection) : null,
    });
  };

  const failure = (
    reason: unknown,
  ): Pick<Extract<HostMessage, { kind: "result" }>, "value" | "pending"> => {
    const requestId = failedRequestId(reason);
    const recovery = source.currentCollection()?.collection.bodyRecovery;
    return {
      value: serializeError(reason),
      ...(requestId && recovery
        ? { pending: { requestId, pending: recovery.pending(requestId) } }
        : {}),
    };
  };

  const call = async (message: CallMessage): Promise<void> => {
    const controllerKey = `${message.client}:${String(message.id)}`;
    const controller = new AbortController();
    controllers.set(controllerKey, controller);
    if ("app" in message.target && interactive.has(message.method)) {
      lastClient = message.client;
    }
    const reply = { kind: "result", host: hostId, client: message.client, id: message.id } as const;
    const onCallback = (slot: number, args: unknown[]): void =>
      post({ kind: "callback", host: hostId, client: message.client, id: message.id, slot, args });
    try {
      const target = resolveTarget(source, message.target, message.method);
      const value: unknown = await target(
        ...decodeArgs(message.args, controller.signal, onCallback),
      );
      try {
        post({ ...reply, ok: true, value: transferable(value) });
      } catch (reason) {
        // The SDK's answer cannot cross the channel (it holds functions).
        post({ ...reply, ok: false, value: serializeError(reason) });
      }
    } catch (reason) {
      post({ ...reply, ok: false, ...failure(reason) });
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
        post({ kind: "open", host: hostId, client: lastClient, url });
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

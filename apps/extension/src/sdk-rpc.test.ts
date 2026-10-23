import { describeError, nativeReaderCollection } from "@mdbase-reader/connect/native";
import { mdbaseError, memoryConnection } from "@mdbase-reader/connect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSdkClient, hostRestartedMessage, type SdkClient } from "./sdk-client.js";
import { serveSdk, type SdkHost, type SdkHostSource } from "./sdk-host.js";
import { decodeArgs, deserializeError, encodeArgs, serializeError } from "./sdk-rpc.js";
import { memoryBus } from "./testing/memory-bus.js";
import { applicationFixture } from "./testing/sdk-fixture.js";

import type { MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

const owned: { close(): void }[] = [];
afterEach(() => {
  for (const item of owned.splice(0).reverse()) {
    item.close();
  }
});

function host(
  bus: ReturnType<typeof memoryBus>,
  id: string,
  source: SdkHostSource,
): { host: SdkHost; endpoint: ReturnType<ReturnType<typeof memoryBus>["endpoint"]> } {
  const endpoint = bus.endpoint();
  const served = serveSdk(endpoint, source, id);
  owned.push(served, endpoint);
  return { host: served, endpoint };
}

function fixtureHost(
  bus: ReturnType<typeof memoryBus>,
  id: string,
  initial: Partial<MdbaseApplicationSnapshot> = {},
): ReturnType<typeof applicationFixture> & { served: ReturnType<typeof host> } {
  const sdk = applicationFixture(initial);
  owned.push(sdk.controls);
  const served = host(bus, id, {
    application: sdk.entry.application(),
    currentCollection: () => null,
  });
  return { ...sdk, served };
}

async function client(
  bus: ReturnType<typeof memoryBus>,
  options: {
    hostGone?: (id: string) => Promise<void>;
    ensureHost?: () => Promise<void>;
    openSignIn?: (url: string) => void;
  } = {},
): Promise<SdkClient> {
  const created = await createSdkClient(bus.endpoint(), {
    ensureHost: options.ensureHost ?? (() => Promise.resolve()),
    hostGone: options.hostGone ?? (() => new Promise<void>(() => undefined)),
    openSignIn: options.openSignIn ?? (() => undefined),
  });
  owned.push({ close: () => created.dispose() });
  return created;
}

const never = new Promise<MdbaseApplicationSnapshot>(() => undefined);

describe("SDK RPC between extension pages and the offscreen host", () => {
  it("serves only the public application commands, with the SDK's snapshot", async () => {
    const bus = memoryBus();
    const sdk = fixtureHost(bus, "h1");
    const remote = await client(bus);
    expect(remote.application.getSnapshot().status).toBe("signed_out");
    await remote.application.select("c2");
    expect(sdk.controls.observedActions()).toContainEqual(
      expect.objectContaining({ action: "select", collectionId: "c2" }),
    );
    // Not a command the extension may send, even though the application has it.
    const raw = bus.endpoint();
    const replies: unknown[] = [];
    raw.listen((message) => replies.push(message));
    raw.post({
      kind: "call",
      client: "raw",
      id: 1,
      target: { app: true },
      method: "close",
      args: [],
    });
    await vi.waitFor(() => expect(replies).toContainEqual(expect.objectContaining({ ok: false })));
    expect(sdk.controls.observedActions().some((call) => call.action === "close")).toBe(false);
  });

  it("opens sign-in only from the page that started it", async () => {
    const bus = memoryBus();
    const sdk = fixtureHost(bus, "h1");
    sdk.controls.setHandler("authorize", () => {
      sdk.served.host.openSignIn("https://connect-lab.mdbase.dev/approve");
    });
    const bystander = vi.fn();
    await client(bus, { openSignIn: bystander });
    const opener = vi.fn();
    const remote = await client(bus, { openSignIn: opener });
    await remote.application.authorize();
    await vi.waitFor(() =>
      expect(opener).toHaveBeenCalledWith("https://connect-lab.mdbase.dev/approve"),
    );
    expect(bystander).not.toHaveBeenCalled();
  });

  it("fails calls the host never answered and reports the loss without inventing a status", async () => {
    const bus = memoryBus();
    const first = fixtureHost(bus, "h1");
    first.controls.setHandler("authorize", () => never);
    let gone = (): void => undefined;
    const ensureHost = vi.fn(() => Promise.resolve());
    const remote = await client(bus, {
      ensureHost,
      hostGone: (id) =>
        new Promise<void>((resolve) => (id === "h1" ? (gone = resolve) : undefined)),
    });
    const pending = remote.application.authorize();
    await vi.waitFor(() =>
      expect(first.controls.observedActions().some((call) => call.action === "authorize")).toBe(
        true,
      ),
    );
    const listener = vi.fn();
    remote.application.subscribe(listener);

    first.served.endpoint.close(); // Chrome closes the offscreen document.
    gone();
    await expect(pending).rejects.toThrow(hostRestartedMessage());
    expect(remote.hostAvailable()).toBe(false);
    expect(listener).toHaveBeenCalled();
    // The last snapshot the SDK sent, unchanged: no status the SDK did not report.
    expect(remote.application.getSnapshot().status).toBe("signed_out");
    await vi.waitFor(() => expect(ensureHost).toHaveBeenCalledTimes(2));

    const second = fixtureHost(bus, "h2", { status: "unselected" });
    await vi.waitFor(() => expect(remote.hostAvailable()).toBe(true));
    expect(remote.application.getSnapshot().status).toBe("unselected");
    await remote.application.select("c1");
    expect(second.controls.observedActions()).toContainEqual(
      expect.objectContaining({ action: "select", collectionId: "c1" }),
    );
  });

  it("settles a call to a replaced host and ignores that host's late answer", async () => {
    const bus = memoryBus();
    const first = fixtureHost(bus, "h1");
    let finish = (): void => undefined;
    first.controls.setHandler(
      "authorize",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const remote = await client(bus);
    const pending = remote.application.authorize().then(
      () => "resolved",
      (reason: unknown) => (reason instanceof Error ? reason.message : "rejected"),
    );
    await vi.waitFor(() =>
      expect(first.controls.observedActions().some((call) => call.action === "authorize")).toBe(
        true,
      ),
    );
    // A second host announces itself before the first is known to be gone.
    fixtureHost(bus, "h2");
    await expect(pending).resolves.toBe(hostRestartedMessage());
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(pending).resolves.toBe(hostRestartedMessage());
  });
});

describe("the READY collection over the SDK RPC", () => {
  it("serves the READY collection's public repository commands", async () => {
    const native = await memoryConnection({ where: () => false });
    owned.push(native);
    const collection = nativeReaderCollection(native.connection);
    owned.push({ close: () => collection.dispose() });
    const bus = memoryBus();
    const sdk = applicationFixture();
    owned.push(sdk.controls);
    host(bus, "h1", {
      application: sdk.entry.application(),
      currentCollection: () => ({ key: "h1:c:1", collection }),
    });
    const remote = await client(bus);
    const proxy = remote.connectedCollection();
    expect(proxy?.collectionId).toBe(collection.collectionId);
    // Streams cannot cross the channel; callers use the paged list instead.
    expect(proxy?.sources.listPages).toBeUndefined();
    // The SDK's own outcome, unchanged by the channel (this replica refuses queries).
    const query = { collectionId: collection.collectionId, limit: 10 };
    const direct = await collection.sources.list(query).catch((reason: unknown) => reason);
    const bridged = await proxy?.sources.list(query).catch((reason: unknown) => reason);
    expect(bridged).toBeInstanceOf(Error);
    expect(bridged).toMatchObject({
      name: (direct as Error).name,
      message: (direct as Error).message,
    });
    // No pending answer from the host yet: recovery asks the SDK rather than assume.
    expect(proxy?.bodyRecovery.pending("unknown-request")).toBe(true);
  });
});

describe("SDK RPC arguments and errors", () => {
  it("carries bytes and callbacks, and refuses an already-aborted signal", () => {
    const callbacks: ((...args: unknown[]) => void)[] = [];
    const progress = vi.fn();
    const bytes = new Uint8Array([1, 2, 3]);
    const encoded = structuredClone(encodeArgs([{ bytes }, { onProgress: progress }], callbacks));
    const posted: unknown[] = [];
    const decoded = decodeArgs(encoded, new AbortController().signal, (slot, args) =>
      posted.push([slot, args]),
    ) as [{ bytes: Uint8Array }, { onProgress: (value: number) => void }];
    expect(decoded[0].bytes).toEqual(bytes);
    decoded[1].onProgress(3);
    expect(posted).toEqual([[0, [3]]]);
    const aborted = new AbortController();
    aborted.abort();
    expect(() => encodeArgs([{ signal: aborted.signal }], [])).toThrow();
  });

  it("keeps an SDK error describable after it crosses the channel", () => {
    const original = mdbaseError("unauthenticated", "Signed out.");
    const crossed = deserializeError(structuredClone(serializeError(original)));
    expect(crossed.name).toBe(original.name);
    expect(describeError(crossed)?.title).toBe(describeError(original)?.title);
  });
});

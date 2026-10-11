import { describe, expect, it, vi, type Mock } from "vitest";

import { createSdkClient, type SdkClientOptions } from "./sdk-client.js";
import { serveSdk, type SdkHostSource } from "./sdk-host.js";
import { memoryBus } from "./testing/memory-bus.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

function snapshot(selected: string): Record<string, unknown> {
  return {
    status: "ready",
    signIn: { state: "paired" },
    collections: [{ collectionId: selected, displayName: "[test] Library" }],
    selectedCollectionId: selected,
    selection: { state: "selected" },
    readiness: { checking: false, problem: null, assessment: { status: "ready", problem: null } },
  };
}

class SdkError extends Error {
  override name = "MdbaseError";
  constructor(
    readonly code: string,
    readonly requestId: string,
  ) {
    super(`failed: ${code}`);
  }
}

interface FakeHost {
  readonly source: SdkHostSource;
  readonly application: { readonly select: Mock; readonly authorize: Mock };
  readonly sources: { readonly list: Mock };
}

/** A host with one READY collection whose repositories are vi.fn()s. */
function fakeHost(selected = "c1", key = `${selected}:1`): FakeHost {
  let current = snapshot(selected);
  const listeners = new Set<() => void>();
  const sources = {
    list: vi.fn(() => Promise.resolve({ items: [{ id: "s1", url: "https://example.com/" }] })),
    get: vi.fn(),
  };
  const sourceImports = {
    commitFile: vi.fn(
      (plan: { bytes: Uint8Array }, options: { onProgress: (p: unknown) => void }) => {
        options.onProgress({ phase: "uploading", completedBytes: plan.bytes.length });
        return Promise.resolve({ id: "s2", size: plan.bytes.length });
      },
    ),
  };
  const annotations = {
    listForSource: vi.fn(() => Promise.reject(new SdkError("collection_busy", "r1"))),
  };
  const bodyRecovery = {
    pending: vi.fn((requestId: string) => requestId === "r1"),
    recoverSource: vi.fn(),
  };
  const collection = {
    collectionId: selected,
    collectionName: "[test] Library",
    sources,
    sourceImports,
    annotations,
    bodyRecovery,
  };
  const application = {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: vi.fn(() => Promise.resolve()),
    authorize: vi.fn(() => Promise.resolve()),
    select: vi.fn((id: string) => {
      current = snapshot(id);
      for (const listener of listeners) {
        listener();
      }
      return Promise.resolve();
    }),
  };
  const source: SdkHostSource = {
    application: application as unknown as SdkHostSource["application"],
    currentCollection: () => ({
      key,
      collection: collection as unknown as ReaderConnectedCollection,
    }),
  };
  return { source, application, sources };
}

function client(
  bus: ReturnType<typeof memoryBus>,
  options: Partial<SdkClientOptions> = {},
): ReturnType<typeof createSdkClient> {
  return createSdkClient(bus.endpoint(), {
    ensureHost: vi.fn(() => Promise.resolve()),
    hostGone: () => new Promise<void>(() => undefined),
    openSignIn: vi.fn(),
    ...options,
  });
}

describe("SDK RPC between extension pages and the offscreen host", () => {
  it("serves the application and the READY collection with bytes, callbacks and SDK errors", async () => {
    const bus = memoryBus();
    const host = fakeHost();
    serveSdk(bus.endpoint(), host.source, "h1");
    const remote = await client(bus);

    expect(remote.application.getSnapshot()).toMatchObject({ selectedCollectionId: "c1" });
    await remote.application.select("c2", { signal: new AbortController().signal });
    expect(host.application.select).toHaveBeenCalledWith("c2", expect.anything());
    await vi.waitFor(() =>
      expect(remote.application.getSnapshot()).toMatchObject({ selectedCollectionId: "c2" }),
    );

    const collection = remote.connectedCollection();
    expect(collection).toMatchObject({ collectionId: "c1", collectionName: "[test] Library" });
    if (!collection) {
      throw new Error("no collection");
    }
    // Only methods the host collection has: optional ones stay absent.
    expect(collection.sources.updateFields).toBeUndefined();
    expect(collection.sources.listPages).toBeUndefined();
    await expect(collection.sources.list({ collectionId: "c1" } as never)).resolves.toMatchObject({
      items: [{ id: "s1" }],
    });

    const onProgress = vi.fn();
    const saved = await collection.sourceImports.commitFile(
      { bytes: new Uint8Array([1, 2, 3]) } as never,
      { onProgress },
    );
    expect(saved).toMatchObject({ id: "s2", size: 3 });
    expect(onProgress).toHaveBeenCalledWith({ phase: "uploading", completedBytes: 3 });

    const failure = collection.annotations.listForSource("c1" as never, "s1" as never);
    await expect(failure).rejects.toMatchObject({
      name: "MdbaseError",
      code: "collection_busy",
      requestId: "r1",
    });
    // The host's answer for the failed request, available synchronously as the port requires.
    expect(collection.bodyRecovery.pending("r1")).toBe(true);
  });

  it("asks the page that started sign-in to open the mdbase tab", async () => {
    const bus = memoryBus();
    const host = fakeHost();
    const served = serveSdk(bus.endpoint(), host.source, "h1");
    host.application.authorize.mockImplementation(() => {
      served.openSignIn("https://connect-lab.mdbase.dev/approve");
      return Promise.resolve();
    });
    const bystanderOpen = vi.fn();
    await client(bus, { openSignIn: bystanderOpen });
    const openSignIn = vi.fn();
    const remote = await client(bus, { openSignIn });
    await remote.application.authorize();
    await vi.waitFor(() =>
      expect(openSignIn).toHaveBeenCalledWith("https://connect-lab.mdbase.dev/approve"),
    );
    expect(bystanderOpen).not.toHaveBeenCalled();
  });

  it("fails in-flight calls when the host closes, then reconnects to a new host", async () => {
    const bus = memoryBus();
    const first = fakeHost("c1", "c1:1");
    first.sources.list.mockReturnValue(new Promise(() => undefined));
    const firstEndpoint = bus.endpoint();
    serveSdk(firstEndpoint, first.source, "h1");
    let gone = (): void => undefined;
    const ensureHost = vi.fn(() => Promise.resolve());
    const remote = await client(bus, {
      ensureHost,
      hostGone: (hostId) =>
        new Promise<void>((resolve) => {
          if (hostId === "h1") {
            gone = resolve;
          }
        }),
    });
    expect(ensureHost).toHaveBeenCalledTimes(1);
    const before = remote.connectedCollection();
    const pending = before?.sources.list({ collectionId: "c1" } as never);
    const listener = vi.fn();
    remote.application.subscribe(listener);

    // Chrome closes the offscreen document.
    firstEndpoint.close();
    gone();
    await expect(pending).rejects.toThrow(/restarted/u);
    expect(remote.connectedCollection()).toBeNull();
    expect(remote.application.getSnapshot()).toMatchObject({ status: "starting" });
    await vi.waitFor(() => expect(ensureHost).toHaveBeenCalledTimes(2));

    const second = fakeHost("c1", "c1:2");
    serveSdk(bus.endpoint(), second.source, "h2");
    await vi.waitFor(() =>
      expect(remote.application.getSnapshot()).toMatchObject({ status: "ready" }),
    );
    expect(listener).toHaveBeenCalled();
    const after = remote.connectedCollection();
    expect(after).not.toBe(before);
    await expect(after?.sources.list({ collectionId: "c1" } as never)).resolves.toMatchObject({
      items: [{ id: "s1" }],
    });
    expect(second.sources.list).toHaveBeenCalledTimes(1);
  });
});

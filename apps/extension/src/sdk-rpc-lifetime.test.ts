import { createApplicationFixture } from "@mdbase-reader/connect/testing";
import { afterEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { createSdkClient, type SdkClient } from "./sdk-client.js";
import { serveSdk, type SdkHost } from "./sdk-host.js";
import { memoryBus } from "./testing/memory-bus.js";
import { signedOutSnapshot } from "./testing/sdk-fixture.js";

const fixtures: ReturnType<typeof createApplicationFixture>[] = [];
const clients: SdkClient[] = [];
const hosts: SdkHost[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.dispose();
  }
  for (const host of hosts.splice(0)) {
    host.close();
  }
  for (const fixture of fixtures.splice(0)) {
    fixture.controls.close();
  }
});

async function fixture(): Promise<
  ReturnType<typeof createApplicationFixture> & {
    client: SdkClient;
    application: ReturnType<ReturnType<typeof createApplicationFixture>["entry"]["application"]>;
  }
> {
  // Real public SDK lifecycle fixture, not a cast READY application/session.
  // Metadata actions below do not constitute browser or authenticated acceptance.
  const sdk = createApplicationFixture({
    declaration: {
      id: "reader.rpc.fixture",
      name: manifest.name,
      origin: "https://reader.mdbase.dev",
      environment: "lab",
      manifest,
    },
    connections: [],
    // SDK 41c requires the initial snapshot.
    initialSnapshot: signedOutSnapshot,
  });
  fixtures.push(sdk);
  const application = sdk.entry.application();
  const bus = memoryBus();
  hosts.push(
    serveSdk(bus.endpoint(), { application, currentCollection: () => null }, "owned-host"),
  );
  const client = await createSdkClient(bus.endpoint(), {
    ensureHost: () => Promise.resolve(),
    hostGone: () => new Promise<void>(() => undefined),
    openSignIn: () => undefined,
  });
  clients.push(client);
  return { ...sdk, client, application };
}

it("an already-aborted caller cannot invoke a protected SDK action through the bridge", async () => {
  const h = await fixture();
  h.controls.setHandler("authorize", () => h.application.getSnapshot());
  const caller = new AbortController();
  caller.abort();
  await h.client.application.authorize({ signal: caller.signal }).catch(() => undefined);
  expect(h.controls.observedActions().filter((call) => call.action === "authorize")).toHaveLength(
    0,
  );
});

it("disposing only this caller rejects its pending call without closing the SDK owner", async () => {
  const h = await fixture();
  let finish: (() => void) | undefined;
  h.controls.setHandler(
    "authorize",
    () =>
      new Promise((resolve) => {
        finish = () => resolve(h.application.getSnapshot());
      }),
  );
  const result = h.client.application.authorize().then(
    () => "resolved",
    () => "rejected",
  );
  await vi.waitFor(() =>
    expect(h.controls.observedActions().some((call) => call.action === "authorize")).toBe(true),
  );
  h.client.dispose();
  try {
    const state = await Promise.race([
      result,
      new Promise<string>((resolve) => setTimeout(() => resolve("unsettled"), 20)),
    ]);
    expect(state).toBe("rejected");
    expect(h.controls.observedActions().some((call) => call.action === "close")).toBe(false);
  } finally {
    finish?.();
  }
});

import {
  loadOrCreateClientKey,
  mdbaseError,
  memoryKeyStorage,
  type Connector,
} from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { afterEach, describe, expect, it } from "vitest";

import { readerSdkBackend } from "./backend.js";
import { routeFrom, type ReaderNextControlPlane, type ReaderNextGrant } from "./control-plane.js";
import { waitingForDeviceMessage } from "./errors.js";
import { ReaderNextApplicationSession, type ReaderNextSessionOptions } from "./session.js";

const sessions: ReaderNextApplicationSession[] = [];

function controlPlane(grants: readonly ReaderNextGrant[]): ReaderNextControlPlane {
  return {
    grants: () => Promise.resolve(grants),
    authorize: () => Promise.resolve(null),
    resolveRoute: () => Promise.resolve(null),
  };
}

function session(
  grants: readonly ReaderNextGrant[],
  connector: () => Connector,
): ReaderNextApplicationSession {
  const options: ReaderNextSessionOptions = {
    serverUrl: "https://connect.example",
    app: { name: "dev.mdbase.reader", version: "test" },
    controlPlane: controlPlane(grants),
    connector,
    clientKey: () => loadOrCreateClientKey("reader-test", { storage: memoryKeyStorage() }),
  };
  const created = new ReaderNextApplicationSession(options);
  sessions.push(created);
  return created;
}

afterEach(() => {
  for (const created of sessions.splice(0)) {
    created.destroy();
  }
});

describe("mdbase-next Reader session", () => {
  it("opens the only granted collection and serves Reader's repositories", async () => {
    const replica = new MemoryReplica({ confirmDelayMs: null });
    replica.seed({
      path: "sources/one.md",
      types: ["reader-source"],
      frontmatter: { id: "src-1", title: "One" },
    });
    const grant = { collectionId: replica.collection, grant: "g-1", displayName: "Library" };
    const reader = session([grant], () => replica.connector());

    const outcome = await reader.start();

    expect(outcome.ok && outcome.value.status).toBe("ready");
    const opened = reader.connectedCollection(replica.collection);
    expect(opened?.collectionName).toBe("Library");
    const page = await opened?.sources.list({ collectionId: opened.collectionId, limit: 10 });
    expect(page?.items.map((source) => source.title)).toEqual(["One"]);
    expect(reader.connectedCollection("another-collection")).toBeNull();
  });

  it("waits for one of the person's devices instead of failing", async () => {
    const replica = new MemoryReplica();
    const grant = { collectionId: replica.collection, grant: "g-1", displayName: "Private" };
    let attempts = 0;
    const offlineOnce: Connector = {
      description: "offline once",
      open: (hello) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(mdbaseError("unavailable", "no device", "no_device_online"))
          : replica.connector().open(hello);
      },
    };
    const reader = session([grant], () => offlineOnce);
    const snapshots: string[] = [];
    reader.subscribe(() => {
      const snapshot = reader.getSnapshot();
      snapshots.push(snapshot.status === "blocked" ? snapshot.problem.message : snapshot.status);
    });

    const outcome = await reader.start();

    expect(outcome.ok && outcome.value.status).toBe("ready");
    expect(snapshots).toContain(waitingForDeviceMessage);
    expect(reader.waitingForDevice).toBe(false);
  });

  it("asks the person to choose and reports the missing consent flow", async () => {
    const reader = session([], () => new MemoryReplica().connector());

    const started = await reader.start();
    const authorized = await reader.authorize();

    expect(started.ok && started.value.status).toBe("unselected");
    expect(authorized.ok ? null : authorized.problem.code).toBe("unsupported_operation");
    await expect(reader.recoverPendingMutations()).resolves.toEqual([]);
  });
});

describe("mdbase-next configuration", () => {
  it("keeps Connect unless the URL flag or build setting asks for next", () => {
    expect(readerSdkBackend(null)).toBe("connect");
    expect(readerSdkBackend(null, "next")).toBe("next");
    expect(readerSdkBackend("next", "connect")).toBe("next");
    expect(readerSdkBackend("connect", "next")).toBe("connect");
  });

  it("reads the proposed route response", () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    const route = routeFrom({
      targets: [{ url: "wss://relay.example/s/1", device: "device-1", noise_pk: key }],
    });

    expect(route).toMatchObject({ url: "wss://relay.example/s/1", targetDevice: "device-1" });
    expect(route?.noisePublicKey).toEqual(new Uint8Array(32).fill(7));
    expect(routeFrom({ targets: [] })).toBeNull();
    expect(() => routeFrom({})).toThrow();
  });
});

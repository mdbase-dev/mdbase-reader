import { describe, expect, it } from "vitest";

import { sdkConnectionState } from "./sdk-connection-state.js";

import type { Mdbase } from "@mdbase-reader/connect/native";

type Snapshot = ReturnType<Mdbase["getSnapshot"]>;
const snapshot = (value: { saveState?: string; connection?: string }): Snapshot =>
  ({
    phase: { kind: "starting" },
    sync: {
      connection: value.connection ?? "online",
      attention: [],
      writes: value.saveState ? { saveState: value.saveState, pending: [], rejected: [] } : null,
    },
  }) as unknown as Snapshot;

describe("SDK connection state", () => {
  it("reports an incident with pending writes as attention, not progress or a fabricated rejection", () => {
    const pending = {
      phase: {
        kind: "ready",
        connection: { records: { status: { incidents: [{ kind: "read_only" }] } } },
      },
      sync: {
        connection: "online",
        attention: [],
        writes: { pending: [{}], rejected: [], saveState: "saved_on_device" },
      },
    } as unknown as Snapshot;
    expect(sdkConnectionState(pending, "connected")).toBe("attention");
    expect(pending.sync?.writes?.rejected).toEqual([]);
  });
  it("does not call rejected or parked writes progress", () => {
    expect(
      sdkConnectionState(
        {
          phase: { kind: "starting" },
          sync: {
            connection: "online",
            attention: [],
            writes: { pending: [], rejected: [{}], saveState: "rejected" },
          },
        } as unknown as Snapshot,
        "connected",
      ),
    ).toBe("attention");
    expect(sdkConnectionState(snapshot({ saveState: "saved_on_device" }), "connected")).toBe(
      "saved_on_device",
    );
  });
  it("never reports connected while offline or waiting to sync", () => {
    expect(sdkConnectionState(snapshot({ connection: "offline" }), "connected")).toBe("offline");
    expect(
      sdkConnectionState(
        snapshot({ connection: "offline", saveState: "saved_on_device" }),
        "connected",
      ),
    ).toBe("saved_on_device");
    expect(
      sdkConnectionState(snapshot({ connection: "online", saveState: "saved" }), "connected"),
    ).toBe("connected");
    expect(sdkConnectionState(null, "connected")).toBe("connected");
    expect(
      sdkConnectionState(
        {
          phase: { kind: "starting" },
          sync: {
            connection: "online",
            attention: [],
            writes: { pending: [{}], rejected: [], saveState: "saving" },
          },
        } as unknown as Snapshot,
        "connected",
      ),
    ).toBe("syncing");
  });
});

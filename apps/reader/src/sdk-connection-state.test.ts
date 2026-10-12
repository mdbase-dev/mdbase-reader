import { describe, expect, it } from "vitest";

import { sdkConnectionState } from "./sdk-connection-state.js";

import type { Mdbase } from "@mdbase-reader/connect/native";

type Snapshot = ReturnType<Mdbase["getSnapshot"]>;
const snapshot = (value: { saveState?: string; kind?: string }): Snapshot =>
  ({
    writes: value.saveState ? { saveState: value.saveState } : null,
    sync: value.kind ? { kind: value.kind } : null,
  }) as unknown as Snapshot;

describe("SDK connection state", () => {
  it("never reports connected while offline or waiting to sync", () => {
    expect(sdkConnectionState(snapshot({ kind: "offline" }), "connected")).toBe("offline");
    expect(
      sdkConnectionState(snapshot({ kind: "offline", saveState: "saved_on_device" }), "connected"),
    ).toBe("saved_on_device");
    expect(sdkConnectionState(snapshot({ kind: "synced", saveState: "saved" }), "connected")).toBe(
      "connected",
    );
    expect(sdkConnectionState(null, "connected")).toBe("connected");
  });
});

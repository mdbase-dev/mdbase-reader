import { describe, expect, it } from "vitest";

import { sdkConnectionState } from "./sdk-connection-state.js";

import type { Mdbase } from "@mdbase-reader/connect/native";

type Snapshot = ReturnType<Mdbase["getSnapshot"]>;
describe("SDK connection state", () => {
  it.each([
    ["attention", "attention"],
    ["saved_on_device", "saved_on_device"],
    ["offline", "offline"],
    ["reconnecting", "offline"],
    ["saving", "syncing"],
    ["catching_up", "syncing"],
    ["saved", "connected"],
  ] as const)("presents the SDK's %s state as %s", (state, expected) => {
    const snapshot = { sync: { state } } as unknown as Snapshot;
    expect(sdkConnectionState(snapshot, "connected")).toBe(expected);
  });
  it("uses the workspace state until the SDK has a snapshot", () => {
    expect(sdkConnectionState(null, "connected")).toBe("connected");
    expect(sdkConnectionState(null, "offline")).toBe("offline");
  });
});

import { describe, expect, it } from "vitest";

import {
  connectionStatus,
  describeConnectionProblem,
  requiresAccessReview,
  requiresReconnect,
} from "./connection-recovery.js";

describe("connection recovery", () => {
  it("describes the Connect startup lifecycle", () => {
    expect(connectionStatus({ status: "starting", connections: [] })).toBe(
      "Finding mdbase Connect…",
    );
  });

  it("recognizes a stale grant after an application declaration update", () => {
    expect(
      requiresAccessReview(
        "Application access denied: Collection setup must match the exact application declaration bound to this grant.",
      ),
    ).toBe(true);
    expect(requiresAccessReview("The collection is offline.")).toBe(false);
  });

  it("asks to reconnect when the grant's keys are gone from this browser", () => {
    for (const message of [
      "The remote authority signing key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable.",
    ]) {
      expect(requiresReconnect(message)).toBe(true);
      expect(describeConnectionProblem(message)).toMatch(/Reconnect to keep reading/u);
    }
    expect(requiresReconnect("The collection is offline.")).toBe(false);
    expect(describeConnectionProblem("The collection is offline.")).toBe(
      "The collection is offline.",
    );
    expect(describeConnectionProblem(null)).toBeNull();
  });
});

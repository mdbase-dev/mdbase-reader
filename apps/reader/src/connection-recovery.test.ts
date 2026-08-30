import { describe, expect, it } from "vitest";

import { connectionStatus, requiresAccessReview } from "./connection-recovery.js";

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
});

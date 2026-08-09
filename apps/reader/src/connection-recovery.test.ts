import { describe, expect, it } from "vitest";

import { requiresAccessReview } from "./connection-recovery.js";

describe("connection recovery", () => {
  it("recognizes a stale grant after an application declaration update", () => {
    expect(
      requiresAccessReview(
        "Application access denied: Collection setup must match the exact application declaration bound to this grant.",
      ),
    ).toBe(true);
    expect(requiresAccessReview("The collection is offline.")).toBe(false);
  });
});

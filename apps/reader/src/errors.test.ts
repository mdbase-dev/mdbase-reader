import { describe, expect, it } from "vitest";

import { readerErrorMessage } from "./errors.js";

describe("readerErrorMessage", () => {
  it("preserves actionable operation errors", () => {
    expect(readerErrorMessage(new Error("The operation timed out."), "Try again.")).toBe(
      "The operation timed out.",
    );
  });

  it("uses a stable fallback for unknown rejections", () => {
    expect(readerErrorMessage({ unavailable: true }, "Try again.")).toBe("Try again.");
  });
});

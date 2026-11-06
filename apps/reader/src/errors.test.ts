import { ConnectRepositoryError } from "@mdbase-reader/connect";
import { describe, expect, it } from "vitest";

import { readerErrorMessage } from "./errors.js";

describe("readerErrorMessage", () => {
  it("names an unprovable list instead of showing a native engine error", () => {
    const error = new ConnectRepositoryError(
      "query annotations",
      "query_incomplete",
      "continuation absent",
    );
    expect(readerErrorMessage(error, "Try again.")).toBe(
      "This list may be incomplete. Reader could not verify all results. Try again after the collection finishes syncing.",
    );
  });

  it("replaces engine budget errors with a plain next step", () => {
    const error = new ConnectRepositoryError(
      "query annotations",
      "query_budget_exceeded",
      "ordinary selection exceeds its bounded source or retained-value query budget",
    );
    expect(readerErrorMessage(error, "Try again.")).toBe(
      "This annotation query is too large. Try again. If it still fails, contact support.",
    );
  });
  it("preserves actionable operation errors", () => {
    expect(readerErrorMessage(new Error("The operation timed out."), "Try again.")).toBe(
      "The operation timed out.",
    );
  });

  it.each([
    "create source",
    "update source",
    "create chapter source",
    "create annotation",
    "update annotation",
    "save citation metadata",
  ])("shows validation issues when a record write fails to %s", (operation) => {
    const error = new ConnectRepositoryError(
      operation,
      "operation_failed",
      "The record would not be valid",
      undefined,
      [
        {
          code: "schema_required",
          severity: "error",
          message: "required property `saved_at` is missing",
        },
      ],
    );
    expect(readerErrorMessage(error, "Try again.")).toBe(
      `mdbase Connect could not ${operation}: The record would not be valid: Saved date is required`,
    );
  });

  it("uses a stable fallback for unknown rejections", () => {
    expect(readerErrorMessage({ unavailable: true }, "Try again.")).toBe("Try again.");
  });
});

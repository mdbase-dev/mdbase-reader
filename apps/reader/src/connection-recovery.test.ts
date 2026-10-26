import { describe, expect, it } from "vitest";

import {
  connectionProblemDetail,
  describeConnectionProblem,
  libraryLoadFallback,
} from "./connection-recovery.js";

describe("connection recovery", () => {
  it("asks to reconnect when the grant's keys are gone from this browser", () => {
    for (const message of [
      "The remote authority signing key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable.",
    ]) {
      expect(describeConnectionProblem(message)).toMatch(/Reconnect to keep reading/u);
    }
    expect(describeConnectionProblem("The collection is offline.")).toBe(
      "The collection is offline.",
    );
    expect(describeConnectionProblem(null)).toBeNull();
  });

  it("describes technical failures plainly and keeps the original as detail", () => {
    const raw = 'Application declaration is invalid: /homepage must match pattern "^https://"';
    expect(describeConnectionProblem(raw)).toMatch(/did not accept Reader’s app registration/u);
    expect(connectionProblemDetail(raw)).toBe(raw);
    expect(describeConnectionProblem("TypeError: Failed to fetch")).toMatch(/could not reach/u);
    expect(connectionProblemDetail("The collection is offline.")).toBeNull();
    expect(connectionProblemDetail(null)).toBeNull();
  });

  it("replaces unrecognised technical text with a fallback and keeps it as detail", () => {
    const raw = "mdbase Connect could not query sources: query_failed";
    expect(describeConnectionProblem(raw, libraryLoadFallback())).toBe(libraryLoadFallback());
    expect(connectionProblemDetail(raw, libraryLoadFallback())).toBe(raw);
    // A recognised problem keeps its own plain wording.
    expect(describeConnectionProblem("TypeError: Failed to fetch", libraryLoadFallback())).toMatch(
      /could not reach/u,
    );
  });
});

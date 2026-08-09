import { describe, expect, it } from "vitest";

import { bibliographyProblemSummary } from "./use-bibliography-export.js";

describe("bibliographyProblemSummary", () => {
  it("summarises each visible export problem category", () => {
    expect(
      bibliographyProblemSummary([
        { kind: "missing" },
        { kind: "missing" },
        { kind: "invalid" },
        { kind: "duplicate" },
      ]),
    ).toBe("2 without citations · 1 invalid record · 1 citekey collision");
  });

  it("omits an empty problem summary", () => {
    expect(bibliographyProblemSummary([])).toBeNull();
  });
});

import { parseCslProvenance } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { resolveCitation } from "./resolver.js";

import type { Claim } from "./claims.js";

function remote(field: string, value: unknown): Claim {
  return {
    field,
    value,
    source: { kind: "registry", name: "doi.org" },
    observedAt: "2026-10-22T00:00:00Z",
  };
}

describe("dismissed citation suggestions", () => {
  it.each<[string, unknown, unknown]>([
    ["title", "A new title", "  A NEW title.  "],
    ["publisher", "Example Limited", "Example Ltd."],
    ["author", [{ family: "Peters" }], [{ family: "Peters", given: "Jay" }]],
    ["issued", { "date-parts": [[2026, 10]] }, { "date-parts": [["2026", "10"]] }],
  ])("suppresses equivalent %s proposals using claim matching", (field, dismissed, proposed) => {
    const existing = {
      citation: { type: "article", title: "Original" },
      provenance: parseCslProvenance({
        [field]: {
          ...(field === "title" ? { value: "Original", source: "page:html" } : {}),
          rejected: [{ value: dismissed, from: "user" }],
        },
      }),
    };
    const result = resolveCitation({ existing, claims: [remote(field, proposed)] });
    expect(result.suggestions).toEqual([]);
    expect(result.citation).toBe(existing.citation);
    expect(result.provenance[field]).toEqual(existing.provenance[field]);
  });

  it.each([undefined, "", null, []])(
    "remembers a dismissed fill on an empty field (%j), but allows a different value",
    (publisher) => {
      const existing = {
        citation: {
          type: "article",
          title: "Original",
          ...(publisher !== undefined ? { publisher } : {}),
        },
        provenance: parseCslProvenance({
          publisher: {
            rejected: [{ value: "Dismissed press", from: "user" }],
          },
        }),
      };
      expect(
        resolveCitation({ existing, claims: [remote("publisher", "Dismissed press")] }).suggestions,
      ).toEqual([]);
      const result = resolveCitation({
        existing,
        claims: [remote("publisher", "Different press")],
      });
      expect(result.suggestions).toMatchObject([
        { field: "publisher", reason: "fill", proposed: "Different press" },
      ]);
      expect(result.provenance).toMatchObject(existing.provenance);
    },
  );

  it("allows a different change without losing dismissals after external edits", () => {
    const provenance = {
      title: {
        value: "Original",
        source: "page:html",
        rejected: [{ value: "Dismissed", from: "user" }],
      },
    };
    const result = resolveCitation({
      existing: { citation: { type: "article", title: "Original" }, provenance },
      claims: [remote("title", "Different")],
    });
    expect(result.suggestions).toMatchObject([{ field: "title", proposed: "Different" }]);
    const edited = resolveCitation({
      existing: { citation: { type: "article", title: "Typed" }, provenance },
      claims: [],
    });
    expect(edited.provenance["title"]).toEqual({
      value: "Typed",
      source: "user",
      rejected: provenance.title.rejected,
    });
  });

  it("does not mistake resolver-rejected alternatives for user dismissals", () => {
    const result = resolveCitation({
      existing: {
        citation: { type: "article", title: "Original" },
        provenance: {
          title: {
            value: "Original",
            source: "page:html",
            rejected: [{ value: "Alternative", from: "page:json-ld" }],
          },
        },
      },
      claims: [remote("title", "Alternative")],
    });
    expect(result.suggestions).toMatchObject([{ field: "title", proposed: "Alternative" }]);
  });
});

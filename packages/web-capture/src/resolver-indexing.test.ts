import { describe, expect, it } from "vitest";

import { claimMatchKey, claimValuesMatch } from "./claim-matching.js";
import { resolveCitation } from "./resolver.js";

import type { Claim } from "./claims.js";

function claim(field: string, value: unknown, evidence: string): Claim {
  return { field, value, source: { kind: "page", signal: "json-ld" }, evidence, observedAt: "" };
}
const title = claim("title", "The work", "name");

describe("normalized equivalence buckets", () => {
  it.each([
    ["title", "  It’s   ‘Australia’! ", "it's 'AUSTRALIA'."],
    ["publisher", "eLife Sciences Publications, Ltd", "eLife Sciences Publications Limited"],
    [
      "author",
      [{ family: "Davies" }, { literal: "AP" }],
      [{ literal: "DAVIES", given: "Hywel" }, { literal: "ap" }],
    ],
    ["volume", 3, 3],
    ["issued", { literal: "Spring", circa: undefined }, { literal: "Spring" }],
  ])("indexes equivalent %s values together", (field, left, right) => {
    expect(claimValuesMatch(field as string, left, right)).toBe(true);
    expect(claimMatchKey(field as string, left)).toBe(claimMatchKey(field as string, right));
  });

  it("does not collide ordered names, separators within names, or numeric and string fields", () => {
    expect(claimMatchKey("author", [{ family: "a,b" }])).not.toBe(
      claimMatchKey("author", [{ family: "a" }, { family: "b" }]),
    );
    expect(claimMatchKey("volume", 3)).not.toBe(claimMatchKey("volume", "3"));
    expect(claimMatchKey("volume", -0)).not.toBe(claimMatchKey("volume", 0));
    expect(claimMatchKey("title", "Story - Site")).not.toBe(claimMatchKey("title", "Story"));
  });

  it("fills compatible literal surnames without merging different ordered lists", () => {
    const result = resolveCitation({
      claims: [
        title,
        claim("author", [{ literal: "Davies" }, { family: "Peters" }], "a"),
        claim(
          "author",
          [
            { family: "DAVIES", given: "Hywel" },
            { family: "Peters", given: "Jay" },
          ],
          "b",
        ),
        claim("author", [{ family: "Peters" }, { family: "Davies" }], "c"),
      ],
    });
    expect(result.citation?.["author"]).toEqual([
      { family: "DAVIES", given: "Hywel" },
      { family: "Peters", given: "Jay" },
    ]);
    expect(result.provenance["author"]?.agreed).toEqual(["page:json-ld b"]);
    expect(result.provenance["author"]?.rejected).toHaveLength(1);
  });
});

describe("partial-date index", () => {
  it("merges crossed endpoint precisions without losing the group's combined constraints", () => {
    const claims = [
      title,
      claim("issued", { "date-parts": [[2020, 3, 4], [2021]] }, "a"),
      claim("issued", { "date-parts": [["2020"], [2021, 5, 6]] }, "b"),
      claim(
        "issued",
        {
          "date-parts": [
            [2020, 3],
            [2021, 5],
          ],
        },
        "c",
      ),
      claim(
        "issued",
        {
          "date-parts": [
            [2020, 3],
            [2021, 6],
          ],
        },
        "d",
      ),
    ];
    const result = resolveCitation({ claims });
    expect(result.citation?.["issued"]).toEqual({ "date-parts": [[2020, 3, 4], [2021]] });
    expect(result.provenance["issued"]?.agreed).toEqual(["page:json-ld b", "page:json-ld c"]);
    expect(result.provenance["issued"]?.rejected).toEqual([
      {
        value: {
          "date-parts": [
            [2020, 3],
            [2021, 6],
          ],
        },
        from: "page:json-ld d",
      },
    ]);
    expect(resolveCitation({ claims: [...claims].reverse() })).toEqual(result);
  });

  it("keeps duplicated ambiguous prefixes separate from conflicting full dates and ranges", () => {
    const claims = [
      title,
      claim("issued", { "date-parts": [[2020, 3, 4]] }, "a"),
      claim("issued", { "date-parts": [[2020, 5, 6]] }, "b"),
      claim("issued", { "date-parts": [[2020]] }, "c"),
      claim("issued", { "date-parts": [[2020]] }, "d"),
      claim("issued", { "date-parts": [[2020], [2021]] }, "e"),
    ];
    const result = resolveCitation({ claims });
    expect(result.citation?.["issued"]).toEqual({ "date-parts": [[2020]] });
    expect(result.provenance["issued"]?.agreed).toEqual(["page:json-ld d"]);
    expect(resolveCitation({ claims: [...claims].reverse() })).toEqual(result);
  });
});

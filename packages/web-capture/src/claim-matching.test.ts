import { describe, expect, it } from "vitest";

import {
  claimValuesMatch,
  fillGivenNames,
  splitTitle,
  valueKey,
  withoutRoleNames,
} from "./claim-matching.js";

describe("claim matching", () => {
  it.each([" - ", " | ", " — ", " · "])("cleans the %s site suffix", (separator) => {
    expect(splitTitle(`Australia${separator}Wikipedia`)).toEqual({
      title: "Australia",
      suffix: "Wikipedia",
    });
    expect(claimValuesMatch("title", `Australia${separator}Wikipedia`, "AUSTRALIA.")).toBe(true);
  });

  it("ignores case, curly quotes, whitespace and trailing punctuation in titles", () => {
    expect(claimValuesMatch("title", "  It’s   ‘Australia’!  ", "it's 'australia'.")).toBe(true);
    expect(claimValuesMatch("title", "Australia", "Austria")).toBe(false);
    expect(splitTitle("A well-known country")).toEqual({ title: "A well-known country" });
  });

  it("matches family names or literals in order, without requiring the same given names", () => {
    expect(
      claimValuesMatch(
        "author",
        [{ family: "Davies" }, { literal: "Associated Press" }],
        [{ family: "DAVIES", given: "Hywel" }, { literal: "associated press" }],
      ),
    ).toBe(true);
    expect(
      claimValuesMatch("editor", [{ literal: "Davies" }], [{ family: "Davies", given: "Hywel" }]),
    ).toBe(true);
    expect(claimValuesMatch("author", [{ family: "Davies" }], [{ family: "Peters" }])).toBe(false);
    expect(
      claimValuesMatch(
        "author",
        [{ family: "Davies" }, { family: "Peters" }],
        [{ family: "Peters" }, { family: "Davies" }],
      ),
    ).toBe(false);
  });

  it("fills literal surnames and preserves name attributes and existing given names", () => {
    expect(
      fillGivenNames(
        [
          { literal: "Davies", "parse-names": false },
          { family: "Peters", given: "J." },
        ],
        [
          [
            { family: "Davies", given: "Hywel" },
            { family: "Peters", given: "Jay" },
          ],
        ],
      ),
    ).toEqual([
      { family: "Davies", given: "Hywel", "parse-names": false },
      { family: "Peters", given: "J." },
    ]);
  });

  it("matches compatible date-parts, including ranges, but not different months", () => {
    expect(
      claimValuesMatch("issued", { "date-parts": [[2026]] }, { "date-parts": [[2026, 10, 20]] }),
    ).toBe(true);
    expect(
      claimValuesMatch("issued", { "date-parts": [[2026, 10, 20]] }, { "date-parts": [[2026]] }),
    ).toBe(true);
    expect(
      claimValuesMatch(
        "issued",
        { "date-parts": [[2026, 10]] },
        { "date-parts": [[2026, 11, 20]] },
      ),
    ).toBe(false);
    expect(
      claimValuesMatch(
        "issued",
        { "date-parts": [[2026], [2027]] },
        {
          "date-parts": [
            [2026, 10],
            [2027, 1],
          ],
        },
      ),
    ).toBe(true);
    expect(claimValuesMatch("issued", { "date-parts": [[2026]] }, { literal: "2026" })).toBe(false);
  });
});

describe("claim name rules", () => {
  it.each([
    "staff reporter",
    "Guardian staff reporter",
    "The Guardian staff reporter",
    "editorial board",
    "staff",
    "correspondent",
    "newsroom",
    "reporter",
    "editor",
    "senior correspondent",
    "staff writer",
  ])("discards the whole role phrase %s", (literal) => {
    expect(withoutRoleNames([{ literal }])).toEqual([]);
  });

  it("does not discard people surnamed Reporter, Editor or Staff, or named organizations", () => {
    const names = [
      { given: "Jane", family: "Reporter" },
      { given: "Andrew", family: "Editor" },
      { given: "John", family: "Staff" },
      { literal: "Jane Reporter" },
      { literal: "Associated Press" },
      { literal: "Reporters Without Borders" },
    ];
    expect(withoutRoleNames(names)).toEqual(names);
    expect(withoutRoleNames([{ family: "reporter", given: "Guardian staff" }, ...names])).toEqual(
      names,
    );
  });

  it("matches CSL date-parts represented by strings or numbers", () => {
    expect(
      claimValuesMatch(
        "issued",
        { "date-parts": [["2026", "01"]] },
        { "date-parts": [[2026, 1, 20]] },
      ),
    ).toBe(true);
  });

  it("uses stable object-key ordering for final tie breaks", () => {
    expect(valueKey({ family: "Davies", given: "Hywel" })).toBe(
      valueKey({ given: "Hywel", family: "Davies" }),
    );
    expect(valueKey(undefined)).not.toBe(valueKey("undefined"));
  });
});

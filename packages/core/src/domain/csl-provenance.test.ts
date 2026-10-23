import { describe, expect, it } from "vitest";

import { cslFieldStatuses, cslValuesEqual, parseCslProvenance } from "./csl-provenance.js";

describe("CSL provenance", () => {
  it("keeps valid entries and drops malformed ones field by field", () => {
    expect(
      parseCslProvenance({
        title: {
          value: "Australia",
          source: "site-adapter:citoid/encyclopediaArticle",
          agreed: ["json-ld name", 3, "h1"],
          rejected: [
            { value: "country", from: "page:json-ld headline" },
            { value: "x", from: "a" },
            { value: "y", from: "b" },
            { from: "missing value" },
          ],
        },
        issued: { source: "registry:doi.org" },
        publisher: "Wikimedia",
        URL: { value: "https://en.wikipedia.org/wiki/Australia", source: " " },
      }),
    ).toEqual({
      title: {
        value: "Australia",
        source: "site-adapter:citoid/encyclopediaArticle",
        agreed: ["json-ld name", "h1"],
        rejected: [
          { value: "country", from: "page:json-ld headline" },
          { value: "x", from: "a" },
        ],
      },
    });
    expect(parseCslProvenance("garbage")).toEqual({});
  });

  it("compares CSL values structurally, ignoring key order", () => {
    expect(
      cslValuesEqual([{ family: "Peters", given: "Jay" }], [{ given: "Jay", family: "Peters" }]),
    ).toBe(true);
    expect(cslValuesEqual({ "date-parts": [[2026, 10]] }, { "date-parts": [[2026, 10, 1]] })).toBe(
      false,
    );
    expect(cslValuesEqual("1", 1)).toBe(false);
  });

  it("reports explained, edited, removed and unexplained fields", () => {
    const provenance = parseCslProvenance({
      title: { value: "Australia", source: "page:html" },
      "container-title": { value: "Wikipedia", source: "page:html" },
      issued: { value: { "date-parts": [[2026, 10, 20]] }, source: "registry:doi.org" },
    });
    const statuses = cslFieldStatuses(
      {
        title: "Australia",
        issued: { "date-parts": [[2001, 11, 4]] },
        URL: "https://en.wikipedia.org/wiki/Australia",
      },
      provenance,
    );
    expect(statuses["title"]?.kind).toBe("explained");
    expect(statuses["issued"]?.kind).toBe("edited");
    expect(statuses["container-title"]?.kind).toBe("removed");
    expect(statuses["URL"]?.kind).toBe("unexplained");
  });
});

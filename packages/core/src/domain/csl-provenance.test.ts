import { describe, expect, it } from "vitest";

import {
  cslFieldStatuses,
  cslValuesEqual,
  parseCslProvenance,
  preserveCslDismissals,
} from "./csl-provenance.js";

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
});

describe("CSL provenance dismissals", () => {
  it("round-trips user dismissals including dismissal-only fills without changing old records", () => {
    const old = { title: { value: "Original", source: "page:html" } };
    expect(parseCslProvenance(old)).toEqual(old);
    expect(parseCslProvenance(undefined)).toEqual({});
    const provenance = {
      ...old,
      publisher: {
        rejected: [{ value: "Dismissed press", from: "user" }],
      },
    };
    expect(parseCslProvenance(JSON.parse(JSON.stringify(provenance)))).toEqual(provenance);
    // Legacy parsers require both properties; dismissal-only entries are safely ignored.
    expect(provenance.publisher).not.toHaveProperty("value");
    expect(provenance.publisher).not.toHaveProperty("source");
    expect(cslFieldStatuses({ title: "Original" }, provenance)).not.toHaveProperty("publisher");
    expect(cslFieldStatuses({ publisher: "Typed" }, provenance)["publisher"]?.kind).toBe(
      "unexplained",
    );
    expect(
      cslFieldStatuses({}, { publisher: { value: null, source: "user" } })["publisher"]?.kind,
    ).toBe("removed");
  });

  it("only accepts bounded user rejections in dismissal-only entries", () => {
    const rejected = [
      { value: "Machine", from: "page:html" },
      { value: "First", from: "user" },
      { value: "Second", from: "user" },
      { value: "Third", from: "user" },
      { from: "user" },
    ];
    expect(
      parseCslProvenance({
        publisher: { rejected },
        language: { rejected: [{ value: "en", from: "page:html" }] },
        broken: { value: "No source", rejected },
      }),
    ).toEqual({ publisher: { rejected: rejected.slice(1, 3) } });
  });

  it("preserves and bounds user decisions across rewrites, preferring new decisions", () => {
    const previous = {
      title: {
        value: "Original",
        source: "page:html",
        rejected: [{ value: "Old dismissal", from: "user" }],
      },
    };
    const next = {
      title: {
        value: "Accepted",
        source: "registry:doi.org",
        rejected: [
          { value: "New dismissal", from: "user" },
          { value: "Machine alternative", from: "page:html" },
        ],
      },
    };
    expect(preserveCslDismissals(next, previous)["title"]?.rejected).toEqual([
      { value: "New dismissal", from: "user" },
      { value: "Old dismissal", from: "user" },
    ]);
    expect(preserveCslDismissals({}, previous)).toEqual(previous);
    expect(preserveCslDismissals(previous, previous)).toEqual(previous);
    expect(next.title.rejected).toHaveLength(2);
  });
});

describe("CSL provenance comparison and status", () => {
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

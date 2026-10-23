import { cslValuesEqual, validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { resolveCitation } from "./resolver.js";

import type { Claim, ClaimSource } from "./claims.js";

const page: ClaimSource = { kind: "page", signal: "json-ld" };
const html: ClaimSource = { kind: "page", signal: "html" };
const remote: ClaimSource = { kind: "generic-remote", name: "Citoid" };
const adapter: ClaimSource = { kind: "site-adapter", name: "Wikipedia" };
const registry: ClaimSource = { kind: "registry", name: "doi.org" };
const now = "2026-10-21T12:00:00Z";

function claim(
  field: string,
  value: unknown,
  source: ClaimSource = page,
  evidence = field,
  observedAt = now,
): Claim {
  return { field, value, source, evidence, observedAt };
}

function wikipediaClaims(): Claim[] {
  return [
    claim("title", "country", page, "headline"),
    claim("title", "Australia", page, "name"),
    claim("title", "Australia", html, "h1"),
    claim("title", "Australia - Wikipedia", { kind: "page", signal: "open-graph" }, "og:title"),
    claim("title", "Australia", adapter),
    claim("container-title", "Wikipedia", adapter),
    claim("container-title", "Wikimedia Foundation, Inc.", page, "publisher name"),
    claim("publisher", "Wikimedia Foundation, Inc."),
    claim("issued", { "date-parts": [[2001, 11, 4]] }),
    claim("issued", { "date-parts": [[2026, 10, 20]] }, adapter),
    claim("type", "entry-encyclopedia", adapter),
  ];
}

describe("citation resolution: corpus cases", () => {
  it("resolves Wikipedia field by field, recording agreements and rejected values", () => {
    const result = resolveCitation({ claims: wikipediaClaims() });
    expect(result.citation).toEqual({
      type: "entry-encyclopedia",
      title: "Australia",
      "container-title": "Wikipedia",
      publisher: "Wikimedia Foundation, Inc.",
      issued: { "date-parts": [[2026, 10, 20]] },
    });
    expect(result.suggestions).toEqual([]);
    expect(result.provenance["title"]).toEqual({
      value: "Australia",
      source: "site-adapter:Wikipedia",
      agreed: ["page:html h1", "page:json-ld name", "page:open-graph og:title"],
      rejected: [{ value: "country", from: "page:json-ld headline" }],
    });
    expect(result.provenance["container-title"]?.agreed).toContain(
      "page:open-graph og:title title suffix",
    );
    expect(result.provenance["container-title"]?.rejected).toEqual([
      { value: "Wikimedia Foundation, Inc.", from: "page:json-ld publisher name" },
    ]);
  });

  it("still chooses Australia and Wikipedia without Citoid", () => {
    const result = resolveCitation({
      claims: wikipediaClaims().filter((item) => item.source.kind !== "site-adapter"),
    });
    expect(result.citation).toMatchObject({ title: "Australia", "container-title": "Wikipedia" });
  });

  it("prefers ABC's fresher page headline to stale generic remote metadata", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Breaking: an election", remote, "title", "2026-10-20T00:00:00Z"),
        claim("title", "Election results announced", page, "headline"),
      ],
    });
    expect(result.citation?.["title"]).toBe("Election results announced");
  });

  it("fills BBC's generic remote author gap from the page", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "BBC report", remote),
        claim("author", [{ family: "Davies", given: "Hywel" }]),
      ],
    });
    expect(result.citation?.["author"]).toEqual([{ family: "Davies", given: "Hywel" }]);
  });

  it("discards Guardian's role-name, allowing Associated Press to win", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Guardian report"),
        claim("author", [{ family: "reporter", given: "Guardian staff" }]),
        claim("author", [{ literal: "Associated Press" }], remote),
      ],
    });
    expect(result.citation?.["author"]).toEqual([{ literal: "Associated Press" }]);
  });

  it("prefers a registry over conflicting page fields and types", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Page title"),
        claim("title", "Registry title", registry),
        claim("type", "webpage"),
        claim("type", "article-journal", registry),
      ],
    });
    expect(result.citation).toEqual({ title: "Registry title", type: "article-journal" });
  });
});

describe("citation resolution: scoring", () => {
  it.each([registry, { kind: "user" } as const])(
    "keeps an authoritative generic type from $kind",
    (source) => {
      const result = resolveCitation({
        claims: [
          claim("title", "A work"),
          claim("type", "article", source),
          ...Array.from({ length: 40 }, (_, index) =>
            claim("type", "article-journal", page, `signal ${String(index)}`),
          ),
        ],
      });
      expect(result.citation?.type).toBe("article");
    },
  );

  it("does not reparse a user's explicit name decision as an organisation", () => {
    const author = [{ family: "Press", given: "Associated" }];
    expect(
      resolveCitation({
        claims: [claim("title", "A work"), claim("author", author, { kind: "user" })],
      }).citation?.["author"],
    ).toEqual(author);
  });

  it("does not count repeated source + evidence as independent corroboration", () => {
    const duplicate = claim("title", "Repeated", page, "headline", "2026-10-20T00:00:00Z");
    const result = resolveCitation({
      claims: [...Array.from({ length: 30 }, () => duplicate), claim("title", "Current", remote)],
    });
    expect(result.citation?.["title"]).toBe("Current");
  });

  it("counts two agreeing page signals independently", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "country", page, "headline"),
        claim("title", "Australia", page, "name"),
        claim("title", "Australia", html, "h1"),
      ],
    });
    expect(result.citation?.["title"]).toBe("Australia");
    expect(result.provenance["title"]?.agreed).toHaveLength(1);
  });

  it("settles a one-signal near-tie by freshness", () => {
    const old = "2026-10-20T00:00:00Z";
    expect(
      resolveCitation({
        claims: [
          claim("title", "Old", html, "h1", old),
          claim("title", "Old", page, "name", old),
          claim("title", "New", remote),
        ],
      }).citation?.["title"],
    ).toBe("New");
  });

  it("keeps at most two best losing distinct values", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Winner", { kind: "user" }),
        claim("title", "Registry", registry),
        claim("title", "Adapter", adapter),
        claim("title", "Page"),
        claim("title", "PAGE", html),
      ],
    });
    expect(result.provenance["title"]?.rejected).toEqual([
      { value: "Registry", from: "registry:doi.org title" },
      { value: "Adapter", from: "site-adapter:Wikipedia title" },
    ]);
  });

  it("pins explicit user decisions even against many independent registry signals", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "My title", { kind: "user" }),
        ...Array.from({ length: 40 }, (_, index) =>
          claim("title", "Other", registry, `signal ${String(index)}`),
        ),
        claim("author", undefined, { kind: "user" }),
        claim("author", [{ family: "Davies" }], registry),
      ],
    });
    expect(result.citation?.["title"]).toBe("My title");
    expect(result.citation).not.toHaveProperty("author");
  });

  it("treats invalid observation times deterministically as older than valid times", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Invalid time", page, "headline", "not a date"),
        claim("title", "Valid time", remote),
      ],
    });
    expect(result.citation?.["title"]).toBe("Valid time");
  });
});

describe("citation resolution: normalization and validation", () => {
  it("writes clean titles while matching punctuation, quotes, whitespace and site suffixes", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "  “Australia”   today! | Wikipedia ", adapter),
        claim("title", '"AUSTRALIA" today.', page, "name"),
        claim("title", '"Australia" today', html, "h1"),
      ],
    });
    expect(result.citation?.["title"]).toBe("“Australia” today!");
    expect(result.provenance["title"]?.agreed).toHaveLength(2);
  });

  it("fills missing given names in a stronger matching list", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Report"),
        claim("author", [{ family: "Davies" }, { family: "Peters", given: "J." }], registry),
        claim("author", [
          { family: "DAVIES", given: "Hywel" },
          { family: "Peters", given: "Jay" },
        ]),
      ],
    });
    expect(result.citation?.["author"]).toEqual([
      { family: "Davies", given: "Hywel" },
      { family: "Peters", given: "J." },
    ]);
    expect(result.provenance["author"]?.value).toEqual(result.citation?.["author"]);
    expect(result.provenance["author"]?.source).toBe("registry:doi.org");
  });

  it("enriches a compatible partial date without letting a year bridge conflicting dates", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Report"),
        claim("issued", { "date-parts": [[2026]] }, registry),
        claim("issued", { "date-parts": [[2026, 10, 20]] }),
        claim(
          "issued",
          { "date-parts": [[2026, 11, 4]] },
          remote,
          "issued",
          "2026-10-19T00:00:00Z",
        ),
      ],
    });
    expect(result.citation?.["issued"]).toEqual({ "date-parts": [[2026, 10, 20]] });
    expect(result.provenance["issued"]?.agreed).toEqual(["page:json-ld issued"]);
  });

  it("never promotes a publisher fallback merely because the publisher agrees", () => {
    const result = resolveCitation({
      claims: [
        claim("title", "Report"),
        claim("container-title", "Foundation", registry, "publisher"),
        claim("publisher", "Foundation", registry),
        claim("container-title", "Journal", page, "journal name"),
      ],
    });
    expect(result.citation?.["container-title"]).toBe("Journal");
    expect(
      resolveCitation({
        claims: [
          claim("title", "Report"),
          claim("container-title", "Foundation", registry, "publisher"),
        ],
      }).citation,
    ).not.toHaveProperty("container-title");
  });

  it("returns null without surviving title evidence and drops invalid fields", () => {
    for (const title of [undefined, "", "   ", 12]) {
      expect(
        resolveCitation({ claims: [claim("title", title), claim("publisher", "Publisher")] }),
      ).toEqual({ citation: null, provenance: {}, suggestions: [] });
    }
    const result = resolveCitation({
      claims: [
        claim("title", "Report"),
        claim("issued", { "date-parts": [[false]] }),
        claim("type", "unknown"),
        claim("license", "MIT"),
      ],
    });
    expect(result.citation).toEqual({ title: "Report", type: "webpage" });
    expect(validateCslItem({ id: "test", ...result.citation }).valid).toBe(true);
    expect(Object.keys(result.provenance).sort((a, b) => a.localeCompare(b))).toEqual([
      "title",
      "type",
    ]);
  });
});

describe("citation resolution: existing CSL is canonical", () => {
  it("protects edited, unexplained and removed fields, proposing explained changes and fills", () => {
    const citation = {
      type: "webpage",
      title: "Manually edited",
      publisher: "Mine",
      "container-title": "Old journal",
      language: "en",
    };
    const provenance = {
      title: { value: "Original", source: "page:json-ld" },
      author: { value: [{ family: "Removed" }], source: "registry:doi.org" },
      "container-title": {
        value: "Old journal",
        source: "page:json-ld",
        agreed: ["page:html site"],
      },
      language: { value: "en", source: "legacy-source" },
    };
    const result = resolveCitation({
      existing: { citation, provenance },
      claims: [
        claim("title", "Registry title", registry),
        claim("author", [{ family: "Removed" }], registry),
        claim("publisher", "Registry publisher", registry),
        claim("container-title", "New journal", registry),
        claim("issued", { "date-parts": [[2026]] }, registry),
        claim("language", "fr", registry),
      ],
    });
    expect(result.citation).toBe(citation);
    expect(result.suggestions).toEqual([
      {
        field: "container-title",
        reason: "change",
        current: "Old journal",
        proposed: "New journal",
        source: registry,
        evidence: "container-title",
      },
      {
        field: "issued",
        reason: "fill",
        proposed: { "date-parts": [[2026]] },
        source: registry,
        evidence: "issued",
      },
    ]);
    expect(result.provenance["container-title"]).toEqual(provenance["container-title"]);
    expect(result.provenance["author"]).toEqual(provenance.author);
    expect(result.provenance["title"]).toEqual({ value: "Manually edited", source: "user" });
    expect(result.provenance).not.toHaveProperty("issued");
  });

  it("does not suggest a weaker value over an explained registry field", () => {
    const citation = { type: "article-journal", title: "Registry title" };
    const provenance = { title: { value: "Registry title", source: "registry:doi.org" } };
    const result = resolveCitation({
      existing: { citation, provenance },
      claims: [claim("title", "Page title")],
    });
    expect(result.suggestions).toEqual([]);
    expect(result.provenance["title"]).toEqual(provenance.title);
  });

  it("can suggest fresher evidence at the same rank and keeps existing fields byte-for-byte", () => {
    const citation = { type: "webpage", title: "  Old title  ", custom: { note: true } };
    const result = resolveCitation({
      existing: {
        citation,
        provenance: { title: { value: "  Old title  ", source: "generic-remote:Citoid" } },
      },
      claims: [claim("title", "New title")],
    });
    expect(result.citation).toBe(citation);
    expect(result.suggestions).toMatchObject([
      { field: "title", reason: "change", proposed: "New title" },
    ]);
  });

  it("leaves a manually removed title absent rather than returning an enriched citation", () => {
    const citation = { type: "webpage" };
    const result = resolveCitation({
      existing: { citation, provenance: { title: { value: "Removed", source: "page:html" } } },
      claims: [claim("title", "New title", registry)],
    });
    expect(result.citation).toBe(citation);
    expect(result.suggestions).toEqual([]);
  });
});

describe("citation resolution: existing-field edge cases", () => {
  it("does not re-extract existing titles into self-suggestions or user container claims", () => {
    const citation = { type: "webpage", title: "  Australia - Wikipedia  " };
    const provenance = { title: { value: citation.title, source: "page:html" } };
    const result = resolveCitation({ existing: { citation, provenance }, claims: [] });
    expect(result.citation).toBe(citation);
    expect(result.suggestions).toEqual([]);
    expect(result.provenance["title"]).toEqual(provenance.title);
    expect(result.provenance).not.toHaveProperty("container-title");

    const fill = resolveCitation({
      existing: { citation },
      claims: [claim("container-title", "An explicitly observed site")],
    });
    expect(fill.suggestions).toMatchObject([
      { field: "container-title", reason: "fill", proposed: "An explicitly observed site" },
    ]);
  });

  it("proposes fills for empty, non-removed fields without mutating them", () => {
    const citation = {
      type: "webpage",
      title: "Report",
      author: [],
      publisher: "",
      language: null,
    };
    const result = resolveCitation({
      existing: { citation },
      claims: [
        claim("author", [{ family: "Davies" }]),
        claim("publisher", "Publisher"),
        claim("language", "en"),
      ],
    });
    expect(result.citation).toBe(citation);
    expect(result.suggestions.map(({ field, reason }) => ({ field, reason }))).toEqual([
      { field: "author", reason: "fill" },
      { field: "language", reason: "fill" },
      { field: "publisher", reason: "fill" },
    ]);
  });

  it("uses weak default type provenance so a later specific type can be suggested", () => {
    const first = resolveCitation({ claims: [claim("title", "Report")] });
    const result = resolveCitation({
      existing: { citation: first.citation!, provenance: first.provenance },
      claims: [claim("type", "article-journal", registry)],
    });
    expect(result.citation?.type).toBe("webpage");
    expect(result.suggestions).toMatchObject([
      { field: "type", reason: "change", proposed: "article-journal" },
    ]);
  });
});

describe("citation resolution: purity", () => {
  it("is independent of claim ordering and does not mutate input values", () => {
    const claims = [
      ...wikipediaClaims(),
      claim("author", [{ family: "Davies" }], registry),
      claim("author", [{ family: "Davies", given: "Hywel" }]),
      claim("issued", { "date-parts": [[2026]] }, remote),
    ];
    const before = structuredClone(claims);
    const expected = resolveCitation({ claims });
    for (let index = 0; index < claims.length; index++) {
      const rotated = [...claims.slice(index), ...claims.slice(0, index)];
      expect(resolveCitation({ claims: rotated })).toEqual(expected);
      expect(resolveCitation({ claims: rotated.reverse() })).toEqual(expected);
    }
    expect(cslValuesEqual(claims, before)).toBe(true);
  });
});

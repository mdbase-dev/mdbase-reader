import { describe, expect, it } from "vitest";

import { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
import { parentCitationClaims } from "./parent-claims.js";
import { resolveCitation } from "./resolver.js";

import type { Claim, ClaimSource, Resolution } from "./claims.js";
import type { CslProvenance } from "@mdbase-reader/core";

const observedAt = "2026-10-24T12:00:00Z";
const later = "2026-10-25T12:00:00Z";
const page: ClaimSource = { kind: "page", signal: "highwire" };
const registry: ClaimSource = { kind: "registry", name: "doi.org" };
const author = [{ family: "Chapter", given: "Alice" }];
const bookAuthor = [{ family: "Book", given: "Bob" }];
const editor = [{ family: "Editor", given: "Eve" }];

function claim(field: string, value: unknown, source: ClaimSource = page): Claim {
  return { field, value, source, evidence: field, observedAt };
}

const chapterClaims = [
  claim("title", "A chapter"),
  claim("type", "chapter"),
  claim("author", author),
  claim("page", "12-34"),
  claim("DOI", "10.1000/chapter", registry),
  claim("URL", "https://example.org/chapter"),
  claim("abstract", "Chapter abstract"),
  claim("chapter-number", "2"),
];

function createChapter(parent: Readonly<Record<string, unknown>>): Resolution {
  return resolveCitation({
    claims: [...chapterClaims, ...parentCitationClaims(parent, undefined, observedAt)],
  });
}

function inheritedChapter(): {
  readonly citation: NonNullable<Resolution["citation"]>;
  readonly provenance: CslProvenance;
} {
  const result = resolveCitation({
    claims: [
      ...chapterClaims,
      claim("container-title", "Old book"),
      ...parentCitationClaims({ title: "Old book", publisher: "Old press" }, undefined, observedAt),
    ],
  });
  return { citation: result.citation!, provenance: result.provenance };
}

describe("parent citation mapping", () => {
  it.each<[string, string, unknown]>([
    ["title", "container-title", "The book"],
    ["title-short", "container-title-short", "Book"],
    ["editor", "editor", editor],
    ["author", "container-author", bookAuthor],
    ["publisher", "publisher", "A press"],
    ["publisher-place", "publisher-place", "London"],
    ["issued", "issued", { "date-parts": [[2020]] }],
    ["ISBN", "ISBN", "9780306406157"],
    ["edition", "edition", "2"],
    ["volume", "volume", "3"],
    ["collection-title", "collection-title", "A series"],
    ["collection-number", "collection-number", "7"],
    ["language", "language", "en"],
    ["number-of-volumes", "number-of-volumes", "4"],
  ])("maps %s to %s", (from, field, value) => {
    expect(parentCitationClaims({ [from]: value }, undefined, observedAt)).toEqual([
      { field, value, source: { kind: "parent" }, evidence: from, observedAt },
    ]);
  });

  it("does not inherit work identity, content, identifiers, or the parent's container", () => {
    expect(
      parentCitationClaims(
        {
          id: "private-book-path",
          type: "book",
          page: "1-999",
          DOI: "10.1000/book",
          URL: "https://example.org/book",
          abstract: "Book abstract",
          "chapter-number": "1",
          "container-title": "Grandparent",
          "container-author": editor,
        },
        undefined,
        observedAt,
      ),
    ).toEqual([]);
    expect(createChapter({ title: "Book", type: "book", author: bookAuthor }).citation).toEqual({
      ...Object.fromEntries(chapterClaims.map(({ field, value }) => [field, value])),
      "container-title": "Book",
      "container-author": bookAuthor,
    });
  });
});

describe("parent citation roles and scope", () => {
  it("preserves editor and author roles, with or without chapter authors or book editors", () => {
    const edited = createChapter({ title: "Book", editor, author: bookAuthor });
    expect(edited.citation).toMatchObject({ author, editor, "container-author": bookAuthor });
    const authored = createChapter({ title: "Book", author: bookAuthor });
    expect(authored.citation).toMatchObject({ author, "container-author": bookAuthor });
    expect(authored.citation).not.toHaveProperty("editor");
    const anonymous = resolveCitation({
      claims: [
        claim("title", "Anonymous chapter"),
        claim("type", "chapter"),
        ...parentCitationClaims({ author: bookAuthor }, undefined, observedAt),
      ],
    });
    expect(anonymous.citation).not.toHaveProperty("author");
    expect(anonymous.citation?.["container-author"]).toEqual(bookAuthor);
    expect(
      parentCitationClaims({ author: bookAuthor, editor }, undefined, observedAt, {
        includeContainerAuthor: false,
      }),
    ).toEqual([
      {
        field: "editor",
        value: editor,
        source: { kind: "parent" },
        evidence: "editor",
        observedAt,
      },
    ]);
  });

  it("reads only the immediate parent's canonical values, not its provenance or ancestors", () => {
    const provenance: CslProvenance = {
      title: { value: "Before edit", source: "registry:private", agreed: ["private-path"] },
      publisher: { value: "Removed press", source: "user" },
    };
    expect(
      parentCitationClaims(
        {
          type: "chapter",
          title: "Immediate volume",
          "container-title": "Grandparent series",
          volume: "2",
        },
        provenance,
        observedAt,
      ),
    ).toEqual([
      {
        field: "container-title",
        value: "Immediate volume",
        source: { kind: "parent" },
        evidence: "title",
        observedAt,
      },
      { field: "volume", value: "2", source: { kind: "parent" }, evidence: "volume", observedAt },
    ]);
  });

  it("ignores absent, empty and invalid values, and does not supply a chapter title or type", () => {
    expect(
      parentCitationClaims(
        { title: " ", editor: [], issued: "invalid", ISBN: null, volume: {} },
        undefined,
        observedAt,
      ),
    ).toEqual([]);
    expect(
      resolveCitation({ claims: parentCitationClaims({ title: "Book" }, undefined, observedAt) })
        .citation,
    ).toBeNull();
    expect(
      parentCitationClaims({ title: "Book", type: "book" }, undefined, observedAt).map(
        ({ field }) => field,
      ),
    ).toEqual(["container-title"]);
  });
});

describe("parent claims in the resolver", () => {
  it.each<ClaimSource>([
    page,
    { kind: "generic-remote", name: "citoid" },
    { kind: "site-adapter", name: "book-translator" },
    registry,
  ])("prefers the curated parent container over a conflicting $kind claim", (source) => {
    const result = resolveCitation({
      claims: [
        ...chapterClaims,
        claim("container-title", "Remote book title", source),
        ...parentCitationClaims({ title: "Curated book title" }, undefined, observedAt),
      ],
    });
    expect(result.citation?.["container-title"]).toBe("Curated book title");
    expect(result.provenance["container-title"]).toMatchObject({
      source: "parent title",
      rejected: [
        { value: "Remote book title", from: `${claimSourceLabel(source)} container-title` },
      ],
    });
    expect(result.citation?.["DOI"]).toBe("10.1000/chapter");
  });

  it("keeps parent publisher strength and attribution despite imprint heuristics", () => {
    const result = resolveCitation({
      claims: [
        ...chapterClaims,
        { ...claim("publisher", "Page press"), evidence: "citation_publisher" },
        {
          ...claim("publisher", "Page press", { kind: "page", signal: "dublin-core" }),
          evidence: "dc.publisher",
        },
        ...parentCitationClaims({ publisher: "Parent press" }, undefined, observedAt),
      ],
    });
    expect(result.citation?.["publisher"]).toBe("Parent press");
    const agreeing = resolveCitation({
      claims: [
        ...chapterClaims,
        { ...claim("publisher", "Parent press"), evidence: "citation_publisher" },
        ...parentCitationClaims({ publisher: "Parent press" }, undefined, observedAt),
      ],
    });
    expect(agreeing.provenance["publisher"]?.source).toBe("parent publisher");
  });
});

describe("parent claim score boundaries", () => {
  it("retains score-based corroboration rather than making parent evidence a veto", () => {
    const result = resolveCitation({
      claims: [
        ...chapterClaims,
        ...["DOI record", "ISBN record", "verified export", "extra evidence"].map((evidence) => ({
          ...claim("container-title", "Corroborated", registry),
          evidence,
        })),
        ...parentCitationClaims({ title: "Parent" }, undefined, observedAt),
      ],
    });
    expect(result.citation?.["container-title"]).toBe("Corroborated");
  });

  it("rejects hand-constructed parent claims for chapter-specific fields", () => {
    const result = resolveCitation({
      claims: [
        ...chapterClaims,
        ...[
          "title",
          "author",
          "DOI",
          "URL",
          "type",
          "id",
          "page",
          "abstract",
          "chapter-number",
        ].map((field) => claim(field, "Wrong", { kind: "parent" })),
      ],
    });
    expect(result.citation).toEqual(
      Object.fromEntries(chapterClaims.map(({ field, value }) => [field, value])),
    );
  });
});

describe("parent claim refresh", () => {
  it("suggests changed and newly filled parent values, without writing, even after old corroboration", () => {
    const existing = inheritedChapter();
    expect(existing.provenance["container-title"]?.agreed).toContain(
      "page:highwire container-title",
    );
    const refreshed = resolveCitation({
      existing,
      claims: parentCitationClaims(
        { title: "New book", publisher: "New press", ISBN: "9780306406157" },
        undefined,
        later,
      ),
    });
    expect(refreshed.citation).toEqual(existing.citation);
    expect(refreshed.provenance).toEqual(existing.provenance);
    expect(refreshed.suggestions).toEqual([
      expect.objectContaining({
        field: "ISBN",
        reason: "fill",
        proposed: "9780306406157",
        source: { kind: "parent" },
      }),
      expect.objectContaining({
        field: "container-title",
        reason: "change",
        current: "Old book",
        proposed: "New book",
      }),
      expect.objectContaining({
        field: "publisher",
        reason: "change",
        current: "Old press",
        proposed: "New press",
      }),
    ]);
    expect(
      resolveCitation({
        existing,
        claims: parentCitationClaims(
          { title: "Old book", publisher: "Old press" },
          undefined,
          later,
        ),
      }).suggestions,
    ).toEqual([]);
  });

  it("pins manual edits, manual unexplained values, and removed chapter fields", () => {
    const existing = inheritedChapter();
    const result = resolveCitation({
      existing: {
        citation: {
          ...existing.citation,
          "container-title": "My title",
          publisher: undefined,
          language: "fr",
        },
        provenance: existing.provenance,
      },
      claims: parentCitationClaims(
        { title: "New book", publisher: "New press", language: "en" },
        undefined,
        later,
      ),
    });
    expect(result.suggestions).toEqual([]);
    expect(result.citation?.["container-title"]).toBe("My title");
    expect(result.provenance["container-title"]?.source).toBe("user");
  });
});

describe("parent claim dismissals and labels", () => {
  it("respects change and fill dismissals while allowing a different future value", () => {
    const initial = inheritedChapter();
    const existing = {
      ...initial,
      provenance: {
        ...initial.provenance,
        "container-title": {
          ...initial.provenance["container-title"]!,
          rejected: [{ value: "New book", from: "user" }],
        },
        ISBN: { rejected: [{ value: "9780306406157", from: "user" }] },
      },
    };
    const dismissed = resolveCitation({
      existing,
      claims: parentCitationClaims({ title: "New book", ISBN: "9780306406157" }, undefined, later),
    });
    expect(dismissed.suggestions).toEqual([]);
    expect(dismissed.provenance["ISBN"]?.rejected).toEqual([
      { value: "9780306406157", from: "user" },
    ]);
    expect(
      resolveCitation({
        existing,
        claims: parentCitationClaims(
          { title: "Different book", ISBN: "9780000000000" },
          undefined,
          later,
        ),
      }).suggestions.map(({ field }) => field),
    ).toEqual(["ISBN", "container-title"]);
  });

  it("does not infer deletions from missing parent fields or revive removed ones", () => {
    const existing = inheritedChapter();
    expect(
      resolveCitation({ existing, claims: parentCitationClaims({}, undefined, later) }).suggestions,
    ).toEqual([]);
  });

  it("round-trips privacy-safe labels without record ids, names or paths", () => {
    expect(claimSourceLabel({ kind: "parent" })).toBe("parent");
    expect(parseClaimSourceLabel("parent")).toEqual({ kind: "parent" });
    expect(parseClaimSourceLabel("parent:private-path")).toBeUndefined();
    const result = createChapter({ title: "Private book", id: "private-path" });
    expect(result.provenance["container-title"]?.source).toBe("parent title");
  });
});

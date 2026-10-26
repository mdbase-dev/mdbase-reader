import {
  collectionId,
  fileId,
  fileRevision,
  resolveSearchQuote,
  searchDestinationMatchesDocument,
  sourceId,
} from "@mdbase-reader/core";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { LibraryTextIndex } from "./library-text-index.js";
import { LibraryTextStore } from "./library-text-store.js";
import { mergeLibraryDocumentMatches } from "./use-indexed-document-search.js";

import type { SourceSummary } from "@mdbase-reader/core";

const revision = `sha256:${"a".repeat(64)}`;
const source: SourceSummary = {
  id: sourceId("source"),
  collectionId: collectionId("collection"),
  path: "source.md",
  title: "A source",
  kind: "article",
  creators: [],
  tags: [],
  documents: [
    {
      fileId: fileId("file"),
      file: "page.html",
      revision: fileRevision(revision),
      mediaType: "text/html",
      role: "primary",
    },
  ],
};
const excerpt = { before: "", match: "needle", after: "" };
const quote = { exact: "needle", prefix: "Before ", suffix: " after." };
const hit = { fileId: "file", revision, excerpt, quote };
const destination = {
  document: { fileId: fileId("file"), file: "page.html", revision: fileRevision(revision) },
  location: { kind: "html" as const },
  quote,
};

describe("index + open document result merge", () => {
  it("deduplicates sources and binds quotation evidence to the indexed file and revision", () => {
    const matches = mergeLibraryDocumentMatches(
      [source],
      [hit, hit],
      new Map([[source.id, excerpt]]),
    );
    expect([...matches]).toEqual([[source.id, { file: "page.html", excerpt, destination }]]);
  });

  it("never displays deleted files or stale revisions while reconciliation is pending", () => {
    expect(
      mergeLibraryDocumentMatches([source], [{ ...hit, revision: "old" }], new Map()).size,
    ).toBe(0);
    expect(mergeLibraryDocumentMatches([], [hit], new Map()).size).toBe(0);
    expect(
      mergeLibraryDocumentMatches([source], [{ ...hit, fileId: "deleted" }], new Map()).size,
    ).toBe(0);
  });

  it("does not rebind an already returned destination when the current revision changes", () => {
    const mapped = mergeLibraryDocumentMatches([source], [hit], new Map()).get(source.id)!;
    const changed = { ...destination.document, revision: fileRevision(`sha256:${"b".repeat(64)}`) };
    expect(searchDestinationMatchesDocument(mapped.destination!, changed)).toBe(false);
    expect(mapped.destination?.document.revision).toBe(revision);
  });

  it("prefers a loaded destination and its matching excerpt/file over an index hit", () => {
    const loaded = {
      ...excerpt,
      match: "Loaded needle",
      destination: {
        ...destination,
        document: { ...destination.document, file: "loaded.html", fileId: fileId("loaded") },
        quote: { exact: "Loaded needle" },
      },
    };
    const matches = mergeLibraryDocumentMatches([source], [hit], new Map([[source.id, loaded]]));
    expect(matches.get(source.id)).toEqual({
      file: "loaded.html",
      excerpt: { ...excerpt, match: "Loaded needle" },
      destination: loaded.destination,
    });
  });

  it("preserves loaded-document destinations when the index is unavailable", () => {
    expect(
      mergeLibraryDocumentMatches(
        [source],
        [],
        new Map([[source.id, { ...excerpt, destination }]]),
      ).get(source.id),
    ).toEqual({ file: "page.html", excerpt, destination });
  });

  it("maps worker hits using original Unicode and real context, not excerpt ellipses or query syntax", async () => {
    const store = new LibraryTextStore(new IDBFactory());
    const index = new LibraryTextIndex("collection", store);
    const text = `${"Earlier context. ".repeat(20)}Une CAFÉ déjà vu. 世界文学研究 and 한글. ${"Later context. ".repeat(20)}`;
    await index.put({ fileId: "file", revision }, text);
    // Reopen the persisted text: no new extraction or resident surface is needed.
    const reopened = new LibraryTextIndex("collection", store);
    await reopened.load();
    for (const [query, exact] of [
      ['"cafe deja vu" 世界', "CAFÉ déjà vu"],
      ["界文学", "界文学"],
      ["한글", "한글"],
    ]) {
      const mapped = mergeLibraryDocumentMatches([source], reopened.search(query!), new Map()).get(
        source.id,
      )!;
      expect(mapped.destination?.document).toEqual(destination.document);
      expect(mapped.destination?.location).toEqual({ kind: "html" });
      expect(mapped.destination?.quote.exact).toBe(exact);
      expect(mapped.destination?.quote.prefix).toBeTruthy();
      expect(mapped.destination?.quote.suffix).toBeTruthy();
      expect(mapped.destination?.quote.prefix).not.toContain("…");
      expect(mapped.destination?.quote.suffix).not.toContain("…");
      const range = resolveSearchQuote(text, mapped.destination!.quote)!;
      expect(text.slice(range.start, range.end)).toBe(exact);
      expect(mapped.excerpt.match).toBe(exact);
    }
  });

  it("retains ambiguous evidence for strict renderer verification rather than guessing a position", async () => {
    const index = new LibraryTextIndex("collection", new LibraryTextStore(new IDBFactory()));
    const text =
      "Ambiguous passage with exactly repeated surrounding evidence and extra context. ".repeat(20);
    await index.put({ fileId: "file", revision }, text);
    const mapped = mergeLibraryDocumentMatches(
      [source],
      index.search('"Ambiguous passage"'),
      new Map(),
    ).get(source.id)!;
    expect(mapped.destination?.quote.exact).toBe("Ambiguous passage");
    expect(resolveSearchQuote(text, mapped.destination!.quote)).toBeNull();
  });
});

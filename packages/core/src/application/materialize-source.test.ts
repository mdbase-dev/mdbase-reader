import { describe, expect, it } from "vitest";

import {
  annotationId,
  collectionId,
  dateTime,
  materializeSource,
  recordRevision,
  sourceId,
  type Annotation,
  type Source,
} from "../index.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/crime.md",
  title: "Crime and Punishment",
  creators: ["Fyodor Dostoevsky"],
  tags: [],
  documents: [],
  citation: { id: "dostoevsky2002", type: "book", title: "Crime and Punishment" },
  body: "A passage:\n\n![[annotations/ann_01]]\n\nCompare [@eliot1871].",
  recordRevision: recordRevision("rev-1"),
  frontmatter: {},
};

const annotation: Annotation = {
  collectionId: source.collectionId,
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  sourceId: source.id,
  source: "[[src_01]]",
  annotationType: "highlight",
  locator: { label: "p. 16" },
  target: { quote: { exact: "Man grows used to everything, the scoundrel!" } },
  tags: [],
  body: "> Man grows used to everything, the scoundrel!\n\nA useful connection.",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("materializeSource", () => {
  it("resolves annotation embeds without changing authored prose", () => {
    const result = materializeSource(
      source,
      [annotation],
      [
        source,
        {
          ...source,
          id: sourceId("src_02"),
          citation: { id: "eliot1871", type: "book", title: "Middlemarch" },
        },
      ],
    );

    expect(result.markdown).toBe(
      "A passage:\n\n> Man grows used to everything, the scoundrel!\n>\n> — [@dostoevsky2002, p. 16]\n\nA useful connection.\n\nCompare [@eliot1871].\n",
    );
    expect(result.bibliography.map(({ id }) => id)).toEqual(["dostoevsky2002", "eliot1871"]);
    expect(result.renderedAnnotations).toEqual([annotation.id]);
    expect(result.problems).toEqual([]);
    expect(source.body).toContain("![[annotations/ann_01]]");
  });

  it("preserves broken and cyclic embeds visibly and reports them", () => {
    const cyclic = {
      ...annotation,
      body: "![[annotations/ann_01]]\n\n![[annotations/missing]]",
    };
    const result = materializeSource(
      { ...source, body: "![[annotations/ann_01]]" },
      [cyclic],
      [source],
    );

    expect(result.markdown).toContain("![[annotations/ann_01]]");
    expect(result.markdown).toContain("![[annotations/missing]]");
    expect(result.problems.map(({ kind }) => kind)).toEqual(["cycle", "broken-embed"]);
  });

  it("uses a readable title fallback when CSL data is absent", () => {
    const { citation, ...uncitedSource } = source;
    void citation;
    const result = materializeSource({ ...uncitedSource, body: "![[ann_01]]" }, [annotation], []);

    expect(result.markdown).toContain("> — Crime and Punishment, p. 16");
    expect(result.bibliography).toEqual([]);
  });

  it("materializes the authored blockquote rather than selector evidence", () => {
    const edited = {
      ...annotation,
      target: { quote: { exact: "Noisy text extracted from the PDF." } },
      body: "> A carefully corrected quotation.\n\nEditorial commentary.",
    };
    const result = materializeSource(source, [edited], [source]);

    expect(result.markdown).toContain("> A carefully corrected quotation.");
    expect(result.markdown).not.toContain("Noisy text extracted from the PDF.");
  });

  it("does not restore selector evidence after the authored blockquote is removed", () => {
    const edited = {
      ...annotation,
      target: { quote: { exact: "Anchor evidence that should remain hidden." } },
      body: "Editorial commentary only.",
    };
    const result = materializeSource(source, [edited], [source]);

    expect(result.markdown).toContain("Editorial commentary only.\n\n— [@dostoevsky2002, p. 16]");
    expect(result.markdown).not.toContain("Anchor evidence that should remain hidden.");
  });
});

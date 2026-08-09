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
  path: "sources/gravity.md",
  title: "Gravity and Grace",
  creators: ["Simone Weil"],
  tags: [],
  documents: [],
  citation: { id: "weil2002", type: "book", title: "Gravity and Grace" },
  body: "A passage:\n\n![[annotations/ann_01]]\n\nCompare [@murdoch1970].",
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
  target: { quote: { exact: "The imagination is continually at work." } },
  tags: [],
  body: "> The imagination is continually at work.\n\nA useful connection.",
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
          citation: { id: "murdoch1970", type: "book", title: "The Sovereignty of Good" },
        },
      ],
    );

    expect(result.markdown).toBe(
      "A passage:\n\n> The imagination is continually at work.\n>\n> — [@weil2002, p. 16]\n\nA useful connection.\n\nCompare [@murdoch1970].\n",
    );
    expect(result.bibliography.map(({ id }) => id)).toEqual(["weil2002", "murdoch1970"]);
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

    expect(result.markdown).toContain("> — Gravity and Grace, p. 16");
    expect(result.bibliography).toEqual([]);
  });
});

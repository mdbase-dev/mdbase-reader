import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContinueReading } from "./ContinueReading.js";
import { NavigatorShortList } from "./NavigatorSections.js";
import { sourceCreatorsText, sourcesById } from "./source-creators.js";

const book: SourceSummary = {
  collectionId: collectionId("test"),
  id: sourceId("book"),
  path: "book.md",
  title: "The book",
  creators: ["Ada Author", "Bea Author"],
  tags: [],
  documents: [],
};
const chapter: SourceSummary = {
  ...book,
  id: sourceId("chapter"),
  path: "chapter.md",
  title: "A chapter",
  creators: [],
  partOf: book.id,
  reading: { status: "reading", progress: 0.4 },
  documents: [
    {
      fileId: fileId("book-file"),
      file: "[[book.pdf]]",
      mediaType: "application/pdf",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      role: "primary",
    },
  ],
};

describe("source creators", () => {
  it("shows a chapter by its book's creators, or none when the book is not loaded", () => {
    expect(sourceCreatorsText(chapter, sourcesById([book, chapter]))).toBe(
      "Ada Author, Bea Author",
    );
    expect(sourceCreatorsText(chapter, sourcesById([chapter]), "Unknown creator")).toBe("");
    expect(sourceCreatorsText({ ...book, creators: [] }, new Map(), "Unknown creator")).toBe(
      "Unknown creator",
    );
    expect(sourceCreatorsText({ ...chapter, creators: ["Cy Chapter"] }, sourcesById([book]))).toBe(
      "Cy Chapter",
    );
  });

  it("never lists a chapter as by an unknown creator in Open or Continue reading", () => {
    const open = renderToStaticMarkup(
      <NavigatorShortList
        label="Open"
        sources={[chapter]}
        library={sourcesById([chapter])}
        selectedSourceId={null}
        onPreviewSource={() => undefined}
        onOpenSource={() => undefined}
        onOpenBeside={() => undefined}
      />,
    );
    expect(open).not.toContain("Unknown creator");
    expect(open).toContain("<small>40%</small>");
    const resume = renderToStaticMarkup(
      <ContinueReading sources={[book, chapter]} onOpen={() => undefined} />,
    );
    expect(resume).toContain("Ada Author, Bea Author · 40%");
  });
});

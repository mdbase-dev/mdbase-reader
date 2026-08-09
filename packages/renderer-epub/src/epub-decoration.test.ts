import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { Manifest, Publication } from "@readium/shared";
import { describe, expect, it } from "vitest";

import { annotationToEpubDecoration } from "./epub-decoration.js";

const baseUrl = "https://reader.test/__mdbase-reader/epub/current-session/";
const manifest = Manifest.deserialize({
  metadata: { title: "A book" },
  readingOrder: [
    { href: `${baseUrl}OEBPS/cover.xhtml`, type: "application/xhtml+xml" },
    { href: `${baseUrl}OEBPS/chapter.xhtml`, type: "application/xhtml+xml" },
  ],
});
if (!manifest) {
  throw new Error("Test manifest is invalid.");
}
const publication = new Publication({ manifest });

describe("annotationToEpubDecoration", () => {
  it("hydrates a durable EPUB target into the current Readium session", () => {
    expect(
      annotationToEpubDecoration(
        {
          collectionId: collectionId("reading"),
          id: annotationId("ann-1"),
          sourceId: sourceId("source-1"),
          source: "[[source-1]]",
          annotationType: "highlight",
          color: "yellow",
          target: {
            quote: { exact: "Selected EPUB text", prefix: "Before", suffix: "After" },
            epub: { cfi: "epubcfi(/6/4!/4/2:8)" },
          },
          tags: [],
          body: "> Selected EPUB text",
          createdAt: dateTime("2026-08-10T00:00:00.000Z"),
        },
        publication,
        baseUrl,
      ),
    ).toMatchObject({
      id: "ann-1",
      locator: {
        href: `${baseUrl}OEBPS/chapter.xhtml`,
        locations: { fragments: ["epubcfi(/6/4!/4/2:8)"] },
      },
      style: { type: "highlight", tint: "#f2cf63" },
    });
  });

  it("ignores a CFI that cannot identify a reading-order resource", () => {
    expect(
      annotationToEpubDecoration(
        {
          collectionId: collectionId("reading"),
          id: annotationId("ann-1"),
          sourceId: sourceId("source-1"),
          source: "[[source-1]]",
          annotationType: "highlight",
          target: { quote: { exact: "Selected EPUB text" }, epub: { cfi: "epubcfi(/4/2:8)" } },
          tags: [],
          body: "",
          createdAt: dateTime("2026-08-10T00:00:00.000Z"),
        },
        publication,
        baseUrl,
      ),
    ).toBeNull();
  });
});

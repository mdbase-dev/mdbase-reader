import { describe, expect, it } from "vitest";

import { annotationLocationLabel, humanPassageLabel } from "./passage-labels.js";

import type { Annotation } from "@mdbase-reader/core";

const annotation = (value: Partial<Annotation>): Annotation =>
  ({
    annotationType: "highlight",
    tags: [],
    body: "",
    ...value,
  }) as Annotation;

describe("human passage locations", () => {
  it.each([
    "[[files/reader/src_19/page.html]]",
    "files/reader/page.html",
    "page.xhtml#section",
    "chapter.epub",
    "https://example.com/page",
    "C:\\reader\\page.pdf",
    "epubcfi(/6/2)",
  ])("does not display a file or renderer address: %s", (label) => {
    expect(humanPassageLabel(label)).toBeUndefined();
  });

  it.each(["Introduction: The Problem", "TCP/IP Illustrated", "Note: on method"])(
    "keeps a title with colons or slashes: %s",
    (label) => {
      expect(humanPassageLabel(label)).toBe(label);
    },
  );

  it("keeps authored section labels and falls back for older HTML annotations", () => {
    expect(
      annotationLocationLabel(annotation({ locator: { label: "  Methods and results  " } })),
    ).toBe("Methods and results");
    expect(
      annotationLocationLabel(
        annotation({
          locator: { label: "[[files/reader/page.html]]" },
          target: { html: { css: "p" } },
        }),
      ),
    ).toBe("Web page");
    expect(
      annotationLocationLabel(annotation({ locator: { label: "files/unknown" } })),
    ).toBeUndefined();
  });

  it("uses an EPUB chapter title when available, never its href or CFI", () => {
    expect(
      annotationLocationLabel(
        annotation({
          locator: { label: "EPUB location" },
          target: {
            position: { kind: "epub", locator: { href: "chapter.xhtml", title: "Chapter IV" } },
          },
        }),
      ),
    ).toBe("Chapter IV");
    expect(
      annotationLocationLabel(
        annotation({
          locator: { label: "OEBPS/chapter.xhtml" },
          target: { epub: { cfi: "epubcfi(/6/2)" } },
        }),
      ),
    ).toBe("EPUB");
  });

  it("retains PDF page labels and recovers a page from the saved target", () => {
    expect(annotationLocationLabel(annotation({ locator: { label: "p. 1" } }))).toBe("p. 1");
    expect(
      annotationLocationLabel(
        annotation({
          locator: { label: "[[files/paper.pdf]]" },
          target: { position: { kind: "pdf", pageIndex: 8 } },
        }),
      ),
    ).toBe("p. 9");
  });
});

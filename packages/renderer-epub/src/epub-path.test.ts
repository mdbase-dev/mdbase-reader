import { describe, expect, it } from "vitest";

import { epubResourceUrl, resolveEpubPath, safeEpubPath } from "./epub-path.js";

describe("EPUB paths", () => {
  it("resolves package-relative resources and preserves fragments separately", () => {
    expect(resolveEpubPath("OEBPS/nav/toc.xhtml", "../text/chapter%201.xhtml#part")).toBe(
      "OEBPS/text/chapter 1.xhtml",
    );
    expect(epubResourceUrl("https://reader.test/book/", "OEBPS/text/chapter 1.xhtml", "part")).toBe(
      "https://reader.test/book/OEBPS/text/chapter%201.xhtml#part",
    );
  });

  it("rejects paths that escape the archive", () => {
    expect(() => resolveEpubPath("content.opf", "../outside.xhtml")).toThrow(/escapes/u);
    expect(() => safeEpubPath("../../outside.xhtml")).toThrow(/unsafe/u);
    expect(() => safeEpubPath("/absolute.xhtml")).toThrow(/unsafe/u);
  });
});

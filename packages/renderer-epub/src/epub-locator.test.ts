import { Locator, LocatorLocations, Manifest, Publication } from "@readium/shared";
import { describe, expect, it } from "vitest";

import {
  readingOrderIndexFromCfi,
  sessionReadiumLocator,
  sessionReadiumLocatorForPublication,
  stableEpubHref,
  stableReadiumLocator,
} from "./epub-locator.js";

const firstBase = "https://reader.test/__mdbase-reader/epub/session-one/";
const secondBase = "https://reader.test/__mdbase-reader/epub/session-two/";

describe("EPUB locator sessions", () => {
  it("persists package-relative resource paths without the transient session", () => {
    const locator = new Locator({
      href: `${firstBase}OEBPS/Text/chapter%201.xhtml`,
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ fragments: ["epubcfi(/6/4!/4/2:8)"] }),
    });

    expect(stableReadiumLocator(locator, firstBase)).toEqual({
      href: "OEBPS/Text/chapter 1.xhtml",
      type: "application/xhtml+xml",
      locations: {
        fragments: ["epubcfi(/6/4!/4/2:8)"],
      },
    });
  });

  it("rehydrates persisted and previous-session locators into the active session", () => {
    const persisted = {
      href: "OEBPS/Text/chapter 1.xhtml",
      type: "application/xhtml+xml",
      locations: { fragments: ["epubcfi(/6/4!/4/2:8)"] },
    };
    expect(sessionReadiumLocator(persisted, secondBase)?.href).toBe(
      `${secondBase}OEBPS/Text/chapter%201.xhtml`,
    );
    expect(stableEpubHref(`${firstBase}OEBPS/Text/chapter%201.xhtml`, secondBase)).toBe(
      "OEBPS/Text/chapter 1.xhtml",
    );
  });

  it("rejects locations outside Reader's isolated publication origin", () => {
    expect(() => stableEpubHref("https://untrusted.example/chapter.xhtml", firstBase)).toThrow(
      "outside the prepared publication",
    );
  });

  it("resolves a canonical package CFI to its reading-order resource", () => {
    const manifest = Manifest.deserialize({
      metadata: { title: "A book" },
      readingOrder: [
        { href: `${secondBase}OEBPS/cover.xhtml`, type: "application/xhtml+xml" },
        { href: `${secondBase}OEBPS/chapter.xhtml`, type: "application/xhtml+xml" },
      ],
    });
    if (!manifest) {
      throw new Error("Test manifest is invalid.");
    }
    const locator = sessionReadiumLocatorForPublication(
      {
        type: "application/xhtml+xml",
        locations: { fragments: ["epubcfi(/6/4[chapter]!/4/2:8)"] },
      },
      new Publication({ manifest }),
      secondBase,
    );

    expect(readingOrderIndexFromCfi("epubcfi(/6/4[chapter]!/4/2:8)")).toBe(1);
    expect(locator?.href).toBe(`${secondBase}OEBPS/chapter.xhtml`);
  });
});

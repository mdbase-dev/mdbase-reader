import { Locator, LocatorLocations, Manifest, Publication } from "@readium/shared";
import { describe, expect, it } from "vitest";

import {
  publicationPositions,
  readiumSelectionToDraft,
  serializeReadiumLocator,
} from "./readium-runtime.js";

describe("publicationPositions", () => {
  it("gives Readium a valid initial locator and coarse position for every spine item", () => {
    const manifest = Manifest.deserialize({
      metadata: { title: "A book" },
      readingOrder: [
        { href: "https://reader.test/book/one.xhtml", type: "application/xhtml+xml" },
        { href: "https://reader.test/book/two.xhtml", type: "application/xhtml+xml" },
      ],
    });
    if (!manifest) {
      throw new Error("Test manifest is invalid.");
    }

    expect(
      publicationPositions(new Publication({ manifest })).map((locator) =>
        serializeReadiumLocator(locator),
      ),
    ).toEqual([
      {
        href: "https://reader.test/book/one.xhtml",
        type: "application/xhtml+xml",
        locations: { fragments: [], progression: 0, totalProgression: 0, position: 1 },
      },
      {
        href: "https://reader.test/book/two.xhtml",
        type: "application/xhtml+xml",
        locations: { fragments: [], progression: 0, totalProgression: 1, position: 2 },
      },
    ]);
  });
});

describe("readiumSelectionToDraft", () => {
  it("keeps a durable locator with the canonical CFI range", () => {
    const locator = new Locator({
      href: "https://reader.test/__mdbase-reader/epub/session/OEBPS/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({
        fragments: ["epubcfi(/6/4!/4/2,/1:0,/1:12)"],
      }),
    });

    expect(
      readiumSelectionToDraft({
        text: "Selected text",
        targetFrameSrc: locator.href,
        locator,
        publicationBaseUrl: "https://reader.test/__mdbase-reader/epub/session/",
      }),
    ).toMatchObject({
      target: {
        quote: { exact: "Selected text" },
        epub: {
          cfi: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        },
      },
      locator: { kind: "epub", locator: { href: "OEBPS/chapter.xhtml" } },
    });
  });
});

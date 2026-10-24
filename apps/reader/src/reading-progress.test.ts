import { collectionId, sourceId, type SourceSummary } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { readingLocationLabel, readingPassage, readingProgressValue } from "./reading-progress.js";

const base: SourceSummary = {
  collectionId: collectionId("test"),
  id: sourceId("s"),
  path: "s.md",
  title: "S",
  creators: [],
  tags: [],
  documents: [],
};

function at(reading: SourceSummary["reading"]): SourceSummary {
  return { ...base, ...(reading ? { reading } : {}) };
}

describe("reading progress", () => {
  it("prefers saved progress, then the position's own progression", () => {
    expect(readingProgressValue(at({ status: "reading", progress: 0.314 }))).toBe(31);
    expect(
      readingProgressValue(
        at({
          status: "reading",
          position: { kind: "epub", locator: { locations: { totalProgression: 0.68 } } },
        }),
      ),
    ).toBe(68);
    expect(readingProgressValue(at({ status: "reading" }))).toBeNull();
    expect(readingProgressValue(base)).toBeNull();
  });

  it("names a PDF page with its page count once known, and an EPUB chapter by title", () => {
    const pdf = at({ status: "reading", position: { kind: "pdf", pageIndex: 6 } });
    expect(readingLocationLabel(pdf)).toBe("Page 7");
    expect(readingLocationLabel(pdf, 11)).toBe("Page 7 of 11");
    expect(
      readingLocationLabel(
        at({
          status: "reading",
          progress: 0.31,
          position: { kind: "epub", locator: { title: "Chapter XI" } },
        }),
      ),
    ).toBe("Chapter XI · 31%");
  });

  it("quotes the saved passage only when the position carries its text", () => {
    expect(
      readingPassage(
        at({
          status: "reading",
          position: {
            kind: "epub",
            locator: { text: { highlight: "  the learning rate\nsometimes needs changing " } },
          },
        }),
      ),
    ).toBe("the learning rate sometimes needs changing");
    expect(
      readingPassage(at({ status: "reading", position: { kind: "pdf", pageIndex: 1 } })),
    ).toBeNull();
    expect(readingPassage(at({ status: "reading", position: { kind: "epub", locator: {} } }))).toBe(
      null,
    );
  });
});

import { describe, expect, it } from "vitest";

import { sourceId } from "../domain/identity.js";

import { sourceRecordPaths } from "./source-import-values.js";

const id = sourceId("src_3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b");

describe("sourceRecordPaths", () => {
  it("names the note from its title, with an ID-suffixed fallback", () => {
    expect(sourceRecordPaths("Gravity and Grace", id)).toEqual({
      recordPath: "sources/gravity-and-grace.md",
      fallbackRecordPath: "sources/gravity-and-grace-3f2a9c1e.md",
    });
  });

  it("drops apostrophes and punctuation but keeps non-Latin letters", () => {
    expect(sourceRecordPaths("Weil’s “Attention” — notes", id).recordPath).toBe(
      "sources/weils-attention-notes.md",
    );
    expect(sourceRecordPaths("重力と恩寵", id).recordPath).toBe("sources/重力と恩寵.md");
  });

  it("caps long titles without a trailing separator", () => {
    const { recordPath } = sourceRecordPaths(`${"word ".repeat(30)}end`, id);
    expect(recordPath).toMatch(/^sources\/(word-)+word\.md$/u);
    expect(recordPath.length).toBeLessThanOrEqual("sources/.md".length + 60);
  });

  it("falls back to the ID when the title yields no name", () => {
    expect(sourceRecordPaths("!!!", id)).toEqual({
      recordPath: `sources/${id}.md`,
      fallbackRecordPath: `sources/${id}.md`,
    });
  });
});

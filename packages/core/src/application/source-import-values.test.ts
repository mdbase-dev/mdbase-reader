import { describe, expect, it } from "vitest";

import { sourceId } from "../domain/identity.js";

import { authorYearFromMetadata, sourceRecordPaths } from "./source-import-values.js";

const id = sourceId("src_3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b");

describe("sourceRecordPaths", () => {
  it("names the note from its title, with an ID-suffixed fallback", () => {
    expect(sourceRecordPaths("Crime and Punishment", id)).toEqual({
      recordPath: "sources/crime-and-punishment.md",
      fallbackRecordPath: "sources/crime-and-punishment-3f2a9c1e.md",
      recordPathCandidates: [
        "sources/crime-and-punishment.md",
        "sources/crime-and-punishment-5a6b.md",
        "sources/crime-and-punishment-3e4f5a6b.md",
        `sources/${id}.md`,
      ],
    });
  });

  it("offers an author–year name before the ID suffix", () => {
    const paths = sourceRecordPaths("Introduction", id, { family: "Smith", year: 2019 });
    expect(paths.recordPath).toBe("sources/introduction.md");
    expect(paths.fallbackRecordPath).toBe("sources/introduction-3f2a9c1e.md");
    expect(paths.recordPathCandidates.slice(0, 3)).toEqual([
      "sources/introduction.md",
      "sources/introduction-smith-2019.md",
      "sources/introduction-5a6b.md",
    ]);
  });

  it("drops apostrophes and punctuation but keeps non-Latin letters", () => {
    expect(sourceRecordPaths("Dostoevsky’s “Attention” — notes", id).recordPath).toBe(
      "sources/dostoevskys-attention-notes.md",
    );
    expect(sourceRecordPaths("重力と恩寵", id).recordPath).toBe("sources/重力と恩寵.md");
  });

  it("keeps combining marks inside words", () => {
    expect(sourceRecordPaths("हिन्दी व्याकरण", id).recordPath).toBe("sources/हिन्दी-व्याकरण.md");
    expect(sourceRecordPaths("ภาษาไทย", id).recordPath).toBe("sources/ภาษาไทย.md");
  });

  it("caps long titles without a trailing separator", () => {
    const { recordPath } = sourceRecordPaths(`${"word ".repeat(30)}end`, id);
    expect(recordPath).toMatch(/^sources\/(word-)+word\.md$/u);
    expect(recordPath.length).toBeLessThanOrEqual("sources/.md".length + 60);
  });

  it("keeps every existing ASCII fallback path, which an interrupted import is resumed by", () => {
    // The fallback as it was written before the naming module.
    const before = (title: string): string => {
      const slug = title
        .normalize("NFKC")
        .toLowerCase()
        .replace(/['’]/gu, "")
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-+|-+$/gu, "");
      const stem = Array.from(slug).slice(0, 60).join("").replace(/-+$/u, "");
      return stem ? `sources/${stem}-3f2a9c1e.md` : `sources/${id}.md`;
    };
    const alphabet = "abcXYZ019 -_.,:;!?'’()[]&";
    let seed = 7;
    for (let index = 0; index < 2_000; index += 1) {
      let title = "";
      const length = index % 140;
      for (let position = 0; position < length; position += 1) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        title += alphabet[seed % alphabet.length] ?? "";
      }
      expect(sourceRecordPaths(title, id).fallbackRecordPath).toBe(before(title));
    }
  });

  it("cuts a fallback that would pass the byte cap with its suffix", () => {
    const { fallbackRecordPath } = sourceRecordPaths("漢".repeat(100), id);
    expect(fallbackRecordPath).toBe(`sources/${"漢".repeat(37)}-3f2a9c1e.md`);
    expect(sourceRecordPaths("漢".repeat(36), id).fallbackRecordPath).toBe(
      `sources/${"漢".repeat(36)}-3f2a9c1e.md`,
    );
  });

  it("skips a reserved device name", () => {
    expect(sourceRecordPaths("CON", id).recordPath).toBe("sources/con-5a6b.md");
  });

  it("falls back to the ID when the title yields no name", () => {
    expect(sourceRecordPaths("!!!", id)).toEqual({
      recordPath: `sources/${id}.md`,
      fallbackRecordPath: `sources/${id}.md`,
      recordPathCandidates: [`sources/${id}.md`],
    });
  });
});

describe("authorYearFromMetadata", () => {
  it.each([
    [
      { authors: ["Diederik P. Kingma"], published: "2014-12-22" },
      { family: "Kingma", year: "2014" },
    ],
    [
      { authors: ["Kingma, Diederik P."], published: "December 2014" },
      { family: "Kingma", year: "2014" },
    ],
    [{ authors: ["Plato"], published: "c. 375 BC" }, undefined],
    [{ authors: [], published: "2014" }, undefined],
    [{ published: "2014" }, undefined],
    [{ authors: ["Kingma"] }, undefined],
    [undefined, undefined],
  ])("reads %j", (metadata, expected) => {
    expect(authorYearFromMetadata(metadata)).toEqual(expected);
  });
});

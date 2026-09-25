import { describe, expect, it } from "vitest";

import {
  citationCompletionAt,
  citationReplacement,
  wikiLinkCompletionAt,
  wikiLinkReplacement,
} from "./completions.js";

const candidates = [
  { label: "Gravity and Grace", path: "sources/gravity-and-grace" },
  { label: "Attention", path: "sources/attention" },
] as const;

describe("wikiLinkCompletionAt", () => {
  it("finds an unfinished wikilink and filters candidates", () => {
    expect(wikiLinkCompletionAt("See [[grav", 10, candidates)).toEqual({
      from: 6,
      query: "grav",
      options: [candidates[0]],
    });
  });

  it("does not complete outside or after a closed wikilink", () => {
    expect(wikiLinkCompletionAt("plain text", 10, candidates)).toBeNull();
    expect(wikiLinkCompletionAt("[[Attention]] later", 19, candidates)).toBeNull();
  });

  it("ranks labels and searches annotation details", () => {
    const detailed = [
      ...candidates,
      { label: "Generosity", path: "annotations/generosity", detail: "Page 42" },
    ];
    expect(wikiLinkCompletionAt("See [[page 42", 13, detailed)?.options).toEqual([detailed[2]]);
  });
});

describe("citationCompletionAt", () => {
  const citations = [
    { id: "weil1952gravity", label: "Gravity and Grace", detail: "Simone Weil" },
    { id: "tufte2001visual", label: "The Visual Display", detail: "Edward Tufte" },
  ] as const;

  it("completes citekeys from a standalone at-sign", () => {
    expect(citationCompletionAt("See @simone", 11, citations)).toMatchObject({
      from: 4,
      query: "simone",
      options: [citations[0]],
    });
  });

  it("does not offer a second bracket-oriented trigger", () => {
    expect(citationCompletionAt("See [@simone", 12, citations)).toBeNull();
  });

  it("offers all citations immediately after typing at-sign", () => {
    expect(citationCompletionAt("See @", 5, citations)).toMatchObject({
      from: 4,
      query: "",
      options: citations,
    });
  });

  it("does not complete email addresses", () => {
    expect(citationCompletionAt("reader@example", 14, citations)).toBeNull();
  });
});

describe("completion replacements", () => {
  it("absorbs brackets that were closed automatically", () => {
    expect(wikiLinkReplacement("See [[att]]", 6, 9, "sources/attention")).toEqual({
      from: 6,
      to: 11,
      insert: "sources/attention]]",
    });
    expect(wikiLinkReplacement("See [[att", 6, 9, "sources/attention").to).toBe(9);
  });

  it("writes a bare citekey inside an open citation group", () => {
    expect(citationReplacement("See [@smi]", 5, 9, "smith2020")).toEqual({
      from: 5,
      to: 10,
      insert: "@smith2020]",
    });
    expect(citationReplacement("See [@smi, p. 4]", 5, 9, "smith2020").insert).toBe("@smith2020");
    expect(citationReplacement("See [@a; @smi", 9, 13, "smith2020").insert).toBe("@smith2020]");
    expect(citationReplacement("See [@smi and [x]", 5, 9, "smith2020").insert).toBe("@smith2020]");
  });

  it("brackets a citekey typed in running text", () => {
    expect(citationReplacement("See @smi", 4, 8, "smith2020").insert).toBe("[@smith2020]");
    expect(citationReplacement("[x] then @smi", 9, 13, "smith2020").insert).toBe("[@smith2020]");
    expect(citationReplacement("[[note]] @smi", 9, 13, "smith2020").insert).toBe("[@smith2020]");
  });
});

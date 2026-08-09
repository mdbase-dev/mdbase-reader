import { describe, expect, it } from "vitest";

import { wikiLinkCompletionAt } from "./completions.js";

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
});

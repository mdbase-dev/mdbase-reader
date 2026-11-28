import { expect, it } from "vitest";

import { indexedSubstringSearch } from "./indexed-substring-search.js";

it("returns the first UTF-16 offset across alignments, overlaps, collisions and boundaries", () => {
  // The upper bit changes the literal but not its hash bucket.
  const text = "aa你abcdefgあabcdefh🍂cdefg\u8001xy\u0001xyabcdefg" + "ab".repeat(80);
  const search = indexedSubstringSearch(text);
  for (let start = 0; start <= text.length; start++) {
    for (const length of [0, 1, 3, 4, 5, 6, 7, 8, 12, 30, 100]) {
      const needle = text.slice(start, start + length);
      expect(search(needle)).toBe(text.indexOf(needle));
      expect(search(needle + "!")).toBe(-1);
    }
  }
});

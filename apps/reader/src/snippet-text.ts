import type { SearchExcerpt } from "./search-passages.js";

const ligatures: Readonly<Record<string, string>> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
};

/**
 * Display only: never use these offsets or rewritten words as passage evidence.
 * Extractors can leave discretionary hyphens, font-private glyphs and invisible controls.
 */
export function snippetText(text: string): string {
  return (
    text
      .replace(/(\p{L})\u00ad[\t ]*\r?\n[\t ]*(?=\p{Ll})/gu, "$1")
      // ZWJ/ZWNJ stay: they are spelling in Persian and Indic scripts and join emoji.
      .replace(/[\u00ad\u200b\u2060\ufeff\u202a-\u202e\u2066-\u2069\p{Co}]/gu, "")
      // Keep ordinary compounds and paragraph boundaries; only join a lowercase word wrap.
      .replace(/(\p{Ll})[-\u2010][\t ]*\r?\n[\t ]*(?=\p{Ll})/gu, "$1")
      .replace(/[ﬀﬁﬂﬃﬄ]/gu, (character) => ligatures[character] ?? character)
      .replace(/[^\S\r\n\t ]/gu, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/gu, "")
      .replace(/\s+/gu, " ")
  );
}

export function snippetExcerpt(excerpt: SearchExcerpt): SearchExcerpt {
  return {
    before: snippetText(excerpt.before),
    match: snippetText(excerpt.match),
    after: snippetText(excerpt.after),
  };
}

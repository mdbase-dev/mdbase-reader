import { resolveSearchQuote, searchQuote } from "@mdbase-reader/core";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { LibraryTextIndex } from "./library-text-index.js";
import { LibraryTextStore } from "./library-text-store.js";
import { searchExcerpt } from "./search-passages.js";
import { snippetText } from "./snippet-text.js";

describe("snippet display text", () => {
  it("removes invisible extraction artifacts and expands common ligatures", () => {
    expect(
      snippetText(
        "lower-order mo\u00adments, mo\ue000ments, mo\u0002ments\u200b\u2060\ufeff: ﬁ ﬂ ﬀ ﬃ ﬄ",
      ),
    ).toBe("lower-order moments, moments, moments: fi fl ff ffi ffl");
  });

  it("joins lowercase line-end hyphenation but preserves compounds and paragraphs", () => {
    expect(
      snippetText(
        "mo-\nments, mo‐\r\n  ments, mo\u00ad\nments; lower-order; two-\n\nparagraphs; A-\nB",
      ),
    ).toBe("moments, moments, moments; lower-order; two- paragraphs; A- B");
    expect(snippetText("naïve 世界 한글 👩‍💻")).toContain("naïve 世界 한글");
    // Joiners are spelling in Persian and hold emoji sequences together.
    expect(snippetText("می‌خواهم 👩‍💻")).toBe("می‌خواهم 👩‍💻");
  });

  it("cleans context and highlights without rewriting navigation evidence", () => {
    const text = "Before mo-\nments with ﬁne context. MATCH mo\u00adments after.";
    expect(searchExcerpt(text, "match")).toEqual({
      before: "Before moments with fine context. ",
      match: "MATCH",
      after: " moments after.",
    });
    const query = "MATCH mo\u00adments";
    expect(searchExcerpt(text, query)?.match).toBe("MATCH moments");
    const quote = searchQuote(text, query)!;
    expect(quote.exact).toBe("MATCH mo\u00adments");
    const range = resolveSearchQuote(text, quote)!;
    expect(text.slice(range.start, range.end)).toBe(quote.exact);
  });

  it("hides Markdown block markers in note snippets without moving the match", () => {
    const note = "# Adam: A Method\n\n> Quoted *line*\n- first point, see #tag\n  * nested";
    expect(searchExcerpt(note, "adam", { markdown: true })).toEqual({
      before: "",
      match: "Adam",
      after: ": A Method Quoted *line* first point, see #tag nested",
    });
    // Document text and mid-line context are left alone.
    expect(searchExcerpt(note, "adam")?.before).toBe("# ");
    expect(searchExcerpt("x - y # z match", "match", { markdown: true })?.before).toBe(
      "x - y # z ",
    );
    // Context cut mid-line can start with a marker character that is not a marker.
    const cut = `xxxxx> ${"b".repeat(88)}match`;
    expect(searchExcerpt(cut, "match", { markdown: true })?.before).toBe(`…> ${"b".repeat(88)}`);
    const range = resolveSearchQuote(note, searchQuote(note, "adam")!)!;
    expect(note.slice(range.start, range.end)).toBe("Adam");
  });

  it("keeps literal query syntax and whitespace matching", () => {
    expect(searchExcerpt("Before [ﬁle]\n match after", "[ﬁle] match")?.match).toBe("[file] match");
    expect(searchExcerpt("İSTANBUL MATCH", "match")?.match).toBe("MATCH");
    expect(searchExcerpt("nothing", "[a-z]")).toBeNull();
  });

  it("cleans worker snippets while preserving original Unicode quotes and their positions", async () => {
    const store = new LibraryTextStore(new IDBFactory());
    const index = new LibraryTextIndex("collection", store);
    const text = "Before ﬁne mo\u00adments with a ﬂower after.";
    await index.put({ fileId: "html", revision: "r1" }, text);
    const hit = index.search("mo\u00adments")[0]!;
    expect(hit.excerpt).toEqual({
      before: "Before fine ",
      match: "moments",
      after: " with a flower after.",
    });
    expect(hit.quote.exact).toBe("mo\u00adments");
    const range = resolveSearchQuote(text, hit.quote)!;
    expect(text.slice(range.start, range.end)).toBe("mo\u00adments");
    const reopened = new LibraryTextIndex("collection", store);
    await reopened.load();
    expect(reopened.search("with")[0]?.excerpt.before).toBe("Before fine moments ");
  });
});

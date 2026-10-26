import { describe, expect, it } from "vitest";

import { fileId } from "./identity.js";
import { fileRevision } from "./revision.js";
import {
  resolveSearchQuote,
  searchDestinationMatchesDocument,
  searchQuote,
} from "./search-destination.js";

describe("search destinations", () => {
  it("captures case-preserving quotation evidence and surrounding context", () => {
    const quote = searchQuote("Before: a\n  MATCH across text. After.", "match across");
    expect(quote).toEqual({ exact: "MATCH across", prefix: "Before: a ", suffix: " text. After." });
    expect(resolveSearchQuote("Before: a\n  MATCH across text. After.", quote!)).not.toBeNull();
    expect(searchQuote("x a+b x", "a+b")?.exact).toBe("a+b");
  });
  it("refuses ambiguous and approximate matches, but resolves context-proven repeats", () => {
    expect(
      resolveSearchQuote("repeated phrase repeated phrase", { exact: "repeated phrase" }),
    ).toBeNull();
    expect(
      resolveSearchQuote("This changed distinctive passage", {
        exact: "This original distinctive passage",
      }),
    ).toBeNull();
    expect(
      resolveSearchQuote("First repeated phrase. Second repeated phrase.", {
        exact: "repeated phrase",
        prefix: "Second ",
        suffix: ".",
      })?.start,
    ).toBe(30);
  });
  it("binds identity and revision, not the mutable file path", () => {
    const document = {
      fileId: fileId("file"),
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      file: "old",
    };
    const destination = { document, location: { kind: "html" as const }, quote: { exact: "text" } };
    expect(searchDestinationMatchesDocument(destination, { ...document, file: "renamed" })).toBe(
      true,
    );
    expect(
      searchDestinationMatchesDocument(destination, {
        ...document,
        revision: fileRevision(`sha256:${"b".repeat(64)}`),
      }),
    ).toBe(false);
    expect(
      searchDestinationMatchesDocument(destination, { ...document, fileId: fileId("other") }),
    ).toBe(false);
  });
});

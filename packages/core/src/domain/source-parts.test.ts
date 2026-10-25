import { describe, expect, it } from "vitest";

import { sourceId } from "./identity.js";
import {
  parseDocumentRange,
  parseSourceRelations,
  rangeContainsPdfPage,
  rangeContainsEpubHref,
  validateSourcePartChain,
} from "./source-parts.js";

const a = sourceId("a"),
  b = sourceId("b"),
  c = sourceId("c");

describe("document ranges", () => {
  it("reads inclusive, zero-based PDF bounds and optional printed labels", () => {
    const range = parseDocumentRange({
      kind: "pages",
      start: 0,
      end: 2,
      labels: { start: "iii", end: "v" },
    });
    expect(range).toEqual({ kind: "pages", start: 0, end: 2, labels: { start: "iii", end: "v" } });
    expect([0, 1, 2].every((page) => rangeContainsPdfPage(range!, page))).toBe(true);
    expect([-1, 3, 1.5, NaN].some((page) => rangeContainsPdfPage(range!, page))).toBe(false);
  });
  it.each([
    { kind: "pages", start: -1, end: 2 },
    { kind: "pages", start: 2, end: 1 },
    { kind: "pages", start: 0.1, end: 2 },
    { kind: "pages", start: 0, end: 2.5 },
    { kind: "pages", start: 0, end: Infinity },
    { kind: "pages", start: 0, end: 1, labels: false },
    { kind: "epub-spine", start: " ", end: "a.xhtml" },
    { kind: "epub-spine", start: "a.xhtml", end: "" },
    { kind: "epub-spine", start: "a.xhtml", end: "b.xhtml", start_cfi: "" },
    { kind: "fragment", start: "" },
    { kind: "fragment", start: "#" },
    { kind: "fragment", start: "#a", end: "b" },
    { kind: "future", start: 0, end: 1 },
    null,
    [],
    "bad",
  ])("ignores invalid or future ranges: %j", (value) => {
    expect(parseDocumentRange(value)).toBeUndefined();
  });
  it("uses the actual spine order, not lexical href order", () => {
    const range = parseDocumentRange({
      kind: "epub-spine",
      start: "z.xhtml",
      end: "a.xhtml",
      end_cfi: "epubcfi(/6/4)",
    })!;
    expect(rangeContainsEpubHref(range, "m.xhtml", ["z.xhtml", "m.xhtml", "a.xhtml"])).toBe(true);
    expect(rangeContainsEpubHref(range, "missing", ["z.xhtml", "a.xhtml"])).toBe(false);
    expect(rangeContainsEpubHref(range, "m.xhtml", ["a.xhtml", "m.xhtml", "z.xhtml"])).toBe(false);
    expect(rangeContainsPdfPage(range, 0)).toBe(false);
    expect(parseDocumentRange({ kind: "fragment", start: "#intro", end: "#end" })).toEqual({
      kind: "fragment",
      start: "#intro",
      end: "#end",
    });
  });
});

describe("source part relationships", () => {
  it("retains link text without guessing IDs and ignores malformed entries", () => {
    expect(
      parseSourceRelations([
        { relation: "part-of", target: "[[books/book|Book]]" },
        { relation: "cites", target: "[[other]]" },
        {},
        null,
      ]),
    ).toEqual([
      { relation: "part-of", target: "[[books/book|Book]]" },
      { relation: "cites", target: "[[other]]" },
    ]);
  });
  it("allows chains and missing parents", () => {
    expect(
      validateSourcePartChain(
        a,
        new Map([
          [a, { partOf: b }],
          [b, { partOf: c }],
          [c, {}],
        ]),
      ),
    ).toEqual({ ancestors: [b, c] });
    expect(validateSourcePartChain(a, new Map([[a, { partOf: b }]]))).toEqual({
      ancestors: [b],
      missing: b,
    });
    expect(validateSourcePartChain(a, new Map([[a, {}]]))).toEqual({ ancestors: [] });
  });
  it("reports self references, cycles and excessive depth without looping", () => {
    expect(validateSourcePartChain(a, new Map([[a, { partOf: a }]]))).toMatchObject({
      problem: "self-reference",
    });
    expect(
      validateSourcePartChain(
        a,
        new Map([
          [a, { partOf: b }],
          [b, { partOf: a }],
        ]),
      ),
    ).toMatchObject({ problem: "cycle" });
    expect(
      validateSourcePartChain(
        a,
        new Map([
          [a, { partOf: b }],
          [b, { partOf: c }],
          [c, {}],
        ]),
        1,
      ),
    ).toMatchObject({ problem: "depth-exceeded" });
  });
});

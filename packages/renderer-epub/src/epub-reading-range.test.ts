// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { resolveEpubReadingRange } from "./epub-reading-range.js";

import type { DocumentRange } from "@mdbase-reader/core";
import type { ReaderLocator } from "@mdbase-reader/reading-surface";
import type { Publication } from "@readium/shared";

const base = "https://reader.test/book/";
const hrefs = ["text/front.xhtml", "text/z.xhtml", "text/a.xhtml", "text/back.xhtml"];
const range = { kind: "epub-spine", start: "text/z.xhtml", end: "text/a.xhtml" } as const;
const cfi = (index: number, offset: number): string =>
  `epubcfi(/6/${String((index + 1) * 2)}!/4/2/1:${String(offset)})`;
const locator = (href: string, fragment?: string): ReaderLocator => ({
  kind: "epub",
  locator: { href, ...(fragment ? { locations: { fragments: [fragment] } } : {}) },
});
function fixture(): {
  publication: Publication;
  read: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const read = vi
    .fn()
    .mockResolvedValue(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Book</title></head><body><p id="p">0123456789</p><p>after</p></body></html>',
    );
  const close = vi.fn();
  return {
    publication: {
      readingOrder: {
        items: hrefs.map((href) => ({ href: `${base}${href}`, type: "application/xhtml+xml" })),
      },
      get: () => ({ readAsString: read, close }),
    } as unknown as Publication,
    read,
    close,
  };
}

it("resolves portable endpoints relative to the package document, keeping saved locators absolute", async () => {
  const nested = {
    readingOrder: {
      items: hrefs.map((href) => ({
        href: `${base}OPS/${href}`,
        type: "application/xhtml+xml",
      })),
    },
  } as unknown as Publication;
  const resolved = await resolveEpubReadingRange(nested, base, range, "OPS/package.opf");
  expect(resolved.valid).toBe(true);
  if (!resolved.valid) {
    throw new Error(resolved.message);
  }
  expect(resolved.start).toMatchObject({ locator: { href: "OPS/text/z.xhtml" } });
  expect(resolved.measure(locator("OPS/text/z.xhtml"))).toMatchObject({ position: "inside" });
  expect(resolved.measure(locator("text/z.xhtml"))).toBeNull();
});

describe("EPUB reading ranges", () => {
  it("uses spine order, returns absolute start, and includes whole endpoint items", async () => {
    const { publication, read } = fixture();
    const resolved = await resolveEpubReadingRange(publication, base, range);
    expect(resolved.valid).toBe(true);
    if (!resolved.valid) {
      return;
    }
    expect(resolved.start).toEqual({
      kind: "epub",
      locator: {
        href: "text/z.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0 },
      },
    });
    expect(resolved.measure(locator(hrefs[0]!))).toEqual({ position: "before", atEnd: false });
    expect(resolved.measure(locator(hrefs[1]!))).toEqual({ position: "inside", atEnd: false });
    expect(resolved.measure(locator(hrefs[2]!))).toEqual({ position: "inside", atEnd: false });
    expect(resolved.measure(locator(hrefs[3]!))).toEqual({ position: "after", atEnd: true });
    expect(read).not.toHaveBeenCalled();
  });

  it.each<DocumentRange>([
    { ...range, start: "missing.xhtml" },
    { ...range, end: "nav.xhtml" },
    { ...range, start: range.end, end: range.start },
    { kind: "pages", start: 0, end: 1 },
  ])("rejects missing/non-spine, inverted or wrong-kind endpoints: %j", async (input) => {
    const resolved = await resolveEpubReadingRange(fixture().publication, base, input);
    expect(resolved).toEqual({ valid: false, message: expect.any(String) });
  });

  it.each([
    "https://reader.test/book/text/z.xhtml",
    "https://evil.test/z.xhtml",
    "//evil.test/z.xhtml",
    "../text/z.xhtml",
    "text/../text/z.xhtml",
    "text/%2e%2e/z.xhtml",
    "text/%252e%252e/z.xhtml",
    "/text/z.xhtml",
    "text\\z.xhtml",
    "text/z.xhtml#p",
    "text/z.xhtml?x",
    "javascript:alert(1)",
    "text/%2fz.xhtml",
    "text/%00z.xhtml",
    "text/%zz.xhtml",
    " text/z.xhtml",
  ])("rejects unsafe range href %s", async (start) => {
    expect(
      (await resolveEpubReadingRange(fixture().publication, base, { ...range, start })).valid,
    ).toBe(false);
  });
});

describe("EPUB range CFI validation", () => {
  it("validates CFI resources, DOM targets and order and closes detached resources", async () => {
    const { publication, read, close } = fixture();
    const input = { ...range, end: range.start, start_cfi: cfi(1, 2), end_cfi: cfi(1, 8) };
    const resolved = await resolveEpubReadingRange(publication, base, input);
    expect(resolved.valid).toBe(true);
    if (!resolved.valid) {
      return;
    }
    expect(resolved.start).toMatchObject({
      kind: "epub",
      locator: { href: range.start, locations: { fragments: [cfi(1, 2)] } },
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(resolved.measure(locator(range.start, cfi(1, 1)))).toEqual({
      position: "before",
      atEnd: false,
    });
    expect(resolved.measure(locator(range.start, cfi(1, 2)))).toEqual({
      position: "inside",
      atEnd: false,
    });
    expect(resolved.measure(locator(range.start, cfi(1, 5)))).toEqual({
      position: "inside",
      atEnd: false,
    });
    expect(resolved.measure(locator(range.start, cfi(1, 8)))).toEqual({
      position: "inside",
      atEnd: true,
    });
    expect(resolved.measure(locator(range.start, cfi(1, 9)))).toEqual({
      position: "after",
      atEnd: true,
    });
    expect(
      resolved.measure({ kind: "epub", locator: { locations: { fragments: [cfi(1, 5)] } } }),
    ).toEqual({ position: "inside", atEnd: false });
    expect(resolved.measure(locator(range.start))).toBeNull();
    expect(resolved.measure(locator(range.start, cfi(2, 5)))).toBeNull();
    expect(resolved.measure(locator(range.start, cfi(1, 99)))).toBeNull();
    expect(
      resolved.measure({
        kind: "epub",
        locator: {
          href: range.start,
          locations: { progression: 0.5, position: 5, totalProgression: 0.7 },
        },
      }),
    ).toBeNull();
  });

  it.each([
    { start_cfi: cfi(2, 2) }, // wrong endpoint resource
    { end_cfi: cfi(1, 99) }, // out-of-bounds text offset
    { start_cfi: "epubcfi(/6/4!/4/200/1:2)" }, // missing element
    { start_cfi: "epubcfi(/6/4!/4/2[wrong]/1:2)" }, // wrong ID assertion
    { start_cfi: "epubcfi(/6/4!/4/2/1:2)garbage" },
    { start_cfi: "epubcfi(/6/4!/4/2/1:-1)" },
    { start_cfi: "epubcfi(/6/4!/4/2:3)" }, // character offset on element
    { start_cfi: cfi(1, 8), end_cfi: cfi(1, 2) },
    { start_cfi: "epubcfi(/6/4!/4/2,/1:8,/1:2)" }, // inverted range CFI
    { start_cfi: "" },
  ])("rejects unresolved, malformed and inverted CFIs: %j", async (bounds) => {
    expect(
      (
        await resolveEpubReadingRange(fixture().publication, base, {
          ...range,
          end: range.start,
          ...bounds,
        })
      ).valid,
    ).toBe(false);
  });
});

describe("EPUB CFI measurement", () => {
  it("accepts asserted elements, range CFIs, and equal point boundaries", async () => {
    const { publication } = fixture();
    for (const bounds of [
      { start_cfi: "epubcfi(/6/4!/4/2[p],/1:2,/1:4)", end_cfi: cfi(1, 8) },
      { start_cfi: cfi(1, 2), end_cfi: "epubcfi(/6/4!/4/2,/1:4,/1:8)" },
      { start_cfi: cfi(1, 5), end_cfi: cfi(1, 5) },
    ]) {
      const resolved = await resolveEpubReadingRange(publication, base, {
        ...range,
        end: range.start,
        ...bounds,
      });
      expect(resolved.valid).toBe(true);
      if (!resolved.valid) {
        continue;
      }
      expect(resolved.measure(locator(range.start, cfi(1, 5)))?.position).toBe("inside");
    }
  });

  it("compares cross-resource CFIs and leaves unmeasurable positions unknown", async () => {
    const resolved = await resolveEpubReadingRange(fixture().publication, base, {
      ...range,
      start_cfi: cfi(1, 8),
      end_cfi: cfi(2, 2),
    });
    expect(resolved.valid).toBe(true);
    if (!resolved.valid) {
      return;
    }
    expect(resolved.measure(locator(range.start, cfi(1, 9)))).toEqual({
      position: "inside",
      atEnd: false,
    });
    expect(resolved.measure(locator(range.end, cfi(2, 1)))).toEqual({
      position: "inside",
      atEnd: false,
    });
    expect(resolved.measure(locator(range.end, cfi(2, 3)))).toEqual({
      position: "after",
      atEnd: true,
    });
    expect(resolved.measure(locator("missing.xhtml"))).toBeNull();
    expect(resolved.measure({ kind: "pdf", pageIndex: 0 })).toBeNull();
  });

  it("fails closed on unreadable resources and releases them", async () => {
    const { publication, read, close } = fixture();
    read.mockRejectedValueOnce(new Error("Offline"));
    expect(
      await resolveEpubReadingRange(publication, base, { ...range, start_cfi: cfi(1, 2) }),
    ).toEqual({ valid: false, message: "Offline" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not invent logical progress from visual-page progression", async () => {
    const resolved = await resolveEpubReadingRange(fixture().publication, base, range);
    if (!resolved.valid) {
      throw new Error(resolved.message);
    }
    expect(
      resolved.measure({
        kind: "epub",
        locator: {
          href: range.start,
          locations: { progression: 1, position: 999, totalProgression: 1 },
        },
      }),
    ).toEqual({ position: "inside", atEnd: false });
  });
});

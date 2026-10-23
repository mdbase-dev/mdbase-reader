// @vitest-environment happy-dom
import { fileId, fileRevision } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { htmlLocationTarget, resolveHtmlReadingRange } from "./html-reading-range.js";
import { HtmlDocumentRuntime } from "./html-runtime.js";
import { HtmlReadingSurface } from "./html-surface.js";

import type { DocumentRange } from "@mdbase-reader/core";
import type { ReaderLocator, ReadingRangeResolution } from "@mdbase-reader/reading-surface";

const href = "[[files/essay.html]]";
const anchor = (fragment: string): ReaderLocator => ({ kind: "html", href: `${href}${fragment}` });

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function fixture(markup: string): Document {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = markup;
  return doc;
}

const markup =
  '<p id="before">Preface</p><section id="chapter">AB<p id="middle">CD</p><p id="last">EF</p></section><h2 id="next">Next</h2><p id="after">After</p>';

function resolved(doc: Document, end?: string): Extract<ReadingRangeResolution, { valid: true }> {
  const result = resolveHtmlReadingRange(doc, href, {
    kind: "fragment",
    start: "#chapter",
    ...(end !== undefined ? { end } : {}),
  });
  expect(result.valid).toBe(true);
  if (!result.valid) {
    throw new Error(result.message);
  }
  return result;
}

function layout(element: Element, top: number, bottom: number): void {
  const bounds = { top, bottom } as DOMRect;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);
  vi.spyOn(element, "getClientRects").mockReturnValue([bounds] as unknown as DOMRectList);
}

describe("HTML fragment ranges", () => {
  it.each([
    { kind: "pages", start: 0, end: 1 },
    { kind: "epub-spine", start: "one.xhtml", end: "two.xhtml" },
    { kind: "fragment", start: "#missing" },
    { kind: "fragment", start: "#chapter", end: "#missing" },
    { kind: "fragment", start: "#chapter", end: "#before" },
    { kind: "fragment", start: "#chapter", end: "#chapter" },
    { kind: "fragment", start: "chapter" },
    { kind: "fragment", start: "#" },
    { kind: "fragment", start: "#chapter", end: "" },
    { kind: "fragment", start: "#%zz" },
    { kind: "fragment", start: "javascript:alert(1)" },
  ] satisfies DocumentRange[])("rejects unsupported, absent or inverted endpoints: %j", (range) => {
    const result = resolveHtmlReadingRange(fixture(markup), href, range);
    expect(result).toMatchObject({ valid: false, message: expect.any(String) });
  });

  it.each(["chapter", "next"])("rejects non-unique %s endpoint IDs", (id) => {
    const doc = fixture(`${markup}<p id="${id}">Duplicate</p>`);
    expect(
      resolveHtmlReadingRange(doc, href, { kind: "fragment", start: "#chapter", end: "#next" }),
    ).toMatchObject({ valid: false });
  });

  it("rejects head IDs, including duplicates outside the body", () => {
    const doc = fixture(markup);
    doc.head.innerHTML = '<meta id="metadata"><meta id="chapter">';
    expect(resolveHtmlReadingRange(doc, href, { kind: "fragment", start: "#metadata" }).valid).toBe(
      false,
    );
    expect(resolveHtmlReadingRange(doc, href, { kind: "fragment", start: "#chapter" }).valid).toBe(
      false,
    );
  });

  it("measures a half-open DOM interval with absolute locators and logical text progress", () => {
    const range = resolved(fixture(markup), "#next");
    expect(range.start).toEqual(anchor("#chapter"));
    expect(range.measure(anchor("#before"))).toEqual({
      position: "before",
      atEnd: false,
      progress: 0,
    });
    expect(range.measure(range.start)).toEqual({ position: "inside", atEnd: false, progress: 0 });
    expect(range.measure(anchor("#middle"))).toEqual({
      position: "inside",
      atEnd: false,
      progress: 2 / 6,
    });
    expect(range.measure(anchor("#last"))).toEqual({
      position: "inside",
      atEnd: false,
      progress: 4 / 6,
    });
    expect(range.measure(anchor("#next"))).toEqual({ position: "after", atEnd: true, progress: 1 });
    expect(range.measure(anchor("#after"))).toEqual({
      position: "after",
      atEnd: true,
      progress: 1,
    });
  });

  it("without an end includes only the start subtree, not the rest of the document", () => {
    const range = resolved(fixture(markup));
    expect(range.measure(anchor("#middle"))?.position).toBe("inside");
    expect(range.measure(anchor("#last"))?.progress).toBe(4 / 6);
    expect(range.measure(anchor("#next"))).toEqual({ position: "after", atEnd: true, progress: 1 });
  });

  it("ends before a nested endpoint, and rejects a containing end ancestor", () => {
    const doc = fixture(markup);
    const range = resolved(doc, "#middle");
    expect(range.measure(anchor("#middle"))?.position).toBe("after");
    expect(range.measure(anchor("#last"))?.position).toBe("after");
    expect(
      resolveHtmlReadingRange(doc, href, { kind: "fragment", start: "#middle", end: "#chapter" })
        .valid,
    ).toBe(false);
  });

  it("uses DOM order even when empty nodes have identical text offsets, omitting unmeasurable progress", () => {
    const range = resolved(
      fixture('<i id="before"></i><img id="chapter"><i id="next"></i>'),
      "#next",
    );
    expect(range.measure(anchor("#before"))).toEqual({ position: "before", atEnd: false });
    expect(range.measure(anchor("#chapter"))).toEqual({ position: "inside", atEnd: false });
    expect(range.measure(anchor("#next"))).toEqual({ position: "after", atEnd: true });
  });

  it("treats encoded IDs literally, never as CSS selectors", () => {
    const doc = fixture('<p id="a:世界[x]">Text</p><p id="a">Other</p>');
    const fragment = `#${encodeURIComponent("a:世界[x]")}`;
    const range = resolveHtmlReadingRange(doc, href, { kind: "fragment", start: fragment });
    expect(range.valid && range.measure(anchor(fragment))).toEqual({
      position: "inside",
      atEnd: false,
      progress: 0,
    });
    expect(htmlLocationTarget(doc, href, anchor("#p,body"))).toBeNull();
  });

  it("does not reuse a resolution after an endpoint disappears or becomes ambiguous", () => {
    const doc = fixture(markup);
    const range = resolved(doc, "#next");
    doc.getElementById("next")!.remove();
    expect(range.measure(anchor("#middle"))).toBeNull();
    doc.body.insertAdjacentHTML("beforeend", '<p id="next"></p><p id="chapter"></p>');
    expect(range.measure(anchor("#middle"))).toBeNull();
  });
});

describe("HTML range scroll measurements", () => {
  it("classifies absolute scroll locations without inventing pixel-based progress", () => {
    const doc = fixture(markup);
    const root = doc.documentElement;
    Object.defineProperties(root, {
      scrollHeight: { value: 1200, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    layout(doc.getElementById("chapter")!, 224, 624);
    layout(doc.getElementById("next")!, 824, 874);
    const range = resolved(doc, "#next");
    const scroll = (progression: number): ReaderLocator => ({ kind: "html", href, progression });
    expect(range.measure(scroll(0))).toEqual({ position: "before", atEnd: false });
    expect(range.measure(scroll(0.2))).toEqual({ position: "inside", atEnd: false });
    expect(range.measure(scroll(0.8))).toEqual({ position: "after", atEnd: true });
    const subtree = resolved(doc);
    expect(subtree.measure(scroll(0.6))).toEqual({ position: "after", atEnd: true });
    // Text-anchor progress is independent of geometry, viewport size and reflow.
    layout(doc.getElementById("chapter")!, 900, 1500);
    expect(range.measure(anchor("#middle"))?.progress).toBe(2 / 6);
  });

  it("omits measurements when scroll locations have no reliable layout", () => {
    const doc = fixture(markup);
    const range = resolved(doc, "#next");
    expect(range.measure({ kind: "html", href, progression: 0.5 })).toBeNull();
    layout(doc.getElementById("chapter")!, 500, 600);
    layout(doc.getElementById("next")!, 100, 200);
    expect(range.measure({ kind: "html", href, progression: 0.5 })).toBeNull();
  });
});

const invalidLocations: ReaderLocator[] = [
  { kind: "pdf", pageIndex: 0 },
  { kind: "epub", locator: {} },
  { kind: "html", href: "another.html", progression: 0.5 },
  { kind: "html", href: "#chapter" },
  { kind: "html", href: `${href}evil#chapter` },
  anchor("#missing"),
  anchor("#%zz"),
  ...[-1, 1.01, NaN, Infinity, -Infinity].map((progression): ReaderLocator => ({
    kind: "html",
    href,
    progression,
  })),
  { kind: "html", href: `${href}#chapter`, progression: NaN },
];

describe("HTML range position validation", () => {
  it.each(invalidLocations)("rejects invalid or foreign absolute positions: %j", (locator) => {
    const doc = fixture(markup);
    expect(htmlLocationTarget(doc, href, locator)).toBeNull();
    expect(resolved(doc).measure(locator)).toBeNull();
  });

  it("keeps whole-document scroll coordinates unchanged", () => {
    const doc = fixture(markup);
    expect(htmlLocationTarget(doc, href, { kind: "html", href })).toEqual({
      kind: "scroll",
      progression: 0,
    });
    expect(htmlLocationTarget(doc, href, { kind: "html", href, progression: 1 })).toEqual({
      kind: "scroll",
      progression: 1,
    });
  });
});

it("exposes resolution through the surface and navigates freely to absolute fragments or scroll positions", async () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = markup;
  const scrollTo = vi.fn();
  Object.defineProperty(frame.contentWindow!, "scrollTo", { value: scrollTo, configurable: true });
  layout(doc.getElementById("chapter")!, 224, 624);
  const runtime = new HtmlDocumentRuntime(frame, href);
  const surface = new HtmlReadingSurface(
    {
      document: {
        fileId: fileId("html-range"),
        file: href,
        revision: fileRevision(`sha256:${"a".repeat(64)}`),
      },
      mediaType: "text/html",
      url: "https://example.test/essay.html",
    },
    runtime,
  );
  try {
    const range = await surface.resolveReadingRange({ kind: "fragment", start: "#chapter" });
    expect(range.valid).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
    if (!range.valid) {
      throw new Error(range.message);
    }
    expect(await surface.goTo(range.start)).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: "smooth" });
    // Resolving a chapter does not trap navigation or rebase saved positions.
    expect(await surface.goTo(anchor("#after"))).toBe(true);
    expect(await surface.goTo({ kind: "html", href, progression: 0.75 })).toBe(true);
    expect(surface.currentLocation()).toMatchObject({ kind: "html", href });
    scrollTo.mockClear();
    for (const locator of invalidLocations) {
      expect(await surface.goTo(locator)).toBe(false);
    }
    expect(scrollTo).not.toHaveBeenCalled();
  } finally {
    await surface.destroy();
    frame.remove();
  }
});

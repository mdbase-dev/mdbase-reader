// @vitest-environment happy-dom
import { fileId, fileRevision } from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import { HtmlDocumentRuntime } from "./html-runtime.js";
import { HtmlReadingSurface } from "./html-surface.js";

import type { AnnotationTarget, DocumentRange } from "@mdbase-reader/core";

const href = "[[book.html]]";
const range = { kind: "fragment", start: "#chapter", end: "#next" } as const;
const surfaces: HtmlReadingSurface[] = [];
afterEach(async () => {
  await Promise.all(surfaces.splice(0).map((surface) => surface.destroy()));
  document.body.replaceChildren();
});
function fixture(): { surface: HtmlReadingSurface; doc: Document } {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML =
    '<p id="before">Preface</p><section id="chapter">AB<p id="middle">CD</p><p id="last">EF</p></section><h2 id="next">Next</h2><p id="after">After</p><p class="repeat">AB</p><p class="repeat">AB</p>';
  const surface = new HtmlReadingSurface(
    {
      document: {
        fileId: fileId("html"),
        file: href,
        revision: fileRevision(`sha256:${"a".repeat(64)}`),
      },
      mediaType: "text/html",
      url: "https://reader.test/book.html",
    },
    new HtmlDocumentRuntime(frame, href),
  );
  surfaces.push(surface);
  return { surface, doc };
}
const quote = (exact: string, css?: string): AnnotationTarget => ({
  quote: { exact },
  ...(css ? { html: { css } } : {}),
});

describe("HTML annotation containment", () => {
  it("checks full selections against DOM-order boundaries and the start subtree without an end", async () => {
    const { surface } = fixture();
    const contains = surface.capabilities.annotationRange!.contains;
    for (const input of [range, { kind: "fragment", start: "#chapter" } as const]) {
      expect(await contains(input, quote("AB", "#chapter"))).toBe(true);
      expect(await contains(input, quote("ABCDEF"))).toBe(true);
      expect(await contains(input, quote("CD", "#middle"))).toBe(true);
      expect(await contains(input, quote("Preface"))).toBe(false);
      expect(await contains(input, quote("Next"))).toBe(false);
      expect(await contains(input, quote("After"))).toBe(false);
      expect(await contains(input, quote("PrefaceAB"))).toBeNull();
      expect(await contains(input, quote("EFNext"))).toBeNull();
      expect(await contains(input, quote("PrefaceABCDEFNext"))).toBeNull();
    }
    expect(await contains({ ...range, end: "#middle" }, quote("AB", "#chapter"))).toBe(true);
    expect(await contains({ ...range, end: "#middle" }, quote("CD"))).toBe(false);
    expect(await contains({ ...range, end: "#middle" }, quote("ABCD"))).toBeNull();
    await surface.destroy();
    expect(await contains(range, quote("CD"))).toBeNull();
  });

  it.each<DocumentRange>([
    { kind: "pages", start: 0, end: 1 },
    { ...range, start: "#missing" },
    { ...range, end: "#missing" },
    { ...range, end: "#before" },
    { ...range, end: range.start },
    { ...range, start: "#%zz" },
  ])("returns unknown for an invalid range: %j", async (range) => {
    expect(
      await fixture().surface.capabilities.annotationRange!.contains(range, quote("CD")),
    ).toBeNull();
  });

  it.each<AnnotationTarget>([
    {},
    quote("missing"),
    quote("AB"), // Repeated without sufficient context.
    quote("CD", "#missing"), // No fallback to the body on a stale selector.
    quote("CD", "["),
    quote("AB", ".repeat"),
    { html: { xpath: "//section" }, quote: { exact: "CD" } },
    { position: { kind: "html", href, progression: 0.5 } },
    { position: { kind: "html", href: `${href}#missing` } },
    { position: { kind: "html", href: "another.html#chapter" } },
  ])("does not certify ambiguous, unsupported or unresolved selectors: %j", async (target) => {
    expect(
      await fixture().surface.capabilities.annotationRange!.contains(range, target),
    ).toBeNull();
  });

  it("uses exact fragment bookmarks, never scroll progress", async () => {
    const contains = fixture().surface.capabilities.annotationRange!.contains;
    for (const [fragment, result] of [
      ["#chapter", true],
      ["#middle", true],
      ["#next", false],
      ["#before", false],
    ] as const) {
      expect(
        await contains(range, { position: { kind: "html", href: `${href}${fragment}` } }),
      ).toBe(result);
    }
  });

  it("revalidates missing and duplicate fragment IDs against the opened document", async () => {
    const { surface, doc } = fixture();
    const contains = surface.capabilities.annotationRange!.contains;
    expect(await contains(range, quote("CD"))).toBe(true);
    doc.body.insertAdjacentHTML("beforeend", '<p id="chapter">Duplicate</p>');
    expect(await contains(range, quote("CD"))).toBeNull();
    doc.getElementById("next")!.remove();
    expect(await contains(range, quote("CD"))).toBeNull();
  });
});

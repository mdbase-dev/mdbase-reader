// @vitest-environment happy-dom
import { highlightColorKeys, highlightPalette } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  annotationHighlightCss,
  annotationHighlightName,
  clearCssHighlights,
  setAnnotationHighlights,
} from "./html-css-highlights.js";

class FakeHighlight {
  readonly ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

function highlightWindow(): { view: Window; registry: Map<string, FakeHighlight> } {
  const registry = new Map<string, FakeHighlight>();
  const view = {
    document,
    Highlight: FakeHighlight,
    CSS: { highlights: registry },
  } as unknown as Window;
  return { view, registry };
}

function rangeOf(text: string): Range {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  document.body.append(paragraph);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  return range;
}

describe("HTML annotation highlights", () => {
  it("names one highlight per palette colour and per stored hex colour", () => {
    expect(annotationHighlightName("blue")).toBe("reader-annotation-blue");
    expect(annotationHighlightName("Pink")).toBe("reader-annotation-pink");
    expect(annotationHighlightName(undefined)).toBe("reader-annotation-yellow");
    expect(annotationHighlightName("orange")).toBe("reader-annotation-yellow");
    expect(annotationHighlightName("#FFAA00")).toBe("reader-annotation-hex-ffaa00");
  });

  it("styles each palette colour with its light and dark wash", () => {
    const css = annotationHighlightCss();
    for (const key of highlightColorKeys) {
      expect(css).toContain(
        `::highlight(reader-annotation-${key}) { background-color: ${highlightPalette[key].light.wash};`,
      );
      expect(css).toContain(
        `:root[data-reader-scheme="dark"] ::highlight(reader-annotation-${key}) { background-color: ${highlightPalette[key].dark.wash};`,
      );
    }
    expect(css).toContain("::highlight(reader-active-annotation)");
    expect(css).toContain("forced-colors: active");
  });

  it("groups ranges by colour and drops colours no longer in use", () => {
    const { view, registry } = highlightWindow();
    const first = rangeOf("First");
    const second = rangeOf("Second");
    const third = rangeOf("Third");
    setAnnotationHighlights(view, [
      { color: "yellow", range: first },
      { range: second },
      { color: "green", range: third },
    ]);
    expect(registry.get("reader-annotation-yellow")?.ranges).toEqual([first, second]);
    expect(registry.get("reader-annotation-green")?.ranges).toEqual([third]);

    setAnnotationHighlights(view, [{ color: "#336699", range: first }]);
    expect([...registry.keys()]).toEqual(["reader-annotation-hex-336699"]);
    expect(
      document.head.querySelector("style[data-mdbase-reader='custom-highlights']")?.textContent,
    ).toContain("color-mix(in srgb, #336699 38%, transparent)");

    clearCssHighlights(view);
    expect(registry.size).toBe(0);
  });
});

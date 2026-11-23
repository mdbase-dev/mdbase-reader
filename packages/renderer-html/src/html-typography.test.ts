// @vitest-environment happy-dom
import { defaultReadingTypography } from "@mdbase-reader/reading-surface";
import { afterEach, describe, expect, it } from "vitest";

import { applyHtmlTypography } from "./html-typography.js";

afterEach(() => {
  document.head.replaceChildren();
});

const rule = (): string =>
  document.head.querySelector("style[data-mdbase-reader='typography']")?.textContent ?? "";

describe("applyHtmlTypography", () => {
  it("sets the reader's size, face and measure, and leaves the page's zoom alone", () => {
    applyHtmlTypography(document, { ...defaultReadingTypography, scale: 1, face: "sans" });
    expect(rule()).toContain("font-size: 18px");
    expect(rule()).toContain("ui-sans-serif");
    expect(rule()).not.toContain("zoom");
    expect(rule()).toContain("(max-width: 640px)");
  });
  it("zooms the whole page for a pane shown at another size, and back again", () => {
    applyHtmlTypography(document, { ...defaultReadingTypography, scale: 1, zoom: 0.5 });
    expect(rule()).toContain("html { zoom: 0.5; }");
    // The reader's own size is unchanged: the zoom scales it with everything else.
    expect(rule()).toContain("font-size: 18px");
    // A pane 640px wide before the zoom is 320px wide on screen.
    expect(rule()).toContain("(max-width: 320px)");
    applyHtmlTypography(document, { ...defaultReadingTypography, scale: 1, zoom: 1 });
    expect(rule()).not.toContain("zoom");
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
  });
});

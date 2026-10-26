import { describe, expect, it } from "vitest";

import {
  highlightColorKey,
  highlightColorKeys,
  highlightColorSpec,
  highlightMeaningMaxLength,
  highlightPalette,
  normalizeHighlightColor,
  offeredHighlightColor,
  readHighlightColorList,
  readHighlightMeanings,
} from "./highlight-color.js";

describe("highlight colours", () => {
  it("keeps the five palette keys in order, yellow first", () => {
    expect(highlightColorKeys).toEqual(["yellow", "green", "blue", "pink", "purple"]);
    for (const key of highlightColorKeys) {
      expect(highlightPalette[key].key).toBe(key);
    }
  });

  it("normalises palette keys regardless of case and spacing", () => {
    expect(normalizeHighlightColor("Blue")).toBe("blue");
    expect(normalizeHighlightColor("  PURPLE ")).toBe("purple");
    expect(highlightColorKey("Green")).toBe("green");
  });

  it("draws missing values as yellow", () => {
    expect(normalizeHighlightColor(undefined)).toBe("yellow");
    expect(normalizeHighlightColor(null)).toBe("yellow");
    expect(normalizeHighlightColor("")).toBe("yellow");
    expect(highlightColorKey(undefined)).toBe("yellow");
  });

  it("draws unknown names as yellow", () => {
    expect(normalizeHighlightColor("orange")).toBe("yellow");
    expect(normalizeHighlightColor("rgb(1, 2, 3)")).toBe("yellow");
    expect(highlightColorSpec("chartreuse")).toBe(highlightPalette.yellow);
  });

  it("keeps hex colours from other apps, translucently, outside the palette", () => {
    expect(normalizeHighlightColor("#FFAA00")).toBe("#ffaa00");
    expect(normalizeHighlightColor("#fa0")).toBe("#fa0");
    expect(highlightColorKey("#ffaa00")).toBeNull();
    expect(highlightColorSpec("#FFAA00")).toEqual({
      key: null,
      label: "#ffaa00",
      light: { wash: "#ffaa00", ink: "#ffaa00" },
      dark: { wash: "#ffaa00", ink: "#ffaa00" },
      washOpacity: 0.38,
    });
    expect(normalizeHighlightColor("#ffaa0")).toBe("yellow");
  });

  it("gives every palette colour opaque light and dark shades", () => {
    for (const key of highlightColorKeys) {
      const spec = highlightColorSpec(key);
      expect(spec.washOpacity).toBe(1);
      for (const value of [spec.light.wash, spec.light.ink, spec.dark.wash, spec.dark.ink]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/u);
      }
    }
  });
});

describe("collection highlight settings", () => {
  it("reads an offered colour list in its order, skipping unknown and repeated colours", () => {
    expect(readHighlightColorList(["pink", "orange", "yellow", "pink"])).toEqual([
      "pink",
      "yellow",
    ]);
    expect(readHighlightColorList(["Pink"])).toEqual([]);
    expect(readHighlightColorList("pink")).toEqual([]);
  });

  it("reads meanings for palette colours only, cleaned and bounded", () => {
    expect(
      readHighlightMeanings({
        blue: "x".repeat(80),
        yellow: "  Key   idea ",
        orange: "No",
        pink: 3,
      }),
    ).toEqual({ yellow: "Key idea", blue: "x".repeat(highlightMeaningMaxLength) });
    expect(readHighlightMeanings(["yellow"])).toEqual({});
    expect(readHighlightMeanings(null)).toEqual({});
  });

  it("takes the preferred colour while it is offered, else the first offered", () => {
    expect(offeredHighlightColor("green", highlightColorKeys)).toBe("green");
    expect(offeredHighlightColor("green", ["blue", "pink"])).toBe("blue");
    expect(offeredHighlightColor("green", [])).toBe("green");
  });
});

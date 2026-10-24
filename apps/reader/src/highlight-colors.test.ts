// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { highlightColorKeys, highlightPalette } from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  highlightColorName,
  highlightMeaning,
  highlightMeaningMaxLength,
  highlightMeanings,
  lastHighlightColor,
  setHighlightMeaning,
  setLastHighlightColor,
} from "./highlight-colors.js";

// A path rather than a URL: happy-dom replaces the global URL with one Node's fs refuses.
const tokens = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "reader-tokens.css"),
  "utf8",
);

afterEach(() => localStorage.clear());

describe("highlight colour preferences", () => {
  it("remembers the last colour used and starts at yellow", () => {
    expect(lastHighlightColor()).toBe("yellow");
    setLastHighlightColor("pink");
    expect(lastHighlightColor()).toBe("pink");
    expect(localStorage.getItem("mdbase-reader:highlight-color")).toBe("pink");
    localStorage.setItem("mdbase-reader:highlight-color", "orange");
    expect(lastHighlightColor()).toBe("yellow");
  });

  it("stores meanings per device, trimmed and bounded, and clears blank ones", () => {
    expect(highlightMeanings()).toEqual({});
    setHighlightMeaning("yellow", "  Key   idea ");
    setHighlightMeaning("blue", "x".repeat(80));
    expect(highlightMeanings()).toEqual({
      yellow: "Key idea",
      blue: "x".repeat(highlightMeaningMaxLength),
    });
    expect(highlightMeanings()).toBe(highlightMeanings());
    setHighlightMeaning("yellow", " ");
    expect(highlightMeanings()).toEqual({ blue: "x".repeat(highlightMeaningMaxLength) });
    expect(JSON.parse(localStorage.getItem("mdbase-reader:highlight-meanings") ?? "")).toEqual({
      blue: "x".repeat(highlightMeaningMaxLength),
    });
  });

  it("ignores stored meanings it cannot read", () => {
    localStorage.setItem("mdbase-reader:highlight-meanings", "{not json");
    expect(highlightMeanings()).toEqual({});
    localStorage.setItem(
      "mdbase-reader:highlight-meanings",
      JSON.stringify({ green: "Evidence", orange: "Nope", pink: 3 }),
    );
    expect(highlightMeanings()).toEqual({ green: "Evidence" });
  });

  it("names a colour with its meaning, in words", () => {
    const meanings = { yellow: "Key idea" };
    expect(highlightColorName("yellow", meanings)).toBe("Yellow — Key idea");
    expect(highlightColorName(undefined, meanings)).toBe("Yellow — Key idea");
    expect(highlightColorName("Green", meanings)).toBe("Green");
    expect(highlightColorName("#ff8800", meanings)).toBe("Custom colour");
    expect(highlightMeaning("yellow", meanings)).toBe("Key idea");
    expect(highlightMeaning("blue", meanings)).toBeNull();
  });
});

describe("highlight tokens", () => {
  // OKLCH -> sRGB, as in docs/design-direction.md.
  function oklchHex(lightness: number, chroma: number, hue: number): string {
    const radians = (hue * Math.PI) / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return `#${[
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
      .map((linear) => {
        const c = Math.min(1, Math.max(0, linear));
        const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")}`;
  }
  function token(block: string, name: string): string {
    const match = new RegExp(`--${name}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`, "u").exec(
      block,
    );
    if (!match) {
      throw new Error(`Missing token --${name}`);
    }
    return oklchHex(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
  }

  it("match the renderers' palette in both themes", () => {
    const light = tokens.slice(
      tokens.indexOf(":root {"),
      tokens.indexOf(':root[data-theme="dark"]'),
    );
    const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
    for (const key of highlightColorKeys) {
      expect(token(light, `hl-${key}`)).toBe(highlightPalette[key].light.wash);
      expect(token(light, `ink-${key}`)).toBe(highlightPalette[key].light.ink);
      expect(token(dark, `hl-${key}`)).toBe(highlightPalette[key].dark.wash);
      expect(token(dark, `ink-${key}`)).toBe(highlightPalette[key].dark.ink);
    }
  });
});

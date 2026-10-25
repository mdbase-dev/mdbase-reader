// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { highlightColorKeys, highlightPalette } from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  deviceHighlightMeanings,
  forgetDeviceHighlightMeanings,
  highlightChoices,
  highlightColorName,
  highlightMeaning,
  lastHighlightColor,
  setLastHighlightColor,
} from "./highlight-colors.js";
import { bindCollectionHighlights } from "./highlight-settings.fixtures.js";

// A path rather than a URL: happy-dom replaces the global URL with one Node's fs refuses.
const tokens = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "reader-tokens.css"),
  "utf8",
);

afterEach(() => localStorage.clear());

let stopBinding: (() => void) | undefined;
afterEach(() => {
  stopBinding?.();
  stopBinding = undefined;
});

function bind(fields: Record<string, unknown> = {}): ReturnType<typeof bindCollectionHighlights> {
  const bound = bindCollectionHighlights(fields);
  stopBinding = bound.stop;
  return bound;
}

describe("highlight colour preferences", () => {
  it("remembers the last colour used and starts at yellow", () => {
    expect(lastHighlightColor()).toBe("yellow");
    setLastHighlightColor("pink");
    expect(lastHighlightColor()).toBe("pink");
    expect(localStorage.getItem("mdbase-reader:highlight-color")).toBe("pink");
    localStorage.setItem("mdbase-reader:highlight-color", "orange");
    expect(lastHighlightColor()).toBe("yellow");
  });

  it("offers all five colours in today's order with no meanings by default", () => {
    expect(highlightChoices()).toEqual({
      colors: highlightColorKeys,
      meanings: {},
      meaningsFromDevice: false,
    });
    bind();
    expect(highlightChoices().colors).toEqual(highlightColorKeys);
    expect(highlightChoices().meanings).toEqual({});
    expect(highlightChoices()).toBe(highlightChoices());
  });

  it("follows the collection's colours, order and meanings, live", () => {
    const bound = bind({
      highlight_colors: ["blue", "yellow"],
      highlight_meanings: { blue: "Term" },
    });
    expect(highlightChoices().colors).toEqual(["blue", "yellow"]);
    expect(highlightChoices().meanings).toEqual({ blue: "Term" });
    bound.set({
      highlight_colors: ["pink", "orange", "pink"],
      highlight_meanings: { pink: " Ask  ", orange: "Nope" },
    });
    // Unknown and repeated colours are skipped.
    expect(highlightChoices().colors).toEqual(["pink"]);
    expect(highlightChoices().meanings).toEqual({ pink: "Ask" });
    bound.set({ highlight_colors: [] });
    expect(highlightChoices().colors).toEqual(highlightColorKeys);
    bound.stop();
    expect(highlightChoices().colors).toEqual(highlightColorKeys);
  });

  it("uses the first offered colour while the one used last is hidden, keeping the preference", () => {
    setLastHighlightColor("green");
    const bound = bind({ highlight_colors: ["blue", "pink"] });
    expect(lastHighlightColor()).toBe("blue");
    expect(localStorage.getItem("mdbase-reader:highlight-color")).toBe("green");
    bound.set({ highlight_colors: ["pink", "green"] });
    expect(lastHighlightColor()).toBe("green");
  });

  it("shows this device's old meanings until the collection has its own", () => {
    localStorage.setItem(
      "mdbase-reader:highlight-meanings",
      JSON.stringify({ green: "Evidence", orange: "Nope", pink: 3 }),
    );
    expect(deviceHighlightMeanings()).toEqual({ green: "Evidence" });
    const bound = bind();
    expect(highlightChoices()).toMatchObject({
      meanings: { green: "Evidence" },
      meaningsFromDevice: true,
    });
    bound.set({ highlight_meanings: { blue: "Definition" } });
    expect(highlightChoices()).toMatchObject({
      meanings: { blue: "Definition" },
      meaningsFromDevice: false,
    });
    forgetDeviceHighlightMeanings();
    expect(localStorage.getItem("mdbase-reader:highlight-meanings")).toBeNull();
  });

  it("ignores device meanings it cannot read", () => {
    localStorage.setItem("mdbase-reader:highlight-meanings", "{not json");
    expect(deviceHighlightMeanings()).toEqual({});
    expect(highlightChoices().meaningsFromDevice).toBe(false);
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

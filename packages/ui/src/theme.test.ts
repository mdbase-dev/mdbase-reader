import { describe, expect, it } from "vitest";

import {
  applyThemePreference,
  loadThemePreference,
  normalizeThemePreference,
  saveThemePreference,
} from "./theme.js";

function rootFixture(): { readonly dataset: DOMStringMap; removeAttribute(name: string): void } {
  const dataset = {} as DOMStringMap;
  return {
    dataset,
    removeAttribute: (name) => {
      if (name === "data-theme") {
        delete dataset["theme"];
      }
    },
  };
}

describe("mdbase theme", () => {
  it("normalizes unknown preferences to system", () => {
    expect(normalizeThemePreference("sepia")).toBe("system");
  });

  it("uses the shared mdbase storage key and DOM attribute", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const root = rootFixture();
    saveThemePreference("dark", storage, root);
    expect(loadThemePreference(storage)).toBe("dark");
    expect(root.dataset["theme"]).toBe("dark");
    applyThemePreference("system", root);
    expect(root.dataset["theme"]).toBeUndefined();
  });
});

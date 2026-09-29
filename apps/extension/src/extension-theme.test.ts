// @vitest-environment happy-dom
import { THEME_STORAGE_KEY } from "@mdbase-dev/ui/theme";
import { afterEach, expect, it } from "vitest";

import { startTheme } from "./extension-theme.js";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function changeElsewhere(value: string | null): void {
  window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: value }));
}

it("applies the saved theme before the page renders", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  const stop = startTheme(localStorage, document.documentElement, window);
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  stop();
});
it("follows the system when nothing, or something unknown, is saved", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "sepia");
  const stop = startTheme(localStorage, document.documentElement, window);
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  stop();
});
it("switches when another extension page changes the theme, until stopped", () => {
  const stop = startTheme(localStorage, document.documentElement, window);
  changeElsewhere("light");
  expect(document.documentElement.dataset["theme"]).toBe("light");
  changeElsewhere("system");
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  stop();
  changeElsewhere("dark");
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});

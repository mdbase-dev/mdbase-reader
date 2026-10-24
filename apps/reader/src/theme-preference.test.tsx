// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useThemePreference } from "./reader-app-hooks.js";

import type { ThemePreference } from "@mdbase-dev/ui/theme";

let root: ReturnType<typeof createRoot>;
let current: readonly [ThemePreference, (next: ThemePreference) => void] | null = null;

function Probe(): null {
  current = useThemePreference();
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  current = null;
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

it("follows the system theme until the reader chooses one", async () => {
  await act(async () => root.render(<Probe />));
  expect(current?.[0]).toBe("system");
  // No data-theme attribute: the palette follows prefers-color-scheme.
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

  await act(async () => current?.[1]("dark"));
  expect(document.documentElement.dataset.theme).toBe("dark");

  await act(async () => current?.[1]("system"));
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});

it("keeps an explicit light or dark choice", async () => {
  localStorage.setItem("mdbase:theme", "light");
  await act(async () => root.render(<Probe />));
  expect(current?.[0]).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});

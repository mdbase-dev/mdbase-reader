// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React work */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useThemePreference } from "./reader-app-hooks.js";

import type { ThemePreference } from "@mdbase-dev/ui/theme";

type ThemeState = readonly [ThemePreference, (next: ThemePreference) => void];

let root: ReturnType<typeof createRoot>;
const probe: { current: ThemeState | null } = { current: null };

function Probe({ onState }: { readonly onState: (state: ThemeState) => void }): null {
  const state = useThemePreference();
  useEffect(() => onState(state));
  return null;
}

const report = (state: ThemeState): void => {
  probe.current = state;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  probe.current = null;
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

it("follows the system theme until the reader chooses one", async () => {
  await act(async () => root.render(<Probe onState={report} />));
  expect(probe.current?.[0]).toBe("system");
  // No data-theme attribute: the palette follows prefers-color-scheme.
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

  await act(async () => probe.current?.[1]("dark"));
  expect(document.documentElement.dataset["theme"]).toBe("dark");

  await act(async () => probe.current?.[1]("system"));
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});

it("keeps an explicit light or dark choice", async () => {
  localStorage.setItem("mdbase:theme", "light");
  await act(async () => root.render(<Probe onState={report} />));
  expect(probe.current?.[0]).toBe("light");
  expect(document.documentElement.dataset["theme"]).toBe("light");
});

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DisplaySettings } from "./DisplaySettings.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function settings(
  open: { onOpenFileNames?: () => void; onOpenHighlightColors?: () => void } = {},
): React.JSX.Element {
  return (
    <DisplaySettings
      theme="system"
      onChangeTheme={() => undefined}
      density="comfortable"
      sidebarWhileReading="hide"
      {...open}
    />
  );
}

function button(name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
}

it("keeps highlight meanings out of this device's display settings", async () => {
  await act(async () => root.render(settings()));
  expect(host.querySelector("input[type='text']")).toBeNull();
  expect(host.textContent).not.toContain("This collection");
});

it("opens the collection's highlight colours and file names when the collection has settings", async () => {
  const onOpenFileNames = vi.fn();
  const onOpenHighlightColors = vi.fn();
  await act(async () => root.render(settings({ onOpenFileNames, onOpenHighlightColors })));
  expect(host.textContent).toContain("This collection");
  await act(async () => button("Highlight colours…")?.click());
  expect(onOpenHighlightColors).toHaveBeenCalledOnce();
  await act(async () => button("File names…")?.click());
  expect(onOpenFileNames).toHaveBeenCalledOnce();
});

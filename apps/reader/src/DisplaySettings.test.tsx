// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DisplaySettings } from "./DisplaySettings.js";
import { createRoot } from "./testing/i18n.js";

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

function settings(onOpenSettings?: () => void): React.JSX.Element {
  return (
    <DisplaySettings
      theme="system"
      onChangeTheme={() => undefined}
      density="comfortable"
      sidebarWhileReading="hide"
      {...(onOpenSettings ? { onOpenSettings } : {})}
    />
  );
}

function button(name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
}

it("keeps highlight meanings and collection settings out of the display menu", async () => {
  await act(async () => root.render(settings()));
  expect(host.querySelector("input[type='text']")).toBeNull();
  expect(host.textContent).not.toContain("This collection");
  expect(button("Settings…")).toBeUndefined();
});

it("opens the Settings page from the display menu", async () => {
  const onOpenSettings = vi.fn();
  await act(async () => root.render(settings(onOpenSettings)));
  expect(button("Highlight colours…")).toBeUndefined();
  expect(button("File names…")).toBeUndefined();
  await act(async () => button("Settings…")?.click());
  expect(onOpenSettings).toHaveBeenCalledOnce();
});

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DisplaySettings, HighlightMeaningSettings } from "./DisplaySettings.js";
import { highlightMeanings, setHighlightMeaning } from "./highlight-colors.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  setHighlightMeaning("yellow", "");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HighlightMeaningSettings />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function field(name: string): HTMLInputElement {
  return [...host.querySelectorAll("label")]
    .find((label) => label.querySelector(".sr-only")?.textContent === name)!
    .querySelector("input")!;
}

it("names a field per colour and suggests a meaning without choosing one", () => {
  expect([...host.querySelectorAll(".sr-only")].map((label) => label.textContent)).toEqual([
    "Yellow meaning",
    "Green meaning",
    "Blue meaning",
    "Pink meaning",
    "Purple meaning",
  ]);
  expect(field("Yellow meaning").placeholder).toBe("e.g. Key idea");
  expect(field("Yellow meaning").value).toBe("");
  expect(field("Yellow meaning").maxLength).toBe(40);
});

it("saves a meaning when the field is left, and clears it when emptied", async () => {
  const yellow = field("Yellow meaning");
  await act(async () => {
    yellow.value = "  Core   claim ";
    yellow.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(highlightMeanings()).toEqual({ yellow: "Core claim" });
  expect(field("Yellow meaning").value).toBe("Core claim");
  await act(async () => {
    const current = field("Yellow meaning");
    current.value = "";
    current.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(highlightMeanings()).toEqual({});
});

it("opens the collection's file names when the collection has settings", async () => {
  const onOpenFileNames = vi.fn();
  const settings = (open?: () => void): React.JSX.Element => (
    <DisplaySettings
      theme="system"
      onChangeTheme={() => undefined}
      density="comfortable"
      sidebarWhileReading="hide"
      {...(open ? { onOpenFileNames: open } : {})}
    />
  );
  await act(async () => root.render(settings()));
  expect(host.textContent).not.toContain("File names…");
  await act(async () => root.render(settings(onOpenFileNames)));
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "File names…",
  );
  await act(async () => button?.click());
  expect(onOpenFileNames).toHaveBeenCalledOnce();
});

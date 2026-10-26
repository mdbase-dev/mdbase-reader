// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CitationPanel } from "./CitationPanel.js";
import { createRoot } from "./testing/i18n.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { Root } from "react-dom/client";

let host: HTMLDivElement;
let root: Root;
const writeText = vi.fn((_value: string) => Promise.resolve());

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const citation = {
  id: "watson1953",
  type: "article-journal",
  title: "Molecular structure of nucleic acids",
  author: [{ family: "Watson", given: "James" }],
  issued: { "date-parts": [[1953]] },
  "container-title": "Nature",
};

async function show(): Promise<void> {
  act(() =>
    root.render(
      <CitationPanel
        controller={
          {
            capture: { kind: "html", canonicalUrl: "https://example.com/" },
            source: { collectionId: "c1", id: "s1", title: "Fallback", citation },
          } as unknown as ExtensionCaptureController
        }
      />,
    ),
  );
  // citeproc loads and formats asynchronously, outside React's act queue.
  await vi.waitFor(() => expect(host.querySelector(".citation-reference")).not.toBeNull(), {
    timeout: 5000,
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) {
    throw new Error(`No ${label} button`);
  }
  return found;
}

it("formats the stored citation as Reader does and copies it in one step", async () => {
  await show();
  const reference = host.querySelector(".citation-reference")?.textContent ?? "";
  expect(reference).toContain("Watson, J. (1953). Molecular structure of nucleic acids. Nature.");
  expect(host.textContent).toContain("APA 7TH");
  await act(async () => button("Copy citation").click());
  expect(writeText).toHaveBeenCalledWith(reference);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Copied as APA 7th");
});

it("keeps the citekey and CSL-JSON in a small menu", async () => {
  await show();
  const menu = host.querySelector<HTMLDetailsElement>("details.copy-menu");
  expect(menu?.querySelector("summary")?.getAttribute("aria-label")).toBe("More ways to copy");
  act(() => {
    if (menu) {
      menu.open = true;
    }
  });
  await act(async () => button("Copy citekey").click());
  expect(writeText).toHaveBeenLastCalledWith("@watson1953");
  expect(menu?.open).toBe(false);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Copied the citekey");
  await act(async () => button("Copy CSL-JSON").click());
  expect(JSON.parse(writeText.mock.lastCall?.[0] ?? "")).toEqual(citation);
});

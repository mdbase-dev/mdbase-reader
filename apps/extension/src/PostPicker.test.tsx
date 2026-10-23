// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PostPicker } from "./PostPicker.js";
import { withI18n } from "./testing/i18n.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { PostRef } from "@mdbase-reader/web-capture";

let host: HTMLDivElement;
let root: Root;
const save = vi.fn(() => Promise.resolve());
const cancel = vi.fn();
const items: PostRef[] = ["100", "101", "102"].map((id) => ({
  platform: "x",
  id,
  url: `https://x.com/i/status/${id}`,
  author: "Fixture Author",
  snippet: `Durable post ${id}`,
  published: "2026-10-01T12:00:00Z",
  top: 0,
  bottom: 200,
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function show(loaded = items, busy = false): void {
  act(() =>
    root.render(
      withI18n(
        <PostPicker
          controller={
            {
              busy,
              navigated: false,
              snapshot: { status: "ready" },
              postPicker: { open: true, items: loaded, preselected: "101", save, close: cancel },
            } as unknown as ExtensionCaptureController
          }
        />,
      ),
    ),
  );
}

it("preselects the viewport-centred post, shows author/snippet/time, and supports multi-select", () => {
  show();
  const inputs = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect([...inputs].map((input) => input.checked)).toEqual([false, true, false]);
  expect(host.textContent).toContain("Fixture Author");
  expect(host.textContent).toContain("Durable post 101");
  expect(host.querySelector("time")?.getAttribute("datetime")).toBe(items[0]?.published);
  act(() => inputs[0]?.click());
  act(() => host.querySelector<HTMLButtonElement>("button.primary")?.click());
  expect(save).toHaveBeenCalledWith(["101", "100"]);
});

it("excludes a selected post that virtual scrolling has removed rather than saving a stale reference", () => {
  show();
  show([items[0]!]);
  expect(host.querySelector<HTMLInputElement>("input")?.checked).toBe(false);
  expect(host.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it("locks selection and saving while a multi-post save is in progress", () => {
  show(items, true);
  expect(host.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
});

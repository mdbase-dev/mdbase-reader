// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { createTestApp, type TestApp } from "@mdbase-reader/connect/testing";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { ReaderCollectionSwitcher } from "./reader-collections.js";
import { SdkReaderRoot, type ReaderNativeScope } from "./SdkReaderRoot.js";

vi.mock("@mdbase-dev/ui/feedback", () => ({ FeedbackButton: () => null }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const owned: TestApp[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await Promise.all(owned.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

async function fixture(ready: boolean): Promise<TestApp> {
  const app = await createTestApp({
    declaration: {
      id: "reader.fixture",
      name: manifest.name,
      origin: "https://reader.mdbase.dev",
      environment: "lab",
      manifest,
    },
    collections: [{ name: "Reading" }, { name: "Archive", role: "editor" }],
    phase: ready ? "ready" : "choosing",
  });
  owned.push(app);
  return app;
}

function button(label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>("button")].find(
    (item) => item.textContent.trim() === label,
  );
  if (!found) {
    throw new Error(`No ${label} button in: ${document.body.textContent}`);
  }
  return found;
}

function calls(h: TestApp, action: string): number {
  return h.controls.observedActions().filter((call) => call.action === action).length;
}

it("renders Reader only once the gate hands over a ready connection", async () => {
  const h = await fixture(true);
  const renderNative = vi.fn(({ collection }: ReaderNativeScope) => (
    <p>workspace: {collection.collectionName}</p>
  ));
  await act(async () =>
    root.render(
      <StrictMode>
        <SdkReaderRoot sdk={h.mdbase} renderNative={renderNative} />
      </StrictMode>,
    ),
  );
  expect(host.textContent).toContain("workspace:");
  expect(renderNative.mock.calls.at(-1)?.[0].connection.id).toBe(h.client().collection);
});

it("lists collections on the shared gate and signs out with signOut, never close", async () => {
  const h = await fixture(false);
  const renderNative = vi.fn(() => <p>workspace</p>);
  await act(async () => root.render(<SdkReaderRoot sdk={h.mdbase} renderNative={renderNative} />));
  expect(renderNative).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Your collections");
  expect(host.textContent).toContain("Archive");
  await act(async () => button("Sign out").click());
  expect(calls(h, "signOut")).toBe(1);
  expect(calls(h, "close")).toBe(0);
});

it("the header switcher asks about unsaved edits before switching collections", async () => {
  const h = await fixture(true);
  let allow = false;
  const beforeSwitch = vi.fn(() => allow);
  await act(async () =>
    root.render(<ReaderCollectionSwitcher mdbase={h.mdbase} beforeSwitch={beforeSwitch} />),
  );
  const trigger = host.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
  expect(trigger?.getAttribute("aria-label")).toBe("Switch collection, current: Reading");
  const pick = async (): Promise<void> => {
    await act(async () => trigger?.click());
    const archive = [...document.querySelectorAll<HTMLElement>("[role=radio]")].find((row) =>
      row.textContent.includes("Archive"),
    );
    await act(async () => archive?.click());
  };
  await pick();
  expect(beforeSwitch).toHaveBeenCalledOnce();
  expect(calls(h, "select")).toBe(0);
  allow = true;
  await pick();
  expect(calls(h, "select")).toBe(1);
});

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  createApplicationFixture,
  fixtureMdbase,
  memoryConnection,
} from "@mdbase-reader/connect/testing";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { ReaderCollectionSwitcher } from "./reader-collections.js";
import { SdkReaderRoot, type ReaderNativeScope } from "./SdkReaderRoot.js";

import type { Mdbase, MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

vi.mock("@mdbase-dev/ui/feedback", () => ({ FeedbackButton: () => null }));

const facet = { checking: false, assessment: null, problem: null };
const paired = {
  requestId: "fixture-request",
  installationId: "fixture-installation",
  deviceId: "fixture-device",
  appId: "fixture-app",
  kind: "app-runtime",
  verificationUri: "https://mdbase.test/approve",
  state: "paired",
  accountId: "fixture-account",
  accountProvider: "github",
  accountLogin: "reader-user",
  collectionIds: [],
  createCollections: false,
  requestedCreateCollections: false,
} as const;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const owned: { close(): void }[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const item of owned.splice(0).reverse()) {
    item.close();
  }
  vi.unstubAllGlobals();
});

type ReaderFixture = ReturnType<typeof createApplicationFixture> & {
  readonly native: Awaited<ReturnType<typeof memoryConnection>>;
  readonly mdbase: Mdbase;
};

async function fixture(ready: boolean): Promise<ReaderFixture> {
  const native = await memoryConnection({ where: () => false });
  owned.push(native);
  const other = {
    collectionId: "other-collection",
    displayName: "Archive",
    role: "editor",
  } as const;
  const snapshot: MdbaseApplicationSnapshot = {
    status: ready ? "ready" : "unselected",
    signIn: paired,
    collections: [
      { collectionId: native.connection.id, displayName: "Reading", role: "owner" },
      other,
    ],
    selectedCollectionId: ready ? native.connection.id : null,
    problem: null,
    timing: null,
    selection: {
      state: "none",
      requested: { collectionId: null, source: "none", displayName: null, approved: false },
      usable: null,
      problem: null,
    },
    readiness: {
      ...facet,
      assessment: ready ? { status: "ready", problem: null } : null,
      facets: {
        capabilities: facet,
        contracts: facet,
        configuration: facet,
        files: facet,
        people: facet,
        notifications: facet,
      },
    },
  };
  const created = createApplicationFixture({
    declaration: {
      id: "reader.fixture",
      name: manifest.name,
      origin: "https://reader.mdbase.dev",
      environment: "lab",
      manifest,
    },
    connections: [native.connection],
    initialSnapshot: snapshot,
  });
  owned.push(created.controls);
  return { ...created, native, mdbase: fixtureMdbase(created) };
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

function calls(h: ReaderFixture, action: string): number {
  return h.controls.observedActions().filter((call) => call.action === action).length;
}

it("starts the SDK and renders Reader only once the gate hands over a ready connection", async () => {
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
  expect(calls(h, "start")).toBeGreaterThan(0);
  expect(host.textContent).toContain("workspace:");
  expect(renderNative.mock.calls.at(-1)?.[0].connection.id).toBe(h.native.connection.id);
});

it("lists collections on the shared gate and signs out with signOut, never close", async () => {
  const h = await fixture(false);
  const close = vi.spyOn(h.mdbase, "close");
  const renderNative = vi.fn(() => <p>workspace</p>);
  await act(async () => root.render(<SdkReaderRoot sdk={h.mdbase} renderNative={renderNative} />));
  expect(renderNative).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Your collections");
  expect(host.textContent).toContain("Archive");
  await act(async () => button("Sign out").click());
  expect(calls(h, "signOut")).toBe(1);
  expect(close).not.toHaveBeenCalled();
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

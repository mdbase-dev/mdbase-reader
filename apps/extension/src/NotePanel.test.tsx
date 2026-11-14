// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { sourceFromDocument } from "@mdbase-reader/connect";
import { createTestApp } from "@mdbase-reader/connect/testing";
import { collectionId } from "@mdbase-reader/core";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CaptureApp } from "./CaptureApp.js";
import { SourceNoteSession, type NoteDraftStore } from "./source-note-session.js";
import { fakeChrome } from "./testing/fake-chrome.js";
import { createRoot } from "./testing/i18n.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { Mdbase, MdbaseClient } from "@mdbase-dev/sdk";
import type { Source } from "@mdbase-reader/core";
import type { Root } from "react-dom/client";
import type { MockInstance } from "vitest";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", fakeChrome().chrome);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const close of closes.splice(0)) {
    await close();
  }
});

let saved = {
  id: "s1",
  collectionId: "c1",
  path: "sources/s1.md",
  title: "[test] Saved",
  creators: [],
  tags: ["ml"],
  documents: [],
  frontmatter: {},
  body: "My note",
  recordRevision: "r1",
} as unknown as Source;

async function collection(): Promise<{
  mdbase: Mdbase;
  updateFields: MockInstance<MdbaseClient["update"]>;
  edit: (changes: { title: string }) => void;
}> {
  const app = await createTestApp({
    collections: [
      {
        name: "Reading",
        records: [
          {
            path: "sources/s1.md",
            types: ["reader-source"],
            frontmatter: { id: "s1", title: "[test] Saved", tags: ["ml"] },
            body: "My note",
          },
        ],
      },
    ],
  });
  closes.push(() => app.close());
  const client = app.client();
  saved = sourceFromDocument(
    collectionId(client.collection),
    await client.get({ path: "sources/s1.md" }, { include: { effective: true, body: true } }),
  );
  return {
    mdbase: app.mdbase,
    updateFields: vi.spyOn(client, "update"),
    edit: (changes: { title: string }) =>
      app.replica().editElsewhere(saved.path, { frontmatter: changes }),
  };
}

const memory: NoteDraftStore = { load: () => Promise.resolve(null), save: () => Promise.resolve() };

async function show(session: SourceNoteSession): Promise<void> {
  const controller = {
    snapshot: { status: "ready", collectionId: "c1", collections: [] },
    capture: { kind: "html", pageTitle: "[test] Saved", canonicalUrl: "https://example.com/" },
    draft: { title: "", tags: "", note: "", comment: "", color: "yellow", highlightTags: "" },
    source: saved,
    status: "existing",
    problem: null,
    busy: false,
    annotations: [],
    setDraft: vi.fn(),
    highlight: { colors: ["yellow"], meanings: {} },
    knownTags: [],
    loadTags: vi.fn(),
    note: { status: "ready", session, problem: null, load: vi.fn() },
  } as unknown as ExtensionCaptureController;
  await act(async () => root.render(<CaptureApp controller={controller} initialTab="note" />));
}

function type(input: HTMLInputElement | null, value: string): void {
  if (!input) {
    throw new Error("No such field");
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("autosaves a saved source's title and tags as they are typed", async () => {
  const fake = await collection();
  const session = new SourceNoteSession(fake.mdbase, saved, memory);
  await session.start();
  vi.useFakeTimers();
  await show(session);
  const title = host.querySelector<HTMLInputElement>("#saved-title");
  const tags = host.querySelector<HTMLInputElement>("#saved-tags");
  expect(title?.value).toBe("[test] Saved");
  expect(tags?.value).toBe("ml");

  act(() => {
    type(title, "[test] Renamed");
  });
  act(() => {
    type(tags, "ml, vision, ");
  });
  expect(host.querySelector(".note-state")?.textContent).toBe("Unsaved changes");
  await act(async () => vi.advanceTimersByTimeAsync(1100));

  expect(fake.updateFields).toHaveBeenCalledWith(
    expect.objectContaining({ path: saved.path }),
    expect.objectContaining({
      patch: new Map([
        ["title", "[test] Renamed"],
        ["tags", ["ml", "vision"]],
      ] as [string, string | string[]][]),
    }),
    expect.anything(),
  );
  expect(host.querySelector(".note-state")?.textContent).toBe("Saved");
  // The trailing separator being typed stays.
  expect(tags?.value).toBe("ml, vision, ");
});

it("keeps a cleared title out of the collection and says which one is kept", async () => {
  const fake = await collection();
  const session = new SourceNoteSession(fake.mdbase, saved, memory);
  await session.start();
  vi.useFakeTimers();
  await show(session);
  const title = host.querySelector<HTMLInputElement>("#saved-title");
  act(() => {
    type(title, "");
  });
  await act(async () => vi.advanceTimersByTimeAsync(1100));
  expect(fake.updateFields).not.toHaveBeenCalled();
  expect(host.textContent).toContain(
    "A source needs a title. Until it has a new one, “[test] Saved” is kept.",
  );
});

it("stops on a conflicting title with both versions in reach, and flags the tab", async () => {
  const fake = await collection();
  const session = new SourceNoteSession(fake.mdbase, saved, memory);
  await session.start();
  vi.useFakeTimers();
  await show(session);
  const title = host.querySelector<HTMLInputElement>("#saved-title");
  act(() => {
    type(title, "[test] Mine");
  });
  fake.edit({ title: "[test] Theirs" });
  await act(async () => vi.advanceTimersByTimeAsync(1100));

  const banner = host.querySelector('.conflict[role="alert"]');
  expect(banner?.textContent).toContain("This changed somewhere else while you were editing");
  expect(banner?.querySelector("summary")?.textContent).toBe("See their version");
  expect(banner?.querySelector(".other-version")?.textContent).toContain("[test] Theirs");
  expect(title?.readOnly).toBe(true);
  expect(host.querySelector("#panel-tab-note")?.textContent).toContain("needs your attention");

  const keep = [...(banner?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent === "Keep mine",
  );
  await act(async () => keep?.click());
  await act(async () => vi.advanceTimersByTimeAsync(1100));
  expect(fake.updateFields).toHaveBeenCalledWith(
    expect.objectContaining({ path: saved.path }),
    expect.objectContaining({ patch: new Map([["title", "[test] Mine"]]) }),
    expect.anything(),
  );
  expect(host.querySelector(".conflict")).toBeNull();
  expect(host.querySelector("#panel-tab-note")?.textContent).not.toContain("attention");
});

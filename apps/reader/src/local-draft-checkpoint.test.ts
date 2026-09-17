// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { collectionId, sourceId, recordRevision, type Source } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import {
  annotationDraftSnapshot,
  loadAnnotationDraft,
  saveAnnotationDraft,
} from "./annotation-drafts.js";
import { LocalDraftCheckpoint, flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";
import { SourceDraftSession } from "./source-draft-session.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

const source: Source = {
  collectionId: collectionId("lifecycle"),
  id: sourceId("note"),
  path: "note.md",
  title: "Note",
  creators: [],
  tags: [],
  documents: [],
  frontmatter: {},
  body: "Original",
  recordRevision: recordRevision("1"),
};
afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("flushes on hide/pagehide and never replays a cancelled checkpoint", () => {
  vi.useFakeTimers();
  const write = vi.fn();
  const checkpoint = new LocalDraftCheckpoint(write);
  checkpoint.schedule();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(write).toHaveBeenCalledOnce();
  checkpoint.schedule();
  window.dispatchEvent(new Event("pagehide"));
  expect(write).toHaveBeenCalledTimes(2);
  checkpoint.schedule();
  checkpoint.cancel();
  vi.advanceTimersByTime(4000);
  expect(write).toHaveBeenCalledTimes(2);
});

it("flushes synchronous note storage before deciding whether unload is safe", () => {
  vi.useFakeTimers();
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
  const session = new SourceDraftSession(source, storage, vi.fn(), vi.fn(), vi.fn());
  session.edit("Pending text");
  expect(storage.setItem).not.toHaveBeenCalled();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(storage.setItem).toHaveBeenCalledOnce();
  expect(session.getSnapshot().locallySaved).toBe(true);
  expect(event.defaultPrevented).toBe(false);
});

it("still warns on unload if the checkpoint cannot be written", () => {
  vi.useFakeTimers();
  const storage = {
    getItem: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(() => {
      throw new Error("Storage unavailable");
    }),
  };
  const session = new SourceDraftSession(source, storage, vi.fn(), vi.fn(), vi.fn());
  session.edit("Keep this window open");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(session.getSnapshot().locallySaved).toBe(false);
  trackUnstoredSourceChanges(session, false);
});

it("starts annotation checkpoints on unload but guards until IndexedDB commits", async () => {
  const key = "lifecycle-annotation";
  await loadAnnotationDraft(key);
  saveAnnotationDraft(key, { body: "Pending comment" });
  const pending = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  const stored = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(stored);
  expect(stored.defaultPrevented).toBe(false);
});

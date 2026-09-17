import { collectionId, sourceId, recordRevision, type Source } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";
import { SourceDraftSession } from "./source-draft-session.js";
import { readSourceDraft, writeSourceDraft, type DraftStorage } from "./source-draft-storage.js";

const source: Source = {
  collectionId: collectionId("test"),
  id: sourceId("note"),
  path: "note.md",
  title: "Test",
  creators: [],
  tags: [],
  documents: [],
  frontmatter: {},
  body: "Original",
  recordRevision: recordRevision("1"),
};
function fixture(): {
  session: SourceDraftSession;
  storage: DraftStorage;
  persist: ReturnType<typeof vi.fn>;
} {
  const values = new Map<string, string>();
  const storage: DraftStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  const persist = vi.fn((_base: Source, body: string) =>
    Promise.resolve({ ...source, body, recordRevision: recordRevision("2") }),
  );
  return {
    storage,
    persist,
    session: new SourceDraftSession(
      source,
      storage,
      persist,
      () => Promise.resolve(source),
      vi.fn(),
    ),
  };
}
afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("shares large edits immediately but checkpoints only the latest text after idle", async () => {
  vi.useFakeTimers();
  const { session, storage, persist } = fixture();
  const write = vi.spyOn(storage, "setItem");
  const notify = vi.fn();
  session.subscribe(notify);
  const body = "Large note. ".repeat(10_000);
  for (let i = 0; i < 20; i += 1) {
    session.edit(`${body}${String(i)}`);
    expect(session.getText()).toBe(`${body}${String(i)}`);
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(write).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledTimes(20);
  expect(session.getSnapshot().locallySaved).toBe(false);
  await vi.advanceTimersByTimeAsync(450);
  expect(write).toHaveBeenCalledOnce();
  expect(readSourceDraft(storage, source)?.body).toBe(`${body}19`);
  expect(session.getSnapshot().locallySaved).toBe(true);
  expect(persist).not.toHaveBeenCalled();
  session.edit(`${body}new`);
  expect(session.getSnapshot().locallySaved).toBe(false);
  expect(write).toHaveBeenCalledOnce();
});
it("checkpoints every three seconds even when typing never pauses", async () => {
  vi.useFakeTimers();
  const { session, storage, persist } = fixture();
  const write = vi.spyOn(storage, "setItem");
  for (let i = 0; i < 60; i += 1) {
    session.edit(`Continuous ${String(i)}`);
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(write).toHaveBeenCalledTimes(2);
  expect(readSourceDraft(storage, source)?.body).toBe("Continuous 59");
  expect(persist).not.toHaveBeenCalled();
});
it("flushes on last-view close and keeps the independent collection autosave", async () => {
  vi.useFakeTimers();
  const { session, storage, persist } = fixture();
  const detach = session.subscribe(vi.fn());
  session.edit("Closing immediately");
  detach();
  expect(readSourceDraft(storage, source)?.body).toBe("Closing immediately");
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenCalledOnce();
  expect(readSourceDraft(storage, source)).toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  expect(readSourceDraft(storage, source)).toBeNull();
});
it("does not erase another window's recovery copy when choosing the remote version", async () => {
  vi.useFakeTimers();
  const { session, storage } = fixture();
  session.edit("Our checkpoint");
  await vi.advanceTimersByTimeAsync(500);
  session.edit("Our newer pending text");
  writeSourceDraft(storage, source, "Other window's draft");
  session.receive({ ...source, body: "Remote", recordRevision: recordRevision("2") });
  session.resolve("remote");
  await vi.advanceTimersByTimeAsync(4000);
  expect(readSourceDraft(storage, source)?.body).toBe("Other window's draft");
});
it("cancels pending local text when choosing the remote conflict version", async () => {
  vi.useFakeTimers();
  const { session, storage } = fixture();
  session.edit("Checkpointed local text");
  await vi.advanceTimersByTimeAsync(500);
  expect(readSourceDraft(storage, source)?.body).toBe("Checkpointed local text");
  session.edit("More recent pending text");
  session.receive({ ...source, body: "Remote", recordRevision: recordRevision("2") });
  session.resolve("remote");
  await vi.advanceTimersByTimeAsync(4000);
  expect(readSourceDraft(storage, source)).toBeNull();
  expect(session.getText()).toBe("Remote");
});

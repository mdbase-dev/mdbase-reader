import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AnnotationDeletionLease } from "./annotation-deletion-lease.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";
import { hasUnsavedAnnotationEdits, trackAnnotationEdits } from "./unsaved-annotation-edits.js";

const legacy = vi.hoisted(() => ({
  value: null as { body: string; baseBody: string } | null,
  clear: vi.fn(),
}));
vi.mock("./annotation-edit-recovery.js", () => ({
  readLegacyEdits: (_key: string, ready: (value: typeof legacy.value) => void) =>
    ready(legacy.value),
  clearLegacyEdits: legacy.clear,
}));
const annotation: Annotation = {
  id: annotationId("a"),
  collectionId: collectionId("c"),
  sourceId: sourceId("s"),
  source: "[[s]]",
  path: "annotations/a.md",
  recordRevision: recordRevision("1"),
  annotationType: "note",
  tags: [],
  body: "Original",
  createdAt: dateTime("2026-08-01T00:00:00Z"),
};
function saved(body: string, revision = "2"): Annotation {
  return { ...annotation, body, recordRevision: recordRevision(revision) };
}
const sessions: AnnotationEditSession[] = [];
function fixture(
  persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body))),
): { session: AnnotationEditSession; persist: typeof persist } {
  const session = new AnnotationEditSession(annotation, persist);
  sessions.push(session);
  session.start();
  return { session, persist };
}
beforeEach(() => {
  vi.useFakeTimers();
  legacy.value = null;
  legacy.clear.mockClear();
});
afterEach(() => {
  for (const session of sessions.splice(0)) {
    trackAnnotationEdits(session, annotation, false);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("debounces one collection write while keeping keystrokes out of shared notifications", async () => {
  const { session, persist } = fixture();
  const notify = vi.fn();
  session.subscribe(notify);
  for (let i = 0; i < 40; i += 1) {
    session.edit(`Changed ${String(i)}`);
    await vi.advanceTimersByTimeAsync(20);
  }
  expect(notify).toHaveBeenCalledOnce();
  expect(persist).not.toHaveBeenCalled();
  expect(hasUnsavedAnnotationEdits("c", "s")).toBe(true);
  await vi.advanceTimersByTimeAsync(979);
  expect(persist).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Changed 39");
  expect(session.getSnapshot().status).toBe("saved");
  expect(hasUnsavedAnnotationEdits("c", "s")).toBe(false);
  expect(legacy.clear).not.toHaveBeenCalled();
});
it("preserves typing during a slow save, rejects stale views and serializes the next write", async () => {
  let finish!: (value: Annotation) => void;
  const { session, persist } = fixture();
  persist.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  session.edit("First");
  await vi.advanceTimersByTimeAsync(1000);
  session.edit("Second");
  await vi.advanceTimersByTimeAsync(2000);
  expect(persist).toHaveBeenCalledOnce();
  expect(session.getText()).toBe("Second");
  // The query resource can publish our first result before the write promise resolves.
  session.receive(saved("First"));
  expect(session.getSnapshot().conflict).toBeNull();
  finish(saved("First"));
  await vi.advanceTimersByTimeAsync(1);
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist).toHaveBeenLastCalledWith(saved("First"), "Second");
  expect(session.getText()).toBe("Second");
  expect(session.getSnapshot().status).toBe("saved");
  session.receive(annotation);
  expect(session.getText()).toBe("Second");
});
it("uses the verified latest base when an older response follows a matching remote edit", async () => {
  let finish!: (value: Annotation) => void;
  const remote = saved("Second", "3");
  const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
  persist.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  persist.mockRejectedValueOnce(new Error("Revision conflict"));
  const session = new AnnotationEditSession(annotation, persist, () => Promise.resolve(remote));
  sessions.push(session);
  session.start();
  session.edit("First");
  await vi.advanceTimersByTimeAsync(1000);
  session.edit("Second");
  session.receive(remote);
  finish(saved("First"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(session.getText()).toBe("Second");
  expect(session.getAnnotation()).toEqual(remote);
  expect(session.getSnapshot().status).toBe("saved");
});
it("keeps failed edits in memory, without background retry loops", async () => {
  const { session, persist } = fixture();
  persist.mockRejectedValueOnce(new Error("Offline"));
  session.edit("Offline text");
  await vi.advanceTimersByTimeAsync(1000);
  expect(session.getSnapshot().status).toBe("error");
  expect(session.getText()).toBe("Offline text");
  await vi.advanceTimersByTimeAsync(10000);
  expect(persist).toHaveBeenCalledOnce();
  await session.save();
  expect(session.getSnapshot().status).toBe("saved");
});
it("transfers the editor without storage and keeps its writer alive after close", async () => {
  const { session, persist } = fixture();
  const first = {},
    second = {};
  session.claimEditor(first);
  session.edit("Pending");
  expect(session.claimEditor(second)).toBe(false);
  expect(session.claimEditor(second, true)).toBe(true);
  session.releaseEditor(first);
  expect(session.ownsEditor(second)).toBe(true);
  session.releaseEditor(second);
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Pending");
});
it("clears an unsent change only on explicit discard", async () => {
  const { session, persist } = fixture();
  session.edit("Discard me");
  session.discard();
  await vi.advanceTimersByTimeAsync(10000);
  expect(persist).not.toHaveBeenCalled();
  expect(session.getText()).toBe("Original");
  expect(hasUnsavedAnnotationEdits("c", "s")).toBe(false);
});
it("does not discard newer typing when the previous save finishes after an undo", async () => {
  let finish!: (value: Annotation) => void;
  const { session, persist } = fixture();
  persist.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  session.edit("First");
  await vi.advanceTimersByTimeAsync(1000);
  session.edit("Original");
  expect(hasUnsavedAnnotationEdits("c", "s")).toBe(true);
  finish(saved("First"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenLastCalledWith(saved("First"), "Original");
  expect(session.getText()).toBe("Original");
});
it("retains conflicts until a revision-checked choice is explicitly saved", async () => {
  const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body, "3")));
  persist.mockRejectedValueOnce(new Error("Revision conflict"));
  const remote = saved("Remote"),
    session = new AnnotationEditSession(annotation, persist, () => Promise.resolve(remote));
  sessions.push(session);
  session.start();
  session.edit("Local");
  await vi.advanceTimersByTimeAsync(1000);
  expect(session.getSnapshot().conflict).toEqual(remote);
  expect(session.getText()).toBe("Local");
  session.resolve("local");
  await session.save();
  expect(persist).toHaveBeenLastCalledWith(remote, "Local");
});
it("offers legacy device drafts without writing new ones or submitting on load", async () => {
  legacy.value = { body: "Legacy text", baseBody: "Original" };
  const { session, persist } = fixture();
  await vi.advanceTimersByTimeAsync(10000);
  expect(session.getText()).toBe("Legacy text");
  expect(persist).not.toHaveBeenCalled();
  session.edit("Reviewed legacy text");
  await vi.advanceTimersByTimeAsync(1000);
  expect(legacy.clear).toHaveBeenCalledExactlyOnceWith(session.key);
});
it("holds deletion locks by owner and resumes autosave after cancelling a check", async () => {
  const { session, persist } = fixture();
  const first = {},
    second = {};
  session.edit("Pending");
  expect(await session.lock(first)).toBe(true);
  expect(await session.lock(second)).toBe(false);
  session.unlock(second);
  expect(session.claimEditor({}, true)).toBe(false);
  session.edit("Blocked");
  await vi.advanceTimersByTimeAsync(2000);
  expect(persist).not.toHaveBeenCalled();
  session.unlock(first);
  await vi.advanceTimersByTimeAsync(1);
  expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Pending");
});
it("releases abandoned checks but holds a committed deletion through unmount", async () => {
  const { session } = fixture(),
    lease = new AnnotationDeletionLease(session);
  const detach = lease.attach();
  await lease.acquire();
  detach();
  expect(session.getSnapshot().locked).toBe(false);
  const committed = new AnnotationDeletionLease(session),
    unmount = committed.attach();
  await committed.acquire();
  committed.commit();
  unmount();
  expect(session.getSnapshot().locked).toBe(true);
  session.deleted();
  expect(hasUnsavedAnnotationEdits("c", "s")).toBe(false);
});

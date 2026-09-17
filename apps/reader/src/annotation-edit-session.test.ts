import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationDeletionLease } from "./annotation-deletion-lease.js";
import { annotationEditSession } from "./annotation-edit-session-cache.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";

const drafts = vi.hoisted(() => new Map<string, { body: string; baseBody?: string } | null>());
vi.mock("./annotation-drafts.js", () => ({
  annotationDraftKey: (...parts: string[]) => JSON.stringify(parts),
  annotationDraftSnapshot: (key: string) => ({
    value: drafts.get(key) ?? null,
    ready: true,
    saved: true,
    problem: null,
  }),
  subscribeAnnotationDrafts: () => () => undefined,
  loadAnnotationDraft: () => Promise.resolve(),
  flushAnnotationDraft: vi.fn(),
  saveAnnotationDraft: (key: string, value: { body: string; baseBody?: string } | null) =>
    drafts.set(key, value),
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
beforeEach(() => {
  vi.useFakeTimers();
  drafts.clear();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("annotation conflict and deletion ownership", () => {
  it("refreshes a rejected revision and resolves against the latest base", async () => {
    const remote = saved("Remote");
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body, "3")));
    persist.mockRejectedValueOnce(new Error("Concurrent edit"));
    const session = new AnnotationEditSession(annotation, persist, () => Promise.resolve(remote));
    session.start();
    session.edit("Local");
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getSnapshot()).toMatchObject({ body: "Local", conflict: remote });
    expect(drafts.get(session.key)?.body).toBe("Local");
    session.resolve("local");
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenLastCalledWith(remote, "Local");
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("only lets the owning deletion view release a lock", async () => {
    const session = new AnnotationEditSession(annotation, () => Promise.resolve(annotation));
    session.start();
    const first = {},
      second = {};
    expect(await session.lock(first)).toBe(true);
    expect(await session.lock(second)).toBe(false);
    session.unlock(second);
    expect(session.getSnapshot().locked).toBe(true);
    session.unlock(first);
    expect(session.getSnapshot().locked).toBe(false);
  });
  it("releases abandoned deletion checks, but waits for committed deletion requests", async () => {
    const session = new AnnotationEditSession(annotation, () => Promise.resolve(annotation));
    session.start();
    const lease = new AnnotationDeletionLease(session);
    const detach = lease.attach();
    await lease.acquire();
    detach();
    expect(session.getSnapshot().locked).toBe(false);
    const finish = lease.attach();
    await lease.acquire();
    lease.commit();
    finish();
    expect(session.getSnapshot().locked).toBe(true);
    lease.release();
    expect(session.getSnapshot().locked).toBe(false);
  });
});
describe("shared annotation autosave", () => {
  it("shares one session per record and scope and saves after one idle second", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    const scope = {},
      session = annotationEditSession(scope, annotation, persist);
    expect(annotationEditSession(scope, annotation, persist)).toBe(session);
    expect(annotationEditSession({}, annotation, persist)).not.toBe(session);
    session.start();
    session.edit("Changed");
    expect(drafts.get(session.key)?.body).toBe("Changed");
    await vi.advanceTimersByTimeAsync(999);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Changed");
    expect(session.getSnapshot().status).toBe("saved");
    expect(drafts.get(session.key)).toBeNull();
  });
  it("keeps writing after all editor views close", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    const detach = session.subscribe(vi.fn());
    session.edit("Close the view");
    detach();
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledOnce();
  });
  it("serializes writes and keeps text typed during a pending save", async () => {
    let finish!: (value: Annotation) => void;
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body, "3")));
    persist.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("First");
    await vi.advanceTimersByTimeAsync(1000);
    session.edit("Second");
    await vi.advanceTimersByTimeAsync(3000);
    expect(persist).toHaveBeenCalledOnce();
    finish(saved("First"));
    await Promise.resolve();
    await Promise.resolve();
    expect(session.getText()).toBe("Second");
    expect(drafts.get(session.key)?.body).toBe("Second");
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenLastCalledWith(saved("First"), "Second");
    expect(session.getSnapshot().status).toBe("saved");
    session.receive(annotation);
    expect(session.getText()).toBe("Second");
  });
  it("retains failed writes for explicit retry", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    persist.mockRejectedValueOnce(new Error("Offline"));
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("Offline edit");
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getSnapshot()).toMatchObject({ status: "error", body: "Offline edit" });
    expect(drafts.get(session.key)?.body).toBe("Offline edit");
    await session.save();
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("resumes safe recovery but requires a choice for a changed base", async () => {
    const key = JSON.stringify([annotation.collectionId, annotation.sourceId, annotation.id]);
    drafts.set(key, { body: "Recovered", baseBody: "Older version" });
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).not.toHaveBeenCalled();
    expect(session.getSnapshot().conflict).toEqual(annotation);
    session.resolve("local");
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Recovered");
    drafts.set(key, { body: "Safe recovery", baseBody: "Original" });
    const recovery = new AnnotationEditSession(annotation, persist);
    recovery.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(recovery.getSnapshot().status).toBe("saved");
  });
  it("pauses every editor during deletion planning and resumes on cancellation", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("Pending");
    expect(await session.lock()).toBe(true);
    session.edit("Should not apply");
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).not.toHaveBeenCalled();
    expect(session.getText()).toBe("Pending");
    session.unlock();
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Pending");
  });
});

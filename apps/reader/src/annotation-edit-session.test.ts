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
import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";

const { drafts, stored } = vi.hoisted(() => ({
  drafts: new Map<string, { body: string; baseBody?: string } | null>(),
  stored: new Set<string>(),
}));
vi.mock("./annotation-drafts.js", () => ({
  annotationDraftKey: (...parts: string[]) => JSON.stringify(parts),
  annotationDraftSnapshot: (key: string) => ({
    value: drafts.get(key) ?? null,
    ready: true,
    saved: !drafts.has(key) || stored.has(key),
    problem: null,
  }),
  subscribeAnnotationDrafts: () => () => undefined,
  loadAnnotationDraft: () => Promise.resolve(),
  whenAnnotationDraftReady: (_key: string, ready: () => void) => ready(),
  flushAnnotationDraft: (key: string) => {
    stored.add(key);
  },
  stageAnnotationDraft: (key: string, value: { body: string; baseBody?: string }) => {
    drafts.set(key, value);
    stored.delete(key);
  },
  saveAnnotationDraft: (key: string, value: { body: string; baseBody?: string } | null) => {
    drafts.set(key, value);
    stored.delete(key);
  },
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
  stored.clear();
});
afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("explicit annotation editing", () => {
  it("never broadcasts keystrokes or autosaves; Done writes once", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    const scope = {},
      session = annotationEditSession(scope, annotation, persist);
    expect(annotationEditSession(scope, annotation, persist)).toBe(session);
    expect(annotationEditSession({}, annotation, persist)).not.toBe(session);
    session.start();
    const notify = vi.fn();
    session.subscribe(notify);
    for (let i = 0; i < 40; i += 1) {
      session.edit(`Changed ${String(i)}`);
    }
    expect(session.getText()).toBe("Changed 39");
    expect(notify).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(persist).not.toHaveBeenCalled();
    expect(drafts.get(session.key)?.body).toBe("Changed 39");
    await session.save();
    expect(persist).toHaveBeenCalledExactlyOnceWith(annotation, "Changed 39");
    expect(session.getSnapshot().status).toBe("saved");
    expect(drafts.get(session.key)).toBeNull();
  });
  it("allows one editor and retains its draft on close without collection writes", async () => {
    const persist = vi.fn(),
      session = new AnnotationEditSession(annotation, persist);
    session.start();
    const first = {},
      second = {};
    expect(session.claimEditor(first)).toBe(true);
    expect(session.claimEditor(second)).toBe(false);
    session.edit("Unfinished");
    session.releaseEditor(second);
    expect(session.ownsEditor(first)).toBe(true);
    session.releaseEditor(first);
    expect(drafts.get(session.key)?.body).toBe("Unfinished");
    expect(session.claimEditor(second)).toBe(true);
    expect(session.claimEditor(first, true)).toBe(true);
    session.releaseEditor(second);
    expect(session.ownsEditor(first)).toBe(true);
    expect(session.ownsEditor(second)).toBe(false);
    expect(session.getText()).toBe("Unfinished");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(persist).not.toHaveBeenCalled();
  });
  it("serializes explicit saves and freezes input until commit completes", async () => {
    let finish!: (value: Annotation) => void;
    const persist = vi.fn(
      () =>
        new Promise<Annotation>((resolve) => {
          finish = resolve;
        }),
    );
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("First");
    const writing = session.save();
    session.edit("Should not replace the in-flight text");
    const other = session.save();
    expect(other).toBe(writing);
    expect(session.getText()).toBe("First");
    expect(session.claimEditor({}, true)).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
    finish(saved("First"));
    await writing;
    expect(session.getSnapshot().status).toBe("saved");
    session.receive(annotation);
    expect(session.getText()).toBe("First");
  });
  it("keeps failures recoverable and retries only on explicit save", async () => {
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body)));
    persist.mockRejectedValueOnce(new Error("Offline"));
    const session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("Offline edit");
    await session.save();
    expect(session.getSnapshot().status).toBe("error");
    expect(session.getText()).toBe("Offline edit");
    expect(drafts.get(session.key)?.body).toBe("Offline edit");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(persist).toHaveBeenCalledOnce();
    await session.save();
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("restores unfinished comments without silently submitting them", async () => {
    drafts.set('["c","s","a"]', { body: "Recovered", baseBody: "Original" });
    const persist = vi.fn(),
      session = new AnnotationEditSession(annotation, persist);
    session.start();
    expect(session.getText()).toBe("Recovered");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(persist).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe("unsaved");
  });
  it("discard cancels a pending checkpoint without resurrecting the draft", async () => {
    const persist = vi.fn(),
      session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("Discard me");
    session.discard();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(session.getText()).toBe("Original");
    expect(drafts.get(session.key)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("annotation conflict and deletion protection", () => {
  it("refreshes a rejected revision and saves the explicit conflict choice", async () => {
    const remote = saved("Remote");
    const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body, "3")));
    persist.mockRejectedValueOnce(new Error("Concurrent edit"));
    const session = new AnnotationEditSession(annotation, persist, () => Promise.resolve(remote));
    session.start();
    session.edit("Local");
    await session.save();
    expect(session.getSnapshot().conflict).toEqual(remote);
    expect(session.getText()).toBe("Local");
    session.resolve("local");
    expect(persist).toHaveBeenCalledOnce();
    await session.save();
    expect(persist).toHaveBeenLastCalledWith(remote, "Local");
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("keeps recovered conflicts for review and accepts remote without a write", async () => {
    drafts.set('["c","s","a"]', { body: "Local", baseBody: "Older" });
    const persist = vi.fn(),
      session = new AnnotationEditSession(annotation, persist);
    session.start();
    expect(session.getSnapshot().conflict).toEqual(annotation);
    await session.save();
    expect(persist).not.toHaveBeenCalled();
    session.resolve("remote");
    expect(session.getText()).toBe("Original");
    expect(drafts.get(session.key)).toBeNull();
  });
  it("only lets the checking owner release a deletion lock", async () => {
    const session = new AnnotationEditSession(annotation, vi.fn());
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
  it("releases abandoned checks but holds a committed deletion through unmount", async () => {
    const session = new AnnotationEditSession(annotation, vi.fn());
    session.start();
    const lease = new AnnotationDeletionLease(session);
    const unmount = lease.attach();
    await lease.acquire();
    unmount();
    expect(session.getSnapshot().locked).toBe(false);
    const committed = new AnnotationDeletionLease(session),
      detach = committed.attach();
    await committed.acquire();
    committed.commit();
    detach();
    expect(session.getSnapshot().locked).toBe(true);
    committed.release();
    expect(session.getSnapshot().locked).toBe(false);
  });
  it("does not implicitly save a draft during deletion planning or cancellation", async () => {
    const persist = vi.fn(),
      session = new AnnotationEditSession(annotation, persist);
    session.start();
    session.edit("Pending");
    expect(await session.lock()).toBe(true);
    session.edit("Should not apply");
    session.unlock();
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.getText()).toBe("Pending");
    expect(persist).not.toHaveBeenCalled();
    session.deleted();
    expect(drafts.get(session.key)).toBeNull();
  });
});

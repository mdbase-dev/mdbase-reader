import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  annotationDraftKey,
  annotationDraftSnapshot,
  flushAnnotationDraft,
  hasBlockingAnnotationDrafts,
  loadAnnotationDraft,
  saveAnnotationDraft,
} from "./annotation-drafts.js";
import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";

beforeEach(() => {
  // IndexedDB's own event loop remains real; only checkpoint timers are controlled.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("batches a burst into one IndexedDB write without delaying shared text", async () => {
  const key = annotationDraftKey("checkpoints", "burst", "note");
  await loadAnnotationDraft(key);
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  for (let i = 0; i < 20; i += 1) {
    saveAnnotationDraft(key, { body: `Edit ${String(i)}`, baseBody: "Original" });
    expect(annotationDraftSnapshot(key).value?.body).toBe(`Edit ${String(i)}`);
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(put).not.toHaveBeenCalled();
  expect(annotationDraftSnapshot(key).saved).toBe(false);
  expect(hasBlockingAnnotationDrafts("checkpoints", "burst")).toBe(true);
  await vi.advanceTimersByTimeAsync(450);
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  expect(put).toHaveBeenCalledExactlyOnceWith({ body: "Edit 19", baseBody: "Original" }, key);
  expect(hasBlockingAnnotationDrafts("checkpoints", "burst")).toBe(false);
});

it("bounds the recovery gap during uninterrupted typing", async () => {
  const key = annotationDraftKey("checkpoints", "continuous", "note");
  await loadAnnotationDraft(key);
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  for (let i = 0; i < 60; i += 1) {
    saveAnnotationDraft(key, { body: `Edit ${String(i)}` });
    await vi.advanceTimersByTimeAsync(100);
  }
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  expect(put).toHaveBeenCalledTimes(2);
  expect(put).toHaveBeenLastCalledWith({ body: "Edit 59" }, key);
});

it("cancels queued text when collection success or deletion removes a draft", async () => {
  const key = annotationDraftKey("checkpoints", "removed", "note");
  await loadAnnotationDraft(key);
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  const remove = vi.spyOn(IDBObjectStore.prototype, "delete");
  saveAnnotationDraft(key, { body: "Do not resurrect" });
  saveAnnotationDraft(key, null);
  await vi.advanceTimersByTimeAsync(4000);
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  expect(put).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledExactlyOnceWith(key);
  expect(annotationDraftSnapshot(key).value).toBeNull();
});

it("does not let an older transaction mark newer pending text as durable", async () => {
  const key = annotationDraftKey("checkpoints", "inflight", "note");
  await loadAnnotationDraft(key);
  const transactions = vi.spyOn(IDBDatabase.prototype, "transaction");
  saveAnnotationDraft(key, { body: "First" });
  flushAnnotationDraft(key);
  await Promise.resolve();
  const transaction = transactions.mock.results[0]?.value as IDBTransaction;
  expect(transaction).toBeDefined();
  const complete = new Promise<void>((resolve) =>
    transaction.addEventListener("complete", () => resolve()),
  );
  saveAnnotationDraft(key, { body: "Second" });
  await complete;
  await Promise.resolve();
  expect(annotationDraftSnapshot(key)).toMatchObject({ value: { body: "Second" }, saved: false });
  flushAnnotationDraft(key);
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  expect(annotationDraftSnapshot(key).value?.body).toBe("Second");
});

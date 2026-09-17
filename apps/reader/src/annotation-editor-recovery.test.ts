// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationDraftSnapshot, subscribeAnnotationDrafts } from "./annotation-drafts.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";

it("flushes the latest local buffer on unload and protects it until IndexedDB commits", async () => {
  const annotation: Annotation = {
    id: annotationId("unload"),
    collectionId: collectionId("editor"),
    sourceId: sourceId("source"),
    source: "[[source]]",
    path: "annotations/unload.md",
    recordRevision: recordRevision("1"),
    annotationType: "note",
    tags: [],
    body: "Saved comment",
    createdAt: dateTime("2026-09-17T00:00:00Z"),
  };
  const persist = vi.fn(),
    session = new AnnotationEditSession(annotation, persist);
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saved"));
  const notify = vi.fn(),
    detach = subscribeAnnotationDrafts(notify);
  for (let i = 0; i < 40; i += 1) {
    session.edit(`Latest ${String(i)}`);
  }
  expect(notify).toHaveBeenCalledOnce();
  expect(annotationDraftSnapshot(session.key).saved).toBe(false);
  const transactions = vi.spyOn(IDBDatabase.prototype, "transaction");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await Promise.resolve();
  const transaction = transactions.mock.results[0]?.value as IDBTransaction;
  const completed = new Promise<void>((resolve) =>
    transaction.addEventListener("complete", () => resolve()),
  );
  // The user cancels unloading and resumes typing before the checkpoint completes.
  session.edit("Newer text after cancelling unload");
  await completed;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(annotationDraftSnapshot(session.key).saved).toBe(false);
  window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
  await vi.waitFor(() => expect(annotationDraftSnapshot(session.key).saved).toBe(true));
  expect(annotationDraftSnapshot(session.key).value?.body).toBe(
    "Newer text after cancelling unload",
  );
  transactions.mockRestore();
  const reloaded = new AnnotationEditSession(annotation, persist);
  reloaded.start();
  expect(reloaded.getText()).toBe("Newer text after cancelling unload");
  expect(persist).not.toHaveBeenCalled();
  detach();
});

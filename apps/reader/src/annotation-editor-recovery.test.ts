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
import { afterEach, expect, it, vi } from "vitest";

import { AnnotationCreationBuffer } from "./annotation-creation-buffer.js";
import {
  annotationDraftSnapshot,
  flushAnnotationDraft,
  saveAnnotationDraft,
} from "./annotation-drafts.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";
import { editorFixture } from "./editor.fixtures.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

const annotation: Annotation = {
  id: annotationId("memory"),
  collectionId: collectionId("editor"),
  sourceId: sourceId("source"),
  source: "[[source]]",
  path: "annotations/memory.md",
  recordRevision: recordRevision("1"),
  annotationType: "note",
  tags: [],
  body: "Saved comment",
  createdAt: dateTime("2026-09-17T00:00:00Z"),
};
const sessions: AnnotationEditSession[] = [];
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0)) {
    await close();
  }
  for (const session of sessions.splice(0)) {
    trackAnnotationEdits(session, annotation, false);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("does not write device storage while typing/saving and warns until the collection commits", async () => {
  const native = await editorFixture();
  closes.push(native.close);
  const persist = vi.spyOn(native.app.client(), "update");
  const session = new AnnotationEditSession(native.app.mdbase, native.annotation);
  sessions.push(session);
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saved"));
  const put = vi.spyOn(IDBObjectStore.prototype, "put"),
    remove = vi.spyOn(IDBObjectStore.prototype, "delete");
  const local = vi.spyOn(Storage.prototype, "setItem");
  for (let i = 0; i < 40; i += 1) {
    session.edit(`Latest ${String(i)}`);
  }
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await session.save();
  expect(persist).toHaveBeenCalledOnce();
  expect(session.getAnnotation().body).toBe("Latest 39");
  const saved = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(local).not.toHaveBeenCalled();
});
it("warns before losing an unfinished new annotation, without checkpointing its comment", async () => {
  const buffer = new AnnotationCreationBuffer("new-creation-unload", annotation);
  buffer.start();
  await vi.waitFor(() => expect(buffer.getSnapshot().ready).toBe(true));
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  try {
    buffer.replace({ body: "" });
    buffer.edit("New source comment");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(put).not.toHaveBeenCalled();
  } finally {
    buffer.replace(null);
  }
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});
it("preserves a previous-version draft for recovery and removes it only after commit", async () => {
  const native = await editorFixture();
  closes.push(native.close);
  const record = native.annotation;
  const key = JSON.stringify([record.collectionId, record.sourceId, record.id]);
  saveAnnotationDraft(key, { body: "Old unfinished text", baseBody: record.body });
  flushAnnotationDraft(key);
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  const persist = vi.spyOn(native.app.client(), "update");
  const session = new AnnotationEditSession(native.app.mdbase, record);
  sessions.push(session);
  session.start();
  await vi.waitFor(() => expect(session.getText()).toBe("Old unfinished text"));
  expect(persist).not.toHaveBeenCalled();
  await session.save();
  expect(annotationDraftSnapshot(key).value).toBeNull();
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
});

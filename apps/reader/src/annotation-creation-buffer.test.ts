import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";

import { AnnotationCreationBuffer } from "./annotation-creation-buffer.js";
import {
  annotationDraftSnapshot,
  loadAnnotationDraft,
  subscribeAnnotationDrafts,
} from "./annotation-drafts.js";
import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";

afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("keeps creation typing local and flushes the latest characters for explicit save", async () => {
  const key = "creation-buffer-burst";
  await loadAnnotationDraft(key);
  const buffer = new AnnotationCreationBuffer(key);
  buffer.replace({ body: "" });
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  vi.useFakeTimers();
  const notify = vi.fn(),
    detach = subscribeAnnotationDrafts(notify);
  for (let i = 0; i < 40; i += 1) {
    buffer.edit(`Latest ${String(i)}`);
  }
  expect(notify).toHaveBeenCalledOnce();
  expect(buffer.get()?.body).toBe("Latest 39");
  expect(annotationDraftSnapshot(key).saved).toBe(false);
  buffer.flush();
  expect(annotationDraftSnapshot(key).value?.body).toBe("Latest 39");
  detach();
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
});

it("never revives pending text after a selection is discarded/replaced", async () => {
  const key = "creation-buffer-replace";
  await loadAnnotationDraft(key);
  const buffer = new AnnotationCreationBuffer(key);
  buffer.replace({ body: "Old" });
  buffer.edit("Do not resurrect");
  buffer.replace(null);
  flushLocalDraftCheckpoints();
  await vi.waitFor(() => expect(annotationDraftSnapshot(key).saved).toBe(true));
  expect(buffer.get()).toBeNull();
  buffer.replace({ body: "New selection" });
  expect(buffer.get()?.body).toBe("New selection");
});

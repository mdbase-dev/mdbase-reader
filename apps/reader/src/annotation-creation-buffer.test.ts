import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";

import {
  AnnotationCreationBuffer,
  annotationCreationBuffer,
} from "./annotation-creation-buffer.js";

it("keeps selection/comment text in memory without notifications or device writes while typing", async () => {
  const key = "memory-creation";
  const buffer = annotationCreationBuffer(key);
  buffer.start();
  await vi.waitFor(() => expect(buffer.getSnapshot().ready).toBe(true));
  const put = vi.spyOn(IDBObjectStore.prototype, "put"),
    remove = vi.spyOn(IDBObjectStore.prototype, "delete");
  buffer.replace({ body: "" });
  const notify = vi.fn(),
    detach = buffer.subscribe(notify);
  for (let i = 0; i < 40; i += 1) {
    buffer.edit(`Latest ${String(i)}`);
  }
  expect(notify).not.toHaveBeenCalled();
  expect(buffer.get()?.body).toBe("Latest 39");
  expect(annotationCreationBuffer(key)).toBe(buffer);
  const reloaded = new AnnotationCreationBuffer(key);
  reloaded.start();
  expect(reloaded.get()).toBeNull();
  const latest = buffer.get();
  if (!latest) {
    throw new Error("Missing memory buffer");
  }
  buffer.clearIf(latest);
  expect(buffer.get()).toBeNull();
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  detach();
  vi.restoreAllMocks();
});
it("does not clear a newer selection when an older creation finishes", () => {
  const buffer = new AnnotationCreationBuffer("memory-replace");
  const older = { body: "Old selection" };
  buffer.replace(older);
  buffer.replace({ body: "New selection" });
  buffer.clearIf(older);
  expect(buffer.get()?.body).toBe("New selection");
  buffer.replace(null);
  expect(buffer.get()).toBeNull();
});

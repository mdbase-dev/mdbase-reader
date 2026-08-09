import { annotationId, collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { MemoryStorage } from "./platform.js";
import { StorageMutationJournal } from "./reader-services.js";

describe("MemoryStorage", () => {
  it("implements the same asynchronous contract as native secure stores", async () => {
    const storage = new MemoryStorage();
    await storage.set("reader:position", "epubcfi(/6/2)");
    await expect(storage.get("reader:position")).resolves.toBe("epubcfi(/6/2)");
    await storage.remove("reader:position");
    await expect(storage.get("reader:position")).resolves.toBeNull();
  });
});

describe("StorageMutationJournal", () => {
  it("retains incomplete work for recovery and removes completed work", async () => {
    const storage = new MemoryStorage();
    const journal = new StorageMutationJournal(storage);
    const id = mutationId("mutation-1");
    await journal.start({
      id,
      operation: "create-annotation",
      collectionId: collectionId("reading"),
      sourceId: sourceId("source-1"),
      annotationId: annotationId("annotation-1"),
    });
    await journal.mark(id, "annotation-created");
    await expect(storage.get("mdbase-reader:mutation:mutation-1")).resolves.toContain(
      '"stage":"annotation-created"',
    );
    await journal.mark(id, "complete");
    await expect(storage.get("mdbase-reader:mutation:mutation-1")).resolves.toBeNull();
  });
});

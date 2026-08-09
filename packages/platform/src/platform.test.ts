import { annotationId, collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { MemoryStorage } from "./platform.js";
import { createReaderRuntimeServices, StorageMutationJournal } from "./reader-services.js";

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

describe("createReaderRuntimeServices", () => {
  it("creates UUID mutation identities accepted by resumable file transfers", () => {
    const services = createReaderRuntimeServices(new MemoryStorage());

    expect(services.ids.mutation()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});

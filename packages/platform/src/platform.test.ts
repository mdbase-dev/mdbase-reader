import { annotationId, collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { MemoryStorage } from "./platform.js";
import {
  createReaderRuntimeServices,
  StorageCreateJournal,
  StorageMutationJournal,
} from "./reader-services.js";

import type { PendingCreate } from "@mdbase-reader/core";

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

describe("StorageCreateJournal", () => {
  const create = (key: string, collection: string, startedAt: string): PendingCreate => ({
    key,
    collectionId: collection,
    kind: "source",
    recordId: `src_${key}`,
    label: "Adam",
    candidates: ["sources/adam.md", "sources/adam-1.md"],
    attempt: 0,
    submission: 0,
    input: { type: "reader-source", frontmatter: { id: `src_${key}` }, body: "# Adam\n" },
    state: "pending",
    mutationId: "0199a1b2-0000-7000-8000-000000000001",
    startedAt,
  });

  it("keeps each create under its own key and lists a collection's oldest first", async () => {
    const storage = new MemoryStorage();
    const journal = new StorageCreateJournal(storage);
    await journal.put(create("b", "reading", "2026-10-25T12:00:02.000Z"));
    await journal.put(create("a", "reading", "2026-10-25T12:00:01.000Z"));
    await journal.put(create("c", "other", "2026-10-25T12:00:00.000Z"));
    await storage.set("mdbase-reader:create:reading:broken", "{not json");

    expect((await journal.list("reading")).map(({ key }) => key)).toEqual(["a", "b"]);
    await expect(journal.get("reading", "a")).resolves.toMatchObject({ state: "pending" });
    await journal.remove("reading", "a");
    await expect(journal.get("reading", "a")).resolves.toBeNull();
    expect(await storage.keys("mdbase-reader:create:")).toHaveLength(3);
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

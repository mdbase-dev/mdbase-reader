import { runMigration, type Fields, type MigrationPlan } from "@mdbase-reader/migration";
import { afterEach, expect, it, vi } from "vitest";

import { annotationContract, sourceContract } from "../contracts.js";

import { nativeReaderCollection, type NativeReaderCollection } from "./native-collection.js";
import { mdbaseError, memoryConnection } from "./testing.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";
import type { MockInstance } from "vitest";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) {
    close();
  }
  vi.unstubAllGlobals();
});

function plan(): MigrationPlan {
  const provenance = (key: string): Fields => ({ namespace: "readwise:fixture", key });
  return {
    service: "readwise",
    namespace: "readwise:fixture",
    sources: [
      {
        key: "source",
        id: "src_import",
        path: "sources/import.md",
        body: "Source",
        fields: {
          title: "Imported",
          kind: "article",
          saved_at: "2026-01-01T00:00:00Z",
          import: provenance("source"),
        },
        documents: [],
      },
    ],
    annotations: [
      {
        key: "note",
        id: "ann_import",
        path: "annotations/import.md",
        body: "Note",
        sourceKey: "source",
        fields: { annotation_type: "note", import: provenance("note") },
      },
    ],
    files: [],
    warnings: [],
    summary: { sources: 1, notes: 1, annotations: 0, files: 0, bytes: 0 },
  };
}

async function fixture(): Promise<
  Awaited<ReturnType<typeof memoryConnection>> & {
    open: () => NativeReaderCollection;
    collection: NativeReaderCollection;
    journal: Map<string, string>;
    create: MockInstance<MdbaseClient["create"]>;
    find: MockInstance<MdbaseClient["find"]>;
    receipt: MockInstance<MdbaseClient["receipt"]>;
  }
> {
  const journal = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => journal.get(key) ?? null,
    setItem: (key: string, value: string) => journal.set(key, value),
    removeItem: (key: string) => journal.delete(key),
  });
  const memory = await memoryConnection({
    confirmDelayMs: null,
    contracts: [
      {
        ...sourceContract,
        type: "reader-source",
        fields: {
          id: "id",
          title: "title",
          kind: "kind",
          saved_at: "saved_at",
          documents: "documents",
        },
      },
      {
        ...annotationContract,
        type: "reader-annotation",
        fields: { id: "id", source: "source", annotation_type: "annotation_type" },
      },
    ],
  });
  cleanup.push(memory.close);
  const open = (): NativeReaderCollection => {
    const collection = nativeReaderCollection(memory.connection, { receiptWaitMs: 1 });
    cleanup.push(() => collection.dispose());
    return collection;
  };
  const create = vi.spyOn(memory.connection.records, "create");
  const find = vi.spyOn(memory.connection.records, "find");
  const receipt = vi.spyOn(memory.connection.records, "receipt");
  return { ...memory, open, create, find, receipt, journal, collection: open() };
}

async function pendingImport(journal: Map<string, string>, sdk: MdbaseClient): Promise<string> {
  return vi.waitFor(async () => {
    expect(journal.size).toBe(1);
    const id = [...journal.values()][0]!;
    expect((await sdk.receipt(id)).state).toBe("pending");
    return id;
  });
}

it("waits for each source confirmation before creating annotations or reporting completion", async () => {
  const { connection, collection, create, journal, replica } = await fixture();
  const completed = vi.fn();
  const progress = vi.fn();
  const running = runMigration(
    plan(),
    collection.migration,
    new AbortController().signal,
    progress,
  ).then(completed);
  await pendingImport(journal, connection.records);
  expect(create).toHaveBeenCalledTimes(1);
  expect(completed).not.toHaveBeenCalled();
  expect(progress.mock.calls.some(([value]) => value.phase === "Complete")).toBe(false);
  replica.confirmAll();
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  await pendingImport(journal, connection.records);
  expect(completed).not.toHaveBeenCalled();
  replica.confirmAll();
  await running;
  expect(completed).toHaveBeenCalledWith(expect.objectContaining({ created: 2, verified: 2 }));
  expect(journal.size).toBe(0);
});

it("stops on a late source rejection without creating an orphan annotation", async () => {
  const { connection, collection, create, journal, replica } = await fixture();
  const running = runMigration(plan(), collection.migration, new AbortController().signal, vi.fn());
  const rejected = expect(running).rejects.toThrow("Import refused");
  const mutationId = await pendingImport(journal, connection.records);
  replica.reject(mutationId, mdbaseError("conflict", "Import refused", "path_taken").toProblem());
  await rejected;
  expect(create).toHaveBeenCalledTimes(1);
  expect((await collection.migration.existing(new AbortController().signal)).size).toBe(0);
  expect(journal.size).toBe(0);
});

it("retains a cancelled pending create and resumes it through a fresh adapter without resubmission", async () => {
  const { connection, collection, open, create, receipt, journal, replica } = await fixture();
  const controller = new AbortController();
  const running = runMigration(plan(), collection.migration, controller.signal, vi.fn());
  const cancelled = expect(running).rejects.toThrow("Cancelled import");
  await pendingImport(journal, connection.records);
  const [key, mutationId] = [...journal][0]!;
  controller.abort(new Error("Cancelled import"));
  await cancelled;
  collection.dispose();
  const resumed = open();
  const receiptCalls = receipt.mock.calls.length;
  const completed = vi.fn();
  const next = runMigration(plan(), resumed.migration, new AbortController().signal, vi.fn()).then(
    completed,
  );
  await vi.waitFor(() => expect(receipt.mock.calls.length).toBeGreaterThan(receiptCalls));
  expect(create).toHaveBeenCalledTimes(1);
  expect(journal.get(key)).toBe(mutationId);
  expect(completed).not.toHaveBeenCalled();
  replica.confirmAll();
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  replica.confirmAll();
  await next;
  expect(completed).toHaveBeenCalledWith(
    expect.objectContaining({ created: 1, skipped: 1, verified: 2 }),
  );
  expect(journal.size).toBe(0);
});

it("does not accept an optimistic record from an older unjournaled import as confirmed", async () => {
  const { connection, collection, create, find, journal, replica } = await fixture();
  const source = plan().sources[0]!;
  await connection.records.create({
    path: source.path,
    type: "reader-source",
    frontmatter: { ...source.fields, id: source.id },
  });
  const completed = vi.fn();
  const next = runMigration(
    plan(),
    collection.migration,
    new AbortController().signal,
    vi.fn(),
  ).then(completed);
  await vi.waitFor(() => expect(find).toHaveBeenCalled());
  expect(completed).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledTimes(1);
  expect(journal.size).toBe(0);
  replica.confirmAll();
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  replica.confirmAll();
  await next;
  expect(completed).toHaveBeenCalledWith(expect.objectContaining({ skipped: 1, verified: 2 }));
});

it("preserves an uncertain journal rather than accepting an unconfirmed optimistic readback", async () => {
  const { connection, collection, create, journal } = await fixture();
  const source = plan().sources[0]!;
  const write = await connection.records.create({
    path: source.path,
    type: "reader-source",
    frontmatter: { ...source.fields, id: source.id },
  });
  journal.set(`reader:migration-pending:${connection.id}:${source.id}`, write.mutationId);
  vi.spyOn(connection.records, "receipt").mockRejectedValue(
    mdbaseError("not_found", "Receipt no longer available"),
  );
  await expect(
    runMigration(plan(), collection.migration, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("needs recovery");
  expect(create).toHaveBeenCalledTimes(1);
  expect(journal.size).toBe(1);
});

it("stops when an older unjournaled source is rejected while resuming", async () => {
  const { connection, collection, create, find, replica } = await fixture();
  const source = plan().sources[0]!;
  const write = await connection.records.create({
    path: source.path,
    type: "reader-source",
    frontmatter: { ...source.fields, id: source.id },
  });
  const running = runMigration(plan(), collection.migration, new AbortController().signal, vi.fn());
  const rejected = expect(running).rejects.toThrow("a record is missing");
  await vi.waitFor(() => expect(find).toHaveBeenCalled());
  replica.reject(
    write.mutationId,
    mdbaseError("conflict", "Import refused", "path_taken").toProblem(),
  );
  await rejected;
  expect(create).toHaveBeenCalledTimes(1);
});

it("journals the original mutation before submission, even if cancelled before the first receipt", async () => {
  const { connection, collection, open, create, journal, replica } = await fixture();
  create.mockRestore();
  const submit = connection.records.create.bind(connection.records);
  const controller = new AbortController();
  const submitting = vi
    .spyOn(connection.records, "create")
    .mockImplementationOnce(async (input, options) => {
      expect([...journal.values()]).toContain(options?.mutationId);
      const write = await submit(input, options);
      controller.abort(new Error("Stopped before receipt"));
      return write;
    });
  await expect(
    runMigration(plan(), collection.migration, controller.signal, vi.fn()),
  ).rejects.toThrow("Stopped before receipt");
  expect(journal.size).toBe(1);
  collection.dispose();
  replica.confirmAll();
  const resumed = open();
  const running = runMigration(plan(), resumed.migration, new AbortController().signal, vi.fn());
  await vi.waitFor(() => expect(submitting).toHaveBeenCalledTimes(2));
  await pendingImport(journal, connection.records);
  replica.confirmAll();
  expect(await running).toMatchObject({ created: 1, skipped: 1, verified: 2 });
  expect(journal.size).toBe(0);
});

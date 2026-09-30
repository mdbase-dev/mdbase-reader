import { collectionId, type Annotation } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument } from "@mdbase-dev/connect";

const collection = collectionId("reading");
function document(index: number): RecordDocument {
  const fields = {
    id: `ann_${String(index)}`,
    source: "src_1",
    annotation_type: "note",
    created_at: "2026-08-09T00:00:00Z",
  };
  return {
    path: `annotations/${String(index)}.md`,
    revision: "rev-1",
    types: ["reader-annotation"],
    frontmatter: fields,
    effectiveFrontmatter: fields,
    file: {},
    body: `Note ${String(index)}`,
  };
}
function ok<T>(value: T): ConnectOutcome<T> {
  return { ok: true, value, diagnostics: [] };
}
function page(documents: RecordDocument[]): ConnectOutcome<QueryPage> {
  return ok({ results: documents, complete: true, page: 1, offset: 0, loaded: documents.length });
}

function repository(documents: RecordDocument[]): {
  read: Mock<ReaderConnectClient["read"]>;
  queryPages: Mock<ReaderConnectClient["queryPages"]>;
  repo: ConnectAnnotationRepository;
} {
  const read = vi.fn<ReaderConnectClient["read"]>(({ path }) =>
    Promise.resolve(ok(documents.find((entry) => entry.path === path)!)),
  );
  const queryPages = vi.fn<ReaderConnectClient["queryPages"]>(async function* () {
    yield await Promise.resolve(page(documents));
  });
  return {
    read,
    queryPages,
    repo: new ConnectAnnotationRepository({ read, queryPages } as unknown as ReaderConnectClient),
  };
}

describe("progressive scoped annotation loading", () => {
  it("queries and reads only selected records, even if an adapter returns extra rows", async () => {
    const documents = [document(1), document(2), document(3)];
    const { repo, read, queryPages } = repository(documents);
    const result = await repo.listAll(collection, { paths: new Set([documents[1]!.path]) });
    expect(result.map((annotation) => annotation.id)).toEqual(["ann_2"]);
    expect(queryPages.mock.calls[0]?.[0].where).toBe('file.path == "annotations/2.md"');
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[0].path).toBe(documents[1]!.path);
  });

  it("does no work for an empty selection", async () => {
    const { repo, read, queryPages } = repository([document(1)]);
    await expect(repo.listAll(collection, { paths: new Set() })).resolves.toEqual([]);
    expect(queryPages).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("publishes cumulative batches before the next query page is requested", async () => {
    const documents = Array.from({ length: 18 }, (_, index) => document(index));
    const { repo, read, queryPages } = repository(documents);
    const snapshots: (readonly Annotation[])[] = [];
    queryPages.mockImplementation(async function* () {
      yield await Promise.resolve(page(documents.slice(0, 17)));
      expect(snapshots.map((snapshot) => snapshot.length)).toEqual([16, 17]);
      expect(read).toHaveBeenCalledTimes(17);
      yield await Promise.resolve(page(documents.slice(17)));
    });
    const result = await repo.listAll(collection, {
      onProgress: (snapshot) => snapshots.push(snapshot),
    });
    expect(snapshots.map((snapshot) => snapshot.length)).toEqual([16, 17, 18]);
    expect(result).toHaveLength(18);
    expect(snapshots[0]).toHaveLength(16);
  });

  it("uses larger subsequent batches to bound rendering work", async () => {
    const { repo } = repository(Array.from({ length: 150 }, (_, index) => document(index)));
    const lengths: number[] = [];
    await repo.listAll(collection, { onProgress: (snapshot) => lengths.push(snapshot.length) });
    expect(lengths).toEqual([16, 80, 144, 150]);
  });

  it("reuses records across different saved views and revalidates on retry", async () => {
    const documents = [document(1), document(2)];
    const { repo, read } = repository(documents);
    await repo.listAll(collection, { paths: new Set([documents[0]!.path]) });
    await repo.listAll(collection);
    expect(read).toHaveBeenCalledTimes(2);
    await repo.listAll(collection, { refresh: true });
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("stops between batches when cancelled", async () => {
    const documents = Array.from({ length: 30 }, (_, index) => document(index));
    const { repo, read } = repository(documents);
    const controller = new AbortController();
    await expect(
      repo.listAll(collection, {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledTimes(16);
  });

  it("bounds scoped query size", async () => {
    const documents = Array.from({ length: 205 }, (_, index) => document(index));
    const { repo, queryPages } = repository(documents);
    await repo.listAll(collection, { paths: new Set(documents.map((entry) => entry.path)) });
    expect(queryPages).toHaveBeenCalledTimes(3);
    expect(queryPages.mock.calls.map(([input]) => input.where?.split(" || ").length)).toEqual([
      100, 100, 5,
    ]);
  });
});

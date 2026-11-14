import { collectionId, type Annotation } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testRecord, testQuery } from "./records.fixtures.js";

import type { MdbaseClient, Query, QueryResult, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

const collection = collectionId("reading");
function document(index: number): RecordView {
  const fields = {
    id: `ann_${String(index)}`,
    source: "src_1",
    annotation_type: "note",
    created_at: "2026-08-09T00:00:00Z",
  };
  return testRecord({
    path: `annotations/${String(index)}.md`,
    revision: "rev-1",
    types: ["reader-annotation"],
    frontmatter: fields,
    effective: fields,

    body: `Note ${String(index)}`,
  });
}
function ok<T>(value: T): T {
  return value;
}
function page(documents: RecordView[]): QueryResult {
  return ok(testQuery({ records: documents, complete: true }));
}

function repository(documents: RecordView[]): {
  read: Mock<MdbaseClient["get"]>;
  pages: Mock<(input: Query) => AsyncGenerator<QueryResult>>;
  repo: ConnectAnnotationRepository;
} {
  const read = vi.fn<MdbaseClient["get"]>((ref) =>
    Promise.resolve(
      ok(documents.find((entry) => entry.path === (typeof ref === "string" ? ref : ref.path))!),
    ),
  );
  const pages = vi.fn<(input: Query) => AsyncGenerator<QueryResult>>(async function* () {
    yield await Promise.resolve(page(documents));
  });
  return {
    read,
    pages,
    repo: new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        get: read,
        pages,
      }),
    ),
  };
}

describe("progressive scoped annotation loading", () => {
  it("queries and reads only selected records, even if an adapter returns extra rows", async () => {
    const documents = [document(1), document(2), document(3)];
    const { repo, read, pages } = repository(documents);
    const result = await repo.listAll(collection, { paths: new Set([documents[1]!.path]) });
    expect(result.map((annotation) => annotation.id)).toEqual(["ann_2"]);
    expect(pages.mock.calls[0]?.[0].where).toBe('file.path == "annotations/2.md"');
    expect(read).toHaveBeenCalledOnce();
    expect((read.mock.calls[0]?.[0] as { path: string }).path).toBe(documents[1]!.path);
  });

  it("does no work for an empty selection", async () => {
    const { repo, read, pages } = repository([document(1)]);
    await expect(repo.listAll(collection, { paths: new Set() })).resolves.toEqual([]);
    expect(pages).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("publishes cumulative batches before the next query page is requested", async () => {
    const documents = Array.from({ length: 18 }, (_, index) => document(index));
    const { repo, read, pages } = repository(documents);
    const snapshots: (readonly Annotation[])[] = [];
    pages.mockImplementation(async function* () {
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

  it("reads current views across different saved views and on retry", async () => {
    const documents = [document(1), document(2)];
    const { repo, read } = repository(documents);
    await repo.listAll(collection, { paths: new Set([documents[0]!.path]) });
    await repo.listAll(collection);
    expect(read).toHaveBeenCalledTimes(3);
    await repo.listAll(collection, { refresh: true });
    expect(read).toHaveBeenCalledTimes(5);
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

  it("bounds cumulative snapshot copying as large overviews grow and publishes the final batch", async () => {
    const documents = Array.from({ length: 1_000 }, (_, index) => document(index));
    const { repo } = repository(documents);
    const snapshots: (readonly Annotation[])[] = [];
    const result = await repo.listAll(collection, {
      onProgress: (snapshot) => snapshots.push(snapshot),
    });
    expect(snapshots[0]).toHaveLength(16);
    expect(snapshots.at(-1)).toEqual(result);
    expect(snapshots.length).toBeLessThan(25);
    expect(snapshots.reduce((total, snapshot) => total + snapshot.length, 0)).toBeLessThan(6_000);
    expect(snapshots[0]).toHaveLength(16);
  });

  it("bounds scoped query size", async () => {
    const documents = Array.from({ length: 205 }, (_, index) => document(index));
    const { repo, pages } = repository(documents);
    await repo.listAll(collection, { paths: new Set(documents.map((entry) => entry.path)) });
    const discovery = pages.mock.calls;
    expect(discovery).toHaveLength(3);
    expect(discovery.map(([input]) => input.where?.split(" || ").length)).toEqual([100, 100, 5]);
  });
});

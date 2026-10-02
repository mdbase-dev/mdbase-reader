import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { connectClient, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  ConnectOutcome,
  MdbaseConnection,
  QueryInput,
  QueryMetadataInput,
  QueryMetadataPage,
  ReadManyRecord,
} from "@mdbase-dev/connect";

function ok<T>(value: T): ConnectOutcome<T> {
  return { ok: true, value, diagnostics: [] };
}
function fixture(count = 2): {
  client: ReaderConnectClient;
  records: ReadManyRecord[];
  readMany: Mock<ReaderConnectClient["readMany"]>;
  queryPages: Mock<
    (input: QueryInput | QueryMetadataInput) => AsyncGenerator<ConnectOutcome<QueryMetadataPage>>
  >;
  read: Mock<ReaderConnectClient["read"]>;
  repository: ConnectAnnotationRepository;
} {
  const records = Array.from({ length: count }, (_, index): ReadManyRecord => {
    const fields = {
      id: `ann_${String(index)}`,
      source: "src_1",
      annotation_type: "note",
      created_at: "2026-08-09T00:00:00Z",
    };
    return {
      path: `annotations/${String(index)}.md`,
      revision: `rev-${String(index)}`,
      types: ["reader-annotation"],
      file: {},
      frontmatter: fields,
      effectiveFrontmatter: fields,
      body: `Body ${String(index)}`,
    };
  });
  const supportsAuthorityFeature = vi.fn((id: string) =>
    Promise.resolve(ok(["query-metadata-v1", "read-many-documents-v1"].includes(id))),
  );
  const queryPages = vi.fn(async function* (
    input: QueryInput | QueryMetadataInput,
  ): AsyncGenerator<ConnectOutcome<QueryMetadataPage>> {
    expect(input.output).toBe("metadata");
    const results = input.where?.startsWith("id ==")
      ? [{ path: "sources/one.md", types: [], revision: "source-rev", values: { id: "src_1" } }]
      : input.where?.includes('record["source"]')
        ? []
        : records.map((record) => ({
            path: record.path,
            revision: record.revision!,
            types: record.types,
            values: {
              id: String(record.effectiveFrontmatter!["id"]),
              source: "src_1",
              reader_source_id: null,
            },
          }));
    yield await Promise.resolve(
      ok({
        output: "metadata" as const,
        results,
        page: 0,
        offset: 0,
        loaded: results.length,
        complete: true,
      }),
    );
  });
  const readMany = vi.fn<ReaderConnectClient["readMany"]>((paths) =>
    Promise.resolve(
      ok({
        results: paths.map((path) => {
          const record = records.find((record) => record.path === path);
          return record
            ? { status: "found" as const, path, record }
            : { status: "missing" as const, path };
        }),
        errors: [],
      }),
    ),
  );
  const read = vi.fn<ReaderConnectClient["read"]>(() => {
    throw new Error("Unexpected point read");
  });
  const client = {
    supportsAuthorityFeature,
    queryPages,
    readMany,
    read,
  } as unknown as ReaderConnectClient;
  return {
    client,
    records,
    readMany,
    queryPages,
    read,
    repository: new ConnectAnnotationRepository(client),
  };
}
const collection = collectionId("reading");

describe("wave B annotation hydration", () => {
  it("replaces 130 point hydrations with three revision-bearing progressive batches", async () => {
    const { repository, read, readMany } = fixture(130);
    const lengths: number[] = [];
    const annotations = await repository.listAll(collection, {
      onProgress: (records) => lengths.push(records.length),
    });
    expect(annotations).toHaveLength(130);
    expect(lengths).toEqual([16, 80, 130]);
    expect(readMany.mock.calls.map(([paths]) => paths.length)).toEqual([16, 64, 50]);
    expect(annotations[0]).toMatchObject({ body: "Body 0", recordRevision: "rev-0" });
    expect(read).not.toHaveBeenCalled();
  });

  it("hydrates a source list without N revision reads and installs changed content with its token", async () => {
    const { repository, records, read, readMany } = fixture();
    await repository.listForSource(collection, sourceId("src_1"));
    records[0] = { ...records[0]!, revision: "external-rev", body: "External edit" };
    const listed = await repository.listForSource(collection, sourceId("src_1"));
    expect(listed[0]).toMatchObject({ body: "External edit", recordRevision: "external-rev" });
    expect(readMany).toHaveBeenCalledTimes(2);
    expect(read).not.toHaveBeenCalled();
  });

  it("omits a deleted record between discovery and hydration without a point-read retry", async () => {
    const { repository, readMany, read } = fixture(1);
    readMany.mockResolvedValue(
      ok({ results: [{ status: "missing", path: "annotations/0.md" }], errors: [] }),
    );
    expect(await repository.listForSource(collection, sourceId("src_1"))).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("re-evaluates a source reference changed during hydration", async () => {
    const { repository, records, queryPages, read } = fixture(1);
    const original = queryPages.getMockImplementation()!;
    queryPages.mockImplementation(async function* (input) {
      if (input.where?.startsWith("file.path ==")) {
        yield ok({
          output: "metadata" as const,
          results: [
            {
              path: records[0]!.path,
              revision: "moved-rev",
              types: [],
              values: { source: "src_2", reader_source_id: "src_2" },
            },
          ],
          page: 0,
          offset: 0,
          loaded: 1,
          complete: true,
        });
      } else {
        yield* original(input);
        if (input.where?.includes("contains")) {
          records[0] = {
            ...records[0]!,
            revision: "moved-rev",
            effectiveFrontmatter: { ...records[0]!.effectiveFrontmatter, source: "src_2" },
          };
        }
      }
    });
    expect(await repository.listForSource(collection, sourceId("src_1"))).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps advertised batch failures visible rather than silently downgrading to N reads", async () => {
    const { repository, readMany, read } = fixture(1);
    readMany.mockResolvedValue(
      ok({
        results: [{ status: "error", path: "annotations/0.md", batch: 0 }],
        errors: [
          {
            batch: 0,
            paths: ["annotations/0.md"],
            failure: connectFailure(connectProblem("access_denied", "Denied")),
          },
        ],
      }),
    );
    await expect(repository.listForSource(collection, sourceId("src_1"))).rejects.toThrow("Denied");
    expect(read).not.toHaveBeenCalled();
  });

  it("retains point hydration when a batch row has no revision", async () => {
    const { repository, records, read } = fixture(1);
    const record = records[0]!;
    read.mockResolvedValue(
      ok({
        ...record,
        revision: "point-rev",
        frontmatter: record.frontmatter!,
        effectiveFrontmatter: record.effectiveFrontmatter!,
      }),
    );
    delete record.revision;
    expect((await repository.listForSource(collection, sourceId("src_1")))[0]?.recordRevision).toBe(
      "point-rev",
    );
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("wave B metadata discovery", () => {
  it("uses selected values without a frontmatter envelope and releases the iterator on a match", async () => {
    const { client, queryPages } = fixture();
    expect(await recordPathById(client, "src_1")).toBe("sources/one.md");
    expect(queryPages).toHaveBeenCalledWith(
      expect.objectContaining({ output: "metadata", select: ["id"] }),
      {},
    );
  });

  it("propagates discovery failures before issuing any query", async () => {
    const { client, queryPages } = fixture();
    client.supportsAuthorityFeature = () =>
      Promise.resolve(connectFailure(connectProblem("access_denied", "Discovery denied")));
    await expect(recordPathById(client, "src_1")).rejects.toThrow("Discovery denied");
    expect(queryPages).not.toHaveBeenCalled();
  });

  it("delegates connection-lifetime feature discovery and metadata paging to the SDK", async () => {
    const supportsAuthorityFeature = vi.fn(() => Promise.resolve(ok(true)));
    const queryPages = vi.fn(async function* () {
      yield await Promise.resolve(
        ok({ output: "metadata", results: [], page: 0, offset: 0, loaded: 0, complete: true }),
      );
    });
    const client = connectClient({
      supportsAuthorityFeature,
      queryPages,
    } as unknown as MdbaseConnection);
    const signal = new AbortController().signal;
    await client.supportsAuthorityFeature("query-metadata-v1", { signal });
    for await (const page of client.queryPages({ output: "metadata" }, { signal, pageSize: 100 })) {
      expect(page.ok).toBe(true);
    }
    expect(supportsAuthorityFeature).toHaveBeenCalledWith("query-metadata-v1", { signal });
    expect(queryPages).toHaveBeenCalledWith({ output: "metadata" }, { signal, pageSize: 100 });
  });
});

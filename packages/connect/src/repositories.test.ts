import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationContract, sourceContract } from "./contracts.js";
import {
  ConnectAnnotationRepository,
  ConnectSourceRepository,
  type ReaderConnectClient,
} from "./repositories.js";

import type { ConnectOutcome, QueryPage, QueryResult, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("ConnectSourceRepository", () => {
  it("scopes discovery to the source contract and opens the selected whole record", async () => {
    const query = vi.fn(() =>
      Promise.resolve(
        success<QueryResult>({
          results: [
            {
              path: "sources/crime.md",
              effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
              types: ["custom-source"],
              file: {},
            },
          ],
          meta: { totalCount: 1, hasMore: false },
        }),
      ),
    );
    const read = vi.fn(() =>
      Promise.resolve(
        success<RecordDocument>({
          path: "sources/crime.md",
          revision: "rev-1",
          types: ["custom-source"],
          frontmatter: { id: "src_01", title: "Crime and Punishment" },
          effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
          body: "Notes",
          file: {},
        }),
      ),
    );
    const queryPages = async function* (): AsyncGenerator<ConnectOutcome<QueryPage>> {
      const result = await query();
      if (result.ok) {
        yield* queryStream(result.value.results);
      }
    };
    const client = { query, queryPages, read } as unknown as ReaderConnectClient;
    const repository = new ConnectSourceRepository(client);
    const page = await repository.list({ collectionId: collectionId("reading"), limit: 20 });
    const selected = await repository.get(collectionId("reading"), sourceId("src_01"));

    expect(query).toHaveBeenCalledWith(expect.objectContaining({ contract: sourceContract }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith({
      path: "sources/crime.md",
      includeDocument: true,
    });
    expect(page.items[0]?.title).toBe("Crime and Punishment");
    expect(selected?.body).toBe("Notes");
  });

  it("makes source transclusion idempotent", async () => {
    const document = {
      path: "sources/crime.md",
      revision: "rev-3",
      types: ["reader-source"],
      frontmatter: { id: "src_01", title: "Crime and Punishment" },
      effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
      body: "Notes\n\n![[annotations/ann_01]]\n",
      file: {},
    } satisfies RecordDocument;
    const client = {
      queryPages: vi.fn(() =>
        queryStream([
          {
            path: document.path,
            effectiveFrontmatter: document.frontmatter,
            types: [],
            file: {},
          },
        ]),
      ),
      read: vi.fn(() => Promise.resolve(success(document))),
      update: vi.fn(),
    } as unknown as ReaderConnectClient;
    const repository = new ConnectSourceRepository(client);
    await repository.appendAnnotationEmbed({
      collectionId: collectionId("reading"),
      sourceId: "src_01" as never,
      expectedRevision: "rev-3" as never,
      annotationId: "ann_01" as never,
      embed: "![[annotations/ann_01]]",
      idempotencyKey: "mutation-1" as never,
    });
    expect(client.update).not.toHaveBeenCalled();
  });

  it("recognizes an annotation already embedded by its filename alone", async () => {
    const document = {
      path: "sources/crime.md",
      revision: "rev-3",
      types: ["reader-source"],
      frontmatter: { id: "src_01", title: "Crime and Punishment" },
      effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
      body: "Notes\n\n![[ann_01]]\n",
      file: {},
    } satisfies RecordDocument;
    const client = {
      queryPages: vi.fn(() =>
        queryStream([
          { path: document.path, effectiveFrontmatter: document.frontmatter, types: [], file: {} },
        ]),
      ),
      read: vi.fn(() => Promise.resolve(success(document))),
      update: vi.fn(),
    } as unknown as ReaderConnectClient;
    await new ConnectSourceRepository(client).appendAnnotationEmbed({
      collectionId: collectionId("reading"),
      sourceId: "src_01" as never,
      expectedRevision: "rev-3" as never,
      annotationId: "ann_01" as never,
      embed: "![[annotations/ann_01]]",
      idempotencyKey: "mutation-1" as never,
    });
    expect(client.update).not.toHaveBeenCalled();
  });
});

describe("ConnectAnnotationRepository", () => {
  it("creates annotation bodies through explicitly approved whole-record access", async () => {
    const document = {
      path: "annotations/ann_01.md",
      revision: "rev-1",
      types: ["reader-annotation"],
      frontmatter: {
        type: "reader-annotation",
        id: "ann_01",
        source: "[[src_01]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T00:00:00.000Z",
        tags: [],
      },
      effectiveFrontmatter: {
        id: "ann_01",
        source: "[[src_01]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T00:00:00.000Z",
        tags: [],
      },
      body: "> Selected text",
      file: {},
    } satisfies RecordDocument;
    const create = vi.fn(() => Promise.resolve(success(document)));
    const repository = new ConnectAnnotationRepository({
      create,
    } as unknown as ReaderConnectClient);

    await repository.create(
      {
        collectionId: collectionId("reading"),
        id: annotationId("ann_01"),
        sourceId: sourceId("src_01"),
        source: "[[src_01]]",
        annotationType: "highlight",
        target: { quote: { exact: "Selected text" } },
        tags: [],
        body: "> Selected text",
        createdAt: dateTime("2026-08-09T00:00:00.000Z"),
      },
      "mutation-1" as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reader-annotation",
        body: "> Selected text",
      }),
    );
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ contract: annotationContract }),
    );
  });
});

describe("Connect annotation reads", () => {
  it("filters annotation references and reads only matching bodies as whole records", async () => {
    const queryPages = vi.fn(() =>
      queryStream([
        {
          path: "annotations/matching.md",
          effectiveFrontmatter: { id: "ann_01", source: "src_01" },
          types: ["reader-annotation"],
          file: {},
        },
        {
          path: "annotations/other.md",
          effectiveFrontmatter: { id: "ann_02", source: "src_02" },
          types: ["reader-annotation"],
          file: {},
        },
      ]),
    );
    const read = vi.fn(() =>
      Promise.resolve(
        success<RecordDocument>({
          path: "annotations/matching.md",
          revision: "rev-1",
          types: ["reader-annotation"],
          frontmatter: {
            id: "ann_01",
            source: "src_01",
            annotation_type: "note",
            created_at: "2026-08-09T00:00:00.000Z",
          },
          effectiveFrontmatter: {
            id: "ann_01",
            source: "src_01",
            annotation_type: "note",
            created_at: "2026-08-09T00:00:00.000Z",
          },
          body: "A useful note.",
          file: {},
        }),
      ),
    );
    const readMany = vi.fn<ReaderConnectClient["readMany"]>(() =>
      Promise.resolve(
        success({
          results: [{ status: "missing", path: "annotations/matching.md" }],
          errors: [],
        }),
      ),
    );
    const repository = new ConnectAnnotationRepository({
      queryPages,
      readMany,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(queryPages).toHaveBeenCalledWith(
      {
        types: ["reader-annotation"],
        where:
          'has(record.source) && source != null && source.asFile() == null && source.contains("src_01")',
        frontmatterMode: "effective",
      },
      { firstPageSize: 100, pageSize: 100 },
    );
    // Revisionless bodies are batched by the SDK; missing query rows still require a read.
    expect(readMany).toHaveBeenCalledWith(["annotations/matching.md"], {
      types: ["reader-annotation"],
      frontmatterMode: "both",
      includeBody: true,
    });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      { path: "annotations/matching.md", includeDocument: true },
      { signal: expect.any(AbortSignal) },
    );
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.body).toBe("A useful note.");
    await expect(repository.sourceIdsWithAnnotations(collectionId("reading"))).resolves.toEqual([
      "src_01",
      "src_02",
    ]);

    await repository.listForSource(collectionId("reading"), sourceId("src_02"));
    // Each listing: an ID lookup and legacy-reference query; one unscoped index query.
    expect(queryPages).toHaveBeenCalledTimes(5);
    expect(readMany).toHaveBeenCalledTimes(2);
  });
});

describe("Connect annotation listing fallback", () => {
  it("reads each matched annotation when the body query is refused", async () => {
    const queryPages = vi.fn((input: { where?: string }) => {
      return queryStream(
        input.where?.includes("contains")
          ? [
              {
                path: "annotations/matching.md",
                effectiveFrontmatter: { id: "ann_01", source: "src_01" },
                types: ["reader-annotation"],
                file: {},
              },
            ]
          : [],
      );
    });
    const read = vi.fn(() =>
      Promise.resolve(
        success<RecordDocument>({
          path: "annotations/matching.md",
          revision: "rev-1",
          types: ["reader-annotation"],
          frontmatter: {
            id: "ann_01",
            source: "src_01",
            annotation_type: "note",
            created_at: "2026-08-09T00:00:00.000Z",
          },
          effectiveFrontmatter: {
            id: "ann_01",
            source: "src_01",
            annotation_type: "note",
            created_at: "2026-08-09T00:00:00.000Z",
          },
          body: "A useful note.",
          file: {},
        }),
      ),
    );
    const readMany = vi.fn<ReaderConnectClient["readMany"]>(() =>
      Promise.resolve(
        connectFailure(
          connectProblem("unsupported_operation", "This query is not available here."),
        ),
      ),
    );
    const repository = new ConnectAnnotationRepository({
      queryPages,
      readMany,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(readMany).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(annotations.map((annotation) => annotation.body)).toEqual(["A useful note."]);
  });
});

async function* queryStream(
  results: QueryPage["results"],
): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success({
      results,
      meta: { totalCount: results.length, hasMore: false },
      page: 0,
      offset: 0,
      loaded: results.length,
      complete: true,
    }),
  );
}

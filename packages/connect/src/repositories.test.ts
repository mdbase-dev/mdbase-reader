import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationContract, sourceContract } from "./contracts.js";
import { mockSdk, testWrite, testQuery, testRecord } from "./records.fixtures.js";
import { ConnectAnnotationRepository, ConnectSourceRepository } from "./repositories.js";

import type { QueryResult, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): Value {
  return value;
}

describe("ConnectSourceRepository", () => {
  it("scopes discovery to the source contract and opens the selected whole record", async () => {
    const query = vi.fn(() =>
      Promise.resolve(
        success<QueryResult>(
          testQuery({
            records: [
              testRecord({
                path: "sources/crime.md",
                effective: { id: "src_01", title: "Crime and Punishment" },
                types: ["custom-source"],
              }),
            ],
            totalCount: 1,
            hasMore: false,
          }),
        ),
      ),
    );
    const read = vi.fn(() =>
      Promise.resolve(
        success<RecordView>(
          testRecord({
            path: "sources/crime.md",
            revision: "rev-1",
            types: ["custom-source"],
            frontmatter: { id: "src_01", title: "Crime and Punishment" },
            effective: { id: "src_01", title: "Crime and Punishment" },
            body: "Notes",
          }),
        ),
      ),
    );
    const pages = async function* (): AsyncGenerator<QueryResult> {
      const result = await query();
      yield* queryStream(result.records);
    };
    const queryContract = vi.fn(async () => {
      const page = await query();
      return {
        page,
        records: page.records.map((record) => ({
          id: record.id,
          implementations: [
            { typeName: "custom-source", fields: record.effective ?? record.frontmatter },
          ],
        })),
      };
    });
    const client = mockSdk({ queryContract, ...legacyAuthorityFeatures, query, pages, get: read });
    const repository = new ConnectSourceRepository(client);
    const page = await repository.list({ collectionId: collectionId("reading"), limit: 20 });
    const selected = await repository.get(collectionId("reading"), sourceId("src_01"));

    expect(queryContract).toHaveBeenCalledWith(sourceContract, { pageSize: 20 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(
      {
        path: "sources/crime.md",
      },
      expect.objectContaining({ include: { effective: true, body: true, document: true } }),
    );
    expect(page.items[0]?.title).toBe("Crime and Punishment");
    expect(selected?.body).toBe("Notes");
  });
});

describe("Connect source transclusion", () => {
  it("makes source transclusion idempotent", async () => {
    const document = testRecord({
      path: "sources/crime.md",
      revision: "rev-3",
      types: ["reader-source"],
      frontmatter: { id: "src_01", title: "Crime and Punishment" },
      effective: { id: "src_01", title: "Crime and Punishment" },
      body: "Notes\n\n![[annotations/ann_01]]\n",
    }) satisfies RecordView;
    const client = mockSdk({
      ...legacyAuthorityFeatures,
      pages: vi.fn(() =>
        queryStream([
          testRecord({
            path: document.path,
            effective: document.frontmatter,
            types: [],
          }),
        ]),
      ),
      get: vi.fn(() => Promise.resolve(success(document))),
      update: vi.fn(),
    });
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
    const document = testRecord({
      path: "sources/crime.md",
      revision: "rev-3",
      types: ["reader-source"],
      frontmatter: { id: "src_01", title: "Crime and Punishment" },
      effective: { id: "src_01", title: "Crime and Punishment" },
      body: "Notes\n\n![[ann_01]]\n",
    }) satisfies RecordView;
    const client = mockSdk({
      ...legacyAuthorityFeatures,
      pages: vi.fn(() =>
        queryStream([
          testRecord({ path: document.path, effective: document.frontmatter, types: [] }),
        ]),
      ),
      get: vi.fn(() => Promise.resolve(success(document))),
      update: vi.fn(),
    });
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
    const document = testRecord({
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
      effective: {
        id: "ann_01",
        source: "[[src_01]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T00:00:00.000Z",
        tags: [],
      },
      body: "> Selected text",
    }) satisfies RecordView;
    const create = vi.fn(() => Promise.resolve(testWrite(success(document))));
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        create,
      }),
    );

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
      expect.objectContaining({ intent: "mutation-1" }),
    );
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ contract: annotationContract }),
      expect.anything(),
    );
  });
});

describe("Connect annotation reads", () => {
  it("filters annotation references and reads only matching bodies as whole records", async () => {
    const pages = vi.fn(() =>
      queryStream([
        testRecord({
          path: "annotations/matching.md",
          effective: { id: "ann_01", source: "src_01" },
          types: ["reader-annotation"],
        }),
        testRecord({
          path: "annotations/other.md",
          effective: { id: "ann_02", source: "src_02" },
          types: ["reader-annotation"],
        }),
      ]),
    );
    const read = vi.fn(() =>
      Promise.resolve(
        success<RecordView>(
          testRecord({
            path: "annotations/matching.md",
            revision: "rev-1",
            types: ["reader-annotation"],
            frontmatter: {
              id: "ann_01",
              source: "src_01",
              annotation_type: "note",
              created_at: "2026-08-09T00:00:00.000Z",
            },
            effective: {
              id: "ann_01",
              source: "src_01",
              annotation_type: "note",
              created_at: "2026-08-09T00:00:00.000Z",
            },
            body: "A useful note.",
          }),
        ),
      ),
    );
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages,
        get: read,
      }),
    );

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(pages).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ["reader-annotation"],
        where:
          'has(record.source) && source != null && source.asFile() == null && source.contains("src_01")',
      }),
      expect.objectContaining({}),
    );
    // Revisionless bodies are batched by the SDK; missing query rows still require a read.
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      { path: "annotations/matching.md" },
      { include: { effective: true, body: true, document: true } },
    );
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.body).toBe("A useful note.");
    await expect(repository.sourceIdsWithAnnotations(collectionId("reading"))).resolves.toEqual([
      "src_01",
      "src_02",
    ]);

    await repository.listForSource(collectionId("reading"), sourceId("src_02"));
    expect(pages).toHaveBeenCalledTimes(5);
  });
});

async function* queryStream(records: QueryResult["records"]): AsyncGenerator<QueryResult> {
  yield await Promise.resolve(testQuery({ records, complete: true }));
}

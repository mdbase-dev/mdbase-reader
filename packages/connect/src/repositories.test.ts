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
              path: "sources/gravity.md",
              effectiveFrontmatter: { id: "src_01", title: "Gravity and Grace" },
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
          path: "sources/gravity.md",
          revision: "rev-1",
          types: ["custom-source"],
          frontmatter: { id: "src_01", title: "Gravity and Grace" },
          effectiveFrontmatter: { id: "src_01", title: "Gravity and Grace" },
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
      path: "sources/gravity.md",
      includeDocument: true,
    });
    expect(page.items[0]?.title).toBe("Gravity and Grace");
    expect(selected?.body).toBe("Notes");
  });

  it("makes source transclusion idempotent", async () => {
    const document = {
      path: "sources/gravity.md",
      revision: "rev-3",
      types: ["reader-source"],
      frontmatter: { id: "src_01", title: "Gravity and Grace" },
      effectiveFrontmatter: { id: "src_01", title: "Gravity and Grace" },
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
    const repository = new ConnectAnnotationRepository({
      queryPages,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(queryPages).toHaveBeenCalledWith(
      {
        types: ["reader-annotation"],
        where: 'source != null && source.asFile() == null && source.contains("src_01")',
        frontmatterMode: "effective",
      },
      { firstPageSize: 100, pageSize: 100 },
    );
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({
      path: "annotations/matching.md",
      includeDocument: true,
    });
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.body).toBe("A useful note.");
    await expect(repository.sourceIdsWithAnnotations(collectionId("reading"))).resolves.toEqual([
      "src_01",
      "src_02",
    ]);

    await repository.listForSource(collectionId("reading"), sourceId("src_02"));
    expect(queryPages).toHaveBeenCalledTimes(5);
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

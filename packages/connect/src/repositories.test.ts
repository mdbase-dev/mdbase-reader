import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationContract, sourceContract } from "./contracts.js";
import {
  ConnectAnnotationRepository,
  ConnectSourceRepository,
  type ReaderConnectClient,
} from "./repositories.js";

import type { ConnectOutcome, QueryResult, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("ConnectSourceRepository", () => {
  it("always scopes library queries to the exact Reader source contract", async () => {
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
    const client = { query } as unknown as ReaderConnectClient;
    const repository = new ConnectSourceRepository(client);
    const page = await repository.list({ collectionId: collectionId("reading"), limit: 20 });

    expect(query).toHaveBeenCalledWith(expect.objectContaining({ contract: sourceContract }));
    expect(page.items[0]?.title).toBe("Gravity and Grace");
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
      query: vi.fn(() =>
        Promise.resolve(
          success<QueryResult>({
            results: [
              {
                path: document.path,
                effectiveFrontmatter: document.frontmatter,
                types: [],
                file: {},
              },
            ],
          }),
        ),
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
  it("filters normalized contract fields locally and reads only matching annotation bodies", async () => {
    const query = vi.fn(() =>
      Promise.resolve(
        success<QueryResult>({
          results: [
            {
              path: "annotations/matching.md",
              effectiveFrontmatter: { source: "src_01" },
              types: ["reader-annotation"],
              file: {},
            },
            {
              path: "annotations/other.md",
              effectiveFrontmatter: { source: "src_02" },
              types: ["reader-annotation"],
              file: {},
            },
          ],
          meta: { totalCount: 2, hasMore: false },
        }),
      ),
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
      query,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(query).toHaveBeenCalledWith({
      contract: annotationContract,
      frontmatterMode: "effective",
      limit: 500,
      offset: 0,
    });
    expect(query).not.toHaveBeenCalledWith(expect.objectContaining({ includeBody: true }));
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({
      path: "annotations/matching.md",
      contract: annotationContract,
      includeDocument: true,
    });
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.body).toBe("A useful note.");
  });
});

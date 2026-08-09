import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sourceContract } from "./contracts.js";
import { ConnectSourceRepository, type ReaderConnectClient } from "./repositories.js";

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

import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectContentSearchRepository } from "./content-search-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryInput, QueryResult } from "@mdbase-dev/connect";

function success(value: QueryResult): ConnectOutcome<QueryResult> {
  return { ok: true, value, diagnostics: [] };
}

describe("ConnectContentSearchRepository", () => {
  it("maps matching source notes and annotations back to source identities", async () => {
    const query = vi.fn(() =>
      Promise.resolve(
        success({
          results: [
            {
              path: "sources/one.md",
              effectiveFrontmatter: { type: "reader-source", id: "src_one" },
              types: ["reader-source"],
              file: {},
            },
            {
              path: "annotations/one.md",
              effectiveFrontmatter: {
                type: "reader-annotation",
                id: "ann_one",
                source: "[[src_one|One]]",
              },
              types: ["reader-annotation"],
              file: {},
            },
            {
              path: "annotations/two.md",
              effectiveFrontmatter: {
                type: "reader-annotation",
                id: "ann_two",
                source: "[[src_two]]",
              },
              types: ["reader-annotation"],
              file: {},
            },
          ],
          meta: { totalCount: 3, hasMore: false },
        }),
      ),
    );
    const repository = new ConnectContentSearchRepository({
      query,
    } as unknown as ReaderConnectClient);

    await expect(repository.search(collectionId("reading"), "Measured")).resolves.toEqual([
      { sourceId: "src_one", kinds: ["source-note", "annotation"] },
      { sourceId: "src_two", kinds: ["annotation"] },
    ]);
    expect(query).toHaveBeenCalledWith({
      where: 'file.body.lower().contains("measured")',
      frontmatterMode: "effective",
      includeBody: false,
      limit: 500,
      offset: 0,
    });
  });

  it("quotes user text as one expression string", async () => {
    const query = vi.fn(() => Promise.resolve(success({ results: [] })));
    const repository = new ConnectContentSearchRepository({
      query,
    } as unknown as ReaderConnectClient);

    await repository.search(collectionId("reading"), 'x") || true');

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: 'file.body.lower().contains("x\\") || true")',
      }),
    );
  });

  it("bounds concurrent follow-up pages", async () => {
    let active = 0;
    let maximum = 0;
    const query = vi.fn(async (input: QueryInput) => {
      if ((input.offset ?? 0) === 0) {
        return success({
          results: [],
          meta: { totalCount: 3_500, hasMore: true, snapshot: "search-snapshot" },
        });
      }
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return success({
        results: [],
        meta: { totalCount: 3_500, hasMore: false, snapshot: "search-snapshot" },
      });
    });
    const repository = new ConnectContentSearchRepository({
      query,
    } as unknown as ReaderConnectClient);

    await repository.search(collectionId("reading"), "measured");

    expect(maximum).toBe(4);
    expect(query).toHaveBeenCalledTimes(7);
  });
});

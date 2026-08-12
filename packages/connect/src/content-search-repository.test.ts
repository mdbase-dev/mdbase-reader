import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectContentSearchRepository } from "./content-search-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, QueryRecord } from "@mdbase-dev/connect";

function success(value: QueryPage): ConnectOutcome<QueryPage> {
  return { ok: true, value, diagnostics: [] };
}

function page(results: QueryRecord[], index = 0, complete = true): QueryPage {
  return {
    results,
    page: index,
    offset: index === 0 ? 0 : 500 + (index - 1) * 1_000,
    loaded: results.length,
    complete,
    meta: { totalCount: results.length, hasMore: !complete },
  };
}

describe("ConnectContentSearchRepository", () => {
  it("maps matching source notes and annotations back to source identities", async () => {
    const queryPages = vi.fn(() =>
      queryStream([
        page([
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
        ]),
      ]),
    );
    const repository = new ConnectContentSearchRepository({
      queryPages,
    } as unknown as ReaderConnectClient);

    await expect(repository.search(collectionId("reading"), "Measured")).resolves.toEqual([
      { sourceId: "src_one", kinds: ["source-note", "annotation"] },
      { sourceId: "src_two", kinds: ["annotation"] },
    ]);
    expect(queryPages).toHaveBeenCalledWith(
      {
        where: 'file.body.lower().contains("measured")',
        frontmatterMode: "effective",
        includeBody: false,
      },
      { firstPageSize: 500, pageSize: 1_000 },
    );
  });

  it("quotes user text as one expression string", async () => {
    const queryPages = vi.fn(() => queryStream([page([])]));
    const repository = new ConnectContentSearchRepository({
      queryPages,
    } as unknown as ReaderConnectClient);

    await repository.search(collectionId("reading"), 'x") || true');

    expect(queryPages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: 'file.body.lower().contains("x\\") || true")',
      }),
      expect.anything(),
    );
  });

  it("consumes one generation-pinned SDK page stream instead of offset fan-out", async () => {
    const queryPages = vi.fn(() =>
      queryStream([page([], 0, false), page([], 1, false), page([], 2, true)]),
    );
    const repository = new ConnectContentSearchRepository({
      queryPages,
    } as unknown as ReaderConnectClient);

    await repository.search(collectionId("reading"), "measured", {
      replaceableFamily: "reader-library-content-search",
    });

    expect(queryPages).toHaveBeenCalledOnce();
    expect(queryPages).toHaveBeenCalledWith(expect.anything(), {
      replaceableFamily: "reader-library-content-search",
      firstPageSize: 500,
      pageSize: 1_000,
    });
  });
});

async function* queryStream(
  pages: readonly QueryPage[],
): AsyncGenerator<ConnectOutcome<QueryPage>> {
  for (const value of pages) {
    yield await Promise.resolve(success(value));
  }
}

import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sourceContract } from "./contracts.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("Connect source pagination", () => {
  it("streams complete libraries through the SDK's pinned cursor iterator", async () => {
    const queryPages = vi.fn(() => sourcePages());
    const repository = new ConnectSourceRepository({
      queryPages,
    } as unknown as ReaderConnectClient);

    const pages: Awaited<ReturnType<typeof repository.list>>[] = [];
    for await (const page of repository.listPages(
      { collectionId: collectionId("reading"), limit: 100 },
      { replaceableFamily: "reader-library-load" },
    )) {
      pages.push(page);
    }

    expect(pages.map(({ items }) => items.map(({ id }) => id))).toEqual([["src_01"], ["src_02"]]);
    expect(queryPages).toHaveBeenCalledWith(
      { contract: sourceContract, frontmatterMode: "effective" },
      {
        replaceableFamily: "reader-library-load",
        firstPageSize: 100,
        pageSize: 1_000,
      },
    );
  });
});

async function* sourcePages(): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success({
      results: [sourceRecord("src_01", "First")],
      meta: { totalCount: 2, hasMore: true, cursor: "opaque-next" },
      page: 0,
      offset: 0,
      loaded: 1,
      complete: false,
      cursor: "opaque-next",
    }),
  );
  yield await Promise.resolve(
    success({
      results: [sourceRecord("src_02", "Second")],
      meta: { totalCount: 2, hasMore: false },
      page: 1,
      offset: 1,
      loaded: 2,
      complete: true,
    }),
  );
}

function sourceRecord(id: string, title: string): QueryPage["results"][number] {
  return {
    path: `sources/${id}.md`,
    effectiveFrontmatter: { id, title },
    types: ["reader-source"],
    file: {},
  };
}

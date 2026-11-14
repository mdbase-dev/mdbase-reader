import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sourceContract } from "./contracts.js";
import { mockSdk, testQuery, testRecord } from "./records.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { QueryResult } from "@mdbase-dev/sdk";

describe("Connect source pagination", () => {
  it("streams complete libraries through the SDK's pinned cursor iterator", async () => {
    const first = sourceRecord("src_01", "First");
    const second = sourceRecord("src_02", "Second");
    const queryContract = vi
      .fn()
      .mockResolvedValueOnce({
        page: testQuery({ records: [first], cursor: "opaque-next", totalCount: 2 }),
        records: [
          {
            id: first.id,
            implementations: [{ typeName: "reader-source", fields: first.frontmatter }],
          },
        ],
      })
      .mockResolvedValueOnce({
        page: testQuery({ records: [second], totalCount: 2 }),
        records: [
          {
            id: second.id,
            implementations: [{ typeName: "reader-source", fields: second.frontmatter }],
          },
        ],
      });
    const repository = new ConnectSourceRepository(mockSdk({ queryContract }));

    const pages: Awaited<ReturnType<typeof repository.list>>[] = [];
    for await (const page of repository.listPages(
      { collectionId: collectionId("reading"), limit: 100 },
      { replaceableFamily: "reader-library-load" },
    )) {
      pages.push(page);
    }

    expect(pages.map(({ items }) => items.map(({ id }) => id))).toEqual([["src_01"], ["src_02"]]);
    expect(queryContract.mock.calls).toEqual([
      [sourceContract, { pageSize: 128 }],
      [sourceContract, { pageSize: 128, cursor: "opaque-next" }],
    ]);
  });
});

function sourceRecord(id: string, title: string): QueryResult["records"][number] {
  return testRecord({
    path: `sources/${id}.md`,
    effective: { id, title },
    types: ["reader-source"],
  });
}

it("refuses an incomplete contract page before publishing the library", async () => {
  const queryContract = vi
    .fn()
    .mockResolvedValue({ page: testQuery({ records: [], complete: false }), records: [] });
  const repository = new ConnectSourceRepository(mockSdk({ queryContract }));
  const query = { collectionId: collectionId("reading"), limit: 100 };
  await expect(repository.list(query)).rejects.toMatchObject({ reason: "query_incomplete" });
  const published = vi.fn();
  await expect(
    (async () => {
      for await (const page of repository.listPages(query)) {
        published(page);
      }
    })(),
  ).rejects.toMatchObject({ reason: "query_incomplete" });
  expect(published).not.toHaveBeenCalled();
});

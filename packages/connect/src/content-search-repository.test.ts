import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectContentSearchRepository } from "./content-search-repository.js";
import { linkIndex, mockSdk, testQuery, testRecord } from "./records.fixtures.js";

import type { QueryResult, RecordView } from "@mdbase-dev/sdk";

function success(value: QueryResult): QueryResult {
  return value;
}

function page(records: RecordView[], _index = 0, complete = true): QueryResult {
  return testQuery({
    records,

    complete: true,
    totalCount: records.length,
    hasMore: !complete,
  });
}

describe("ConnectContentSearchRepository", () => {
  it("maps matching source notes and annotations back to source identities", async () => {
    const pages = vi.fn(() =>
      queryStream([
        page([
          testRecord({
            path: "sources/one.md",
            effective: { type: "reader-source", id: "src_one" },
            types: ["reader-source"],
          }),
          testRecord({
            path: "annotations/one.md",
            effective: {
              type: "reader-annotation",
              id: "ann_one",
              source: "[[src_one|One]]",
            },
            types: ["reader-annotation"],
          }),
          testRecord({
            path: "annotations/two.md",
            effective: {
              type: "reader-annotation",
              id: "ann_two",
              source: "[[src_two]]",
            },
            types: ["reader-annotation"],
          }),
        ]),
      ]),
    );
    const repository = new ConnectContentSearchRepository(
      mockSdk({
        pages,
      }),
    );

    await expect(repository.search(collectionId("reading"), "Measured")).resolves.toEqual([
      { sourceId: "src_one", kinds: ["source-note", "annotation"] },
      { sourceId: "src_two", kinds: ["annotation"] },
    ]);
    expect(pages).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ["reader-source", "reader-annotation"],
        where: 'file.body.lower().contains("measured")',
      }),
      expect.objectContaining({}),
    );
  });

  it("finds annotations linked by filename across pages, reading their owner once", async () => {
    const source = testRecord({
      path: "sources/My paper.md",
      effective: { type: "reader-source", id: "stable" },
    });
    const records = Array.from({ length: 6 }, (_, index) =>
      testRecord({
        path: `annotations/${String(index)}.md`,
        effective: { type: "reader-annotation", source: "[[My paper|Study]]" },
        body: `Matched passage ${String(index)}`,
      }),
    );
    const links = linkIndex([source], (link) =>
      link === "[[My paper|Study]]" ? source.path : null,
    );
    const find = vi.fn().mockResolvedValue(source);
    const client = mockSdk({
      ...links,
      find,
      pages: () => queryStream([page(records.slice(0, 2), 0, false), page(records.slice(2))]),
    });
    const result = await new ConnectContentSearchRepository(client).search(
      collectionId("reading"),
      "matched",
    );
    expect(result.map((match) => match.sourceId)).toEqual(["stable"]);
    expect(result[0]?.passages?.map((passage) => passage.path)).toEqual(
      records.slice(0, 3).map((record) => record.path),
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(links.resolveLinks).toHaveBeenCalledExactlyOnceWith(
      records[0]?.path,
      ["[[My paper|Study]]"],
      {},
    );
  });

  it("resolves identical links independently by folder and on each search", async () => {
    const first = testRecord({ path: "one/Owner.md", effective: { id: "first" } });
    const second = testRecord({ path: "two/Owner.md", effective: { id: "second" } });
    const note = (path: string): RecordView =>
      testRecord({
        path,
        effective: { type: "reader-annotation", source: "[[Owner]]" },
        body: "Matched passage",
      });
    let moved = false;
    const links = linkIndex([first, second], (_link, from) =>
      !moved && from.startsWith("one/") ? first.path : second.path,
    );
    const repository = new ConnectContentSearchRepository(
      mockSdk({
        ...links,
        find: ({ path }: { path: string }) => Promise.resolve(path === first.path ? first : second),
        pages: () => queryStream([page([note("one/a.md"), note("two/a.md")])]),
      }),
    );
    const search = async (): Promise<string[]> =>
      (await repository.search(collectionId("reading"), "matched")).map(({ sourceId }) => sourceId);
    expect(await search()).toEqual(["first", "second"]);
    moved = true;
    expect(await search()).toEqual(["second"]);
  });

  it("includes bounded passage context without losing record destinations", async () => {
    const pages = vi.fn(() =>
      queryStream([
        page([
          testRecord({
            path: "sources/one.md",
            types: ["reader-source"],

            effective: { id: "src_one", type: "reader-source" },
            body: `${"x".repeat(1000)} Measured passage ${"y".repeat(1000)}`,
          }),
        ]),
      ]),
    );
    const repository = new ConnectContentSearchRepository(
      mockSdk({
        pages,
      }),
    );
    const matches = await repository.search(collectionId("reading"), "measured");
    expect(matches[0]?.passages?.[0]).toMatchObject({
      path: "sources/one.md",
      kind: "source-note",
    });
    expect(matches[0]?.passages?.[0]?.text).toContain("Measured passage");
    expect(matches[0]?.passages?.[0]?.text.length).toBeLessThan(300);
  });

  it("quotes user text as one expression string", async () => {
    const pages = vi.fn(() => queryStream([page([])]));
    const repository = new ConnectContentSearchRepository(
      mockSdk({
        pages,
      }),
    );

    await repository.search(collectionId("reading"), 'x") || true');

    expect(pages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: 'file.body.lower().contains("x\\") || true")',
      }),
      expect.anything(),
    );
  });

  it("consumes one generation-pinned SDK page stream instead of offset fan-out", async () => {
    const pages = vi.fn(() =>
      queryStream([page([], 0, false), page([], 1, false), page([], 2, true)]),
    );
    const repository = new ConnectContentSearchRepository(
      mockSdk({
        pages,
      }),
    );

    await repository.search(collectionId("reading"), "measured", {
      replaceableFamily: "reader-library-content-search",
    });

    expect(pages).toHaveBeenCalledOnce();
    expect(pages).toHaveBeenCalledWith(expect.anything(), {
      replaceableFamily: "reader-library-content-search",
      include: { effective: true, body: true },
    });
  });
});

async function* queryStream(pages: readonly QueryResult[]): AsyncGenerator<QueryResult> {
  for (const value of pages) {
    yield await Promise.resolve(success(value));
  }
}

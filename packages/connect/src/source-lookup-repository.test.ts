import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { mockSdk, testRecord } from "./records.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { Query, QueryResult, RecordView } from "@mdbase-dev/sdk";

const library = collectionId("[test] library");

function record(id: string, fields: Record<string, unknown>): RecordView {
  return testRecord({
    path: `sources/${id}.md`,
    effective: { type: "reader-source", id, title: id, kind: "webpage", ...fields },
    types: ["reader-source"],
  });
}

function lookupFixture(records: RecordView[]): {
  repository: ConnectSourceRepository;
  pages: ReturnType<typeof vi.fn>;
} {
  const pages = vi.fn(async function* (): AsyncGenerator<QueryResult> {
    yield await Promise.resolve({
      records,

      complete: true,
      hasMore: false,
      asOf: 1,
    } as QueryResult);
  });
  return {
    repository: new ConnectSourceRepository(mockSdk({ pages })),
    pages,
  };
}

describe("ConnectSourceRepository lookups", () => {
  it("narrows by URL in the store, then compares normalized page identity", async () => {
    const { repository, pages } = lookupFixture([
      record("src_other", { url: "https://example.com/story-two" }),
      record("src_match", { url: "https://www.example.com/story/?utm_source=feed" }),
    ]);
    const found = await repository.findByUrl(library, "https://example.com/story#intro");
    expect(found?.id).toBe("src_match");
    const input = pages.mock.calls[0]?.[0] as Query;
    expect(input.types).toEqual(["reader-source"]);
    expect(input.where).toContain('url.lower().contains("example.com/story")');
    expect(input.where).toContain("original_url != null");
  });

  it("matches a source by its submitted URL when the canonical URL differs", async () => {
    const { repository } = lookupFixture([
      record("src_match", {
        url: "https://example.com/canonical",
        original_url: "https://example.com/story",
      }),
    ]);
    await expect(repository.findByUrl(library, "https://example.com/story")).resolves.toMatchObject(
      { id: "src_match" },
    );
  });

  it("returns only sources whose citekey really starts with the prefix", async () => {
    const { repository, pages } = lookupFixture([
      record("src_a", { csl: { id: "smithdeep2015", type: "article-journal", title: "A" } }),
      record("src_b", { csl: { id: "smithdeep2015a", type: "article-journal", title: "B" } }),
    ]);
    const found = await repository.findByCitekeyPrefix(library, "smithdeep2015");
    expect(found.map((source) => source.citation?.id)).toEqual(["smithdeep2015", "smithdeep2015a"]);
    expect((pages.mock.calls[0]?.[0] as Query).where).toBe(
      'csl != null && csl.id != null && csl.id.startsWith("smithdeep2015")',
    );
  });
});

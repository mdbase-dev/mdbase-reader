import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryInput, QueryPage, QueryRecord } from "@mdbase-dev/connect";

const library = collectionId("[test] library");

function record(id: string, fields: Record<string, unknown>): QueryRecord {
  return {
    path: `sources/${id}.md`,
    effectiveFrontmatter: { type: "reader-source", id, title: id, kind: "webpage", ...fields },
    types: ["reader-source"],
    file: {},
  };
}

function lookupFixture(results: QueryRecord[]): {
  repository: ConnectSourceRepository;
  queryPages: ReturnType<typeof vi.fn>;
} {
  const queryPages = vi.fn(async function* (): AsyncGenerator<ConnectOutcome<QueryPage>> {
    yield await Promise.resolve({
      ok: true,
      diagnostics: [],
      value: {
        results,
        page: 0,
        offset: 0,
        loaded: results.length,
        complete: true,
        meta: { hasMore: false },
      },
    } as ConnectOutcome<QueryPage>);
  });
  return {
    repository: new ConnectSourceRepository({ queryPages } as unknown as ReaderConnectClient),
    queryPages,
  };
}

describe("ConnectSourceRepository lookups", () => {
  it("narrows by URL in the store, then compares normalized page identity", async () => {
    const { repository, queryPages } = lookupFixture([
      record("src_other", { url: "https://example.com/story-two" }),
      record("src_match", { url: "https://www.example.com/story/?utm_source=feed" }),
    ]);
    const found = await repository.findByUrl(library, "https://example.com/story#intro");
    expect(found?.id).toBe("src_match");
    const input = queryPages.mock.calls[0]?.[0] as QueryInput;
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
    const { repository, queryPages } = lookupFixture([
      record("src_a", { csl: { id: "smithdeep2015", type: "article-journal", title: "A" } }),
      record("src_b", { csl: { id: "smithdeep2015a", type: "article-journal", title: "B" } }),
    ]);
    const found = await repository.findByCitekeyPrefix(library, "smithdeep2015");
    expect(found.map((source) => source.citation?.id)).toEqual(["smithdeep2015", "smithdeep2015a"]);
    expect((queryPages.mock.calls[0]?.[0] as QueryInput).where).toBe(
      'csl != null && csl.id != null && csl.id.startsWith("smithdeep2015")',
    );
  });
});

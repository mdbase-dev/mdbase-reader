import { describe, expect, it, vi } from "vitest";

import { sourceContract } from "./contracts.js";
import { connectClient, mapConcurrent, recordPathById } from "./repository-client.js";

import type { ConnectOutcome, MdbaseConnection, QueryPage, QueryResult } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("Reader Connect SDK integration", () => {
  it("delegates admission and connector-busy retry policy to the SDK exactly once", async () => {
    const busy = {
      ok: false,
      problem: {
        problem_version: 1,
        code: "connector_busy",
        category: "availability",
        recovery: "retry",
        message: "The connector is busy.",
        operation_outcome: "rejected",
      },
    } as const satisfies ConnectOutcome<QueryResult>;
    const query = vi.fn(() => Promise.resolve(busy));
    const client = connectClient({ query } as unknown as MdbaseConnection);

    await expect(client.query({})).resolves.toEqual(busy);
    expect(query).toHaveBeenCalledOnce();
  });

  it("maps replaceable reads onto the SDK's latest-wins coordination family", async () => {
    const query = vi.fn(() => Promise.resolve(success<QueryResult>({ results: [] })));
    const client = connectClient({ query } as unknown as MdbaseConnection);
    const signal = new AbortController().signal;

    await client.query({ where: "open" }, { signal, replaceableFamily: "reader-library-search" });

    expect(query).toHaveBeenCalledWith(
      { where: "open" },
      {
        signal,
        coordination: { family: "reader-library-search", latestWins: true },
      },
    );
  });

  it("maps stable page streams onto SDK cursor sizing and coordination", async () => {
    const queryPages = vi.fn(() => emptyPages());
    const client = connectClient({ queryPages } as unknown as MdbaseConnection);

    const pages = client.queryPages(
      { contract: sourceContract },
      {
        firstPageSize: 100,
        pageSize: 1_000,
        replaceableFamily: "reader-library-load",
      },
    );
    await pages[Symbol.asyncIterator]().next();

    expect(queryPages).toHaveBeenCalledWith(
      { contract: sourceContract },
      {
        firstPageSize: 100,
        pageSize: 1_000,
        coordination: { family: "reader-library-load", latestWins: true },
      },
    );
  });

  it("delegates batched reads and preserves the SDK outcome and options", async () => {
    const outcome = success({
      results: [{ status: "missing" as const, path: "missing.md" }],
      errors: [],
    });
    const readMany = vi.fn(() => Promise.resolve(outcome));
    const client = connectClient({ readMany } as unknown as MdbaseConnection);
    const paths = ["missing.md"];
    const options = {
      includeBody: true,
      frontmatterMode: "both" as const,
      types: ["reader-annotation"],
      batchSize: 100,
      concurrency: 4,
      signal: new AbortController().signal,
    };

    await expect(client.readMany(paths, options)).resolves.toBe(outcome);
    expect(readMany).toHaveBeenCalledExactlyOnceWith(paths, options);
  });

  it("does not put mutations behind a Reader-owned read queue", async () => {
    const query = vi.fn(() => new Promise<ConnectOutcome<QueryResult>>(() => undefined));
    const create = vi.fn(() => Promise.resolve(success({ path: "new.md" })));
    const client = connectClient({ query, create } as unknown as MdbaseConnection);

    void client.query({ where: "one" });
    void client.query({ where: "two" });
    await client.create({ path: "new.md" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("Reader cursor lifetimes", () => {
  it("uses SDK cursor iteration and releases it on an early record match", async () => {
    let iteratorClosed = false;
    const queryPages = vi.fn(() => pages());
    const client = {
      supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
      queryPages,
    } as unknown as ReturnType<typeof connectClient>;

    async function* pages(): AsyncGenerator<ConnectOutcome<QueryPage>> {
      try {
        yield await Promise.resolve(
          success({
            results: [
              {
                path: "sources/match.md",
                effectiveFrontmatter: { id: "match" },
                types: [],
                file: {},
              },
            ],
            page: 0,
            offset: 0,
            loaded: 1,
            complete: false,
            cursor: "next",
          }),
        );
        yield await Promise.resolve(
          success({ results: [], page: 1, offset: 1, loaded: 1, complete: true }),
        );
      } finally {
        iteratorClosed = true;
      }
    }

    await expect(recordPathById(client, "match")).resolves.toBe("sources/match.md");
    expect(iteratorClosed).toBe(true);
    expect(queryPages).toHaveBeenCalledWith(
      { where: 'id == "match"', frontmatterMode: "effective" },
      { firstPageSize: 50, pageSize: 50 },
    );
  });
});

describe("Reader record lookup by ID", () => {
  it("verifies the exact ID even if the authority returns additional candidates", async () => {
    const results = ["first", "match", "after"].map((id) => ({
      path: `sources/${id}.md`,
      effectiveFrontmatter: { id },
      types: [],
      file: {},
    }));
    const client = {
      supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
      queryPages: vi.fn(async function* () {
        yield await Promise.resolve(
          success({ results, page: 0, offset: 0, loaded: 3, complete: true }),
        );
      }),
    } as unknown as Parameters<typeof recordPathById>[0];
    await expect(recordPathById(client, "match")).resolves.toBe("sources/match.md");
  });
});

async function* emptyPages(): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success({ results: [], page: 0, offset: 0, loaded: 0, complete: true }),
  );
}

describe("bounded repository materialization", () => {
  it("bounds concurrent work and retains input order", async () => {
    let active = 0;
    let maximum = 0;
    const values = Array.from({ length: 12 }, (_value, index) => index);

    const results = await mapConcurrent(values, 4, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(maximum).toBe(4);
    expect(results).toEqual(values.map((value) => value * 2));
  });
});

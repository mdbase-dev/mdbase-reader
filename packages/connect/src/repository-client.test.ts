import { describe, expect, it, vi } from "vitest";

import { mapConcurrent, recordPathById } from "./repository-client.js";

import type { ConnectOutcome, QueryPage } from "./connect-types.js";
import type { ReaderConnectClient } from "./repository-client.js";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value };
}

describe("Reader cursor lifetimes", () => {
  it("uses SDK cursor iteration and releases it on an early record match", async () => {
    let iteratorClosed = false;
    const queryPages = vi.fn(() => pages());
    const client = {
      supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
      queryPages,
    } as unknown as ReaderConnectClient;

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

import { describe, expect, it, vi } from "vitest";

import { mockSdk, testQuery, testRecord } from "./records.fixtures.js";
import { mapConcurrent, recordPathById } from "./repository-client.js";

import type { QueryResult } from "@mdbase-dev/sdk";

function success<Value>(value: Value): Value {
  return value;
}

describe("Reader cursor lifetimes", () => {
  it("uses SDK cursor iteration and releases it on an early record match", async () => {
    let iteratorClosed = false;
    const pages = vi.fn(() => pageStream());
    const client = mockSdk({
      supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
      pages,
    });

    async function* pageStream(): AsyncGenerator<QueryResult> {
      try {
        yield await Promise.resolve(
          success(
            testQuery({
              records: [
                testRecord({
                  path: "sources/match.md",
                  effective: { id: "match" },
                  types: [],
                }),
              ],

              complete: true,
              cursor: "next",
            }),
          ),
        );
        yield await Promise.resolve(success(testQuery({ records: [], complete: true })));
      } finally {
        iteratorClosed = true;
      }
    }

    await expect(recordPathById(client, "match")).resolves.toBe("sources/match.md");
    expect(iteratorClosed).toBe(true);
    expect(pages).toHaveBeenCalledWith(
      expect.objectContaining({ where: 'id == "match"' }),
      expect.objectContaining({}),
    );
  });
});

describe("Reader record lookup by ID", () => {
  it("verifies the exact ID even if the authority returns additional candidates", async () => {
    const records = ["first", "match", "after"].map((id) =>
      testRecord({
        path: `sources/${id}.md`,
        effective: { id },
        types: [],
      }),
    );
    const client = {
      supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
      pages: vi.fn(async function* () {
        yield await Promise.resolve(success(testQuery({ records, complete: true })));
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

    const records = await mapConcurrent(values, 4, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(maximum).toBe(4);
    expect(records).toEqual(values.map((value) => value * 2));
  });
});

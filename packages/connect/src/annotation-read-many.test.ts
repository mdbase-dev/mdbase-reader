import {
  MdbaseCollectionClient,
  connectFailure,
  connectProblem,
} from "@mdbase-dev/connect/advanced";
import { describe, expect, it, vi } from "vitest";

import { annotationRecordsAt } from "./annotation-query.js";
import { ConnectRepositoryError } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryRecord } from "@mdbase-dev/connect";

const record = (path: string): QueryRecord => ({
  path,
  types: ["reader-annotation"],
  frontmatter: { id: path, source: "src_1" },
  effectiveFrontmatter: { id: path, source: "src_1" },
  body: "Note",
  file: { path },
});

describe("annotation bodies through SDK readMany", () => {
  it("uses SDK bounded, escaped queries without fabricating revisions or point reads", async () => {
    const paths = Array.from({ length: 205 }, (_, index) => `annotations/${String(index)}.md`);
    paths[0] = 'annotations/A "quoted" \\ 雪.md';
    const requests: Record<string, unknown>[] = [];
    const sdk = new MdbaseCollectionClient({
      async operation<Result>(operation: string, input: unknown): Promise<Result> {
        expect(operation).toBe("query");
        const query = input as Record<string, unknown>;
        requests.push(query);
        const selected = JSON.parse(
          String(query["where"]).slice("file.path in ".length),
        ) as string[];
        return await Promise.resolve({
          valid: true,
          diagnostics: [],
          result: {
            results: selected
              .filter((path) => path !== paths[1])
              .reverse()
              .map((path) => {
                const row = record(path);
                return { ...row, effective_frontmatter: row.effectiveFrontmatter };
              }),
            meta: { has_more: false },
          },
        } as Result);
      },
    });
    const readMany = vi.fn(sdk.readMany.bind(sdk));
    const signal = new AbortController().signal;
    const listed = await annotationRecordsAt(
      { readMany } as unknown as ReaderConnectClient,
      [...paths, paths[0]],
      { signal, replaceableFamily: "annotation-load" },
    );

    expect(readMany).toHaveBeenCalledExactlyOnceWith([...paths, paths[0]], {
      types: ["reader-annotation"],
      frontmatterMode: "both",
      includeBody: true,
      signal,
    });
    expect(requests.map((query) => query["limit"])).toEqual([100, 100, 5]);
    expect(requests[0]).toMatchObject({
      types: ["reader-annotation"],
      frontmatter_mode: "both",
      include_body: true,
    });
    expect([...listed.keys()]).toEqual(paths.filter((path) => path !== paths[1]));
    expect(listed.get(paths[0])).toMatchObject({ body: "Note", frontmatter: { source: "src_1" } });
    expect(listed.get(paths[0])).not.toHaveProperty("revision");
  });

  it("does no transport work for an empty path selection", async () => {
    const operation = vi.fn();
    const sdk = new MdbaseCollectionClient({ operation });
    const client = { readMany: sdk.readMany.bind(sdk) } as unknown as ReaderConnectClient;
    expect(await annotationRecordsAt(client, [], {})).toEqual(new Map());
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects a partially failed result rather than treating batch errors as missing", async () => {
    const failure = connectFailure<"timeout">(connectProblem("timeout", "Batch timed out"));
    const readMany = vi.fn<ReaderConnectClient["readMany"]>(() =>
      Promise.resolve({
        ok: true,
        value: {
          results: [
            { status: "found", path: "a.md", record: record("a.md") },
            { status: "error", path: "b.md", batch: 1 },
          ],
          errors: [{ batch: 1, paths: ["b.md"], failure }],
        },
        diagnostics: [],
      }),
    );
    await expect(
      annotationRecordsAt({ readMany } as unknown as ReaderConnectClient, ["a.md", "b.md"], {}),
    ).rejects.toMatchObject({ name: "ConnectRepositoryError", problem: failure.problem });
  });

  it("preserves the original typed outer failure for cancellation and recovery decisions", async () => {
    const failure = connectFailure<"operation_cancelled">(
      connectProblem("operation_cancelled", "Cancelled"),
    );
    const readMany = vi.fn<ReaderConnectClient["readMany"]>(() => Promise.resolve(failure));
    try {
      await annotationRecordsAt({ readMany } as unknown as ReaderConnectClient, ["a.md"], {});
      expect.fail("Expected the cancelled batch to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectRepositoryError);
      expect((error as ConnectRepositoryError).problem).toBe(failure.problem);
    }
  });
});

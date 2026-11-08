import { describe, expect, it, vi } from "vitest";

import { annotationRecordsAt } from "./annotation-query.js";
import { connectFailure, connectProblem, connectSuccess } from "./connect-types.js";
import { ConnectRepositoryError } from "./repository-client.js";

import type { QueryRecord } from "./connect-types.js";
import type { ReaderConnectClient } from "./repository-client.js";

const record = (path: string): QueryRecord => ({
  path,
  types: ["reader-annotation"],
  frontmatter: { id: path, source: "src_1" },
  effectiveFrontmatter: { id: path, source: "src_1" },
  body: "Note",
  file: { path },
});

describe("annotation bodies through SDK readMany", () => {
  it("reads annotation bodies by path and keeps only the records found", async () => {
    const quoted = 'annotations/A "quoted" \\ 雪.md';
    const paths = [quoted, "annotations/missing.md", "annotations/b.md"];
    const readMany = vi.fn<ReaderConnectClient["readMany"]>((requested) =>
      Promise.resolve(
        connectSuccess({
          results: requested.map((path) =>
            path === "annotations/missing.md"
              ? { status: "missing" as const, path }
              : { status: "found" as const, path, record: record(path) },
          ),
        }),
      ),
    );
    const signal = new AbortController().signal;
    const listed = await annotationRecordsAt(
      { readMany } as unknown as ReaderConnectClient,
      [...paths, quoted],
      { signal, replaceableFamily: "annotation-load" },
    );

    expect(readMany).toHaveBeenCalledExactlyOnceWith([...paths, quoted], {
      types: ["reader-annotation"],
      includeBody: true,
      signal,
    });
    expect([...listed.keys()]).toEqual([quoted, "annotations/b.md"]);
    expect(listed.get(quoted)).toMatchObject({ body: "Note", frontmatter: { source: "src_1" } });
    expect(listed.get(quoted)).not.toHaveProperty("revision");
  });

  it("preserves the original typed outer failure for cancellation and recovery decisions", async () => {
    const failure = connectFailure(connectProblem("operation_cancelled", "Cancelled"));
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

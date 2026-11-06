import { connectProblem } from "@mdbase-dev/connect/advanced";
import { MdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { withResolvedSource } from "./annotation-source.js";
import { connectProblemFor } from "./native/native-mapping.js";
import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryInput, QueryPage, RecordDocument } from "@mdbase-dev/connect";

function fixture(count: number): {
  documents: RecordDocument[];
  queryPages: Mock<(input: QueryInput) => AsyncGenerator<ConnectOutcome<QueryPage>>>;
  client: ReaderConnectClient;
  failure: () => ConnectOutcome<QueryPage>;
} {
  const documents = Array.from({ length: count }, (_, index): RecordDocument => {
    const fields = {
      id: `annotation-${String(index)}`,
      source: "[[sources/book.md]]",
      annotation_type: "note",
      created_at: "2026-11-06T00:00:00Z",
    };
    return {
      path: `annotations/${String(index)}.md`,
      revision: "r1",
      file: {},
      types: ["reader-annotation"],
      frontmatter: fields,
      effectiveFrontmatter: fields,
      body: "x".repeat(2048),
    };
  });
  const success = <Value>(value: Value): ConnectOutcome<Value> => ({
    ok: true,
    value,
    diagnostics: [],
  });
  const failure = (): ConnectOutcome<QueryPage> =>
    ({
      ok: false,
      diagnostics: [],
      problem: {
        ...connectProblem(
          "operation_failed",
          "ordinary selection exceeds its bounded source or retained-value query budget",
        ),
        native: { code: "too_large", reason: "query_budget_exceeded" },
      },
    }) as ConnectOutcome<QueryPage>;
  const queryPages = vi.fn(async function* (
    input: QueryInput,
  ): AsyncGenerator<ConnectOutcome<QueryPage>> {
    const scoped = input.where
      ? documents.filter((record) => input.where === `file.path == ${JSON.stringify(record.path)}`)
      : documents;
    if (
      (input.select || input.projections) &&
      (scoped.length + 1 > 1000 ||
        scoped.reduce((size, record) => size + record.body!.length, 2048) > 1048576)
    ) {
      yield await Promise.resolve(failure());
      return;
    }
    for (let offset = 0; offset < scoped.length; offset += 500) {
      yield await Promise.resolve(
        success({
          results: scoped.slice(offset, offset + 500).map((record) => ({
            ...record,
            values: { ...record.effectiveFrontmatter, reader_source_id: "book" },
          })),
          complete: offset + 500 >= scoped.length,
          page: offset / 500,
          offset,
          loaded: Math.min(offset + 500, scoped.length),
        }),
      );
    }
  });
  const client = {
    supportsAuthorityFeature: () => Promise.resolve(success(true)),
    queryPages,
    readMany: (paths: readonly string[]) =>
      Promise.resolve(
        success({
          results: paths.map((path) => ({
            status: "found",
            path,
            record: documents.find((record) => record.path === path)!,
          })),
          errors: [],
        }),
      ),
  } as unknown as ReaderConnectClient;
  return { documents, queryPages, client, failure };
}

describe("annotation request-wide projection budget", () => {
  it.each([600, 1501])(
    "lists all %i large annotations without an unbounded selection or link projection",
    async (count) => {
      const { client, queryPages, documents } = fixture(count);
      const oldQuery = withResolvedSource({
        types: ["reader-annotation"],
        select: ["id", "source"],
      });
      for await (const outcome of client.queryPages(oldQuery, { pageSize: 500 })) {
        expect(() => outcomeValue(outcome, "query annotations")).toThrow("Open one source’s Notes");
      }
      queryPages.mockClear();
      const repository = new ConnectAnnotationRepository(client);
      const listed = await repository.listAll(collectionId("reading"));
      expect(listed).toHaveLength(count);
      expect(listed.at(-1)?.path).toBe(documents.at(-1)?.path);
      expect(listed.every((annotation) => annotation.sourceId === "book")).toBe(true);
      expect(
        await repository.listForSource(collectionId("reading"), sourceId("book")),
      ).toHaveLength(count);
      expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
        new Map([[sourceId("book"), count]]),
      );
      for (const [input] of queryPages.mock.calls) {
        if (input.select || input.projections) {
          expect(input.where).toMatch(/^file\.path == ".+"$/u);
        } else {
          expect(input).not.toHaveProperty("output", "metadata");
        }
      }
    },
  );

  it("reports an oversized individual query with a next step, not a partial success or engine text", async () => {
    const { client, queryPages, failure } = fixture(2);
    queryPages.mockImplementation(async function* () {
      yield await Promise.resolve(failure());
    });
    await expect(
      new ConnectAnnotationRepository(client).listAll(collectionId("reading")),
    ).rejects.toThrow("If it still fails, contact support");
    try {
      await new ConnectAnnotationRepository(client).listAll(collectionId("reading"));
    } catch (error) {
      expect((error as Error).message).not.toContain("ordinary selection");
    }
  });

  it("maps the actual native budget reason through the adapter without leaking the engine detail", () => {
    const problem = connectProblemFor(
      new MdbaseError({
        code: "too_large",
        reason: "query_budget_exceeded",
        recovery: "fix_request",
        message: "ordinary selection exceeds its bounded source or retained-value query budget",
      }),
    );
    expect(() => outcomeValue({ ok: false, problem }, "query annotations")).toThrow(
      "Open one source’s Notes",
    );
  });
});

import { connectProblem } from "@mdbase-dev/connect/advanced";
import { MdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";
import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { annotationSourcePages } from "./annotation-source-pages.js";
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
  // Index the fixture's exact path predicates once. Repeated linear scans and
  // JSON serialization made the 1501-record assertion time out on hosted CI;
  // the response documents, request budget and all assertions remain unchanged.
  const byPath = new Map(documents.map((record) => [record.path, record]));
  const byPredicate = new Map(
    documents.map((record) => [`file.path == ${JSON.stringify(record.path)}`, [record]]),
  );
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
    const sourceDocument: RecordDocument = {
      path: "sources/book.md",
      revision: "r1",
      file: {},
      types: ["reader-source"],
      frontmatter: { id: "book" },
      effectiveFrontmatter: { id: "book" },
    };
    const sourceFilter = input.where?.includes(".asFile()");
    const linked = input.where?.includes('record["source"].asFile().file.path');
    const scoped =
      input.where === 'id == "book"'
        ? [sourceDocument]
        : sourceFilter
          ? documents.filter(
              (record) => linked && record.effectiveFrontmatter["source"] === "[[sources/book.md]]",
            )
          : input.where
            ? (byPredicate.get(input.where) ?? [])
            : documents;
    const budgeted = sourceFilter ? documents : scoped;
    if (
      (sourceFilter || input.select || input.projections) &&
      (budgeted.length + 1 > 1000 ||
        budgeted.reduce((size, record) => size + (record.body?.length ?? 0), 2048) > 1048576)
    ) {
      yield await Promise.resolve(failure());
      return;
    }
    for (let offset = 0; offset < scoped.length; offset += 500) {
      yield await Promise.resolve(
        success({
          results: scoped.slice(offset, offset + 500).map((record) => ({
            ...record,
            values: {
              ...record.effectiveFrontmatter,
              reader_source_id:
                record.effectiveFrontmatter["source"] === "[[sources/book.md]]" ? "book" : "other",
            },
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
            record: byPath.get(path)!,
          })),
          errors: [],
        }),
      ),
  } as unknown as ReaderConnectClient;
  return { documents, queryPages, client, failure };
}

describe("annotation request-wide projection budget", () => {
  it("resolves a 233-annotation collection in one bulk query before hydrating", async () => {
    const { client, queryPages } = fixture(233);
    const repository = new ConnectAnnotationRepository(client);
    expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
      new Map([[sourceId("book"), 233]]),
    );
    expect(queryPages).toHaveBeenCalledOnce();
    expect(queryPages.mock.calls[0]?.[0]).toMatchObject(
      withResolvedSource({ types: ["reader-annotation"], select: ["id", "source"] }),
    );
    queryPages.mockClear();
    expect(await repository.listAll(collectionId("reading"))).toHaveLength(233);
    expect(queryPages).toHaveBeenCalledOnce();
  });
  it.each([600, 1501])(
    "lists all %i large annotations without an unbounded selection or link projection",
    async (count) => {
      const { client, queryPages, documents } = fixture(count);
      const oldQuery = withResolvedSource({
        types: ["reader-annotation"],
        select: ["id", "source"],
      });
      for await (const outcome of client.queryPages(oldQuery, { pageSize: 500 })) {
        expect(() => outcomeValue(outcome, "query annotations")).toThrow("Try again");
      }
      queryPages.mockClear();
      const repository = new ConnectAnnotationRepository(client);
      const listed = await repository.listAll(collectionId("reading"));
      expect(listed).toHaveLength(count);
      expect(listed.at(-1)?.path).toBe(documents.at(-1)?.path);
      expect(listed.every((annotation) => annotation.sourceId === "book")).toBe(true);
      expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
        new Map([[sourceId("book"), count]]),
      );
      expect(queryPages.mock.calls[0]?.[0]).toHaveProperty("projections");
      expect(queryPages.mock.calls[0]?.[0]).not.toHaveProperty("where");
      for (const [input] of queryPages.mock.calls.slice(1, count + 2)) {
        if (input.select || input.projections) {
          expect(input.where).toMatch(/^file\.path == ".+"$/u);
        } else {
          expect(input).not.toHaveProperty("output", "metadata");
        }
      }
    },
  );
});

describe("single-source annotation query compatibility", () => {
  it("does not restart discovery after publishing a projected page", async () => {
    const { client, queryPages, documents, failure } = fixture(2);
    queryPages.mockImplementation(async function* () {
      yield await Promise.resolve({
        ok: true as const,
        diagnostics: [],
        value: {
          results: [{ ...documents[0]!, values: { reader_source_id: "book" } }],
          complete: false,
          page: 0,
          offset: 0,
          loaded: 1,
        },
      });
      yield await Promise.resolve(failure());
    });
    const pages = annotationSourcePages(client, {});
    expect((await pages.next()).value).toHaveLength(1);
    await expect(pages.next()).rejects.toMatchObject({ code: "query_budget_exceeded" });
    expect(queryPages).toHaveBeenCalledOnce();
  });

  it.each([1, 100, 400])(
    "uses three queries and no per-annotation resolutions for %i under-budget rows",
    async (count) => {
      const { client, queryPages } = fixture(count);
      expect(await annotationPathsForSource(client, sourceId("book"), {})).toHaveLength(count);
      expect(queryPages).toHaveBeenCalledTimes(3);
      expect(
        queryPages.mock.calls.some(([input]) => input.projections !== undefined || !input.where),
      ).toBe(false);
    },
  );

  it.each([600, 1501])(
    "falls back only after a coded budget refusal for %i rows and returns the relevant rows",
    async (count) => {
      const { client, queryPages, documents } = fixture(count);
      for (const document of documents.slice(1)) {
        document.effectiveFrontmatter["source"] = "[[sources/other.md]]";
      }
      const listed = await new ConnectAnnotationRepository(client).listForSource(
        collectionId("reading"),
        sourceId("book"),
      );
      expect(listed.map((annotation) => annotation.path)).toEqual(["annotations/0.md"]);
      expect(queryPages).toHaveBeenCalledTimes(count + 5);
      expect(queryPages.mock.calls.slice(0, 3).map(([input]) => input.where)).toEqual([
        'id == "book"',
        expect.stringContaining('record["source"].asFile()'),
        expect.stringContaining("source.asFile() == null"),
      ]);
      expect(queryPages.mock.calls[3]?.[0]).not.toHaveProperty("where");
      expect(queryPages.mock.calls.filter(([input]) => input.projections)).toHaveLength(count + 1);
    },
  );

  it("isolates an under-budget source from unrelated resolution failures without hiding whole-collection failures", async () => {
    const { client, queryPages, documents, failure } = fixture(100);
    for (const document of documents.slice(1)) {
      document.effectiveFrontmatter["source"] = "[[sources/other.md]]";
    }
    const query = queryPages.getMockImplementation()!;
    queryPages.mockImplementation(async function* (input) {
      if (
        input.projections &&
        (!input.where || input.where === 'file.path == "annotations/1.md"')
      ) {
        yield await Promise.resolve(failure());
        return;
      }
      yield* query(input);
    });
    const repository = new ConnectAnnotationRepository(client);
    expect(
      (await repository.listForSource(collectionId("reading"), sourceId("book"))).map(
        (annotation) => annotation.path,
      ),
    ).toEqual(["annotations/0.md"]);
    expect(queryPages).toHaveBeenCalledTimes(3);
    await expect(repository.listAll(collectionId("reading"))).rejects.toMatchObject({
      code: "query_budget_exceeded",
    });
  });

  it("does not fall back for another error even if its message mentions the budget code", async () => {
    const { client, queryPages } = fixture(2);
    queryPages.mockImplementation(async function* () {
      yield await Promise.resolve({
        ok: false as const,
        diagnostics: [],
        problem: connectProblem("timeout", "query_budget_exceeded"),
      });
    });
    await expect(annotationPathsForSource(client, sourceId("book"), {})).rejects.toMatchObject({
      code: "timeout",
    });
    expect(queryPages).toHaveBeenCalledOnce();
  });

  it("keeps a failed single-source fallback explicit with advice that applies inside source Notes", async () => {
    const { client, queryPages, failure } = fixture(1501);
    const query = queryPages.getMockImplementation()!;
    queryPages.mockImplementation(async function* (input) {
      if (input.projections && input.where === 'file.path == "annotations/1.md"') {
        yield await Promise.resolve(failure());
        return;
      }
      yield* query(input);
    });
    await expect(annotationPathsForSource(client, sourceId("book"), {})).rejects.toMatchObject({
      code: "query_budget_exceeded",
      message: "This annotation query is too large. Try again. If it still fails, contact support.",
    });
  });
});

describe("annotation query budget advice", () => {
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
    expect(() => outcomeValue({ ok: false, problem }, "query annotations")).toThrow("Try again");
  });
});

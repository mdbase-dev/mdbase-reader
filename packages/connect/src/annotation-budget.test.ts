import { MdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";
import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { annotationSourcePages } from "./annotation-source-pages.js";
import { withResolvedSource } from "./annotation-source.js";
import { mockSdk, testRecord, testQuery } from "./records.fixtures.js";

import type { RecordRef, MdbaseClient, Query, QueryResult, RecordView } from "@mdbase-dev/sdk";

function fixture(count: number): {
  documents: RecordView[];
  pages: Mock<(input: Query) => AsyncGenerator<QueryResult>>;
  client: MdbaseClient;
  failure: () => QueryResult;
} {
  const documents = Array.from({ length: count }, (_, index): RecordView => {
    const fields = {
      id: `annotation-${String(index)}`,
      source: "[[sources/book.md]]",
      annotation_type: "note",
      created_at: "2026-11-06T00:00:00Z",
    };
    return testRecord({
      path: `annotations/${String(index)}.md`,
      revision: "r1",

      types: ["reader-annotation"],
      frontmatter: fields,
      effective: fields,
      body: "x".repeat(2048),
    });
  });
  // Index the fixture's exact path predicates once. Repeated linear scans and
  // JSON serialization made the 1501-record assertion time out on hosted CI;
  // the response documents, request budget and all assertions remain unchanged.
  const byPath = new Map(documents.map((record) => [record.path, record]));
  const byPredicate = new Map(
    documents.map((record) => [`file.path == ${JSON.stringify(record.path)}`, [record]]),
  );
  const success = <Value>(value: Value): Value => value;
  const failure = (): never => {
    throw new MdbaseError({
      code: "too_large",
      reason: "query_budget_exceeded",
      recovery: "fix_request",
      message: "ordinary selection exceeds its bounded query budget",
    });
  };
  const pages = vi.fn(async function* (input: Query): AsyncGenerator<QueryResult> {
    const sourceDocument: RecordView = testRecord({
      path: "sources/book.md",
      revision: "r1",

      types: ["reader-source"],
      frontmatter: { id: "book" },
      effective: { id: "book" },
    });
    const sourceFilter = input.where?.includes(".asFile()");
    const linked = input.where?.includes("source.asFile().file.path");
    const scoped =
      input.where === 'id == "book"'
        ? [sourceDocument]
        : sourceFilter
          ? documents.filter(
              (record) =>
                linked &&
                (record.effective ?? record.frontmatter)["source"] === "[[sources/book.md]]",
            )
          : input.where
            ? (byPredicate.get(input.where) ?? [])
            : documents;
    const budgeted = sourceFilter ? documents : scoped;
    if (
      (sourceFilter || input.select || input["projections"]) &&
      (budgeted.length + 1 > 1000 ||
        budgeted.reduce((size, record) => size + (record.body?.length ?? 0), 2048) > 1048576)
    ) {
      yield await Promise.resolve(failure());
      return;
    }
    for (let offset = 0; offset < scoped.length; offset += 500) {
      yield await Promise.resolve(
        success(
          testQuery({
            records: scoped.slice(offset, offset + 500).map((record) => ({
              ...record,
              values: {
                ...record.effective,
                reader_source_id:
                  (record.effective ?? record.frontmatter)["source"] === "[[sources/book.md]]"
                    ? "book"
                    : "other",
              },
            })),
            complete: true,
          }),
        ),
      );
    }
  });
  const client = mockSdk({
    supportsAuthorityFeature: () => Promise.resolve(success(true)),
    pages,
    find: (ref: RecordRef) =>
      Promise.resolve(byPath.get(typeof ref === "string" ? ref : ref.path) ?? null),
  });
  return { documents, pages, client, failure };
}

describe("annotation request-wide projection budget", () => {
  it("resolves a 233-annotation collection in one bulk query before hydrating", async () => {
    const { client, pages } = fixture(233);
    const repository = new ConnectAnnotationRepository(client);
    expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
      new Map([[sourceId("book"), 233]]),
    );
    expect(pages).toHaveBeenCalledOnce();
    expect(pages.mock.calls[0]?.[0]).toMatchObject(
      withResolvedSource({ types: ["reader-annotation"], select: ["id", "source"] }),
    );
    pages.mockClear();
    expect(await repository.listAll(collectionId("reading"))).toHaveLength(233);
    expect(pages).toHaveBeenCalledOnce();
  });
  it.each([600, 1501])(
    "lists all %i large annotations without an unbounded selection or link projection",
    async (count) => {
      const { client, pages, documents } = fixture(count);
      const oldQuery = withResolvedSource({
        types: ["reader-annotation"],
        select: ["id", "source"],
      });
      await expect(
        (async () => {
          for await (const page of client.pages(oldQuery, {})) {
            expect(page.complete).toBe(true);
          }
        })(),
      ).rejects.toMatchObject({ reason: "query_budget_exceeded" });
      pages.mockClear();
      const repository = new ConnectAnnotationRepository(client);
      const listed = await repository.listAll(collectionId("reading"));
      expect(listed).toHaveLength(count);
      expect(listed.at(-1)?.path).toBe(documents.at(-1)?.path);
      expect(listed.every((annotation) => annotation.sourceId === "book")).toBe(true);
      expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
        new Map([[sourceId("book"), count]]),
      );
      expect(pages.mock.calls[0]?.[0]).toHaveProperty("projections");
      expect(pages.mock.calls[0]?.[0]).not.toHaveProperty("where");
      for (const [input] of pages.mock.calls.slice(1, count + 2)) {
        if (input.select || input["projections"]) {
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
    const { client, pages, documents, failure } = fixture(2);
    pages.mockImplementation(async function* () {
      yield await Promise.resolve(
        testQuery({
          records: [{ ...documents[0]!, values: { reader_source_id: "book" } }],
          complete: true,
        }),
      );
      yield await Promise.resolve(failure());
    });
    const stream = annotationSourcePages(client, {});
    expect((await stream.next()).value).toHaveLength(1);
    await expect(stream.next()).rejects.toMatchObject({ reason: "query_budget_exceeded" });
    expect(pages).toHaveBeenCalledOnce();
  });

  it.each([1, 100, 400])(
    "uses three queries and no per-annotation resolutions for %i under-budget rows",
    async (count) => {
      const { client, pages } = fixture(count);
      expect(await annotationPathsForSource(client, sourceId("book"), {})).toHaveLength(count);
      expect(pages).toHaveBeenCalledTimes(3);
      expect(
        pages.mock.calls.some(([input]) => input["projections"] !== undefined || !input.where),
      ).toBe(false);
    },
  );

  it.each([600, 1501])(
    "falls back only after a coded budget refusal for %i rows and returns the relevant rows",
    async (count) => {
      const { client, pages, documents } = fixture(count);
      for (const document of documents.slice(1)) {
        (document.effective ?? document.frontmatter)["source"] = "[[sources/other.md]]";
      }
      const listed = await new ConnectAnnotationRepository(client).listForSource(
        collectionId("reading"),
        sourceId("book"),
      );
      expect(listed.map((annotation) => annotation.path)).toEqual(["annotations/0.md"]);
      expect(pages).toHaveBeenCalledTimes(count + 5);
      expect(pages.mock.calls.slice(0, 3).map(([input]) => input.where)).toEqual([
        'id == "book"',
        expect.stringContaining("source.asFile()"),
        expect.stringContaining("source.asFile() == null"),
      ]);
      expect(pages.mock.calls[3]?.[0]).not.toHaveProperty("where");
      expect(pages.mock.calls.filter(([input]) => input["projections"])).toHaveLength(count + 1);
    },
  );

  it("isolates an under-budget source from unrelated resolution failures without hiding whole-collection failures", async () => {
    const { client, pages, documents, failure } = fixture(100);
    for (const document of documents.slice(1)) {
      (document.effective ?? document.frontmatter)["source"] = "[[sources/other.md]]";
    }
    const query = pages.getMockImplementation()!;
    pages.mockImplementation(async function* (input) {
      if (
        input["projections"] &&
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
    expect(pages).toHaveBeenCalledTimes(3);
    await expect(repository.listAll(collectionId("reading"))).rejects.toMatchObject({
      reason: "query_budget_exceeded",
    });
  });

  it("does not fall back for another error even if its message mentions the budget code", async () => {
    const { client, pages } = fixture(2);
    pages.mockImplementation(async function* () {
      yield await Promise.reject(
        new MdbaseError({
          code: "unavailable",
          recovery: "retry",
          message: "query_budget_exceeded",
        }),
      );
    });
    await expect(annotationPathsForSource(client, sourceId("book"), {})).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(pages).toHaveBeenCalledOnce();
  });

  it("keeps a failed single-source fallback explicit with advice that applies inside source Notes", async () => {
    const { client, pages, failure } = fixture(1501);
    const query = pages.getMockImplementation()!;
    pages.mockImplementation(async function* (input) {
      if (input["projections"] && input.where === 'file.path == "annotations/1.md"') {
        yield await Promise.resolve(failure());
        return;
      }
      yield* query(input);
    });
    await expect(annotationPathsForSource(client, sourceId("book"), {})).rejects.toMatchObject({
      reason: "query_budget_exceeded",
    });
  });
});

describe("native query budget errors", () => {
  it("retains the actual native reason instead of inferring it from message text", async () => {
    const { client, pages, failure } = fixture(2);
    pages.mockImplementation(async function* () {
      yield await Promise.resolve(failure());
    });
    await expect(
      new ConnectAnnotationRepository(client).listAll(collectionId("reading")),
    ).rejects.toMatchObject({ code: "too_large", reason: "query_budget_exceeded" });
  });
});

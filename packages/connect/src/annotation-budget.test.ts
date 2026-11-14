import { MdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { linkIndex, mockSdk, testRecord, testQuery } from "./records.fixtures.js";
import { backlinksTo, resolveLinksFrom } from "./repository-client.js";

import type {
  BacklinksResult,
  RecordRef,
  MdbaseClient,
  Query,
  QueryResult,
  RecordView,
} from "@mdbase-dev/sdk";

const budgetRefusal = (): MdbaseError =>
  new MdbaseError({
    code: "too_large",
    reason: "query_budget_exceeded",
    recovery: "fix_request",
    message: "ordinary selection exceeds its bounded query budget",
  });

/**
 * A collection of `count` annotations of one source, with the runtime's query budget: a query
 * that selects, projects or follows a link refuses once it would touch over 1000 records.
 */
function fixture(count: number): {
  documents: RecordView[];
  pages: Mock<(input: Query) => AsyncGenerator<QueryResult>>;
  links: ReturnType<typeof linkIndex>;
  client: MdbaseClient;
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
  const book = testRecord({
    path: "sources/book.md",
    revision: "r1",
    types: ["reader-source"],
    frontmatter: { id: "book" },
  });
  const byPath = new Map([...documents, book].map((record) => [record.path, record]));
  const pages = vi.fn(async function* (input: Query): AsyncGenerator<QueryResult> {
    const where = input.where ?? "";
    if (
      (input.select || input["projections"] || where.includes("asFile")) &&
      documents.length + 1 > 1000
    ) {
      throw budgetRefusal();
    }
    const contains = /source\.contains\(("[^"]*")\)$/u.exec(where)?.[1];
    const scoped =
      where === 'id == "book"'
        ? [book]
        : contains
          ? documents.filter((record) =>
              (record.frontmatter["source"] as string).includes(JSON.parse(contains) as string),
            )
          : where
            ? byPath.has(where)
              ? [byPath.get(where)!]
              : []
            : documents;
    for (let offset = 0; offset < scoped.length; offset += 500) {
      yield await Promise.resolve(
        testQuery({ records: scoped.slice(offset, offset + 500), complete: true }),
      );
    }
  });
  const links = linkIndex(documents, (link) =>
    link === "[[sources/book.md]]" ? "sources/book.md" : null,
  );
  const client = mockSdk({
    ...links,
    pages,
    find: (ref: RecordRef) =>
      Promise.resolve(byPath.get(typeof ref === "string" ? ref : ref.path) ?? null),
  });
  return { documents, pages, links, client };
}

describe("annotations in collections past the query budget", () => {
  it.each([233, 600, 1501])(
    "lists, counts and opens a source's %i annotations without a budgeted query",
    async (count) => {
      const { client, pages, links, documents } = fixture(count);
      const repository = new ConnectAnnotationRepository(client);

      expect(await repository.annotationCountsBySource(collectionId("reading"))).toEqual(
        new Map([[sourceId("book"), count]]),
      );
      const listed = await repository.listAll(collectionId("reading"));
      expect(listed).toHaveLength(count);
      expect(listed.at(-1)?.path).toBe(documents.at(-1)?.path);
      expect(listed.every((annotation) => annotation.sourceId === "book")).toBe(true);
      const forSource = await repository.listForSource(collectionId("reading"), sourceId("book"));
      expect(forSource).toHaveLength(count);

      for (const [input] of pages.mock.calls) {
        expect(input).not.toHaveProperty("projections");
        expect(input).not.toHaveProperty("select");
        expect(input.where ?? "").not.toContain("asFile");
      }
      // Each page of annotations resolves its links in one request: they share a folder.
      const pageCount = Math.ceil(count / 500);
      expect(links.resolveLinks).toHaveBeenCalledTimes(2 * pageCount);
      expect(links.backlinks).toHaveBeenCalledOnce();
    },
  );

  it("surfaces a refused query with its actual reason", async () => {
    const { client, pages } = fixture(2);
    pages.mockImplementation(async function* () {
      yield await Promise.reject(budgetRefusal());
    });
    await expect(
      new ConnectAnnotationRepository(client).listAll(collectionId("reading")),
    ).rejects.toMatchObject({ code: "too_large", reason: "query_budget_exceeded" });
  });
});

describe("link index paging", () => {
  function page(paths: readonly string[], cursor?: string): BacklinksResult {
    return {
      backlinks: paths.map((path) => ({
        record: testRecord({ path }),
        links: [{ raw: "[[target]]", embed: false, resolution: { kind: "record" }, field: "x" }],
      })),
      ...(cursor ? { cursor } : {}),
      complete: true,
      asOf: 1,
    };
  }

  it("follows every backlinks page", async () => {
    const backlinks = vi
      .fn<MdbaseClient["backlinks"]>()
      .mockResolvedValueOnce(page(["refs/0.md", "refs/1.md"], "next"))
      .mockResolvedValueOnce(page(["refs/2.md"]));

    const found = await backlinksTo(mockSdk({ backlinks }), "target.md");

    expect(found.map(({ record }) => record.path)).toEqual(["refs/0.md", "refs/1.md", "refs/2.md"]);
    expect(backlinks.mock.calls.map(([, options]) => options?.cursor)).toEqual([undefined, "next"]);
  });

  it("restarts from the first page when a local change makes its cursor stale", async () => {
    const backlinks = vi
      .fn<MdbaseClient["backlinks"]>()
      .mockResolvedValueOnce(page(["refs/old.md"], "next"))
      .mockRejectedValueOnce(
        new MdbaseError({
          code: "invalid_request",
          reason: "cursor_stale",
          recovery: "retry",
          message: "The local view changed.",
        }),
      )
      .mockResolvedValueOnce(page(["refs/new.md"]));

    const found = await backlinksTo(mockSdk({ backlinks }), "target.md");

    expect(found.map(({ record }) => record.path)).toEqual(["refs/new.md"]);
    expect(backlinks).toHaveBeenCalledTimes(3);
  });

  it("refuses an answer given while the collection is still installing", async () => {
    const backlinks = vi.fn<MdbaseClient["backlinks"]>().mockResolvedValue({
      ...page([]),
      complete: false,
    });

    await expect(backlinksTo(mockSdk({ backlinks }), "target.md")).rejects.toMatchObject({
      reason: "query_incomplete",
    });
  });

  it("splits a long list of links into the replica's 512-link requests", async () => {
    const { client, links } = fixture(0);
    const many = Array.from({ length: 600 }, (_, index) =>
      index === 599 ? "[[missing]]" : "[[sources/book.md]]",
    );

    const resolved = await resolveLinksFrom(client, "annotations/0.md", many);

    expect(vi.mocked(links.resolveLinks).mock.calls.map(([, batch]) => batch.length)).toEqual([
      512, 88,
    ]);
    expect(resolved).toHaveLength(600);
    expect(resolved[0]).toEqual({ kind: "record", path: "sources/book.md" });
    expect(resolved[599]).toEqual({ kind: "not_found" });
  });
});

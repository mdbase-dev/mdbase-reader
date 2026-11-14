import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { linkIndex, mockSdk, testRecord, testQuery } from "./records.fixtures.js";

import type {
  MdbaseClient,
  Query,
  QueryResult,
  RecordView,
  JsonObject,
  RecordReadOptions,
} from "@mdbase-dev/sdk";

interface StoredAnnotation {
  frontmatter: JsonObject;
  body: string;
  version: number;
}

const collection = collectionId("reading");

function success<Value>(value: Value): Value {
  return value;
}

function stored(id: string, source: string, body = `Note ${id}`): StoredAnnotation {
  return {
    frontmatter: { id, source, annotation_type: "note", created_at: "2026-08-09T00:00:00.000Z" },
    body,
    version: 1,
  };
}

const storedContent = (path: string, record: StoredAnnotation): RecordView =>
  testRecord({
    path,
    types: ["reader-annotation"],
    frontmatter: structuredClone(record.frontmatter),
    effective: structuredClone(record.frontmatter),
    body: record.body,
  });

const storedDocument = (path: string, record: StoredAnnotation): RecordView => ({
  ...storedContent(path, record),
  revision: `rev-${path}-${String(record.version)}`,
});

/**
 * Stands in for mdbase: `links` is how the collection resolves each source reference (absent or
 * null when it reaches no record). Records are served whole and current, as the replica serves
 * them; a query that follows a link fails the test.
 */
function authority(
  annotations: Map<string, StoredAnnotation>,
  links: Readonly<Record<string, string | null>>,
  onQuery: (input: Query) => void = () => undefined,
): {
  pages: Mock<(input: Query, options?: RecordReadOptions) => AsyncGenerator<QueryResult>>;
  read: Mock<(input: { path: string }) => Promise<RecordView>>;
  backlinks: Mock<MdbaseClient["backlinks"]>;
  client: MdbaseClient;
} {
  const current = (): RecordView[] =>
    [...annotations].map(([path, record]) => storedDocument(path, record));
  const pages = vi.fn(async function* (
    input: Query,
    _options?: RecordReadOptions,
  ): AsyncGenerator<QueryResult> {
    onQuery(input);
    _options?.signal?.throwIfAborted();
    const where = input.where ?? "";
    const quoted = (pattern: RegExp): string | undefined => {
      const value = pattern.exec(where)?.[1];
      return value === undefined ? undefined : (JSON.parse(value) as string);
    };
    const id = quoted(/^id == ("[^"]*")$/u);
    const contained = quoted(
      /^has\(record\.source\) && source != null && source\.contains\(("[^"]*")\)$/u,
    );
    if (input["projections"] || where.includes("asFile")) {
      throw new Error(`Unexpected link-following query: ${JSON.stringify(input)}`);
    }
    const records: RecordView[] =
      id !== undefined
        ? [testRecord({ path: "sources/one.md", effective: { id }, types: [] })]
        : contained !== undefined
          ? current().filter((record) =>
              (record.frontmatter["source"] as string).includes(contained),
            )
          : [];
    yield await Promise.resolve(success(testQuery({ records, complete: true })));
  });
  const read = vi.fn((input: { path: string }) => {
    const record = annotations.get(input.path);
    if (!record) {
      throw new Error(`Unexpected read of ${input.path}`);
    }
    return Promise.resolve(success(storedDocument(input.path, record)));
  });
  const index = linkIndex(current, (link) => links[link] ?? null);
  const backlinks = vi.mocked(index.backlinks);
  return { pages, read, backlinks, client: mockSdk({ ...index, pages, get: read }) };
}

describe("Connect annotations for one source", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads complete revision-bearing SDK views on each load", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const annotations = new Map(
      Array.from({ length: 20 }, (_value, index) => [
        `annotations/ann_${String(index)}.md`,
        stored(`ann_${String(index)}`, "[[sources/one]]"),
      ]),
    );
    const { client, read, pages, backlinks } = authority(annotations, {
      "[[sources/one]]": "sources/one.md",
    });
    const repository = new ConnectAnnotationRepository(client);

    const first = await repository.listForSource(collection, sourceId("src_1"));
    expect(first).toHaveLength(20);

    vi.setSystemTime(Date.now() + 10 * 60_000);
    pages.mockClear();
    backlinks.mockClear();
    const second = await repository.listForSource(collection, sourceId("src_1"));
    // The link index returns each annotation whole: no read per record.
    expect(read).not.toHaveBeenCalled();
    expect(backlinks).toHaveBeenCalledOnce();
    expect(backlinks).toHaveBeenCalledWith(
      { path: "sources/one.md" },
      expect.objectContaining({ include: { effective: true, body: true, document: true } }),
    );
    // The source lookup and the legacy bare-ID query.
    expect(pages).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(second[0]?.recordRevision).toBe("rev-annotations/ann_0.md-1");
  });

  it("observes a newer revision written by another device", async () => {
    const annotations = new Map([
      ["annotations/a.md", stored("ann_a", "[[sources/one]]")],
      ["annotations/b.md", stored("ann_b", "[[sources/one]]")],
    ]);
    const { client } = authority(annotations, { "[[sources/one]]": "sources/one.md" });
    const repository = new ConnectAnnotationRepository(client);
    await repository.listForSource(collection, sourceId("src_1"));

    // An external edit within the cache window must still be seen, with its new revision.
    annotations.set("annotations/b.md", {
      ...stored("ann_b", "[[sources/one]]", "Edited"),
      version: 2,
    });
    const listed = await repository.listForSource(collection, sourceId("src_1"));

    expect(listed.map(({ body, recordRevision }) => [body, recordRevision])).toEqual([
      ["Note ann_a", "rev-annotations/a.md-1"],
      ["Edited", "rev-annotations/b.md-2"],
    ]);
  });
});

describe("Connect annotation batch failure and legacy references", () => {
  it("keeps a failed link-index read explicit instead of omitting its records", async () => {
    const annotations = new Map([["annotations/a.md", stored("ann_a", "[[sources/one]]")]]);
    const { client, backlinks } = authority(annotations, { "[[sources/one]]": "sources/one.md" });
    const failure = mdbaseError("unavailable", "Read failed");
    backlinks.mockRejectedValueOnce(failure);
    await expect(
      new ConnectAnnotationRepository(client).listForSource(collection, sourceId("src_1")),
    ).rejects.toBe(failure);
  });

  it("keeps legacy bare-ID references only when they name exactly this source", async () => {
    const annotations = new Map([
      ["annotations/linked.md", stored("ann_linked", "[[sources/one|One]]")],
      ["annotations/bare.md", stored("ann_bare", "src_1")],
      ["annotations/aliased.md", stored("ann_aliased", "[[src_1|Title]]")],
      ["annotations/prefix.md", stored("ann_prefix", "src_10")],
      ["annotations/prefix-link.md", stored("ann_prefix_link", "[[src_10]]")],
      ["annotations/elsewhere.md", stored("ann_elsewhere", "[[sources/unrelated|src_1]]")],
    ]);
    const { client } = authority(annotations, {
      "[[sources/one|One]]": "sources/one.md",
      "[[sources/unrelated|src_1]]": "sources/unrelated.md",
    });
    const repository = new ConnectAnnotationRepository(client);

    const listed = await repository.listForSource(collection, sourceId("src_1"));

    expect(new Set(listed.map(({ id }) => id))).toEqual(
      new Set(["ann_linked", "ann_bare", "ann_aliased"]),
    );
  });

  it("stops before mapping when aborted while the source query runs", async () => {
    const controller = new AbortController();
    const annotations = new Map([["annotations/a.md", stored("ann_a", "src_1")]]);
    const { client, read } = authority(annotations, {}, (input) => {
      if (input.where?.includes("source.contains")) {
        controller.abort();
      }
    });
    const repository = new ConnectAnnotationRepository(client);

    await expect(
      repository.listForSource(collection, sourceId("src_1"), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });
});

import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testRecord, testQuery } from "./records.fixtures.js";

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

function authority(
  annotations: Map<string, StoredAnnotation>,
  links: Readonly<Record<string, string | null>>,
  onQuery: (input: Query) => void = () => undefined,
): {
  pages: Mock<(input: Query, options?: RecordReadOptions) => AsyncGenerator<QueryResult>>;
  read: Mock<(input: { path: string }) => Promise<RecordView>>;
  client: MdbaseClient;
} {
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
    const target = quoted(/source\.asFile\(\)\.file\.path == ("(?:[^"\\]|\\.)*")$/u);
    const contained = quoted(/source\.contains\(("[^"]*")\)$/u);
    const exactPath = quoted(/^file\.path == ("[^"]*")$/u);
    const records: RecordView[] =
      id !== undefined
        ? [testRecord({ path: "sources/one.md", effective: { id }, types: [] })]
        : [...annotations]
            .filter(([path, record]) => {
              const reference = record.frontmatter["source"] as string;
              const link = links[reference] ?? null;
              return exactPath !== undefined
                ? path === exactPath
                : !where
                  ? true
                  : target !== undefined
                    ? link === target
                    : link === null && contained !== undefined && reference.includes(contained);
            })
            .map(([path, record]) =>
              testRecord({
                path,
                types: ["reader-annotation"],

                ...{ frontmatter: structuredClone(record.frontmatter) },
                effective: structuredClone(record.frontmatter),
                ...(input["projections"]
                  ? {
                      values: {
                        reader_source_id:
                          links[record.frontmatter["source"] as string] === "sources/one.md"
                            ? "src_1"
                            : null,
                      },
                    }
                  : {}),
              }),
            );
    yield await Promise.resolve(
      success(
        testQuery({
          records,
          totalCount: records.length,
          hasMore: false,

          complete: true,
        }),
      ),
    );
  });
  const read = vi.fn((input: { path: string }) => {
    const record = annotations.get(input.path);
    if (!record) {
      throw new Error(`Unexpected read of ${input.path}`);
    }
    return Promise.resolve(success(storedDocument(input.path, record)));
  });
  return { pages, read, client: mockSdk({ pages, get: read }) };
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
    const { client, read, pages } = authority(annotations, {
      "[[sources/one]]": "sources/one.md",
    });
    const repository = new ConnectAnnotationRepository(client);

    const first = await repository.listForSource(collection, sourceId("src_1"));
    expect(first).toHaveLength(20);
    expect(read).toHaveBeenCalledTimes(20);

    // Long past the blind reuse window, the query alone confirms each record is current.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    read.mockClear();
    pages.mockClear();
    const second = await repository.listForSource(collection, sourceId("src_1"));
    expect(read).toHaveBeenCalledTimes(20);
    // The source lookup and its two link queries; body batching belongs to readMany.
    expect(pages).toHaveBeenCalledTimes(3);
    expect(second).toEqual(first);
    expect(second[0]?.recordRevision).toBe("rev-annotations/ann_0.md-1");
  });

  it("observes a newer revision written by another device", async () => {
    const annotations = new Map([
      ["annotations/a.md", stored("ann_a", "[[sources/one]]")],
      ["annotations/b.md", stored("ann_b", "[[sources/one]]")],
    ]);
    const { client, read } = authority(annotations, { "[[sources/one]]": "sources/one.md" });
    const repository = new ConnectAnnotationRepository(client);
    await repository.listForSource(collection, sourceId("src_1"));
    read.mockClear();

    // An external edit within the cache window must still be seen, with its new revision.
    annotations.set("annotations/b.md", {
      ...stored("ann_b", "[[sources/one]]", "Edited"),
      version: 2,
    });
    const listed = await repository.listForSource(collection, sourceId("src_1"));

    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith({ path: "annotations/b.md" }, expect.anything());
    expect(listed.map(({ body, recordRevision }) => [body, recordRevision])).toEqual([
      ["Note ann_a", "rev-annotations/a.md-1"],
      ["Edited", "rev-annotations/b.md-2"],
    ]);
  });
});

describe("Connect annotation batch failure and legacy references", () => {
  it("keeps a failed hydration explicit instead of omitting the record", async () => {
    const annotations = new Map([["annotations/a.md", stored("ann_a", "[[sources/one]]")]]);
    const { client, read } = authority(annotations, { "[[sources/one]]": "sources/one.md" });
    const failure = mdbaseError("unavailable", "Read failed");
    read.mockRejectedValueOnce(failure);
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
    const { client, read } = authority(annotations, {
      "[[sources/one|One]]": "sources/one.md",
      "[[sources/unrelated|src_1]]": "sources/unrelated.md",
    });
    const repository = new ConnectAnnotationRepository(client);

    const listed = await repository.listForSource(collection, sourceId("src_1"));

    expect(listed.map(({ id }) => id)).toEqual(["ann_linked", "ann_bare", "ann_aliased"]);
    expect(
      read.mock.calls.map(([input]) => input.path).sort((left, right) => left.localeCompare(right)),
    ).toEqual(["annotations/aliased.md", "annotations/bare.md", "annotations/linked.md"]);
  });

  it("stops before mapping when aborted while the source query runs", async () => {
    const controller = new AbortController();
    const annotations = new Map([["annotations/a.md", stored("ann_a", "src_1")]]);
    const { client, read } = authority(annotations, {}, (input) => {
      if (input.where?.includes(".asFile()")) {
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

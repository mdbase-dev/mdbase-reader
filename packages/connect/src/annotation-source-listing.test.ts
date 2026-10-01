import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  ConnectOutcome,
  JsonObject,
  QueryInput,
  QueryPage,
  QueryPagesOptions,
  QueryRecord,
  ReadInput,
  RecordDocument,
} from "@mdbase-dev/connect";

interface StoredAnnotation {
  frontmatter: JsonObject;
  body: string;
  version: number;
}

const collection = collectionId("reading");

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

function stored(id: string, source: string, body = `Note ${id}`): StoredAnnotation {
  return {
    frontmatter: { id, source, annotation_type: "note", created_at: "2026-08-09T00:00:00.000Z" },
    body,
    version: 1,
  };
}

/** An authority whose queries and reads agree, as mdbase reports them. */
function authority(
  annotations: Map<string, StoredAnnotation>,
  links: Readonly<Record<string, string | null>>,
  onQuery: (input: QueryInput) => void = () => undefined,
): {
  queryPages: Mock<ReaderConnectClient["queryPages"]>;
  read: Mock<(input: ReadInput) => Promise<ConnectOutcome<RecordDocument>>>;
  client: ReaderConnectClient;
} {
  const file = (path: string, record: StoredAnnotation): QueryRecord["file"] => ({
    size: record.body.length + JSON.stringify(record.frontmatter).length,
    mtime: `2026-08-09T00:00:0${String(record.version)}Z`,
    path,
  });
  const queryPages = vi.fn(async function* (
    input: QueryInput,
    _options?: QueryPagesOptions,
  ): AsyncGenerator<ConnectOutcome<QueryPage>> {
    onQuery(input);
    const where = input.where ?? "";
    const quoted = (pattern: RegExp): string | undefined => {
      const value = pattern.exec(where)?.[1];
      return value === undefined ? undefined : (JSON.parse(value) as string);
    };
    const id = quoted(/^id == ("[^"]*")$/u);
    const target = quoted(/source\.asFile\(\)\.file\.path == ("(?:[^"\\]|\\.)*")$/u);
    const contained = quoted(/source\.contains\(("[^"]*")\)$/u);
    // The listing's second query names the matched paths, following no links.
    const named = where.startsWith("file.path == ")
      ? [...where.matchAll(/file\.path == ("(?:[^"\\]|\\.)*")/gu)].map(
          ([, path]) => JSON.parse(path!) as string,
        )
      : null;
    const results: QueryRecord[] =
      id !== undefined
        ? [{ path: "sources/one.md", effectiveFrontmatter: { id }, types: [], file: {} }]
        : [...annotations]
            .filter(([path, record]) => {
              if (named) {
                return named.includes(path);
              }
              const reference = String(record.frontmatter["source"]);
              const link = links[reference] ?? null;
              return target !== undefined
                ? link === target
                : link === null && contained !== undefined && reference.includes(contained);
            })
            .map(([path, record]) => ({
              path,
              types: ["reader-annotation"],
              file: file(path, record),
              ...(input.frontmatterMode === "effective"
                ? {}
                : { frontmatter: structuredClone(record.frontmatter) }),
              effectiveFrontmatter: structuredClone(record.frontmatter),
              ...(input.includeBody ? { body: record.body } : {}),
            }));
    yield await Promise.resolve(
      success({
        results,
        meta: { totalCount: results.length, hasMore: false },
        page: 0,
        offset: 0,
        loaded: results.length,
        complete: true,
      }),
    );
  });
  const read = vi.fn((input: ReadInput) => {
    const record = annotations.get(input.path);
    if (!record) {
      throw new Error(`Unexpected read of ${input.path}`);
    }
    return Promise.resolve(
      success<RecordDocument>({
        path: input.path,
        revision: `rev-${input.path}-${String(record.version)}`,
        types: ["reader-annotation"],
        frontmatter: structuredClone(record.frontmatter),
        effectiveFrontmatter: structuredClone(record.frontmatter),
        body: record.body,
        file: file(input.path, record),
      }),
    );
  });
  return { queryPages, read, client: { queryPages, read } as unknown as ReaderConnectClient };
}

describe("Connect annotations for one source", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses records the query shows unchanged instead of reading each again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const annotations = new Map(
      Array.from({ length: 20 }, (_value, index) => [
        `annotations/ann_${String(index)}.md`,
        stored(`ann_${String(index)}`, "[[sources/one]]"),
      ]),
    );
    const { client, read, queryPages } = authority(annotations, {
      "[[sources/one]]": "sources/one.md",
    });
    const repository = new ConnectAnnotationRepository(client);

    const first = await repository.listForSource(collection, sourceId("src_1"));
    expect(first).toHaveLength(20);
    expect(read).toHaveBeenCalledTimes(20);
    expect(queryPages).toHaveBeenCalledWith(
      expect.objectContaining({ frontmatterMode: "both", includeBody: true }),
      expect.anything(),
    );

    // Long past the blind reuse window, the query alone confirms each record is current.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    read.mockClear();
    queryPages.mockClear();
    const second = await repository.listForSource(collection, sourceId("src_1"));
    expect(read).not.toHaveBeenCalled();
    // The source lookup, its two link queries, then one query naming the matched paths.
    expect(queryPages).toHaveBeenCalledTimes(4);
    expect(second).toEqual(first);
    expect(second[0]?.recordRevision).toBe("rev-annotations/ann_0.md-1");
  });

  it("reads again only records whose queried content no longer matches the cache", async () => {
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

    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      { path: "annotations/b.md", includeDocument: true },
      expect.anything(),
    );
    expect(listed.map(({ body, recordRevision }) => [body, recordRevision])).toEqual([
      ["Note ann_a", "rev-annotations/a.md-1"],
      ["Edited", "rev-annotations/b.md-2"],
    ]);
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
      if (input.where?.includes("contains")) {
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

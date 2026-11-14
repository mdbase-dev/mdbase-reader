import { annotationId, collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationFromDocument } from "./annotation-mapping.js";
import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testWrite, testRecord, testQuery } from "./records.fixtures.js";

import type { MdbaseClient, Query, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

const collection = collectionId("reading");
const ok = <T>(value: T): T => value;

function document(path: string, fields: Record<string, string>): RecordView {
  return testRecord({
    path,
    revision: "r1",
    frontmatter: fields,
    effective: fields,
    body: "A highlight",
    types: path.startsWith("annotations/") ? ["reader-annotation"] : ["reader-source"],
  });
}

function annotation(name: string, source: string): RecordView {
  return document(`annotations/${name}.md`, {
    id: name,
    source,
    annotation_type: "highlight",
    created_at: "2026-09-25T00:00:00Z",
  });
}

/**
 * Stands in for mdbase: `resolve` is how the collection resolves each source link (null when it
 * reaches no record). Answers only the query shapes Reader sends, so a new shape fails loudly.
 */
function collectionOf(
  records: readonly RecordView[],
  resolve: (link: string) => string | null,
): { client: MdbaseClient; queries: Query[] } {
  const annotations = records.filter((record) => record.path.startsWith("annotations/"));
  const byPath = new Map(records.map((record) => [record.path, record]));
  const target = (record: RecordView): RecordView | undefined => {
    const path = resolve((record.effective ?? record.frontmatter)["source"] as string);
    return path === null ? undefined : byPath.get(path);
  };
  const queries: Query[] = [];
  const client = mockSdk({
    ...legacyAuthorityFeatures,
    get: ({ path }: { path: string }) => Promise.resolve(ok(byPath.get(path)!)),
    readMany: (paths: readonly string[]) =>
      Promise.resolve(
        ok({
          records: paths.map((path) => ({ status: "found", path, record: byPath.get(path)! })),
          errors: [],
        }),
      ),
    create: vi.fn(({ path }: { path: string }) =>
      Promise.resolve(testWrite(ok(byPath.get(path)!))),
    ),
    update: vi.fn(({ path }: { path: string }) =>
      Promise.resolve(testWrite(ok(byPath.get(path)!))),
    ),
    pages: async function* (input: Query) {
      queries.push(input);
      const where = input.where ?? "";
      const quoted = (pattern: RegExp): string | undefined => {
        const match = pattern.exec(where)?.[1];
        return match === undefined ? undefined : (JSON.parse(match) as string);
      };
      const id = quoted(/^id == ("[^"]*")$/u);
      const linkedTo = quoted(/source\.asFile\(\)\.file\.path == ("[^"]*")$/u);
      const unresolved = quoted(/source\.asFile\(\) == null && source\.contains\(("[^"]*")\)$/u);
      const onePath = quoted(/^file\.path == ("[^"]*")$/u);
      let selected: RecordView[];
      if (id !== undefined) {
        selected = records.filter(
          (record) => (record.effective ?? record.frontmatter)["id"] === id,
        );
      } else if (linkedTo !== undefined) {
        selected = annotations.filter((record) => target(record)?.path === linkedTo);
      } else if (unresolved !== undefined) {
        selected = annotations.filter(
          (record) =>
            !target(record) &&
            ((record.effective ?? record.frontmatter)["source"] as string).includes(unresolved),
        );
      } else if (onePath !== undefined || !where) {
        selected = annotations.filter((record) => onePath === undefined || record.path === onePath);
      } else {
        throw new Error(`Unexpected query: ${JSON.stringify(input)}`);
      }
      yield await Promise.resolve(
        ok(
          testQuery({
            records: selected.map((record) => ({
              ...record,
              ...(input["projections"]
                ? { values: { reader_source_id: target(record)?.frontmatter["id"] ?? null } }
                : {}),
            })),
            complete: true,
          }),
        ),
      );
    },
  });
  return { client, queries };
}

describe("annotation source links", () => {
  it.each([
    ["a path", "[[sources/renamed]]"],
    ["a path with an extension and alias", "[[sources/renamed.md|Example]]"],
    ["a filename mdbase shortened the link to", "[[renamed]]"],
    ["an aliased filename", "[[renamed|Example]]"],
  ])("follows the record mdbase resolves %s to, everywhere", async (_case, reference) => {
    const source = document("sources/renamed.md", { id: "src_stable" });
    const { client, queries } = collectionOf([source, annotation("ann_1", reference)], (link) =>
      link === reference ? source.path : null,
    );
    const repo = new ConnectAnnotationRepository(client);

    const [mapped] = await repo.listForSource(collection, sourceId("src_stable"));
    expect(mapped?.sourceId).toBe("src_stable");
    expect(mapped?.source).toBe(reference);
    expect(await repo.sourceIdsWithAnnotations(collection)).toEqual(["src_stable"]);
    expect((await repo.annotationCountsBySource(collection)).get(sourceId("src_stable"))).toBe(1);
    expect((await repo.listAll(collection))[0]?.sourceId).toBe("src_stable");
    expect((await repo.get(collection, mapped!.id))?.sourceId).toBe("src_stable");
    expect((await repo.create(mapped!, mutationId("test"))).sourceId).toBe("src_stable");
    expect(
      (
        await repo.updateBody({
          annotation: mapped!,
          body: "Updated",
          modifiedAt: mapped!.createdAt,
        })
      ).sourceId,
    ).toBe("src_stable");
    // Each read asks mdbase again rather than keeping a resolution that a rename could make stale.
    await repo.get(collection, annotationId("ann_1"));
    // readMany fetched the bodies; the individual reads above each resolved the source again.
    expect(
      queries.filter((query) => query.where === 'file.path == "annotations/ann_1.md"'),
    ).toHaveLength(2);
    expect(() => annotationFromDocument(collection, source)).toThrow();
  });

  it("does not attach a link that resolves to another source", async () => {
    const smith = document("@smith20.md", { id: "smith20" });
    const jones = document("@jones19.md", { id: "jones19" });
    const { client } = collectionOf([smith, jones, annotation("ann_1", "[[@jones19]]")], (link) =>
      link === "[[@jones19]]" ? jones.path : null,
    );
    const repo = new ConnectAnnotationRepository(client);
    expect(await repo.listForSource(collection, sourceId("smith20"))).toEqual([]);
    expect((await repo.listForSource(collection, sourceId("jones19")))[0]?.sourceId).toBe(
      "jones19",
    );
  });

  it("keeps a legacy bare ID that resolves to no record, without prefix collisions", async () => {
    const { client } = collectionOf(
      [
        document("sources/renamed.md", { id: "src_1" }),
        annotation("ann_1", "src_1"),
        annotation("ann_2", "[[src_10]]"),
      ],
      () => null,
    );
    const repo = new ConnectAnnotationRepository(client);
    expect((await repo.listForSource(collection, sourceId("src_1"))).map(({ id }) => id)).toEqual([
      "ann_1",
    ]);
    expect(await repo.sourceIdsWithAnnotations(collection)).toEqual(["src_1", "src_10"]);
  });

  it("leaves an annotation whose path link is broken out of the index", async () => {
    const { client } = collectionOf([annotation("ann_1", "[[sources/deleted]]")], () => null);
    const repo = new ConnectAnnotationRepository(client);
    expect(await repo.sourceIdsWithAnnotations(collection)).toEqual([]);
    expect(await repo.listAll(collection)).toEqual([]);
  });
});

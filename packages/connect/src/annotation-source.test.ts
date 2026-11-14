import { annotationId, collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationFromDocument } from "./annotation-mapping.js";
import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { linkIndex, mockSdk, testWrite, testRecord, testQuery } from "./records.fixtures.js";

import type { MdbaseClient, Query, RecordView } from "@mdbase-dev/sdk";

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
 * reaches no record). Answers only the query shapes Reader sends, so a new shape fails loudly,
 * and any query that follows a link is one.
 */
function collectionOf(
  records: readonly RecordView[],
  resolve: (link: string) => string | null,
): { client: MdbaseClient; queries: Query[]; links: ReturnType<typeof linkIndex> } {
  const annotations = records.filter((record) => record.path.startsWith("annotations/"));
  const byPath = new Map(records.map((record) => [record.path, record]));
  const queries: Query[] = [];
  const links = linkIndex(records, resolve);
  const client = mockSdk({
    ...links,
    get: ({ path }: { path: string }) => Promise.resolve(ok(byPath.get(path)!)),
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
      const contains = quoted(
        /^has\(record\.source\) && source != null && source\.contains\(("[^"]*")\)$/u,
      );
      let selected: RecordView[];
      if (input["projections"] || input.select) {
        throw new Error(`Unexpected query: ${JSON.stringify(input)}`);
      } else if (id !== undefined) {
        selected = records.filter(
          (record) => (record.effective ?? record.frontmatter)["id"] === id,
        );
      } else if (contains !== undefined) {
        selected = annotations.filter((record) =>
          ((record.effective ?? record.frontmatter)["source"] as string).includes(contains),
        );
      } else if (!where) {
        selected = annotations;
      } else {
        throw new Error(`Unexpected query: ${JSON.stringify(input)}`);
      }
      yield await Promise.resolve(ok(testQuery({ records: selected, complete: true })));
    },
  });
  return { client, queries, links };
}

describe("annotation source links", () => {
  it.each([
    ["a path", "[[sources/renamed]]"],
    ["a path with an extension and alias", "[[sources/renamed.md|Example]]"],
    ["a filename mdbase shortened the link to", "[[renamed]]"],
    ["an aliased filename", "[[renamed|Example]]"],
  ])("follows the record mdbase resolves %s to, everywhere", async (_case, reference) => {
    const source = document("sources/renamed.md", { id: "src_stable" });
    const { client, links } = collectionOf([source, annotation("ann_1", reference)], (link) =>
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
    const resolved = vi.mocked(links.resolveLinks).mock.calls.length;
    await repo.get(collection, annotationId("ann_1"));
    expect(links.resolveLinks).toHaveBeenCalledTimes(resolved + 1);
    expect(links.resolveLinks).toHaveBeenLastCalledWith(
      "annotations/ann_1.md",
      [reference],
      expect.anything(),
    );
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

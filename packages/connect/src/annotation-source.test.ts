import { collectionId, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { annotationFromDocument } from "./annotation-mapping.js";
import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";

const collection = collectionId("reading");
function document(path: string, fields: Record<string, string>): RecordDocument {
  return {
    path,
    revision: "r1",
    frontmatter: fields,
    effectiveFrontmatter: fields,
    body: "A highlight",
    types: [],
    file: {},
  };
}

describe("annotation source references", () => {
  it.each(["[[sources/renamed]]", "[[sources/renamed.md|Example]]"])(
    "resolves %s to the record ID for indexing and every mapping path",
    async (reference) => {
      const annotation = document("annotations/ann_1.md", {
        id: "ann_1",
        source: reference,
        annotation_type: "highlight",
        created_at: "2026-09-25T00:00:00Z",
      });
      const source = document("sources/renamed.md", { id: "src_stable" });
      const ok = <T>(value: T): ConnectOutcome<T> => ({ ok: true, value, diagnostics: [] });
      const read = vi.fn(({ path }: { path: string }) => {
        if (path === source.path) {
          return Promise.resolve(ok(source));
        }
        if (path === annotation.path) {
          return Promise.resolve(ok(annotation));
        }
        throw new Error(`Unexpected read: ${path}`);
      });
      const client = {
        read,
        queryPages: async function* (input: { where?: string }) {
          yield await Promise.resolve(
            ok({
              results: input.where === 'id == "src_stable"' ? [source] : [annotation],
              complete: true,
            }),
          );
        },
        create: vi.fn(() => Promise.resolve(ok(annotation))),
        update: vi.fn(() => Promise.resolve(ok(annotation))),
      } as unknown as ReaderConnectClient;
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
      // Later reads revalidate path identity rather than keeping a stale ID indefinitely.
      expect(
        read.mock.calls.filter(([input]) => input.path === source.path).length,
      ).toBeGreaterThan(1);
      expect(() => annotationFromDocument(collection, annotation)).toThrow("must be resolved");
      expect(annotationFromDocument(collection, annotation, sourceId("src_stable")).sourceId).toBe(
        "src_stable",
      );
    },
  );
});

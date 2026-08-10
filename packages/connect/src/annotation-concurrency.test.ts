import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryResult, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

function annotationDocument(path: string): RecordDocument {
  const id = path.replace(/^annotations\/(.*)\.md$/u, "$1");
  const frontmatter = {
    id,
    source: "src_01",
    annotation_type: "note",
    created_at: "2026-08-09T00:00:00.000Z",
  };
  return {
    path,
    revision: `rev-${id}`,
    types: ["reader-annotation"],
    frontmatter,
    effectiveFrontmatter: frontmatter,
    body: id,
    file: {},
  };
}

describe("Connect annotation concurrency", () => {
  it("bounds concurrent annotation body reads and retains index order", async () => {
    const ids = Array.from({ length: 12 }, (_value, index) => `ann_${String(index)}`);
    const paths = ids.map((id) => `annotations/${id}.md`);
    const query = vi.fn(() =>
      Promise.resolve(
        success<QueryResult>({
          results: paths.map((path, index) => ({
            path,
            effectiveFrontmatter: { id: ids[index], source: "src_01" },
            types: ["reader-annotation"],
            file: {},
          })),
          meta: { totalCount: paths.length, hasMore: false },
        }),
      ),
    );
    let active = 0;
    let maximum = 0;
    const read = vi.fn(async (input: { readonly path: string }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return success(annotationDocument(input.path));
    });
    const repository = new ConnectAnnotationRepository({
      query,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(maximum).toBe(4);
    expect(annotations.map(({ id }) => id)).toEqual(ids);
  });
});

import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument } from "@mdbase-dev/connect";

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
    const queryPages = vi.fn(() => annotationPages());
    async function* annotationPages(): AsyncGenerator<ConnectOutcome<QueryPage>> {
      yield await Promise.resolve(
        success({
          results: paths.map((path, index) => ({
            path,
            effectiveFrontmatter: { id: ids[index], source: "src_01" },
            types: ["reader-annotation"],
            file: {},
          })),
          meta: { totalCount: paths.length, hasMore: false },
          page: 0,
          offset: 0,
          loaded: paths.length,
          complete: true,
        }),
      );
    }
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
      queryPages,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(maximum).toBe(4);
    expect(annotations.map(({ id }) => id)).toEqual(ids);
  });
});

describe("Connect annotation listing", () => {
  it("lists every annotation with a query Connect accepts, then reads each record", async () => {
    const paths = ["annotations/ann_1.md", "annotations/broken.md", "annotations/ann_2.md"];
    const queryPages = vi.fn(async function* (): AsyncGenerator<ConnectOutcome<QueryPage>> {
      yield await Promise.resolve(
        success({
          results: paths.map((path) => ({
            path,
            effectiveFrontmatter: {
              id: annotationDocument(path).frontmatter["id"],
              source: "src_01",
            },
            types: ["reader-annotation"],
            file: {},
          })),
          meta: { totalCount: paths.length, hasMore: false },
          page: 0,
          offset: 0,
          loaded: paths.length,
          complete: true,
        }),
      );
    });
    const read = vi.fn((input: { readonly path: string }) => {
      const document = annotationDocument(input.path);
      return Promise.resolve(
        success(
          input.path.includes("broken") ? { ...document, effectiveFrontmatter: {} } : document,
        ),
      );
    });
    const repository = new ConnectAnnotationRepository({
      queryPages,
      read,
    } as unknown as ReaderConnectClient);

    const annotations = await repository.listAll(collectionId("reading"));

    // Semantic contract views accept only types, timezone, pagination, frontmatterMode and contract.
    const inputs = (queryPages.mock.calls as unknown as [Record<string, unknown>][]).map(
      ([input]) => input,
    );
    for (const input of inputs) {
      if (input["contract"]) {
        expect(
          Object.keys(input).filter(
            (key) => !["types", "timezone", "frontmatterMode", "contract"].includes(key),
          ),
        ).toEqual([]);
      }
    }
    // Bodies come from whole-record reads; the listing query never asks for them.
    expect(inputs.some((input) => "includeBody" in input)).toBe(false);
    expect(annotations.map(({ id, recordRevision }) => [id, recordRevision])).toEqual([
      ["ann_1", "rev-ann_1"],
      ["ann_2", "rev-ann_2"],
    ]);
  });
});

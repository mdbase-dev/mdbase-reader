import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testRecord, testQuery } from "./records.fixtures.js";

import type { QueryResult, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): Value {
  return value;
}

function annotationDocument(path: string): RecordView {
  const id = path.replace(/^annotations\/(.*)\.md$/u, "$1");
  const frontmatter = {
    id,
    source: "src_01",
    annotation_type: "note",
    created_at: "2026-08-09T00:00:00.000Z",
  };
  return testRecord({
    path,
    revision: `rev-${id}`,
    types: ["reader-annotation"],
    frontmatter,
    effective: frontmatter,
    body: id,
  });
}

describe("Connect annotation concurrency", () => {
  it("bounds concurrent annotation body reads and retains index order", async () => {
    const ids = Array.from({ length: 12 }, (_value, index) => `ann_${String(index)}`);
    const paths = ids.map((id) => `annotations/${id}.md`);
    const pages = vi.fn(() => annotationPages());
    async function* annotationPages(): AsyncGenerator<QueryResult> {
      yield await Promise.resolve(
        success(
          testQuery({
            records: paths.map((path, index) =>
              testRecord({
                path,
                effective: { id: ids[index], source: "src_01" },
                types: ["reader-annotation"],
              }),
            ),
            totalCount: paths.length,
            hasMore: false,

            complete: true,
          }),
        ),
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
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages,
        get: read,
      }),
    );

    const annotations = await repository.listForSource(collectionId("reading"), sourceId("src_01"));

    expect(maximum).toBe(4);
    expect(annotations.map(({ id }) => id)).toEqual(ids);
  });
});

describe("Connect annotation listing", () => {
  it("lists every annotation with a query Connect accepts, then reads each record", async () => {
    const paths = ["annotations/ann_1.md", "annotations/broken.md", "annotations/ann_2.md"];
    const pages = vi.fn(async function* (): AsyncGenerator<QueryResult> {
      yield await Promise.resolve(
        success(
          testQuery({
            records: paths.map((path) =>
              testRecord({
                path,
                effective: {
                  id: annotationDocument(path).frontmatter["id"],
                  source: "src_01",
                },
                types: ["reader-annotation"],
              }),
            ),
            totalCount: paths.length,
            hasMore: false,

            complete: true,
          }),
        ),
      );
    });
    const read = vi.fn((input: { readonly path: string }) => {
      const document = annotationDocument(input.path);
      return Promise.resolve(
        success(input.path.includes("broken") ? { ...document, effective: {} } : document),
      );
    });
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages,
        get: read,
      }),
    );

    const annotations = await repository.listAll(collectionId("reading"));

    // Semantic contract views accept only types, timezone, pagination, frontmatterMode and contract.
    const inputs = (pages.mock.calls as unknown as [Record<string, unknown>][]).map(
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
    expect(inputs.some((input) => input["includeBody"] === true)).toBe(false);
    expect(annotations.map(({ id, recordRevision }) => [id, recordRevision])).toEqual([
      ["ann_1", "rev-ann_1"],
      ["ann_2", "rev-ann_2"],
    ]);
  });
});

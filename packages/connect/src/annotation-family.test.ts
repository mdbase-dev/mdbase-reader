import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testRecord, testQuery } from "./records.fixtures.js";

const success = <T>(value: T): T => value;
describe("batch annotation owner filtering", () => {
  it("discovers once for many owners and hydrates only selected owners", async () => {
    const owners = ["src_book", "src_chapter_1", "src_chapter_2", "src_unrelated"];
    const documents = owners.map((source, index) => {
      const fields = {
        id: `ann_${String(index)}`,
        source,
        annotation_type: "note",
        created_at: "2026-01-01T00:00:00Z",
      };
      return testRecord({
        path: `annotations/${String(index)}.md`,
        frontmatter: fields,
        effective: fields,
        revision: "rev",
        body: source,

        types: ["reader-annotation"],
      });
    });
    const pages = vi.fn(async function* () {
      yield await Promise.resolve(
        success(
          testQuery({
            records: documents,
            totalCount: 4,
            hasMore: false,

            complete: true,
          }),
        ),
      );
    });
    const read = vi.fn(({ path }: { path: string }) =>
      Promise.resolve(success(documents.find((document) => document.path === path)!)),
    );
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        pages,
        get: read,
        supportsAuthorityFeature: () => Promise.resolve(success(false)),
      }),
    );
    const records = await repository.listAll(collectionId("reading"), {
      sourceIds: new Set(owners.slice(0, 3).map(sourceId)),
    });
    expect(records.map(({ sourceId }) => sourceId)).toEqual(owners.slice(0, 3));
    expect(pages).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).not.toHaveBeenCalledWith({ path: documents[3]!.path });
  });
});

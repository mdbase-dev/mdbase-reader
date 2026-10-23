import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";

const success = <T>(value: T): { ok: true; value: T; diagnostics: [] } => ({
  ok: true as const,
  value,
  diagnostics: [],
});
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
      return {
        path: `annotations/${String(index)}.md`,
        frontmatter: fields,
        effectiveFrontmatter: fields,
        revision: "rev",
        body: source,
        file: {},
        types: ["reader-annotation"],
      };
    });
    const queryPages = vi.fn(async function* () {
      yield await Promise.resolve(
        success({
          results: documents,
          meta: { totalCount: 4, hasMore: false },
          page: 0,
          offset: 0,
          loaded: 4,
          complete: true,
        }),
      );
    });
    const read = vi.fn(({ path }: { path: string }) =>
      Promise.resolve(success(documents.find((document) => document.path === path)!)),
    );
    const repository = new ConnectAnnotationRepository({
      queryPages,
      read,
      supportsAuthorityFeature: () => Promise.resolve(success(false)),
    } as unknown as ReaderConnectClient);
    const records = await repository.listAll(collectionId("reading"), {
      sourceIds: new Set(owners.slice(0, 3).map(sourceId)),
    });
    expect(records.map(({ sourceId }) => sourceId)).toEqual(owners.slice(0, 3));
    expect(queryPages).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).not.toHaveBeenCalledWith({ path: documents[3]!.path });
  });
});

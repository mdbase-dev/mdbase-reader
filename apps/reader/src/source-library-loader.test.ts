import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { loadSourceLibrary } from "./source-library-loader.js";

import type { SourceRepository, SourceSummary } from "@mdbase-reader/core";

const first: SourceSummary = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/one.md",
  title: "First",
  creators: [],
  tags: [],
  documents: [],
};

describe("loadSourceLibrary", () => {
  it("publishes the first source page before the remaining index is complete", async () => {
    const second = { ...first, id: sourceId("src_101"), title: "Second" };
    const progress = vi.fn();
    const repository = {
      list: vi.fn((query: { readonly cursor?: string }) =>
        Promise.resolve(
          query.cursor === "100"
            ? { items: [second], totalCount: 101 }
            : { items: [first], nextCursor: "100", totalCount: 101 },
        ),
      ),
    } as unknown as SourceRepository;

    const complete = await loadSourceLibrary({
      repository,
      collectionId: first.collectionId,
      collectionName: "Reading",
      options: {},
      onProgress: progress,
    });

    expect(progress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sources: [first],
        sourceIndex: { loaded: 1, total: 101, complete: false },
      }),
    );
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sources: [first, second],
        sourceIndex: { loaded: 2, total: 101, complete: false },
      }),
    );
    expect(complete.sourceIndex).toEqual({ loaded: 2, total: 2, complete: true });
  });
});

import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { loadSourceLibrary } from "./source-library-loader.js";

import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type { Page, SourceRepository, SourceSummary } from "@mdbase-reader/core";

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
  it("bounds cumulative snapshot copies when old authorities keep small pages", async () => {
    const sources = Array.from({ length: 10_000 }, (_, i) => ({
      ...first,
      id: sourceId(`src_${String(i)}`),
    }));
    const progress = vi.fn<(snapshot: ReaderLibrarySnapshot) => void>();
    async function* pages(): AsyncGenerator<Page<SourceSummary>> {
      for (let offset = 0; offset < sources.length; offset += 100) {
        yield await Promise.resolve({
          items: sources.slice(offset, offset + 100),
          totalCount: sources.length,
        });
      }
    }
    const complete = await loadSourceLibrary({
      repository: { listPages: pages } as unknown as SourceRepository,
      collectionId: first.collectionId,
      collectionName: "Reading",
      options: {},
      onProgress: progress,
    });
    expect(progress.mock.calls[0]?.[0].sources).toHaveLength(100);
    expect(progress.mock.calls.length).toBeLessThan(25);
    const copied = progress.mock.calls.reduce(
      (sum, [snapshot]) => sum + snapshot.sources.length,
      0,
    );
    expect(copied).toBeLessThan(65_000);
    expect(complete.sources).toEqual(sources);
    expect(complete.sourceIndex).toEqual({ loaded: 10_000, total: 10_000, complete: true });
  });
  it("publishes the first source page before the remaining index is complete", async () => {
    const second = { ...first, id: sourceId("src_101"), title: "Second" };
    const progress = vi.fn();
    const repository = {
      list: vi.fn(() => Promise.reject(new Error("offset fallback should not run"))),
      listPages: vi.fn(() => pages()),
    } as unknown as SourceRepository;

    async function* pages(): AsyncGenerator<Page<SourceSummary>> {
      yield await Promise.resolve({ items: [first], nextCursor: "opaque", totalCount: 101 });
      yield await Promise.resolve({ items: [second], totalCount: 101 });
    }

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
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.listPages).toHaveBeenCalledWith(
      { collectionId: first.collectionId, limit: 100 },
      {},
    );
  });
});

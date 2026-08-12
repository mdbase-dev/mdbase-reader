import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type {
  CollectionId,
  ReaderRequestOptions,
  SourceRepository,
  SourceSummary,
} from "@mdbase-reader/core";

export async function loadSourceLibrary(input: {
  readonly repository: SourceRepository;
  readonly collectionId: CollectionId;
  readonly collectionName: string;
  readonly options: ReaderRequestOptions;
  readonly onProgress?: (snapshot: ReaderLibrarySnapshot) => void;
}): Promise<ReaderLibrarySnapshot> {
  if (input.repository.listPages) {
    return loadStablePages(input, input.repository.listPages.bind(input.repository));
  }
  const first = await input.repository.list(
    { collectionId: input.collectionId, limit: 100 },
    input.options,
  );
  const sources: SourceSummary[] = [...first.items];
  publish(input, sources, false, first.totalCount);
  if (first.totalCount && first.totalCount > first.items.length) {
    const offsets = Array.from(
      { length: Math.ceil(first.totalCount / 100) - 1 },
      (_value, index) => (index + 1) * 100,
    );
    for (let start = 0; start < offsets.length; start += 4) {
      const pages = await Promise.all(
        offsets
          .slice(start, start + 4)
          .map((offset) =>
            input.repository.list(
              { collectionId: input.collectionId, limit: 100, cursor: String(offset) },
              input.options,
            ),
          ),
      );
      sources.push(...pages.flatMap(({ items }) => items));
      publish(input, sources, false, first.totalCount);
    }
  } else {
    await loadCursorPages(input, sources, first.nextCursor, first.totalCount);
  }
  return snapshot(input.collectionName, sources, true, sources.length);
}

async function loadStablePages(
  input: Parameters<typeof loadSourceLibrary>[0],
  listPages: NonNullable<SourceRepository["listPages"]>,
): Promise<ReaderLibrarySnapshot> {
  const sources: SourceSummary[] = [];
  let total: number | undefined;
  for await (const page of listPages(
    { collectionId: input.collectionId, limit: 100 },
    input.options,
  )) {
    sources.push(...page.items);
    total = page.totalCount ?? total;
    publish(input, sources, false, total);
  }
  return snapshot(input.collectionName, sources, true, sources.length);
}

async function loadCursorPages(
  input: Parameters<typeof loadSourceLibrary>[0],
  sources: SourceSummary[],
  firstCursor?: string,
  knownTotal?: number,
): Promise<void> {
  const seen = new Set<string>();
  let cursor = firstCursor;
  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error("Reader received a repeated source-library cursor.");
    }
    seen.add(cursor);
    const page = await input.repository.list(
      { collectionId: input.collectionId, limit: 100, cursor },
      input.options,
    );
    sources.push(...page.items);
    publish(input, sources, false, page.totalCount ?? knownTotal);
    cursor = page.nextCursor;
  }
}

function publish(
  input: Parameters<typeof loadSourceLibrary>[0],
  sources: readonly SourceSummary[],
  complete: boolean,
  total?: number,
): void {
  input.onProgress?.(snapshot(input.collectionName, sources, complete, total));
}

export function completeLibrarySnapshot(
  collectionName: string,
  sources: readonly SourceSummary[],
): ReaderLibrarySnapshot {
  return snapshot(collectionName, sources, true, sources.length);
}

function snapshot(
  collectionName: string,
  sources: readonly SourceSummary[],
  complete: boolean,
  total?: number,
): ReaderLibrarySnapshot {
  return {
    collectionName,
    sources: [...sources],
    connectionState: "connected",
    sourceIndex: {
      loaded: sources.length,
      ...(total === undefined ? {} : { total }),
      complete,
    },
  };
}

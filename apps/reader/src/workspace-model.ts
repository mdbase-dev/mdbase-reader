import type { Annotation, Source, SourceId, SourceSummary } from "@mdbase-reader/core";

export interface ReaderWorkspaceSnapshot {
  readonly collectionName: string;
  readonly sources: readonly SourceSummary[];
  readonly selectedSource: Source | null;
  readonly annotations: readonly Annotation[];
  readonly connectionState: "connected" | "offline" | "syncing";
}

export interface ReaderWorkspaceGateway {
  snapshot(): Promise<ReaderWorkspaceSnapshot>;
  selectSource(id: SourceId): Promise<ReaderWorkspaceSnapshot>;
  saveSourceBody(source: Source, body: string): Promise<ReaderWorkspaceSnapshot>;
}

export function filterSources(
  sources: readonly SourceSummary[],
  search: string,
): readonly SourceSummary[] {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) {
    return sources;
  }
  return sources.filter((source) =>
    [source.title, ...source.creators, ...source.tags]
      .join("\n")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

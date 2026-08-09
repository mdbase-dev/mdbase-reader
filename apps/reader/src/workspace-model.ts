import type {
  Annotation,
  AnnotationCreationRequest,
  ReaderRequestOptions,
  Source,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";

export interface ReaderLibrarySnapshot {
  readonly collectionName: string;
  readonly sources: readonly SourceSummary[];
  readonly connectionState: "connected" | "offline" | "syncing";
}

export interface ReaderWorkspaceGateway {
  library(options?: ReaderRequestOptions): Promise<ReaderLibrarySnapshot>;
  source(id: SourceId, options?: ReaderRequestOptions): Promise<Source | null>;
  annotations(id: SourceId, options?: ReaderRequestOptions): Promise<readonly Annotation[]>;
  saveSourceBody(source: Source, body: string): Promise<Source>;
  createAnnotation(request: AnnotationCreationRequest): Promise<Annotation>;
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

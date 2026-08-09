import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationCreationRequest,
  ExportedCollectionFile,
  FileId,
  FileRevision,
  ReaderRequestOptions,
  ReadingPosition,
  Source,
  SourceId,
  SourceSummary,
  SourceFileImportRequest,
  SourceTextSearchMatch,
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
  saveSourceCitation(source: Source, citation: unknown): Promise<Source>;
  searchText(
    query: string,
    options?: ReaderRequestOptions,
  ): Promise<readonly SourceTextSearchMatch[]>;
  readFile(
    file: string,
    expectedRevision?: FileRevision,
    options?: ReaderRequestOptions,
  ): Promise<ExportedCollectionFile>;
  importSourceFile(request: Omit<SourceFileImportRequest, "collectionId">): Promise<Source>;
  createAnnotation(request: AnnotationCreationRequest): Promise<Annotation>;
  updateAnnotation(annotation: Annotation, body: string): Promise<Annotation>;
  planAnnotationDeletion(annotation: Annotation): Promise<AnnotationDeletionPlan>;
  deleteAnnotation(annotation: Annotation, plan: AnnotationDeletionPlan): Promise<void>;
  transcludeAnnotation(source: Source, annotation: Annotation): Promise<Source>;
  saveReadingPosition(
    source: Source,
    documentFileId: FileId,
    position: ReadingPosition,
  ): Promise<Source>;
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

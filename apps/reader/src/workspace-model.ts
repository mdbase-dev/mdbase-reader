import type {
  ExecutedLibraryView,
  LibraryViewSaveRequest,
  MdbaseLibraryView,
} from "./mdbase-library-views.js";
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
  SourceImportOptions,
  SourceTextSearchMatch,
  CitationCandidate,
  CitationResolutionRequest,
} from "@mdbase-reader/core";

export interface ReaderLibrarySnapshot {
  readonly collectionName: string;
  readonly sources: readonly SourceSummary[];
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly sourceIndex?: {
    readonly loaded: number;
    readonly total?: number;
    readonly complete: boolean;
  };
}

export interface ReaderLibraryRequestOptions extends ReaderRequestOptions {
  readonly onProgress?: (snapshot: ReaderLibrarySnapshot) => void;
}

export interface ReaderWorkspaceGateway {
  library(options?: ReaderLibraryRequestOptions): Promise<ReaderLibrarySnapshot>;
  listLibraryViews(options?: ReaderRequestOptions): Promise<readonly MdbaseLibraryView[]>;
  executeLibraryView(
    view: MdbaseLibraryView,
    options?: ReaderRequestOptions,
  ): Promise<ExecutedLibraryView>;
  saveLibraryView(request: LibraryViewSaveRequest): Promise<MdbaseLibraryView>;
  source(id: SourceId, options?: ReaderRequestOptions): Promise<Source | null>;
  /** Bypass session caches when comparing revisions before a draft write. */
  refreshSource?(id: SourceId, options?: ReaderRequestOptions): Promise<Source | null>;
  annotations(id: SourceId, options?: ReaderRequestOptions): Promise<readonly Annotation[]>;
  annotationSourceIds?(options?: ReaderRequestOptions): Promise<readonly SourceId[]>;
  saveSourceBody(source: Source, body: string): Promise<Source>;
  saveSourceCitation(source: Source, citation: unknown): Promise<Source>;
  resolveCitation?(
    request: CitationResolutionRequest,
    options?: ReaderRequestOptions,
  ): Promise<CitationCandidate>;
  searchText(
    query: string,
    options?: ReaderRequestOptions,
  ): Promise<readonly SourceTextSearchMatch[]>;
  readFile(
    file: string,
    expectedRevision?: FileRevision,
    options?: ReaderRequestOptions,
  ): Promise<ExportedCollectionFile>;
  importSourceFile(
    request: Omit<SourceFileImportRequest, "collectionId">,
    options?: SourceImportOptions,
  ): Promise<Source>;
  createAnnotation(request: AnnotationCreationRequest): Promise<Annotation>;
  updateAnnotation(annotation: Annotation, body: string): Promise<Annotation>;
  refreshAnnotation?(annotation: Annotation): Promise<Annotation | null>;
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
    [
      source.title,
      ...source.creators,
      ...source.tags,
      source.publication,
      source.site,
      source.published === undefined ? undefined : String(source.published),
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

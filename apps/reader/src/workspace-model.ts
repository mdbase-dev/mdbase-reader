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
  ReadingStatus,
  Source,
  SourceId,
  SourceSummary,
  SourceFileAttachmentRequest,
  SourceFileImportRequest,
  SourceRecordCreationRequest,
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
  /** The annotation paths a saved annotations view selects, as mdbase runs it. */
  executeAnnotationView?(
    view: MdbaseLibraryView,
    options?: ReaderRequestOptions,
  ): Promise<ReadonlySet<string>>;
  /** Adds the collection's "Annotations for this source" view unless it already has one. */
  ensureSourceAnnotationsView?(): Promise<{ readonly path: string; readonly created: boolean }>;
  source(id: SourceId, options?: ReaderRequestOptions): Promise<Source | null>;
  /** Bypass session caches when comparing revisions before a draft write. */
  refreshSource?(id: SourceId, options?: ReaderRequestOptions): Promise<Source | null>;
  annotations(id: SourceId, options?: ReaderRequestOptions): Promise<readonly Annotation[]>;
  annotationSourceIds?(options?: ReaderRequestOptions): Promise<readonly SourceId[]>;
  annotationCounts?(options?: ReaderRequestOptions): Promise<ReadonlyMap<SourceId, number>>;
  /** Every annotation in the collection, read-only, for the library's annotations view. */
  allAnnotations?(options?: ReaderRequestOptions): Promise<readonly Annotation[]>;
  saveSourceBody(source: Source, body: string): Promise<Source>;
  /** Exact recovery of an interrupted source note write. Only a live connection offers it. */
  recoverSourceBody?(requestId: string): Promise<Source>;
  /** Exact recovery of an interrupted annotation write. */
  recoverAnnotationBody?(requestId: string): Promise<Annotation>;
  /** Whether an interrupted write is still durably pending. */
  mutationPending?(requestId: string): boolean;
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
  /** A source with no document yet, such as a book found by its ISBN. */
  createSource?(
    request: Omit<SourceRecordCreationRequest, "collectionId">,
    options?: SourceImportOptions,
  ): Promise<Source>;
  attachSourceFile?(
    request: SourceFileAttachmentRequest,
    options?: SourceImportOptions,
  ): Promise<Source>;
  /** Stores a found citation on a source, under a citekey no other source uses. */
  saveNewSourceCitation?(
    source: Source,
    citation: Readonly<Record<string, unknown>>,
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
  /** Moves a source through its reading lifecycle, e.g. from queued to finished. */
  saveReadingStatus?(sourceId: SourceId, status: ReadingStatus): Promise<Source>;
  /** Sets frontmatter fields by dotted path; null removes a field. */
  saveSourceFields?(sourceId: SourceId, fields: Readonly<Record<string, unknown>>): Promise<Source>;
}

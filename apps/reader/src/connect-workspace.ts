import {
  createAnnotation,
  deleteAnnotation,
  importSourceFile,
  planAnnotationDeletion,
  saveSourceCitation,
  transcludeAnnotation,
  updateAnnotationBody,
} from "@mdbase-reader/core";

import { completeLibrarySnapshot, loadSourceLibrary } from "./source-library-loader.js";

import type {
  ReaderLibraryRequestOptions,
  ReaderLibrarySnapshot,
  ReaderWorkspaceGateway,
} from "./workspace-model.js";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationAssetRepository,
  AnnotationCreationRequest,
  AnnotationRepository,
  Clock,
  CollectionFileRepository,
  CollectionId,
  ContentHasher,
  ContentSearchRepository,
  FileId,
  MutationJournal,
  ReaderRequestOptions,
  ReadingPosition,
  ReaderIdGenerator,
  Source,
  SourceId,
  SourceFileImportRequest,
  SourceImportRepository,
  SourceRepository,
  SourceSummary,
} from "@mdbase-reader/core";

export class ConnectWorkspaceGateway implements ReaderWorkspaceGateway {
  #library: ReaderLibrarySnapshot["sources"] | null = null;
  readonly #sourcesById = new Map<SourceId, Source>();
  readonly #annotationsBySource = new Map<SourceId, readonly Annotation[]>();

  constructor(
    private readonly sources: SourceRepository,
    private readonly annotationsRepository: AnnotationRepository,
    private readonly annotationAssets: AnnotationAssetRepository,
    private readonly sourceImports: SourceImportRepository,
    private readonly collectionId: CollectionId,
    private readonly collectionName: string,
    private readonly runtime: {
      readonly clock: Clock;
      readonly hasher: ContentHasher;
      readonly ids: ReaderIdGenerator;
      readonly journal: MutationJournal;
    },
    private readonly contentSearch?: ContentSearchRepository,
    private readonly files?: CollectionFileRepository,
  ) {}

  async library(options: ReaderLibraryRequestOptions = {}): Promise<ReaderLibrarySnapshot> {
    const { onProgress, ...requestOptions } = options;
    if (this.#library) {
      return completeLibrarySnapshot(this.collectionName, this.#library);
    }
    const snapshot = await loadSourceLibrary({
      repository: this.sources,
      collectionId: this.collectionId,
      collectionName: this.collectionName,
      options: requestOptions,
      ...(onProgress ? { onProgress } : {}),
    });
    this.#library = snapshot.sources;
    return snapshot;
  }

  async source(id: SourceId, options: ReaderRequestOptions = {}): Promise<Source | null> {
    const cached = this.#sourcesById.get(id);
    if (cached) {
      return cached;
    }
    const source = await this.sources.get(this.collectionId, id, options);
    if (source) {
      this.#sourcesById.set(id, source);
    }
    return source;
  }

  async annotations(
    id: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    const cached = this.#annotationsBySource.get(id);
    if (cached) {
      return cached;
    }
    const annotations = await this.annotationsRepository.listForSource(
      this.collectionId,
      id,
      options,
    );
    this.#annotationsBySource.set(id, annotations);
    return annotations;
  }

  async saveSourceBody(source: Source, body: string): Promise<Source> {
    const updated = await this.sources.updateBody({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      body,
    });
    this.#replaceSource(updated);
    return updated;
  }

  async saveSourceCitation(source: Source, citation: unknown): Promise<Source> {
    const updated = await saveSourceCitation(this.sources, source, this.#library ?? [], citation);
    this.#replaceSource(updated);
    return updated;
  }

  searchText(
    query: string,
    options: ReaderRequestOptions = {},
  ): ReturnType<ReaderWorkspaceGateway["searchText"]> {
    return this.contentSearch?.search(this.collectionId, query, options) ?? Promise.resolve([]);
  }

  readFile(
    file: string,
    expectedRevision?: Parameters<ReaderWorkspaceGateway["readFile"]>[1],
    options: ReaderRequestOptions = {},
  ): ReturnType<ReaderWorkspaceGateway["readFile"]> {
    if (!this.files) {
      return Promise.reject(new Error("File export is unavailable for this connection."));
    }
    return this.files.read(this.collectionId, file, expectedRevision, options);
  }

  async importSourceFile(request: Omit<SourceFileImportRequest, "collectionId">): Promise<Source> {
    const imported = await importSourceFile(
      { imports: this.sourceImports, ...this.runtime },
      { ...request, collectionId: this.collectionId },
    );
    this.#replaceSource(imported, true);
    return imported;
  }

  async createAnnotation(request: AnnotationCreationRequest): Promise<Annotation> {
    const result = await createAnnotation(
      {
        annotations: this.annotationsRepository,
        assets: this.annotationAssets,
        sources: this.sources,
        ...this.runtime,
      },
      request,
    );
    const current = this.#annotationsBySource.get(request.sourceId) ?? [];
    this.#annotationsBySource.set(request.sourceId, [result.annotation, ...current]);
    return result.annotation;
  }

  async updateAnnotation(annotation: Annotation, body: string): Promise<Annotation> {
    const updated = await updateAnnotationBody(
      this.annotationsRepository,
      annotation,
      body,
      this.runtime.clock.now(),
    );
    const current = this.#annotationsBySource.get(annotation.sourceId) ?? [];
    this.#annotationsBySource.set(
      annotation.sourceId,
      current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
    return updated;
  }

  planAnnotationDeletion(annotation: Annotation): Promise<AnnotationDeletionPlan> {
    return planAnnotationDeletion(this.annotationsRepository, annotation);
  }

  async deleteAnnotation(annotation: Annotation, plan: AnnotationDeletionPlan): Promise<void> {
    await deleteAnnotation(this.annotationsRepository, annotation, plan);
    const current = this.#annotationsBySource.get(annotation.sourceId) ?? [];
    this.#annotationsBySource.set(
      annotation.sourceId,
      current.filter((candidate) => candidate.id !== annotation.id),
    );
  }

  async transcludeAnnotation(source: Source, annotation: Annotation): Promise<Source> {
    const updated = await transcludeAnnotation(
      this.sources,
      source,
      annotation,
      this.runtime.ids.mutation(),
    );
    this.#replaceSource(updated);
    return updated;
  }

  async saveReadingPosition(
    source: Source,
    documentFileId: FileId,
    position: ReadingPosition,
  ): Promise<Source> {
    const updated = await this.sources.updateReading({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      documentFileId,
      position,
      openedAt: this.runtime.clock.now(),
    });
    this.#replaceSource(updated);
    return updated;
  }

  #replaceSource(source: Source, prepend = false): void {
    this.#sourcesById.set(source.id, source);
    if (this.#library) {
      const remaining = this.#library.filter(({ id }) => id !== source.id);
      this.#library = prepend ? [source, ...remaining] : replaceInOrder(this.#library, source);
    }
  }
}

function replaceInOrder(
  sources: readonly SourceSummary[],
  replacement: SourceSummary,
): readonly SourceSummary[] {
  return sources.map((source) => (source.id === replacement.id ? replacement : source));
}

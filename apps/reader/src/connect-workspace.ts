/* eslint-disable max-lines */
import {
  createAnnotation,
  deleteAnnotation,
  importSourceFile,
  planAnnotationDeletion,
  saveSourceCitation,
  transcludeAnnotation,
  updateAnnotationBody,
} from "@mdbase-reader/core";

import {
  buildLibraryViewDocument,
  defaultLibraryView,
  libraryViewConfiguration,
  libraryViewKey,
  isReaderLibraryPresentation,
  type ExecutedLibraryView,
  type LibraryViewSaveRequest,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { completeLibrarySnapshot, loadSourceLibrary } from "./source-library-loader.js";

import type {
  ReaderLibraryRequestOptions,
  ReaderLibrarySnapshot,
  ReaderWorkspaceGateway,
} from "./workspace-model.js";
import type { LibraryViewRepository } from "@mdbase-reader/connect";
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
  ReadingStatus,
  ReaderIdGenerator,
  Source,
  SourceId,
  SourceFileImportRequest,
  SourceImportOptions,
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
    private readonly libraryViewRepository?: LibraryViewRepository,
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

  async refreshSource(id: SourceId, options: ReaderRequestOptions = {}): Promise<Source | null> {
    const source = await this.sources.get(this.collectionId, id, options);
    if (source) {
      this.#replaceSource(source);
    } else {
      this.#sourcesById.delete(id);
    }
    return source;
  }

  async listLibraryViews(
    options: ReaderRequestOptions = {},
  ): Promise<readonly MdbaseLibraryView[]> {
    if (!this.libraryViewRepository) {
      return [defaultLibraryView];
    }
    const listed = await this.libraryViewRepository.list(options);
    // Views are shared across apps; only explicitly Reader-marked presentations belong here.
    return [
      defaultLibraryView,
      ...listed.views.flatMap((document) =>
        document.views
          .filter((view) => isReaderLibraryPresentation(view.presentation))
          .map((view) => ({
            key: libraryViewKey(document.source.path, view.id),
            path: document.source.path,
            revision: document.source.revision,
            viewId: view.id,
            name: view.name,
            writable: document.source.writable,
            owned: isReaderLibraryPresentation(view.presentation),
            properties: view.properties.map(({ key, label }) => ({
              key,
              ...(label ? { label } : {}),
            })),
            configuration: libraryViewConfiguration(view.presentation),
          })),
      ),
    ];
  }

  async executeLibraryView(
    view: MdbaseLibraryView,
    options: ReaderRequestOptions = {},
  ): Promise<ExecutedLibraryView> {
    const library = await this.library(options);
    if (!view.path || !this.libraryViewRepository) {
      return {
        sources: library.sources,
        valuesByPath: new Map(),
        totalCount: library.sources.length,
      };
    }
    const execution = await this.libraryViewRepository.execute(
      { path: view.path, view: view.viewId },
      options,
    );
    const byPath = new Map(library.sources.map((source) => [source.path, source]));
    const valuesByPath = new Map<string, Readonly<Record<string, unknown>>>();
    const sources = execution.results.flatMap((row) => {
      const source = byPath.get(row.path);
      if (!source) {
        return [];
      }
      valuesByPath.set(row.path, row.values ?? {});
      return [source];
    });
    return { sources, valuesByPath, totalCount: execution.meta.totalCount };
  }

  async saveLibraryView(request: LibraryViewSaveRequest): Promise<MdbaseLibraryView> {
    if (!this.libraryViewRepository) {
      throw new Error("Saved mdbase views are unavailable for this collection.");
    }
    const saved = await this.libraryViewRepository.save({
      document: buildLibraryViewDocument(request),
      ...(request.existing?.path ? { path: request.existing.path } : { name: request.name }),
      ...(request.existing?.revision ? { revision: request.existing.revision } : {}),
    });
    const views = await this.listLibraryViews();
    const match = views.find(
      (view) =>
        view.path === saved.path &&
        view.name.toLocaleLowerCase() === request.name.trim().toLocaleLowerCase(),
    );
    if (!match) {
      throw new Error("The view was saved, but Reader could not reopen it.");
    }
    return match;
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

  annotationSourceIds(options: ReaderRequestOptions = {}): Promise<readonly SourceId[]> {
    return (
      this.annotationsRepository.sourceIdsWithAnnotations?.(this.collectionId, options) ??
      Promise.resolve([...this.#annotationsBySource.keys()])
    );
  }

  allAnnotations(options: ReaderRequestOptions = {}): Promise<readonly Annotation[]> {
    if (!this.annotationsRepository.listAll) {
      return Promise.reject(new Error("This collection cannot list all annotations."));
    }
    return this.annotationsRepository.listAll(this.collectionId, options);
  }

  annotationCounts(options: ReaderRequestOptions = {}): Promise<ReadonlyMap<SourceId, number>> {
    return (
      this.annotationsRepository.annotationCountsBySource?.(this.collectionId, options) ??
      Promise.resolve(
        new Map([...this.#annotationsBySource].map(([id, items]) => [id, items.length])),
      )
    );
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

  async importSourceFile(
    request: Omit<SourceFileImportRequest, "collectionId">,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    const imported = await importSourceFile(
      {
        imports: this.sourceImports,
        ...this.runtime,
      },
      { ...request, collectionId: this.collectionId },
      options,
    );
    this.#replaceSource(imported, true);
    return imported;
  }

  async createAnnotation(request: AnnotationCreationRequest): Promise<Annotation> {
    // Opt in from DevTools: sessionStorage.setItem("reader.annotationTiming", "1").
    // No IDs, paths, text, or image bytes are logged.
    const timingEnabled = (() => {
      try {
        return globalThis.sessionStorage.getItem("reader.annotationTiming") === "1";
      } catch {
        return false;
      }
    })();
    const timings: { stage: string; ms: number }[] = [];
    const start = timingEnabled ? performance.now() : 0;
    try {
      const result = await createAnnotation(
        {
          annotations: this.annotationsRepository,
          assets: this.annotationAssets,
          sources: this.sources,
          ...this.runtime,
          ...(timingEnabled
            ? { onTiming: (stage: string, ms: number) => timings.push({ stage, ms }) }
            : {}),
        },
        request,
      );
      const current = this.#annotationsBySource.get(request.sourceId) ?? [];
      this.#annotationsBySource.set(request.sourceId, [result.annotation, ...current]);
      return result.annotation;
    } finally {
      if (timingEnabled) {
        // Repeated journal marks are listed separately so their cost remains visible.
        // eslint-disable-next-line no-console
        console.info("Reader annotation save timing", {
          kind: request.annotationType,
          imageBytes: request.attachment?.bytes.byteLength ?? 0,
          totalMs: Math.round(performance.now() - start),
          stages: timings.map(({ stage, ms }) => ({ stage, ms: Math.round(ms) })),
        });
      }
    }
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

  async refreshAnnotation(annotation: Annotation): Promise<Annotation | null> {
    return this.annotationsRepository.get(annotation.collectionId, annotation.id);
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

  async saveReadingStatus(sourceId: SourceId, status: ReadingStatus): Promise<Source> {
    if (!this.sources.updateReadingStatus) {
      throw new Error("This collection cannot change reading status.");
    }
    const updated = await this.sources.updateReadingStatus({
      collectionId: this.collectionId,
      sourceId,
      status,
      changedAt: this.runtime.clock.now(),
    });
    this.#replaceSource(updated);
    return updated;
  }

  async saveSourceFields(
    sourceId: SourceId,
    fields: Readonly<Record<string, unknown>>,
  ): Promise<Source> {
    if (!this.sources.updateFields) {
      throw new Error("This collection cannot edit source fields.");
    }
    const updated = await this.sources.updateFields({
      collectionId: this.collectionId,
      sourceId,
      fields,
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

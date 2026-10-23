import {
  createAnnotation,
  deleteAnnotation,
  attachSourceFile,
  citekeyForCitation,
  createSourceRecord,
  importSourceFile,
  loadedCitation,
  normalizedSourceUrl,
  sameSourceUrl,
  planAnnotationDeletion,
  saveSourceCitation,
  transcludeAnnotation,
  updateAnnotationBody,
} from "@mdbase-reader/core";

import { captureCitationProvenance } from "./capture-citation-provenance.js";
import {
  annotationViewConfiguration,
  buildAnnotationView,
  buildSourceAnnotationsView,
  readerViewKind,
} from "./mdbase-annotation-views.js";
import {
  buildLibraryView,
  defaultLibraryView,
  libraryViewConfiguration,
  libraryViewKey,
  type ExecutedLibraryView,
  type LibraryViewSaveRequest,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { SharedRequests } from "./shared-request.js";
import { completeLibrarySnapshot, loadSourceLibrary } from "./source-library-loader.js";

import type {
  ReaderLibraryRequestOptions,
  ReaderLibrarySnapshot,
  ReaderWorkspaceGateway,
} from "./workspace-model.js";
import type { JsonObject, LibraryViewRepository } from "@mdbase-reader/connect";
import type {
  Annotation,
  AnnotationListOptions,
  AnnotationDeletionPlan,
  AnnotationAssetRepository,
  AnnotationCreationRequest,
  AnnotationRepository,
  BodyUpdateRecovery,
  CitationCandidate,
  CitationResolutionRequest,
  Clock,
  CollectionFileRepository,
  CollectionId,
  ContentHasher,
  ContentSearchRepository,
  CslProvenance,
  FileId,
  FileRevision,
  DocumentRange,
  MutationJournal,
  ReaderRequestOptions,
  ReadingPosition,
  ReadingStatus,
  ReaderIdGenerator,
  Source,
  SourceDeletionPlan,
  SourceId,
  SourceFileAttachmentRequest,
  SourceFileImportRequest,
  SourceImportOptions,
  SourceRecordCreationRequest,
  SourceImportRepository,
  SourceRepository,
  SourceSummary,
} from "@mdbase-reader/core";

const noop = (): void => undefined;

export class ConnectWorkspaceGateway implements ReaderWorkspaceGateway {
  #library: ReaderLibrarySnapshot["sources"] | null = null;
  /** Bumped when a change outside this workspace makes the cached library stale. */
  #libraryGeneration = 0;
  readonly #libraryLoads = new SharedRequests<
    string,
    ReaderLibrarySnapshot,
    ReaderLibrarySnapshot
  >();
  readonly #sourceLoads = new SharedRequests<SourceId, Source | null>();
  readonly #sourcesById = new Map<SourceId, Source>();
  readonly #annotationsBySource = new Map<SourceId, readonly Annotation[]>();
  readonly #countListeners = new Set<() => void>();
  #countsRevision = 0;
  #annotationCacheEpoch = 0;
  #annotationRevision = 0;
  readonly #annotationListeners = new Set<() => void>();
  readonly subscribeAnnotationChanges = (listener: () => void): (() => void) => {
    this.#annotationListeners.add(listener);
    return () => {
      this.#annotationListeners.delete(listener);
    };
  };
  readonly annotationChangesRevision = (): number => this.#annotationRevision;
  #annotationsChanged(): void {
    this.#annotationRevision += 1;
    this.#annotationListeners.forEach((listener) => listener());
  }

  readonly subscribeAnnotationCounts = (listener: () => void): (() => void) => {
    this.#countListeners.add(listener);
    return () => {
      this.#countListeners.delete(listener);
    };
  };

  readonly annotationCountsRevision = (): number => this.#countsRevision;

  #countsChanged(): void {
    this.#annotationsChanged();
    this.#countsRevision += 1;
    for (const listener of this.#countListeners) {
      listener();
    }
  }

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
    private readonly bodyRecovery?: BodyUpdateRecovery,
    private readonly sourceChanges?: (listener: () => void) => () => void,
  ) {}

  /** Calls `listener` after another tab, app or device changed the library's
   * sources; the next `library()` reads them again. */
  readonly subscribeLibrary = (listener: () => void): (() => void) => {
    if (!this.sourceChanges) {
      return noop;
    }
    return this.sourceChanges(() => {
      this.#libraryGeneration += 1;
      this.#library = null;
      listener();
    });
  };

  async library(options: ReaderLibraryRequestOptions = {}): Promise<ReaderLibrarySnapshot> {
    options.signal?.throwIfAborted();
    if (this.#library) {
      return completeLibrarySnapshot(this.collectionName, this.#library);
    }
    const generation = this.#libraryGeneration;
    return this.#libraryLoads.get(
      `library:${String(generation)}`,
      options,
      async (signal, onProgress) => {
        const snapshot = await loadSourceLibrary({
          repository: this.sources,
          collectionId: this.collectionId,
          collectionName: this.collectionName,
          options: { signal },
          onProgress,
        });
        signal.throwIfAborted();
        // A load that a later change overtook must not become the cached library.
        if (generation === this.#libraryGeneration) {
          this.#library = snapshot.sources;
        }
        return snapshot;
      },
      options.onProgress,
    );
  }

  async source(id: SourceId, options: ReaderRequestOptions = {}): Promise<Source | null> {
    options.signal?.throwIfAborted();
    const cached = this.#sourcesById.get(id);
    if (cached) {
      return cached;
    }
    return this.#sourceLoads.get(id, options, async (signal) => {
      const source = await this.sources.get(this.collectionId, id, { signal });
      signal.throwIfAborted();
      // A local write or explicit refresh may have overtaken the pending read.
      const latest = this.#sourcesById.get(id) ?? source;
      if (latest) {
        this.#sourcesById.set(id, latest);
      }
      return latest;
    });
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
    // "Annotations for this source" needs a source to run against, so it is not a library view.
    return [
      defaultLibraryView,
      ...listed.views.flatMap((document) =>
        document.views
          .filter((view) => {
            const kind = readerViewKind(view.presentation);
            return kind === "sources" || kind === "annotations";
          })
          .map((view) => ({
            key: libraryViewKey(document.source.path, view.id),
            path: document.source.path,
            revision: document.source.revision,
            viewId: view.id,
            name: view.name,
            writable: document.source.writable,
            owned: true,
            properties: view.properties.map(({ key, label }) => ({
              key,
              ...(label ? { label } : {}),
            })),
            configuration: libraryViewConfiguration(view.presentation),
            ...(readerViewKind(view.presentation) === "annotations"
              ? { annotations: annotationViewConfiguration(view.presentation) }
              : {}),
          })),
      ),
    ];
  }

  async executeLibraryView(
    view: MdbaseLibraryView,
    options: ReaderRequestOptions = {},
  ): Promise<ExecutedLibraryView> {
    if (!view.path || !this.libraryViewRepository) {
      const library = await this.library(options);
      return {
        sources: library.sources,
        valuesByPath: new Map(),
        totalCount: library.sources.length,
      };
    }
    // The view query does not depend on the library, so neither waits for the other.
    const [library, execution] = await Promise.all([
      this.library(options),
      this.libraryViewRepository.execute({ path: view.path, view: view.viewId }, options),
    ]);
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
    const frontmatter = request.annotations
      ? buildAnnotationView({
          name: request.name,
          configuration: request.annotations,
          ...(request.fieldShapes ? { fieldShapes: request.fieldShapes } : {}),
        })
      : buildLibraryView(request);
    const saved = await this.libraryViewRepository.save(
      request.existing?.path
        ? {
            path: request.existing.path,
            frontmatter,
            replace: request.existing.revision ? { revision: request.existing.revision } : {},
          }
        : { path: viewPath(frontmatter), frontmatter },
    );
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

  async executeAnnotationView(
    view: MdbaseLibraryView,
    options: ReaderRequestOptions = {},
  ): Promise<ReadonlySet<string>> {
    if (!view.path || !this.libraryViewRepository) {
      throw new Error("Saved mdbase views are unavailable for this collection.");
    }
    const execution = await this.libraryViewRepository.execute(
      { path: view.path, view: view.viewId },
      options,
    );
    return new Set(execution.results.map((row) => row.path));
  }

  async ensureSourceAnnotationsView(): Promise<{
    readonly path: string;
    readonly created: boolean;
  }> {
    if (!this.libraryViewRepository) {
      throw new Error("Saved mdbase views are unavailable for this collection.");
    }
    const listed = await this.libraryViewRepository.list();
    const existing = listed.views.find((document) =>
      document.views.some((view) => readerViewKind(view.presentation) === "source-annotations"),
    );
    if (existing) {
      return { path: existing.source.path, created: false };
    }
    const frontmatter = buildSourceAnnotationsView();
    const saved = await this.libraryViewRepository.save({
      path: viewPath(frontmatter),
      frontmatter,
    });
    return { path: saved.path, created: true };
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

  async annotationsForSources(
    ids: ReadonlySet<SourceId>,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    if (!this.annotationsRepository.listAll) {
      throw new Error("This collection cannot batch-load chapter annotations.");
    }
    return this.annotationsRepository.listAll(this.collectionId, {
      ...options,
      sourceIds: ids,
      refresh: true,
    });
  }

  async moveAnnotationOwner(annotation: Annotation, owner: Source): Promise<Annotation> {
    if (!this.annotationsRepository.moveOwner) {
      throw new Error("This collection cannot move annotation owners.");
    }
    const updated = await this.annotationsRepository.moveOwner({
      annotation,
      owner,
      modifiedAt: this.runtime.clock.now(),
    });
    this.#annotationCacheEpoch += 1;
    this.#annotationsBySource.delete(annotation.sourceId);
    this.#annotationsBySource.delete(owner.id);
    this.#countsChanged();
    return updated;
  }

  annotationSourceIds(options: ReaderRequestOptions = {}): Promise<readonly SourceId[]> {
    return (
      this.annotationsRepository.sourceIdsWithAnnotations?.(this.collectionId, options) ??
      Promise.resolve([...this.#annotationsBySource.keys()])
    );
  }

  async allAnnotations(options: AnnotationListOptions = {}): Promise<readonly Annotation[]> {
    if (!this.annotationsRepository.listAll) {
      throw new Error("This collection cannot list all annotations.");
    }
    const epoch = this.#annotationCacheEpoch;
    const annotations = await this.annotationsRepository.listAll(this.collectionId, options);
    if (options.refresh) {
      this.#countsChanged();
    }
    // A scoped view is not a complete source list; never seed the per-source cache from it.
    if (options.paths) {
      return annotations;
    }
    // The overview reads whole records, so opening one of these sources needs no further reads.
    // Sources already cached keep their entries, which may include saves made meanwhile.
    const bySource = new Map<SourceId, Annotation[]>();
    for (const annotation of annotations) {
      const items = bySource.get(annotation.sourceId) ?? [];
      items.push(annotation);
      bySource.set(annotation.sourceId, items);
    }
    if (options.refresh && epoch === this.#annotationCacheEpoch) {
      this.#annotationsBySource.clear();
    }
    for (const [sourceId, items] of bySource) {
      if (!this.#annotationsBySource.has(sourceId)) {
        this.#annotationsBySource.set(sourceId, items);
      }
    }
    return annotations;
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

  async recoverSourceBody(requestId: string): Promise<Source> {
    const recovered = await this.#bodyRecovery().recoverSource({
      collectionId: this.collectionId,
      requestId,
    });
    this.#replaceSource(recovered);
    return recovered;
  }

  async recoverAnnotationBody(requestId: string): Promise<Annotation> {
    const recovered = await this.#bodyRecovery().recoverAnnotation({
      collectionId: this.collectionId,
      requestId,
    });
    this.#annotationCacheEpoch += 1;
    if (recovered.path) {
      this.annotationsRepository.invalidateRecord?.(recovered.path);
    }
    const current = this.#annotationsBySource.get(recovered.sourceId) ?? [];
    this.#annotationsBySource.set(
      recovered.sourceId,
      current.map((candidate) => (candidate.id === recovered.id ? recovered : candidate)),
    );
    return recovered;
  }

  mutationPending(requestId: string): boolean {
    return this.bodyRecovery?.pending(requestId) ?? false;
  }

  #bodyRecovery(): BodyUpdateRecovery {
    if (!this.bodyRecovery) {
      throw new Error("Exact recovery is unavailable here. No new write was attempted.");
    }
    return this.bodyRecovery;
  }

  async saveSourceCitation(
    source: Source,
    citation: unknown,
    options: Parameters<ReaderWorkspaceGateway["saveSourceCitation"]>[2] = {},
  ): Promise<Source> {
    const expectedCitation = loadedCitation(source);
    const updated = await saveSourceCitation(this.sources, source, this.#library ?? [], citation, {
      ...(expectedCitation !== undefined ? { expectedCitation } : {}),
      ...options,
    });
    this.#replaceSource(updated);
    return updated;
  }

  async citationClaims(
    request: Parameters<NonNullable<ReaderWorkspaceGateway["citationClaims"]>>[0],
    options: ReaderRequestOptions = {},
  ): Promise<Awaited<ReturnType<NonNullable<ReaderWorkspaceGateway["citationClaims"]>>>> {
    const { lookUpCitationClaims } = await import("@mdbase-reader/web-capture/citation-updates");
    return lookUpCitationClaims(request, {
      clientName: `mdbase-reader (${globalThis.location.origin})`,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }

  async resolveCitation(
    request: CitationResolutionRequest,
    options: ReaderRequestOptions = {},
  ): Promise<CitationCandidate> {
    // Loaded on first lookup; only the query leaves the browser, never collection data.
    const { lookUpCitation } = await import("@mdbase-reader/web-capture/citation-lookup");
    return lookUpCitation(request, {
      clientName: `mdbase-reader (${globalThis.location.origin})`,
      ...(options.signal ? { signal: options.signal } : {}),
    });
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
    options: NonNullable<Parameters<ReaderWorkspaceGateway["readFile"]>[2]> = {},
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
    const postUrl = request.metadata?.socialPost?.url;
    if (postUrl) {
      const found = this.sources.findByUrl
        ? await this.sources.findByUrl(this.collectionId, postUrl, options)
        : (await this.library(options.signal ? { signal: options.signal } : {})).sources.find(
            (source) => source.url && sameSourceUrl(source.url, normalizedSourceUrl(postUrl)),
          );
      if (found) {
        const existing = await this.source(found.id, options);
        if (existing) {
          return existing;
        }
      }
    }
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

  async createSource(
    request: Omit<SourceRecordCreationRequest, "collectionId">,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    const created = await createSourceRecord(
      { imports: this.sourceImports, ...this.runtime },
      { ...request, collectionId: this.collectionId },
      options,
    );
    this.#replaceSource(created, true);
    return created;
  }

  async attachSourceFile(
    request: SourceFileAttachmentRequest,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    const updated = await attachSourceFile(
      { imports: this.sourceImports, ...this.runtime },
      request,
      options,
    );
    this.#replaceSource(updated);
    return updated;
  }

  async saveNewSourceCitation(
    source: Source,
    citation: Readonly<Record<string, unknown>>,
    provenance?: CslProvenance,
  ): Promise<Source> {
    const { sources } = await this.library();
    return this.saveSourceCitation(
      source,
      { ...citation, id: citekeyForCitation(citation, sources, source.id) },
      provenance !== undefined
        ? { provenance: captureCitationProvenance(citation, provenance) }
        : {},
    );
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
      this.#annotationCacheEpoch += 1;
      const current = this.#annotationsBySource.get(request.sourceId) ?? [];
      this.#annotationsBySource.set(request.sourceId, [result.annotation, ...current]);
      this.#countsChanged();
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
    this.#annotationCacheEpoch += 1;
    const current = this.#annotationsBySource.get(annotation.sourceId) ?? [];
    this.#annotationsBySource.set(
      annotation.sourceId,
      current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
    this.#annotationsChanged();
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
    this.#annotationCacheEpoch += 1;
    const current = this.#annotationsBySource.get(annotation.sourceId) ?? [];
    this.#annotationsBySource.set(
      annotation.sourceId,
      current.filter((candidate) => candidate.id !== annotation.id),
    );
    this.#countsChanged();
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
    progress?: number | null,
  ): Promise<Source> {
    // Callers may hold the source as it was when the document opened; each save replaces the
    // cached copy, so it carries the newest revision this session has seen.
    const latest = this.#sourcesById.get(source.id) ?? source;
    const updated = await this.sources.updateReading({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: latest.recordRevision,
      expectedFrontmatter: latest.frontmatter,
      documentFileId,
      position,
      ...(progress !== undefined ? { progress } : {}),
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

  async sourceParts(
    id: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceSummary[]> {
    if (!this.sources.sourceParts) {
      throw new Error("This collection cannot list source parts.");
    }
    return this.sources.sourceParts(this.collectionId, id, options);
  }

  async setSourcePartOf(source: Source, parentId: SourceId | null): Promise<Source> {
    if (!this.sources.setSourcePartOf) {
      throw new Error("This collection cannot set source parents.");
    }
    const updated = await this.sources.setSourcePartOf({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      parentId,
    });
    this.#replaceSource(updated);
    this.#annotationsChanged();
    return updated;
  }

  async setDocumentRange(
    source: Source,
    documentFileId: FileId,
    expectedDocumentRevision: FileRevision,
    range: DocumentRange | null,
  ): Promise<Source> {
    if (!this.sources.setDocumentRange) {
      throw new Error("This collection cannot set document ranges.");
    }
    const updated = await this.sources.setDocumentRange({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      documentFileId,
      expectedDocumentRevision,
      range,
    });
    this.#replaceSource(updated);
    this.#annotationsChanged();
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

  async planSourceRemoval(id: SourceId): Promise<SourceDeletionPlan> {
    if (!this.sources.preflightDelete) {
      throw new Error("This collection cannot remove sources.");
    }
    // Check the revision the collection holds now, not a copy cached when the source opened.
    const source = await this.refreshSource(id);
    if (!source) {
      throw new Error("This source is no longer in the collection.");
    }
    return this.sources.preflightDelete(source);
  }

  async removeSource(plan: SourceDeletionPlan): Promise<void> {
    if (!this.sources.delete) {
      throw new Error("This collection cannot remove sources.");
    }
    await this.sources.delete(plan);
    this.#sourcesById.delete(plan.sourceId);
    if (this.#library) {
      this.#library = this.#library.filter(({ id }) => id !== plan.sourceId);
    }
    this.#countsChanged();
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

/** New views live beside each other under `views/`, named by their stable view ID. */
function viewPath(frontmatter: JsonObject): string {
  return `views/${String(frontmatter["id"])}.md`;
}

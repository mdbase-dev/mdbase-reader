import { createAnnotation, importSourceFile } from "@mdbase-reader/core";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationAssetRepository,
  AnnotationCreationRequest,
  AnnotationRepository,
  Clock,
  CollectionId,
  ContentHasher,
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
  ) {}

  async library(options: ReaderRequestOptions = {}): Promise<ReaderLibrarySnapshot> {
    if (!this.#library) {
      this.#library = await listAllSources(this.sources, this.collectionId, options);
    }
    return {
      collectionName: this.collectionName,
      sources: this.#library,
      connectionState: "connected",
    };
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
    this.#sourcesById.set(source.id, updated);
    return updated;
  }

  async importSourceFile(request: Omit<SourceFileImportRequest, "collectionId">): Promise<Source> {
    const imported = await importSourceFile(
      { imports: this.sourceImports, ...this.runtime },
      { ...request, collectionId: this.collectionId },
    );
    this.#sourcesById.set(imported.id, imported);
    this.#library = [imported, ...(this.#library ?? []).filter(({ id }) => id !== imported.id)];
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
    this.#sourcesById.set(source.id, updated);
    return updated;
  }
}

async function listAllSources(
  repository: SourceRepository,
  collectionId: CollectionId,
  options: ReaderRequestOptions,
): Promise<readonly SourceSummary[]> {
  const sources: SourceSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await repository.list(
      { collectionId, limit: 100, ...(cursor ? { cursor } : {}) },
      options,
    );
    sources.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("Reader received a repeated source-library cursor.");
    }
    if (cursor) {
      seenCursors.add(cursor);
    }
  } while (cursor);
  return sources;
}

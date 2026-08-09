import { createAnnotation, importSourceFile, saveSourceCitation } from "@mdbase-reader/core";

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
    this.#replaceSource(updated);
    return updated;
  }

  async saveSourceCitation(source: Source, citation: unknown): Promise<Source> {
    const updated = await saveSourceCitation(this.sources, source, this.#library ?? [], citation);
    this.#replaceSource(updated);
    return updated;
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

async function listAllSources(
  repository: SourceRepository,
  collectionId: CollectionId,
  options: ReaderRequestOptions,
): Promise<readonly SourceSummary[]> {
  const first = await repository.list({ collectionId, limit: 100 }, options);
  if (first.totalCount && first.totalCount > first.items.length) {
    const offsets = Array.from(
      { length: Math.ceil(first.totalCount / 100) - 1 },
      (_value, index) => (index + 1) * 100,
    );
    const pages = await mapWithConcurrency(offsets, 4, async (offset) =>
      repository.list({ collectionId, limit: 100, cursor: String(offset) }, options),
    );
    return [first, ...pages].flatMap(({ items }) => items);
  }
  const sources: SourceSummary[] = [...first.items];
  const seenCursors = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (seenCursors.has(cursor)) {
      throw new Error("Reader received a repeated source-library cursor.");
    }
    seenCursors.add(cursor);
    const page = await repository.list({ collectionId, limit: 100, cursor }, options);
    sources.push(...page.items);
    cursor = page.nextCursor;
  }
  return sources;
}

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  operation: (input: Input) => Promise<Output>,
): Promise<readonly Output[]> {
  const results: Output[] = new Array<Output>(inputs.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      if (input !== undefined) {
        results[index] = await operation(input);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return results;
}

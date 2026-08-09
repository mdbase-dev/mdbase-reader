import type { ReaderWorkspaceGateway, ReaderWorkspaceSnapshot } from "./workspace-model.js";
import type {
  AnnotationRepository,
  CollectionId,
  Source,
  SourceId,
  SourceRepository,
} from "@mdbase-reader/core";

export class ConnectWorkspaceGateway implements ReaderWorkspaceGateway {
  #selectedId: SourceId | null = null;
  #library: ReaderWorkspaceSnapshot["sources"] | null = null;
  readonly #sourcesById = new Map<SourceId, Promise<Source | null>>();
  readonly #annotationsBySource = new Map<
    SourceId,
    Promise<ReaderWorkspaceSnapshot["annotations"]>
  >();

  constructor(
    private readonly sources: SourceRepository,
    private readonly annotations: AnnotationRepository,
    private readonly collectionId: CollectionId,
    private readonly collectionName: string,
  ) {}

  async snapshot(): Promise<ReaderWorkspaceSnapshot> {
    return this.#load();
  }

  async selectSource(id: SourceId): Promise<ReaderWorkspaceSnapshot> {
    this.#selectedId = id;
    return this.#load();
  }

  async saveSourceBody(source: Source, body: string): Promise<ReaderWorkspaceSnapshot> {
    const updated = await this.sources.updateBody({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      body,
    });
    this.#sourcesById.set(source.id, Promise.resolve(updated));
    return this.#load();
  }

  async #load(): Promise<ReaderWorkspaceSnapshot> {
    if (!this.#library) {
      const library = await this.sources.list({ collectionId: this.collectionId, limit: 100 });
      this.#library = library.items;
    }
    this.#selectedId ??= this.#library[0]?.id ?? null;
    const selectedId = this.#selectedId;
    const [selectedSource, annotations] = selectedId
      ? await Promise.all([this.#source(selectedId), this.#annotations(selectedId)])
      : [null, []];
    return {
      collectionName: this.collectionName,
      sources: this.#library,
      selectedSource,
      annotations,
      connectionState: "connected",
    };
  }

  #source(id: SourceId): Promise<Source | null> {
    const cached = this.#sourcesById.get(id);
    if (cached) {
      return cached;
    }
    const pending = this.sources.get(this.collectionId, id).catch((reason: unknown) => {
      this.#sourcesById.delete(id);
      throw reason;
    });
    this.#sourcesById.set(id, pending);
    return pending;
  }

  #annotations(id: SourceId): Promise<ReaderWorkspaceSnapshot["annotations"]> {
    const cached = this.#annotationsBySource.get(id);
    if (cached) {
      return cached;
    }
    const pending = this.annotations
      .listForSource(this.collectionId, id)
      .catch((reason: unknown) => {
        this.#annotationsBySource.delete(id);
        throw reason;
      });
    this.#annotationsBySource.set(id, pending);
    return pending;
  }
}

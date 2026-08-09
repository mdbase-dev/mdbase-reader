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
    await this.sources.updateBody({
      collectionId: this.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      body,
    });
    return this.#load();
  }

  async #load(): Promise<ReaderWorkspaceSnapshot> {
    const library = await this.sources.list({ collectionId: this.collectionId, limit: 100 });
    this.#selectedId ??= library.items[0]?.id ?? null;
    const selectedSource = this.#selectedId
      ? await this.sources.get(this.collectionId, this.#selectedId)
      : null;
    const annotations = selectedSource
      ? await this.annotations.listForSource(this.collectionId, selectedSource.id)
      : [];
    return {
      collectionName: this.collectionName,
      sources: library.items,
      selectedSource,
      annotations,
      connectionState: "connected",
    };
  }
}

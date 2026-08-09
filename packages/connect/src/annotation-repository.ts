import { annotationContract } from "./contracts.js";
import { annotationFromDocument, annotationFrontmatter } from "./mapping.js";
import { outcomeValue, readWithOptions, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  Annotation,
  AnnotationId,
  AnnotationRepository,
  CollectionId,
  MutationId,
  ReaderRequestOptions,
  SourceId,
} from "@mdbase-reader/core";

export class ConnectAnnotationRepository implements AnnotationRepository {
  readonly #pathsById = new Map<string, string>();
  readonly #pathsBySource = new Map<string, string[]>();
  #indexPromise: Promise<void> | null = null;

  constructor(private readonly client: ReaderConnectClient) {}

  async listForSource(
    collection: CollectionId,
    source: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    await this.#ensureIndex();
    const matchingPaths = this.#pathsBySource.get(source) ?? [];
    return Promise.all(
      matchingPaths.map(async (path) => {
        const document = outcomeValue(
          await readWithOptions(this.client, { path, includeDocument: true }, options),
          "read annotation",
        );
        return annotationFromDocument(collection, document);
      }),
    );
  }

  async create(annotation: Annotation, _idempotencyKey: MutationId): Promise<Annotation> {
    const result = outcomeValue(
      await this.client.create({
        path: `annotations/${annotation.id}.md`,
        type: "reader-annotation",
        frontmatter: annotationFrontmatter(annotation),
        body: annotation.body,
        includeDocument: true,
      }),
      "create annotation",
    );
    const created = annotationFromDocument(annotation.collectionId, result);
    this.#pathsById.set(created.id, result.path);
    if (this.#indexPromise) {
      const paths = this.#pathsBySource.get(created.sourceId) ?? [];
      if (!paths.includes(result.path)) {
        paths.push(result.path);
        this.#pathsBySource.set(created.sourceId, paths);
      }
    }
    return created;
  }

  async get(
    collection: CollectionId,
    id: AnnotationId,
    options: ReaderRequestOptions = {},
  ): Promise<Annotation | null> {
    const path =
      this.#pathsById.get(id) ??
      (await recordPathById(this.client, annotationContract, id, options));
    if (!path) {
      return null;
    }
    const result = outcomeValue(
      await readWithOptions(this.client, { path, includeDocument: true }, options),
      "read annotation",
    );
    return annotationFromDocument(collection, result);
  }

  async #buildIndex(): Promise<void> {
    let offset = 0;
    let hasMore: boolean;
    do {
      const result = outcomeValue(
        await this.client.query({
          contract: annotationContract,
          frontmatterMode: "effective",
          limit: 500,
          offset,
        }),
        "query annotations",
      );
      for (const record of result.results) {
        const fields = record.effectiveFrontmatter ?? record.frontmatter;
        const id = stringField(fields?.["id"]);
        const source = linkedRecordId(fields?.["source"]);
        if (id && source) {
          this.#pathsById.set(id, record.path);
          const paths = this.#pathsBySource.get(source) ?? [];
          paths.push(record.path);
          this.#pathsBySource.set(source, paths);
        }
      }
      hasMore = Boolean(result.meta?.hasMore && result.results.length > 0);
      offset += result.results.length;
    } while (hasMore);
  }

  async #ensureIndex(): Promise<void> {
    this.#indexPromise ??= this.#buildIndex().catch((reason: unknown) => {
      this.#indexPromise = null;
      this.#pathsById.clear();
      this.#pathsBySource.clear();
      throw reason;
    });
    return this.#indexPromise;
  }
}

function stringField(candidate: unknown): string | undefined {
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

function linkedRecordId(candidate: unknown): string | undefined {
  const value = stringField(candidate);
  if (!value) {
    return undefined;
  }
  return /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(value)?.[1] ?? value;
}

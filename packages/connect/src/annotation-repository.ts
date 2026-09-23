import { annotationContract } from "./contracts.js";
import { annotationFromDocument, annotationFrontmatter } from "./mapping.js";
import {
  mapConcurrent,
  outcomeValue,
  readWithOptions,
  readerConnectBulkConcurrency,
  recordPathById,
} from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { DeletePreflightResult } from "@mdbase-dev/connect";
import type {
  Annotation,
  AnnotationDeletionPlan,
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
  readonly #deletePreflights = new Map<string, DeletePreflightResult>();
  #indexPromise: Promise<void> | null = null;

  constructor(private readonly client: ReaderConnectClient) {}

  async sourceIdsWithAnnotations(
    _collection: CollectionId,
    _options: ReaderRequestOptions = {},
  ): Promise<readonly SourceId[]> {
    await this.#ensureIndex();
    return [...this.#pathsBySource.keys()] as SourceId[];
  }

  async annotationCountsBySource(
    _collection: CollectionId,
    _options: ReaderRequestOptions = {},
  ): Promise<ReadonlyMap<SourceId, number>> {
    await this.#ensureIndex();
    return new Map(
      [...this.#pathsBySource].map(([source, paths]) => [source as SourceId, paths.length]),
    );
  }

  async listForSource(
    collection: CollectionId,
    source: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    await this.#ensureIndex();
    const matchingPaths = this.#pathsBySource.get(source) ?? [];
    return mapConcurrent(matchingPaths, readerConnectBulkConcurrency, async (path) => {
      const document = outcomeValue(
        await readWithOptions(this.client, { path, includeDocument: true }, options),
        "read annotation",
      );
      return annotationFromDocument(collection, document);
    });
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

  async updateBody(input: {
    readonly annotation: Annotation;
    readonly body: string;
    readonly modifiedAt: Annotation["createdAt"];
  }): Promise<Annotation> {
    const { annotation } = input;
    if (!annotation.path || !annotation.recordRevision) {
      throw new Error("An annotation path and revision are required for editing.");
    }
    const result = outcomeValue(
      await this.client.update({
        path: annotation.path,
        ifRevision: annotation.recordRevision,
        patch: { modified_at: input.modifiedAt },
        body: input.body,
        includeDocument: true,
      }),
      "update annotation",
    );
    const updated = annotationFromDocument(annotation.collectionId, result);
    this.#pathsById.set(updated.id, result.path);
    return updated;
  }

  async preflightDelete(annotation: Annotation): Promise<AnnotationDeletionPlan> {
    const { path, recordRevision } = canonicalIdentity(annotation);
    const result = outcomeValue(
      await this.client.preflightDelete({ path, ifRevision: recordRevision }),
      "check annotation deletion",
    );
    this.#deletePreflights.set(deletionKey(path, recordRevision), result);
    return {
      annotationId: annotation.id,
      path,
      expectedRevision: recordRevision,
      brokenLinkPaths: uniquePaths(result.brokenLinks),
    };
  }

  async delete(annotation: Annotation, plan: AnnotationDeletionPlan): Promise<void> {
    const { path, recordRevision } = canonicalIdentity(annotation);
    const key = deletionKey(path, recordRevision);
    const preflight = this.#deletePreflights.get(key);
    if (!preflight || plan.path !== path || plan.expectedRevision !== recordRevision) {
      throw new Error("Annotation deletion requires a current preflight confirmation.");
    }
    try {
      const result = outcomeValue(
        await this.client.deleteWithProgress(
          { path, ifRevision: recordRevision, checkBacklinks: true },
          { preflight },
        ),
        "delete annotation",
      );
      if (!result.deleted) {
        throw new Error(`mdbase Connect did not delete annotation ${annotation.id}.`);
      }
      this.#pathsById.delete(annotation.id);
      const paths = this.#pathsBySource.get(annotation.sourceId);
      if (paths) {
        this.#pathsBySource.set(
          annotation.sourceId,
          paths.filter((candidate) => candidate !== path),
        );
      }
    } finally {
      this.#deletePreflights.delete(key);
    }
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
    for await (const outcome of this.client.queryPages(
      {
        contract: annotationContract,
        frontmatterMode: "effective",
      },
      { firstPageSize: 500, pageSize: 1_000 },
    )) {
      const page = outcomeValue(outcome, "query annotations");
      for (const record of page.results) {
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
    }
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

function canonicalIdentity(annotation: Annotation): {
  readonly path: string;
  readonly recordRevision: NonNullable<Annotation["recordRevision"]>;
} {
  if (!annotation.path || !annotation.recordRevision) {
    throw new Error("An annotation path and revision are required for deletion.");
  }
  return { path: annotation.path, recordRevision: annotation.recordRevision };
}

function deletionKey(path: string, revision: string): string {
  return `${path}\n${revision}`;
}

function uniquePaths(links: readonly { readonly path: string }[] | undefined): readonly string[] {
  return [...new Set(links?.map(({ path }) => path) ?? [])].sort((left, right) =>
    left.localeCompare(right),
  );
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

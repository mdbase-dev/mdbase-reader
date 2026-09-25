import * as sources from "./annotation-source.js";
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
import type { DeletePreflightResult, RecordDocument } from "@mdbase-dev/connect";
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
  readonly #resolveSource: ReturnType<typeof sources.annotationSourceResolver>;
  readonly #pathsById = new Map<string, string>();
  readonly #pathsBySource = new Map<string, string[]>();
  readonly #deletePreflights = new Map<string, DeletePreflightResult>();
  #indexPromise: Promise<void> | null = null;

  constructor(private readonly client: ReaderConnectClient) {
    this.#resolveSource = sources.annotationSourceResolver(client);
  }

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

  async listAll(
    collection: CollectionId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    // Contract queries cannot include bodies, so list the paths and read each record.
    const paths: string[] = [];
    for await (const outcome of this.client.queryPages(
      {
        contract: annotationContract,
        // Some authorities apply the contract as a view, not a filter; the type narrows the scan.
        types: ["reader-annotation"],
        frontmatterMode: "effective",
      },
      { ...options, firstPageSize: 500, pageSize: 1_000 },
    )) {
      paths.push(...outcomeValue(outcome, "query annotations").results.map(({ path }) => path));
    }
    const annotations = await mapConcurrent(paths, readerConnectBulkConcurrency, async (path) => {
      const document = outcomeValue(
        await readWithOptions(this.client, { path, includeDocument: true }, options),
        "read annotation",
      );
      try {
        return await this.#map(collection, document);
      } catch {
        // A record that does not satisfy the annotation contract is left out of the overview.
        return null;
      }
    });
    const listed = annotations.filter((annotation) => annotation !== null);
    for (const annotation of listed) {
      if (annotation.path) {
        this.#remember(annotation.id, annotation.sourceId, annotation.path);
      }
    }
    return listed;
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
      return this.#map(collection, document);
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
    const created = await this.#map(annotation.collectionId, result);
    this.#remember(created.id, created.sourceId, result.path);
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
    const updated = await this.#map(annotation.collectionId, result);
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
      (await recordPathById(this.client, annotationContract, id, options, this.#pathsById));
    if (!path) {
      return null;
    }
    const result = outcomeValue(
      await readWithOptions(this.client, { path, includeDocument: true }, options),
      "read annotation",
    );
    return this.#map(collection, result);
  }

  async #map(collection: CollectionId, record: RecordDocument): Promise<Annotation> {
    return annotationFromDocument(
      collection,
      record,
      await this.#resolveSource(record.effectiveFrontmatter["source"]),
    );
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
        const id = sources.stringField(fields?.["id"]);
        if (id && sources.annotationSourceReference(fields?.["source"])) {
          const source = await this.#resolveSource(fields?.["source"]);
          this.#remember(id, source, record.path);
        }
      }
    }
  }

  /**
   * Records where an annotation lives. Per-source paths are only kept once the index exists,
   * since a partial list would otherwise stand in for the source's full set.
   */
  #remember(id: string, source: string, path: string): void {
    this.#pathsById.set(id, path);
    if (!this.#indexPromise) {
      return;
    }
    const paths = this.#pathsBySource.get(source) ?? [];
    if (!paths.includes(path)) {
      paths.push(path);
      this.#pathsBySource.set(source, paths);
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

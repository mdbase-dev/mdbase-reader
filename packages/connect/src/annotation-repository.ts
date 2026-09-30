import { annotationPathsForSource } from "./annotation-query.js";
import * as sources from "./annotation-source.js";
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
  readonly #deletePreflights = new Map<string, DeletePreflightResult>();

  constructor(private readonly client: ReaderConnectClient) {}

  async sourceIdsWithAnnotations(
    _collection: CollectionId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceId[]> {
    return [...(await this.#buildIndex(options)).keys()] as SourceId[];
  }

  async annotationCountsBySource(
    _collection: CollectionId,
    options: ReaderRequestOptions = {},
  ): Promise<ReadonlyMap<SourceId, number>> {
    return new Map(
      [...(await this.#buildIndex(options))].map(([source, paths]) => [
        source as SourceId,
        paths.length,
      ]),
    );
  }

  async listAll(
    collection: CollectionId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    // Queries cannot include bodies, so list the paths and read each record.
    const listed = await this.#annotationSources(options);
    const annotations = await mapConcurrent(listed, readerConnectBulkConcurrency, async (entry) => {
      const document = outcomeValue(
        await readWithOptions(this.client, { path: entry.path, includeDocument: true }, options),
        "read annotation",
      );
      try {
        return await this.#map(collection, document, entry.source);
      } catch {
        // A record that does not satisfy the annotation contract is left out of the overview.
        return null;
      }
    });
    return annotations.filter((annotation) => annotation !== null);
  }

  async listForSource(
    collection: CollectionId,
    source: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    const matchingPaths = await annotationPathsForSource(this.client, source, options);
    const annotations = await mapConcurrent(
      matchingPaths,
      readerConnectBulkConcurrency,
      async (path) => {
        const document = outcomeValue(
          await readWithOptions(this.client, { path, includeDocument: true }, options),
          "read annotation",
        );
        // The query matched these by the target of their link, so the source is known.
        return this.#map(collection, document, source);
      },
    );
    return annotations.filter((annotation) => annotation.sourceId === source);
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
    // Reader wrote this link to the source it already knows.
    return this.#map(annotation.collectionId, result, annotation.sourceId);
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
    // The revision check guarantees the source link is the one already resolved.
    return this.#map(annotation.collectionId, result, annotation.sourceId);
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
    } finally {
      this.#deletePreflights.delete(key);
    }
  }

  async get(
    collection: CollectionId,
    id: AnnotationId,
    options: ReaderRequestOptions = {},
  ): Promise<Annotation | null> {
    const path = await recordPathById(this.client, id, options);
    if (!path) {
      return null;
    }
    const result = outcomeValue(
      await readWithOptions(this.client, { path, includeDocument: true }, options),
      "read annotation",
    );
    return this.#map(collection, result);
  }

  /** Maps a record; `source` is its resolved source when the caller already knows it. */
  async #map(
    collection: CollectionId,
    record: RecordDocument,
    source?: SourceId,
  ): Promise<Annotation> {
    return annotationFromDocument(
      collection,
      record,
      source ?? (await sources.resolveAnnotationSource(this.client, record.path)),
    );
  }

  async #buildIndex(options: ReaderRequestOptions): Promise<Map<string, string[]>> {
    const index = new Map<string, string[]>();
    for (const { path, source } of await this.#annotationSources(options)) {
      const paths = index.get(source) ?? [];
      paths.push(path);
      index.set(source, paths);
    }
    return index;
  }

  /** Every annotation with the source mdbase resolves its link to, in one query. */
  async #annotationSources(
    options: ReaderRequestOptions,
  ): Promise<{ readonly path: string; readonly source: SourceId }[]> {
    const listed: { path: string; source: SourceId }[] = [];
    for await (const outcome of this.client.queryPages(
      sources.withResolvedSource({
        types: ["reader-annotation"],
        select: ["id", "source"],
        frontmatterMode: "effective",
      }),
      { ...options, firstPageSize: 500, pageSize: 1_000 },
    )) {
      for (const record of outcomeValue(outcome, "query annotations").results) {
        const fields = record.effectiveFrontmatter ?? record.frontmatter;
        // A broken source link belongs to no source.
        const source = sources.annotationSourceFromResult(record);
        if (sources.stringField(fields?.["id"]) && source) {
          listed.push({ path: record.path, source });
        }
      }
    }
    return listed;
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

import { annotationCandidatesForSource, annotationRecordsAt } from "./annotation-query.js";
import { AnnotationRecordCache } from "./annotation-record-cache.js";
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
import type {
  DeletePreflightResult,
  QueryRecord,
  QueryMetadataRecord,
  QueryPage,
  QueryMetadataPage,
  ReadManyRecord,
} from "@mdbase-dev/connect";
import type {
  Annotation,
  AnnotationListOptions,
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

  readonly #records: AnnotationRecordCache;

  constructor(private readonly client: ReaderConnectClient) {
    this.#records = new AnnotationRecordCache(client);
  }

  invalidateRecord(path: string): void {
    this.#records.delete(path);
  }

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
    options: AnnotationListOptions = {},
  ): Promise<readonly Annotation[]> {
    if (options.paths?.size === 0) {
      return [];
    }
    // Keep the first batches responsive; grow publication intervals as the list grows.
    // Hydration stays bounded even when cumulative UI snapshots become less frequent.
    const annotations: Annotation[] = [];
    const batchReads = outcomeValue(
      await this.client.supportsAuthorityFeature("read-many-documents-v1", options),
      "discover annotation batches",
    );
    let published = 0;
    const publish = (): void => {
      if (options.onProgress) {
        options.onProgress([...annotations]);
      }
      published = annotations.length;
    };
    for await (const page of this.#annotationSourcePages(options)) {
      for (let offset = 0; offset < page.length;) {
        options.signal?.throwIfAborted();
        // A small first batch minimizes time to content; larger later batches limit rerenders.
        const batchSize = annotations.length === 0 ? 16 : 64;
        const entries = page.slice(offset, offset + batchSize);
        const matches = batchReads
          ? await annotationRecordsAt(
              this.client,
              entries.map(({ path }) => path),
              options,
            )
          : new Map<string, ReadManyRecord>();
        const batch = await mapConcurrent(entries, readerConnectBulkConcurrency, async (entry) => {
          if (batchReads && !matches.has(entry.path)) {
            return null;
          }
          const document =
            revisionedAnnotation(matches.get(entry.path)) ??
            (await this.#records.read(entry.path, options, options.refresh));
          try {
            return await this.#map(
              collection,
              document,
              document.effectiveFrontmatter["source"] === entry.reference
                ? entry.source
                : undefined,
            );
          } catch {
            // Invalid records do not belong in the overview.
            return null;
          }
        });
        options.signal?.throwIfAborted();
        annotations.push(...batch.filter((annotation) => annotation !== null));
        offset += batchSize;
        if (
          annotations.length <= 128 ||
          annotations.length - published >= Math.max(16, Math.ceil(published / 4))
        ) {
          publish();
        }
      }
    }
    if (annotations.length > published) {
      publish();
    }
    return annotations;
  }

  async listForSource(
    collection: CollectionId,
    source: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    const candidates = await annotationCandidatesForSource(this.client, source, options);
    const paths = [...candidates.keys()];
    options.signal?.throwIfAborted();
    if (paths.length === 0) {
      return [];
    }
    const batchReads = outcomeValue(
      await this.client.supportsAuthorityFeature("read-many-documents-v1", options),
      "discover annotation batches",
    );
    const pending = annotationRecordsAt(this.client, paths, options);
    const matches = batchReads
      ? await pending
      : await pending.catch(() => {
          options.signal?.throwIfAborted();
          return new Map<string, ReadManyRecord>();
        });
    const annotations = await mapConcurrent(paths, readerConnectBulkConcurrency, async (path) => {
      if (batchReads && !matches.has(path)) {
        return null;
      }
      // Qualified batches pair content with its revision; legacy rows still need revalidation.
      const match = matches.get(path);
      const document =
        revisionedAnnotation(match) ??
        (match && this.#records.current(match)) ??
        (await this.#records.read(path, options, true));
      // Discovery and hydration are separate reads: re-resolve a changed source reference.
      return this.#map(
        collection,
        document,
        document.effectiveFrontmatter["source"] === candidates.get(path) ? source : undefined,
      );
    });
    options.signal?.throwIfAborted();
    return annotations.filter(
      (annotation): annotation is Annotation =>
        annotation !== null && annotation.sourceId === source,
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
    this.#records.put(result);
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
    this.#records.put(result);
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
      this.#records.delete(path);
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
    this.#records.put(result);
    return this.#map(collection, result);
  }

  /** Maps a record; `source` is its resolved source when the caller already knows it. */
  async #map(
    collection: CollectionId,
    record: Parameters<typeof annotationFromDocument>[1],
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
  ): Promise<{ readonly path: string; readonly source: SourceId; readonly reference: unknown }[]> {
    const listed: { path: string; source: SourceId; reference: unknown }[] = [];
    for await (const page of this.#annotationSourcePages(options)) {
      listed.push(...page);
    }
    return listed;
  }

  async *#annotationSourcePages(
    options: AnnotationListOptions,
  ): AsyncGenerator<
    { readonly path: string; readonly source: SourceId; readonly reference: unknown }[]
  > {
    if (options.paths?.size === 0) {
      return;
    }
    const metadata = outcomeValue(
      await this.client.supportsAuthorityFeature("query-metadata-v1", options),
      "discover metadata queries",
    );
    for (const scope of annotationQueryScopes(options.paths)) {
      const selected = scope ? new Set(scope) : null;
      options.signal?.throwIfAborted();
      const input = sources.withResolvedSource({
        types: ["reader-annotation"],
        select: ["id", "source"],
        frontmatterMode: "effective",
        ...(scope
          ? { where: scope.map((path) => `file.path == ${JSON.stringify(path)}`).join(" || ") }
          : {}),
      });
      const paging = {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.replaceableFamily ? { replaceableFamily: options.replaceableFamily } : {}),
        pageSize: 500,
      };
      const pages = metadata
        ? this.client.queryPages({ ...input, output: "metadata", includeBody: false }, paging)
        : this.client.queryPages(input, paging);
      for await (const outcome of pages) {
        yield outcomeValue<QueryPage | QueryMetadataPage>(
          outcome,
          "query annotations",
        ).results.flatMap((record) => annotationSourceEntry(record, selected));
      }
    }
  }
}

function annotationQueryScopes(paths?: ReadonlySet<string>): (string[] | null)[] {
  if (!paths) {
    return [null];
  }
  const listed = [...paths];
  const scopes: string[][] = [];
  // readMany cannot carry the resolved-source projection; keep these queries bounded.
  for (let offset = 0; offset < listed.length; offset += 100) {
    scopes.push(listed.slice(offset, offset + 100));
  }
  return scopes;
}

function annotationSourceEntry(
  record: QueryRecord | QueryMetadataRecord,
  selected: ReadonlySet<string> | null,
): { path: string; source: SourceId; reference: unknown }[] {
  const fields =
    "file" in record ? (record.effectiveFrontmatter ?? record.frontmatter) : record.values;
  const source = sources.annotationSourceFromResult(record);
  return sources.stringField(fields?.["id"]) && source && (!selected || selected.has(record.path))
    ? [{ path: record.path, source, reference: fields?.["source"] }]
    : [];
}

function revisionedAnnotation(
  record: ReadManyRecord | undefined,
): Parameters<typeof annotationFromDocument>[1] | null {
  return record?.revision && record.frontmatter && record.effectiveFrontmatter
    ? {
        path: record.path,
        revision: record.revision,
        frontmatter: record.frontmatter,
        effectiveFrontmatter: record.effectiveFrontmatter,
        ...(record.body === undefined ? {} : { body: record.body }),
      }
    : null;
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

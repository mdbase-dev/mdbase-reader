import { isMdbaseError } from "@mdbase-dev/sdk";
import { sourceLink } from "@mdbase-reader/core";

import { annotationCandidatesForSource, annotationRecordsAt } from "./annotation-query.js";
import { annotationSourcePages } from "./annotation-source-pages.js";
import * as sources from "./annotation-source.js";
import { CreateFollowThrough } from "./create-follow-through.js";
import { annotationFromDocument, annotationFrontmatter } from "./mapping.js";
import {
  annotationPathCandidates,
  currentNameTemplates,
  type ReaderNaming,
} from "./naming-templates.js";
import {
  preflightDeleteRecord,
  deleteRecord,
  updateRecord,
  ConnectRepositoryError,
  mapConcurrent,
  readerConnectBulkConcurrency,
  recordPathById,
} from "./repository-client.js";

import type { MdbaseClient, wire } from "@mdbase-dev/sdk";
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
  readonly #deletePreflights = new Map<string, wire.Preflight>();

  readonly #creates: CreateFollowThrough;
  readonly #naming: ReaderNaming | undefined;

  constructor(
    private readonly client: MdbaseClient,
    /** Keeps each create until the collection confirms it; one per client by default. */
    creates?: CreateFollowThrough,
    /** The collection's name templates; Reader's default names without one. */
    naming?: ReaderNaming,
  ) {
    this.#creates = creates ?? new CreateFollowThrough(client);
    this.#naming = naming;
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
    let published = 0;
    const publish = (): void => {
      if (options.onProgress) {
        options.onProgress([...annotations]);
      }
      published = annotations.length;
    };
    for await (const page of annotationSourcePages(this.client, options)) {
      for (let offset = 0; offset < page.length;) {
        options.signal?.throwIfAborted();
        // A small first batch minimizes time to content; larger later batches limit rerenders.
        const batchSize = annotations.length === 0 ? 16 : 64;
        const entries = page.slice(offset, offset + batchSize);
        const matches = await annotationRecordsAt(
          this.client,
          entries.map(({ path }) => path),
          options,
        );
        const batch = await mapConcurrent(entries, readerConnectBulkConcurrency, async (entry) => {
          const document = matches.get(entry.path);
          if (!document) {
            return null;
          }
          try {
            return await this.#map(
              collection,
              document,
              (document.effective ?? document.frontmatter)["source"] === entry.reference
                ? entry.source
                : undefined,
            );
          } catch (error) {
            if (isMdbaseError(error) || error instanceof ConnectRepositoryError) {
              throw error;
            }
            // Invalid records do not belong in the overview.
            return null;
          }
        });
        options.signal?.throwIfAborted();
        annotations.push(
          ...batch.filter(
            (annotation): annotation is Annotation =>
              annotation !== null &&
              (!options.sourceIds || options.sourceIds.has(annotation.sourceId)),
          ),
        );
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
    const matches = await annotationRecordsAt(this.client, paths, options);
    const annotations = await mapConcurrent(paths, readerConnectBulkConcurrency, async (path) => {
      const document = matches.get(path);
      if (!document) {
        return null;
      }
      // Discovery and hydration are separate reads: re-resolve a changed source reference.
      return this.#map(
        collection,
        document,
        (document.effective ?? document.frontmatter)["source"] === candidates.get(path)
          ? source
          : undefined,
      );
    });
    options.signal?.throwIfAborted();
    return annotations.filter(
      (annotation): annotation is Annotation =>
        annotation !== null && annotation.sourceId === source,
    );
  }

  async create(annotation: Annotation, idempotencyKey: MutationId): Promise<Annotation> {
    const templates = await currentNameTemplates(this.#naming);
    const candidates = await annotationPathCandidates(templates.annotation, annotation);
    const result = await this.#creates.create({
      key: idempotencyKey,
      collectionId: annotation.collectionId,
      kind: "annotation",
      recordId: annotation.id,
      label: annotationLabel(annotation),
      candidates,
      linksTo: [annotation.sourceId],
      input: {
        type: "reader-annotation",
        frontmatter: annotationFrontmatter(annotation),
        body: annotation.body,
      },
    });
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
    const result = await updateRecord(
      this.client,
      { path: annotation.path },
      {
        ifRevision: annotation.recordRevision,
        patch: { modified_at: input.modifiedAt },
        body: input.body,
      },
    );
    // The revision check guarantees the source link is the one already resolved.
    return this.#map(annotation.collectionId, result, annotation.sourceId);
  }

  async updateColor(
    input: Parameters<NonNullable<AnnotationRepository["updateColor"]>>[0],
  ): Promise<Annotation> {
    const { annotation, color, modifiedAt } = input;
    if (!annotation.path || !annotation.recordRevision) {
      throw new Error("An annotation path and revision are required for changing its colour.");
    }
    const result = await updateRecord(
      this.client,
      { path: annotation.path },
      { ifRevision: annotation.recordRevision, patch: { color, modified_at: modifiedAt } },
    );
    // The revision check guarantees the source link is the one already resolved.
    return this.#map(annotation.collectionId, result, annotation.sourceId);
  }

  async moveOwner(
    input: Parameters<NonNullable<AnnotationRepository["moveOwner"]>>[0],
  ): Promise<Annotation> {
    const { annotation, owner, modifiedAt } = input;
    if (
      !annotation.path ||
      !annotation.recordRevision ||
      owner.collectionId !== annotation.collectionId
    ) {
      throw new Error("Moving requires a saved annotation and an owner in the same collection.");
    }
    const result = await updateRecord(
      this.client,
      { path: annotation.path },
      {
        ifRevision: annotation.recordRevision,
        patch: { source: sourceLink(owner), modified_at: modifiedAt },
      },
    );
    return this.#map(annotation.collectionId, result, owner.id);
  }

  async preflightDelete(annotation: Annotation): Promise<AnnotationDeletionPlan> {
    const { path, recordRevision } = canonicalIdentity(annotation);
    const result = await preflightDeleteRecord(this.client, { path }, recordRevision);
    this.#deletePreflights.set(deletionKey(path, recordRevision), result);
    return {
      annotationId: annotation.id,
      path,
      expectedRevision: recordRevision,
      brokenLinkPaths: uniquePaths(result.broken),
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
      await deleteRecord(this.client, { path }, recordRevision, preflight);
      // A create still waiting for the collection must not bring it back.
      await this.#creates.forget(annotation.id);
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
    const result = await this.client.get(
      { path: path },
      { ...options, include: { effective: true, body: true, document: true } },
    );
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

  async #annotationSources(
    options: ReaderRequestOptions,
  ): Promise<{ readonly path: string; readonly source: SourceId; readonly reference: unknown }[]> {
    const listed: { path: string; source: SourceId; reference: unknown }[] = [];
    for await (const page of annotationSourcePages(this.client, options)) {
      listed.push(...page);
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

/** A few words that say which annotation a notice is about. */
function annotationLabel(annotation: Annotation): string {
  const text = (annotation.target?.quote?.exact ?? annotation.body)
    .replace(/!\[\[[^\]]*\]\]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text) {
    return annotation.annotationType === "area" ? "An area highlight" : "An annotation";
  }
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
}

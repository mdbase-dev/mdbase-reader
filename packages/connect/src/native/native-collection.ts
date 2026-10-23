import { MdbaseError, toPlain } from "@mdbase-dev/sdk";
import { collectionId } from "@mdbase-reader/core";

import { ConnectAnnotationAssetRepository } from "../annotation-assets.js";
import { ConnectBodyUpdateRecovery } from "../body-update-recovery.js";
import { ConnectCollectionFileRepository } from "../collection-files.js";
import { ConnectDocumentRepository } from "../documents.js";
import {
  ConnectAnnotationRepository,
  ConnectContentSearchRepository,
  ConnectSourceRepository,
} from "../repositories.js";
import { outcomeValue } from "../repository-client.js";
import { ConnectSourceImportRepository } from "../source-imports.js";

import { nativeReaderClient } from "./native-client.js";
import { nativeReaderFiles } from "./native-files.js";
import { plain, recordDocument } from "./native-mapping.js";
import { NativeMigrationTarget } from "./native-migration.js";

import type { ReaderConnectedCollection } from "../application-session.js";
import type { LibraryViewRepository } from "../library-views.js";
import type { NativeReaderClient } from "./native-client.js";
import type {
  ExecuteViewInput,
  JsonObject,
  SavedViewExecution,
  SavedViewPresentation,
} from "@mdbase-dev/connect";
import type {
  Change,
  MdbaseApplicationConnection,
  MdbaseClient,
  QueryResult,
} from "@mdbase-dev/sdk";

export interface NativeReaderCollection extends ReaderConnectedCollection {
  /** Retire this scope's adapters. The borrowed SDK client stays open for its owner. */
  dispose(): void;
}

/**
 * Reader's opened collection over one borrowed public SDK connection. The existing
 * domain repositories run unchanged over the native record and file seams; the
 * SDK owns sign-in, selection, setup and the client lifetime.
 */
export function nativeReaderCollection(
  connection: MdbaseApplicationConnection,
): NativeReaderCollection {
  let disposed = false;
  const current = (): boolean => !disposed && connection.isCurrent();
  const client = nativeReaderClient(connection.records, current);
  const files = nativeReaderFiles(connection.files, current);
  return {
    collectionId: collectionId(connection.id),
    collectionName: connection.displayName,
    sources: new ConnectSourceRepository(client),
    sourceImports: new ConnectSourceImportRepository(client, files),
    migration: new NativeMigrationTarget(connection.id, client, files),
    annotations: new ConnectAnnotationRepository(client),
    annotationAssets: new ConnectAnnotationAssetRepository(files),
    documents: new ConnectDocumentRepository(files),
    contentSearch: new ConnectContentSearchRepository(client),
    files: new ConnectCollectionFileRepository(files),
    libraryViews: nativeLibraryViews(connection.records, client, current),
    bodyRecovery: new ConnectBodyUpdateRecovery(client),
    subscribeSourceChanges: (listener) => {
      const watch = connection.records.watchChanges(undefined, (batch) => {
        if (current() && (batch.reset || batch.changes.some(mayBeSource))) {
          listener();
        }
      });
      return () => {
        watch();
      };
    },
    dispose: () => {
      disposed = true;
      client.dispose();
    },
  };
}

/** A record change that can add, change or remove a library source. Producers
 * that cannot name the types are treated as possibly a source. */
function mayBeSource(change: Change): boolean {
  return change.entity !== "file" && (change.types?.includes("reader-source") ?? true);
}

function nativeLibraryViews(
  sdk: MdbaseClient,
  records: NativeReaderClient,
  isCurrent: () => boolean,
): LibraryViewRepository {
  const check = (signal?: AbortSignal): void => {
    if (!isCurrent()) {
      throw new MdbaseError({
        code: "cancelled",
        recovery: "none",
        message: "This collection is no longer open in mdbase Reader.",
      });
    }
    signal?.throwIfAborted();
  };
  return {
    async list(options = {}) {
      check(options.signal);
      const listed = await sdk.views.list(undefined, options.signal);
      check(options.signal);
      return {
        views: listed.sources.map((source) => ({
          id: source.id,
          name: source.name,
          source: { ...source.source },
          views: source.views.map((view) => ({
            id: view.id,
            name: view.name,
            properties: view.properties.map((property) => ({ ...property })),
            ...(view.presentation === undefined
              ? {}
              : { presentation: toPlain(view.presentation) as SavedViewPresentation }),
          })),
        })),
        meta: { totalCount: listed.sources.length },
      };
    },
    async execute(input, options = {}) {
      check(options.signal);
      if (input.cursor !== undefined) {
        throw new MdbaseError({
          code: "invalid_request",
          recovery: "fix_request",
          reason: "unsupported",
          message: "Saved view cursors are not available natively.",
        });
      }
      const result = await sdk.views.execute({ path: input.path }, input.view, {
        include: { effective: true },
        ...(input.context ? { context: { path: input.context.path } } : {}),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.offset === undefined ? {} : { offset: input.offset }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      check(options.signal);
      return viewExecution(result, input);
    },
    async save({ path, frontmatter, replace }) {
      const saved = replace
        ? outcomeValue(
            await records.update({
              path,
              // A view is replaced whole, so fields the new definition drops are removed.
              document: await viewDocument(frontmatter),
              ...(replace.revision ? { ifRevision: replace.revision } : {}),
            }),
            "save library view",
          )
        : outcomeValue(await records.create({ path, frontmatter }), "create library view");
      return { path: saved.path, revision: saved.revision };
    },
  };
}

function viewExecution(result: QueryResult, input: ExecuteViewInput): SavedViewExecution {
  return {
    results: result.records.map((record) => {
      const document = recordDocument(record);
      return {
        path: document.path,
        revision: document.revision,
        types: document.types,
        frontmatter: document.frontmatter,
        effectiveFrontmatter: document.effectiveFrontmatter,
        file: document.file,
        ...(record.values ? { values: plain(record.values) } : {}),
      };
    }),
    meta: {
      totalCount: result.totalCount ?? result.records.length,
      hasMore: result.hasMore ?? result.cursor !== undefined,
      view: { path: result.view?.path ?? input.path, id: result.view?.view ?? input.view },
      ...(input.context ? { context: { path: input.context.path } } : {}),
      ...(result.groups
        ? {
            groups: result.groups.map((group) => ({
              values: plain(group.values),
              count: group.count,
              summaries: plain(group.summaries),
            })),
          }
        : {}),
    },
  };
}

async function viewDocument(frontmatter: JsonObject): Promise<string> {
  const { stringify } = await import("../yaml-writer.js");
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n`;
}

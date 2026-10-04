// mdbase-next backend: one opened collection, assembled from Reader's existing repositories.
import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import { toPlain, type MdbaseClient, type PlainValue } from "@mdbase-dev/sdk";
import { collectionId } from "@mdbase-reader/core";

import { ConnectAnnotationAssetRepository } from "../annotation-assets.js";
import { ConnectCollectionFileRepository } from "../collection-files.js";
import { ConnectDocumentRepository } from "../documents.js";
import {
  ConnectAnnotationRepository,
  ConnectContentSearchRepository,
  ConnectRepositoryError,
  ConnectSourceRepository,
  outcomeValue,
} from "../repositories.js";
import { ConnectSourceImportRepository } from "../source-imports.js";

import { nextReaderClient, type NextReaderClientOptions } from "./client.js";
import { nextRepositoryError } from "./errors.js";
import { nextReaderFiles } from "./files.js";

import type {
  ReaderConnectedCollection,
  ReaderDirectAccessController,
} from "../application-session.js";
import type { LibraryViewRepository } from "../library-views.js";
import type { ReaderConnectClient } from "../repository-client.js";
import type { ReaderNextGrant } from "./control-plane.js";
import type {
  ConnectOutcome,
  DirectAccessProblemCode,
  DirectAccessStatus,
  JsonObject,
  SavedViewExecution,
  SavedViewList,
} from "@mdbase-dev/connect";
import type { BodyUpdateRecovery } from "@mdbase-reader/core";
import type { MigrationTarget } from "@mdbase-reader/migration";

/**
 * Reader's repositories over an mdbase-next client. Source, annotation, search,
 * import and file repositories are the existing ones on the new seams; the rest
 * are stubs until the new client API has an equivalent.
 */
export function nextReaderCollection(
  db: MdbaseClient,
  grant: Pick<ReaderNextGrant, "collectionId" | "displayName">,
  options: NextReaderClientOptions = {},
): ReaderConnectedCollection {
  const client = nextReaderClient(db, options);
  const files = nextReaderFiles(db);
  return {
    collectionId: collectionId(grant.collectionId),
    collectionName: grant.displayName,
    sources: new ConnectSourceRepository(client),
    sourceImports: new ConnectSourceImportRepository(client, files),
    migration: unsupportedMigration(grant.collectionId),
    annotations: new ConnectAnnotationRepository(client),
    annotationAssets: new ConnectAnnotationAssetRepository(files),
    documents: new ConnectDocumentRepository(files),
    contentSearch: new ConnectContentSearchRepository(client),
    files: new ConnectCollectionFileRepository(files),
    libraryViews: nextLibraryViews(db, client),
    directAccess: noDirectAccess,
    bodyRecovery: noBodyRecovery,
  };
}

function unsupported(feature: string): Error {
  return new ConnectRepositoryError(
    feature,
    "unsupported_operation",
    `${feature} is not available on the mdbase-next backend yet`,
  );
}

/**
 * STUB: the importer relies on the old SDK's durable pending-mutation journal.
 * mdbase-next writes are idempotent by mutation ID, so this needs a redesign, not a port.
 */
function unsupportedMigration(id: string): MigrationTarget {
  const refuse = (): Promise<never> => Promise.reject(unsupported("Importing a Reader library"));
  return { collectionId: id, existing: refuse, files: refuse, upload: refuse, create: refuse };
}

/**
 * STUB: receipts replace interrupted-write recovery. Writes are resubmitted by mutation ID
 * inside the SDK, so nothing is ever left for Reader to recover.
 */
const noBodyRecovery: BodyUpdateRecovery = {
  recoverSource: () => Promise.reject(unsupported("Recovering an interrupted write")),
  recoverAnnotation: () => Promise.reject(unsupported("Recovering an interrupted write")),
  pending: () => false,
};

/** STUB: there is no loopback direct-access route; sessions go through the relay. */
const noDirectAccess: ReaderDirectAccessController = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
  disable: () => undefined,
  check: () => Promise.resolve(directAccessUnavailable()),
  request: () => Promise.resolve(directAccessUnavailable()),
};

function directAccessUnavailable(): ConnectOutcome<DirectAccessStatus, DirectAccessProblemCode> {
  return connectFailure(
    connectProblem("operation_failed", "Direct access is not used by the mdbase-next backend."),
  );
}

function object(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/**
 * Saved views over `listViews`/`executeView`. The replica's view payloads are not
 * pinned down in the client API contract yet, so they are read defensively: an
 * unrecognized list is empty, and an unrecognized execution is refused.
 */
function nextLibraryViews(db: MdbaseClient, client: ReaderConnectClient): LibraryViewRepository {
  return {
    async list(options = {}) {
      const body = object(toPlain(await db.listViews(options.signal).catch(rethrow("list views"))));
      const views = Array.isArray(body?.["views"]) ? (body["views"] as SavedViewList["views"]) : [];
      return { views, meta: { totalCount: views.length } };
    },
    async execute(input, options = {}) {
      const body = object(
        toPlain(
          await db
            .executeView(input as unknown as PlainValue, options.signal)
            .catch(rethrow("run a library view")),
        ),
      );
      if (!Array.isArray(body?.["results"]) || !object(body["meta"])) {
        throw unsupported("Running this library view");
      }
      return body as unknown as SavedViewExecution;
    },
    async save({ path, frontmatter, replace }) {
      const saved = replace
        ? outcomeValue(
            await client.update({
              path,
              document: await viewDocument(frontmatter),
              ...(replace.revision ? { ifRevision: replace.revision } : {}),
            }),
            "save library view",
          )
        : outcomeValue(await client.create({ path, frontmatter }), "create library view");
      return { path: saved.path, revision: saved.revision };
    },
  };
}

function rethrow(operation: string): (error: unknown) => never {
  return (error) => {
    throw nextRepositoryError(operation, error);
  };
}

async function viewDocument(frontmatter: JsonObject): Promise<string> {
  const { stringify } = await import("yaml");
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n`;
}

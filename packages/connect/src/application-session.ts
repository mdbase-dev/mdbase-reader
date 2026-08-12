import {
  MdbaseBrowserSelection,
  MdbaseConnect,
  type ConnectOutcome,
  type DirectAccessProblemCode,
  type DirectAccessStatus,
  type JsonObject,
  type MdbaseAppManifest,
  type MdbaseConnectTimeouts,
  type MdbaseApplicationSessionSnapshot,
  type MdbaseConnection,
  type MdbaseConnectionInfo,
  type MdbaseConnectionRoute,
} from "@mdbase-dev/connect";
import {
  collectionId,
  type AnnotationRepository,
  type AnnotationAssetRepository,
  type CollectionId,
  type CollectionFileRepository,
  type ContentSearchRepository,
  type DocumentRepository,
  type SourceRepository,
  type SourceImportRepository,
} from "@mdbase-reader/core";

import { connectAnnotationAssetRepository } from "./annotation-assets.js";
import { connectCollectionFileRepository } from "./collection-files.js";
import { connectDocumentRepository } from "./documents.js";
import { connectLibraryViewRepository, type LibraryViewRepository } from "./library-views.js";
import {
  ConnectAnnotationRepository,
  ConnectContentSearchRepository,
  connectClient,
  ConnectSourceRepository,
} from "./repositories.js";
import { connectSourceImportRepository } from "./source-imports.js";

export type ReaderConnectSnapshot = MdbaseApplicationSessionSnapshot;

export interface ReaderDirectAccessSnapshot {
  readonly authority: "hosted" | "connector";
  readonly route: MdbaseConnectionRoute;
  readonly status: DirectAccessStatus;
}

export interface ReaderDirectAccessController {
  readonly getSnapshot: () => ReaderDirectAccessSnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly check: () => Promise<ConnectOutcome<DirectAccessStatus, DirectAccessProblemCode>>;
  readonly request: () => Promise<ConnectOutcome<DirectAccessStatus, DirectAccessProblemCode>>;
}

export interface ReaderConnectedCollection {
  readonly collectionId: CollectionId;
  readonly collectionName: string;
  readonly sources: SourceRepository;
  readonly sourceImports: SourceImportRepository;
  readonly annotations: AnnotationRepository;
  readonly annotationAssets: AnnotationAssetRepository;
  readonly documents: DocumentRepository;
  readonly contentSearch: ContentSearchRepository;
  readonly files: CollectionFileRepository;
  readonly libraryViews: LibraryViewRepository;
  readonly directAccess: ReaderDirectAccessController;
}

export interface ReaderApplicationSessionOptions {
  readonly serverUrl: string;
  readonly loopbackUrl?: string;
  readonly manifest: MdbaseAppManifest;
  readonly redirectUri: string;
  readonly fallbackPath: string;
  readonly timeouts?: MdbaseConnectTimeouts;
}

export class ReaderApplicationSession {
  readonly #session;

  public constructor(options: ReaderApplicationSessionOptions) {
    const connect = new MdbaseConnect<JsonObject>({
      serverUrl: options.serverUrl,
      manifest: options.manifest,
      redirectUri: options.redirectUri,
      directAccess: "auto",
      ...(options.loopbackUrl ? { loopbackUrl: options.loopbackUrl } : {}),
      ...(options.timeouts ? { timeouts: options.timeouts } : {}),
    });
    this.#session = connect.application({
      selection: new MdbaseBrowserSelection({ fallbackPath: options.fallbackPath }),
      autoSelect: "never",
    });
  }

  public start(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    return this.#session.start();
  }

  public destroy(): void {
    this.#session.destroy();
  }

  public getSnapshot(): ReaderConnectSnapshot {
    return this.#session.getSnapshot();
  }

  public subscribe(listener: () => void): () => void {
    return this.#session.subscribe(listener);
  }

  public select(selectedCollectionId: string): ConnectOutcome<unknown> {
    return this.#session.select(selectedCollectionId, { history: "replace" });
  }

  public authorize(target: "choose" | "selected"): Promise<ConnectOutcome<unknown>> {
    return this.#session.authorize(target);
  }

  public applyCollectionSetup(): Promise<ConnectOutcome<ReaderConnectSnapshot>> {
    return this.#session.applyCollectionSetup();
  }

  public connectedCollection(expectedCollectionId?: string): ReaderConnectedCollection | null {
    const snapshot = this.#session.getSnapshot();
    const connection = snapshot.status === "ready" ? this.#session.connection() : null;
    if (
      !connection ||
      snapshot.status !== "ready" ||
      (expectedCollectionId !== undefined && connection.collectionId !== expectedCollectionId)
    ) {
      return null;
    }
    const client = connectClient(connection);
    return {
      collectionId: collectionId(connection.collectionId),
      collectionName: snapshot.info.displayName,
      sources: new ConnectSourceRepository(client),
      sourceImports: connectSourceImportRepository(connection, client),
      annotations: new ConnectAnnotationRepository(client),
      annotationAssets: connectAnnotationAssetRepository(connection),
      documents: connectDocumentRepository(connection),
      contentSearch: new ConnectContentSearchRepository(client),
      files: connectCollectionFileRepository(connection),
      libraryViews: connectLibraryViewRepository(connection),
      directAccess: readerDirectAccessController(connection),
    };
  }
}

function readerDirectAccessController(connection: MdbaseConnection): ReaderDirectAccessController {
  let snapshot = directAccessSnapshot(connection.info());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) =>
      connection.onConnectionChange((info) => {
        const next = directAccessSnapshot(info);
        if (sameDirectAccessSnapshot(snapshot, next)) {
          return;
        }
        snapshot = next;
        listener();
      }),
    check: () => connection.checkDirectAccess(),
    request: () => connection.requestDirectAccess(),
  };
}

function directAccessSnapshot(
  info: MdbaseConnectionInfo | null,
): ReaderDirectAccessSnapshot | null {
  return info
    ? {
        authority: info.authority.kind,
        route: info.route,
        status: info.directAccess,
      }
    : null;
}

function sameDirectAccessSnapshot(
  left: ReaderDirectAccessSnapshot | null,
  right: ReaderDirectAccessSnapshot | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.authority === right.authority &&
      left.route === right.route &&
      left.status === right.status)
  );
}

export function manifestForApplicationUrl(
  manifest: MdbaseAppManifest,
  applicationUrl: string,
  redirectUri = applicationUrl,
): MdbaseAppManifest {
  if (manifest.distribution === "portable") {
    throw new Error("A portable application manifest cannot be localized to a web origin.");
  }
  const url = new URL(applicationUrl);
  url.search = "";
  url.hash = "";
  const homepage = url.href;
  const callback = new URL(redirectUri);
  if (callback.origin !== url.origin) {
    throw new Error("The development callback must use the application origin.");
  }
  return {
    ...manifest,
    distribution: "web",
    homepage,
    icon: new URL("favicon.svg", homepage).href,
    redirect_uris: [callback.href],
  };
}

export function connectProblemMessage(outcome: ConnectOutcome<unknown>): string | null {
  return outcome.ok ? null : outcome.problem.message;
}

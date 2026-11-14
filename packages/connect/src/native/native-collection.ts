import { MdbaseError } from "@mdbase-dev/sdk";
import { collectionId } from "@mdbase-reader/core";

import { ConnectAnnotationAssetRepository } from "../annotation-assets.js";
import { ConnectBodyUpdateRecovery } from "../body-update-recovery.js";
import { ConnectCollectionFileRepository } from "../collection-files.js";
import { CreateFollowThrough } from "../create-follow-through.js";
import { ConnectDocumentRepository } from "../documents.js";
import { ReaderSettingsStore } from "../reader-settings.js";
import {
  ConnectAnnotationRepository,
  ConnectContentSearchRepository,
  ConnectSourceRepository,
} from "../repositories.js";
import { settledRecord } from "../repository-client.js";
import { ConnectSourceImportRepository } from "../source-imports.js";

import { borrowedRecords } from "./borrowed-records.js";
import { nativeReaderFiles } from "./native-files.js";
import { NativeMigrationTarget } from "./native-migration.js";

import type { ReaderConnectedCollection } from "../connected-collection.js";
import type { LibraryViewRepository } from "../library-views.js";
import type {
  JsonObject,
  Change,
  MdbaseApplicationConnection,
  MdbaseClient,
} from "@mdbase-dev/sdk";
import type { CreateJournal } from "@mdbase-reader/core";

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
  options: {
    /**
     * Where record creates are kept until the collection confirms them. Without one, a
     * create the log refuses after it returned is lost from this device.
     */
    readonly creates?: CreateJournal;
  } = {},
): NativeReaderCollection {
  let disposed = false;
  const current = (): boolean => !disposed && connection.isCurrent();
  const lifetime = new AbortController();
  const client = borrowedRecords(connection.records, current, lifetime.signal);
  const files = nativeReaderFiles(connection.records, current);
  const creates = new CreateFollowThrough(client, {
    ...(options.creates ? { journal: options.creates } : {}),
    collectionId: connection.id,
  });
  const stopFollowing = options.creates
    ? followCreates(connection.records, creates, current)
    : noop;
  const settings = new ReaderSettingsStore(client, {
    watch: (path, onChange) =>
      connection.records.watchChanges((batch) => {
        if (current() && (batch.reset || batch.changes.some((change) => change.path === path))) {
          onChange();
        }
      }),
  });
  return {
    collectionId: collectionId(connection.id),
    collectionName: connection.displayName,
    sources: new ConnectSourceRepository(client, creates),
    sourceImports: new ConnectSourceImportRepository(client, files, creates, settings),
    migration: new NativeMigrationTarget(connection.id, client, files),
    annotations: new ConnectAnnotationRepository(client, creates, settings),
    settings,
    annotationAssets: new ConnectAnnotationAssetRepository(files),
    documents: new ConnectDocumentRepository(files),
    contentSearch: new ConnectContentSearchRepository(client),
    files: new ConnectCollectionFileRepository(files),
    libraryViews: nativeLibraryViews(client, current),
    bodyRecovery: new ConnectBodyUpdateRecovery(client),
    ...(options.creates ? { createFollowThrough: creates } : {}),
    subscribeSourceChanges: (listener) => {
      const watch = connection.records.watchChanges((batch) => {
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
      lifetime.abort();
      stopFollowing();
      settings.dispose();
    },
  };
}

const noop = (): void => undefined;

/**
 * Reconcile kept creates now (startup), whenever the link opens again (reconnect), and
 * whenever the SDK's write ledger changes. The ledger settles from receipt pushes and the
 * replica's status push (`client.d.ts` `ledger`; `replica-client-api.md` §6: a `receipt`
 * push "at every state change"), so a refusal at head is seen as it arrives.
 */
function followCreates(
  sdk: MdbaseClient,
  creates: CreateFollowThrough,
  current: () => boolean,
): () => void {
  let scheduled = false;
  const reconcile = (): void => {
    if (scheduled || !current()) {
      return;
    }
    // One pass for a burst of pushes.
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (current()) {
        void creates.reconcile();
      }
    });
  };
  const stopLink = sdk.onLink((state) => {
    if (state === "open") {
      reconcile();
    }
  });
  const stopLedger = sdk.ledger.subscribe(reconcile);
  // Creates whose outcome is not known wait for the replica to catch up with head; go
  // on when it has (`SyncStatus`: "confirmed through N", `client.d.ts` `onStatus`).
  let caughtUp = false;
  const stopStatus = sdk.onStatus((status) => {
    const now = status.confirmedThrough >= status.headKnown;
    if (now && !caughtUp) {
      reconcile();
    }
    caughtUp = now;
  });
  reconcile();
  return () => {
    stopLink();
    stopLedger();
    stopStatus();
  };
}

/** A record change that can add, change or remove a library source. Producers
 * that cannot name the types are treated as possibly a source. */
function mayBeSource(change: Change): boolean {
  return change.entity !== "file" && (change.types?.includes("reader-source") ?? true);
}

function nativeLibraryViews(sdk: MdbaseClient, isCurrent: () => boolean): LibraryViewRepository {
  const check = (): void => {
    if (!isCurrent()) {
      throw new MdbaseError({
        code: "cancelled",
        recovery: "none",
        message: "This collection is no longer open in mdbase Reader.",
      });
    }
  };
  return {
    async list(options) {
      check();
      const result = await sdk.views.list(options);
      check();
      return result;
    },
    async execute(ref, view, options) {
      check();
      const result = await sdk.views.execute(ref, view, options);
      check();
      return result;
    },
    async save({ path, frontmatter, replace }) {
      check();
      const ref = { path };
      const saved = replace
        ? await settledRecord(
            sdk,
            sdk.replaceDocument(await sdk.get(ref), await viewDocument(frontmatter), {
              ...(replace.revision ? { ifRevision: replace.revision } : {}),
            }),
            ref,
          )
        : await settledRecord(sdk, sdk.create({ path, frontmatter }), ref);
      check();
      return { path: saved.path, revision: saved.revision };
    },
  };
}

async function viewDocument(frontmatter: JsonObject): Promise<string> {
  const { stringify } = await import("../yaml-writer.js");
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n`;
}

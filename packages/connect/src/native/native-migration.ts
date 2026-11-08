import { annotationContract, sourceContract } from "../contracts.js";
import { ConnectRepositoryError, outcomeValue } from "../repository-client.js";

import type { NativeReaderClient } from "./native-client.js";
import type { NativeReaderFileClient } from "./native-files.js";
import type { RecordDocument } from "@mdbase-dev/connect";
import type {
  Fields,
  ImportedFile,
  MigrationRecord,
  MigrationTarget,
} from "@mdbase-reader/migration";

/**
 * Import destination over the native SDK seams. Never modifies an existing record
 * or file. An unsettled create keeps its original native mutation ID in a local
 * journal, so a later run recovers that exact write instead of submitting another.
 */
export class NativeMigrationTarget implements MigrationTarget {
  constructor(
    public readonly collectionId: string,
    private readonly records: NativeReaderClient,
    private readonly fileClient: NativeReaderFileClient,
  ) {}

  async existing(signal: AbortSignal): Promise<Map<string, Fields>> {
    const result = new Map<string, Fields>();
    const identitiesByPath = new Map<string, string>();
    const importedPaths = new Map<string, string>();
    for (const contract of [sourceContract, annotationContract]) {
      for await (const page of this.records.queryPages(
        { contract, frontmatterMode: "effective" },
        { signal, pageSize: 128 },
      )) {
        for (const row of outcomeValue(page, "inspect import identities").results) {
          const fields = row.effectiveFrontmatter ?? row.frontmatter;
          const id = fields?.["id"];
          if (typeof id !== "string") {
            continue;
          }
          if (result.has(id)) {
            throw new Error("The destination has duplicate record IDs. Import was stopped.");
          }
          result.set(id, fields as Fields);
          identitiesByPath.set(row.path, id);
        }
      }
    }
    // Contract projections omit extension fields; join native provenance by path.
    for await (const page of this.records.queryPages(
      { frontmatterMode: "persisted" },
      { signal, pageSize: 1000 },
    )) {
      for (const row of outcomeValue(page, "inspect native import provenance").results) {
        const id = identitiesByPath.get(row.path);
        if (id) {
          if (row.frontmatter?.["import"]) {
            importedPaths.set(row.path, id);
          }
          result.set(id, {
            ...result.get(id),
            import: (row.frontmatter?.["import"] ?? null) as Fields["import"],
          });
        }
      }
    }
    await this.confirmExisting(importedPaths, signal);
    return result;
  }

  private async confirmExisting(paths: Map<string, string>, signal: AbortSignal): Promise<void> {
    const storage = this.storage();
    for (const [path, id] of paths) {
      const key = this.journalKey(id);
      const pendingId = storage?.getItem(key);
      if (pendingId) {
        await this.confirm({ id, path }, pendingId, key, storage, signal);
      } else {
        await this.confirmRecord({ id, path }, signal);
      }
    }
  }

  async files(signal: AbortSignal): Promise<Map<string, ImportedFile>> {
    const result = new Map<string, ImportedFile>();
    for await (const file of this.fileClient.list({
      folder: "files/reader/imports",
      pageSize: 500,
      signal,
    })) {
      result.set(file.path, file);
    }
    return result;
  }

  upload(
    path: string,
    blob: Blob,
    mediaType: string,
    transferId: string,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<ImportedFile> {
    return this.fileClient.upload(path, blob, {
      signal,
      mediaType,
      transferId,
      onProgress: (p) => progress(p.transferredBytes),
    });
  }

  async create(
    record: MigrationRecord,
    fields: Fields,
    type: "reader-source" | "reader-annotation",
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const journalKey = this.journalKey(record.id);
    const storage = this.storage();
    const pendingId = storage?.getItem(journalKey);
    if (pendingId) {
      await this.confirm(record, pendingId, journalKey, storage, signal);
      return;
    }
    let mutationId: string | undefined;
    const outcome = await this.records.create(
      {
        path: record.path,
        type,
        frontmatter: fields,
        body: record.body,
        includeDocument: true,
      },
      {
        signal,
        onMutation: (id) => {
          mutationId = id;
          storage?.setItem(journalKey, mutationId);
        },
      },
    );
    if (!outcome.ok && outcome.problem.code === "operation_outcome_unknown") {
      const requestId = (outcome.problem.details as { request_id?: unknown } | undefined)
        ?.request_id;
      if (typeof requestId === "string") {
        mutationId = requestId;
        storage?.setItem(journalKey, requestId);
      }
    } else {
      if (!outcome.ok) {
        storage?.removeItem(journalKey);
      }
      verify(record, outcomeValue(outcome, "create imported record"));
    }
    if (!mutationId) {
      throw new ConnectRepositoryError("confirm imported record", "pending_mutation_unresolved");
    }
    await this.confirm(record, mutationId, journalKey, storage, signal);
  }

  private journalKey(id: string): string {
    return `reader:migration-pending:${this.collectionId}:${id}`;
  }

  private storage(): Storage | null {
    return typeof localStorage === "undefined" ? null : localStorage;
  }

  private async confirm(
    record: Pick<MigrationRecord, "id" | "path">,
    mutationId: string,
    key: string,
    storage: Storage | null,
    signal: AbortSignal,
  ): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const receipt = await this.records.createTracking.receipt(mutationId, { signal });
      if (receipt.state === "rejected") {
        storage?.removeItem(key);
        throw new ConnectRepositoryError(
          "confirm imported record",
          receipt.problem.code,
          receipt.problem.message,
          receipt.problem,
          receipt.problem.issues,
        );
      }
      if (receipt.state === "confirmed") {
        break;
      }
      if (receipt.state !== "pending") {
        const local = await this.records.createTracking.recordAt(record.path, { signal });
        if (local?.id === record.id && local.confirmed) {
          break;
        }
        throw new Error(
          "A previous import mutation needs recovery. Its original request will not be repeated as a new write.",
        );
      }
      await pause(signal);
    }
    await this.confirmRecord(record, signal);
    storage?.removeItem(key);
  }

  private async confirmRecord(
    record: Pick<MigrationRecord, "id" | "path">,
    signal: AbortSignal,
  ): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const local = await this.records.createTracking.recordAt(record.path, { signal });
      if (local?.id !== record.id) {
        throw new Error("Import verification failed: a record is missing or changed identity.");
      }
      if (local.confirmed) {
        break;
      }
      await pause(signal);
    }
  }
}

function verify(record: Pick<MigrationRecord, "id">, document: RecordDocument): void {
  if (document.effectiveFrontmatter["id"] !== record.id) {
    throw new Error("Imported record identity mismatch.");
  }
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason instanceof Error ? signal.reason : new Error("Import stopped."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 250);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

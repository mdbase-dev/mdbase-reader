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
          result.set(id, {
            ...result.get(id),
            import: (row.frontmatter?.["import"] ?? null) as Fields["import"],
          });
        }
      }
    }
    return result;
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
    const journalKey = `reader:migration-pending:${this.collectionId}:${record.id}`;
    const storage = typeof localStorage === "undefined" ? null : localStorage;
    if (await this.recoverJournal(record, journalKey, storage, signal)) {
      return;
    }
    const outcome = await this.records.create({
      path: record.path,
      type,
      frontmatter: fields,
      body: record.body,
      includeDocument: true,
    });
    if (!outcome.ok && outcome.problem.code === "operation_outcome_unknown") {
      const requestId = (outcome.problem.details as { request_id?: unknown } | undefined)
        ?.request_id;
      if (typeof requestId === "string") {
        storage?.setItem(journalKey, requestId);
        await this.recover(record, requestId, signal);
        storage?.removeItem(journalKey);
        return;
      }
    }
    verify(record, outcomeValue(outcome, "create imported record"));
  }

  private async recoverJournal(
    record: MigrationRecord,
    key: string,
    storage: Storage | null,
    signal: AbortSignal,
  ): Promise<boolean> {
    const pendingId = storage?.getItem(key);
    if (!pendingId) {
      return false;
    }
    if (!this.records.pendingMutation(pendingId)) {
      await this.records.restorePending(signal);
    }
    if (this.records.pendingMutation(pendingId)) {
      await this.recover(record, pendingId, signal);
      storage?.removeItem(key);
      return true;
    }
    const read = await this.records.read({ path: record.path }, { signal });
    if (read.ok && read.value.effectiveFrontmatter["id"] === record.id) {
      storage?.removeItem(key);
      return true;
    }
    throw new Error(
      "A previous import mutation needs recovery. Its original request will not be repeated as a new write.",
    );
  }

  private async recover(
    record: MigrationRecord,
    requestId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const pending = this.records.pendingMutation(requestId);
    if (!pending) {
      throw new ConnectRepositoryError("recover imported record", "pending_mutation_unresolved");
    }
    verify(record, outcomeValue(await pending.recover({ signal }), "recover imported record"));
  }
}

function verify(record: MigrationRecord, document: RecordDocument): void {
  if (document.effectiveFrontmatter["id"] !== record.id) {
    throw new Error("Imported record identity mismatch.");
  }
}

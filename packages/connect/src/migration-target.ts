import {
  MdbaseConnectError,
  type MdbaseConnection,
  type RecordDocument,
} from "@mdbase-dev/connect";

import { sourceContract, annotationContract } from "./contracts.js";
import { outcomeValue } from "./repository-client.js";

import type {
  Fields,
  ImportedFile,
  MigrationRecord,
  MigrationTarget,
} from "@mdbase-reader/migration";

/** Only public Connect SDK operations. Never modifies an existing record or file. */
export class ConnectMigrationTarget implements MigrationTarget {
  public readonly collectionId: string;
  constructor(private readonly connection: MdbaseConnection) {
    this.collectionId = connection.collectionId;
  }
  async existing(signal: AbortSignal): Promise<Map<string, Fields>> {
    const result = new Map<string, Fields>();
    const identitiesByPath = new Map<string, string>();
    for (const contract of [sourceContract, annotationContract]) {
      for await (const page of this.connection.queryPages(
        { contract, frontmatterMode: "effective" },
        { signal, firstPageSize: 500, pageSize: 1000 },
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
    // Contract projections intentionally omit extension fields. With the reviewed
    // full-collection grant, retrieve native provenance and join by contract-discovered path.
    for await (const page of this.connection.queryPages(
      { frontmatterMode: "persisted" },
      { signal, firstPageSize: 500, pageSize: 1000 },
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
    for await (const file of this.connection.files.list({
      folder: "files/reader/imports",
      pageSize: 500,
      signal,
    })) {
      result.set(file.path, file);
    }
    return result;
  }
  async upload(
    path: string,
    blob: Blob,
    mediaType: string,
    transferId: string,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<ImportedFile> {
    const upload = (): Promise<ImportedFile> =>
      this.connection.files.upload(path, blob, {
        signal,
        mediaType,
        transferId,
        timeoutMs: 10 * 60_000,
        onProgress: (p) => {
          if (p.phase === "uploading") {
            progress(p.transferredBytes);
          }
        },
      });
    try {
      return await upload();
    } catch (error) {
      signal.throwIfAborted();
      // Reopen the same transfer, not a new logical upload, after an unknown outcome.
      if (error instanceof MdbaseConnectError && error.outcomeUnknown) {
        return upload();
      }
      throw error;
    }
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
    const pending = this.connection.pendingMutation<RecordDocument>(pendingId);
    if (pending) {
      const recovered = outcomeValue(await pending.recover({ signal }), "recover imported record");
      if (recovered.effectiveFrontmatter["id"] !== record.id) {
        throw new Error("Recovered mutation identity mismatch.");
      }
      storage?.removeItem(key);
      return true;
    }
    const read = await this.connection.read({ path: record.path }, { signal });
    if (read.ok && read.value.effectiveFrontmatter["id"] === record.id) {
      storage?.removeItem(key);
      return true;
    }
    throw new Error(
      "A previous import mutation needs recovery. Its original request will not be repeated as a new write.",
    );
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
    const before = new Set(this.connection.pendingMutations().map((p) => p.requestId));
    const outcome = await this.connection.create(
      { path: record.path, type, frontmatter: fields, body: record.body, includeDocument: true },
      { signal },
    );
    if (!outcome.ok && outcome.problem.code === "operation_outcome_unknown") {
      const pending = this.connection
        .pendingMutations<RecordDocument>()
        .filter((p) => !before.has(p.requestId));
      if (pending.length === 1 && pending[0]) {
        storage?.setItem(journalKey, pending[0].requestId);
        const recovered = outcomeValue(
          await pending[0].recover({ signal }),
          "recover imported record",
        );
        if (recovered.effectiveFrontmatter["id"] !== record.id) {
          throw new Error("Recovered mutation identity mismatch.");
        }
        storage?.removeItem(journalKey);
        return;
      }
    }
    const created = outcomeValue(outcome, "create imported record");
    if (created.effectiveFrontmatter["id"] !== record.id) {
      throw new Error("Created record identity mismatch.");
    }
  }
}

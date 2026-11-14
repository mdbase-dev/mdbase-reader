import { MdbaseError, uuidv7, type MdbaseClient, type FileView } from "@mdbase-dev/sdk";

import { annotationContract, sourceContract } from "../contracts.js";
import { completeReaderPages, requireCompleteQuery } from "../repository-client.js";

import type { NativeReaderFileClient } from "./native-files.js";
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
    private readonly records: MdbaseClient,
    private readonly fileClient: NativeReaderFileClient,
  ) {}

  async existing(signal: AbortSignal): Promise<Map<string, Fields>> {
    const result = new Map<string, Fields>();
    const identitiesByPath = new Map<string, string>();
    const importedPaths = new Map<string, string>();
    await this.readIdentities(result, identitiesByPath, signal);
    // Contract projections omit extension fields; join native provenance by path.
    for await (const page of completeReaderPages(this.records, {}, { signal })) {
      for (const row of page.records) {
        const id = identitiesByPath.get(row.path);
        if (id) {
          if (row.frontmatter["import"]) {
            importedPaths.set(row.path, id);
          }
          result.set(id, {
            ...result.get(id),
            import: row.frontmatter["import"] ?? null,
          });
        }
      }
    }
    await this.confirmExisting(importedPaths, signal);
    return result;
  }

  private async readIdentities(
    result: Map<string, Fields>,
    identitiesByPath: Map<string, string>,
    signal: AbortSignal,
  ): Promise<void> {
    for (const contract of [sourceContract, annotationContract]) {
      let cursor: string | undefined;
      do {
        const resultPage = await this.records.queryContract(contract, {
          signal,
          pageSize: 128,
          ...(cursor ? { cursor } : {}),
        });
        requireCompleteQuery(resultPage.page);
        for (const row of resultPage.records) {
          const implementation =
            row.implementations.length === 1 ? row.implementations[0] : undefined;
          const view = resultPage.page.records.find((record) => record.id === row.id);
          if (!implementation || !view) {
            throw new Error("The destination has an ambiguous contract implementation.");
          }
          const fields = implementation.fields;
          const id = fields["id"];
          if (typeof id !== "string") {
            continue;
          }
          if (result.has(id)) {
            throw new Error("The destination has duplicate record IDs. Import was stopped.");
          }
          result.set(id, fields);
          identitiesByPath.set(view.path, id);
        }
        cursor = resultPage.page.cursor;
      } while (cursor);
    }
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

      signal,
    })) {
      result.set(file.path, importedFile(file));
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
    return this.fileClient
      .upload(path, blob, { signal, transferId, onProgress: (p) => progress(p.done) })
      .then(importedFile);
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
    const mutationId = uuidv7();
    storage?.setItem(journalKey, mutationId);
    const settled = await this.records.settle(
      this.records.create(
        { path: record.path, type, frontmatter: fields, body: record.body },
        { mutationId, signal },
      ),
      { signal },
    );
    if (settled.outcome === "rejected") {
      storage?.removeItem(journalKey);
      throw new MdbaseError(settled.problem, { mutationId });
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
      const settled = await this.records.settle(mutationId, { signal });
      if (settled.outcome === "rejected" && settled.problem.code !== "not_found") {
        storage?.removeItem(key);
        throw new MdbaseError(settled.problem, { mutationId });
      }
      if (settled.outcome === "confirmed") {
        break;
      }
      if (settled.outcome !== "saved_on_device") {
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
      const local = await this.records.find(
        { path: record.path },
        { include: { effective: true }, signal },
      );
      if (!local || (local.effective ?? local.frontmatter)["id"] !== record.id) {
        throw new Error("Import verification failed: a record is missing or changed identity.");
      }
      if (local.state.state === "confirmed" || local.state.confirmedSeq > 0) {
        break;
      }
      await pause(signal);
    }
  }
}

function importedFile(file: FileView): ImportedFile {
  return { fileId: file.id, path: file.path, contentDigest: file.digest };
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

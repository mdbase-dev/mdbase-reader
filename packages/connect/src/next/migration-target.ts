import { encode, toPlain, toValue, type MdbaseClient } from "@mdbase-dev/sdk";

import { fileDescriptor, transferUuid } from "./files.js";

import type {
  Fields,
  ImportedFile,
  Json,
  MigrationRecord,
  MigrationTarget,
} from "@mdbase-reader/migration";

// mdb-cbor/1 data maps preserve insertion order. Normalize importer-owned objects
// explicitly; arrays (including list fields) retain their semantic order.
function ordered(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(ordered);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, ordered(item)]),
    );
  }
  return value;
}

/** Browser imports use replica receipts, never the native legacy connector journal. */
export class NextMigrationTarget implements MigrationTarget {
  public readonly collectionId: string;

  constructor(private readonly db: MdbaseClient) {
    this.collectionId = db.collection;
  }

  async existing(signal: AbortSignal): Promise<Map<string, Fields>> {
    const result = new Map<string, Fields>();
    let cursor: string | undefined;
    do {
      const page = await this.db.query(
        {
          types: ["reader-source", "reader-annotation"],
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        },
        { effective: true },
        signal,
      );
      for (const row of page.records) {
        const persisted = toPlain(row.frontmatter) as Fields;
        const effective = row.effective ? (toPlain(row.effective) as Fields) : persisted;
        const id = effective["id"];
        if (typeof id !== "string") {
          continue;
        }
        if (result.has(id)) {
          throw new Error("The destination has duplicate record IDs. Import was stopped.");
        }
        // Provenance is a persisted extension, not a contract projection.
        result.set(id, { ...effective, import: persisted["import"] ?? null });
      }
      cursor = page.cursor;
    } while (cursor);
    return result;
  }

  async files(signal: AbortSignal): Promise<Map<string, ImportedFile>> {
    const result = new Map<string, ImportedFile>();
    for await (const file of this.db.files.list({ folder: "files/reader/imports", signal })) {
      result.set(file.path, fileDescriptor(file));
    }
    return result;
  }

  async upload(
    path: string,
    blob: Blob,
    _mediaType: string,
    key: string,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<ImportedFile> {
    signal.throwIfAborted();
    const identity = JSON.stringify(["reader-import-file", this.collectionId, key]);
    const fileId = await transferUuid(`${identity}:file`);
    const write = await this.db.files.upload(path, blob, {
      fileId,
      transferId: await transferUuid(`${identity}:transfer`),
      mutationId: await transferUuid(`${identity}:commit`),
      signal,
      onProgress: (p) => progress(p.done),
    });
    // Do not let import verification mistake an optimistic upload for durable bytes.
    await write.confirmed;
    return fileDescriptor(await this.db.files.get(fileId, signal));
  }

  async create(
    record: MigrationRecord,
    fields: Fields,
    type: "reader-source" | "reader-annotation",
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const provenance = fields["import"];
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance) ||
      typeof provenance["namespace"] !== "string" ||
      provenance["key"] !== record.key ||
      fields["id"] !== record.id
    ) {
      throw new Error("Invalid import identity or provenance.");
    }
    const identity = JSON.stringify([
      "reader-import-record",
      this.collectionId,
      provenance["namespace"],
      record.id,
      record.key,
    ]);
    const id = await transferUuid(identity);
    const normalized = ordered(fields) as Fields;
    // Normalized CBOR makes retries independent of object insertion order. A changed
    // payload has a different mutation ID but the same record ID: it is refused as
    // an existing record, never silently mistaken for the original write or updated.
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encode(toValue([type, record.path, normalized, record.body])).slice().buffer,
      ),
    );
    const fingerprint = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
    // MigrationTarget commits one record at a time. The SDK expands mutationId to
    // the singleton mutation_ids array when allowPartial is true; no fresh ID is
    // generated on retries or after a page reload.
    const [write] = await this.db.submit(
      [
        {
          kind: "create",
          id,
          type,
          path: record.path,
          frontmatter: new Map(Object.entries(normalized).map(([k, v]) => [k, toValue(v)])),
          body: record.body,
        },
      ],
      {
        allowPartial: true,
        mutationId: await transferUuid(`${identity}:mutation:${fingerprint}`),
        wait: "confirmed",
        signal,
      },
    );
    if (!write) {
      throw new Error("The replica returned no import receipt.");
    }
    await write.confirmed;
    const saved = await this.db.get(id, { effective: true }, signal);
    const actual = toPlain(saved.frontmatter) as Fields;
    const imported = actual["import"];
    if (
      actual["id"] !== record.id ||
      !imported ||
      typeof imported !== "object" ||
      Array.isArray(imported) ||
      imported["namespace"] !== provenance["namespace"] ||
      imported["key"] !== record.key
    ) {
      throw new Error("Confirmed import identity mismatch.");
    }
  }
}

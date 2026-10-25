import {
  annotationId,
  dateTime,
  mutationId,
  sourceId,
  type Clock,
  type ContentHasher,
  type CreateJournal,
  type MutationId,
  type MutationJournal,
  type MutationStage,
  type PendingCreate,
  type ReaderIdGenerator,
} from "@mdbase-reader/core";

import type { KeyValueStorage, ListableStorage } from "./platform.js";

interface JournalEntry {
  readonly operation: "create-annotation";
  readonly collectionId: string;
  readonly sourceId: string;
  readonly annotationId: string;
  readonly assetPath?: string;
  readonly stage: MutationStage;
  readonly problem?: string;
}

export class StorageMutationJournal implements MutationJournal {
  public constructor(private readonly storage: KeyValueStorage) {}

  public async start(input: Parameters<MutationJournal["start"]>[0]): Promise<void> {
    await this.write(input.id, {
      operation: input.operation,
      collectionId: input.collectionId,
      sourceId: input.sourceId,
      annotationId: input.annotationId,
      ...(input.assetPath ? { assetPath: input.assetPath } : {}),
      stage: "planned",
    });
  }

  public async mark(id: MutationId, stage: MutationStage, problem?: string): Promise<void> {
    const value = await this.storage.get(key(id));
    if (!value) {
      throw new Error(`Reader mutation ${id} is missing from its recovery journal.`);
    }
    const entry = JSON.parse(value) as JournalEntry;
    if (stage === "complete") {
      await this.storage.remove(key(id));
      return;
    }
    await this.write(id, { ...entry, stage, ...(problem ? { problem } : {}) });
  }

  private async write(id: MutationId, entry: JournalEntry): Promise<void> {
    await this.storage.set(key(id), JSON.stringify(entry));
  }
}

/**
 * Record creates kept on this device until the collection confirms them. One key per
 * create, so two tabs never overwrite each other's entries.
 */
export class StorageCreateJournal implements CreateJournal {
  public constructor(private readonly storage: ListableStorage) {}

  public async get(collectionId: string, key: string): Promise<PendingCreate | null> {
    const value = await this.storage.get(createKey(collectionId, key));
    return value === null ? null : parseCreate(value);
  }

  public async put(entry: PendingCreate): Promise<void> {
    await this.storage.set(createKey(entry.collectionId, entry.key), JSON.stringify(entry));
  }

  public async list(collectionId: string): Promise<readonly PendingCreate[]> {
    const entries: PendingCreate[] = [];
    for (const key of await this.storage.keys(createKey(collectionId, ""))) {
      const value = await this.storage.get(key);
      const entry = value === null ? null : parseCreate(value);
      if (entry?.collectionId === collectionId) {
        entries.push(entry);
      }
    }
    // Oldest first: a record is written before the records that link to it.
    return entries.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }

  public async remove(collectionId: string, key: string): Promise<void> {
    await this.storage.remove(createKey(collectionId, key));
  }
}

function createKey(collectionId: string, key: string): string {
  return `mdbase-reader:create:${encodeURIComponent(collectionId)}:${key}`;
}

function parseCreate(value: string): PendingCreate | null {
  try {
    const entry = JSON.parse(value) as Partial<PendingCreate> | null;
    return entry !== null &&
      typeof entry.key === "string" &&
      typeof entry.collectionId === "string" &&
      typeof entry.recordId === "string" &&
      Array.isArray(entry.candidates) &&
      typeof entry.attempt === "number" &&
      typeof entry.input === "object"
      ? (entry as PendingCreate)
      : null;
  } catch {
    return null;
  }
}

export function createReaderRuntimeServices(storage: KeyValueStorage): {
  readonly clock: Clock;
  readonly hasher: ContentHasher;
  readonly ids: ReaderIdGenerator;
  readonly journal: MutationJournal;
} {
  return {
    clock: { now: () => dateTime(new Date().toISOString()) },
    hasher: {
      async sha256(bytes) {
        const buffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
        const digest = Array.from(new Uint8Array(buffer), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        return `sha256:${digest}`;
      },
    },
    ids: {
      source: () => sourceId(`src_${crypto.randomUUID()}`),
      annotation: () => annotationId(`ann_${crypto.randomUUID()}`),
      // Connect uses mutation identities as resumable file-transfer identities.
      // Keep them as UUIDs so the same identifier is valid at both boundaries.
      mutation: () => mutationId(crypto.randomUUID()),
    },
    journal: new StorageMutationJournal(storage),
  };
}

function key(id: MutationId): string {
  return `mdbase-reader:mutation:${id}`;
}

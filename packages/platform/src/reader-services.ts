import {
  annotationId,
  dateTime,
  mutationId,
  type Clock,
  type MutationId,
  type MutationJournal,
  type MutationStage,
  type ReaderIdGenerator,
} from "@mdbase-reader/core";

import type { KeyValueStorage } from "./platform.js";

interface JournalEntry {
  readonly operation: "create-annotation";
  readonly collectionId: string;
  readonly sourceId: string;
  readonly annotationId: string;
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

export function createReaderRuntimeServices(storage: KeyValueStorage): {
  readonly clock: Clock;
  readonly ids: ReaderIdGenerator;
  readonly journal: MutationJournal;
} {
  return {
    clock: { now: () => dateTime(new Date().toISOString()) },
    ids: {
      annotation: () => annotationId(`ann_${crypto.randomUUID()}`),
      mutation: () => mutationId(`mutation_${crypto.randomUUID()}`),
    },
    journal: new StorageMutationJournal(storage),
  };
}

function key(id: MutationId): string {
  return `mdbase-reader:mutation:${id}`;
}

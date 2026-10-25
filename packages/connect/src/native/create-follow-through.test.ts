import { connect } from "@mdbase-dev/sdk";
import {
  annotationId,
  collectionId,
  dateTime,
  mutationId,
  sourceId,
  type Annotation,
  type CreateJournal,
  type PendingCreate,
  type PlannedSourceFileImport,
} from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import { plan } from "../source-imports.fixtures.js";

import { nativeReaderCollection, type NativeReaderCollection } from "./native-collection.js";
import { mdbaseError, memoryConnection, MemoryReplica } from "./testing.js";

import type { MdbaseApplicationConnection } from "@mdbase-dev/sdk";

/** The device journal, as `StorageCreateJournal` keeps it, without the storage. */
class MemoryJournal implements CreateJournal {
  readonly entries = new Map<string, PendingCreate>();

  get(_collection: string, key: string): Promise<PendingCreate | null> {
    return Promise.resolve(this.entries.get(key) ?? null);
  }

  put(entry: PendingCreate): Promise<void> {
    // Stored as JSON, as on a device.
    this.entries.set(entry.key, JSON.parse(JSON.stringify(entry)) as PendingCreate);
    return Promise.resolve();
  }

  list(collection: string): Promise<readonly PendingCreate[]> {
    return Promise.resolve(
      [...this.entries.values()]
        .filter((entry) => entry.collectionId === collection)
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    );
  }

  remove(_collection: string, key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) {
    close();
  }
});

/** What the log answers when another device took the path first (`intent.md` §3.1). */
const pathTaken = mdbaseError(
  "conflict",
  "path sources/adam.md is taken",
  "path_taken",
).toProblem();

let clock = 0;
const now = (): string => new Date(Date.UTC(2026, 9, 25, 12, 0, clock++)).toISOString();

function open(
  connection: MdbaseApplicationConnection,
  journal: CreateJournal,
): NativeReaderCollection {
  const collection = nativeReaderCollection(connection, { creates: journal, receiptWaitMs: 20 });
  cleanup.push(() => collection.dispose());
  return collection;
}

async function offlineDevice(): Promise<{
  replica: MemoryReplica;
  connection: MdbaseApplicationConnection;
  journal: MemoryJournal;
  collection: NativeReaderCollection;
}> {
  // Nothing confirms until the test says so: the device is saving offline.
  const memory = await memoryConnection({ confirmDelayMs: null });
  cleanup.push(memory.close);
  const journal = new MemoryJournal();
  return { ...memory, journal, collection: open(memory.connection, journal) };
}

function sourcePlan(collection: string): PlannedSourceFileImport {
  return {
    ...plan(),
    collectionId: collectionId(collection),
    sourceId: sourceId("src_adam"),
    title: "Adam",
    savedAt: dateTime(now()),
    recordPath: "sources/adam.md",
    fallbackRecordPath: "sources/adam-src_adam.md",
    representations: [],
  };
}

function note(collection: string, source: string): Annotation {
  return {
    id: annotationId("ann_note"),
    collectionId: collectionId(collection),
    sourceId: sourceId("src_adam"),
    source,
    annotationType: "note",
    tags: [],
    body: "Useful for the reading group.",
    createdAt: dateTime(now()),
  };
}

function recordAt(replica: MemoryReplica, path: string): Record<string, unknown> | undefined {
  const record = replica.allRecords.find((item) => item.path === path);
  return record ? Object.fromEntries(record.frontmatter) : undefined;
}

function entry(journal: MemoryJournal, key: string): PendingCreate {
  const found = journal.entries.get(key);
  if (!found) {
    throw new Error(`No journal entry for ${key}.`);
  }
  return found;
}

function sourceMutation(journal: MemoryJournal): string {
  const id = entry(journal, "src_adam").mutationId;
  if (!id) {
    throw new Error("The source create has no mutation yet.");
  }
  return id;
}

describe("create follow-through", () => {
  it("keeps a refused source in the journal and lands it at the fallback with its links", async () => {
    const { replica, journal, collection } = await offlineDevice();
    const reading = replica.collection;
    const source = await collection.sourceImports.commitFile(sourcePlan(reading));
    expect(source.path).toBe("sources/adam.md");
    await collection.annotations.create(
      note(reading, "[[sources/adam|Adam]]"),
      mutationId("0199a1b2-0000-7000-8000-000000000001"),
    );

    // Saved on this device only: both creates stay in the journal.
    expect(entry(journal, "src_adam")).toMatchObject({ state: "pending", attempt: 0 });
    expect(entry(journal, "0199a1b2-0000-7000-8000-000000000001")).toMatchObject({
      state: "pending",
      dependsOn: ["src_adam"],
    });

    // Another device saved "Adam" first. At head our source is refused and dropped here,
    // while the annotation (whose path is its own) is confirmed.
    replica.reject(sourceMutation(journal), pathTaken);
    replica.seed({
      path: "sources/adam.md",
      types: ["reader-source"],
      frontmatter: { id: "src_other", title: "Adam" },
    });
    replica.confirmAll();
    await collection.createFollowThrough?.reconcile();

    // Re-created at the fallback under a new intent, from the content in the journal.
    expect(entry(journal, "src_adam")).toMatchObject({ attempt: 1, submission: 1 });
    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({
      id: "src_adam",
      title: "Adam",
    });
    expect(recordAt(replica, "sources/adam.md")).toMatchObject({ id: "src_other" });
    // The annotation now links to our source, not the other device's.
    expect(recordAt(replica, "annotations/ann_note.md")).toMatchObject({
      source: "[[sources/adam-src_adam|Adam]]",
    });
    // Confirmed, but kept until its source is confirmed too.
    expect(entry(journal, "0199a1b2-0000-7000-8000-000000000001").state).toBe("confirmed");

    replica.confirmAll();
    await collection.createFollowThrough?.reconcile();
    expect(journal.entries.size).toBe(0);
    expect(collection.createFollowThrough?.getSnapshot()).toEqual({ waiting: 0, attention: [] });
  });

  it("asks for the user, keeping the content, when every name is taken", async () => {
    const { replica, journal, collection } = await offlineDevice();
    const reading = replica.collection;
    await collection.sourceImports.commitFile(sourcePlan(reading));
    const first = sourceMutation(journal);
    // The fallback is taken too, by a record this device has not seen yet.
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    replica.seed({
      path: "sources/adam-src_adam.md",
      types: ["note"],
      frontmatter: { id: "b" },
    });
    await collection.createFollowThrough?.reconcile();

    expect(entry(journal, "src_adam")).toMatchObject({
      state: "needs-attention",
      input: { frontmatter: { id: "src_adam", title: "Adam" } },
    });
    expect(collection.createFollowThrough?.getSnapshot().attention).toEqual([
      expect.objectContaining({ key: "src_adam", kind: "source", label: "Adam" }),
    ]);

    // An ordinary pass leaves it alone; trying again after the name is freed lands it.
    await collection.createFollowThrough?.reconcile();
    expect(entry(journal, "src_adam").state).toBe("needs-attention");
    replica.deleteElsewhere("sources/adam-src_adam.md");
    await collection.createFollowThrough?.reconcile({ retry: true });
    replica.confirmAll();
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({ id: "src_adam" });
    expect(journal.entries.size).toBe(0);
  });

  it("settles a pending create kept from before a restart", async () => {
    const replica = new MemoryReplica({ confirmDelayMs: null });
    const journal = new MemoryJournal();
    const session = async (): Promise<MdbaseApplicationConnection> => {
      const client = await connect({
        connector: replica.connector(),
        app: { name: "reader-native-test", version: "test" },
        reconnect: false,
      });
      cleanup.push(() => client.close());
      return { ...(await memoryConnectionFor(replica)), records: client, files: client.files };
    };
    const before = open(await session(), journal);
    await before.sourceImports.commitFile(sourcePlan(replica.collection));
    const first = sourceMutation(journal);
    before.dispose();

    // While Reader was closed, the log refused it.
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });

    // Opening the collection again reconciles the journal without being asked.
    const after = open(await session(), journal);
    await until(() => recordAt(replica, "sources/adam-src_adam.md") !== undefined);
    replica.confirmAll();
    await after.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({ id: "src_adam" });
    expect(journal.entries.size).toBe(0);
  });

  it("reconciles when the link opens again after a refusal it missed", async () => {
    const replica = new MemoryReplica({ confirmDelayMs: null });
    const client = await connect({
      connector: replica.connector(),
      app: { name: "reader-native-test", version: "test" },
      reconnect: { minDelayMs: 10, maxDelayMs: 20 },
    });
    cleanup.push(() => client.close());
    const journal = new MemoryJournal();
    const collection = open(
      { ...(await memoryConnectionFor(replica)), records: client, files: client.files },
      journal,
    );
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    const first = sourceMutation(journal);

    // The link drops, and the refusal happens while nobody is listening.
    replica.dropConnections();
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });

    // Nobody calls reconcile here: the link opening again does.
    await until(() => {
      const current = journal.entries.get("src_adam");
      return current?.attempt === 1 && current.state === "pending";
    });
    expect(entry(journal, "src_adam")).toMatchObject({ attempt: 1, submission: 1 });
    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({ id: "src_adam" });
  });
});

/** The application connection fields `memoryConnection` fills, for another client. */
async function memoryConnectionFor(
  replica: MemoryReplica,
): Promise<Omit<MdbaseApplicationConnection, "records" | "files">> {
  const { connection, close } = await memoryConnection({ collection: replica.collection });
  close();
  // The caller replaces `records` and `files` with its own client's.
  return connection;
}

async function until(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for reconciliation.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

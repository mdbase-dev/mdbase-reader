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

/** The one query the follow-through makes: a record by its Reader `id`. */
function whereId(
  expression: string,
  record: { readonly frontmatter: Map<string, unknown> },
): boolean {
  const match = /^id == (".*")$/u.exec(expression);
  return match?.[1] !== undefined && record.frontmatter.get("id") === JSON.parse(match[1]);
}

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

/**
 * Answer `pending` without the optimistic `records`, as a real replica does (replica
 * `submit.rs` `pending_receipt` sets `records: None`; SDK `Write.records` then is `[]`).
 */
function withoutPendingRecords(replica: MemoryReplica): void {
  const receipts = (
    replica as unknown as { receipts: Map<string, { state: string; records?: unknown }> }
  ).receipts;
  const set = receipts.set.bind(receipts);
  receipts.set = (mutation, receipt) => {
    if (receipt.state === "pending") {
      // The same object is what the submit answers with.
      delete receipt.records;
    }
    return set(mutation, receipt);
  };
}

async function offlineDevice(options: { readonly pendingRecords?: boolean } = {}): Promise<{
  replica: MemoryReplica;
  connection: MdbaseApplicationConnection;
  journal: MemoryJournal;
  collection: NativeReaderCollection;
}> {
  // Nothing confirms until the test says so: the device is saving offline.
  const memory = await memoryConnection({ confirmDelayMs: null, where: whereId });
  cleanup.push(memory.close);
  if (options.pendingRecords === false) {
    withoutPendingRecords(memory.replica);
  }
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
    recordPathCandidates: ["sources/adam.md", "sources/adam-src_adam.md"],
    representations: [],
  };
}

function note(collection: string, source: string, owner = "src_adam", id = "ann_note"): Annotation {
  return {
    id: annotationId(id),
    collectionId: collectionId(collection),
    sourceId: sourceId(owner),
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

/** A source create kept from before, whose mutation this replica has no receipt for. */
function unknownOutcome(collection: string): PendingCreate {
  return {
    key: "src_adam",
    collectionId: collection,
    kind: "source",
    recordId: "src_adam",
    label: "Adam",
    candidates: ["sources/adam.md", "sources/adam-src_adam.md"],
    attempt: 0,
    submission: 0,
    input: { type: "reader-source", frontmatter: { id: "src_adam", title: "Adam" } },
    state: "pending",
    mutationId: "0199a1b2-0000-7000-8000-00000000dead",
    startedAt: now(),
  };
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
    const replica = new MemoryReplica({ confirmDelayMs: null, where: whereId });
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
    const replica = new MemoryReplica({ confirmDelayMs: null, where: whereId });
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

describe("create follow-through and the user's own changes", () => {
  it("lets go of a pending source the user removes, when head refuses both", async () => {
    const { replica, journal, collection } = await offlineDevice();
    const source = await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    const first = sourceMutation(journal);
    const plan = await collection.sources.preflightDelete?.(source);
    if (!plan) {
      throw new Error("The native source repository removes sources.");
    }
    await collection.sources.delete?.(plan);
    expect(journal.entries.has("src_adam")).toBe(false);

    // Another device saved "Adam" first: head refuses the create, and the delete with it.
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    await collection.createFollowThrough?.reconcile();

    expect(recordAt(replica, "sources/adam-src_adam.md")).toBeUndefined();
    expect(journal.entries.size).toBe(0);
  });

  it("resends a create whose outcome is not known under its own intent", async () => {
    const { replica, journal, collection } = await offlineDevice();
    // As after sign-out cleared this device: the journal kept the create, the replica has
    // no receipt for its mutation and no record carrying its `id`.
    await journal.put(unknownOutcome(replica.collection));
    await collection.createFollowThrough?.reconcile();

    // The same write, not a new one: a create the log took before lands once.
    expect(entry(journal, "src_adam")).toMatchObject({ submission: 0, attempt: 0 });
    expect(recordAt(replica, "sources/adam.md")).toMatchObject({ id: "src_adam" });
    expect(replica.allRecords.filter(({ path }) => path.startsWith("sources/"))).toHaveLength(1);
  });

  it("treats a refused path that its own record holds as saved", async () => {
    const { replica, journal, collection } = await offlineDevice();
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    // An earlier write of this create already holds the name.
    replica.reject(sourceMutation(journal), pathTaken);
    replica.seed({
      path: "sources/adam.md",
      types: ["reader-source"],
      frontmatter: { id: "src_adam", title: "Adam" },
    });
    await collection.createFollowThrough?.reconcile();

    expect(recordAt(replica, "sources/adam-src_adam.md")).toBeUndefined();
    expect(journal.entries.size).toBe(0);
    expect(collection.createFollowThrough?.getSnapshot().attention).toEqual([]);
  });
});

describe.each([
  { receipts: "optimistic records", pendingRecords: true },
  { receipts: "no records, as a real replica answers", pendingRecords: false },
])("create follow-through with pending receipts carrying $receipts", ({ pendingRecords }) => {
  it("knows the record of a pending create before any receipt names it", async () => {
    const { replica, connection, journal, collection } = await offlineDevice({ pendingRecords });
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    const receipt = await connection.records.receipt(sourceMutation(journal));
    expect(receipt.state).toBe("pending");
    expect(receipt.records === undefined).toBe(!pendingRecords);
    const record = replica.allRecords.find(({ path }) => path === "sources/adam.md");
    expect(entry(journal, "src_adam").replicaId).toBe(record?.id);
  });

  it("lets go of a pending record deleted on this device outside Reader", async () => {
    const { replica, connection, journal, collection } = await offlineDevice({ pendingRecords });
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    const first = sourceMutation(journal);
    await connection.records.delete(await connection.records.get({ path: "sources/adam.md" }));
    // Seen gone from the local view while its create is pending: deleted here.
    await collection.createFollowThrough?.reconcile();
    expect(journal.entries.has("src_adam")).toBe(false);

    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam-src_adam.md")).toBeUndefined();
  });

  it("writes the user's edits again when a pending source moves to its fallback", async () => {
    const { replica, connection, journal, collection } = await offlineDevice({ pendingRecords });
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    const first = sourceMutation(journal);
    await connection.records.update(await connection.records.get({ path: "sources/adam.md" }), {
      patch: { title: "Adam, revised" },
      body: "# Adam\n\nMy reading notes.\n",
    });
    await collection.createFollowThrough?.reconcile();

    // The edit names a record the log never had, so it is refused with the create.
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    await collection.createFollowThrough?.reconcile();

    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({
      id: "src_adam",
      title: "Adam, revised",
    });
    expect(
      replica.allRecords.find(({ path }) => path === "sources/adam-src_adam.md")?.body,
    ).toContain("My reading notes.");
  });
});

describe("create follow-through and links to other records", () => {
  it("leaves links to another source alone when a create moves past its taken name", async () => {
    const { replica, collection } = await offlineDevice();
    const reading = replica.collection;
    replica.seed({
      path: "sources/adam.md",
      types: ["reader-source"],
      frontmatter: { id: "src_other", title: "Adam" },
    });
    const source = await collection.sourceImports.commitFile(sourcePlan(reading));
    expect(source.path).toBe("sources/adam-src_adam.md");

    // A highlight on the other source, which really is at sources/adam.md.
    await collection.annotations.create(
      note(reading, "[[sources/adam|Adam]]", "src_other"),
      mutationId("0199a1b2-0000-7000-8000-000000000003"),
    );
    expect(recordAt(replica, "annotations/ann_note.md")).toMatchObject({
      source: "[[sources/adam|Adam]]",
    });
  });

  it("follows a refused source's move only for records that link to that source", async () => {
    const { replica, journal, collection } = await offlineDevice();
    const reading = replica.collection;
    await collection.sourceImports.commitFile(sourcePlan(reading));
    replica.reject(sourceMutation(journal), pathTaken);
    replica.seed({
      path: "sources/adam.md",
      types: ["reader-source"],
      frontmatter: { id: "src_other", title: "Adam" },
    });
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam-src_adam.md")).toMatchObject({ id: "src_adam" });

    // A pane still showing our source at its old path, and one showing the other source.
    await collection.annotations.create(
      note(reading, "[[sources/adam|Adam]]", "src_adam", "ann_stale"),
      mutationId("0199a1b2-0000-7000-8000-000000000004"),
    );
    await collection.annotations.create(
      note(reading, "[[sources/adam|Adam]]", "src_other", "ann_other"),
      mutationId("0199a1b2-0000-7000-8000-000000000005"),
    );
    expect(recordAt(replica, "annotations/ann_stale.md")).toMatchObject({
      source: "[[sources/adam-src_adam|Adam]]",
    });
    expect(recordAt(replica, "annotations/ann_other.md")).toMatchObject({
      source: "[[sources/adam|Adam]]",
    });
  });
});

describe("create follow-through bookkeeping", () => {
  it("keeps a moved link for an annotation that was being saved when its source moved", async () => {
    const { replica, journal, collection } = await offlineDevice();
    const reading = replica.collection;
    await collection.sourceImports.commitFile(sourcePlan(reading));
    const first = sourceMutation(journal);
    // The annotation's save is in flight (waiting for its receipt) while the source moves.
    const saving = collection.annotations.create(
      note(reading, "[[sources/adam|Adam]]"),
      mutationId("0199a1b2-0000-7000-8000-000000000002"),
    );
    await until(() => journal.entries.has("0199a1b2-0000-7000-8000-000000000002"));
    replica.reject(first, pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    await collection.createFollowThrough?.reconcile();
    await saving;
    await collection.createFollowThrough?.reconcile();

    expect(entry(journal, "0199a1b2-0000-7000-8000-000000000002").input.frontmatter).toMatchObject({
      source: "[[sources/adam-src_adam|Adam]]",
    });
    expect(recordAt(replica, "annotations/ann_note.md")).toMatchObject({
      source: "[[sources/adam-src_adam|Adam]]",
    });
  });

  it("still creates the record when the journal cannot be written", async () => {
    const memory = await memoryConnection({ confirmDelayMs: null });
    cleanup.push(memory.close);
    const full = new MemoryJournal();
    full.put = () => Promise.reject(new DOMException("Storage is full.", "QuotaExceededError"));
    const collection = open(memory.connection, full);

    const source = await collection.sourceImports.commitFile(sourcePlan(memory.replica.collection));
    expect(source.path).toBe("sources/adam.md");
    expect(recordAt(memory.replica, "sources/adam.md")).toMatchObject({ id: "src_adam" });
  });

  it("waits for the replica to catch up before writing a create it cannot find", async () => {
    const { replica, connection, journal, collection } = await offlineDevice();
    await journal.put(unknownOutcome(replica.collection));
    const client = connection.records;
    const ledger = client.ledger;
    const snapshot = ledger.getSnapshot.bind(ledger);
    const status = client.status;

    // The ledger is not restored yet (after a reload): the record may not have arrived.
    ledger.getSnapshot = () => ({ ...snapshot(), restored: false });
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam.md")).toBeUndefined();
    expect(entry(journal, "src_adam")).toMatchObject({ state: "pending", submission: 0 });

    // Restored, but behind the head it knows of: still not a decision.
    ledger.getSnapshot = snapshot;
    Object.defineProperty(client, "status", {
      configurable: true,
      get: () => ({ ...status, confirmedThrough: 1, headKnown: 5 }),
    });
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam.md")).toBeUndefined();

    // Caught up, and no record carries its `id`: the same write goes again.
    Reflect.deleteProperty(client, "status");
    await collection.createFollowThrough?.reconcile();
    expect(recordAt(replica, "sources/adam.md")).toMatchObject({ id: "src_adam" });
    expect(entry(journal, "src_adam")).toMatchObject({ submission: 0, attempt: 0 });
  });

  it("does not send a write the user removed while it was about to go out", async () => {
    const { replica, journal, collection } = await offlineDevice();
    await journal.put(unknownOutcome(replica.collection));
    const follow = collection.createFollowThrough as unknown as {
      forget(recordId: string): Promise<void>;
    };
    const put = journal.put.bind(journal);
    journal.put = async (value) => {
      if (value.state !== "submitting") {
        return put(value);
      }
      // The user removes the source just as the reconciler writes it again.
      await follow.forget("src_adam");
    };
    await collection.createFollowThrough?.reconcile();

    expect(recordAt(replica, "sources/adam.md")).toBeUndefined();
    expect(journal.entries.size).toBe(0);
  });

  it("discards a create that needs the user, and does not bring it back", async () => {
    const { replica, journal, collection } = await offlineDevice();
    await collection.sourceImports.commitFile(sourcePlan(replica.collection));
    replica.reject(sourceMutation(journal), pathTaken);
    replica.seed({ path: "sources/adam.md", types: ["reader-source"], frontmatter: { id: "a" } });
    replica.seed({ path: "sources/adam-src_adam.md", types: ["note"], frontmatter: { id: "b" } });
    await collection.createFollowThrough?.reconcile();
    expect(collection.createFollowThrough?.getSnapshot().attention).toEqual([
      expect.objectContaining({ key: "src_adam", reason: "names-taken" }),
    ]);

    await collection.createFollowThrough?.discard("src_adam");
    await collection.createFollowThrough?.reconcile({ retry: true });
    expect(journal.entries.size).toBe(0);
    expect(collection.createFollowThrough?.getSnapshot()).toEqual({ waiting: 0, attention: [] });
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

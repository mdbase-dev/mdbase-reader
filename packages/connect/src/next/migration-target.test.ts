import { connect, mdbaseError, toPlain, type MdbaseClient } from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextMigrationTarget } from "./migration-target.js";

import type { Fields, MigrationRecord } from "@mdbase-reader/migration";

const clients: MdbaseClient[] = [];
const signal = (): AbortSignal => new AbortController().signal;
const record: MigrationRecord = {
  id: "src_stable",
  key: "zotero-item",
  path: "sources/import.md",
  fields: {},
  body: "Imported notes",
};
const fields: Fields = {
  id: record.id,
  title: "A paper",
  import: { namespace: "zotero:user:123", key: record.key },
};

async function open(replica = new MemoryReplica({ confirmDelayMs: 0 })): Promise<{
  replica: MemoryReplica;
  db: MdbaseClient;
  target: NextMigrationTarget;
}> {
  const db = await connect({
    app: { name: "reader-import-test", version: "0" },
    connector: replica.connector(),
    reconnect: false,
  });
  clients.push(db);
  return { replica, db, target: new NextMigrationTarget(db) };
}

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

afterEach(() => {
  clients.splice(0).forEach((db) => db.close());
  vi.restoreAllMocks();
});

describe("next Reader migration", () => {
  it("waits for confirmation, then resumes with the same identity across sessions", async () => {
    const replica = new MemoryReplica({ confirmDelayMs: null });
    const { db, target } = await open(replica);
    let completed = false;
    const operation = target.create(record, fields, "reader-source", signal()).then(() => {
      completed = true;
    });
    await until(() => replica.allRecords.length === 1);
    expect(completed).toBe(false);
    replica.confirmAll();
    await operation;
    const id = replica.allRecords[0]?.id;
    db.close();
    const reopened = await open(replica);
    await reopened.target.create(record, fields, "reader-source", signal());
    expect(replica.allRecords).toHaveLength(1);
    expect(replica.allRecords[0]?.id).toBe(id);
    expect((await reopened.target.existing(signal())).get(record.id)).toEqual(fields);
  });

  it("reuses the original mutation when its confirmation response was lost", async () => {
    const { db, target, replica } = await open();
    const submit = db.submit.bind(db);
    vi.spyOn(db, "submit").mockImplementationOnce(async (...args) => {
      await submit(...args);
      throw mdbaseError("unavailable", "response lost");
    });
    await expect(target.create(record, fields, "reader-source", signal())).rejects.toMatchObject({
      code: "unavailable",
    });
    await target.create(record, fields, "reader-source", signal());
    expect(replica.allRecords).toHaveLength(1);
  });

  it("canonicalizes field order but refuses changed payloads without overwriting", async () => {
    const { target, replica } = await open();
    await target.create(record, fields, "reader-source", signal());
    await target.create(
      record,
      { import: fields["import"]!, title: "A paper", id: record.id },
      "reader-source",
      signal(),
    );
    await expect(
      target.create(record, { ...fields, title: "Different paper" }, "reader-source", signal()),
    ).rejects.toBeDefined();
    expect(replica.allRecords).toHaveLength(1);
    expect(toPlain(replica.allRecords[0]!.frontmatter.get("title")!)).toBe("A paper");
  });

  it("refuses collisions with existing paths and malformed provenance", async () => {
    const { target, replica } = await open();
    replica.seed({ path: record.path, body: "User bytes" });
    await expect(target.create(record, fields, "reader-source", signal())).rejects.toMatchObject({
      code: "conflict",
      reason: "path_taken",
    });
    await expect(
      target.create(record, { ...fields, import: null }, "reader-source", signal()),
    ).rejects.toThrow("Invalid import identity");
    expect(replica.allRecords).toHaveLength(1);
    expect(replica.allRecords[0]?.body).toBe("User bytes");
  });

  it("stops on duplicate destination IDs and does not submit after cancellation", async () => {
    const { target, replica, db } = await open();
    replica.seed({ path: "a.md", types: ["reader-source"], frontmatter: { id: record.id } });
    replica.seed({ path: "b.md", types: ["reader-annotation"], frontmatter: { id: record.id } });
    await expect(target.existing(signal())).rejects.toThrow("duplicate record IDs");
    const abort = new AbortController();
    abort.abort();
    const submit = vi.spyOn(db, "submit");
    await expect(
      target.create(record, fields, "reader-source", abort.signal),
    ).rejects.toBeDefined();
    expect(submit).not.toHaveBeenCalled();
  });

  it("uploads confirmed files with collection-scoped stable transfer and file IDs", async () => {
    const { target } = await open();
    const path = "files/reader/imports/paper.pdf";
    const bytes = new Blob(["PDF bytes"]);
    const progress = vi.fn();
    const first = await target.upload(
      path,
      bytes,
      "application/pdf",
      "paper-key",
      signal(),
      progress,
    );
    const again = await target.upload(
      path,
      bytes,
      "application/pdf",
      "paper-key",
      signal(),
      progress,
    );
    expect(again).toEqual(first);
    expect((await target.files(signal())).get(path)).toEqual(first);
    expect(progress).toHaveBeenCalled();
  });
});

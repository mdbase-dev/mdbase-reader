import { connect, type MdbaseClient } from "@mdbase-dev/sdk";
import {
  MemoryReplica,
  type MemoryContract,
  type MemoryReplicaOptions,
} from "@mdbase-dev/sdk/testing";
import { afterEach, describe, expect, it } from "vitest";

import { sourceContract } from "../contracts.js";
import { outcomeValue } from "../repository-client.js";

import { nativeReaderClient, type NativeReaderClient } from "./native-client.js";

const memorySourceContract: MemoryContract = {
  ...sourceContract,
  type: "reader-source",
  fields: { id: "id", title: "title", kind: "kind", saved_at: "saved_at" },
};

const clients: MdbaseClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close();
  }
});

async function native(
  options: MemoryReplicaOptions = {},
  receiptWaitMs?: number,
): Promise<{ replica: MemoryReplica; client: NativeReaderClient }> {
  const replica = new MemoryReplica({ confirmDelayMs: 0, ...options });
  const sdk = await connect({
    connector: replica.connector(),
    app: { name: "reader-native-test", version: "test" },
    reconnect: false,
  });
  clients.push(sdk);
  return {
    replica,
    client: nativeReaderClient(sdk, () => true, receiptWaitMs ? { receiptWaitMs } : {}),
  };
}

describe("native Reader client", () => {
  it("pages every matching record through native cursors as Reader query pages", async () => {
    const { replica, client } = await native();
    for (const index of ["0", "1", "2", "3", "4"]) {
      replica.seed({
        path: `sources/s${index}.md`,
        types: ["reader-source"],
        frontmatter: { id: `s${index}`, title: `Source ${index}` },
      });
    }
    replica.seed({ path: "notes/other.md", types: ["note"], frontmatter: { id: "n" } });

    const pages = [];
    for await (const outcome of client.queryPages(
      { types: ["reader-source"], frontmatterMode: "effective" },
      { pageSize: 2 },
    )) {
      pages.push(outcomeValue(outcome, "query"));
    }

    expect(pages.map((page) => page.results.length)).toEqual([2, 2, 1]);
    expect(pages.at(-1)).toMatchObject({ complete: true, loaded: 5 });
    expect(
      pages.flatMap((page) => page.results.map((row) => row.effectiveFrontmatter?.["id"])),
    ).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(pages[0]?.results[0]).toMatchObject({
      path: "sources/s0.md",
      file: { path: "sources/s0.md", name: "s0", folder: "sources" },
    });
  });

  it("reports a CAS write saved only from the confirmed readback, removing null fields", async () => {
    const { replica, client } = await native();
    replica.seed({
      path: "sources/a.md",
      types: ["reader-source"],
      frontmatter: { id: "a", title: "Old", note: "drop me" },
      body: "old body",
    });
    const read = outcomeValue(await client.read({ path: "sources/a.md" }), "read");

    const saved = outcomeValue(
      await client.update({
        path: "sources/a.md",
        ifRevision: read.revision,
        patch: { title: "New", note: null },
        body: "new body",
      }),
      "update",
    );

    expect(saved.effectiveFrontmatter).toEqual({ id: "a", title: "New" });
    expect(saved.body).toBe("new body");
    expect(saved.revision).not.toBe(read.revision);

    const stale = await client.update({
      path: "sources/a.md",
      ifRevision: read.revision,
      patch: { title: "Stale" },
    });
    expect(stale.ok ? null : stale.problem.code).toBe("concurrent_modification");
  });

  it("reports a write the log has not confirmed as saved on this device, with nothing to recover", async () => {
    const { replica, client } = await native({ confirmDelayMs: null }, 50);
    replica.seed({ path: "notes/a.md", types: ["reader-annotation"], frontmatter: { id: "a" } });

    const saved = outcomeValue(
      await client.update({ path: "notes/a.md", patch: {}, body: "kept" }),
      "update",
    );

    expect(saved.body).toBe("kept");
    replica.confirmAll();
    expect(replica.allRecords.find((record) => record.path === "notes/a.md")?.body).toBe("kept");
  });

  it("reads and updates a source through its contract view, reading back the contract view", async () => {
    const { replica, client } = await native({ contracts: [memorySourceContract] });
    replica.seed({
      path: "sources/c.md",
      types: ["reader-source"],
      frontmatter: {
        type: "reader-source",
        id: "c",
        title: "Old",
        kind: "web",
        saved_at: "2026-10-11T00:00:00Z",
      },
      body: "kept body",
    });

    const read = outcomeValue(
      await client.read({ path: "sources/c.md", contract: sourceContract }),
      "contract read",
    );
    expect(read.effectiveFrontmatter["title"]).toBe("Old");
    expect(read.body).toBeUndefined();

    const saved = outcomeValue(
      await client.update({
        path: "sources/c.md",
        contract: sourceContract,
        ifRevision: read.revision,
        patch: { title: "New" },
      }),
      "contract update",
    );
    expect(saved.effectiveFrontmatter["title"]).toBe("New");
    expect(saved.contract?.id).toBe(sourceContract.id);
    expect(replica.allRecords.find((record) => record.path === "sources/c.md")?.body).toBe(
      "kept body",
    );
  });
});

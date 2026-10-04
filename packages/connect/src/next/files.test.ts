import { connect, type MdbaseClient } from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { collectionId, fileRevision } from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectCollectionFileRepository } from "../collection-files.js";
import { outcomeValue } from "../repository-client.js";

import { nextReaderFiles, transferUuid } from "./files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";

const clients: MdbaseClient[] = [];

async function open(): Promise<{
  readonly replica: MemoryReplica;
  readonly files: ReturnType<typeof nextReaderFiles>;
}> {
  const replica = new MemoryReplica({ confirmDelayMs: null });
  const db = await connect({
    app: { name: "mdbase-reader-test", version: "0" },
    connector: replica.connector(),
    reconnect: false,
  });
  clients.push(db);
  return { replica, files: nextReaderFiles(db) };
}

afterEach(() => {
  for (const db of clients.splice(0)) {
    db.close();
  }
});

const pdf = new TextEncoder().encode("%PDF-1.7 test document");

describe("mdbase-next Reader files", () => {
  it("uploads, lists, stats and downloads a file", async () => {
    const { files } = await open();

    const uploaded = await files.upload("documents/paper.pdf", new Blob([pdf]), {
      mediaType: "application/pdf",
      transferId: "reader-import:paper",
    });
    expect(uploaded).toMatchObject({
      path: "documents/paper.pdf",
      size: pdf.length,
      mediaType: "application/pdf",
      mediaClass: "pdf",
    });
    expect(uploaded.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const listed: CollectionFileDescriptor[] = [];
    for await (const file of files.list?.({ folder: "documents" }) ?? []) {
      listed.push(file);
    }
    expect(listed.map((file) => file.path)).toEqual(["documents/paper.pdf"]);

    const byId = outcomeValue(await files.stat({ fileId: uploaded.fileId }), "stat");
    const byPath = outcomeValue(await files.stat({ path: "documents/paper.pdf" }), "stat");
    const missing = outcomeValue(await files.stat({ path: "documents/none.pdf" }), "stat");
    expect(byId?.fileId).toBe(uploaded.fileId);
    expect(byPath?.fileId).toBe(uploaded.fileId);
    expect(missing).toBeNull();

    const blob = await files.download(uploaded);
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(pdf);
  });

  it("feeds Reader's collection file repository", async () => {
    const { replica, files } = await open();
    const uploaded = await files.upload("documents/paper.pdf", new Blob([pdf]));

    const exported = await new ConnectCollectionFileRepository(files).read(
      collectionId(replica.collection),
      "[[documents/paper.pdf]]",
      fileRevision(uploaded.contentDigest),
    );

    expect(exported.mediaType).toBe("application/pdf");
    expect(exported.bytes).toEqual(pdf);
  });

  it("derives stable transfer UUIDs from Reader's retry keys", async () => {
    const first = await transferUuid("reader-import:paper");

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(await transferUuid("reader-import:paper")).toBe(first);
    expect(await transferUuid("0190A0B0-0000-7000-8000-000000000000")).toBe(
      "0190a0b0-0000-7000-8000-000000000000",
    );
  });
});

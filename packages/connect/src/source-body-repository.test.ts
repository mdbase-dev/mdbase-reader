import { collectionId, recordRevision, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { mockSdk, testWrite, testRecord, testQuery } from "./records.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { RecordRef, QueryResult, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): Value {
  return value;
}

const document = testRecord({
  path: "sources/crime.md",
  revision: "rev-1",
  types: ["reader-source"],
  frontmatter: { id: "src_01", title: "Crime and Punishment" },
  effective: { id: "src_01", title: "Crime and Punishment" },
  body: "Notes",
}) satisfies RecordView;

function repositoryFixture(): {
  readonly repository: ConnectSourceRepository;
  readonly read: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
} {
  const pages = vi.fn(() =>
    singleQueryPage(
      testRecord({
        path: document.path,
        effective: document.frontmatter,
        types: document.types,
      }),
    ),
  );
  const read = vi.fn(() => Promise.resolve(success(document)));
  const update = vi.fn((_record: RecordRef, input: { readonly body?: string }) =>
    Promise.resolve(
      testWrite(
        success({ ...document, revision: "rev-2", body: input.body ?? document.body ?? "" }),
      ),
    ),
  );
  return {
    repository: new ConnectSourceRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages,
        get: read,
        update,
      }),
    ),
    read,
    update,
  };
}

async function* singleQueryPage(
  record: QueryResult["records"][number],
): AsyncGenerator<QueryResult> {
  yield await Promise.resolve(
    success(
      testQuery({
        records: [record],

        complete: true,
      }),
    ),
  );
}

describe("Connect source Markdown bodies", () => {
  it("reads a source note as a whole record after resolving its contract identity", async () => {
    const { repository, read } = repositoryFixture();

    const source = await repository.get(collectionId("reading"), sourceId("src_01"));

    expect(source?.body).toBe("Notes");
    expect(read).toHaveBeenCalledWith(
      {
        path: document.path,
      },
      expect.objectContaining({ include: { effective: true, body: true, document: true } }),
    );
    expect(read).not.toHaveBeenCalledWith(expect.objectContaining({ contract: expect.anything() }));
  });

  it("updates source notes through explicitly approved whole-record access", async () => {
    const { repository, update } = repositoryFixture();
    await repository.get(collectionId("reading"), sourceId("src_01"));
    await repository.updateBody({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      expectedRevision: recordRevision("rev-1"),
      body: "Updated notes",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: document.path }),
      expect.objectContaining({ ifRevision: "rev-1", patch: {}, body: "Updated notes" }),
      expect.anything(),
    );
  });

  it("appends materialised annotations through the same whole-record path", async () => {
    const { repository, update } = repositoryFixture();
    await repository.get(collectionId("reading"), sourceId("src_01"));
    await repository.appendAnnotationEmbed({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      expectedRevision: recordRevision("rev-1"),
      annotationId: "ann_01" as never,
      embed: "![[annotations/ann_01]]",
      idempotencyKey: "mutation-1" as never,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: document.path }),
      expect.objectContaining({
        body: "Notes\n\n![[annotations/ann_01]]\n",
      }),
      expect.anything(),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ contract: expect.anything() }),
    );
  });
});

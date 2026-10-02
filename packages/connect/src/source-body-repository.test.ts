import { collectionId, recordRevision, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument } from "@mdbase-dev/connect";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

const document = {
  path: "sources/crime.md",
  revision: "rev-1",
  types: ["reader-source"],
  frontmatter: { id: "src_01", title: "Crime and Punishment" },
  effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
  body: "Notes",
  file: {},
} satisfies RecordDocument;

function repositoryFixture(): {
  readonly repository: ConnectSourceRepository;
  readonly read: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
} {
  const queryPages = vi.fn(() =>
    singleQueryPage({
      path: document.path,
      effectiveFrontmatter: document.frontmatter,
      types: document.types,
      file: {},
    }),
  );
  const read = vi.fn(() => Promise.resolve(success(document)));
  const update = vi.fn((input: { readonly body?: string }) =>
    Promise.resolve(success({ ...document, revision: "rev-2", body: input.body ?? document.body })),
  );
  return {
    repository: new ConnectSourceRepository({
      ...legacyAuthorityFeatures,
      queryPages,
      read,
      update,
    } as unknown as ReaderConnectClient),
    read,
    update,
  };
}

async function* singleQueryPage(
  record: QueryPage["results"][number],
): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success({
      results: [record],
      page: 0,
      offset: 0,
      loaded: 1,
      complete: true,
    }),
  );
}

describe("Connect source Markdown bodies", () => {
  it("reads a source note as a whole record after resolving its contract identity", async () => {
    const { repository, read } = repositoryFixture();

    const source = await repository.get(collectionId("reading"), sourceId("src_01"));

    expect(source?.body).toBe("Notes");
    expect(read).toHaveBeenCalledWith({
      path: document.path,
      includeDocument: true,
    });
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

    expect(update).toHaveBeenCalledWith({
      path: document.path,
      ifRevision: "rev-1",
      patch: {},
      body: "Updated notes",
    });
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
      expect.objectContaining({
        path: document.path,
        body: "Notes\n\n![[annotations/ann_01]]\n",
      }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ contract: expect.anything() }),
    );
  });
});

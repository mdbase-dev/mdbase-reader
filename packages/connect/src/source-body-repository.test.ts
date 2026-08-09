import { collectionId, recordRevision, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryResult, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

const document = {
  path: "sources/gravity.md",
  revision: "rev-1",
  types: ["reader-source"],
  frontmatter: { id: "src_01", title: "Gravity and Grace" },
  effectiveFrontmatter: { id: "src_01", title: "Gravity and Grace" },
  body: "Notes",
  file: {},
} satisfies RecordDocument;

function repositoryFixture(): {
  readonly repository: ConnectSourceRepository;
  readonly update: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(() =>
    Promise.resolve(
      success<QueryResult>({
        results: [
          {
            path: document.path,
            effectiveFrontmatter: document.frontmatter,
            types: document.types,
            file: {},
          },
        ],
      }),
    ),
  );
  const read = vi.fn(() => Promise.resolve(success(document)));
  const update = vi.fn((input: { readonly body?: string }) =>
    Promise.resolve(success({ ...document, revision: "rev-2", body: input.body ?? document.body })),
  );
  return {
    repository: new ConnectSourceRepository({
      query,
      read,
      update,
    } as unknown as ReaderConnectClient),
    update,
  };
}

describe("Connect source Markdown bodies", () => {
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

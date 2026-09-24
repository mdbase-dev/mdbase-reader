import { collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("Connect source reading state", () => {
  it("rebases a reading update on the latest whole record and preserves extension fields", async () => {
    const frontmatter = {
      id: "src_01",
      title: "Gravity and Grace",
      reading: { status: "reading", custom_session: "keep-me" },
    };
    const current = record("rev-1", frontmatter);
    const savedReading = {
      ...frontmatter.reading,
      document_file_id: "file-01",
      position: { pdf: { page_index: 7 } },
      started_at: "2026-08-09T00:00:00.000Z",
      last_opened_at: "2026-08-09T00:00:00.000Z",
    };
    const updated = record("rev-2", { ...frontmatter, reading: savedReading });
    const queryPages = vi.fn(() =>
      singleQueryPage({
        path: current.path,
        effectiveFrontmatter: frontmatter,
        types: current.types,
        file: {},
      }),
    );
    const read = vi.fn(() => Promise.resolve(success(current)));
    const update = vi.fn(() => Promise.resolve(success(updated)));
    const repository = new ConnectSourceRepository({
      queryPages,
      read,
      update,
    } as unknown as ReaderConnectClient);
    await repository.get(collectionId("reading"), sourceId("src_01"));

    await repository.updateReading({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      expectedRevision: "stale-caller-revision" as never,
      documentFileId: "file-01" as never,
      position: { kind: "pdf", pageIndex: 7 },
      openedAt: dateTime("2026-08-09T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      path: "sources/gravity.md",
      ifRevision: "rev-1",
      patch: {
        reading: expect.objectContaining({
          custom_session: "keep-me",
          position: { pdf: { page_index: 7 } },
        }),
      },
      includeDocument: true,
    });
  });
});

describe("Connect source reading state with a current caller revision", () => {
  const frontmatter = {
    id: "src_01",
    title: "Gravity and Grace",
    reading: { status: "queued", custom_session: "keep-me" },
  };
  const input = {
    collectionId: collectionId("reading"),
    sourceId: sourceId("src_01"),
    expectedRevision: "rev-1" as never,
    expectedFrontmatter: frontmatter,
    documentFileId: "file-01" as never,
    position: { kind: "pdf", pageIndex: 3 } as const,
    openedAt: dateTime("2026-08-09T00:00:00.000Z"),
  };

  function repositoryWith(
    update: ReturnType<typeof vi.fn>,
    read = vi.fn(),
  ): ConnectSourceRepository {
    return new ConnectSourceRepository({
      queryPages: vi.fn(() =>
        singleQueryPage({
          path: "sources/gravity.md",
          effectiveFrontmatter: frontmatter,
          types: ["reader-source"],
          file: {},
        }),
      ),
      read,
      update,
    } as unknown as ReaderConnectClient);
  }

  it("writes against the caller's revision without re-reading the record", async () => {
    const update = vi.fn(() => Promise.resolve(success(record("rev-2", frontmatter))));
    const read = vi.fn();
    const repository = repositoryWith(update, read);

    await repository.updateReading(input);

    expect(read).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      path: "sources/gravity.md",
      ifRevision: "rev-1",
      patch: {
        reading: expect.objectContaining({
          status: "queued",
          custom_session: "keep-me",
          position: { pdf: { page_index: 3 } },
        }),
      },
      includeDocument: true,
    });
  });

  it("rebases on a fresh read when the caller's revision has moved on", async () => {
    const newer = { ...frontmatter, reading: { status: "finished" } };
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        problem: { code: "concurrent_modification", category: "conflict", recovery: "refresh" },
      })
      .mockResolvedValueOnce(success(record("rev-3", newer)));
    const read = vi.fn(() => Promise.resolve(success(record("rev-2", newer))));
    const repository = repositoryWith(update, read);

    await repository.updateReading(input);

    expect(read).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ifRevision: "rev-2",
        patch: { reading: expect.objectContaining({ status: "finished" }) },
      }),
    );
  });
});

function record(revision: string, frontmatter: Record<string, unknown>): RecordDocument {
  return {
    path: "sources/gravity.md",
    revision,
    types: ["reader-source"],
    frontmatter,
    effectiveFrontmatter: frontmatter,
    body: "Notes",
    file: {},
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

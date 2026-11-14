import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { testWrite, mockSdk, testRecord, testQuery } from "./records.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { QueryResult, RecordView } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): Value {
  return value;
}

describe("Connect source reading state", () => {
  it("rebases a reading update on the latest whole record and preserves extension fields", async () => {
    const frontmatter = {
      id: "src_01",
      title: "Crime and Punishment",
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
    const pages = vi.fn(() =>
      singleQueryPage(
        testRecord({
          path: current.path,
          effective: frontmatter,
          types: current.types,
        }),
      ),
    );
    const read = vi.fn(() => Promise.resolve(success(current)));
    const update = vi.fn(() => Promise.resolve(testWrite(success(updated))));
    const repository = new ConnectSourceRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages,
        get: read,
        update,
      }),
    );
    await repository.get(collectionId("reading"), sourceId("src_01"));

    await repository.updateReading({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      expectedRevision: "stale-caller-revision" as never,
      documentFileId: "file-01" as never,
      position: { kind: "pdf", pageIndex: 7 },
      openedAt: dateTime("2026-08-09T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sources/crime.md" }),
      expect.objectContaining({
        ifRevision: "rev-1",
        patch: {
          reading: expect.objectContaining({
            custom_session: "keep-me",
            position: { pdf: { page_index: 7 } },
          }),
        },
      }),
      expect.anything(),
    );
  });
});

describe("Connect source reading state with a current caller revision", () => {
  const frontmatter = {
    id: "src_01",
    title: "Crime and Punishment",
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
    return new ConnectSourceRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        pages: vi.fn(() =>
          singleQueryPage(
            testRecord({
              path: "sources/crime.md",
              effective: frontmatter,
              types: ["reader-source"],
            }),
          ),
        ),
        get: read,
        update,
      }),
    );
  }

  it("uses a native record witness and the caller's revision", async () => {
    const update = vi.fn(() => Promise.resolve(testWrite(success(record("rev-2", frontmatter)))));
    const read = vi.fn(() => Promise.resolve(record("rev-1", frontmatter)));
    const repository = repositoryWith(update, read);

    await repository.updateReading(input);

    expect(read).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sources/crime.md" }),
      expect.objectContaining({
        ifRevision: "rev-1",
        patch: {
          reading: expect.objectContaining({
            status: "queued",
            custom_session: "keep-me",
            position: { pdf: { page_index: 3 } },
          }),
        },
      }),
      expect.anything(),
    );
  });

  it("rebases on a fresh read when the caller's revision has moved on", async () => {
    const newer = { ...frontmatter, reading: { status: "finished" } };
    const update = vi
      .fn()
      .mockRejectedValueOnce(mdbaseError("conflict", "Moved on"))
      .mockResolvedValueOnce(testWrite(success(record("rev-3", newer))));
    const read = vi.fn(() => Promise.resolve(success(record("rev-2", newer))));
    const repository = repositoryWith(update, read);

    await repository.updateReading(input);

    expect(read).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "sources/crime.md" }),
      expect.objectContaining({
        ifRevision: "rev-2",
        patch: { reading: expect.objectContaining({ status: "finished" }) },
      }),
      expect.anything(),
    );
  });
});

function record(revision: string, frontmatter: Record<string, unknown>): RecordView {
  return testRecord({
    path: "sources/crime.md",
    revision,
    types: ["reader-source"],
    frontmatter,
    effective: frontmatter,
    body: "Notes",
  });
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

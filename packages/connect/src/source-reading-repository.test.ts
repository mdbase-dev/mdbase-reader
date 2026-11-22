import { Write, uuidv7 } from "@mdbase-dev/sdk";
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
      document: {
        fileId: "file-01" as never,
        file: "[[files/crime.pdf]]",
        revision: "sha256:aa" as never,
      },
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
            document_file: "[[files/crime.pdf]]",
            document_file_id: "file-01",
            position: { pdf: { page_index: 7 } },
          }),
        },
      }),
    );
  });
});

describe("Connect reading position writes", () => {
  const frontmatter = {
    id: "src_01",
    title: "Crime and Punishment",
    reading: { status: "queued", custom_session: "keep-me" },
  };
  const input = {
    collectionId: collectionId("reading"),
    sourceId: sourceId("src_01"),
    document: {
      fileId: "file-01" as never,
      file: "[[files/crime.pdf]]",
      revision: "sha256:aa" as never,
    },
    position: { kind: "pdf", pageIndex: 3 } as const,
    openedAt: dateTime("2026-08-09T00:00:00.000Z"),
  };

  function repositoryWith(
    update: ReturnType<typeof vi.fn>,
    read = vi.fn(),
    acknowledge = vi.fn(),
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
        ledger: { acknowledge },
      }),
    );
  }

  it("uses the same fresh record for its fields and revision on the first write", async () => {
    const update = vi.fn(() => Promise.resolve(testWrite(success(record("rev-2", frontmatter)))));
    const read = vi.fn(() => Promise.resolve(record("rev-2", frontmatter)));
    const repository = repositoryWith(update, read);

    const stale = { ...input, expectedRevision: "rev-1", expectedFrontmatter: {} };
    await repository.updateReading(stale);

    expect(read).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sources/crime.md" }),
      expect.objectContaining({
        ifRevision: "rev-2",
        patch: {
          reading: expect.objectContaining({
            status: "queued",
            custom_session: "keep-me",
            position: { pdf: { page_index: 3 } },
          }),
        },
      }),
    );
  });

  const refusal = (mutation: string): Write =>
    new Write({
      mutation,
      state: "rejected",
      problem: { code: "conflict", recovery: "refresh", reason: "revision", message: "Moved on" },
    });

  it.each(["confirmed", "pending"] as const)(
    "acknowledges only the superseded refusal when the retry is %s",
    async (state) => {
      const newer = { ...frontmatter, reading: { status: "finished" } };
      const refused = uuidv7();
      const update = vi
        .fn()
        .mockResolvedValueOnce(refusal(refused))
        .mockResolvedValueOnce(
          new Write({ mutation: uuidv7(), state, records: [record("rev-3", newer)] }),
        );
      const read = vi
        .fn()
        .mockResolvedValueOnce(record("rev-1", frontmatter))
        .mockResolvedValueOnce(record("rev-2", newer));
      const acknowledge = vi.fn();
      await repositoryWith(update, read, acknowledge).updateReading(input);

      expect(read).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenLastCalledWith(
        expect.objectContaining({ revision: "rev-2" }),
        expect.objectContaining({
          ifRevision: "rev-2",
          patch: { reading: expect.objectContaining({ status: "finished" }) },
        }),
      );
      expect(acknowledge.mock.calls).toEqual([[refused]]);
    },
  );

  it("leaves refusals available for review if the retry is also rejected", async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(refusal(uuidv7()))
      .mockResolvedValueOnce(refusal(uuidv7()));
    const read = vi.fn().mockResolvedValue(record("rev-2", frontmatter));
    const acknowledge = vi.fn();
    await expect(
      repositoryWith(update, read, acknowledge).updateReading(input),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(update).toHaveBeenCalledTimes(2);
    expect(acknowledge).not.toHaveBeenCalled();
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

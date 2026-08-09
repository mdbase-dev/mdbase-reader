import { collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryResult, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("Connect source reading state", () => {
  it("preserves extension fields and patches only reading through whole-record access", async () => {
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
    const query = vi.fn(() =>
      Promise.resolve(
        success<QueryResult>({
          results: [
            {
              path: current.path,
              effectiveFrontmatter: frontmatter,
              types: current.types,
              file: {},
            },
          ],
        }),
      ),
    );
    const read = vi.fn(() => Promise.resolve(success(current)));
    const update = vi.fn(() => Promise.resolve(success(updated)));
    const repository = new ConnectSourceRepository({
      query,
      read,
      update,
    } as unknown as ReaderConnectClient);
    await repository.get(collectionId("reading"), sourceId("src_01"));

    await repository.updateReading({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      expectedRevision: "rev-1" as never,
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

import {
  collectionId,
  dateTime,
  importSourceFile,
  mutationId,
  sourceId,
} from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { mockSdk, testWrite, testQuery } from "./records.fixtures.js";
import {
  digest,
  fileDescriptor,
  queryRecord,
  recordDocument,
  success,
} from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { QueryResult } from "@mdbase-dev/sdk";

it("rejects a later-page authority match before any commit effects", async () => {
  const pages = vi.fn(() => duplicatePages());
  const upload = vi.fn(() => Promise.resolve(fileDescriptor()));
  const create = vi.fn(() => Promise.resolve(testWrite(success(recordDocument()))));
  const repository = new ConnectSourceImportRepository(mockSdk({ pages, create }), { upload });
  const commitFile = vi.spyOn(repository, "commitFile");

  await expect(
    importSourceFile(
      {
        clock: { now: () => dateTime("2026-08-10T12:00:00.000Z") },
        hasher: { sha256: () => Promise.resolve(digest) },
        ids: {
          source: () => sourceId("src_import"),
          annotation: () => {
            throw new Error("unused");
          },
          mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
        },
        imports: repository,
      },
      {
        collectionId: collectionId("reading"),
        name: "manuscript.pdf",
        bytes: new TextEncoder().encode("%PDF-1.7\nreader fixture"),
      },
    ),
  ).rejects.toThrow("already stored in");

  expect(pages).toHaveBeenCalledOnce();
  expect(commitFile).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

async function* duplicatePages(): AsyncGenerator<QueryResult> {
  yield await Promise.resolve(
    success<QueryResult>(
      testQuery({
        records: [queryRecord("src_other", `sha256:${"b".repeat(64)}`)],
        totalCount: 2,
        hasMore: true,
        cursor: "next",

        complete: true,
      }),
    ),
  );
  yield await Promise.resolve(
    success<QueryResult>(
      testQuery({
        records: [queryRecord("src_import", digest)],
        totalCount: 2,
        hasMore: false,

        complete: true,
      }),
    ),
  );
}

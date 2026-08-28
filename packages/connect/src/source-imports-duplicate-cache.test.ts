import {
  collectionId,
  dateTime,
  importSourceFile,
  mutationId,
  sourceId,
} from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import {
  digest,
  fileDescriptor,
  queryRecord,
  recordDocument,
  success,
} from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage } from "@mdbase-dev/connect";

it("rejects a later-page authority match before any commit effects", async () => {
  const queryPages = vi.fn(() => duplicatePages());
  const upload = vi.fn(() => Promise.resolve(fileDescriptor()));
  const create = vi.fn(() => Promise.resolve(success(recordDocument())));
  const repository = new ConnectSourceImportRepository(
    { queryPages, create } as unknown as ReaderConnectClient,
    { upload },
  );
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

  expect(queryPages).toHaveBeenCalledOnce();
  expect(commitFile).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

async function* duplicatePages(): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success<QueryPage>({
      results: [queryRecord("src_other", `sha256:${"b".repeat(64)}`)],
      meta: { totalCount: 2, hasMore: true, cursor: "next" },
      page: 0,
      offset: 0,
      loaded: 1,
      complete: false,
      cursor: "next",
    }),
  );
  yield await Promise.resolve(
    success<QueryPage>({
      results: [queryRecord("src_import", digest)],
      meta: { totalCount: 2, hasMore: false },
      page: 1,
      offset: 1,
      loaded: 2,
      complete: true,
    }),
  );
}

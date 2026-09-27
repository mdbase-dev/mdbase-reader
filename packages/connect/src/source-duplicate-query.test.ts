import { collectionId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { digest, queryRecord, success } from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";

it("uses all representation digests, forwards cancellation and rejects nonmatching candidates", async () => {
  const other = `sha256:${"b".repeat(64)}` as const;
  const queryPages = vi.fn(async function* () {
    yield await Promise.resolve(
      success({ results: [queryRecord("unrelated", `sha256:${"c".repeat(64)}`)] }),
    );
  });
  const repo = new ConnectSourceImportRepository({ queryPages } as unknown as ReaderConnectClient, {
    upload: vi.fn(),
  });
  const signal = new AbortController().signal;
  expect(
    await repo.findExactDuplicate(collectionId("reading"), [digest, other], { signal }),
  ).toBeNull();
  expect(queryPages).toHaveBeenCalledWith(
    {
      types: ["reader-source"],
      frontmatterMode: "effective",
      where: `documents != null && documents.exists(document, document.revision == ${JSON.stringify(digest)} || document.revision == ${JSON.stringify(other)})`,
    },
    { firstPageSize: 50, pageSize: 50, signal },
  );
  queryPages.mockClear();
  expect(await repo.findExactDuplicate(collectionId("reading"), [])).toBeNull();
  expect(queryPages).not.toHaveBeenCalled();
});

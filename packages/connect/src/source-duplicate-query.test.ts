import { collectionId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { mockSdk, testQuery } from "./records.fixtures.js";
import { digest, queryRecord, success } from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

it("uses all representation digests, forwards cancellation and rejects nonmatching candidates", async () => {
  const other = `sha256:${"b".repeat(64)}` as const;
  const pages = vi.fn(async function* () {
    yield await Promise.resolve(
      success(testQuery({ records: [queryRecord("unrelated", `sha256:${"c".repeat(64)}`)] })),
    );
  });
  const repo = new ConnectSourceImportRepository(mockSdk({ pages }), {
    upload: vi.fn(),
  });
  const signal = new AbortController().signal;
  expect(
    await repo.findExactDuplicate(collectionId("reading"), [digest, other], { signal }),
  ).toBeNull();
  expect(pages).toHaveBeenCalledWith(
    expect.objectContaining({
      types: ["reader-source"],

      where: `documents != null && documents.exists(document, document.revision == ${JSON.stringify(digest)} || document.revision == ${JSON.stringify(other)})`,
    }),
    expect.objectContaining({ signal }),
  );
  pages.mockClear();
  expect(await repo.findExactDuplicate(collectionId("reading"), [])).toBeNull();
  expect(pages).not.toHaveBeenCalled();
});

import { describe, expect, it, vi } from "vitest";

import { collectionId, mutationId, recordRevision, sourceId } from "../domain/identity.js";
import { dateTime } from "../domain/time.js";

import { importSourceFile } from "./import-source-file.js";

import type { ImportSourceFileDependencies } from "./import-source-file.js";
import type { Source } from "../domain/source.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const request = {
  collectionId: collectionId("reading"),
  name: "manuscript.pdf",
  bytes: new TextEncoder().encode("%PDF-1.7\nreader fixture"),
};

const importedSource = {
  collectionId: collectionId("reading"),
  id: sourceId("src_import"),
  path: "sources/src_import.md",
  title: "Imported source",
  creators: [],
  tags: [],
  documents: [],
  body: "# Imported source\n",
  recordRevision: recordRevision("record-1"),
  frontmatter: {},
} as Source;

describe("importSourceFile authoritative duplicate checks", () => {
  it("makes zero commits when authority finds a duplicate", async () => {
    const duplicate = { ...importedSource, title: "Authoritative duplicate" };
    const findExactDuplicate = vi.fn(() => Promise.resolve(duplicate));
    const commitFile = vi.fn(() => Promise.resolve(importedSource));

    await expect(
      importSourceFile(dependencies(findExactDuplicate, commitFile), request),
    ).rejects.toThrow("Authoritative duplicate");

    expect(findExactDuplicate).toHaveBeenCalledWith(collectionId("reading"), [digest], {});
    expect(commitFile).not.toHaveBeenCalled();
  });

  it("commits exactly once when authority reports no duplicate", async () => {
    const findExactDuplicate = vi.fn(() => Promise.resolve(null));
    const commitFile = vi.fn(() => Promise.resolve(importedSource));

    await expect(
      importSourceFile(dependencies(findExactDuplicate, commitFile), request),
    ).resolves.toBe(importedSource);

    expect(findExactDuplicate).toHaveBeenCalledOnce();
    expect(commitFile).toHaveBeenCalledOnce();
  });
});

function dependencies(
  findExactDuplicate: ImportSourceFileDependencies["imports"]["findExactDuplicate"],
  commitFile: ImportSourceFileDependencies["imports"]["commitFile"],
): ImportSourceFileDependencies {
  return {
    clock: { now: () => dateTime("2026-08-10T12:00:00.000Z") },
    hasher: { sha256: () => Promise.resolve(digest) },
    ids: {
      source: () => sourceId("src_import"),
      annotation: () => {
        throw new Error("unused");
      },
      mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
    },
    imports: { findExactDuplicate, commitFile },
  };
}

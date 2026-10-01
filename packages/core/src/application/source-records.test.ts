import { describe, expect, it, vi } from "vitest";

import { collectionId, fileId, mutationId, recordRevision, sourceId } from "../domain/identity.js";
import { fileRevision } from "../domain/revision.js";
import { dateTime } from "../domain/time.js";

import { sourceKindForCitation } from "./source-fields-from-citation.js";
import { attachSourceFile, createSourceRecord } from "./source-records.js";

import type { ImportSourceFileDependencies } from "./import-source-file.js";
import type {
  PlannedSourceAttachment,
  PlannedSourceFileImport,
  SourceImportRepository,
} from "./ports.js";
import type { Source } from "../domain/source.js";

const pdf = new TextEncoder().encode("%PDF-1.7\nreader fixture");
const digest = `sha256:${"b".repeat(64)}` as const;

function dependencies(imports: SourceImportRepository): ImportSourceFileDependencies {
  return {
    clock: { now: () => dateTime("2026-09-25T00:00:00.000Z") },
    hasher: { sha256: vi.fn(() => Promise.resolve(digest)) },
    ids: {
      source: () => sourceId("src_new"),
      annotation: () => {
        throw new Error("unused");
      },
      mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
    },
    imports,
  };
}

describe("createSourceRecord", () => {
  it("plans a source with no documents, a kind and a web address", async () => {
    let committed: PlannedSourceFileImport | undefined;
    const commitFile = vi.fn((plan: PlannedSourceFileImport) => {
      committed = plan;
      return Promise.resolve(source());
    });
    await createSourceRecord(dependencies({ findExactDuplicate: vi.fn(), commitFile }), {
      collectionId: collectionId("reading"),
      title: "  Crime   and punishment ",
      kind: "book",
      url: "https://doi.org/10.4324/9780203168455",
      metadata: { authors: ["Fyodor Dostoevsky"], published: "2002" },
    });
    expect(committed).toEqual({
      collectionId: "reading",
      sourceId: "src_new",
      title: "Crime and punishment",
      kind: "book",
      savedAt: "2026-09-25T00:00:00.000Z",
      recordPath: "sources/crime-and-punishment.md",
      fallbackRecordPath: "sources/crime-and-punishment-new.md",
      representations: [],
      metadata: { authors: ["Fyodor Dostoevsky"], published: "2002" },
      url: "https://doi.org/10.4324/9780203168455",
    });
  });

  it("refuses addresses that are not public web links", async () => {
    await expect(
      createSourceRecord(dependencies({ findExactDuplicate: vi.fn(), commitFile: vi.fn() }), {
        collectionId: collectionId("reading"),
        title: "Local",
        url: "file:///etc/passwd",
      }),
    ).rejects.toThrow("public web address");
  });
});

describe("attachSourceFile", () => {
  it("attaches the first file as the primary document with its origin", async () => {
    let attached: PlannedSourceAttachment | undefined;
    const attachFile = vi.fn((plan: PlannedSourceAttachment) => {
      attached = plan;
      return Promise.resolve(source());
    });
    await attachSourceFile(
      dependencies({
        findExactDuplicate: vi.fn(() => Promise.resolve(null)),
        commitFile: vi.fn(),
        attachFile,
      }),
      {
        source: source(),
        name: "dostoevsky.pdf",
        bytes: pdf,
        originUrl: "https://example.org/dostoevsky.pdf",
      },
    );
    expect(attached).toMatchObject({
      sourceId: "src_existing",
      recordPath: "sources/src_existing.md",
      originUrl: "https://example.org/dostoevsky.pdf",
      retrievedAt: "2026-09-25T00:00:00.000Z",
      representation: {
        role: "primary",
        format: "pdf",
        filePath: "files/reader/src_existing/dostoevsky.pdf",
        contentDigest: digest,
      },
    });
  });

  it("adds later files as alternatives and refuses bytes stored anywhere already", async () => {
    const withDocument = source([
      {
        fileId: fileId("file-1"),
        file: "[[files/reader/src_existing/dostoevsky.epub]]",
        role: "primary",
        mediaType: "application/epub+zip",
        revision: fileRevision(`sha256:${"c".repeat(64)}`),
      },
    ]);
    const attachFile = vi.fn((_plan: PlannedSourceAttachment) => Promise.resolve(withDocument));
    await attachSourceFile(
      dependencies({
        findExactDuplicate: vi.fn(() => Promise.resolve(null)),
        commitFile: vi.fn(),
        attachFile,
      }),
      { source: withDocument, name: "dostoevsky.pdf", bytes: pdf },
    );
    expect(attachFile.mock.calls[0]?.[0]).toMatchObject({
      representation: { role: "alternative" },
    });

    await expect(
      attachSourceFile(
        dependencies({
          findExactDuplicate: vi.fn(() => Promise.resolve(source())),
          commitFile: vi.fn(),
          attachFile,
        }),
        { source: withDocument, name: "dostoevsky.pdf", bytes: pdf },
      ),
    ).rejects.toThrow("already stored");
    expect(attachFile).toHaveBeenCalledTimes(1);
  });

  it("explains when the collection cannot attach files", async () => {
    await expect(
      attachSourceFile(dependencies({ findExactDuplicate: vi.fn(), commitFile: vi.fn() }), {
        source: source(),
        name: "dostoevsky.pdf",
        bytes: pdf,
      }),
    ).rejects.toThrow("cannot attach files");
  });
});

describe("sourceKindForCitation", () => {
  it("maps CSL types to Reader kinds", () => {
    expect(sourceKindForCitation({ type: "article-journal" })).toBe("paper");
    expect(sourceKindForCitation({ type: "book" })).toBe("book");
    expect(sourceKindForCitation({ type: "legal_case" })).toBeUndefined();
  });
});

function source(documents: Source["documents"] = []): Source {
  return {
    collectionId: collectionId("reading"),
    id: sourceId("src_existing"),
    path: "sources/src_existing.md",
    title: "Crime and punishment",
    creators: [],
    tags: [],
    documents,
    body: "",
    recordRevision: recordRevision("record-1"),
    frontmatter: {},
  };
}

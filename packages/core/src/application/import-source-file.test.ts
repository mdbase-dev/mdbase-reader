import { describe, expect, it, vi } from "vitest";

import { collectionId, mutationId, recordRevision, sourceId } from "../domain/identity.js";
import { dateTime } from "../domain/time.js";

import { detectDocumentFormat, importSourceFile } from "./import-source-file.js";

import type { PlannedSourceFileImport } from "./ports.js";
import type { Source } from "../domain/source.js";

const bytes = new TextEncoder().encode("%PDF-1.7\nreader fixture");

describe("importSourceFile", () => {
  it("plans a collision-safe exact-byte PDF import before committing it", async () => {
    let committed: PlannedSourceFileImport | undefined;
    const imported = sourceFixture();
    const commitFile = vi.fn((plan: PlannedSourceFileImport) => {
      committed = plan;
      return Promise.resolve(imported);
    });

    const result = await importSourceFile(
      {
        clock: { now: () => dateTime("2026-08-10T12:00:00.000Z") },
        hasher: {
          sha256: vi.fn(() => Promise.resolve(`sha256:${"a".repeat(64)}` as const)),
        },
        ids: {
          source: () => sourceId("src_import"),
          annotation: () => {
            throw new Error("unused");
          },
          mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
        },
        imports: { commitFile },
      },
      {
        collectionId: collectionId("reading"),
        name: "../A difficult / manuscript final.PDF",
        declaredMediaType: "application/octet-stream",
        bytes,
      },
    );

    expect(result).toBe(imported);
    expect(committed).toMatchObject({
      sourceId: "src_import",
      title: "manuscript final",
      format: "pdf",
      mediaType: "application/pdf",
      recordPath: "sources/src_import.md",
      filePath: "files/reader/src_import/manuscript-final.pdf",
      contentDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(committed?.bytes).toBe(bytes);
  });

  it("rejects empty and disguised unsupported files before mutation", async () => {
    const commitFile = vi.fn();
    const dependencies = {
      clock: { now: () => dateTime("2026-08-10T12:00:00.000Z") },
      hasher: { sha256: () => Promise.resolve(`sha256:${"a".repeat(64)}` as const) },
      ids: {
        source: () => sourceId("src_import"),
        annotation: () => {
          throw new Error("unused");
        },
        mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
      },
      imports: { commitFile },
    };

    await expect(
      importSourceFile(dependencies, {
        collectionId: collectionId("reading"),
        name: "empty.pdf",
        bytes: new Uint8Array(),
      }),
    ).rejects.toThrow("empty");
    await expect(
      importSourceFile(dependencies, {
        collectionId: collectionId("reading"),
        name: "disguised.pdf",
        bytes: new TextEncoder().encode("not a PDF"),
      }),
    ).rejects.toThrow("not a recognizable PDF, EPUB, or HTML");
    expect(commitFile).not.toHaveBeenCalled();
  });

  it("plans sanitized HTML captures with validated provenance", async () => {
    const commitFile = vi.fn(() => Promise.resolve(sourceFixture()));
    await importSourceFile(
      {
        clock: { now: () => dateTime("2026-08-10T12:00:00.000Z") },
        hasher: { sha256: () => Promise.resolve(`sha256:${"a".repeat(64)}` as const) },
        ids: {
          source: () => sourceId("src_import"),
          annotation: () => {
            throw new Error("unused");
          },
          mutation: () => mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
        },
        imports: { commitFile },
      },
      {
        collectionId: collectionId("reading"),
        name: "example-com.html",
        declaredMediaType: "text/html",
        bytes: new TextEncoder().encode("<!doctype html><title>Example</title>"),
        title: "Example",
        capture: {
          submittedUrl: "https://example.com/story#part",
          canonicalUrl: "https://www.example.com/story",
          retrievedAt: dateTime("2026-08-10T11:59:00.000Z"),
        },
      },
    );

    expect(commitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "webpage",
        format: "html",
        capture: {
          submittedUrl: "https://example.com/story",
          canonicalUrl: "https://www.example.com/story",
          retrievedAt: "2026-08-10T11:59:00.000Z",
        },
      }),
    );
  });
});

describe("detectDocumentFormat", () => {
  it("uses signatures rather than trusting filename or declared MIME type", () => {
    const html = new TextEncoder().encode("<!doctype html><title>Example</title>");
    const epub = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);

    expect(detectDocumentFormat("wrong.txt", "text/plain", bytes)).toBe("pdf");
    expect(detectDocumentFormat("page.bin", "application/octet-stream", html)).toBe("html");
    expect(detectDocumentFormat("book.epub", "", epub)).toBe("epub");
    expect(() => detectDocumentFormat("archive.zip", "application/zip", epub)).toThrow(
      "not a recognizable PDF, EPUB, or HTML",
    );
  });
});

function sourceFixture(): Source {
  return {
    collectionId: collectionId("reading"),
    id: sourceId("src_import"),
    path: "sources/src_import.md",
    title: "manuscript final",
    creators: [],
    tags: [],
    documents: [],
    body: "# manuscript final\n",
    recordRevision: recordRevision("record-1"),
    frontmatter: {},
  };
}

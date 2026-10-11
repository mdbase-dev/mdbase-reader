import { dateTime } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { fileDescriptor, plan, recordDocument, success } from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { PlannedSourceFileImport } from "@mdbase-reader/core";

describe("ConnectSourceImportRepository web capture provenance", () => {
  it("persists post identity and thread shape, leaving text and media to the body", async () => {
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      {
        upload: vi.fn((path: string) =>
          Promise.resolve(fileDescriptor({ path, mediaType: "text/html" })),
        ),
      },
    );
    const part = {
      platform: "x" as const,
      id: "100",
      url: "https://x.com/i/status/100",
      author: { id: "fixture", handle: "fixture", name: "Fixture Author" },
      text: "Durable post",
      media: [
        { kind: "image" as const, url: "https://media.example/image.png", alt: "A blue square" },
      ],
    };
    const post = { ...part, threadRoot: part.id, parts: [part], threadPartial: true };
    const base = webCapturePlan();
    await repository.commitFile({
      ...base,
      kind: "post",
      metadata: { socialPost: post },
      capture: { ...base.capture!, submittedUrl: part.url, canonicalUrl: part.url },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          kind: "post",
          url: part.url,
          social_post: {
            platform: "x",
            id: "100",
            url: part.url,
            author: part.author,
            threadRoot: "100",
            threadPartial: true,
            parts: [{ id: "100", url: part.url }],
          },
        }),
      }),
    );
  });

  it.each([undefined, "defuddle@0.19.5", "mozilla-readability@0.6.0"])(
    "preserves raw and readable web representations with extractor %s",
    async (extractor) => {
      const create = vi.fn(() => Promise.resolve(success(recordDocument())));
      const upload = vi.fn((path: string) =>
        Promise.resolve(
          fileDescriptor({
            fileId: path.includes("archive") ? "file-archive" : "file-readable",
            path,
            mediaType: "text/html",
          }),
        ),
      );
      const repository = new ConnectSourceImportRepository(
        { create } as unknown as ReaderConnectClient,
        { upload },
      );

      await repository.commitFile(webCapturePlan(extractor));

      expect(upload.mock.calls.map(([path]) => path)).toEqual([
        "files/reader/src_import/example.archive.html",
        "files/reader/src_import/example.readable.html",
      ]);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          frontmatter: expect.objectContaining({
            kind: "webpage",
            url: "https://example.com/canonical",
            original_url: "https://example.com/submitted",
            authors: ["Jane Example"],
            published: "2026-08-01",
            description: "A captured essay.",
            language: "en",
            site: "Example Review",
            capture: {
              submitted_url: "https://example.com/submitted",
              canonical_url: "https://example.com/canonical",
              captured_at: "2026-08-10T11:59:00.000Z",
              method: "url",
              application: "dev.mdbase.reader",
              ...(extractor ? { extractor } : {}),
            },
            documents: [
              expect.objectContaining({
                role: "primary",
                file_id: "file-readable",
                derived_from_file_id: "file-archive",
              }),
              expect.objectContaining({
                role: "archive",
                file_id: "file-archive",
                origin_url: "https://example.com/canonical",
                retrieved_at: "2026-08-10T11:59:00.000Z",
              }),
            ],
          }),
        }),
      );
    },
  );
});

function webCapturePlan(extractor?: string): PlannedSourceFileImport {
  const base = plan();
  const representation = base.representations[0]!;
  return {
    ...base,
    kind: "webpage" as const,
    metadata: {
      authors: ["Jane Example"],
      published: "2026-08-01",
      description: "A captured essay.",
      language: "en",
      site: "Example Review",
    },
    capture: {
      submittedUrl: "https://example.com/submitted",
      canonicalUrl: "https://example.com/canonical",
      retrievedAt: dateTime("2026-08-10T11:59:00.000Z"),
      ...(extractor ? { extractor } : {}),
    },
    representations: [
      {
        ...representation,
        role: "primary" as const,
        format: "html" as const,
        mediaType: "text/html",
        originalName: "example.readable.html",
        filePath: "files/reader/src_import/example.readable.html",
        derivedFromRole: "archive" as const,
      },
      {
        ...representation,
        role: "archive" as const,
        format: "html" as const,
        mediaType: "text/html",
        originalName: "example.archive.html",
        filePath: "files/reader/src_import/example.archive.html",
      },
    ],
  };
}

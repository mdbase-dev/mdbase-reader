import { dateTime } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { fileDescriptor, plan, recordDocument, success } from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { PlannedSourceFileImport } from "@mdbase-reader/core";

describe("ConnectSourceImportRepository web capture provenance", () => {
  it("preserves raw and readable web representations with capture metadata", async () => {
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

    await repository.commitFile(webCapturePlan());

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
  });
});

function webCapturePlan(): PlannedSourceFileImport {
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

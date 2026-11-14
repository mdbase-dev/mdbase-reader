import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { mockSdk, testWrite, testQuery } from "./records.fixtures.js";
import {
  digest,
  fileDescriptor,
  plan,
  queryRecord,
  recordDocument,
  success,
} from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { QueryResult } from "@mdbase-dev/sdk";

describe("ConnectSourceImportRepository", () => {
  it("filters duplicates at the authority and verifies exact digests without reading bodies", async () => {
    const pages = vi.fn(() => duplicatePages());
    const repository = new ConnectSourceImportRepository(mockSdk({ pages }), { upload: vi.fn() });

    const duplicate = await repository.findExactDuplicate(collectionId("reading"), [digest]);

    expect(duplicate?.id).toBe("src_import");
    expect(pages).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ["reader-source"],
        where: `documents != null && documents.exists(document, document.revision == ${JSON.stringify(digest)})`,
      }),
      expect.objectContaining({}),
    );
  });

  it("uploads exact bytes before creating a whole source record", async () => {
    const upload = vi.fn((_path: string, _source: Blob) => Promise.resolve(fileDescriptor()));
    const create = vi.fn(() => Promise.resolve(testWrite(success(recordDocument()))));
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), { upload });

    const source = await repository.commitFile(plan());

    expect(upload).toHaveBeenCalledWith(
      "files/reader/src_import/manuscript.pdf",
      expect.any(Blob),
      {
        transferId: "83dd2f80-c7da-44d7-9844-6ea755a05f40",
      },
    );
    const uploadedBlob = upload.mock.calls[0]?.[1];
    expect(uploadedBlob).toBeInstanceOf(Blob);
    expect(uploadedBlob?.type).toBe("application/pdf");
    if (!uploadedBlob) {
      throw new Error("The import did not upload a Blob.");
    }
    expect(new Uint8Array(await uploadedBlob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "sources/src_import.md",
        type: "reader-source",
        frontmatter: {
          id: "src_import",
          title: "Manuscript",
          kind: "document",
          saved_at: "2026-08-10T12:00:00.000Z",
          documents: [
            {
              file_id: "file-import",
              file: "[[files/reader/src_import/manuscript.pdf]]",
              role: "primary",
              format: "pdf",
              media_type: "application/pdf",
              revision: digest,
              label: "manuscript.pdf",
            },
          ],
          reading: { status: "inbox" },
        },
        body: "# Manuscript\n",
      }),
      expect.anything(),
    );
    expect(source.documents[0]).toMatchObject({
      fileId: "file-import",
      revision: digest,
      mediaType: "application/pdf",
    });
  });
});

describe("ConnectSourceImportRepository capture and recovery", () => {
  it("stores an authored capture note and tags in the source creation, not a later overwrite", async () => {
    const create = vi.fn(() => Promise.resolve(testWrite(success(recordDocument()))));
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), {
      upload: vi.fn(() => Promise.resolve(fileDescriptor())),
    });
    await repository.commitFile({ ...plan(), body: "An **authored** note.\n", tags: ["research"] });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "An **authored** note.\n",
        frontmatter: expect.objectContaining({ tags: ["research"] }),
      }),
      expect.anything(),
    );
  });

  it("retains an ambiguous create identity without submitting another mutation", async () => {
    const mutationId = "01977777-7777-7777-8777-777777777777";
    const create = vi.fn(() => Promise.resolve(testWrite(recordDocument())));
    const settle = vi.fn().mockResolvedValue({
      outcome: "unknown",
      mutationId,
      problem: {
        code: "outcome_unknown",
        recovery: "resolve_outcome",
        message: "Outcome unknown",
      },
    });
    const repository = new ConnectSourceImportRepository(mockSdk({ create, settle }), {
      upload: vi.fn(() => Promise.resolve(fileDescriptor())),
    });
    await expect(repository.commitFile(plan())).rejects.toMatchObject({
      code: "outcome_unknown",
      mutationId,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("leaves an ambiguous upload to SDK recovery without submitting a source", async () => {
    const uncertain = mdbaseError("outcome_unknown", "Outcome unknown");
    const upload = vi.fn().mockRejectedValue(uncertain);
    const create = vi.fn();
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), { upload });
    await expect(repository.commitFile(plan())).rejects.toBe(uncertain);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]?.[2]?.transferId).toBe("83dd2f80-c7da-44d7-9844-6ea755a05f40");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a descriptor whose digest differs from the planned bytes", async () => {
    const repository = new ConnectSourceImportRepository(mockSdk({ create: vi.fn() }), {
      upload: vi.fn(() =>
        Promise.resolve({
          ...fileDescriptor(),
          digest: `sha256:${"b".repeat(64)}` as const,
        }),
      ),
    });

    await expect(repository.commitFile(plan())).rejects.toThrow(
      "stored file did not match the selected bytes",
    );
  });
});

describe("ConnectSourceImportRepository recovery", () => {
  it("recovers a durably uploaded orphan before creating the source record", async () => {
    const recovered = fileDescriptor({ path: "files/reader/previous-attempt/manuscript.pdf" });
    const list = vi.fn(() => listFile(recovered));
    const upload = vi.fn();
    const create = vi.fn(() => Promise.resolve(testWrite(success(recordDocument()))));
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), { list, upload });

    await repository.commitFile(plan(), { recoverExistingFiles: true });

    expect(list).toHaveBeenCalledWith({
      folder: "files/reader",

      contentDigests: [digest],
    });
    expect(upload).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          documents: [
            expect.objectContaining({
              file_id: recovered.id,
              file: `[[${recovered.path}]]`,
              revision: recovered.digest,
            }),
          ],
        }),
      }),
      expect.anything(),
    );
  });

  it("does not scan all Reader files on an ordinary first attempt", async () => {
    const list = vi.fn(() => listFile(fileDescriptor()));
    const upload = vi.fn(() => Promise.resolve(fileDescriptor()));
    const create = vi.fn(() => Promise.resolve(testWrite(success(recordDocument()))));
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), { list, upload });

    await repository.commitFile(plan());

    expect(list).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledOnce();
  });
});

async function* listFile(
  file: ReturnType<typeof fileDescriptor>,
): AsyncGenerator<ReturnType<typeof fileDescriptor>> {
  yield await Promise.resolve(file);
}

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

describe("ConnectSourceImportRepository record paths", () => {
  it("creates the source at its fallback path when another record holds the readable one", async () => {
    const failure = mdbaseError("conflict", "Path exists", "path_taken");
    const create = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(testWrite(success(recordDocument())));
    const other = recordDocument();
    const read = vi.fn(() =>
      Promise.resolve(
        success({
          ...other,
          effective: { ...other.effective, id: "src_other" },
        }),
      ),
    );
    const repository = new ConnectSourceImportRepository(mockSdk({ create, get: read }), {
      upload: vi.fn(() => Promise.resolve(fileDescriptor())),
    });

    const source = await repository.commitFile({
      ...plan(),
      recordPath: "sources/manuscript.md",
      recordPathCandidates: ["sources/manuscript.md", "sources/manuscript-import.md"],
    });

    expect(source.id).toBe("src_import");
    expect(create.mock.calls.map(([input]) => (input as { path: string }).path)).toEqual([
      "sources/manuscript.md",
      "sources/manuscript-import.md",
    ]);
  });
});

import { collectionId } from "@mdbase-reader/core";
import { MdbaseConnectError } from "@mdbase-dev/connect";
import { describe, expect, it, vi } from "vitest";

import {
  digest,
  fileDescriptor,
  plan,
  queryRecord,
  recordDocument,
  success,
} from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage } from "@mdbase-dev/connect";

describe("ConnectSourceImportRepository", () => {
  it("finds an exact duplicate from paged contract metadata without reading bodies", async () => {
    const queryPages = vi.fn(() => duplicatePages());
    const repository = new ConnectSourceImportRepository(
      { queryPages } as unknown as ReaderConnectClient,
      { upload: vi.fn() },
    );

    const duplicate = await repository.findExactDuplicate(collectionId("reading"), [digest]);

    expect(duplicate?.id).toBe("src_import");
    expect(queryPages).toHaveBeenCalledWith(
      {
        contract: { id: "dev.mdbase.reader.source", version: "1.0.0-beta.1" },
        frontmatterMode: "effective",
      },
      { firstPageSize: 500, pageSize: 1_000 },
    );
  });

  it("uploads exact bytes before creating a whole source record", async () => {
    const upload = vi.fn((_path: string, _source: Blob) => Promise.resolve(fileDescriptor()));
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      { upload },
    );

    const source = await repository.commitFile(plan());

    expect(upload).toHaveBeenCalledWith(
      "files/reader/src_import/manuscript.pdf",
      expect.any(Blob),
      {
        mediaType: "application/pdf",
        transferId: "83dd2f80-c7da-44d7-9844-6ea755a05f40",
      },
    );
    const uploadedBlob = upload.mock.calls[0]?.[1];
    expect(uploadedBlob).toBeInstanceOf(Blob);
    if (!uploadedBlob) {
      throw new Error("The import did not upload a Blob.");
    }
    expect(new Uint8Array(await uploadedBlob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(create).toHaveBeenCalledWith({
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
      includeDocument: true,
    });
    expect(source.documents[0]).toMatchObject({
      fileId: "file-import",
      revision: digest,
      mediaType: "application/pdf",
    });
  });

  it("recovers an ambiguous record create without issuing another mutation", async () => {
    const failure = {
      ok: false,
      problem: { code: "timeout", message: "Outcome unknown" },
      diagnostics: [],
    } as const;
    const create = vi.fn(() => Promise.resolve(failure));
    const read = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create, read } as unknown as ReaderConnectClient,
      { upload: vi.fn(() => Promise.resolve(fileDescriptor())) },
    );

    const source = await repository.commitFile(plan());

    expect(source.id).toBe("src_import");
    expect(create).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({
      path: "sources/src_import.md",
      contract: { id: "dev.mdbase.reader.source", version: "1.0.0-beta.1" },
      includeDocument: true,
    });
  });

  it("recovers an ambiguous file commit with the same transfer identity", async () => {
    const uncertain = new MdbaseConnectError({
      problem_version: 1,
      code: "operation_outcome_unknown",
      category: "conflict",
      recovery: "resolve_outcome",
      message: "Outcome unknown",
      operation_outcome: "unknown",
      details: { request_id: "01977777-7777-7777-8777-777777777777" },
    });
    const upload = vi.fn().mockRejectedValueOnce(uncertain).mockResolvedValueOnce(fileDescriptor());
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      { upload },
    );

    await repository.commitFile(plan());

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[2]?.transferId).toBe("83dd2f80-c7da-44d7-9844-6ea755a05f40");
    expect(upload.mock.calls[1]?.[2]?.transferId).toBe("83dd2f80-c7da-44d7-9844-6ea755a05f40");
  });

  it("refuses a descriptor whose digest differs from the planned bytes", async () => {
    const repository = new ConnectSourceImportRepository(
      { create: vi.fn() } as unknown as ReaderConnectClient,
      {
        upload: vi.fn(() =>
          Promise.resolve({
            ...fileDescriptor(),
            contentDigest: `sha256:${"b".repeat(64)}` as const,
          }),
        ),
      },
    );

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
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      { list, upload },
    );

    await repository.commitFile(plan(), { recoverExistingFiles: true });

    expect(list).toHaveBeenCalledWith({ folder: "files/reader", pageSize: 500 });
    expect(upload).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          documents: [
            expect.objectContaining({
              file_id: recovered.fileId,
              file: `[[${recovered.path}]]`,
              revision: recovered.contentDigest,
            }),
          ],
        }),
      }),
    );
  });

  it("does not scan all Reader files on an ordinary first attempt", async () => {
    const list = vi.fn(() => listFile(fileDescriptor()));
    const upload = vi.fn(() => Promise.resolve(fileDescriptor()));
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      { list, upload },
    );

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

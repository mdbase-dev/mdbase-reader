import { recordRevision, sourceId, type PlannedSourcePart } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSourcePart } from "./create-source-part.js";
import { sourceFromDocument } from "./mapping.js";
import { recordDocument, plan as importPlan } from "./source-imports.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";

function plan(): PlannedSourcePart {
  const parent = sourceFromDocument(importPlan().collectionId, recordDocument());
  const document = parent.documents[0];
  if (!document) {
    throw new Error("Fixture document missing.");
  }
  return {
    collectionId: parent.collectionId,
    sourceId: sourceId("chapter"),
    recordPath: "sources/parts/chapter.md",
    title: "Chapter",
    parent,
    document: { ...document, range: { kind: "pages", start: 2, end: 5 } },
    citation: { id: "chapter", type: "chapter", title: "Chapter" },
    provenance: {},
  };
}
afterEach(() => vi.restoreAllMocks());

describe("guarded reference-existing-file chapter create", () => {
  it("creates the relation, shared file range and chapter citation in one write without uploading", async () => {
    const proposed = plan();
    vi.spyOn(ConnectSourceRepository.prototype, "get").mockResolvedValue(proposed.parent);
    const create = vi
      .fn()
      .mockImplementation((input: Parameters<ReaderConnectClient["create"]>[0]) =>
        Promise.resolve({
          ok: true,
          value: {
            ...recordDocument(),
            path: input.path,
            frontmatter: input.frontmatter,
            effectiveFrontmatter: input.frontmatter,
          },
        }),
      );
    await createSourcePart({ create } as unknown as ReaderConnectClient, proposed);
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        path: proposed.recordPath,
        frontmatter: expect.objectContaining({
          id: proposed.sourceId,
          // The reader-source type requires every field the source contract does.
          title: proposed.title,
          kind: "document",
          saved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
          csl: proposed.citation,
          relations: [{ relation: "part-of", target: "[[sources/src_import|Manuscript]]" }],
          documents: [
            expect.objectContaining({
              file_id: proposed.document?.fileId,
              revision: proposed.document?.revision,
              range: proposed.document?.range,
            }),
          ],
        }),
      }),
      expect.anything(),
    );
  });
  it("rejects changed parents and incomplete ancestor chains before any create", async () => {
    const proposed = plan();
    const create = vi.fn();
    const get = vi
      .spyOn(ConnectSourceRepository.prototype, "get")
      .mockResolvedValue({ ...proposed.parent, recordRevision: recordRevision("changed") });
    await expect(
      createSourcePart({ create } as unknown as ReaderConnectClient, proposed),
    ).rejects.toThrow("book changed");
    const parent = { ...proposed.parent, partOf: sourceId("missing") };
    get.mockImplementation((_collection, id) => Promise.resolve(id === parent.id ? parent : null));
    await expect(
      createSourcePart({ create } as unknown as ReaderConnectClient, { ...proposed, parent }),
    ).rejects.toThrow("incomplete");
    expect(create).not.toHaveBeenCalled();
  });
  it("reconciles an unknown outcome at the exact reviewed path without generating another identity", async () => {
    const proposed = plan();
    vi.spyOn(ConnectSourceRepository.prototype, "get").mockResolvedValue(proposed.parent);
    let saved: unknown;
    const create = vi.fn((input: Parameters<ReaderConnectClient["create"]>[0]) => {
      // An earlier attempt landed with its own save time.
      const frontmatter = { ...input.frontmatter, saved_at: "2026-01-01T00:00:00.000Z" };
      saved = { ...recordDocument(), frontmatter, effectiveFrontmatter: frontmatter };
      return Promise.resolve({
        ok: false,
        problem: { code: "unknown", message: "Outcome unknown" },
      });
    });
    const read = vi.fn(() => Promise.resolve({ ok: true, value: saved }));
    const recovered = await createSourcePart(
      { create, read } as unknown as ReaderConnectClient,
      proposed,
    );
    expect(recovered.id).toBe(proposed.sourceId);
    expect(create).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ path: proposed.recordPath }));
  });
});

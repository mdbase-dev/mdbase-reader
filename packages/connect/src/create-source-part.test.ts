import { mdbaseError } from "@mdbase-dev/sdk";
import { recordRevision, sourceId, type PlannedSourcePart } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSourcePart } from "./create-source-part.js";
import { sourceFromDocument } from "./mapping.js";
import { testWrite, mockSdk, testRecord } from "./records.fixtures.js";
import { recordDocument, plan as importPlan } from "./source-imports.fixtures.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { JsonObject, MdbaseClient } from "@mdbase-dev/sdk";

function plan(): PlannedSourcePart {
  const parent = sourceFromDocument(importPlan().collectionId, recordDocument());
  const document = parent.documents[0];
  if (!document) {
    throw new Error("Fixture document missing.");
  }
  return {
    collectionId: parent.collectionId,
    sourceId: sourceId("chapter"),
    recordPath: "sources/chapter.md",
    recordPathCandidates: ["sources/chapter.md", "sources/chapter-smith-2019.md"],
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
    const create = vi.fn().mockImplementation((input: Parameters<MdbaseClient["create"]>[0]) =>
      Promise.resolve(
        testWrite(
          testRecord({
            ...recordDocument(),
            path: input.path!,
            frontmatter: input.frontmatter as Record<string, unknown>,
            effective: input.frontmatter as Record<string, unknown>,
          }),
        ),
      ),
    );
    await createSourcePart(mockSdk({ create }), proposed);
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
    await expect(createSourcePart(mockSdk({ create }), proposed)).rejects.toThrow("book changed");
    const parent = { ...proposed.parent, partOf: sourceId("missing") };
    get.mockImplementation((_collection, id) => Promise.resolve(id === parent.id ? parent : null));
    await expect(createSourcePart(mockSdk({ create }), { ...proposed, parent })).rejects.toThrow(
      "incomplete",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("retains an unknown native mutation without submitting a second chapter", async () => {
    const proposed = plan();
    vi.spyOn(ConnectSourceRepository.prototype, "get").mockResolvedValue(proposed.parent);
    const create = vi.fn(() => Promise.resolve(testWrite(recordDocument())));
    const settle = vi.fn().mockResolvedValue({
      outcome: "unknown",
      mutationId: "chapter-mutation",
      problem: { code: "outcome_unknown", recovery: "resolve_outcome", message: "Unknown" },
    });
    await expect(createSourcePart(mockSdk({ create, settle }), proposed)).rejects.toMatchObject({
      code: "outcome_unknown",
      mutationId: "chapter-mutation",
    });
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("chapter names", () => {
  it("never writes a second record with the chapter's id when its name holds different fields", async () => {
    const proposed = plan();
    vi.spyOn(ConnectSourceRepository.prototype, "get").mockResolvedValue(proposed.parent);
    const create = vi.fn(() => Promise.reject(mdbaseError("conflict", "Path taken", "path_taken")));
    // An earlier attempt of this chapter, edited since.
    const earlier = recordDocument();
    const read = vi.fn(() =>
      Promise.resolve({
        ...earlier,
        effective: { id: proposed.sourceId, title: "Chapter, edited" },
      }),
    );
    await expect(createSourcePart(mockSdk({ create, get: read }), proposed)).rejects.toThrow(
      "Path taken",
    );
    expect(create).toHaveBeenCalledOnce();
  });
  it("moves to the next name when another source already has the chapter's", async () => {
    const proposed = plan();
    vi.spyOn(ConnectSourceRepository.prototype, "get").mockResolvedValue(proposed.parent);
    const create = vi.fn((input: Parameters<MdbaseClient["create"]>[0]) =>
      input.path === "sources/chapter.md"
        ? Promise.reject(mdbaseError("conflict", "Path taken", "path_taken"))
        : Promise.resolve(
            testWrite(
              testRecord({
                ...recordDocument(),
                path: input.path!,
                frontmatter: input.frontmatter as JsonObject,
                effective: input.frontmatter as JsonObject,
              }),
            ),
          ),
    );
    // Another book's chapter of the same name.
    const read = vi.fn(() => Promise.resolve(recordDocument()));
    const created = await createSourcePart(mockSdk({ create, get: read }), proposed);
    expect(create.mock.calls.map(([input]) => input.path)).toEqual([
      "sources/chapter.md",
      "sources/chapter-smith-2019.md",
    ]);
    expect(created.path).toBe("sources/chapter-smith-2019.md");
  });
});

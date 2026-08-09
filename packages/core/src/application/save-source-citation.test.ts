import { describe, expect, it, vi } from "vitest";

import { collectionId, recordRevision, sourceId } from "../domain/identity.js";

import { saveSourceCitation } from "./save-source-citation.js";

import type { SourceRepository } from "./ports.js";
import type { Source } from "../domain/source.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_one"),
  path: "sources/one.md",
  title: "One",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  frontmatter: {},
};

describe("saveSourceCitation", () => {
  it("validates and saves a unique CSL item with revision protection", async () => {
    const updateCitation = vi.fn(() => Promise.resolve(source));
    const repository = { updateCitation } as unknown as SourceRepository;
    const citation = { id: "weil2002", type: "book", title: "Gravity and Grace" };

    await saveSourceCitation(repository, source, [source], citation);

    expect(updateCitation).toHaveBeenCalledWith({
      collectionId: "reading",
      sourceId: "src_one",
      expectedRevision: "rev-one",
      citation,
    });
  });

  it("rejects a citekey already used by another source", async () => {
    const repository = { updateCitation: vi.fn() } as unknown as SourceRepository;
    const other = {
      ...source,
      id: sourceId("src_two"),
      title: "Two",
      citation: { id: "weil2002", type: "book" },
    };

    await expect(
      saveSourceCitation(repository, source, [source, other], {
        id: "weil2002",
        type: "book",
      }),
    ).rejects.toMatchObject({ code: "duplicate-citekey" });
    expect(repository.updateCitation).not.toHaveBeenCalled();
  });
});

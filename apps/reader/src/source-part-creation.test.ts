import { describe, expect, it, vi } from "vitest";

import { chapterBooks, chapterIsbns } from "./chapter-doi.js";
import { validateChapterRange } from "./chapter-outline.js";
import { addSourceFromInput, type SourceAdditionServices } from "./source-addition-flow.js";
import {
  chapterPlan,
  confirmChapterPlans,
  epubChapterProposals,
  pdfChapterProposals,
} from "./source-part-creation.js";
import { partSource } from "./source-parts.fixtures.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { CitationCandidate } from "@mdbase-reader/core";

const book = partSource("book");
const document = book.documents[0];
const candidate: CitationCandidate = {
  warnings: [],
  citation: {
    id: "chapter",
    type: "chapter",
    title: "Chapter",
    DOI: "10.1234/chapter",
    ISBN: "9780306406157",
  },
  provenance: {
    provider: "doi.org",
    query: "10.1234/chapter",
    retrievedAt: "2026-01-01T00:00:00Z",
  },
};
const proposal = {
  key: "reviewed-key",
  title: "Chapter",
  level: 0,
  range: { kind: "pages" as const, start: 2, end: 5 },
};

describe("outline proposals", () => {
  it("uses next unselected peer, contains nested headings, and ends the last entry at document end", () => {
    const proposals = pdfChapterProposals(
      [
        { title: "One", level: 0, pageIndex: 0 },
        { title: "Nested", level: 1, pageIndex: 2 },
        { title: "Two", level: 0, pageIndex: 6 },
        { title: "Last", level: 0, pageIndex: 8 },
      ],
      12,
    );
    expect(proposals.map(({ range }) => range)).toEqual([
      { kind: "pages", start: 0, end: 5 },
      { kind: "pages", start: 2, end: 5 },
      { kind: "pages", start: 6, end: 7 },
      { kind: "pages", start: 8, end: 11 },
    ]);
    expect(proposals[0]?.warning).toContain("nested");
  });
  it("does not invent ranges from missing, same-page, inverted, or outside destinations", () => {
    for (const entries of [
      [
        { title: "Missing", level: 0 },
        { title: "Two", level: 0, pageIndex: 4 },
      ],
      [
        { title: "Same", level: 0, pageIndex: 4 },
        { title: "Two", level: 0, pageIndex: 4 },
      ],
      [
        { title: "Inverted", level: 0, pageIndex: 5 },
        { title: "Two", level: 0, pageIndex: 4 },
      ],
      [{ title: "Outside", level: 0, pageIndex: 15 }],
    ]) {
      expect(pdfChapterProposals(entries, 12)[0]).toMatchObject({ problem: expect.any(String) });
    }
    expect(() =>
      validateChapterRange({ kind: "pages", start: 0, end: 12 }, { pageCount: 12, proposals: [] }),
    ).toThrow("Invalid chapter range");
  });
  it("uses actual EPUB spine order and exposes fragment and same-resource uncertainty", () => {
    const entries = epubChapterProposals(
      [
        { title: "One", level: 0, href: "z.xhtml", fragment: "heading" },
        { title: "Two", level: 0, href: "a.xhtml" },
      ],
      ["z.xhtml", "middle.xhtml", "a.xhtml"],
    );
    expect(entries[0]?.range).toEqual({
      kind: "epub-spine",
      start: "z.xhtml",
      end: "middle.xhtml",
    });
    expect(entries[0]?.warning).toContain("fragments");
    expect(entries[1]?.range).toEqual({ kind: "epub-spine", start: "a.xhtml", end: "a.xhtml" });
    expect(
      epubChapterProposals(
        [
          { title: "One", level: 0, href: "a" },
          { title: "Two", level: 0, href: "a" },
        ],
        ["a"],
      )[0]?.problem,
    ).toBeTruthy();
  });
});

describe("reviewed chapter creation", () => {
  it("does not create during planning and writes one source with shared identity, relation plan and parent claims only after confirmation", async () => {
    const createSourcePart = vi.fn().mockResolvedValue(partSource("created", "book"));
    const gateway = {
      createSourcePart,
      library: vi.fn().mockResolvedValue({ sources: [book] }),
    } as unknown as ReaderWorkspaceGateway;
    const plan = chapterPlan(book, proposal, document);
    expect(createSourcePart).not.toHaveBeenCalled();
    expect(plan.document).toMatchObject({
      fileId: document?.fileId,
      revision: document?.revision,
      range: proposal.range,
    });
    expect(plan.citation).toMatchObject({
      type: "chapter",
      title: "Chapter",
      "container-title": "book",
      publisher: "Book press",
    });
    await confirmChapterPlans(gateway, [plan], false, vi.fn());
    expect(createSourcePart).toHaveBeenCalledExactlyOnceWith(plan);
    expect(chapterPlan(book, proposal, document).sourceId).toBe(plan.sourceId);
  });
  it("blocks duplicate ranges and partial indexes, and requires acknowledgement for overlaps", async () => {
    const plan = chapterPlan(book, proposal, document);
    const existing = {
      ...partSource("existing", "book"),
      documents: plan.document ? [plan.document] : [],
    };
    const createSourcePart = vi.fn();
    const library = vi.fn().mockResolvedValue({ sources: [book, existing] });
    const gateway = { library, createSourcePart } as unknown as ReaderWorkspaceGateway;
    await expect(confirmChapterPlans(gateway, [plan], true, vi.fn())).rejects.toThrow(
      "Duplicate range",
    );
    library.mockResolvedValue({ sources: [book], sourceIndex: { complete: false } });
    await expect(confirmChapterPlans(gateway, [plan], true, vi.fn())).rejects.toThrow("partial");
    const overlapping = chapterPlan(
      book,
      { ...proposal, key: "other", range: { kind: "pages", start: 4, end: 8 } },
      document,
    );
    library.mockResolvedValue({ sources: [book] });
    await expect(confirmChapterPlans(gateway, [plan, overlapping], false, vi.fn())).rejects.toThrow(
      "Overlaps",
    );
    expect(createSourcePart).not.toHaveBeenCalled();
    createSourcePart.mockResolvedValue(existing);
    await confirmChapterPlans(gateway, [plan, overlapping], true, vi.fn());
    expect(createSourcePart).toHaveBeenCalledTimes(2);
  });
});

describe("chapter DOI offers", () => {
  it("matches ISBN-10 and ISBN-13 for the same edition, never book title alone", () => {
    expect(chapterIsbns("0-306-40615-2")).toEqual(["9780306406157"]);
    expect(
      chapterBooks(candidate, [
        book,
        {
          ...book,
          id: partSource("wrong").id,
          citation: { id: "other", type: "book", title: "book", ISBN: "9781861972712" },
        },
      ]),
    ).toEqual([book]);
  });
  it.each([
    { sources: [book], expected: 1 },
    { sources: [], expected: 0 },
  ])(
    "offers attachment or book creation without writes or PDF lookups",
    async ({ sources, expected }) => {
      const createSourcePart = vi.fn();
      const createSource = vi.fn();
      const fetch = vi.fn();
      const gateway = {
        createSourcePart,
        library: vi.fn().mockResolvedValue({ sources }),
      } as unknown as ReaderWorkspaceGateway;
      const services = {
        chapterGateway: gateway,
        lookUp: vi.fn().mockResolvedValue(candidate),
        workspace: { createSource },
        onStatus: vi.fn(),
        fetch,
      } as unknown as SourceAdditionServices;
      const outcome = await addSourceFromInput("10.1234/chapter", services);
      expect(outcome.kind).toBe("chapter-offer");
      expect(createSourcePart).not.toHaveBeenCalled();
      expect(createSource).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      if (outcome.kind === "chapter-offer") {
        expect(outcome.offer.books).toHaveLength(expected);
      }
    },
  );
});

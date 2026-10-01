import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { addSourceFromInput, type SourceAdditionServices } from "./source-addition-flow.js";

import type { CaptureResult } from "./web-capture-client.js";

const pdfBytes = new TextEncoder().encode("%PDF-1.7 fixture");

const dostoevsky = {
  id: "candidate",
  type: "book",
  title: "Crime and punishment",
  author: [{ family: "Dostoevsky", given: "Fyodor" }],
  issued: { "date-parts": [[2002]] },
  ISBN: "9780140449136",
};

function services(overrides: Partial<SourceAdditionServices> = {}): SourceAdditionServices {
  return {
    capture: vi.fn(() => Promise.reject(new Error("blocked"))),
    candidates: vi.fn(() => Promise.resolve({ pdfUrls: [], landingPages: [] })),
    lookUp: vi.fn((request) =>
      Promise.resolve({
        citation: dostoevsky,
        provenance: { provider: "test", query: request.value, retrievedAt: "2026-09-25T00:00:00Z" },
        warnings: [],
      }),
    ),
    pdfIdentifiers: vi.fn(() => Promise.resolve({})),
    workspace: {
      importSourceFile: vi.fn(() => Promise.resolve(source())),
      createSource: vi.fn(() => Promise.resolve(source())),
      saveNewSourceCitation: vi.fn((saved: Source) => Promise.resolve(saved)),
    },
    onStatus: vi.fn(),
    ...overrides,
  };
}

describe("adding a source from pasted text", () => {
  it("saves a book found by ISBN without a document when no free PDF exists", async () => {
    const deps = services();
    const outcome = await addSourceFromInput("978-0-14-044913-6", deps);

    expect(deps.lookUp).toHaveBeenCalledWith({ kind: "identifier", value: "isbn:9780140449136" });
    expect(deps.workspace.createSource).toHaveBeenCalledWith(
      {
        title: "Crime and punishment",
        kind: "book",
        metadata: { authors: ["Fyodor Dostoevsky"], published: "2002" },
      },
      undefined,
    );
    expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(
      source(),
      expect.not.objectContaining({ id: expect.anything() }),
    );
    expect(outcome).toMatchObject({ kind: "added", notices: [] });
  });

  it("downloads an open-access PDF for a DOI and records the DOI link", async () => {
    const capture = vi.fn((url: string): Promise<CaptureResult> =>
      url === "https://hal.science/hal-1"
        ? Promise.resolve({
            kind: "html",
            page: { scholarly: { pdfUrl: "https://hal.science/hal-1/document.pdf" } },
          } as CaptureResult)
        : url === "https://hal.science/hal-1/document.pdf"
          ? Promise.resolve({
              kind: "pdf",
              bytes: pdfBytes,
              submittedUrl: url,
              canonicalUrl: url,
              retrievedAt: "2026-09-25T00:00:00Z",
            })
          : Promise.reject(new Error("paywall")),
    );
    const deps = services({
      capture,
      candidates: vi.fn(() =>
        Promise.resolve({ pdfUrls: [], landingPages: ["https://hal.science/hal-1"] }),
      ),
      lookUp: vi.fn(() =>
        Promise.resolve({
          citation: {
            id: "candidate",
            type: "article-journal",
            title: "Molecular structure of nucleic acids",
            DOI: "10.1038/171737a0",
          },
          provenance: { provider: "doi.org", query: "", retrievedAt: "" },
          warnings: [],
        }),
      ),
    });

    const outcome = await addSourceFromInput("https://doi.org/10.1038/171737a0", deps);

    expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "document.pdf",
        declaredMediaType: "application/pdf",
        bytes: pdfBytes,
        title: "Molecular structure of nucleic acids",
        kind: "paper",
        url: "https://doi.org/10.1038/171737a0",
      }),
      undefined,
    );
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "added", notices: [] });
  });

  it("offers to save only the citation when a page cannot be fetched", async () => {
    const deps = services();
    const outcome = await addSourceFromInput("https://news.example/story", deps);
    expect(outcome).toMatchObject({ kind: "citation-only", reason: "blocked" });
    expect(deps.workspace.importSourceFile).not.toHaveBeenCalled();
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
  });

  it("cites a PDF saved by its address from the identifiers printed in it", async () => {
    const url = "https://arxiv.example/files/diphoton.pdf";
    const deps = services({
      capture: vi.fn(() =>
        Promise.resolve({
          kind: "pdf" as const,
          bytes: pdfBytes,
          submittedUrl: url,
          canonicalUrl: url,
          retrievedAt: "2026-09-25T00:00:00Z",
        }),
      ),
      pdfIdentifiers: vi.fn(() => Promise.resolve({ arxiv: "0704.0001" })),
    });
    await addSourceFromInput(url, deps);
    expect(deps.lookUp).toHaveBeenCalledWith({ kind: "identifier", value: "arxiv:0704.0001" });
    expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "diphoton.pdf", url, title: "Crime and punishment" }),
      undefined,
    );
  });

  it("keeps the source when its citation cannot be stored, and rejects unknown text", async () => {
    const deps = services({
      workspace: {
        importSourceFile: vi.fn(),
        createSource: vi.fn(() => Promise.resolve(source())),
        saveNewSourceCitation: vi.fn(() => Promise.reject(new Error("Citekey taken."))),
      },
    });
    expect(await addSourceFromInput("isbn 9780140449136", deps)).toMatchObject({
      kind: "added",
      notices: [expect.stringContaining("Citekey taken.")],
    });
    await expect(addSourceFromInput("Crime and Punishment", deps)).rejects.toThrow(
      "Paste a web address",
    );
  });
});

function source(): Source {
  return {
    collectionId: collectionId("reading"),
    id: sourceId("src_new"),
    path: "sources/src_new.md",
    title: "Crime and punishment",
    creators: [],
    tags: [],
    documents: [],
    body: "",
    recordRevision: recordRevision("record-1"),
    frontmatter: {},
  };
}

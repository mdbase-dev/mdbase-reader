import {
  collectionId,
  cslFieldStatuses,
  recordRevision,
  sourceId,
  type CitationCandidate,
  type Source,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { citationStatusLabel } from "./citation-provenance.js";
import { addSourceFromInput, createWithoutDocument } from "./source-addition-flow.js";

import type { SourceAdditionServices } from "./source-addition-flow.js";

const candidate: CitationCandidate = {
  citation: {
    id: "candidate",
    type: "article",
    title: "Adam: A Method for Stochastic Optimization",
    DOI: "10.48550/arXiv.1412.6980",
  },
  provenance: {
    provider: "DOI registry (doi.org)",
    query: "arxiv:1412.6980",
    retrievedAt: "2026-10-21T00:00:00Z",
  },
  warnings: [],
};
const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_new"),
  path: "sources/new.md",
  title: "Adam",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("r1"),
  frontmatter: {},
};
const pdf = {
  kind: "pdf" as const,
  bytes: new TextEncoder().encode("%PDF-1.7"),
  submittedUrl: "https://example.com/a.pdf",
  canonicalUrl: "https://example.com/a.pdf",
  retrievedAt: "2026-10-21T00:00:00Z",
};

function services(value = candidate): SourceAdditionServices {
  return {
    capture: vi.fn().mockRejectedValue(new Error("blocked")),
    candidates: vi.fn().mockResolvedValue({ pdfUrls: [], landingPages: [] }),
    lookUp: vi.fn().mockResolvedValue(value),
    pdfIdentifiers: vi.fn().mockResolvedValue({
      arxiv: "1412.6980",
      claims: [
        {
          field: "title",
          value: "Embedded title",
          source: { kind: "page", signal: "dublin-core" },
          observedAt: pdf.retrievedAt,
        },
        {
          field: "DOI",
          value: candidate.citation["DOI"],
          source: { kind: "page", signal: "dublin-core" },
          observedAt: pdf.retrievedAt,
        },
      ],
    }),
    workspace: {
      createSource: vi.fn().mockResolvedValue(source),
      importSourceFile: vi.fn().mockResolvedValue(source),
      saveNewSourceCitation: vi.fn((record, citation, provenance) =>
        Promise.resolve({
          ...record,
          citation: { ...citation, id: "adam2014" },
          cslProvenance: provenance,
          frontmatter: { csl: { ...citation, id: "adam2014" }, "csl-provenance": provenance },
        } as Source),
      ),
    },
    onStatus: vi.fn(),
  };
}

function checkSaved(saved: Source, expected: string): void {
  expect(saved.frontmatter["csl-provenance"]).toEqual(saved.cslProvenance);
  for (const field of Object.keys(candidate.citation).filter((field) => field !== "id")) {
    expect(saved.cslProvenance?.[field]?.source).toBe(expected);
    expect(
      citationStatusLabel(
        cslFieldStatuses(saved.citation ?? {}, saved.cslProvenance ?? {})[field]!,
      ),
    ).not.toBe("manual");
  }
  expect(saved.citation).toEqual({ ...candidate.citation, id: "adam2014" });
  expect(saved.cslProvenance).not.toHaveProperty("id");
}

describe("new citation provenance", () => {
  it.each(["10.48550/arXiv.1412.6980", "arxiv:1412.6980", "https://arxiv.org/abs/1412.6980"])(
    "explains an identifier add: %s",
    async (input) => {
      const result = await addSourceFromInput(input, services());
      expect(result.kind).toBe("added");
      if (result.kind === "added") {
        checkSaved(result.source, "registry:doi.org");
      }
    },
  );

  it.each(["isbn:9780306406157", "pmid:123456"])(
    "attributes candidate-only catalogues without inventing registry authority: %s",
    async (input) => {
      const deps = services({
        ...candidate,
        provenance: { ...candidate.provenance, provider: "Citoid", query: input },
      });
      const result = await addSourceFromInput(input, deps);
      if (result.kind !== "added") {
        throw new Error("not saved");
      }
      checkSaved(result.source, "generic-remote:Citoid");
    },
  );

  it.each([false, true])(
    "saves registry provenance for a PDF (identifier download: %s)",
    async (identifier) => {
      const deps: SourceAdditionServices = {
        ...services(),
        capture: vi.fn().mockResolvedValue(pdf),
        ...(identifier
          ? {
              candidates: vi
                .fn()
                .mockResolvedValue({ pdfUrls: [pdf.canonicalUrl], landingPages: [] }),
            }
          : {}),
      };
      const result = await addSourceFromInput(
        identifier ? "arxiv:1412.6980" : pdf.canonicalUrl,
        deps,
      );
      if (result.kind !== "added") {
        throw new Error("not saved");
      }
      checkSaved(result.source, "registry:doi.org");
      expect(deps.pdfIdentifiers).toHaveBeenCalledOnce();
      expect(result.source.cslProvenance?.["title"]?.rejected).toContainEqual({
        value: "Embedded title",
        from: "page:dublin-core",
      });
    },
  );

  it("retains provider evidence through the citation-only offer and confirmation", async () => {
    const deps = services();
    const offered = await addSourceFromInput("https://example.com/blocked", deps);
    if (offered.kind !== "citation-only") {
      throw new Error("no offer");
    }
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
    const saved = await createWithoutDocument(
      offered.candidate,
      "https://example.com/blocked",
      deps,
    );
    if (saved.kind !== "added") {
      throw new Error("not saved");
    }
    checkSaved(saved.source, "registry:doi.org");
  });
});

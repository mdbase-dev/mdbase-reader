import { describe, expect, it, vi } from "vitest";

import {
  candidateClaims,
  candidateProvenance,
  documentClaims,
  newCitationProvenance,
} from "./new-citation-provenance.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { CitationCandidate } from "@mdbase-reader/core";
import type { Claim } from "@mdbase-reader/web-capture/citation-updates";

const candidate: CitationCandidate = {
  citation: { id: "placeholder", type: "article", title: "A title", DOI: "10.1234/work" },
  provenance: {
    provider: "DOI registry (doi.org)",
    query: "10.1234/work",
    retrievedAt: "2026-10-21T00:00:00Z",
  },
  warnings: [],
};

function gateway(claims: readonly Claim[]): ReaderWorkspaceGateway {
  return { citationClaims: vi.fn().mockResolvedValue(claims) } as unknown as ReaderWorkspaceGateway;
}

describe("new-source claim conversion", () => {
  it.each(["doi.org", "DOI registry (doi.org)", "isbn", "pubmed"])(
    "maps the known registry provider %s",
    (provider) => {
      const value = { ...candidate, provenance: { ...candidate.provenance, provider } };
      const name = provider.includes("doi.org") ? "doi.org" : provider;
      expect(candidateClaims(value)).toContainEqual({
        field: "title",
        value: "A title",
        source: { kind: "registry", name },
        observedAt: candidate.provenance.retrievedAt,
      });
      expect(candidateProvenance(value)["title"]).toEqual({
        value: "A title",
        source: `registry:${name}`,
      });
    },
  );

  it("prefers gateway evidence, including its identity uncertainty downgrade", async () => {
    const claims = candidateClaims(candidate).map((claim): Claim => ({
      ...claim,
      source: { kind: "generic-remote", name: "doi.org" },
      evidence: "uncertain work",
    }));
    const service = gateway(claims);
    const provenance = await newCitationProvenance(candidate, service);
    expect(service.citationClaims).toHaveBeenCalledExactlyOnceWith({ query: "10.1234/work" }, {});
    expect(provenance["title"]?.source).toBe("generic-remote:doi.org uncertain work");
  });

  it("does not restore registry authority after gateway mismatch or failure", async () => {
    const service = gateway([]);
    expect((await newCitationProvenance(candidate, service))["title"]?.source).toBe(
      "generic-remote:DOI registry (doi.org)",
    );
    vi.mocked(service.citationClaims!).mockRejectedValue(new Error("offline"));
    expect((await newCitationProvenance(candidate, service))["title"]?.source).toBe(
      "generic-remote:DOI registry (doi.org)",
    );
  });

  it("uses Citoid's field-level translator evidence without changing accepted citation values", async () => {
    const service = gateway(
      candidateClaims(candidate).map((claim): Claim => ({
        ...claim,
        source: { kind: "site-adapter", name: "citoid/journalArticle" },
      })),
    );
    const provenance = await newCitationProvenance(
      { ...candidate, provenance: { ...candidate.provenance, query: "https://example.com/work" } },
      service,
    );
    expect(provenance["title"]?.source).toBe("site-adapter:citoid/journalArticle");
    expect(provenance["title"]?.value).toBe(candidate.citation["title"]);
    expect(provenance).not.toHaveProperty("id");
  });

  it("combines embedded file claims with registry evidence", () => {
    const claims = documentClaims(
      {
        title: "PDF title",
        metadata: { authors: ["PDF Author"] },
        identifiers: { doi: "10.1234/work" },
      },
      candidate.provenance.retrievedAt,
    );
    const provenance = candidateProvenance(candidate, undefined, claims);
    expect(provenance["title"]?.source).toBe("registry:doi.org");
    expect(provenance["title"]?.rejected).toContainEqual({
      value: "PDF title",
      from: "page:dublin-core embedded document metadata",
    });
    expect(provenance["DOI"]?.agreed).toContain("page:dublin-core embedded document metadata");
    expect(provenance).not.toHaveProperty("author");
  });

  it("keeps author lists and title spelling even when resolver normalization differs", () => {
    const citation = {
      ...candidate.citation,
      title: "  A title  ",
      author: [{ literal: "Staff reporter" }],
    };
    const provenance = candidateProvenance({ ...candidate, citation });
    expect(provenance["title"]?.value).toBe(citation.title);
    expect(provenance["author"]).toEqual({ value: citation.author, source: "registry:doi.org" });
  });

  it("does not continue saving after cancellation", async () => {
    const controller = new AbortController();
    const service = gateway([]);
    controller.abort(new Error("Cancelled"));
    await expect(newCitationProvenance(candidate, service, controller.signal)).rejects.toThrow(
      "Cancelled",
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import { openAccessCandidates } from "./open-access.js";
import {
  identifierLookup,
  identifiersInText,
  normalizedIsbn,
  parseSourceInput,
} from "./source-identifiers.js";

describe("source input", () => {
  it("recognises links, DOI and arXiv links, and bare or prefixed identifiers", () => {
    expect(parseSourceInput("https://example.com/essay")).toEqual({
      kind: "url",
      value: "https://example.com/essay",
    });
    expect(parseSourceInput("https://doi.org/10.1038/171737a0")).toEqual({
      kind: "doi",
      value: "10.1038/171737a0",
    });
    expect(parseSourceInput("https://arxiv.org/abs/0704.0001v2")).toEqual({
      kind: "arxiv",
      value: "0704.0001v2",
    });
    expect(parseSourceInput(" doi:10.1038/171737a0 ")).toEqual({
      kind: "doi",
      value: "10.1038/171737a0",
    });
    expect(parseSourceInput("10.1038/171737a0")?.kind).toBe("doi");
    expect(parseSourceInput("2101.00001")).toEqual({ kind: "arxiv", value: "2101.00001" });
    expect(parseSourceInput("arXiv:hep-th/9901001")).toEqual({
      kind: "arxiv",
      value: "hep-th/9901001",
    });
    expect(parseSourceInput("978-0-14-044913-6")).toEqual({
      kind: "isbn",
      value: "9780140449136",
    });
    expect(parseSourceInput("ISBN 0-306-40615-2")).toEqual({ kind: "isbn", value: "0306406152" });
    expect(parseSourceInput("PMID: 26017442")).toEqual({ kind: "pmid", value: "26017442" });
    expect(parseSourceInput("pmc4687200")).toEqual({ kind: "pmcid", value: "PMC4687200" });
  });

  it("rejects titles, bad checksums and unprefixed PubMed numbers", () => {
    expect(parseSourceInput("Crime and Punishment")).toBeNull();
    expect(parseSourceInput("978-0-415-29001-3")).toBeNull();
    expect(parseSourceInput("26017442")).toBeNull();
    expect(normalizedIsbn("0-306-40615-2")).toBe("0306406152");
  });

  it("turns identifiers into citation lookups", () => {
    expect(identifierLookup({ kind: "doi", value: "10.1/x" })).toEqual({
      kind: "identifier",
      value: "10.1/x",
    });
    expect(identifierLookup({ kind: "isbn", value: "9780140449136" })).toEqual({
      kind: "identifier",
      value: "isbn:9780140449136",
    });
    expect(identifierLookup({ kind: "url", value: "https://a.example/" }).kind).toBe("url");
  });

  it("finds identifiers printed in a document", () => {
    expect(
      identifiersInText(
        "Nature 171, 737–738 (1953) doi:10.1038/ 171737a0\narXiv:0704.0001v2 [hep-ph] ISBN: 978-0-14-044913-6",
      ),
    ).toEqual({ doi: "10.1038/171737a0", arxiv: "0704.0001", isbn: "9780140449136" });
    expect(identifiersInText("No identifiers here.")).toEqual({});
  });
});

describe("open-access discovery", () => {
  it("goes straight to arXiv's PDF for arXiv works", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await openAccessCandidates({ doi: "10.48550/arXiv.0704.0001" }, { fetch: fetcher }),
    ).toEqual({ pdfUrls: ["https://arxiv.org/pdf/0704.0001"], landingPages: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("collects OpenAlex's open locations, skipping abstracts, before the DOI page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        best_oa_location: {
          is_oa: true,
          pdf_url: null,
          landing_page_url: "https://hal.science/hal-1",
        },
        locations: [
          { is_oa: false, landing_page_url: "https://doi.org/10.1038/171737a0" },
          { is_oa: true, landing_page_url: "https://pubmed.ncbi.nlm.nih.gov/26017442" },
          {
            is_oa: true,
            pdf_url: "http://repo.example/paper.pdf",
            landing_page_url: "https://hal.science/hal-1",
          },
        ],
      }),
    );
    expect(await openAccessCandidates({ doi: "10.1038/171737a0" }, { fetch: fetcher })).toEqual({
      pdfUrls: ["https://repo.example/paper.pdf"],
      landingPages: ["https://hal.science/hal-1", "https://doi.org/10.1038/171737a0"],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("asks Unpaywall only with a contact address and survives failing indexes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        typeof input === "string" && input.startsWith("https://api.unpaywall.org/")
          ? Promise.resolve(
              Response.json({ best_oa_location: { url_for_pdf: "https://oa.example/a.pdf" } }),
            )
          : Promise.reject(new TypeError("offline")),
      );
    const found = await openAccessCandidates(
      { doi: "10.7717/peerj.4375" },
      { fetch: fetcher, unpaywallEmail: "reader@example.org" },
    );
    expect(found).toEqual({
      pdfUrls: ["https://oa.example/a.pdf"],
      landingPages: ["https://doi.org/10.7717/peerj.4375"],
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain("email=reader%40example.org");
  });
});

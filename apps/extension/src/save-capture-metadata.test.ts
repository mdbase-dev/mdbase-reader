// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { capture, fixture } from "./testing/save-capture-fixture.js";

import type { PageCapture } from "./page-capture.js";
import type { SourceSummary } from "@mdbase-reader/core";

describe("capture metadata and formats", () => {
  it("uses the source the panel already found instead of looking it up again", async () => {
    const f = fixture();
    const first = await f.save({ highlight: false });
    vi.mocked(f.collection.sources.list).mockClear();
    const result = await f.save({ highlight: false }, capture, { known: first.source });
    expect(result.existing).toBe(true);
    expect(f.collection.sources.list).not.toHaveBeenCalled();
  });
  it("stores a citation on new sources under an unused citekey", async () => {
    const f = fixture();
    f.findByCitekeyPrefix.mockResolvedValue([
      {
        id: "other",
        citation: { id: "watsonmolecular1953", type: "article" },
      } as unknown as SourceSummary,
    ]);
    const citation = {
      type: "article-journal",
      title: "Molecular structure of nucleic acids",
      author: [{ family: "Watson", given: "James D." }],
      issued: { "date-parts": [[1953]] },
    };
    const result = await f.save({ highlight: false }, capture, {
      citation: { citation, origin: "doi", doi: "10.1038/171737a0" },
    });
    expect(f.updateCitation.mock.calls[0]?.[0].citation).toMatchObject({
      id: "watsonmolecular1953a",
      title: "Molecular structure of nucleic acids",
    });
    expect(f.commit.mock.calls[0]?.[0].metadata?.authors).toEqual(["James D. Watson"]);
    expect(result.notices).toEqual([]);
  });
  it("keeps the source when its citation cannot be stored, and says so", async () => {
    const f = fixture();
    f.updateCitation.mockRejectedValueOnce(new Error("revision conflict"));
    const result = await f.save({ highlight: false }, capture, {
      citation: { citation: { type: "article", title: "T" }, origin: "page" },
    });
    expect(result.source).toBeTruthy();
    expect(result.notices[0]).toContain("revision conflict");
  });
  it("imports a PDF tab's bytes and records its address for later duplicate checks", async () => {
    const f = fixture();
    const pdf: PageCapture = {
      kind: "pdf",
      submittedUrl: "https://arxiv.org/pdf/0704.0001",
      canonicalUrl: "https://arxiv.org/pdf/0704.0001",
      retrievedAt: "2026-09-23T12:00:00.000Z",
      pageTitle: "0704.0001",
      selection: null,
    };
    const bytes = new TextEncoder().encode("%PDF-1.7\n%test\n");
    await f.save({ highlight: false, title: "" }, pdf, {
      pdfBytes: () => Promise.resolve(bytes),
      citation: {
        citation: {
          type: "article",
          title:
            "Calculation of Prompt Diphoton Production Cross Sections at Tevatron and LHC Energies",
        },
        origin: "doi",
      },
    });
    const plan = f.commit.mock.calls[0]?.[0];
    expect(plan?.title).toBe(
      "Calculation of Prompt Diphoton Production Cross Sections at Tevatron and LHC Energies",
    );
    expect(plan?.representations[0]?.format).toBe("pdf");
    // Written with the import itself rather than as a second update.
    expect(plan?.url).toBe("https://arxiv.org/pdf/0704.0001");
    expect(f.updateFields).not.toHaveBeenCalled();
  });
});

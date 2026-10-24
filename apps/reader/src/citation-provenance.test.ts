import { describe, expect, it } from "vitest";

import {
  citationEvidenceLabel,
  citationSourceLabel,
  citationStatusLabel,
  editedCitationProvenance,
} from "./citation-provenance.js";

describe("citation provenance labels", () => {
  it.each([
    ["site-adapter:Wikipedia", "Wikipedia"],
    ["site-adapter:The Guardian", "The Guardian"],
    ["site-adapter:citoid/encyclopediaArticle", "Encyclopedia article"],
    ["site-adapter:citoid/webpage", "From the web page"],
    ["registry:doi.org", "doi.org"],
    ["registry:doi.org DOI", "doi.org"],
    ["parent", "From the book"],
    ["parent title", "From the book"],
    ["page:json-ld", "page metadata"],
    ["page:html", "page title"],
    ["site-adapter:stack-exchange/question", "From the web page"],
    ["site-adapter:translation-server/encyclopediaArticle", "Encyclopedia article"],
    // Embedded Metadata output for a page URL restates the page's own tags.
    ["generic-remote:citoid", "From the web page"],
    ["generic-remote:citoid Citoid webpage", "From the web page"],
    ["generic-remote:citoid Citoid newspaperArticle", "From the web page"],
    // A site translator's record, downgraded for uncertain identity, is not the page's tags.
    ["generic-remote:citoid Citoid journalArticle", "From an online lookup"],
    // Title, ISBN and PubMed lookups store a descriptive provider and no evidence.
    ["generic-remote:Citoid (Zotero translators via Wikimedia)", "From an online lookup"],
    ["generic-remote:DOI registry (doi.org)", "From an online lookup"],
    ["generic-remote:doi.org doi.org CSL", "From an online lookup"],
    ["generic-remote:translation-server", "From an online lookup"],
    ["user", "edited manually"],
    ["unrecognised", "other source"],
  ])("formats %s", (label, expected) => expect(citationSourceLabel(label)).toBe(expected));

  it("labels all four field statuses and agreed evidence", () => {
    const provenance = { value: "A", source: "registry:doi.org" };
    expect(citationStatusLabel({ kind: "explained", provenance })).toBe("doi.org");
    expect(citationStatusLabel({ kind: "edited", previous: provenance })).toBe("edited manually");
    expect(citationStatusLabel({ kind: "removed", previous: provenance })).toBe("removed");
    expect(citationStatusLabel({ kind: "unexplained" })).toBe("no recorded source");
    expect(citationEvidenceLabel("page:json-ld name")).toBe("page metadata · name");
    expect(citationEvidenceLabel("h1")).toBe("h1");
    expect(
      citationStatusLabel({
        kind: "explained",
        provenance: { value: "Book", source: "parent title" },
      }),
    ).toBe("From the book");
    expect(citationEvidenceLabel("parent title")).toBe("From the book · title");
  });

  it("keeps untouched entries, makes typing user-owned, and pins deliberate removals", () => {
    const title = { value: "A", source: "page:html", agreed: ["h1"] };
    const result = editedCitationProvenance(
      { title: "A", publisher: "P", language: "en" },
      { title: "A", publisher: "Mine" },
      { title },
    );
    expect(result).toEqual({
      title,
      publisher: { value: "Mine", source: "user" },
      language: { value: "en", source: "user" },
    });
  });
});

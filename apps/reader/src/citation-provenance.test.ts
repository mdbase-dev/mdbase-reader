import { describe, expect, it } from "vitest";

import {
  citationEvidenceLabel,
  citationSourceLabel,
  citationStatusLabel,
  editedCitationProvenance,
} from "./citation-provenance.js";

describe("citation provenance labels", () => {
  it.each([
    ["site-adapter:Wikipedia", "Wikipedia (via Citoid)"],
    ["site-adapter:citoid/encyclopediaArticle", "Encyclopedia article (via Citoid)"],
    ["registry:doi.org", "doi.org"],
    ["page:json-ld", "page metadata"],
    ["page:html", "page title"],
    ["generic-remote:citoid", "Citoid"],
    ["user", "edited manually"],
    ["unrecognised", "manual"],
  ])("formats %s", (label, expected) => expect(citationSourceLabel(label)).toBe(expected));

  it("labels all four field statuses and agreed evidence", () => {
    const provenance = { value: "A", source: "registry:doi.org" };
    expect(citationStatusLabel({ kind: "explained", provenance })).toBe("doi.org");
    expect(citationStatusLabel({ kind: "edited", previous: provenance })).toBe("edited manually");
    expect(citationStatusLabel({ kind: "removed", previous: provenance })).toBe("removed");
    expect(citationStatusLabel({ kind: "unexplained" })).toBe("manual");
    expect(citationEvidenceLabel("page:json-ld name")).toBe("page metadata · name");
    expect(citationEvidenceLabel("h1")).toBe("h1");
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

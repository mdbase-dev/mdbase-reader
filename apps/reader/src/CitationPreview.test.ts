import { describe, expect, it } from "vitest";

import { formatCitation } from "./CitationPreview.js";

describe("CSL citation rendering", () => {
  it("formats the same record with bundled CSL styles and locales", async () => {
    const citation = {
      id: "weil1952gravity",
      type: "book",
      title: "Gravity and Grace",
      author: [{ family: "Weil", given: "Simone" }],
      issued: { "date-parts": [[1952]] },
      publisher: "Routledge and Kegan Paul",
    };
    await expect(formatCitation(citation, "apa", "en-US")).resolves.toContain("Weil, S.");
    await expect(formatCitation(citation, "harvard1", "en-GB")).resolves.toContain("1952");
    await expect(formatCitation(citation, "vancouver", "fr-FR")).resolves.toContain(
      "Gravity and Grace",
    );
  });
});

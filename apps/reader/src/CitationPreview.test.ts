import { formatCitation } from "@mdbase-reader/ui/citation";
import { describe, expect, it } from "vitest";

describe("CSL citation rendering", () => {
  it("uses Italian CSL terms, not silent English fallback", async () => {
    await expect(
      formatCitation({ id: "undated", type: "book", title: "User title" }, "apa", "it-IT"),
    ).resolves.toContain("s.d.");
  });
  it("formats the same record with bundled CSL styles and locales", async () => {
    const citation = {
      id: "dostoevsky1914crime",
      type: "book",
      title: "Crime and Punishment",
      author: [{ family: "Dostoevsky", given: "Fyodor" }],
      issued: { "date-parts": [[1914]] },
      publisher: "William Heinemann",
    };
    await expect(formatCitation(citation, "apa", "en-US")).resolves.toContain("Dostoevsky, F.");
    await expect(formatCitation(citation, "harvard1", "en-GB")).resolves.toContain("1914");
    await expect(formatCitation(citation, "vancouver", "fr-FR")).resolves.toContain(
      "Crime and Punishment",
    );
  });
});

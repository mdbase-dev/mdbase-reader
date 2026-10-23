import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { afterEach, describe, expect, it } from "vitest";

import { readerPdfLocale } from "./pdf-translations.js";

// Use the real singleton; document parameter resolution remains owned by EmbedPDF.
i18n.load("en", {});
i18n.activate("en");
afterEach(() => {
  i18n.activate("en");
});

describe("PDF chrome catalogue bridge", () => {
  it("translates chrome while retaining viewer parameter tokens", () => {
    const page = msg({ message: "Page {page}", context: "PDF viewer search" });
    if (!page.id) {
      throw new Error("Expected generated message ID");
    }
    i18n.load("de", { [page.id]: "Seite {page}" });
    i18n.activate("de");
    expect(readerPdfLocale()).toMatchObject({
      code: "de",
      translations: { search: { page: "Seite {page}" } },
    });
    i18n.activate("en");
    expect(readerPdfLocale()).toMatchObject({
      code: "en",
      translations: { search: { page: "Page {page}" }, panel: { thumbnails: "Thumbnails" } },
    });
  });
});

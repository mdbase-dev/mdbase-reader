import { collectionId, sourceId, type SourceSummary } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { SourceAddDialog } from "./SourceAddDialog.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

import type { SourceAdditionController } from "./use-source-addition.js";

type Lookup = SourceAdditionController["lookup"];

const idle: Lookup = {
  canCancel: false,
  cancel: () => undefined,
  progress: null,
  offer: null,
  notice: null,
  chapterOffer: null,
  bookOffer: null,
  saveCitationOnly: () => Promise.resolve(),
  openNoticed: () => undefined,
  confirmChapter: () => Promise.resolve(),
  findChapterBook: () => Promise.resolve(),
  saveChapterBook: () => Promise.resolve(),
};

function render(lookup: Partial<Lookup>): string {
  return renderToStaticMarkup(
    <SourceAddDialog
      open
      busy={false}
      error={null}
      canChooseFile
      onClose={() => undefined}
      onChooseFile={() => undefined}
      onCapture={() => undefined}
      onEdit={() => undefined}
      onDropFile={() => undefined}
      lookup={{ ...idle, ...lookup }}
    />,
  );
}

const book: SourceSummary = {
  collectionId: collectionId("c"),
  id: sourceId("book"),
  path: "sources/deep-learning-2nd.md",
  title: "Deep Learning",
  creators: [],
  tags: [],
  documents: [],
  published: "2016-11-18",
  citation: { id: "dl", type: "book", ISBN: "9780262035613" },
};

describe("source addition follow-ups", () => {
  it("states outcomes plainly and keeps the underlying error in its details", () => {
    const notice = render({
      notice: {
        message: "The source was saved without its citation. You can add one in its Citation tab.",
        detail: "Citekey taken.",
        sourceId: sourceId("s"),
      },
    });
    expect(notice).not.toContain("Added.");
    expect(notice).toMatch(/<details><summary>Details<\/summary><p>Citekey taken.<\/p>/u);
    const offer = render({ offer: { title: "A page", reason: "HTTP 403 from origin" } });
    expect(offer).toContain(
      "Reader couldn’t open that page, but it found the citation for “A page”",
    );
    expect(offer).toMatch(/<summary>Details<\/summary><p>HTTP 403 from origin<\/p>/u);
  });

  it("reviews a chapter DOI by its fields and names books without their record paths", () => {
    const html = render({
      chapterOffer: {
        key: "k",
        books: [book],
        candidate: {
          citation: {
            id: "ch",
            type: "chapter",
            title: "Optimisation",
            author: [{ given: "Ian", family: "Goodfellow" }, { literal: "A Lab" }],
            "container-title": "Deep Learning",
            issued: { "date-parts": [[2016, 11]] },
            page: "271-325",
            DOI: "10.1000/ch8",
          },
          provenance: { kind: "registry", name: "doi.org", retrievedAt: "2026-01-01T00:00:00Z" },
          warnings: [],
        },
      } as unknown as Lookup["chapterOffer"],
    });
    for (const text of [
      "Ian Goodfellow, A Lab",
      "Deep Learning",
      "2016",
      "271-325",
      "10.1000/ch8",
    ]) {
      expect(html).toContain(`<dd>${text}</dd>`);
    }
    expect(html).toContain("<summary>Full citation (CSL-JSON)</summary>");
    expect(html).toContain("Deep Learning · ISBN 9780262035613 · 2016</option>");
    expect(html).not.toContain(book.path);
  });
});

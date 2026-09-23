import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AnnotationCard } from "./AnnotationCard.js";

const base: Annotation = {
  id: annotationId("unanchored-note"),
  collectionId: collectionId("test"),
  sourceId: sourceId("source"),
  source: "[[source]]",
  annotationType: "note",
  createdAt: dateTime("2026-01-01T00:00:00Z"),
  tags: [],
  body: "My commentary",
  path: "notes/test.md",
  recordRevision: recordRevision("sha256:test"),
};
function markup(annotation: Annotation): string {
  return renderToStaticMarkup(
    <AnnotationCard
      annotation={annotation}
      editing={false}
      active={false}
      transclusion={{
        busyId: null,
        problemId: null,
        problem: null,
        insert: vi.fn(),
        isEmbedded: () => false,
      }}
      onEdit={vi.fn()}
      onCancel={vi.fn()}
      onSave={() => Promise.resolve(annotation)}
      onPlanDelete={() => Promise.reject(new Error("not used"))}
      onDelete={() => Promise.resolve()}
      onOpen={vi.fn()}
      readFile={() => Promise.reject(new Error("not used"))}
    />,
  );
}
it.each([undefined, { quote: { exact: "A quotation without coordinates" } }])(
  "labels and disables navigation for notes without usable selectors",
  (target) => {
    const html = markup({ ...base, ...(target ? { target } : {}) });
    expect(html).toContain("Unanchored note");
    expect(html).toMatch(/aria-label="Open annotation in document"[^>]*disabled=""/u);
    expect(html).toContain("My commentary");
    expect(html).toMatch(/<button[^>]*>Edit<\/button>/u);
  },
);
it("offers navigation for a note with a verified PDF passage", () => {
  const html = markup({
    ...base,
    id: annotationId("anchored-note"),
    target: {
      quote: { exact: "Verified passage" },
      pdf: {
        pageIndex: 19,
        coordinateSpace: {
          profile: "embedpdf-selection-page-points-v1",
          box: "crop",
          origin: "top_left",
        },
        quadPoints: [[10, 20, 30, 20, 10, 40, 30, 40]],
      },
    },
  });
  expect(html).not.toContain("Unanchored note");
  expect(html).not.toMatch(/aria-label="Open annotation in document"[^>]*disabled/u);
});

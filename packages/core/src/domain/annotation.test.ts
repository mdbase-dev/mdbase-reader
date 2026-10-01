import { describe, expect, it } from "vitest";

import { annotationEmbed, bodyEmbedsAnnotation, validateAnnotationDraft } from "./annotation.js";
import { DomainError } from "./errors.js";
import { collectionId, fileId, sourceId } from "./identity.js";
import { fileRevision } from "./revision.js";

const baseDraft = {
  collectionId: collectionId("collection-1"),
  sourceId: sourceId("src_01"),
  source: "[[sources/example]]",
  tags: [],
  body: "A note.",
} as const;

describe("validateAnnotationDraft", () => {
  it("accepts a source-level note without a document or selector", () => {
    expect(() => validateAnnotationDraft({ ...baseDraft, annotationType: "note" })).not.toThrow();
  });

  it("requires quotation evidence for a highlight", () => {
    expect(() => validateAnnotationDraft({ ...baseDraft, annotationType: "highlight" })).toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "invalid-annotation" }),
    );
  });

  it("requires exact document identity for PDF geometry", () => {
    expect(() =>
      validateAnnotationDraft({
        ...baseDraft,
        annotationType: "area",
        target: {
          pdf: {
            pageIndex: 0,
            coordinateSpace: {
              profile: "pdf-default-user-space-v1",
              box: "crop",
              origin: "bottom_left",
            },
            quadPoints: [[72, 398, 510, 398, 72, 144, 510, 144]],
          },
        },
      }),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "invalid-annotation" }));
  });

  it("accepts finite area geometry tied to an exact revision", () => {
    expect(() =>
      validateAnnotationDraft({
        ...baseDraft,
        annotationType: "area",
        document: {
          fileId: fileId("file-1"),
          file: "[[files/example.pdf]]",
          revision: fileRevision("sha256:a8ca22"),
        },
        target: {
          pdf: {
            pageIndex: 6,
            coordinateSpace: {
              profile: "pdf-default-user-space-v1",
              box: "crop",
              origin: "bottom_left",
            },
            quadPoints: [[72, 398, 510, 398, 72, 144, 510, 144]],
          },
        },
      }),
    ).not.toThrow();
  });
});

describe("bookmark validation", () => {
  const document = {
    fileId: fileId("file-1"),
    file: "[[files/example.pdf]]",
    revision: fileRevision("sha256:a8ca22"),
  };

  it("requires a document position", () => {
    expect(() =>
      validateAnnotationDraft({ ...baseDraft, annotationType: "bookmark", body: "" }),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "invalid-annotation" }));
  });

  it("requires exact document identity for a position", () => {
    expect(() =>
      validateAnnotationDraft({
        ...baseDraft,
        annotationType: "bookmark",
        target: { position: { kind: "pdf", pageIndex: 4 } },
      }),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "invalid-annotation" }));
  });

  it("accepts a page position tied to an exact revision", () => {
    expect(() =>
      validateAnnotationDraft({
        ...baseDraft,
        annotationType: "bookmark",
        body: "",
        document,
        target: { position: { kind: "pdf", pageIndex: 4 } },
      }),
    ).not.toThrow();
  });

  it("rejects an out-of-range HTML progression", () => {
    expect(() =>
      validateAnnotationDraft({
        ...baseDraft,
        annotationType: "bookmark",
        document,
        target: { position: { kind: "html", href: "index.html", progression: 1.5 } },
      }),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "invalid-selector" }));
  });
});

describe("annotationEmbed", () => {
  it("normalizes a Markdown path to an Obsidian transclusion", () => {
    expect(annotationEmbed("annotations/ann_01.md")).toBe("![[annotations/ann_01]]");
  });

  it("rejects a path that can terminate the wikilink", () => {
    expect(() => annotationEmbed("annotations/unsafe]]suffix")).toThrow(DomainError);
  });
});

describe("bodyEmbedsAnnotation", () => {
  const path = "annotations/ann_01.md";

  it.each([
    "![[annotations/ann_01]]",
    "![[annotations/ann_01.md]]",
    "Before ![[annotations/ann_01|A quote]] after",
    "![[annotations/ann_01#Note]]",
    // Obsidian and mdbase write a link to a uniquely named note by its filename alone.
    "![[ann_01]]",
    "- ![[ann_01|Aliased]]",
  ])("finds %s", (body) => {
    expect(bodyEmbedsAnnotation(body, path)).toBe(true);
  });

  it.each(["", "[[ann_01]]", "![[ann_010]]", "![[elsewhere/ann_01]]", "![[annotations/ann_02]]"])(
    "does not take %j for the annotation",
    (body) => {
      expect(bodyEmbedsAnnotation(body, path)).toBe(false);
    },
  );
});
